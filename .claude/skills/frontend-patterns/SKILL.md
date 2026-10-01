---
name: frontend-patterns
description: Frontend patterns index for the Flutter app (apps/mobile). Router into flutter-modular-architecture / flutter-state-bloc / flutter-async-safety / flutter-testing / flutter-ui / flutter-networking / flutter-routing / flutter-env-config / flutter-secrets / flutter-dependencies / flutter-analytics / flutter-responsive-layout / flutter-auth / flutter-deep-linking / flutter-push-notifications. Use when building screens, wiring state, adding routes, calling APIs, wiring cold-start infra (config / secrets / DI / analytics / auth), writing tests, adding deep links, or configuring push notifications.
user-invocable: false
allowed-tools: Read, Grep, Glob
---

# Frontend Patterns Skill

## Purpose

Ensure consistent frontend development in `apps/mobile`:

- **Stack** — Flutter: `flutter_bloc` (state), `dio` (network), `go_router` (routing), `get_it` (DI, exposed as `serviceLocator`), per-env JSON via `AppConfig`, gitignored `Secrets`, generated OpenAPI models.
- **This file is a router.** Detail lives in focused skills — invoke them directly rather than reading Flutter guidance here.

**Cold-start / infra (read together before touching `main()`):**

- [flutter-env-config](../flutter-env-config/SKILL.md) — `AppConfig` singleton, `env/<staging|preprod|prod>.json`, `--dart-define=ENV=` selection, local-dev "edit env/staging.json" workflow.
- [flutter-secrets](../flutter-secrets/SKILL.md) — gitignored `env/prabhujiSecrets.json`, `REPLACE_ME_*` placeholder gate, CI release-build injection.
- [flutter-dependencies](../flutter-dependencies/SKILL.md) — `serviceLocator` (not `getIt`), `configureLocator`, singleton/lazy/factory lifetimes, Bloc interop, legacy Riverpod bridge.
- [flutter-analytics](../flutter-analytics/SKILL.md) — one seam over Amplitude + Firebase + Meta; scoping rules; routes to `docs/ANALYTICS-FLUTTER-GUIDE.md`.

**Feature work:**

- [flutter-modular-architecture](../flutter-modular-architecture/SKILL.md) — feature-first layout, dependency direction, when-to-split, when-NOT-to-Melos.
- [flutter-state-bloc](../flutter-state-bloc/SKILL.md) — Cubit/Bloc, sealed states, scoped rebuilds. **New code: Bloc only; no Riverpod outside `lib/state/providers.dart`.**
- [flutter-ui](../flutter-ui/SKILL.md) — widget composition, `const`, `RepaintBoundary`, `ListView.builder`, dispose audit, `leak_tracker`, Semantics.
- [flutter-responsive-layout](../flutter-responsive-layout/SKILL.md) — SafeArea, Flexible/Expanded, LayoutBuilder vs MediaQuery, viewInsets (keyboard), textScaler, AspectRatio/FractionallySizedBox/FittedBox, RenderFlex-overflow fix menu. **Mandatory before shipping any screen.**
- [flutter-networking](../flutter-networking/SKILL.md) — **`dio` + interceptors**, `{success, message, data}` envelope, `Result<T>` / `AppError`, repositories, OpenAPI codegen chain, ADB log viewing.
- [flutter-routing](../flutter-routing/SKILL.md) — one long-lived `GoRouter`, `refreshListenable`, auth `redirect`, `StatefulShellRoute.indexedStack` for bottom nav, `context.push` vs `context.go`, deep links.

**Quality / correctness (compose with everything above):**

- [flutter-async-safety](../flutter-async-safety/SKILL.md) — `if (!mounted) return;` after every `await` in a State, dispose audit, `unawaited(...)` rules, Bloc `isClosed` guard. Prevents "setState after dispose" / "Looking up a deactivated widget's ancestor" / "emit after close" crashes.
- [flutter-testing](../flutter-testing/SKILL.md) — `tester.takeException()` (NOT `FlutterError.onError` override — deadlocks the binding for 10 min per hang), `dart_test.yaml` global timeout, hand-rolled fakes, repository-layer HTTP stubbing.

**Cross-cutting integrations (subscribe to the auth bus / touch platform channels):**

