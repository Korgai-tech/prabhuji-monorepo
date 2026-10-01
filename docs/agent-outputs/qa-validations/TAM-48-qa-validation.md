# QA Validation — TAM-48 (Onboarding Routing Orchestrator)

## Independence declaration

Fresh `qas` subagent; no shared context with the implementer. Report author had no hand in writing the code.

## Spec under test

- `specs/TAM-48-mobile-onboarding-routing-orchestrator.md`
- Branch: `feature/onboarding`
- Scope: Onboarding routing orchestrator bloc + go_router `refreshListenable` bridge + analytics wiring.

## Scope note — deferred fidelity

The TAM-48 spec is Figma-sourced UI territory (it drives navigation across the
onboarding funnel), but the developer explicitly deferred the Design Extraction
gate + Phase 6 sweep + device captures to a follow-up fidelity ticket. This
deferral is authorized by the QAS-invocation prompt and written verbatim in the
Evidence section of the spec file. The Visual Fidelity Gate (Maestro presence,
sweep table, visual-verify) is therefore INTENTIONALLY SKIPPED for this pass.
**Functional** ACs are validated in full.

Verbatim deferral text located:

- `specs/TAM-48-mobile-onboarding-routing-orchestrator.md:199` — Manual walkthrough Evidence line.

## Static gates

- `cd apps/mobile && flutter analyze` → `No issues found! (ran in 1.8s)` — PASS.
- `cd apps/mobile && flutter test` → `All tests passed!` (59 tests) — PASS.
- `pnpm verify:mobile` (nx test mobile through Nx) → `Successfully ran target test for project mobile` — PASS.
- `git diff apps/api/openapi.json` → empty; no OpenAPI drift. PASS.

## AC coverage

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

## State-management rule (MEMORY.md) — new code audit

```
grep -rn "Consumer|ref\.watch|ref\.read|ConsumerWidget|ConsumerStatefulWidget"
  apps/mobile/lib/features/onboarding apps/mobile/lib/features/paywall
```
No matches inside new onboarding/paywall code beyond the intended `BlocConsumer`. `GetX|Get.put|Get.find|Provider<|ChangeNotifier` — zero matches. PASS.

## PII / secret leakage

- `grep -rn "debugPrint|print\(|log\(" apps/mobile/lib/features/onboarding apps/mobile/lib/features/paywall` → zero matches. No log statements in new domain code.
- `main.dart` `_DebugBlocObserver` prints `bloc.runtimeType` + state class `runtimeType` only, and is guarded by `if (!kDebugMode) return;`. State values, JWT, phone number, OTP, and user name are never printed. PASS.
- `onboarding_route_decided` payload carries `{route_to (enum name), reason (string constant), subscription_status (coarse enum: active/free/…), has_completed_onboarding (bool)}`. No raw phone / JWT / OTP / name. PASS.

## Ancillary checks

- **Existing surfaces untouched**: `apps/mobile/lib/core/router.dart:127-128` preserves `/login` and `/users` GoRoutes; `state/providers.dart` still exports `authStoreProvider`, `tokenProvider`, `analyticsProvider`, `apiClientProvider` unchanged. `login_screen_test.dart` and `users_screen_test.dart` still green (visible in the flutter-test log tail). PASS.
- **OpenAPI drift**: `git diff apps/api/openapi.json` → empty. New Dart api-client models are the downstream consequence of an earlier api change already committed; no fresh spec drift introduced here. PASS.
- **Router bridge sanity**: `test/router_test.dart` verifies all seven onboarding routes plus the two legacy admin routes are registered, and that initialLocation is `/splash`. PASS.
- **Locator wiring**: `test/widget_test.dart` verifies `configureLocator` registers `AuthStore` + `OnboardingOrchestratorBloc`. PASS.

## Deferred-fidelity language present verbatim in the spec

- TAM-48 spec Evidence (line 199): `Design Extraction gate + Phase 6 sweep + device captures deferred to a fidelity-pass follow-up ticket. Functional implementation prioritized so the whole onboarding funnel can be exercised end-to-end. QAS may APPROVE conditionally with this note.`

Spec Evidence section satisfies the deferral requirement.

## Follow-up ticket suggestion

- **TAM-XX (suggested)**: "Mobile onboarding fidelity pass — Splash + downstream screens." Scope: Phase 1–5 of `figma-flutter` for the onboarding funnel once Figma Dev Mode is reachable; commit `apps/mobile/lib/core/theme.dart` tokens and Phase 6 sweep tables + device captures for each screen in the funnel. Same pass should cover the placeholder screens (`phone-choice`, `phone-input`, `otp`, `name-language`, `paywall`) once TAM-50 → TAM-53 land.

## Overall verdict

- Functional AC for **TAM-48** — SATISFIED.
- All static gates green; no PII leaks; state-management rule respected; existing surfaces untouched; no OpenAPI drift.
- Fidelity gate INTENTIONALLY DEFERRED to a follow-up ticket per developer + spec Evidence + QAS-invocation prompt authorization.

Overall verdict: APPROVED
