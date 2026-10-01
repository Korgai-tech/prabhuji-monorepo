import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/core/analytics.dart';
import 'package:mobile/core/entitlement.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/audio/application/audio_providers.dart';
import 'package:mobile/features/home/data/home_repository.dart';
import 'package:mobile/features/home/feed/bloc/home_feed_bloc.dart';
import 'package:mobile/features/home/feed/bloc/home_feed_event.dart';
import 'package:mobile/features/home/home_banner_video_port.dart';
import 'package:mobile/features/home/home_providers.dart';
import 'package:mobile/features/home/presentation/home_screen.dart';
import 'package:mobile/features/status/data/status_repository.dart';
import 'package:mobile/features/status/details/bloc/status_profile_cubit.dart';
import 'package:mobile/features/status/status_providers.dart';
import 'package:mobile/state/providers.dart';
import 'package:visibility_detector/visibility_detector.dart';

import 'fake_audio_engine.dart';
import 'fake_home_services.dart';
import 'fake_repositories.dart';
import 'fake_share_service.dart';

/// Records every route Home pushes, so navigation assertions never need a real
/// module screen (those live behind their own harnesses).
class RouteSpy {
  final List<String> pushed = [];
  String? get last => pushed.isEmpty ? null : pushed.last;
}

/// Home wrapped exactly as the shell wraps a branch.
///
/// Driven by a listenable rather than a plain bool so a test can flip it and
/// pump WITHOUT calling `pumpWidget` again. That matters: `homeTestApp` builds
/// a fresh `GoRouter` on every call, so re-pumping tears the tree down and
/// disposes the screen — which stops audio via `dispose`, not via the gate
/// under test, and the assertion would pass for the wrong reason.
Widget homeBranch({
  required HomeFeedBloc bloc,
  required ValueListenable<bool> tickerEnabled,
}) {
  return ValueListenableBuilder<bool>(
    valueListenable: tickerEnabled,
    child: BlocProvider<HomeFeedBloc>.value(
      value: bloc,
      child: const HomeScreen(),
    ),
    builder: (context, enabled, child) =>
        TickerMode(enabled: enabled, child: child!),
  );
}

/// Wraps [child] in a ProviderScope with the common Home overrides (fake repo,
/// fake audio engine, fake share, seeded entitlement, no analytics) + the real
/// theme, behind a router that records pushes instead of building modules.
Widget homeTestApp({
  required HomeRepository repository,
  required Widget child,
  RouteSpy? routeSpy,
  FakeAudioEngine? engine,
  ShareServiceHolder? shareHolder,
  Analytics? analytics,
  bool isPro = false,
  StatusRepository? statusRepository,
  HomeBannerVideoPortFactory? bannerVideoPortFactory,
}) {
  GoogleFonts.config.allowRuntimeFetching = false;
  // Widget tests must not wait on the real 500ms visibility debounce.
  VisibilityDetectorController.instance.updateInterval = Duration.zero;

  final spy = routeSpy ?? RouteSpy();
  final router = GoRouter(
    initialLocation: '/home',
    routes: [
      GoRoute(path: '/home', builder: (context, state) => child),
      // Every destination Home can reach, stubbed: the assertion is WHICH route
      // was pushed, not what the module renders. The MATCHED location (path
      // params filled in) is read from the builder's `state` — `GoRouterState.of`
      // depends on an inherited widget and cannot be called from initState.
      for (final path in _stubRoutes)
        GoRoute(
          path: path,
          builder: (context, state) => _RouteProbe(
            path: path,
            location: state.uri.toString(),
            spy: spy,
          ),
        ),
    ],
  );

  // The `_StatusHero` widget reads the app-scoped `StatusProfileCubit` on
  // mount to render the overlay band. In production this cubit is provided
  // in `main.dart`; in tests we wrap the app in a `BlocProvider` here so
  // status cards render without needing every home test to know about it.
  final statusRepo = statusRepository ?? FakeStatusRepository();
  return ProviderScope(
    overrides: [
      homeRepositoryProvider.overrideWithValue(repository),
      audioEngineProvider.overrideWith((ref) => engine ?? FakeAudioEngine()),
      analyticsProvider.overrideWithValue(analytics),
      shareServiceProvider
          .overrideWithValue(shareHolder?.service ?? FakeShareService()),
      entitlementStateProvider.overrideWith(() => _SeededEntitlement(isPro)),
      statusRepositoryProvider.overrideWithValue(statusRepo),
      // Banner video: a deterministic fake by default, so no home test ever
      // touches a real codec just because a fixture happens to be a video.
      homeBannerVideoPortFactoryProvider.overrideWithValue(
        bannerVideoPortFactory ?? FakeHomeBannerVideoPort.new,
      ),
    ],
    child: BlocProvider<StatusProfileCubit>(
      create: (_) => StatusProfileCubit(repository: statusRepo),
      child: MaterialApp.router(
        theme: AppTheme.light(),
        routerConfig: router,
      ),
    ),
  );
}

