// Explicit named params (some are functions) — see PaywallBloc note.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';
import 'dart:developer' as developer;

import 'package:bloc/bloc.dart';

import '../../../../api/api_client.dart';
import '../../../../core/analytics.dart';
import '../../../../core/deep_link_parser.dart';
import '../../../../core/share_service.dart';
import '../../../../core/share_url_builder.dart';
import '../../../audio/domain/audio_item.dart';
import '../../../audio/domain/repeat_counter.dart';
import '../../data/mantras_models.dart';
import '../../data/mantras_repository.dart';
import '../../mantras_analytics.dart';
import 'mantras_player_audio_port.dart';
import 'mantras_player_event.dart';
import 'mantras_player_state.dart';

/// Full-player bloc (TAM-66 §6.8–6.12). Owns the queue + current detail +
/// engagement + the **repeat target**; the shared TAM-59 engine owns the
/// jaap replay loop end-to-end (TAM-130). Playback transport is the shared
/// engine via [MantrasPlayerAudioPort].
///
/// Repeat-counter (§6.9): each track plays as a single-item full-mode playback
/// with `repeatTarget: N` on the port. The engine internally seeks-to-zero +
/// resumes on every completion until it hits the target, then STOPS and emits
/// an [AudioTrackCompletion] with `targetReached: true`. The bloc subscribes
/// through the screen to that completion stream, fires per-repetition
/// analytics (Sheet 1 row 72) + `repeat_target_completed` (row 79) on
/// target-reached, and auto-advances the queue with NO toast/overlay.
/// Changing the target resets `completed` to 0 immediately and persists via
/// `PUT /counter-preference`.
///
/// Guarantees: stream URL comes from the server only (never synthesized); a
/// missing URL → calm restore prompt; prev/next clamp to queue boundaries; STOP
/// at queue end (no loop); audio error → in-player retry, no auto-skip.
class MantrasPlayerBloc extends Bloc<MantrasPlayerEvent, MantrasPlayerState> {
  MantrasPlayerBloc({
    required MantrasRepository repository,
    required MantrasPlayerAudioPort audioPort,
    required ShareService shareService,
    Analytics? analytics,
  })  : _repository = repository,
        _audioPort = audioPort,
        _shareService = shareService,
        _analytics = analytics,
        super(const MantrasPlayerLoading()) {
    on<MantrasPlayerOpened>(_onOpened);
    on<MantrasPlayerNextRequested>(_onNext);
    on<MantrasPlayerPreviousRequested>(_onPrevious);
    on<MantrasPlayerTrackCompleted>(_onCompleted);
    on<MantrasPlayerAudioErrored>(_onAudioErrored);
    on<MantrasPlayerLikeToggled>(_onLikeToggled);
    on<MantrasPlayerShareRequested>(_onShareRequested);
    on<MantrasPlayerCounterTargetSelected>(_onCounterTargetSelected);
    on<MantrasPlayerPlaylistItemSelected>(_onPlaylistItemSelected);
    on<MantrasPlayerRetryRequested>(_onRetry);
    on<MantrasPlayerAppStateChanged>(_onAppStateChanged);
  }

  final MantrasRepository _repository;
  final MantrasPlayerAudioPort _audioPort;
  final ShareService _shareService;
  final Analytics? _analytics;

  static const String _audioErrorCopy =
      'Audio play nahi ho paya. Kripya phir try karein.';

  List<MantraAudio> _queue = const [];
  int _index = 0;
  String _playlistSource = '';

  /// The currently-selected jaap target (persists to the server via
  /// `PUT /counter-preference`). The engine holds the live `completed` count
  /// and drives the replay loop internally — this bloc only owns the target.
  int _target = RepeatCounter.kDefaultTarget;

  /// The server's selectable japa targets (`availableTargets`). Empty until the
  /// preference call lands, and stays empty if it fails: the client has no
  /// authored list of its own to offer.
  List<int> _availableTargets = const [];

  /// Reason for the NEXT `audioStarted` emit — set to `user_play` on a
  /// resume/toggle, `next_item` on prev/next, `resume` on a re-attach, and
  /// defaults to `auto_play` for a fresh open.
  String _nextStartReason = 'auto_play';

  /// Retry count for the audio-load failure event (row 85). Reset per open.
  int _retryCount = 0;

  /// Rolling sum of seconds actually listened across the current target's
  /// repeats — reported on Sheet 1 row 79 (`repeat_target_completed`) as
  /// `total_listen_seconds`, then reset when the target rolls over.
  int _totalListenSeconds = 0;

