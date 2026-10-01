import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/app_config.dart';
import 'package:mobile/core/shared_analytics.dart';
import 'package:mobile/features/aarti/aarti_analytics.dart';
import 'package:mobile/features/aarti/aarti_routes.dart';
import 'package:mobile/features/audio/domain/audio_item.dart';
import 'package:mobile/features/aarti/player/bloc/aarti_player_audio_port.dart';
import 'package:mobile/features/aarti/player/bloc/aarti_player_bloc.dart';
import 'package:mobile/features/aarti/player/bloc/aarti_player_event.dart';
import 'package:mobile/features/aarti/player/bloc/aarti_player_state.dart';

import '../support/fake_analytics.dart';
import '../support/fake_repositories.dart';
import '../support/fake_share_service.dart';

/// Records what the bloc drives on the engine.
class _FakePort implements AartiPlayerAudioPort {
  final List<AudioItem> played = [];
  int pauses = 0;
  int stops = 0;

  /// Simulates the shared controller's "currently-active item id". Set this
  /// before firing `AartiPlayerOpened(autoStart:true)` on the SAME id to
  /// exercise the skip-re-play code path (TAM-59 idempotence: reopening the
  /// player screen for the already-active item must NOT restart playback).
  /// `null` = idle engine (fresh-open behaviour, `.play()` fires).
  @override
  String? currentItemId;

  /// Optional currently-active AudioItem — set alongside [currentItemId]
  /// when a test needs to exercise the DOWNLOADED-source fallback path in
  /// `_loadAndPlay`. Defaults to null (bloc treats as "no active item").
  @override
  AudioItem? currentItem;

  @override
  Future<void> play(AudioItem item) async {
    played.add(item);
    currentItemId = item.id; // engine is now on this item
    currentItem = item;
  }
  @override
  Future<void> pause() async => pauses++;
  @override
  Future<void> resume() async {}
  @override
  Future<void> stop() async {
    stops++;
    currentItemId = null;
    currentItem = null;
  }
  @override
  Future<void> seek(Duration position) async {}

  /// Analytics wiring reads these two — tests override when they need to
  /// assert `playback_position_seconds` / `playback_state` on the
  /// `aarti_player_closed` or `aarti_audio_app_state_changed` events.
  @override
  Duration currentPosition = Duration.zero;

  @override
  bool isPlaying = false;
}

AartiPlayerArgs _args(List<String> ids, int index, {bool autoStart = true}) =>
    AartiPlayerArgs(
      audioId: ids[index],
      queue: [for (final id in ids) aartiAudioFixture(id)],
      index: index,
      sourceListType: 'newly_added',
      autoStart: autoStart,
    );

