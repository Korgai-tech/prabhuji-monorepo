import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/app_config.dart';
import 'package:mobile/features/audio/application/audio_controller.dart';
import 'package:mobile/features/audio/domain/audio_item.dart';
import 'package:mobile/features/mantras/mantras_routes.dart';
import 'package:mobile/features/mantras/player/bloc/mantras_player_audio_port.dart';
import 'package:mobile/features/mantras/player/bloc/mantras_player_bloc.dart';
import 'package:mobile/features/mantras/player/bloc/mantras_player_event.dart';
import 'package:mobile/features/mantras/player/bloc/mantras_player_state.dart';

import '../support/fake_analytics.dart';
import '../support/fake_repositories.dart';
import '../support/fake_share_service.dart';

/// Records transport calls without any real audio. Mirrors the production
/// shared-engine wiring: the bloc calls [play] with the current repeat
/// target, [setRepeatTarget] when the counter sheet flips it, and consumes
/// [completionStream] via the screen (tests drive that stream manually).
class _FakePort implements MantrasPlayerAudioPort {
  final List<String> calls = [];
  final StreamController<AudioTrackCompletion> _completions =
      StreamController<AudioTrackCompletion>.broadcast();

  int repeatTarget = 1;

  /// Simulates the shared controller's "currently-active item id" — set
  /// before dispatching `MantrasPlayerOpened(autoStart:true)` on the SAME
  /// id to exercise the skip-re-play code path.
  @override
  String? currentItemId;

  /// Optional currently-active AudioItem — set alongside [currentItemId]
  /// when a test needs to exercise the DOWNLOADED-source fallback path
  /// in `_loadAndPlay`. Defaults to null.
  @override
  AudioItem? currentItem;

  /// Simulates the shared engine's live playhead position. Tests that
  /// assert `playback_position_seconds` on the analytics events (e.g. row
  /// 84, 79, 73) seed this before firing the corresponding bloc event.
  @override
  Duration currentPosition = Duration.zero;

  /// Simulates the shared engine's playing/paused state — feeds
  /// `playback_state` on row 84.
  @override
  bool isPlaying = false;

  @override
  Future<void> play(AudioItem item, {int repeatTarget = 1}) async {
    calls.add('play:${item.id}:target=$repeatTarget');
    currentItemId = item.id;
    currentItem = item;
    isPlaying = true;
    this.repeatTarget = repeatTarget;
  }

  @override
  void setRepeatTarget(int target) {
    calls.add('setRepeatTarget:$target');
    repeatTarget = target;
  }

  @override
  Future<void> pause() async {
    calls.add('pause');
    isPlaying = false;
  }
  @override
  Future<void> resume() async {
    calls.add('resume');
    isPlaying = true;
  }
  @override
  Future<void> stop() async {
    calls.add('stop');
    currentItemId = null;
    currentItem = null;
    isPlaying = false;
  }

  @override
  Stream<AudioTrackCompletion> get completionStream => _completions.stream;

  /// Push a completion the way the shared engine's stream would — this
  /// stands in for the screen's `controller.completionStream.listen`
  /// subscription plus the `bloc.add(MantrasPlayerTrackCompleted(...))`
  /// forward. The bloc's `_onCompleted` handler pulls every value it
  /// needs (repetition number, target-reached flag, playhead) off the
  /// event, so tests do the same.
  void emitCompletion({
    required String itemId,
    required int repetitionNumber,
    required int repeatTarget,
    required bool targetReached,
    Duration playheadPosition = Duration.zero,
  }) {
    _completions.add(AudioTrackCompletion(
      item: AudioItem(
        id: itemId,
        title: itemId,
        audioUrl: 'https://cdn.test/$itemId.mp3',
        module: AudioModule.mantras,
      ),
      repetitionNumber: repetitionNumber,
      repeatTarget: repeatTarget,
      targetReached: targetReached,
      playheadPosition: playheadPosition,
    ));
  }

  Future<void> dispose() => _completions.close();
}

MantrasPlayerBloc _bloc(
  FakeMantrasRepository repo, {
  _FakePort? port,
  RecordingAnalytics? analytics,
  FakeShareService? share,
}) =>
    MantrasPlayerBloc(
      repository: repo,
      audioPort: port ?? _FakePort(),
      shareService: share ?? FakeShareService(),
      analytics: analytics,
    );

MantrasPlayerArgs _args(List<String> ids, int index, {String source = 'newly_added'}) =>
    MantrasPlayerArgs(
      itemId: ids[index],
      queue: [for (final id in ids) mantraAudioFixture(id)],
      index: index,
      playlistSource: source,
    );

