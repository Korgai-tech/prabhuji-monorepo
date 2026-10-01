# Analytics Event Contract

What the client apps must send, and what lands in the warehouse. This is the contract between
three parties:

1. **Producers** — the Flutter app (`amplitude_flutter`) and any server-side job/service.
2. **The collector** — `apps/events` (Amplitude HTTP V2 at `POST /2/httpapi`), stateless.
3. **The warehouse** — ClickHouse (`events`, TAM-16), where funnels, cohorts, retention, and
   session journeys are computed. (The `persons` enrichment layer from TAM-17 is currently
   **deferred** — see below.)

The model follows the industry standard (Amplitude, Segment, PostHog): **properties are scoped**,
a **point-in-time user snapshot is denormalized onto every event**, and **user-state changes are
expressed as `$identify` events**. Note: the wire contract still _defines_ `$identify` and
producers may send it verbatim, but the **collector now skips `$identify`** (kept at 200, no
downstream consumer) — see "What a server-side producer must do" below.

## The three property scopes (+ auto-collected context)

| Scope              | Answers                          | Changes                | Examples                                                                                | Where it goes                                                             |
| ------------------ | -------------------------------- | ---------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `event_properties` | what happened in **this** action | every event            | `room_id`, `entry_point`, `network_type`, `is_vpn`                                      | `events.event_properties`                                                 |
| `user_properties`  | who the user **is** (snapshot)   | slowly, via `identify` | `name`, `plan`, `source`, `medium`                                                      | `events.user_properties` (client snapshot as-sent; server stamp deferred) |
| `groups`           | which account/workspace          | per group              | `{"workspace": "62646"}`                                                                | `events.groups`                                                           |
| context (auto)     | device/app/network identity      | per device/app         | `platform`, `os_version`, `version_name`, `device_model`, `carrier`, `language`, `adid` | typed top-level columns                                                   |

**Scope discipline is what makes analytics rich.** "Funnel of `chat_room_entered` for premium
users, segmented by app version" needs `room` facts in `event_properties`, `plan` in
`user_properties`, and `app_version` as a typed column. A flat bag can't answer that cleanly.

Fast-changing device _state_ (`network_type`, `free_disk`, `ram`) is **event** scope — it changes
per event. User properties are the slow-changing "who the user is".

## What the Flutter app must do

> Implemented in `apps/mobile/lib/core/analytics.dart` (TAM-18) — app developers should read
> **`docs/ANALYTICS-FLUTTER-GUIDE.md`** for the practical API; the raw SDK calls below are what
> the seam does under the hood.

```dart
// 1. Identity — once, at login. player_id IS the user id.
Amplitude.instance.setUserId(playerId);            // → user_id on every event

// 2. User state — at login and whenever it changes. The SDK emits a $identify
//    event and attaches the client snapshot to subsequent events (warehouse-side
//    stamping of accumulated state is currently deferred — see below).
final identify = Identify()
  ..set('name', name)
  ..set('plan', plan)                              // if the login response carries it
  ..setOnce('source', source)                      // install attribution: set once
  ..setOnce('medium', medium);
Amplitude.instance.identify(identify);

// 3. Account scope (B2B) — workspace as a group, not a property.
Amplitude.instance.setGroup('workspace', workspaceId);

// 4. Events — event_properties carry ONLY facts about the action.
Amplitude.instance.logEvent('chat_room_entered', eventProperties: {
  'room_id': roomId,            // ← the actual event data (was missing before)
  'entry_point': 'home_banner',
  'network_type': networkType,  // transient device state = event scope
});
```

The SDK auto-collects device/app context (`platform`, `os_version`, `version_name`,
`device_brand/model/manufacturer`, `carrier`, `language`) — do not put these in
`event_properties`.

**Do not** put `player_id`, `name`, `workspace_id`, `source`, `medium`, `app_version` in
`event_properties`. (The collector transitionally still promotes `event_properties.player_id` to
`userId` for old builds, but new builds must use `setUserId`.)

## What a server-side producer must do (TAM-17)

Any backend that owns a user attribute (api on signup/plan-change, a cron/ML job computing
LTV/segments) POSTs the **same Amplitude-shaped `$identify` event** to the same door:

```
POST /2/httpapi
{ "api_key": "<EVENTS_API_KEY>",
  "events": [{
    "event_type": "$identify",
    "user_id": "2123059",
    "time": 1783346810070,
    "user_properties": { "$set": { "plan": "premium", "ltv": 4200 } }
  }] }
```

No ClickHouse credentials, no direct DB access — one door for every producer. The wire contract
still accepts the `$identify` shape (`$set` / `$setOnce` ops are valid), so a producer may POST it
— but the collector **skips `$identify`** before Kinesis (logs a skip, batch still returns 200),
so it reaches no downstream consumer.

