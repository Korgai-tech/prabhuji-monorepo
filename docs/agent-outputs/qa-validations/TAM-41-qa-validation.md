# QA Validation — TAM-41 (Prabhuji Onboarding + Paywall Epic — Rollup)

## Independence declaration

Fresh `qas` subagent. This is an **epic-level rollup** that aggregates the 14
per-ticket QA reports already produced for TAM-42..TAM-55 on branch
`feature/onboarding`. Each child ticket was independently validated by its own
fresh `qas` subagent invocation, and each carries its own `Overall verdict:
APPROVED` line. This rollup does not re-execute the child gates (`pnpm verify`,
`pnpm nx test api --configuration=integration`, `pnpm verify:mobile`,
`flutter analyze`, `flutter test`) — the child reports carry that evidence.

Child reports read for this rollup live at
`docs/agent-outputs/qa-validations/TAM-{42..55}-qa-validation.md`.

## 1. Overview

TAM-41 is the Prabhuji Onboarding + Paywall epic, sliced into **14 sub-tickets**
that together deliver the first-launch funnel from splash → phone entry → OTP →
profile → paywall → pay-now handoff, plus the backend contracts that back it and
the analytics fabric that instruments it. The epic is sliced into two lanes and
four waves:

- **Backend (TAM-42..TAM-47, six tickets)** — Prisma schema migrations, OTP
  send/verify/resend, `PATCH /users/me`, paywall CMS + `GET /paywall/config`,
  subscription state seeding + `GET /subscription/status`. Payment-provider
  integration (Razorpay order-create / verify / webhook, `payment_intents`,
  `PAYMENTS_ENABLED`) was pivoted out of scope by the q3 resolution on
  2026-07-11 and deferred to a follow-up ticket.
- **Mobile (TAM-48..TAM-55, eight tickets)** — Waves 1–3 build the screens
  (splash, phone choice + input, OTP, name + language, paywall, pay-now stub)
  and the orchestrator that routes between them; Wave 4 (TAM-55) hardens
  analytics with a shared enricher, session context, PII grep test, and a
  Maestro happy-path flow.

All 14 children are currently **Ready for Review** with individually APPROVED
QA reports. The design-fidelity gate (Figma extraction + Phase 6 sweep + Maestro
device captures) is explicitly DEFERRED for the mobile UI tickets (TAM-49..53)
per authorized deferrals in each child spec's Evidence section — see § Deferred
Items below.

## 2. Backend tickets rollup (TAM-42..TAM-47)

| Ticket | Scope | Verdict | Notable deferrals |
| --- | --- | --- | --- |
| TAM-42 | Prisma schema migration — nullable `name`, `phoneCountryCode`, `phoneNumberHash`, `selectedLanguage`, `onboardingCompletedAt` on `User`; compound unique + timestamp indexes; `UserRecord.name` widened to nullable | APPROVED | None (deploy-time migration apply is RTE, not QA) |
| TAM-43 | New `core/otp` module — `POST /auth/otp/send`, `POST /auth/otp/verify`, `POST /auth/otp/resend`; provider seam with in-memory stub (fixed OTP `1234`); phone hasher (SHA-256 with `AUTH_OTP_PEPPER`); rate limiter; `AUTH_OTP_PROVIDER` env; JWT mint on verify | APPROVED | Live SMS provider (msg91/twilio) not wired — env-gated seam only |
| TAM-44 | New `core/users` module — `PATCH /users/me` + `GET /users/me`; shared `LanguageCodeSchema` reused by TAM-45 / TAM-52; uses columns added in TAM-42 (no new migration) | APPROVED | None |
| TAM-45 | `GET /paywall/config` endpoint — consumes the `IPaywallApi` facade from TAM-46; unique fallback chain; language enum shared with TAM-44 | APPROVED | Subscription-status endpoint moved out to TAM-47 per q3 2026-07-11 |
| TAM-46 | Paywall CMS — 7 Prisma models + migration + idempotent seed script + `core/paywall` provider + in-memory cache; no HTTP routes (facade consumed by TAM-45) | APPROVED | None |
| TAM-47 | Subscription state schema + `GET /subscription/status` (JWT-scoped); OTP verify seeds a free-tier `subscriptions` row via `performServiceCall`; `providerSubscriptionId` never on the wire, never in logs | APPROVED | **Payment provider integration explicitly deferred** — no `payment_intents` table, no Razorpay SDK, no order-create / verify / webhook routes, no `PAYMENTS_ENABLED` flag. Authorized by q3 pivot on 2026-07-11. |

