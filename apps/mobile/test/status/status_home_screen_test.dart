import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/app_config.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/status/data/status_models.dart';
import 'package:mobile/features/status/feed/presentation/status_overlay.dart';
import 'package:mobile/features/status/feed/presentation/status_widgets.dart';

import '../support/fake_analytics.dart';
import '../support/fake_repositories.dart';
import '../support/fake_share_service.dart';
import '../support/fake_status_services.dart';
import '../support/status_harness.dart';

void main() {
  setUpAll(() {
    // TAM-124: the share flow appends `buildShareUrl(...)` to the caption,
    // which reads `AppConfig.instance.shareHost`. Without this the bloc's
    // `_shareFile` catches the NPE and never reaches `shareRenderedFile`.
    AppConfig.debugSetInstance(
      AppConfig.forTest(shareHost: 'https://share.test.invalid'),
    );
  });
  setUp(FakeStatusVideoPort.resetCounters);

  group('Status Home chrome (Figma 302:4384)', () {
    testWidgets('renders the header, deity row, feed and engagement footer',
        (tester) async {
      await pumpStatusHome(
        tester,
        repository: FakeStatusRepository(profile: statusPersonalProfileFixture()),
      );

      expect(find.byKey(const Key('status-title')), findsOneWidget);
      expect(find.byKey(const Key('status-edit-details')), findsOneWidget);
      expect(find.byKey(const Key('deity-filter-row')), findsOneWidget);
      expect(find.byKey(const Key('deity-chip-all')), findsOneWidget);
      expect(find.byKey(const Key('status-feed-pageview')), findsOneWidget);
      expect(find.byKey(const Key('status-share')), findsWidgets);
      expect(find.byKey(const Key('status-like')), findsWidgets);
      expect(find.byKey(const Key('status-view')), findsWidgets);
      expect(find.byKey(const Key('status-next')), findsWidgets);
    });

    testWidgets('renders counts from the mocked response, not literals',
        (tester) async {
      await pumpStatusHome(
        tester,
        repository: FakeStatusRepository(
          feed: [statusItemFixture('s0', like: 24000, view: 140000)],
          profile: statusPersonalProfileFixture(),
        ),
      );

      // 24000 → "24K", 140000 → "1.4L" (the Figma sample values, formatted).
      expect(find.text('24K'), findsOneWidget);
      expect(find.text('1.4L'), findsOneWidget);
    });

    testWidgets('deity chip drives the feed query', (tester) async {
      final repo = FakeStatusRepository(profile: statusPersonalProfileFixture());
      await pumpStatusHome(tester, repository: repo);

      await tester.tap(find.byKey(const Key('deity-chip-hanuman')));
      await tester.pumpAndSettle();

      expect(repo.lastFeedDeityId, 'hanuman');
    });

    testWidgets('empty deity filter shows the calm state + All Gods recovery',
        (tester) async {
      final repo = FakeStatusRepository(
        emptyDeityId: 'ram',
        profile: statusPersonalProfileFixture(),
      );
      await pumpStatusHome(tester, repository: repo);

      await tester.tap(find.byKey(const Key('deity-chip-ram')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('status-feed-empty')), findsOneWidget);

      await tester.tap(find.byKey(const Key('status-empty-action')));
      await tester.pumpAndSettle();

      expect(repo.lastFeedDeityId, isNull, reason: 'All Gods recovery');
      expect(find.byKey(const Key('status-feed-pageview')), findsOneWidget);
    });
  });

  group('overlay preview', () {
    testWidgets('reflects the active PERSONAL profile', (tester) async {
      await pumpStatusHome(
        tester,
        repository: FakeStatusRepository(profile: statusPersonalProfileFixture()),
      );

      expect(find.byKey(const Key('status-overlay-band')), findsWidgets);
      expect(find.text('Aditya Nath'), findsWidgets);
    });

    testWidgets(
        'TAM-168 — a grandfathered activeProfileType=business row renders the '
        'PERSONAL face on mobile (business copy is dead)',
        (tester) async {
      await pumpStatusHome(
        tester,
        repository: FakeStatusRepository(profile: statusBusinessProfileFixture()),
      );

      // The fixture ships personalDisplayName='Aditya Nath' alongside the
      // business fields — that personal name is what the overlay reads.
      expect(find.text('Aditya Nath'), findsWidgets);
      expect(find.text('Srinath Builders'), findsNothing);
      expect(find.text('Own your Dream Home'), findsNothing);
    });

    testWidgets('with nothing saved, prompts to add details in Hindi', (tester) async {
      await pumpStatusHome(
        tester,
        repository: FakeStatusRepository(profile: StatusProfileData.empty),
      );

      expect(find.byKey(const Key('status-overlay-prompt')), findsWidgets);
      // TAM-168 — Hindi copy on the strip.
      expect(find.text('अपना नाम और फोटो ऐड करें'), findsWidgets);
      // The old English sub-line is gone.
      expect(find.text('They’ll appear on every status you share'), findsNothing);
    });

    testWidgets(
        'TAM-168 — with no name/photo, the strip is wrapped in a tappable '
        'GestureDetector (empty-profile → discovery affordance for details)',
        (tester) async {
      await pumpStatusHome(
        tester,
        repository: FakeStatusRepository(profile: StatusProfileData.empty),
      );

      // The strip's GestureDetector is the immediate ancestor of the
      // overlay band. Presence of `onTap` proves the strip is tappable.
      // Analytics + navigation on tap are covered by the manual E2E path
      // (the harness has no go_router, so calling `onTap!.call()` here
      // would throw from context.push).
      final band = find.byKey(const Key('status-overlay-band')).first;
      final detector = tester.widget<GestureDetector>(
        find.ancestor(of: band, matching: find.byType(GestureDetector)).first,
      );
      expect(detector.onTap, isNotNull,
          reason: 'empty-profile strip must be tappable');
      expect(detector.behavior, HitTestBehavior.opaque);
    });

    testWidgets(
        'TAM-168 — with a name saved, the strip is NOT wrapped in a tap '
        'handler (display-only; the pill is the only edit path)',
        (tester) async {
      await pumpStatusHome(
        tester,
        repository: FakeStatusRepository(profile: statusPersonalProfileFixture()),
      );

      final band = find.byKey(const Key('status-overlay-band')).first;
      final detector = tester.widget<GestureDetector>(
        find.ancestor(of: band, matching: find.byType(GestureDetector)).first,
      );
      expect(detector.onTap, isNull,
          reason: 'filled overlay strip is display-only after TAM-168');
    });

    testWidgets('renders the avatar (Figma user-01 when none saved)',
        (tester) async {
      await pumpStatusHome(
        tester,
        repository: FakeStatusRepository(profile: statusPersonalProfileFixture()),
      );

      expect(find.byKey(const Key('status-overlay-avatar')), findsWidgets);
    });
  });

  group('overlay respects overlaySafeArea (PRD §6.7 — never covers the deity)',
      () {
    /// Renders the band alone at a known media size so the geometry is exact.
    /// TAM-168 — uses the personal fixture (Business persona is retired from
    /// mobile). The band auto-sizes to the single title row.
    Future<Rect> bandRectFor(
      WidgetTester tester,
      StatusSafeArea safeArea, {
      Size media = const Size(295, 449),
    }) async {
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
                    profile: statusPersonalProfileFixture(),
                    safeArea: safeArea,
                    mediaSize: media,
                  ),
                ],
              ),
            ),
          ),
        ),
      ));
      await tester.pump();
      return tester.getRect(find.byKey(const Key('status-overlay-band')));
    }

    testWidgets(
        'the band bottom-anchors and is sized to its content (single row after TAM-168)',
        (tester) async {
      const media = Size(295, 449);
      final rect = await bandRectFor(tester, kSeedSafeArea, media: media);
      final stack = tester.getRect(find.byType(Stack).first);

      // Bottom edge sits at the media's bottom.
      expect(rect.bottom, closeTo(stack.bottom, 0.5));
      // Height is reasonable — big enough to hold the title row + padding,
      // small enough not to cover the deity.
      expect(rect.height, greaterThan(20));
      expect(rect.height, lessThan(media.height * 0.5));
    });

    testWidgets('the band NEVER intrudes above the reserved top region',
        (tester) async {
      const media = Size(295, 449);
      final rect = await bandRectFor(tester, kSeedSafeArea, media: media);
      final stack = tester.getRect(find.byType(Stack).first);

      // Everything the overlay draws must sit in the lower part of the media
      // — the deity's face lives above it (top: 0.1 headroom).
      final overlayTopFraction = (rect.top - stack.top) / media.height;
      expect(overlayTopFraction, greaterThan(kSeedSafeArea.top),
          reason: 'the band must clear the reserved top region');
    });

    testWidgets(
        'a taller `bottom` fraction still bottom-anchors the band (auto-height)',
        (tester) async {
      const media = Size(295, 449);
      const tall =
          StatusSafeArea(top: 0.1, bottom: 0.30, left: 0.05, right: 0.05);
      final rect = await bandRectFor(tester, tall, media: media);
      final stack = tester.getRect(find.byType(Stack).first);

      // The `bottom` fraction reserves headroom, but the band's height is
      // driven by content (single row after TAM-168) — assert it stays
      // bottom-anchored regardless of the reservation.
      expect(rect.bottom, closeTo(stack.bottom, 0.5));
    });

    testWidgets(
        'a zeroed safe area still renders a non-zero-height band (auto-sized to content)',
        (tester) async {
      const zero = StatusSafeArea(top: 0, bottom: 0, left: 0, right: 0);
      final rect = await bandRectFor(tester, zero);

      // Falls back to the Figma default via `orFigmaDefault`; the band is
      // auto-sized so the exact pixel height is content-driven — assert
      // non-zero + within the media.
      expect(rect.height, greaterThan(0));
    });

    testWidgets('the overlay text stays inside the safe-area inset',
        (tester) async {
      const media = Size(295, 449);
      await bandRectFor(tester, kSeedSafeArea, media: media);

      final band = tester.getRect(find.byKey(const Key('status-overlay-band')));
      final title = tester.getRect(find.byKey(const Key('status-overlay-title')));

      // left: 0.05 × 295 = 14.75 minimum inset, plus the template's text inset.
      expect(title.left, greaterThanOrEqualTo(band.left + media.width * 0.05));
      expect(title.right, lessThanOrEqualTo(band.right));
    });
  });

  group('video (PRD §6.9 — muted, one at a time)', () {
    testWidgets('only the ACTIVE card initializes + plays a video',
        (tester) async {
      // A feed of ALL videos makes "only one plays" unambiguous.
      final repo = FakeStatusRepository(
        feed: List.generate(
          4,
          (i) => statusItemFixture('v$i', mediaType: StatusMediaType.video),
        ),
        profile: statusPersonalProfileFixture(),
      );
      await pumpStatusHome(tester, repository: repo);
      await tester.pumpAndSettle();

      expect(
        FakeStatusVideoPort.played,
        hasLength(1),
        reason: 'only the active card plays, even though 4 video cards exist',
      );
      expect(FakeStatusVideoPort.played.single.playing, isTrue);
      expect(FakeStatusVideoPort.played.single.lastUrl, contains('v0.mp4'),
          reason: 'it is the FIRST card that plays');
    });

    testWidgets('a video that fails to initialize falls back to the thumbnail',
        (tester) async {
      final repo = FakeStatusRepository(
        feed: [statusItemFixture('v0', mediaType: StatusMediaType.video)],
        profile: statusPersonalProfileFixture(),
      );
      await pumpStatusHome(
        tester,
        repository: repo,
        videoPortFactory: () => FakeStatusVideoPort(failInitialize: true),
      );
      await tester.pumpAndSettle();

      // The feed keeps working — the card shows its still, not a broken glyph.
      expect(find.byKey(const Key('status-card-image')), findsWidgets);
      expect(find.byKey(const Key('status-feed-pageview')), findsOneWidget);
    });

    testWidgets('an image card never touches the video port', (tester) async {
      await pumpStatusHome(
        tester,
        repository: FakeStatusRepository(
          feed: [statusItemFixture('s0')],
          profile: statusPersonalProfileFixture(),
        ),
      );
      await tester.pumpAndSettle();

      expect(FakeStatusVideoPort.instances, 0);
      expect(find.byKey(const Key('status-card-image')), findsWidgets);
    });
  });

  group('share gating from the UI', () {
    testWidgets('a FREE user tapping Share renders NOTHING (§8)',
        (tester) async {
      final render = FakeStatusRenderService();
      await pumpStatusHome(
        tester,
        repository: FakeStatusRepository(profile: statusPersonalProfileFixture()),
        renderService: render,
        isPro: false,
      );

      await tester.tap(find.byKey(const Key('status-share')).first);
      await tester.pumpAndSettle();

      expect(render.renderCalls, 0, reason: 'render_before_paywall: false');
    });

    testWidgets(
        'a PRO user tapping Share opens the story-share sheet, then '
        '"More apps" renders + shares the burned-in file', (tester) async {
      final render = FakeStatusRenderService();
      final shareHolder = ShareServiceHolder();
      await pumpStatusHome(
        tester,
        repository: FakeStatusRepository(profile: statusPersonalProfileFixture()),
        renderService: render,
        shareHolder: shareHolder,
        isPro: true,
      );

      // Tap Share on the card → the story-share sheet opens. Before any
      // target is picked, NOTHING has been rendered — render only fires
      // after the user commits to a destination.
      await tester.tap(find.byKey(const Key('status-share')).first);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('status-story-share-sheet')), findsOneWidget);
      expect(render.imageCalls, 0, reason: 'no render before target picked');

      // In tests the launcher is Noop → every third-party tile is disabled
      // (not installed), leaving "More apps" as the only tappable row. This
      // path keeps the pre-sheet behaviour: render → shareRenderedFile.
      expect(find.byKey(const Key('story-target-more-apps')), findsOneWidget);
      await tester.tap(find.byKey(const Key('story-target-more-apps')));
      // The tap → route pop → showModalBottomSheet's Future resolution →
      // shareBloc.add is a chain of microtasks that pumpAndSettle otherwise
      // doesn't reliably drain (the route animation finishes before the
      // bloc's shareRenderedFile await lands). Two settles + a small pump
      // in the middle covers both the modal transition and the bloc's async
      // chain.
      await tester.pumpAndSettle();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pumpAndSettle();

      expect(render.imageCalls, 1);
      expect(shareHolder.service.renderedShares, hasLength(1));
      expect(shareHolder.service.lastRenderedShare!.mimeType, 'image/png');
    });

    testWidgets(
        'the Share CTA fires status_share_cta_clicked BEFORE the sheet, and '
        'one share_session_id joins the whole attempt', (tester) async {
      final analytics = RecordingAnalytics();
      final shareHolder = ShareServiceHolder();
      await pumpStatusHome(
        tester,
        repository:
            FakeStatusRepository(profile: statusPersonalProfileFixture()),
        renderService: FakeStatusRenderService(),
        shareHolder: shareHolder,
        analytics: analytics,
        isPro: true,
      );

      await tester.tap(find.byKey(const Key('status-share')).first);
      await tester.pumpAndSettle();

      // Two funnel steps have now happened that used to be invisible: the
      // tap itself, and the sheet becoming usable.
      final cta = analytics.propsFor('status_share_cta_clicked');
      expect(cta['status_id'], 's0');
      expect(cta['media_type'], 'image');
      expect(cta['source_screen'], 'status_feed');
      expect(cta['position_index'], 0);
      expect(cta['is_pro_at_event'], isTrue);
      // `has_name` / `has_photo` are no longer passed by this call site —
      // the enricher stamps them on every event (see
      // `test/analytics/global_profile_flags_test.dart`).
      expect(cta.containsKey('has_name'), isFalse);
      expect(cta.containsKey('has_photo'), isFalse);

      // Ordering is the point of the ticket — the CTA event must precede
      // both the sheet event and the destination tap.
      expect(analytics.names.indexOf('status_share_cta_clicked'),
          lessThan(analytics.names.indexOf('status_share_sheet_viewed')));
      expect(analytics.fired('status_share_clicked'), isFalse,
          reason: 'no destination picked yet');

      await tester.tap(find.byKey(const Key('story-target-more-apps')));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pumpAndSettle();

      // One id across the widget-fired and bloc-fired halves.
      final id = cta['share_session_id'];
      expect(id, isA<String>());
      for (final name in const [
        'status_share_sheet_viewed',
        'status_share_clicked',
        'status_export_started',
        'status_export_result',
        'status_share_result',
      ]) {
        expect(analytics.propsFor(name)['share_session_id'], id, reason: name);
      }
    });

    testWidgets(
        'a FREE user still produces the two pre-gate funnel steps — the '
        'paywall drop is measured, not hidden', (tester) async {
      final analytics = RecordingAnalytics();
      await pumpStatusHome(
        tester,
        repository:
            FakeStatusRepository(profile: statusPersonalProfileFixture()),
        renderService: FakeStatusRenderService(),
        analytics: analytics,
        isPro: false,
      );

      await tester.tap(find.byKey(const Key('status-share')).first);
      await tester.pumpAndSettle();

      // The Pro gate lives INSIDE the bloc, past the destination tap, so a
      // free user reaches both of these. `is_pro_at_event: false` here is
      // what makes the free→paid step countable.
      expect(analytics.fired('status_share_cta_clicked'), isTrue);
      expect(analytics.propsFor('status_share_cta_clicked')['is_pro_at_event'],
          isFalse);
      expect(analytics.fired('status_share_sheet_viewed'), isTrue);
    });

    testWidgets(
        'an empty profile still fires the CTA event, carrying no presence '
        'flags of its own', (tester) async {
      final analytics = RecordingAnalytics();
      await pumpStatusHome(
        tester,
        repository: FakeStatusRepository(profile: StatusProfileData.empty),
        renderService: FakeStatusRenderService(),
        analytics: analytics,
        isPro: true,
      );

      await tester.tap(find.byKey(const Key('status-share')).first);
      await tester.pumpAndSettle();

      // TAM-168 lets this user share straight through with no details. What
      // records that they had none is now the global `has_name`/`has_photo`
      // pair, not a per-call copy on this event.
      final cta = analytics.propsFor('status_share_cta_clicked');
      expect(analytics.fired('status_share_cta_clicked'), isTrue);
      expect(cta.containsKey('has_name'), isFalse);
      expect(cta.containsKey('has_photo'), isFalse);
    });

    testWidgets('the hero preview is wrapped in a RepaintBoundary (capture seam)',
        (tester) async {
      await pumpStatusHome(
        tester,
        repository: FakeStatusRepository(
          feed: [statusItemFixture('s0')],
          profile: statusPersonalProfileFixture(),
        ),
      );

      final hero = find.byType(StatusHeroPreview);
      expect(hero, findsOneWidget);
      expect(
        find.descendant(of: hero, matching: find.byType(RepaintBoundary)),
        findsWidgets,
      );
    });

    testWidgets('no lock badge is shown on the card (Share is the CTA)',
        (tester) async {
      await pumpStatusHome(
        tester,
        repository: FakeStatusRepository(profile: statusPersonalProfileFixture()),
        isPro: false,
      );

      expect(find.byKey(const Key('status-share')), findsWidgets);
      expect(find.textContaining('Locked'), findsNothing);
      expect(find.textContaining('PRO'), findsNothing);
    });
  });

  group('like + view from the UI', () {
    testWidgets('tapping like optimistically flips the card', (tester) async {
      final repo = FakeStatusRepository(
        feed: [statusItemFixture('s0', like: 24000)],
        profile: statusPersonalProfileFixture(),
      )
        ..likedResult = true
        ..likeCountResult = 24001;
      await pumpStatusHome(tester, repository: repo);

      await tester.tap(find.byKey(const Key('status-like')).first);
      await tester.pumpAndSettle();

      expect(repo.toggleLikeCalls, 1);
      expect(find.text('24K'), findsOneWidget); // 24001 → "24K"
    });

    testWidgets('the view POST fires once the dwell threshold elapses',
        (tester) async {
      final analytics = RecordingAnalytics();
      final repo = FakeStatusRepository(
        feed: [statusItemFixture('s0')],
        profile: statusPersonalProfileFixture(),
      );
      // pumpStatusHome pumps past the (shortened) threshold for us.
      await pumpStatusHome(tester, repository: repo, analytics: analytics);

      expect(analytics.names, contains('status_viewed'));
      expect(repo.recordViewCalls, 1);
    });
  });

  testWidgets('Edit Details opens the details flow', (tester) async {
    final analytics = RecordingAnalytics();
    await pumpStatusHome(
      tester,
      repository: FakeStatusRepository(profile: statusPersonalProfileFixture()),
      analytics: analytics,
    );

    expect(find.byKey(const Key('status-edit-details')), findsOneWidget);
    // The pill is wired to pushStatusDetails (a go_router push); the harness has
    // no router, so we assert the CTA exists + is tappable rather than the nav.
    expect(
      tester.widget<StatusEditDetailsPill>(
        find.byType(StatusEditDetailsPill),
      ).onTap,
      isNotNull,
    );
  });

  group('TAM-168 — state-based pill label', () {
    testWidgets(
        'empty profile → pill reads "अपना फोटो डालें"',
        (tester) async {
      await pumpStatusHome(
        tester,
        repository: FakeStatusRepository(profile: StatusProfileData.empty),
      );
      final pill = tester.widget<StatusEditDetailsPill>(
        find.byType(StatusEditDetailsPill),
      );
      expect(pill.label, 'अपना फोटो डालें');
    });

    testWidgets(
        'name-saved profile → pill reads "अपना फोटो बदलें"',
        (tester) async {
      await pumpStatusHome(
        tester,
        repository: FakeStatusRepository(profile: statusPersonalProfileFixture()),
      );
      final pill = tester.widget<StatusEditDetailsPill>(
        find.byType(StatusEditDetailsPill),
      );
      expect(pill.label, 'अपना फोटो बदलें');
    });
  });
}
