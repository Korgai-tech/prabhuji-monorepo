---
name: flutter-analytics
description: Analytics for apps/mobile — one seam (lib/core/analytics.dart) fanning out to Amplitude (via our own events collector) + Firebase Analytics + Meta App Events, with scoping rules (event vs identifyUser vs setWorkspace vs signIn), the null-safe fire-and-forget call-site pattern, identify dedupe (24h re-assert), and reset on 401/logout. Routes to docs/ANALYTICS-FLUTTER-GUIDE.md as the source of truth for naming and troubleshooting. Use when adding a new event, wiring a user property, debugging "why didn't this fire," or reviewing a PR that touches tracking.
user-invocable: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Flutter Analytics Skill

## Purpose

Give `apps/mobile` one predictable path from a UI event to analytics: a single seam (`lib/core/analytics.dart`) that fans out to **three sinks in parallel** — Amplitude (pointed at our own `apps/events` collector, not amplitude.com), Firebase Analytics (GA4 for marketing dashboards), and Meta / Facebook App Events (attribution + audiences). Widgets never touch an SDK type; they call typed methods on `Analytics`, wrapped in `unawaited(...)?.method(...)` so a failing sink never blocks or breaks the app.

This skill is intentionally short: `docs/ANALYTICS-FLUTTER-GUIDE.md` is the source of truth for naming conventions, event catalogue, user-property list, and troubleshooting. This SKILL.md covers the wiring and the invariants — read the guide before naming a new event or user property.

## When This Skill Applies

- Adding a new event, user property, or workspace switch
- Debugging "the event didn't show up in the dashboard"
- Reviewing a PR that adds `unawaited(...trackEvent(...))` or a new sink
- Wiring a new SDK sink (rare — three is already a lot)
- Onboarding: understanding why we run our own Amplitude collector instead of amplitude.com

## Composes With

- [flutter-env-config](../flutter-env-config/SKILL.md) — `Analytics.init` reads `AppConfig.instance.eventsUrl` and `eventsApiKey`
- [flutter-secrets](../flutter-secrets/SKILL.md) — the Meta sink gates on `Secrets.instance.metaEnabled`; without real keys it stays null and only Amplitude + Firebase fire
- [flutter-dependencies](../flutter-dependencies/SKILL.md) — `Analytics` is registered as a singleton in `configureLocator`, but only when init succeeded (nullable everywhere downstream)

## The Guide (source of truth)

**Read this before adding any tracking:** [`docs/ANALYTICS-FLUTTER-GUIDE.md`](../../docs/ANALYTICS-FLUTTER-GUIDE.md).