  Future<void> _onOpened(
    MantrasPlayerOpened event,
    Emitter<MantrasPlayerState> emit,
  ) async {
    _queue = List<MantraAudio>.of(event.args.queue);
    _index = event.args.index;
    _playlistSource = event.args.playlistSource;
    _retryCount = 0;
    _totalListenSeconds = 0;
    // A mini-player re-open re-attaches to ongoing playback; the first
    // start event on that surface should read `resume`, not `auto_play`.
    _nextStartReason = event.args.autoStart ? 'auto_play' : 'resume';

    // Load the persisted repeat target + the server's option list. Best-effort —
    // a failure keeps the engine's default target and leaves the option list
    // EMPTY (the sheet then shows no options rather than a hardcoded list the
    // server never authored); the player itself is never blocked.
    var target = RepeatCounter.kDefaultTarget;
    try {
      final preference = await _repository.fetchCounterPreference();
      target = preference.repeatTarget;
      _availableTargets = preference.availableTargets;
    } catch (_) {
      // keep the engine default; no options to offer
    }
    _target = target < 1 ? RepeatCounter.kDefaultTarget : target;

    await _loadAndPlay(
      emit,
      autoStart: event.args.autoStart,
      fallbackId: event.args.itemId,
      isOpen: true,
    );
  }

  Future<void> _onNext(
    MantrasPlayerNextRequested event,
    Emitter<MantrasPlayerState> emit,
  ) async {
    if (_index >= _queue.length - 1) return; // boundary no-op
    _index += 1;
    // Engine resets `repeatCompleted` on the next play() call; nothing to do
    // in the bloc beyond flushing the target-window listen-seconds rollup.
    _totalListenSeconds = 0;
    _nextStartReason = 'next_item';
    await _loadAndPlay(emit, autoStart: true);
  }

  Future<void> _onPrevious(
    MantrasPlayerPreviousRequested event,
    Emitter<MantrasPlayerState> emit,
  ) async {
    if (_index <= 0) return; // boundary no-op
    _index -= 1;
    _totalListenSeconds = 0;
    _nextStartReason = 'next_item';
    await _loadAndPlay(emit, autoStart: true);
  }

  Future<void> _onCompleted(
    MantrasPlayerTrackCompleted event,
    Emitter<MantrasPlayerState> emit,
  ) async {
    final current = state;
    if (current is! MantrasPlayerReady) return;
    // Ignore stale completions for an item the queue has already moved past
    // (e.g. an aarti-owned item that completed while a mantras route sits
    // pushed under an aarti route — the screen filters by module but a
    // rapid queue-advance can race this handler).
    if (event.itemId != _currentId) return;

    // Sheet 1 row 72 — `mantras_repetition_completed`. Fires once per full
    // playthrough with `repetition_number` (1-based within the current
    // target), `repeat_target`, and the sheet's `repetation_count` (verbatim
    // sheet spelling, kept so the warehouse column matches the contract).
    unawaited(_analytics?.trackEvent(
      MantrasEvents.repetitionCompleted,
      properties: {
        MantrasEventProps.audioId: event.itemId,
        // `deity_slug` — the deity THIS mantra belongs to, off the loaded
        // detail (`null` when uncategorised) so the jaap funnel groups by
        // deity independently of the listing the user arrived from.
        MantrasEventProps.deitySlug: current.detail.deitySlug,
        MantrasEventProps.repetitionNumber: event.repetitionNumber,
        MantrasEventProps.repeatTarget: event.repeatTarget,
        MantrasEventProps.repetitionCount: event.repetitionNumber,
      },
    ));

    // Accumulate the elapsed seconds from this repetition into the
    // target-window rollup so row 79 can report `total_listen_seconds`.
    _totalListenSeconds += event.playheadPosition.inSeconds;

    if (!event.targetReached) {
      // Engine has already seeked-to-zero + resumed for the next jaap step;
      // the bloc only reflects the new completed count on the pill.
      emit(current.copyWith(repeatCompleted: event.repetitionNumber));
      return;
    }

    // Target reached (§6.9) — Sheet 1 row 79.
    unawaited(_analytics?.trackEvent(
      MantrasEvents.repeatTargetCompleted,
      properties: {
        MantrasEventProps.audioId: event.itemId,
        MantrasEventProps.repeatTarget: event.repeatTarget,
        MantrasEventProps.totalListenSeconds: _totalListenSeconds,
      },
    ));
    _totalListenSeconds = 0;

    if (_index < _queue.length - 1) {
      _index += 1;
      _nextStartReason = 'next_item';
      // Silent auto-advance to the next queue item (NO toast; no
      // Sheet-1 event for the auto-advance itself — the following
      // `audio_started` on the new item carries `start_reason=next_item`).
      await _loadAndPlay(emit, autoStart: true);
    } else {
      // Queue end — stop, no loop. Keep the player on the last item.
      emit(current.copyWith(repeatCompleted: 0));
    }
  }

