import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../../../core/deep_link_parser.dart';
import '../../../core/entitlement.dart';
import '../../../core/shared_analytics.dart';
import '../../../core/share_service.dart';
import '../../../core/share_url_builder.dart';
import '../../../core/theme.dart';
import '../../../core/user_properties.dart';
import '../../../core/uuid.dart';
import '../../paywall/paywall_analytics.dart';
import '../../paywall/presentation/paywall_screen.dart';
import '../../../shared/widgets/app_network_image.dart';
import '../../../shared/widgets/blend_layer.dart';
import '../../../state/providers.dart';
import '../../audio/application/audio_controller.dart';
import '../../audio/application/audio_providers.dart';
import '../../audio/domain/audio_item.dart';
import '../../ringtone/preview/bloc/set_ringtone_bloc.dart';
import '../../ringtone/preview/bloc/set_ringtone_event.dart';
import '../../ringtone/preview/bloc/set_ringtone_state.dart';
import '../../ringtone/ringtone_providers.dart';
import '../../status/application/status_navigation.dart';
import '../../status/data/status_models.dart';
import '../../status/details/bloc/status_profile_cubit.dart';
import '../../status/feed/presentation/status_widgets.dart';
import '../../status/share/bloc/status_share_bloc.dart';
import '../../status/share/bloc/status_share_event.dart';
import '../../status/share/bloc/status_share_state.dart';
import '../../status/share/presentation/status_story_share_sheet.dart';
import '../../status/status_analytics.dart';
import '../../wallpaper/application/wallpaper_navigation.dart';
import '../../wallpaper/data/wallpaper_models.dart';
import '../../wallpaper/preview/bloc/set_wallpaper_bloc.dart';
import '../../wallpaper/preview/bloc/set_wallpaper_event.dart';
import '../../wallpaper/preview/bloc/set_wallpaper_state.dart';
import '../data/home_models.dart';
import '../destinations.dart';
import '../feed/bloc/home_feed_bloc.dart';
import '../feed/bloc/home_feed_event.dart';
import '../home_analytics.dart';
import 'home_widgets.dart';

/// One feed card (Figma 285:3539 wallpaper / 285:3574 status / 285:3639 aarti /
/// 285:3689 mantra / 285:3739 ringtone).
///
/// All five share ONE chrome — header + hero + engagement footer — because the
/// five Figma frames are the same component with two hero treatments:
///  * wallpaper/status → a 360×574 9:16 hero with the CTA floated over it;
///  * aarti/mantra/ringtone → a 360×360 audio preview area with the scrim +
///    mini player (the CTA lives inside the mini player's control row).
///
/// #EXPORT_CRITICAL — there is NO lock badge and NO Pro label on any card, for
/// any user. Free and Pro Home are identical (PRD §5); the model exposes no
/// entitlement field, so a lock is unrepresentable here by construction.
class HomeFeedCard extends ConsumerWidget {
  const HomeFeedCard({super.key, required this.item, required this.index});

  final HomeFeedItemView item;

  /// Position in the feed (analytics + the pagination prefetch trigger).
  final int index;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return VisibilityDetector(
      key: Key('home-feed-visibility-${item.id}'),
      onVisibilityChanged: (info) => _onVisibility(context, info),
      child: Container(
        key: Key('home-feed-card-${item.id}'),
        decoration: BoxDecoration(
          color: AppColors.homeCardSurface,
          border: const Border.fromBorderSide(
            BorderSide(color: AppColors.homeCardBorder, width: AppHome.cardBorder),
          ),
          boxShadow: const [
            BoxShadow(
              color: AppColors.homeCardShadow,
              offset: Offset(0, 8),
              blurRadius: 32,
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _CardHeader(item: item),
            if (item.contentType.isAudio)
              _AudioHero(item: item, index: index)
            else if (item.contentType == HomeContentType.status)
              _StatusHero(item: item, index: index)
            else
              _MediaHero(item: item, index: index),
            HomeEngagementFooter(
              item: item,
              onLike: () => context
                  .read<HomeFeedBloc>()
                  .add(HomeFeedLikeToggled(item.id)),
              onShare: () => unawaited(_share(context, ref)),
            ),
          ],
        ),
      ),
    );
  }

  /// Impression (first visible pixel) + the 50% threshold that arms the bloc's
  /// 2s dwell timer. The TIMER lives in the bloc so dedup is per session, not
  /// per widget (pattern §5) — a card scrolled away and back never re-counts.
  void _onVisibility(BuildContext context, VisibilityInfo info) {
    // VisibilityDetector fires a final 0-visibility callback AFTER dispose;
    // reading a deactivated element's bloc would throw.
    if (!context.mounted) return;
    final bloc = context.read<HomeFeedBloc>();
    if (info.visibleFraction > 0) {
      bloc.add(HomeFeedItemImpressed(item.id));
    }
    bloc.add(HomeFeedItemVisibilityChanged(
      itemId: item.id,
      visible: info.visibleFraction >= AppHome.viewVisibleFraction,
    ));

    // Infinite scroll: prefetch as the tail approaches.
    if (info.visibleFraction > 0 &&
        bloc.state.hasMore &&
        index >= bloc.state.items.length - AppHome.prefetchTailDistance) {
      bloc.add(const HomeFeedMoreRequested());
    }
  }