> **Deferred (warehouse-side):** the persons store and the ingest-time stamp of current user state
> onto subsequent events (TAM-17) were **removed pre-release**. There is now a **single `events`
> table** (no landing table, no materialized view; the transform lives in column DEFAULT
> expressions), and it has no insert-time filter — so `$identify` must not reach it. The collector
> therefore **skips `$identify`** (no downstream consumer), and `events.user_properties` is the
> client snapshot as-sent only — no server-side merge. If identity resolution returns it will be
> its own separate Kinesis stream. Historical design: `specs/TAM-17-persons-enrichment.md`.

## UTM attribution — the four `bk_*_utm_source_success` events (TAM-160)

Which campaign a user came from, reported at four moments. Ported from crickmate so one warehouse
query serves both products.

**There is no UTM data in our Postgres.** The campaign is read live, per event, from the shared
platform's referral service:

```
GET <REFERRAL_BASE_URL>/referral/v1/<userId>/latest
     x-tenant-id:  prabhuji            # required — omitting it is a 401
     x-tenant-key: <REFERRAL_TENANT_KEY>
```

Both envs read from the shared platform, one host per env, path-routed alongside that same
platform's events collector:

| Env | Host (publish **and** read) | Publish `POST /events/2/httpapi` | Read `GET /referral/v1/<id>/latest` |
| --- | --- | --- | --- |
| stage | `api-monorepo-common-staging.krutyug.ai` | live | live |
| prod | `api-monorepo-common-production.krutyug.ai` | **pending** — `analytics_events_api_key` not yet supplied, so it still falls back to this stack's own collector at `production-prabhuji-api.krutyug.ai/2/httpapi` | live |

**Three separate credentials**, and conflating them is the easy mistake: the publish carries a body
`api_key` (per env), the read carries an `x-tenant-key` header (per env, a different value), and both
carry the same constant `x-tenant-id: prabhuji`.

`REFERRAL_BASE_URL` stays its own variable rather than being derived from the collector's origin.
The two are the same host today, but they are independent doors with independent credentials — and
while prod's publish key is missing, the publish target falls back to prabhuji's own stack while the
read must NOT follow it there. A derived origin would query prabhuji's own ALB for `/referral/*` and
read **every prod user as "no campaign"** — indistinguishable from honest organic traffic. Set both
halves or neither; either empty leaves the four events off.

The timeout and the master switch (`ANALYTICS_EVENTS_ENABLED`) are still the collector's — with the
collector off there is nowhere for these events to land, so the lookup is skipped too.

Owned by `apps/api/src/shared/analytics/utm.ts`, which **never throws** — 404, 4xx, 5xx, timeout,
non-JSON and unconfigured all collapse to "no UTM", because every caller is a login or a settled
payment.

| Event | Properties | Emitted from | When |
| --- | --- | --- | --- |
| `bk_latest_utm_source_success` | `latest_utm_source/medium/campaign` | `OtpAnalyticsService.trackUtmCaptured` | every OTP verify that **succeeded** |
| `bk_first_utm_source_success` | `first_utm_*` | same call, same batch | the same moment, once per user ever |
| `bk_trial_utm_source_success` | `trial_utm_*` | inside `PaymentAnalyticsService.trackTrialSuccess` | the trial debit settles |
| `bk_sub_utm_source_success` | `sub_utm_*` | inside `trackSubscriptionStarted`, below its `isFirstFullPricePayment` return | first full-price payment — **never a renewal** |

Rules that are load-bearing:

- **All three components are always present**, `""` for "not captured". A real organic Play install
  arrives as `{"utm_source":"google-play"}` with no medium and no campaign. An omitted key would be
  dropped at ClickHouse ingest and read as "this event never carried one" — a blank is a statement.
- **A touch naming no campaign emits nothing at all** (upstream `referral_info` of `null`, `""`, or
  all-blank utm values). A blank triple would assert "this user came from no campaign", which is a
  different claim.
- **`first` is guarded by a column, not by comparing values.** `/latest` returns ONE row and carries
  no id for the user's oldest touch, so "is this their first?" is unanswerable from the response.
  `User.firstUtmReportedAt` is the answer and holds nothing else. It therefore means *the earliest
  campaign we observed* — true first touch only for users whose first login postdates the deploy.
  **Backfill is impossible**: the history lives upstream in rows `/latest` will not return.
- **The purchase pair rides inside its companion's method, below its guard**, so each pair shares one
  predicate by construction and cannot drift from `bk_subscription_started` / `bk_trial_success`.
- **`insert_id` mirrors the companion event's key** — **all four on the user** since TAM-181. The
  trial pair used to key on the MANDATE, reasoning that a trial starts once; that is true of a
  mandate and false of a person, and a user with two trial-bearing mandates (a retry, or a
  re-registration after a stale one was retired) minted two uncollapsible ids. As everywhere else,
  that is a query-time key and not an ingest guarantee: `events` is a plain MergeTree with no
  dedupe, so every read must carry `LIMIT 1 BY insert_id`. **The key changed shape at the TAM-181
  deploy, so it does not collapse ACROSS that boundary** — see `docs/PAYMENT-FLOW.md`.
- **Emission is fire-and-forget everywhere.** Nothing in this feature can change a login's response
  or a payment's outcome.

No warehouse rollup ships with this: there are no `first_utm_*`-style columns and no
`user_properties` table. The events land in `events` and are queried from there. The 12-column
rollup is TAM-157's.