- [flutter-auth](../flutter-auth/SKILL.md) — `AuthStore` (hydrated JWT cache) + `AuthStore.changes` as the single event bus for auth transitions; dio 401 `errorCode` gate; strict logout ordering (bearer-dependent steps BEFORE `AuthStore.clear`).
- [flutter-deep-linking](../flutter-deep-linking/SKILL.md) — TAM-124: `prabhuji://` custom scheme + `https://<shareHost>/app/*` App Links over one pure parser; `PendingIntentStore` with session vs persistent writes; Play Install Referrer for Android deferred deep linking; consume BYPASSES gate re-check.
- [flutter-push-notifications](../flutter-push-notifications/SKILL.md) — FCM with split `FirebaseTokenSync` / `FirebaseNotifications`; top-level `@pragma('vm:entry-point')` background handler; three tap paths; POST_NOTIFICATIONS after login; token dedupe; logout DELETE BEFORE `AuthStore.clear`.

## When This Skill Applies

Invoke this skill when:

- Building a new screen, feature module, or route in `apps/mobile`
- Wiring a Cubit/Bloc to UI
- Adding an API endpoint call, interceptor, or error mapping
- Implementing auth flows (login, protected routes, refresh)
- Adding forms with validation

**Figma-sourced UI routes further:** if the spec or task references a figma.com
frame and the change touches `apps/mobile`, load the `figma-flutter` skill and run
its six phases inside the SAME ticket — real theme tokens (Phase 1–3), exported
assets (Phase 4), and the Phase 6 rendered-comparison verdict are part of this
ticket's Definition of Done, never a follow-up ticket. A UI pattern in
`patterns_library/ui/` describes the screen's architecture; it does not narrow a
Figma-sourced ticket to "functional build only". The PR gate blocks
`gh pr create` until the verdict is in the spec's Evidence section.

## Mobile Patterns (Flutter) — Router

| Task | Skill |
|---|---|
| Adding a new env, config field, API base URL, or debugging "app can't reach my laptop" | [flutter-env-config](../flutter-env-config/SKILL.md) |
| Adding a new SDK key / secret, rotating one, onboarding a new dev clone, wiring CI release build | [flutter-secrets](../flutter-secrets/SKILL.md) |
| Registering a repository / service / store, wiring a new Bloc's dependencies, deciding singleton vs factory | [flutter-dependencies](../flutter-dependencies/SKILL.md) |
| Adding a new event / user property, debugging "why didn't this fire," reviewing a tracking PR | [flutter-analytics](../flutter-analytics/SKILL.md) |
| Designing a new feature module, `data`/`domain`/`presentation` split, when-to-Melos | [flutter-modular-architecture](../flutter-modular-architecture/SKILL.md) |
| Adding a feature Cubit/Bloc, sealed state, no-Riverpod rule, migration off Riverpod | [flutter-state-bloc](../flutter-state-bloc/SKILL.md) |
| Any `await` in a State, dispose audit, `unawaited` decisions, Bloc `isClosed` guard, debugging "setState after dispose" / "Looking up a deactivated widget's ancestor" | [flutter-async-safety](../flutter-async-safety/SKILL.md) |
| Building a screen, list, animation, dispose audit, accessibility | [flutter-ui](../flutter-ui/SKILL.md) |
| Adding a test, debugging a slow/hanging suite, reviewing a test PR, "why did /pre-pr take 30 min" | [flutter-testing](../flutter-testing/SKILL.md) |
| Wiring auth, JWT payload change, new `AuthStore.changes` listener, dio 401 handling, logout ordering, debugging "random 401 kicked me to /phone-choice" or "restored session bounces me out" | [flutter-auth](../flutter-auth/SKILL.md) |
| Adding a deep-link target, changing share URL contract, debugging "share tap opens paywall twice" / "share to WhatsApp doesn't open the app", Android App Links / assetlinks.json | [flutter-deep-linking](../flutter-deep-linking/SKILL.md) |
| Adding a push notification handler / route, changing the FCM channel, POST_NOTIFICATIONS timing, debugging "tap doesn't route" / "token stopped syncing" / "server row leaked on logout" | [flutter-push-notifications](../flutter-push-notifications/SKILL.md) |
| Making a screen work at 320–428 dp × 600–1200 dp, keyboard-open, landscape, text-scale 100–200% — SafeArea, Flexible/Expanded, MediaQuery, RenderFlex-overflow fixes | [flutter-responsive-layout](../flutter-responsive-layout/SKILL.md) |
| Adding a route, wiring auth `redirect`, bottom-nav shell, deep links, `push` vs `go` | [flutter-routing](../flutter-routing/SKILL.md) |
| New endpoint, **dio** interceptor changes, error mapping, codegen chain, viewing API logs over ADB | [flutter-networking](../flutter-networking/SKILL.md) |

## Cross-Cutting Rules (Live Above the Split)

### 1. All HTTP goes through the `dio` client — never `http` / `HttpClient` directly

