---
name: visual-verify
description: Independent QAS gate that verifies rendered mobile UI matches the Figma design across viewports — not only pixel parity but the semantic layout intent (which elements stay fixed, which grow, which preserve aspect ratio). Layers on top of the existing figma-flutter Phase 6 sweep-table + goldens + layout-intent test by spawning a fresh vision-LLM subagent per (screen × viewport) and emitting a structured APPROVED/BOUNCED verdict. Use when reviewing or approving any diff that touches `apps/mobile/lib/features/**/screens/**`, `apps/mobile/lib/shared/widgets/**`, or `apps/mobile/lib/core/theme.dart`.
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Agent
---

# Visual Verification Skill

## Purpose

`flutter analyze` proves the code compiles. `flutter test` proves the widget tree renders. The `_multi_size_test.dart` (pattern: `patterns_library/testing/flutter-multi-size-smoke.md`) proves nothing overflows at 3×3 sizes. The `_layout_intent_test.dart` (pattern: `patterns_library/testing/flutter-layout-intent.md`) proves pinned/flex y-coordinates at 600/800/1200 dp. The **`figma-flutter` Phase 6 sweep-table** proves element presence + placement at one viewport.

**None of them prove the design's responsive INTENT is honored** — that the app-bar stayed 56dp when the screen went from 600 to 1200 dp, that the hero video card kept its 16:9 aspect ratio at 320dp width, that the mantra text zone (not the wrapper) grew when the device did, that the icon grid reflowed to 3 columns on a narrow phone.

This skill closes that gap with three moves:

1. **Multi-viewport rendered artifacts** — require rendered screenshots at (320 / 390 / 428 dp width) × (600 / 800 / 1200 dp height), sourced from goldens or Maestro/emulator captures.
2. **Independent vision-LLM verification** — fresh `qas` subagent per (screen × viewport), reads the Figma reference + the rendered PNG, emits a structured layout-intent verdict.
3. **Semantic checks, not just pixel-parity** — the subagent evaluates each element against its declared behavior (FIXED / FLEX / ASPECT / RESPONSIVE), not just "does it match."

Together with the existing gates: goldens = regression lock at one height; layout-intent test = geometric coordinates at three heights; **this skill = semantic behavior across the viewport grid, judged against Figma.**

## When This Skill Applies

- Before QAS approves any PR that touches `apps/mobile/lib/features/**/screens/**`, `apps/mobile/lib/shared/widgets/**`, or `apps/mobile/lib/core/theme.dart`.
- Anytime a new Figma frame is added to `specs/evidence/TAM-<N>/figma/` or the `figma-flutter` Phase 6 sweep-table lands new rows.
- Debugging "the app-bar looks fine on my emulator but stretches on a Pixel 9 Pro / tablet / foldable" — the per-viewport verdict names the exact element and behavior.

## Independence Rules (mandatory)

This skill is a QAS gate. Follow the rules from `.claude/agents/qas.md` § "Ownership Model":

- **Fresh subagent per (screen × viewport)** — never share context with fe-developer or the previous verification pass. A skeptic that inherits "this was hard to get right" is not a skeptic.
- **No hedging in the verdict** — either APPROVED (no 🔴 across the grid) or BOUNCED (any 🔴). No "close enough", no "matches at 800dp but drifts at 1200dp — pass with note". A 🔴 at any viewport is a BOUNCED overall.
- **QAS does not modify product code.** Verdict names the file + line for the implementer; the fix is not this skill's job.

## Prerequisites

Before running, these must exist:

| Artifact | Location | Missing → |
|---|---|---|
| Figma reference PNG(s) | `specs/evidence/TAM-<N>/figma/<screen>.png` (one per screen, or per Figma variant) | BOUNCE to fe-developer — Phase 0 of figma-flutter not done |
| Phase 6 sweep-table | `specs/evidence/TAM-<N>/fidelity/sweep-table.md` | BOUNCE to fe-developer — Phase 6 of figma-flutter not done |
| **Layout intent declaration per screen** | Spec's **Layout intent (per screen)** block OR inline in the sweep-table under an `## Intent` sub-section | BOUNCE to bsa/fe-developer — intent must be explicit before we can verify it |
| Rendered artifacts per viewport | `specs/evidence/TAM-<N>/fidelity/visual-verify/<screen>/<w>x<h>.png` for at least 3 heights × 1 width (Maestro/emulator preferred) OR checked-in goldens | BOUNCE to fe-developer — see "Capturing multi-viewport artifacts" below |

If any of the four is missing, this skill returns `BOUNCED — insufficient artifacts` with the concrete gap listed.

## Workflow

### Step 1 — Enumerate changed screens

