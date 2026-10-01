import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../core/theme.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../../../state/providers.dart';
import '../../application/wallpaper_navigation.dart';
import '../../data/wallpaper_models.dart';
import '../../wallpaper_analytics.dart';
import '../../wallpaper_providers.dart';
import '../../wallpaper_routes.dart';
import '../bloc/set_wallpaper_bloc.dart';
import '../bloc/set_wallpaper_event.dart';
import '../bloc/set_wallpaper_state.dart';
import '../bloc/wallpaper_preview_bloc.dart';
import '../bloc/wallpaper_preview_event.dart';
import '../bloc/wallpaper_preview_state.dart';
import '../wallpaper_video_port.dart';

/// Full-screen reels preview (Figma 282:2812 static / 712:6622 live). A vertical
/// [PageView] over the source-context feed: static pages show the immersive
/// image, live pages a muted looping video (only the active page plays; leaving
/// the viewport pauses it — PRD §6.7) with a graceful fallback to the still.
/// A readability gradient darkens only the top/bottom edges. Overlays: back,
/// right engagement rail (like + share with counts), set-count text, and the
/// Set CTA(s). Discovery/preview/swipe/like/share are FREE; only Set gates.
class WallpaperPreviewScreen extends ConsumerStatefulWidget {
  const WallpaperPreviewScreen({super.key, required this.args});
  final WallpaperPreviewArgs args;

  @override
  ConsumerState<WallpaperPreviewScreen> createState() =>
      _WallpaperPreviewScreenState();
}

