import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/home/data/home_models.dart';
import 'package:mobile/features/home/presentation/home_shortcut_grid.dart';
import 'package:mobile/state/providers.dart';

import '../../../support/fake_analytics.dart';
import '../../../support/fake_home_services.dart';

/// TAM-174 — the shortcut grid's gradient A/B arm.
///
/// The arm is decided by the SERVER and reaches the client as data: a palette
/// on the row means treatment, `null` means control. There is no variant flag
/// and no cohort logic in the app, so every test here drives the arm purely by
/// whether the fixture carries a theme.
///
/// The layout assertions are about SCALING, not pixels. The card must hold its
/// aspect ratio and derive its interior from its own measured width, so the
/// same widget is correct on a 320 dp phone and a foldable — hard-coding the
/// 104 dp design width is the bug these tests exist to catch.
Future<void> _pump(
  WidgetTester tester,
  List<HomeShortcutView> shortcuts, {
  Size size = const Size(360, 800),
  double textScale = 1.0,
}) async {
  tester.view.physicalSize = size * tester.view.devicePixelRatio;
  tester.view.devicePixelRatio = tester.view.devicePixelRatio;
  addTearDown(tester.view.resetPhysicalSize);

  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
          child: Scaffold(
            body: SingleChildScrollView(
              child: HomeShortcutGrid(shortcuts: shortcuts),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

List<HomeShortcutView> _themedSix() => [
      homeShortcut(key: 'set_status', label: 'स्टेटस लगाएं', theme: themedPalette),
      homeShortcut(key: 'set_ringtone', label: 'रिंगटोन लगाएं', theme: themedPalette),
      homeShortcut(
        key: 'set_wallpaper',
        label: 'वॉलपेपर लगाएं',
        theme: themedPaletteOutOfRangeStops,
      ),
      homeShortcut(key: 'aarti_bhajans', label: 'आरती और भजन', theme: themedPalette),
      homeShortcut(key: 'mantras_stutis', label: 'मंत्र और स्तुति', theme: themedPalette),
      homeShortcut(key: 'horoscope', label: 'राशिफल', theme: themedPalette),
    ];

/// The rendered size of one tile, read off the laid-out grid.
Size _cardSize(WidgetTester tester, String key) =>
    tester.getSize(find.byKey(Key('home-shortcut-$key')));

void main() {
  group('arm selection is driven by data, not by a flag', () {
    testWidgets('a themed row paints the palette gradient', (tester) async {
      await _pump(tester, _themedSix());

      final container = tester.widget<Container>(
        find
            .descendant(
              of: find.byKey(const Key('home-shortcut-set_status')),
              matching: find.byType(Container),
            )
            .first,
      );
      final decoration = container.decoration! as BoxDecoration;
      final gradient = decoration.gradient! as LinearGradient;
      expect(gradient.colors, <Color>[
        themedPalette.backgroundFrom,
        themedPalette.backgroundTo,
      ]);
    });

    testWidgets('an unthemed row keeps the shipped control gradient', (tester) async {
      await _pump(tester, [homeShortcut(key: 'set_status', label: 'Set Status')]);

      final container = tester.widget<Container>(
        find
            .descendant(
              of: find.byKey(const Key('home-shortcut-set_status')),
              matching: find.byType(Container),
            )
            .first,
      );
      final decoration = container.decoration! as BoxDecoration;
      expect(decoration.gradient, AppGradient.homeShortcutCard);
    });

    testWidgets('the label wears the palette colour in the gradient arm', (tester) async {
      await _pump(tester, _themedSix());

      final text = tester.widget<Text>(
        find.descendant(
          of: find.byKey(const Key('home-shortcut-set_status')),
          matching: find.text('स्टेटस लगाएं'),
        ),
      );
      expect(text.style?.color, themedPalette.labelColor);
      expect(text.maxLines, 2);
      expect(text.overflow, TextOverflow.ellipsis);
    });
  });

  group('the card scales with width and holds its aspect ratio', () {
    // The central requirement: nothing is hard-coded at the 104 dp design width.
    testWidgets('aspect ratio is held at 320, 360 and 412 dp', (tester) async {
      for (final width in <double>[320, 360, 412]) {
        await _pump(tester, _themedSix(), size: Size(width, 900));
        final size = _cardSize(tester, 'set_status');
        expect(
          size.width / size.height,
          closeTo(AppHome.shortcutCardAspect, 0.02),
          reason: 'aspect drifted at ${width}dp',
        );
      }
    });

    testWidgets('the card GROWS with the viewport rather than staying 104 dp', (tester) async {
      await _pump(tester, _themedSix(), size: const Size(320, 900));
      final narrow = _cardSize(tester, 'set_status');
      await _pump(tester, _themedSix(), size: const Size(412, 900));
      final wide = _cardSize(tester, 'set_status');

      expect(wide.width, greaterThan(narrow.width));
      expect(wide.height, greaterThan(narrow.height));
      // A fixed-size card would report the design width at both viewports.
      expect(narrow.width, isNot(closeTo(AppHome.shortcutBaseWidth, 0.5)));
    });

    testWidgets('three columns fill the content width exactly', (tester) async {
      await _pump(tester, _themedSix(), size: const Size(360, 900));
      final card = _cardSize(tester, 'set_status');
      // 360 − 2×16 screen padding = 328, minus two 8 dp gaps, over three cards.
      const expected =
          (360 - 2 * AppHome.screenPadding - 2 * AppHome.shortcutGapGradient) / 3;
      expect(card.width, closeTo(expected, 0.5));
    });

    testWidgets('the label font scales with the card, within its clamp', (tester) async {
      double labelSize(WidgetTester t) => t
          .widget<Text>(
            find.descendant(
              of: find.byKey(const Key('home-shortcut-set_status')),
              matching: find.text('स्टेटस लगाएं'),
            ),
          )
          .style!
          .fontSize!;

      await _pump(tester, _themedSix(), size: const Size(320, 900));
      final narrow = labelSize(tester);
      await _pump(tester, _themedSix(), size: const Size(412, 900));
      final wide = labelSize(tester);

      expect(wide, greaterThan(narrow));
      // Clamped at both ends so the label stays legible and never dominates.
      const design = AppHome.shortcutBaseWidth * AppHome.shortcutLabelSizeRatio;
      expect(narrow, greaterThanOrEqualTo(design * AppHome.shortcutLabelScaleMin - 0.01));
      expect(wide, lessThanOrEqualTo(design * AppHome.shortcutLabelScaleMax + 0.01));
    });
  });

  /// The two arms render at DIFFERENT sizes, and that is intended — each arm
  /// renders its own Figma frame (control 103×117 @ gap 10, gradient 104×94 @
  /// gap 8), so the gradient grid block is ~47 dp shorter at 360 dp and the
  /// feed below it starts higher. The shorter tile is part of the redesign
  /// being tested.
  ///
  /// Pinned because the difference reads as a bug at a glance — it has been
  /// queried twice — and is equally easy to break by tidying one arm's
  /// constants toward the other's. They were briefly matched and deliberately
  /// reverted (2026-09-11).
  ///
  /// WHAT THIS COSTS THE EXPERIMENT: size, palette, copy language and artwork
  /// all differ between the arms at once, so a conversion delta cannot be
  /// attributed to any one of them. That is a deliberate product choice — ship
  /// and measure the redesign whole — but it bounds what the result can say,
  /// and whoever reads the numbers should know it before drawing a conclusion
  /// about colour.
  group('per-arm geometry', () {
    Future<Size> cardAt(WidgetTester tester, {required bool themed}) async {
      await _pump(
        tester,
        [
          for (final k in ['a', 'b', 'c', 'd', 'e', 'f'])
            homeShortcut(key: k, label: 'Set Wallpaper', theme: themed ? themedPalette : null),
        ],
        size: const Size(360, 900),
      );
      return tester.getSize(find.byKey(const Key('home-shortcut-a')));
    }

    Future<Size> gridAt(WidgetTester tester, {required bool themed}) async {
      await cardAt(tester, themed: themed);
      return tester.getSize(find.byKey(const Key('home-shortcut-grid')));
    }

    testWidgets('the gradient card is its own frame, 104×94 exactly', (tester) async {
      final card = await cardAt(tester, themed: true);
      // 360 − 2×16 padding = 328, minus two 8 dp gaps, over three columns = 104.
      expect(card.width, closeTo(104, 0.5));
      expect(card.height, closeTo(94, 0.5));
    });

    testWidgets('the control card keeps its shipped 103×117', (tester) async {
      final card = await cardAt(tester, themed: false);
      // 103×3 + 10×2 = 329 into 328, hence the 0.3 dp shave (pre-existing).
      expect(card.width, closeTo(102.7, 0.5));
      expect(card.height, closeTo(116.6, 0.5));
    });

    testWidgets('the gradient tile is SHORTER — the arms are not matched',
        (tester) async {
      final gradient = await cardAt(tester, themed: true);
      final control = await cardAt(tester, themed: false);
      expect(gradient.height, lessThan(control.height));
      expect(control.height - gradient.height, closeTo(22.6, 1.0));
    });

    // The consequence on the rest of the screen: the feed starts higher in the
    // gradient arm. Asserted so nobody is surprised by it in a screenshot diff.
    testWidgets('the gradient grid block is ~47 dp shorter', (tester) async {
      final gradient = await gridAt(tester, themed: true);
      final control = await gridAt(tester, themed: false);
      expect(control.height - gradient.height, closeTo(47.2, 1.5));
    });

    /// The artwork's baseline sits on the card's bottom edge, matching the
    /// control card's own `bottomCenter`.
    ///
    /// At this card aspect the band and the asset match exactly (104×68), so
    /// the alignment is normally a no-op — it matters when a two-line label or
    /// a large `textScaler` squeezes the band, keeping the art planted on the
    /// bottom edge instead of drifting up.
    testWidgets('the artwork is bottom-anchored, as in the control card',
        (tester) async {
      await _pump(tester, [
        homeShortcut(
          key: 'set_status',
          label: 'स्टेटस लगाएं',
          // An iconUrl is required for an Image to exist at all — without one
          // `_ThemedArt` renders `SizedBox.shrink()`.
          iconUrl: 'https://cdn.example.com/gradient/status.png',
          theme: themedPalette,
        ),
      ]);
      final img = tester.widget<Image>(
        find.descendant(
          of: find.byKey(const Key('home-shortcut-set_status')),
          matching: find.byType(Image),
        ),
      );
      expect(img.alignment, Alignment.bottomCenter);
      expect(img.fit, BoxFit.contain);
    });
  });

  /// Aspect ratio is the invariant that makes the tile safe at any width: the
  /// card is sized by `GridView` from the available space, and everything
  /// inside derives from its measured width. If the aspect drifted, every
  /// interior ratio would drift with it.
  testWidgets('holds its aspect ratio from 320 dp to 800 dp', (tester) async {
    for (final width in <double>[320, 360, 412, 432, 600, 800]) {
      await _pump(tester, _themedSix(), size: Size(width, 1280));
      final card = _cardSize(tester, 'set_status');
      expect(
        card.width / card.height,
        closeTo(AppHome.shortcutCardAspect, 0.02),
        reason: 'aspect drifted at ${width}dp',
      );
    }
  });

  /// Large accessibility text is absorbed by the ART, not by overflowing the
  /// card — `Expanded` on the art band is what makes that true. Worth pinning
  /// the mechanism and not just the absence of an exception: at 2× on a 320 dp
  /// phone the art region drops to ~28 dp, which is small but intact, and a
  /// regression here would show up as a RenderFlex error on real devices
  /// belonging to users who turned font scaling up.
  testWidgets('large text shrinks the artwork rather than overflowing',
      (tester) async {
    double artHeight(WidgetTester t) => t.getSize(
          find
              .descendant(
                of: find.byKey(const Key('home-shortcut-set_status')),
                matching: find.byType(Image),
              )
              .first,
        ).height;

    final withArt = [
      homeShortcut(
        key: 'set_status',
        label: 'वॉलपेपर लगाएं',
        iconUrl: 'https://cdn.example.com/gradient/status.png',
        theme: themedPalette,
      ),
    ];

    await _pump(tester, withArt, size: const Size(320, 800));
    final normal = artHeight(tester);
    await _pump(tester, withArt, size: const Size(320, 800), textScale: 2.0);
    final scaled = artHeight(tester);

    expect(tester.takeException(), isNull);
    expect(scaled, lessThan(normal));
    expect(scaled, greaterThan(0));
  });

  group('out-of-range gradient stops', () {
    // `set_wallpaper` is authored 0.14734 → 1.4734. Building this with
    // `LinearGradient.stops` would assert on every frame; the widget maps the
    // stops onto `Alignment`, which has no such constraint.
    testWidgets('a stop above 1 renders without throwing', (tester) async {
      await _pump(tester, _themedSix());
      expect(tester.takeException(), isNull);

      final container = tester.widget<Container>(
        find
            .descendant(
              of: find.byKey(const Key('home-shortcut-set_wallpaper')),
              matching: find.byType(Container),
            )
            .first,
      );
      final gradient =
          (container.decoration! as BoxDecoration).gradient! as LinearGradient;
      // stops are expressed as alignments, never as `stops`
      expect(gradient.stops, isNull);
      expect((gradient.end as Alignment).y, closeTo(-1 + 2 * 1.4734, 0.0001));
      expect((gradient.begin as Alignment).y, closeTo(-1 + 2 * 0.14734, 0.0001));
    });
  });

  group('degradation', () {
    testWidgets('a themed row with no iconUrl still renders a labelled tile', (tester) async {
      await _pump(tester, [
        homeShortcut(key: 'set_status', label: 'स्टेटस लगाएं', theme: themedPalette),
      ]);
      expect(find.text('स्टेटस लगाएं'), findsOneWidget);
      expect(find.byType(Image), findsNothing);
      expect(tester.takeException(), isNull);
    });

    // Ops part-way through theming the catalogue is a normal state, not an
    // outage: the themed rows use the new geometry and the unthemed one falls
    // back to the control surface inside it.
    testWidgets('a mixed catalogue renders every tile', (tester) async {
      await _pump(tester, [
        homeShortcut(key: 'set_status', label: 'Set Status', theme: themedPalette),
        homeShortcut(key: 'mantras_stutis', label: 'Mantras'),
      ]);
      expect(find.byKey(const Key('home-shortcut-set_status')), findsOneWidget);
      expect(find.byKey(const Key('home-shortcut-mantras_stutis')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('analytics', () {
    // The arm must reach the funnel, or the experiment cannot be read. It rides
    // as an EVENT property (a fact about this render), never as a user property,
    // and it is the ARM — never the server's bucket.
    testWidgets('home_widget_clicked carries grid_variant for each arm', (tester) async {
      for (final (theme, expected) in <(HomeShortcutThemeView?, String)>[
        (themedPalette, 'gradient_v1'),
        (null, 'control'),
      ]) {
        final analytics = RecordingAnalytics();
        await tester.pumpWidget(
          ProviderScope(
            overrides: [analyticsProvider.overrideWithValue(analytics)],
            child: MaterialApp(
              home: Scaffold(
                body: HomeShortcutGrid(
                  shortcuts: [
                    // A destination the allowlist does NOT resolve, on purpose:
                    // `_onTap` fires analytics BEFORE it returns on an
                    // unresolvable key, so the tap is counted without needing a
                    // GoRouter in the tree. The nav path has its own coverage in
                    // `home_shortcut_grid_test.dart`.
                    homeShortcut(
                      key: 'set_status',
                      label: 'Set Status',
                      destinationValue: 'not-a-real-module',
                      theme: theme,
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.byKey(const Key('home-shortcut-set_status')));
        await tester.pump();

        final props = analytics.propsFor('home_widget_clicked');
        expect(props['grid_variant'], expected);
        // The bucket is never a client concern and must not appear by accident.
        expect(props.containsKey('bucket'), isFalse);
      }
    });
  });

  group('accessibility text scaling', () {
    // The label band is far tighter than the control card's overlay, so this is
    // the most likely regression: `Expanded` on the art is what absorbs a
    // taller label instead of overflowing.
    // 320 → 800 dp: a small phone, the Pixel baseline, a large phone, a folded
    // device opened, and a tablet. The top end matters because the grid stays
    // 3-column at every width, so a tablet card is ~249 dp wide — far outside
    // anything the Figma frame was drawn at.
    for (final size in <Size>[
      Size(320, 800),
      Size(360, 800),
      Size(412, 915),
      Size(600, 900),
      Size(800, 1280),
    ]) {
      for (final scale in <double>[1.0, 2.0]) {
        testWidgets('no overflow at ${size.width}x${size.height} @ ${scale}x text',
            (tester) async {
          await _pump(tester, _themedSix(), size: size, textScale: scale);
          expect(tester.takeException(), isNull);
        });
      }
    }
  });
}
