# Wallpaper module — design tokens & asset provenance (TAM-70)

All colours/type/geometry come from `lib/core/theme.dart` (`AppColors.wallpaper*`,
`AppGradient.wallpaperOverlay`, `AppWallpaper`, `AppText.*`), each citing its
Figma node. No raw hex or eyeballed sizes at call sites. Figma file
`ipSvV1FnmzvV8TK2Ig8Aiq`; REST tree dumps in `scratch/wp-*.json`.

## Frames

| Screen | Node |
| --- | --- |
| Wallpaper Home | `704:5223` |
| Wallpaper Listing | `707:6427` |
| Static Wallpaper Preview | `282:2812` |
| Live Wallpaper Preview | `712:6622` |

## Colours (nodes)

| Token | Figma | Value |
| --- | --- | --- |
| `wallpaperNavTitle` / `wallpaperRowTitle` | I704:5786;5186:10376 / 707:6168 | #000000 20/28 w600 |
| `wallpaperShowAll` | 707:6170 | #767676 14/20 w500 |
| `wallpaperSetBtnFill` | 282:2818 | #FFFFFF |
| `wallpaperSetBtnLabel` | I282:2818;5178:7620 | #FE8A02 |
| `wallpaperFooterText` | 282:2817 | #FFFFFF 12/14.4 w400 |
| `wallpaperRailCount` / `wallpaperRailIcon` | 282:2837 / 282:2835 | #FFFFFF |
| `wallpaperRailScrim` | 282:2834 | #000000 @0.20 |
| `wallpaperLiveBadgeFill` | 712:6808 | brand orange #FE8A02 (bound variable 8064:43 — resolves orange in the listing frame render; raw JSON default is white@10%) |
| `wallpaperLiveBadgeText` | I712:6808;712:6715 | #FFFFFF 8/13.85 w500 |
| `AppGradient.wallpaperOverlay` | 282:2815 / 712:6625 | linear ↓ #000@40% → #000@0% (mid) → #000@60% (readability only; deity face stays clear) |

## Assets (`assets/wallpaper/`, manifest `tools/figma-assets.manifest.json`)

| File | Figma node | Notes |
| --- | --- | --- |
| `back.svg` | I704:5786;5186:10373;5183:8406 | monochrome; tinted black (nav) / white (preview) at the call site |
| `like.svg` | 282:2835 | monochrome heart; tinted white / brand400 when liked |
| `share_whatsapp.svg` | 282:2843 | monochrome WhatsApp glyph; tinted white |
| `live_glyph.svg` | I712:6808;712:6716 | the `fi_1687795` broadcast mark; used in the LIVE badge (white) AND the Top Live row header (black) — same Figma glyph |

### Assets deliberately NOT wired (recorded for the reviewer)

- **LIVE badge as a raster** (`712:6808`): NOT used — the badge is a solid pill
  (token) + `live_glyph.svg` + "LIVE" text (theme type). A raster export of the
  node came back near-blank because its fill is a bound variable (white@10% in
  isolation); the pill colour is rendered from the token instead. No invented art.
- **Row-header icons for New/Trending/Liked** (`707:6289`, `707:6383`): these
  Figma nodes are `visible: false` and return NO render from the REST `/images`
  endpoint — correctly NOT rendered (only the Top Live row shows an icon).

## Geometry — see `AppWallpaper` in `lib/core/theme.dart`

Home card 111×198 r8 (707:6173); row header 28 (707:6138); listing card 159×284
r8, 2-col (707:6452/6451); LIVE badge 45×18 r~4, 6/2 pad (712:6808); preview nav
64 (282:2819); Set button 44 r8 (282:2818); engagement rail 24px glyphs on a 40px
scrim, 24 gap (282:2832).

## Spec-authorized divergences

- **Counts are formatted client-side** ("5.6L", "12.5k") per PRD §6.11 — the
  static-preview Figma mock shows the raw `560678`; we render the formatted value.
- **Home cards carry no LIVE badge** (Figma 704:5223 home strips have none) — the
  badge lives on the listing grid cards only.
- **Live preview has one Set CTA** (home only, PRD §6.7) — no Set Lockscreen.
