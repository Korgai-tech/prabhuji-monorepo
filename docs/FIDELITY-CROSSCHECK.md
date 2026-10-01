# Fidelity runbook — every Prabhuji screen ticket follows this (TAM-60)

The enforcement of TAM-56's **Design Fidelity Gate — STRICT**. Every module UI
ticket (TAM-62/64/66/68/70/72/74/76, and the shared TAM-58/59) runs these steps
and commits the artifacts under `specs/evidence/TAM-{N}/fidelity/`. A PR that
touches a screen without these artifacts does not pass review.

## Why literal pixel-identity is NOT the gate

A Flutter golden rendered headlessly can never be per-pixel identical to a Figma
raster: font anti-aliasing/hinting, sub-pixel rounding, and gradient dithering
differ between Skia and Figma's renderer, and there is no Android device in this
environment. Chasing raw-pixel equality produces flaky, skipped goldens.

**The gate is therefore five checks, not one:**

1. **Exact tokens** — colors/type/spacing come from `lib/core/theme.dart`, each
   citing its Figma variable. No raw hex at call sites.
2. **Exact Figma assets** — every icon/image is downloaded via
   `tools/figma-export.ts` and listed in `tools/figma-assets.manifest.json`. No
   hand-drawn art; no Material `Icons.*` standing in for a design icon.
3. **Geometry** — widths/heights/radii/paddings from the node bounding boxes
   (figma-flutter Phase 2), not eyeballed from a screenshot.
4. **Render-tree ↔ Figma node-tree match** — no design component silently
   missing (this doc's `cross-check.md`).
5. **Golden reviewed vs the Figma frame** — a component golden + the Figma frame
   PNG side by side, with a completed sweep table. `matches` requires the number
   check, not a glance.

## The steps

### 0. Preconditions

- `FIGMA_TOKEN` in env/`.env` (HARD blocker — see `tools/README.md`).
- The screen's Figma frame node id from `rough_plan/<module>/figma-links.md`.

### 1. Extract + export (figma-flutter Phases 1–4)

    # Inventory the frame (geometry + child ids):
    ./node_modules/.bin/tsx tools/figma-export.ts tree --ids <frame> --out scratch/<mod>.json

    # Export its icons/images into apps/mobile/assets/<module>/:
    ./node_modules/.bin/tsx tools/figma-export.ts export --module <mod> --format svg --ids '…'

Register `assets/<module>/` in `pubspec.yaml`. **Read every exported PNG.**

### 2. Build the screen (Phase 5)

Map tokens → theme, geometry → widgets (translation.md). Give **every structural
component a stable `Key('module-element')`** — the cross-check keys on these.

### 3. Render-tree ↔ node-tree cross-check (the additive check)

Use the harness in `apps/mobile/test/support/`:

- `figma_crosscheck.dart` — `crossCheck(figmaComponents, renderedComponents,
  intentional)` → matched / missing / stray, and `renderCrossCheckMarkdown(...)`
  → the `cross-check.md` table. Pure Dart, unit-tested in
  `test/figma_crosscheck_test.dart`.
- `golden_harness.dart` — `pumpForGolden(...)` (real theme + image precache) and
  `renderedKeys(tester, 'prefix-')` (walks the widget tree for stable keys).

In a widget test: pump the screen, collect `renderedKeys`, list the Figma frame's
children as `CrossCheckRow`s (from the `tree` dump), call `renderCrossCheckMarkdown`
and `writeEvidence('TAM-{N}', 'cross-check.md', md)`. Assert `crossCheck(...).ok`.

**Recording an intentional divergence.** A Figma element deliberately excluded
from Phase 1 (e.g. the Home search bar `285:3499`) or a product addition with no
Figma node (e.g. the deity "All Gods" chip) is passed in `intentional: [...]`, so
it is documented — never a false "MISSING". Cite the spec section in the row's
`notes`.

Worked example: `apps/mobile/test/goldens/nav_shell_golden_test.dart` produces
`specs/evidence/TAM-58/fidelity/cross-check.md`.

### 4. Golden + Figma frame (Phase 6)

    # Reference: export the Figma frame PNG next to the golden:
    ./node_modules/.bin/tsx tools/figma-export.ts export --format png --scale 3 --no-manifest \
      --out-dir specs/evidence/TAM-{N}/fidelity/figma-refs --ids '<frame>=<screen>'

    # Render: generate/refresh the golden:
    flutter test --update-goldens test/goldens/<screen>_golden_test.dart

Tag golden tests `@Tags(['golden'])`. Local/same-platform CI runs them; a
cross-platform gate uses `flutter test --exclude-tags golden` (see
`apps/mobile/dart_test.yaml`). Then fill the **sweep table** (crops + the Phase
1–2 numbers) — format in
`.claude/skills/figma-flutter/references/maestro-loop.md`. Stop only when every
row is `matches`, `logged follow-up`, or spec-authorized `intentional`.

### 5. Evidence layout (what the PR commits)

    specs/evidence/TAM-{N}/fidelity/
      cross-check.md          # step 3 — render-tree ↔ node-tree diff table
      sweep-table.md          # step 4 — per-zone token/geometry sweep verdict
      figma-refs/<screen>.png # step 4 — the Figma frame reference
      <screen>.png (golden)   # committed under test/goldens/, referenced here

## Enforcement checks a screen PR must pass

- `grep -rn 'Icons\.' apps/mobile/lib/features/<module>` → only justified,
  non-design stubs (e.g. a "coming soon" screen). A design icon as `Icons.*` is a
  reject.
- Every asset under `apps/mobile/assets/<module>/` has a
  `tools/figma-assets.manifest.json` entry.
- `cross-check.md` verdict is PASS (0 missing) or every missing row is an
  `intentional` divergence citing the spec.
- `pnpm verify:mobile` green.