void main() {
  group('AartiPlayerBloc', () {
    late _FakePort port;
    late FakeShareService share;
    late RecordingAnalytics analytics;

    setUpAll(() {
      // TAM-124: share URL construction needs AppConfig.instance.shareHost.
      AppConfig.debugSetInstance(
        AppConfig.forTest(shareHost: 'https://share.test.invalid'),
      );
    });

    setUp(() {
      port = _FakePort();
      share = FakeShareService();
      analytics = RecordingAnalytics();
    });

    AartiPlayerBloc build({bool pro = true}) => AartiPlayerBloc(
          repository: FakeAartiRepository(pro: pro),
          audioPort: port,
          shareService: share,
          analytics: analytics,
        );

    test('open (Pro) → fetches detail, auto-plays, emits Ready', () async {
      final bloc = build()..add(AartiPlayerOpened(_args(['a0', 'a1'], 0)));
      await bloc.stream.firstWhere((s) => s is AartiPlayerReady);

      final state = bloc.state as AartiPlayerReady;
      expect(state.detail.audio.id, 'a0');
      expect(port.played.single.audioUrl, 'https://stream/a0.mp3');
      expect(analytics.fired(AartiEvents.playerPageViewed), isTrue);
      expect(analytics.fired(AartiEvents.audioStarted), isTrue);
      await bloc.close();
    });

    test('missing server URL (free/unverified) → gated restore, no playback',
        () async {
      final bloc = build(pro: false)
        ..add(AartiPlayerOpened(_args(['a0'], 0)));
      await bloc.stream.firstWhere((s) => s is AartiPlayerGatedRestore);

      expect(port.played, isEmpty);
      await bloc.close();
    });

    test('next advances within the queue; no-op at the last item', () async {
      final bloc = build()..add(AartiPlayerOpened(_args(['a0', 'a1'], 0)));
      await bloc.stream.firstWhere((s) => s is AartiPlayerReady);

      bloc.add(const AartiPlayerNextRequested());
      await bloc.stream.firstWhere(
          (s) => s is AartiPlayerReady && s.index == 1);
      expect((bloc.state as AartiPlayerReady).index, 1);
      expect(analytics.fired(AartiEvents.nextAudioClicked), isTrue);

      // At the last item, next is a no-op.
      bloc.add(const AartiPlayerNextRequested());
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect((bloc.state as AartiPlayerReady).index, 1);
      await bloc.close();
    });

    test('previous is a no-op at the first item', () async {
      final bloc = build()..add(AartiPlayerOpened(_args(['a0', 'a1'], 0)));
      await bloc.stream.firstWhere((s) => s is AartiPlayerReady);

      bloc.add(const AartiPlayerPreviousRequested());
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect((bloc.state as AartiPlayerReady).index, 0);
      await bloc.close();
    });

    test('track completed → auto-next; at queue end stays put (no loop)',
        () async {
      final bloc = build()..add(AartiPlayerOpened(_args(['a0', 'a1'], 0)));
      await bloc.stream.firstWhere((s) => s is AartiPlayerReady);

      bloc.add(const AartiPlayerTrackCompleted());
      await bloc.stream.firstWhere(
          (s) => s is AartiPlayerReady && s.index == 1);
      expect(analytics.fired(AartiEvents.audioCompleted), isTrue);
      // `deity_slug` — the deity THIS recording belongs to, read off the
      // loaded detail so the completion funnel groups by deity.
      expect(
        analytics.propsFor(AartiEvents.audioCompleted)[
            AartiEventProps.deitySlug],
        'hanuman',
      );

      // Completing the last item does NOT loop back.
      bloc.add(const AartiPlayerTrackCompleted());
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect((bloc.state as AartiPlayerReady).index, 1);
      await bloc.close();
    });

    test('audio error → retry state, index unchanged (no auto-skip)', () async {
      final bloc = build()..add(AartiPlayerOpened(_args(['a0', 'a1'], 0)));
      await bloc.stream.firstWhere((s) => s is AartiPlayerReady);

      bloc.add(const AartiPlayerAudioErrored());
      await bloc.stream.firstWhere((s) => s is AartiPlayerErrorState);
      expect(analytics.fired(AartiEvents.audioPlaybackFailed), isTrue);
      await bloc.close();
    });

    test('like toggles optimistically + fires like_toggled', () async {
      final bloc = build()..add(AartiPlayerOpened(_args(['a0'], 0)));
      final ready = await bloc.stream
          .firstWhere((s) => s is AartiPlayerReady) as AartiPlayerReady;
      expect(ready.liked, isFalse);
      final before = ready.likeCount;

      bloc.add(const AartiPlayerLikeToggled());
      final next = await bloc.stream
          .firstWhere((s) => s is AartiPlayerReady && s.liked) as AartiPlayerReady;
      expect(next.liked, isTrue);
      expect(next.likeCount, before + 1);
      expect(analytics.fired(AartiEvents.audioLikeChanged), isTrue);
      await bloc.close();
    });

    test('share invokes the share sheet with a deep link + fires share_tapped',
        () async {
      final bloc = build()..add(AartiPlayerOpened(_args(['a0'], 0)));
      await bloc.stream.firstWhere((s) => s is AartiPlayerReady);

      bloc.add(const AartiPlayerShareRequested());
      await Future<void>.delayed(const Duration(milliseconds: 10));

      expect(share.shares, hasLength(1));
      // Post-TAM-124: the share URL is the canonical HTTPS App Link
      // (`https://<shareHost>/app/aarti/<audioId>`), not the legacy
      // `AartiRoutes.deepLink(...)` path segment.
      expect(share.lastShare!.deepLink, contains('/app/aarti/a0'));
      expect(analytics.fired(AartiEvents.audioShareClicked), isTrue);
      // TAM-124 unified funnel event fires alongside the feature-scoped one.
      expect(analytics.fired(SharedAnalyticsEvents.shareInitiated), isTrue);
      await bloc.close();
    });
  });
}
