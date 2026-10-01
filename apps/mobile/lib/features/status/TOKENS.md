# Status module — design tokens & asset provenance (TAM-72)

All colours/type/geometry come from `lib/core/theme.dart` (`AppColors.status*`,
`AppStatus`, `AppText.*`, `AppGradient.ctaLR`), each citing its Figma node. No
raw hex or eyeballed sizes at call sites. Figma file `ipSvV1FnmzvV8TK2Ig8Aiq`;
REST tree dumps in `scratch/status-*.json`.

## Frames

| Screen | Node |
| --- | --- |
| Status Home | `302:4384` |
| Personal Details | `371:2185` |
| Business Details | `371:3567` |

## The 0.8193 scale factor (why the card numbers look odd)

The `Status-swipe` instance (`330:6125`) is placed at **0.8193386 scale** inside
the 360-wide Home frame. Every metric inside the card is therefore the master's
× 0.8193 — e.g. the 16/24 name style *renders* at 13.11/19.66, and the card is
294.96 wide (360 × 0.8193). `AppStatus` stores the **rendered** numbers, because
those are what the design actually shows.

## Colours (nodes)

| Token | Figma | Value |
| --- | --- | --- |
| `statusTitle` | I302:4928;5186:10465 | #000000 24/32 w600 |
| `statusEditPillFill` / `Border` / `Label` | I302:4928;5186:10469 | #FFFFFF / #B8B8B8 w1 / #000000 |
| `statusCardFill` / `statusCardBorder` | I330:6125;322:1721 | #FFFFFF / #FCDBD3 w0.82 |
| Share CTA fill | I330:6125;322:1724 | `AppGradient.ctaLR` (#FC7304 → #FE8A02), r8.04 |
| `statusShareBtnLabel` | I330:6125;322:1724;5178:7452 | #FFFFFF 14.07/20.10 w500 |
| `statusCountText` / `statusCountIcon` | I330:6125;322:1728 / 1726 | #3F3F3F 11.47/16.39 w500 |
| `statusNextBtnFill` / `Border` / `Label` | I330:6125;322:1740 | #FFFFFF / #B8B8B8 w1.005 / #000000 12.06/16.08 |
| `statusOverlayBorder` | I330:6125;322:1743 | #EAEBEE w0.82 |
| `statusOverlayName` | I330:6125;322:1749 | #000000 13.11/19.66 w500 |
| `statusOverlayDetail` | I330:6125;322:1758 / 1765 | #767676 11.47/16.39 w400 |
| `statusAvatarRing` / `statusAvatarFill` | I330:6125;322:1769 / 1770 | #EAEBEE w0.70 / #FFFFFF |
| `statusAvatarGlyph` | I330:6125;322:1771;3463:405658 | #B8B8B8 (stroke) |
| `statusAvatarBadgeFill` / `Glyph` | I330:6125;322:1772 / 1773;3463:405286 | #FFFFFF / #B8B8B8 (stroke) |
| `statusDetailsTitle` | I371:2371;5186:10376 | #000000 24/32 w600 |
| `statusBackArrow` | I371:2371;5186:10373;5177:7196;5178:7295 | #000000 |
| `statusTabActive` | I371:3531;371:3524 | **#EF8A21** — this frame's own orange, NOT the brand300 ramp; kept literal |
| `statusTabInactive` | I371:3531;371:3527;371:3520 | #000000 16/24 w400 |
| `statusTabGroupLine` | 371:3531 | #969696 w1 (bottom only) |
| `statusFieldBorder` / `statusFieldLabel` | 371:3713 (default) | #EAEBEE w1 / #767676 12/16 w500 |
| `statusFieldBorderFocused` / `LabelFocused` | 371:3448 (focused) | #FE8A02 w1.5 / #FE8A02 12/16 w500 |
| `statusFieldText` | 371:3451 | #000000 16/24 w400 |
| `statusSectionLabel` | 371:3671 | #767676 12/16 w400 |
| `statusPickerBadgeFill` / `Border` / `Glyph` | 371:3549 / I371:3556;371:3550 | #FE8A02 / #FFFFFF w2 / #FFFFFF |
| Save CTA | 371:3724 / 371:3738 | `AppGradient.ctaLR`, r8, #FFFFFF 16/24 w500 label |

### Tokens that are NOT Figma reads (declared as such in `theme.dart`)

| Token | Why |
| --- | --- |
| `statusFieldError` | Figma ships **no** error/validation state for these fields (`rough_plan/prabhuji-status-sharing-plan/figma-links.md`). Spec-driven (§7); reuses the existing `error200` ramp. |
| `statusMediaBackdrop` | Letterbox behind the 9:16 media — no Figma node; mirrors `wallpaperImageBackdrop`. |

## Geometry (`AppStatus`)

Header 64 (16 left / 8 right pad) · Edit pill 119×36 r999, 12h/8v pad, 16 glyph ·
deity row 80 + 10 gap · card 294.96×505.88 inset 32.8 · actions 57.19 (6.03h /
10.06v pad) · footer 282.89 SPACE_BETWEEN · Share 86.23×37.08 r8.04 · counts 14
glyph + 3.28 gap · Next 46.1×29.06 r8.04 · hero 294.96×448.69 · overlay band
294.96×63.83 (top r9.83, 9.83h/4.92v pad, text inset 77.02) · overlay avatar
67.19 (inner 60.19, rise 18.84, badge 19.6) · details nav 64 (44 back frame, 20
glyph) · tabs 360×48 (3px active underline / 1px group line) · content 328 wide
(16 below tabs, 32 above Save, 24 between fields) · field 328×56 r50 (20h pad) ·
avatar picker 128 (inner 114.7, badge 44, glyph 20) · Save 328×44 r8.

## The overlay band ↔ `overlaySafeArea`

TAM-71 ships `overlaySafeArea` as **fractions of the media box** (seed
`{top:0.1, bottom:0.14, left:0.05, right:0.05}`). The band is laid out from it:

- **`bottom`** → band height (bottom-anchored, full-bleed). Figma's band is
  63.83 / 448.69 = **0.1423** — i.e. the design and the seeded 0.14 agree, which
  is what makes this reading right. A usable value is honoured **verbatim**.
- **`left`/`right`** → a MINIMUM content inset (`max(figmaPadding, fraction ×
  width)`), so live data can only push content further inside, never outside.
- **`top`** → headroom kept clear; nothing draws above `(1 - bottom)`, so the
  deity's face is never covered (PRD §6.7). Asserted in the widget tests.
- Unusable (`bottom < 0.05`, zeroed, out of range) → the template's safe area,
  else the Figma default.

## Assets (all downloaded from Figma — TAM-56 STRICT gate)

Provenance: `tools/figma-assets.manifest.json`. Status media + user avatars are
CMS/network images (`AppNetworkImage`) — no Figma asset.

| Asset | Figma node | Tint |
| --- | --- | --- |
| `share_whatsapp.svg` | I330:6125;322:1724;5178:7451 | monochrome → tinted white at the call site |
| `like.svg` | I330:6125;322:1726 | monochrome → `statusCountIcon` / `statusLikeActive` |
| `view.svg` | I330:6125;322:1730 | monochrome → `statusCountIcon` |
| `edit_pencil.svg` | I302:4928;5186:10469;5183:8514 | 2-tone (orange + white knockout) → **untinted** |
| `camera.svg` | I371:3556;371:3550 | already #FFFFFF → **untinted** |
| `back.svg` | I371:2371;5186:10373;5177:7196 | monochrome → `statusBackArrow` |
| `avatar_person.svg` | I330:6125;322:1771 | stroke #B8B8B8 is the design colour → **untinted** |
| `plus_circle.svg` | I330:6125;322:1773 | stroke #B8B8B8 is the design colour → **untinted** |
| `overlay_template_bg.png` | I330:6125;322:1743 (image fill `7678fa5a…`) | full-bleed art → as-is |

### Note on `overlay_template_bg.png`

The overlay template's background is an **IMAGE FILL**, not a renderable node, so
`figma-export.ts` (which drives `/v1/images` node renders) cannot export it.
It was downloaded from Figma's documented image-fills endpoint
(`GET /v1/files/{key}/images` → `imageRef` → S3 URL) and recorded in the
manifest. Still 100% Figma-sourced; nothing was drawn or invented.

### Nodes deliberately NOT exported

| Node | Why |
| --- | --- |
| `I330:6125;322:1744` (phone-call icon) | `visible:false` in the frame — the Figma render endpoint returns no image for it. The mobile shows as text in the "name • mobile" line. |
| `I330:6125;322:1750` (PILLS / marker pin) | `visible:false` in the frame. |

Both were surfaced by the export tool as blockers and then confirmed hidden in
the node JSON — **no Material glyph was substituted** (STRICT gate).
