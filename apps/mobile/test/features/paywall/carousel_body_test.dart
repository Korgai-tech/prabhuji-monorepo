import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/paywall/presentation/variants/carousel_body.dart';

/// TAM-160 — carousel behaviour test.
///
/// Covers the coverflow's async plumbing:
///   * autoplay advances every 5s (`Timer.periodic` cadence, loops to 0)
///   * `Listener.onPointerDown` cancels the timer (press-and-hold pause)
///   * `onPointerUp` restarts the timer
///
/// Uses the tester's own event loop for pumping past the autoplay interval —
/// the widget's `Timer.periodic` sits on that same loop.
///
/// `CoverflowCarousel` now accepts a `List<String>` of image sources — each
/// entry is either a local asset path (starts with `assets/`) or a network
/// URL. Any string works for the timer + gesture assertions below because
/// both Image.asset and Image.network fall back to the errorBuilder in the
/// widget-test environment.
void main() {
  final images = List<String>.generate(
    3,
    (i) => 'about:blank#img-$i',
  );

  CoverflowCarouselState findState(WidgetTester tester) =>
      tester.state<CoverflowCarouselState>(find.byType(CoverflowCarousel));

  testWidgets(
      'autoplay: timer advances the current page every 5 s (loops to 0)',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            height: 400,
            child: CoverflowCarousel(images: images),
          ),
        ),
      ),
    );
    await tester.pump();

    final state = findState(tester);
    expect(state.currentPageForTests, 0,
        reason: 'coverflow starts on page 0');
    expect(state.isAutoplayActiveForTests, isTrue,
        reason: 'autoplay must start on mount');

    // Tick past the autoplay interval; expect page 1 after the animation
    // finishes.
    await tester.pump(CoverflowCarouselState.autoplayInterval);
    await tester.pump(const Duration(milliseconds: 500));
    expect(state.currentPageForTests, 1,
        reason: 'auto-advance one page after 5s');

    // Tick again; expect page 2.
    await tester.pump(CoverflowCarouselState.autoplayInterval);
    await tester.pump(const Duration(milliseconds: 500));
    expect(state.currentPageForTests, 2,
        reason: 'second auto-advance takes us to the last page');

    // Tick again; expect wrap-around to page 0 (spec Q12: loop, don't bounce).
    await tester.pump(CoverflowCarouselState.autoplayInterval);
    await tester.pump(const Duration(milliseconds: 500));
    expect(state.currentPageForTests, 0,
        reason: 'third tick loops back to page 0 (Q12: loop, do NOT bounce)');

    // Cleanly tear down the timer.
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets(
      'press-and-hold: pointer-down cancels timer; pointer-up restarts it',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            height: 400,
            child: CoverflowCarousel(images: images),
          ),
        ),
      ),
    );
    await tester.pump();

    final state = findState(tester);
    expect(state.currentPageForTests, 0);
    expect(state.isAutoplayActiveForTests, isTrue);

    // Start a hold gesture on the coverflow container.
    final gesture = await tester.createGesture(
      kind: PointerDeviceKind.touch,
    );
    await gesture.down(tester.getCenter(
      find.byKey(const Key('paywall-carousel-hold-listener')),
    ));
    await tester.pump();

    expect(state.isAutoplayActiveForTests, isFalse,
        reason: 'pointer-down must cancel the autoplay timer');

    // While held, ticking past two intervals must NOT advance the page.
    await tester.pump(CoverflowCarouselState.autoplayInterval);
    await tester.pump(CoverflowCarouselState.autoplayInterval);
    expect(state.currentPageForTests, 0,
        reason: 'press-and-hold pauses autoplay — page must not change');

    // Release; autoplay must restart and advance on the next tick.
    await gesture.up();
    await tester.pump();
    expect(state.isAutoplayActiveForTests, isTrue,
        reason: 'pointer-up must restart the autoplay timer');

    await tester.pump(CoverflowCarouselState.autoplayInterval);
    await tester.pump(const Duration(milliseconds: 500));
    expect(state.currentPageForTests, 1,
        reason: 'releasing the hold restarts autoplay one interval later');

    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });
}
