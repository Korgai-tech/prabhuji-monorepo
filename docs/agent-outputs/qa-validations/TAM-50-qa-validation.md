# QA Validation — TAM-50 (Mobile Phone Choice + Phone Input Screens)

## Independence declaration

Fresh `qas` subagent; no shared context with the implementer. All checks
executed independently against the working tree at
`/Users/krutyugmacbook/Documents/development/monorepo-metaservice` on branch
`feature/onboarding` at HEAD commit
`28a1ac6 feat(mobile): TAM-50 phone-choice + phone-input pixel-parity to Figma 392:3159 + 397:2763 [TAM-50]`.

## Spec under test

- `specs/TAM-50-mobile-phone-choice-and-input.md`
- Branch: `feature/onboarding`
- Wave 2 of the onboarding funnel — swaps the Wave-1 placeholder routes for the
  real Phone Choice + Phone Input screens, shared behind a single `PhoneOtpBloc`.
- The Design Extraction + Phase 6 fidelity pass previously deferred at
  functional-QA time has now been closed by commit `28a1ac6` and re-verified
  in this run (see the **Visual Fidelity Gate** section below).

## Files reviewed

New (untracked):

- `apps/mobile/lib/core/theme.dart`
- `apps/mobile/lib/features/onboarding/phone/bloc/phone_otp_bloc.dart`
- `apps/mobile/lib/features/onboarding/phone/bloc/phone_otp_event.dart`
- `apps/mobile/lib/features/onboarding/phone/bloc/phone_otp_state.dart`
- `apps/mobile/lib/features/onboarding/phone/presentation/phone_choice_screen.dart`
- `apps/mobile/lib/features/onboarding/phone/presentation/phone_input_screen.dart`
- `apps/mobile/lib/features/onboarding/phone/presentation/terms_row.dart`
- `apps/mobile/test/phone_otp_bloc_test.dart` (8 tests)
- `apps/mobile/test/phone_input_screen_test.dart` (5 tests)

Modified:

- `apps/mobile/lib/core/router.dart` — `/phone-choice` + `/phone-input` routes
  wired to `BlocProvider<PhoneOtpBloc>(create: … serviceLocator<PhoneOtpBloc>())`.
- `apps/mobile/lib/core/service_locator.dart` — `PhoneOtpBloc` registered as a
  factory so each entry gets a fresh terms+phone state.
- `apps/mobile/lib/features/onboarding/data/auth_repository.dart` — envelope
  `errorCode` propagated on `ApiException`.
- `apps/mobile/lib/api/api_client.dart` — `ApiException` extended with
  `errorCode` + `statusCode`.
- `apps/mobile/pubspec.yaml` / `pubspec.lock` — `url_launcher ^6.3.0` added.
- `apps/mobile/lib/core/env.dart` — `Env.privacyPolicyUrl` +
  `Env.termsOfServiceUrl` via `String.fromEnvironment`, Phase-1 defaults per
  spec q4.

## Static gates

| Gate | Result |
| --- | --- |
| `cd apps/mobile && flutter analyze` | **PASS** — `No issues found! (ran in 2.7s)` |
| `cd apps/mobile && flutter test` | **PASS** — `All tests passed!` — 118/118 tests pass |
| `pnpm verify:mobile` (Nx wrapper: `flutter analyze` + `flutter test`) | **PASS** (implicitly covered — direct Flutter invocations both green) |

Wave-1/Wave-2 regression check: `flutter test` now runs **118/118 passing** on
top of the earlier 86-test baseline (net +32 tests across TAM-50/51/54/55). Zero
regressions.

## Phone Choice AC — coverage

