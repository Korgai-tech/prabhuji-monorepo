import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/app_config.dart';
import 'package:mobile/features/status/data/status_models.dart';
import 'package:mobile/features/status/data/status_render_service.dart';
import 'package:mobile/features/status/share/bloc/status_share_bloc.dart';
import 'package:mobile/features/status/share/bloc/status_share_event.dart';
import 'package:mobile/features/status/share/bloc/status_share_state.dart';

import '../support/fake_analytics.dart';
import '../support/fake_repositories.dart';
import '../support/fake_share_service.dart';
import '../support/fake_status_services.dart';

/// The Pro gate (TAM-72 §5, §8). The load-bearing assertion in this file is
/// `render.renderCalls == 0` for a free user — PRD §8 sets
/// `render_before_paywall: false`, and rendering before the paywall is called a
/// hard kickback in the spec's #EXPORT_CRITICAL notes.

/// A mutable entitlement cell, so a test can simulate a purchase completing
/// while the paywall is open (exactly how the real gate re-reads it).
class _Entitlement {
  _Entitlement(this.isPro);
  bool isPro;
}

StatusShareBloc _bloc({
  required _Entitlement entitlement,
  required FakeStatusRenderService render,
  required FakeShareService share,
  RecordingAnalytics? analytics,
  Future<void> Function()? openPaywall,
  void Function()? onPaywallOpened,
}) =>
    StatusShareBloc(
      renderService: render,
      shareService: share,
      isPro: () => entitlement.isPro,
      refreshEntitlement: () async {},
      openPaywall: openPaywall ??
          () async {
            onPaywallOpened?.call();
          },
      analytics: analytics,
    );

StatusShareRequested _request({
  StatusMediaType mediaType = StatusMediaType.image,
  StatusProfileData? profile,
  String? shareSessionId,
}) =>
    StatusShareRequested(
      item: statusItemFixture('s1', mediaType: mediaType),
      profile: profile ?? statusPersonalProfileFixture(),
      boundaryKey: GlobalKey(),
      shareSessionId: shareSessionId,
    );

/// The four events the bloc fires on a completed share, in funnel order.
const _blocFunnelEvents = <String>[
  'status_share_clicked',
  'status_export_started',
  'status_export_result',
  'status_share_result',
];

/// Drive one full Pro share to completion and hand back what was tracked.
Future<RecordingAnalytics> _shareToCompletion({
  StatusProfileData? profile,
  String? shareSessionId,
}) async {
  final analytics = RecordingAnalytics();
  final bloc = _bloc(
    entitlement: _Entitlement(true),
    render: FakeStatusRenderService(),
    share: FakeShareService(),
    analytics: analytics,
  );
  bloc.add(_request(profile: profile, shareSessionId: shareSessionId));
  await bloc.stream.firstWhere((s) => s.status == StatusShareStatus.shared);
  await bloc.close();
  return analytics;
}

