import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/status/data/status_models.dart';
import 'package:mobile/features/status/feed/presentation/status_overlay.dart';

/// TAM-168 multi-size smoke test for [StatusOverlayBand].
///
/// The photo-only case (`avatarImageUrl` present, `personalDisplayName` empty)
/// is the #PLAN_UNCERTAINTY the ticket's overlay-title fix hinges on:
///  * a `Text` with an empty string collapses its row height (visibly shrinks
///    the band, breaking preview/export parity with the name-saved case);
///  * a `Text` with a zero-width space (`​`) keeps the row's baseline
///    metrics identical to the name-saved case AND stays stable at
///    `textScaleFactor = 2.0` accessibility scaling.
///
/// This test asserts the second property: NO layout exception across
/// 320/390/428 dp widths × text scales 1.0 and 2.0, and the band's height
/// stays comparable between the photo-only and name-saved profiles at each
/// scale (delta < 2 px).
void main() {
  const widths = <double>[320, 390, 428];
  const scales = <double>[1.0, 2.0];

  const nameOnly = StatusProfileData(
    activeProfileType: StatusProfileType.personal,
    personalDisplayName: 'Aditya Nath',
  );
  const photoOnly = StatusProfileData(
    activeProfileType: StatusProfileType.personal,
    avatarImageUrl: 'https://cdn/me.jpg',
  );

  Future<double> pumpAndMeasure(
    WidgetTester tester,
    StatusProfileData profile, {
    required double width,
    required double scale,
  }) async {
    final errors = <FlutterErrorDetails>[];
    final originalOnError = FlutterError.onError;
    FlutterError.onError = errors.add;
    addTearDown(() => FlutterError.onError = originalOnError);

    tester.view.physicalSize = Size(width, 800);
    tester.view.devicePixelRatio = 1.0;
    tester.platformDispatcher.textScaleFactorTestValue = scale;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    final media = Size(width, 449);
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: media.width,
            height: media.height,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                const Positioned.fill(child: ColoredBox(color: Colors.black)),
                StatusOverlayBand(
                  profile: profile,
                  safeArea: StatusSafeArea.figmaDefault,
                  mediaSize: media,
                ),
              ],
            ),
          ),
        ),
      ),
    ));
    await tester.pump();

    expect(
      errors,
      isEmpty,
      reason:
          'layout exceptions rendering the overlay band at $width dp @ scale=$scale:\n'
          '${errors.map((e) => e.exceptionAsString()).join('\n---\n')}',
    );
    expect(tester.takeException(), isNull);

    return tester.getRect(find.byKey(const Key('status-overlay-band'))).height;
  }

  for (final w in widths) {
    for (final s in scales) {
      testWidgets(
          'overlay band renders WITHOUT layout exceptions '
          '(photo-only + name-only) @ ${w}dp × textScale=$s', (tester) async {
        final nameHeight = await pumpAndMeasure(tester, nameOnly,
            width: w, scale: s);
        expect(nameHeight, greaterThan(0));
      });

      testWidgets(
          'photo-only band height ≈ name-only band height '
          '(zero-width-space keeps baseline metrics stable) '
          '@ ${w}dp × textScale=$s', (tester) async {
        final nameHeight = await pumpAndMeasure(tester, nameOnly,
            width: w, scale: s);
        // Reset flags/tester state — reuse a fresh pump for the photo-only
        // measurement so the previous widget tree doesn't affect metrics.
        await tester.pumpWidget(const SizedBox());
        final photoHeight = await pumpAndMeasure(tester, photoOnly,
            width: w, scale: s);
        expect(
          photoHeight,
          closeTo(nameHeight, 2),
          reason:
              'photo-only ($photoHeight) must be within 2 px of name-only '
              '($nameHeight) — a bigger delta means the empty title collapsed '
              'the row and the band lost baseline metrics.',
        );
      });
    }
  }
}
