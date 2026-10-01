import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/core/analytics.dart';
import 'package:mobile/core/entitlement.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/horoscope/data/horoscope_repository.dart';
import 'package:mobile/features/horoscope/data/horoscope_video_port.dart';
import 'package:mobile/features/horoscope/data/tts_port.dart';
import 'package:mobile/features/horoscope/horoscope_providers.dart';
import 'package:mobile/features/horoscope/main/bloc/horoscope_main_bloc.dart';
import 'package:mobile/features/horoscope/main/bloc/horoscope_main_event.dart';
import 'package:mobile/features/horoscope/main/presentation/horoscope_main_screen.dart';
import 'package:mobile/features/horoscope/result/bloc/horoscope_result_bloc.dart';
import 'package:mobile/features/horoscope/result/bloc/horoscope_result_event.dart';
import 'package:mobile/features/horoscope/result/presentation/horoscope_result_screen.dart';
import 'package:mobile/state/providers.dart';

import 'fake_horoscope_services.dart';

/// Wraps [child] in a ProviderScope with the common Horoscope test overrides
/// (fake repo, fake TTS port, fake video port, seeded entitlement, no analytics)
/// + the real theme.
Widget horoscopeTestApp({
  required HoroscopeRepository repository,
  required Widget child,
  TtsPort? tts,
  HoroscopeVideoPortFactory? videoPortFactory,
  Analytics? analytics,
  bool isPro = true,
  String locale = 'hi',
}) {
  // Never let a test reach out to fonts.google.com; the Inter TTFs are bundled
  // in pubspec, so `AppText`'s GoogleFonts styles resolve from the asset.
  GoogleFonts.config.allowRuntimeFetching = false;
  return ProviderScope(
    overrides: [
      horoscopeRepositoryProvider.overrideWithValue(repository),
      ttsPortProvider.overrideWithValue(tts ?? FakeTtsPort()),
      horoscopeVideoPortFactoryProvider.overrideWithValue(
        videoPortFactory ?? FakeHoroscopeVideoPort.new,
      ),
      // The provider reads get_it's SessionContext, which tests don't register.
      horoscopeLocaleProvider.overrideWithValue(locale),
      analyticsProvider.overrideWithValue(analytics),
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

/// Pumps the FREE zodiac grid with a loaded [HoroscopeMainBloc].
Future<HoroscopeMainBloc> pumpHoroscopeMain(
  WidgetTester tester, {
  required HoroscopeRepository repository,
  Analytics? analytics,
  bool isPro = true,
  String locale = 'hi',
  DateTime? now,
  double viewportHeight = 1600,
}) async {
  _viewport(tester, height: viewportHeight);
  final bloc = HoroscopeMainBloc(
    repository: repository,
    locale: locale,
    analytics: analytics,
    clock: () => now ?? DateTime.utc(2026, 6, 15, 4),
  )..add(const HoroscopeMainRequested());
  await tester.pumpWidget(horoscopeTestApp(
    repository: repository,
    analytics: analytics,
    isPro: isPro,
    locale: locale,
    child: BlocProvider<HoroscopeMainBloc>.value(
      value: bloc,
      child: const HoroscopeMainScreen(),
    ),
  ));
  await tester.pumpAndSettle();
  addTearDown(bloc.close);
  return bloc;
}

/// Pumps the Pro-gated result flow with a loaded [HoroscopeResultBloc].
Future<HoroscopeResultBloc> pumpHoroscopeResult(
  WidgetTester tester, {
  required HoroscopeRepository repository,
  String zodiacId = 'taurus',
  TtsPort? tts,
  HoroscopeVideoPortFactory? videoPortFactory,
  Analytics? analytics,
  String locale = 'hi',
  double viewportHeight = 800,
  // A non-empty static-fallback URL puts AppNetworkImage into its Shimmer
  // placeholder, which animates forever — pumpAndSettle would time out. Tests
  // that assert the CMS-URL wiring pass `settle: false` and pump fixed frames;
  // tests that assert the RENDERED fallback use an empty URL (the repo's
  // convention — a widget test must never touch the network).
  bool settle = true,
}) async {
  _viewport(tester, height: viewportHeight);
  final port = tts ?? FakeTtsPort();
  final bloc = HoroscopeResultBloc(
    repository: repository,
    tts: port,
    zodiacId: zodiacId,
    locale: locale,
    analytics: analytics,
  )..add(const HoroscopeResultRequested());
  await tester.pumpWidget(horoscopeTestApp(
    repository: repository,
    tts: port,
    videoPortFactory: videoPortFactory,
    analytics: analytics,
    locale: locale,
    child: BlocProvider<HoroscopeResultBloc>.value(
      value: bloc,
      child: const HoroscopeResultScreen(),
    ),
  ));
  if (settle) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }
  addTearDown(bloc.close);
  return bloc;
}

/// The Figma frames are 360×800 INCLUDING a 52px status bar (nodes 371:3797 /
/// 387:2574), and both screens lay out under a `SafeArea`. Emulating that inset
/// makes the render directly comparable to the frame export — without it every
/// golden sits 52px higher than the design and the numbers stop lining up.
const double kFigmaStatusBar = 52;

void _viewport(WidgetTester tester, {double height = 800}) {
  tester.view.physicalSize = Size(360, height);
  tester.view.devicePixelRatio = 1.0;
  tester.view.padding = const FakeViewPadding(top: kFigmaStatusBar);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPadding);
}
