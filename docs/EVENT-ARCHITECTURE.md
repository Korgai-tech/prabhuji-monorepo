# Event Architecture

Two **independent** event pipes serve two different concerns. They do not overlap — different producers, transports, consumers, and guarantees.

```
                    ┌─────────────────────── INTERNAL (write-side) ───────────────────────┐
  apps/api          │   core/auth ──emit──▶┐                                              │
  (modular          │   core/users ─emit──▶├──▶  Kafka / MSK  ──▶ other core/<module>s    │
   monolith)        │   core/<mod> ─emit──▶┘      (domain-event bus)     (async consumers)│
                    └──────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────── EXTERNAL (analytics) ────────────────────────┐
  mobile app        │  amplitude_flutter ──HTTP V2──▶ apps/events ──▶ Kinesis ──▶ ClickPipe│──▶ ClickHouse
  (clicks)          │      (serverUrl)              (collector)      (stream)   (CH connector)      (tables)
                    └──────────────────────────────────────────────────────────────────────┘
```

## Pipe 1 — Kafka (MSK): internal domain events ✅ pattern live

The API is an **event-driven modular monolith**. Alongside the _synchronous_ cross-module call path (`performServiceCall`), each `core/<module>` **emits domain events** (e.g. `UserRegistered`, `OrderPlaced`) onto Kafka; other modules subscribe and react **asynchronously**. This decouples modules: a producer doesn't know or wait for its consumers.

- **Producer / consumer**: `apps/api` modules only. A module publishes its own domain events and consumes others' — never reaches into another module's internals (same boundary rule as `performServiceCall`).
- **Why Kafka**: per-aggregate ordering, durable replay, consumer groups — the guarantees a transactional domain-event bus needs.
- **Transport**: Amazon MSK in production (opt-in via `-var enable_kafka=true`, SASL/IAM); floci-aws emulates MSK locally (redpanda sidecar via the host Docker socket).
- **Status**: **pattern implemented; production transport ready.** `apps/api/src/shared/events/` ships the working bus — `auth.register()` publishes `user.registered`, the `core/notifications` module consumes it. Default transport is **in-process** (zero infra); `ENABLE_KAFKA=true` selects the **Kafka** transport. MSK Terraform is opt-in (TAM-10), and broker auth is env-gated (`KAFKA_SASL`): plaintext for local redpanda, **TLS + SASL/IAM for production MSK** (TAM-13) — no remaining prod gap.

### How it works

