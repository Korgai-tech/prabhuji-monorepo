---
name: figma-flutter
description: Use when implementing a Figma design as Flutter UI, doing a design-fidelity or pixel-perfect pass against a Figma frame, or when a figma.com URL appears alongside Flutter work. Also use when a built screen "doesn't look like the design" and the gap needs to be diagnosed.
---
<!-- no allowed-tools: the skill needs the Figma MCP tools (get_variable_defs,
     get_metadata, get_screenshot, download_assets), Bash+WebFetch for the REST
     fallback, and optionally Maestro/Dart MCP tools; an allowed-tools list
     would lock them out. -->

# Figma → Flutter Fidelity Skill

## Overview

Three principles, in order:

1. **See the design before you spec it.** Export a PNG of every Figma frame FIRST (Phase 0) and attach it to the spec — every downstream agent needs the rendered image, not just data. Figma REST returns geometry and colors as JSON; the JSON does not encode gestalt (imagery choices, coverflow perspective, gradient placement, per-icon illustration style). Data-only extraction is what produces "structurally correct but visually wrong" builds.
2. **Audit dependencies before you write code.** Phase 1.5 produces a table: for every color / font / icon / image / widget / package / CMS field the design needs, either grep-prove it already exists in the codebase (REUSE) or list it as an explicit extraction task (EXTRACT). The audit becomes a section of the spec. Missing this step is what leaves per-benefit icons falling back to `benefit-check.svg` and coverflow backgrounds rendering empty.
3. **Verify by rendered comparison, always.** Phase 6 is a HARD blocking gate on the Definition of Done — not "TBD — no emulator." If an emulator isn't available, the fe-dev stops and routes back to a human; they do not ship blind.

Every fidelity gap in practice comes from skipping one of: (a) Phase 0 PNG export, (b) Phase 1.5 dependency audit, (c) any of the four extractions (variables, geometry, assets, paint order), or (d) the Phase 6 rendered-comparison loop. This skill walks the seven phases in order and encodes the traps that produce "looks almost right".

