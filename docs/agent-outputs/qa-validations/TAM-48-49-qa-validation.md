# QA Validation — TAM-48 (Onboarding Routing Orchestrator) + TAM-49 (Splash Screen)

## Independence declaration

Fresh `qas` subagent; no shared context with the implementer. Report author had no hand in writing the code.

## Scope note — deferred fidelity

Both specs are Figma-sourced UI, but the developer explicitly deferred the
Design Extraction gate + Phase 6 sweep + device captures to a follow-up
fidelity ticket. This deferral is authorized by the QAS-invocation prompt and
written verbatim in the Evidence section of **both** spec files. The Visual
Fidelity Gate (Maestro presence, sweep table, visual-verify) is therefore
INTENTIONALLY SKIPPED for this pass. **Functional** ACs are validated in full.

Verbatim deferral text located:

- `specs/TAM-48-mobile-onboarding-routing-orchestrator.md:199` — Manual walkthrough Evidence line.
- `specs/TAM-49-mobile-splash-screen.md:222` — Design Extraction commit Evidence line.
- `specs/TAM-49-mobile-splash-screen.md:223` — Design fidelity Evidence line.

## Static gates

- `cd apps/mobile && flutter analyze` → `No issues found! (ran in 1.8s)` — PASS.
- `cd apps/mobile && flutter test` → `All tests passed!` (59 tests) — PASS.
- `pnpm verify:mobile` (nx test mobile through Nx) → `Successfully ran target test for project mobile` — PASS.
- `git diff apps/api/openapi.json` → empty; no OpenAPI drift. PASS.

## TAM-48 — Onboarding Routing Orchestrator

### AC coverage

| AC | Verdict | Evidence |
| --- | --- | --- |
| Uses `flutter_bloc`, NOT Riverpod / Provider / GetX | PASS | `apps/mobile/lib/features/onboarding/bloc/onboarding_orchestrator_bloc.dart:26-27` extends `Bloc<OnboardingOrchestratorEvent, OrchestratorState>`. No `ChangeNotifier` / `StateNotifier` / `GetX` symbols anywhere in `features/onboarding/**` or `features/paywall/**`. |
| Sealed states (`OrchestratorInitial`, in-flight, `OrchestratorRouteDecided(target,reason,…)`, `OrchestratorError`) | PASS | `onboarding_orchestrator_state.dart:34-81` — `sealed class OrchestratorState` with `OrchestratorInitial`, `OrchestratorLoading`, `OrchestratorRouteDecided`, `OrchestratorError`. (Spec named these `OrchestratorChecking` / `OrchestratorRouteResolved`; developer used `OrchestratorLoading` / `OrchestratorRouteDecided` — semantically equivalent, all required fields present, tests exercise them by name — non-blocking naming variance.) |
| Events: `AppStarted`, `SessionRefreshed`, `SubscriptionRefreshed`, `OnboardingStepCompleted` | PASS | `onboarding_orchestrator_event.dart:16-39` — all four event classes present under a `sealed` base. |
| `RouteTarget` enum: phoneChoice, phoneInput, otp, nameLanguage, paywall, home (+ offline as extra) | PASS | `onboarding_orchestrator_state.dart:8-16`. Offline is intentionally an extra value; the router folds it back to `/splash` via `pathForRouteTarget` so the splash renders the retry affordance. |
| Decision tree matches PRD §6.1 | PASS | `onboarding_orchestrator_bloc.dart:113-222` walks Rules 1–6 in exactly the PRD order: no JWT → phoneChoice; 401 → clear JWT + phoneChoice; no phone → phoneInput; onboarding incomplete → nameLanguage; complete + Pro → home; complete + free → paywall. Rule 7 (`_emitCachedOrError` at :261-279) re-emits the last-known target with `reason: cached_fallback`. Rule 8 lands on `OrchestratorError`. Cross-checked against `rough_plan/onboarding-plan/prd.md:96-103`. |
| go_router `refreshListenable` bridge | PASS | `apps/mobile/lib/core/router.dart:19-35` — `_RouterRefresh` subscribes to `bloc.stream` and forwards to `notifyListeners()`; `GoRouter(refreshListenable: refresh, ...)` at :73. |
| `redirect` reads orchestrator state to route from `/splash` | PASS | `router.dart:84-90` — if current path is `/splash` and the bloc has decided a non-offline target, redirect to `pathForRouteTarget(decision.target)`. |
| Analytics: `onboarding_route_decided`, `paywall_subscription_status_checked`, `paywall_subscription_restored` | PASS | `onboarding_orchestrator_bloc.dart:192-204, 248-256`. All three fired via `unawaited(_analytics?.trackEvent(...))` (null-safe, fire-and-forget — matches `apps/mobile/CLAUDE.md` guidance). Payload contains coarse fields only (`route_to`, `reason`, `subscription_status`, `has_completed_onboarding`, `status`, `is_pro`) — no PII. |
| Bloc tests cover the 8 rules | PASS | `test/onboarding_orchestrator_bloc_test.dart` has 10 test cases covering Rules 1–6 explicitly, Rule 7 as `cached_fallback`, Rule 8 as `OrchestratorError`, plus `SubscriptionRefreshed` re-evaluation and `OnboardingStepCompleted(phoneVerified)` fast-path. All green. |

