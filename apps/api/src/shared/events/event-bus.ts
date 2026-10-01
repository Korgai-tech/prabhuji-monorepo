import type { AppEventMap, DomainEventName, EventHandler } from "./domain-event.js";

// Subscribe function handed to a module's consumer registration. Type-safe:
// the handler's event payload is inferred from the event name.
export type SubscribeFn = <N extends DomainEventName>(name: N, handler: EventHandler<N>) => void;

// The domain-event bus. Producers `publish`; each consumer is registered with
// its own `consumerId` (Kafka consumer group) so independent consumers each
// receive every matching event instead of competing for it. Two interchangeable
// transports implement it (in-process by default, Kafka when ENABLE_KAFKA=true)
// — modules depend on this interface, never on the transport.
export interface EventBus {
  /**
   * Emit a domain event. `key` is the aggregate's entity id (Kafka partition
   * key) — keeps that entity's events ordered. Never throws to the caller.
   */
  publish<N extends DomainEventName>(name: N, payload: AppEventMap[N], key?: string): Promise<void>;

  /**
   * Register a consumer under its own `consumerId` (→ Kafka consumer group).
   * A module calls this from its composition root and declares its
   * subscriptions via `register`. Call before `start()`.
   */
  addConsumer(consumerId: string, register: (on: SubscribeFn) => void): void;

  /** Begin delivering (connect + consume each group for Kafka; no-op in-process). */
  start(): Promise<void>;

  /** Flush + release resources. */
  close(): Promise<void>;
}
