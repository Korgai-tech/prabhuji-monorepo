# Mantras & Stutis — design tokens (TAM-66)

Figma file `ipSvV1FnmzvV8TK2Ig8Aiq`. Colours/geometry extracted from the REST
tree dumps (`scratch/mantra_*.json`) of the coverage-set nodes and committed into
`lib/core/theme.dart` (`AppColors.mantra*` + `AppMantras`). No raw hex at call
sites — every literal lives in the theme with its Figma provenance.

## Colours (`AppColors`)

| Token | Value | Figma node | Meaning |
|---|---|---|---|
| `mantraArtworkBlock` | `brand200` #FFE4C5 | 438:3076 | peach artwork card fill (#FFE4C4) |
| `mantraText` | `brand300` #FE8A02 | 438:3199 | Devanagari mantra text (orange) |
| `mantraCounterPillBorder` | `black` #000000 | 457:3419 | counter pill hairline (0.82px) |
| `mantraCounterPillText` | `grey500` #3F3F3F | 457:3439 | "0/7 times" label |
| `mantraNextCardFill` | `grey200` #EAEBEE | 457:3481 | Next-track card background |
| `mantraNextTitle` | `black` #000000 | 457:3485/3486 | Next-card title + "Next" label |
| `mantraNextCircle` | `brand400` #FC7304 | 459:3119 | Next-card play circle |

Reused from Aarti/shell tokens (same design-system look): `aartiBackArrow`,
`aartiPlayerText` (#191815 title/singer), `aartiControlBar` (#3F3F3F control
pill), `aartiControlGlyph`, `aartiPlayCirclePaused/Playing`,
`aartiEngagementIcon/Count`, `aartiLikeActive`, `aartiSectionTitle`,
`aartiShowAll`, `aartiCardTitle`, `aartiCardSubtitle`, `aartiCategoryCardFill/
Label`, `cardSurface`.

## Geometry (`AppMantras`)

| Token | Value | Figma node |
|---|---|---|
| `artworkBlockHeight` / `artworkCover` | 150 / 150 | 438:3076 / 438:3078 |
| `artworkBlockRadius` / `artworkCoverRadius` | 8 / 8 | 438:3076 |
| `counterPillHeight` / `counterPillRadius` / `counterPillBorder` | 40 / 31 / 0.82 | 457:3419 |
| `counterPillPaddingH` / `counterPillGap` / `counterPillIcon` | 12 / 6 / 20 | 457:3419/3420 |
| `mantraTextGap` | 24 | 438:3075 auto-layout |
| `nextCardHeight` / `nextCardRadius` / `nextCardPaddingH` | 76 / 8 / 14 | 457:3481 |
| `nextThumb` / `nextThumbRadius` / `nextCircle` | 50 / 8 / 52 | 457:3482 / 459:3118 |
| `playCircle` / `controlTap` / `controlGlyph` | 52 / 44 / 24 | 438:3113 (reused AppAarti) |
| `controlBarRadius` | 40 | 438:3113 |
| `engagementGlyph` | 18 | 438:3189 / 438:3193 |
| `radioSize` / `counterRowHeight` | 26 / 48 | 1054:4251 / 1054:4140 |
| `playlistItemHeight` / `playlistThumb` | 74 / 50 | 1054:4350 / 1054:4345 |
| section/card geometry | reused `AppAarti` | 425:4951 etc. |

## Assets (Figma-exported → `assets/mantras/`, provenance in `tools/figma-assets.manifest.json`)

| File | Figma node | Notes |
|---|---|---|
| `back-arrow.svg` | I438:3115;5186:10373;5183:8406 | top-nav back arrow (tinted) |
| `like.svg` | 438:3189 | like/heart glyph (tinted) |
| `share.svg` | 438:3193 | share glyph (tinted) |
| `skip-prev.svg` | I438:3113;423:4306 | previous control (tinted white on dark bar) |
| `skip-next.svg` | I438:3113;423:4311 | next control (tinted) |
| `pause.svg` | I438:3113;423:4283 | play/pause centre (playing state) |
| `play.svg` | 459:3122 | play glyph (centre + next-card circle) |
| `counter-repeat.svg` | 457:3420 | counter-pill repeat icon (multicolor, untinted) |
| `radio-selected.svg` | I1054:4265;51739:4612 | counter-sheet selected radio (untinted) |
| `radio-unselected.svg` | I1054:4251;51739:4624 | counter-sheet unselected radio (untinted) |

Artwork / deity avatars / category imagery are CMS network images
(`AppNetworkImage`) — no Figma asset.

## Spec-authorized divergences from the Figma frames

- Counter pill default **`0/7 times`**, not Figma's `0/21` (§6.9 / #EXPORT_CRITICAL).
- Counter sheet **saves on radio tap** — the Figma "Continue" button (1054:4150)
  and "Reporting is private…" copy (1054:4151) are stray and NOT implemented.
- Player controls are **prev / play-pause / next only** — the Figma
  backward/forward-10-seconds nodes are NOT implemented (§6.8, §10).
- Playlist sheet header uses **"Playlist"**, not the Figma "Report User" /
  "Choose a user below to report" copy (cloned from a report sheet).
- Basic Nav trailing icons (gear/phone/pencil) present in Figma JSON are NOT
  rendered (no trailing actions for this module).
