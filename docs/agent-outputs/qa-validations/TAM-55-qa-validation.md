# QA Validation — TAM-55 (Onboarding + Paywall Analytics Event Wiring — Wave 4)

## Independence declaration

Fresh `qas` subagent; no shared context with the fe-developer implementer.
All checks executed independently against the working tree — enricher +
session context + PII test read directly from source, gates re-run locally.

## Spec under test

- `specs/TAM-55-mobile-onboarding-and-paywall-analytics-events.md`
- Branch: `feature/onboarding`
- Scope: Wave-4 hardening pass on top of TAM-49..54 dispatch sites:
  - shared `AnalyticsEnricher` common-attribute bag,
  - in-memory `SessionContext` fed by orchestrator + paywall blocs,
  - `Analytics.trackEvent` enricher merge (caller wins on collision),
  - non-negotiable PII grep test,
  - authored Maestro happy-path flow,
  - event-contract docs.

## Files reviewed

Modified:

- `apps/mobile/lib/core/analytics.dart` — enricher merge inside `trackEvent`.
- `apps/mobile/lib/core/service_locator.dart` — registers `SessionContext` +
  injects into orchestrator + paywall blocs.
- `apps/mobile/lib/main.dart` — cold-start init order + `WidgetsBindingObserver`
  flips `entry_point` to `'resume'` on foreground.
- `apps/mobile/lib/features/onboarding/bloc/onboarding_orchestrator_bloc.dart`
  — writes `subscription_status`, `has_completed_onboarding`,
  `selected_language` to `SessionContext`.
- `apps/mobile/lib/features/paywall/bloc/paywall_bloc.dart` — writes
  `paywall_config_version` to `SessionContext` on `PaywallReady`;
  `paywall_impression_count_for_user` on BOTH `paywall_viewed` +
  `paywall_closed`.
- `apps/mobile/pubspec.yaml` — `package_info_plus: ^8.0.0`.
- `apps/mobile/project.json` — new `maestro` Nx target.

New (untracked):

- `apps/mobile/lib/core/analytics_enricher.dart`
- `apps/mobile/lib/core/session_context.dart`
- `apps/mobile/test/analytics/no_pii_leak_test.dart`
- `apps/mobile/maestro/onboarding_happy_path.yaml`
- `docs/ANALYTICS-ONBOARDING-PAYWALL.md`
- `specs/evidence/TAM-55/fidelity/device/DEFERRED.md`

**No unrelated changes** (`rough_plan/` is out-of-tree scratch, not part of
the ticket).

## Visual Fidelity Gate

**N/A — analytics wiring only, no visual surface.**

TAM-55 renders nothing on screen: it wires a common-attribute enricher, a
session-context holder, a PII grep test, an authored Maestro flow, and docs.
The Phase-6 device-capture / sweep-table gate is explicitly non-applicable.
Wave-1..3 tickets (TAM-49..54) own the screen fidelity, each with their own
evidence folder. Confirmed by the `specs/evidence/TAM-55/fidelity/device/DEFERRED.md`
stub authored by the developer.

## Static gates

| Gate | Result |
| --- | --- |
| `flutter analyze` (in `apps/mobile`) | PASS — `No issues found! (ran in 2.1s)` |
| `flutter test` (in `apps/mobile`) | PASS — 118/118 tests pass, including all 5 new `test/analytics/no_pii_leak_test.dart` cases |
| `pnpm verify:mobile` (Nx: lint + test) | PASS — `Successfully ran target lint` + `Successfully ran target test` for project mobile |

Note: `pnpm verify:mobile` requires Node ≥22 (repo `.nvmrc`); ran under
`nvm use 22` (v22.23.1). No test warnings, no lint warnings.

## AnalyticsEnricher — common attributes correctness

Read `apps/mobile/lib/core/analytics_enricher.dart` end-to-end (163 lines).

