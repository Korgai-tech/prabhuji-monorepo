import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../../../../core/theme.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../data/status_models.dart';
import '../../status_providers.dart';
import '../status_video_port.dart';
import 'status_overlay.dart';

/// The "Edit Details" pill in the Status header (Figma node
/// `I302:4928;5186:10469`) — white pill, grey hairline, exported pencil + label.
///
/// TAM-168 — the [label] is now passed in by the parent so it can flip on the
/// profile state boundary (`अपना फोटो डालें` when empty, `अपना फोटो बदलें`
/// when a name OR photo is saved). The widget stays presentation-only.
class StatusEditDetailsPill extends StatelessWidget {
  const StatusEditDetailsPill({
    super.key,
    required this.onTap,
    required this.label,
  });

  final VoidCallback onTap;
  final String label;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: const Key('status-edit-details'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        height: AppStatus.editPillHeight,
        padding: const EdgeInsets.symmetric(
          horizontal: AppStatus.editPillPaddingH,
        ),
        decoration: BoxDecoration(
          color: AppColors.statusEditPillFill,
          borderRadius: BorderRadius.circular(AppStatus.editPillRadius),
          border: Border.all(
            color: AppColors.statusEditPillBorder,
            width: AppStatus.editPillBorder,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // 2-tone Figma export (orange pencil + white knockout) → untinted.
            SvgPicture.asset(
              'assets/status/edit_pencil.svg',
              width: AppStatus.editPillGlyph,
              height: AppStatus.editPillGlyph,
            ),
            const SizedBox(width: AppStatus.editPillGap),
            Text(
              label,
              style: AppText.labelMd(color: AppColors.statusEditPillLabel),
            ),
          ],
        ),
      ),
    );
  }
}

/// The status media — a still, or a muted looping video for the ACTIVE card
/// only (PRD §6.9). A video that fails/never resolves falls back to the
/// thumbnail: media failure must never break the feed (§7).
class StatusMedia extends ConsumerStatefulWidget {
  const StatusMedia({super.key, required this.item, required this.active});

  final StatusFeedItem item;
  final bool active;

  @override
  ConsumerState<StatusMedia> createState() => _StatusMediaState();
}

