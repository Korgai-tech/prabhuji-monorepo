// A private test-only fake port is intentionally exposed by the local `build`
// helper; it never leaves this test library.
// ignore_for_file: library_private_types_in_public_api

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/app_config.dart';
import 'package:mobile/features/audio/domain/audio_item.dart';
import 'package:mobile/features/ringtone/preview/bloc/ringtone_preview_audio_port.dart';
import 'package:mobile/features/ringtone/preview/bloc/ringtone_preview_bloc.dart';
import 'package:mobile/features/ringtone/preview/bloc/ringtone_preview_event.dart';
import 'package:mobile/features/ringtone/preview/bloc/ringtone_preview_state.dart';
import 'package:mobile/features/ringtone/ringtone_analytics.dart';
import 'package:mobile/features/ringtone/ringtone_routes.dart';

import '../support/fake_analytics.dart';
import '../support/fake_repositories.dart';
import '../support/fake_share_service.dart';

class _FakePort implements RingtonePreviewAudioPort {
  final List<String> calls = [];
  bool throwOnPlay = false;
  @override
  Future<void> play(AudioItem item) async {
    calls.add('play:${item.id}');
    if (throwOnPlay) throw Exception('play failed');
  }

  @override
  Future<void> pause() async => calls.add('pause');
  @override
  Future<void> resume() async => calls.add('resume');
  @override
  Future<void> stop() async => calls.add('stop');
}

RingtonePreviewBloc build(
  FakeRingtoneRepository repo, {
  RecordingAnalytics? analytics,
  _FakePort? port,
  FakeShareService? share,
}) =>
    RingtonePreviewBloc(
      repository: repo,
      audioPort: port ?? _FakePort(),
      shareService: share ?? FakeShareService(),
      analytics: analytics,
    );

