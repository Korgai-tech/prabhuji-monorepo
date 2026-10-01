import type { Logger } from "pino";

import { createModuleLogger } from "../logs/index.js";
import type { AppEventMap, DomainEventName, EventHandler } from "./domain-event.js";
import type { EventBus, SubscribeFn } from "./event-bus.js";

interface Consumer {
  id: string;
  handlers: Map<DomainEventName, EventHandler<DomainEventName>[]>;
}

// Default transport (ENABLE_KAFKA=false): dispatches each event to every
// registered consumer in-process — matching Kafka's per-group semantics where
// each consumer group receives its own copy of every event. Zero infra,
// deterministic. Handler errors are isolated (logged, never propagated) so one
// bad consumer can't break the emitter or its siblings.
export class InProcessEventBus implements EventBus {
  private readonly consumers: Consumer[] = [];

  constructor(private readonly logger: Logger = createModuleLogger("events:in-process")) {}

  addConsumer(consumerId: string, register: (on: SubscribeFn) => void): void {
    const handlers = new Map<DomainEventName, EventHandler<DomainEventName>[]>();
    const on: SubscribeFn = (name, handler) => {
      const list = handlers.get(name) ?? [];
      list.push(handler as EventHandler<DomainEventName>);
      handlers.set(name, list);
    };
    register(on);
    this.consumers.push({ id: consumerId, handlers });
  }

  async publish<N extends DomainEventName>(name: N, payload: AppEventMap[N]): Promise<void> {
    const event = { name, occurredAtMs: Date.now(), payload };
    await Promise.all(
      this.consumers.flatMap((consumer) =>
        (consumer.handlers.get(name) ?? []).map(async (handler) => {
          try {
            await handler(event);
          } catch (err) {
            this.logger.error({ err, event: name, consumer: consumer.id }, "domain-event handler failed");
          }
        })
      )
    );
  }

  start(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.consumers.length = 0;
    return Promise.resolve();
  }
}
