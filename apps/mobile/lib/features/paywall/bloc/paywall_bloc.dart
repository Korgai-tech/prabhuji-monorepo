// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../api/generated/openapi.dart';
import '../../../core/analytics.dart';
import '../../../core/session_context.dart';
import '../data/paywall_repository.dart';
import '../paywall_analytics.dart';
import 'paywall_event.dart';
import 'paywall_state.dart';

/// PRD §6.6–6.8 — the paywall screen's bloc.
///
/// Per-screen factory. Owns:
///  - `/paywall/config?locale=…` fetch
///  - plan selection state (defaults to `config.defaultPlanId` or the first
///    plan by sortOrder)
///  - video play/pause state (auto-pauses on backgrounding)
///  - persisted `paywall_impression_count_for_user` (SharedPreferences) — used
///    for Sheet 1 row 17/23 `impression_number`
///  - Paywall Sheet 1 rows 17 (`paywall_viewed`) + 23 (`paywall_closed`)
///
/// Does NOT own Pay Now / payment_result / trial vs subscription — those live
/// in [PaymentBloc]. Video-watch-time (row 25) is fired from the screen, not
/// the bloc: the accumulator sits next to the `PaywallVideoController`.
class PaywallBloc extends Bloc<PaywallEvent, PaywallState> {
  PaywallBloc({
    required PaywallRepository paywallRepository,
    required SharedPreferences preferences,
    Analytics? analytics,
    SessionContext? sessionContext,
  })  : _paywallRepository = paywallRepository,
        _preferences = preferences,
        _analytics = analytics,
        _sessionContext = sessionContext,
        super(const PaywallLoading()) {
    on<ConfigRequested>(_onConfigRequested);
    on<PlanSelected>(_onPlanSelected);
    on<VideoTapped>(_onVideoTapped);
    on<AppBackgrounded>(_onAppBackgrounded);
    on<AppResumed>(_onAppResumed);
    on<RetryRequested>(_onRetry);
    on<CloseTapped>(_onCloseTapped);
  }

  final PaywallRepository _paywallRepository;
  final SharedPreferences _preferences;
  final Analytics? _analytics;
  final SessionContext? _sessionContext;

  /// SharedPreferences key for the per-user impression counter. Bumped on
  /// every ConfigRequested (i.e. every fresh mount of the paywall).
  static const String kImpressionCountKey = 'paywall_impression_count';

  String? _lastRequestedLocale;

  /// Attribution captured from the [ConfigRequested] event. Rides on the
  /// paywall's own funnel events (`paywall_viewed` in `_onConfigRequested`,
  /// `paywall_closed` in `_onCloseTapped`). Cleared by nothing — a
  /// per-mount bloc, so a fresh mount overwrites via the next
  /// `ConfigRequested`.
  String? _entrySource;
  String? _triggerModule;
  String? _triggerAction;

  /// Bug 7 — chat attribution captured only when the paywall was opened
  /// from the chat surface (`_handlePaywallRequired` in `chat_screen.dart`).
  /// Null on non-chat entries; the `paywall_viewed` fire omits the
  /// property in that case so a non-chat opening doesn't look like it
  /// came from an untagged bot in the funnel.
  String? _chatAgentId;
  String? _chatType;

  /// Wall-clock stamp taken the moment PaywallReady is first emitted —
  /// used to compute `time_spent_seconds` on Sheet 1 row 23 `paywall_closed`.
  DateTime? _mountedAt;

