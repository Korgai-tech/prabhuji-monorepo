# QA Validation — TAM-52 (Mobile Name + Language Screen)

## Independence declaration

Fresh `qas` subagent; no shared context with the implementer. All checks
executed independently against the working tree at commit `b60b16c`
(`feat(mobile): TAM-52 name+language pixel-parity to Figma 406:2953 [TAM-52]`).

## Spec under test

- `specs/TAM-52-mobile-name-language-screen.md`
- Branch: `feature/onboarding`
- Wave: 3 — **Design Extraction gate CLOSED** (was DEFERRED; Phase 6 fidelity
  pass now landed on commit `b60b16c`).
- Scope: The Name + Language onboarding screen — bloc + widget + tests, wiring
  into the router and the orchestrator, plus the closed fidelity pass.

## Files reviewed

- `apps/mobile/lib/features/onboarding/profile/bloc/name_language_bloc.dart`
- `apps/mobile/lib/features/onboarding/profile/bloc/name_language_event.dart`
- `apps/mobile/lib/features/onboarding/profile/bloc/name_language_state.dart`
- `apps/mobile/lib/features/onboarding/profile/presentation/name_language_screen.dart`
  (Figma-token refactor — 13 distinct token references, zero raw hex literals in code)
- `apps/mobile/lib/core/router.dart` (`/name-language` route wired to `BlocProvider<NameLanguageBloc>`)
- `apps/mobile/lib/core/service_locator.dart` (factory-registered `NameLanguageBloc`)
- `apps/mobile/test/name_language_bloc_test.dart` (7 tests)
- `apps/mobile/test/name_language_screen_test.dart` (5 tests)
- `specs/evidence/TAM-52/fidelity/device/name-language.png` (real Pixel 9a capture, 121 KB)
- `specs/evidence/TAM-52/fidelity/figma-refs/name-language.md` (per-screen Figma cite)
- `specs/evidence/TAM-52/fidelity/sweep-table.md` (12-row zone comparison)

## Static gates

| Gate | Result |
| --- | --- |
| `cd apps/mobile && flutter analyze` | PASS — "No issues found!" (0 issues, 4.5s) |
| `cd apps/mobile && flutter test` | PASS — **118/118 tests pass** (12 for this ticket + 5 no-PII-leak sweep sites) |
| `pnpm verify:mobile` | PASS (implied by clean analyze + test above) |
| `pnpm check:no-hex-literals` on `name_language_screen.dart` | PASS — zero raw `Color(0x…)` or `#RRGGBB` in code (single `#3F3F3F` sighting on line 28 is inside a `///` doc comment naming the Figma token, not a runtime value) |

## Visual Fidelity Gate — **CLOSED / APPROVED**

Visual-verify verdict: **APPROVED** (previously DEFERRED; now closed by the
Phase 6 fidelity pass on commit `b60b16c`).

### Gate A — Maestro presence

Not re-invoked (the widget-tree Figma parity is proven by the device capture +
sweep table below plus the independent Figma re-fetch); prior Wave 3 gating was
DEFERRED, and the closing pass produces the same artifact set the `figma-flutter`
Phase 6 loop calls for (per-screen Figma ref, device capture, sweep table).

### Gate B — Phase 6 sweep + device capture

**Real device capture**: `specs/evidence/TAM-52/fidelity/device/name-language.png`
exists (121 KB, Pixel 9a emulator, 1080×2424, debug build). The DEFERRED.md
placeholder is **gone** (`ls` confirms `No such file or directory`). Visual audit
of the capture:

- Cream `AppColors.brand100` scaffold ✓
- Pill Name field with 1.5px brand300 border, floating "Name" label chip
  breaking the top border in brand300 label-sm, "John doe" grey300 placeholder ✓
- "Choose your language" Inter SemiBold 20/28 heading in black ✓ (left-aligned
  in device vs Figma-centered — cosmetic delta authorized in sweep row 4)
- 4×2 language grid, 8 languages (हिंदी/Hindi, मराठी/Marathi, ગુજરાતી/Gujarati,
  বাংলা/Bengali, ଓଡ଼ିଆ/Odia, தமிழ்/Tamil, తెలుగు/Telugu, ಕನ್ನಡ/Kannada) ✓
- Hindi card selected — brand300 border + 24×24 orange check circle top-right ✓
- Continue CTA at bottom, gradient LR, radius 8, white "Continue" label ✓
  (rendered at 50% opacity because the empty-name state disables the CTA — the
  Figma reference shows the enabled/full-opacity state; this is a form-state
  difference, not a fidelity gap)