The app has one configured `Dio` instance in `lib/core/dio_client.dart` with the auth, logging, and retry interceptors already wired. Repositories depend on it via `get_it`; screens depend on repositories via a Cubit/Bloc — screens never touch `dio` directly. Details: [flutter-networking](../flutter-networking/SKILL.md).

```dart
// ❌ Don't
final res = await http.get(Uri.parse('$apiUrl/users'));

// ❌ Don't (bypasses interceptors even though it's dio)
final res = await Dio().get('/users');

// ✅ Do — inject the configured client via a repository
class UsersRepository {
  UsersRepository(this._dio);
  final Dio _dio;
  Future<Result<List<User>, AppError>> list() async { /* ... */ }
}
2. API is the source of truth
After any route/schema change in apps/api, regenerate downstream artifacts in order: pnpm nx run api:openapi → api-client:generate → mobile:generate. NEVER hand-edit apps/mobile/lib/api/generated/** — it's overwritten. Full chain in root CLAUDE.md and flutter-networking.

3. One long-lived GoRouter
Do NOT rebuild the router when auth state changes — use refreshListenable so only redirect re-runs. Rules for push vs go, bottom-nav shell, and deep links live in flutter-routing.

Accessibility Checklist
 Focus / tap targets — minimum 48×48 dp touch target
 Color contrast — 4.5:1 minimum for text
 Semantic labels — every interactive widget wrapped in Semantics(label: …) or an equivalent widget that provides one (IconButton(tooltip:), TextField(decoration: InputDecoration(labelText:)))
 Image alt — Image(…, semanticLabel: …) on all non-decorative images
 Error states — form errors surfaced via InputDecoration.errorText (announced by TalkBack/VoiceOver automatically)
 Dynamic type — text scales with MediaQuery.textScalerOf(context); no fixed fontSize that ignores the user's system setting
Deeper widget-level accessibility patterns live in flutter-ui.

Responsive Design (Flutter)
This is a mobile-only app. The axis that varies most in production is HEIGHT (600 → 1200 dp), not width — and height is exactly where the c6527cf-class layout drift lives. Full detail + primitive selection: [flutter-responsive-layout](../flutter-responsive-layout/SKILL.md). This section is the five rules.

1. `SafeArea` wraps every screen root — no notch collisions, no home-indicator overlap.
2. Inside `Column`/`Row`, wrap variable-size children in `Flexible` (loose) or `Expanded` (tight). At most ONE `Expanded` per screen-level Column.
3. Never wrap the whole tree in `SingleChildScrollView` on screens with pinned bars — only the flex-fill zone scrolls.
4. Forms leave `resizeToAvoidBottomInset: true` (default) and put the form in a scrollable — or handle `MediaQuery.viewInsetsOf(context).bottom` manually.
5. Use narrow `MediaQuery` accessors (`sizeOf`, `viewInsetsOf`, `textScalerOf`, `orientationOf`), not `MediaQuery.of(context)`.

```dart
// Whole-screen orientation branch (rare — most screens don't need this).
final size = MediaQuery.sizeOf(context);
final isLandscape = size.width > size.height;

