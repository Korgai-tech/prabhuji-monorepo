// Explicit named params (some are functions) — see PaywallBloc note.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';
import 'dart:developer' as developer;

import 'package:bloc/bloc.dart';

import '../../../../api/api_client.dart';
import '../../../../core/analytics.dart';
import '../../../../core/deep_link_parser.dart';
import '../../../../core/shared_analytics.dart';
import '../../../../core/share_service.dart';
import '../../../../core/share_url_builder.dart';
import '../../../audio/domain/audio_item.dart';
import '../../aarti_analytics.dart';
import '../../data/aarti_models.dart';
import '../../data/aarti_repository.dart';
import 'aarti_player_audio_port.dart';
import 'aarti_player_event.dart';
import 'aarti_player_state.dart';

/// Full-player bloc (TAM-64 §6.10–6.11). Owns the queue + current detail +
/// engagement; playback transport is the shared TAM-59 engine via
/// [AartiPlayerAudioPort]. Progress/seek/play-pause are read/written on the
/// engine directly by the screen (real-time), so this bloc holds only feature
/// state — keeping it a pure, testable unit.
///
/// Guarantees: stream URL comes from the server only (never synthesized); a
/// missing URL → calm restore prompt (q3), never silent playback; prev/next
/// clamp to queue boundaries; auto-next at end; STOP at queue end (no loop);
/// audio error → in-player retry, no auto-skip (§7.9).
class AartiPlayerBloc extends Bloc<AartiPlayerEvent, AartiPlayerState> {
  AartiPlayerBloc({
    required AartiRepository repository,
    required AartiPlayerAudioPort audioPort,
    required ShareService shareService,
    Analytics? analytics,
  })  : _repository = repository,
        _audioPort = audioPort,
        _shareService = shareService,
        _analytics = analytics,
        super(const AartiPlayerLoading()) {
    on<AartiPlayerOpened>(_onOpened);
    on<AartiPlayerNextRequested>(_onNext);
    on<AartiPlayerPreviousRequested>(_onPrevious);
    on<AartiPlayerTrackCompleted>(_onCompleted);
    on<AartiPlayerAudioErrored>(_onAudioErrored);
    on<AartiPlayerLikeToggled>(_onLikeToggled);
    on<AartiPlayerShareRequested>(_onShareRequested);
    on<AartiPlayerRetryRequested>(_onRetry);
    on<AartiPlayerAppStateChanged>(_onAppStateChanged);
  }

  final AartiRepository _repository;
  final AartiPlayerAudioPort _audioPort;
  final ShareService _shareService;
  final Analytics? _analytics;

  List<AartiAudio> _queue = const [];
  int _index = 0;
  String _sourceListType = '';
  String? _sourceFilter;

  Future<void> _onOpened(
    AartiPlayerOpened event,
    Emitter<AartiPlayerState> emit,
  ) async {
    _queue = List<AartiAudio>.of(event.args.queue);
    _index = event.args.index;
    _sourceListType = event.args.sourceListType;
    _sourceFilter = event.args.sourceFilter;
    final fallbackId = event.args.audioId;
    await _loadAndPlay(
      emit,
      autoStart: event.args.autoStart,
      startReason: AartiStartReason.autoPlay,
      fallbackId: fallbackId,
      isOpen: true,
    );
  }

  Future<void> _onNext(
    AartiPlayerNextRequested event,
    Emitter<AartiPlayerState> emit,
  ) async {
    if (_index >= _queue.length - 1) return; // boundary no-op (§6.11)
    _index += 1;
    unawaited(_analytics?.trackEvent(
      AartiEvents.nextAudioClicked,
      properties: {'audio_id': _currentId, 'source_list_type': _sourceListType},
    ));
    await _loadAndPlay(emit,
        autoStart: true, startReason: AartiStartReason.nextItem);
  }

  Future<void> _onPrevious(
    AartiPlayerPreviousRequested event,
    Emitter<AartiPlayerState> emit,
  ) async {
    if (_index <= 0) return; // boundary no-op (§6.11)
    _index -= 1;
    unawaited(_analytics?.trackEvent(
      AartiEvents.previousAudioClicked,
      properties: {'audio_id': _currentId, 'source_list_type': _sourceListType},
    ));
    // Previous is also a queue-driven boundary — `next_item` covers both
    // directions (the spec's start_reason vocabulary has no `previous_item`).
    await _loadAndPlay(emit,
        autoStart: true, startReason: AartiStartReason.nextItem);
  }