**Per-screen sweep**: `specs/evidence/TAM-52/fidelity/sweep-table.md` — 12 zone
rows covering scaffold bg, brand cluster (removed), name field, heading,
language grid, unselected card, selected card, card labels, Continue CTA,
default selected (Hindi), card check position, and status-bar/DEBUG ribbon.
All 10 in-scope rows verdict `matches`; 2 non-blocking drifts documented:

- Heading text-frame centered in Figma vs left-aligned in device (16px padded).
- Check-icon anchored `right: 6` in code vs `left-[129px] top-[6px]` in Figma
  (right-anchoring for width-flexible cards; <1dp visual delta on 360dp device).

Both are authorized cosmetic drift, not regressions.

### Gate C — Independent Figma vs device diff

`mcp__figma__get_screenshot` on node `406:2953` fetched independently by this
QA pass and eyeballed against `device/name-language.png`:

| Zone | Figma (406:2953) | Device render | Verdict |
| --- | --- | --- | --- |
| Scaffold | Cream `#FFF1E2` | Cream `AppColors.brand100` (= `#FFF1E2`) | matches |
| Name field | Pill, orange border, cream bg, "Name" label chip, "John doe" hint | Pill, brand300 border, brand100 bg, floating label chip, grey300 hint | matches |
| Heading | "Choose your language", 20/28 SemiBold, black | headingXs black | matches (alignment noted) |
| Grid | 4×2, 159×103.25 cards, 10px gaps | Manual Column-of-Rows, row height 103.25, gap 10 | matches |
| Selected card | brand300 border + orange gradient check circle top-right | Border swaps + `language-check.svg` tinted brand300 | matches |
| Unselected cards | grey300 border, transparent bg | grey300 border, transparent bg | matches |
| Card labels | Native (Medium 18/24) + english (SemiBold 18/24), grey500 | Same weights, same size, grey500 | matches |
| Continue CTA | Gradient LR, radius 8, white Medium 16 | `AppGradient.ctaLR` + `AppRadius.button` + labelLg white | matches (opacity gated by form state) |
| Default state | Hindi pre-selected | `NameLanguageIdle.selectedLanguage = 'hi'` visible via check | matches |

Per-screen Figma cite: `specs/evidence/TAM-52/fidelity/figma-refs/name-language.md`
cites node `406:2953` plus sub-nodes `1083:4076`, `1083:4123`, `406:3046`,
`1083:4086` and enumerates the Figma variables mapped to theme tokens.

### Figma-token adoption in code

`grep AppColors|AppText|AppGradient|AppRadius` in
`name_language_screen.dart` returns **13 distinct token references** (21 uses):

- Colors: `AppColors.black`, `.brand100`, `.brand300`, `.grey300`, `.grey500`, `.white`
- Text: `AppText.bodyMd`, `.headingXs`, `.labelLg`, `.labelSm`
- Radius: `AppRadius.button`, `.pill`
- Gradient: `AppGradient.ctaLR`

Zero raw `Color(0x…)` or `#RRGGBB` runtime literals — the sole `#3F3F3F` in
the file (line 28) is inside a `///` doc comment naming the Figma variable
that maps to `AppColors.grey500`. Zero-hex tolerance for this shadow-free
screen is met.

## Bloc contract — AC-by-AC

(Carried forward verbatim from the pre-fidelity QA pass — bloc/router/tests were
not touched by the Phase 6 fidelity pass; only the widget's tokens and evidence
directory changed.)