  Future<void> _onConfigRequested(
    ConfigRequested event,
    Emitter<PaywallState> emit,
  ) async {
    _lastRequestedLocale = event.locale;
    _entrySource = event.entrySource;
    _triggerModule = event.triggerModule;
    _triggerAction = event.triggerAction;
    _chatAgentId = event.agentId;
    _chatType = event.chatType;
    emit(const PaywallLoading());
    final impressionCount = _bumpImpressionCount();

    try {
      final config = await _paywallRepository.getConfig(locale: event.locale);

      if (config.plans.isEmpty) {
        // The empty-plans redirect fires `paywall_closed` via the widget's
        // BlocListener; nothing to track here — Sheet-1 row 17 requires a
        // usable paywall to have been viewed, and an empty config was not.
        emit(const PaywallEmpty());
        return;
      }

      // Plan order — sortOrder ascending; ties keep source order.
      final orderedPlans = _orderedPlans(config.plans);
      final defaultPlanId = config.defaultPlanId ?? orderedPlans.first.planId;
      final resolvedPlanId = orderedPlans.any((p) => p.planId == defaultPlanId)
          ? defaultPlanId
          : orderedPlans.first.planId;

      // TAM-160 — publish the paywall's identity + version + layout on
      // SessionContext BEFORE firing the first event, so downstream
      // emitters (paywall_bloc events below + payment_bloc events across
      // this session) can attach `paywall_id` / `paywall_version` /
      // `paywall_layout` uniformly.
      _sessionContext?.paywallConfigVersion = config.configVersion;
      _sessionContext?.paywallId = config.paywallId;
      _sessionContext?.paywallLayout = config.layout;

      // Sheet 1 row 17 — `paywall_viewed`. Fires the moment the unified
      // paywall becomes visible (i.e. Ready is emitted for the first time).
      //
      // Attribution (`entry_source`, `trigger_module`, `trigger_action`) is
      // supplied by whichever call site pushed `/paywall` via `PaywallArgs`
      // and threaded in on `ConfigRequested`. Standalone opens (Profile
      // Upgrade, deep link, onboarding) legitimately omit `trigger_module` —
      // we still emit the property (as null) so schemas match across events.
      unawaited(_analytics?.trackEvent(
        PaywallEvents.paywallViewed,
        properties: <String, Object?>{
          PaywallEventProps.paywallId: config.paywallId,
          PaywallEventProps.paywallVersion: config.configVersion,
          PaywallEventProps.paywallLayout: config.layout,
          PaywallEventProps.impressionNumber: impressionCount,
          PaywallEventProps.entrySource: _entrySource,
          PaywallEventProps.triggerModule: _triggerModule,
          PaywallEventProps.triggerAction: _triggerAction,
          // Bug 7 — attribute chat-triggered paywall views to a bot +
          // bucket so the funnel can compare per-bot conversion. Both
          // props are OMITTED (not empty-string) on non-chat entries so
          // a Profile-Upgrade paywall doesn't look like it came from a
          // ghost bot in the warehouse.
          if (_chatAgentId != null && _chatAgentId!.isNotEmpty)
            'agent_id': _chatAgentId,
          if (_chatType != null && _chatType!.isNotEmpty)
            'chat_type': _chatType,
        },
      ));

      // Sheet 1 row 24 — `paywall_video_started` fires once, on autoplay
      // start. The screen fires additional user-triggered starts via its own
      // observer; this one covers the initial `auto_play` case that happens
      // before the widget has a chance to attach.
      unawaited(_analytics?.trackEvent(
        PaywallEvents.paywallVideoStarted,
        properties: {
          PaywallEventProps.videoId: config.videoId,
          PaywallEventProps.startType: PaywallEventProps.startTypeAutoPlay,
          PaywallEventProps.paywallId: config.paywallId,
          PaywallEventProps.paywallVersion: config.configVersion,
          PaywallEventProps.paywallLayout: config.layout,
        },
      ));

      // Sheet 1 row 23 `paywall_closed.time_spent_seconds` is measured from
      // the moment Ready is first emitted (first paint the user actually
      // sees).
      _mountedAt = DateTime.now();

      emit(PaywallReady(
        config: config,
        selectedPlanId: resolvedPlanId,
        // Autoplay is deliberate per §6.6. The widget owns the actual
        // PaywallVideoController lifecycle; the bloc just tracks the flag.
        isPlaying: true,
        impressionCount: impressionCount,
      ));
    } catch (error) {
      emit(PaywallError(error.toString()));
    }
  }

