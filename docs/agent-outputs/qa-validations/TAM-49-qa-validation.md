# QA Validation — TAM-49 (Splash Screen)

## Independence declaration

Fresh `qas` subagent; no shared context with the implementer. Report author had no hand in writing the code.

## Spec under test

- `specs/TAM-49-mobile-splash-screen.md`
- Branch: `feature/onboarding`
- Scope: Splash screen widget consuming `OnboardingOrchestratorBloc`; lifecycle analytics; still-working affordance; offline/error retry.

## Scope note — deferred fidelity

The TAM-49 spec is Figma-sourced UI, but the developer explicitly deferred the
Design Extraction gate + Phase 6 sweep + device captures to a follow-up fidelity
ticket. This deferral is authorized by the QAS-invocation prompt and written
verbatim in the Evidence section of the spec file. The Visual Fidelity Gate
(Maestro presence, sweep table, visual-verify) is therefore INTENTIONALLY
SKIPPED for this pass. **Functional** ACs are validated in full.

Verbatim deferral text located:

- `specs/TAM-49-mobile-splash-screen.md:222` — Design Extraction commit Evidence line.
- `specs/TAM-49-mobile-splash-screen.md:223` — Design fidelity Evidence line.

## Static gates

- `cd apps/mobile && flutter analyze` → `No issues found! (ran in 1.8s)` — PASS.
- `cd apps/mobile && flutter test` → `All tests passed!` (59 tests) — PASS.
- `pnpm verify:mobile` (nx test mobile through Nx) → `Successfully ran target test for project mobile` — PASS.
- `git diff apps/api/openapi.json` → empty; no OpenAPI drift. PASS.

## AC coverage (functional only; fidelity deferred)

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
- Splash renders only static wordmark + trust text — no user-identifying payload rendered or logged. PASS.

## Ancillary checks

- **Existing surfaces untouched**: `apps/mobile/lib/core/router.dart:127-128` preserves `/login` and `/users` GoRoutes; existing tests still green (visible in the flutter-test log tail). PASS.
- **OpenAPI drift**: `git diff apps/api/openapi.json` → empty. PASS.
- **Router bridge sanity**: `test/router_test.dart` verifies `initialLocation` is `/splash` so the splash is the entry surface. PASS.
- **Widget-test coverage**: `test/splash_screen_test.dart` covers mount → `AppStarted` dispatch, still-working affordance timing, retry path, and analytics fire-once semantics.

## Deferred-fidelity language present verbatim in the spec

- TAM-49 spec Evidence (line 222 + line 223): same deferral language as TAM-48 plus a widget-specific "warm-orange background + Prabhuji text wordmark placeholder — swap-in points documented inline in `splash_screen.dart`" note.

Spec Evidence section satisfies the deferral requirement.

## Follow-up ticket suggestion

- **TAM-XX (suggested)**: "Mobile onboarding fidelity pass — Splash + downstream screens." Scope: Phase 1–5 of `figma-flutter` for `520:4992` (splash) once Figma Dev Mode is reachable; commit `apps/mobile/lib/core/theme.dart` tokens (`AppColors.splashBackground` / `AppGradient.splashBackdrop`, `AppText.splashTrust`) + `pubspec.yaml` asset registration + `assets/onboarding/{logo_prabhuji.svg,wordmark_prabhuji.svg}`; replace the hardcoded `Color(0xFFE85E1B)` and the text wordmark in `splash_screen.dart` with token/asset references; add `specs/evidence/TAM-49/fidelity/{device/splash.png,sweep-table.md}`; enable `pnpm check:no-hex-literals` + `pnpm check:figma-tokens-committed`.

## Overall verdict

- Functional AC for **TAM-49** — SATISFIED (fidelity deferred per authorized note).
- All static gates green; no PII leaks; state-management rule respected; existing surfaces untouched; no OpenAPI drift.
- Fidelity gate INTENTIONALLY DEFERRED to a follow-up ticket per developer + spec Evidence + QAS-invocation prompt authorization.

Overall verdict: APPROVED