It covers:
- The API reference in full (parameter shapes, return types)
- Naming conventions for events and properties
- The event catalogue (what already exists — don't duplicate)
- The user-property catalogue (what's `set` vs `setOnce`)
- Local verification (how to see events land in the local warehouse)
- Troubleshooting the sinks individually

This skill covers the wiring rules — everything else defers to the guide.

## Baseline

```yaml
# apps/mobile/pubspec.yaml
dependencies:
  amplitude_flutter: ^4.6.0
  firebase_analytics: ^11.x
  facebook_app_events: ^0.20.x
```

The Amplitude SDK is pointed at our events collector via `serverUrl`:

```dart
serverUrl: '${AppConfig.instance.eventsUrl}/2/httpapi'
```

Events flow → `apps/events` (our collector implementing Amplitude's HTTP V2 contract) → Kinesis → ClickPipe → ClickHouse. Not amplitude.com. The three SDKs are running in parallel because each dashboard we care about needs its own copy — Amplitude → funnel/retention in our warehouse, Firebase → GA4 for marketing, Meta → attribution + audience-building on Meta ads.

## The Iron Rule — One Seam

**`lib/core/analytics.dart` is the ONLY file that imports an analytics SDK type.** Feature code never imports `amplitude_flutter`, `firebase_analytics`, or `facebook_app_events`.

```dart
// ❌ Wrong — feature code imports the SDK
import 'package:amplitude_flutter/amplitude.dart';
Amplitude.getInstance().logEvent('paywall_shown');

// ✅ Correct — feature code calls the seam
import 'package:mobile/core/analytics.dart';
unawaited(ref.read(analyticsProvider)?.trackEvent('paywall_shown'));
```

`grep -r "package:amplitude_flutter\|package:firebase_analytics\|package:facebook_app_events" apps/mobile/lib --exclude=core/analytics.dart` should return zero results.

## The API Surface

Five verbs — pick by *what you're describing*:

| Method | Describes | Fans out to |
|---|---|---|
| `trackEvent(name, {properties})` | Something that just happened (`paywall_shown`, `otp_verified`) | All three |
| `signIn(String jwt)` | Who this user IS after login / session restore (decodes JWT for `sub` + email) | All three (sets user id + `$identify` email) |
| `identifyUser({set, setOnce})` | Facts about the user (`plan: 'pro'`, `first_app_open_at: …`) | All three (Firebase = user properties; Meta = fixed 6-field surface) |
| `setWorkspace(String id)` | Which workspace they're currently in (Amplitude Groups) | Amplitude |
| `reset()` | User signed out — clear identity across sinks | All three |

There is also a legacy `trackClick(screen, element)` that wraps `trackEvent('click', {screen, element})`. Prefer named events for anything new.

## The Scoping Rule of Thumb

> Facts about **this action** → `trackEvent` properties.
> Facts about **the user** → `identifyUser`.
> **Workspace** → `setWorkspace`.
> **Who** → `signIn`.

**Never put `player_id`, `plan`, `workspace_id` in event properties.** They're user/workspace state; the dashboard already joins them onto every event via the identify pipe. Duplicating them into properties creates two sources of truth and drift.

Full mapping table + edge cases in the guide.

## The Call-Site Pattern — Null-Safe, Fire-and-Forget

Every call site follows this shape:

```dart
unawaited(ref.read(analyticsProvider)?.trackEvent(
  'paywall_shown',
  properties: {'source': source, 'trigger': trigger},
));
```

Three things all matter:

1. **`unawaited(...)`** — analytics must NEVER block a user-facing action. If a sink is slow, the UI shouldn't feel it.
2. **`?.` on the provider** — `analyticsProvider` is null in tests and when `Analytics.init` fails (e.g., Firebase platform channel throws at boot). Every call site tolerates null.
3. **Read via provider, not `serviceLocator<Analytics>()`** — because widgets already have a `WidgetRef`, and Riverpod's override in `main()`'s `ProviderScope` is the test seam.

Inside a Bloc (no `ref`): resolve via `serviceLocator.isRegistered<Analytics>() ? serviceLocator<Analytics>() : null` in the constructor and store as a nullable field. Same fire-and-forget pattern at call sites.

## Identify Dedupe (TAM-20) — 24h Re-Assert

`identifyUser({set, setOnce})` is called from many places on many lifecycle events (login, subscription change, module open, first audio complete, share, ringtone/wallpaper set). Sending an `$identify` payload every time floods the wire with no-ops.

**The dedupe policy:**

- A no-op payload (nothing changed) is dropped client-side.
- A full snapshot is re-asserted every 24h regardless — so a user who never changes a property still shows up as active in the dashboard.
- Persisted in `lib/core/identify_snapshot_store.dart` (SharedPreferences).
- Policy lives in `lib/core/identify_dedupe.dart`.

**You don't need to worry about this at the call site** — just call `identifyUser({set: {'plan': 'pro'}})` from wherever the fact becomes true. The deduper decides whether to actually fire.

## Reset on 401 / Logout

`reset()` is called from:

- The `AuthStore.changes` listener in `main.dart` (token flips to null)
- The dio 401 handler (server rejected the token)

`reset()` clears the identity on all three sinks AND wipes the identify-dedupe snapshot. The next `signIn(newToken)` starts clean — no leaked state from user A onto user B.

**Don't call `reset()` from feature code.** It's plumbed into the auth path once; feature-level logout events surface via `signOut → AuthStore.clear → changes stream → reset`.

## The Enricher — Common Properties on Every Event

`lib/core/analytics_enricher.dart` adds baseline properties to every event without every call site having to remember: `device_model`, `os_version`, `app_version`, `session_id`, `anonymous_id`. The enricher is passed into `Analytics.init` at boot and applied inside the seam — invisible to call sites.

**Never re-add these at a call site.** If a property you want to attach feels universal enough that every event would carry it, add it to the enricher — not to `properties: {...}`.

## Testing

Analytics is null-safe by design. Tests generally don't need to seed it:

```dart
// The provider is nullable — a null override is a valid state.
await tester.pumpWidget(
  ProviderScope(
    overrides: [analyticsProvider.overrideWithValue(null)],
    child: const MyApp(),
  ),
);
```

To assert an event fired, provide a fake:

```dart
class RecordingAnalytics extends Fake implements Analytics {
  final events = <(String, Map<String, Object?>?)>[];
  @override
  Future<void> trackEvent(String name, {Map<String, Object?>? properties}) async {
    events.add((name, properties));
  }
}

final rec = RecordingAnalytics();
await tester.pumpWidget(ProviderScope(
  overrides: [analyticsProvider.overrideWithValue(rec)],
  child: const MyApp(),
));
// …drive the UI…
expect(rec.events.map((e) => e.$1), contains('paywall_shown'));
```

**Assert the call, not the delivery.** The seam either called Amplitude / Firebase / Meta or it didn't — the SDKs' own delivery is not our unit test surface.

## Anti-Patterns

- **Importing an SDK type outside `lib/core/analytics.dart`.** Breaks the seam. Grep verifies (see rule above).
- **Blocking on analytics** (`await analytics.trackEvent(...)`). The user waits on a network call to a sink they can't see. Always `unawaited`.
- **Assuming `analyticsProvider` is non-null.** It's null in tests and when init fails. Always `?.`.
- **Putting `player_id`, `plan`, `workspace_id`, `subscription_status` in event properties.** They belong on the user / workspace via `identifyUser` / `setWorkspace`.
- **Calling `identifyUser({set: {...}})` at high frequency for values that rarely change.** The dedupe handles it, but the call still allocates + serialises. Fire once at the lifecycle event that made the property true, not on every screen build.
- **Calling `reset()` from feature code.** The auth path owns it. Feature-level "log out" surfaces as `AuthStore.clear()`.
- **Adding an event without checking the catalogue in the guide.** Duplicates a name → two funnels answer the same question and drift apart.
- **Fabricating event / property names ad hoc.** The guide has the naming rules; a divergent name loses the dashboard.
- **Enabling Amplitude autocapture.** Explicit tracking only — autocapture would fire hundreds of "view" events per session that mean nothing to the funnel.

## Common Mistakes

- **"Event doesn't show up in the dashboard"** — check the three sinks separately. Local: use the `apps/events` collector's dev logs to confirm the Amplitude sink got it. If the Amplitude sink fired but nothing lands in the warehouse, it's a ClickPipe/ClickHouse issue, not the mobile side.
- **"Meta events stopped after last deploy"** — CI didn't write `env/prabhujiSecrets.json` before the build; `Secrets.instance.metaEnabled` is false; `FacebookAppEvents` never constructed. See [flutter-secrets](../flutter-secrets/SKILL.md).
- **"Firebase events show wrong user id after logout"** — a code path clears the token without going through `AuthStore.clear()`, so `reset()` never fires. All logout paths must go through the auth store.
- **"Duplicate `$identify` calls"** — you're re-calling `identifyUser` on every rebuild instead of at a lifecycle event. Move to the lifecycle callback.
- **Widget test fails with `NoSuchMethodError` on the analytics provider** — the test provided a `Fake` that doesn't override the method being called. Add the method to the fake.

## Checklist for a New Event

- [ ] Name checked against the catalogue in `docs/ANALYTICS-FLUTTER-GUIDE.md` — no duplicate
- [ ] Name follows the guide's naming convention (snake_case, verb + noun)
- [ ] Properties are `Map<String, Object?>` — no nested objects, no SDK types
- [ ] Nothing in `properties` describes the USER (that's `identifyUser`) or WORKSPACE (`setWorkspace`)
- [ ] Call site uses `unawaited(analytics?.trackEvent(...))` — never `await`
- [ ] Test seed uses `overrideWithValue(null)` or a `RecordingAnalytics` fake
- [ ] Event added to the catalogue in the guide (if adopting a new schema)

## Authoritative References

- **The guide (start here for anything catalogue-related):** [`docs/ANALYTICS-FLUTTER-GUIDE.md`](../../docs/ANALYTICS-FLUTTER-GUIDE.md)
- Real seam: `apps/mobile/lib/core/analytics.dart` (fan-out to three sinks — the ONLY file that imports an SDK)
- Enricher: `apps/mobile/lib/core/analytics_enricher.dart`
- Identify dedupe: `apps/mobile/lib/core/identify_dedupe.dart` + `identify_snapshot_store.dart`
- Init call site: `apps/mobile/lib/main.dart` (after `AppConfig` + `Secrets` init, before `configureLocator`)
- Collector: `apps/events/` (implements Amplitude HTTP V2 contract)
- Wire contract: `docs/ANALYTICS-EVENT-CONTRACT.md`
- Mobile conventions: `apps/mobile/CLAUDE.md`
- Related skills: [flutter-env-config](../flutter-env-config/SKILL.md), [flutter-secrets](../flutter-secrets/SKILL.md), [flutter-dependencies](../flutter-dependencies/SKILL.md), [frontend-patterns](../frontend-patterns/SKILL.md)