```bash
git diff --name-only main...HEAD \
  | grep 'apps/mobile/lib/features/.*/screens/.*\.dart$' \
  | sed 's|.*/features/\([^/]*\)/screens/\(.*\)_screen.dart|\2|' \
  | sort -u
```

That prints one screen slug per line (e.g. `paywall`, `mantras`, `home`). Also include screens whose shared widgets or theme tokens changed — grep the sweep-table for touched widget names.

### Step 2 — Confirm all four prerequisites for each screen

```bash
SPEC=$(git diff --name-only main...HEAD | grep '^specs/TAM-.*\.md$' | head -1)
TAM=$(basename "$SPEC" | sed 's/-.*//')
EVIDENCE="specs/evidence/$TAM"

for screen in $SCREENS; do
  [ -f "$EVIDENCE/figma/$screen.png" ]                            || echo "MISSING figma: $screen"
  [ -f "$EVIDENCE/fidelity/sweep-table.md" ]                      || echo "MISSING sweep-table"
  grep -q "^### Layout intent" "$SPEC" \
    || grep -q "^## Intent" "$EVIDENCE/fidelity/sweep-table.md"   || echo "MISSING layout-intent declaration for $screen"
  ls "$EVIDENCE/fidelity/visual-verify/$screen/"*.png >/dev/null 2>&1 \
    || ls apps/mobile/test/goldens/${screen}*.png >/dev/null 2>&1 || echo "MISSING rendered artifacts: $screen"
done
```

Any MISSING → BOUNCE with the concrete list. Do NOT proceed with partial artifacts.

### Step 3 — Ensure the geometric gates already passed

`visual-verify` is a *semantic* layer on top of the geometric gates. If those aren't green there is no point running this — the vision-LLM will just re-describe the same broken layout.

```bash
# Multi-size smoke (every non-trivial screen)
pnpm nx test mobile -- _multi_size_test

# Layout-intent (only when the spec has the block)
grep -q '^### Layout intent' "$SPEC" && pnpm nx test mobile -- _layout_intent_test

# Goldens (regression lock)
cd apps/mobile && flutter test test/goldens/ && cd -
```

Any failure → BOUNCE with the raw output. This skill runs ONLY on top of green geometric gates.

### Step 4 — Vision-LLM verification per (screen × viewport)

For each screen, for each rendered viewport artifact, spawn a fresh `qas` subagent with the prompt template in § "The vision-QA prompt" below. Pass:

- `screen` — slug
- `viewport` — e.g. `390x800`
- `figma_path` — `specs/evidence/TAM-<N>/figma/<screen>.png`
- `render_path` — `specs/evidence/TAM-<N>/fidelity/visual-verify/<screen>/<viewport>.png` (or the golden path)
- `intent_block` — copy the Layout intent block from the spec (or the `## Intent` section of the sweep-table)

The subagent MUST read both PNGs with the Read tool and emit a strict per-element verdict table.

Persist the raw verdict at `specs/evidence/TAM-<N>/fidelity/visual-verify/<screen>/<viewport>-verdict.md`.

### Step 5 — Synthesize + record

Aggregate the per-(screen × viewport) verdicts into `specs/evidence/TAM-<N>/fidelity/visual-verify/summary.md`:

```markdown
# TAM-<N> — Visual-verify summary

| Screen | 320×600 | 390×800 | 428×1200 | Overall |
|---|---|---|---|---|
| paywall | 🟢 | 🟢 | 🔴 hero card lost aspect | 🔴 BOUNCED |
| mantras | 🟢 | 🟢 | 🟢 | 🟢 APPROVED |

## BOUNCED items (from the per-viewport verdicts)
- **paywall @ 428×1200** — `apps/mobile/lib/features/paywall/screens/paywall_screen.dart:142` — video hero card must be `AspectRatio(aspectRatio: 16/9, child: ...)`; currently `SizedBox(height: 176)` which stretches to 264dp on tall devices.

## Overall verdict
BOUNCED — see per-viewport verdicts under this folder.
```

Then append to the spec's Evidence section:

```markdown
- visual-verify: BOUNCED — 1 layout-intent regression at 428×1200 (paywall hero aspect). See `specs/evidence/TAM-<N>/fidelity/visual-verify/summary.md`.
```

Rules:
- Any 🔴 at any viewport → overall `BOUNCED` with the copy-pasteable fix package above.
- All 🟢 or 🟠 (asset-TODO already tagged in code) → `APPROVED`. Note the 🟠 count in the summary so it doesn't get lost.

## The Vision-QA Prompt (used in Step 4)

Copy this verbatim into the `Agent` call. `qas` subagent, `model: opus`, no tools other than Read + the emit-verdict flow.

