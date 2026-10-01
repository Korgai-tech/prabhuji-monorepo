# Books & Scriptures — extracted design tokens (TAM-76)

Source Figma (file `ipSvV1FnmzvV8TK2Ig8Aiq`), coverage set: home `534:5061`,
listing `562:5565`, contents `639:3947`, reader `620:3904`, scripture reader
`647:4133`, chapters drawer `637:4191`, font overlay `637:4463`, book-card set
`562:5675`, listen-button set `663:4297`.

Geometry + fills read from the REST tree dumps (`tools/figma-export.ts tree` →
`scratch/books_*.json`) — never eyeballed. All values live in `lib/core/theme.dart`
(`AppColors.books*`, `AppBooks`, `AppGradient.books*`/`bookCover*`, `AppText.books*`).
Zero raw hex/geometry literals in `features/books/**`.

## Colours (`AppColors.books*`)

| Zone | Figma node | Hex | Token |
|---|---|---|---|
| Section title | 534:5065 / 5108 / 5138 | #000000 20/28 w600 | `booksSectionTitle` (→ `black`) |
| "Show all" link | 534:5067 | #767676 14/20 w500 | `booksShowAll` (→ `grey400`) |
| Book-card title | I534:5505;534:5403 | #000000 12/16 w500 | `booksCardTitle` (→ `black`) |
| Book-cover frame | I534:5505;534:5223 | #FFFFFF | `booksCardSurface` (→ `white`) |
| Book-cover shadow | I534:5505;534:5223 effect | #000000 @0.10, (−9,+7.5), blur 16.5 | `booksCardShadow` |
| Category card — Chalisa | 534:5112 | #302722 | `booksCategoryChalisa` |
| Category card — Aarti | 534:5116 | #C88611 | `booksCategoryAarti` |
| Category card — Kavach | 534:5120 | #505210 | `booksCategoryKavach` |
| Category card — Stotram | 534:5124 | #B13800 | `booksCategoryStotram` |
| Category label | 534:5115 | #FFFFFF 16/24 w500 | `booksCategoryLabel` (→ `white`) |
| Contents panel | 639:4029 | #FFFFFF | `booksContentsPanel` (→ `white`) |
| Kanda row title | 639:4046 | #3F3F3F 12/16 w500 | `booksContentsItemTitle` (→ `grey500`) |
| Kanda chapter count | 639:4080 | #3F3F3F 12/16 w400 | `booksContentsItemCount` (→ `grey500`) |
| Reader surface | 620:3904 / 647:4133 fill | #FFF1E2 (FLAT — not the home gradient) | `booksReaderSurface` (→ `brand100`) |
| Reader chapter title | 621:4078 / 647:4135 | #000000 20/28 w600 | `booksReaderTitle` (→ `black`) |
| Reader body | 620:4076 | #000000 16/28 w500 | `booksReaderBody` (→ `black`) |
| Reader nav title (kanda) | I620:3917;5186:10376 | #000000 20/28 w600 | `booksReaderNavTitle` |
| Reader nav glyphs | I620:3917;5186:10379/10380 | #000000 | `booksReaderNavIcon` |
| Chapters glyph, drawer open | I637:4196;…;620:4063 | #FC7304 | `booksReaderNavIconActive` (→ `brand400`) |
| CTA label | I663:4269;5178:7452 | #FFFFFF 14/20 w500 | `booksButtonLabel` (→ `white`) |
| CTA glyph | I663:4269;5178:7451;5178:7304 | #FFFFFF | `booksButtonGlyph` (→ `white`) |
| Drawer scrim | 637:4459 | #000000 @0.60 | `booksDrawerScrim` |
| Drawer panel | 637:4366 | #FFFFFF | `booksDrawerSurface` (→ `white`) |
| Drawer book title | 637:4424 | #000000 16/20 w700 | `booksDrawerBookTitle` (→ `black`) |
| Drawer metadata | 637:4427 / 637:4431 | #3F3F3F 12/16 w400 | `booksDrawerMeta` (→ `grey500`) |
| Drawer active chapter | 637:4370 | #000000 12/16 w500 | `booksDrawerChapterActive` |
| Drawer idle chapter | 637:4372 | #3F3F3F | `booksDrawerChapterIdle` (→ `grey500`) |
| Drawer active row fill | 637:4369 | #B8B8B8 @0.20 | `booksDrawerActiveFill` |
| Font panel | 620:3844 | #FFFFFF, r 0/0/16/16 | `booksFontPanel` (→ `white`) |
| Font glyph | I634:4097;620:4052 | #767676 | `booksFontIcon` (→ `grey400`) |
| Slider track | 620:3859 | #EAEBEE r2 | `booksFontSliderTrack` (→ `grey200`) |
| Slider fill | 621:4081 | #FE8A02 | `booksFontSliderFill` (→ `brand300`) |
| Slider thumb | 620:3860 | #FFFFFF r12 | `booksFontSliderThumb` (→ `white`) |
| Font value text | 620:3862 | #767676 14/20 w400 | `booksFontValueText` (→ `grey400`) |