  /// Sheet 1 row 85 — `mantras_audio_playback_failed`. `failure_stage`
  /// distinguishes load failures (raised out of the shared engine) from
  /// render failures once we have that signal; today it always fires as
  /// `playback` because that's what the shared engine surfaces.
  void _onAudioErrored(
    MantrasPlayerAudioErrored event,
    Emitter<MantrasPlayerState> emit,
  ) {
    unawaited(_analytics?.trackEvent(
      MantrasEvents.audioPlaybackFailed,
      properties: {
        MantrasEventProps.audioId: _currentId,
        MantrasEventProps.failureStage: 'playback',
        MantrasEventProps.errorCode: 'playback_failed',
        // Retry is user-driven via `MantrasPlayerRetryRequested`; expose
        // the current count so a downstream retry event can be correlated.
        'retry_count': _retryCount,
      },
    ));
    _emitAudioError(emit);
  }

  /// Sheet 1 row 73 — `mantras_audio_like_changed`. Optimistic flip + server
  /// reconciliation; `action` is `like|unlike` and rides with the current
  /// playback position.
  Future<void> _onLikeToggled(
    MantrasPlayerLikeToggled event,
    Emitter<MantrasPlayerState> emit,
  ) async {
    final current = state;
    if (current is! MantrasPlayerReady) return;
    final nextLiked = !current.liked;
    final nextCount =
        nextLiked ? current.likeCount + 1 : (current.likeCount - 1).clamp(0, 1 << 31);
    // Optimistic (§6.11): flip immediately.
    emit(current.copyWith(liked: nextLiked, likeCount: nextCount));
    unawaited(_analytics?.trackEvent(
      MantrasEvents.audioLikeChanged,
      properties: {
        MantrasEventProps.audioId: _currentId,
        MantrasEventProps.action: nextLiked ? 'like' : 'unlike',
        MantrasEventProps.playbackPositionSeconds:
            _audioPort.currentPosition.inSeconds,
      },
    ));
    try {
      final outcome = await _repository.toggleLike(_currentId);
      // Reconcile with the server-authoritative count.
      final now = state;
      if (now is MantrasPlayerReady && now.detail.audio.id == current.detail.audio.id) {
        emit(now.copyWith(liked: outcome.liked, likeCount: outcome.likeCount));
      }
    } catch (_) {
      // Revert on failure (§6.11) with a soft error — restore prior like state.
      final now = state;
      if (now is MantrasPlayerReady && now.detail.audio.id == current.detail.audio.id) {
        emit(now.copyWith(liked: current.liked, likeCount: current.likeCount));
      }
    }
  }

  /// Sheet 1 rows 74 + 75 — `mantras_audio_share_clicked` fires immediately
  /// on the Share tap; `mantras_audio_share_result` fires AFTER the OS sheet
  /// resolves, carrying the platform's outcome (success/dismissed/failure)
  /// and the chosen target (Android component id; null on iOS/web + on OEMs
  /// that return the `unavailable` sentinel).
  Future<void> _onShareRequested(
    MantrasPlayerShareRequested event,
    Emitter<MantrasPlayerState> emit,
  ) async {
    final current = state;
    if (current is! MantrasPlayerReady) return;
    final detail = current.detail;
    final audio = detail.audio;
    unawaited(_analytics?.trackEvent(
      MantrasEvents.audioShareClicked,
      properties: {
        MantrasEventProps.audioId: audio.id,
        MantrasEventProps.playbackPositionSeconds:
            _audioPort.currentPosition.inSeconds,
      },
    ));
    // Optimistic share count.
    emit(current.copyWith(shareCount: current.shareCount + 1));
    // Payload shape (§6.12): "Prabhuji पर {title} सुनें: {deepLink}" — deep link
    // + text only, NEVER the raw audio file (share_plus enforces this by shape).
    // Always the canonical HTTPS App Link — `krutyug.ai/app/mantra/<id>`.
    // The server's `deepLinkUrl` is deliberately NOT preferred here: it
    // carries the custom `prabhuji://` scheme, which messaging apps
    // silently swallow (they only linkify known schemes), so a shared
    // mantra used to arrive as dead plain text. The HTTPS form opens the
    // app when installed (App Links, autoVerify) and the Play Store
    // landing page when it isn't. See `share_url_builder.dart`.
    final deepLink = buildShareUrl(MantraDeepLink(audioId: audio.id));
    final text = 'Prabhuji पर ${audio.title} सुनें';
    ShareOutcome? outcome;
    Object? shareError;
    try {
      outcome = await _shareService.share(ShareContent(
        text: text,
        deepLink: deepLink,
        thumbnailUrl: audio.artworkUrl,
      ));
    } catch (e) {
      shareError = e;
    }
    unawaited(_analytics?.trackEvent(
      MantrasEvents.audioShareResult,
      properties: {
        MantrasEventProps.audioId: audio.id,
        MantrasEventProps.result: _shareResultWireValue(outcome, shareError),
        MantrasEventProps.destinationApp: outcome?.destination,
        if (shareError != null) MantrasEventProps.errorCode: 'share_threw',
      },
    ));
  }