class _StatusMediaState extends ConsumerState<StatusMedia>
    with WidgetsBindingObserver {
  StatusVideoPort? _port;
  bool _initStarted = false;
  bool _ready = false;
  // Playback gate: shouldPlay = active && visible && appForeground.
  // Sound spills over when ANY of these is missed — tab switch (indexedStack
  // keeps this widget mounted with active=true), app background (OS doesn't
  // pause libmpv for us), screen push (widget stays alive behind the pushed
  // route). Each flag closes one leak.
  bool _visible = false;
  bool _appForeground = true;

  bool get _wantsVideo => widget.item.playableVideoUrl != null;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didUpdateWidget(covariant StatusMedia oldWidget) {
    super.didUpdateWidget(oldWidget);
    // ignore: discarded_futures
    _syncPlayState();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // resumed = foreground; anything else (inactive, paused, hidden, detached)
    // is off-screen from the user's perspective and must silence audio.
    final foreground = state == AppLifecycleState.resumed;
    if (foreground == _appForeground) return;
    _appForeground = foreground;
    // ignore: discarded_futures
    _syncPlayState();
  }

  void _onVisibilityChanged(VisibilityInfo info) {
    // VisibilityDetector can fire a final 0-fraction callback AFTER dispose;
    // guard with `mounted` before touching state (pattern mirrored from
    // home_feed_card.dart's own detector).
    if (!mounted) return;
    // 50 % threshold matches the home feed. Anything under it counts as
    // off-screen for playback purposes, so a card peeking above the fold
    // during a PageView drag doesn't briefly grab audio.
    final visible = info.visibleFraction >= 0.5;
    if (visible == _visible) return;
    _visible = visible;
    // ignore: discarded_futures
    _syncPlayState();
  }

  Future<void> _syncPlayState() async {
    if (!_wantsVideo) return;
    final shouldPlay = widget.active && _visible && _appForeground;
    if (!shouldPlay) {
      await _port?.pause();
      return;
    }
    if (!_initStarted) {
      _initStarted = true;
      final port = ref.read(statusVideoPortFactoryProvider)();
      _port = port;
      await port.initialize(widget.item.playableVideoUrl!);
      if (!mounted) return;
      // Apply the sticky mute preference right after init so the very first
      // frame respects whatever state the user last chose on another card.
      await port.setMuted(ref.read(statusMutedProvider));
      if (!mounted) return;
      setState(() => _ready = port.isInitialized && !port.hasError);
    }
    final port = _port;
    if (port == null || !port.isInitialized || port.hasError) return;
    // Re-check gates — state may have changed while initialize() was awaiting.
    if (widget.active && _visible && _appForeground) {
      await port.play();
    } else {
      await port.pause();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    // ignore: discarded_futures
    _port?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // React to the sticky mute toggle: any change fires setMuted on the port
    // regardless of active state (cheap; keeps every card's port in sync so
    // switching cards doesn't briefly play the old volume).
    ref.listen<bool>(statusMutedProvider, (_, muted) {
      // ignore: discarded_futures
      _port?.setMuted(muted);
    });

    final port = _port;
    final showVideo = _wantsVideo && _ready && port != null && !port.hasError;
    return VisibilityDetector(
      key: Key('status-media-visibility-${widget.item.id}'),
      onVisibilityChanged: _onVisibilityChanged,
      child: ColoredBox(
        color: AppColors.statusMediaBackdrop,
        child: showVideo
            ? SizedBox.expand(
                child: FittedBox(
                  key: const Key('status-card-video'),
                  fit: BoxFit.cover,
                  // Size the FittedBox child to the video's NATIVE PIXEL
                  // resolution — NOT `aspectRatio × 1`. See
                  // status_video_port.dart's `intrinsicSize` docs: a 1-pixel
                  // logical layout causes Skia to sample the full-res frame
                  // into a 1×1 intermediate raster before FittedBox scales
                  // back up, producing blocky/distorted playback that looked
                  // nothing like the browser rendering the same URL.
                  child: SizedBox(
                    width: port.intrinsicSize.width,
                    height: port.intrinsicSize.height,
                    child: port.buildView(),
                  ),
                ),
              )
            : AppNetworkImage(
                key: const Key('status-card-image'),
                url: widget.item.stillUrl,
                fit: BoxFit.cover,
              ),
      ),
    );
  }
}

/// The hero preview (Figma node `I330:6125;322:1741`) — the media with the fixed
/// overlay template composited over it.
///
/// Wrapped in a [RepaintBoundary] keyed by [boundaryKey]. TAM-168 forked the
/// export path:
///  * **Filled profile** (`profile.hasNameOrPhoto == true`) — the export
///    captures this subtree via the boundary, exactly as before, so
///    **preview/export parity is byte-for-byte** (PRD §6.8).
///  * **Empty profile** — the export composes off-screen and skips the
///    overlay band entirely. On-screen this widget still renders the
///    tappable empty-state prompt via [StatusOverlayBand.onEmptyStripTap];
///    the two views deliberately diverge for the empty case only.
class StatusHeroPreview extends StatelessWidget {
  const StatusHeroPreview({
    super.key,
    required this.item,
    required this.profile,
    required this.safeArea,
    required this.active,
    required this.boundaryKey,
    this.onEmptyStripTap,
  });

  final StatusFeedItem item;
  final StatusProfileData profile;
  final StatusSafeArea safeArea;
  final bool active;
  final GlobalKey boundaryKey;

  /// TAM-168 — invoked when the user taps the empty-state strip. Passed
  /// through to [StatusOverlayBand]; ignored when the profile has a saved
  /// name or photo.
  final VoidCallback? onEmptyStripTap;

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      key: boundaryKey,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final size = Size(constraints.maxWidth, constraints.maxHeight);
          return Stack(
            fit: StackFit.expand,
            clipBehavior: Clip.none,
            children: [
              StatusMedia(item: item, active: active),
              StatusOverlayBand(
                profile: profile,
                safeArea: safeArea,
                mediaSize: size,
                onEmptyStripTap: onEmptyStripTap,
              ),
              // Instagram-style speaker toggle — only for the ACTIVE video
              // card. Sits above the overlay band so it's tappable even where
              // the band overlaps the top edge.
              if (item.isVideo && active)
                const Positioned(
                  top: 12,
                  right: 12,
                  child: StatusMuteToggle(),
                ),
            ],
          );
        },
      ),
    );
  }
}