  void _onPlanSelected(PlanSelected event, Emitter<PaywallState> emit) {
    final current = state;
    if (current is! PaywallReady) return;
    if (current.selectedPlanId == event.planId) return;

    final plan = current.config.plans
        .where((p) => p.planId == event.planId)
        .cast<PaywallPlanDisplay?>()
        .firstWhere((_) => true, orElse: () => null);
    if (plan == null) return;

    // Plan-tab selection is NOT on Sheet 1 rows 17–26. No event fires; the
    // downstream Pay Now tap carries the resolved plan id.

    emit(current.copyWith(selectedPlanId: event.planId));
  }

  void _onVideoTapped(VideoTapped event, Emitter<PaywallState> emit) {
    final current = state;
    if (current is! PaywallReady) return;
    final next = !current.isPlaying;

    // Sheet 1 row 24 — `paywall_video_started` fires on user-initiated
    // playback (auto_play is fired once on mount in _onConfigRequested).
    if (next) {
      unawaited(_analytics?.trackEvent(
        PaywallEvents.paywallVideoStarted,
        properties: {
          PaywallEventProps.videoId: current.config.videoId,
          PaywallEventProps.startType: PaywallEventProps.startTypeUserPlay,
          PaywallEventProps.paywallId: current.config.paywallId,
          PaywallEventProps.paywallVersion: current.config.configVersion,
          PaywallEventProps.paywallLayout: current.config.layout,
        },
      ));
    }
    // A pause via tap has no Sheet-1 row; watch-time is fired from the
    // screen's dispose accumulator (row 25).

    emit(current.copyWith(isPlaying: next));
  }

  void _onAppBackgrounded(AppBackgrounded event, Emitter<PaywallState> emit) {
    final current = state;
    if (current is! PaywallReady) return;
    if (!current.isPlaying) return;

    // No Sheet-1 event for a background pause — the watch-time accumulator
    // in the screen captures the elapsed play time.

    emit(current.copyWith(isPlaying: false));
  }

  void _onAppResumed(AppResumed event, Emitter<PaywallState> emit) {
    // Do not auto-resume: PRD §6.6 says the video pauses on background; the
    // user should decide whether to tap to resume.
  }

  Future<void> _onRetry(RetryRequested event, Emitter<PaywallState> emit) async {
    final locale = _lastRequestedLocale;
    if (locale == null) return;
    // Preserve the attribution captured on the original mount — a retry is
    // still the same user reach at the same paywall from the same source.
    await _onConfigRequested(
      ConfigRequested(
        locale,
        triggerModule: _triggerModule,
        triggerAction: _triggerAction,
        entrySource: _entrySource,
        agentId: _chatAgentId,
        chatType: _chatType,
      ),
      emit,
    );
  }

  /// Sheet 1 row 23 `paywall_closed`. The widget owns navigation; this
  /// handler's sole job is to fire the analytics event with a payload derived
  /// from the current state and the caller-supplied `closeMethod` / trigger.
  ///
  /// Fires ONLY when the user actually saw the paywall (state ever reached
  /// `PaywallReady`, tracked via `_mountedAt`). An empty-plans redirect or
  /// a load-error abort is NOT a "close" — the user never got to see a
  /// paywall to close.
  void _onCloseTapped(CloseTapped event, Emitter<PaywallState> emit) {
    final mountedAt = _mountedAt;
    if (mountedAt == null) return;

    final current = state;
    final diff = DateTime.now().difference(mountedAt).inSeconds;
    final timeSpentSeconds = diff < 0 ? 0 : diff;

    int? impressionCount = event.paywallImpressionCountForUser;
    if (current is PaywallReady) {
      impressionCount = current.impressionCount;
    }

    unawaited(_analytics?.trackEvent(
      PaywallEvents.paywallClosed,
      properties: {
        PaywallEventProps.closeMethod: _wireCloseMethod(event.trigger),
        PaywallEventProps.timeSpentSeconds: timeSpentSeconds,
        PaywallEventProps.impressionNumber: ?impressionCount,
        PaywallEventProps.entrySource: _entrySource,
        PaywallEventProps.triggerModule: _triggerModule,
        PaywallEventProps.triggerAction: _triggerAction,
        // TAM-160 — variant identity. Read from SessionContext so a
        // `paywall_closed` fired after the widget rebuilt still carries
        // the identity of the paywall the user saw.
        PaywallEventProps.paywallId: _sessionContext?.paywallId,
        PaywallEventProps.paywallVersion:
            _sessionContext?.paywallConfigVersion,
        PaywallEventProps.paywallLayout: _sessionContext?.paywallLayout,
      },
    ));
    // No state emission — the widget handles navigation via context.go.
  }

