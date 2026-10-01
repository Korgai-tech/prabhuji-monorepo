import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/core/analytics.dart';
import 'package:mobile/core/entitlement.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/aarti/aarti_providers.dart';
import 'package:mobile/features/aarti/data/aarti_models.dart';
import 'package:mobile/features/aarti/data/aarti_repository.dart';
import 'package:mobile/features/aarti/listing/bloc/aarti_listing_bloc.dart';
import 'package:mobile/features/aarti/listing/bloc/aarti_listing_event.dart';
import 'package:mobile/features/aarti/listing/presentation/aarti_listing_screen.dart';
import 'package:mobile/features/aarti/main/bloc/aarti_main_bloc.dart';
import 'package:mobile/features/aarti/main/bloc/aarti_main_event.dart';
import 'package:mobile/features/aarti/main/presentation/aarti_main_screen.dart';
import 'package:mobile/features/aarti/player/presentation/aarti_player_screen.dart';
import 'package:mobile/features/aarti/aarti_routes.dart';
import 'package:mobile/features/audio/application/audio_providers.dart';
import 'package:mobile/features/audio/domain/audio_engine.dart';
import 'package:mobile/state/providers.dart';

import 'fake_audio_engine.dart';
import 'fake_repositories.dart';
import 'fake_share_service.dart';

/// Wraps [child] in a ProviderScope with the common Aarti test overrides (fake
/// repo, fake audio engine driving the shared AudioController, fake share, no
/// analytics) + the real theme. The overrides list stays inline so its element
/// type is inferred from `ProviderScope` (`Override` isn't part of the public
/// flutter_riverpod export).
Widget aartiTestApp({
  required AartiRepository repository,
  required Widget child,
  FakeAudioEngine? engine,
  Analytics? analytics,
  bool isPro = true,
}) {
  // Mirror main.dart: resolve google_fonts to the bundled Inter/Libre Caslon
  // families instead of hitting fonts.gstatic.com (tests have no network; a
  // non-bundled weight like Inter-Light falls back to the nearest bundled face).
  GoogleFonts.config.allowRuntimeFetching = false;
  return ProviderScope(
    overrides: [
      aartiRepositoryProvider.overrideWithValue(repository),
      analyticsProvider.overrideWithValue(analytics),
      audioEngineProvider.overrideWith((ref) {
        final e = engine ?? FakeAudioEngine();
        ref.onDispose(e.dispose);
        return e;
      }),
      shareServiceProvider.overrideWithValue(FakeShareService()),
      entitlementStateProvider.overrideWith(() => _SeededEntitlement(isPro)),
    ],
    child: MaterialApp(theme: AppTheme.light(), home: child),
  );
}

class _SeededEntitlement extends EntitlementNotifier {
  _SeededEntitlement(this._seed);
  final bool _seed;
  @override
  Entitlement build() => Entitlement(granted: _seed, until: null);
}

/// Pumps the sectioned main page with a loaded [AartiMainBloc].
Future<void> pumpAartiMain(
  WidgetTester tester, {
  required AartiRepository repository,
  Analytics? analytics,
}) async {
  _tallViewport(tester);
  final bloc = AartiMainBloc(repository: repository, analytics: analytics)
    ..add(const AartiMainLoadRequested());
  await tester.pumpWidget(aartiTestApp(
    repository: repository,
    analytics: analytics,
    child: BlocProvider<AartiMainBloc>.value(
      value: bloc,
      child: const AartiMainScreen(),
    ),
  ));
  await tester.pumpAndSettle();
}

/// Pumps the main page behind a real [GoRouter], reporting every
/// [AartiListQuery] a "Show all" pushes.
///
/// The plain [pumpAartiMain] has no router (its screens never navigate), but the
/// Show-all handoff IS the thing under test when we assert that a listing is
/// titled with the SERVER's `section.title` — so this variant exists to capture
/// the pushed query rather than to render the listing.
Future<void> pumpAartiMainWithRouter(
  WidgetTester tester, {
  required AartiRepository repository,
  required void Function(AartiListQuery) onListingPushed,
  Analytics? analytics,
}) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  _tallViewport(tester);
  final bloc = AartiMainBloc(repository: repository, analytics: analytics)
    ..add(const AartiMainLoadRequested());
  addTearDown(bloc.close);

  final router = GoRouter(
    initialLocation: '/aarti-bhajans',
    routes: [
      GoRoute(
        path: '/aarti-bhajans',
        builder: (_, _) => BlocProvider<AartiMainBloc>.value(
          value: bloc,
          child: const AartiMainScreen(),
        ),
      ),
      GoRoute(
        path: AartiRoutes.listing,
        builder: (_, state) {
          onListingPushed(state.extra! as AartiListQuery);
          return const Scaffold(key: Key('aarti-listing-probe'));
        },
      ),
    ],
  );

  await tester.pumpWidget(ProviderScope(
    overrides: [
      aartiRepositoryProvider.overrideWithValue(repository),
      analyticsProvider.overrideWithValue(analytics),
      audioEngineProvider.overrideWith((ref) {
        final e = FakeAudioEngine();
        ref.onDispose(e.dispose);
        return e;
      }),
      shareServiceProvider.overrideWithValue(FakeShareService()),
      entitlementStateProvider.overrideWith(() => _SeededEntitlement(true)),
    ],
    child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
  ));
  await tester.pumpAndSettle();
}

/// Pumps the reusable listing with a loaded [AartiListingBloc].
Future<void> pumpAartiListing(
  WidgetTester tester, {
  required AartiRepository repository,
  required AartiListQuery query,
  Analytics? analytics,
  double viewportHeight = 2200,
}) async {
  _tallViewport(tester, height: viewportHeight);
  final bloc = AartiListingBloc(repository: repository, query: query)
    ..add(const AartiListingLoadRequested());
  await tester.pumpWidget(aartiTestApp(
    repository: repository,
    analytics: analytics,
    child: BlocProvider<AartiListingBloc>.value(
      value: bloc,
      child: AartiListingScreen(query: query),
    ),
  ));
  await tester.pumpAndSettle();
}

/// Pumps the full player (which builds its own bloc from the overrides).
Future<void> pumpAartiPlayer(
  WidgetTester tester, {
  required AartiRepository repository,
  required AartiPlayerArgs args,
  FakeAudioEngine? engine,
  Analytics? analytics,
}) async {
  // Tall viewport so every control (rewind…forward) is on-screen and tappable.
  _tallViewport(tester, height: 1600);

  await tester.pumpWidget(aartiTestApp(
    repository: repository,
    engine: engine,
    analytics: analytics,
    child: AartiPlayerScreen(args: args),
  ));
  await tester.pumpAndSettle();
}

/// Pins a tall phone-width viewport so lazily-built slivers / offscreen controls
/// are laid out and tappable in tests.
void _tallViewport(WidgetTester tester, {double height = 2200}) {
  tester.view.physicalSize = Size(400, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

/// Convenience default player args (single-item or multi-item queue).
AartiPlayerArgs playerArgs(List<String> ids, int index) => AartiPlayerArgs(
      audioId: ids[index],
      queue: [for (final id in ids) aartiAudioFixture(id)],
      index: index,
      sourceListType: 'newly_added',
    );

/// Re-export for tests that emit engine transitions.
typedef Engine = FakeAudioEngine;
const EngineProcessingState completedState = EngineProcessingState.completed;