  Future<void> _onCompleted(
    AartiPlayerTrackCompleted event,
    Emitter<AartiPlayerState> emit,
  ) async {
    // `deity_slug` — the deity THIS recording belongs to (`deities.slug`),
    // read off the loaded detail so the completion funnel can be grouped by
    // deity regardless of which listing the user came from. `null` for an
    // uncategorised recording (or before a detail has loaded).
    final current = state;
    final deitySlug =
        current is AartiPlayerReady ? current.detail.deity?.slug : null;
    unawaited(_analytics?.trackEvent(
      AartiEvents.audioCompleted,
      properties: {
        'audio_id': _currentId,
        'source_list_type': _sourceListType,
        AartiEventProps.deitySlug: deitySlug,
      },
    ));
    if (_index < _queue.length - 1) {
      _index += 1;
      // Queue advance after the previous track ended → `next_item`.
      await _loadAndPlay(emit,
          autoStart: true, startReason: AartiStartReason.nextItem);
    }
    // else: stop at queue end — NO loop (§6.11). Engine already stopped.
  }

  void _onAudioErrored(
    AartiPlayerAudioErrored event,
    Emitter<AartiPlayerState> emit,
  ) {
    unawaited(_analytics?.trackEvent(
      AartiEvents.audioPlaybackFailed,
      properties: {'audio_id': _currentId, 'source_list_type': _sourceListType},
    ));
    // In-player retry copy, NO auto-skip (§7.9).
    emit(const AartiPlayerErrorState(
      'This audio could not play. Please try again.',
    ));
  }

  Future<void> _onLikeToggled(
    AartiPlayerLikeToggled event,
    Emitter<AartiPlayerState> emit,
  ) async {
    final current = state;
    if (current is! AartiPlayerReady) return;
    final nextLiked = !current.liked;
    final nextCount =
        nextLiked ? current.likeCount + 1 : (current.likeCount - 1).clamp(0, 1 << 31);
    // Optimistic (§6.10): flip immediately.
    emit(current.copyWith(liked: nextLiked, likeCount: nextCount));
    unawaited(_analytics?.trackEvent(
      AartiEvents.audioLikeChanged,
      properties: {'audio_id': _currentId, 'liked': nextLiked},
    ));
    try {
      await _repository.toggleLike(
        _currentId,
        liked: nextLiked,
        likeCount: current.likeCount,
      );
    } catch (_) {
      // Best-effort; the optimistic UI stands.
    }
  }