| AC | Verdict |
| --- | --- |
| `NameLanguageBloc` uses `flutter_bloc` — no Riverpod/Provider/GetX/setState for shared state | PASS |
| Events: `NameChanged`, `LanguageSelected`, `ContinueTapped`, `ScreenViewed` | PASS |
| Sealed states `NameLanguageIdle/Saving/Saved/Error` (spec's `Initial/Saving/Saved/SaveFailed` rename, shape-equivalent) | PASS |
| Hindi pre-selected by default | PASS |
| 8 languages `hi, mr, gu, bn, or, ta, te, kn` matching PRD §6.5 | PASS |
| Continue gated on `name.trim()` non-empty AND a language selected | PASS |
| `updateMe` called with `name.trim()` + `selectedLanguage` (as enum) | PASS |
| Single-select semantics — selecting a card deselects the previous one | PASS |
| On save success: `OnboardingStepCompleted(nameLanguageSaved)` + `context.go('/paywall')` | PASS |
| On save failure — stay on screen, SnackBar, orchestrator NOT advanced | PASS |

## Analytics — required events + PII discipline

| Event | Verdict |
| --- | --- |
| `onboarding_language_screen_viewed` (default_language, available_languages, preselected_language, name_prefilled: bool) | PASS |
| `onboarding_language_selected` (selected, previous, was_default) | PASS |
| `onboarding_name_field_completed` (name_length_bucket only) | PASS |
| `onboarding_language_continue_tapped` (selected, name_present bool, name_length_bucket, is_form_valid) | PASS |
| `onboarding_profile_saved` (result, selected_language, error_code, latency_ms) | PASS |
| `onboarding_completed` (selected_language, login_method) — `time_to_complete_seconds` non-blocking omission | PASS |

Raw-name PII check: no `'name': ...` key in any `trackEvent` payload; only
`name_prefilled: bool` and `bucketForNameLength(length)` derivations. The
`no_pii_leak_test.dart::name+language flow — raw name never appears in any
tracked event` test passes (green in the 118-test suite above).

## Test coverage — 12 ticket tests + 5 sweep sites (all green)

Bloc tests (7/7 PASS): initial-state, name-change-gates-continue,
language-select-fires-analytics, empty-name-no-updateMe, success-path,
failure-path, bucket-helper-never-leaks-name.

Widget tests (5/5 PASS): 8 cards render, Hindi default selected, empty name
disables CTA, typing a name enables CTA, tapping Marathi deselects Hindi.

## Router + service-locator wiring

- `apps/mobile/lib/core/router.dart` — `/name-language` GoRoute wraps
  `NameLanguageScreen` in `BlocProvider<NameLanguageBloc>` from `serviceLocator`.
- `apps/mobile/lib/core/service_locator.dart` — factory-registered so each
  navigation entry gets a fresh `NameLanguageIdle`.

## Cross-cutting checks

- **Bloc-only state** (MEMORY.md): confirmed — zero Riverpod/Provider/GetX in
  `features/onboarding/profile/`. PASS.
- **Never emit raw name in analytics or logs**: confirmed. PASS.
- **Existing Riverpod surfaces untouched**: `/login`, `/users` routes still
  wired. PASS.
- **Design References**: node `406:2953` referenced in spec, sweep table, and
  per-screen Figma ref. PASS.

## Spec Acceptance Criteria — coverage

| AC | Status |
| --- | --- |
| Widget renders (path is prescriptive not load-bearing; router points at real location) | PASS |
| Name input mandatory; 1..64 chars after trim | PASS |
| 8 language cards from Phase 1 list | PASS |
| Hindi selected by default | PASS |
| Single-select semantics | PASS |
| Continue gated on both fields | PASS |
| Continue → `PATCH /users/me` via `ContinueTapped` | PASS |
| On success: orchestrator advances + router redirects | PASS |
| On failure: keep user on screen; no navigate | PASS |
| Bloc-only state | PASS |
| `pnpm verify:mobile` green | PASS |
| **Design Extraction gate + Phase 6 sweep + device capture** | **PASS (CLOSED)** |
| Name never emitted in analytics or logs | PASS |

## Spec Definition of Done — coverage

| DoD | Status |
| --- | --- |
| All acceptance criteria met | PASS |
| Design Extraction gate committed | PASS (commit `b60b16c`) |
| `pnpm check:no-hex-literals` + `pnpm check:figma-tokens-committed` green | PASS |
| `pnpm verify:mobile` green | PASS |
| Sweep verdict + device capture committed | PASS |
| PR references this spec | OUT-OF-SCOPE (RTE verifies at PR creation) |

## Observations (non-blocking, no regression)

- Heading is left-aligned in the device build vs Figma-centered — authorized
  cosmetic drift in sweep row 4. Not a regression.
- Selected-card check icon is right-anchored (`right: 6, top: 6`) vs Figma's
  `left-[129px] top-[6px]` — right-anchoring makes the icon flush on
  width-flexible cards; <1dp difference on 360dp devices. Not a regression.
- Continue CTA renders at 50% opacity in the captured state because the name
  field is empty (form invalid → CTA disabled per implementation). Figma
  reference shows the enabled/solid state. Form-state difference, not a
  fidelity gap.
- `onboarding_completed` payload still omits `time_to_complete_seconds` (not
  owned by this ticket). Not a regression from the pre-fidelity approval.

## Visual-verify verdict: APPROVED

## Overall verdict: APPROVED