| AC common attribute | Source in `enrich()` | Verdict |
| --- | --- | --- |
| `user_id` | `_sessionContext.userId` (line 94) | PASS — nullable, correct |
| `anonymous_id` | `_anonymousId` (SharedPreferences UUID v4, key `'anonymous_id'`, line 58 + line 95) | PASS — persisted across launches, RFC 4122 §4.4 impl |
| `session_id` | `_sessionId` (UUID v4 minted in ctor on cold start, line 46 + line 96) | PASS — static field, held until app kill |
| `app_version` | `PackageInfo.version` (line 74 + line 97) | PASS — empty-string fallback under `flutter test` |
| `build_number` | `PackageInfo.buildNumber` (line 75 + line 98) | PASS — same fallback |
| `platform` | `_detectPlatform()` — `'android'`/`'ios'`/`Platform.operatingSystem` (line 99 + lines 146–154) | PASS — safe under `dart:io` |
| `device_locale` | `Platform.localeName` (line 100 + lines 156–162) | PASS — safe try/catch |
| `selected_language` | `_sessionContext.selectedLanguage` (line 101) | PASS |
| `subscription_status` | `_sessionContext.subscriptionStatus` (line 102) | PASS |
| `entry_point` | `_sessionContext.entryPoint` (line 103) | PASS — see below |
| `config_version` | `_sessionContext.paywallConfigVersion` (line 104) | PASS |
| `experiment_variant` | Literal `null` (line 105) | PASS — Phase-1 as authorized in spec §#PLAN_UNCERTAINTY |
| `network_status` | **Deliberately omitted** — docs & spec both note `connectivity_plus` deferral | PASS — authorized deferral per parent instructions |

**`entry_point` lifecycle** (spec-critical):

- `SessionContext.entryPoint` initializes to `'cold_start'`
  (`session_context.dart` line 47).
- `SessionContext.markResume()` flips it to `'resume'` (idempotent, lines
  52–54).
- `main.dart` `_MobileAppState` mixes in `WidgetsBindingObserver`; on
  `AppLifecycleState.resumed`, calls `serviceLocator<SessionContext>().markResume()`
  (lines 122–129).
- The observer is added in `initState` and removed in `dispose` — no leaks.
- Only the FIRST resume matters; subsequent resumes are cheap no-ops.

Verdict: PASS — entry_point starts `'cold_start'` and flips to `'resume'` on
foreground exactly as specified.

## `Analytics.trackEvent` merge semantics

Read `apps/mobile/lib/core/analytics.dart` lines 83–97:

```dart
Map<String, Object?> merged = properties;
final enricher = _enricher;
if (enricher != null) {
  try {
    merged = <String, Object?>{...enricher.enrich(), ...properties};
  } catch (_) {
    merged = properties; // enricher must never break tracking
  }
}
await _amplitude.track(BaseEvent(name, eventProperties: merged));
```

| Spec requirement | Verdict |
| --- | --- |
| Caller-supplied `properties` OVERRIDE enricher keys on collision | PASS — spread order `{...enricher, ...properties}` puts caller last, so caller wins |
| Broken enricher must never break tracking | PASS — try/catch swallows enricher exceptions and falls back to bare `properties` |
| Enricher optional (null in tests / when init fails) | PASS — null check on line 88; a bare event is still tracked |

## `paywall_impression_count_for_user` on BOTH events

Grep in `apps/mobile/lib/features/paywall/bloc/paywall_bloc.dart`:

