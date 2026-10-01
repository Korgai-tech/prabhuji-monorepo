import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../api/api_client.dart';
import '../../../../core/entitlement.dart';
import '../../../../core/theme.dart';
import '../../../../core/uuid.dart';
import '../../../../shared/widgets/deity_filter_row.dart';
import '../../../../state/providers.dart';
import '../../../shell/application/tab_reselect.dart';
import '../../application/status_navigation.dart';
import '../../data/status_models.dart';
import '../../status_providers.dart';
import '../../share/bloc/status_share_bloc.dart';
import '../../share/bloc/status_share_event.dart';
import '../../share/bloc/status_share_state.dart';
import '../../share/presentation/status_story_share_sheet.dart';
import '../../status_analytics.dart';
import '../bloc/status_feed_bloc.dart';
import '../bloc/status_feed_event.dart';
import '../bloc/status_feed_state.dart';
import 'status_credit_chip.dart';
import 'status_report_menu.dart';
import 'status_report_sheet.dart';
import 'status_widgets.dart';

/// Status Home (Figma frame `302:4384`) — the module's only feed surface.
///
/// Header (`Status` + Edit Details) → deity filter row → the vertical
/// reels-like feed with ONE active card (media + the composited overlay
/// template + the engagement footer). The five-item bottom nav comes from the
/// TAM-58 shell, which hosts this screen as its Status branch.
///
/// Everything here is FREE. The only Pro gate is the Share CTA, and it gates via
/// `StatusShareBloc` — the paywall opens BEFORE any render (PRD §5, §8).
///
/// [pinnedStatusId] (TAM-166): when set, the FIRST feed fetch asks the backend
/// to prepend that status card and dedupe it from the tail. Used by the chat
/// status-card tap, which routes here via `/status?pinnedId=<id>` — this same
/// page, so the bottom nav stays visible. A new pin arriving while the page is
/// already mounted reloads the feed ([State.didUpdateWidget]).
class StatusHomeScreen extends ConsumerStatefulWidget {
  const StatusHomeScreen({super.key, this.pinnedStatusId});

  final String? pinnedStatusId;

  @override
  ConsumerState<StatusHomeScreen> createState() => _StatusHomeScreenState();
}

class _StatusHomeScreenState extends ConsumerState<StatusHomeScreen> {
  late final StatusShareBloc _shareBloc;
  late final PageController _pageController;

  /// One boundary key per card index — the share render captures the ACTIVE
  /// card's hero subtree (media + overlay), never a detached re-render.
  final Map<String, GlobalKey> _boundaryKeys = {};