  static String _shareResultWireValue(ShareOutcome? outcome, Object? error) {
    if (error != null) return 'failure';
    switch (outcome?.status) {
      case ShareOutcomeStatus.success:
        return 'success';
      case ShareOutcomeStatus.dismissed:
        return 'cancelled';
      case ShareOutcomeStatus.unavailable:
      case null:
        return 'pending';
    }
  }

  /// Sheet 1 row 78 — `mantras_repeat_count_selected`. Carries the previous
  /// target so a switch can be analysed as a distinct step.
  Future<void> _onCounterTargetSelected(
    MantrasPlayerCounterTargetSelected event,
    Emitter<MantrasPlayerState> emit,
  ) async {
    final current = state;
    if (current is! MantrasPlayerReady) return;
    final previousTarget = _target;
    // Changing the target resets progress to 0/target and updates the pill
    // now — the engine has to know too so its jaap loop honours the new N
    // (`setRepeatTarget` on the port resets `repeatCompleted` to 0 without
    // interrupting the current playback).
    _target = event.target;
    _audioPort.setRepeatTarget(event.target);
    _totalListenSeconds = 0;
    emit(current.copyWith(
      repeatTarget: _target,
      repeatCompleted: 0,
    ));
    unawaited(_analytics?.trackEvent(
      MantrasEvents.repeatCountSelected,
      properties: {
        MantrasEventProps.audioId: _currentId,
        MantrasEventProps.previousRepeatTarget: previousTarget,
        MantrasEventProps.repeatTarget: event.target,
      },
    ));
    // Persist (§6.9) — best-effort.
    try {
      await _repository.saveCounterPreference(event.target);
    } catch (_) {
      // The in-memory selection stands regardless of persistence.
    }
  }

  /// Sheet 1 row 82 — `mantras_playlist_item_selected`. Carries the source
  /// audio (the item the user was on when they opened the sheet), the newly
  /// selected item, and its position in the queue.
  Future<void> _onPlaylistItemSelected(
    MantrasPlayerPlaylistItemSelected event,
    Emitter<MantrasPlayerState> emit,
  ) async {
    if (event.index < 0 || event.index >= _queue.length) return;
    final sourceId = _currentId;
    _index = event.index;
    // Engine resets its own counter on the next play() call.
    _totalListenSeconds = 0;
    _nextStartReason = 'user_play';
    unawaited(_analytics?.trackEvent(
      MantrasEvents.playlistItemSelected,
      properties: {
        MantrasEventProps.sourceAudioId: sourceId,
        MantrasEventProps.selectedAudioId: _queue[_index].id,
        MantrasEventProps.positionIndex: _index,
      },
    ));
    await _loadAndPlay(emit, autoStart: true);
  }

  Future<void> _onRetry(
    MantrasPlayerRetryRequested event,
    Emitter<MantrasPlayerState> emit,
  ) {
    _retryCount += 1;
    _nextStartReason = 'user_play';
    return _loadAndPlay(emit, autoStart: true);
  }