## Gradients (`AppGradient`)

| Zone | Figma node | Value | Token |
|---|---|---|---|
| Home/listing scaffold | 534:5061 / 562:5565 fill | #FFF1E2 → #FFFFFF, white by 17.59% height | `booksScaffold` |
| CTA fill (Listen/Prev/Next/Start Reading) | 315:2813 | #FC7304 → #FE8A02 (L→R) | `ctaLR` (reused, TAM-49) |
| Book-cover spine gloss | I534:5505;534:5227 fill 1 | 12 stops in the first 6.56% of width, OVERLAY @0.20 | `bookCoverSpine` |
| Book-cover soft light | I534:5505;534:5227 fill 2 | radial white→transparent, SOFT_LIGHT | `bookCoverLight` |
| Drawer header | 637:4417 | #FF7200 → #FFD4A2 (L→R) | `booksDrawerHeader` |

## Geometry (`AppBooks`)

| Zone | Figma node | Value | Token |
|---|---|---|---|
| Screen/section padding | 534:5063 | 16 | `screenPadding` / `sectionPadding` |
| Section header → content gap | 534:5063 itemSpacing | 12 | `sectionHeaderGap` |
| Section header row | 534:5064 | 328×28 | `sectionHeaderHeight` |
| Carousel item gap | 534:5475 itemSpacing | 10 | `carouselGap` |
| Carousel row | 534:5471 | 206 tall | `carouselHeight` |
| Categories grid | 534:5111 | GRID, 2 cols, 10/10 gaps | `categoryColumns` / `categoryGap` |
| Category card | 534:5112 | 159×100 r8 | `categoryCardWidth/Height/Radius` |
| Category label inset | 534:5115 | +10,+10 | `categoryLabelInset` |
| Category artwork | 534:5114 | ink extent 98.5×97.5 at +88.88/+10.17 — bleeds off the card, clipped | `categoryArt*` |
| Listing grid | 562:5566 | GRID, 2 cols, 16 pad, 10/10 gaps | `listColumns` / `listGap` |
| Listing card | 562:5676 | 159×274 | `cardWidthLg` / `listCardHeight` |
| Contents hero card top | 639:4019 | y=99 (overlaps the nav — paints after it) | `contentsCardTop` |
| Start Reading | 639:4105 | 95×29 r8.04, centred, y=320 | `contentsCta*` |
| Contents panel | 639:4029 | full-bleed white from y=393 | `contentsPanelTop` |
| Kanda row | 639:4045 | 360×48, 20h/16v pad | `contentsRow*` |
| Reader column | 620:4077 | 16h / 32top / 10bottom pad, gap 22 | `readerPadding*` / `readerBlockGap` |
| Gradient CTA | 315:2813 | 37 tall, r8.04, 12.06h/8.04v pad, glyph 16, gap 8.04 | `button*` |
| Reader nav | 620:3917 | 64 tall, 8h pad, 36 leading frame, 20 glyph, 44 action frame | `nav*` |
| Reader body line ratio | 620:4076 | 28/16 = 1.75 | `readerBodyLineRatio` |
| Drawer panel | 637:4366 | 280 wide, right-aligned | `drawerWidth` |
| Drawer header | 637:4417 | 280×179, 16 pad | `drawerHeaderHeight` / `drawerHeaderPadding` |
| Drawer header texture | 637:4418 | OVERLAY @0.30 | `drawerTextureOpacity` |
| Drawer chapter row | 637:4371 | 280×48, 20h/16v pad | `drawerRow*` |
| Font panel | 620:3844 | 359×64, bottom corners r16 | `fontPanelHeight` / `fontPanelRadius` |
| Font row | 620:3854 | 20h/16v pad, gap 16 | `fontPanelPadding*` / `fontPanelGap` |
| Font panel shadow | 620:3844 effect | #000000 @0.12, (0,+8), blur 30 | `booksFontPanelShadow` / `fontPanelShadow*` |
| Slider track | 620:3859 | 212×4 r2 | `fontTrackWidth` / `fontTrackHeight` |
| Slider thumb | 620:3860 | 24 r12, stroke #EAEBEE w1, shadow #000000@0.10 (0,+2) blur 4 | `fontThumb*` / `booksFontThumb*` |
| Font value box | 620:3861 | 51×32 r4, stroke **w2** | `fontValueBox*` |

### Book card — one component, three scales

The `562:5675` set is ONE design scaled by `width / 120` (`AppBooks.cardBaseWidth`):