/// The engagement footer (Figma node `I330:6125;322:1723`) — Share CTA, like +
/// count, view + count, Next. Everything here is FREE except Share, which is the
/// module's single conversion point and stays always-visible (no lock badge).
class StatusEngagementFooter extends StatelessWidget {
  const StatusEngagementFooter({
    super.key,
    required this.item,
    required this.rendering,
    required this.onShare,
    required this.onLike,
    required this.onNext,
  });

  final StatusFeedItem item;

  /// Drives the in-CTA progress + blocks duplicate taps during a render (§6.8).
  final bool rendering;

  final VoidCallback onShare;
  final VoidCallback onLike;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    // SPACE_BETWEEN per Figma (node I330:6125;322:1723). Share and Next take
    // their INTRINSIC width — they're the two CTAs and their labels ("Share",
    // "Next") must never ellipsize (previous bug: `Flexible` around _ShareCta
    // squeezed "Share" → "S…" at normal text scale on 411dp screens). Only the
    // count clusters are wrapped in `Flexible` so the row still COMPRESSES
    // instead of overflowing at large system text scales or wide counts
    // (e.g. "999.9K"): the counts ellipsize gracefully, the CTAs stay legible.
    // Figma order (frame 302:4384): Next | ♥ | 👁 | Share  (Share on the RIGHT).
    return SizedBox(
      height: AppStatus.footerHeight,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _NextButton(onTap: onNext),
          Flexible(
            child: _CountCluster(
              clusterKey: const Key('status-like'),
              asset: 'assets/status/like.svg',
              tint: item.likedByMe
                  ? AppColors.statusLikeActive
                  : AppColors.statusCountIcon,
              label: formatStatusCount(item.likeCount),
              onTap: onLike,
            ),
          ),
          Flexible(
            child: _CountCluster(
              clusterKey: const Key('status-view'),
              asset: 'assets/status/view.svg',
              tint: AppColors.statusCountIcon,
              label: formatStatusCount(item.viewCount),
            ),
          ),
          _ShareCta(rendering: rendering, onTap: rendering ? null : onShare),
        ],
      ),
    );
  }
}

/// Instagram-style speaker button that flips the sticky [statusMutedProvider].
/// Renders as a semi-transparent circular pill in the top-right of every
/// active video card. Muted → outlined speaker-off glyph; unmuted → filled
/// speaker glyph.
class StatusMuteToggle extends ConsumerWidget {
  const StatusMuteToggle({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final muted = ref.watch(statusMutedProvider);
    return Material(
      color: Colors.transparent,
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: const Key('status-mute-toggle'),
        onTap: () => ref.read(statusMutedProvider.notifier).toggle(),
        child: Container(
          width: 36,
          height: 36,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            color: AppColors.statusOverMediaControl,
          ),
          child: Icon(
            muted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
            size: 20,
            color: Colors.white,
          ),
        ),
      ),
    );
  }
}

/// The Share CTA (Figma node `I330:6125;322:1724`) — the ctaLR gradient pill
/// with the exported WhatsApp glyph.
class _ShareCta extends StatelessWidget {
  const _ShareCta({required this.rendering, required this.onTap});