## 3. Mobile tickets rollup (TAM-48..TAM-55)

| Ticket | Scope | Verdict | Notable deferrals |
| --- | --- | --- | --- |
| TAM-48 | `OnboardingOrchestratorBloc` + `go_router` `refreshListenable` bridge; wire redirect decision from subscription/onboarding state; analytics on route transitions | APPROVED (functional) | Design fidelity gate DEFERRED — authorized in spec Evidence |
| TAM-49 | Splash screen widget — dispatches `AppStarted`; fires `onboarding_app_opened` once per cold start + `onboarding_splash_viewed` every mount; ≥1500 ms still-working affordance; offline/error retry | APPROVED (functional) | Design fidelity gate DEFERRED — warm-orange background + Prabhuji wordmark are placeholders with inline swap-in points |
| TAM-50 | Phone Choice + Phone Input screens — shared `PhoneOtpBloc`; replaces Wave-1 placeholder routes; `terms_row` widget; length-only phone attrs, no raw phone in analytics | APPROVED (functional) | Design fidelity gate DEFERRED — pixel parity to Figma `520:4992` out of scope |
| TAM-51 | OTP screen — default + invalid states; 4-digit box widgets (`Key('otp-digit-box-$index')`); submit + resend flows; `attempt_count` / `resend_count` analytics | APPROVED (functional) | Design fidelity gate DEFERRED |
| TAM-52 | Name + Language screen — `NameLanguageBloc`; language cards; `bucketForNameLength()` helper; interim `Icons.check` selected-state | APPROVED (functional) | Design fidelity gate DEFERRED — `_LanguageCard` selected-state icon is `Icons.check` pending Figma SVG |
| TAM-53 | Paywall (VIP Membership) screen — remote-config-driven `PaywallBloc`; `paywall_viewed` + `paywall_closed` events with full §9 payload; `paywall_impression_count_for_user` on both events; close CTA + trigger classification (re-validated after a bounce that added `paywall_closed`) | APPROVED (functional) | Design fidelity gate DEFERRED |
| TAM-54 | Pay Now — `PaymentPlaceholderBloc`; deferred-toast SnackBar; navigates to Home on tap; `payment_provider: 'none'` (Phase 1) | APPROVED | **Razorpay integration explicitly deferred** per q3 2026-07-11 (`razorpay_flutter` intentionally not in `pubspec.yaml`); design fidelity N/A (TAM-53 owns the visual) |
| TAM-55 | Wave-4 analytics hardening — shared `AnalyticsEnricher` (13 common attrs) + `SessionContext` fed by orchestrator/paywall blocs; enricher merge inside `Analytics.trackEvent` (caller wins on collision); non-negotiable PII grep test; authored Maestro happy-path flow; event-contract docs | APPROVED | `network_status` attribute deferred (needs `connectivity_plus`); `experiment_variant: null` for Phase 1; Maestro flow authored + tagged but not executed |

Design-fidelity deferral is scoped consistently across TAM-49..TAM-53: the
Design Extraction gate (Phase 1 tokens, Phase 2 geometry, Phase 3 theme wiring,
Phase 4 assets, Phase 5 references) + Phase 6 sweep + Maestro device captures
+ `pnpm check:no-hex-literals` + `pnpm check:figma-tokens-committed` are all
routed to a follow-up ticket. Functional QA is APPROVED; **visual-verify is
DEFERRED**.

