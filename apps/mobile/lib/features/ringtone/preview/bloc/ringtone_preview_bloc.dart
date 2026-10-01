// Explicit named params (some are functions) — see PaywallBloc note.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../../../core/deep_link_parser.dart';
import '../../../../core/shared_analytics.dart';
import '../../../../core/share_service.dart';
import '../../../../core/share_url_builder.dart';
import '../../data/ringtone_models.dart';
import '../../data/ringtone_repository.dart';
import '../../ringtone_analytics.dart';
import '../../ringtone_routes.dart';
import 'ringtone_preview_audio_port.dart';
import 'ringtone_preview_event.dart';
import 'ringtone_preview_state.dart';

/// Ringtone Preview bloc (TAM-68 — Figma 683:4775). Pro-only: reached only from
/// a Pro card tap or a post-purchase continuation. Owns detail load, preview-mode
/// playback (single clip, no background, one at a time), like (optimistic),
/// native share (deep link + image, never the audio file), and play-count
/// threshold reporting. The transport is the shared TAM-59 engine via
/// [RingtonePreviewAudioPort]; the screen forwards engine completion/error.
///
/// ## Analytics wire (Sheet 1 rows 116–122, 126)
///
///  * Row 116 `ringtone_player_page_viewed` — fires from `_loadAndPlay` after
///    detail loads with `previous_screen`.
///  * Row 117 `ringtone_play_started` — fires from `_loadAndPlay` on auto-play
///    with `playback_position_seconds` + `start_reason: auto_play`.
///  * Row 119 `ringtone_play_completed` — fires from `_onCompleted` with
///    `duration_seconds`.
///  * Row 120 `ringtone_like_changed` — single event; `action: like | unlike`.
///  * Row 121 `ringtone_share_clicked` + row 122 `ringtone_share_result` — the
///    share flow captures `ShareService.share()`'s `ShareOutcome` and fires
///    the result event AFTER the sheet closes, tri-state (`success` /
///    `failure` / `cancelled`) with `destination_app` + `error_code`
///    (Aarti pattern).
///  * Row 126 `ringtone_playback_failed` — fires from `_onAudioErrored` with
///    `failure_stage: playback` + `error_code`.
class RingtonePreviewBloc
    extends Bloc<RingtonePreviewEvent, RingtonePreviewState> {
  RingtonePreviewBloc({
    required RingtoneRepository repository,
    required RingtonePreviewAudioPort audioPort,
    required ShareService shareService,
    Analytics? analytics,
  })  : _repository = repository,
        _audioPort = audioPort,
        _shareService = shareService,
        _analytics = analytics,
        super(const RingtonePreviewLoading()) {
    on<RingtonePreviewOpened>(_onOpened);
    on<RingtonePreviewLikeToggled>(_onLikeToggled);
    on<RingtonePreviewShareRequested>(_onShareRequested);
    on<RingtonePreviewPlayThresholdReached>(_onThreshold);
    on<RingtonePreviewPlayCompleted>(_onCompleted);
    on<RingtonePreviewAudioErrored>(_onAudioErrored);
    on<RingtonePreviewSetCountUpdated>(_onSetCountUpdated);
    on<RingtonePreviewRetryRequested>(_onRetry);
  }

  final RingtoneRepository _repository;
  final RingtonePreviewAudioPort _audioPort;
  final ShareService _shareService;
  final Analytics? _analytics;

  static const String _audioErrorCopy = "Couldn't play this ringtone.";

  RingtonePreviewArgs? _args;
  String _sessionToken = '';
  bool _playCounted = false;

  String get _id => _args?.ringtoneId ?? '';

  Future<void> _onOpened(
    RingtonePreviewOpened event,
    Emitter<RingtonePreviewState> emit,
  ) async {
    _args = event.args;
    await _loadAndPlay(emit, autoPlay: event.args.autoPlay);
  }

  Future<void> _onRetry(
    RingtonePreviewRetryRequested event,
    Emitter<RingtonePreviewState> emit,
  ) =>
      _loadAndPlay(emit, autoPlay: true);

  Future<void> _loadAndPlay(
    Emitter<RingtonePreviewState> emit, {
    required bool autoPlay,
  }) async {
    emit(const RingtonePreviewLoading());
    final id = _id;
    if (id.isEmpty) {
      emit(const RingtonePreviewErrorState(_audioErrorCopy));
      return;
    }

    late final RingtoneDetailData detail;
    try {
      detail = await _repository.fetchDetail(id);
    } catch (_) {
      emit(const RingtonePreviewErrorState("Couldn't load ringtones."));
      return;
    }

    // Server-URL gate: never play without a server-provided (Pro-gated) URL.
    if (!detail.isPlayableNow) {
      emit(RingtonePreviewGatedRestore(id));
      return;
    }

    emit(RingtonePreviewReady(
      detail: detail,
      liked: detail.likedByMe,
      likeCount: detail.likeCount,
      shareCount: detail.shareCount,
      setCount: detail.setCount,
      playCount: detail.playCount,
    ));

    // Row 116 — `ringtone_player_page_viewed`.
    unawaited(_analytics?.trackEvent(
      RingtoneEvents.playerPageViewed,
      properties: {
        RingtoneEventProps.ringtoneId: id,
        RingtoneEventProps.previousScreen: _args?.entrySource,
      },
    ));

    if (autoPlay) {
      _sessionToken =
          '$id-${DateTime.now().microsecondsSinceEpoch}';
      _playCounted = false;
      try {
        await _audioPort.play(detail.toAudioItem());
      } catch (_) {
        _emitAudioError(emit);
        return;
      }
      // Row 117 — `ringtone_play_started`.
      unawaited(_analytics?.trackEvent(
        RingtoneEvents.playStarted,
        properties: {
          RingtoneEventProps.ringtoneId: id,
          RingtoneEventProps.playbackPositionSeconds: 0,
          RingtoneEventProps.startReason:
              RingtoneEventProps.startReasonAutoPlay,
        },
      ));
    }
  }

  Future<void> _onLikeToggled(
    RingtonePreviewLikeToggled event,
    Emitter<RingtonePreviewState> emit,
  ) async {
    final current = state;
    if (current is! RingtonePreviewReady) return;
    final nextLiked = !current.liked;
    final nextCount =
        nextLiked ? current.likeCount + 1 : (current.likeCount - 1).clamp(0, 1 << 31);
    // Optimistic: flip immediately.
    emit(current.copyWith(liked: nextLiked, likeCount: nextCount));
    // Row 120 — single `ringtone_like_changed` with `action: like | unlike`.
    unawaited(_analytics?.trackEvent(
      RingtoneEvents.likeChanged,
      properties: {
        RingtoneEventProps.ringtoneId: _id,
        RingtoneEventProps.action: nextLiked
            ? RingtoneEventProps.actionLike
            : RingtoneEventProps.actionUnlike,
      },
    ));
    try {
      final outcome = await _repository.toggleLike(_id);
      final now = state;
      if (now is RingtonePreviewReady && now.detail.id == current.detail.id) {
        emit(now.copyWith(liked: outcome.liked, likeCount: outcome.likeCount));
      }
    } catch (_) {
      // Revert on failure — restore the prior like state.
      final now = state;
      if (now is RingtonePreviewReady && now.detail.id == current.detail.id) {
        emit(now.copyWith(liked: current.liked, likeCount: current.likeCount));
      }
    }
  }

  Future<void> _onShareRequested(
    RingtonePreviewShareRequested event,
    Emitter<RingtonePreviewState> emit,
  ) async {
    final current = state;
    if (current is! RingtonePreviewReady) return;
    final detail = current.detail;
    // Row 121 — `ringtone_share_clicked`.
    unawaited(_analytics?.trackEvent(
      RingtoneEvents.shareClicked,
      properties: {RingtoneEventProps.ringtoneId: detail.id},
    ));
    // Audio pauses on share-open (§6 — no playback behind the share sheet).
    try {
      await _audioPort.pause();
    } catch (_) {
      // pause best-effort — never block the share.
    }
    // Payload = deep link + title + preview image, NEVER the raw audio file
    // (share_plus enforces this by the ShareContent shape).
    // Share URL uses TAM-124's canonical HTTPS App Link so recipients
    // without the app land on Play Store via the krutyug.ai landing page.
    final deepLink = buildShareUrl(RingtoneDeepLink(id: detail.id));
    // TAM-124 unified share event — kept for cross-feature aggregation
    // (the funnel dashboard reads `share_initiated` across all modules).
    unawaited(_analytics?.trackEvent(SharedAnalyticsEvents.shareInitiated,
        properties: {
          SharedAnalyticsEventProps.sourceScreen: 'ringtone_preview',
          SharedAnalyticsEventProps.targetType: 'ringtone',
          SharedAnalyticsEventProps.targetId: detail.id,
        }));
    ShareOutcome? outcome;
    try {
      outcome = await _shareService.share(ShareContent(
        text: 'Prabhuji पर ${detail.title} ringtone lagayein',
        deepLink: deepLink,
        thumbnailUrl: detail.heroImageUrl,
      ));
    } catch (_) {
      // Share threw — treated as a `failure` share result below.
    }

    if (outcome == null) {
      // Row 122 — `ringtone_share_result` (failure branch).
      unawaited(_analytics?.trackEvent(
        RingtoneEvents.shareResult,
        properties: {
          RingtoneEventProps.ringtoneId: detail.id,
          RingtoneEventProps.result: RingtoneEventProps.resultFailure,
          RingtoneEventProps.destinationApp: null,
          RingtoneEventProps.errorCode: 'share_sheet_failed',
        },
      ));
      return;
    }

    // Optimistic share count + server increment (best-effort). Only counts on a
    // no-throw share sheet — cancellations still bump; the sheet documented
    // this as an accepted limitation of native ShareOutcome.
    emit(current.copyWith(shareCount: current.shareCount + 1));
    // Row 122 — `ringtone_share_result` (success branch). Destination is
    // Android-only (`com.whatsapp/...` or similar); iOS + a null result mean
    // the platform didn't report it.
    unawaited(_analytics?.trackEvent(
      RingtoneEvents.shareResult,
      properties: {
        RingtoneEventProps.ringtoneId: detail.id,
        RingtoneEventProps.result: RingtoneEventProps.resultSuccess,
        RingtoneEventProps.destinationApp: outcome.destination,
        RingtoneEventProps.errorCode: null,
      },
    ));
    try {
      final serverCount = await _repository.incrementShareCount(detail.id);
      final now = state;
      if (now is RingtonePreviewReady && now.detail.id == detail.id) {
        emit(now.copyWith(shareCount: serverCount));
      }
    } catch (_) {
      // keep the optimistic count
    }
  }

  Future<void> _onThreshold(
    RingtonePreviewPlayThresholdReached event,
    Emitter<RingtonePreviewState> emit,
  ) async {
    final current = state;
    if (current is! RingtonePreviewReady) return;
    if (_playCounted) return; // report once per session
    _playCounted = true; // guard against duplicate reports mid-flight
    try {
      final outcome = await _repository.reportPlayCount(
        _id,
        sessionToken: _sessionToken,
        playbackPositionSeconds: event.positionSeconds,
      );
      if (outcome.counted) {
        final now = state;
        if (now is RingtonePreviewReady && now.detail.id == current.detail.id) {
          emit(now.copyWith(playCount: outcome.playCount));
        }
      } else {
        _playCounted = false; // server rejected — allow a later re-report
      }
    } catch (_) {
      _playCounted = false; // transient failure — allow a retry
    }
    // NOTE: no `play_counted` analytics — the sheet has no matching row; the
    // repo-side play count is a server-authoritative metric read separately.
  }

  void _onCompleted(
    RingtonePreviewPlayCompleted event,
    Emitter<RingtonePreviewState> emit,
  ) {
    // Row 119 — `ringtone_play_completed`. `duration_seconds` would need to
    // come from the audio engine's `duration` (the screen already listens to
    // `AudioPlaybackState.duration` — we don't route it through here today);
    // keep it null until we plumb it. The event still resolves the funnel.
    unawaited(_analytics?.trackEvent(
      RingtoneEvents.playCompleted,
      properties: {
        RingtoneEventProps.ringtoneId: _id,
        RingtoneEventProps.durationSeconds: null,
      },
    ));
  }

  void _onAudioErrored(
    RingtonePreviewAudioErrored event,
    Emitter<RingtonePreviewState> emit,
  ) {
    // Row 126 — `ringtone_playback_failed`.
    unawaited(_analytics?.trackEvent(
      RingtoneEvents.playbackFailed,
      properties: {
        RingtoneEventProps.ringtoneId: _id,
        RingtoneEventProps.failureStage:
            RingtoneEventProps.failureStagePlayback,
        RingtoneEventProps.errorCode: 'playback_failed',
      },
    ));
    _emitAudioError(emit);
  }

  void _onSetCountUpdated(
    RingtonePreviewSetCountUpdated event,
    Emitter<RingtonePreviewState> emit,
  ) {
    final current = state;
    if (current is! RingtonePreviewReady) return;
    emit(current.copyWith(setCount: event.setCount));
  }

  void _emitAudioError(Emitter<RingtonePreviewState> emit) =>
      emit(const RingtonePreviewErrorState(_audioErrorCopy));
}
