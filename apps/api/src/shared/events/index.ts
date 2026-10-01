import { loadEnv } from "../config/index.js";
import { createModuleLogger } from "../logs/index.js";
import type { EventBus } from "./event-bus.js";
import { InProcessEventBus } from "./in-process-event-bus.js";
import { KafkaEventBus } from "./kafka-event-bus.js";

export type { AppEventMap, DomainEvent, DomainEventName, EventHandler } from "./domain-event.js";
export type { EventBus, SubscribeFn } from "./event-bus.js";
export { InProcessEventBus } from "./in-process-event-bus.js";
export { KafkaEventBus } from "./kafka-event-bus.js";

const log = createModuleLogger("events");
let bus: EventBus | null = null;

/** Build the transport selected by ENABLE_KAFKA (does not connect/consume). */
export function createEventBus(): EventBus {
  const env = loadEnv();
  if (env.ENABLE_KAFKA) {
    // KAFKA_BROKERS presence is guaranteed by the env schema when enabled
    return new KafkaEventBus({
      brokers: (env.KAFKA_BROKERS as string).split(","),
      topicPrefix: env.KAFKA_TOPIC_PREFIX,
      // AWS_REGION presence is guaranteed by the env schema when sasl=aws-iam
      sasl: env.KAFKA_SASL,
      region: env.AWS_REGION,
    });
  }
  return new InProcessEventBus();
}

/** Singleton accessor (mirrors getRedis) — null before initEventBus(). */
export function getEventBus(): EventBus | null {
  return bus;
}

/** Create the bus for the process. Modules register consumers, then start(). */
export function initEventBus(): EventBus {
  bus = createEventBus();
  log.info({ transport: loadEnv().ENABLE_KAFKA ? "kafka" : "in-process" }, "domain-event bus ready");
  return bus;
}

export async function closeEvents(): Promise<void> {
  await bus?.close();
  bus = null;
}
