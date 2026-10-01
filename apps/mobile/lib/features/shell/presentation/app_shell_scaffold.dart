import 'dart:async';

import 'package:flutter/material.dart';
// ignore: unnecessary_import — the analyzer flags this as redundant because
// `material.dart` re-exports most of `services.dart`, but `SystemNavigator`
// itself is NOT in that re-export list, so calling `SystemNavigator.pop()`
// below (the Android app-exit hook) fails to resolve without this import.
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../../core/analytics.dart';
import '../../../core/jwt.dart';
import '../../../core/services/clarity_service.dart';
import '../../../core/theme.dart';
import '../../../state/providers.dart';
import '../../audio/presentation/shell_mini_player_host.dart';
import '../../chat/application/chat_bloc.dart';
import '../../chat/chat_analytics.dart';
import '../../chat/chat_routes.dart';
import '../../downloads/application/offline_watcher.dart';
import '../../downloads/downloads_analytics.dart';
import '../../downloads/downloads_providers.dart';
import '../../downloads/downloads_routes.dart';
import '../../downloads/presentation/widgets/offline_placeholder.dart';
import '../../home/home_analytics.dart';
import '../../home/home_routes.dart';
import '../../horoscope/horoscope_routes.dart';
import '../../status/status_routes.dart';
import '../application/tab_reselect.dart';

/// Persistent post-onboarding home area (TAM-58 AC-a, extended by TAM-164 to a
/// five-branch shell). Hosts a bottom nav over a [StatefulNavigationShell] so
/// each tab keeps its own navigation stack + scroll position across switches
/// (IndexedStack behaviour).
///
/// Rendered per Figma nav `2612:18143` (the TAM-164 5-tab target: Home /
/// **Chat** / Status / Downloads / **Rashifal**): white 64px bar, five tabs,
/// 20px glyph in a 36px frame with a 12/16 caption; active =
/// `AppColors.navActive` (#FC7304), inactive = `AppColors.navInactive`
/// (#767676). Books remains reachable as a top-level route pushed over the
/// shell (home shortcut / deep link entry points still work); Mandir is fully
/// retired.
///
/// TAM-164 shell-level rules:
///
///  * The chat branch is ALWAYS registered on `StatefulShellRoute` (index 1)
///    — `IndexedStack` requires a stable branch count — but it has NO nav
///    tab: the entry is Home's extended FAB (`HomeChatFab`), which routes
///    through `openChatFromShell`.
///  * The bottom nav is HIDDEN entirely while the chat branch is active
///    (`navigationShell.currentIndex == _chatBranchIndex`) — every Figma
///    chat frame renders WITHOUT the bottom nav. The mini-player above the
///    nav stays (chat + mini-player coexist per Figma `2612:17787`).
///  * Opening chat is Pro-gated through `PaywallGate.run` with
///    `PaywallEntrySource.chat` — a non-Pro user must never mount the chat
///    branch even for a frame.
class AppShellScaffold extends ConsumerStatefulWidget {
  const AppShellScaffold({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  /// Home is branch 0 (see `router.dart`). Back-press from any other branch
  /// collapses the stack to Home; back-press on Home shows the exit toast.
  static const int _homeBranchIndex = 0;

  /// Window during which a second back press triggers `SystemNavigator.pop()`.
  /// 2 s matches the Android platform default across YouTube/Chrome/Instagram.
  static const Duration _exitTapWindow = Duration(seconds: 2);

  /// Stable Clarity screen names for the five shell tabs. Kept aligned with
  /// the `GoRoute.name:` on each branch's root route so tab-driven
  /// navigation (which does NOT push a route and therefore never fires
  /// `ClarityNavigatorObserver`) tags the timeline consistently with
  /// deep-links into the same screens. Keep these strings stable across
  /// releases — Clarity funnels reference them by string.
  ///
  /// TAM-164 — grown from 4 → 5 entries, chat inserted at index 1, horoscope
  /// re-labelled `rashifal-main` and moved to index 4.
  static const List<String> _clarityTabNames = <String>[
    'home',
    'chat',
    'status-home',
    'downloads-library',
    'rashifal-main',
  ];

  @override
  ConsumerState<AppShellScaffold> createState() => _AppShellScaffoldState();
}

/// Downloads branch index in `kShellDestinations`. The only branch that
/// renders meaningful content while offline — every other branch is replaced
/// with an [OfflinePlaceholder] until connectivity resumes.
///
/// TAM-164 — chat is inserted at index 1, so downloads coincidentally stays
/// at index 3 in the new order (Home / Chat / Status / **Downloads** /
/// Rashifal). No other index change needed here.
const int _downloadsBranchIndex = 3;

/// Chat branch index in `kShellDestinations` (TAM-164). Used by:
///
///  * `_BottomNav` — to always filter the chat destination out of the
///    visible tab row (chat is entered via the Home FAB, `openChatFromShell`).
///  * `AppShellScaffold.build` — to hide the entire `_BottomNav` widget
///    while chat is active (spec §Layout intent — every Figma chat frame
///    renders without a bottom nav).
const int _chatBranchIndex = ShellBranch.chat;

class _AppShellScaffoldState extends ConsumerState<AppShellScaffold> {
  DateTime? _lastBackPressAt;
  int? _lastKnownTabIndex;

  /// Tracks the last-known offline value so `app_offline_mode_entered` fires
  /// exactly once per online → offline transition (spec §Analytics). Null
  /// until the first non-loading `isOfflineProvider` emission.
  bool? _lastKnownOffline;

  @override
  void initState() {
    super.initState();
    _lastKnownTabIndex = widget.navigationShell.currentIndex;

    // ClarityService (TAM-127) initialises HERE, not in main.dart — the
    // shell is only mounted for authenticated users, so `sub` from the
    // stored JWT is always available. Post-frame so a MediaQuery ancestor
    // is guaranteed (Clarity's SDK asserts on this in obfuscated builds).
    // The seam short-circuits in debug/profile, on placeholder secrets,
    // and on same-user re-mount, so this call is safe to make on every
    // shell mount.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final token = ref.read(authStoreProvider).read();
      final userId = token == null
          ? null
          : decodeJwtClaims(token)?['sub'] as String?;
      unawaited(ClarityService().initialize(context, userId: userId));
    });
  }

