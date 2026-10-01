// Function-typed ctor params can't use initializing formals.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:flutter/foundation.dart';

import '../../../../core/analytics.dart';
import '../../../../core/shared_analytics.dart';
import '../../../../core/share_service.dart';
import '../../data/status_render_service.dart';
import '../../status_analytics.dart';
import '../data/story_share_launcher.dart';
import 'status_share_event.dart';
import 'status_share_state.dart';

/// Drives the Pro-gated share flow (TAM-72 §5, §6.8, §8). The ONLY Pro gate in
/// the module — entry/browse/filter/edit/save/like/preview are all FREE; only
/// the final Share output gates. Pure Dart state machine, fully unit-testable
/// with fakes (no canvas, no device, no navigator):
///
///   requested → isPro?
///     no  → status_paywall_shown → openPaywall() … refreshEntitlement() → isPro?
///             no  → cancelled (card + Share CTA stay visible; NO render ran)
///             yes → render
///     yes → render
///   render → video? (q2 feasibility)
///     unsupported → clear message, NO share (never ships un-burned media)
///   render → result?
///     success → share sheet (burned-in file) → shared
///     failed  → retry, stays on the card
///
/// #EXPORT_CRITICAL: a free user must NEVER reach the render service. The
/// entitlement check happens BEFORE `_render` is called, and the boundary
/// capture lives inside `_render` — so `render_before_paywall: false` holds by
/// control flow, and the unit tests assert the render service saw zero calls.
class StatusShareBloc extends Bloc<StatusShareEvent, StatusShareState> {
  StatusShareBloc({
    required StatusRenderService renderService,
    required ShareService shareService,
    required bool Function() isPro,
    required Future<void> Function() refreshEntitlement,
    required Future<void> Function() openPaywall,
    Analytics? analytics,
    StoryShareLauncher? storyLauncher,
  })  : _renderService = renderService,
        _shareService = shareService,
        _isPro = isPro,
        _refreshEntitlement = refreshEntitlement,
        _openPaywall = openPaywall,
        _analytics = analytics,
        _storyLauncher = storyLauncher ?? const NoopStoryShareLauncher(),
        super(const StatusShareState()) {
    on<StatusShareRequested>(_onRequested);
    on<StatusShareMessageCleared>(
      (_, emit) => emit(state.copyWith(
        status: StatusShareStatus.idle,
        clearMessage: true,
      )),
    );
  }

  final StatusRenderService _renderService;
  final ShareService _shareService;
  final bool Function() _isPro;
  final Future<void> Function() _refreshEntitlement;
  final Future<void> Function() _openPaywall;
  final Analytics? _analytics;
  final StoryShareLauncher _storyLauncher;

  Future<void> _onRequested(
    StatusShareRequested event,
    Emitter<StatusShareState> emit,
  ) async {
    if (state.isBusy) return; // duplicate Share taps ignored (§6.8)

    unawaited(_analytics?.trackEvent(
      StatusEvents.shareClicked,
      properties: {
        ..._funnelProps(event),
        StatusEventProps.statusId: event.item.id,
        // Read HERE, before the Pro gate below — a free user who goes on to
        // buy fires this event with `false` and the rest of the chain with
        // `true`. That step IS the conversion signal.
        StatusEventProps.isProAtEvent: _isPro(),
        StatusEventProps.mediaType: event.item.mediaType.name,
        StatusEventProps.profileType: event.profile.activeProfileType.name,
      },
    ));

    // ---- The Pro gate. NOTHING renders above this line. --------------------
    // NB: the `paywall_viewed` event is owned by the Paywall module (Sheet 1
    // row 17), not Status — so this bloc no longer fires it. The paywall
    // presentation itself emits it when it actually renders.
    if (!_isPro()) {
      emit(state.copyWith(
        status: StatusShareStatus.awaitingPaywall,
        statusId: event.item.id,
      ));
      try {
        await _openPaywall();
      } catch (_) {
        // Couldn't present the paywall — leave the CTA usable, never render.
      }
      // Re-read the LIVE entitlement after the paywall closes (§5.1).
      await _refreshEntitlement();
      if (!_isPro()) {
        emit(state.copyWith(status: StatusShareStatus.cancelled));
        return;
      }
    }

    await _render(event, emit);
  }