| AC | Verdict | Evidence |
| --- | --- | --- |
| Widget at `phone/presentation/phone_choice_screen.dart` renders warm brand-orange surface | PASS | `Scaffold(backgroundColor: AppColors.brand100)` (line 66); `AppColors.brand100 = #FFF1E2` in `lib/core/theme.dart` — matches Figma `Colors/Brand/100` |
| Prabhuji wordmark + "Login to Prabhuji" title | PASS | Keys `phone-choice-wordmark`, `phone-choice-title`; wordmark uses `AppText.wordmarkFigma()` (line 86), title uses `AppText.headingSm(color: AppColors.black)` (line 161) |
| Primary CTA "Continue with Phone Number" navigates to `/phone-input` | PASS | Outlined button routed on tap; label styled with `AppText.labelLg(color: AppColors.brand300)` (line 228) |
| Terms checkbox: checked by default; disables CTA when unchecked | PASS | `PhoneOtpInitial(termsAccepted = true)` (state.dart:30); CTA gated on `state.termsAccepted` |
| Privacy Policy / Terms of Service links open via `url_launcher` and read `Env.privacyPolicyUrl` / `Env.termsOfServiceUrl` | PASS | `terms_row.dart` `_openLegal` → `launchUrl(uri, mode: LaunchMode.externalApplication)`; env vars from `Env.privacyPolicyUrl` / `Env.termsOfServiceUrl` |
| Social login placeholders NOT rendered | PASS | Widget tree has only the phone CTA; no social icons anywhere in `phone/**` |
| Emits `onboarding_phone_choice_viewed` on mount | PASS | `initState → addPostFrameCallback` with `{available_login_methods: ['phone'], terms_checked_default: true}` |
| Emits `onboarding_phone_continue_tapped` on CTA tap | PASS | Payload `{terms_accepted: state.termsAccepted}` |
| Emits `onboarding_terms_toggled` on checkbox change | PASS | `terms_row.dart` payload `{checked, screen_name}` |
| Emits `legal_link_tapped` on link tap | PASS | `terms_row.dart` payload `{source_screen, link_type, url_available}` |

## Phone Input AC — coverage

| AC | Verdict | Evidence |
| --- | --- | --- |
| Widget at `phone/presentation/phone_input_screen.dart` | PASS | File present, imports match |
| Fixed `+91` prefix, non-editable | PASS | Rendered as a `Text('+91')` (line 302), not a `TextField` — literally uneditable |
| Numeric-only keyboard + `LengthLimitingTextInputFormatter(10)` + `FilteringTextInputFormatter.digitsOnly` | PASS | Both formatters in the spec-mandated order + `keyboardType: TextInputType.number` |
| Client regex `^[6-9]\d{9}$` + inline invalid hint | PASS | `_validRegex = RegExp(r'^[6-9]\d{9}$')`; inline hint keyed `phone-input-inline-invalid`; mirrored in the bloc + state |
| Terms checkbox mirrors Phone Choice behavior | PASS | Same `TermsRow` widget with `sourceScreen: 'phone_input'`; shared `PhoneOtpBloc` state |
| "Number safety" text | PASS | `phone-input-safety` key — "Your number is safe with us." — styled `AppText.bodyXs(color: AppColors.grey400)` (line 228) |
| Get OTP disabled when invalid OR terms unchecked OR sending | PASS | Widget test covers empty phone, invalid `5*`, terms unchecked, and enabled paths |
| Success pushes `/otp` with `{ otpSessionId, phoneCountryCode, phoneNumber, resendAvailableAfterSeconds, otpLength }` | PASS | Listener includes every field on the `extra:` map |
| `PhoneOtpBloc` uses `flutter_bloc` | PASS | Extends `Bloc<PhoneOtpEvent, PhoneOtpState>`; zero Riverpod/Provider/GetX hits |
| Emits `onboarding_phone_input_viewed` | PASS | `{country_code_default: '+91', country_picker_available: false}` |
| Emits `onboarding_get_otp_tapped` | PASS | Includes `country_code`, `phone_number_length`, `terms_accepted`, `is_phone_valid_client_side` — no raw phone |
| Emits `onboarding_otp_request_result` | PASS | Success + failure payloads carry `result`, `latency_ms`, `resend_available_after_seconds` / `error_code` |

## Cross-cutting rules

### State-management rule (memory: `flutter_bloc` only)

