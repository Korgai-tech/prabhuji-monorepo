# Aarti & Bhajans — extracted design tokens (TAM-64)

Source Figma (file `ipSvV1FnmzvV8TK2Ig8Aiq`): main `412:2656`, listing `420:2909`,
player `423:4387`, player controls `423:4384`. Geometry + fills read from the REST
tree dump (`scratch/aarti_*.json`) via `tools/figma-export.ts tree` — never eyeballed.
All values live in `lib/core/theme.dart` (`AppColors.aarti*`, `AppAarti`, `AppText.aarti*`).
Zero raw hex/geometry literals in `features/aarti/**`.

## Colours (`AppColors.aarti*`)

| Zone | Figma node | Hex | Token |
|---|---|---|---|
| Section title | 412:2867 | #000000 20/28 w600 | `aartiSectionTitle` (→ `black`) |
| "Show all" link | 412:2865 | #767676 14/20 w500 | `aartiShowAll` (→ `grey400`) |
| Audio-card title | 412:2915 | #000000 14/20 w500 | `aartiCardTitle` (→ `black`) |
| Audio-card subtitle | 412:2916 | #8B9CA9 11/16.5 w300 | `aartiCardSubtitle` (new hex) |
| Category card fill | 412:3001 | #FE7B00 | `aartiCategoryCardFill` (→ `brand500`) |
| Category card label | 412:3004 | #FFFFFF 16/24 w500 | `aartiCategoryCardLabel` (→ `white`) |
| Player title + metadata | 425:4849/4851/4852/4854 | #191815 | `aartiPlayerText` (new hex) |
| Elapsed / total time | 425:4869/4870 | #000000 14 w400 | `aartiPlayerTime` (→ `black`) |
| Like / share counts | 425:4861/4865 | #3F3F3F 14/20 w500 | `aartiEngagementCount` (→ `grey500`) |
| Like / share glyph | 425:4859/4863 | #3F3F3F | `aartiEngagementIcon` (→ `grey500`) |
| Progress track (unfilled) | 425:4873 | #000000 @30% | `aartiProgressTrack` |
| Progress fill + thumb | 425:4874/4875 | #000000 | `aartiProgressFill` / `aartiProgressThumb` |
| Play circle (paused) | 423:4373 | #FC7304 | `aartiPlayCirclePaused` (→ `brand400`) |
| Play circle (playing) | 423:4282 | #FFE4C5 | `aartiPlayCirclePlaying` (→ `brand200`) |
| Rewind/forward/skip glyph | 423:4384 | #3F3F3F | `aartiControlGlyph` (→ `grey500`) |
| Back arrow | 412:2658 leading | #000000 | `aartiBackArrow` (→ `black`) |

## Geometry (`AppAarti`)

| Zone | Figma node | Value | Token |
|---|---|---|---|
| Screen edge padding | 412:2842 pad | 16 | `screenPadding` |
| Section header→content gap | 412:2842 gap | 12 | `sectionHeaderGap` |
| Section header row | 412:2843 | 328×28 | `sectionHeaderHeight` |
| Horizontal card | 412:2912 | 100 w, art 100×100 r12, gap 7 | `hCardWidth`/`hCardArt`/`hCardInnerGap` |
| Horizontal row item gap | 412:2911 | 19 | `hCardGap` |
| Category card | 412:3001 | 159×100 r8, thumb 76 | `categoryCardWidth`/`Height`/`Radius`/`categoryThumb` |
| Grid gutter (2-col) | 328 − 159×2 | 10 | `gridGap` |
| Listing card | 420:3103 | 159 w, art 159×159 r12 | `listCardWidth`/`listCardArt`/`cardArtRadius` |
| Player cover | 425:4842 | 300×300 r12 | `playerCover`/`playerCoverRadius` |
| Player block gap | 425:4840 | 16 | `playerBlockGap` |
| Cover-block→controls gap | 425:4839 | 73 | `playerSectionGap` |
| Progress track / thumb | 425:4871 | 4 / 16 | `progressTrackHeight`/`progressThumb` |
| Play circle | 423:4372 | 52 | `playCircle` |
| Side control tap target | 423:4325/4356 | 44 (≥44 §12) | `controlTap` |
| Control glyph | 423:4317… | 24 | `controlGlyph` |
| Like/share glyph | 425:4859/4863 | 18 | `engagementGlyph` |

## Text styles (`AppText`)

- Section title → `headingXs(color: aartiSectionTitle)`
- Show all → `labelMd(color: aartiShowAll)`
- Card title → `labelMd(color: aartiCardTitle)`; subtitle → `aartiCardSubtitle()`
- Category label → `labelLg(color: aartiCategoryCardLabel)`
- Player title → `headingSm(color: aartiPlayerText)`
- Metadata label → `bodySm(color: aartiPlayerText)`; value → `labelMd(color: aartiPlayerText)`
- Time → `aartiTime()`; counts → `labelMd(color: aartiEngagementCount)`

## Assets (`assets/aarti/`, provenance in `tools/figma-assets.manifest.json`)

`back-arrow` (I412:2658;5186:10373;5183:8406), `rewind-10` (423:4317),
`forward-10` (423:4326), `skip-prev` (423:4306), `skip-next` (423:4311),
`play` (423:4376), `pause` (423:4283), `like` (425:4859), `share` (425:4863).
All monochrome → tinted at the call site with `ColorFilter.mode(..., srcIn)`.
Cover / category / deity artwork are CMS network images (`AppNetworkImage`) — no
Figma asset. Mini-player has **no Figma frame** (working assumption, flagged in the
sweep); it reuses `assets/audio/*` per TAM-59.