| Variant | Node | Width | Cover | Radius | Gap | Title |
|---|---|---|---|---|---|---|
| `Property 1=Book` | 534:5504 | 120 | 120×176 | 9 | 14 | 12/16 |
| `Property 1=Book-lg` | 562:5674 | 159 | 159×233 | 11.925 | 18.55 | 15.9/21.2 |
| `Property 1=sm` | 637:4299 | 100 | 100×147 | 7.5 | 11.67 | 10/13.3 |

`BookCard` therefore takes a `width` and derives the rest from `cardCoverRatio`
(176/120), `cardRadiusRatio` (9/120), `cardGapRatio` (14/120) and the two title
ratios — reproducing all three variants to <0.5px, instead of three hard-coded
widget variants.

## Text styles (`AppText`)

- Section title → `headingXs(color: booksSectionTitle)` (20/28 w600)
- Show all → `labelMd(color: booksShowAll)` (14/20 w500)
- Category label → `labelLg(color: booksCategoryLabel)` (16/24 w500)
- Book-card title → `booksCardTitle(fontSize:, lineHeight:)` — scales with the card
- CTA label → `booksButtonLabel()`; Start Reading → `booksCtaSmall()`
- Reader title → `booksReaderTitle()`; body → `booksReaderBody(fontSize:)`
- Contents row → `booksContentsItem()` / count → `booksContentsCount()`
- Drawer → `booksDrawerTitle()` / `booksDrawerMeta()` / `booksDrawerChapter()`
- Font value → `booksFontValue()`

## Assets (`assets/books/`, provenance in `tools/figma-assets.manifest.json`)

Monochrome SVG glyphs, all tinted at the call site with
`ColorFilter.mode(..., srcIn)` — never their exported fill:
`back-arrow` (I620:3917;5186:10373;5183:8406), `font-settings`
(I620:3917;5186:10379;5177:7196), `chapters-list` (I620:3917;5186:10380;5177:7196),
`listen-play` (I663:7474;663:4269;5178:7451), `listen-pause` (I663:4274;5178:7451),
`skip-backward` (I663:4248;5178:7451), `skip-forward` (I663:4298;5178:7451),
`text-size` (634:4097).

Raster: `category-chalisa/aarti/kavach/stotram.png` (534:5114/5118/5122/5126,
PNG@4x at the nodes' own 15° rotation), `cover-texture.png` (I534:5505;534:5226),
`drawer-header-texture.png` (637:4418).

Book covers are CMS network images (`AppNetworkImage`) — no Figma asset.

### Blend layers — why two "assets" are not assets

Three of the design's cover/header layers are **blend** layers, and an isolated
`/v1/images` render cannot bake a blend mode in (there is nothing beneath to
blend against). Read the raw exports and this is obvious: the cover texture comes
back as an opaque sheet of paper, the Lights gloss as a flat white rectangle.
Wiring them naively would hide the cover completely — the exact "unseen assets"
trap in the figma-flutter skill.

| Figma layer | Node | Fill blend | Treatment |
|---|---|---|---|
| Cover `Texture` | I534:5505;534:5226 | IMAGE, `MULTIPLY` | Exported PNG, composited via `BlendLayer(blendMode: multiply)` |
| Cover `Lights` (linear) | I534:5505;534:5227 fill 1 | `OVERLAY` @0.20 | **Not exported** — token `AppGradient.bookCoverSpine` from the node's own 12 stops |
| Cover `Lights` (radial) | I534:5505;534:5227 fill 2 | `SOFT_LIGHT` | **Not exported** — token `AppGradient.bookCoverLight` |
| Drawer header texture | 637:4418 | node `opacity: 0.30`, `OVERLAY` | Exported PNG, composited via `BlendLayer(blendMode: overlay, opacity: .30)` |

`BlendLayer` (`lib/shared/widgets/blend_layer.dart`) is the Flutter equivalent of
a Figma layer blend: it wraps its child in a `saveLayer` carrying the blend mode
+ opacity, so the layer composites against the backdrop. Flutter has no stock
widget for this (`ColorFiltered` blends a *colour*, not a layer).

### Known gaps (logged, not silently dropped)

- The `Lights` node also carries **four INNER_SHADOW effects** (OVERLAY blend,
  ±0.75/±6/±12 offsets). Flutter has no inner-shadow primitive; they are sub-pixel
  edge highlights on a ≤159px-wide thumbnail. Not reproduced — logged in
  `specs/evidence/TAM-76/fidelity/sweep-table.md`.
- The four Browse-Categories thumbnails are **generic stock photos** in the Figma
  mock (Stotram = a businessman holding a trophy; Kavach = lakeside yoga). They
  are exported and wired verbatim per the TAM-56 STRICT gate — never substituted
  or invented — and raised as an art follow-up for the design owner.