- `shared/events/domain-event.ts` — `AppEventMap` registry (event name → payload) + `topicForEvent(name, prefix)` (the Kafka topic, a wire contract; env-overridable via `KAFKA_TOPIC_PREFIX`).
- `shared/events/event-bus.ts` — the `EventBus` interface: `publish(name, payload, key?)` + `addConsumer(consumerId, register)` + `start`/`close`.
- `InProcessEventBus` (default) / `KafkaEventBus` (`ENABLE_KAFKA`) — same interface; each transport delivers every event to every registered consumer.
- **Broker auth** (`KafkaEventBus` only) is env-gated by `KAFKA_SASL`: `none` = plaintext (local redpanda / floci-aws MSK); `aws-iam` = TLS + SASL/OAUTHBEARER, the token signed from the task's IAM role via `aws-msk-iam-sasl-signer-js` (needs `AWS_REGION`). Terraform sets `KAFKA_SASL=aws-iam` + the `kafka-cluster:*` task policy when `enable_kafka=true`.
- **Modules own their event wiring.** The producer module publishes (`core/auth` → `user.registered`); a consumer module registers its consumer with its own id (`core/notifications` → `bus.addConsumer("notifications", …)`). `bootstrap.ts` only creates the bus, calls the module inits, and `start()`s — it never references an event.
- **`consumerId` = Kafka consumer group.** Independent consumers each get their own copy of every event (they don't compete); adding a second consumer of the same event is another `addConsumer` with a different id.
- **Add an event**: a line in `AppEventMap` (`<aggregate>.<pastTenseEvent>`), `publish` from the owning module, `addConsumer`+subscribe from the consuming module.

### Topic strategy — one topic per aggregate (≈ per module)

Kafka best practice ([Confluent](https://www.confluent.io/blog/put-several-event-types-kafka-topic/)): an aggregate's events share a topic, keyed by the entity id, so that entity's events stay strictly ordered — while consumers still subscribe selectively per aggregate. Event name `<aggregate>.<event>` → topic `<aggregate>` (e.g. `user.registered`, `user.email_changed` → topic `user`, keyed by `userId`). NOT one firehose topic (no selectivity, no per-entity order) and NOT one-topic-per-event-type (loses cross-event ordering for the same entity). `KAFKA_TOPIC_PREFIX` prefixes topics for env isolation (`staging.user`). The topic name lives in `topicForEvent`, not the transport — it's a shared wire contract other consumer services must agree on.

### Remaining (checklist)

1. ~~MSK Terraform (opt-in `enable_kafka`, IAM, `ENABLE_KAFKA`/`KAFKA_BROKERS`)~~ — **done (TAM-10)**.
2. ~~`ENABLE_KAFKA`/`KAFKA_BROKERS` env + `shared/events/` bus + emit/consume example~~ — **done (TAM-11)**.
3. ~~MSK SASL/IAM auth (`aws-msk-iam-sasl-signer-js` → Kafka `ssl`/`sasl`, env-gated by `KAFKA_SASL`)~~ — **done (TAM-13)**.
4. **Live integration test**: the Kafka transport is unit-tested with a mocked client; add a redpanda-testcontainer publish→consume round-trip (like the events service's floci Kinesis test) when hardening for prod.

## Pipe 2 — Kinesis: external analytics ingestion ✅ live

Client-side click analytics flow to ClickHouse, entirely separate from the domain-event bus.

- **Flow**: `amplitude_flutter` (mobile) → `apps/events` HTTP collector (Amplitude V2 `/2/httpapi`) → **Kinesis** stream → **ClickPipe** (ClickHouse's native Kinesis connector) → **ClickHouse** tables.
- **Why Kinesis (not Kafka)**: high-volume, fire-and-forget, at-least-once client events with a managed ClickHouse ingestion path (ClickPipes) — no per-aggregate ordering or in-app consumers needed. Different shape from domain events entirely.
- **Producer**: mobile clients (via the Amplitude SDK). **Consumer**: ClickHouse (via ClickPipe) — _not_ any `apps/api` module.
- **Contract**: the collector maps each Amplitude event to a **scoped `StoredEvent`** JSON on Kinesis — `eventName` (`event_type`, the funnel dimension), identities (`userId` via `setUserId`, `deviceId`, `pseudoId`), `sessionId`, `clientTsMs`, the **scoped, type-preserved bags** (`eventProperties` / `userProperties` / `groups` / `groupProperties`), flat device/app context fields (`platform`, `os_name`, … snake_case, one per promoted column), client diagnostics, and server `reqGuid`/`receivedAtMs`. The wire still *defines* `$identify` (user-state changes, from the client SDK or server producers), but the collector **skips `$identify`** (kept at 200, no downstream consumer) — it is not forwarded to Kinesis. This is the seam the ClickHouse warehouse consumes — full contract: `docs/ANALYTICS-EVENT-CONTRACT.md`.
- **ClickHouse side**: a **single `events` table** — ClickPipe writes each `StoredEvent`'s raw wire fields directly into it (a clean 1:1 by field name: `groups` is a JSON object → the `groups` `Map`, device/app context is sent flat → its typed columns), and the analytics columns are computed on insert via **column DEFAULT expressions** (no landing table, no materialized view). Dedup by `eventId`/`insert_id` is the consumer's job (`LIMIT 1 BY` at query) — the collector is stateless and at-least-once.
- **Status**: collector + Kinesis are **built and validated** (TAM-6/7/8); the collector carries **scoped generic** events (was click-only) since **TAM-15**; the ClickHouse warehouse (funnels, cohorts, session journeys) is live via **TAM-16**. The **TAM-17 persons store + `user_properties` enrichment** was **removed pre-release** — `$identify` is now **skipped at the collector** (not forwarded), so it never reaches the warehouse; if identity resolution returns it will be its **own separate Kinesis stream** (a separate pipe), not bolted onto this collector.

## Why both, and why not one bus

|           | Kafka / MSK (domain events)                     | Kinesis (analytics)                      |
| --------- | ----------------------------------------------- | ---------------------------------------- |
| Concern   | internal state changes between modules          | external user behavior                   |
| Producer  | `apps/api` modules                              | mobile clients (Amplitude SDK)           |
| Consumer  | other `apps/api` modules                        | ClickHouse (ClickPipe)                   |
| Guarantee | ordered per aggregate, replayable               | at-least-once, dedup downstream          |
| Coupling  | fire-and-forget async, but transactional intent | fire-and-forget analytics                |
| Status    | ✅ in-process live; MSK transport prod-ready     | ✅ collector live, ClickPipe/CH deferred |

Collapsing them into one bus would force analytics volume through the domain-event guarantees (expensive) or weaken domain events to analytics guarantees (wrong). They stay separate on purpose.

## See also

- `apps/api/CLAUDE.md` — module boundaries; where domain-event emission will live
- `apps/events/CLAUDE.md` — the Kinesis collector (Amplitude V2 contract, batching, partitioning)
- `infra/terraform/README.md` — Kinesis (live) and the MSK re-add note
- `docs/PHASE-NOTES.md` — deferred-work ledger