  Future<void> _render(
    StatusShareRequested event,
    Emitter<StatusShareState> emit,
  ) async {
    emit(state.copyWith(
      status: StatusShareStatus.rendering,
      statusId: event.item.id,
      mediaType: event.item.mediaType,
      clearMessage: true,
    ));
    unawaited(_analytics?.trackEvent(
      StatusEvents.exportStarted,
      properties: {
        ..._funnelProps(event),
        StatusEventProps.statusId: event.item.id,
        // Past the gate by construction, but still read live rather than
        // hard-coded `true` — the property must mean "what the entitlement
        // seam said at this instant", never "what this branch implies".
        StatusEventProps.isProAtEvent: _isPro(),
        StatusEventProps.mediaType: event.item.mediaType.name,
        StatusEventProps.profileType: event.profile.activeProfileType.name,
        // TAM-168 — derives from the ACTUAL render decision (was an overlay
        // burned in?), not the pre-TAM-168 `hasActiveDetails` gate. Empty
        // profile → deity-only export → `overlay_used: false`. Photo-only
        // (or name-only, or both) → overlay burned in → `overlay_used: true`.
        StatusEventProps.overlayUsed: event.profile.hasNameOrPhoto,
      },
    ));

    final started = DateTime.now();
    StatusRenderResult result;
    try {
      result = event.item.isVideo
          ? await _renderService.renderVideo(
              item: event.item,
              profile: event.profile,
            )
          : await _renderService.renderImage(
              boundaryKey: event.boundaryKey,
              item: event.item,
              profile: event.profile,
            );
    } catch (_) {
      result = const StatusRenderResult.failed();
    }
    final renderMs = DateTime.now().difference(started).inMilliseconds;

    switch (result.status) {
      case StatusRenderStatus.success:
        unawaited(_analytics?.trackEvent(
          StatusEvents.exportResult,
          properties: {
            ..._funnelProps(event),
            StatusEventProps.statusId: event.item.id,
            StatusEventProps.isProAtEvent: _isPro(),
            StatusEventProps.result: 'success',
            StatusEventProps.renderTimeMs: renderMs,
            StatusEventProps.errorCode: null,
            StatusEventProps.outputSizeBucket:
                event.item.isVideo ? 'video' : 'image',
          },
        ));
        await _shareFile(event, result, emit);

      case StatusRenderStatus.unsupported:
        // q2 fallback: video burn-in isn't available → say so plainly. We do
        // NOT fall back to sharing the source video (spec: unacceptable).
        unawaited(_analytics?.trackEvent(
          StatusEvents.exportResult,
          properties: {
            ..._funnelProps(event),
            StatusEventProps.statusId: event.item.id,
            StatusEventProps.isProAtEvent: _isPro(),
            StatusEventProps.result: 'failure',
            StatusEventProps.renderTimeMs: renderMs,
            StatusEventProps.errorCode: 'render_unsupported',
            StatusEventProps.outputSizeBucket:
                event.item.isVideo ? 'video' : 'image',
          },
        ));
        emit(state.copyWith(
          status: StatusShareStatus.unsupported,
          message: result.message ?? kVideoShareUnsupportedCopy,
        ));

      case StatusRenderStatus.failed:
        unawaited(_analytics?.trackEvent(
          StatusEvents.exportResult,
          properties: {
            ..._funnelProps(event),
            StatusEventProps.statusId: event.item.id,
            StatusEventProps.isProAtEvent: _isPro(),
            StatusEventProps.result: 'failure',
            StatusEventProps.renderTimeMs: renderMs,
            StatusEventProps.errorCode: 'render_failed',
            StatusEventProps.outputSizeBucket:
                event.item.isVideo ? 'video' : 'image',
          },
        ));
        emit(state.copyWith(
          status: StatusShareStatus.failed,
          message: result.message ?? StatusShareState.failedCopy,
        ));
    }
  }