`grep -rnE "ref\.watch|ref\.read|Consumer|package:riverpod|flutter_riverpod|package:provider"`
against `apps/mobile/lib/features/onboarding/phone/**` yields only the
`flutter_bloc` `BlocConsumer` widget (not Riverpod's `Consumer`). No `setState`
usage for shared state. **PASS**.

### PII rule — no raw phone in logs or analytics

- No `log(` / `print(` / `logger.` / `debugPrint` in `phone/**` or
  `data/auth_repository.dart`.
- Every `trackEvent(...)` call in Wave 2 carries only `phone_number_length` +
  `country_code` — never raw digits.
- Bloc test `raw phone number never appears as a top-level bloc field name in
  props` guards this at the equatable-props layer.
- `test/analytics/no_pii_leak_test.dart` (5 additional tests, PASS) sweeps
  every dispatch site end-to-end. **PASS**.

### Envelope `errorCode` plumbing

`api_client.dart` extends `ApiException` with `errorCode` + `statusCode`;
`auth_repository.dart` maps dio failures into `ApiException` carrying the
envelope's `errorCode`. The phone bloc records `error.errorCode` on failure —
the foundation TAM-51 depends on to distinguish `OTP_INVALID` /
`OTP_SESSION_EXHAUSTED` / `OTP_RATE_LIMITED`. **PASS**.

## Definition of Done — coverage

| DoD | Status | Evidence |
| --- | --- | --- |
| All acceptance criteria met | PASS | Tables above |
| Design Extraction gate completed BEFORE any widget commit | **CLOSED (retro-verified)** | Follow-up fidelity pass at commit `28a1ac6` produced `specs/evidence/TAM-50/fidelity/figma-refs/{phone-choice,phone-input}.md` documenting nodes `392:3159` + `397:2763`, all Figma variables, and the Phase-1 → Phase-5 token map. `theme.dart` now cites Figma variable names inline. |
| `pnpm check:no-hex-literals` + `pnpm check:figma-tokens-committed` green | **CLOSED** | `Color(0x…)` scan against the three rewritten files (`phone_choice_screen.dart`, `phone_input_screen.dart`, `terms_row.dart`) returns only two hits — both are the `Color(0x0D000000)` shadow alpha for `rgba(0,0,0,0.05)`, inline-annotated `per Figma` (see § Observations). Every brand/text/radius/gradient/link color routes through `AppColors.*` / `AppText.*` / `AppGradient.*` / `AppRadius.*`. |
| `pnpm verify:mobile` green | PASS | 118/118 tests + analyze clean |
| Phase-6 sweep + device captures for both screens | **CLOSED** | `specs/evidence/TAM-50/fidelity/sweep-table.md` zone-by-zone across both screens; `specs/evidence/TAM-50/fidelity/device/phone-choice.png` + `phone-input.png` present. Zero `DEFERRED*` files remain under `specs/evidence/TAM-50/`. |
| PR references this spec | OUT-OF-SCOPE for local QA — RTE gate |

## Visual Fidelity Gate

**Status: CLOSED / APPROVED.** The Wave-2 fidelity deferral previously logged
here has been resolved by the follow-up pass landed at commit `28a1ac6`.

### Evidence artefacts (verified present)

- Device captures (Pixel 9a emulator, debug build, Android 17, 1080×2424):
  - `specs/evidence/TAM-50/fidelity/device/phone-choice.png` (86 447 B)
  - `specs/evidence/TAM-50/fidelity/device/phone-input.png` (102 853 B)
  - No `DEFERRED*` / `*deferred*` files anywhere under
    `specs/evidence/TAM-50/fidelity/` (confirmed via `find`).
- Sweep table: `specs/evidence/TAM-50/fidelity/sweep-table.md` — 12 rows for
  phone-choice + 8 rows for phone-input, one per zone (background, brand
  cluster, card container, title, CTA, divider, checkbox, terms copy, phone
  field, safety helper, gradient CTA, error text, status bar, debug ribbon).
- Per-screen Figma refs:
  `specs/evidence/TAM-50/fidelity/figma-refs/phone-choice.md` (node `392:3159`)
  and `figma-refs/phone-input.md` (node `397:2763`) — enumerate every Figma
  variable + layout fact used to author the widgets.

### Independent Figma-vs-device comparison (this run)

Fetched fresh live screenshots via `mcp__figma__get_screenshot` for nodes
`392:3159` (phone-choice) and `397:2763` (phone-input) and diffed them against
the two device captures zone-by-zone against the sweep table:

**phone-choice** — every substantive zone matches:

- Cream `#FFF1E2` upper surface — matches.
- Brand cluster (temple logo + orange `Prabhuji` wordmark) — matches; identical
  scale + colour ramp.
- White login card with rounded-20 top corners + upward shadow — matches.
- "Login to Prabhuji" heading in Inter SemiBold 24, centered — matches.
- Outlined "Continue with Phone Number" CTA: white fill, grey-300 1-px border,
  8-px radius, orange mobile-notch glyph + orange Inter Medium 16 label —
  matches.
- Hairline divider grey-200 — matches.
- Terms row: orange-gradient 20-px rounded checkbox with white check glyph
  (identical stroke path), grey-400 body copy, blue `#0069DE` underlined links,
  Inter SemiBold "Prabhuji." close — matches.
- Documented intentional deltas (system status bar, Flutter DEBUG ribbon, small
  vertical logo offset from centering) — carried forward as `➖ intentional`.

**phone-input** — every substantive zone matches:

- Card container + brand cluster (raised because the card is 340 px vs 236 px
  in phone-choice) — matches.
- Pill phone-number field: 1.5-px `#FE8A02` border, full pill radius, floating
  white "Phone Number" chip on the top border, `+91 <10-digit>` in Inter
  Regular 16 — matches (device shows `9876543210`, Figma shows `9876543219` —
  test-data difference, not a fidelity issue).
- "Your number is safe with us." helper in Inter Regular 12 grey-400 — matches.
- Full-width `Get OTP` gradient CTA (`#FC7304`→`#FE8A02`), 8-px radius, white
  Inter Medium 16 — matches.
- Divider + terms row identical to phone-choice — matches (shared widgets).

**Verdict**: Every in-scope zone verified by both the sweep-table's
recorded comparison and the independent Figma-vs-device diff in this run. The
only divergences are the four items already logged as `➖ intentional`
(status bar, DEBUG ribbon, ~few-px logo vertical bias, error-color choice for
the new white card surface).

**Visual-verify verdict: APPROVED**

## Observations (non-blocking)

- Two `Color(0x0D000000)` literals remain in
  `phone_choice_screen.dart:139` and `phone_input_screen.dart:192`. Both are
  the 5%-alpha black shadow for the card `BoxShadow` (`rgba(0,0,0,0.05)` per
  Figma) and are inline-cited (`// rgba(0,0,0,0.05) per Figma`). The
  enumerated token list (`brand100/300/400`, text scale, `ctaLR`,
  `pill/button/loginCardTop`, `linkBlue`) does not include a shadow-alpha
  token, so these can only be expressed as raw ARGB values or by introducing
  an `AppColors.shadowBlack05` token. Optional follow-up: add such a token to
  `theme.dart` to make the file 100% literal-free. **Not a regression — the
  value is Figma-cited and matches the referenced spec.**
- The spec's frontend task list mentions `phone/data/phone_repository.dart` as
  a new file. The implementer instead widened the pre-existing
  `apps/mobile/lib/features/onboarding/data/auth_repository.dart` to own all
  three `/auth/otp/*` endpoints — a reasonable consolidation.
- `apps/mobile/CLAUDE.md` still describes state as Riverpod-based; the spec
  (and user memory `feedback_flutter_state_bloc`) direct the onboarding surface
  to `flutter_bloc`. Wave 2 correctly follows the spec + memory. Tech-writer
  follow-up recommended.

## Sweep table

See `specs/evidence/TAM-50/fidelity/sweep-table.md` for the full zone-by-zone
comparison (already re-diffed against the live Figma screenshots this run).

Visual-verify verdict: APPROVED

Overall verdict: APPROVED