  Future<void> _onShareRequested(
    AartiPlayerShareRequested event,
    Emitter<AartiPlayerState> emit,
  ) async {
    final current = state;
    if (current is! AartiPlayerReady) return;
    final audio = current.detail.audio;
    unawaited(_analytics?.trackEvent(
      AartiEvents.audioShareClicked,
      properties: {'audio_id': audio.id, 'source_list_type': _sourceListType},
    ));
    // TAM-124 unified share event, in addition to the feature-scoped one
    // above — the funnel dashboard reads share_initiated for cross-feature
    // aggregation while shareTapped stays for the aarti-specific views.
    unawaited(_analytics?.trackEvent(SharedAnalyticsEvents.shareInitiated,
        properties: {
          SharedAnalyticsEventProps.sourceScreen: 'aarti_player',
          SharedAnalyticsEventProps.targetType: 'aarti',
          SharedAnalyticsEventProps.targetId: audio.id,
        }));
    // Optimistic share count.
    emit(current.copyWith(shareCount: current.shareCount + 1));
    // Share URL uses TAM-124's canonical HTTPS App Link so recipients
    // without the app land on Play Store via the krutyug.ai landing page.
    ShareOutcome? outcome;
    Object? shareError;
    try {
      outcome = await _shareService.share(ShareContent(
        text: '🙏 Listen to "${audio.title}" on Prabhuji',
        deepLink: buildShareUrl(AartiDeepLink(audioId: audio.id)),
        thumbnailUrl: audio.coverImageUrl,
      ));
    } catch (e) {
      shareError = e;
    }
    // Sheet 1 row 54 — `aarti_audio_share_result`. Reports the platform's
    // outcome (success/dismissed/unavailable) + the chosen target when the
    // OS gave us one (Android component id; null on iOS/web + on OEMs that
    // return the `unavailable` sentinel).
    unawaited(_analytics?.trackEvent(
      AartiEvents.audioShareResult,
      properties: {
        AartiEventProps.audioId: audio.id,
        AartiEventProps.result: _shareResultWireValue(outcome, shareError),
        AartiEventProps.destinationApp: outcome?.destination,
        if (shareError != null) AartiEventProps.errorCode: 'share_threw',
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

  Future<void> _onRetry(
    AartiPlayerRetryRequested event,
    Emitter<AartiPlayerState> emit,
  ) =>
      _loadAndPlay(emit,
          autoStart: true, startReason: AartiStartReason.autoPlay);

  /// Sheet 1 row 62 — `aarti_audio_app_state_changed`. Fires only while the
  /// bloc has a Ready state (there's an audio in flight); background/
  /// foreground toggles while sitting on the restore prompt aren't
  /// interesting to the funnel. Position + `playback_state` are captured
  /// FROM the audio port at emit time so we record where the user actually
  /// was, not a stale copy from the last state emit.
  Future<void> _onAppStateChanged(
    AartiPlayerAppStateChanged event,
    Emitter<AartiPlayerState> emit,
  ) async {
    final current = state;
    if (current is! AartiPlayerReady) return;
    unawaited(_analytics?.trackEvent(
      AartiEvents.audioAppStateChanged,
      properties: {
        AartiEventProps.audioId: current.detail.audio.id,
        AartiEventProps.appState: event.state,
        AartiEventProps.playbackState:
            _audioPort.isPlaying ? 'playing' : 'paused',
        AartiEventProps.playbackPositionSeconds:
            _audioPort.currentPosition.inSeconds,
      },
    ));
  }

  String get _currentId =>
      _queue.isNotEmpty ? _queue[_index].id : '';

  /// Fetch detail for the current index (or [fallbackId] when the queue is empty,
  /// e.g. a deep link), enforce the server-URL gate, then (optionally) play.
  ///
  /// [startReason] is the value ridden on `aarti_audio_started` when playback
  /// actually starts here — set by the caller (initial load / retry →
  /// `auto_play`, next / prev / auto-next → `next_item`). See
  /// [AartiStartReason].
  Future<void> _loadAndPlay(
    Emitter<AartiPlayerState> emit, {
    required bool autoStart,
    required String startReason,
    String? fallbackId,
    bool isOpen = false,
  }) async {
    emit(const AartiPlayerLoading());
    final id = _queue.isNotEmpty ? _queue[_index].id : (fallbackId ?? '');
    if (id.isEmpty) {
      emit(const AartiPlayerErrorState(
        'This audio could not play. Please try again.',
      ));
      return;
    }

    late final AartiDetail detail;
    try {
      detail = await _repository.fetchDetail(id);
    } catch (error, stack) {
      // The prior catch-all swallowed everything → user always saw a generic
      // "could not play" and we had no way to diagnose whether the failure was
      // a 4xx (bad id / auth), a 5xx (server), a JSON parse crash, or a network
      // drop. Log the underlying error and, for structured `ApiException`s,
      // surface the server-side message so QA/eng can tell them apart.
      developer.log(
        'aarti detail fetch failed (id=$id)',
        name: 'aarti.player',
        error: error,
        stackTrace: stack,
      );
      // DOWNLOADED-source fallback: when the shared engine has an active
      // downloaded item matching this id, the local encrypted file is
      // already playing — surface a Ready state built from the AudioItem
      // instead of the generic error, so the user gets the full player UI
      // (with placeholder engagement counts) offline. Server-side data
      // like real like/share counts + deity chip are unavailable in this
      // path; the like/share buttons still fire and best-effort sync when
      // the network is back (repository swallows failures).
      final active = _audioPort.currentItem;
      if (active != null &&
          active.id == id &&
          active.source == AudioSource.downloaded) {
        final synthetic = _syntheticDetailFromDownloaded(active);
        _queue = [synthetic.audio];
        _index = 0;
        if (isOpen) {
          unawaited(_analytics?.trackEvent(
            AartiEvents.playerPageViewed,
            properties: {
              'audio_id': id,
              'source_list_type': _sourceListType,
              'source_filter': ?_sourceFilter,
            },
          ));
        }
        emit(AartiPlayerReady(
          detail: synthetic,
          queue: _queue,
          index: _index,
          liked: synthetic.audio.likedByMe,
          likeCount: synthetic.audio.likeCount,
          shareCount: synthetic.audio.shareCount,
        ));
        return;
      }
      final message = error is ApiException
          ? 'Could not open this audio: ${error.message}'
          : 'This audio could not play. Please try again.';
      emit(AartiPlayerErrorState(message));
      return;
    }

    // Server-URL gate (q3): never play without a server-provided URL.
    if (!detail.audio.isPlayableNow) {
      emit(AartiPlayerGatedRestore(id));
      return;
    }

    // Normalize the queue: a deep-link/single open seeds it from the detail.
    if (_queue.isEmpty) {
      _queue = [detail.audio];
      _index = 0;
    } else {
      _queue = List<AartiAudio>.of(_queue)..[_index] = detail.audio;
    }

    if (autoStart) {
      // Skip a redundant re-play when the shared engine is ALREADY on this
      // exact item (mini-player reopen, quick back-forth into the player,
      // deep link into ongoing playback). Calling `.play()` would restart
      // from position 0 and briefly stall audio — the exact symptom of
      // "come back to the player, it stops for a beat then starts over".
      // The transport controls read the live controller state, so the UI
      // stays accurate without a re-emit.
      final alreadyActive = _audioPort.currentItemId == detail.audio.id;
      if (!alreadyActive) {
        try {
          await _audioPort.play(detail.audio.toAudioItem());
        } catch (error, stack) {
          developer.log(
            'aarti audio port play failed (id=$id)',
            name: 'aarti.player',
            error: error,
            stackTrace: stack,
          );
          emit(const AartiPlayerErrorState(
            'This audio could not play. Please try again.',
          ));
          return;
        }
        unawaited(_repository.recordPlay(id)); // best-effort play record
        unawaited(_analytics?.trackEvent(
          AartiEvents.audioStarted,
          properties: {
            AartiEventProps.audioId: id,
            AartiEventProps.audioType: AartiAudioType.aarti,
            AartiEventProps.playbackPositionSeconds:
                _audioPort.currentPosition.inSeconds,
            AartiEventProps.startReason: startReason,
            'source_list_type': _sourceListType,
          },
        ));
      }
    }

    if (isOpen) {
      unawaited(_analytics?.trackEvent(
        AartiEvents.playerPageViewed,
        properties: {
          'audio_id': id,
          'source_list_type': _sourceListType,
          'source_filter': ?_sourceFilter,
        },
      ));
    }

    emit(AartiPlayerReady(
      detail: detail,
      queue: _queue,
      index: _index,
      liked: detail.audio.likedByMe,
      likeCount: detail.audio.likeCount,
      shareCount: detail.audio.shareCount,
    ));
  }

  /// Build a placeholder [AartiDetail] from an active downloaded [AudioItem]
  /// so the full player can render offline. Engagement counts default to 0
  /// and `deity` is null — the real values live only on the server-side
  /// detail. `audioStreamUrl` is set to a non-empty sentinel so the
  /// `isPlayableNow` gate isn't triggered accidentally elsewhere; the
  /// sentinel is never handed to the engine because the downloaded file is
  /// already playing via the shared controller.
  AartiDetail _syntheticDetailFromDownloaded(AudioItem item) {
    return AartiDetail(
      audio: AartiAudio(
        id: item.id,
        title: item.title,
        coverImageUrl: item.artworkUrl ?? '',
        singerName: item.subtitle,
        audioStreamUrl: 'downloaded:${item.id}',
        likeCount: 0,
        shareCount: 0,
        likedByMe: false,
      ),
      deity: null,
    );
  }

  /// Sheet 1 row 59 — `aarti_player_closed`. Fired the moment the bloc is
  /// disposed, which happens when the router pops the player route (screen
  /// dismiss). Reads `playback_position_seconds` + `playback_state` from the
  /// audio port so the event reflects where the user actually was, not a
  /// stale copy from the last state emit. `destination_screen` is null — the
  /// router doesn't hand us the next route from here; a router-level observer
  /// would be the proper source once added.
  @override
  Future<void> close() {
    final current = state;
    if (current is AartiPlayerReady) {
      unawaited(_analytics?.trackEvent(
        AartiEvents.playerClosed,
        properties: {
          AartiEventProps.audioId: current.detail.audio.id,
          AartiEventProps.playbackPositionSeconds:
              _audioPort.currentPosition.inSeconds,
          AartiEventProps.playbackState:
              _audioPort.isPlaying ? 'playing' : 'paused',
        },
      ));
    }
    return super.close();
  }
}
