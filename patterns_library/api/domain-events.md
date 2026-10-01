# Pattern: Domain Events (async inter-module)

> Repo-specific pattern (monorepo-boilerplate). Source of truth: `apps/api/src/shared/events/`. See also `docs/EVENT-ARCHITECTURE.md`.

## Use Case

The **asynchronous** complement to [`performServiceCall`](cross-module-call.md). When module A does something other modules should react to — without A knowing or waiting for them — A emits a **domain event** and consumers subscribe. Event-driven modular monolith: producers decoupled from consumers.

Use `performServiceCall` when A needs a result from B now (synchronous, request/response). Use a domain event when A just announces a fact and reactions are fire-and-forget.

## The Mechanism

One `EventBus` interface, two interchangeable transports selected by `ENABLE_KAFKA`:

- **`InProcessEventBus`** (default) — synchronous local dispatch, zero infra. The dev/test default and the working example.
- **`KafkaEventBus`** (`ENABLE_KAFKA=true`) — Kafka/MSK; same `publish`/`addConsumer` contract. Broker auth is env-gated by `KAFKA_SASL`: `none` = plaintext (local redpanda); `aws-iam` = TLS + SASL/OAUTHBEARER, the token signed from the task's IAM role via `aws-msk-iam-sasl-signer-js` (needs `AWS_REGION`) — production MSK.

**Modules own their event wiring** — the producer publishes from its service; the consumer registers from its own composition root with its own `consumerId` (Kafka consumer group). `bootstrap.ts` only calls the module inits and `bus.start()`.

```typescript
// 1. Declare the event contract (shared registry — no cross-module type leak)
//    apps/api/src/shared/events/domain-event.ts
export interface AppEventMap {
  "user.registered": { userId: string; email: string }; // <aggregate>.<pastTenseEvent>
}

// 2. PRODUCER module: emit from its service (key = entity id, for ordering)
await this.events?.publish("user.registered", { userId: user.id, email: user.email }, user.id);

// 3. CONSUMER module: register from its own index.ts with its own consumerId
//    apps/api/src/core/notifications/index.ts
export function initNotificationsModule(bus: EventBus): void {
  bus.addConsumer("notifications", (on) => {
    on("user.registered", (event) => {
      log.info({ userId: event.payload.userId }, "would send welcome notification");
    });
  });
}

// 4. bootstrap.ts — no event knowledge, just module inits + start
const bus = initEventBus();
initAuthModule(app, bus);        // producer
initNotificationsModule(bus);    // consumer (group "notifications")
await bus.start();
```

**Each `consumerId` is a Kafka consumer group** — two independent consumers of the same event (e.g. `notifications` and `analytics`) each receive every event instead of competing. That is why a shared single group would be wrong: it would load-balance the event to only one of them.

## Topic strategy — one topic per aggregate (≈ per module)

Kafka best practice: an aggregate's events share a topic, **keyed by the entity id**, so that entity's events stay ordered — while consumers still subscribe per aggregate. `topicForEvent("user.registered")` → topic `user` (all `user.*` events), keyed by `userId`. NOT one firehose topic (no selectivity/order) and NOT one-per-event-type (loses same-entity ordering). `KAFKA_TOPIC_PREFIX` isolates envs sharing a cluster (`staging.user`). The name lives in `topicForEvent` (a wire contract other consumer services must match), never inline in the transport.

## Adding a New Event

1. [ ] Add `"<aggregate>.<event>": { …payload }` to `AppEventMap`
2. [ ] `publish("<aggregate>.<event>", payload, <entityId>)` from the owning module's service (pass the entity id as the key when ordering matters)
3. [ ] Consume it from the consuming module's `init<Mod>Module(bus)` via `bus.addConsumer("<consumerId>", (on) => on("...", handler))` — a pure-consumer module needs no routes/facade
4. [ ] Payload is a serializable contract — additive changes only (consumers may lag)

## Rules

- `kafkajs` lives ONLY in `shared/events/` — modules publish/subscribe through the `EventBus` interface, never import a Kafka client (the Prisma-in-repositories analogue).
- Handlers must be **idempotent and failure-isolated**: at-least-once delivery + one throwing handler must not break siblings or the emitter (the bus logs and swallows handler errors).
- Emit **after** the state change commits (publish post-write), so consumers never see an event for a rolled-back change.

## Anti-Patterns

- ❌ A module importing another module's service to "notify" it — use an event (or `performServiceCall` if you need a result)
- ❌ Registering consumers in `bootstrap.ts` — the consuming module owns its `addConsumer` call and its `consumerId`
- ❌ Two independent consumers sharing one `consumerId`/group — they'd compete; give each its own
- ❌ `import { Kafka } from "kafkajs"` outside `shared/events/`
- ❌ A single catch-all topic, or a topic per event type — group by aggregate
- ❌ Handlers that assume exactly-once or that throw on duplicate delivery
