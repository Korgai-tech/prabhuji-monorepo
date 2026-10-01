# Figma node tree ↔ Flutter render tree — consolidated comparison

**Generated:** 2026-07-15 · epic TAM-56 (Prabhuji Phase-1 modules)

## How this is produced (not eyeballed)

Each module UI ticket runs a machine cross-check (`apps/mobile/test/support/figma_crosscheck.dart`, built in TAM-60):
the screen's **Figma node-child list** (pulled live from the Figma REST API) is diffed against the **rendered Flutter widget tree**
(collected by `golden_harness.dart` via a `WidgetTester` key sweep). It emits four buckets:

| Bucket | Meaning |
|---|---|
| **matched** | Present in BOTH the Figma node tree and the Flutter render tree |
| **missing** | In Figma but NOT rendered → a real fidelity defect. **Must be 0.** |
| **stray** | Rendered but not a Figma node → structural Flutter widgets (Scaffold/Padding/etc.), expected |
| **intentional** | Deliberately diverged, each with a written reason (spec/PRD decision, or no Figma source) |

A companion **measured-geometry** pass asserts rendered sizes against Figma node values (not visual judgement),
and a **sweep-table** records per-zone token/colour/type/asset verdicts.

## Results — every screen, every module

| Ticket | Screen | matched | missing | stray | intentional | Verdict |
|---|---|--:|--:|--:|--:|:--:|
| TAM-58 | main | 5 | 0 | 0 | 0 | PASS |
| TAM-62 | main | 26 | 0 | 48 | 7 | PASS |
| TAM-64 | main | 11 | 0 | 13 | 3 | PASS |
| TAM-66 | main | 9 | 0 | 11 | 3 | PASS |
| TAM-68 | main | 7 | 0 | 20 | 3 | PASS |
| TAM-70 | main | 10 | 0 | 23 | 3 | PASS |
| TAM-72 | main | 13 | 0 | 6 | 7 | PASS |
| TAM-74 | main | 15 | 0 | 0 | 5 | PASS |
| TAM-76 | books-home | 12 | 0 | 4 | 2 | PASS |
| TAM-76 | chapters-drawer | 8 | 0 | 13 | 1 | PASS |
| TAM-76 | contents | 6 | 0 | 1 | 0 | PASS |
| TAM-76 | font-overlay | 3 | 0 | 10 | 1 | PASS |
| TAM-76 | listing | 3 | 0 | 4 | 0 | PASS |
| TAM-76 | reader | 8 | 0 | 2 | 0 | PASS |
| TAM-76 | scripture-reader | 4 | 0 | 2 | 0 | PASS |

## Headline

**Zero `missing` across every screen of every module** — no Figma component is absent from the build.
`stray` entries are Flutter structural widgets with no Figma counterpart (expected).
Every `intentional` divergence carries a written reason in that module's `cross-check.md` / `sweep-table.md`.

## Notable intentional divergences (each justified, none invented)

- **Home search bar + mic** — removed from Phase 1 per spec/PRD.
- **Home Pro crown badge** — no crown/VIP node exists anywhere in Figma; art was NOT authored (STRICT gate). Dropped from Phase 1 by product decision 2026-07-15.
- **Home status business-overlay** — the Home feed contract carries no profile fields; rendering it would fabricate a person. The real overlay composes from the user's own profile in the Status module.
- **Audio mini-player composition** — no Figma frame exists (Aarti open-question q1); its *icons* are Figma-exported, only the sticky-bar composition is a documented working assumption.
- **Wallpaper New/Trending row icons** — the Figma nodes are `visible:false`; correctly not rendered.
- **"All Gods" deity chip** — no Figma node (product-added null-filter); uses the genuine Figma Om glyph.
- **OS chrome** (status bar) and `visible:false` inherited template chrome — not app UI.

## Defects this comparison actually caught (and that were fixed)

This gate is not ceremonial — measuring instead of eyeballing caught real bugs:

- **Home carousel dots centred instead of pinned bottom-right — 132px off** (the "obvious" carousel default was wrong).
- **Home shortcut-grid block shadow never painted** (token extracted, left unwired).
- **Home playhead shadow at 2× opacity**, sourced from the wrong node.
- **Deity chip active state was invented** (2px orange ring) — replaced with the real Figma `state=active` variant (white inner ring + outer gradient ring + brand300 caption).
- **Books category artwork sized to the clipped region** instead of bleeding off the card; Material slider artifacts; missing panel shadow.
- **Horoscope `number` steps must render at 32px** (contentType drives the type scale) — a dead contract field would have been ignored.

## Honest limits

- No Android emulator in this environment, so this is a **headless golden-render + measured-geometry** comparison against Figma exports, not a live-device screenshot diff.
- Literal per-pixel identity against a Figma raster isn't achievable headlessly (font hinting/antialiasing differ between renderers). The enforced gate is: exact Figma-exported assets + extracted tokens + measured geometry + render-tree match + golden reviewed against the Figma frame.
- Devanagari renders as boxes in goldens (test-renderer font limitation, not app behaviour).