## 4. Cross-cutting

### Backend

- **Contract-first codegen honored**: every ticket that changed the API
  contract (TAM-43, TAM-44, TAM-45, TAM-47) regenerated `apps/api/openapi.json`
  + `packages/api-client/src/types.ts` and committed both. `pnpm check:openapi`
  (folded into `pnpm verify`) is green across the epic.
- **Full validation suite green per ticket**: `pnpm verify` (arch boundaries +
  OpenAPI drift + typecheck + lint + unit tests, all Node projects) and
  `pnpm nx test api --configuration=integration` (testcontainers Postgres, real
  route → controller → service → repository stack) both PASS in every child
  report.
- **Layered architecture enforced**: Prisma imports restricted to
  `repositories/` (verified by grep + `arch-boundaries.json` in every child).
  New module boundaries in `arch-boundaries.json` for `core/otp`, `core/users`,
  `core/paywall`, `core/subscription` were added under `allowTypeOnly` for the
  `api/` facades only — no runtime cross-module imports.
- **JWT-scoping**: every new endpoint that reads user-owned state uses
  `authMiddleware` as `preHandler` and derives identity from `req.user.id` (no
  query/path parameters for identity). Explicitly cross-user tested in
  TAM-47's integration suite.
- **No PII in logs / responses**: `providerSubscriptionId` never on the wire
  or in log lines (TAM-47); phone-hash-only storage (TAM-42/43); no raw phone
  or OTP in any log call across the OTP module (grep-verified in child
  reports).

### Mobile

- **State management**: `flutter_bloc` used for all new state (per user
  `MEMORY.md`); no Provider / Riverpod / GetX / `setState` for shared state.
  Existing Riverpod / setState surfaces outside the onboarding + paywall
  feature trees are **preserved untouched** — grep-verified in each mobile
  child report.
- **PII grep test**: `apps/mobile/test/analytics/no_pii_leak_test.dart`
  (TAM-55) drives the full funnel via 5 phase drivers, records every
  `Analytics.trackEvent` invocation, and asserts:
  1. no raw phone / OTP / name substrings in any property value (nested Maps +
     Lists walked recursively);
  2. no card / UPI-VPA regex matches (with a narrow exception for the
     `otp-*@prabhuji.internal` stub email);
  3. none of the `do_not_track` keys + four copy-paste-footgun keys appear.
  All 5 test cases PASS.
- **Maestro happy-path flow authored** at
  `apps/mobile/maestro/onboarding_happy_path.yaml` (13 selectors, all
  cross-checked against real widget keys / rendered text in TAM-55's report)
  and runnable via `pnpm nx run mobile:maestro`. **Execution is deferred** —
  flow is authored + tagged + reachable, not driven on a device.
- **Shared analytics enricher**: 13 common attrs (`user_id`, `anonymous_id`,
  `session_id`, `app_version`, `build_number`, `platform`, `device_locale`,
  `selected_language`, `subscription_status`, `entry_point`, `config_version`,
  `experiment_variant`, `network_status`) injected on every event via
  `Analytics.trackEvent`'s spread merge (caller wins on key collision, enricher
  errors are swallowed so tracking cannot be broken by a bad enricher).
- **`entry_point` lifecycle**: seeded to `'cold_start'` on process start;
  `WidgetsBindingObserver` in `main.dart` flips it to `'resume'` on the first
  foreground event.

## 5. Deferred items (follow-up ticket recommendations)

Each deferral below is authorized by the corresponding child spec's Evidence
section and/or the epic-level q3 resolution on 2026-07-11.

