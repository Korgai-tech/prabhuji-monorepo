# Pattern: Client-Events HTTP Ingestion (Amplitude V2)

> Project pattern (monorepo-boilerplate). Reference implementation: `apps/events` + `apps/mobile/lib/core/analytics.dart`.

## Use Case

Collecting client-side analytics events (clicks) into our own pipeline (Kinesis → ClickHouse) while letting the Amplitude SDK do the client-side heavy lifting: batching, retries, flush-on-close, sessions.

## The Shape

```
apps/mobile/lib/core/analytics.dart        # Analytics seam: init(serverUrl: <collector>/2/httpapi) + trackClick(screen, element)
apps/events/src/core/events/
  handlers/amplitude.schemas.ts            # Zod contract for the Amplitude V2 payload (z.looseObject — tolerate SDK fields)
  handlers/click-events.handler.ts         # POST /2/httpapi: api_key check → per-event toClickEvent mapping → service
  types.ts                                 # domain ClickEvent / StoredClickEvent
  services/                                # transport-agnostic; never fastify/@aws-sdk
  repositories/                            # Kinesis PutRecords batching; @aws-sdk ONLY here
```

## The Rules

1. **Implement the SDK's contract, don't invent one** — the SDK only speaks Amplitude HTTP V2 to `serverUrl`; responses must be V2-shaped (`{code, events_ingested, ...}`) because they drive the SDK's flush state machine.
2. **Never 4xx a partially bad batch** — V2 has no partial accept; a 4xx makes the SDK retry/drop the WHOLE batch. Skip invalid/non-click events, log the skip count, return 200 with the real `events_ingested`.
3. **api_key lives in the body** (that's the V2 contract), validated timing-safe against `EVENTS_API_KEY`.
4. **Identity**: accept `user_id` OR `device_id` (anonymous pre-login events are device-only); ids <5 chars are invalid (Amplitude's own rule). Partition Kinesis by `user_id || device_id`.
5. **Client seam**: widgets call `Analytics.trackClick(screen, element)` — never the Amplitude SDK directly; `analyticsProvider` is null in tests and when init fails (analytics never breaks the app).
6. **Disable SDK autocapture** — click events only, so the client sets `autocapture: AutocaptureDisabled()`; the collector still defensively filters to click events (screen+element present), but the SDK shouldn't be sending session/lifecycle noise in the first place.
7. **At-least-once → dedup downstream** — `insert_id`/`eventId` is the idempotency key; the collector is stateless and does NOT dedupe. Retries produce duplicate stream records; the consumer (ClickHouse) dedupes by `eventId`.
8. **Fire-and-forget durability** — 200 once buffered; sink outages are invisible to the client (logged+dropped, never 5xx). Silent loss is the accepted v1 tradeoff; a retry/DLQ is the real backstop.

## Anti-Patterns

- Generating OpenAPI for the V2 endpoint (invites drift against Amplitude's external spec)
- Returning gRPC-style or bespoke response shapes (breaks the SDK)
- `@aws-sdk/*` outside `repositories/`, `fastify` inside `services/` (arch-check fails)
- Tracking clicks with raw `amplitude.track(...)` calls scattered through widgets