  Future<void> _shareFile(
    StatusShareRequested event,
    StatusRenderResult result,
    Emitter<StatusShareState> emit,
  ) async {
    try {
      // Payload is MEDIA ONLY — no caption text, no share URL. The burned-in
      // overlay already carries the user's branding (name, business, avatar)
      // inside the file itself, so a separate text field would just duplicate
      // what the recipient already sees on the image/video. For Instagram /
      // Facebook Story this also means we can skip the clipboard-hint
      // fallback that used to copy the caption for pasting as a text sticker.
      final mimeType = event.item.isVideo ? 'video/mp4' : 'image/png';

      // For an EXPLICIT story-target tap (WhatsApp / IG / FB / Snap), the
      // user's intent is unambiguous: open THAT app. Silently falling back
      // to the OS chooser when the story path fails is worse UX than a
      // clear error — the user tapped WhatsApp Status, they don't want a
      // generic app picker. So: story targets go through the launcher and
      // fail loudly; only [StoryShareTarget.moreApps] uses the OS chooser
      // (that's what that tile means).
      if (event.target == StoryShareTarget.moreApps) {
        await _shareService.shareRenderedFile(RenderedShareContent(
          file: result.file!,
          text: '',
          mimeType: mimeType,
        ));
      } else {
        final routedToStory = await _storyLauncher.shareTo(
          target: event.target,
          filePath: result.file!.path,
          mimeType: mimeType,
        );
        if (!routedToStory) {
          // The channel reported failure. Kotlin (`StorySharePlugin.kt`)
          // logs the specific reason to `adb logcat -s StorySharePlugin` —
          // most common causes: manifest <queries>/<provider> entries
          // haven't landed on the installed APK (uninstall + reinstall
          // fixes), the target app was uninstalled between the sheet's
          // `installedTargets` check and this tap, or the target app on
          // this device version doesn't accept the intent shape we sent.
          if (kDebugMode) {
            debugPrint('[status:share] story path returned false for '
                '${event.target.name}. See adb logcat -s StorySharePlugin '
                'for the reason.');
          }
          // Sheet 1 row 94 — `status_share_result` with a failure reason.
          // The story launcher can name the target app because the user
          // explicitly picked it in our own sheet; `destination_app` gets
          // the Android package id so analytics matches the aarti shape.
          unawaited(_analytics?.trackEvent(
            StatusEvents.shareResult,
            properties: {
              ..._funnelProps(event),
              StatusEventProps.statusId: event.item.id,
              StatusEventProps.isProAtEvent: _isPro(),
              StatusEventProps.deitySlug: event.item.deitySlug,
              StatusEventProps.result: 'failure',
              StatusEventProps.destinationApp: event.target.androidPackage,
              StatusEventProps.errorCode: 'story_launch_failed',
            },
          ));
          emit(state.copyWith(
            status: StatusShareStatus.failed,
            message: _storyLaunchFailedMessage(event.target),
          ));
          return;
        }
      }
      // TAM-124 unified funnel event alongside the feature-scoped one.
      unawaited(_analytics?.trackEvent(
        SharedAnalyticsEvents.shareInitiated,
        properties: {
          SharedAnalyticsEventProps.sourceScreen: 'status_share',
          SharedAnalyticsEventProps.targetType: 'status',
          SharedAnalyticsEventProps.targetId: event.item.id,
          SharedAnalyticsEventProps.shareTarget: event.target.name,
        },
      ));
      // Sheet 1 row 94 — `status_share_result`. `shareRenderedFile` returns
      // void (no `ShareOutcome`), and the story path doesn't tell us which
      // OEM chose the target either, so this is a "when detectable" success
      // report per the sheet's wording: no throw → success. `destination_app`
      // is the Android package for a story target (user's explicit pick)
      // and null for the OS-chooser branch (moreApps) where we cannot see
      // the choice.
      unawaited(_analytics?.trackEvent(
        StatusEvents.shareResult,
        properties: {
          ..._funnelProps(event),
          StatusEventProps.statusId: event.item.id,
          StatusEventProps.isProAtEvent: _isPro(),
          StatusEventProps.deitySlug: event.item.deitySlug,
          StatusEventProps.result: 'success',
          StatusEventProps.destinationApp:
              event.target == StoryShareTarget.moreApps
                  ? null
                  : event.target.androidPackage,
          StatusEventProps.errorCode: null,
        },
      ));
      emit(state.copyWith(
        status: StatusShareStatus.shared,
        clearMessage: true,
      ));
    } catch (e, st) {
      // No share target / sheet failure → calm error (PRD §6.8). The user
      // sees the calm copy; the underlying cause goes to logcat so we can
      // triage without another round-trip. Reasons we've seen: share_plus
      // rejecting an empty EXTRA_TEXT (fixed in SharePlusShareService by
      // coalescing empty → null), a receiving app throwing on the intent,
      // a stale FileProvider grant on a URI whose backing file was already
      // evicted from cache.
      if (kDebugMode) {
        debugPrint('[status:share] share sheet threw: $e\n$st');
      }
      // Sheet 1 row 94 — `status_share_result` on the catch path. The
      // platform threw before / during the share, so we know it did NOT
      // complete; `destination_app` is null (we never saw a chosen target).
      unawaited(_analytics?.trackEvent(
        StatusEvents.shareResult,
        properties: {
          ..._funnelProps(event),
          StatusEventProps.statusId: event.item.id,
          StatusEventProps.isProAtEvent: _isPro(),
          StatusEventProps.deitySlug: event.item.deitySlug,
          StatusEventProps.result: 'failure',
          StatusEventProps.destinationApp: null,
          StatusEventProps.errorCode: 'share_threw',
        },
      ));
      emit(state.copyWith(
        status: StatusShareStatus.failed,
        message: 'Could not open the share sheet. Please try again.',
      ));
    }
  }

