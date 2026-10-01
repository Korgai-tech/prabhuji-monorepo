# Flutter Analytics Guide — how to track things properly

How to use analytics from the Flutter app (`apps/mobile`). The app talks to **our own pipeline**
(collector → Kinesis → ClickHouse), not Amplitude's cloud — but through the standard
`amplitude_flutter` SDK, so everything here is ordinary Amplitude usage with our conventions on
top.

```
your widget ──ref.read(analyticsProvider)?.──▶ Analytics (lib/core/analytics.dart)
                                                  │  the ONLY file that touches the SDK
                                                  ▼
                              amplitude_flutter (batches 30 events / 30 s, retries, persists queue)
                                                  │  POST /2/httpapi (Amplitude V2)
                                                  ▼
                    apps/events ──▶ Kinesis ──▶ ClickHouse  (events — funnels, cohorts, journeys)
```

## Setup (already wired — for reference)

- Compile-time defines (see `lib/core/env.dart`): `EVENTS_URL` (the collector base URL —
  from the Android emulator use `http://10.0.2.2:3001`) and `EVENTS_API_KEY` (must equal the
  collector's `EVENTS_API_KEY`).
- `Analytics.init()` runs in `main()`; the instance is exposed as **`analyticsProvider`**, which
  is **null** in tests or if init fails — analytics must never break the app. Therefore every
  call site uses the null-safe, fire-and-forget shape:

```dart
unawaited(ref.read(analyticsProvider)?.trackEvent('chat_room_entered', properties: {...}));
```

Never `await` an analytics call on a user-facing path, and never let one throw into app logic.

## The API — when to call what

### `trackEvent(name, {properties})` — the primary call

Track that the user **did something**. `name` is the funnel dimension.

```dart
unawaited(analytics?.trackEvent('chat_room_entered', properties: {
  'room_id': roomId,          // facts about THIS action only
  'entry_point': 'home_banner',
  'network_type': networkType, // transient device state = event scope too
}));
```

**Naming convention**: `snake_case`, `<object>_<past-tense-verb>` — `chat_room_entered`,
`game_started`, `purchase_completed`. Never put variable data in the name (`room_7_entered` ❌ —
that belongs in `properties.room_id`); every distinct name is a distinct funnel step.

### `signIn(token)` — identity, one call *(already wired)*

Called automatically after login and on app start with a restored session. Decodes our api JWT
(`{sub: user.id, email}`), attaches `user_id` to every subsequent event, and sends the email as
user state. **You only need to call this yourself if you add a new auth entry point** (e.g.
social login).

### `identifyUser({set, setOnce})` — user state ("who the user IS")

Call **whenever a user attribute changes**, not on every event. This emits a `$identify` event and
updates the local snapshot the SDK attaches to subsequent events. (The `$identify` event itself is
currently **dropped at the collector** — no server-side effect; the useful part is the client
snapshot the SDK attaches to your subsequent events. See "under the hood".)

```dart
// plan changed (e.g. after a purchase succeeds)
unawaited(analytics?.identifyUser(set: {'plan': 'premium'}));

// install attribution — setOnce = first write wins, later calls can't overwrite
unawaited(analytics?.identifyUser(setOnce: {'source': source, 'medium': medium}));
```

- `set` → `$set`, **last write wins** (name, plan, language preference…)
- `setOnce` → `$setOnce`, **first write wins** (acquisition source, first_seen…)
- Supported ops on the wire: `$set`, `$setOnce` from the client (+ `$unset`/`$clearAll`, typically
  server-sent). The wire still *defines* these ops, but `$identify` events are **skipped at the
  collector** today, so none of them are resolved server-side — don't rely on them. (See "under
  the hood".)
- **No-op dedupe (TAM-20)**: a payload identical to the last-sent snapshot is dropped
  client-side before it reaches the SDK — so the per-launch `signIn` no longer emits a
  `$identify` per launch, and "call whenever an attribute changes" stays cheap to over-call.
  Real changes send immediately; the full accumulated snapshot is re-asserted every 24 h
  (`IdentifyDeduper.defaultReassertInterval`, `lib/core/identify_dedupe.dart`) as a safety net
  against server-side state loss. Dedupe state is per signed-in user, encrypted at rest, and
  wiped on `reset()`.

### `setWorkspace(workspaceId)` — account scope

Call when the user enters/switches a workspace. It rides on every event as a **group** — never
put `workspace_id` in event properties.

```dart
unawaited(analytics?.setWorkspace(workspaceId));
```

### `reset()` — logout *(already wired to the 401 path)*

Drops the user id and rotates the device id, so accounts don't bleed together on shared devices.
Call it from any explicit logout button you add.

### `trackClick(screen, element)` — legacy helper

Kept for existing call sites; it's `trackEvent('click', …)` with `screen`/`element` as
first-class properties. For anything you'll build a funnel on, prefer a **named** event.

### `setUser(userId)` — building block

Only for custom identity flows; normal code uses `signIn(token)`. Ids must be **≥5 characters**
(the collector's min-id rule) — shorter ids leave events anonymous.

## The golden rule — what goes where

| You're recording… | Use | Why |
| --- | --- | --- |
| a fact about **this action** (`room_id`, `score`, `entry_point`) | `trackEvent` properties | changes every event |
| a fact about **the user** (`plan`, `name`, `language`) | `identifyUser(set: …)` | slow-changing snapshot; emits `$identify` (dropped at the collector today — the value rides on subsequent events via the client snapshot) |
| **acquisition** attribution (`source`, `medium`) | `identifyUser(setOnce: …)` | must never be overwritten by later sessions |
| **which workspace/account** | `setWorkspace` | account scope = groups, queryable per event |
| **who the user is** | `signIn` / `setUser` | identity, not a property — never put `player_id` in event properties |

Mis-scoping is the #1 analytics bug: putting `plan` in event properties means "funnel of premium
users" silently misses every event tracked before the property was added.

### Global properties — already on every event, never pass them yourself

`AnalyticsEnricher` folds a common bag into every `trackEvent` call. Passing one
of its keys from a call site duplicates it and invites drift. The full list is in
[`ANALYTICS-MODULES.md`](./ANALYTICS-MODULES.md#common-attributes--do-not-re-implement-per-event);
the two most often re-implemented by mistake:

| Global | Means | Do NOT add |
| --- | --- | --- |
| `has_name` | the user has a `/status/profile` display name saved | `name_present`, `existing_details_present` |
| `has_photo` | the user has an avatar saved | `avatar_present`, `has_existing_details` |

Both are booleans sourced from `StatusProfileFlagsStore`, mirrored by the status
repository on every profile fetch and save, and cleared on logout. They are
**last-known** values: a profile edited on another device lags until this device
next fetches. If you need the value *at an exact instant* rather than
last-known — the way the share funnel needs `is_pro_at_event` — that is a real
per-event property and belongs at the call site under its own name.

Note the one name collision that is NOT a duplicate: onboarding's
`name_present` on `onboarding_profile_save_result` reports the **account** name
(`PATCH /users/me`), a different record from the `/status/profile` display name
`has_name` reads. Keep them apart.

## What happens under the hood (why this all works)

- The SDK **queues on-device** and retries — offline events arrive late, never lost; retries can
  duplicate (each event carries an `insert_id`; the warehouse dedups at query time).
- `identifyUser` emits a **`$identify` event** and updates the local snapshot the SDK attaches to
  subsequent events. Because the SDK attaches the snapshot client-side, `user_properties` on an
  event still reflects what the user looked like when the event was sent (point-in-time).
- **Deferred**: the warehouse's `persons` store and the ingest-time **stamp** of accumulated
  user state onto every event were **removed pre-release**. `$identify` is now **dropped at the
  collector** — it's skipped before Kinesis (batch still returns 200), so it has **no server-side
  effect at all** and never reaches ClickHouse. `events.user_properties` is the client snapshot
  as-sent only — there is no server-side merge of accumulated state for now. If identity
  resolution returns it will be its own separate Kinesis stream (see
  `docs/ANALYTICS-EVENT-CONTRACT.md`).
- Your backend can also send `$identify` for server-only attributes (LTV, computed segments) —
  same endpoint, see `docs/ANALYTICS-EVENT-CONTRACT.md`. The wire still accepts the shape, but the
  collector skips it too while persons enrichment is deferred.

## Constraints the collector enforces (silently skips violators)

- Identity fields (`user_id`, `device_id`) **≥5 chars**; an event with no identity at all is
  dropped (the SDK always sends `device_id`, so this only bites custom code).
- **≤100 keys** per property bag; keys containing quotes, backslashes, or control characters are
  dropped. Values keep their types (numbers stay numbers — never pre-stringify).
- Location is deliberately **not collected**.
- Skipped events never error to the app — the batch always gets a 200 (Amplitude V2 semantics).

## Verifying your events locally

1. Run the collector: `pnpm nx serve events` (needs `EVENTS_API_KEY` in `.env`), and the app with
   `--dart-define=EVENTS_URL=http://10.0.2.2:3001 --dart-define=EVENTS_API_KEY=<same key>`.
2. Watch the collector logs — accepted batches log at debug, skipped events at info.
3. Full pipeline check (ClickHouse): `pnpm nx run events:migrate`, then pipe collector →
   Kinesis is emulator-only locally, so for end-to-end insert your `StoredEvent`'s raw wire
   columns into `events` (the DEFAULT expressions compute the analytics columns — see
   `docs/ANALYTICS-WAREHOUSE.md` "Local test data") — or verify against staging where the real
   ClickPipe runs.
4. Query: `SELECT event_type, user_id, user_properties FROM events ORDER BY server_time DESC
   LIMIT 10` in the local ClickHouse (`http://localhost:${CLICKHOUSE_HTTP_PORT:-8123}/play`,
   `default` / `local-dev-only`).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Events never arrive | `EVENTS_URL` reachable from the device? (emulator needs `10.0.2.2`, not `localhost`) · `EVENTS_API_KEY` matches the collector's? (wrong key = 400, SDK retries forever) |
| Events arrive but anonymous (`user_id` empty) | was `signIn`/`setUser` called before the event? · id ≥5 chars? |
| `user_properties` empty on events | `identifyUser` never called before the event, or the client snapshot was empty when it was sent (the snapshot is attached client-side and is point-in-time, not retroactive; there is no server-side backfill) |
| A property is missing | key contains `"` `\` or control chars (dropped) · bag over 100 keys (truncated) |
| Funnel step missing | event name typo'd — names are exact-match dimensions (`SELECT DISTINCT event_type FROM events`) |
| `$identify` missing from collector logs | payload matched the last-sent snapshot (client dedupe, TAM-20) — expected; change a value or wait out the 24 h re-assert |

## See also

- `apps/mobile/CLAUDE.md` — where the seam lives; `lib/core/analytics.dart` — the implementation
- `docs/ANALYTICS-EVENT-CONTRACT.md` — the wire contract (all producers, incl. backend `$identify`)
- `docs/ANALYTICS-WAREHOUSE.md` — the ClickHouse side (schema, queries, ops)
- `specs/TAM-18-flutter-analytics-integration.md` — this integration's spec
