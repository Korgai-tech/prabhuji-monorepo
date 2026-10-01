import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/core/analytics.dart';
import 'package:mobile/core/entitlement.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/wallpaper/data/set_wallpaper_service.dart';
import 'package:mobile/features/wallpaper/data/wallpaper_repository.dart';
import 'package:mobile/features/wallpaper/home/bloc/wallpaper_home_bloc.dart';
import 'package:mobile/features/wallpaper/home/bloc/wallpaper_home_event.dart';
import 'package:mobile/features/wallpaper/home/presentation/wallpaper_home_screen.dart';
import 'package:mobile/features/wallpaper/listing/bloc/wallpaper_list_bloc.dart';
import 'package:mobile/features/wallpaper/listing/bloc/wallpaper_list_event.dart';
import 'package:mobile/features/wallpaper/listing/presentation/wallpaper_listing_screen.dart';
import 'package:mobile/features/wallpaper/preview/presentation/wallpaper_preview_screen.dart';
import 'package:mobile/features/wallpaper/preview/wallpaper_video_port.dart';
import 'package:mobile/features/wallpaper/wallpaper_providers.dart';
import 'package:mobile/features/wallpaper/wallpaper_routes.dart';
import 'package:mobile/state/providers.dart';
import 'package:visibility_detector/visibility_detector.dart';

import 'fake_repositories.dart';
import 'fake_set_wallpaper_service.dart';
import 'fake_share_service.dart';
import 'fake_wallpaper_video_port.dart';

/// Wraps [child] in a ProviderScope with the common Wallpaper test overrides
/// (fake repo, fake set channel, fake video port, fake share, fake deities,
/// seeded entitlement, no analytics) + the real theme.
Widget wallpaperTestApp({
  required WallpaperRepository repository,
  required Widget child,
  SetWallpaperService? setService,
  WallpaperVideoPortFactory? videoPortFactory,
  Analytics? analytics,
  bool isPro = true,
  List<DeityView>? deities,
}) {
  GoogleFonts.config.allowRuntimeFetching = false;
  // Home rows report impressions through a VisibilityDetector; widget tests
  // must not wait on its real 500ms debounce (same rule as home_harness.dart).
  VisibilityDetectorController.instance.updateInterval = Duration.zero;
  return ProviderScope(
    overrides: [
      wallpaperRepositoryProvider.overrideWithValue(repository),
      setWallpaperServiceProvider
          .overrideWithValue(setService ?? FakeSetWallpaperService()),
      wallpaperVideoPortFactoryProvider.overrideWithValue(
        videoPortFactory ?? FakeWallpaperVideoPort.new,
      ),
      analyticsProvider.overrideWithValue(analytics),
      shareServiceProvider.overrideWithValue(FakeShareService()),
      deityRepositoryProvider.overrideWithValue(
        FakeDeityRepository(
          deities: deities ??
              [
                fakeDeity('durga', name: 'Durga Ma'),
                fakeDeity('krishna', name: 'Shri Krishna'),
              ],
        ),
      ),
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

/// Pumps the Wallpaper Home with a loaded [WallpaperHomeBloc].
Future<void> pumpWallpaperHome(
  WidgetTester tester, {
  required WallpaperRepository repository,
  Analytics? analytics,
  double viewportHeight = 2200,
}) async {
  _viewport(tester, height: viewportHeight);
  final bloc = WallpaperHomeBloc(repository: repository, analytics: analytics)
    ..add(const WallpaperHomeLoadRequested());
  await tester.pumpWidget(wallpaperTestApp(
    repository: repository,
    analytics: analytics,
    child: BlocProvider<WallpaperHomeBloc>.value(
      value: bloc,
      child: const WallpaperHomeScreen(),
    ),
  ));
  await tester.pumpAndSettle();
}

/// Pumps the Listing with a loaded [WallpaperListBloc].
Future<void> pumpWallpaperListing(
  WidgetTester tester, {
  required WallpaperRepository repository,
  required WallpaperListQuery query,
  Analytics? analytics,
  double viewportHeight = 2200,
}) async {
  _viewport(tester, height: viewportHeight);
  final bloc = WallpaperListBloc(
    repository: repository,
    query: query,
    analytics: analytics,
  )..add(const WallpaperListLoadRequested());
  await tester.pumpWidget(wallpaperTestApp(
    repository: repository,
    analytics: analytics,
    child: BlocProvider<WallpaperListBloc>.value(
      value: bloc,
      child: WallpaperListingScreen(query: query),
    ),
  ));
  await tester.pumpAndSettle();
}

/// Pumps the Preview (which builds its own blocs from the overrides).
Future<void> pumpWallpaperPreview(
  WidgetTester tester, {
  required WallpaperRepository repository,
  required WallpaperPreviewArgs args,
  SetWallpaperService? setService,
  WallpaperVideoPortFactory? videoPortFactory,
  Analytics? analytics,
  bool isPro = true,
  double viewportHeight = 1600,
}) async {
  _viewport(tester, height: viewportHeight);
  await tester.pumpWidget(wallpaperTestApp(
    repository: repository,
    setService: setService,
    videoPortFactory: videoPortFactory,
    analytics: analytics,
    isPro: isPro,
    child: WallpaperPreviewScreen(args: args),
  ));
  await tester.pumpAndSettle();
}

void _viewport(WidgetTester tester, {double height = 2200}) {
  tester.view.physicalSize = Size(400, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}