**Notes**: The `paywallDismissed` step short-circuits to home with `subscriptionStatus: _lastKnownSubscriptionStatus ?? 'free'` (bloc :100-108) — correct, because the user dismissed paywall without purchasing so they're still free but should proceed to home. Reasonable defensive default.

## TAM-49 — Splash Screen

### AC coverage (functional only; fidelity deferred)

| AC | Verdict | Evidence |
| --- | --- | --- |
| Splash widget at `apps/mobile/lib/features/onboarding/splash/presentation/splash_screen.dart` | PASS | File present. Widget is `StatefulWidget`; local state is UI-only (still-working affordance timer). |
| Warm orange background + Prabhuji wordmark + trust text | PASS (functional placeholder) | `splash_screen.dart:97` (`Color(0xFFE85E1B)`), `:117-126` (`Prabhuji` wordmark), `:128-135` (`100% secure` trust text). Hardcoded hex + text placeholder are explicitly documented as swap-in points for the fidelity follow-up (`splash_screen.dart:16-21` docblock + inline `:95-96, 115-116` comments). |
| Listens to `OnboardingOrchestratorBloc`; no `Navigator.pushReplacement` | PASS | `splash_screen.dart:98-103` uses `BlocConsumer`; navigation is fully delegated to the router's redirect. Zero `Navigator.push*` calls in the file. |
| Dispatches `AppStarted` on mount | PASS | `splash_screen.dart:40-43, 72-75` — `addPostFrameCallback` fires `_dispatchAppStarted()` which calls `context.read<OnboardingOrchestratorBloc>().add(const AppStarted())`. |
| `onboarding_app_opened` fires ONCE per cold start | PASS | `splash_screen.dart:27` — `static bool _appOpenedFired = false;`. Flipped exactly once in `_fireLifecycleAnalytics` at `:55-61`. Hot reload / resume can't re-fire it (static field survives widget rebuilds but is reset only on cold process start). |
| `onboarding_splash_viewed` fires on every mount | PASS | `splash_screen.dart:63-69` fires unconditionally on every `_fireLifecycleAnalytics` invocation. |
| Still-working affordance ≥ 1500 ms | PASS | `splash_screen.dart:44-46` schedules a `Timer(Duration(milliseconds: 1500))`. Verified by widget test at `test/splash_screen_test.dart:74-114` (pumps past 1600 ms and asserts the key appears). |
| Offline / error → retry affordance | PASS | `splash_screen.dart:105-107, 150-181` renders a `Retry` button when state is `OrchestratorRouteDecided.offline` or `OrchestratorError`. `_retry()` at `:77-84` re-dispatches `AppStarted`. Widget test at `test/splash_screen_test.dart:116-140` confirms. |
| Bloc-only, no Riverpod / Provider / GetX / setState for shared state | PASS | Only setState calls are for the local `_showStillWorking` UI flag — leaf-widget UI-only state, explicitly allowed per the invocation prompt. No other prohibited state managers touched. |

Deferred (accepted per invocation prompt):
- Design Extraction gate (Phase 1 variables, Phase 2 geometry, Phase 3 theme wiring, Phase 4 assets, Phase 5 screenshot references, extraction commit trailer).
- Phase 6 sweep table under `specs/evidence/TAM-49/fidelity/sweep-table.md`.
- Device capture at `specs/evidence/TAM-49/fidelity/device/splash.png`.
- `pnpm check:no-hex-literals` + `pnpm check:figma-tokens-committed`.