  /// Sheet 1 row 84 — `mantras_audio_app_state_changed`. Fires only while
  /// the bloc has a Ready state (there's audio in flight); background/
  /// foreground toggles while sitting on the restore prompt aren't
  /// interesting to the funnel. Position + `playback_state` are captured
  /// FROM the audio port at emit time so we record where the user actually
  /// was, not a stale copy from the last state emit.
  Future<void> _onAppStateChanged(
    MantrasPlayerAppStateChanged event,
    Emitter<MantrasPlayerState> emit,
  ) async {
    final current = state;
    if (current is! MantrasPlayerReady) return;
    unawaited(_analytics?.trackEvent(
      MantrasEvents.audioAppStateChanged,
      properties: {
        MantrasEventProps.audioId: current.detail.audio.id,
        MantrasEventProps.appState: event.state,
        MantrasEventProps.playbackState:
            _audioPort.isPlaying ? 'playing' : 'paused',
        MantrasEventProps.playbackPositionSeconds:
            _audioPort.currentPosition.inSeconds,
      },
    ));
  }

  String get _currentId => _queue.isNotEmpty ? _queue[_index].id : '';

  void _emitAudioError(Emitter<MantrasPlayerState> emit) =>
      emit(const MantrasPlayerErrorState(_audioErrorCopy));

  /// Build a placeholder [MantraDetailData] from an active downloaded
  /// [AudioItem] so the full player can render offline. Engagement counts
  /// and mantra text are absent from the local store, so they default to
  /// safe values; the encrypted file itself is already playing via the
  /// shared controller. `audioStreamUrl` is a non-empty sentinel to avoid
  /// tripping the `isPlayableNow` gate — it is never handed to the engine.
  MantraDetailData _syntheticDetailFromDownloaded(AudioItem item) {
    return MantraDetailData(
      audio: MantraAudio(
        id: item.id,
        title: item.title,
        artworkUrl: item.artworkUrl ?? '',
        singerName: item.subtitle,
        audioStreamUrl: 'downloaded:${item.id}',
        likeCount: 0,
        shareCount: 0,
        likedByMe: false,
      ),
      mantraText: '',
      transliterationText: null,
      deepLinkUrl: null,
      playlist: const <MantraAudio>[],
      playlistSource: '',
    );
  }

