# Horoscope module — design tokens & asset provenance (TAM-74)

All colours/type/geometry come from `lib/core/theme.dart` (`AppColors.horoscope*`,
`AppHoroscope`, `AppText.horoscope*`, `AppGradient.horoscopeScaffold`), each
citing its Figma node. No raw hex or eyeballed sizes at call sites. Figma file
`ipSvV1FnmzvV8TK2Ig8Aiq`; REST tree dumps in `scratch/horo-*.json`.

## Frames

| Screen | Node |
| --- | --- |
| Horoscope Main (zodiac grid) | `371:3796` |
| Horoscope Result (canonical) | `387:2571` (nav `387:2491`) |
| Result step examples (8 frames) | section `392:3149` |
| Zodiac icon masters | section `379:2409` |
| TTS component set | `1173:4508` |

## Read the VISIBLE fills only

Several nodes in these frames carry `visible:false` fills/strokes that the design
does **not** render. Reading `fills[0]` blindly produces a screen that looks
nothing like the frame. Confirmed invisible (do NOT implement):

- `387:2524` zodiac header — a cream `#FFF1E2` fill.
- `387:2525` / `387:2611` zodiac pill — a `#EAEBEE` 2px stroke; the pill is
  **borderless**.
- `387:2615` date box — an `#F8F8F8` fill + stroke; the date is **text-only**.
- `379:2333` zodiac card — a cream fill; the card is **transparent** with only
  the `#B8B8B8` hairline.
- `387:2543` bottom nav, `387:2523`–`387:2540` zodiac cards, `392:3112` duplicate
  card art — stale leftovers copied from the main frame.

## `contentType` drives the type scale (not just metadata)

The contract's `HoroscopeDailyStep.contentType` (`text | number | color`) exists
because the design renders a **number** step's value at double size:

| contentType | Figma node | Style |
| --- | --- | --- |
| `number` | `1162:4276` ("7") | **32**/24 w500 → `AppText.horoscopeResultNumber` |
| `text` | `1162:4436` | 16/24 w500 → `AppText.horoscopeResultBody` |
| `color` | `1162:4244` ("Sky Blue") | 16/24 w500 → `AppText.horoscopeResultBody` |

Figma really does set `lineHeight 24` under the 32px glyph (its text box is
262×24); kept verbatim — it's a single centred line with the whole card as slack.

## Colours (nodes)

| Token | Figma | Value |
| --- | --- | --- |
| `horoscopeTitle` | I371:3798;5186:10465 | #000000 24/32 w600 |
| `horoscopeDate` | 379:2578 | #767676 20/28 w600 |
| `horoscopeCardBorder` | 379:2333 | #B8B8B8 w1, r8 |
| `horoscopeCardLabel` | I379:2333;379:2331 | #3F3F3F 18/24 w500 |
| `horoscopeZodiacGlyph` | I379:2333;379:2410 | #FE8A02 (tint) |
| `horoscopeResultScrim` | 387:2573 | #000000 @0.50 |
| `horoscopeBackArrow` | I1173:4536;5186:10373 | #FFFFFF |
| `horoscopeTtsIcon` | I1173:4536;5186:10379 | #FFFFFF |
| `horoscopeResultZodiacGlyph` / `Name` | 387:2612 / 387:2613 | #FFE4C5 |
| `horoscopeResultDate` | 387:2616 | #B8B8B8 16/24 w400 |
| `horoscopeStepPillFill` / `Label` | 1162:4437 / 1162:4438 | #000000 @0.50 r8 / #FFFFFF 16/24 w600 |
| `horoscopeResultText` | 1162:4436 | #FFE4C5 16/24 w500, centred |
| `horoscopeCardArt` | 1162:4407 | #B8B8B8 (the export's own fill) |
| `horoscopeNextBtnFill` / `Border` / `Label` | 1162:4461 | #FFFFFF / #B8B8B8 w1.005 / #FE8A02 |