````
You are the visual-verify QA lens for prabhuji-monorepo. Compare the code's rendered output at a specific viewport against the Figma design AND against the declared layout intent. Independence + no-hedge rules apply (see `.claude/agents/qas.md` § "Ownership Model" and `.claude/skills/visual-verify/SKILL.md` § "Independence Rules").

**Inputs**
- Screen: {screen}
- Viewport: {viewport} (width×height in dp)
- Figma reference: {figma_path}
- Rendered artifact: {render_path}
- Declared layout intent:
{intent_block}

**Behavior legend** — every element in the intent block is one of:

| Tag | Meaning | How to verify at this viewport |
|---|---|---|
| **FIXED(h=N)** | Fixed dp height — must not scale with viewport | Element's height in the render ≈ N dp (±2 dp) at every viewport. |
| **FIXED(w=N)** | Fixed dp width | Element's width ≈ N dp at every viewport. |
| **FLEX** | Grows to fill remaining space in its axis | At taller/wider viewport, this element visibly grew; at shorter, it shrank. |
| **ASPECT(a:b)** | Preserves aspect ratio | Rendered width / height ≈ a/b (±2%). Element scales together, no stretch. |
| **RESPONSIVE(<breakpoints>)** | Reflows at breakpoints — e.g. `RESPONSIVE(3col@w<360, 4col@w>=360)` | At each width side of the breakpoint, the correct variant renders. |
| **PINNED-TOP / PINNED-BOTTOM** | Anchored to a screen edge | At taller viewports, the pinned zone still touches its edge; middle grows, not the pin. |
| **SCROLLABLE-ZONE** | Internal scroll region (not whole-screen scroll) | Content beyond viewport is reachable via scroll INSIDE this zone; other zones stay put. |
| **ASSET-TODO** | Placeholder art already tagged in code | Not a fidelity failure — surface as 🟠 in the table, not 🔴. |

**Read both images before answering.** Use the Read tool with each path.

**Emit ONE report in this exact structure:**

## Independence declaration
Fresh subagent for {screen} @ {viewport}. No shared context with fe-developer or prior verifications.

## Per-element verdict
| Element (from intent) | Declared behavior | Figma | Rendered @ {viewport} | Verdict | Fix (if 🔴) |
|---|---|---|---|---|---|

For every 🔴 row, the Fix column MUST name file + line + exact change. Example: `apps/mobile/lib/features/paywall/screens/paywall_screen.dart:142 — wrap the hero in AspectRatio(aspectRatio: 16/9) instead of SizedBox(height: 176)`. No "consider …" / "might want to …" hedging.

**Verdict legend**
- 🟢 matches declared behavior AND matches Figma proportions at this viewport
- 🟠 ASSET-TODO already tagged — pass with note
- 🔴 blocking-ship — behavior at this viewport violates declared intent OR visibly diverges from the Figma frame in a way a user would notice at a glance

**Explicit checks to run for THIS viewport** (call them out in the notes if they surface anything):
1. Does any element that should be FIXED look scaled? (typical failures: app-bar shrinking on 600dp, avatar growing on 1200dp)
2. Does any element that should be FLEX look pinned? (typical: mantra text same height at 600 and 1200 → wrong; whole page scrolls but you expected internal scroll → wrong)
3. Does any ASPECT element look stretched or squashed? (typical: 16:9 hero rendered 16:11 because `SizedBox(height: 176)` was used instead of `AspectRatio`)
4. On this width, did the RESPONSIVE variants pick the right layout? (typical: 4-column grid rendering at 320dp width so cards are 60dp wide)
5. Are PINNED-BOTTOM zones flush with the bottom edge, or floating up? (only the flex zone should stretch)
6. Text scale — if the render was captured at 2.0×, does anything clip or overflow that didn't at 1.0×?

## Overall verdict for {screen} @ {viewport}
Either **APPROVED** (no 🔴) or **BOUNCED** (any 🔴). No third option, no qualifiers.
````

## Capturing multi-viewport artifacts

Preferred (real fonts, real image decode, matches production):

- **Maestro MCP hot-reload loop** — see `.claude/skills/figma-flutter/references/maestro-loop.md`. Run the same flow at three device profiles (short/mid/tall) and capture the resulting screenshots to `specs/evidence/TAM-<N>/fidelity/visual-verify/<screen>/<w>x<h>.png`.
- **`adb exec-out screencap`** — fallback when Maestro isn't wired for the flow. Boot an emulator at each viewport (`avdmanager create avd ... -d "small_phone"`; `emulator @<avd> -skin <WxH>`), navigate to the screen, capture.

Fallback (fast, headless, no real fonts):

