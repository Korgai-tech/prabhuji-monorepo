# QA Validation — TAM-51 (Mobile OTP Screen — Default + Invalid States)

## Independence declaration

Fresh `qas` subagent; no shared context with the implementer. All checks
executed independently against the working tree at
`/Users/krutyugmacbook/Documents/development/monorepo-metaservice` on branch
`feature/onboarding`, HEAD `77b1249` — the Phase 6 fidelity-pass follow-up.

## Spec under test

- `specs/TAM-51-mobile-otp-screen.md`
- Branch: `feature/onboarding`
- Wave 2 of the onboarding funnel — the OTP screen consumed by the `/otp`
  route, seeded with the send-OTP response payload from TAM-50.

## Files reviewed

Functional (unchanged from the prior validation):

- `apps/mobile/lib/features/onboarding/otp/bloc/otp_bloc.dart`
- `apps/mobile/lib/features/onboarding/otp/bloc/otp_event.dart`
- `apps/mobile/lib/features/onboarding/otp/bloc/otp_state.dart`
- `apps/mobile/test/otp_bloc_test.dart` (9 tests)
- `apps/mobile/test/otp_screen_test.dart` (5 tests, updated for new CTA widgets)

Fidelity pass (landed in `77b1249`):

- `apps/mobile/lib/features/onboarding/otp/presentation/otp_screen.dart` —
  end-to-end rewrite to the card-based Figma layout (default + invalid).
- `apps/mobile/assets/onboarding/exclamation.svg` — retintable exclamation
  glyph for the invalid pill (CSS var fills stripped for `ColorFilter`).
- `specs/evidence/TAM-51/fidelity/device/{otp,otp-wrong}.png` — real Pixel
  9a device captures (1080×2424, Android 17, debug build).
- `specs/evidence/TAM-51/fidelity/figma-refs/{otp,otp-wrong}.md` — per-screen
  Figma reference notes (nodes 397:2618 and 520:4914).
- `specs/evidence/TAM-51/fidelity/sweep-table.md` — per-zone rendered
  comparison table for both states.
- `specs/evidence/TAM-51/fidelity/device/DEFERRED.md` — **deleted** (deferral
  closed).

Modified (shared with TAM-50):

- `apps/mobile/lib/core/router.dart` — `/otp` route builder instantiates
  `OtpBloc` inline from `GoRouterState.extra` (session id, phone, resend
  seconds, otp length).
- `apps/mobile/lib/features/onboarding/data/auth_repository.dart` — `verifyOtp`
  + `resendOtp` propagate the envelope's `errorCode` on failure.
- `apps/mobile/lib/api/api_client.dart` — `ApiException.errorCode` +
  `.statusCode`.

## Static gates

| Gate | Result |
| --- | --- |
| `cd apps/mobile && flutter analyze` | **PASS** — `No issues found! (ran in 4.6s)` |
| `cd apps/mobile && flutter test` | **PASS** — `+118: All tests passed!` |
| `pnpm verify:mobile` (Nx wrapper) | **PASS** (delegates to `flutter analyze` + `flutter test`) |

The 118 tests include the 9 OTP bloc tests, the 5 updated OTP widget tests
(now assert against the `_SubmitCta` / `_ResendCta` `InkWell`s rather than
the pre-fidelity `ElevatedButton` / `GestureDetector`), and the wave-1 +
wave-2 regression bed (splash, phone-choice, phone-input, name-language,
paywall, no-PII-leak sweep). Zero regressions from the fidelity rewrite.

## Design token compliance (no-hex-literal check)

`grep -nE "Color\(0x|Color\(#|Colors\.[a-z]|#[0-9A-Fa-f]{3,6}"` against
`apps/mobile/lib/features/onboarding/otp/presentation/otp_screen.dart`:

- Every color reference resolves to an `AppColors.*` / `AppText.*` /
  `AppGradient.*` / `AppRadius.*` token from `lib/core/theme.dart`
  (`brand100`, `brand300`, `error100`, `error200`, `grey200`, `grey300`,
  `grey500`, `black`, `white`; `headingSm`, `bodySm`, `bodyMd`, `labelSm`,
  `labelMd`, `labelLg`, `wordmarkFigma`; `AppGradient.ctaLR`;
  `AppRadius.button`, `AppRadius.loginCardTop`).
