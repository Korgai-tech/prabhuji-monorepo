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
import 'package:mobile/features/mantras/data/mantras_models.dart';
import 'package:mobile/features/mantras/data/mantras_repository.dart';
import 'package:mobile/features/mantras/listing/bloc/mantras_listing_bloc.dart';
import 'package:mobile/features/mantras/listing/bloc/mantras_listing_event.dart';
import 'package:mobile/features/mantras/listing/presentation/mantras_listing_screen.dart';
import 'package:mobile/features/mantras/main/bloc/mantras_main_bloc.dart';
import 'package:mobile/features/mantras/main/bloc/mantras_main_event.dart';
import 'package:mobile/features/mantras/main/presentation/mantras_main_screen.dart';
import 'package:mobile/features/mantras/mantras_providers.dart';
import 'package:mobile/features/mantras/mantras_routes.dart';
import 'package:mobile/features/mantras/player/presentation/mantras_player_screen.dart';
import 'package:mobile/state/providers.dart';

import 'fake_audio_engine.dart';
import 'fake_repositories.dart';
import 'fake_share_service.dart';

/// Wraps [child] in a ProviderScope with the common Mantras test overrides (fake
/// repo, fake audio engine driving the shared AudioController, fake share, no
/// analytics) + the real theme.
Widget mantrasTestApp({
  required MantrasRepository repository,
  required Widget child,
  FakeAudioEngine? engine,
  Analytics? analytics,
  bool isPro = true,
}) {
  GoogleFonts.config.allowRuntimeFetching = false;
  return ProviderScope(
    overrides: [
      mantrasRepositoryProvider.overrideWithValue(repository),
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

/// Pumps the sectioned main page with a loaded [MantrasMainBloc].
Future<void> pumpMantrasMain(
  WidgetTester tester, {
  required MantrasRepository repository,
  Analytics? analytics,
}) async {
  _tallViewport(tester);
  final bloc = MantrasMainBloc(repository: repository, analytics: analytics)
    ..add(const MantrasMainLoadRequested());
  await tester.pumpWidget(mantrasTestApp(
    repository: repository,
    analytics: analytics,
    child: BlocProvider<MantrasMainBloc>.value(
      value: bloc,
      child: const MantrasMainScreen(),
    ),
  ));
  await tester.pumpAndSettle();
}

/// Pumps the main page behind a real [GoRouter], reporting every
/// [MantraListQuery] a "Show all" pushes — the Show-all HANDOFF (title +
/// filters) is what's under test, so this captures the query instead of
/// rendering the listing. Mirrors `pumpAartiMainWithRouter`.
Future<void> pumpMantrasMainWithRouter(
  WidgetTester tester, {
  required MantrasRepository repository,
  required void Function(MantraListQuery) onListingPushed,
  Analytics? analytics,
}) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  _tallViewport(tester);
  final bloc = MantrasMainBloc(repository: repository, analytics: analytics)
    ..add(const MantrasMainLoadRequested());
  addTearDown(bloc.close);

  final router = GoRouter(
    initialLocation: '/mantras-stutis',
    routes: [
      GoRoute(
        path: '/mantras-stutis',
        builder: (_, _) => BlocProvider<MantrasMainBloc>.value(
          value: bloc,
          child: const MantrasMainScreen(),
        ),
      ),
      GoRoute(
        path: MantrasRoutes.listing,
        builder: (_, state) {
          onListingPushed(state.extra! as MantraListQuery);
          return const Scaffold(key: Key('mantras-listing-probe'));
        },
      ),
    ],
  );

  await tester.pumpWidget(ProviderScope(
    overrides: [
      mantrasRepositoryProvider.overrideWithValue(repository),
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

/// Pumps the reusable listing with a loaded [MantrasListingBloc].
Future<void> pumpMantrasListing(
  WidgetTester tester, {
  required MantrasRepository repository,
  required MantraListQuery query,
  Analytics? analytics,
  double viewportHeight = 2200,
}) async {
  _tallViewport(tester, height: viewportHeight);
  final bloc = MantrasListingBloc(repository: repository, query: query)
    ..add(const MantrasListingLoadRequested());
  await tester.pumpWidget(mantrasTestApp(
    repository: repository,
    analytics: analytics,
    child: BlocProvider<MantrasListingBloc>.value(
      value: bloc,
      child: MantrasListingScreen(query: query),
    ),
  ));
  await tester.pumpAndSettle();
}

/// Pumps the full player (which builds its own bloc from the overrides).
Future<void> pumpMantrasPlayer(
  WidgetTester tester, {
  required MantrasRepository repository,
  required MantrasPlayerArgs args,
  FakeAudioEngine? engine,
  Analytics? analytics,
}) async {
  _tallViewport(tester, height: 1800);
  await tester.pumpWidget(mantrasTestApp(
    repository: repository,
    engine: engine,
    analytics: analytics,
    child: MantrasPlayerScreen(args: args),
  ));
  await tester.pumpAndSettle();
}

void _tallViewport(WidgetTester tester, {double height = 2200}) {
  tester.view.physicalSize = Size(400, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

/// Convenience default player args (single-item or multi-item queue).
MantrasPlayerArgs mantrasPlayerArgs(List<String> ids, int index) =>
    MantrasPlayerArgs(
      itemId: ids[index],
      queue: [for (final id in ids) mantraAudioFixture(id)],
      index: index,
      playlistSource: 'newly_added',
    );