void main() {
  setUpAll(() {
    // `buildShareUrl` reads AppConfig.instance.shareHost.
    AppConfig.debugSetInstance(
      AppConfig.forTest(shareHost: 'https://share.example'),
    );
  });

  test('opens + autoplays the tapped item (Pro) + fires page-viewed + started',
      () async {
    final repo = FakeMantrasRepository();
    final port = _FakePort();
    final analytics = RecordingAnalytics();
    final bloc = _bloc(repo, port: port, analytics: analytics)
      ..add(MantrasPlayerOpened(_args(['m0', 'm1'], 0)));
    await bloc.stream.firstWhere((s) => s is MantrasPlayerReady);
    final ready = bloc.state as MantrasPlayerReady;
    expect(ready.detail.audio.id, 'm0');
    expect(ready.repeatTarget, 7); // default preference
    expect(ready.repeatCompleted, 0);
    // The bloc forwards the current server target on every port.play so the
    // shared engine drives the jaap loop end-to-end.
    expect(port.calls, contains('play:m0:target=7'));
    // Sheet 1 row 69 — `mantras_player_page_viewed`.
    expect(analytics.fired('mantras_player_page_viewed'), isTrue);
    // Sheet 1 row 70 — `mantras_audio_started` with the full property set.
    final started = analytics.last('mantras_audio_started')!;
    expect(started.properties['audio_id'], 'm0');
    expect(started.properties['audio_type'], 'mantra');
    expect(started.properties['start_reason'], 'auto_play');
    expect(started.properties['repeat_target'], 7);
    await bloc.close();
  });

  test('free user → gated restore (server withheld the URL)', () async {
    final repo = FakeMantrasRepository(pro: false);
    final bloc = _bloc(repo)..add(MantrasPlayerOpened(_args(['m0'], 0)));
    await bloc.stream.firstWhere((s) => s is MantrasPlayerGatedRestore);
    expect(bloc.state, isA<MantrasPlayerGatedRestore>());
    await bloc.close();
  });

  test('below-target completion updates the pill; engine drives the replay',
      () async {
    final repo = FakeMantrasRepository(savedTarget: 7);
    final port = _FakePort();
    final analytics = RecordingAnalytics();
    final bloc = _bloc(repo, port: port, analytics: analytics)
      ..add(MantrasPlayerOpened(_args(['m0', 'm1'], 0)));
    await bloc.stream.firstWhere((s) => s is MantrasPlayerReady);

    // Screen dispatches this from `controller.completionStream`.
    bloc.add(const MantrasPlayerTrackCompleted(
      itemId: 'm0',
      repetitionNumber: 1,
      repeatTarget: 7,
      targetReached: false,
      playheadPosition: Duration(seconds: 3),
    ));
    await bloc.stream.firstWhere(
      (s) => s is MantrasPlayerReady && s.repeatCompleted == 1,
    );
    final ready = bloc.state as MantrasPlayerReady;
    expect(ready.index, 0); // did NOT advance
    expect(ready.repeatCompleted, 1);
    // The engine (not the bloc) now runs the jaap replay — bloc must NOT
    // trigger a second port.play for the same item.
    expect(port.calls.where((c) => c.startsWith('play:m0')).length, 1);
    expect(analytics.fired('mantras_repetition_completed'), isTrue);
    // `deity_slug` — the deity THIS mantra belongs to, read off the loaded
    // detail so the jaap funnel groups by deity.
    expect(
      analytics.propsFor('mantras_repetition_completed')['deity_slug'],
      'hanuman',
    );
    await bloc.close();
    await port.dispose();
  });

  test('reaching the target auto-advances silently to the next queue item',
      () async {
    final repo = FakeMantrasRepository(savedTarget: 1); // target reached in one
    final port = _FakePort();
    final analytics = RecordingAnalytics();
    final bloc = _bloc(repo, port: port, analytics: analytics)
      ..add(MantrasPlayerOpened(_args(['m0', 'm1'], 0)));
    await bloc.stream.firstWhere((s) => s is MantrasPlayerReady);

    bloc.add(const MantrasPlayerTrackCompleted(
      itemId: 'm0',
      repetitionNumber: 1,
      repeatTarget: 1,
      targetReached: true,
      playheadPosition: Duration(seconds: 3),
    ));
    await bloc.stream.firstWhere(
      (s) => s is MantrasPlayerReady && s.index == 1,
    );
    final ready = bloc.state as MantrasPlayerReady;
    expect(ready.detail.audio.id, 'm1');
    expect(ready.repeatCompleted, 0);
    expect(analytics.fired('mantras_repeat_target_completed'), isTrue);
    // The auto-advance re-fires `audio_started` on the new item with the
    // Sheet 1 row 70 `start_reason=next_item`.
    final started = analytics.allProps('mantras_audio_started');
    expect(started.isNotEmpty, isTrue);
    expect(started.last['start_reason'], 'next_item');
    expect(started.last['audio_id'], 'm1');
    await port.dispose();
  });

  test('at the queue end the target completion stops (no loop)', () async {
    final repo = FakeMantrasRepository(savedTarget: 1);
    final port = _FakePort();
    final bloc = _bloc(repo, port: port)
      ..add(MantrasPlayerOpened(_args(['m0'], 0)));
    await bloc.stream.firstWhere((s) => s is MantrasPlayerReady);

    bloc.add(const MantrasPlayerTrackCompleted(
      itemId: 'm0',
      repetitionNumber: 1,
      repeatTarget: 1,
      targetReached: true,
      playheadPosition: Duration(seconds: 3),
    ));
    await Future<void>.delayed(Duration.zero);
    final ready = bloc.state as MantrasPlayerReady;
    expect(ready.index, 0);
    expect(ready.repeatCompleted, 0);
    await bloc.close();
    await port.dispose();
  });

  test('changing the target while playing resets completed to 0 + persists + '
      'pushes the new target to the engine', () async {
    final repo = FakeMantrasRepository(savedTarget: 7);
    final port = _FakePort();
    final analytics = RecordingAnalytics();
    final bloc = _bloc(repo, port: port, analytics: analytics)
      ..add(MantrasPlayerOpened(_args(['m0', 'm1'], 0)));
    await bloc.stream.firstWhere((s) => s is MantrasPlayerReady);

    bloc.add(const MantrasPlayerTrackCompleted(
      itemId: 'm0',
      repetitionNumber: 1,
      repeatTarget: 7,
      targetReached: false,
      playheadPosition: Duration(seconds: 3),
    ));
    await bloc.stream.firstWhere(
      (s) => s is MantrasPlayerReady && s.repeatCompleted == 1,
    );

    bloc.add(const MantrasPlayerCounterTargetSelected(11));
    await bloc.stream.firstWhere(
      (s) => s is MantrasPlayerReady && s.repeatTarget == 11,
    );
    final ready = bloc.state as MantrasPlayerReady;
    expect(ready.repeatCompleted, 0);
    expect(repo.savedTarget, 11);
    expect(analytics.fired('mantras_repeat_count_selected'), isTrue);
    // TAM-130: the engine's own repeat counter has to see the new target
    // too, otherwise the jaap loop stays at the old target.
    expect(port.repeatTarget, 11);
    expect(port.calls, contains('setRepeatTarget:11'));
    await bloc.close();
    await port.dispose();
  });

  test('like is optimistic and reconciles with the server count', () async {
    final repo = FakeMantrasRepository();
    final bloc = _bloc(repo)..add(MantrasPlayerOpened(_args(['m0'], 0)));
    await bloc.stream.firstWhere((s) => s is MantrasPlayerReady);

    bloc.add(const MantrasPlayerLikeToggled());
    await bloc.stream.firstWhere(
      (s) => s is MantrasPlayerReady && s.liked && s.likeCount == 24988,
    );
    expect((bloc.state as MantrasPlayerReady).liked, isTrue);
    await bloc.close();
  });

  test('like reverts on backend failure', () async {
    final repo = FakeMantrasRepository(failLike: true);
    final bloc = _bloc(repo)..add(MantrasPlayerOpened(_args(['m0'], 0)));
    await bloc.stream.firstWhere((s) => s is MantrasPlayerReady);
    final before = bloc.state as MantrasPlayerReady;

    bloc.add(const MantrasPlayerLikeToggled());
    // optimistic flip then revert — settle both microtasks.
    await Future<void>.delayed(const Duration(milliseconds: 10));
    final after = bloc.state as MantrasPlayerReady;
    expect(after.liked, before.liked);
    expect(after.likeCount, before.likeCount);
    await bloc.close();
  });

  test('share fires clicked + result events and bumps the optimistic count',
      () async {
    final repo = FakeMantrasRepository();
    final analytics = RecordingAnalytics();
    final share = FakeShareService();
    final bloc = _bloc(repo, analytics: analytics, share: share)
      ..add(MantrasPlayerOpened(_args(['m0'], 0)));
    await bloc.stream.firstWhere((s) => s is MantrasPlayerReady);
    final before = (bloc.state as MantrasPlayerReady).shareCount;

    bloc.add(const MantrasPlayerShareRequested());
    await bloc.stream.firstWhere(
      (s) => s is MantrasPlayerReady && s.shareCount == before + 1,
    );
    // Give the awaited share round-trip a microtask to settle so the
    // result event has fired by the time we assert.
    await Future<void>.delayed(Duration.zero);
    // The canonical HTTPS App Link, NEVER the `prabhuji://` custom scheme
    // (nor the server's `deepLinkUrl`, which still sends the custom form):
    // messaging apps don't linkify unknown schemes, so a custom-scheme
    // share arrives as dead plain text and never reaches the Play Store.
    expect(share.lastShare, isNotNull);
    expect(share.lastShare!.deepLink, 'https://share.example/app/mantra/m0');
    expect(share.lastShare!.deepLink, isNot(startsWith('prabhuji://')));
    expect(analytics.fired('mantras_audio_share_clicked'), isTrue);
    // Sheet 1 row 75 — `mantras_audio_share_result` fires AFTER the share
    // sheet resolves, carrying the WhatsApp success + destination the
    // FakeShareService reports.
    expect(analytics.fired('mantras_audio_share_result'), isTrue);
    final result = analytics.last('mantras_audio_share_result')!;
    expect(result.properties['result'], 'success');
    expect(result.properties['destination_app'],
        'com.whatsapp/com.whatsapp.ContactPicker');
    await bloc.close();
  });

  test('app-state change fires audio_app_state_changed with position + state',
      () async {
    final repo = FakeMantrasRepository();
    final port = _FakePort()
      ..currentPosition = const Duration(seconds: 42)
      ..isPlaying = true;
    final analytics = RecordingAnalytics();
    final bloc = _bloc(repo, port: port, analytics: analytics)
      ..add(MantrasPlayerOpened(_args(['m0'], 0)));
    await bloc.stream.firstWhere((s) => s is MantrasPlayerReady);

    bloc.add(const MantrasPlayerAppStateChanged('background'));
    // Give the async handler a microtask to fire.
    await Future<void>.delayed(Duration.zero);
    expect(analytics.fired('mantras_audio_app_state_changed'), isTrue);
    final e = analytics.last('mantras_audio_app_state_changed')!;
    expect(e.properties['app_state'], 'background');
    expect(e.properties['playback_state'], 'playing');
    expect(e.properties['playback_position_seconds'], 42);
    await bloc.close();
  });

  test('playlist item selection jumps + resets the counter', () async {
    final repo = FakeMantrasRepository();
    final analytics = RecordingAnalytics();
    final bloc = _bloc(repo, analytics: analytics)
      ..add(MantrasPlayerOpened(_args(['m0', 'm1', 'm2'], 0)));
    await bloc.stream.firstWhere((s) => s is MantrasPlayerReady);

    bloc.add(const MantrasPlayerPlaylistItemSelected(2));
    await bloc.stream.firstWhere(
      (s) => s is MantrasPlayerReady && s.index == 2,
    );
    final ready = bloc.state as MantrasPlayerReady;
    expect(ready.detail.audio.id, 'm2');
    expect(ready.repeatCompleted, 0);
    expect(analytics.fired('mantras_playlist_item_selected'), isTrue);
    await bloc.close();
  });

  test('audio error keeps the user on the player + fires playback_failed',
      () async {
    final repo = FakeMantrasRepository();
    final analytics = RecordingAnalytics();
    final bloc = _bloc(repo, analytics: analytics)
      ..add(MantrasPlayerOpened(_args(['m0'], 0)));
    await bloc.stream.firstWhere((s) => s is MantrasPlayerReady);

    bloc.add(const MantrasPlayerAudioErrored());
    await bloc.stream.firstWhere((s) => s is MantrasPlayerErrorState);
    expect(
      (bloc.state as MantrasPlayerErrorState).message,
      'Audio play nahi ho paya. Kripya phir try karein.',
    );
    // Sheet 1 row 85 — `mantras_audio_playback_failed`.
    expect(analytics.fired('mantras_audio_playback_failed'), isTrue);
    final failed = analytics.last('mantras_audio_playback_failed')!;
    expect(failed.properties['audio_id'], 'm0');
    expect(failed.properties['failure_stage'], 'playback');
    await bloc.close();
  });
}