  /// Fetch detail for the current index (or [fallbackId] when the queue is
  /// empty, e.g. a mini-player re-open), enforce the server-URL gate, then
  /// (optionally) play.
  Future<void> _loadAndPlay(
    Emitter<MantrasPlayerState> emit, {
    required bool autoStart,
    String? fallbackId,
    bool isOpen = false,
  }) async {
    emit(const MantrasPlayerLoading());
    final id = _queue.isNotEmpty ? _queue[_index].id : (fallbackId ?? '');
    if (id.isEmpty) {
      _emitAudioError(emit);
      return;
    }

    late final MantraDetailData detail;
    try {
      detail = await _repository.fetchDetail(
        id,
        source: _playlistSource.isEmpty ? null : _playlistSource,
        sourceId: null,
      );
    } catch (error, stack) {
      // The prior catch-all swallowed everything → user always saw a generic
      // "could not play" and we had no way to diagnose whether the failure was
      // a 4xx (bad id / auth), a 5xx (server), a JSON parse crash, or a network
      // drop. Log the underlying error and, for structured `ApiException`s,
      // surface the server-side message so QA/eng can tell them apart.
      developer.log(
        'mantras detail fetch failed (id=$id)',
        name: 'mantras.player',
        error: error,
        stackTrace: stack,
      );
      // DOWNLOADED-source fallback — mirror of the aarti bloc. When the
      // shared engine has an active downloaded item matching this id, the
      // encrypted file is already playing; render the full player from the
      // AudioItem so the user gets the offline UX instead of the error
      // screen. Real engagement counts / mantra text / deep-link URL are
      // unavailable offline; the like/share buttons still fire and best-
      // effort sync when the network is back.
      final active = _audioPort.currentItem;
      if (active != null &&
          active.id == id &&
          active.source == AudioSource.downloaded) {
        final synthetic = _syntheticDetailFromDownloaded(active);
        _queue = [synthetic.audio];
        _index = 0;
        if (isOpen) {
          unawaited(_analytics?.trackEvent(
            MantrasEvents.playerPageViewed,
            properties: {
              MantrasEventProps.audioId: id,
              MantrasEventProps.previousScreen:
                  _playlistSource.isEmpty ? null : _playlistSource,
            },
          ));
        }
        emit(MantrasPlayerReady(
          detail: synthetic,
          queue: _queue,
          index: _index,
          liked: synthetic.audio.likedByMe,
          likeCount: synthetic.audio.likeCount,
          shareCount: synthetic.audio.shareCount,
          repeatTarget: _target,
          repeatCompleted: 0,
          availableTargets: _availableTargets,
        ));
        return;
      }
      if (error is ApiException) {
        emit(MantrasPlayerErrorState(
          'Could not open this mantra: ${error.message}',
        ));
      } else {
        _emitAudioError(emit);
      }
      return;
    }

    // Server-URL gate: never play without a server-provided URL.
    if (!detail.audio.isPlayableNow) {
      emit(MantrasPlayerGatedRestore(id));
      return;
    }

    // Seed the queue from the server-authoritative detail playlist on a
    // mini-player re-open / single open.
    if (_queue.isEmpty) {
      _queue = detail.playlist.isNotEmpty ? detail.playlist : [detail.audio];
      _index = _queue.indexWhere((a) => a.id == detail.audio.id).clamp(0, _queue.length - 1);
    } else {
      _queue = List<MantraAudio>.of(_queue)..[_index] = detail.audio;
    }

    if (autoStart) {
      // Skip a redundant re-play when the shared engine is ALREADY on this
      // exact item (mini-player reopen, quick back-forth into the player,
      // deep-link into ongoing playback). Restarting would lose position
      // and interrupt the jaap repeat loop. Transport controls read the
      // live controller state directly, so the UI stays accurate.
      final alreadyActive = _audioPort.currentItemId == detail.audio.id;
      if (!alreadyActive) {
        try {
          await _audioPort.play(
            detail.audio.toAudioItem(),
            repeatTarget: _target,
          );
        } catch (error, stack) {
          developer.log(
            'mantras audio port play failed (id=$id)',
            name: 'mantras.player',
            error: error,
            stackTrace: stack,
          );
          unawaited(_analytics?.trackEvent(
            MantrasEvents.audioPlaybackFailed,
            properties: {
              MantrasEventProps.audioId: id,
              MantrasEventProps.failureStage: 'load',
              MantrasEventProps.errorCode: 'play_threw',
              'retry_count': _retryCount,
            },
          ));
          _emitAudioError(emit);
          return;
        }
        unawaited(
            _repository.recordRecentlyPlayed(id)); // best-effort play record
        // Sheet 1 row 70 — `mantras_audio_started`.
        unawaited(_analytics?.trackEvent(
          MantrasEvents.audioStarted,
          properties: {
            MantrasEventProps.audioId: id,
            MantrasEventProps.audioType: 'mantra',
            MantrasEventProps.playbackPositionSeconds:
                _audioPort.currentPosition.inSeconds,
            MantrasEventProps.startReason: _nextStartReason,
            MantrasEventProps.repeatTarget: _target,
          },
        ));
      } else {
        // Reattaching to an already-active engine item (mini-player reopen)
        // still counts as a fresh `audio_started` per row 70's definition
        // ("Audio starts/resumes"). The reason is `resume` in this case.
        // Also re-assert the current bloc target on the engine so a target
        // changed while the mini-player was up sticks on re-attach.
        _audioPort.setRepeatTarget(_target);
        unawaited(_analytics?.trackEvent(
          MantrasEvents.audioStarted,
          properties: {
            MantrasEventProps.audioId: id,
            MantrasEventProps.audioType: 'mantra',
            MantrasEventProps.playbackPositionSeconds:
                _audioPort.currentPosition.inSeconds,
            MantrasEventProps.startReason: 'resume',
            MantrasEventProps.repeatTarget: _target,
          },
        ));
      }
      // Reset for the next open — subsequent transport-driven starts fall
      // back to `auto_play` unless a specific event set the reason.
      _nextStartReason = 'auto_play';
    }

    if (isOpen) {
      // Sheet 1 row 69 — `mantras_player_page_viewed`.
      unawaited(_analytics?.trackEvent(
        MantrasEvents.playerPageViewed,
        properties: {
          MantrasEventProps.audioId: id,
          MantrasEventProps.previousScreen: _playlistSource.isEmpty
              ? null
              : _playlistSource,
        },
      ));
    }

    emit(MantrasPlayerReady(
      detail: detail,
      queue: _queue,
      index: _index,
      liked: detail.audio.likedByMe,
      likeCount: detail.audio.likeCount,
      shareCount: detail.audio.shareCount,
      repeatTarget: _target,
      // The engine resets `repeatCompleted` on every new play(); the pill
      // starts at 0/N and is advanced by the completion stream.
      repeatCompleted: 0,
      availableTargets: _availableTargets,
    ));
  }
}
