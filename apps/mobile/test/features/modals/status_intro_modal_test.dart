import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/features/modals/data/modal_models.dart';
import 'package:mobile/features/modals/presentation/status_intro_modal.dart';

import '../../support/fake_modals_repository.dart';

/// [StatusIntroModal] widget tests (TAM-174) — presentational only. Server
/// call / analytics / dismiss-attribution wiring is `ModalHost`'s job and is
/// exercised in `modal_host_test.dart` instead (per the brief's test split).
Future<void> _pump(
  WidgetTester tester, {
  ServableModalView? content,
  VoidCallback? onViewed,
  VoidCallback? onCta,
  ValueChanged<String>? onDismiss,
  Size viewport = const Size(390, 800),
  double textScale = 1.0,
}) async {
  tester.view.physicalSize = viewport;
  tester.view.devicePixelRatio = 1.0;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: StatusIntroModal(
          content: content ?? statusIntroModalFixture(),
          onViewed: onViewed ?? () {},
          onCta: onCta ?? () {},
          onDismiss: onDismiss ?? (_) {},
        ),
      ),
    ),
  );
  // Flush the `addPostFrameCallback` that fires `onViewed`.
  await tester.pump();
}

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  group('content rendering — all server copy, verbatim', () {
    testWidgets('renders the title and CTA label from the view model', (
      tester,
    ) async {
      await _pump(
        tester,
        content: statusIntroModalFixture(
          title: 'अपनी फोटो और नाम जोड़ें',
          ctaText: 'फोटो जोड़ें',
          imageUrl: null,
        ),
      );

      expect(find.text('अपनी फोटो और नाम जोड़ें'), findsOneWidget);
      expect(find.text('फोटो जोड़ें'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('renders body copy when present; omits the slot when null', (
      tester,
    ) async {
      await _pump(
        tester,
        content: statusIntroModalFixture(
          body: 'Some server body copy',
          imageUrl: null,
        ),
      );
      expect(find.byKey(const Key('status-intro-modal-body')), findsOneWidget);
      expect(find.text('Some server body copy'), findsOneWidget);

      await _pump(tester, content: statusIntroModalFixture(imageUrl: null));
      expect(find.byKey(const Key('status-intro-modal-body')), findsNothing);
    });

    testWidgets('fires onViewed exactly once, on first paint', (tester) async {
      var viewedCalls = 0;
      await _pump(
        tester,
        content: statusIntroModalFixture(imageUrl: null),
        onViewed: () => viewedCalls++,
      );

      expect(viewedCalls, 1);

      // A later, unrelated rebuild must NOT re-fire it (initState runs once).
      await tester.pump();
      expect(viewedCalls, 1);
    });
  });

  group('preview panel — a missing image must never block the modal', () {
    testWidgets(
      'a null imageUrl still renders title + CTA (no image, no crash)',
      (tester) async {
        await _pump(tester, content: statusIntroModalFixture(imageUrl: null));

        expect(
          find.byKey(const Key('status-intro-modal-title')),
          findsOneWidget,
        );
        expect(find.byKey(const Key('status-intro-modal-cta')), findsOneWidget);
        expect(find.byType(Image), findsNothing);
        // The hint row is static chrome, independent of whether there's a
        // sample image to show.
        expect(
          find.byKey(const Key('status-intro-modal-hint-row')),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'an image LOAD ERROR still renders title + CTA (panel hides, not the modal)',
      (tester) async {
        final previous = HttpOverrides.current;
        HttpOverrides.global = _AlwaysFailHttpOverrides();
        addTearDown(() => HttpOverrides.global = previous);

        await _pump(
          tester,
          content: statusIntroModalFixture(
            imageUrl: 'https://cdn.example.com/will-fail.png',
          ),
        );
        // Let the failed network image resolve to errorBuilder, and the
        // deferred `setState` that hides the whole panel, land.
        await tester.pump(const Duration(milliseconds: 50));
        await tester.pump(const Duration(milliseconds: 50));

        expect(tester.takeException(), isNull);
        expect(
          find.byKey(const Key('status-intro-modal-title')),
          findsOneWidget,
        );
        expect(find.byKey(const Key('status-intro-modal-cta')), findsOneWidget);
        // "Hides the panel entirely" — not just the broken image.
        expect(
          find.byKey(const Key('status-intro-modal-preview')),
          findsNothing,
        );
      },
    );
  });

  group('close button', () {
    testWidgets('has a >= 44x44 tap target', (tester) async {
      await _pump(tester, content: statusIntroModalFixture(imageUrl: null));

      final size = tester.getSize(
        find.byKey(const Key('status-intro-modal-close')),
      );

      expect(size.width, greaterThanOrEqualTo(44));
      expect(size.height, greaterThanOrEqualTo(44));
    });
  });

  group('multi-size smoke (small phone + large textScaler)', () {
    testWidgets('no layout exception at 320x600', (tester) async {
      await _pump(
        tester,
        content: statusIntroModalFixture(imageUrl: null),
        viewport: const Size(320, 600),
      );

      expect(tester.takeException(), isNull);
    });

    testWidgets('no layout exception at 320x600 with a long server title/body', (
      tester,
    ) async {
      // Restored to 320x600 (TAM-174): the earlier bump to 360x640 papered
      // over a real overflow left by removing the scroll view entirely.
      // Now that the card falls back to a scroll safety net only when the
      // fixed (non-image) content genuinely can't fit the frame (see
      // `status_intro_modal.dart`'s `LayoutBuilder`), the smallest
      // reference viewport in the brief is safe again.
      await _pump(
        tester,
        content: statusIntroModalFixture(
          imageUrl: null,
          title:
              'एक बहुत लंबा शीर्षक जो कार्ड की चौड़ाई और दो पंक्तियों की सीमा को परख सकता है',
          body:
              'एक लंबा विवरण जो कार्ड की ऊँचाई और स्क्रॉल व्यवहार की जांच करता है ताकि छोटे '
              'उपकरण पर भी कुछ भी ओवरफ्लो न हो',
        ),
        viewport: const Size(320, 600),
      );

      expect(tester.takeException(), isNull);
    });

    testWidgets(
      'no layout exception at textScale 2.0 on a small screen (320x600)',
      (tester) async {
        // Restored to 320x600 (TAM-174) — see the comment on the previous
        // test; the scroll safety net covers this constraint again.
        await _pump(
          tester,
          content: statusIntroModalFixture(imageUrl: null),
          viewport: const Size(320, 600),
          textScale: 2.0,
        );

        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'no layout exception at textScale 2.5 on a small screen (320x600); '
      'CTA reachable via scroll safety net',
      (tester) async {
        // The extreme end of accessibility textScaling: even with the
        // image squeezed to zero, the fixed (title/body/hint-row/CTA)
        // content can outgrow the card frame outright at 320x600. The
        // `LayoutBuilder` + `SingleChildScrollView` safety net in
        // `status_intro_modal.dart` is what turns that into "scroll to
        // reach the CTA" instead of a RenderFlex overflow.
        var ctaFired = false;
        await _pump(
          tester,
          content: statusIntroModalFixture(imageUrl: null),
          viewport: const Size(320, 600),
          textScale: 2.5,
          onCta: () => ctaFired = true,
        );

        expect(tester.takeException(), isNull);

        final ctaFinder = find.byKey(const Key('status-intro-modal-cta'));
        await tester.scrollUntilVisible(
          ctaFinder,
          200,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();

        expect(ctaFinder.hitTestable(), findsOneWidget);
        await tester.tap(ctaFinder);
        expect(ctaFired, isTrue);
      },
    );

    testWidgets(
      'small phone (360x640): title + CTA stay visible and hit-testable at '
      'textScale 1.0 and 2.0 — the image is what degrades, never the '
      'title/CTA (TAM-174)',
      (tester) async {
        for (final scale in <double>[1.0, 2.0]) {
          var ctaFired = false;
          await _pump(
            tester,
            content: statusIntroModalFixture(imageUrl: null),
            viewport: const Size(360, 640),
            textScale: scale,
            onCta: () => ctaFired = true,
          );

          expect(
            tester.takeException(),
            isNull,
            reason: 'no RenderFlex overflow at textScale $scale',
          );
          expect(
            find.byKey(const Key('status-intro-modal-title')).hitTestable(),
            findsOneWidget,
            reason: 'title must stay fully visible at textScale $scale',
          );
          expect(
            find.byKey(const Key('status-intro-modal-cta')).hitTestable(),
            findsOneWidget,
            reason: 'CTA must stay fully visible at textScale $scale',
          );

          // Hit-testable is necessary but not sufficient — actually tap it
          // to prove the button is reachable and responds, not merely
          // painted somewhere on-screen.
          await tester.tap(find.byKey(const Key('status-intro-modal-cta')));
          expect(
            ctaFired,
            isTrue,
            reason: 'CTA must be genuinely tappable at textScale $scale',
          );
        }
      },
    );
  });

  group('fixed-height card structure with a scroll safety net (TAM-174)', () {
    testWidgets(
      'the card does not actually scroll in the normal case (fits the frame)',
      (tester) async {
        // The card carries a `SingleChildScrollView` unconditionally now (a
        // safety net for extreme textScaling — see `status_intro_modal.dart`),
        // so asserting its absence is no longer the right check. What must
        // still hold is the *behaviour*: at ordinary content/text sizes the
        // scroll view has nothing to scroll — `ConstrainedBox(minHeight:
        // ...)` fills the frame exactly and `Expanded` absorbs the rest, so
        // `maxScrollExtent` is zero and the layout is identical to a plain,
        // non-scrollable `Column`.
        await _pump(tester, content: statusIntroModalFixture(imageUrl: null));

        expect(find.byType(SingleChildScrollView), findsOneWidget);
        final position = tester
            .state<ScrollableState>(find.byType(Scrollable).first)
            .position;
        expect(position.maxScrollExtent, 0);
      },
    );

    testWidgets(
      'the preview panel no longer holds a fixed 3:4 AspectRatio — it fills '
      'the leftover space instead',
      (tester) async {
        await _pump(tester, content: statusIntroModalFixture(imageUrl: null));

        expect(find.byType(AspectRatio), findsNothing);
        expect(
          find.ancestor(
            of: find.byKey(const Key('status-intro-modal-preview')),
            matching: find.byType(Expanded),
          ),
          findsOneWidget,
          reason:
              'the preview panel must be wrapped in Expanded, not sized '
              'to a fixed aspect ratio',
        );
      },
    );

    testWidgets(
      'a taller viewport gives the surplus space to the preview panel; the '
      "CTA stays pinned to the card's base",
      (tester) async {
        await _pump(
          tester,
          content: statusIntroModalFixture(imageUrl: null),
          viewport: const Size(390, 700),
        );
        final shortPanelHeight = tester
            .getSize(find.byKey(const Key('status-intro-modal-preview')))
            .height;
        final shortCard = tester.getRect(
          find.byKey(const Key('status-intro-modal-card')),
        );
        final shortCta = tester.getRect(
          find.byKey(const Key('status-intro-modal-cta')),
        );
        final shortCtaBottomGap = shortCard.bottom - shortCta.bottom;

        await _pump(
          tester,
          content: statusIntroModalFixture(imageUrl: null),
          viewport: const Size(390, 1400),
        );
        final tallPanelHeight = tester
            .getSize(find.byKey(const Key('status-intro-modal-preview')))
            .height;
        final tallCard = tester.getRect(
          find.byKey(const Key('status-intro-modal-card')),
        );
        final tallCta = tester.getRect(
          find.byKey(const Key('status-intro-modal-cta')),
        );
        final tallCtaBottomGap = tallCard.bottom - tallCta.bottom;

        expect(
          tallPanelHeight,
          greaterThan(shortPanelHeight),
          reason: 'the preview panel must absorb the extra viewport height',
        );
        // The CTA's gap to the card's own bottom edge is fixed padding
        // (`EdgeInsets.fromLTRB(20, 28, 20, 20)`) — it must not drift as
        // the panel above it grows.
        expect(tallCtaBottomGap, closeTo(shortCtaBottomGap, 0.5));
      },
    );
  });
}

/// Deterministic no-network [HttpOverrides] — every `Image.network` call
/// fails instantly instead of racing (or hanging on) a real network call.
/// Mirrors `home_shortcut_grid_multi_size_smoke_test.dart`'s helper (not
/// shared — that file keeps its own copy too).
class _AlwaysFailHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) => _FailingHttpClient();
}

class _FailingHttpClient implements HttpClient {
  @override
  bool autoUncompress = true;
  @override
  Duration? connectionTimeout;
  @override
  Duration idleTimeout = const Duration(seconds: 15);
  @override
  int? maxConnectionsPerHost;
  @override
  String? userAgent;

  @override
  Future<HttpClientRequest> getUrl(Uri url) async =>
      throw const SocketException('offline (test)');

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}