## Wire shape (Amplitude HTTP V2 — unchanged transport)

`POST /2/httpapi`, body `{ api_key, events: [...] }`; auth is the body `api_key` (V2 contract).
Per event, the collector reads:

The `StoredEvent` wire is **snake_case and correctly typed** — every field maps 1:1 into its
ClickHouse column with no overrides (bags/`groups` are sent as JSON **objects**, timestamps as
**epoch-ms integers**):

| Wire field                                                                                                                                                            | → `StoredEvent`                                                                    | Notes                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event_type`                                                                                                                                                          | `event_type`                                                                       | required; the funnel dimension. `$identify` = user-state change                                                                                      |
| `user_id`                                                                                                                                                             | `user_id`                                                                          | ≥5 chars; **primary identity** (fallback: `event_properties.player_id`, transitional, same ≥5 rule)                                                  |
| `device_id` / `pseudo_id`                                                                                                                                             | `device_id` / `pseudo_id`                                                          | ≥5 chars each; ≥1 identity required or the event is skipped (batch still 200)                                                                        |
| `insert_id`                                                                                                                                                           | `insert_id`                                                                        | dedup key; UUID generated if absent                                                                                                                  |
| `session_id`                                                                                                                                                          | `session_id`                                                                       | numeric; `-1` if absent                                                                                                                              |
| `event_id`                                                                                                                                                            | `event_seq_id`                                                                     | Amplitude's per-device event sequence (integer); `0` if absent. Ordering tiebreaker for the warehouse `synthetic_sequence_time`                      |
| `time` (or `timestamp`)                                                                                                                                               | `event_time`                                                                       | **epoch ms** (device clock) — lands directly in the `event_time` `DateTime64` column                                                                 |
| `event_properties`                                                                                                                                                    | `event_properties`                                                                 | JSON **object** on the wire; types preserved; ≤100 keys                                                                                              |
| `user_properties`                                                                                                                                                     | `user_properties`                                                                  | JSON **object** on the wire; types preserved; ≤100 keys; identify ops (`$set`/`$setOnce`/`$unset`/`$clearAll`…) pass through verbatim on `$identify` |
| `groups`                                                                                                                                                              | `groups`                                                                           | JSON **object** on the wire → lands in the `groups` `Map`; values coerced to string                                                                  |
| `group_properties`                                                                                                                                                    | `group_properties`                                                                 | JSON **object** on the wire; pass-through                                                                                                            |
| `platform`, `os_name`, `os_version`, `version_name`, `device_brand`, `device_model`, `device_manufacturer`, `carrier`, `country`, `language`, `library`, `ip`, `adid` | flat top-level (snake_case, one per promoted column; `version_name`→`app_version`) | auto-collected by the SDK (location is intentionally not collected)                                                                                  |
| `attempts` / `retry_count`                                                                                                                                            | diagnostics                                                                        | client delivery counters (default 0); bounded 0–65535 (warehouse `UInt16`)                                                                           |

A **batch-level** field also matters: **`client_upload_time`** (sibling of `api_key`/`events`) —
Amplitude V2 sends it once per batch (ISO-8601 from amplitude-analytics-android; epoch ms from some
SDKs), and it is the **only** upload-time source (there is no per-event `sent_at`). The collector
parses it to epoch ms and stamps it on every event as `client_upload_time`, which lands directly in
the `client_upload_time` `DateTime64` column and feeds the warehouse skew correction
(`corrected_time` = `server_time − (client_upload_time − event_time)`).

Property bags accept ≤100 keys each; keys containing quotes, backslashes, or control characters
are **dropped** (they would corrupt the warehouse's JSON assembly).

Server adds: `req_guid` (ingest request id) + `server_time` (base + index within the batch —
unique and order-preserving epoch ms, so same-flush op sequences resolve deterministically).
The record stored on Kinesis is **`StoredEvent`** (`apps/events/src/core/events/types.ts`): its
fields are snake_case and typed to match the ClickHouse columns 1:1 — timestamps as epoch-ms
integers (→ `DateTime64`), the property bags and `groups` as native JSON **objects** (→ `JSON` /
`Map`), context flat. No stringified bags, no camelCase raw duplicates; ClickPipe writes each field
into its column with no overrides.

## Response (unchanged)

`200 {code, events_ingested, payload_size_bytes, server_upload_time}` — invalid/identity-less
events are skipped and logged, the batch still succeeds (Amplitude V2 has no partial accept; a 4xx
would poison the SDK retry queue). `400` only for a malformed payload or bad `api_key`.

## See also

- `apps/events/CLAUDE.md` — collector conventions
- `docs/EVENT-ARCHITECTURE.md` — the pipes; `docs/ANALYTICS-WAREHOUSE.md` (TAM-16) — the schema
- `specs/TAM-15-generalize-events-mapping.md` · `specs/TAM-16-clickhouse-analytics-warehouse.md` ·
  `specs/TAM-17-persons-enrichment.md` (historical — persons enrichment deferred/removed pre-release)