## State-management rule (MEMORY.md) — new code audit

```
grep -rn "Consumer|ref\.watch|ref\.read|ConsumerWidget|ConsumerStatefulWidget"
  apps/mobile/lib/features/onboarding apps/mobile/lib/features/paywall
```
No matches inside new onboarding/paywall code beyond the intended `BlocConsumer`. `GetX|Get.put|Get.find|Provider<|ChangeNotifier` — zero matches. `setState` usages restricted to `splash_screen.dart` for the local `_showStillWorking` UI-only flag (allowed). PASS.

## PII / secret leakage

- `grep -rn "debugPrint|print\(|log\(" apps/mobile/lib/features/onboarding apps/mobile/lib/features/paywall` → zero matches. No log statements in new domain code.
- `main.dart` `_DebugBlocObserver` prints `bloc.runtimeType` + state class `runtimeType` only, and is guarded by `if (!kDebugMode) return;`. State values, JWT, phone number, OTP, and user name are never printed. PASS.
- `onboarding_route_decided` payload carries `{route_to (enum name), reason (string constant), subscription_status (coarse enum: active/free/…), has_completed_onboarding (bool)}`. No raw phone / JWT / OTP / name. PASS.

## Ancillary checks

- **Existing surfaces untouched**: `apps/mobile/lib/core/router.dart:127-128` preserves `/login` and `/users` GoRoutes; `state/providers.dart` still exports `authStoreProvider`, `tokenProvider`, `analyticsProvider`, `apiClientProvider` unchanged. `login_screen_test.dart` and `users_screen_test.dart` still green (visible in the flutter-test log tail). PASS.
- **OpenAPI drift**: `git diff apps/api/openapi.json` → empty. New Dart api-client models are the downstream consequence of an earlier api change already committed; no fresh spec drift introduced here. PASS.
- **Router bridge sanity**: `test/router_test.dart` verifies all seven onboarding routes plus the two legacy admin routes are registered, and that initialLocation is `/splash`. PASS.
- **Locator wiring**: `test/widget_test.dart` verifies `configureLocator` registers `AuthStore` + `OnboardingOrchestratorBloc`. PASS.

## Deferred-fidelity language present verbatim in both specs

- TAM-48 spec Evidence (line 199): `Design Extraction gate + Phase 6 sweep + device captures deferred to a fidelity-pass follow-up ticket. Functional implementation prioritized so the whole onboarding funnel can be exercised end-to-end. QAS may APPROVE conditionally with this note.`
- TAM-49 spec Evidence (line 222 + line 223): same deferral language plus a widget-specific "warm-orange background + Prabhuji text wordmark placeholder — swap-in points documented inline in `splash_screen.dart`" note.

Both spec Evidence sections satisfy the deferral requirement.

## Follow-up ticket suggestion

- **TAM-XX (suggested)**: "Mobile onboarding fidelity pass — Splash + downstream screens." Scope: Phase 1–5 of `figma-flutter` for `520:4992` (splash) once Figma Dev Mode is reachable; commit `apps/mobile/lib/core/theme.dart` tokens (`AppColors.splashBackground` / `AppGradient.splashBackdrop`, `AppText.splashTrust`) + `pubspec.yaml` asset registration + `assets/onboarding/{logo_prabhuji.svg,wordmark_prabhuji.svg}`; replace the hardcoded `Color(0xFFE85E1B)` and the text wordmark in `splash_screen.dart` with token/asset references; add `specs/evidence/TAM-49/fidelity/{device/splash.png,sweep-table.md}`; enable `pnpm check:no-hex-literals` + `pnpm check:figma-tokens-committed`. Same pass should cover the placeholder screens (`phone-choice`, `phone-input`, `otp`, `name-language`, `paywall`) once TAM-50 → TAM-53 land.

## Overall verdict

- Functional AC for **TAM-48** — SATISFIED.
- Functional AC for **TAM-49** — SATISFIED (fidelity deferred per authorized note).
- All static gates green; no PII leaks; state-management rule respected; existing surfaces untouched; no OpenAPI drift.
- Fidelity gate INTENTIONALLY DEFERRED to a follow-up ticket per developer + spec Evidence + QAS-invocation prompt authorization.

Overall verdict: APPROVED