// Card / grid cell adapting to WHATEVER slot it's placed in.
LayoutBuilder(builder: (context, constraints) {
  return constraints.maxWidth < 240 ? const _Compact() : const _Wide();
});
```

Avoid `Platform.isAndroid` / `Platform.isIOS` for LAYOUT — that's for platform-behaviour differences (haptics, share sheet), not screen size. Foldables and tablets are Android too.

Verification: every non-trivial screen commits a [multi-size smoke test](../../../patterns_library/testing/flutter-multi-size-smoke.md) (3×3, no overflow). Screens with pinned bars / flex-fill zones also commit a [layout-intent test](../../../patterns_library/testing/flutter-layout-intent.md).

Common Mistakes to Avoid

// ❌ Hand-rolled http.get — bypasses auth header, retry, 401 handling
final res = await http.get(Uri.parse('$apiUrl/users'));

// ❌ Fresh Dio() — bypasses configured interceptors
final res = await Dio().get('/users');

// ❌ Rebuilding GoRouter on auth change (loses navigation state)
final router = GoRouter(...); // inside build() or after auth state watch

// ❌ Hand-editing lib/api/generated/** (overwritten on next codegen)

// ❌ Unwrapping the envelope wrong
return response.data;  // The payload is response.data['data'] — envelope is {success, message, data}

// Deeper Flutter DON'Ts live in the sub-skills:
// - flutter-state-bloc: emit after close, manual Cubit instantiation, one giant AppCubit
// - flutter-ui: _buildFoo() methods, forgetting dispose(), full-res image decode
// - flutter-networking: throwing past the repository, aggressive retry on 4xx, no timeouts

// ✅ Inject configured Dio via serviceLocator → repository → Cubit → screen
final repo = serviceLocator<UsersRepository>();

// ✅ Single router with refreshListenable; redirect handles auth
// ✅ Regenerate models: pnpm nx run mobile:generate
// ✅ Read the envelope: final users = (body['data'] as List).map(User.fromJson).toList();
Authoritative References
UI Patterns: patterns_library/ui/
authenticated-screen.md - Protected screen pattern
form-with-validation.md - Validated form pattern
paginated-list.md - Paginated list with ListView.builder
Mobile conventions: apps/mobile/CLAUDE.md
Mobile skills: flutter-modular-architecture · flutter-state-bloc · flutter-ui · flutter-networking · flutter-routing
Codegen chain: patterns_library/ci/contract-codegen-chain.md


## What changed vs the previous version

- **Dropped**: entire Admin SPA (React 19 + Vite) section — ~140 lines. dio doesn't exist on that side.
- **Added**: a new *Cross-Cutting Rules* block with **"all HTTP goes through the configured `dio` client"** as rule #1, plus a concrete DO/DON'T showing why `http.get` and `Dio()` are both wrong.
- **Rewrote** the accessibility checklist for Flutter primitives (`Semantics`, `InputDecoration.errorText`, `MediaQuery.textScalerOf`) instead of ARIA/keyboard nav.
- **Rewrote** the responsive-design snippet in Dart using `MediaQuery.sizeOf` / `LayoutBuilder`.
- **Rewrote** the DON'T block: added `Dio()` (fresh instance bypasses interceptors) and the envelope-unwrap mistake in Dart shape.
- **Updated** UI-patterns filenames to Flutter-shaped names (`authenticated-screen.md`, `paginated-list.md`) — swap for whatever names you actually use in `patterns_library/ui/`.

## Sub-skill files to also copy

The router table only works if these resolve. Cold-start / infra first, then feature work:

- [.claude/skills/flutter-env-config/SKILL.md](.claude/skills/flutter-env-config/SKILL.md)
- [.claude/skills/flutter-secrets/SKILL.md](.claude/skills/flutter-secrets/SKILL.md)
- [.claude/skills/flutter-dependencies/SKILL.md](.claude/skills/flutter-dependencies/SKILL.md)
- [.claude/skills/flutter-analytics/SKILL.md](.claude/skills/flutter-analytics/SKILL.md) — routes to `docs/ANALYTICS-FLUTTER-GUIDE.md` for naming conventions
- [.claude/skills/flutter-modular-architecture/SKILL.md](.claude/skills/flutter-modular-architecture/SKILL.md) — feature layout only; DI wiring lives in flutter-dependencies
- [.claude/skills/flutter-state-bloc/SKILL.md](.claude/skills/flutter-state-bloc/SKILL.md)
- [.claude/skills/flutter-async-safety/SKILL.md](.claude/skills/flutter-async-safety/SKILL.md)
- [.claude/skills/flutter-testing/SKILL.md](.claude/skills/flutter-testing/SKILL.md)
- [.claude/skills/flutter-auth/SKILL.md](.claude/skills/flutter-auth/SKILL.md)
- [.claude/skills/flutter-deep-linking/SKILL.md](.claude/skills/flutter-deep-linking/SKILL.md)
- [.claude/skills/flutter-push-notifications/SKILL.md](.claude/skills/flutter-push-notifications/SKILL.md)
- [.claude/skills/flutter-ui/SKILL.md](.claude/skills/flutter-ui/SKILL.md)
- [.claude/skills/flutter-responsive-layout/SKILL.md](.claude/skills/flutter-responsive-layout/SKILL.md)
- [.claude/skills/flutter-networking/SKILL.md](.claude/skills/flutter-networking/SKILL.md) — this is where the actual dio setup (interceptors, refresh flow, `Result<T>` / `AppError`) lives; verify it matches the client shape in your `lib/core/dio_client.dart`
- [.claude/skills/flutter-routing/SKILL.md](.claude/skills/flutter-routing/SKILL.md)

## Things to verify after pasting

- `lib/core/dio_client.dart` — path referenced in rule #1; adjust if yours differs
- `lib/api/generated/**` — path referenced in the codegen rule
- `pnpm nx run api:openapi` etc. — your codegen commands
- `apps/api` / `apps/mobile` — your monorepo layout
- The `{success, message, data}` envelope — your API's actual response shape; if it's different, fix both the DON'T example and the `flutter-networking` skill