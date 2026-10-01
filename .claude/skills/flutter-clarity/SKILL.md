---
name: flutter-clarity
description: Microsoft Clarity session-replay integration for apps/mobile — a single ClarityService singleton wrapping clarity_flutter, initialized post-login (needs BuildContext + playerId), a ClarityNavigatorObserver wired into every GoRouter's observers list so recordings are labeled by screen, custom tags (flavour, appVersion, userType) auto-set at init and on profile load, and a sendToClarity flag on the analytics tracker so only funnel-relevant events surface as Smart Events. Use when adding a new tag/event to Clarity, wiring Clarity into a new flavour's router, debugging "sessions aren't recording / screen name is FlutterActivity / userType is missing," or reviewing a PR that touches ClarityService or the analytics tracker's Clarity fan-out.
user-invocable: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Flutter Clarity Skill

## Purpose

Give `apps/mobile` a single, predictable path to Microsoft Clarity session recordings: one `ClarityService` singleton (`lib/core/services/clarity_service.dart`) wrapping the `clarity_flutter` SDK, initialized once per session **after the user logs in** (Clarity needs a `BuildContext`), a single `ClarityNavigatorObserver` mounted in every `GoRouter`'s `observers:` list so replays are labeled by route name instead of the default `FlutterActivity`, and a sparse `sendToClarity: true` flag on `AnalyticsTracker.track` that promotes only funnel-relevant events to Clarity Smart Events (not every Mixpanel event).

Widget/feature code never imports `package:clarity_flutter` directly — it calls the seam. The seam owns idempotency, no-op safety, PII rules, and the tag/event/screen surface.

## When This Skill Applies

- Adding a new custom tag (`setTag`), user-type flip (`setUserType`), or funnel event (`sendToClarity: true`)
- Wiring Clarity into a new flavour's `GoRouter` (mounting `ClarityNavigatorObserver`)
- Adding a new flavour's `MainNavigationPage` and needing Clarity to initialize after login
- Debugging any symptom in the Symptom → Cause table below (no sessions, unlabeled screens, missing userType, `FlutterActivity` everywhere)
- Reviewing a PR that touches `lib/core/services/clarity_service.dart`, `lib/core/analytics/analytics_tracker.dart`'s Clarity branch, or any `MainNavigationPage`'s init sequence
- Rotating the Clarity project id per flavour or per env

## Composes With

- [flutter-analytics](../flutter-analytics/SKILL.md) — `AnalyticsTracker.track(..., sendToClarity: true)` is the ONE way feature code emits a Clarity Smart Event; the seam calls `ClarityService().event(name)` after Mixpanel returns.
- [flutter-env-config](../flutter-env-config/SKILL.md) — `AppConfig.instance.clarityKey` is the per-flavour project id, loaded once at cold start from the env JSON. Empty key → seam short-circuits (no init, no crash).
- [flutter-routing](../flutter-routing/SKILL.md) — `ClarityNavigatorObserver` MUST be added to every `GoRouter`'s `observers:` list; it pushes `route.settings.name` into `Clarity.setCurrentScreenName`.
- [flutter-state-bloc](../flutter-state-bloc/SKILL.md) — `UserProfileBloc._onFetchUserProfile` calls `ClarityService().setUserType(isHost: ...)` when the profile loads, because `isAudioHost` isn't known at `initialize()` time.

## The Guide (source of truth)

The Clarity Flutter SDK docs are the authoritative reference for the underlying calls:

- Package: `clarity_flutter: 1.4.3` (see `apps/mobile/pubspec.yaml`)
- SDK docs: https://learn.microsoft.com/en-us/clarity/mobile-sdk/overview
- Dashboard: https://clarity.microsoft.com/ — a session URL is printed to logs on session start (see `ClarityService.initialize`).

This skill covers the wiring and invariants in *our* codebase — for SDK primitives themselves (masking, opt-outs, upload behaviour) defer to the Microsoft docs.

## Baseline

```yaml
# apps/mobile/pubspec.yaml
dependencies:
  clarity_flutter: 1.4.3
```

Per-flavour project id in `env/<flavour>-<env>.json` under the `appSecretsJson.clarityKey` field, read by `AppConfig.fromJson`:

```dart
// apps/mobile/lib/core/config/app_config.dart
clarityKey: appSecretsJson['clarityKey'] as String? ?? '',
```

Empty string is a valid, expected value — the seam treats it as "Clarity disabled for this flavour" and returns early with a warning log. Never throw on an empty key.

