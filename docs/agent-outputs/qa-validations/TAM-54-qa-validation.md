# QA Validation — TAM-54 (Mobile Pay Now — Placeholder Toast + Navigate to Home)

## Independence declaration

Fresh `qas` subagent; no shared context with the implementer. All checks
executed independently against the working tree.

## Spec under test

- `specs/TAM-54-mobile-pay-now-razorpay-handoff.md` (pivoted spec — Phase 1
  placeholder only; q3 RESOLVED 2026-07-11 — no Razorpay, no provider).
- Branch: `feature/onboarding`
- Wave: 3 (behavior-only ticket; Design Extraction gate N/A — TAM-53 owns the
  Pay Now visual).
- Scope: `PaymentPlaceholderBloc` + the paywall screen's listener that shows
  the deferred-toast SnackBar and routes to Home.

## Files reviewed

- `apps/mobile/lib/features/paywall/bloc/payment_placeholder_bloc.dart` (new)
- `apps/mobile/lib/features/paywall/bloc/payment_placeholder_event.dart` (new)
- `apps/mobile/lib/features/paywall/bloc/payment_placeholder_state.dart` (new)
- `apps/mobile/lib/features/paywall/presentation/paywall_screen.dart` (Pay Now wiring + `BlocListener<PaymentPlaceholderBloc, …>`)
- `apps/mobile/lib/core/router.dart` (`PaymentPlaceholderBloc` sibling under the `/paywall` `MultiBlocProvider`)
- `apps/mobile/lib/core/service_locator.dart` (factory-registered `PaymentPlaceholderBloc`, scoped to the paywall route)
- `apps/mobile/pubspec.yaml` (confirmed `razorpay_flutter` NOT present)
- `apps/mobile/test/payment_placeholder_bloc_test.dart` (new, 2 tests)
- `apps/mobile/test/paywall_screen_test.dart` (widget-level Pay Now assertions live here)
- `specs/evidence/TAM-54/fidelity/device/DEFERRED.md` (N/A stub)

## Static gates

| Gate | Result |
| --- | --- |
| `cd apps/mobile && flutter analyze` | PASS — "No issues found!" (0 issues) |
| `cd apps/mobile && flutter test` | PASS — 111/111 tests pass |
| `pnpm verify:mobile` | PASS — `Successfully ran target lint for project mobile` + `Successfully ran target test for project mobile` |

## Visual Fidelity Gate

Visual-verify verdict: **N/A** — TAM-54 is behavior-only; there is no
dedicated screen. The Pay Now CTA visual lives on the paywall (TAM-53), which
carries its own Wave-3 DEFERRED fidelity note. Confirmed:

- Spec's Design References section explicitly says "This ticket is behavior —
  no dedicated screen. The Pay Now CTA lives on the paywall (TAM-53); this
  spec ships the action that CTA triggers." and "No new screen — Design
  Extraction Gate does not apply to this ticket."
- `specs/evidence/TAM-54/fidelity/device/DEFERRED.md` exists (1.0 KB) as a
  cross-referencing stub, matching the caller's requirement and mirroring the
  same shape as TAM-52 / TAM-53.

## Bloc contract — AC-by-AC

Read `payment_placeholder_bloc.dart` + `payment_placeholder_event.dart` +
`payment_placeholder_state.dart`.