  /// Native share (AC): the OS sheet via TAM-58's `share_plus` wrapper.
  /// Deep link + thumbnail, never a raw media file (the [ShareContent] type
  /// makes a file impossible).
  ///
  /// Post-TAM-124: the share URL is constructed CLIENT-side per contentType
  /// via `buildShareUrl` so every home-feed share follows the canonical
  /// `krutyug.ai/app/<type>/<id>` scheme — the recipient's landing page
  /// redirects to Play Store, and once installed, App Links opens the app
  /// directly to the shared content. Server's `meta.deepLink` is deliberately
  /// NOT used as a fallback — it carries the `prabhuji://` custom scheme,
  /// which messaging apps swallow. Every content type (mantra included,
  /// since TAM-124's follow-up) now maps to a client-built HTTPS link.
  Future<void> _share(BuildContext context, WidgetRef ref) async {
    final bloc = context.read<HomeFeedBloc>();
    final analytics = ref.read(analyticsProvider);
    unawaited(analytics?.trackEvent(
      HomeEvents.contentShareClicked,
      properties: {
        HomeEventProps.contentId: item.id,
        HomeEventProps.contentType: item.contentType.wire,
        HomeEventProps.destinationModule: item.module,
        HomeEventProps.positionIndex: index,
      },
    ));
    // TAM-124 unified funnel event, alongside the feature-scoped
    // `feedShareTapped` above.
    unawaited(analytics?.trackEvent(
      SharedAnalyticsEvents.shareInitiated,
      properties: {
        SharedAnalyticsEventProps.sourceScreen: 'home_feed',
        SharedAnalyticsEventProps.targetType: item.contentType.wire,
        SharedAnalyticsEventProps.targetId: item.id,
      },
    ));
    final meta = item.shareMetadata;
    final deepLink =
        buildShareUrl(_deepLinkTargetFor(item.contentType, item.id));
    // Sheet 1 row 36 — `home_content_share_result`. Reports the platform's
    // outcome (success/dismissed/unavailable) + the chosen target when the
    // OS gave us one (Android component id; null on iOS/web + on OEMs that
    // return the `unavailable` sentinel). Mirrors the Aarti player's shape
    // (`aarti_audio_share_result`) so the funnel joins across modules.
    ShareOutcome? outcome;
    Object? shareError;
    try {
      outcome = await ref.read(shareServiceProvider).share(ShareContent(
            text: meta.text,
            deepLink: deepLink,
            thumbnailUrl: meta.thumbnailUrl,
            subject: meta.title,
          ));
    } catch (e) {
      shareError = e;
    }
    unawaited(analytics?.trackEvent(
      HomeEvents.contentShareResult,
      properties: {
        HomeEventProps.contentId: item.id,
        HomeEventProps.contentType: item.contentType.wire,
        HomeEventProps.result: _shareResultWireValue(outcome, shareError),
        HomeEventProps.destination: outcome?.destination,
        if (shareError != null) HomeEventProps.errorCode: 'share_threw',
      },
    ));
    bloc.add(HomeFeedShared(item.id));
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

  /// Map a home-feed content type to the matching TAM-124 deep-link target.
  ///
  /// Total by construction — every `HomeContentType` has a target, so the
  /// caller never needs a fallback URL. `mantra` was the last hole: it had
  /// no parser target, so the share fell back to the server's
  /// `prabhuji://` URL and any recipient who did tap it landed on /home
  /// via `UnknownDeepLink`. Adding a case here without adding the matching
  /// parser + `pathForTarget` case would reintroduce exactly that.
  DeepLinkTarget _deepLinkTargetFor(HomeContentType type, String id) {
    return switch (type) {
      HomeContentType.wallpaper => WallpaperDeepLink(id: id),
      HomeContentType.status => StatusDeepLink(id: id),
      HomeContentType.aarti => AartiDeepLink(audioId: id),
      HomeContentType.ringtone => RingtoneDeepLink(id: id),
      HomeContentType.mantra => MantraDeepLink(audioId: id),
    };
  }
}

/// Card header (node 285:3541): module tile + label/title + badge pill.
///
/// The WHOLE row is the tap target → the owning module, directly (PRD §11).
class _CardHeader extends ConsumerWidget {
  const _CardHeader({required this.item});

