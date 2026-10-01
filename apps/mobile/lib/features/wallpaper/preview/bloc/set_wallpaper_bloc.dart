// Function-typed constructor params can't use initializing formals.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../data/set_wallpaper_service.dart';
import '../../data/wallpaper_models.dart';
import '../../data/wallpaper_repository.dart';
import '../../wallpaper_analytics.dart';
import 'set_wallpaper_event.dart';
import 'set_wallpaper_state.dart';

/// Drives the Pro-gated native set flow (TAM-70 §5, §6.6, §6.12). The ONLY
/// Pro gate in the module lives here — discovery/preview/swipe/like/share are
/// all free; only the Set action opens the paywall. Pure Dart state machine,
/// fully unit-testable with fakes (no Android device, no navigator):
///
///   requested → isPro?
///     no  → paywall_shown → openPaywall() … refreshEntitlement() → isPro?
///             no  → cancelled (preview + Set CTA stay visible)
///             yes → paywall_purchase_success → set
///     yes → set
///   set → native result?
///     success     → increment set count (POST /count {set}) → set_success
///     failed      → set_failed (retry, NO count increment)
///     unsupported → exact PRD message + unsupported_device_action_shown (NO increment)
///
/// [openPaywall] is awaited until the paywall route is dismissed; entitlement is
/// then re-read LIVE (never a cached flag) to decide resume-vs-cancel (§5.1).
class SetWallpaperBloc extends Bloc<SetWallpaperEvent, SetWallpaperState> {
  SetWallpaperBloc({
    required SetWallpaperService service,
    required WallpaperRepository repository,
    required bool Function() isPro,
    required Future<void> Function() refreshEntitlement,
    required Future<void> Function() openPaywall,
    Analytics? analytics,
  })  : _service = service,
        _repository = repository,
        _isPro = isPro,
        _refreshEntitlement = refreshEntitlement,
        _openPaywall = openPaywall,
        _analytics = analytics,
        super(const SetWallpaperState()) {
    on<SetWallpaperRequested>(_onRequested);
  }

  final SetWallpaperService _service;
  final WallpaperRepository _repository;
  final bool Function() _isPro;
  final Future<void> Function() _refreshEntitlement;
  final Future<void> Function() _openPaywall;
  final Analytics? _analytics;

  Future<void> _onRequested(
    SetWallpaperRequested event,
    Emitter<SetWallpaperState> emit,
  ) async {
    if (state.isBusy) return; // guard duplicate taps during set/render (§7)

    // Note: the SET-tap events (Sheet 1 row 137 `set_wallpaper_clicked` /
    // row 138 `set_lockscreen_clicked`) fire from the preview screen's
    // button handlers, NOT here — the sheet splits them by target and
    // firing at the tap site keeps the mapping obvious.
    //
    // Paywall events (`paywall_viewed`, `payment_result`, etc.) belong to
    // the Paywall module (Sheet 1 rows 17–26) and are NOT emitted from the
    // wallpaper set flow. The Paywall module owns its own funnel.

    // Pro gate — the ONLY gate in the module.
    if (!_isPro()) {
      emit(const SetWallpaperState(status: SetWallpaperStatus.awaitingPaywall));
      try {
        await _openPaywall();
      } catch (_) {
        // Couldn't present the paywall — leave the CTA usable, no native call.
      }
      // Re-read the LIVE entitlement after the paywall closes.
      await _refreshEntitlement();
      if (!_isPro()) {
        // Sheet 1 row 139 — `set_wallpaper_result` with `result: cancelled`
        // (user dismissed the paywall). NO count increment. Keeps the set
        // funnel resolving for every attempt, not only the happy path.
        unawaited(_analytics?.trackEvent(
          WallpaperEvents.setWallpaperResult,
          properties: {
            WallpaperEventProps.wallpaperId: event.wallpaperId,
            WallpaperEventProps.deitySlug: event.deitySlug,
            WallpaperEventProps.mediaType: event.mediaType.name,
            WallpaperEventProps.setTarget: _wireTarget(event.target),
            WallpaperEventProps.result: WallpaperEventProps.resultCancelled,
            WallpaperEventProps.errorCode: null,
          },
        ));
        // Cancelled — keep the preview + Set CTA visible (§5.1). No native call.
        emit(const SetWallpaperState(status: SetWallpaperStatus.cancelled));
        return;
      }
    }

    await _performSet(emit, event);
  }