/// The real paths of the already-built modules Home links to (mirrors
/// `HomeDestinations`), plus the paywall.
const List<String> _stubRoutes = [
  '/paywall',
  '/wallpaper',
  '/status',
  '/aarti-bhajans',
  '/aarti-bhajans/audio/:audioId',
  '/mantras',
  '/ringtones',
  '/ringtones/preview/:id',
  '/horoscope',
  '/books',
];

class _RouteProbe extends StatefulWidget {
  const _RouteProbe({
    required this.path,
    required this.location,
    required this.spy,
  });
  final String path;
  final String location;
  final RouteSpy spy;

  @override
  State<_RouteProbe> createState() => _RouteProbeState();
}

class _RouteProbeState extends State<_RouteProbe> {
  @override
  void initState() {
    super.initState();
    widget.spy.pushed.add(widget.location);
  }

  @override
  Widget build(BuildContext context) =>
      Scaffold(key: Key('probe-${widget.path}'), body: const SizedBox());
}

class _SeededEntitlement extends EntitlementNotifier {
  _SeededEntitlement(this._seed);
  final bool _seed;
  @override
  Entitlement build() => Entitlement(granted: _seed, until: null);
}

/// Advance the clock enough for the fake repo's futures, the bloc's short dwell
/// timer, and a go_router push transition (~300ms) — WITHOUT `pumpAndSettle`.
///
/// `pumpAndSettle` is unusable on Home: a banner's `mediaUrl` must be non-empty
/// (the bloc drops blank-media banners per PRD §8), which puts `AppNetworkImage`
/// into its **Shimmer** placeholder, and that animation never ends — so
/// `pumpAndSettle` always times out. Every other module's fixtures dodge this by
/// using empty URLs (→ the branded fallback, no animation); the banner carousel
/// can't. Bounded pumps are therefore the correct tool here, not a workaround.
Future<void> homeSettle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

/// Pumps Home with a loaded [HomeFeedBloc].
///
/// [viewThreshold] is short by default: the real 2s dwell (AppHome.viewThreshold)
/// would leave a pending Timer at teardown, tripping flutter_test's
/// `!timersPending` invariant. Tests that assert the threshold ITSELF pass their
/// own value and pump around it.
Future<HomeFeedBloc> pumpHome(
  WidgetTester tester, {
  required HomeRepository repository,
  RouteSpy? routeSpy,
  FakeAudioEngine? engine,
  ShareServiceHolder? shareHolder,
  Analytics? analytics,
  bool isPro = false,
  Duration viewThreshold = const Duration(milliseconds: 10),
  double viewportHeight = 1600,
  bool settle = true,
  StatusRepository? statusRepository,
  HomeBannerVideoPortFactory? bannerVideoPortFactory,
  /// Stands in for the shell branch being active.
  ///
  /// go_router's `StatefulShellRoute.indexedStack` wraps every branch in
  /// `TickerMode(enabled: isActive, …)`, so flipping this is what a tab switch
  /// away from Home actually looks like to the widgets underneath. Pass a
  /// notifier and set `.value = false` mid-test to simulate the swap; Home is
  /// always wrapped, so no tree shape changes and no `State` is lost.
  ValueNotifier<bool>? tickerSwitch,
}) async {
  tester.view.physicalSize = Size(360, viewportHeight);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final bloc = HomeFeedBloc(
    repository: repository,
    analytics: analytics,
    viewThreshold: viewThreshold,
  )..add(const HomeStarted());
  addTearDown(bloc.close);

  await tester.pumpWidget(homeTestApp(
    repository: repository,
    routeSpy: routeSpy,
    engine: engine,
    shareHolder: shareHolder,
    analytics: analytics,
    isPro: isPro,
    statusRepository: statusRepository,
    bannerVideoPortFactory: bannerVideoPortFactory,
    child: homeBranch(
      bloc: bloc,
      tickerEnabled: tickerSwitch ?? ValueNotifier<bool>(true),
    ),
  ));
  if (settle) {
    await homeSettle(tester);
    // Let the dwell timer elapse + its view POST settle.
    await tester.pump(viewThreshold + const Duration(milliseconds: 5));
    await homeSettle(tester);
  }
  return bloc;
}