Prefers the official Figma MCP server (`plugin:figma:figma` tools) when running on a
box with Figma Desktop; **falls back to the REST API + `FIGMA_TOKEN` when MCP is
unavailable** (CI, remote/cloud dev, another contributor's machine) — see [Data source](#data-source-mcp-first-rest-fallback)
below. Node id comes from the URL: `...?node-id=285-3464` → `285:3464`. For the Phase 6
screen-level loop, the Maestro MCP + Dart MCP (hot reload) are strongly recommended —
setup in [references/maestro-loop.md](references/maestro-loop.md).

**No FIGMA_TOKEN + no MCP = STOP.** Do not proceed with prose-only design descriptions. Ask the user for a token or point to `.env.local`. Data-only fallback for Phase 0 is not allowed — the Phase 0 PNG is the reference every downstream agent works from.

## Data source: MCP first, REST fallback

**Detection rule:** if `mcp__figma__*` tools are listed in the available tools, use them.
Otherwise, use the REST API via `curl` with `$FIGMA_TOKEN` (from `.env.local` / task env).
Same node ids work for both — specs never change.

File key comes from the Figma URL: `figma.com/design/<FILE_KEY>/...?node-id=285-3464`.

| Phase call | MCP (preferred) | REST fallback (`curl`) |
| --- | --- | --- |
| **Phase 0 — reference PNG (blocking)** | `get_screenshot` on every frame in the spec | `GET /v1/images/$FILE_KEY?ids=<frame-id-1>,<frame-id-2>&format=png&scale=2` — returns `{ images: { "<id>": "https://s3.../render.png" } }`. **Follow every URL, download the PNG, save to `specs/evidence/TAM-<N>/figma/<node-id>.png`, and reference the path in the spec's Layout-intent block for each frame.** URLs expire in ~30 days — persist locally. Batch all frame ids in one call. |
| Phase 1 — variables | `get_variable_defs` | `GET /v1/files/$FILE_KEY/variables/local` — returns the local variable set. **Requires Enterprise / Dev Mode plan on the file's team**; if it 403s, fall back to reading node fills/text-styles from the nodes response and log the gap as a follow-up. |
| Phase 2 — metadata | `get_metadata` | `GET /v1/files/$FILE_KEY/nodes?ids=285:3464` — node subtree with bounds, fills, effects, children. Use for geometry and paint order. |
| Phase 4 — asset export | `download_assets(fileKey, "44:10", defaultFormat: svg)` | `GET /v1/images/$FILE_KEY?ids=44:10&format=svg` — returns `{ images: { "44:10": "https://s3.../render.svg" } }`; follow the URL to fetch the actual asset (URLs expire in ~30 days). PNG for raster (`&scale=2` for 2x), SVG for icons. **Icon composite-id rule still holds:** in `I310:22;44:10` the plain id is `44:10`, not the composite. |
| Phase 6 — reference screenshot | Reuse the Phase 0 PNG | Same — use the file already saved in Phase 0. Do not re-fetch. |

**Auth:** `-H "X-Figma-Token: $FIGMA_TOKEN"` on every call. Never echo the token; never
pass it on a command line that would land in shell history — read from env.

**Rate limits:** Figma REST is quota-per-token; batch `ids=a,b,c` in one call rather
than looping. If you hit 429, back off — don't retry-storm.

## When NOT to use

- No Figma source exists (design from prose/screenshots) — build from `frontend-patterns` instead.
- Pushing Flutter UI INTO Figma — that is the `figma-generate-design` + `figma-use` path.

## The Seven Phases (in order — earlier phases invalidate later work when skipped)

| # | Phase | Tool / action | Output |
| --- | --- | --- | --- |
| 0 | **Reference PNG (blocking)** | `get_screenshot` OR REST `/v1/images` on every frame in the spec | One PNG per frame at `specs/evidence/TAM-<N>/figma/<node-id>.png` at 2x scale. Path referenced in the spec's Layout-intent block for that frame. **No PNG → no downstream work.** This is what every later agent Reads to see the design. |
| 1 | **Variables first** | `get_variable_defs` on the frame | Token table (colors, gradients, text styles). Node fills LIE by omission — the token set is where gradients and semantic names live. |
| 1.5 | **Dependency Audit** | Grep the codebase for every color / font / icon / image / widget / package / CMS field the Phase 0 PNG + Phase 1 tokens require | A table in the spec's "Dependency Audit" section (template below). Every row is REUSE (with `file:line` grep AND `Reused-in?` visual proof), ADAPT (existing widget + delta list), EXTRACT (fetch from Figma), or CREATE (build new). **No blank cells.** **Default action is CREATE — REUSE requires visual proof, not just widget existence.** The audit becomes a section of the spec — downstream fe-dev reads it, doesn't re-do it. |
| 2 | **Geometry + Auto-Layout** | `get_metadata` (or REST node tree) | Exact w×h per structural node → aspect ratios, radii, paddings. **AND** for every structural node: `layoutMode` (NONE/HORIZONTAL/VERTICAL), `layoutGrow` (0=hug, 1=fill), `primaryAxisSizingMode` / `counterAxisSizingMode` (FIXED/AUTO). These are the ONLY signals in the Figma file about pinned-vs-flex intent. Reconcile against the spec's **Layout intent (per screen)** block (see spec_template.md) — if Figma says `layoutGrow: 1` on a node the spec marks pinned-bottom, **stop and route to BSA**, don't guess. Never derive geometry from a screenshot crop. |
| 3 | **Tokens → theme** | Edit `lib/core/theme.dart` (or create) | Map to `ColorScheme`/`TextTheme`/const `AppColors`. Widgets consume theme, never hex literals. Only add new tokens the audit flagged as EXTRACT — every REUSE row reuses. |
| 4 | **Assets** | Every EXTRACT row in the Phase 1.5 audit that's an icon or image → `download_assets` (plain node ids) or REST `/v1/images` (instance ids), save to `assets/…`, register in `pubspec.yaml` | One file per inventory entry in `assets/…` — **Read every exported PNG before wiring it** (see traps). Icon recipes: [references/translation.md](references/translation.md). |
| 5 | **Widget translation** | Write idiomatic Flutter, consulting the Phase 0 PNG side-by-side with the spec | See [references/translation.md](references/translation.md) for the Auto-Layout→Flutter table. Prefer existing project widgets (per the audit's REUSE rows); don't transpile generated React. |
| 6 | **Rendered comparison loop (HARD GATE)** | Golden test render AND/OR device screenshot (Maestro hot-reload loop preferred — see [references/maestro-loop.md](references/maestro-loop.md); `adb screencap` fallback) → vision-compare vs the Phase 0 PNG → fix → repeat | Stop only when the diff list is empty or every remaining item is a logged art/content follow-up. **Definition of Done requires a sweep-table at `specs/evidence/TAM-<N>/fidelity/{layout}/sweep-table.md` for every frame in the spec.** No emulator available → STOP and route to human. Do not defer, do not ship blind. |

## Traps that produced real defects (do not rediscover these)

| Trap | Symptom | Rule |
| --- | --- | --- |
| Master-component export | Artwork ships with a baked-in dark/dim overlay layer | Export the **instance** render from the screen frame (REST composite id `I<inst>;<node>`), not the master; `download_assets` only accepts plain ids. Exception: monochrome icons — master export is safe because the fill is tinted at the call site. |
| Icon substitution | Icons "close but wrong" — a Material `Icons.*` glyph shipped because export failed, the composite id was rejected, or no REST token exists | A design icon NEVER degrades to `Icons.*` — not as a fallback, not "temporarily". No token needed: in composite id `I310:22;44:10` the segment after the last `;` is the icon master's plain id → `download_assets(fileKey, "44:10", defaultFormat: svg)`, tint at call site. If every export path fails, stop and surface the blocker instead of substituting. |
| Unseen assets | Broken/dimmed art wired into widgets | Read (render) every exported image before use. No exceptions. |
| One-pass sign-off | Phase 6 declared complete after the first capture: "screenshot matches the design" from a full-screen side-by-side | Fit-to-screen zoom hides exactly what the loop exists to catch (2px drifts, near-miss grays, wrong weights). The verdict is the completed per-zone sweep table (crops + Phase 1–2 numbers), and a first-capture clean sweep is a red flag — redo with crops. A diff list is the artifact of a systematic comparison, not a gestalt impression. |
| Flat-color assumption | Background subtly "off" vs design | Phase 1 before Phase 3 — gradients live in variables (`Gradient/...Top/Bottom`), not in a single node fill. |
| Screenshot-derived geometry | Landscape hero where design is portrait | Aspect ratios come from node bounding boxes (e.g. hero 360×574 ⇒ `AspectRatio(360/574)`). |
| Whole-screen scroll where the design intends pinned-bottom bars | On a 1200dp device the player controls/queue bar float mid-screen; on a 600dp device the mantra text is uncroppable. Golden at 640dp looks fine — bug ships. | The Figma frame is ONE height and doesn't encode "this fills remaining space" vs "this pins to the bottom". Read the spec's **Layout intent (per screen)** block; if the screen has a flex-fill zone, the root MUST be a `Column` with `Expanded` on that zone — never `SingleChildScrollView` at the root. Commit a `*_layout_intent_test.dart` per `patterns_library/testing/flutter-layout-intent.md` (asserts at 600/800/1200 dp). QAS blocks without it. |
| Literal `height:` translation around scalable Text | `RenderFlex overflowed by N pixels` (typically 2–6px) on cards/rows containing text — clean on your device at font scale 1.0, breaks the moment any user has Android Settings → Display → Font size > default. Golden tests miss it (they render at scale 1.0). | Figma's frame height was measured with the design's default font size. When you translate a `Container` / `SizedBox` that wraps `Text`, **never emit `height: <figma-height>` — emit `constraints: BoxConstraints(minHeight: <figma-height>)`**. Same visual at scale 1.0, but the container grows instead of clipping when text scales. Any card header, chip row, tab row, or footer with mixed icon+text is a candidate. Concrete example + real-world diff: `apps/mobile/lib/features/home/presentation/home_feed_card.dart` `_CardHeader` (fixed at 72 + `labelMd(20) + gap(4) + bodyXs(16) = 40` fit EXACTLY at scale 1.0, overflowed by 3px at 1.075+). Verify at build time with a text-scale variant in [flutter-multi-size-smoke.md](../../../patterns_library/testing/flutter-multi-size-smoke.md) (pattern already includes a `textScaleFactorTestValue = 2.0` case). |
| Stack z-order | Images painting over titles | Figma children paint in listed order, later = on top. Order Flutter `Stack` children the same way. |
| Desktop test surface | Grids/lazy lists lay out wrong in widget tests | Pin `tester.view.physicalSize` to a phone size (+ reset in teardown). |
| google_fonts in tests | Test THROWS (`Failed to load font`/`not found in the application assets`) as soon as the real theme is pumped | Set `GoogleFonts.config.allowRuntimeFetching = false` in `test/flutter_test_config.dart` AND bundle the TTFs under a pubspec asset dir — see the recipe in references/translation.md. Bundling also removes the runtime font fetch in production. |
| Blank art in goldens | Golden renders cards/heroes without their images | Image decode is real async I/O; fake-async pumps never finish it. `precacheImage` every image inside `tester.runAsync` before the golden expectation (recipe in references). |
| Network images in tests | `CachedNetworkImage` can't load/fail deterministically | Inject an image-builder test seam; never let tests touch the network. |
| Cross-platform golden noise | Goldens generated on macOS fail Linux CI (or vice versa) with tiny font-rasterization/anti-aliasing diffs — so goldens get skipped entirely | Real-font goldens are platform-locked artifacts; skipping the regression lock is the wrong fix. Commit them but exclude from CI via test tags, or adopt `alchemist`'s CI/platform split — recipe in [references/translation.md](references/translation.md). |
| **REUSE without visual verification** | A widget with the right name and role gets reused across variants that each need different visual treatment (chrome, alignment, spacing, iconography, geometry). Three variants ship "structurally correct" but two of them look wrong side-by-side with Figma — labels floating outside a card that should contain them, left-aligned rows that should be centered, a coverflow with 2 tiles visible where design shows 5. Symptom appears at Phase 6 as a REUSE row's crop failing the visual comparison while its structural assertions pass. | **REUSE ≠ "widget with this purpose exists". REUSE = "widget already renders THIS visual somewhere shipped."** No shipped renderer with a matching visual → ADAPT (parameterize + list deltas) or CREATE (new widget). **Do not share a widget across N callers unless all N need the same visual.** When a shared widget's callers diverge visually, split into per-caller widgets OR parameterize the differences (alignment/color/geometry) and pass them at each call site. A shared-widget change that helps caller A and hurts callers B and C is worse than three focused widgets. |
| **Gestalt comparison instead of element-level check** | Looking at the full-frame screenshot side-by-side, the agent says "the trial section matches" when actually the pill has no background in Figma but has one in the build, the divider is a 3-stop gradient in Figma but a solid line in the build, the benefit bullet is an outlined-circle-with-check in Figma but a filled-circle in the build, and the section starts too close to the previous block. Every one of these ships. Repeatable pattern: the second, third, fourth rebuild each finds another "obvious" gap the previous pass missed because the previous pass compared shapes, not properties. | **Every Figma zone gets an element-inventory row per property, not one row per zone.** The Element Inventory (see Phase 1.5 template) enumerates for each zone: background (fill/gradient/image/none + exact tokens), corner radius, stroke, icon (which asset + tint + stroke weight + fill), typography (family + size + weight + case), spacing (before + inside + after in dp), alignment (left/center/right/justify), and any non-obvious detail (badge inside heading, per-side padding asymmetry, transparent gradient stops). The Phase 6 sweep-table then has one row per **property**, not per zone — an unchecked property is a failed row, not a background assumption. |

## Phase 0 mechanics (reference PNG — blocking)

1. Identify every frame in the spec's Design References section (usually 1–N node ids per screen).
2. Batch-fetch: `GET /v1/images/$FILE_KEY?ids=<id1>,<id2>,<id3>&format=png&scale=2` in ONE call (respects rate limits).
3. Follow each returned URL and save the PNG to `specs/evidence/TAM-<N>/figma/<node-id>.png`. URLs expire in ~30 days — persist locally so the reference outlives the fetch.
4. Add the local path to the spec's Layout-intent block for each frame: `**Reference**: [figma/2743-24820.png](../evidence/TAM-<N>/figma/2743-24820.png)`.
5. If `FIGMA_TOKEN` is missing and no MCP is available: STOP. Ask the user for a token or the file's ownership. Do not proceed to Phase 1 with prose-only design descriptions.

## Phase 1.5 mechanics — Dependency Audit

Grep the codebase for every color / font / icon / image / widget / package / CMS field the design needs. Fill this table in the spec's "Dependency Audit" section. **Every row needs `file:line` grep evidence** — a claim without a grep is a defect.

### Audit template

Four action verdicts, not one — every row picks exactly one:

- **REUSE (verified)** — existing widget/asset already renders **this exact visual** in a currently-shipped screen. Prove it in the `Reused-in?` column by linking a shipped screen + zone (or a committed golden test that matches the Figma zone). No shipped renderer = not REUSE.
- **ADAPT** — existing widget matches structure but needs deltas (chrome, alignment, color, size, iconography) to match Figma. List every delta as its own task row so the fe-developer can't miss one.
- **EXTRACT** — fetch the asset (icon, image, font) from Figma in Phase 4.
- **CREATE** — build new from scratch. Default when in doubt.

**REUSE requires proof, not the absence of contrary evidence.** If you can't fill `Reused-in?`, it's ADAPT (with deltas) or CREATE — never REUSE.

```markdown
## Dependency Audit

| Category | Item from Figma | Exists in codebase? | Grep evidence | Reused-in? (visual proof) | Action |
| --- | --- | --- | --- | --- | --- |
| Color | `#FC7304` (orange accent) | Yes | `AppColors.brand400` at `apps/mobile/lib/core/theme/colors.dart:42` | Shipped in `paywall_screen.dart` (see current build) | REUSE |
| Color | `#F5F5F5` (benefits card bg) | No | `grep -r "F5F5F5" apps/mobile/lib/core/theme/` → 0 hits | — | EXTRACT → add `AppColors.surfaceGray` |
| Typography | Poppins 700 | No — Inter is bundled instead | `grep Poppins apps/mobile/pubspec.yaml` → 0 hits | — | SUBSTITUTE (Inter 700) OR add font |
| Icon | `benefit-mandir.png` | No | `ls apps/mobile/assets/paywall/benefit-*.png` → 0 files | — | EXTRACT (Phase 4) — Figma node `310:22;44:11` |
| Image | Full-frame temple bg (v4) | No | `ls apps/mobile/assets/paywall/carousel-*` → 0 files | — | EXTRACT (Phase 4) — Figma node `2743:25027` |
| Widget | Compact plan trial section (v3, center-aligned) | Yes (v2 built) | `PaywallCompactPlanTrialSection` at `widgets/compact_plan_trial_section.dart:15` | **NOT VERIFIED** — v2's shipped rendering is left-aligned; v3 Figma wants center | **ADAPT** — add `alignment` param, default left, v3 passes center |
| Widget | Illustrated benefit card w/ label INSIDE the tile | No | `grep IllustratedBenefit apps/mobile/lib/` → 0 hits | — | **CREATE** — new `_IllustratedBenefitCard` (do NOT reuse an existing card widget whose label sits below) |
| Widget | Shimmer Pay Now CTA (identical across all 4 variants) | Yes | `_PayNowShimmerButton` at `widgets/pay_now_shimmer_button.dart:12` | Shipped in card_hero + video_bleed identically — same padding, same fill, same tap area | **REUSE** |
| Package | Coverflow carousel (5-tile 3D peek, viewportFraction ≈ 0.20) | Partial | `CoverflowCarousel` at `carousel_body.dart:196` — built for 2-tile peek at viewportFraction 0.35 | v4 Figma calls for 5-tile visible peek — geometry differs | **ADAPT** — pass viewportFraction as ctor param, v4 passes 0.20 |
| CMS field | `paywallConfig.heroMedia[].mediaType` | Yes | `PaywallHeroMediaDisplay` at `apps/mobile/lib/api/generated/paywall.dart:118` | Shipped; card_hero + video_bleed consume it | REUSE |
```

### Ordering matters — enumerate in this order

Colors → Typography → Icons (SVG/PNG) → Images (photos, illustrations) → Widgets → Packages → CMS payload shape.

Each row builds on the ones above: if colors aren't decided, icon tinting can't be; if widgets aren't identified, package needs are unknown.

### Element Inventory — required companion to the audit

For every zone in the Phase 0 PNG, list its **properties** with exact values before implementation. A "zone matches Figma" verdict is not a gestalt impression; it's this checklist coming out all-green. Skipping any row = shipping a gap.

```markdown
### Element Inventory — {zone name} (e.g. "compact trial section — v3")

| Property | Figma value | Notes |
|---|---|---|
| Background | none / peach `#FFF1E2` / gradient / image | Solid vs gradient is not eyeball-able safely |
| Corner radius | 0 / 4 / 8 / 16 / pill | Per-corner if asymmetric |
| Border | none / 1px `#XXX` | Match stroke color + width |
| Padding | top/right/bottom/left in dp | Asymmetric padding is common |
| Alignment (crossAxis) | start / center / end / stretch | For each row of content |
| Divider | none / solid `#XXX` / 3-stop gradient (transparent → `#XXX` → transparent) | Never assume a horizontal line is solid |
| Iconography | which asset id, tint, filled vs outlined, stroke width | e.g. filled green circle vs outlined green circle w/ check |
| Text (per string) | family / size / weight / case / color / letter-spacing | Case = ALL CAPS vs Title Case vs sentence |
| Inline elements | badge inside text / superscript / colored word | e.g. "3-Day [FREE] Trial" — FREE is a filled orange box, not colored text |
| Spacing before / after | dp from previous / next block | Section separation is a design decision |
| Children (structural) | list every child element in paint order | If a card contains {icon, label}, that's 2 rows here |
```

**A blank cell fails the inventory.** No `?`, no `TBD`, no "same as v1" without confirming. Every cell has a concrete value, or you can't proceed to Phase 5.

**Every Element-Inventory row becomes one row in the Phase 6 sweep-table.** The sweep-table verdict is `matches` per property, never per zone. If a zone has 12 inventory rows, the sweep-table has 12 rows for that zone, and all 12 must be green before the zone is closed.

### EXTRACT rows become implementation tasks in the spec

Every EXTRACT row is transcribed into the spec's Frontend / Backend Tasks section as its own line item, with the Figma node id and target path. Example:

- `[ ] EXTRACT icon `benefit-mandir.png` from Figma node `310:22;44:11` → save to `apps/mobile/assets/paywall/benefit-mandir.png` → register in `pubspec.yaml` assets list. (Phase 4)`

Without transcription, EXTRACT rows sit in the audit and don't get built.

### The audit is attached to the spec, not a scratchpad

Save inline in the spec's markdown as `## Dependency Audit`. Downstream fe-dev reads and follows. If fe-dev finds a new gap during implementation, they add a row + note — the audit grows, doesn't restart.

## Phase 6 mechanics (the loop that actually catches bugs — HARD GATE)

**This phase blocks the fe-developer's Definition of Done.** No emulator available → STOP and route to a human. Do not defer as "TBD." Do not ship blind.

1. Reference: the Phase 0 PNG (already saved to `specs/evidence/TAM-<N>/figma/<node-id>.png`).
2. Render: golden test with `--update-goldens` (component-level) and/or a live-device screenshot (screen-level — catches runtime-only issues: image loading, real fonts, gradients). Preferred screen-level loop: Maestro MCP capture + Dart MCP hot reload (`flutter run --print-dtd`) so each fix re-renders in under a second — setup and the five-step loop are in [references/maestro-loop.md](references/maestro-loop.md). Fallback: `adb exec-out screencap`.
3. Compare region CROPS, not the full screen, and fill the per-zone sweep table (Figma's Phase 1–2 numbers vs the render — format in [references/maestro-loop.md](references/maestro-loop.md)). An empty diff list is the output of a completed sweep table, never a glance.
4. **Verify every REUSE row from Phase 1.5's audit.** For each REUSE claim, the crop of that widget's rendered zone MUST match Figma's zone at the same visual granularity (chrome, alignment, spacing, iconography, geometry). If a shared widget appears in N variants' crops, all N must match Figma's version of that zone. A REUSE crop that doesn't match = the audit was wrong; downgrade the row to ADAPT (list the delta) or CREATE (split into per-caller widget) and re-do Phase 5 for that widget. **Do not paper over a wrong-looking shared widget by leaving a "logged follow-up" — that ships the bug.**
5. Fix code → re-render → repeat until every row is `matches`, `logged follow-up`, or spec-authorized `intentional` divergence.
6. Save the sweep-table at `specs/evidence/TAM-<N>/fidelity/{layout}/sweep-table.md` — one per frame in the spec. **Missing sweep-table = DoD not met.**
7. Keep a golden test for **stable** components as the permanent regression lock; skip goldens for still-iterating UI (CI noise).

## Validation

`pnpm nx lint mobile` then `pnpm nx test mobile` (SEQUENTIAL — never parallel flutter), then the repo's verify gates. Attach the final side-by-side verdict to the spec's Evidence section.