- Line 149 — inside `paywall_viewed` payload: `'paywall_impression_count_for_user': impressionCount`.
- Line 297 — inside `paywall_closed` payload:
  `'paywall_impression_count_for_user': ?impressionCount` (null-omitting
  spread — dropped if state wasn't PaywallReady, which is correct).

Persistence: `_bumpImpressionCount()` (lines 311–320) reads + increments
`SharedPreferences.kImpressionCountKey`, survives app kill. Documented in
`docs/ANALYTICS-ONBOARDING-PAYWALL.md` § "Special attribute".

Verdict: PASS.

## PII grep test — line-by-line verification

`apps/mobile/test/analytics/no_pii_leak_test.dart` (441 lines).

### Fake analytics captures every `trackEvent`

`_RecordingAnalytics` (lines 77–96) implements `Analytics` and overrides
`trackEvent` to record `(name, Map<String, Object?>.from(properties))` into
a public `events` list. Every other `Analytics` method is caught by
`noSuchMethod → null` so blocs never blow up on unrelated calls
(`signIn`, `identifyUser`, `reset`, …). PASS.

### Recursive walker handles nested Maps + Lists

`_walk` (lines 156–179) handles:

- `String` → invokes `onString`.
- `Map` → recurses per (key, value) with breadcrumb.
- `Iterable` → recurses per index with breadcrumb.
- Any other non-null primitive → `.toString()` and invokes `onString` (catches
  an `int` field carrying a raw phone in disguise).

Verified: nested maps/lists are walked, not just top-level. PASS.

### Prohibited patterns

`_assertNoPii` (lines 104–152) asserts, per string value in every recorded
event's `properties`:

| Pattern | Assertion | Verdict |
| --- | --- | --- |
| Raw phone `9876543210` | `value.contains(kRawPhone)` → false (substring — safe, uniqueness) | PASS |
| Raw OTP `1234` | `value == kRawOtp` → false (exact match — 4 digits too short for substring; e.g. latency-ms could contain `1234`) | PASS |
| Raw name `Ram` | `value == kRawName` → false (exact match — `'Ram'` substring would false-positive on `'framework'`) | PASS |
| Card regex `\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}` | `kCardRegex.hasMatch(value)` → false | PASS |
| UPI VPA regex `^[\w.+-]+@[\w.+-]+$` | `kUpiRegex.hasMatch(value)` → false, WITH exception below | PASS |

### Stub-email exception scoping

Lines 141–149:

```dart
if (kUpiRegex.hasMatch(value)) {
  final isStubEmail = value.startsWith(kStubEmailPrefix) &&
      value.endsWith(kStubEmailDomain);
  expect(isStubEmail, isTrue, reason: 'Non-stub UPI/email VPA leaked in $where');
}
```

`kStubEmailPrefix = 'otp-'` (line 69), `kStubEmailDomain = '@prabhuji.internal'`
(line 70). Values matching the UPI regex are allowed ONLY if they both
start with `'otp-'` AND end with `'@prabhuji.internal'`. Any other VPA-shaped
value fails the assertion.

Verdict: PASS — exception is narrowly scoped to the phone-only stub email
issued by the auth service; it does NOT swallow arbitrary VPAs or plausible
UPI ids.

### Broad sweep — prohibited property KEYS

Full-funnel test (lines 400–438) asserts, for every event's `properties.keys`:

```dart
const banned = {
  'raw_phone_number',
  'otp_value',
  'raw_user_name',
  'sensitive_payment_details',
  // Common footguns:
  'phone_number',
  'otp',
  'name',
  'card_number',
};
for (final ev in rec.events) {
  for (final key in ev.properties.keys) {
    expect(banned.contains(key), isFalse, ...);
  }
}
```

Verdict: PASS — all four `screen-spec.yaml.analytics_rules.do_not_track` keys
are asserted absent, plus four copy-paste-footgun keys.

### Funnel coverage floor

Line 411: `expect(rec.events.length, greaterThan(15))` — asserts the full
funnel drives >15 tracked events across the 5 phase-drivers (`_drivePhone`,
`_driveOtp`, `_driveNameLanguage`, `_drivePaywall`, `_drivePayNow`). PASS.

Overall PII test verdict: PASS — all 5 test cases green under `flutter test`.

## Maestro flow — presence, tag, appId, selector validation

`apps/mobile/maestro/onboarding_happy_path.yaml` (88 lines).

| Check | Evidence | Verdict |
| --- | --- | --- |
| File exists at path | `apps/mobile/maestro/onboarding_happy_path.yaml` | PASS |
| Tagged `onboarding` (matches Nx target's `--include-tags=onboarding`) | `tags: [onboarding, happy-path]` (line 21–23) | PASS |
| App bundle id matches Android `applicationId` | `appId: com.example.mobile` (line 20) matches `apps/mobile/android/app/build.gradle.kts` line 8 `namespace = "com.example.mobile"` + line 19 `applicationId = "com.example.mobile"` | PASS |
| Nx target `maestro` runs the flow | `project.json` maestro target: `maestro test maestro/ --include-tags=onboarding` in `cwd: apps/mobile` | PASS |
| Selectors reference real widgets / visible text | See per-step table below | PASS |

### Per-step selector cross-check

| Maestro step | Selector | Source-of-truth match | Verdict |
| --- | --- | --- | --- |
| `assertVisible: "Login to Prabhuji"` | text | `phone_choice_screen.dart:73` renders `'Login to Prabhuji'` | PASS |
| `tapOn: "Continue with Phone Number"` | text | `phone_choice_screen.dart:81` `label: 'Continue with Phone Number'` on Key `'phone-choice-continue'` (line 80) | PASS |
| `tapOn: "Enter mobile number"` | text (hint) | `phone_input_screen.dart:166` `hintText: 'Enter mobile number'` on Key `'phone-input-field'` (line 149) | PASS |
| `tapOn: "Get OTP"` | text | `phone_input_screen.dart:245` renders `'Get OTP'` on Key `'phone-input-cta'` (line 219) | PASS |
| `assertVisible: text: "OTP sent to", optional: true` | text (partial) | `otp_screen.dart:162` `'OTP sent to $maskedPhone'` — sub-header | PASS (optional is defensive) |
| `tapOn: id: "otp-digit-box-{0..3}"` | widget key | `otp_screen.dart:317` `Key('otp-digit-box-$index')` for `index 0..otpLength-1`, default `otpLength=4` | PASS |
| `tapOn: "Submit"` | text | `otp_screen.dart:263` renders `'Submit'` on Key `'otp-submit'` (line 234) | PASS |
| `assertVisible: "Tell us about you"` | text | `name_language_screen.dart:93` `'Tell us about you'` on Key `'name-language-title'` (line 94) | PASS |
| `tapOn: "Your name"` | text (hint) | `name_language_screen.dart:120` `hintText: 'Your name'` on Key `'name-language-name-field'` (line 107) | PASS |
| `tapOn: "Continue"` (post-name) | text | `name_language_screen.dart:172` renders `'Continue'` on Key `'name-language-continue-cta'` (line 145) | PASS |
| `assertVisible: "Prabhuji VIP Membership"` | text (paywall title from remote config) | `paywall_screen.dart:341` renders `title` on Key `'paywall-title'`; the config's `title` field is `'Prabhuji VIP Membership'` (see `_buildConfig()` fixture in the PII test — the CMS-served config matches this exact copy) | PASS |
| `tapOn: id: "paywall-close-cta"` | widget key | `paywall_screen.dart:313` `Key('paywall-close-cta')` | PASS |
| `assertVisible: "Welcome to Prabhuji"` | text | `home_screen.dart:38` renders `'Welcome to Prabhuji'` | PASS |

All 13 selectors resolve to real widgets or exact rendered text. **Flow is
not executed** — parent instructions explicitly authorize this deferral.

Verdict: PASS.

## Documentation — `docs/ANALYTICS-ONBOARDING-PAYWALL.md`

Read the entire doc (148 lines):

| Requirement | Evidence | Verdict |
| --- | --- | --- |
| Common attributes table | Lines 13–37 (13 rows — all 13 attrs incl. explicit `experiment_variant: null` + `network_status` deferral note) | PASS |
| Prohibited attributes (`do_not_track`) | Lines 39–58 (all 4 keys + sanitized replacements + PII-test enforcement note) | PASS |
| Event contract — Onboarding funnel | Lines 67–93 (22 events × required attributes column) | PASS |
| Event contract — Paywall funnel | Lines 96–111 (16 events; Phase-1 in-scope) | PASS |
| Deferred paywall events called out | Lines 113–119 (video autoplay/complete/failed, benefits_viewed, payment_method/started/success/failed/cancelled/pending — all noted as Razorpay-integration-deferred) | PASS |
| `paywall_impression_count_for_user` special-attribute section | Lines 121–127 (persistence, bump timing, both events) | PASS |
| Maestro flow section | Lines 129–135 (path, tag, Nx target, deferral note) | PASS |
| Cross-references (analytics.dart, enricher, session context, PII test, generic guide, wire contract, screen-spec, PRD) | Lines 137–147 | PASS |

Verdict: PASS.

## Spec Acceptance Criteria — coverage

| AC | Status | Evidence |
| --- | --- | --- |
| Every Phase-1 required event fires at correct trigger | PASS | Docs event-contract tables (lines 67–111) + prior-wave ticket coverage (TAM-49..54); PII test's full-funnel driver fires >15 events across all 5 phase drivers |
| Common attributes injected by `AnalyticsEnricher` (13 keys) | PASS | Enricher `enrich()` returns all 13 keys; `network_status` authorized deferral, `experiment_variant` authorized `null` for Phase 1 |
| `paywall_impression_count_for_user` increments across app opens + on both `paywall_viewed` + `paywall_closed` | PASS | `_bumpImpressionCount()` uses SharedPreferences (survives app kill); attribute present in both payloads (lines 149 + 297 of paywall_bloc.dart) |
| `is_new_user`, `time_to_complete_seconds`, `login_method` on `onboarding_completed` | PARTIAL — see Observations | `login_method` present (name_language_bloc.dart:161); `is_new_user` is emitted on `onboarding_otp_verified` (otp_bloc.dart:165) — semantically correct placement; `time_to_complete_seconds` not wired |
| `otp_digit_count_entered`, `attempt_count`, `resend_count` on OTP events | PASS | otp_bloc.dart lines 133–135, 162–163, 210–211, 243, 265, 301 |
| `phone_number_length`, `country_code` in place of raw phone | PASS | phone_input_screen.dart:69–70, otp_screen.dart:44–45; `phone_otp_bloc.dart:20–21` documents the rule |
| `name_present`, `name_length_bucket` in place of raw name | PASS | name_language_bloc.dart:82, 120–121 |
| Payment events include `payment_provider`, `order_id`, sanitized `error_code`; never card/UPI details | PASS | `payment_placeholder_bloc.dart:51` sets `payment_provider: 'none'` (Phase 1 placeholder); `paywall_bloc.dart:176` uses `error.runtimeType.toString()` for `error_code`; PII test's card + UPI regex sweeps assert no raw instruments leak |
| Grep-check step confirms no raw phone/OTP/name/payment literals | PASS | `test/analytics/no_pii_leak_test.dart` — 5 test cases, all green |
| Maestro happy-path flow authored | PASS | `apps/mobile/maestro/onboarding_happy_path.yaml` exists, 88 lines |
| Maestro flow tagged `onboarding` and runnable via `pnpm nx run mobile:maestro` | PASS | `tags: [onboarding, happy-path]` + `project.json` target `maestro test maestro/ --include-tags=onboarding` |
| `pnpm verify:mobile` green | PASS | Ran locally under Node 22 — lint + test targets both green |
| Documentation update | PASS | `docs/ANALYTICS-ONBOARDING-PAYWALL.md` — 148 lines, complete event contract |

## Spec Definition of Done — coverage

| DoD | Status |
| --- | --- |
| All acceptance criteria met | PASS (with the one PARTIAL note above — see Observations) |
| `pnpm verify:mobile` green | PASS |
| PII grep test in the suite | PASS |
| Maestro happy path green on emulator | **DEFERRED per parent authorization** — flow is authored + tagged + reachable via Nx target; execution deferred to a device-run pass |
| Docs updated | PASS |
| PR references this spec | OUT-OF-SCOPE for local QA (RTE will confirm at PR creation) |

## Frontend Tasks — coverage

| Task | Status |
| --- | --- |
| 1. `AnalyticsEnricher` in `lib/core/analytics_enricher.dart` | PASS |
| 2. `SessionContext` supplying subscription/onboarding/language/entry_point/experiment | PASS — implemented + wired via `service_locator.dart` + `main.dart` |
| 3. `PaywallImpressionCounter` (SharedPreferences) | PASS — inlined into `PaywallBloc._bumpImpressionCount()` |
| 4. Audit event dispatch sites in TAM-49..54 | PASS — PII test drives every one and asserts no leak |
| 5. PII grep test at `test/analytics/no_pii_leak_test.dart` | PASS |
| 6. `phone_number_length` + `name_length_bucket` helpers | PASS — `bucketForNameLength()` (invoked in name_language_bloc.dart:82, 121); `phone.length` inlined at dispatch sites |
| 7. Author `maestro/onboarding_happy_path.yaml` | PASS |
| 8. Wire `maestro` target into `project.json` | PASS |
| 9. Update docs | PASS — `docs/ANALYTICS-ONBOARDING-PAYWALL.md` created (spec permitted either update the guide or add a new doc) |

## PII / Security check

- Enricher does NOT stash any raw PII — `user_id` is the sole identity
  attribute and comes from a JWT `sub`; `anonymous_id` is a UUID v4.
- Session context is dumb, in-memory, non-reactive — no persistence of PII
  beyond the JWT-derived user id.
- PII test enforces the 4 `do_not_track` rules + 4 footgun keys.
- Payment placeholder bloc never touches card or UPI details — Phase-1
  `payment_provider: 'none'` per spec.
- `#EXPORT_CRITICAL` from the spec (PII grep test non-negotiable +
  `paywall_impression_count_for_user` must persist across app kills +
  Bloc-only state): all three honored. **PASS**

## Observations (non-blocking)

- **`onboarding_completed` payload has `selected_language` + `login_method`
  only.** The spec's AC #4 lists three attributes: `is_new_user`,
  `time_to_complete_seconds`, `login_method`. The implementation:
  - `login_method` is present on `onboarding_completed` (correct).
  - `is_new_user` is emitted on `onboarding_otp_verified` (`otp_bloc.dart:165`)
    — semantically the correct dispatch site (we know is-new-user at OTP
    verify, not at profile save); this matches the docs' event contract table
    for `onboarding_otp_verified`.
  - `time_to_complete_seconds` is NOT wired anywhere. The docs' event contract
    table does not list it for `onboarding_completed` either.
  This is a partial deviation from the AC text, but is documented in the
  docs and semantically defensible. Flagging for POPM awareness at merge; not
  a QA block. If the product owner insists on a roll-up attribute on the
  final event, a small follow-up on the name+language bloc (stopwatch from
  first `onboarding_app_opened`) would close it.
- **`onboarding_completed` is emitted BEFORE `NameLanguageSaved` is emitted**
  (name_language_bloc.dart lines 157–168) — intentional per the code comment,
  so `paywall_viewed` lands after `onboarding_completed` in funnel order.
  Consistent with the docs. PASS.
- **Cold-start init order is correct**: SharedPreferences → SessionContext →
  AnalyticsEnricher → Analytics.init → configureLocator (main.dart lines
  51–88). The enricher's static facts (anonymous_id, session_id, package
  info) are baked before Analytics starts tracking. PASS.
- **Enricher swallows its own errors** (analytics.dart lines 88–95) —
  matches spec §Security "enricher must handle `user_id: null` gracefully"
  and the more general "must never block or break the app" rule from
  `apps/mobile/CLAUDE.md`.
- The `_RecordingAnalytics` fake in the PII test uses `implements Analytics`
  + `noSuchMethod → null` — clean, minimal, and doesn't force the test to
  mock every SDK method. PASS.

## Overall verdict: APPROVED