`AppGradient.horoscopeScaffold` — the Main frame's root fill is a
**GRADIENT_LINEAR** (not the flat `scaffoldWarm` other screens use): `#FFF1E2` →
white, reaching white at 0.4578 × 0.3846 = **17.6%** of the frame height.

## Geometry

The result column adds up exactly to the design device:
`64 nav + 74 header + 32 + 482 art + 24 + 37 CTA + 35 = 748 = 800 − 52 status bar`.
Verified by measuring the render tree (card art lands at y=222..704 and the CTA
at 728..765 — Figma's own numbers).

The grid is Figma `layoutMode: GRID`, `gridColumnCount: 3`,
`gridRowGap/gridColumnGap: 10`, padding 16. 3×103 + 2×10 = 329 vs the 328
available, so the cards flex to 102.67 and stay square.

Pills and buttons **hug** their labels — a `Container` with a non-null
`alignment` expands to fill instead, which is exactly the bug that made the step
pill 360 wide. Hugging reproduces Figma's numbers precisely: "A good time today"
→ 134 + 2×12 = **158**; "Next" → 31 + 24 = **55**; "Finish" → 38 + 24 = **62**.

## Assets (all exported from Figma — TAM-56 STRICT gate)

Provenance: `tools/figma-assets.manifest.json`. No `Icons.*` anywhere in
`lib/features/horoscope/**`.

| Asset | Node | Notes |
| --- | --- | --- |
| `zodiac_<12 signs>.svg` | masters in `379:2409` (aries `379:2347` … pisces `379:2399`) | Monochrome → **tinted at the call site**. |
| `tts_volume.svg` / `tts_muted.svg` | `1173:4507` / `1173:4506` | Both variants of the `TTS` COMPONENT_SET `1173:4508`. |
| `back_arrow.svg` | I387:2491;5186:10373;5177:7196 | Monochrome → tinted. |
| `result_card_frame.svg` | `1162:4407` | Border + flourish/sparkle; mock copy removed (see below). |
| `video_fallback.jpg` | `387:2572` @2x | Last-resort backdrop still. |

### Why the zodiac glyphs are bundled, not fetched from `iconAssetUrl`

The contract serves `HoroscopeZodiacCard.iconAssetUrl`, but the seed fills it
with a **`placehold.co` placeholder** (`prisma/seeds/_shared.ts`), so rendering
it would ship non-design art and break the STRICT gate. The zodiac set is a
**closed 12-value enum** whose real art lives in Figma's "Zodiac Icons" section —
so the glyph is a bundled asset keyed by `zodiacId` (`zodiacGlyphAsset`). If the
CMS ever serves real zodiac art, switch to `AppNetworkImage` and delete the map.

### Why the glyphs MUST be tinted at the call site

The exported **masters** carry `#FC7304`, but the grid **instances** render
`#FE8A02` and the result pill renders `#FFE4C5` — one asset, three colours.
Rendering any of them untinted would ship a subtly wrong orange.

### `result_card_frame.svg` — the one post-processed export

The node bundles the design's mock result copy as a TEXT child, and
`figma-export.ts`'s default render **outlines it into a baked path**. No
text-free variant exists (all 18 instances carry mock copy). It was therefore
fetched via the documented REST fallback with `&svg_outline_text=false`, which
turns the copy into a single `<text>` element, and that one element was removed —
so the app renders the live API step text inside Figma's own 27 art paths. The
paths are Figma's render byte-for-byte; nothing was drawn or altered.

### `video_fallback.jpg` — format + role

Rendered from the RECTANGLE that carries the stock-video poster image fill, at
the design's own 450×800 cover crop, @2x. Fetched via REST because
`figma-export.ts` only emits `svg|png` (TAM-60) and the same node as PNG@2x is
2.2 MB vs 1.4 MB as JPG — an opaque photo behind a 50% scrim, so JPG is the right
container. It is the **last resort only**: the contract's
`media.backgroundStaticFallbackUrl` (CMS) is tried first, and the video before
that.