Remote-config kill switch: `RemoteConfigKeys.configClarity` (`config_clarity`) — reserved for a future emergency disable; currently the boot path does not gate on it (the empty-key path is the disable). If you add gating, gate at the seam, not at every call site.

## The Iron Rule — One Seam

**`lib/core/services/clarity_service.dart` is the ONLY file that imports `package:clarity_flutter`.** Feature code, blocs, and widgets call the seam.

```dart
// ❌ Wrong — feature code imports the SDK
import 'package:clarity_flutter/clarity_flutter.dart';
Clarity.setCustomTag('foo', 'bar');

// ✅ Correct — feature code calls the seam
import 'package:krutyug_flutter_app/core/services/clarity_service.dart';
ClarityService().setTag('foo', 'bar');
```

`grep -r "package:clarity_flutter" apps/mobile/lib --exclude=core/services/clarity_service.dart` should return zero results.

## The API Surface

Six verbs on `ClarityService()` — pick by *what you're describing*:

| Method | Describes | Notes |
|---|---|---|
| `initialize(context, {playerId})` | Cold start / login — begin recording this session | Idempotent per `playerId`; re-inits if `playerId` changes; no-ops on empty `clarityKey` |
| `setTag(key, value)` | A filterable dimension of THIS session (`plan`, `experiment_arm`) | Both non-empty, ≤255 chars, no PII |
| `setUserType({required isHost})` | Convenience over `setTag('userType', ...)` for the host/user split | Call from `UserProfileBloc` when profile loads |
| `event(name)` | A named point on the session timeline (funnel step, icon-only tap) | Use sparingly; goes to the "Smart Events" surface |
| `setCurrentScreen(name)` | The screen the user is looking at now | Owned by `ClarityNavigatorObserver` — don't call from features |
| — (via observer) | Modal / bottom-sheet opened | Observer emits `event('modal')` / `event('bottomSheet')` automatically |

All six are safe to call before `initialize()` — they silently return if `_isInitialized` is false. Feature code doesn't need to null-check or try/catch.

## Cold-Start / Login Sequence — Where Init Belongs

Clarity **cannot** initialize at `main()` time — the SDK requires a `BuildContext` because it hooks into the widget tree to capture. So it initializes at the top of each flavour's `MainNavigationPage.initState`, inside a `WidgetsBinding.instance.addPostFrameCallback` (so `context` is safely mounted) after we've read the player id from `SharedPreferences`:

```dart
// apps/mobile/lib/pages/main_navigation_page.dart  (or lib/flavors/<flavor>/pages/…)
WidgetsBinding.instance.addPostFrameCallback((_) {
  final playerId = sl<SharedPreferencesService>().getPlayerId();
  ClarityService().initialize(context, playerId: playerId);
  ClarityService().setCurrentScreen(_clarityScreenName(_currentIndex));
});
```

`main.dart` deliberately does NOT call `Clarity.initialize` — there's a comment marker there so you don't add it back:

```dart
// lib/main.dart
// Note: ClarityService is initialized in MainNavigationPage after user logs in
```

**Why this shape:**

- `MainNavigationPage` is only mounted for authenticated users, so `playerId` is always available and Clarity sessions are always tied to a real user.
- `initialize` is idempotent per `playerId` — if the user logs out and a different user logs in (which remounts `MainNavigationPage`), the seam sees a new `playerId`, re-initializes, and the new session is tagged with the new user id.
- Auto-tags (`flavour`, `appVersion`) are set inside `initialize` — they land on every session for free.

## Per-Flavour Wiring — Every `GoRouter` Gets the Observer

Every flavour has its own `GoRouter`. Every one of them MUST include `ClarityNavigatorObserver()` in `observers:` — otherwise the Clarity dashboard shows every screen as `FlutterActivity`, funnels become unreadable, and modals/bottom sheets never appear on the timeline.

```dart
// lib/flavors/<flavor>/routes/<flavor>_routes.dart
static final GoRouter router = GoRouter(
  navigatorKey: navigatorKey,
  initialLocation: Routes.authCheck,
  observers: [
    if (kDebugMode) ChuckerFlutter.navigatorObserver,
    routeObserver,
    ClarityNavigatorObserver(),   // ← required, per flavour
  ],
  ...
);
```

Current flavours wired: `openly`, `mastii`, `mastiiPro`, `dostii`, `dostiiPro`, `audioJockey`, `friendChat`, `playroomPro`. **Adding a new flavour: this observer is not optional.**

