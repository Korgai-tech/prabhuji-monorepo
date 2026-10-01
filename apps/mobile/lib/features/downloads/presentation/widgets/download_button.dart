import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/entitlement.dart';
import '../../../../core/paywall_gate.dart';
import '../../../../core/theme.dart';
import '../../../../core/user_properties.dart';
import '../../../../state/providers.dart';
import '../../../paywall/paywall_analytics.dart';
import '../../../paywall/presentation/paywall_screen.dart';
import '../../data/download_manager.dart';
import '../../domain/content_type.dart';
import '../../domain/download_state.dart';
import '../../downloads_analytics.dart';
import '../../downloads_providers.dart';
import 'download_ring.dart';

/// Play-page Download Button (Figma component `2632:21949`, wired into the
/// Aarti player at `2649:22834` and the Mantra player at `2649:22850`).
///
/// Three states — Download / Downloading / Downloaded — cycled off the
/// `DownloadManager` state stream. Label is ALWAYS "Download" per Figma.
/// Ring tap while downloading = cancel. Downloaded tap = long-press
/// (or ⋮) → play-page action sheet (`2632:21797`).
/// Two presentations of the play-page Download control:
/// * [DownloadButtonVariant.iconOnly] — a 44×44 icon-only button (used by the
///   list rows / floating players that only have room for a glyph).
/// * [DownloadButtonVariant.iconWithLabel] — Column of glyph + "Download"
///   label matching the aarti/mantra player's engagement row (Heart /
///   Download / Shares in Figma `2632:21211` and `2632:21299`).
enum DownloadButtonVariant { iconOnly, iconWithLabel }

class DownloadButton extends ConsumerStatefulWidget {
  const DownloadButton({
    super.key,
    required this.contentId,
    required this.contentType,
    required this.title,
    required this.sourceScreen,
    this.subtitle,
    this.artworkUrl,
    this.sourceUrl,
    this.variant = DownloadButtonVariant.iconOnly,
    this.labelStyle,
    this.glyphSize = 20,
  });

  final String contentId;
  final DownloadContentType contentType;
  final String title;
  final String? subtitle;
  final String? artworkUrl;

  /// Direct audio URL bypass — when non-null and non-empty, the manager will
  /// download this URL directly instead of calling the manifest endpoint.
  /// Used by the play-page buttons that already have the Pro-gated
  /// `audioStreamUrl` (aarti/mantra players) — see #PATH_DECISION on
  /// stage-unblock; the server-side `GET /content/:type/:id/download`
  /// manifest path still works when this is null.
  final String? sourceUrl;

  /// Analytics `source_screen` — e.g. `'aarti_player'`, `'mantra_player'`.
  final String sourceScreen;

  /// Which visual layout to render.
  final DownloadButtonVariant variant;

  /// Only used when [variant] is [DownloadButtonVariant.iconWithLabel].
  final TextStyle? labelStyle;

  /// Glyph render size (default 20dp — matches engagement-row icons).
  final double glyphSize;

  @override
  ConsumerState<DownloadButton> createState() => _DownloadButtonState();
}

class _DownloadButtonState extends ConsumerState<DownloadButton> {
  StreamSubscription<DownloadManagerSnapshot>? _sub;
  DownloadState? _state;
  bool _providersReady = true;

  @override
  void initState() {
    super.initState();
    // Downloads module has its own provider chain (encrypted store, Dio via
    // service_locator, analytics fan-out). In prod every one of those is
    // wired at app bootstrap; in narrower widget tests (aarti/mantras player
    // harnesses that don't build the downloads scope) the read throws. Guard
    // so the button still renders as an idle Download control — taps become
    // no-ops until the module is available.
    try {
      final manager = ref.read(downloadManagerProvider);
      _state = manager.snapshot.states[widget.contentId];
      _sub = manager.snapshots.listen((snap) {
        if (!mounted) return;
        final next = snap.states[widget.contentId];
        if (next?.kind != _state?.kind ||
            (next is DownloadInProgress && _state is DownloadInProgress &&
                (next).progress != (_state as DownloadInProgress).progress)) {
          setState(() => _state = next);
        }
      });
    } catch (_) {
      _providersReady = false;
      _state = null;
    }
  }

  @override
  void dispose() {
    unawaited(_sub?.cancel());
    super.dispose();
  }