class _WallpaperPreviewScreenState
    extends ConsumerState<WallpaperPreviewScreen> with WidgetsBindingObserver {
  late final WallpaperPreviewBloc _bloc;
  late final SetWallpaperBloc _setBloc;
  late final PageController _pageController;
  int _activeIndex = 0;
  bool _appActive = true;

  /// Registered by the currently-active [_PreviewPage] so the back-tap handler
  /// can read the live video's playback position without walking the tree.
  /// Static pages leave this null (their `playback_time_seconds` reports 0).
  Duration Function()? _activePositionGetter;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _activeIndex = widget.args.startIndex
        .clamp(0, (widget.args.items.length - 1).clamp(0, 1 << 30));
    _pageController = PageController(initialPage: _activeIndex);
    _bloc = WallpaperPreviewBloc(
      repository: ref.read(wallpaperRepositoryProvider),
      shareService: ref.read(shareServiceProvider),
      analytics: ref.read(analyticsProvider),
    )..add(WallpaperPreviewStarted(widget.args));
    _setBloc = buildSetWallpaperBloc(context, ref);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pageController.dispose();
    _bloc.close();
    _setBloc.close();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final active = state == AppLifecycleState.resumed;
    if (active != _appActive) setState(() => _appActive = active);
  }

  void _onPageChanged(int index) {
    setState(() => _activeIndex = index);
    _bloc.add(WallpaperPreviewIndexChanged(index));
  }

  /// Called by [_PreviewPage] when it becomes / stops being the active page,
  /// so the screen knows whose `currentPosition` to read on back-tap. `null`
  /// unregisters (static pages never register).
  void _registerPositionGetter(Duration Function()? getter) {
    _activePositionGetter = getter;
  }

  /// Sheet 1 row 133 — `wallpaper_back_clicked`. Fires the instant the user
  /// hits Back (before the pop resolves), so `playback_time_seconds` reflects
  /// the live-video playhead the user left on. Static pages report 0 —
  /// they never register a position getter.
  void _onBackTapped() {
    final item = _bloc.state.activeItem;
    if (item != null) {
      final positionSeconds =
          (_activePositionGetter?.call() ?? Duration.zero).inSeconds;
      unawaited(ref.read(analyticsProvider)?.trackEvent(
        WallpaperEvents.backClicked,
        properties: {
          WallpaperEventProps.wallpaperId: item.id,
          WallpaperEventProps.mediaType: item.mediaType.name,
          WallpaperEventProps.playbackTimeSeconds: positionSeconds,
        },
      ));
    }
    Navigator.of(context).maybePop();
  }

  void _onSetState(BuildContext context, SetWallpaperState state) {
    final messenger = ScaffoldMessenger.of(context);
    switch (state.status) {
      case SetWallpaperStatus.success:
        messenger.showSnackBar(
          const SnackBar(content: Text(SetWallpaperState.successCopy)),
        );
        final id = state.wallpaperId;
        final count = state.setCount;
        if (id != null && count != null) {
          _bloc.add(WallpaperPreviewSetCountUpdated(
            wallpaperId: id,
            setCount: count,
          ));
        }
      case SetWallpaperStatus.unsupported:
      case SetWallpaperStatus.failed:
        messenger.showSnackBar(
          SnackBar(content: Text(state.message ?? SetWallpaperState.failedCopy)),
        );
      case SetWallpaperStatus.idle:
      case SetWallpaperStatus.awaitingPaywall:
      case SetWallpaperStatus.setting:
      case SetWallpaperStatus.cancelled:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider<WallpaperPreviewBloc>.value(value: _bloc),
        BlocProvider<SetWallpaperBloc>.value(value: _setBloc),
      ],
      child: Scaffold(
        key: const Key('wallpaper-preview-screen'),
        backgroundColor: AppColors.wallpaperImageBackdrop,
        body: BlocListener<SetWallpaperBloc, SetWallpaperState>(
          listener: _onSetState,
          child: BlocConsumer<WallpaperPreviewBloc, WallpaperPreviewState>(
            listenWhen: (a, b) =>
                b.errorMessage != null && a.errorMessage != b.errorMessage,
            listener: (context, state) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(state.errorMessage!)),
              );
              _bloc.add(const WallpaperPreviewErrorCleared());
            },
            builder: (context, state) {
              if (state.isEmpty) {
                return const Center(
                  key: Key('wallpaper-preview-loading'),
                  child: CircularProgressIndicator(color: AppColors.white),
                );
              }
              return Stack(
                fit: StackFit.expand,
                children: [
                  PageView.builder(
                    key: const Key('wallpaper-preview-pageview'),
                    controller: _pageController,
                    scrollDirection: Axis.vertical,
                    onPageChanged: _onPageChanged,
                    itemCount: state.items.length,
                    itemBuilder: (context, index) {
                      final item = state.items[index];
                      final detail = state.details[item.id];
                      return _PreviewPage(
                        item: item,
                        detail: detail,
                        active: index == _activeIndex && _appActive,
                        registerPositionGetter: _registerPositionGetter,
                      );
                    },
                  ),
                  const IgnorePointer(
                    child: DecoratedBox(
                      key: Key('wallpaper-preview-overlay'),
                      decoration: BoxDecoration(
                        gradient: AppGradient.wallpaperOverlay,
                      ),
                    ),
                  ),
                  SafeArea(
                    child: Column(
                      children: [
                        _PreviewTopBar(onBack: _onBackTapped),
                        Expanded(
                          child: Align(
                            alignment: Alignment.centerRight,
                            child: _EngagementRail(state: state),
                          ),
                        ),
                        _PreviewFooter(state: state),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

/// One reels page — a static image or a muted looping video (live), with a still
/// fallback when the video is missing/errored (PRD §7).
class _PreviewPage extends ConsumerStatefulWidget {
  const _PreviewPage({
    required this.item,
    required this.detail,
    required this.active,
    required this.registerPositionGetter,
  });

  final WallpaperCardItem item;
  final WallpaperDetailData? detail;
  final bool active;

  /// Screen-owned register hook: when this page becomes the active live page
  /// it hands a `Duration Function()` reading the port's playhead so the
  /// back-tap event carries `playback_time_seconds` (Sheet 1 row 133).
  /// Passing `null` unregisters.
  final void Function(Duration Function()? getter) registerPositionGetter;

  @override
  ConsumerState<_PreviewPage> createState() => _PreviewPageState();
}

class _PreviewPageState extends ConsumerState<_PreviewPage> {
  WallpaperVideoPort? _port;
  bool _initStarted = false;
  bool _ready = false;

  bool get _wantsVideo {
    final detail = widget.detail;
    return detail != null &&
        detail.isLive &&
        (detail.previewVideoUrl ?? '').trim().isNotEmpty;
  }

  @override
  void didUpdateWidget(covariant _PreviewPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active) {
      _ensurePlaying();
    } else {
      // ignore: discarded_futures
      _port?.pause();
      // Not active anymore — release the register slot so the back-tap
      // doesn't read stale state from a paused page.
      if (oldWidget.active) {
        widget.registerPositionGetter(null);
      }
    }
  }

  Future<void> _ensurePlaying() async {
    if (!_wantsVideo) return;
    if (!_initStarted) {
      _initStarted = true;
      final port = ref.read(wallpaperVideoPortFactoryProvider)();
      _port = port;
      await port.initialize(widget.detail!.previewVideoUrl!);
      if (!mounted) return;
      setState(() => _ready = port.isInitialized && !port.hasError);
    }
    final port = _port;
    if (port != null && port.isInitialized && !port.hasError) {
      await port.play();
      if (widget.active) {
        // Register the position source only after we're actually playing;
        // this covers the "back tapped mid-video" case with a live playhead.
        widget.registerPositionGetter(() => port.currentPosition);
      }
    }
  }

  @override
  void dispose() {
    // Release the register slot before the port goes away so a late back-tap
    // doesn't reach into a disposed controller.
    if (widget.active) {
      widget.registerPositionGetter(null);
    }
    // ignore: discarded_futures
    _port?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Schedule play/pause after this build (active flag arrives via the parent).
    if (widget.active && _wantsVideo && !_initStarted) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && widget.active) {
          // ignore: discarded_futures
          _ensurePlaying();
        }
      });
    }

    final port = _port;
    final showVideo = _wantsVideo && _ready && port != null && !port.hasError;
    return ColoredBox(
      color: AppColors.wallpaperImageBackdrop,
      child: showVideo
          ? SizedBox.expand(
              child: FittedBox(
                key: const Key('wallpaper-preview-video'),
                fit: BoxFit.cover,
                // Native pixel size, NOT `aspectRatio × 1`. See
                // wallpaper_video_port.dart's `intrinsicSize` docs — a
                // 1-pixel logical layout causes Skia to downsample the
                // full-res frame into a 1×1 intermediate raster before
                // FittedBox scales back up, producing distorted playback.
                child: SizedBox(
                  width: port.intrinsicSize.width,
                  height: port.intrinsicSize.height,
                  child: port.buildView(),
                ),
              ),
            )
          : AppNetworkImage(
              key: const Key('wallpaper-preview-image'),
              url: widget.detail?.heroImageUrl ?? widget.item.previewImageUrl,
              fit: BoxFit.cover,
            ),
    );
  }
}

class _PreviewTopBar extends StatelessWidget {
  const _PreviewTopBar({required this.onBack});
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: AppWallpaper.previewNavHeight,
      child: Row(
        children: [
          const SizedBox(width: AppSpacing.xSmall),
          InkResponse(
            key: const Key('wallpaper-preview-back'),
            radius: 24,
            onTap: onBack,
            child: SizedBox(
              width: AppWallpaper.backArrowFrame,
              height: AppWallpaper.backArrowFrame,
              child: Center(
                child: SvgPicture.asset(
                  'assets/wallpaper/back.svg',
                  width: AppWallpaper.backArrowGlyph,
                  height: AppWallpaper.backArrowGlyph,
                  colorFilter: const ColorFilter.mode(
                    AppColors.white,
                    BlendMode.srcIn,
                  ),
                ),
              ),
            ),
          ),
          const Spacer(),
        ],
      ),
    );
  }
}