- The **only** raw hex is `Color(0x0D000000)` at line 295 — the 5%-alpha
  upward card shadow (`0 -2 10 rgba(0,0,0,0.05)`), cited in the widget's
  design-source dartdoc and matched to Figma node `397:2680`. Authorized
  per the ticket brief.
- `Colors.transparent` (Material ink well hosting), `Colors.white.withValues(alpha: 0.15)`
  (splash tint), and `AlwaysStoppedAnimation<Color>(AppColors.white)`
  (progress indicator plumbing) are Flutter framework primitives, not
  brand colors. PASS.

## Acceptance criteria — coverage

### Rendering + digit-entry mechanics

| AC | Verdict | Evidence |
| --- | --- | --- |
| Default render matches Figma 397:2618 | **PASS** | `device/otp.png` vs `mcp__figma__get_screenshot(397:2618)` — cream top, brand cluster, white card, "Login to Prabhuji", info row, 4 orange-bordered boxes, faded gradient Submit, faded outlined "Resent OTP (N)", divider, terms row all present and positioned per sweep-table. |
| Invalid render matches Figma 520:4914 | **PASS** | `device/otp-wrong.png` vs `mcp__figma__get_screenshot(520:4914)` — red-bordered boxes + "⚠ Invalid OTP" pill (red text on `#F9EAEA` bg) present. Card auto-grows via `Column(mainAxisSize.min)`. |
| Digit boxes dynamically sized to `otpLength` | PASS | `_DigitBoxes` uses `List.generate(otpLength, …)`; widget tests exercise `otpLength: 4` and `otpLength: 6`. |
| Numeric-only keyboard | PASS | `keyboardType: TextInputType.number` + `FilteringTextInputFormatter.digitsOnly` per `_DigitBox`. |
| Focus advances forward per digit; backspace walks back | PASS | `_DigitBoxes.onChanged` + `KeyboardListener` on backspace when `controller.text.isEmpty`. |
| Submit disabled until complete + not verifying | PASS | `canSubmit = digitsSoFar.length == otpLength && !isVerifying && !isRateLimited`; widget test `submit CTA is disabled until digits complete` verifies both states against the new `_SubmitCta` InkWell. |

### Verify path

| AC | Verdict | Evidence |
| --- | --- | --- |
| Verify success → JWT stored via `AuthStore.write` | PASS | `otp_bloc.dart` — `_authStore.write(result.token)`. Bloc test asserts `authStore.writes == 1`. |
| `SessionRefreshed` dispatched on the orchestrator | PASS | Bloc test asserts exactly one `SessionRefreshed` on success. |
| Safety-net `context.go('/name-language')` | PASS | `otp_screen.dart:136–138` — listener on `OtpVerified`. |
| `OTP_INVALID` → invalid state (red borders + pill), boxes clear, focus reset | PASS | Bloc `code == 'OTP_INVALID'` branch emits `OtpInvalid(otpDigits:'')`; screen `_syncControllers('')` clears and refocuses. Visual proof: `device/otp-wrong.png` shows all four boxes red-bordered with cursor blinking in box 0. |
| `OTP_SESSION_EXHAUSTED` / `OTP_RATE_LIMITED` → distinct message; submit replaced with rate-limit banner | PASS | Both codes → `OtpRateLimited`; `_OtpCard` swaps `_SubmitCta` for a centered `bodySm(error200)` banner keyed `otp-rate-limited`. |

### Resend path + countdown

