import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/features/home/data/home_models.dart';

/// TAM-174 — parsing a CMS palette off the wire.
///
/// Parsing lives at the DATA boundary rather than in the widget so that an
/// unrenderable palette becomes `null` exactly once, and the tile falls back to
/// the shipped gradient, instead of throwing inside a `build` method halfway
/// down a `GridView`. These tests are that contract (#EXPORT_CRITICAL — the
/// grid must always paint).
///
/// The server validates the same shapes at both of its boundaries, so none of
/// the malformed cases below should ever reach a device. They are here because
/// "should never" is not "cannot": a row hand-edited by SQL bypasses the write
/// path entirely.
HomeShortcutTheme wire({
  String backgroundFrom = '#EAF4FF',
  num backgroundFromStop = 0.1,
  String backgroundTo = '#3896E9',
  num backgroundToStop = 1,
  String labelColor = '#1261A8',
}) =>
    HomeShortcutTheme(
      backgroundFrom: backgroundFrom,
      backgroundFromStop: backgroundFromStop,
      backgroundTo: backgroundTo,
      backgroundToStop: backgroundToStop,
      labelColor: labelColor,
    );

void main() {
  group('fromWire — the happy path', () {
    test('parses a well-formed palette', () {
      final theme = HomeShortcutThemeView.fromWire(wire())!;
      expect(theme.backgroundFrom, const Color(0xFFEAF4FF));
      expect(theme.backgroundTo, const Color(0xFF3896E9));
      expect(theme.labelColor, const Color(0xFF1261A8));
      expect(theme.backgroundFromStop, 0.1);
      expect(theme.backgroundToStop, 1.0);
    });

    test('colours are opaque — the contract carries no alpha', () {
      final theme = HomeShortcutThemeView.fromWire(wire())!;
      expect(theme.backgroundFrom.a, 1.0);
      expect(theme.labelColor.a, 1.0);
    });

    test('accepts lowercase hex — Figma exports it that way', () {
      final theme = HomeShortcutThemeView.fromWire(wire(backgroundFrom: '#eaf4ff'))!;
      expect(theme.backgroundFrom, const Color(0xFFEAF4FF));
    });

    // JSON numbers arrive as `int` when the CMS holds a whole value, and
    // `Alignment` takes `double`. Converting at the boundary keeps that cast
    // out of the widget.
    test('an integer stop widens to double', () {
      final theme = HomeShortcutThemeView.fromWire(wire(backgroundToStop: 1))!;
      expect(theme.backgroundToStop, isA<double>());
      expect(theme.backgroundToStop, 1.0);
    });
  });

  group('fromWire — degrades to null rather than throwing', () {
    test('no theme at all', () {
      expect(HomeShortcutThemeView.fromWire(null), isNull);
    });

    test('a malformed colour', () {
      expect(HomeShortcutThemeView.fromWire(wire(backgroundFrom: 'red')), isNull);
      expect(HomeShortcutThemeView.fromWire(wire(backgroundFrom: '#FFF')), isNull);
      expect(HomeShortcutThemeView.fromWire(wire(backgroundFrom: 'EAF4FF')), isNull);
      expect(HomeShortcutThemeView.fromWire(wire(backgroundFrom: '#GGGGGG')), isNull);
      expect(HomeShortcutThemeView.fromWire(wire(backgroundFrom: '')), isNull);
      expect(HomeShortcutThemeView.fromWire(wire(labelColor: '#12345')), isNull);
    });

    test('a non-finite stop', () {
      expect(HomeShortcutThemeView.fromWire(wire(backgroundToStop: double.nan)), isNull);
      expect(HomeShortcutThemeView.fromWire(wire(backgroundToStop: double.infinity)), isNull);
    });
  });

  group('gradient — stops become ALIGNMENTS, never LinearGradient.stops', () {
    // `set_wallpaper` is authored 0.14734 → 1.4734. Flutter's `stops` must lie
    // in 0..1 and asserts otherwise, so the out-of-range handle is expressed as
    // an end point below the card — which is exactly what Figma means by it.
    test('a stop above 1 survives as an alignment', () {
      final theme = HomeShortcutThemeView.fromWire(
        wire(backgroundFromStop: 0.14734, backgroundToStop: 1.4734),
      )!;
      final g = theme.gradient;
      expect(g.stops, isNull);
      expect((g.begin as Alignment).y, closeTo(-0.70532, 0.00001));
      expect((g.end as Alignment).y, closeTo(1.9468, 0.00001));
    });

    test('a full-height gradient maps to topCenter → bottomCenter', () {
      final theme = HomeShortcutThemeView.fromWire(
        wire(backgroundFromStop: 0, backgroundToStop: 1),
      )!;
      expect(theme.gradient.begin, Alignment.topCenter);
      expect(theme.gradient.end, Alignment.bottomCenter);
    });

    test('the common 10% start maps to y = -0.8', () {
      final theme = HomeShortcutThemeView.fromWire(wire(backgroundFromStop: 0.1))!;
      expect((theme.gradient.begin as Alignment).y, closeTo(-0.8, 0.00001));
    });

    test('colours ride in gradient order — from, then to', () {
      final theme = HomeShortcutThemeView.fromWire(wire())!;
      expect(theme.gradient.colors, <Color>[
        const Color(0xFFEAF4FF),
        const Color(0xFF3896E9),
      ]);
    });
  });
}