  /// Whether the blocking "Preparing your video status…" dialog is currently
  /// on the navigator stack. We show it only for VIDEO renders (image is
  /// fast enough that a modal would just flash) and dismiss it the moment
  /// the state leaves `rendering`, no matter which terminal state comes next.
  bool _renderingDialogUp = false;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    _shareBloc = buildStatusShareBloc(context, ref);
    // TAM-166 — the screen owns the initial feed dispatch, so the chat
    // pinned-deep-link (which comes in through `/status?pinnedId=<id>` with
    // `pinnedStatusId` on the constructor) can pass its id through in the
    // same call the tab-branch entry (`/status`, no id) already makes.
    // Subsequent load-more / refresh calls do NOT re-send the pin (bloc
    // enforces this — see `_onStarted` / `_onMoreRequested`).
    context
        .read<StatusFeedBloc>()
        .add(StatusFeedStarted(pinnedStatusId: widget.pinnedStatusId));
  }

  @override
  void didUpdateWidget(StatusHomeScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Chat pinned a different status onto the already-mounted Status page:
    // back to the first card and reload with the pin. A pin being CLEARED
    // (the Status tab re-tapped → `/status`) is left to the tab-reselect
    // refresh, so the feed isn't loaded twice.
    final pin = widget.pinnedStatusId;
    if (pin == null || pin == oldWidget.pinnedStatusId) return;
    if (_pageController.hasClients) _pageController.jumpToPage(0);
    context.read<StatusFeedBloc>().add(StatusFeedStarted(pinnedStatusId: pin));
  }

  @override
  void dispose() {
    _pageController.dispose();
    _shareBloc.close();
    super.dispose();
  }

  /// Status tab re-tapped while already on Status: back to the first card and
  /// reload the feed. Jumping BEFORE the reload also resets the PageView's
  /// stored page, so the rebuilt feed opens on card 0, not the old index.
  void _onReselected() {
    if (_pageController.hasClients && (_pageController.page ?? 0) != 0) {
      _pageController.jumpToPage(0);
    }
    context.read<StatusFeedBloc>().add(const StatusFeedRefreshRequested());
  }

  GlobalKey _boundaryFor(String id) =>
      _boundaryKeys.putIfAbsent(id, GlobalKey.new);

  void _onShareState(BuildContext context, StatusShareState state) {
    final messenger = ScaffoldMessenger.of(context);
    // Manage the blocking "Preparing your video status…" modal — shown for
    // video renders only (image renders finish too fast for a modal to be
    // useful). Kept outside the switch so the dismiss fires on ANY terminal
    // transition (shared / failed / unsupported / cancelled) — we must
    // never leave the dialog stranded on the navigator.
    if (state.isRenderingVideo && !_renderingDialogUp) {
      _renderingDialogUp = true;
      // Explicit `useRootNavigator: true` (default, but stated for symmetry
      // with the pop below). The dialog MUST push onto the root navigator
      // — the go_router shell's inner navigator only holds one page (the
      // Status home) and popping a modal dialog off it would crash with
      // "You have popped the last page off of the stack".
      showDialog<void>(
        context: context,
        barrierDismissible: false,
        barrierColor: AppColors.booksDrawerScrim,
        useRootNavigator: true,
        builder: (_) => const _StatusRenderingDialog(),
      );
    } else if (!state.isRenderingVideo && _renderingDialogUp) {
      _renderingDialogUp = false;
      // Pop on the SAME navigator showDialog pushed to (the root) — else
      // we'd pop the go_router shell's only page and trigger go_router's
      // `currentConfiguration.isNotEmpty` assertion. `canPop()` guards
      // against a stale flag: if the dialog was already dismissed by some
      // other path, `canPop` returns false on the root navigator (only the
      // MaterialApp home remains) and we don't pop anything.
      final rootNav = Navigator.of(context, rootNavigator: true);
      if (rootNav.canPop()) rootNav.pop();
    }

    switch (state.status) {
      case StatusShareStatus.failed:
      case StatusShareStatus.unsupported:
        messenger.showSnackBar(
          SnackBar(
            content: Text(state.message ?? StatusShareState.failedCopy),
          ),
        );
        _shareBloc.add(const StatusShareMessageCleared());
      case StatusShareStatus.idle:
      case StatusShareStatus.awaitingPaywall:
      case StatusShareStatus.rendering:
      case StatusShareStatus.shared:
      case StatusShareStatus.cancelled:
        break;
    }
  }

  /// Opens the details editor. TAM-168 — always the personal editor (Business
  /// tab is gone), tagged with the [entrySource] that pushed the route so
  /// `status_personal_details_page_viewed` attributes the funnel entry.
  Future<void> _openDetails(
    BuildContext context,
    StatusFeedState state, {
    String? entryMessage,
    String entrySource = StatusEntrySources.editDetailsButton,
  }) async {
    // Grab the bloc BEFORE the await so nothing reads `context` across the gap.
    final feedBloc = context.read<StatusFeedBloc>();
    // Sheet 1 row 87 — `status_edit_details_clicked`. Only fired for the pill
    // entry (the strip fires its own `status_add_details_strip_clicked`).
    if (entrySource == StatusEntrySources.editDetailsButton) {
      unawaited(ref.read(analyticsProvider)?.trackEvent(
            StatusEvents.editDetailsClicked,
            properties: {
              StatusEventProps.profileType:
                  state.profile.activeProfileType.name,
              StatusEventProps.sourceScreen: 'status_home',
            },
          ));
    }
    // `entryMessage` (when set) renders as a toast on the destination on
    // first mount. TAM-168 — the mobile app always renders personal, so
    // `initialType` is fixed regardless of what the server row says.
    await pushStatusDetails(
      context,
      initialType: StatusProfileType.personal,
      entryMessage: entryMessage,
      entrySource: entrySource,
    );
    if (!mounted) return;
    // Whatever was saved drives the overlay — just re-read the active profile.
    feedBloc.add(const StatusFeedProfileRefreshed());
  }

  /// TAM-168 — fires when the empty-state overlay strip is tapped on the
  /// active card. Emits `status_add_details_strip_clicked` BEFORE the push
  /// so a slow route never loses the funnel event, then opens the details
  /// editor tagged as `entry_source = add_details_strip`.
  void _onEmptyStripTap(
    BuildContext context,
    StatusFeedState state,
    StatusFeedItem item,
  ) {
    unawaited(ref.read(analyticsProvider)?.trackEvent(
          StatusEvents.addDetailsStripClicked,
          properties: {
            StatusEventProps.statusId: item.id,
            // `has_existing_details` used to be hardcoded `false` here (the
            // strip's tap handler is only wired when `!hasNameOrPhoto`). The
            // global `has_name` / `has_photo` pair now reports the same fact
            // on this event, read from the store rather than asserted by the
            // call site — so a stale-profile edge case shows up as a real
            // disagreement instead of being papered over by a constant.
            StatusEventProps.entrySource: StatusEntrySources.addDetailsStrip,
            StatusEventProps.destinationScreen:
                StatusDestinationScreens.personalDetails,
          },
        ));
    unawaited(_openDetails(
      context,
      state,
      entrySource: StatusEntrySources.addDetailsStrip,
    ));
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<TabReselect?>(tabReselectProvider, (_, next) {
      if (next?.branchIndex == ShellBranch.status) _onReselected();
    });
    return BlocProvider<StatusShareBloc>.value(
      value: _shareBloc,
      child: Scaffold(
        key: const Key('status-home-screen'),
        backgroundColor: AppColors.scaffoldWarm,
        body: SafeArea(
          bottom: false,
          child: BlocConsumer<StatusFeedBloc, StatusFeedState>(
            listenWhen: (a, b) =>
                b.errorMessage != null && a.errorMessage != b.errorMessage,
            listener: (context, state) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(state.errorMessage!)),
              );
              context.read<StatusFeedBloc>().add(const StatusFeedErrorCleared());
            },
            builder: (context, state) {
              return Column(
                children: [
                  _Header(
                    onEdit: () => _openDetails(context, state),
                    hasNameOrPhoto: state.profile.hasNameOrPhoto,
                  ),
                  _DeityRow(state: state),
                  const SizedBox(height: AppStatus.deityRowToFeedGap),
                  Expanded(child: _buildFeed(context, state)),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildFeed(BuildContext context, StatusFeedState state) {
    if (state.isLoading) {
      return const Center(
        key: Key('status-feed-loading'),
        child: CircularProgressIndicator(color: AppColors.brand300),
      );
    }
    if (state.status == StatusFeedStatus.failure && state.items.isEmpty) {
      return _EmptyState(
        key: const Key('status-feed-error'),
        title: 'Could not load status',
        subtitle: 'Please check your connection and try again.',
        actionLabel: 'Retry',
        onAction: () =>
            context.read<StatusFeedBloc>().add(const StatusFeedStarted()),
      );
    }
    if (state.isEmpty) {
      // Empty deity filter → calm empty state + All Gods recovery (§6.3).
      return _EmptyState(
        key: const Key('status-feed-empty'),
        title: 'No status here yet',
        subtitle: 'Try another deity, or browse All Gods.',
        actionLabel: 'All Gods',
        onAction: () => context
            .read<StatusFeedBloc>()
            .add(const StatusFeedDeitySelected(null)),
      );
    }

    return PageView.builder(
      key: const Key('status-feed-pageview'),
      controller: _pageController,
      scrollDirection: Axis.vertical,
      onPageChanged: (i) =>
          context.read<StatusFeedBloc>().add(StatusFeedIndexChanged(i)),
      itemCount: state.items.length,
      itemBuilder: (context, index) => _StatusCard(
        item: state.items[index],
        state: state,
        active: index == state.activeIndex,
        boundaryKey: _boundaryFor(state.items[index].id),
        onNext: index + 1 < state.items.length
            ? () {
                context
                    .read<StatusFeedBloc>()
                    .add(StatusFeedIndexChanged(index + 1, viaNext: true));
                _pageController.nextPage(
                  duration: const Duration(milliseconds: 250),
                  curve: Curves.easeOut,
                );
              }
            : null,
        onShareState: _onShareState,
        onEmptyStripTap: _onEmptyStripTap,
      ),
    );
  }
}

/// Header (Figma node `302:4928`) — the `Status` title + the Edit Details pill.
/// The nav's avatar/gear/phone slots are `visible:false` in Figma and are
/// correctly not rendered.
///
/// TAM-168 — the pill label is state-based:
///  * `अपना फोटो डालें` when the profile has no saved name/photo
///  * `अपना फोटो बदलें` when a name OR photo is saved
class _Header extends StatelessWidget {
  const _Header({required this.onEdit, required this.hasNameOrPhoto});
  final VoidCallback onEdit;
  final bool hasNameOrPhoto;

  static const String _pillAdd = 'अपना फोटो डालें';
  static const String _pillEdit = 'अपना फोटो बदलें';

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: AppStatus.headerHeight,
      child: Padding(
        padding: const EdgeInsets.only(
          left: AppStatus.headerPaddingLeft,
          right: AppStatus.headerPaddingRight,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            // Flexible + ellipsis so the title yields to the Edit Details CTA
            // rather than overflowing at large system text scales.
            Flexible(
              child: Text(
                'Status',
                key: const Key('status-title'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.headingSm(color: AppColors.statusTitle),
              ),
            ),
            const SizedBox(width: AppSpacing.xSmall),
            StatusEditDetailsPill(
              onTap: onEdit,
              label: hasNameOrPhoto ? _pillEdit : _pillAdd,
            ),
          ],
        ),
      ),
    );
  }
}

/// The shared TAM-58 deity filter (Figma node `307:1405`). Presentation only —
/// this screen owns the fetch via `deitiesProvider` and drives the feed query.
class _DeityRow extends ConsumerWidget {
  const _DeityRow({required this.state});
  final StatusFeedState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DeityFilterRow(
      deities: ref.watch(deitiesProvider),
      selectedSlug: state.deitySlug,
      onSelected: (slug) =>
          context.read<StatusFeedBloc>().add(StatusFeedDeitySelected(slug)),
    );
  }
}

/// One feed card (Figma node `I330:6125;322:1721`) — the engagement footer above
/// the hero preview, exactly as the design stacks them.
class _StatusCard extends ConsumerWidget {
  const _StatusCard({
    required this.item,
    required this.state,
    required this.active,
    required this.boundaryKey,
    required this.onNext,
    required this.onShareState,
    required this.onEmptyStripTap,
  });

  final StatusFeedItem item;
  final StatusFeedState state;
  final bool active;
  final GlobalKey boundaryKey;
  final VoidCallback? onNext;
  final void Function(BuildContext, StatusShareState) onShareState;

  /// TAM-168 — fires when the user taps the empty-state overlay strip on
  /// this card. Ignored when the profile is filled (the strip is
  /// non-interactive in that case; the top-right pill is the only edit
  /// path). Handler owns analytics + navigation.
  final void Function(BuildContext, StatusFeedState, StatusFeedItem)
      onEmptyStripTap;

  /// Handle a Share tap: present the story-share sheet → dispatch the render
  /// with the picked target. Kept on the card widget (rather than the parent
  /// screen) so each card owns its own per-card `boundaryKey` capture
  /// without extra plumbing.
  ///
  /// TAM-168 — the `hasActiveDetails` bounce is gone. An empty-profile Pro
  /// user opens the share sheet directly and ships a deity-only creative
  /// (the render service's empty branch skips the overlay burn-in). The Pro
  /// gate at `StatusShareBloc._onRequested` is UNTOUCHED — a free user
  /// still hits the paywall before any render runs.
  Future<void> _onSharePressed(
    BuildContext context,
    WidgetRef ref,
  ) async {
    final launcher = ref.read(storyShareLauncherProvider);
    final shareBloc = context.read<StatusShareBloc>();
    final analytics = ref.read(analyticsProvider);

    // One id for this whole attempt, minted HERE — the earliest point the
    // user has expressed share intent — and threaded through the sheet and
    // then the bloc so all six funnel events join. A second Share tap mints
    // a second id, which is the point: two attempts must not merge.
    final shareSessionId = newUuidV4();
    final tappedAt = DateTime.now();
    final mediaType = item.mediaType.name;
    // Read live, matching how the bloc reads it at every one of its own call
    // sites: a free user who buys mid-flow must show `false` here and `true`
    // downstream. That step IS the conversion signal.
    final isPro = ref.read(entitlementProvider);
    // The tapped card's own position, not `state.activeIndex` — they agree
    // today (only the active card's CTA is reachable) but the lookup stays
    // correct if that ever stops being true. `-1` (item no longer in the
    // list) reports as null rather than a bogus index.
    final positionIndex = state.items.indexWhere((e) => e.id == item.id);

    // Fires BEFORE anything async: no profile read, no installed-apps probe,
    // no Pro gate. Everything below this line can fail or be abandoned, and
    // that is exactly the drop-off this event exists to expose.
    unawaited(analytics?.trackEvent(
      StatusEvents.shareCtaClicked,
      properties: {
        StatusEventProps.shareSessionId: shareSessionId,
        StatusEventProps.statusId: item.id,
        StatusEventProps.mediaType: mediaType,
        StatusEventProps.sourceScreen: StatusShareSourceScreens.statusFeed,
        StatusEventProps.positionIndex: positionIndex < 0 ? null : positionIndex,
        StatusEventProps.isProAtEvent: isPro,
      },
    ));

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
    if (target == null) return; // dismissed — the CTA stays usable, no render ran
    shareBloc.add(StatusShareRequested(
      item: item,
      profile: state.profile,
      boundaryKey: boundaryKey,
      target: target,
      shareSessionId: shareSessionId,
    ));
  }

  /// Kebab tapped: show the two-item menu, then the matching report sheet,
  /// then file the report.
  ///
  /// [chipContext] is the chip's own context — the menu anchors to its
  /// `RenderBox`, so it must not be the card's context.
  Future<void> _onReportMenuTap(BuildContext chipContext, WidgetRef ref) async {
    final anchor = chipContext.findRenderObject();
    if (anchor is! RenderBox) return;

    final kind = await showStatusReportMenu(
      context: chipContext,
      anchor: anchor,
    );
    if (kind == null) return;
    if (!chipContext.mounted) return;

    // No prefill: `MeUser` carries no email, because a phone account does not
    // have one. Figma shows the field pre-filled, but for an OTP account there
    // is nothing to fill it with.
    final submission = await showStatusReportSheet(
      context: chipContext,
      kind: kind,
    );
    if (submission == null) return;
    if (!chipContext.mounted) return;

    // Captured BEFORE the await. Reading it off a context afterwards is the
    // classic "Looking up a deactivated widget\'s ancestor" crash — the sheet
    // has already popped by the time this resolves.
    final messenger = ScaffoldMessenger.of(chipContext);
    try {
      await ref.read(statusRepositoryProvider).submitReport(
            statusId: item.id,
            type: kind.wireValue,
            reporterEmail: submission.email,
            reason: submission.reason,
          );
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(content: Text('Reported successfully')),
        );
    } catch (e) {
      // A failed report must never look like a successful one.
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(content: Text(_reportErrorMessage(e))),
        );
    }
  }

  static String _reportErrorMessage(Object error) {
    final message = error is ApiException ? error.message.trim() : '';
    return message.isNotEmpty
        ? message
        : 'Could not send your report. Please try again.';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // `Padding` gives horizontal breathing room instead of `Container.margin`
    // so the card can stretch to the FULL bounded height its slot provides.
    // (With the previous `Align` + `Container(width: infinity, margin: ...)`
    // pair, Container inferred its height from the child Column; the
    // Column's `mainAxisSize.min` + `Expanded` combination has undefined
    // main-axis size, and Flutter was resolving it by giving Expanded the
    // full available height AND rendering the footer OVER the media —
    // hence the "transparent engagement bar behind the buttons".)
    // Hoisted so the null check promotes inside the Stack's child list — a
    // field access would not promote across the closure boundary below.
    final creator = item.creator;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.large),
      child: Container(
        key: Key('status-card-${item.id}'),
        width: double.infinity,
        decoration: BoxDecoration(
          color: AppColors.statusCardFill,
          border: Border.all(
            color: AppColors.statusCardBorder,
            width: AppStatus.cardBorder,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        // Hero above, engagement footer below — matches the Figma card layout
        // for frame 302:4384. Prior order (footer on top of the media) was
        // mistakenly kept from an earlier iteration. `mainAxisSize.max`
        // forces the Column (and therefore the Container) to fill the
        // bounded height its slot provides, so `Expanded(HeroPreview)`
        // properly reserves space for the footer beneath it.
        child: Column(
          mainAxisSize: MainAxisSize.max,
          children: [
            Expanded(
              // TAM-N — the credit chip is stacked OUTSIDE StatusHeroPreview
              // on purpose. HeroPreview's own Stack lives under the
              // `RepaintBoundary(key: boundaryKey)` that StatusShareBloc
              // screenshots, so anything placed in there is burned into every
              // shared image and video. Adding the chip here keeps the exported
              // creative byte-identical to before this ticket. See the comment
              // block on StatusCreditChip and the share-parity test.
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Positioned.fill(
                    child: StatusHeroPreview(
                      item: item,
                      profile: state.profile,
                      safeArea: item.overlaySafeArea.orFigmaDefault,
                      active: active,
                      boundaryKey: boundaryKey,
                      // TAM-168 — the empty-state strip becomes a discovery
                      // affordance for the details editor when active. On a
                      // filled profile the callback is ignored inside
                      // StatusOverlayBand and the strip stays display-only.
                      onEmptyStripTap: () =>
                          onEmptyStripTap(context, state, item),
                    ),
                  ),
                  // 6 dp in from the media's top-left corner (Figma
                  // `4121:18370`). StatusMuteToggle keeps top:12/right:12, so
                  // the two over-media controls never collide.
                  // `creator` is null only for items synthesized from another
                  // contract (the Home feed). Those carry no attributable
                  // account, so they get no chip — see StatusFeedItem.creator.
                  if (creator != null)
                    Positioned(
                      top: 6,
                      left: 6,
                      child: Builder(
                        builder: (chipContext) => StatusCreditChip(
                          creator: creator,
                          active: active,
                          onMenuTap: () => _onReportMenuTap(chipContext, ref),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            // Explicit ColoredBox behind the footer: the outer card Container's
            // decoration.color is painted UNDER the Column, but the media rendered
            // by HeroPreview above bleeds visually into the footer row here because
            // the card fill isn't re-asserted per-slot in the Column. Painting the
            // card fill again on the footer's slot guarantees the engagement bar
            // sits on the cream card surface — never over the media.
            ColoredBox(
              color: AppColors.statusCardFill,
              child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppStatus.actionsPaddingH,
                vertical: AppStatus.actionsPaddingV,
              ),
              child: BlocConsumer<StatusShareBloc, StatusShareState>(
                listener: onShareState,
                builder: (context, shareState) => StatusEngagementFooter(
                  item: item,
                  rendering: shareState.isRendering && shareState.statusId == item.id,
                  onShare: () => _onSharePressed(context, ref),
                  onLike: () =>
                      context.read<StatusFeedBloc>().add(const StatusFeedLikeToggled()),
                  onNext: onNext,
                ),
              ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Calm empty/error state — never a broken glyph (TAM-58 rule).
class _EmptyState extends StatelessWidget {
  const _EmptyState({
    super.key,
    required this.title,
    required this.subtitle,
    required this.actionLabel,
    required this.onAction,
  });

  final String title;
  final String subtitle;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.large),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: AppText.headingXs()),
            const SizedBox(height: AppSpacing.xSmall),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: AppText.bodySm(color: AppColors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.medium),
            GestureDetector(
              key: const Key('status-empty-action'),
              behavior: HitTestBehavior.opaque,
              onTap: onAction,
              child: Container(
                height: AppStatus.saveBtnHeight,
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.large),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: AppGradient.ctaLR,
                  borderRadius: BorderRadius.circular(AppStatus.saveBtnRadius),
                ),
                child: Text(
                  actionLabel,
                  style: AppText.labelLg(color: AppColors.statusSaveLabel),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Blocking loader shown while a VIDEO status is being prepared for share.
///
/// Video overlay burn-in on-device (FFmpeg re-encode) takes several seconds —
/// long enough that a small spinner on the Share button lets users scroll
/// away mid-render, which loses the export and creates a phantom "nothing
/// happened when I tapped Share" bug report. This modal:
///   * Blocks scroll + taps behind it via `barrierDismissible: false` + a
///     scrim (matches the books drawer scrim).
///   * Blocks the OS back button via `PopScope(canPop: false)` so the user
///     can't dismiss a render that's still writing to cache.
///   * Uses the app's brand-orange spinner + `AppText` type to feel like
///     part of the app, not a Material default.
class _StatusRenderingDialog extends StatelessWidget {
  const _StatusRenderingDialog();

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Center(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: AppSpacing.xLarge),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.large,
            vertical: AppSpacing.large + AppSpacing.xSmall,
          ),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(AppRadius.card),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(
                key: Key('status-rendering-spinner'),
                width: 44,
                height: 44,
                child: CircularProgressIndicator(
                  strokeWidth: 3,
                  valueColor: AlwaysStoppedAnimation(AppColors.brand300),
                ),
              ),
              const SizedBox(height: AppSpacing.large),
              Text(
                'Preparing your status…',
                textAlign: TextAlign.center,
                style: AppText.labelLg(color: AppColors.textPrimary),
              ),
              const SizedBox(height: AppSpacing.xxxSmall),
              Text(
                'This can take a few seconds for videos. Please don’t leave this screen.',
                textAlign: TextAlign.center,
                style: AppText.bodySm(color: AppColors.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