  Future<void> _handleTap() async {
    if (!_providersReady) return;
    final analytics = ref.read(analyticsProvider);
    final isPro = ref.read(entitlementProvider);
    unawaited(analytics?.trackEvent(
      DownloadsEvents.downloadClicked,
      properties: <String, Object?>{
        DownloadsEventProps.contentId: widget.contentId,
        DownloadsEventProps.contentType: widget.contentType.wire,
        DownloadsEventProps.sourceScreen: widget.sourceScreen,
        DownloadsEventProps.userSubscriptionStatus: isPro ? 'pro' : 'free',
      },
    ));

    final current = _state;
    if (current is DownloadInProgress || current is DownloadQueued) {
      // Ring tap cancels — spec §Play-page Download Button.
      await ref.read(downloadManagerProvider).cancel(widget.contentId);
      return;
    }
    if (current is DownloadCompleted) {
      // Tap on Downloaded state = no-op; long-press opens sheet.
      return;
    }
    if (!isPro) {
      unawaited(analytics?.trackEvent(
        DownloadsEvents.downloadsPaywallTriggered,
        properties: <String, Object?>{
          DownloadsEventProps.trigger:
              DownloadsPaywallTrigger.freeDownloadTap,
          DownloadsEventProps.contentId: widget.contentId,
        },
      ));
      final gate = ref.read(paywallGateProvider);
      final router = GoRouter.of(context);
      await gate.run<void>(
        pending: PendingAction<void>(
          action: () async {
            await ref.read(downloadManagerProvider).enqueue(_makeRequest());
          },
          label: 'download',
        ),
        openPaywall: () async {
          await router.push(
            '/paywall',
            extra: PaywallArgs(
              triggerModule: _moduleForType(widget.contentType),
              triggerAction: PaywallTriggerAction.download,
              entrySource: PaywallEntrySource.download,
            ),
          );
        },
      );
      return;
    }
    await ref.read(downloadManagerProvider).enqueue(_makeRequest());
  }

  String _moduleForType(DownloadContentType t) {
    switch (t) {
      case DownloadContentType.aarti:
      case DownloadContentType.bhajan:
        return UserPropertyModule.aartiBhajans;
      case DownloadContentType.mantra:
        return UserPropertyModule.mantrasStutis;
    }
  }

  DownloadRequest _makeRequest() => DownloadRequest(
        contentId: widget.contentId,
        contentType: widget.contentType,
        title: widget.title,
        subtitle: widget.subtitle,
        artworkUrl: widget.artworkUrl,
        sourceUrl: widget.sourceUrl,
      );

  @override
  Widget build(BuildContext context) {
    final state = _state;
    final Widget glyph;
    if (state is DownloadInProgress) {
      glyph = DownloadRing(progress: state.progress, size: widget.glyphSize);
    } else if (state is DownloadQueued) {
      glyph = DownloadRing(progress: 0, size: widget.glyphSize);
    } else if (state is DownloadCompleted) {
      glyph = Icon(Icons.download_done_rounded,
          size: widget.glyphSize, color: AppColors.brand400);
    } else if (state is DownloadFailed) {
      glyph = Icon(Icons.refresh_rounded,
          size: widget.glyphSize, color: AppColors.error200);
    } else {
      glyph = Icon(Icons.download_outlined,
          size: widget.glyphSize, color: AppColors.grey500);
    }
    switch (widget.variant) {
      case DownloadButtonVariant.iconOnly:
        return Semantics(
          key: Key('download-button-${widget.contentId}'),
          button: true,
          label: 'Download',
          child: InkResponse(
            onTap: _handleTap,
            radius: 24,
            child: SizedBox(
              width: 44,
              height: 44,
              child: Center(child: glyph),
            ),
          ),
        );
      case DownloadButtonVariant.iconWithLabel:
        final label = _labelForState(state);
        return Semantics(
          key: Key('download-button-${widget.contentId}'),
          button: true,
          label: label,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _handleTap,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                glyph,
                const SizedBox(height: AppSpacing.xxxSmall),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: widget.labelStyle ??
                      AppText.labelMd(color: AppColors.grey500),
                ),
              ],
            ),
          ),
        );
    }
  }

  static String _labelForState(DownloadState? state) {
    if (state is DownloadInProgress) {
      final pct = (state.progress * 100).clamp(0, 100).round();
      return 'Downloading $pct%';
    }
    if (state is DownloadQueued) return 'Queued';
    if (state is DownloadCompleted) return 'Downloaded';
    if (state is DownloadFailed) return 'Retry';
    return 'Download';
  }
}
