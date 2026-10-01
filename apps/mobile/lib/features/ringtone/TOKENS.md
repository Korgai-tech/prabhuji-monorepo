# Ringtone module — design tokens (TAM-68)

Every token below is cited from a Figma node in the Prabhuji file
`ipSvV1FnmzvV8TK2Ig8Aiq` (frames 670:4481 Home, 1073:3472 Search, 683:4775
Preview), extracted via the REST tree dump (`scratch/rt-*.json`) — not eyeballed.
Colors live in `AppColors`, geometry in `AppRingtone` (both in
`lib/core/theme.dart`). Assets are Figma-exported SVGs under
`assets/ringtone/` (provenance: `tools/figma-assets.manifest.json`).

## Colors (AppColors.ringtone*)

| Token | Value | Figma node |
| --- | --- | --- |
| `ringtoneCardBorder` | `brand300` #FE8A02 | card stroke 676:4711 |
| `ringtoneCardTitle` | #3E2723 | card title 676:4697 |
| `ringtoneCountText` | `grey400` #767676 | card counts 676:4709 / 676:4703 |
| `ringtonePlayCountIcon` | `grey500` #3F3F3F | headphones 683:4689 |
| `ringtoneSetCountIcon` | `brand300` #FE8A02 | ringtone bell 683:4558 |
| `ringtoneCountDivider` | `grey200` #EAEBEE | vertical divider 676:4704 |
| `ringtonePlayOverlayGlyph` | white | card play glyph 676:4771 |
| `ringtonePlayOverlayScrim` | #66000000 | scrim behind 52px ellipse 676:4764 (see note) |
| `ringtoneSearchBorder` | #E5E7EB | search field stroke 670:4608 |
| `ringtoneSearchHint` | #9CA3AF | placeholder + search icon 670:4610 / 670:4613 |
| `ringtonePreviewTitle` | #191815 | preview title 683:4786 |
| `ringtonePreviewMetric` | `grey500` #3F3F3F | preview counts 683:4799 etc. |
| `ringtoneSetCtaFill` | `brand300` #FE8A02 | Set Ringtone CTA 683:4904 |
| `ringtoneSetCtaLabel` | white | CTA label + glyph 683:4916 |
| `ringtonePlayCircle` | `brand200` #FFE4C5 | preview play/pause circle 683:4282 |
| `ringtonePlayCircleGlyph` | `brand400` #FC7304 | preview play/pause glyph 683:4286 |
| `ringtoneSearchHeading` | black #000000 | "Search Results" 1073:3927 |

## Geometry (AppRingtone)

| Token | Value | Figma node |
| --- | --- | --- |
| search field | 48 tall, r=9999, 1px stroke, 17px icon | 670:4608 / 670:4613 |
| back arrow | 36 frame / 20 glyph | Basic Nav 683:4816 |
| card | 103×179, r=8, 1px border | 676:4711 |
| card thumbnail | 103×103 square | 676:4694 |
| card play overlay | 52px circle, 24px glyph | 676:4763 |
| card count icons | 12×12 | 683:4688 / 683:4557 |
| grid | 3 columns, 10px gap | 670:4482 |
| preview hero | 300×300, r=12 | 683:4779 |
| preview metric icons | 18×18 | 683:4796 etc. |
| play/pause circle | 52px, 24px glyph | 683:4282 |
| Set Ringtone CTA | 328×44 (48 w/ pad), r=8, 20px glyph | 683:4904 |

## Notes / intentional deviations

- **Play-overlay scrim**: the 52px ellipse (676:4764) has its fill toggled OFF
  in the Figma instance; the exported cream play glyph (676:4771) alone is
  illegible on bright thumbnails, so a subtle 40%-black scrim circle backs it.
  No invented art — the glyph is the Figma export; the scrim is a legibility
  treatment recorded in the cross-check.
- **Mic icon (670:4614/4616)**: HIDDEN in Phase 1 — no voice search, no mic
  permission (spec q3). Recorded as an intentional cross-check divergence.
- **Openly/Chats/coins chrome (670:4588)**: inherited from another screen; not
  part of the Ringtone module — not rendered.
- **Preview player 10s-seek / skip (683:4814)**: single-clip preview renders
  play/pause only — no seek/skip (§6). Intentional cross-check divergence.
- **Basic Nav trailing gear/phone/pencil (683:4816)**: inherited nav actions,
  not rendered for this module.
- **Thumbnail / hero art**: CMS network images via `AppNetworkImage` — no Figma
  asset (renders the branded fallback in headless goldens).
