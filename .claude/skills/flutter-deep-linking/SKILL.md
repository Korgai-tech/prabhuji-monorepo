---
name: flutter-deep-linking
description: Deep linking for apps/mobile (TAM-124) — two URL flavours over one pure parser (prabhuji:// custom scheme for internal use + https://<shareHost>/app/* App Links for shares), the Android manifest intent-filter pair with autoVerify=true, DeepLinkService as pure bookkeeping (router / auth / entitlement injected as function seams), the gate order (parse → not-logged-in park → not-Pro paywall + park → navigate), PendingIntentStore's one-intent-max contract with session vs persistent writes, Play Install Referrer for Android deferred deep linking on first install, and the "consume bypasses gate re-check" rule that prevents the paywall-loop bug, the replay trigger (router landing on /home — not a token, not the orchestrator), the Home-underneath navigation stack for every external arrival, and the on-device debugging workflow ([DEEPLINK] logcat trace). Use when adding a new deep-link target, changing the URL contract, wiring a share URL, or debugging "share tap opens the wrong screen / lands on Home / opens paywall twice / back exits the app / doesn't open the app."
user-invocable: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Flutter Deep Linking Skill

## Purpose

Give `apps/mobile` one predictable pipeline from a URL tap to a screen, whether the URL came from a share (App Link), a push notification (custom scheme), a Play Store deferred install (Install Referrer), or an in-app hand-off. TAM-124 landed the full flow — this skill captures WHY it looks the way it does so the next change doesn't reintroduce the paywall-loop or logged-out-share bugs the design was written to prevent.

> **2026-09-16 follow-up.** The logged-out share flow had never worked in production (13 logged-out `deep_link_received`, 0 `deep_link_replayed`). Four independent defects were found on a physical device and fixed; each is recorded below where it applies, under **Why**. If you are changing this pipeline, read [Debugging on a device](#debugging-on-a-device) first — two of the four were only findable from a real device log.

## When This Skill Applies

- Adding a new deep-link target (e.g., `prabhuji://event/<id>` / `https://.../app/event/<id>`)
- Changing the URL contract (path shape, query params, host)
- Wiring a share URL from a screen (Aarti, Books, Status, Horoscope, Ringtone, Wallpaper share buttons)
- Adjusting the auth / paywall gate for deep-link arrivals
- Debugging "share tap opens the wrong screen"
- Debugging "share tap opens the paywall, dismissing it opens it again forever"
- Debugging "share to WhatsApp shows a link that doesn't open the app"
- Debugging "logged-out user taps a link and lands on Home" / "the link is forgotten after login"
- Debugging "back from a shared screen exits the app"
- Onboarding a new host (staging → prod domain change)

## Composes With

- [flutter-routing](../flutter-routing/SKILL.md) — the `/app/*` redirect, the paywall-dispose hook, and the router-location listener that replays after login
- [flutter-auth](../flutter-auth/SKILL.md) — `AuthStore.changes` → `clearPendingIntent()` on logout. **Every `null` broadcast is read as a logout**, which is why the dio 401 handler must not clear an already-empty store (see flutter-auth)
- [flutter-async-safety](../flutter-async-safety/SKILL.md) — `DeepLinkService.dispose()` cancels the `app_links` subscription; every call site uses `unawaited(...)` where appropriate
- [flutter-secrets](../flutter-secrets/SKILL.md) — the `shareHost` is in `AppConfig` (per-env JSON), NOT a secret; per-env only so staging can point at a scratch domain later
- [flutter-analytics](../flutter-analytics/SKILL.md) — every deep-link intake fires `deep_link_received`; every gated arrival fires `deep_link_paywall_shown`; every replay fires `deep_link_replayed`

## Package Baseline

```yaml
# apps/mobile/pubspec.yaml
dependencies:
  app_links: ^7.2.1                           # URI intake (custom scheme + App Links)
  android_play_install_referrer: ^0.4.0       # Android deferred deep linking
  flutter_secure_storage: ^10.3.1             # PendingIntentStore backing store
```

`app_links` is the ONLY package that talks to the platform channels for URIs. Since 6.x its `uriLinkStream` **also re-emits the cold-start link**, so one tap arrives as both `cold_start` and `warm_resume` (visible as pairs in production analytics) — `handleUri` de-duplicates (see the gate). Do NOT add `uni_links` (deprecated), do NOT add `deep_link_navigator` etc. — `app_links` covers custom scheme + App Links + iOS Universal Links in one API.

## The URL Contract — Two Flavours, One Parser

Both flavours accept the same shape. One parser handles both so downstream code never branches on which scheme fired.

### `prabhuji://` — internal use only

```
prabhuji://<type>[/<id>][?ref=…]
```

Examples:
- `prabhuji://aarti/abc123`
- `prabhuji://horoscope/leo`
- `prabhuji://pro` (no id — opens paywall directly)

Used by: push notification payloads, `adb shell am start` for testing, in-app hand-offs, future app-to-app integrations. **Never share externally** — messaging apps silently swallow custom schemes and there's no install fallback.

### `https://<shareHost>/app/*` — for every external share

```
https://<shareHost>/app/<type>[/<id>][?ref=…]
```

Examples:
- `https://krutyug.ai/app/aarti/abc123`
- `https://krutyug.ai/app/horoscope/leo`
- `https://krutyug.ai/app/pro`

Used by: every share button in the app (Aarti share, Books share, Status share, etc.), landing pages, marketing campaigns. Opens the app directly via Android App Links (autoVerify) / iOS Universal Links.

`<shareHost>` is `AppConfig.instance.shareHost` — per-env, currently `https://krutyug.ai` for all envs but held per-env so staging can point at a scratch domain later.

### Path structure is IDENTICAL across schemes

`prabhuji://aarti/abc123` and `https://krutyug.ai/app/aarti/abc123` both parse to `AartiDeepLink(audioId: 'abc123')`. This is intentional — the parser is one function; the caller never asks "which scheme was it".

## The Parser — Pure, Never Throws

`lib/core/deep_link_parser.dart` — `parseDeepLink(Uri) → DeepLinkTarget`. Sealed hierarchy so downstream `switch`es are exhaustive at compile time.

```dart
sealed class DeepLinkTarget {
  final Map<String, String> attribution;   // verbatim query params — analytics only
  String get typeSlug;
}

final class AartiDeepLink extends DeepLinkTarget {
  final String audioId;
  @override String get typeSlug => 'aarti';
}
// … StatusDeepLink, MantraDeepLink, BookDeepLink, HoroscopeDeepLink,
//   RingtoneDeepLink, WallpaperDeepLink, PaywallDeepLink, HomeDeepLink,
//   PaymentReturnDeepLink, UnknownDeepLink
```

**Rules:**

- **The parser NEVER throws.** Every failure mode (unknown type, missing id, malformed scheme, bare URI) collapses to `UnknownDeepLink(reason: '…')`. Callers get a routable target without a try/catch tax on the happy path.
- **The parser NEVER touches Flutter, IO, or state.** Pure `Uri → target`. Unit-testable in isolation, no widget binding needed.
- **`attribution` is analytics-only.** Query params (`?ref=<sharer_id>`, `?utm_source=whatsapp`, …) are captured verbatim on every target but NEVER used for routing. A malicious `?ref=<garbage>` can never influence which screen opens.
- **Adding a new type** = add a `final class` extending `DeepLinkTarget` + a case in the parser's `switch(type)` + a case in `DeepLinkService.pathForTarget` + a case in `share_url_builder`'s `_typeAndId`. That's it. The Dart analyzer will fail every unhandled `switch` in the codebase until you cover them all. (Until 2026-09 `mantra` had no target at all — mantra shares fell back to the server's `prabhuji://` URL and any tap that did arrive parsed as `UnknownDeepLink` → `/home`.)

### `absoluteAppLink` — the router hands you an ABSOLUTE uri

`GoRouterState.uri` for a platform-delivered App Link is already absolute (`https://krutyug.ai/app/aarti/<id>`, go_router 17.3). The `/app/*` redirect used to prefix `shareHost` onto it, producing `https://krutyug.aihttps//krutyug.ai/app/…`, which parses as `UnknownDeepLink` — so **every** App Link cold start was redirected to `/home`, logged in or not. Always normalise through `absoluteAppLink(state.uri, shareHost: …)`, which only adds the host to a relative location.

## Android Manifest — Two Intent-Filters, One Activity

`apps/mobile/android/app/src/main/AndroidManifest.xml` — the MainActivity has three intent-filters total: LAUNCHER (opening from home screen), custom scheme (`prabhuji://`), and App Links (`https://krutyug.ai/app/*`).

```xml
<!-- Custom scheme: unverified by design; OS opens without a chooser -->
<intent-filter>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="prabhuji"/>
</intent-filter>

<!-- App Links: OS verifies the SHA-256 fingerprint against assetlinks.json -->
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="https"
          android:host="krutyug.ai"
          android:pathPrefix="/app/"/>
</intent-filter>
```

**Path prefix MUST be `/app/`** (with trailing slash) — we don't want to claim the marketing site's other paths like `/privacy.html`, `/terms.html`.

### `assetlinks.json` on the share host

The host at `<shareHost>` MUST serve `/.well-known/assetlinks.json` listing every signing key an installed APK can carry (upload key, debug key, Play app-signing key). **The live file and the meaning of each fingerprint are recorded in [`docs/DEEP-LINK-HOSTING-CONTRACT.md`](../../../docs/DEEP-LINK-HOSTING-CONTRACT.md)** — edit that copy, never an older one; dropping a fingerprint silently breaks App Links for every install signed with that key.

The OS fetches this at install time. If it doesn't match, tapping a `krutyug.ai/app/*` link opens the browser instead of the app — **the failure is silent to the user**. Check and force re-verification:

```bash
adb shell pm get-app-links com.prabhuji.ai.debug      # expect: krutyug.ai: verified
adb shell pm verify-app-links --re-verify com.prabhuji.ai
```

`Content-Type: application/json; charset=utf-8` is accepted (production serves it and verifies).

### iOS (deferred until `GoogleService-Info.plist` lands)

Universal Links + associated domains — configured in `Info.plist` + Apple App Site Association JSON on the same host. Not currently wired; add when iOS ships.

## `DeepLinkService` — Pure Bookkeeping, Function-Seam Wiring

`lib/core/deep_link_service.dart`. Owns URI intake and the gate decision tree, but does NOT own the router or Riverpod. Callers inject function seams so the SAME instance is unit-testable without a live navigator or platform channel.

```dart
DeepLinkService({
  required PendingIntentStore pendingIntentStore,
  required bool Function() isLoggedIn,
  required bool Function() isProUser,
  required void Function(List<String> stack) navigateToStack,   // go first, push the rest
  required void Function() pushPaywall,
  required void Function(String name, Map<String, Object?> properties) trackEvent,
  String Function()? currentLocation,                         // payment-return branch
  void Function(Map<String, String> attribution)? onPaymentReturn,
  Future<Uri?> Function()? initialUri,     // seam over app_links
  Stream<Uri>? uriStream,                  // seam over app_links
  InstallReferrerReader? installReferrerReader,
  Future<bool?> Function(String key)? readBool,               // install-referrer flag
  Future<void> Function(String key, bool value)? writeBool,
})
```

Production wiring (`main.dart`, `_MobileAppState.initState`): `navigateToStack: (stack) => applyNavigationStack(router, stack)`.

Everything the service needs from the app is a function or an interface. That's why the parser is pure, the store is behind an abstract `PendingIntentStorage`, and the platform channels are behind two callbacks.

## The Gate Order — Iron-Clad

Applied to EVERY URI receipt (cold start, warm resume, the router's `/app/*` handoff):

```
same URI within 5s?               → drop silently (no analytics, no navigation)
parse → track deep_link_received
UnknownDeepLink?                  → navigate(['/home']); done
PaymentReturnDeepLink?            → onPaymentReturn + go('/paywall') unless there; done
                                    (bypasses BOTH gates — it IS the paywall's resume)
not logged in?                    → pendingIntent.write(uri)  (persistent); done
                                    (router redirect sends them to /splash → login;
                                     replayed when they land on /home — see below)
not Pro AND not HomeDeepLink?     → track deep_link_paywall_shown
                                    + pendingIntent.write(uri, sessionOnly: true)
                                    + pushPaywall()
                                    (paywall dispose replays it — dismiss OR success,
                                     per TAM-124 #PATH_DECISION)
logged in AND (Pro OR home)       → navigate(stackForTarget(target))
```

**Why the de-dupe:** an App Link cold start is delivered twice — Flutter's route-information provider (→ the router redirect, which hands it to the service as `source: 'router'`) and `app_links`. Without it, whichever arrives second re-runs the gate and navigates on top of the first.

### The router's `/app/*` redirect

`router.dart`. Its only jobs are to get go_router past "no route for location" and hand the URL over — the visible routing is the service's:

1. `absoluteAppLink(state.uri, …)` → `parseDeepLink`.
2. **Logged out → `/splash`, always — checked FIRST**, before any target-based fallback. `/home` is an authenticated screen: sending a logged-out user there mounts the feed with no Bearer, its 401s broadcast a logout, and that wipes the intent parked a moment earlier (observed on device).
3. `UnknownDeepLink` → `/home`.
4. Service registered → post-frame `service.handleUri(uri, source: 'router')` and return the stack **base**. Post-frame because `handleUri` navigates synchronously for a Pro user, and navigating inside a redirect is not allowed.
5. Service not registered yet (it registers asynchronously, behind `SharedPreferences`) → return the target path itself, so a link is never dropped.

**Non-negotiable in this order.** Rearranging (e.g., checking Pro before logged-in) breaks the analytics + routing invariants. Every branch fires a distinct analytics event so funnel dashboards can tell replayed-after-onboarding from replayed-after-paywall from direct-navigate.

## Navigation Stack — Home Underneath Every External Arrival

`lib/core/navigation_stack.dart`. Module routes are registered **flat** in `router.dart` (`/mantras/audio/:itemId` is top-level, not a child of `/mantras`), so a bare `go(target)` leaves a one-entry stack: `canPop` is false and system back **exits the app**. In-app taps never hit this because they `push` over the live shell (`openHomeDestinationPath`); only external arrivals did.

```dart
navigationStackFor('/mantras/audio/x')   // ['/home', '/mantras/audio/x']
navigationStackFor('/status?highlight=a') // ['/status?highlight=a']  — a shell branch
navigationStackFor('/')                   // ['/home']                — notification payload's home
applyNavigationStack(router, stack)       // go(stack.first); push(each of the rest)
DeepLinkService.stackForTarget(t)         // navigationStackFor(pathForTarget(t))
```

- **Shell branches are selected, never pushed** (`kShellBranchRoutes`: `/home`, `/chat`, `/status`, `/downloads`, `/horoscope`). Pushing a branch route stacks a second shell over the first; the shell's own `PopScope` already sends back → Home tab. (`kShellBranchPaths` in `features/home/destinations.dart` is a narrower, Home-CTA-only subset — don't use it here.)
- **Two entries, not three.** go_router builds every page in the stack immediately, not lazily on pop — inserting the module home (`/home` → `/mantras` → item) would mount its bloc and fire its feed request on every deep-link open.
- **Same-frame `go` + `push` is fine** — both apply synchronously to the match list. `go` resets first, so re-arriving on the same link never piles up duplicates.
- **Used by every external arrival:** `handleUri`, `consumePendingIntent`, and push-notification taps (`main.dart` `_onTap` → `navigationStackFor(resolveNotificationRoute(...))`). **Not** by payment-return (`['/paywall']`, a bare replace, so nothing is inserted between the paywall and what it pops back to mid-poll).
- `pathForTarget` still exists (the redirect's fallback, and the one target→path mapping). `stackForTarget(t).last == pathForTarget(t)` is asserted in tests — never let the two drift.

## Replay — When a Parked Intent Is Consumed

Three hooks call `consumePendingIntent()`. `consumeOnce` is serialised, so any overlap is safe — whichever runs first wins, the rest get `null`.

| Hook | Where | Consumes | Covers |
|---|---|---|---|
| **Router landed on `/home`** | `lib/core/deep_link_replay.dart` → `wireDeepLinkReplayOnHome`, wired in `_MobileAppState.initState` right after the service registers | `persistentOnly: true` | Logged-out share after login; install-referrer replay |
| **Paywall disposed** | `router.dart` `_PaywallDeepLinkHook` → `_schedulePendingIntentReplay` | anything | The non-Pro interstitial (session intent) |
| **`/splash` resolves to home** | `router.dart` redirect → `_schedulePendingIntentReplay` | anything | Restored session at cold start |

### Why the trigger is "landed on `/home`"

Two more obvious signals were tried first. Both were wrong:

- **`AuthStore.changes` (a token appeared)** — a token exists from OTP-verify onward, the *start* of onboarding. It raced the OTP screen's own `context.go(...)` (a returning user's target was overwritten by `/home`), and for a new user it won outright: they skipped name entry **and** the onboarding paywall, and since replay bypasses the gate, a free account got Pro content.
- **`OrchestratorRouteDecided(RouteTarget.home)`** — only ever emitted for a **Pro** user. `OnboardingStep.paywallDismissed` is dead code: `paywall_close.dart` calls `context.go('/home')` directly and never tells the orchestrator. Free accounts — most users — never replayed.

Landing on `/home` is true in every path (Pro or free, new or returning, paywall shown or skipped) because it is where onboarding ends.

### The listener's traps (all verified against go_router 17.3)

- **`uri.path` is not "what's on screen".** A `push` keeps the location at the base: the paywall pushed over home reports `uri=/home` with two matches. The check is `uri.path == '/home' && !delegate.canPop()`.
- **`canPop()` is stale at notification time** — it reports the *previous* state (a push notifies `canPop=false`, a pop notifies `canPop=true`). So the listener only checks `isLoggedIn()`, and the real decision runs in a post-frame callback. Gating the scheduling on the stale read silently drops the paywall-dismiss case.
- **`addPostFrameCallback` does not schedule a frame.** Call `ensureVisualUpdate()` after it, or an idle moment strands the check.
- **Several notifications can land in one frame** (seen during login). Only one check may be pending (`checkScheduled`), or each queues its own callback and the target is navigated to twice.
- **`persistentOnly: true` is load-bearing.** The paywall interstitial parks a *session* intent with home underneath the paywall. If this hook could take it, it would navigate past the paywall — a gate replay is designed to bypass only after it has run.

## `PendingIntentStore` — One Intent Max, Consumed Once

`lib/core/pending_intent_store.dart`. Persists a single "pending" deep-link URI across process boundaries (app kill, reboot, onboarding, paywall interstitial).

### Contract

- **At most ONE intent at a time.** Every `write()` clears both the session cache AND the persistent store first. There is no queue.
- **`consumeOnce()` returns AND clears in the same call.** Even for a malformed / stale payload, the read clears — prevents replay loops.
- **`consumeOnce()` is serialised.** The persistent path awaits a secure-storage read before its delete, so two overlapping consumes used to both get the URI (two navigations, two `deep_link_replayed` events 40ms apart, on device). The lock is created **per call**, not seeded with a pre-completed future at construction — a future from another zone schedules its continuations there, which hangs under the widget-test binding.
- **`consumeOnce(persistentOnly: true)`** takes only the stored intent and leaves a session intent untouched (see the replay table for who owns which).
- **Session vs persistent** — `write(uri, sessionOnly: true)` holds in memory only (dies with the isolate); `write(uri)` persists via `flutter_secure_storage`. The distinction matters:

| Flow | `sessionOnly` | Why |
|---|---|---|
| Play Install Referrer read | `false` (persistent) | Play Store's install process restarts the app several times before onboarding starts; must survive |
| Logged-out share replay | `false` (persistent) | User signs up, may background/kill mid-flow; must survive |
| **Paywall interstitial replay** | `true` (session) | User kills app mid-paywall, opens days later — should NOT resurrect a stale share tap |

The `sessionOnly` choice is what stops "user tapped a share three days ago, paid today, and got teleported into random content."

### Stale-after — 24h

Persistent writes older than 24h return `null` from `consumeOnce()`. Prevents month-old shares from firing on the next launch.

## Consume BYPASSES the Gate Re-Check

`consumePendingIntent()` navigates DIRECTLY — it does NOT re-run the auth/entitlement check. This is deliberate:

> **Post-paywall-pop replay** — the interstitial already ran (that's how this pending intent got written). Re-running the gate here would push `/paywall` a second time, its dispose hook would consume the pending intent again, and we'd loop forever (dismiss → replay → paywall → dismiss → replay → …).

Server-side entitlement still enforces via 403 on the fetch — if a non-Pro user reaches Book contents through a replayed intent, the contents endpoint returns 403 and the target screen surfaces its OWN paywall push. That's a separate, screen-owned gate.

**Never add a "safety" auth/Pro check inside `consumePendingIntent`.** It reads as reasonable and breaks the invariant.

## Android Deferred Deep Linking — Play Install Referrer

`lib/core/install_referrer_reader.dart`. The flow:

1. User taps `https://krutyug.ai/app/aarti/xyz` without the app installed
2. Landing page's JS redirects to `https://play.google.com/store/apps/details?id=com.prabhuji.ai&referrer=<encoded /app/aarti/xyz>`
3. User installs from Play Store
4. On FIRST launch, `AndroidPlayInstallReferrer.installReferrer` recovers `/app/aarti/xyz`
5. `DeepLinkService._consumeInstallReferrerOnce()` reconstructs the full URL and writes it to `PendingIntentStore` (persistent)
6. Onboarding completes and the user lands on `/home` → the home-landing hook fires `consumePendingIntent(persistentOnly: true)` → user lands on the shared content, Home underneath

The landing page passes `pathname + search`, so the referrer can carry `?ref=…`; the reader URL-decodes if needed and accepts only `/app/…`.

**Rules:**

- **Once-in-lifetime** — the referrer stays install-scoped forever; re-reading it would replay the deep link on every launch. Guarded by the service's own `SharedPreferences` flag `install_referrer_consumed_v1` (via the `readBool`/`writeBool` seams; the referral sync service keeps its own flag). The flag is flipped as soon as a non-empty referrer is read, **before** the `/app/` shape checks, so a malformed referrer isn't retried on every cold start.
- **Android only** — the plugin no-ops but returns garbage on iOS / desktop. `if (!Platform.isAndroid) return null;` is the first line.
- **Best-effort** — never blocks boot. Wrapped in try/catch; failure logs and moves on.
- **Only `/app/*` paths accepted** — the referrer might be a UTM campaign string or empty on organic installs. Only referrer strings that decode to `/app/<something>` are treated as deep links.

## Analytics — Three Events

| Event | Fires when | Key props |
|---|---|---|
| `deep_link_received` | Every URI intake after de-dupe (before gate) | `source: cold_start|warm_resume|router`, `type`, `target_id`, `…attribution` |
| `deep_link_paywall_shown` | Non-Pro deep-link arrival, gated to `/paywall` | `type` |
| `deep_link_replayed` | Pending intent consumed post-gate | `uri`, `type`, `…attribution` |

The three form a funnel:
- `deep_link_received - deep_link_replayed` = users who bounced somewhere in the gate
- `deep_link_paywall_shown` divided by `deep_link_received` = paywall-interstitial rate
- `deep_link_replayed` where source=cold_start = fresh-install / relaunch replay

Reading the funnel: `deep_link_received` from a device with no `user_id` and no later `deep_link_replayed` does **not** by itself prove the replay is broken — check whether that session ever logged in (`otp_screen_viewed`). In the 2026-09 investigation none had, so the data could not distinguish "broken" from "abandoned"; only a device log could.

Naming and property catalogue live in [`docs/ANALYTICS-FLUTTER-GUIDE.md`](../../docs/ANALYTICS-FLUTTER-GUIDE.md). See [flutter-analytics](../flutter-analytics/SKILL.md).

## Logout — Clear the Pending Intent

`main.dart` subscribes to `AuthStore.changes`; on transition to `null` (logout):

```dart
if (serviceLocator.isRegistered<DeepLinkService>()) {
  unawaited(serviceLocator<DeepLinkService>().clearPendingIntent());
}
```

**Non-negotiable.** Without this, a share tap captured for user A can fire in user B's session on the same device. TAM-124's specific bug fix.

**The flip side:** this listener runs on *every* `null` broadcast, and `AuthStore.clear()` broadcasts `null` even when the store was already empty. Anything that calls `clear()` while logged out erases a parked intent. The dio 401 handler did exactly that for unauthenticated requests until 2026-09 — it now clears only when a token was actually sent (see [flutter-auth](../flutter-auth/SKILL.md)). Keep it that way.

## Building Share URLs

`lib/core/share_url_builder.dart`. Every share button in the app composes:

```
<AppConfig.instance.shareHost>/app/<type>/<id>[?ref=<sharer_user_id>]
```

Never hand-build `prabhuji://…` for a share — messaging apps swallow custom schemes silently. Always the HTTPS App Link form, via `buildShareUrl(<Target>(...))`. **Do not prefer a server-supplied `deepLink` / `deepLinkUrl`** — the API still sends the custom scheme (that is how wallpaper and mantra shares were broken until 2026-09).

Current share call sites: home feed card, aarti player, mantras player, ringtone preview, wallpaper preview (HTTPS link); status (a rendered file, no link — by design); kuldevta (the plain Play Store URL — by design).

Never hand-write the URL in a feature — use `share_url_builder`. Keeps the `shareHost` reads centralised so a per-env change is one line.

## Testing

Every unit-test seam is in the constructor:

```dart
final store = FakePendingIntentStore();
final service = DeepLinkService(
  pendingIntentStore: store,
  isLoggedIn: () => true,
  isProUser: () => false,
  navigateToStack: (stack) => stacks.add(stack),
  pushPaywall: () => paywallPushes++,
  trackEvent: (name, props) => events.add((name, props)),
  initialUri: () async => null,
  uriStream: const Stream.empty(),
  installReferrerReader: NoOpInstallReferrerReader(),
);

await service.handleUri(Uri.parse('https://krutyug.ai/app/aarti/abc'), source: 'test');

expect(paywallPushes, 1);
expect(store.written.first.toString(), 'https://krutyug.ai/app/aarti/abc');
```

The parser has its own unit tests — one target per test, plus edge cases (missing id, unknown type, malformed URI, bare `prabhuji://`).

### Router-level behaviour — use a real `GoRouter`, not the app's

Stack depth, the home-landing trigger and the logged-out flow are tested against a small `GoRouter` with the **same shape** as `router.dart` (indexed shell + flat top-level routes): `test/support/replay_router_harness.dart`. `routerProvider` needs the full DI graph and its screens fire real repository calls on mount. Reference tests:

- `test/navigation_stack_router_test.dart` — pins the original bug (`go` alone → depth 1, `canPop` false) and pop-returns-to-Home
- `test/deep_link_login_replay_test.dart` — every trigger condition, including two route changes in one frame
- `test/deep_link_logged_out_flow_test.dart` — real service + store + applier + router, walking tap → login → paywall → `go('/home')` (exactly what `paywall_close.dart` does)
- `test/deep_link_root_cause_test.dart` — the absolute-uri redirect bug and the no-token 401 clear, using inputs copied from a device log

**A regression test must fail without its fix.** Toggle the fix off and run it once — two tests written during the 2026-09 work passed with the fix removed (a synthetic stream that proved the wiring but not the premise; `router.refresh()`, which go_router drops as an identical configuration).

Widget-test traps met here: `tester.pump()` with no widget tree renders no frame (so post-frame callbacks never run — `pumpWidget` something first); never `await Future.delayed` inside `testWidgets` (fake-async deadlock).

## Debugging on a Device

Unit tests passed through three rounds of wrong fixes in 2026-09; the device log found the cause in one. Do this **before** changing code:

```bash
adb logcat -c
# reproduce (a real tap from a messenger/notes app — see note below), then:
adb logcat -d -v time -s flutter | grep -E 'DEEPLINK|Dio|screen_viewed|route_decided'
```

Debug builds trace every checkpoint with a `[DEEPLINK]` prefix: `router redirect /app/*` → `handleUri` → `PARKED …` / `NAVIGATE` → `home-trigger check` → `consumePendingIntent(...) -> <uri | NOTHING PARKED>` → `REPLAY stack=[…]` → `applyNavigationStack`. The missing line tells you the stage. Read the `Dio` lines alongside — `token=NONE` requests and `clearing AuthStore` are how both 2026-09 root causes showed up.

- **`adb shell am start -a VIEW -d <url> <package>` skips App Link verification** because it names the package. Fine for exercising the app; useless for proving the link opens the app. Use a real tap plus `pm get-app-links`.
- `adb shell input tap` may be blocked on some OEMs (Xiaomi needs "USB debugging (Security settings)") — ask the tester to tap.
- The ClickHouse warehouse (`production.events`) holds the funnel events, but check `max(event_time)` first — ingestion has lagged by weeks.

## Anti-Patterns

- **Sharing a `prabhuji://` URL externally.** Messaging apps swallow custom schemes; no fallback. Always the HTTPS form for shares.
- **Adding a "safety" auth check inside `consumePendingIntent`.** Causes the paywall infinite loop. Trust the gate that ran when the intent was written.
- **Routing based on `attribution` / query params.** Attribution is analytics-only. A malicious `?ref=<garbage>` should NEVER influence which screen opens.
- **Reading the Install Referrer without the "already consumed" flag.** Replays the deep link on every app launch forever.
- **Persistent-writing the paywall-interstitial pending intent.** User pays days later, gets teleported into random content from a stale share.
- **Session-writing the logged-out-share pending intent.** User backgrounds during onboarding, comes back, intent is gone.
- **Skipping `clearPendingIntent()` on logout.** User A's tap fires in user B's session on the same device.
- **Adding a queue of pending intents.** The design is one-at-a-time. A queue reads as harmless and creates ordering bugs no one can reproduce.
- **Autoverify=false on App Links.** Users get the browser chooser instead of your app. Silent UX failure.
- **Claiming a broader path than `/app/*`.** You'll swallow marketing-site URLs.
- **`go(target)` for an external arrival.** Flat routes → one-entry stack → back exits the app. Use `applyNavigationStack(navigationStackFor(path))`.
- **Replaying on `AuthStore.changes` or on the orchestrator's home decision.** See "Why the trigger is landed on /home".
- **Sending a logged-out user to `/home` for any reason** (including an unparseable link). Its 401s wipe the parked intent.
- **Assuming `GoRouterState.uri` is relative.** Use `absoluteAppLink`.
- **Letting the home-landing hook consume session intents.** It would skip the paywall interstitial.

## Common Mistakes

- **"Share tap opens the browser, not the app"** — `assetlinks.json` doesn't match the installed APK's SHA-256 fingerprint. Verify: `adb shell pm verify-app-links --re-verify com.prabhuji.ai`. Common after key rotation, Play Signing enrollment, or a new release track.
- **"Share tap opens paywall, dismissing opens it again forever"** — someone added an auth/Pro re-check inside `consumePendingIntent`. Remove it. Consume BYPASSES the gate on purpose.
- **"WhatsApp doesn't make the URL tappable"** — sharing a `prabhuji://` URL. Use the HTTPS form.
- **"Fresh install doesn't route to the shared content"** — Install Referrer flag was tripped in a previous test cycle. Uninstall + reinstall to reset (or reset the SharedPreferences key `install_referrer_consumed_v1`).
- **"Second tap in the same session does nothing"** — `consumeOnce()` cleared the store on the first tap. Correct behaviour; if the intent needs to replay, don't consume it yet.
- **"User B sees user A's shared aarti after logout+login"** — `clearPendingIntent()` not wired on the logout path. Check `main.dart`'s `AuthStore.changes` subscriber.
- **"Logged-out user taps a link and lands on Home"** — the `/app/*` redirect is sending them there: check it normalises with `absoluteAppLink` and runs the logged-out check first. Symptom in the log: `GET /home/feed token=NONE` right after the redirect line.
- **"Link parked, but nothing happens after login"** — look for `clearing AuthStore` after `PARKED` (an unauthenticated 401 broadcast a logout), and for `home-trigger check` lines (none → the listener isn't wired or `isLoggedIn` is false; present but `onHome=false` → the user isn't on a bare `/home`).
- **"Back from a shared screen exits the app"** — something navigated with a bare `go`; route it through `navigationStackFor`.
- **"Shared target opens twice / `deep_link_replayed` fires twice"** — the listener's `checkScheduled` coalescing or the store's per-call lock was removed.
- **`DeepLinkService not registered`** — service is registered in `main.dart` inside `_MobileAppState.initState`, NOT in `configureLocator` — because it needs Riverpod's `ref` + the router. Widget tests that don't wire it are fine (deep-link paths are guarded with `isRegistered<DeepLinkService>()`).

## Checklist — Adding a New Deep-Link Target

- [ ] New `final class <Name>DeepLink extends DeepLinkTarget` in `deep_link_parser.dart` with any required id fields
- [ ] Case added to `parseDeepLink`'s `switch(type)` — handle missing-id fallback → `UnknownDeepLink`
- [ ] Case added to `DeepLinkService.pathForTarget` mapping the target to a router path (the stack follows automatically via `navigationStackFor` — only touch `kShellBranchRoutes` if the target IS a new bottom-nav branch)
- [ ] Case added to `share_url_builder`'s `_typeAndId`
- [ ] Router path exists (check `<feature>_routes.dart` if applicable)
- [ ] Analytics attribution: pick up `target_id` in `DeepLinkService.handleUri`'s tracker payload
- [ ] `ShareCopy.messageByType` updated if this is user-shareable (share button copy)
- [ ] Path listed in `docs/DEEP-LINK-HOSTING-CONTRACT.md` §2 (the live landing page is a single catch-all, so no web deploy is needed for a new type)
- [ ] Test: `parseDeepLink` returns the correct target for the URL
- [ ] Test: `DeepLinkService.handleUri` routes correctly for logged-in Pro / non-Pro / logged-out scenarios
- [ ] Test: `DeepLinkService.stackForTarget` — Home underneath unless the target is a shell branch
- [ ] Test the raw ADB path: `adb shell am start -a android.intent.action.VIEW -d 'prabhuji://<type>/<id>' com.prabhuji.ai.debug`
- [ ] Test the App Link path **with a real tap** logged out, logged in free, and logged in Pro; watch the `[DEEPLINK]` trace

## Authoritative References

- Real implementations:
  - `apps/mobile/lib/core/deep_link_service.dart` — gate, de-dupe, `stackForTarget`
  - `apps/mobile/lib/core/deep_link_parser.dart` — targets, `parseDeepLink`, `absoluteAppLink`
  - `apps/mobile/lib/core/navigation_stack.dart` — `navigationStackFor`, `applyNavigationStack`, `kShellBranchRoutes`
  - `apps/mobile/lib/core/deep_link_replay.dart` — the home-landing replay trigger
  - `apps/mobile/lib/core/pending_intent_store.dart`
  - `apps/mobile/lib/core/install_referrer_reader.dart`
  - `apps/mobile/lib/core/share_url_builder.dart`
  - `apps/mobile/lib/core/router.dart` — `/app/*` redirect, `_PaywallDeepLinkHook`
- Manifest: `apps/mobile/android/app/src/main/AndroidManifest.xml` — two intent-filters + LAUNCHER
- Contract doc: `docs/DEEP-LINK-HOSTING-CONTRACT.md` — live `assetlinks.json`, landing page, and per-situation behaviour with how each was verified
- Original ticket: `specs/TAM-124-app-sharing-deep-links.md` (see its post-implementation notes)
- Related skills: [flutter-routing](../flutter-routing/SKILL.md), [flutter-auth](../flutter-auth/SKILL.md), [flutter-analytics](../flutter-analytics/SKILL.md), [flutter-async-safety](../flutter-async-safety/SKILL.md), [flutter-secrets](../flutter-secrets/SKILL.md), [flutter-env-config](../flutter-env-config/SKILL.md), [frontend-patterns](../frontend-patterns/SKILL.md)