  Future<void> _performSet(
    Emitter<SetWallpaperState> emit,
    SetWallpaperRequested event,
  ) async {
    emit(SetWallpaperState(
      status: SetWallpaperStatus.setting,
      wallpaperId: event.wallpaperId,
      target: event.target,
    ));

    WallpaperSetResult result;
    try {
      result = event.mediaType.isLive
          ? await _service.setLiveWallpaper(
              frameImageUrl: event.liveFrameUrl ?? event.imageUrl,
              packageName: event.livePackage,
            )
          : await _service.setStaticWallpaper(
              imageUrl: event.imageUrl,
              target: event.target,
            );
    } catch (_) {
      result = WallpaperSetResult.failed;
    }

    switch (result) {
      case WallpaperSetResult.success:
        // Increment the server set count ONLY after a confirmed success
        // (best-effort; the on-device set already succeeded — §6.11, §7).
        int? setCount;
        try {
          setCount = await _repository.incrementCount(
            event.wallpaperId,
            WallpaperCountType.set,
          );
        } catch (_) {
          setCount = null;
        }
        // Sheet 1 row 139 — `set_wallpaper_result` with `result: success`.
        unawaited(_analytics?.trackEvent(
          WallpaperEvents.setWallpaperResult,
          properties: {
            WallpaperEventProps.wallpaperId: event.wallpaperId,
            WallpaperEventProps.deitySlug: event.deitySlug,
            WallpaperEventProps.mediaType: event.mediaType.name,
            WallpaperEventProps.setTarget: _wireTarget(event.target),
            WallpaperEventProps.result: WallpaperEventProps.resultSuccess,
            WallpaperEventProps.errorCode: null,
          },
        ));
        emit(SetWallpaperState(
          status: SetWallpaperStatus.success,
          setCount: setCount,
          wallpaperId: event.wallpaperId,
          target: event.target,
        ));
      case WallpaperSetResult.unsupported:
        // Exact PRD copy; NO count increment (§6.12).
        // Sheet 1 row 139 — `set_wallpaper_result` with a synthetic
        // `unsupported` result value so the funnel resolves; AND Sheet 1
        // row 140 — `wallpaper_unsupported_action_viewed` for the
        // compatibility guardrail (a distinct event so QA/analysts can
        // filter compat issues without walking every set-result row).
        unawaited(_analytics?.trackEvent(
          WallpaperEvents.setWallpaperResult,
          properties: {
            WallpaperEventProps.wallpaperId: event.wallpaperId,
            WallpaperEventProps.deitySlug: event.deitySlug,
            WallpaperEventProps.mediaType: event.mediaType.name,
            WallpaperEventProps.setTarget: _wireTarget(event.target),
            WallpaperEventProps.result: WallpaperEventProps.resultUnsupported,
            WallpaperEventProps.errorCode: 'unsupported',
          },
        ));
        unawaited(_analytics?.trackEvent(
          WallpaperEvents.unsupportedActionViewed,
          properties: {
            WallpaperEventProps.wallpaperId: event.wallpaperId,
            WallpaperEventProps.mediaType: event.mediaType.name,
            WallpaperEventProps.setTarget: _wireTarget(event.target),
          },
        ));
        emit(const SetWallpaperState(
          status: SetWallpaperStatus.unsupported,
          message: SetWallpaperState.unsupportedCopy,
        ));
      case WallpaperSetResult.failed:
        // Retry offered; NO count increment (§7).
        // Sheet 1 row 139 — `set_wallpaper_result` with `result: failure`.
        unawaited(_analytics?.trackEvent(
          WallpaperEvents.setWallpaperResult,
          properties: {
            WallpaperEventProps.wallpaperId: event.wallpaperId,
            WallpaperEventProps.deitySlug: event.deitySlug,
            WallpaperEventProps.mediaType: event.mediaType.name,
            WallpaperEventProps.setTarget: _wireTarget(event.target),
            WallpaperEventProps.result: WallpaperEventProps.resultFailure,
            WallpaperEventProps.errorCode: 'set_failed',
          },
        ));
        emit(const SetWallpaperState(
          status: SetWallpaperStatus.failed,
          message: SetWallpaperState.failedCopy,
        ));
    }
  }

  /// Map the internal [WallpaperTarget] enum onto Sheet-1's `set_target` wire
  /// values (`home_screen`, `lock_screen`; `both` reports as `home_screen`
  /// since Phase 1 doesn't ship the both-in-one native path from analytics'
  /// perspective — the sheet only defines the two).
  static String _wireTarget(WallpaperTarget target) => switch (target) {
        WallpaperTarget.home => WallpaperEventProps.setTargetHomeScreen,
        WallpaperTarget.lock => WallpaperEventProps.setTargetLockScreen,
        WallpaperTarget.both => WallpaperEventProps.setTargetHomeScreen,
      };
}
