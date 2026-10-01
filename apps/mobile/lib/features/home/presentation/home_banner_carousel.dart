import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../../../core/entitlement.dart';
import '../../../core/paywall_gate.dart';
import '../../../core/theme.dart';
import '../../../core/user_properties.dart';
import '../../../shared/widgets/app_network_image.dart';
import '../../../state/providers.dart';
import '../../paywall/paywall_analytics.dart';
import '../../paywall/presentation/paywall_screen.dart';
import '../data/home_models.dart';
import '../destinations.dart';
import '../home_analytics.dart';
import '../home_banner_video_port.dart';
import '../home_providers.dart';

/// CMS hero banner carousel (Figma nodes 285:3506 → 285:3507, component
/// 224:1367): a 328×150 r8 pager with dots when there is more than one.
///
/// A banner is an IMAGE or a VIDEO (`HomeBanner.mediaType`). A video banner
/// paints its thumbnail still first and then plays the clip over it — MUTED, on
/// a LOOP, with NO play/pause chrome of any kind — and only while it is the
/// banner actually on screen. Playback is gated on three independent facts, all
/// resolved here and handed down as one `shouldPlay` flag:
///
///   `shouldPlay = isCurrentPage && carouselVisible && appForeground`
///
/// Each flag closes one leak the others miss: swiping the pager (the old page
/// stays built in the PageView's cache), scrolling Home past the carousel or
/// switching bottom-nav tabs (the whole subtree stays mounted in the shell's
/// IndexedStack), and backgrounding the app (the OS does not pause libmpv for
/// us). Tapping is unaffected — a video banner navigates exactly like an image
/// one.
///
/// Failure contract (§8/§16), enforced by the caller + this widget together:
///  * every banner failed/empty → the whole section is HIDDEN (the screen simply
///    doesn't build this sliver — see `HomeFeedState.showBanners`);
///  * one banner with nothing paintable at all → dropped upstream by the bloc,
///    the rest still render;
///  * a video that never decodes → the still stays up forever; it is painted
///    UNDER the video layer, never swapped out, so a mid-playback decoder
///    failure degrades to the thumbnail instead of a black box;
///  * never a broken-image placeholder — [AppNetworkImage] owns that rule.
class HomeBannerCarousel extends ConsumerStatefulWidget {
  const HomeBannerCarousel({super.key, required this.banners});

  final List<HomeBannerView> banners;

  @override
  ConsumerState<HomeBannerCarousel> createState() => _HomeBannerCarouselState();
}

/// Viewport thresholds for banner-video playback, with hysteresis so a carousel
/// parked exactly on the boundary can't thrash the decoder: start at ≥60 %
/// visible, stop at ≤20 %. Same shape as the feed's audio-preview gate.
const double _kBannerVideoPlayFraction = 0.6;
const double _kBannerVideoPauseFraction = 0.2;

