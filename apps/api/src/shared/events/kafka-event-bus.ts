import { Kafka, type Consumer, type KafkaConfig, type Producer } from "kafkajs";
import type { Logger } from "pino";

import { createModuleLogger } from "../logs/index.js";
import {
  topicForEvent,
  topicsForEvents,
  type AppEventMap,
  type DomainEvent,
  type DomainEventName,
  type EventHandler,
} from "./domain-event.js";
import type { EventBus, SubscribeFn } from "./event-bus.js";

// Production transport (ENABLE_KAFKA=true): the API's inter-module domain-event
// bus over Kafka/MSK.
//   - One shared PRODUCER; topics are per-aggregate (see `topicForEvent`), keyed
//     by the entity id so an entity's events stay ordered.
//   - One CONSUMER per registered consumerId (= its own Kafka consumer group),
//     so independent consumers each get every event instead of competing.
// The `publish`/`addConsumer` contract is identical to the in-process transport.
//
// Broker auth is env-gated (`KAFKA_SASL`):
//   - "none"    → plaintext, for a local broker (floci-aws MSK / redpanda).
//   - "aws-iam" → TLS + SASL/OAUTHBEARER; the token is signed from the task's
//     IAM role via aws-msk-iam-sasl-signer-js (default AWS credential chain).
//     This is production MSK. See docs/EVENT-ARCHITECTURE.md.

export interface KafkaEventBusOptions {
  brokers: string[];
  clientId?: string;
  topicPrefix?: string;
  /** Broker auth mechanism. Omit/`"none"` for plaintext; `"aws-iam"` for MSK IAM. */
  sasl?: "none" | "aws-iam";
  /** AWS region for signing MSK IAM tokens — required when `sasl === "aws-iam"`. */
  region?: string;
}

/** Assemble the kafkajs client config, adding TLS + SASL/OAUTHBEARER for MSK IAM. */
function buildKafkaConfig(opts: KafkaEventBusOptions): KafkaConfig {
  const config: KafkaConfig = { clientId: opts.clientId ?? "api", brokers: opts.brokers };
  if (opts.sasl !== "aws-iam") return config;
  if (!opts.region) {
    throw new Error("KafkaEventBus: region is required when sasl='aws-iam' (set AWS_REGION)");
  }
  const region = opts.region;
  config.ssl = true;
  config.sasl = {
    mechanism: "oauthbearer",
    // Signer (and its AWS SDK deps) loaded lazily so the plaintext/in-process
    // paths never pull it in. Called per-connection; the token auto-refreshes.
    oauthBearerProvider: async () => {
      const { generateAuthToken } = await import("aws-msk-iam-sasl-signer-js");
      const { token } = await generateAuthToken({ region });
      return { value: token };
    },
  };
  return config;
}

interface RegisteredConsumer {
  id: string;
  handlers: Map<DomainEventName, EventHandler<DomainEventName>[]>;
  consumer: Consumer;
}

export class KafkaEventBus implements EventBus {
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private readonly topicPrefix?: string;
  private readonly consumers: RegisteredConsumer[] = [];
  private producerReady = false;

  constructor(
    opts: KafkaEventBusOptions,
    private readonly logger: Logger = createModuleLogger("events:kafka")
  ) {
    this.kafka = new Kafka(buildKafkaConfig(opts));
    this.producer = this.kafka.producer();
    this.topicPrefix = opts.topicPrefix;
  }

  addConsumer(consumerId: string, register: (on: SubscribeFn) => void): void {
    const handlers = new Map<DomainEventName, EventHandler<DomainEventName>[]>();
    const on: SubscribeFn = (name, handler) => {
      const list = handlers.get(name) ?? [];
      list.push(handler as EventHandler<DomainEventName>);
      handlers.set(name, list);
    };
    register(on);
    // groupId is prefixed with the env so consumers on a shared cluster don't
    // collide; each consumerId is its own group (independent delivery)
    const groupId = this.topicPrefix ? `${this.topicPrefix}.${consumerId}` : consumerId;
    this.consumers.push({ id: consumerId, handlers, consumer: this.kafka.consumer({ groupId }) });
  }

  async publish<N extends DomainEventName>(
    name: N,
    payload: AppEventMap[N],
    key?: string
  ): Promise<void> {
    await this.ensureProducer();
    const event: DomainEvent<N> = { name, occurredAtMs: Date.now(), payload };
    await this.producer.send({
      topic: topicForEvent(name, this.topicPrefix),
      // partition by the entity id (key) so an entity's events stay ordered;
      // fall back to the event name when the caller has no entity key
      messages: [{ key: key ?? name, value: JSON.stringify(event) }],
    });
  }

  async start(): Promise<void> {
    await this.ensureProducer();
    for (const registered of this.consumers) {
      if (registered.handlers.size === 0) continue;
      await registered.consumer.connect();
      for (const topic of topicsForEvents(registered.handlers.keys(), this.topicPrefix)) {
        await registered.consumer.subscribe({ topic, fromBeginning: false });
      }
      await registered.consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;
          const event = JSON.parse(message.value.toString()) as DomainEvent;
          for (const handler of registered.handlers.get(event.name) ?? []) {
            try {
              await handler(event);
            } catch (err) {
              this.logger.error(
                { err, event: event.name, consumer: registered.id },
                "domain-event handler failed"
              );
            }
          }
        },
      });
      this.logger.info({ consumer: registered.id }, "kafka domain-event consumer running");
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled([
      this.producerReady ? this.producer.disconnect() : Promise.resolve(),
      ...this.consumers.map((c) => c.consumer.disconnect()),
    ]);
  }

  private async ensureProducer(): Promise<void> {
    if (this.producerReady) return;
    await this.producer.connect();
    this.producerReady = true;
  }
}