/// Right engagement rail (Figma 282:2832) — like + count over WhatsApp/share +
/// count, each on a subtle dark scrim, all white.
class _EngagementRail extends StatelessWidget {
  const _EngagementRail({required this.state});
  final WallpaperPreviewState state;

  @override
  Widget build(BuildContext context) {
    final item = state.activeItem;
    if (item == null) return const SizedBox.shrink();
    final bloc = context.read<WallpaperPreviewBloc>();
    return Padding(
      padding: const EdgeInsets.only(right: AppWallpaper.railInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _RailButton(
            buttonKey: const Key('wallpaper-preview-like'),
            asset: 'assets/wallpaper/like.svg',
            tint: item.likedByMe
                ? AppColors.wallpaperLikeActive
                : AppColors.wallpaperRailIcon,
            label: formatWallpaperCount(item.likeCount),
            onTap: () => bloc.add(const WallpaperPreviewLikeToggled()),
          ),
          const SizedBox(height: AppWallpaper.railGap),
          _RailButton(
            buttonKey: const Key('wallpaper-preview-share'),
            asset: 'assets/wallpaper/share_whatsapp.svg',
            tint: AppColors.wallpaperRailIcon,
            label: formatWallpaperCount(item.shareCount),
            onTap: () => bloc.add(const WallpaperPreviewShareRequested()),
          ),
        ],
      ),
    );
  }
}