class _HomeBannerCarouselState extends ConsumerState<HomeBannerCarousel>
    with WidgetsBindingObserver {
  late final PageController _controller;
  int _index = 0;

  /// `home_banner_viewed` fires once per banner per session.
  final Set<String> _viewed = <String>{};

  /// The three carousel-wide playback gates (the fourth is "is this the current
  /// page", which is per-banner). [_visible] starts false because the first
  /// [VisibilityDetector] callback only lands on the frame after mount; the
  /// other two start true because Home cannot be building otherwise.
  bool _visible = false;
  bool _appForeground = true;
  bool _tickersEnabled = true;

  @override
  void initState() {
    super.initState();
    _controller = PageController();
    WidgetsBinding.instance.addObserver(this);
    _reportViewed(0);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // `resumed` is the only foreground state; inactive/paused/hidden/detached
    // all mean the user isn't looking at the banner, so it must stop.
    final foreground = state == AppLifecycleState.resumed;
    if (foreground == _appForeground) return;
    setState(() => _appForeground = foreground);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // The FOURTH gate. [VisibilityDetector] reports on PAINT, so it never fires
    // for a subtree that stops being painted without moving — a route pushed on
    // top of Home (tapping a banner is exactly that), or a bottom-nav tab
    // switch in the shell's IndexedStack. Flutter mutes tickers for both, so
    // `TickerMode` is the signal that covers them. The router hit this same
    // blind spot for feed-audio previews and solved it with a global
    // NavigatorObserver (`_PreviewAudioPauseOnPushObserver`) — warranted for
    // AUDIBLE playback, overkill for a muted banner.
    final tickersEnabled = TickerMode.valuesOf(context).enabled;
    if (tickersEnabled != _tickersEnabled) {
      setState(() => _tickersEnabled = tickersEnabled);
    }
  }

  void _onVisibilityChanged(VisibilityInfo info) {
    // The detector fires a final 0-fraction callback AFTER dispose; touching
    // state then throws (pattern §4 gotcha, mirrored from home_feed_card.dart).
    if (!mounted) return;
    final fraction = info.visibleFraction;
    final next = _visible
        ? fraction > _kBannerVideoPauseFraction
        : fraction >= _kBannerVideoPlayFraction;
    if (next == _visible) return;
    setState(() => _visible = next);
  }

  void _reportViewed(int index) {
    if (index < 0 || index >= widget.banners.length) return;
    final banner = widget.banners[index];
    if (!_viewed.add(banner.id)) return;
    unawaited(ref.read(analyticsProvider)?.trackEvent(
          HomeEvents.bannerViewed,
          properties: {
            HomeEventProps.bannerId: banner.id,
            HomeEventProps.mediaType: banner.mediaType.wire,
            HomeEventProps.destinationType: banner.destinationType.wire,
            HomeEventProps.positionIndex: index,
          },
        ));
  }

  @override
  Widget build(BuildContext context) {
    return VisibilityDetector(
      key: const Key('home-banner-carousel-visibility'),
      onVisibilityChanged: _onVisibilityChanged,
      child: _buildCarousel(context),
    );
  }

  Widget _buildCarousel(BuildContext context) {
    return Padding(
      key: const Key('home-banner-carousel'),
      padding: const EdgeInsets.fromLTRB(
        AppHome.screenPadding,
        AppHome.bannerBlockPaddingTop,
        AppHome.screenPadding,
        AppHome.bannerBlockPaddingBottom,
      ),
      child: SizedBox(
        height: AppHome.bannerHeight,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppHome.bannerRadius),
            boxShadow: const [
              BoxShadow(
                color: AppColors.homeBannerShadowNear,
                offset: Offset(0, 4),
                blurRadius: 6,
              ),
              BoxShadow(
                color: AppColors.homeBannerShadowFar,
                offset: Offset(0, 10),
                blurRadius: 15,
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppHome.bannerRadius),
            child: Stack(
              children: [
                PageView.builder(
                  controller: _controller,
                  itemCount: widget.banners.length,
                  onPageChanged: (i) {
                    setState(() => _index = i);
                    _reportViewed(i);
                  },
                  itemBuilder: (context, i) => _Banner(
                    banner: widget.banners[i],
                    positionIndex: i,
                    // The ONE playback gate — see the class doc. A banner that
                    // isn't the current page, or a carousel that is scrolled
                    // away / backgrounded, never decodes a frame.
                    shouldPlay: i == _index &&
                        _visible &&
                        _appForeground &&
                        _tickersEnabled,
                  ),
                ),
                // Dots only when there's more than one banner (AC).
                if (widget.banners.length > 1)
                  Positioned(
                    // Bottom-RIGHT, per the node's own box — see
                    // AppHome.bannerDotsRightInset. Centring them (the obvious
                    // default for a carousel) lands 132px off the design.
                    right: AppHome.bannerDotsRightInset,
                    bottom: AppHome.bannerDotsBottomInset,
                    child: _Dots(count: widget.banners.length, active: _index),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// One page of the carousel: the still, plus — for a `video` banner that is
/// currently the banner on screen — a muted looping clip painted over it.
///
/// Stateful because the video port has a lifecycle. An IMAGE banner never
/// builds a port at all, so its render path is byte-for-byte what it was before
/// video support existed.
class _Banner extends ConsumerStatefulWidget {
  const _Banner({
    required this.banner,
    required this.positionIndex,
    required this.shouldPlay,
  });

  final HomeBannerView banner;
  final int positionIndex;

  /// Resolved by the carousel: current page AND on screen AND app foregrounded.
  final bool shouldPlay;

  @override
  ConsumerState<_Banner> createState() => _BannerState();
}

class _BannerState extends ConsumerState<_Banner> {
  HomeBannerVideoPort? _port;

  /// The port is created LAZILY — on the first frame this banner is actually
  /// supposed to play — so swiping past a video banner never spins up a decoder
  /// for it, and a carousel of five videos costs one player, not five.
  bool _initStarted = false;
  bool _ready = false;

  String? get _videoUrl => widget.banner.playableVideoUrl;

  @override
  void initState() {
    super.initState();
    unawaited(_syncPlayState());
  }

  @override
  void didUpdateWidget(covariant _Banner oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.shouldPlay != widget.shouldPlay) {
      unawaited(_syncPlayState());
    }
  }

  @override
  void dispose() {
    // Tears the player down even if `initialize()` is still in flight — the
    // await below is `mounted`-guarded, so nothing touches state afterwards.
    unawaited(_port?.dispose());
    super.dispose();
  }

  Future<void> _syncPlayState() async {
    final url = _videoUrl;
    if (url == null) return; // image banner — nothing to drive
    if (!widget.shouldPlay) {
      await _port?.pause();
      return;
    }
    if (!_initStarted) {
      _initStarted = true;
      final port = ref.read(homeBannerVideoPortFactoryProvider)();
      _port = port;
      // Never throws by contract: a failure flips `hasError` and we simply
      // stay on the thumbnail.
      await port.initialize(url);
      if (!mounted) return;
      setState(() => _ready = port.isInitialized && !port.hasError);
    }
    final port = _port;
    if (port == null || !port.isInitialized || port.hasError) return;
    // Re-read the gate: it may have flipped while initialize() was awaiting
    // (a fast swipe past this page is exactly that race).
    if (widget.shouldPlay) {
      await port.play();
    } else {
      await port.pause();
    }
  }

  @override
  Widget build(BuildContext context) {
    final banner = widget.banner;
    final port = _port;
    final showVideo =
        _ready && port != null && port.isInitialized && !port.hasError;

    // The still is the BASE layer, always painted, never swapped out — so the
    // banner shows the thumbnail before the first frame decodes, and keeps
    // showing it if the video fails at any point (AC: "the thumbnail stays up
    // so the banner never looks broken").
    final Widget art = SizedBox(
      width: double.infinity,
      height: AppHome.bannerHeight,
      child: Stack(
        fit: StackFit.expand,
        children: [
          AppNetworkImage(
            key: Key('home-banner-still-${banner.id}'),
            url: banner.stillUrl,
            fit: BoxFit.cover,
          ),
          if (showVideo)
            FittedBox(
              key: Key('home-banner-video-${banner.id}'),
              fit: BoxFit.cover,
              clipBehavior: Clip.hardEdge,
              // Size the FittedBox child to the video's NATIVE PIXEL size, not
              // `aspectRatio × 1` — see `HomeBannerVideoPort.intrinsicSize`.
              child: SizedBox(
                width: port.intrinsicSize.width,
                height: port.intrinsicSize.height,
                child: port.buildView(),
              ),
            ),
        ],
      ),
    );

    // `informational` banners carry no destination (the server nulls it) and are
    // rendered NON-TAPPABLE — no GestureDetector at all, so the rule holds
    // structurally rather than by an ignored callback (AC / PRD §8).
    if (!banner.destinationType.isNavigable) {
      return KeyedSubtree(
        key: Key('home-banner-${banner.id}'),
        child: art,
      );
    }

    return GestureDetector(
      key: Key('home-banner-${banner.id}'),
      behavior: HitTestBehavior.opaque,
      onTap: () => unawaited(_onTap(context)),
      child: art,
    );
  }

  /// #PATH_DECISION — the ONE Home-origin paywall trigger (PRD §5, §8).
  ///
  /// A free user tapping a banner the server marked `isProFeatureDiscovery`
  /// opens the unified paywall through TAM-58's [PaywallGate]; a Pro user goes
  /// straight to the linked destination. Entitlement is read LIVE by the gate —
  /// never cached, never invented client-side.
  Future<void> _onTap(BuildContext context) async {
    final banner = widget.banner;
    final analytics = ref.read(analyticsProvider);
    // Sheet 1 row 31 — `home_banner_clicked`. `destination_id` is null when
    // the destination is unmapped (the tap becomes a no-op below), so the
    // funnel can still count the click.
    final destination = HomeDestinations.banner(banner);
    unawaited(analytics?.trackEvent(
      HomeEvents.bannerClicked,
      properties: {
        HomeEventProps.bannerId: banner.id,
        HomeEventProps.mediaType: banner.mediaType.wire,
        HomeEventProps.destinationType: banner.destinationType.wire,
        HomeEventProps.destinationId: destination?.path,
        HomeEventProps.positionIndex: widget.positionIndex,
      },
    ));

    // `home_paywall_triggered` was removed from the contract; the Paywall
    // module now owns `paywall_viewed` (Sheet 1 row 17) at the moment the
    // paywall screen becomes visible. Home just navigates.

    // A `pro_paywall` banner IS the paywall — open it directly through the gate
    // (a Pro user gets nothing to buy, so the gate's isPro short-circuit means
    // this is a no-op for them, which is correct: there is no other destination).
    if (destination?.opensPaywall ?? false) {
      if (context.mounted) {
        await context.push(
          '/paywall',
          extra: const PaywallArgs(
            triggerModule: UserPropertyModule.home,
            triggerAction: PaywallTriggerAction.upgradeCta,
            entrySource: PaywallEntrySource.home,
          ),
        );
      }
      return;
    }

    final path = destination?.path;
    if (path == null) return; // unknown/unmapped destination — no-op

    if (banner.isProFeatureDiscovery && !ref.read(entitlementProvider)) {
      // Free user + a Pro-discovery banner → paywall first; on purchase the gate
      // resumes the ORIGINAL navigation (post-purchase continuation).
      final gate = ref.read(paywallGateProvider);
      await gate.run<void>(
        pending: PendingAction<void>(
          label: 'open_banner_destination',
          action: () async {
            if (context.mounted) openHomeDestinationPath(context, path);
          },
        ),
        openPaywall: () async {
          if (context.mounted) {
            await context.push(
              '/paywall',
              extra: const PaywallArgs(
                triggerModule: UserPropertyModule.home,
                triggerAction: PaywallTriggerAction.upgradeCta,
                entrySource: PaywallEntrySource.home,
              ),
            );
          }
        },
      );
      return;
    }

    // Everyone else (including a Pro user on a discovery banner) → the
    // destination. The module enforces its own gate on arrival.
    if (context.mounted) openHomeDestinationPath(context, path);
  }
}

/// Carousel dots (node I285:3507;224:1357) — 8px circles, 4px apart, the active
/// one solid white and the rest white @50%, pinned to the banner's bottom-right.
class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.active});

  final int count;
  final int active;

  @override
  Widget build(BuildContext context) {
    return Row(
      key: const Key('home-banner-dots'),
      // Hugs its dots so the Positioned right-inset is what pins it (the node is
      // 32 wide for 3 dots = 3×8 + 2×4, i.e. it hugs in Figma too).
      mainAxisSize: MainAxisSize.min,
      spacing: AppHome.bannerDotGap,
      children: [
        for (var i = 0; i < count; i++)
          Container(
            width: AppHome.bannerDotSize,
            height: AppHome.bannerDotSize,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppHome.bannerDotRadius),
              color: i == active
                  ? AppColors.homeBannerDotActive
                  : AppColors.homeBannerDotInactive,
            ),
          ),
      ],
    );
  }
}