  /// Maps the caller-supplied [CloseTapped.trigger] onto Sheet-1 row 23's
  /// `close_method` closed vocabulary. The X icon is the ONLY user-close in
  /// the current UI; system-driven closes get `close_method: system`.
  static String _wireCloseMethod(String trigger) {
    return switch (trigger) {
      'user_close' => PaywallEventProps.closeMethodCloseIcon,
      'back' => PaywallEventProps.closeMethodBack,
      'swipe' => PaywallEventProps.closeMethodSwipe,
      _ => PaywallEventProps.closeMethodSystem,
    };
  }

  /// Sheet 1 row 25 — `paywall_video_watch_time`. Called by the paywall
  /// screen's dispose accumulator with the total wall-clock milliseconds the
  /// hero video was actually playing across all playing→paused transitions
  /// (background, tap, close). Fires at most once per mount; a zero total
  /// (video never played, or was already paused for the whole session) skips
  /// the event — the row is about engagement, and 0 ms is noise.
  ///
  /// Deliberately a plain method rather than a `PaywallEvent`: the caller
  /// (widget `dispose()`) can't safely `.add()` to a bloc that may already be
  /// mid-close, and firing an unawaited analytics call has no state
  /// side-effect.
  void trackVideoWatchTime({required int watchTimeMs, String? videoId}) {
    if (watchTimeMs <= 0) return;
    unawaited(_analytics?.trackEvent(
      PaywallEvents.paywallVideoWatchTime,
      properties: {
        PaywallEventProps.watchTimeMs: watchTimeMs,
        PaywallEventProps.videoId: ?videoId,
        // TAM-160 — fires on dispose, so the widget's already-torn-down
        // config is no longer readable. Values threaded via SessionContext,
        // populated in `_onConfigRequested` alongside `paywallConfigVersion`.
        PaywallEventProps.paywallId: _sessionContext?.paywallId,
        PaywallEventProps.paywallVersion:
            _sessionContext?.paywallConfigVersion,
        PaywallEventProps.paywallLayout: _sessionContext?.paywallLayout,
      },
    ));
  }

  /// Sheet 1 row 26 — `paywall_video_failed`. Called by the paywall screen
  /// when the `PaywallVideoController` cannot initialize the source (bad URL,
  /// network failure, unsupported codec). Separate from the auto-fired
  /// `paywall_video_started` (row 24) so reliability dashboards can filter
  /// video-init failures without walking every start row.
  void trackVideoFailed({String? videoId, String? errorCode}) {
    unawaited(_analytics?.trackEvent(
      PaywallEvents.paywallVideoFailed,
      properties: {
        PaywallEventProps.videoId: ?videoId,
        PaywallEventProps.errorCode: ?errorCode,
        // TAM-160 — variant identity, from SessionContext.
        PaywallEventProps.paywallId: _sessionContext?.paywallId,
        PaywallEventProps.paywallVersion:
            _sessionContext?.paywallConfigVersion,
        PaywallEventProps.paywallLayout: _sessionContext?.paywallLayout,
      },
    ));
  }

  /// Selects and updates the per-user impression counter used in the
  /// `impression_number` payload. Best-effort — a SharedPreferences failure
  /// silently returns the previously-known count.
  int _bumpImpressionCount() {
    try {
      final current = _preferences.getInt(kImpressionCountKey) ?? 0;
      final next = current + 1;
      unawaited(_preferences.setInt(kImpressionCountKey, next));
      return next;
    } catch (_) {
      return _preferences.getInt(kImpressionCountKey) ?? 1;
    }
  }

  static List<PaywallPlanDisplay> _orderedPlans(
      List<PaywallPlanDisplay> plans) {
    final copy = List<PaywallPlanDisplay>.of(plans);
    copy.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return copy;
  }
}