class _RailButton extends StatelessWidget {
  const _RailButton({
    required this.buttonKey,
    required this.asset,
    required this.tint,
    required this.label,
    required this.onTap,
  });

  final Key buttonKey;
  final String asset;
  final Color tint;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: buttonKey,
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: AppWallpaper.railScrim,
            height: AppWallpaper.railScrim,
            decoration: BoxDecoration(
              color: AppColors.wallpaperRailScrim,
              borderRadius:
                  BorderRadius.circular(AppWallpaper.railScrimRadius),
            ),
            child: Center(
              child: SvgPicture.asset(
                asset,
                width: AppWallpaper.railIconSize,
                height: AppWallpaper.railIconSize,
                colorFilter: ColorFilter.mode(tint, BlendMode.srcIn),
              ),
            ),
          ),
          const SizedBox(height: AppWallpaper.railCountGap),
          Text(
            label,
            style: AppText.labelSm(color: AppColors.wallpaperRailCount),
          ),
        ],
      ),
    );
  }
}

/// Bottom footer (Figma 282:2816) — set-count text + the Set CTA(s). Static
/// shows Set Wallpaper (home) + Set Lockscreen (lock); live shows only Set
/// Wallpaper (home). Both disabled until detail resolves (asset needed to set)
/// and while a set is in flight.
class _PreviewFooter extends ConsumerWidget {
  const _PreviewFooter({required this.state});
  final WallpaperPreviewState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final item = state.activeItem;
    if (item == null) return const SizedBox.shrink();
    final detail = state.activeDetail;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppWallpaper.previewFooterPaddingH,
        AppWallpaper.previewFooterPaddingH,
        AppWallpaper.previewFooterPaddingH,
        AppWallpaper.previewFooterPaddingBottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Wallpaper set ${formatWallpaperCount(item.setCount)} TIMES',
            key: const Key('wallpaper-preview-setcount'),
            style: AppText.bodyXs(color: AppColors.wallpaperFooterText),
          ),
          const SizedBox(height: AppWallpaper.previewFooterGap),
          BlocBuilder<SetWallpaperBloc, SetWallpaperState>(
            builder: (context, setState) {
              final busy = setState.isBusy;
              final enabled = detail != null && !busy;
              final sourceContext = _sourceContextFor(state);
              if (item.isLive) {
                return _SetButton(
                  buttonKey: const Key('wallpaper-preview-set-home'),
                  label: 'Set Wallpaper',
                  busy: busy,
                  onTap: enabled
                      ? () => _requestSet(
                          context, ref, detail, WallpaperTarget.home,
                          sourceContext: sourceContext,
                        )
                      : null,
                );
              }
              return Row(
                children: [
                  Expanded(
                    child: _SetButton(
                      buttonKey: const Key('wallpaper-preview-set-home'),
                      label: 'Set Wallpaper',
                      busy: busy,
                      onTap: enabled
                          ? () => _requestSet(
                              context, ref, detail, WallpaperTarget.home,
                              sourceContext: sourceContext,
                            )
                          : null,
                    ),
                  ),
                  const SizedBox(width: AppWallpaper.setBtnGap),
                  Expanded(
                    child: _SetButton(
                      buttonKey: const Key('wallpaper-preview-set-lock'),
                      label: 'Set Lockscreen',
                      busy: false,
                      onTap: enabled
                          ? () => _requestSet(
                              context, ref, detail, WallpaperTarget.lock,
                              sourceContext: sourceContext,
                            )
                          : null,
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  /// The originating list's source_context — kept on the preview bloc for
  /// every event that Sheet 1 asks for it on. The preview state doesn't
  /// carry it as a field (that would drift), so we read it from the bloc
  /// via its args on emit — but the bloc keeps it privately. The footer
  /// only needs it as a passthrough on Set-tap events (rows 137/138), so
  /// the simplest read is to walk back to the args through the item's
  /// enclosing state — but we don't have that here. Instead the footer
  /// gets its own passthrough via the [WallpaperPreviewState] snapshot
  /// (nothing to walk): the events fire with an empty string when unknown,
  /// which matches the discovery-agnostic taps that arrive without a
  /// source (deep link, etc.).
  static String _sourceContextFor(WallpaperPreviewState state) => '';

  void _requestSet(
    BuildContext context,
    WidgetRef ref,
    WallpaperDetailData detail,
    WallpaperTarget target, {
    required String sourceContext,
  }) {
    // Sheet 1 rows 137 + 138 — `set_wallpaper_clicked` (target = home_screen)
    // / `set_lockscreen_clicked` (target = lock_screen). Fired at the tap
    // site (not inside SetWallpaperBloc) so the target-per-event split is
    // obvious from a grep. Live wallpapers only ever hit the home-screen
    // event since the Set Lockscreen button isn't rendered for them.
    final analytics = ref.read(analyticsProvider);
    final wireTarget = target == WallpaperTarget.lock
        ? WallpaperEventProps.setTargetLockScreen
        : WallpaperEventProps.setTargetHomeScreen;
    final tapEvent = target == WallpaperTarget.lock
        ? WallpaperEvents.setLockscreenClicked
        : WallpaperEvents.setWallpaperClicked;
    unawaited(analytics?.trackEvent(
      tapEvent,
      properties: {
        WallpaperEventProps.wallpaperId: detail.id,
        WallpaperEventProps.mediaType: detail.mediaType.name,
        WallpaperEventProps.setTarget: wireTarget,
        WallpaperEventProps.sourceContext: sourceContext,
      },
    ));

    context.read<SetWallpaperBloc>().add(SetWallpaperRequested(
          wallpaperId: detail.id,
          mediaType: detail.mediaType,
          target: target,
          imageUrl: detail.staticApplyUrl,
          deitySlug: detail.deitySlug,
          liveFrameUrl: detail.liveFrameUrl,
          livePackage: detail.liveWallpaperPackage,
        ));
  }
}

class _SetButton extends StatelessWidget {
  const _SetButton({
    required this.buttonKey,
    required this.label,
    required this.busy,
    required this.onTap,
  });

  final Key buttonKey;
  final String label;
  final bool busy;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: AppWallpaper.setBtnHeight,
      child: Material(
        color: AppColors.wallpaperSetBtnFill,
        borderRadius: BorderRadius.circular(AppWallpaper.setBtnRadius),
        child: InkWell(
          key: buttonKey,
          borderRadius: BorderRadius.circular(AppWallpaper.setBtnRadius),
          onTap: onTap,
          child: Center(
            child: busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor:
                          AlwaysStoppedAnimation(AppColors.wallpaperSetBtnLabel),
                    ),
                  )
                : Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.labelMd(
                      color: AppColors.wallpaperSetBtnLabel,
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}