- **Multi-height goldens** — extend the existing golden test with a loop over 3 heights and check in `<screen>-600.png` / `<screen>-800.png` / `<screen>-1200.png` alongside the existing golden. Use the `pumpForGolden` harness at `apps/mobile/test/support/golden_harness.dart` (it already handles image precache).

  ```dart
  // apps/mobile/test/goldens/<screen>_multi_viewport_golden_test.dart
  for (final h in [600.0, 800.0, 1200.0]) {
    testWidgets('$screen @ 390x${h.toInt()} matches golden', (tester) async {
      await pumpForGolden(tester, const YourScreen(), size: Size(390, h));
      await expectLater(
        find.byType(YourScreen),
        matchesGoldenFile('${screen}-${h.toInt()}.png'),
      );
    });
  }
  ```

  Ahem-font limitations still apply (see § "Known limitations"). Use these as the input to the vision-LLM only when Maestro isn't available.

Regardless of source, artifacts land in `specs/evidence/TAM-<N>/fidelity/visual-verify/<screen>/` so the verdict, the input, and the source of truth (Figma) all live under one folder for review.

## Layout intent block — the format QAS expects

Every screen in scope needs one, sourced from the spec's **Layout intent (per screen)** block. Example:

```markdown
### Layout intent — paywall screen

- `paywall-appbar`         — **FIXED(h=56)**, PINNED-TOP. Close button + title.
- `paywall-hero`           — **ASPECT(16:9)**. Video card, must NOT stretch.
- `paywall-plan-card`      — FIXED(h=369). Peach card, benefits grid inside.
- `paywall-benefits-grid`  — RESPONSIVE(2col@w<360, 4col@w>=360). Icon grid.
- `paywall-cta-shimmer`    — FIXED(h=56), PINNED-BOTTOM. Pay Now CTA.
- `paywall-scroll-zone`    — FLEX + SCROLLABLE-ZONE. Everything between hero and CTA.
```

If a screen lacks this block, this skill returns `BOUNCED — layout intent block missing for <screen>` and points at `specs_templates/spec_template.md` + `.claude/skills/figma-flutter/SKILL.md` Phase 6. BSA (or fe-developer following the Phase 6 spec) writes it; QAS verifies against it — QAS does not author intent.

## Interaction with the other gates

`visual-verify` is one gate. The QAS mobile-review checklist (see `.claude/agents/qas.md` Step 4) still applies:

- `flutter analyze` + `flutter test` (unit + widget) — separate.
- `*_multi_size_test.dart` (3×3 no-exception) — separate; must be green before this skill runs.
- `*_layout_intent_test.dart` (600/800/1200 dp geometry) — separate; must be green before this skill runs (when the spec has the block).
- Goldens (regression lock) — separate; must be green before this skill runs.
- Phase 6 sweep-table (element presence + placement) — separate; fe-developer produces, this skill reads.
- **`visual-verify` — this skill.** Semantic layout-intent verification per viewport, mandatory for mobile UI diffs.

Any failing gate = overall BOUNCED. All must be green for APPROVED.

## Known Limitations

- **Ahem-font goldens** — `flutter test` uses `Ahem` unless the app's custom font is bundled into the test binary. Goldens will show Ahem-shaped glyphs, not Inter. The vision-QA prompt treats copy as "same text"; font parity is out of scope for the golden-based path. Use Maestro/emulator captures when the design's typography choice is load-bearing (headline weight, script matching for Devanagari, etc.).
- **Platform-specific rendering** — goldens can differ across Skia/Impeller versions or CPU vs GPU. If flakes surface, generate per-platform goldens (`<slug>-800.darwin-arm64.png`) or push the rendering to Maestro.
- **Vision-LLM ≠ ruler** — the LLM is good at "the hero card is visibly squashed" and bad at "the hero card is 3.2dp too tall". The layout-intent test is the ruler; this skill is the intent judge.
- **Not a substitute for on-device smoke** — animation smoothness, gesture recognition, and real-device chrome (status bar, notch, keyboard) are still worth eyeballing on a real device before ship. This skill catches static layout drift, not motion / interaction bugs.

## References

- Companion patterns: [flutter-layout-intent.md](../../../patterns_library/testing/flutter-layout-intent.md) · [flutter-multi-size-smoke.md](../../../patterns_library/testing/flutter-multi-size-smoke.md)
- Producer skill: [figma-flutter/SKILL.md](../figma-flutter/SKILL.md) § Phase 6
- Producer references: [figma-flutter/references/maestro-loop.md](../figma-flutter/references/maestro-loop.md) · [figma-flutter/references/translation.md](../figma-flutter/references/translation.md)
- Consumer agent: [.claude/agents/qas.md](../../agents/qas.md) § Step 4 (layout-intent check) + § Exit Protocol
- Responsive-layout primitives: [flutter-responsive-layout/SKILL.md](../flutter-responsive-layout/SKILL.md)
- Golden harness: `apps/mobile/test/support/golden_harness.dart`