  final bool rendering;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: const Key('status-share'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      // Hard-sized pill. The outer Row (StatusEngagementFooter) was pinning
      // the button to a ~70dp equal-distribution slot even after every
      // declarative fix (Flexible removal, IntrinsicWidth, ConstrainedBox);
      // an explicit SizedBox is the belt-and-braces fix that leaves nothing
      // to layout inference.
      //
      // KNOWN OPEN — on-device the label still renders as "S…" despite this
      // width, `TextOverflow.visible`, and `softWrap: false` overriding any
      // inherited DefaultTextStyle. All defensive fixes are in place; a
      // deeper Flutter/Impeller interaction we could not diagnose from adb
      // logcat is the remaining suspect. Follow-up needs Flutter DevTools
      // attached (View → Debug Paint / Widget Inspector) to see the real
      // layout constraint stack this Row hands to the Share slot.
      child: SizedBox(
        width: AppStatus.shareBtnMinWidth,
        child: Container(
          height: AppStatus.shareBtnHeight,
          padding: const EdgeInsets.symmetric(
            horizontal: AppStatus.shareBtnPaddingH,
          ),
          decoration: BoxDecoration(
            color: AppColors.whatsAppShareButton,
            borderRadius: BorderRadius.circular(AppStatus.shareBtnRadius),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (rendering)
                const SizedBox(
                  key: Key('status-share-progress'),
                  width: AppStatus.shareBtnGlyph,
                  height: AppStatus.shareBtnGlyph,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor:
                        AlwaysStoppedAnimation(AppColors.statusShareBtnLabel),
                  ),
                )
              else
                SvgPicture.asset(
                  'assets/status/share_whatsapp.svg',
                  width: AppStatus.shareBtnGlyph,
                  height: AppStatus.shareBtnGlyph,
                  colorFilter: const ColorFilter.mode(
                    AppColors.statusShareBtnLabel,
                    BlendMode.srcIn,
                  ),
                ),
              const SizedBox(width: AppStatus.shareBtnGap),
              // The label must NEVER ellipsize — `TextOverflow.visible` +
              // `softWrap: false` override any inherited `DefaultTextStyle`.
              Text(
                'Share',
                maxLines: 1,
                overflow: TextOverflow.visible,
                softWrap: false,
                style: AppText.labelMd(color: AppColors.statusShareBtnLabel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A glyph + count cluster (Figma nodes `I330:6125;322:1725` / `322:1729`).
class _CountCluster extends StatelessWidget {
  const _CountCluster({
    required this.clusterKey,
    required this.asset,
    required this.tint,
    required this.label,
    this.onTap,
  });

  final Key clusterKey;
  final String asset;
  final Color tint;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: clusterKey,
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SvgPicture.asset(
            asset,
            width: AppStatus.countGlyph,
            height: AppStatus.countGlyph,
            colorFilter: ColorFilter.mode(tint, BlendMode.srcIn),
          ),
          const SizedBox(width: AppStatus.countGap),
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.labelSm(color: AppColors.statusCountText),
            ),
          ),
        ],
      ),
    );
  }
}

/// The Next pill (Figma node `I330:6125;322:1740`).
class _NextButton extends StatelessWidget {
  const _NextButton({required this.onTap});
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: const Key('status-next'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        height: AppStatus.nextBtnHeight,
        padding: const EdgeInsets.symmetric(
          horizontal: AppStatus.nextBtnPaddingH,
        ),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: AppColors.statusNextBtnFill,
          borderRadius: BorderRadius.circular(AppStatus.nextBtnRadius),
          border: Border.all(
            color: AppColors.statusNextBtnBorder,
            width: AppStatus.nextBtnBorder,
          ),
        ),
        child: Text(
          'Next',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppText.labelSm(color: AppColors.statusNextBtnLabel),
        ),
      ),
    );
  }
}