  @override
  Widget build(BuildContext context) {
    // Tab switches don't push routes, so ClarityNavigatorObserver never
    // fires for them. Detect the transition here (widget rebuilds on
    // branch change because `StatefulNavigationShell` calls
    // `notifyListeners`) and forward a stable screen name + Tab event.
    final currentIndex = widget.navigationShell.currentIndex;
    if (_lastKnownTabIndex != currentIndex) {
      final previousIndex = _lastKnownTabIndex;
      _lastKnownTabIndex = currentIndex;
      if (currentIndex >= 0 &&
          currentIndex < AppShellScaffold._clarityTabNames.length) {
        final name = AppShellScaffold._clarityTabNames[currentIndex];
        ClarityService().setCurrentScreen(name);
        ClarityService().event('Tab: $name');
      }
      // Fire chat_page_viewed / chat_closed on every branch change into /
      // out of the chat tab so analytics sees every visit as its own
      // pair — not once per bloc lifetime. Uses the same delta signal as
      // Clarity above, so back-to-Home (PopScope), app-bar back, and
      // ALL other navigation paths that shift `navigationShell.currentIndex`
      // are covered by one hook. First-mount entry is dispatched by the
      // bloc's `_onStarted` itself (this static ref is null before the
      // BlocProvider creates the bloc; the call is a safe no-op then).
      if (previousIndex == _chatBranchIndex && currentIndex != _chatBranchIndex) {
        ChatBloc.notifyExited(ChatExitReason.tabSwitch);
      }
      if (currentIndex == _chatBranchIndex && previousIndex != _chatBranchIndex) {
        ChatBloc.notifyEntered();
      }
    }

    // TAM-125 — offline UX. The Downloads branch is fully functional
    // offline; every other branch renders an OfflinePlaceholder in its
    // body while the device is offline, and the non-Downloads nav tabs
    // become non-tappable + visually dimmed. All decided from a single
    // `isOfflineProvider` read; no per-screen changes.
    final offline = ref.watch(isOfflineProvider).maybeWhen(
      data: (v) => v,
      orElse: () => false,
    );
    // Fire `app_offline_mode_entered` on the online → offline edge only.
    if (_lastKnownOffline != null && _lastKnownOffline != offline && offline) {
      unawaited(ref.read(analyticsProvider)?.trackEvent(
        DownloadsEvents.appOfflineModeEntered,
        properties: <String, Object?>{
          DownloadsEventProps.downloadCount:
              ref.read(downloadManagerProvider).snapshot.items.length,
          DownloadsEventProps.sourceScreen: 'shell',
        },
      ));
    }
    _lastKnownOffline = offline;

    final bool showOfflinePlaceholder =
        offline && currentIndex != _downloadsBranchIndex;
    return PopScope(
      // Every system back-press hits `_handlePop`; Flutter only routes it here
      // once the active branch's inner Navigator has nothing left to pop (a
      // deep-stack back like Status → details still pops normally).
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        _handlePop();
      },
      child: Scaffold(
        backgroundColor: AppColors.cardSurface,
        // While offline (and NOT on the Downloads branch), the Downloads
        // module's OfflinePlaceholder replaces the branch content. This
        // keeps the branch's own state alive underneath (IndexedStack) —
        // the user's home scroll position, status feed, horoscope
        // selection all resume unchanged when connectivity returns.
        body: showOfflinePlaceholder
            ? const OfflinePlaceholder()
            : widget.navigationShell,
        // Mini-player (TAM-59) sits directly above the bottom nav so active audio
        // stays visible while the user navigates inside the shell. It renders
        // itself as SizedBox.shrink() unless FULL-mode playback is active, so it
        // costs nothing when idle. Tapping it reopens the full player — the
        // concrete route is wired when the Aarti full player lands (TAM-64).
        //
        // TAM-164 — bottom nav is HIDDEN while the chat branch is active. Every
        // Figma chat frame renders WITHOUT a bottom nav (back-arrow app bar +
        // pinned composer take that role). The mini-player above the nav stays
        // — Figma `2612:17787` shows chat + docked mini-player coexisting.
        //
        // SafeArea(top: false) makes the bottomNavigationBar slot the sole
        // owner of the system-nav inset — same pattern _BottomNav applies to
        // itself. On non-chat tabs the inner SafeArea inside _BottomNav is
        // idempotent (outer already consumed padding.bottom, inner sees zero).
        // On chat, the shell now inflates the slot by the system-nav inset
        // even without _BottomNav, so the chat body ends above the OS gesture
        // area — matches home/status where the feature never touches bottom
        // insets itself.
        bottomNavigationBar: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Mini-player (TAM-59) sits directly above the bottom nav so
              // active audio stays visible while navigating in the shell.
              // ShellMiniPlayerHost inspects the currently-playing item's
              // `AudioModule` and dispatches the "reopen full player" tap to
              // the right module — aarti tap ⇒ aarti player, mantras tap ⇒
              // mantras player. Renders as `SizedBox.shrink()` when idle.
              const ShellMiniPlayerHost(),
              if (currentIndex != _chatBranchIndex)
                _BottomNav(
                  navigationShell: widget.navigationShell,
                  offline: offline,
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _handlePop() {
    final shell = widget.navigationShell;
    if (shell.currentIndex != AppShellScaffold._homeBranchIndex) {
      shell.goBranch(AppShellScaffold._homeBranchIndex);
      _lastBackPressAt = null;
      return;
    }
    final now = DateTime.now();
    final last = _lastBackPressAt;
    if (last != null && now.difference(last) <= AppShellScaffold._exitTapWindow) {
      SystemNavigator.pop();
      return;
    }
    _lastBackPressAt = now;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(
          content: Text('Press back again to exit.'),
          duration: AppShellScaffold._exitTapWindow,
        ),
      );
  }
}

/// Ordered to match the [StatefulShellBranch] order in `router.dart` — index is
/// the branch index.
///
/// TAM-164 — grown from 4 → 5 entries. Chat inserted at index 1 (NEW-badged),
/// Horoscope re-labelled Rashifal and moved to index 4. Final order:
///
///     0. Home
///     1. Chat  (never rendered — `_BottomNav` always filters it out; the
///               entry is the Home FAB. Kept so indices match the branches)
///     2. Status
///     3. Downloads
///     4. Rashifal
//
// Figma-exported nav glyphs (TAM-60). Every asset is downloaded from nav node
// `750:6252` via `tools/figma-export.ts` and traced in
// `tools/figma-assets.manifest.json` — NONE are Material `Icons.*` (STRICT gate,
// TAM-56). Active vs inactive in the design is a flat recolor (orange #FC7304 ↔
// grey #767676), so the three single-tone line icons (Status/Rashifal/Books)
// are tinted at the call site; Home and Chat carry their own colours (see per
// destination notes) and render untinted.
const List<ShellDestination> kShellDestinations = [
  ShellDestination(
    key: 'home',
    label: 'Home',
    // 2-tone badge + WHITE om knockout — a single srcIn tint would erase the om,
    // so BOTH states are exported from Figma and rendered untinted.
    // Nodes: active I750:6252;750:5506;750:5939 / inactive default 750:5912.
    inactiveAsset: 'assets/nav/home_inactive.svg',
    activeAsset: 'assets/nav/home_active.svg',
    tintable: false,
  ),
  // TAM-164 — Chat tab, inserted at index 1. Figma frame `2612:18143` bakes
  // the "NEW" badge into the glyph itself (permanent-branding shape — spec
  // Open Question #3 default), so BOTH exports carry their own colours and
  // render untinted: a `ColorFilter.srcIn` would erase the orange NEW pill's
  // knockout. Slice 2 lands hand-authored SVGs derived from the reference
  // PNG (specs/evidence/TAM-164/figma/2612-18143.png); Slice 3 Phase 6
  // re-exports them via tools/figma-export.ts against the live node.
  // Monochrome ai-chat glyph (Figma node `I2612:18455;750:5545;750:5912`,
  // 20×20). Same tinted-at-call-site pattern as Status/Rashifal — active
  // tints `navActive` (#FC7304), inactive tints `navInactive` (#767676).
  // The "NEW" pill is NOT baked into the SVG — it's a separate `_NavNewBadge`
  // widget overlaid at render time, so it can be flipped on/off (or
  // eventually dismissed after first launch) without swapping assets.
  ShellDestination(
    key: 'chat',
    label: 'Chat',
    inactiveAsset: 'assets/chat/nav_chat.svg',
    activeAsset: 'assets/chat/nav_chat.svg',
    tintable: true,
    showNewBadge: true,
  ),
  ShellDestination(
    key: 'status',
    label: 'Status',
    // Monochrome line icon → tint navActive/navInactive at the call site.
    inactiveAsset: 'assets/nav/status.svg',
    activeAsset: 'assets/nav/status.svg',
    tintable: true,
  ),
  // TAM-125 — Downloads tab. Placed right of Status per the architect
  // audit / designer recommendation. Uses the material glyph as a
  // temporary fallback until the Figma extraction lands
  // (`assets/downloads/nav_downloads.svg` will replace `inactiveAsset` /
  // `activeAsset` once the frame is exported). Tracked in the fidelity
  // sweep-table under `specs/evidence/TAM-125/fidelity/sweep-table.md`.
  ShellDestination(
    key: 'downloads',
    label: 'Downloads',
    inactiveAsset: 'assets/downloads/nav_downloads_inactive.svg',
    activeAsset: 'assets/downloads/nav_downloads_active.svg',
    tintable: true,
  ),
  // TAM-164 — Horoscope tab re-labelled "Rashifal" and moved to index 4.
  // Reuses the existing horoscope glyph (Figma provided no new asset for
  // the rename); if a distinct Rashifal glyph lands in Slice 2 it swaps in
  // via this same entry.
  ShellDestination(
    key: 'rashifal',
    label: 'Rashifal',
    inactiveAsset: 'assets/nav/horoscope.svg',
    activeAsset: 'assets/nav/horoscope.svg',
    tintable: true,
  ),
];

class ShellDestination {
  const ShellDestination({
    required this.key,
    required this.label,
    required this.inactiveAsset,
    required this.activeAsset,
    required this.tintable,
    this.showNewBadge = false,
  });

  final String key;
  final String label;

  /// Figma-exported glyph shown when the tab is NOT selected.
  final String inactiveAsset;

  /// Figma-exported glyph shown when the tab IS selected.
  final String activeAsset;

  /// When true the glyph is a monochrome Figma icon tinted at the call site
  /// (navActive when selected, navInactive otherwise). When false the two Figma
  /// exports already carry the correct colours and render untinted.
  final bool tintable;

  /// TAM-164 — when true, `_NavTab` overlays a `_NavNewBadge` gradient pill
  /// (Figma `2612:18192` pill: 29×14, `linear #FF7200→#FFD4A2`, white "NEW"
  /// text) on top-right of the icon. Off by default so every other tab
  /// stays unchanged. Flip to false to dismiss the badge (e.g. after first
  /// launch, or based on a `SharedPreferences` marker / server flag).
  final bool showNewBadge;
}

class _BottomNav extends ConsumerWidget {
  const _BottomNav({required this.navigationShell, required this.offline});

  final StatefulNavigationShell navigationShell;

  /// TAM-125 — when the device is offline every non-Downloads tab renders
  /// dimmed + non-tappable. Downloads stays fully interactive.
  final bool offline;

  /// Sheet 1 row 38 — resolves a shell tab's `destination.key` to the route
  /// path opened by the tap. Kept local to the shell (the only place that
  /// owns the map between a nav tab and its branch's root route) so the
  /// analytics wiring doesn't drift from the router when a branch changes.
  ///
  /// TAM-164 — added `chat → ChatRoutes.chat` and renamed `horoscope`
  /// to `rashifal → HoroscopeRoutes.main` (path unchanged for deep-link
  /// continuity, see `rashifal_routes.dart` for the alias).
  static String? _destinationScreenFor(String navigationItem) {
    switch (navigationItem) {
      case 'home':
        return HomeRoutes.home;
      case 'chat':
        return ChatRoutes.chat;
      case 'status':
        return StatusRoutes.home;
      case 'downloads':
        return DownloadsRoutes.library;
      case 'rashifal':
        return HoroscopeRoutes.main;
    }
    return null;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final analytics = ref.read(analyticsProvider);
    // The chat destination is never shown: chat's entry is the Home extended
    // FAB (`HomeChatFab`). The branch itself STAYS registered on
    // `StatefulShellRoute` (IndexedStack requires a stable branch count), so
    // the SECOND element of each pair carries the underlying branch index and
    // `goBranch(...)` still targets the right branch.
    final visible = <(ShellDestination, int)>[
      for (var i = 0; i < kShellDestinations.length; i++)
        if (i != _chatBranchIndex) (kShellDestinations[i], i),
    ];
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.navSurface,
        border: Border(
          top: BorderSide(color: AppColors.navDivider),
        ),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: AppNav.height,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              for (final entry in visible)
                _NavTab(
                  destination: entry.$1,
                  selected: navigationShell.currentIndex == entry.$2,
                  // Netflix/Spotify pattern: while offline, only the
                  // Downloads tab is interactive; every other tab renders
                  // dimmed with a null onTap so the tap is a visible no-op.
                  enabled: !offline || entry.$2 == _downloadsBranchIndex,
                  onTap: () => _onTabTapped(
                    context: context,
                    ref: ref,
                    analytics: analytics,
                    destination: entry.$1,
                    branchIndex: entry.$2,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// Common tap handler for every nav tab: `bottom_navigation_clicked`
  /// fires before the branch swap.
  void _onTabTapped({
    required BuildContext context,
    required WidgetRef ref,
    required Analytics? analytics,
    required ShellDestination destination,
    required int branchIndex,
  }) {
    unawaited(analytics?.trackEvent(
      HomeEvents.bottomNavigationClicked,
      properties: {
        HomeEventProps.navigationItem: destination.key,
        HomeEventProps.destinationScreen: _destinationScreenFor(destination.key),
      },
    ));

    final reselected = branchIndex == navigationShell.currentIndex;
    navigationShell.goBranch(
      branchIndex,
      // Re-tapping the active tab pops it to its branch root.
      initialLocation: reselected,
    );
    // Re-tapping the active tab also scrolls its list to the top and
    // refreshes it (Home / Status listen for this).
    if (reselected) {
      ref.read(tabReselectProvider.notifier).reselect(branchIndex);
    }
  }
}

class _NavTab extends StatelessWidget {
  const _NavTab({
    required this.destination,
    required this.selected,
    required this.onTap,
    this.enabled = true,
  });

  final ShellDestination destination;
  final bool selected;
  final VoidCallback onTap;

  /// TAM-125 — false → dimmed + non-tappable (offline mode, non-Downloads).
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final color = selected ? AppColors.navActive : AppColors.navInactive;
    return Expanded(
      child: Opacity(
        opacity: enabled ? 1.0 : 0.35,
        child: InkResponse(
          key: Key('nav-tab-${destination.key}'),
          onTap: enabled ? onTap : null,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              height: AppNav.iconFrame,
              child: Center(
                // Stack so the NEW badge can overlay the top-right corner of
                // the 20×20 glyph on tabs that opt in. `clipBehavior: none`
                // lets the pill overhang the icon's bounding box like Figma.
                child: Stack(
                  clipBehavior: Clip.none,
                  alignment: Alignment.center,
                  children: <Widget>[
                    _NavGlyph(
                      asset: selected
                          ? destination.activeAsset
                          : destination.inactiveAsset,
                      // Monochrome glyphs tint to the state colour; self-coloured
                      // Home/Mandir exports render untinted.
                      tint: destination.tintable ? color : null,
                    ),
                    if (destination.showNewBadge)
                      // Sits BELOW the 20×20 glyph, horizontally centred on
                      // the tab's icon column. `bottom: -6` pulls the pill's
                      // top edge to just below the icon's bottom so the two
                      // barely touch (icon ends at 20 in the Stack, pill's
                      // 14-tall centre sits at ~y+13); `left:0/right:0 +
                      // Align.center` gives us horizontal centring even
                      // though the pill is wider than the 20-dp icon.
                      const Positioned(
                        bottom: -6,
                        left: 0,
                        right: 0,
                        child: Align(
                          alignment: Alignment.center,
                          child: _NavNewBadge(),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            Text(
              destination.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.navLabel(color: color),
            ),
          ],
        ),
        ),
      ),
    );
  }
}

/// Renders a Figma-exported nav glyph (SVG or PNG) at the 20×20 Figma icon size,
/// tinting monochrome SVGs to the passed state colour when [tint] is non-null.
class _NavGlyph extends StatelessWidget {
  const _NavGlyph({required this.asset, this.tint});

  final String asset;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    if (asset.endsWith('.svg')) {
      return SvgPicture.asset(
        asset,
        width: AppNav.iconSize,
        height: AppNav.iconSize,
        colorFilter: tint == null
            ? null
            : ColorFilter.mode(tint!, BlendMode.srcIn),
        // TAM-125 — the Downloads nav glyph is pending Figma extraction;
        // fall back to a material glyph so the tab renders on the shell
        // without a runtime asset-lookup crash. Once
        // `assets/downloads/nav_downloads_*.svg` land, this fallback
        // becomes a no-op (SvgPicture only renders it on load failure).
        placeholderBuilder: (_) => Icon(
          Icons.download_rounded,
          size: AppNav.iconSize,
          color: tint ?? AppColors.grey400,
        ),
      );
    }
    return Image.asset(
      asset,
      width: AppNav.iconSize,
      height: AppNav.iconSize,
      errorBuilder: (_, _, _) => Icon(
        Icons.download_rounded,
        size: AppNav.iconSize,
        color: tint ?? AppColors.grey400,
      ),
    );
  }
}

/// "NEW" pill overlaid on the top-right of the chat nav tab (TAM-164).
///
/// Geometry + fill from Figma `2612:18192` PILLS instance in the Chat nav
/// tab (Bottom Nav Buttons component). 29×14 pill with corner radius 7
/// (fully rounded), left-to-right linear gradient `#FF7200 → #FFD4A2`,
/// white "NEW" text (Inter 8/10 bold — the label the export shows at the
/// component's baked size).
///
/// Kept a pure `const` widget so the shell rebuild stays cheap when the
/// selected tab flips.
class _NavNewBadge extends StatelessWidget {
  const _NavNewBadge();

  static const double _width = 29;
  static const double _height = 14;
  static const double _radius = 7;

  @override
  Widget build(BuildContext context) {
    return const IgnorePointer(
      // The whole tab handles taps — the badge must not consume gestures.
      child: SizedBox(
        width: _width,
        height: _height,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.all(Radius.circular(_radius)),
            gradient: LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              colors: <Color>[
                Color(0xFFFF7200),
                Color(0xFFFFD4A2),
              ],
            ),
          ),
          child: Center(
            child: Text(
              'NEW',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 8,
                height: 1.25,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.2,
                // Explicit fontFamily null → falls through to the app theme's
                // Inter default (Google Fonts / bundled). Keeping it null keeps
                // the const constructor.
              ),
            ),
          ),
        ),
      ),
    );
  }
}