1. **Design fidelity pass for mobile screens (Wave 1–3 UI).** Suggested
   ticket: "Mobile onboarding + paywall design-fidelity pass — TAM-49..53."
   Scope: Phase 1–5 of the `figma-flutter` skill for each screen (variables,
   geometry, theme wiring, assets, screenshot references); commit tokens under
   `apps/mobile/lib/core/theme.dart`; register assets in `pubspec.yaml`;
   replace hardcoded hex + placeholder wordmark + interim `Icons.check` with
   token/asset references; produce per-screen sweep tables under
   `specs/evidence/TAM-{49..53}/fidelity/sweep-table.md`; produce device
   captures at `specs/evidence/TAM-{49..53}/fidelity/device/<slug>.png`;
   enable `pnpm check:no-hex-literals` and `pnpm check:figma-tokens-committed`.
2. **Maestro flow execution on emulator / CI.** Suggested ticket:
   "Mobile onboarding Maestro happy-path — device execution + CI wiring."
   Scope: boot an emulator via `flutter emulators --launch`, drive the
   authored `apps/mobile/maestro/onboarding_happy_path.yaml` via
   `pnpm nx run mobile:maestro`, capture screenshots per Phase 6 of the
   `figma-flutter` skill, and wire the target into CodeBuild.
3. **Payment provider integration.** Suggested ticket: "Add payment provider
   integration on top of subscription state." Scope: implement the deferred
   surface from TAM-47 and TAM-54 — Razorpay SDK, `payment_intents` table,
   `PAYMENTS_ENABLED` feature flag, order-create / verify / webhook routes,
   `PaymentPlaceholderBloc` → real Razorpay bloc migration on the mobile side.
4. **`network_status` analytics attribute.** Suggested ticket: "Add
   `network_status` to `AnalyticsEnricher`." Scope: add `connectivity_plus`
   to `apps/mobile/pubspec.yaml`; subscribe to connectivity changes in
   `SessionContext`; populate `network_status` in `AnalyticsEnricher.enrich()`;
   update `docs/ANALYTICS-ONBOARDING-PAYWALL.md`.
5. **Legal URLs are dummy `example.com` values per q4.** Suggested action:
   Product / Legal to supply the real Terms / Privacy / Refund URLs; swap the
   dummy values in the paywall CMS seed (TAM-46) via a follow-up seed update
   or CMS write-path.

## 6. Visual Fidelity Gate

**N/A at the epic level.** Fidelity gates are per-child ticket, not per-epic.
For the mobile UI children (TAM-49..53), the visual-verify gate is explicitly
**DEFERRED** per authorized notes in each child spec's Evidence section, and
the deferrals are routed to the follow-up ticket described in § Deferred items
#1. Functional QA is APPROVED for all mobile children.

For TAM-48, TAM-54, and TAM-55: fidelity is N/A (orchestrator = no visual
surface of its own; TAM-54 = behavior-only, TAM-53 owns the Pay Now visual;
TAM-55 = analytics wiring, no visual surface).

For TAM-42..TAM-47 (backend): fidelity gate is not applicable — no UI.

## 7. Final verdict

All 14 sub-tickets (TAM-42..TAM-55) are individually APPROVED. The epic's
overall QA state aggregates cleanly:

- Every backend child has PASS on `pnpm verify` and `pnpm nx test api
  --configuration=integration`.
- Every mobile child has PASS on `flutter analyze`, `flutter test`, and
  `pnpm verify:mobile`.
- No PII regressions; JWT-scoping and layered architecture enforced across
  the backend; `flutter_bloc`-only state and PII grep test enforced on
  mobile.
- Design-fidelity gate deferrals for TAM-49..53 are authorized and routed to
  a follow-up ticket (§ Deferred items #1). Payment-provider deferrals on
  TAM-47 / TAM-54 are authorized by the q3 pivot dated 2026-07-11 and routed
  to a follow-up (§ Deferred items #3).
- Maestro flow execution + `network_status` + legal URLs are separately
  routed to follow-up tickets (§ Deferred items #2 / #4 / #5).

The epic is ready for its Ready-for-Review flip.

## Overall verdict: APPROVED