  final HomeFeedItemView item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      key: Key('home-feed-card-header-${item.id}'),
      behavior: HitTestBehavior.opaque,
      onTap: () {
        // `home_feed_item_header_tapped` was removed from the contract;
        // Sheet 1 covers header-driven module opens via `home_widget_clicked`
        // (row 32) for the shortcut grid only. Content-card headers don't
        // have a matching sheet event today.
        // Untrusted CMS module key → the allowlist. Unknown ⇒ no-op.
        final path = HomeDestinations.feedHeader(item)?.path;
        if (path != null) openHomeDestinationPath(context, path);
      },
      child: Container(
        // minHeight (not `height:`) so the header stays Figma-spec 72px at
        // the default text scale, but grows to fit content when the user's
        // system font scale is > 1.0 (accessibility bump in Android
        // Settings → Display → Font size). A rigid `height:` overflowed by
        // ~3px at scale 1.075+ because `labelMd(20) + gap(4) + bodyXs(16)
        // = 40` fits the padded inner zone (72 − 32) EXACTLY at 1.0 with
        // zero headroom — any scale factor at all pushed past it.
        constraints: const BoxConstraints(
          minHeight: AppHome.headerBlockHeight,
        ),
        padding: const EdgeInsets.all(AppHome.headerBlockPadding),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            // Module tile (node 285:3544) — a Figma-exported per-module artwork
            // on a #FC7304 @10% rounded tile. The artwork rectangle (285:3545 et
            // al) carries `blendMode: MULTIPLY`, so its export has an opaque
            // white background that MUST be composited, not painted flat — same
            // trap as the shortcut art (see home_shortcut_grid.dart).
            Container(
              width: AppHome.thumbSize,
              height: AppHome.thumbSize,
              decoration: BoxDecoration(
                color: AppColors.homeCardThumbFill,
                borderRadius: BorderRadius.circular(AppHome.thumbRadius),
              ),
              clipBehavior: Clip.antiAlias,
              child: BlendLayer(
                blendMode: BlendMode.multiply,
                child: Image.asset(item.contentType.thumbAsset, fit: BoxFit.cover),
              ),
            ),
            const SizedBox(width: AppHome.thumbTextGap),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: AppHome.cardTitleGap,
                children: [
                  // The design's first line is the module/context caption
                  // ("Set Wallpaper", node 285:3548) — the CMS `label` when it
                  // sent one, else the item's own title.
                  Text(
                    item.ctaLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.labelMd(color: AppColors.homeCardLabel),
                  ),
                  // Second line (node 285:3550) — the content name.
                  Text(
                    item.subtitle ?? item.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.bodyXs(color: AppColors.homeCardTitle),
                  ),
                ],
              ),
            ),
            // No server-authored copy ⇒ no pill. The client never invents it.
            if (item.hasBadge) ...[
              const SizedBox(width: AppHome.thumbTextGap),
              HomeBadgePill(
                key: Key('home-feed-badge-${item.id}'),
                label: item.badgeLabel!,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Wallpaper/status hero (nodes 285:3555 / 285:3590) — a 360×574 9:16 preview
/// with the CTA floated at the bottom.
///
/// **Contract gap, logged, not invented**: the Figma status card (285:3574)
/// paints a business-status overlay (name / business / phone / avatar, nodes
/// 285:3592–3622). TAM-61's `HomeFeedItem` carries NONE of that data — it has no
/// profile fields at all — so rendering it would mean fabricating a person.
/// Home therefore shows the status media itself; the real overlay is composed
/// from the user's own profile inside the Status module (TAM-72). Recorded in
/// `specs/evidence/TAM-62/fidelity/cross-check.md`.
///
/// The status card also has no CTA node in Figma, but the AC requires one — it
/// reuses the SAME `Main Buttons` instance the wallpaper card floats (285:3557),
/// also logged.
class _MediaHero extends ConsumerWidget {
  const _MediaHero({required this.item, required this.index});

  final HomeFeedItemView item;
  final int index;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SizedBox(
      key: Key('home-feed-hero-${item.id}'),
      height: AppHome.heroHeight,
      child: Stack(
        alignment: Alignment.bottomCenter,
        children: [
          Positioned.fill(
            child: ColoredBox(
              color: AppColors.homeMediaBackdrop,
              child: AppNetworkImage(url: item.mediaUrl, fit: BoxFit.cover),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: AppHome.ctaBottomInset),
            child: HomeCtaButton(
              key: Key('home-feed-cta-${item.id}'),
              label: item.ctaLabel,
              onTap: () => homeHandleCtaTap(context, ref, item, index),
            ),
          ),
        ],
      ),
    );
  }
}

/// Status feed card hero — the media with the user's overlay branding band
/// composited on top (Figma 285:3592–3622), matching the Status tab's own
/// preview (`StatusHeroPreview`). The "View Status" CTA floats at the bottom
/// and triggers the SAME share flow the Status tab's Share button does —
/// gates on profile, opens the story-target sheet, then dispatches to
/// [StatusShareBloc] which handles the render + OS handoff.
///
/// Profile source: the app-scoped [StatusProfileCubit] provided at
/// `main.dart`. If empty, the overlay renders the "add your details" prompt
/// (mirrors the Status tab).
///
/// Media rendering: [StatusHeroPreview] wraps the composited subtree in a
/// [RepaintBoundary] keyed by [_boundaryKey] — the same subtree
/// `StatusRenderService.renderImage` rasterizes for the export, so what the
/// user previewed IS what gets shared (PRD §6.8 parity contract).
///
/// Contract note: `HomeFeedItemView` doesn't carry the per-status
/// `overlaySafeArea` or `mediaKind` fields. Per the "no server change, no
/// extra API call" decision, we use [StatusSafeArea.figmaDefault] for
/// positioning (a bottom band that fits every Prabhuji artwork tested) and
/// derive image/video from the media URL's extension. Both fall back
/// gracefully if the CMS ever ships a status with a non-standard layout.
class _StatusHero extends StatefulWidget {
  const _StatusHero({required this.item, required this.index});

  final HomeFeedItemView item;
  final int index;

  @override
  State<_StatusHero> createState() => _StatusHeroState();
}

class _StatusHeroState extends State<_StatusHero> {
  /// Persistent GlobalKey for the RepaintBoundary inside [StatusHeroPreview].
  /// Passed as the boundary key to [StatusShareRequested] so the render
  /// service captures the exact subtree the user sees.
  final GlobalKey _boundaryKey = GlobalKey();

  bool _loadKicked = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Lazy: only the first status card on Home fires the fetch. `load()` is
    // idempotent — the cubit short-circuits when it already has ready data.
    if (!_loadKicked) {
      _loadKicked = true;
      unawaited(context.read<StatusProfileCubit>().load());
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final feedItem = _statusFeedItemFromHome(item);
    return SizedBox(
      key: Key('home-feed-hero-${item.id}'),
      height: AppHome.heroHeight,
      child: BlocBuilder<StatusProfileCubit, StatusProfileCubitState>(
        buildWhen: (a, b) => a.profile != b.profile,
        builder: (context, profileState) {
          final profile = profileState.profile ?? StatusProfileData.empty;
          return Stack(
            alignment: Alignment.bottomCenter,
            children: <Widget>[
              Positioned.fill(
                child: Consumer(
                  builder: (context, ref, _) => StatusHeroPreview(
                    key: Key('home-feed-status-preview-${item.id}'),
                    item: feedItem,
                    profile: profile,
                    safeArea: feedItem.overlaySafeArea.orFigmaDefault,
                    // Never active on Home — status video previews only
                    // autoplay inside the Status tab's feed (one-at-a-time
                    // discipline).
                    active: false,
                    boundaryKey: _boundaryKey,
                    // TAM-168 — the empty-state strip is a discovery
                    // affordance for the details editor on Home too (spec
                    // #PLAN_UNCERTAINTY: consistent behaviour with the
                    // Status tab). Fires the same analytics + navigates to
                    // the same target; refresh happens automatically via
                    // the details screen's `cubit.refresh()` on save.
                    onEmptyStripTap: () => _onHomeStatusStripTap(
                      context,
                      ref,
                      feedItem,
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(
                  bottom: AppHome.ctaBottomInset + 40,
                ),
                child: Consumer(
                  builder: (context, ref, _) => HomeCtaButton(
                    key: Key('home-feed-cta-${item.id}'),
                    label: item.ctaLabel,
                    onTap: () => unawaited(
                      _shareStatusFromFeed(
                        context,
                        ref,
                        item,
                        _boundaryKey,
                        widget.index,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Build a [StatusFeedItem] from a home-feed row so the shared Status
/// widgets ([StatusHeroPreview]) and share pipeline ([StatusShareBloc])
/// can consume it unchanged.
///
/// The Home feed doesn't carry the per-status `overlaySafeArea` (per the
/// "no server change" decision), so callers fall back to
/// [StatusSafeArea.figmaDefault]. Media kind is sniffed from the URL —
/// `.mp4`/`.mov`/`.webm` ⇒ video, everything else ⇒ image. This matches
/// what the server would tell us if the field were on the wire.
StatusFeedItem _statusFeedItemFromHome(HomeFeedItemView item) {
  final url = item.mediaUrl.trim();
  final lower = url.toLowerCase();
  final isVideo = lower.endsWith('.mp4') ||
      lower.endsWith('.mov') ||
      lower.endsWith('.webm') ||
      lower.endsWith('.m4v');
  return StatusFeedItem(
    id: item.id,
    slug: item.id,
    title: item.title,
    mediaType: isVideo ? StatusMediaType.video : StatusMediaType.image,
    imageUrl: isVideo ? null : url,
    videoUrl: isVideo ? url : null,
    thumbnailUrl: url,
    overlaySafeArea: StatusSafeArea.figmaDefault,
    // `HomeFeedItemView` carries no deity at all (the feed contract is
    // module-agnostic), so a status shared straight off the Home feed reports
    // `deity_slug: null` on `status_share_result`. Shares from the Status
    // module itself go through `StatusFeedItem.fromCard` and carry the slug.
    deitySlug: null,
    deityName: null,
    languages: const <String>[],
    // The Home feed contract is module-agnostic and carries no creator, so
    // there is nobody to credit or report here. `null` means "no chip", which
    // is correct: this card is rendered by `StatusHeroPreview` only, and the
    // credit chip lives one level up in the Status module's own `_StatusCard`.
    creator: null,
    shareCaption: item.subtitle,
    likeCount: item.likeCount,
    viewCount: item.viewCount,
    likedByMe: item.likedByMe,
  );
}

/// Audio preview area (nodes 285:3655/3705/3755) + its mini player (285:3658).
///
/// #PATH_DECISION — playback runs on the ONE shared TAM-59 [AudioController] in
/// **preview mode**, so:
///  * one audio at a time is STRUCTURAL, not policy: a new `play()` replaces the
///    single engine's source, which stops whatever was playing (including an
///    Aarti/Mantras full player);
///  * a preview never promotes the mini-player (`PlaybackMode.preview`).
///
/// The viewport drives it with hysteresis (play ≥0.6 / pause ≤0.2, pattern §4)
/// so a card straddling the boundary can't thrash the player.
class _AudioHero extends ConsumerStatefulWidget {
  const _AudioHero({required this.item, required this.index});

  final HomeFeedItemView item;
  final int index;

  @override
  ConsumerState<_AudioHero> createState() => _AudioHeroState();
}

class _AudioHeroState extends ConsumerState<_AudioHero>
    with WidgetsBindingObserver {
  /// Captured in [initState] — VisibilityDetector fires a final 0-visibility
  /// callback AFTER dispose, when `ref` is unusable (pattern §4 gotcha). The
  /// controller is stable for the tree's lifetime, so holding it is safe
  /// where holding `ref` is not.
  late final AudioController _audio;

  /// Latest playback snapshot, seeded in [initState] and refreshed by a
  /// `ref.listen` in [build]. Mirrored into a field because the
  /// visibility/dispose callbacks must not touch `ref`, and a notifier's
  /// `state` is off-limits outside the notifier.
  ///
  /// It is a `listen`, not a `watch`, on purpose: the callbacks need fields
  /// ([AudioPlaybackState.mode], [AudioPlaybackState.currentItem]) that the
  /// render slice in [build] deliberately drops, but subscribing the WIDGET to
  /// the whole snapshot would rebuild every mounted audio card on every
  /// `positionStream` tick (~5×/s) — including the cards that aren't playing.
  AudioPlaybackState _playback = AudioPlaybackState.empty;

  bool _startedByUs = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _audio = ref.read(audioControllerProvider.notifier);
    // Seed the mirror. [build] keeps it fresh via `ref.listen` (which does NOT
    // deliver an initial value), so without this seed a visibility callback
    // firing before the first state change would read `empty`.
    _playback = _audio.currentSnapshot;
  }

  /// Whether this subtree is being ticked — false while Home is the inactive
  /// branch of the shell's IndexedStack.
  bool _tickerEnabled = true;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // THE BACKGROUND GATE, and a genuinely separate signal from the tab one:
    // backgrounding the app does NOT flip `TickerMode` (Home is still the
    // active branch) and does not repaint, so the ticker gate below cannot see
    // it and the preview kept playing out of a backgrounded app.
    //
    // `resumed` is the only foreground state — inactive/paused/hidden/detached
    // all mean the user is not looking at the feed. Same rule the home banner
    // carousel applies.
    //
    // Scoped to OUR preview via `_isOurs`, which requires
    // `PlaybackMode.preview`: a full-player aarti or mantra is expected to keep
    // playing in the background, and must not be stopped by a feed card that
    // happens to be mounted behind it.
    if (state == AppLifecycleState.resumed) return;
    if (!_startedByUs || !_isOurs(_playback)) return;
    _startedByUs = false;
    unawaited(_safePause());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // THE SHELL-BRANCH GATE, and the only signal that covers it.
    //
    // Tapping into another tab does not unmount Home: go_router's
    // `StatefulShellRoute.indexedStack` wraps each branch in
    // `Offstage(offstage: !isActive, child: TickerMode(enabled: isActive, …))`.
    // So nothing is disposed, nothing re-lays-out — VisibilityDetector stays
    // silent because it reports on PAINT — and no route is pushed, so the
    // router's preview-pause observer never fires either. All three of this
    // widget's existing stop conditions miss it, and the preview kept playing
    // audibly over whatever tab the user moved to.
    //
    // `TickerMode.valuesOf` registers an inherited-widget dependency, so this
    // method runs on the branch swap. Same gate as the home banner carousel
    // and the chat intro video; the carousel calls it "overkill for a muted
    // banner and warranted for audible playback" — this preview IS audible, so
    // it is warranted.
    final enabled = TickerMode.valuesOf(context).enabled;
    if (enabled == _tickerEnabled) return;
    _tickerEnabled = enabled;
    if (!enabled && _startedByUs && _isOurs(_playback)) {
      _startedByUs = false;
      unawaited(_safePause());
    }
    // Deliberately NOT resumed when the user comes back: returning to Home
    // should not restart audio they walked away from. Scrolling the card out
    // and back in starts it again through the normal visibility path.
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    // Leaving the tree stops OUR preview, never someone else's playback.
    // Guarded: at full-tree teardown the AudioController provider may already be
    // disposed, so a late state write would throw — same precedent as the
    // Ringtone preview's `_safeStop` (TAM-68).
    if (_startedByUs && _isOurs(_playback)) {
      unawaited(_safeStop());
    }
    super.dispose();
  }

  Future<void> _safeStop() async {
    try {
      await _audio.stop();
    } catch (_) {
      // provider already torn down — the engine is disposed with it.
    }
  }

  Future<void> _safePause() async {
    try {
      await _audio.pause();
    } catch (_) {
      // VisibilityDetector fires a final 0-visibility callback AFTER dispose;
      // by then the container may be gone. Nothing left to pause.
    }
  }

  bool _isOurs(AudioPlaybackState state) =>
      state.currentItem?.id == widget.item.id &&
      state.mode == PlaybackMode.preview;

  void _onVisibility(VisibilityInfo info) {
    if (!widget.item.hasAudioPreview) return;
    final state = _playback;

    if (info.visibleFraction >= AppHome.audioPlayFraction) {
      if (_isOurs(state) && state.playing) return; // already ours + running
      // Do NOT preempt an active FULL-mode playback (aarti / mantras). The
      // audio engine is shared, so calling `_audio.play()` here would stop
      // the user's aarti mid-verse just because they scrolled past a home-
      // feed card. Full-mode always wins over autoplay-preview; if the user
      // pauses/closes the full player, subsequent card visibilities can
      // start their preview naturally.
      //
      // We DON'T mark `_startedByUs = true` here — we didn't start anything,
      // so the pause-on-scroll branch below has nothing of ours to pause.
      if (state.mode == PlaybackMode.full && state.currentItem != null) return;

      _startedByUs = true;
      // `home_feed_audio_autoplay_started` was removed from the contract.
      // A new play STOPS the previous one — one engine, source replaced.
      unawaited(_audio.play(
        AudioItem(
          id: widget.item.id,
          title: widget.item.title,
          audioUrl: widget.item.audioPreviewUrl ?? '',
          subtitle: widget.item.subtitle,
          artworkUrl: widget.item.mediaUrl,
        ),
        mode: PlaybackMode.preview,
      ));
      return;
    }

    if (info.visibleFraction <= AppHome.audioPauseFraction &&
        _startedByUs &&
        _isOurs(state)) {
      _startedByUs = false;
      // `home_feed_audio_paused_on_scroll` was removed from the contract.
      unawaited(_safePause());
    }
  }

  @override
  Widget build(BuildContext context) {
    // Keep the full-snapshot mirror fresh WITHOUT subscribing this widget to
    // it — see the `_playback` docstring.
    ref.listen<AudioPlaybackState>(
      audioControllerProvider,
      (_, next) => _playback = next,
    );
    // The render slice. Every field collapses to a constant for a card that
    // isn't the active item, so the record compares equal tick after tick and
    // `select` filters the rebuild out entirely — only the ONE playing card
    // repaints on a position tick.
    final view = ref.watch(audioControllerProvider.select((s) {
      final ours = s.currentItem?.id == widget.item.id &&
          s.mode == PlaybackMode.preview;
      return (
        ours: ours,
        playing: ours && s.playing,
        position: ours ? s.position : Duration.zero,
        duration: ours ? s.duration : Duration.zero,
      );
    }));
    final ours = view.ours;
    final playing = view.playing;
    final position = view.position;
    final duration = view.duration;

    return VisibilityDetector(
      key: Key('home-feed-audio-${widget.item.id}'),
      onVisibilityChanged: _onVisibility,
      child: SizedBox(
        height: AppHome.audioAreaHeight,
        child: ColoredBox(
          color: AppColors.homeAudioSurface,
          child: Stack(
            alignment: Alignment.bottomCenter,
            children: [
              Positioned.fill(
                child: AppNetworkImage(url: widget.item.mediaUrl, fit: BoxFit.cover),
              ),
              // Readability scrim (node 285:3657) — darkens the BOTTOM only, so
              // the deity's face at the top stays clear.
              const Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(gradient: AppGradient.homeAudioScrim),
                ),
              ),
              _MiniPlayer(
                item: widget.item,
                index: widget.index,
                playing: playing,
                position: position,
                duration: duration,
                // Scrubbing needs a loaded source: a fraction can only be
                // turned into a Duration once the engine has reported one.
                // A card that isn't the active item has neither, so its bar
                // stays inert until it starts playing — in practice invisible,
                // since autoplay claims the card at `audioPlayFraction`
                // visibility long before a thumb lands on it.
                canSeek: ours && duration > Duration.zero,
                onSeek: (p) => unawaited(_audio.seek(p)),
                onToggle: () {
                  if (!widget.item.hasAudioPreview) return;
                  if (playing) {
                    unawaited(_audio.pause());
                  } else if (ours) {
                    unawaited(_audio.resume());
                  } else {
                    _startedByUs = true;
                    unawaited(_audio.play(
                      AudioItem(
                        id: widget.item.id,
                        title: widget.item.title,
                        audioUrl: widget.item.audioPreviewUrl ?? '',
                        subtitle: widget.item.subtitle,
                        artworkUrl: widget.item.mediaUrl,
                      ),
                      mode: PlaybackMode.preview,
                    ));
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Mini player (node 285:3658): elapsed/total, progress bar, play/pause + CTA.
class _MiniPlayer extends ConsumerStatefulWidget {
  const _MiniPlayer({
    required this.item,
    required this.index,
    required this.playing,
    required this.position,
    required this.duration,
    required this.canSeek,
    required this.onSeek,
    required this.onToggle,
  });

  final HomeFeedItemView item;
  final int index;
  final bool playing;
  final Duration position;
  final Duration duration;

  /// Whether the bar accepts scrub gestures — false until this card owns a
  /// loaded source (see the call site).
  final bool canSeek;

  /// Commits a scrub. Fired once per tap and once per completed drag, never
  /// per drag pixel.
  final ValueChanged<Duration> onSeek;

  final VoidCallback onToggle;

  @override
  ConsumerState<_MiniPlayer> createState() => _MiniPlayerState();
}

class _MiniPlayerState extends ConsumerState<_MiniPlayer> {
  /// Where the thumb is being dragged TO, `0..1`, or null when not dragging.
  ///
  /// This is the whole trick behind a scrub bar that doesn't fight itself.
  /// While a drag is live the bar renders THIS instead of the engine's
  /// position, so the ~5×/s `positionStream` ticks — which still describe the
  /// pre-seek playhead — can't yank the thumb backwards under the finger.
  /// Cleared on commit, at which point [AudioController.seek]'s optimistic
  /// state write has already moved the real position to match.
  double? _dragFraction;

  double _fractionFor(double dx, double width) =>
      width <= 0 ? 0.0 : (dx / width).clamp(0.0, 1.0);

  Duration _positionFor(double fraction) => Duration(
        milliseconds: (fraction * widget.duration.inMilliseconds).round(),
      );

  @override
  void didUpdateWidget(covariant _MiniPlayer oldWidget) {
    super.didUpdateWidget(oldWidget);
    // The gesture layer is unmounted the moment this card stops owning the
    // engine (another card autoplayed past it, playback was stopped). No
    // drag-end or drag-cancel arrives in that case, so a live override would
    // stick and freeze the thumb at a position nothing is playing from.
    if (!widget.canSeek) _dragFraction = null;
  }

  void _commit(double fraction) {
    // Order matters: seek FIRST, clear the drag override SECOND. `seek`
    // writes the new position into the controller synchronously before it
    // awaits the engine, so by the time this frame paints `widget.position`
    // already agrees with the thumb — clearing first would flash one frame of
    // the stale playhead.
    widget.onSeek(_positionFor(fraction));
    setState(() => _dragFraction = null);
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final index = widget.index;
    final playing = widget.playing;
    final duration = widget.duration;
    // During a drag the elapsed clock follows the thumb, not the engine —
    // otherwise the number contradicts the control the user is holding.
    final position =
        _dragFraction != null ? _positionFor(_dragFraction!) : widget.position;
    final progress = _dragFraction ??
        (duration.inMilliseconds <= 0
            ? 0.0
            : (position.inMilliseconds / duration.inMilliseconds)
                .clamp(0.0, 1.0));

    return Padding(
      padding: const EdgeInsets.all(AppHome.miniPlayerPadding),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        spacing: AppHome.miniPlayerGap,
        children: [
          // Timers (nodes 285:3660/3662).
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(_clock(position), style: AppText.homeAudioTime()),
              Text(_clock(duration), style: AppText.homeAudioTime()),
            ],
          ),
          // Progress (node 285:3664) — scrubbable. The painted geometry is
          // unchanged from the read-only version (same 6px track, same 12px
          // thumb, same node-285:3666 shadow), so the Home goldens don't move;
          // only the gesture layer is new. The touch band is the thumb's own
          // 12px — deliberately NOT padded out to 48dp, because the Column's
          // fixed `miniPlayerGap` spacing means any extra height would push
          // the control row down and break the frame.
          SizedBox(
            height: AppHome.progressThumb,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final width = constraints.maxWidth;
                final filled = width * progress;
                final bar = Stack(
                  alignment: Alignment.centerLeft,
                  children: [
                    Container(
                      height: AppHome.progressHeight,
                      decoration: BoxDecoration(
                        color: AppColors.homeAudioProgressTrack,
                        borderRadius:
                            BorderRadius.circular(AppHome.progressRadius),
                      ),
                    ),
                    Container(
                      width: filled,
                      height: AppHome.progressHeight,
                      decoration: BoxDecoration(
                        color: AppColors.homeAudioProgressFill,
                        borderRadius:
                            BorderRadius.circular(AppHome.progressRadius),
                      ),
                    ),
                    Positioned(
                      left: (filled - AppHome.progressThumb / 2)
                          .clamp(0.0, (constraints.maxWidth - AppHome.progressThumb).clamp(0.0, double.infinity)),
                      child: Container(
                        width: AppHome.progressThumb,
                        height: AppHome.progressThumb,
                        decoration: const BoxDecoration(
                          color: AppColors.homeAudioProgressThumb,
                          shape: BoxShape.circle,
                          // Node 285:3666's OWN effect: #000000 @0.05, (0,+1),
                          // blur 2 — not the play button's (285:3669), which is
                          // vestigial and casts nothing.
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.homeAudioProgressThumbShadow,
                              offset: Offset(0, 1),
                              blurRadius: 2,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                );

                if (!widget.canSeek) return bar;

                return GestureDetector(
                  key: Key('home-feed-audio-scrub-${item.id}'),
                  behavior: HitTestBehavior.opaque,
                  // `onTapUp`, NOT `onTapDown`: down fires on a 100ms deadline
                  // even when the gesture turns out to be a drag, so a
                  // press-hold-then-scrub would commit a throwaway seek to the
                  // press point first. Up fires only once the tap has actually
                  // won the arena — exactly one seek per gesture, either way.
                  onTapUp: (d) =>
                      _commit(_fractionFor(d.localPosition.dx, width)),
                  // Horizontal only: the feed is a vertical CustomScrollView,
                  // so claiming the horizontal axis leaves the scroll gesture
                  // untouched (the arena resolves them on different axes).
                  onHorizontalDragStart: (d) => setState(
                    () => _dragFraction =
                        _fractionFor(d.localPosition.dx, width),
                  ),
                  // Drag only moves the LOCAL override — one seek per gesture,
                  // not one per pixel, which matters on a streamed source.
                  onHorizontalDragUpdate: (d) => setState(
                    () => _dragFraction =
                        _fractionFor(d.localPosition.dx, width),
                  ),
                  onHorizontalDragEnd: (_) {
                    final f = _dragFraction;
                    if (f == null) return;
                    _commit(f);
                  },
                  onHorizontalDragCancel: () =>
                      setState(() => _dragFraction = null),
                  child: bar,
                );
              },
            ),
          ),
          // Controls (node 285:3667): play/pause + the CTA.
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              GestureDetector(
                key: Key('home-feed-audio-toggle-${item.id}'),
                behavior: HitTestBehavior.opaque,
                onTap: widget.onToggle,
                // No backing + no shadow, deliberately. Figma node 285:3669 is
                // literally named "Play/Pause Button:shadow" and carries two
                // DROP_SHADOWs — but its fill is #FFFFFF @ **0.00**, and Figma
                // derives a drop shadow from the layer's alpha mask, so a
                // zero-alpha fill casts nothing. Those effects are vestigial:
                // the frame render (figma-refs/feed-card-aarti.png) shows a bare
                // glyph. Painting the BoxShadows anyway put a visible dark box
                // on the artwork that the design does not have.
                child: Container(
                  width: AppHome.playButtonSize,
                  height: AppHome.playButtonSize,
                  alignment: Alignment.center,
                  // The Home frame ships only a PLAY glyph (285:3671); the pause
                  // state reuses the Figma-exported player pause (assets/audio/
                  // pause.svg, node 423:4383, TAM-59) tinted to the same white.
                  // Both are downloaded Figma art — neither is authored.
                  child: SvgPicture.asset(
                    playing ? 'assets/audio/pause.svg' : 'assets/home/preview-play.svg',
                    width: playing ? AppHome.playGlyphHeight : AppHome.playGlyphWidth,
                    height: AppHome.playGlyphHeight,
                    colorFilter: const ColorFilter.mode(
                      AppColors.homeAudioPlayGlyph,
                      BlendMode.srcIn,
                    ),
                  ),
                ),
              ),
              HomeCtaButton(
                key: Key('home-feed-cta-${item.id}'),
                label: item.ctaLabel,
                compact: true,
                onTap: () => homeHandleCtaTap(context, ref, item, index),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// `mm:ss` exactly as the design renders it (nodes 285:3661 "01:20" /
  /// 285:3663 "05:45").
  static String _clock(Duration d) {
    final total = d.inSeconds < 0 ? 0 : d.inSeconds;
    final m = (total ~/ 60).toString().padLeft(2, '0');
    final s = (total % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}

/// The CTA tap, shared by both hero treatments.
///
/// Route resolution: CMS destinations are resolved through the hardcoded
/// [HomeDestinations] allowlist (pattern §3). Wallpaper items are the ONE
/// exception (TAM-122 §2) — they perform a direct Set from Home instead of
/// pushing the module's preview screen. Every other module still opens its
/// own confirmation + Pro gate on arrival at the pushed route.
void homeHandleCtaTap(
  BuildContext context,
  WidgetRef ref,
  HomeFeedItemView item,
  int index,
) {
  // `home_feed_cta_tapped` was removed from the contract. Audio-item CTAs
  // fire Sheet 1 row 37 `listen_to_more_clicked` (below); other CTAs route
  // through the destination allowlist without a dedicated event.

  // Sheet 1 row 37 — `listen_to_more_clicked`. The CTA on aarti/mantra/
  // ringtone cards reads "Listen to more"; this event captures the funnel
  // step from Home into the owning audio module. Fires BEFORE any routing
  // decision so we record the intent even when the destination is unknown
  // (unknown ⇒ the allowlist no-ops silently below).
  if (item.contentType.isAudio) {
    unawaited(ref.read(analyticsProvider)?.trackEvent(
      HomeEvents.listenToMoreClicked,
      properties: {
        HomeEventProps.contentId: item.id,
        HomeEventProps.destinationModule: item.module,
        HomeEventProps.positionIndex: index,
      },
    ));
  }

  // TAM-122 §2 — wallpaper + ringtone carve-outs: direct Set from the Home
  // feed instead of opening the module. Wallpaper's Set-Bloc owns the Pro
  // gate internally; ringtone's Set-Bloc does NOT (see set_ringtone_bloc.dart
  // — it only owns the WRITE_SETTINGS permission gate), so the ringtone flow
  // runs the Pro check up-front and then dispatches.
  if (item.contentType == HomeContentType.wallpaper) {
    unawaited(_directSetWallpaperFromFeed(context, ref, item));
    return;
  }
  if (item.contentType == HomeContentType.ringtone) {
    unawaited(_directSetRingtoneFromFeed(context, ref, item));
    return;
  }
  // Status cards route their CTA through the _StatusHero's own onTap, which
  // has access to the RepaintBoundary GlobalKey. If a status item ever ends
  // up here (e.g. a caller other than _StatusHero routes to it), fall
  // through to the destination allowlist which resolves to the module home
  // — the SAME behaviour Home had before the share carve-out.

  final destination = HomeDestinations.feedCta(item);
  if (destination == null) return; // unknown CMS value — no-op (pattern §3)

  if (destination.opensPaywall) {
    // `home_paywall_triggered` was removed. `paywall_viewed` (Paywall
    // module, Sheet 1 row 17) covers the same funnel step server-side.
    unawaited(context.push(
      '/paywall',
      extra: const PaywallArgs(
        triggerModule: UserPropertyModule.home,
        triggerAction: PaywallTriggerAction.upgradeCta,
        entrySource: PaywallEntrySource.home,
      ),
    ));
    return;
  }

  final path = destination.path;
  if (path != null) openHomeDestinationPath(context, path);
}

/// TAM-122 §2 — direct Set-Wallpaper flow from a Home feed card. Shows a
/// bottom-sheet target picker (Home / Lock / Both), then dispatches through
/// the same [SetWallpaperBloc] the module's preview screen uses so the Pro
/// gate + native set state machine + analytics are reused, not reinvented.
///
/// Contract note: `HomeFeedItemView` today does NOT carry `mediaType`; every
/// wallpaper feed item is treated as static and its `mediaUrl` is passed as
/// the apply asset. Live wallpapers, when the CMS starts flagging them on the
/// feed, will need an explicit `mediaType` field (see TAM-122 §Contract gaps).
Future<void> _directSetWallpaperFromFeed(
  BuildContext context,
  WidgetRef ref,
  HomeFeedItemView item,
) async {
  final target = await showModalBottomSheet<WallpaperTarget>(
    context: context,
    backgroundColor: AppColors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (_) => const _WallpaperTargetSheet(),
  );
  if (target == null || !context.mounted) return;

  final messenger = ScaffoldMessenger.of(context);
  // `home_feed_cta_direct_set` was removed from the contract; the Wallpaper
  // module's own `set_wallpaper_clicked` + `set_wallpaper_result` (Sheet 1
  // rows 137/139) capture the funnel step end-to-end.
  final bloc = buildSetWallpaperBloc(context, ref);
  try {
    // Attach the completion future BEFORE dispatching — emits happen behind
    // awaits inside the handler, but subscribing first guarantees no missed
    // transitions if the handler flushes synchronously between events.
    final terminalFuture = bloc.stream.firstWhere((s) =>
        s.status == SetWallpaperStatus.success ||
        s.status == SetWallpaperStatus.failed ||
        s.status == SetWallpaperStatus.unsupported ||
        s.status == SetWallpaperStatus.cancelled);

    bloc.add(SetWallpaperRequested(
      wallpaperId: item.id,
      mediaType: WallpaperMediaType.static_,
      target: target,
      imageUrl: item.mediaUrl,
      // The Home feed row carries no deity (module-agnostic contract), so
      // `set_wallpaper_result` reports `deity_slug: null` on this path. The
      // Wallpaper module's own preview screen passes the detail's slug.
      deitySlug: null,
    ));

    final terminal = await terminalFuture;

    final message = switch (terminal.status) {
      SetWallpaperStatus.success => SetWallpaperState.successCopy,
      SetWallpaperStatus.failed =>
        terminal.message ?? SetWallpaperState.failedCopy,
      SetWallpaperStatus.unsupported =>
        terminal.message ?? SetWallpaperState.unsupportedCopy,
      // Cancelled = user dismissed the paywall. Silent — they made the choice.
      SetWallpaperStatus.cancelled => null,
      _ => null,
    };
    if (message != null) {
      messenger.showSnackBar(SnackBar(content: Text(message)));
    }
  } finally {
    await bloc.close();
  }
}

/// Bottom-sheet target picker for the direct Set-Wallpaper flow. Three plain
/// tiles — Home / Lock / Both — matching the wallpaper module's own vocabulary
/// (`WallpaperTarget`). Popping with `null` cancels.
class _WallpaperTargetSheet extends StatelessWidget {
  const _WallpaperTargetSheet();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        key: const Key('home-feed-wallpaper-target-sheet'),
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const SizedBox(height: 12),
          Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.grey300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Set wallpaper on',
                style: AppText.labelLg(color: AppColors.black),
              ),
            ),
          ),
          _TargetTile(
            targetKey: const Key('home-feed-wallpaper-target-home'),
            label: 'Home screen',
            target: WallpaperTarget.home,
          ),
          _TargetTile(
            targetKey: const Key('home-feed-wallpaper-target-lock'),
            label: 'Lock screen',
            target: WallpaperTarget.lock,
          ),
          _TargetTile(
            targetKey: const Key('home-feed-wallpaper-target-both'),
            label: 'Both screens',
            target: WallpaperTarget.both,
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _TargetTile extends StatelessWidget {
  const _TargetTile({
    required this.targetKey,
    required this.label,
    required this.target,
  });

  final Key targetKey;
  final String label;
  final WallpaperTarget target;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      key: targetKey,
      title: Text(label, style: AppText.labelMd(color: AppColors.black)),
      onTap: () => Navigator.of(context).pop(target),
    );
  }
}

/// TAM-122 §2 — direct Set-Ringtone flow from a Home feed card. Runs the Pro
/// gate up-front (the ringtone [SetRingtoneBloc] doesn't own it — its state
/// machine only handles the Android `WRITE_SETTINGS` permission grant), then
/// dispatches through the SAME bloc the module's preview screen uses so the
/// permission flow + set analytics are reused, not reinvented.
///
/// Contract note: `HomeFeedItemView` currently exposes only `audioPreviewUrl`
/// for ringtone items; the wire is null today, so this function will surface
/// "Ringtone not available yet" until the CMS starts populating that field
/// (or a dedicated `setAudioUrl` is added — see TAM-122 §Contract gaps). The
/// wiring is intentionally in place so no client change is needed to unlock
/// direct-Set once the field lands.
Future<void> _directSetRingtoneFromFeed(
  BuildContext context,
  WidgetRef ref,
  HomeFeedItemView item,
) async {
  final messenger = ScaffoldMessenger.of(context);
  final analytics = ref.read(analyticsProvider);

  // Guard: without an audio URL there is nothing to set. Today the wire is
  // null for every ringtone item — surface the miss instead of firing an
  // empty native call that always fails.
  final audioUrl = (item.audioPreviewUrl ?? '').trim();
  if (audioUrl.isEmpty) {
    messenger.showSnackBar(
      const SnackBar(
        content: Text('This ringtone is not available yet.'),
      ),
    );
    return;
  }

  // Pro gate — mirrors the SetWallpaperBloc's internal dance, but owned here
  // since SetRingtoneBloc doesn't take an `isPro` callback. Push the paywall
  // and re-check LIVE entitlement on return.
  if (!ref.read(entitlementProvider)) {
    // `home_paywall_triggered` was removed from the contract; the Paywall
    // module's `paywall_viewed` (Sheet 1 row 17) fires when the paywall
    // screen becomes visible and carries `trigger_module` for attribution.
    await context.push(
      '/paywall',
      extra: const PaywallArgs(
        triggerModule: UserPropertyModule.home,
        triggerAction: PaywallTriggerAction.upgradeCta,
        entrySource: PaywallEntrySource.home,
      ),
    );
    if (!context.mounted) return;
    // `entitlementProvider` is now a derived Provider<bool>; the refresh
    // trigger lives on the underlying `entitlementStateProvider`.
    await ref.read(entitlementStateProvider.notifier).refresh();
    if (!ref.read(entitlementProvider)) {
      // User dismissed the paywall — silent, they made the choice.
      return;
    }
  }

  // `home_feed_cta_direct_set` was removed; Ringtone module's
  // `set_ringtone_clicked` / `set_ringtone_result` (Sheet 1 rows 123/125)
  // capture the funnel step end-to-end.

  final bloc = SetRingtoneBloc(
    service: ref.read(setRingtoneServiceProvider),
    repository: ref.read(ringtoneRepositoryProvider),
    analytics: analytics,
  );

  // WRITE_SETTINGS is a settings-screen grant (not a runtime dialog): the
  // bloc opens Android's settings intent and then waits for a resume event to
  // re-check `canWrite()`. In the preview screen, the screen's own
  // WidgetsBindingObserver fires that event; here we register a temporary
  // observer scoped to this one operation so we don't leak a listener on the
  // shell after the snackbar shows.
  final observer = _RingtoneResumeObserver(bloc);
  WidgetsBinding.instance.addObserver(observer);

  try {
    final terminalFuture = bloc.stream.firstWhere((s) =>
        s.status == SetRingtoneStatus.success ||
        s.status == SetRingtoneStatus.failed ||
        s.status == SetRingtoneStatus.permissionDenied);

    bloc.add(SetRingtoneStartRequested(
      ringtoneId: item.id,
      audioUrl: audioUrl,
      title: item.title,
      // The Home feed row carries no deity (module-agnostic contract), so
      // `set_ringtone_result` reports `deity_slug: null` on this path. The
      // Ringtone module's own preview screen passes the detail's slug.
      deitySlug: null,
    ));

    final terminal = await terminalFuture;

    final message = switch (terminal.status) {
      SetRingtoneStatus.success => 'Ringtone set',
      SetRingtoneStatus.failed =>
        terminal.message ?? SetRingtoneState.failedCopy,
      SetRingtoneStatus.permissionDenied =>
        terminal.message ?? SetRingtoneState.deniedCopy,
      _ => null,
    };
    if (message != null) {
      messenger.showSnackBar(SnackBar(content: Text(message)));
    }
  } finally {
    WidgetsBinding.instance.removeObserver(observer);
    await bloc.close();
  }
}

/// Bridges Android app-resume back into the [SetRingtoneBloc] so the
/// WRITE_SETTINGS re-check runs after the user returns from the settings
/// screen. Only alive for the duration of one direct-Set attempt.
class _RingtoneResumeObserver with WidgetsBindingObserver {
  _RingtoneResumeObserver(this._bloc);
  final SetRingtoneBloc _bloc;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _bloc.add(const SetRingtoneAppResumed());
    }
  }
}

/// TAM-168 — the Home-feed status card's empty-state overlay strip tap.
/// Fires `status_add_details_strip_clicked` BEFORE the push so a slow route
/// never loses the funnel event, then opens the personal details editor
/// tagged as `entry_source = add_details_strip`. The details screen's own
/// `cubit.refresh()` on save flows the fresh profile back into the Home
/// card's `StatusProfileCubit` subscription automatically.
void _onHomeStatusStripTap(
  BuildContext context,
  WidgetRef ref,
  StatusFeedItem item,
) {
  unawaited(ref.read(analyticsProvider)?.trackEvent(
        StatusEvents.addDetailsStripClicked,
        properties: {
          StatusEventProps.statusId: item.id,
          StatusEventProps.entrySource: StatusEntrySources.addDetailsStrip,
          StatusEventProps.destinationScreen:
              StatusDestinationScreens.personalDetails,
        },
      ));
  unawaited(pushStatusDetails(
    context,
    initialType: StatusProfileType.personal,
    entrySource: StatusEntrySources.addDetailsStrip,
  ));
}

/// "View Status" CTA on a Home feed status card → the Status-tab Share flow.
///
/// Mirrors `StatusHomeScreen._StatusCard._onSharePressed`:
///  1. Read the freshest profile from the hoisted [StatusProfileCubit] so
///     the render decision (empty vs filled overlay) has a current snapshot.
///  2. Ask the user which app to share to via the shared story sheet.
///  3. Adapt the [HomeFeedItemView] to a [StatusFeedItem] and dispatch
///     [StatusShareRequested] on a fresh [StatusShareBloc] built through the
///     existing cross-feature seam.
///
/// TAM-168 — the `hasActiveDetails` bounce is gone. An empty-profile Pro
/// user opens the share sheet directly and ships a deity-only creative
/// (the render service's empty branch skips the overlay burn-in). The Pro
/// gate lives INSIDE [StatusShareBloc] — Home never reimplements it.
/// Free users see the paywall route; a cancelled paywall leaves the card
/// untouched, matching the Status tab.
Future<void> _shareStatusFromFeed(
  BuildContext context,
  WidgetRef ref,
  HomeFeedItemView item,
  GlobalKey boundaryKey,
  int index,
) async {
  final cubit = context.read<StatusProfileCubit>();
  final analytics = ref.read(analyticsProvider);

  // Minted at the tap, before any await — see the Status-tab twin in
  // `status_home_screen.dart::_onSharePressed`.
  final shareSessionId = newUuidV4();
  final tappedAt = DateTime.now();
  final feedItem = _statusFeedItemFromHome(item);
  final mediaType = feedItem.mediaType.name;
  final isPro = ref.read(entitlementProvider);

  // `status_share_cta_clicked` fires BEFORE `cubit.load()` below — intent
  // timing, deliberately unblocked by a network call. That used to mean the
  // hand-passed `has_name`/`has_photo` reported an empty profile when a tap
  // landed during the first fetch. The global pair has no such gap: it reads
  // `StatusProfileFlagsStore`, which persists the last-known flags across
  // launches, so a returning user reports their real profile state even
  // before this surface's first `/status/profile` round-trip lands.
  unawaited(analytics?.trackEvent(
    StatusEvents.shareCtaClicked,
    properties: {
      StatusEventProps.shareSessionId: shareSessionId,
      StatusEventProps.statusId: item.id,
      StatusEventProps.mediaType: mediaType,
      StatusEventProps.sourceScreen: StatusShareSourceScreens.homeFeed,
      StatusEventProps.positionIndex: index,
      StatusEventProps.isProAtEvent: isPro,
    },
  ));

  // A profile fetch may still be in flight at first mount. `load()` is
  // idempotent — awaits the in-flight future if there is one — so we can
  // always hand the freshest snapshot into `StatusShareRequested`.
  await cubit.load();
  if (!context.mounted) return;

  final profile = cubit.state.profile ?? StatusProfileData.empty;

  final launcher = ref.read(storyShareLauncherProvider);
  final target = await showStatusStoryShareSheet(
    context: context,
    launcher: launcher,
    analytics: analytics,
    shareSessionId: shareSessionId,
    statusId: item.id,
    mediaType: mediaType,
    isProAtEvent: isPro,
    ctaTappedAt: tappedAt,
  );
  if (target == null || !context.mounted) return;

  final messenger = ScaffoldMessenger.of(context);
  final bloc = buildStatusShareBloc(context, ref);
  try {
    // Subscribe BEFORE dispatching — the render/paywall handler can flush
    // synchronously between events; a listener attached after `add()` would
    // miss the terminal emission.
    final terminalFuture = bloc.stream.firstWhere((s) =>
        s.status == StatusShareStatus.shared ||
        s.status == StatusShareStatus.cancelled ||
        s.status == StatusShareStatus.failed ||
        s.status == StatusShareStatus.unsupported);

    bloc.add(StatusShareRequested(
      item: feedItem,
      profile: profile,
      boundaryKey: boundaryKey,
      target: target,
      shareSessionId: shareSessionId,
    ));

    final terminal = await terminalFuture;
    final message = switch (terminal.status) {
      // Cancelled = user dismissed the paywall or the share sheet. Silent.
      StatusShareStatus.cancelled => null,
      // Shared = the OS accepted the file. StatusShareBloc's analytics
      // covers the funnel; no snackbar needed.
      StatusShareStatus.shared => null,
      StatusShareStatus.failed =>
        terminal.message ?? 'Could not share the status. Please try again.',
      StatusShareStatus.unsupported => terminal.message ??
          'This status can\'t be shared from your device yet.',
      _ => null,
    };
    if (message != null) {
      messenger.showSnackBar(SnackBar(content: Text(message)));
    }
  } finally {
    await bloc.close();
  }
}