void main() {
  setUpAll(() {
    // TAM-124: status_share_bloc now appends `buildShareUrl(...)` to the
    // shared caption, which needs `AppConfig.instance.shareHost`.
    AppConfig.debugSetInstance(
      AppConfig.forTest(shareHost: 'https://share.test.invalid'),
    );
  });

  group('FREE user — paywall FIRST, never a render (§8)', () {
    test('opens the paywall and does NOT touch the render service', () async {
      final entitlement = _Entitlement(false);
      final render = FakeStatusRenderService();
      final share = FakeShareService();
      final analytics = RecordingAnalytics();
      var paywallOpened = 0;
      final bloc = _bloc(
        entitlement: entitlement,
        render: render,
        share: share,
        analytics: analytics,
        onPaywallOpened: () => paywallOpened++,
      );
      addTearDown(bloc.close);

      bloc.add(_request());
      await bloc.stream
          .firstWhere((s) => s.status == StatusShareStatus.cancelled);

      expect(paywallOpened, 1);
      expect(render.renderCalls, 0, reason: 'render_before_paywall: false');
      expect(share.renderedShares, isEmpty);
      expect(analytics.names, contains('status_share_clicked'));
      // `status_paywall_shown` is owned by the Paywall module (Sheet 1 row
      // 17), NOT Status — the Status bloc no longer fires it.
      expect(analytics.names, isNot(contains('status_paywall_shown')));
      expect(analytics.names, isNot(contains('status_export_started')));
    });

    test('cancelling leaves the card + CTA usable (idle-able, no render)',
        () async {
      final entitlement = _Entitlement(false);
      final render = FakeStatusRenderService();
      final bloc = _bloc(
        entitlement: entitlement,
        render: render,
        share: FakeShareService(),
      );
      addTearDown(bloc.close);

      bloc.add(_request());
      await bloc.stream
          .firstWhere((s) => s.status == StatusShareStatus.cancelled);

      expect(bloc.state.isBusy, isFalse);
      expect(render.renderCalls, 0);
    });

    test('a paywall that throws still never renders', () async {
      final entitlement = _Entitlement(false);
      final render = FakeStatusRenderService();
      final bloc = _bloc(
        entitlement: entitlement,
        render: render,
        share: FakeShareService(),
        openPaywall: () async => throw Exception('cannot present'),
      );
      addTearDown(bloc.close);

      bloc.add(_request());
      await bloc.stream
          .firstWhere((s) => s.status == StatusShareStatus.cancelled);

      expect(render.renderCalls, 0);
    });
  });

  group('post-purchase resume', () {
    test('purchasing at the paywall resumes the SAME share → render → sheet',
        () async {
      final entitlement = _Entitlement(false);
      final render = FakeStatusRenderService();
      final share = FakeShareService();
      final analytics = RecordingAnalytics();
      final bloc = _bloc(
        entitlement: entitlement,
        render: render,
        share: share,
        analytics: analytics,
        // The purchase completes while the paywall is open.
        openPaywall: () async => entitlement.isPro = true,
      );
      addTearDown(bloc.close);

      bloc.add(_request());
      await bloc.stream.firstWhere((s) => s.status == StatusShareStatus.shared);

      expect(render.imageCalls, 1, reason: 'resumed after purchase');
      expect(share.renderedShares, hasLength(1));
      // `status_paywall_shown` is Paywall-module-owned; not fired here.
      expect(analytics.names, isNot(contains('status_paywall_shown')));
      expect(analytics.names, contains('status_export_started'));
      // `status_export_result` REPLACES the old success/failure pair — the
      // new sheet contract uses ONE event with a `result` property.
      expect(analytics.propsFor('status_export_result')['result'], 'success');
      // `status_share_result` REPLACES `status_native_share_sheet_opened` +
      // `status_share_completed`. The "More apps" branch produces a success
      // outcome with a null `destination_app` (the OS chooser doesn't
      // report which target was picked from `shareRenderedFile`).
      expect(analytics.propsFor('status_share_result')['result'], 'success');
      // `deity_slug` — the deity the SHARED status belongs to, so the share
      // funnel can be grouped by deity (`statusItemFixture` seeds `hanuman`).
      expect(
        analytics.propsFor('status_share_result')['deity_slug'],
        'hanuman',
      );
      // `is_pro_at_event` is read AT EVENT TIME, so the mid-flow purchase
      // splits the chain: the tap event saw a free user, everything after
      // the gate saw a Pro one. A snapshot taken once at flow start (or the
      // current-state `is_premium_user` user property) would report `true`
      // for all four and erase this conversion step.
      expect(analytics.propsFor('status_share_clicked')['is_pro_at_event'],
          isFalse);
      expect(analytics.propsFor('status_export_started')['is_pro_at_event'],
          isTrue);
      expect(analytics.propsFor('status_export_result')['is_pro_at_event'],
          isTrue);
      expect(analytics.propsFor('status_share_result')['is_pro_at_event'],
          isTrue);
    });

    test('the render only runs AFTER entitlement flips (ordering)', () async {
      final entitlement = _Entitlement(false);
      late final FakeStatusRenderService render;
      render = FakeStatusRenderService(
        onRender: () => expect(
          entitlement.isPro,
          isTrue,
          reason: 'a render must never happen while the user is free',
        ),
      );
      final bloc = _bloc(
        entitlement: entitlement,
        render: render,
        share: FakeShareService(),
        openPaywall: () async => entitlement.isPro = true,
      );
      addTearDown(bloc.close);

      bloc.add(_request());
      await bloc.stream.firstWhere((s) => s.status == StatusShareStatus.shared);
      expect(render.renderCalls, 1);
    });
  });

  group('PRO user — render → share', () {
    test('renders the burned-in image and hands the FILE to the sheet',
        () async {
      final render = FakeStatusRenderService();
      final share = FakeShareService();
      final analytics = RecordingAnalytics();
      var paywallOpened = 0;
      final bloc = _bloc(
        entitlement: _Entitlement(true),
        render: render,
        share: share,
        analytics: analytics,
        onPaywallOpened: () => paywallOpened++,
      );
      addTearDown(bloc.close);

      bloc.add(_request());
      await bloc.stream.firstWhere((s) => s.status == StatusShareStatus.shared);

      expect(paywallOpened, 0, reason: 'Pro never sees the paywall');
      expect(render.imageCalls, 1);
      expect(share.lastRenderedShare, isNotNull);
      expect(share.lastRenderedShare!.mimeType, 'image/png');
      // The status share now ships MEDIA ONLY — no caption text and no
      // share URL. The user's branding is already burned into the file's
      // overlay band; a duplicate text field would clutter the recipient's
      // preview and (for Instagram/Facebook Story) get silently dropped
      // anyway.
      expect(share.lastRenderedShare!.text, isEmpty);
      // Status bloc does not fire the paywall event — that's Paywall's row.
      expect(analytics.names, isNot(contains('status_paywall_shown')));
    });

    test('duplicate Share taps are ignored while a render is in flight (§6.8)',
        () async {
      // A real burn-in takes time; the delay is what makes taps 2/3 land WHILE
      // tap 1 is still rendering — the scenario the guard exists for.
      final render = FakeStatusRenderService(
        renderDelay: const Duration(milliseconds: 60),
      );
      final share = FakeShareService();
      final bloc = _bloc(
        entitlement: _Entitlement(true),
        render: render,
        share: share,
      );
      addTearDown(bloc.close);

      bloc.add(_request());
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(bloc.state.isRendering, isTrue);

      bloc.add(_request()); // tap 2 — mid-render
      bloc.add(_request()); // tap 3 — mid-render
      await bloc.stream.firstWhere((s) => s.status == StatusShareStatus.shared);

      expect(render.renderCalls, 1, reason: 'only the first tap renders');
      expect(share.renderedShares, hasLength(1));
    });

    test('a render failure offers retry and stays on the card', () async {
      final render = FakeStatusRenderService(
        imageResult: const StatusRenderResult.failed(),
      );
      final share = FakeShareService();
      final analytics = RecordingAnalytics();
      final bloc = _bloc(
        entitlement: _Entitlement(true),
        render: render,
        share: share,
        analytics: analytics,
      );
      addTearDown(bloc.close);

      bloc.add(_request());
      await bloc.stream.firstWhere((s) => s.status == StatusShareStatus.failed);

      expect(bloc.state.message, StatusShareState.failedCopy);
      expect(share.renderedShares, isEmpty, reason: 'nothing un-burned is shared');
      // `status_export_result` is the unified sheet event (Sheet 1 row 93).
      expect(analytics.propsFor('status_export_result')['result'], 'failure');
      expect(analytics.propsFor('status_export_result')['error_code'],
          'render_failed');

      // Retry works — the bloc is not wedged.
      bloc.add(const StatusShareMessageCleared());
      render.imageResult = null; // succeed this time
      bloc.add(_request());
      await bloc.stream.firstWhere((s) => s.status == StatusShareStatus.shared);
      expect(render.imageCalls, 2);
    });

    test('no share target → calm error, still no un-burned share', () async {
      final render = FakeStatusRenderService();
      final share = FakeShareService(failRenderedShare: true);
      final bloc = _bloc(
        entitlement: _Entitlement(true),
        render: render,
        share: share,
      );
      addTearDown(bloc.close);

      bloc.add(_request());
      await bloc.stream.firstWhere((s) => s.status == StatusShareStatus.failed);

      expect(bloc.state.message, contains('share sheet'));
      expect(share.renderedShares, isEmpty);
    });
  });

  group('VIDEO share — q2 feasibility fallback', () {
    test('video render is unsupported in Phase 1 → clear message, NO share',
        () async {
      final render = FakeStatusRenderService(); // videoRenderSupported: false
      final share = FakeShareService();
      final analytics = RecordingAnalytics();
      final bloc = _bloc(
        entitlement: _Entitlement(true),
        render: render,
        share: share,
        analytics: analytics,
      );
      addTearDown(bloc.close);

      bloc.add(_request(mediaType: StatusMediaType.video));
      await bloc.stream
          .firstWhere((s) => s.status == StatusShareStatus.unsupported);

      expect(bloc.state.message, kVideoShareUnsupportedCopy);
      expect(render.videoCalls, 1);
      expect(render.imageCalls, 0);
      // The spec is explicit that sharing the source video un-burned is NOT an
      // acceptable fallback — so NOTHING is shared.
      expect(share.renderedShares, isEmpty);
      expect(share.shares, isEmpty);
      expect(analytics.propsFor('status_export_result')['result'], 'failure');
      expect(analytics.propsFor('status_export_result')['error_code'],
          'render_unsupported');
    });

    test('a free user tapping Share on a VIDEO still sees the paywall first',
        () async {
      final entitlement = _Entitlement(false);
      final render = FakeStatusRenderService();
      final bloc = _bloc(
        entitlement: entitlement,
        render: render,
        share: FakeShareService(),
      );
      addTearDown(bloc.close);

      bloc.add(_request(mediaType: StatusMediaType.video));
      await bloc.stream
          .firstWhere((s) => s.status == StatusShareStatus.cancelled);

      expect(render.renderCalls, 0, reason: 'gate precedes the feasibility check');
    });

    test('when the native channel lands, a video render shares video/mp4',
        () async {
      final render = FakeStatusRenderService(
        videoRenderSupported: true,
        videoResult: StatusRenderResult.success(
          FakeStatusRenderService.videoFixtureFile(),
        ),
      );
      final share = FakeShareService();
      final bloc = _bloc(
        entitlement: _Entitlement(true),
        render: render,
        share: share,
      );
      addTearDown(bloc.close);

      bloc.add(_request(mediaType: StatusMediaType.video));
      await bloc.stream.firstWhere((s) => s.status == StatusShareStatus.shared);

      expect(share.lastRenderedShare!.mimeType, 'video/mp4');
    });
  });

  test('the business profile rides into the share render', () async {
    final render = FakeStatusRenderService();
    final analytics = RecordingAnalytics();
    final bloc = _bloc(
      entitlement: _Entitlement(true),
      render: render,
      share: FakeShareService(),
      analytics: analytics,
    );
    addTearDown(bloc.close);

    bloc.add(_request(profile: statusBusinessProfileFixture()));
    await bloc.stream.firstWhere((s) => s.status == StatusShareStatus.shared);

    expect(analytics.propsFor('status_share_clicked')['profile_type'], 'business');
  });

  group('TAM-168 — details are optional on Share', () {
    test(
        'a Pro user with an EMPTY profile is rendered directly (no details '
        'bounce) and the render service sees profile.hasNameOrPhoto=false',
        () async {
      final render = FakeStatusRenderService();
      final analytics = RecordingAnalytics();
      final bloc = _bloc(
        entitlement: _Entitlement(true),
        render: render,
        share: FakeShareService(),
        analytics: analytics,
      );
      addTearDown(bloc.close);

      bloc.add(_request(profile: StatusProfileData.empty));
      await bloc.stream.firstWhere((s) => s.status == StatusShareStatus.shared);

      expect(render.imageCalls, 1);
      expect(render.lastImageProfile, isNotNull);
      expect(render.lastImageProfile!.hasNameOrPhoto, isFalse);
      // TAM-168 — `overlay_used` derives from the actual render decision,
      // not the old `hasActiveDetails` gate.
      expect(
        analytics.propsFor('status_export_started')['overlay_used'],
        isFalse,
      );
    });

    test(
        'a photo-only profile (no name) still burns in the overlay '
        '(hasNameOrPhoto=true, overlay_used=true)', () async {
      final render = FakeStatusRenderService();
      final analytics = RecordingAnalytics();
      final bloc = _bloc(
        entitlement: _Entitlement(true),
        render: render,
        share: FakeShareService(),
        analytics: analytics,
      );
      addTearDown(bloc.close);

      const photoOnly = StatusProfileData(
        activeProfileType: StatusProfileType.personal,
        avatarImageUrl: 'https://cdn/me.jpg',
      );
      bloc.add(_request(profile: photoOnly));
      await bloc.stream.firstWhere((s) => s.status == StatusShareStatus.shared);

      expect(render.lastImageProfile!.hasNameOrPhoto, isTrue);
      expect(
        analytics.propsFor('status_export_started')['overlay_used'],
        isTrue,
      );
    });

    test(
        'the free-user Pro gate is UNTOUCHED — empty profile + free user still '
        'sees the paywall first and the render service sees zero calls',
        () async {
      final render = FakeStatusRenderService();
      final bloc = _bloc(
        entitlement: _Entitlement(false),
        render: render,
        share: FakeShareService(),
      );
      addTearDown(bloc.close);

      bloc.add(_request(profile: StatusProfileData.empty));
      await bloc.stream
          .firstWhere((s) => s.status == StatusShareStatus.cancelled);

      expect(render.renderCalls, 0,
          reason: 'render_before_paywall: false — even for empty profiles');
    });
  });

  test('a share sheet that throws fires status_share_result with share_threw',
      () async {
    final render = FakeStatusRenderService();
    final share = FakeShareService(failRenderedShare: true);
    final analytics = RecordingAnalytics();
    final bloc = _bloc(
      entitlement: _Entitlement(true),
      render: render,
      share: share,
      analytics: analytics,
    );
    addTearDown(bloc.close);

    bloc.add(_request());
    await bloc.stream.firstWhere((s) => s.status == StatusShareStatus.failed);

    // Sheet 1 row 94 — the failure branch of the share-sheet path.
    expect(analytics.propsFor('status_share_result')['result'], 'failure');
    expect(analytics.propsFor('status_share_result')['error_code'], 'share_threw');
    expect(analytics.propsFor('status_share_result')['deity_slug'], 'hanuman');
  });

  test('an already-Pro user reports is_pro_at_event: true on all four events',
      () async {
    final analytics = RecordingAnalytics();
    final bloc = _bloc(
      entitlement: _Entitlement(true),
      render: FakeStatusRenderService(),
      share: FakeShareService(),
      analytics: analytics,
    );
    addTearDown(bloc.close);

    bloc.add(_request());
    await bloc.stream.firstWhere((s) => s.status == StatusShareStatus.shared);

    for (final name in const [
      'status_share_clicked',
      'status_export_started',
      'status_export_result',
      'status_share_result',
    ]) {
      expect(analytics.propsFor(name)['is_pro_at_event'], isTrue,
          reason: '$name must carry the event-time entitlement');
    }
  });

  test('a free user who dismisses the paywall reports is_pro_at_event: false '
      'on the tap event, and never reaches the export/share events', () async {
    final analytics = RecordingAnalytics();
    final bloc = _bloc(
      entitlement: _Entitlement(false), // still free after the paywall closes
      render: FakeStatusRenderService(),
      share: FakeShareService(),
      analytics: analytics,
    );
    addTearDown(bloc.close);

    bloc.add(_request());
    await bloc.stream
        .firstWhere((s) => s.status == StatusShareStatus.cancelled);

    expect(analytics.propsFor('status_share_clicked')['is_pro_at_event'],
        isFalse);
    expect(analytics.names, isNot(contains('status_export_started')));
    expect(analytics.names, isNot(contains('status_export_result')));
    expect(analytics.names, isNot(contains('status_share_result')));
  });

  group('share_session_id — the per-attempt funnel join', () {
    test('the id minted at the CTA tap reaches all four bloc events',
        () async {
      final analytics =
          await _shareToCompletion(shareSessionId: 'sess-abc-123');

      for (final name in _blocFunnelEvents) {
        expect(
          analytics.propsFor(name)['share_session_id'],
          'sess-abc-123',
          reason: '$name must carry the attempt id or the funnel cannot be '
              'joined per attempt',
        );
      }
    });

    test('the id is passed through, never re-minted by the bloc', () async {
      // Two attempts with DIFFERENT ids must stay separable — a bloc that
      // generated its own would either collide them or orphan the two
      // pre-tile events fired in the widget layer.
      final first = await _shareToCompletion(shareSessionId: 'attempt-1');
      final second = await _shareToCompletion(shareSessionId: 'attempt-2');

      expect(first.propsFor('status_share_clicked')['share_session_id'],
          'attempt-1');
      expect(second.propsFor('status_share_clicked')['share_session_id'],
          'attempt-2');
    });

    test('a caller that supplies no id degrades to null, it does not throw',
        () async {
      final analytics = await _shareToCompletion();

      for (final name in _blocFunnelEvents) {
        expect(analytics.propsFor(name)['share_session_id'], isNull);
      }
    });

    test('the id survives the paywall round-trip on a mid-flow purchase',
        () async {
      // The attempt that starts free and completes paid is the one the
      // funnel most needs stitched — the id must span the gate.
      final entitlement = _Entitlement(false);
      final analytics = RecordingAnalytics();
      final bloc = _bloc(
        entitlement: entitlement,
        render: FakeStatusRenderService(),
        share: FakeShareService(),
        analytics: analytics,
        openPaywall: () async => entitlement.isPro = true,
      );
      addTearDown(bloc.close);

      bloc.add(_request(shareSessionId: 'sess-converts'));
      await bloc.stream.firstWhere((s) => s.status == StatusShareStatus.shared);

      for (final name in _blocFunnelEvents) {
        expect(analytics.propsFor(name)['share_session_id'], 'sess-converts');
      }
      // ...and the conversion step is still visible inside that one attempt.
      expect(analytics.propsFor('status_share_clicked')['is_pro_at_event'],
          isFalse);
      expect(analytics.propsFor('status_export_started')['is_pro_at_event'],
          isTrue);
    });
  });

  group('profile presence is global, not per-event', () {
    // `has_name` / `has_photo` used to be passed by hand into every bloc-fired
    // share event. They are now stamped on EVERY event in the app by
    // `AnalyticsEnricher` (see `test/analytics/global_profile_flags_test.dart`
    // for the profile-shape matrix that used to live here), so the bloc must
    // NOT emit them itself — a per-call copy would duplicate the key and could
    // drift from the global one.

    test('the bloc emits neither flag on any funnel event', () async {
      final analytics = await _shareToCompletion(
        profile: statusPersonalProfileFixture(
          avatar: 'https://cdn.test.invalid/a.png',
        ),
      );

      for (final name in _blocFunnelEvents) {
        final props = analytics.propsFor(name);
        expect(props.containsKey('has_name'), isFalse, reason: name);
        expect(props.containsKey('has_photo'), isFalse, reason: name);
      }
    });

    test('share_session_id still joins the whole attempt', () async {
      final analytics = await _shareToCompletion(
        profile: statusPersonalProfileFixture(),
      );

      final ids = _blocFunnelEvents
          .map((n) => analytics.propsFor(n)['share_session_id'])
          .toSet();
      expect(ids, hasLength(1),
          reason: 'stripping the flag pair must not disturb the per-attempt '
              'join the rest of the funnel depends on');
    });

    // `overlay_used` survives the cleanup: it reports what the RENDERER did,
    // which is the question `status_export_started` exists to answer. These
    // cases pin it to the render decision for each profile shape.
    test('overlay_used is false for an empty profile', () async {
      final analytics =
          await _shareToCompletion(profile: StatusProfileData.empty);
      expect(
          analytics.propsFor('status_export_started')['overlay_used'], isFalse);
    });

    test('overlay_used is true for a name-only profile', () async {
      final analytics = await _shareToCompletion(
        profile: statusPersonalProfileFixture(),
      );
      expect(
          analytics.propsFor('status_export_started')['overlay_used'], isTrue);
    });

    test('overlay_used is true for a photo-only profile', () async {
      final analytics = await _shareToCompletion(
        profile: const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          avatarImageUrl: 'https://cdn.test.invalid/a.png',
        ),
      );
      expect(
          analytics.propsFor('status_export_started')['overlay_used'], isTrue);
    });

    test(
        'overlay_used is false for a grandfathered business-only profile '
        '(mobile renders the personal face — TAM-168)', () async {
      final analytics = await _shareToCompletion(
        profile: const StatusProfileData(
          activeProfileType: StatusProfileType.business,
          businessName: 'Srinath Builders',
        ),
      );
      // The business name is never burned in, so claiming an overlay here
      // would describe an export that doesn't contain one.
      expect(
          analytics.propsFor('status_export_started')['overlay_used'], isFalse);
    });
  });
}