  /// The property every event in a share attempt carries, so the warehouse
  /// can join the six-step funnel per attempt.
  ///
  /// `share_session_id` is the id minted at the Share CTA tap and handed in
  /// on the event — NOT generated here, or the two pre-tile events would
  /// carry a different id from these four and the join would break exactly
  /// where it matters.
  ///
  /// This used to also carry `has_name` / `has_photo` off the profile
  /// snapshot frozen into [StatusShareRequested]. Both are now GLOBAL
  /// properties stamped by `AnalyticsEnricher` on every event in the app, so
  /// passing them here would duplicate the key. The global read is live per
  /// event rather than frozen at tile-tap, which means a user who saves a
  /// name mid-flow now shows the change on the later events of the SAME
  /// attempt — strictly more signal than the frozen pair gave, and the same
  /// contract [StatusEventProps.isProAtEvent] already has.
  static Map<String, Object?> _funnelProps(StatusShareRequested event) => {
        StatusEventProps.shareSessionId: event.shareSessionId,
      };

  /// Per-target error copy for when the direct story intent doesn't launch.
  /// Kept explicit (no generic "share failed") so the message names the exact
  /// app the user tapped and, where relevant, points at the most common
  /// user-fixable cause (out-of-date target app).
  static String _storyLaunchFailedMessage(StoryShareTarget target) {
    switch (target) {
      case StoryShareTarget.whatsapp:
        return "Couldn’t open WhatsApp. Make sure it’s installed and up to date.";
      case StoryShareTarget.instagram:
        return "Couldn’t open Instagram Story. Make sure Instagram is installed and up to date.";
      case StoryShareTarget.facebook:
        return "Couldn’t open Facebook Story. Make sure Facebook is installed and up to date.";
      case StoryShareTarget.snapchat:
        return "Couldn’t open Snapchat. Make sure it’s installed and up to date.";
      case StoryShareTarget.moreApps:
        // Unreachable: moreApps takes the OS-chooser branch, never this path.
        return 'Could not open the share sheet. Please try again.';
    }
  }
}
