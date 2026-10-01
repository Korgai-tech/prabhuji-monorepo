import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/core/analytics.dart';
import 'package:mobile/core/entitlement.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/audio/application/audio_providers.dart';
import 'package:mobile/features/ringtone/data/ringtone_repository.dart';
import 'package:mobile/features/ringtone/data/set_ringtone_service.dart';
import 'package:mobile/features/ringtone/home/bloc/ringtone_home_bloc.dart';
import 'package:mobile/features/ringtone/home/bloc/ringtone_home_event.dart';
import 'package:mobile/features/ringtone/home/presentation/ringtone_home_screen.dart';
import 'package:mobile/features/ringtone/preview/presentation/ringtone_preview_screen.dart';
import 'package:mobile/features/ringtone/ringtone_providers.dart';
import 'package:mobile/features/ringtone/ringtone_routes.dart';
import 'package:mobile/features/ringtone/search/bloc/ringtone_search_bloc.dart';
import 'package:mobile/features/ringtone/search/bloc/ringtone_search_event.dart';
import 'package:mobile/features/ringtone/search/presentation/ringtone_search_screen.dart';
import 'package:mobile/state/providers.dart';

import 'fake_audio_engine.dart';
import 'fake_repositories.dart';
import 'fake_set_ringtone_service.dart';
import 'fake_share_service.dart';

/// Wraps [child] in a ProviderScope with the common Ringtone test overrides
/// (fake repo, fake set-ringtone channel, fake audio engine driving the shared
/// AudioController, fake share, fake deities, no analytics) + the real theme.
Widget ringtoneTestApp({
  required RingtoneRepository repository,
  required Widget child,
  SetRingtoneService? setService,
  FakeAudioEngine? engine,
  Analytics? analytics,
  bool isPro = true,
  List<DeityView>? deities,
}) {
  GoogleFonts.config.allowRuntimeFetching = false;
  return ProviderScope(
    overrides: [
      ringtoneRepositoryProvider.overrideWithValue(repository),
      setRingtoneServiceProvider
          .overrideWithValue(setService ?? FakeSetRingtoneService()),
      analyticsProvider.overrideWithValue(analytics),
      audioEngineProvider.overrideWith((ref) {
        final e = engine ?? FakeAudioEngine();
        ref.onDispose(e.dispose);
        return e;
      }),
      shareServiceProvider.overrideWithValue(FakeShareService()),
      deityRepositoryProvider.overrideWithValue(
        FakeDeityRepository(
          deities: deities ??
              [fakeDeity('krishna', name: 'Shri Krishna'), fakeDeity('ram', name: 'Ram ji')],
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

/// Pumps the Ringtone Home with a loaded [RingtoneHomeBloc].
Future<void> pumpRingtoneHome(
  WidgetTester tester, {
  required RingtoneRepository repository,
  Analytics? analytics,
  bool isPro = true,
  double viewportHeight = 1400,
}) async {
  _viewport(tester, height: viewportHeight);
  final bloc = RingtoneHomeBloc(repository: repository, analytics: analytics)
    ..add(const RingtoneHomeLoadRequested());
  await tester.pumpWidget(ringtoneTestApp(
    repository: repository,
    analytics: analytics,
    isPro: isPro,
    child: BlocProvider<RingtoneHomeBloc>.value(
      value: bloc,
      child: const RingtoneHomeScreen(),
    ),
  ));
  await tester.pumpAndSettle();
}

/// Pumps the Search Results with a loaded [RingtoneSearchBloc].
Future<void> pumpRingtoneSearch(
  WidgetTester tester, {
  required RingtoneRepository repository,
  required String query,
  Analytics? analytics,
  double viewportHeight = 1400,
}) async {
  _viewport(tester, height: viewportHeight);
  final bloc = RingtoneSearchBloc(repository: repository, analytics: analytics)
    ..add(RingtoneSearchSubmitted(query));
  await tester.pumpWidget(ringtoneTestApp(
    repository: repository,
    analytics: analytics,
    child: BlocProvider<RingtoneSearchBloc>.value(
      value: bloc,
      child: RingtoneSearchScreen(query: query),
    ),
  ));
  await tester.pumpAndSettle();
}

/// Pumps the Preview (which builds its own blocs from the overrides).
Future<void> pumpRingtonePreview(
  WidgetTester tester, {
  required RingtoneRepository repository,
  required RingtonePreviewArgs args,
  SetRingtoneService? setService,
  FakeAudioEngine? engine,
  Analytics? analytics,
  double viewportHeight = 1600,
}) async {
  _viewport(tester, height: viewportHeight);
  await tester.pumpWidget(ringtoneTestApp(
    repository: repository,
    setService: setService,
    engine: engine,
    analytics: analytics,
    child: RingtonePreviewScreen(args: args),
  ));
  await tester.pumpAndSettle();
}

void _viewport(WidgetTester tester, {double height = 1400}) {
  tester.view.physicalSize = Size(400, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}