The observer:

- Emits `setCurrentScreenName(route.settings.name ?? route.runtimeType.toString())` on `didPush` / `didReplace` / `didPop` / `didRemove` for `PageRoute`s — so give every `GoRoute` a meaningful `name:` (or the fallback becomes `MaterialPage<dynamic>` and you lose readability).
- Emits `event('bottomSheet')` for `ModalBottomSheetRoute` and `event('modal')` for `PopupRoute` (which catches `DialogRoute`, `CupertinoDialogRoute`, `RawDialogRoute`, etc.) — that's how modals appear inline on the timeline.

## Screen Naming Inside a Tab Shell

The observer names screens for *pushed routes*. Tab switches inside a `bottomNavigationBar` don't push routes, so the observer never fires. `MainNavigationPage` compensates by calling `setCurrentScreen` + `event('Tab: ...')` manually on every tab change:

```dart
// apps/mobile/lib/pages/main_navigation_page.dart  _handleTabChange
ClarityService().setCurrentScreen(_clarityScreenName(newIndex));
ClarityService().event('Tab: ${_clarityScreenName(newIndex)}');
```

The `_clarityScreenName(int index)` mapping lives on each flavour's `MainNavigationPage` and maps `TabType` → stable name (`GamesPage`, `CallsPage`, `ChatsPage`, `RecentCallActivityPage`, `SettingsPage`). **Keep these names stable across releases** — Clarity funnels reference them by string; renaming breaks historical comparisons.

If you add a new tab type: update `_clarityScreenName` in every flavour's `MainNavigationPage` that renders that tab. Missing branches fall back to `MainNavigationPage`, which is silent breakage — the sessions still record, but they're unattributable.

## Custom Tags — What Goes On, What Doesn't