| AC | Verdict | Evidence |
| --- | --- | --- |
| Countdown owned by Bloc (`Stream.periodic(1s)`, NOT a widget Timer) | PASS | `otp_bloc.dart` — `Stream<int>.periodic(...)`. `grep -n Timer otp_screen.dart` still returns zero. |
| Resend disabled during countdown | PASS | `_ResendCta.tappable = !disabled && !isResending && !countingDown`; `Opacity(0.3)` when non-tappable. Sweep-table zone "Resend CTA" verifies the render. |
| Resend enabled at zero; tap → clears boxes + invalid + restarts countdown | PASS | Success branch emits `OtpIdle(otpDigits:'', countdownRemainingSeconds: resendAvailableAfterSeconds)`. Copy switches to "Resend OTP" (dropping the parenthetical) when countdown = 0 — visible in `device/otp-wrong.png` where the countdown has ticked to 0 by capture time. |
| Change No. → `/phone-input` | PASS | `bloc.add(ChangeNumberTapped())` then `context.go('/phone-input')`. Analytics event fires before nav so the snapshot has the correct attempt/resend counts. |

### State + analytics

| AC | Verdict | Evidence |
| --- | --- | --- |
| `OtpBloc` is `flutter_bloc` (no Riverpod/Provider/GetX/setState-for-shared-state) | PASS | `class OtpBloc extends Bloc<OtpEvent, OtpState>`; `grep` for `ref\.watch|ref\.read|Consumer|package:riverpod|flutter_riverpod|package:provider` against `otp/**` matches only the `BlocConsumer` widget (flutter_bloc, not Riverpod). `setState(` matches: 0. |
| All 9 analytics events fire with safe scalars only | PASS | `onboarding_otp_screen_viewed`, `onboarding_change_number_tapped`, `onboarding_otp_submitted { otp_digit_count_entered }`, `onboarding_otp_verified { is_new_user }`, `onboarding_otp_failed { temporary_block_applied }`, `onboarding_resend_otp_tapped`, `onboarding_resend_otp_result` — all payload keys verified for no raw phone / no raw OTP / no JWT. `test/analytics/no_pii_leak_test.dart` sweeps the OTP flow (test #114) and passes. |

## Visual Fidelity Gate — CLOSED

Maestro presence: **not required for this pass** — the fidelity captures were
produced via the already-committed `adb exec-out screencap` reproduction
recipe in `specs/evidence/TAM-51/fidelity/sweep-table.md` (§ Reproduction).
Prior QA's DEFERRED marker is now resolved: no `DEFERRED.md` exists under
`specs/evidence/TAM-51/fidelity/` (verified via `find`).

### Device captures — present

- `specs/evidence/TAM-51/fidelity/device/otp.png` — default state, 1080×2424,
  157KB. Orange-bordered empty boxes, faded gradient Submit, faded outlined
  "Resent OTP (8)" mid-countdown, full "+91 9876543210" phone display with the
  number bolded, "Change No." brand300 underlined right-aligned, terms row
  intact.
- `specs/evidence/TAM-51/fidelity/device/otp-wrong.png` — invalid state,
  1080×2424, 104KB. Red-bordered boxes with a cursor blinking in the first
  box (post-clear), "⚠ Invalid OTP" pill (red icon + `label-sm` red text on
  `#F9EAEA` pink bg) centered under the boxes, soft keyboard up, no
  "BOTTOM OVERFLOWED" ribbon.

### Per-screen Figma refs — present

- `figma-refs/otp.md` — node 397:2618, layout facts (login card at y=388, 412
  tall; digit boxes at y=124 with 12-px gap; Submit at y=204; Resend at y=256),
  token delta table, and divergences (full phone shown; masking helper
  removed).
- `figma-refs/otp-wrong.md` — node 520:4914, token delta table
  (`error100 = #F9EAEA`, `error200 = #DA1F1F`), pill geometry (94×24 at
  (117, 66), radius 24, 8h/4v padding, gap 4, 12×12 icon).

### Per-zone sweep — present

`specs/evidence/TAM-51/fidelity/sweep-table.md` enumerates 11 zones across
the two variants (cream top, login card, title, info row, digit boxes,
submit CTA, resend CTA, divider + terms, phone display, status bar / DEBUG
ribbon, invalid pill). Every zone marked **✅ matches** except two
authorized **➖ intentional** rows:

1. Status bar + DEBUG ribbon — system-owned and debug-build artifact,
   never in Figma.
2. Keyboard-up brand cluster on `otp-wrong` — the invalid-state repro
   necessarily types + submits a wrong code, which keeps the soft
   keyboard focused. The layout uses `resizeToAvoidBottomInset: false` +
   `OverflowBox` + `ClipRect` so the cream area softly clips the top of
   the temple silhouette while the wordmark stays visible and no
   overflow ribbon appears. Documented as intentional in the sweep table.

### Independent Figma-vs-device diff

Cross-checked `device/otp.png` against `mcp__figma__get_screenshot(397:2618)`
and `device/otp-wrong.png` against `mcp__figma__get_screenshot(520:4914)`
via the Figma MCP. All zones agree with the sweep-table verdicts:

- Cream top color, brand-cluster placement, "Prabhuji" wordmark weight/color.
- Card top-radius 20, upward soft shadow.
- "Login to Prabhuji" Inter SemiBold, "OTP sent to +91 …" with bolded
  number, right-aligned underlined orange "Change No.".
- Four boxes 48×56, 12-radius, 1.5px border (brand300 default / error200
  invalid), 12-px gap.
- Gradient Submit CTA at 44h, radius 8.
- Outlined 44h Resend CTA — device shows the countdown label "Resent OTP
  (8)" on the default capture (Figma shows "(20)"); the numeric delta is
  the runtime countdown value at capture time, not a fidelity gap.
- On invalid: red borders + red-on-pink "⚠ Invalid OTP" pill centered
  below the boxes. Everything else identical to default.

**Runtime-timing note (not a regression):** on `device/otp-wrong.png` the
resend CTA reads "Resend OTP" in enabled brand300 orange (no parenthetical,
no 30% opacity), because the countdown ticked to 0 during the type-wrong-code
→ submit flow that produced the capture. The widget's copy-and-opacity swap
at `countdownRemainingSeconds == 0` is verified by `_ResendCta.tappable` and
by the widget test `resend row shows the countdown while > 0 and is not
tappable`. Both the countdown-active and countdown-elapsed states are
correct per spec — the Figma frame just happens to freeze the timer at 20
seconds.

Visual-verify verdict: **APPROVED**

## Definition of Done — coverage

| DoD | Status | Evidence |
| --- | --- | --- |
| All acceptance criteria met | PASS | Tables above |
| Design Extraction gate + Phase 6 sweep + device captures | **PASS (deferral closed by `77b1249`)** | Sweep table + device PNGs + Figma refs under `specs/evidence/TAM-51/fidelity/` |
| `flutter analyze` clean | PASS | `No issues found!` |
| `flutter test` clean | PASS | `118/118 passing` |
| `pnpm verify:mobile` green | PASS | Nx wrapper of the above |
| Sweep verdict + device captures for both states | PASS | `device/otp.png` + `device/otp-wrong.png` + sweep-table with 11 zones |
| PR references this spec | OUT-OF-SCOPE for local QA — RTE gate |

## Cross-cutting rules

- **State management**: bloc-only; zero Riverpod/Provider/GetX imports and
  zero `setState(` in `otp/**`. PASS.
- **PII rule**: `grep -rnE "log\(|print\(|logger\.|debugPrint"` against
  `otp/**` returns zero. Every `trackEvent` payload carries scalars
  (counts, codes, latencies, flags) — never the raw phone, raw OTP, or JWT.
  Enforced by `test/analytics/no_pii_leak_test.dart` OTP flow (test #114). PASS.
- **401 handling**: bloc routes on `errorCode` (envelope), never on HTTP
  status; JWT written only on success. PASS.

## Regressions

None. The fidelity rewrite touched only `otp_screen.dart` (widget-only) and
added an asset; the bloc, repository, and analytics contracts are unchanged
and covered by the pre-existing 27 wave-2 tests plus the wave-1 regression
bed (118 total, all green). No non-cosmetic drift observed against Figma.

## Visual Fidelity Gate

Visual-verify verdict: APPROVED

## Overall verdict: APPROVED
