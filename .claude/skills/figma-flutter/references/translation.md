# Figma → Flutter translation reference

Read SKILL.md first. This file is the lookup table for Phase 5 (widget translation)
and the concrete recipes for Phases 4 and 6.

## Layout mapping

| Figma | Flutter |
| --- | --- |
| Auto Layout (horizontal / vertical) | `Row` / `Column` |
| Auto Layout gap | `spacing:` param (Flutter ≥3.27) or `SizedBox` gaps |
| Padding on Auto Layout frame | `Padding` |
| "Fill container" child | `Expanded` |
| "Hug contents" | default intrinsic sizing — do NOT wrap in `Expanded` |
| Fixed w×h node | `SizedBox` / `AspectRatio(w/h)` — prefer `AspectRatio` for media so it scales across devices |
| Absolute-positioned child | `Stack` + `Positioned`/`Align` (children in Figma layer order — later paints on top) |
| Frame `cornerRadius` | `BorderRadius.circular(r)` on `Card`/`ClipRRect`/`DecoratedBox` |
| Stroke (w, color) | `Border.all(color, width)` or `BorderSide` on the shape |
| Full-bleed section (node width == frame width) | No horizontal margin on the card; pad the inner rows instead |
| Linear gradient fill / gradient variables | `DecoratedBox(LinearGradient(begin: top, end: bottom, colors: [...]))` — `Scaffold.backgroundColor` cannot express a gradient |

## Token mapping

| Figma variable kind | Flutter target |
| --- | --- |
| `Colors/Brand/*`, `Colors/Grey/*` | `ColorScheme` roles where a role fits (primary, onSurface, outlineVariant…) |
| Element-specific colors (badge, avatar, chip) | `abstract final class AppColors { static const … }` consumed at call sites |
| `Label/*`, `Body/*` text styles | `TextTheme` entries (size/weight/lineHeight ⇒ `height = lineHeight/size`) |
| Gradient pairs (`…/Top`, `…/Bottom`) | Two consts + a `LinearGradient` builder |
| Fonts | `google_fonts` package (runtime fetch, silent test fallback). Bundle font files only when pixel-true goldens are required. |

## Asset export recipes

Plain node (component/master or top-level node):

```
download_assets(fileKey, nodeId)            # default: node export settings, else png@1
download_assets(fileKey, nodeId, defaultScale: 3)   # explicit 3x for raster UI art
download_assets(fileKey, nodeId, defaultFormat: svg) # vector nodes (logos, icons)
```

Instance sub-node (artwork as it appears IN the screen — avoids master-component
overlay layers; `download_assets` rejects composite ids):

```bash
# id looks like I767:6580;767:6576;767:6557 — URL-encode ';' as %3B
curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/images/$FILE_KEY?ids=I767:6580%3B767:6576%3B767:6557&format=png&scale=3"
# → {"images": {"<id>": "<temporary S3 url>"}} — download promptly
```

Then: register the assets dir once in `pubspec.yaml`, and **Read every file** before
wiring (`file` for dims, Read tool to see it). Raster art → PNG @3x; vector marks → SVG
(needs `flutter_svg`) or PNG @4x if avoiding the dependency.

### Icons (the most-missed asset class)

Before Phase 5, inventory every icon node in the Phase-2 tree — `INSTANCE`/`VECTOR`
nodes named `icon/*` (or small ~16–48dp squares). Each inventory entry maps to one
exported file; a Material `Icons.*` glyph standing in for a design icon is a defect,
not a fallback — if every export path fails, stop and surface the blocker.

- Icon placed directly in the frame (plain id) → `download_assets(fileKey, nodeId, defaultFormat: svg)`.
- Icon nested inside a component instance (composite id, e.g. `I310:22;44:10` —
  `download_assets` rejects it) → the segment after the last `;` is the icon
  **master's plain node id**: `download_assets(fileKey, "44:10", defaultFormat: svg)`.
  Works without a REST token. Master fill color doesn't matter — tint at the call site.
- Wiring: `SvgPicture.asset(path, width: w, height: h, colorFilter: ColorFilter.mode(token, BlendMode.srcIn))`
  with `flutter_svg`, or `ImageIcon(AssetImage(path), size: s, color: token)` for
  monochrome PNG @4x. Color comes from the Phase-3 theme token, never the export's fill.

## Golden-test recipe (Phase 6, component level)

Plain `flutter_test` goldens — no extra package needed; adopt `alchemist` only when a
suite of goldens needs shared theming/CI config.

**One-time package setup (both are hard requirements once the real theme is pumped):**

1. `test/flutter_test_config.dart` (auto-loaded by every test):

```dart
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  await testMain();
}
```

2. Bundle the theme's fonts: create `assets/google_fonts/`, list it under pubspec
`assets:`, and drop in the exact TTFs google_fonts asks for. Trick: run the golden
test — the exception names the font AND the fonts.gstatic.com URL; `curl` it to
`assets/google_fonts/<FontName>.ttf` (e.g. `Inter-Regular.ttf`) and rerun until green.
Bundled fonts also mean no runtime font fetch in production.

```dart
// test/goldens/<widget>_golden_test.dart
testWidgets('FeatureShortcutGrid matches golden', (tester) async {
  tester.view.physicalSize = const Size(360, 400);   // dp of the Figma frame region
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(MaterialApp(
    theme: buildPrabhujiTheme(),                     // ALWAYS the real app theme
    home: Scaffold(body: FeatureShortcutGrid(...)),
  ));
  await tester.pumpAndSettle();

  // Image decode is real async I/O — without this, goldens render blank art.
  await tester.runAsync(() async {
    for (final element in find.byType(Image).evaluate()) {
      await precacheImage((element.widget as Image).image, element);
    }
  });
  await tester.pumpAndSettle();

  await expectLater(
    find.byType(FeatureShortcutGrid),
    matchesGoldenFile('goldens/feature_shortcut_grid.png'),
  );
});
```

- Generate/refresh: `flutter test --update-goldens test/goldens/`
- The generated PNG is also the Phase-6 comparison artifact: Read it, Read the
  `get_screenshot` reference, list diffs.
- Asset images render in goldens ONLY after the precache block above; network
  images need the test seam regardless.
- Commit goldens only for stable components; delete throwaway comparison goldens.
- **Cross-platform noise:** real-font goldens are platform-specific — macOS-generated
  PNGs fail Linux CI on font rasterization alone. Do NOT skip goldens over this; pick one:
  1. Tag and exclude (default, no new dependency): `@Tags(['golden'])` at the top of the
     test file, CI runs `flutter test --exclude-tags golden`, goldens stay committed and
     compared locally (`flutter test --tags golden`) — a local regression lock.
  2. `alchemist`: CI goldens use the obscured test font (platform-independent, safe to
     gate CI on) + platform goldens with real fonts for local verification. Adopt when
     the golden suite grows beyond a few files.
  3. Generate goldens inside the CI's Linux image (docker) if CI must gate on real-font
     renders.

## Screen-level comparison (emulator)

Preferred: the Maestro + hot-reload loop in [maestro-loop.md](maestro-loop.md) —
sub-second iterations, and Maestro drives the app to the state under test.
Fallback when Maestro isn't installed:

```bash
adb exec-out screencap -p > /tmp/app.png    # after driving the app to the screen
# vision-compare /tmp/app.png against get_screenshot(frame) — list diffs, fix, repeat
```

Use the emulator loop for whole screens (real fonts, image loading, gradients,
scroll behavior); use goldens for components. Both, for a fidelity sign-off.