Tags are filterable dimensions on the session (sliced in Clarity's filters + Funnels). Set at init or when the fact becomes true:

| Tag | Set where | Notes |
|---|---|---|
| `flavour` | `ClarityService.initialize` | `AppConfig.currentAppFlavor.name` — auto |
| `appVersion` | `ClarityService.initialize` | `AppConfig.instance.appVersion` — auto |
| `userType` | `UserProfileBloc._onFetchUserProfile` after `Success<UserProfile>` | `host` / `user` — set via `setUserType(isHost: ...)`, NOT in `initialize` because `isAudioHost` isn't known yet |

**Never tag PII.** No phone numbers, names, emails, no `playerId` as a tag (playerId goes on the session's userId via `ClarityConfig(userId: ...)`, not as a filterable tag — different surface, different privacy contract). Both key and value must be non-empty, ≤255 chars — the seam trims and drops empties silently.

If you want to add a tag: think about whether it's "about the session" (tag) or "a point in time" (event). Tags are for slicing dashboards; events are for the timeline.

## Custom Events — Sparse by Design

Two paths land an event on the Clarity timeline:

1. **`AnalyticsTracker.track('name', sendToClarity: true)`** — the primary path. Reserved for events that are funnel/dashboard steps in Clarity (paywall shown, purchase completed, call joined). NOT every Mixpanel event.
2. **`ClarityService().event('name')`** — direct, for events that are Clarity-only. Used by `MainNavigationPage` for `Tab: <name>` and by the observer for `modal` / `bottomSheet`.

**Why sparse:** Clarity's Smart Events surface is optimised for a handful of dashboard-visible steps, not the full analytics volume. Every event we push is one more thing to name, keep stable, and reason about in filters — treat it like adding a column to a report, not like tracing.

If you catch yourself writing `sendToClarity: true` on more than one or two events in a PR, stop and ask whether the funnel really needs all of them.

## Icon-Only Tap Labels

Clarity auto-captures tap text only from `TextSpan` widgets in the hit-test path. That means bottom-nav icons, FABs, action icons, and any `IconButton` with no accompanying text show up on the timeline as a bare `Tap` at coordinates (x, y) with no label — unreadable in Funnels.

**Fix at the call site:** immediately after handling the tap, fire a Clarity event to label it:

```dart
onPressed: () {
  ClarityService().event('createRoomFab');
  // ...actual handler...
}
```

The event lands inline on the timeline right next to the unlabeled Tap and is also filterable across sessions. Use short, stable, camelCase labels — they become the visible tag in the dashboard.

## Idempotency & Re-Init Rules

`initialize(context, playerId: ...)` follows a strict shape:

1. Empty `clarityKey` → log warning, return (Clarity disabled for this flavour).
2. Already initialized AND same `playerId` → skip.
3. Already initialized AND *different* `playerId` → log the transition, re-initialize with new `playerId` (new session tied to new user).
4. Not yet initialized → construct `ClarityConfig`, call `Clarity.initialize(context, config)`, register `setOnSessionStartedCallback` (which logs the session id + dashboard URL — how you verify sessions actually start), set `_isInitialized = true`, apply auto-tags.

**Never bypass this by calling `Clarity.initialize` directly** — you'd double-init, lose the dedupe, and lose the auto-tags. Always go through `ClarityService().initialize`.

## Testing

Clarity is null-safe by construction. Tests generally don't need to seed it:

- `ClarityService().initialize` early-returns on empty `clarityKey`, which is the state under widget tests (no env JSON loaded).
- Every other method early-returns on `_isInitialized == false`.

So a widget test that calls a screen that internally fires `ClarityService().event('foo')` is safe — the call is a silent no-op.

To assert Clarity was called from a unit test, extract the seam behind an interface and stub it, or run against the real `ClarityService` singleton and inspect `isInitialized` / `projectId`. There is no delivery to assert — the SDK's upload is not our unit-test surface.

## Symptom → Cause

| Symptom | Cause |
|---|---|
| "No sessions appearing in the Clarity dashboard" | `AppConfig.instance.clarityKey` is empty for this flavour — check `env/<flavour>-<env>.json`. Empty is intentional-off; not a crash. |
| "Session started log fires but dashboard is empty 4h later" | Processing lag — Clarity is ~30 min to ~2 hr behind. The dashboard URL is printed at session start; wait, then reload. |
| "Screen name is `FlutterActivity` for every recording" | `ClarityNavigatorObserver` isn't in that flavour's `GoRouter.observers`. Add it. |
| "Screen name is `MaterialPage<dynamic>`" | The `GoRoute` has no `name:`. Give it one — the observer falls back to `runtimeType.toString()`. |
| "userType tag is always `user` even for hosts" | `UserProfileBloc._onFetchUserProfile` didn't run yet OR the seam wasn't initialized when it did (order: Clarity init → profile fetch → setUserType). |
| "Bottom-nav taps unlabeled on the timeline" | `MainNavigationPage._handleTabChange` isn't calling `event('Tab: ...')` for that flavour. Wire it. |
| "FAB / icon-only button shows as a coordinate Tap only" | Add `ClarityService().event('<labelName>')` at the tap handler. Clarity's auto-capture only reads TextSpan text. |
| "Duplicate sessions after login" | Something is calling `ClarityService().initialize` outside `MainNavigationPage` (e.g., you re-added it to `main()`). Remove the duplicate call. |
| "Sessions for user A show up under user B" | `initialize` was called before login OR `playerId` was empty at init and the seam cached the empty state. Only call `initialize` from `MainNavigationPage` (post-login) with a non-empty `playerId`. |

## Anti-Patterns

- **Importing `package:clarity_flutter` outside `lib/core/services/clarity_service.dart`.** Breaks the seam. Grep verifies (see rule above).
- **Calling `Clarity.initialize` directly** anywhere. Always go through `ClarityService().initialize` — otherwise you lose the empty-key check, the playerId dedupe, the session-start log, and the auto-tags.
- **Initializing Clarity from `main()`** or any pre-login boot code. The SDK needs a `BuildContext` AND we want the session tied to a real `playerId`.
- **Adding a new flavour without mounting `ClarityNavigatorObserver`** in its `GoRouter`. Sessions will record but be unreadable.
- **Firing `sendToClarity: true` on every Mixpanel event.** Clarity's Smart Events are for funnel steps, not tracing. If in doubt, don't send.
- **Tagging PII** — phone, email, name, raw address. `playerId` goes on `ClarityConfig.userId`, not on `setCustomTag`.
- **Renaming `_clarityScreenName` return values.** Dashboards and funnels reference the strings — a rename silently breaks historical comparisons.
- **Wrapping every `ClarityService()` call in a try/catch or null check** at the call site. The seam is safe; the null-check is noise.
- **Calling `ClarityService().setCurrentScreen` from feature code.** The observer owns it. If a screen isn't naming itself, fix the `GoRoute.name:` — don't paper over with manual calls.

## Common Mistakes

- **"I added a tag but the filter is empty in the dashboard"** — tags applied *before* `Clarity.initialize` are dropped. The seam guards against this (early-return on `_isInitialized == false`), which means your tag call happened too early. Move it after login (or into the `UserProfileBloc` `Success` branch, like `userType`).
- **"I added `sendToClarity: true` but nothing shows up on the timeline"** — `AnalyticsTracker.track` awaits the Mixpanel call first (`await analytics.trackEvent(...)`) and only *then* calls `ClarityService().event(name)`. If Mixpanel throws before that line, Clarity is skipped. Check debug logs for `Analytics tracking failed:`.
- **"Second user's session shows first user's `userType`"** — `setUserType` needs to be re-fired when the profile changes; the seam applies it directly to Clarity and Clarity does not clear tags on `initialize`. Cold-relaunch or wait for `UserProfileBloc.Success` to re-fire.
- **"Modal doesn't appear on the timeline"** — the modal is being shown via `showGeneralDialog` with a custom `RouteTransitionsBuilder` that returns a non-`PopupRoute`. Wrap with `showDialog` / `showModalBottomSheet` (which push `PopupRoute` / `ModalBottomSheetRoute`) so the observer catches them.
- **"Recordings look tiny / blank"** — Clarity's default masking is aggressive on Flutter. That's an SDK concern; see Microsoft's docs for `LogLevel` and masking configuration. Not a wiring bug.

## Checklist for Wiring Clarity Into a New Flavour

- [ ] `env/<newFlavour>-<env>.json` has a non-empty `clarityKey` for each env you want recording on
- [ ] The flavour's `<flavour>_routes.dart` includes `ClarityNavigatorObserver()` in `GoRouter.observers`
- [ ] The flavour's `<flavour>_main_navigation_page.dart` calls `ClarityService().initialize(context, playerId: playerId)` in `initState`'s post-frame callback
- [ ] The flavour's `_clarityScreenName(index)` maps every tab it renders to a stable string (no missing branches)
- [ ] `_handleTabChange` in the flavour's `MainNavigationPage` calls `setCurrentScreen` + `event('Tab: ...')` on switch
- [ ] `UserProfileBloc._onFetchUserProfile` is the same instance (or wired to fire) so `setUserType` still lands
- [ ] Cold-launch the flavour, sign in, and confirm the debug log prints `ClarityService: Session started — id: <...>` and a dashboard URL

## Checklist for a New `sendToClarity: true` Event

- [ ] This event is a funnel/dashboard step, not tracing — if you're tempted to add it "just in case," don't
- [ ] Name is short, stable, camelCase or snake_case (match the Mixpanel name so filters align)
- [ ] No PII in the event name itself (event names are visible in the dashboard)
- [ ] Cross-check the event isn't already there (`grep -R "sendToClarity: true" apps/mobile/lib`)
- [ ] Call site uses `AnalyticsTracker.track` (or `trackWithUser`) with the flag, NOT `ClarityService().event` directly (unless it's Clarity-only like `Tab: ...`)

## Authoritative References

- Real seam: `apps/mobile/lib/core/services/clarity_service.dart` (`ClarityService` singleton + `ClarityNavigatorObserver`) — the ONLY file that imports `package:clarity_flutter`
- Init call site: `apps/mobile/lib/pages/main_navigation_page.dart` + each `apps/mobile/lib/flavors/<flavor>/pages/<flavor>_main_navigation_page.dart`
- Router observer wiring: each `apps/mobile/lib/flavors/<flavor>/routes/<flavor>_routes.dart`
- User-type tag: `apps/mobile/lib/bloc/user_profile/user_profile_bloc.dart` (`_onFetchUserProfile` → `Success` branch)
- Analytics fan-out: `apps/mobile/lib/core/analytics/analytics_tracker.dart` (the `sendToClarity` flag)
- Per-flavour project id: `apps/mobile/env/<flavour>-<env>.json` → `appSecretsJson.clarityKey`, surfaced as `AppConfig.instance.clarityKey`
- Remote-config kill-switch key (reserved): `RemoteConfigKeys.configClarity` (`config_clarity`)
- Package: `clarity_flutter: 1.4.3` in `apps/mobile/pubspec.yaml`
- SDK docs: https://learn.microsoft.com/en-us/clarity/mobile-sdk/overview
- Dashboard: https://clarity.microsoft.com/
- Related skills: [flutter-analytics](../flutter-analytics/SKILL.md), [flutter-env-config](../flutter-env-config/SKILL.md), [flutter-routing](../flutter-routing/SKILL.md), [flutter-state-bloc](../flutter-state-bloc/SKILL.md)
