// Central registry of the app's domain events. Each module owns the events it
// emits; listing their payloads here keeps event contracts shareable across
// modules WITHOUT a module importing another module's internals (the same
// decoupling `performServiceCall` gives synchronous calls).
//
// Event name convention: `<aggregate>.<pastTenseEvent>` (e.g. `user.registered`,
// `order.placed`). The aggregate prefix determines the Kafka topic (see
// `topicForEvent`), so an aggregate's events share a topic and — keyed by the
// entity id — stay ordered per entity.
//
// Add a new event: add a line here, then `publish` it from the owning module
// and `subscribe` from consumers.
export interface AppEventMap {
  "user.registered": { userId: string; email: string };
}

export type DomainEventName = keyof AppEventMap;

export interface DomainEvent<N extends DomainEventName = DomainEventName> {
  name: N;
  occurredAtMs: number;
  payload: AppEventMap[N];
}

export type EventHandler<N extends DomainEventName> = (
  event: DomainEvent<N>
) => void | Promise<void>;

// Topic for an event: one per aggregate (≈ per module), the Kafka best practice
// — an aggregate's events share a topic so they stay ordered per entity, while
// consumers can still subscribe selectively per aggregate (unlike a single
// firehose topic). It's a wire contract (producer + every consumer must agree),
// so it lives with the event contracts, not inside the transport. `prefix`
// isolates environments sharing one cluster (KAFKA_TOPIC_PREFIX).
//   "user.registered"  ->  "user"        (no prefix)
//   "user.registered"  ->  "staging.user" (prefix "staging")
export function topicForEvent(name: DomainEventName, prefix?: string): string {
  const aggregate = name.split(".")[0];
  return prefix ? `${prefix}.${aggregate}` : aggregate;
}

/** Distinct topics for a set of event names (what a consumer subscribes to). */
export function topicsForEvents(names: Iterable<DomainEventName>, prefix?: string): string[] {
  return [...new Set([...names].map((n) => topicForEvent(n, prefix)))];
}