void main() {
  setUpAll(() {
    // TAM-124: share URL construction needs AppConfig.instance.shareHost.
    AppConfig.debugSetInstance(
      AppConfig.forTest(shareHost: 'https://share.test.invalid'),
    );
  });

  test('Pro open → Ready + auto-play + player_page_viewed/play_started', () async {
    final analytics = RecordingAnalytics();
    final port = _FakePort();
    final bloc = build(FakeRingtoneRepository(pro: true),
        analytics: analytics, port: port)
      ..add(const RingtonePreviewOpened(RingtonePreviewArgs(ringtoneId: 'rt1')));
    await Future<void>.delayed(Duration.zero);

    expect(bloc.state, isA<RingtonePreviewReady>());
    expect(port.calls, contains('play:rt1'));
    // Row 116 + row 117.
    expect(analytics.fired(RingtoneEvents.playerPageViewed), isTrue);
    expect(analytics.fired(RingtoneEvents.playStarted), isTrue);
    expect(
      analytics.propsFor(RingtoneEvents.playStarted)[
          RingtoneEventProps.startReason],
      RingtoneEventProps.startReasonAutoPlay,
    );
    await bloc.close();
  });

  test('free/gated (no server URL) → GatedRestore, never plays', () async {
    final port = _FakePort();
    final bloc = build(FakeRingtoneRepository(pro: false), port: port)
      ..add(const RingtonePreviewOpened(RingtonePreviewArgs(ringtoneId: 'rt1')));
    await Future<void>.delayed(Duration.zero);

    expect(bloc.state, isA<RingtonePreviewGatedRestore>());
    expect(port.calls, isEmpty);
    await bloc.close();
  });

  test('like toggle is optimistic then reconciles + fires like_changed(like)',
      () async {
    final analytics = RecordingAnalytics();
    final bloc = build(FakeRingtoneRepository(pro: true), analytics: analytics)
      ..add(const RingtonePreviewOpened(RingtonePreviewArgs(ringtoneId: 'rt1')));
    await Future<void>.delayed(Duration.zero);

    bloc.add(const RingtonePreviewLikeToggled());
    await Future<void>.delayed(Duration.zero);
    final s = bloc.state as RingtonePreviewReady;
    expect(s.liked, isTrue);
    expect(s.likeCount, 24988); // server-authoritative

    // Row 120 — single `ringtone_like_changed` with `action: like`.
    expect(analytics.fired(RingtoneEvents.likeChanged), isTrue);
    expect(
      analytics.propsFor(RingtoneEvents.likeChanged)[
          RingtoneEventProps.action],
      RingtoneEventProps.actionLike,
    );
    await bloc.close();
  });

  test('share pauses audio, fires share_clicked + share_result(success)',
      () async {
    final analytics = RecordingAnalytics();
    final share = FakeShareService();
    final port = _FakePort();
    final bloc = build(FakeRingtoneRepository(pro: true),
        analytics: analytics, share: share, port: port)
      ..add(const RingtonePreviewOpened(RingtonePreviewArgs(ringtoneId: 'rt1')));
    await Future<void>.delayed(Duration.zero);

    bloc.add(const RingtonePreviewShareRequested());
    await Future<void>.delayed(Duration.zero);

    expect(share.shares, hasLength(1));
    expect(share.shares.single.deepLink, contains('rt1'));
    expect(port.calls, contains('pause')); // audio pauses on share-open

    // Row 121 + row 122 (success branch).
    expect(analytics.fired(RingtoneEvents.shareClicked), isTrue);
    expect(analytics.fired(RingtoneEvents.shareResult), isTrue);
    expect(
      analytics.propsFor(RingtoneEvents.shareResult)[
          RingtoneEventProps.result],
      RingtoneEventProps.resultSuccess,
    );
    await bloc.close();
  });

  test('threshold reached + server counts → play count updated (no analytics)',
      () async {
    final analytics = RecordingAnalytics();
    final repo = FakeRingtoneRepository(pro: true);
    final bloc = build(repo, analytics: analytics)
      ..add(const RingtonePreviewOpened(RingtonePreviewArgs(ringtoneId: 'rt1')));
    await Future<void>.delayed(Duration.zero);

    bloc.add(const RingtonePreviewPlayThresholdReached(4));
    await Future<void>.delayed(Duration.zero);
    expect(repo.reportPlayCountCalls, 1);
    // Sheet 1 rows 113–126 have no `ringtone_play_counted` — assert silence.
    expect(
      analytics.names.where((n) => n == 'ringtone_play_counted'),
      isEmpty,
    );
    await bloc.close();
  });

  test('audio error → calm error state + playback_failed', () async {
    final analytics = RecordingAnalytics();
    final bloc = build(FakeRingtoneRepository(pro: true), analytics: analytics)
      ..add(const RingtonePreviewOpened(RingtonePreviewArgs(ringtoneId: 'rt1')));
    await Future<void>.delayed(Duration.zero);
    bloc.add(const RingtonePreviewAudioErrored());
    await Future<void>.delayed(Duration.zero);
    expect(bloc.state, isA<RingtonePreviewErrorState>());
    // Row 126 — `ringtone_playback_failed`.
    expect(analytics.fired(RingtoneEvents.playbackFailed), isTrue);
    expect(
      analytics.propsFor(RingtoneEvents.playbackFailed)[
          RingtoneEventProps.failureStage],
      RingtoneEventProps.failureStagePlayback,
    );
    await bloc.close();
  });

  test('play completed fires ringtone_play_completed', () async {
    final analytics = RecordingAnalytics();
    final bloc = build(FakeRingtoneRepository(pro: true), analytics: analytics)
      ..add(const RingtonePreviewOpened(RingtonePreviewArgs(ringtoneId: 'rt1')));
    await Future<void>.delayed(Duration.zero);
    bloc.add(const RingtonePreviewPlayCompleted());
    await Future<void>.delayed(Duration.zero);
    // Row 119 — `ringtone_play_completed`.
    expect(analytics.fired(RingtoneEvents.playCompleted), isTrue);
    await bloc.close();
  });
}