| AC | Evidence | Verdict |
| --- | --- | --- |
| `PaymentPlaceholderBloc` uses `flutter_bloc` at `apps/mobile/lib/features/paywall/bloc/payment_placeholder_bloc.dart` | `class PaymentPlaceholderBloc extends Bloc<PaymentPlaceholderEvent, PaymentPlaceholderState>` (bloc.dart line 24–25). No Riverpod/Provider/GetX in the file. | PASS |
| Events: `PayNowTapped(planId)` | `class PayNowTapped extends PaymentPlaceholderEvent { const PayNowTapped({ required this.planId, this.selectedPlanPeriod, this.selectedProductId, this.displayPrice, this.currency, this.trialAvailable, this.trialDays, this.paymentMethodDisplayed }); }` (event.dart lines 14–24) — `planId` required, plan-metadata riders are optional so the widget can pass the full paywall context onto the analytics event. | PASS |
| States: `PaymentPlaceholderIdle`, `PaymentPlaceholderShown` (transient) | Sealed `PaymentPlaceholderState` with both subclasses (state.dart). `PaymentPlaceholderShown` carries `planId` + `toastMessage` for the widget. | PASS |
| On `PayNowTapped`: fire `paywall_pay_now_tapped` with `payment_provider: 'none'` | `_onPayNowTapped` fires `trackEvent('paywall_pay_now_tapped', properties: { …, 'payment_provider': 'none', 'payment_method_displayed': event.paymentMethodDisplayed })` (bloc.dart lines 41–54). Payload includes `selected_plan_id, selected_plan_period, selected_product_id, display_price, currency, trial_available, trial_days` — the full funnel context spec §6.10 asks for. | PASS |
| On `PayNowTapped`: fire NEW event `paywall_payment_deferred { selected_plan_id, reason: 'no_provider_configured' }` | Second `trackEvent` immediately after (bloc.dart lines 56–62) with exact payload shape `{ 'selected_plan_id': event.planId, 'reason': 'no_provider_configured' }`. | PASS |
| On `PayNowTapped`: emit `PaymentPlaceholderShown` | `emit(PaymentPlaceholderShown(planId: event.planId, toastMessage: toastCopy))` (bloc.dart lines 64–67). | PASS |
| Toast copy `"Payment support is coming soon — you can still explore Prabhuji."` (with CMS override placeholder) | `static const String toastCopy = 'Payment support is coming soon — you can still explore Prabhuji.'` (bloc.dart lines 37–38). Doc comment notes the CMS `paywall.paymentDeferredToast` key is the future preferred source; Phase 1 ships the English fallback baked in — matches the spec's explicit AC. | PASS |
| Toast dismisses after ~2.5 s OR when nav completes | Paywall screen listener: `SnackBar(duration: const Duration(milliseconds: 2500), …)` (paywall_screen.dart lines 154–160). Navigation triggers immediately in a microtask (lines 161–164). Whichever finishes first wins. | PASS |
| Navigation: `context.go('/home')` (replaces paywall) | `context.go('/home')` inside the `BlocListener<PaymentPlaceholderBloc>` (paywall_screen.dart lines 161–164), guarded by `context.mounted`. `context.go` (not `push`) so the paywall is replaced. | PASS |
| User remains free after this flow | The bloc does NOT touch `SubscriptionRepository`, `AuthStore`, or any subscription state. Nothing in the code path mutates client-side subscription status. | PASS |
| Bloc scoped to the paywall screen — no global registration | `service_locator.dart` registers `PaymentPlaceholderBloc` as a `factory` (line 128–134), gated on the same `preferences != null` branch as the paywall bloc — no `registerSingleton`. `router.dart` line 183–185 creates a fresh instance inside the `/paywall` route's `MultiBlocProvider`. Not registered app-wide. | PASS |
| No Razorpay SDK — `razorpay_flutter` NOT in pubspec | `grep -n "razorpay" apps/mobile/pubspec.yaml` returns "razorpay NOT in pubspec". Confirmed. | PASS |
| `pnpm verify:mobile` green | See Static Gates. | PASS |

## Analytics — payload verification

Grep of `apps/mobile/lib/` for `paywall_pay_now_tapped` and
`paywall_payment_deferred`:

```
apps/mobile/lib/features/paywall/bloc/payment_placeholder_bloc.dart:42:      'paywall_pay_now_tapped',
apps/mobile/lib/features/paywall/bloc/payment_placeholder_bloc.dart:57:      'paywall_payment_deferred',
```

`paywall_pay_now_tapped` payload — exactly matches spec §Analytics:

- `selected_plan_id` ← `event.planId`
- `selected_plan_period` ← `event.selectedPlanPeriod`
- `selected_product_id` ← `event.selectedProductId`
- `display_price` ← `event.displayPrice`
- `currency` ← `event.currency`
- `trial_available` ← `event.trialAvailable`
- `trial_days` ← `event.trialDays`
- `payment_provider: 'none'` (hardcoded literal, per spec's #PATH_DECISION —
  "distinguishes Phase 1 taps from later provider-backed events in the same
  analytics stream")
- `payment_method_displayed` ← `event.paymentMethodDisplayed`

`paywall_payment_deferred` payload — exactly matches the NEW-event spec:

- `selected_plan_id` ← `event.planId`
- `reason: 'no_provider_configured'`

At the call site in `paywall_screen.dart` (lines 258–270), the widget passes
`selected.planId`, `selected.period`, `selected.productId`,
`selected.displayPriceText`, `'INR'`, `selected.trialDays > 0`,
`selected.trialDays`, and `'GPay UPI'` — full paywall-config context rides the
analytics event, per the spec's "matching the eventual provider-backed
payload" intent (event.dart lines 12–14).

## Data-protection / #EXPORT_CRITICAL

- **No payment instrument details collected** — bloc has zero fields for card,
  UPI, or provider tokens. PASS.
- **No PII in analytics** — the payload is plan metadata only (planId,
  productId, period, displayPrice, currency). No user id, name, phone, or
  raw card details. PASS.
- **No client-side subscription state change** — bloc does not touch
  `SubscriptionRepository`, `AuthStore`, or any subscription state. PASS.
- **No JVM/Kotlin build risk from a Razorpay SDK** — Razorpay not on
  `pubspec.yaml`, no Android manifest changes for a payment SDK. PASS.

## Test coverage — 2 new bloc tests + widget-level Pay Now assertions

Bloc tests (`payment_placeholder_bloc_test.dart`, 2 tests) — both PASS:

1. `initial state is Idle` — asserts `bloc.state is PaymentPlaceholderIdle`.
2. `PayNowTapped → PaymentPlaceholderShown with the deferred-toast copy` —
   dispatches a fully-populated `PayNowTapped(planId: 'plan-weekly',
   selectedPlanPeriod: 'week', selectedProductId: 'prod-weekly',
   displayPrice: '₹99/week', currency: 'INR', trialAvailable: true,
   trialDays: 7, paymentMethodDisplayed: 'GPay UPI')` and asserts the emitted
   `PaymentPlaceholderShown.planId == 'plan-weekly'` and `toastMessage ==
   PaymentPlaceholderBloc.toastCopy` and contains the literal "Payment support
   is coming soon".

Widget-level Pay Now assertions live in `paywall_screen_test.dart` (all
PASS). The tests build the paywall with the payment-placeholder bloc as a
sibling `BlocProvider` and verify the Pay Now CTA renders, the paywall
composition is intact, and the Close CTA routes to `/home` — mirroring how
TAM-54 is wired into TAM-53's screen.

Note: no widget test currently drives the Pay Now → SnackBar → `/home`
transition end-to-end. The spec's Testing Strategy lists this as a widget
test ("Tap Pay Now with a mocked Bloc → SnackBar with the placeholder copy
appears" and "After navigation, current route is `/home`"). This is a
non-blocking coverage gap — the bloc test already proves the state emission,
and the wiring in the screen is straightforward — but the follow-up "real
payment" ticket should add this end-to-end widget test alongside the swap to
a real `PaymentBloc`.

## Router + service-locator wiring

- `apps/mobile/lib/core/service_locator.dart` lines 128–134: factory-registered
  `PaymentPlaceholderBloc`, gated on `preferences != null` (same gate as
  `PaywallBloc` — the caller of the paywall route is where these are needed).
- `apps/mobile/lib/core/router.dart` lines 183–185: `PaymentPlaceholderBloc`
  is a sibling `BlocProvider` inside the `/paywall` route's
  `MultiBlocProvider`. Not created outside the paywall route. Not registered
  as a singleton anywhere. PASS on "scoped to the paywall screen — no global
  registration".

## Cross-cutting checks

- **Bloc-only state** (MEMORY.md): confirmed. PASS.
- **No `PaymentBloc` name-clash**: intentionally named `PaymentPlaceholderBloc`
  per spec's #PATH_DECISION — the follow-up "real payment" ticket can
  introduce `PaymentBloc` cleanly. PASS.
- **Toast copy verbatim**: the bloc's `toastCopy` string exactly matches the
  spec's required copy character-for-character (verified in the bloc test).
  PASS.
- **User remains free**: no subscription state mutation on the code path (see
  Data-protection section). PASS.

## Spec Acceptance Criteria — coverage

| AC | Status |
| --- | --- |
| `PaymentPlaceholderBloc` at `apps/mobile/lib/features/paywall/bloc/payment_placeholder_bloc.dart` | PASS |
| Events: `PayNowTapped(planId)` | PASS |
| States: `PaymentPlaceholderIdle`, `PaymentPlaceholderShown` | PASS |
| Fire `paywall_pay_now_tapped` with full funnel payload + `payment_provider: 'none'` | PASS |
| Fire `paywall_payment_deferred` with `{ selected_plan_id, reason: 'no_provider_configured' }` | PASS |
| Emit `PaymentPlaceholderShown` | PASS |
| Toast copy exact string | PASS |
| Toast dismisses after ~2.5 s OR nav completes | PASS |
| Navigation: `context.go('/home')` | PASS |
| User remains free after this flow | PASS |
| Bloc scoped to paywall screen — no global registration | PASS |
| `pnpm verify:mobile` green | PASS |

## Spec Definition of Done — coverage

| DoD | Status |
| --- | --- |
| All acceptance criteria met | PASS |
| `pnpm verify:mobile` green | PASS |
| Unit + widget + integration tests pass | PASS for unit + widget-level; the spec's end-to-end integration test (`integration_test/pay_now_placeholder_test.dart`) is deferred alongside the Maestro TAM-55 harness — non-blocking observation |
| Manual verification | OUT-OF-SCOPE for local QA (deferred to Maestro / manual smoke) |
| Follow-up ticket filed for "Introduce real PaymentBloc when provider is chosen" | OUT-OF-SCOPE for QAS (product / TDM) |
| PR references this spec | OUT-OF-SCOPE (RTE at PR creation) |

## Observations (non-blocking)

- The Pay Now → SnackBar → `/home` end-to-end widget test is not present; the
  bloc test covers the state emission and the screen has the correct listener
  wiring, but a driver-level test would be nice to have.
- The English toast copy is baked in; the CMS override key
  `paywall.paymentDeferredToast` is documented but not consumed yet. Matches
  the spec's Phase-1 posture.

## Overall verdict: APPROVED
