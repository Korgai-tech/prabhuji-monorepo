import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/home/data/home_models.dart';
import 'package:mobile/features/home/presentation/home_shortcut_grid.dart';
import 'package:mobile/state/providers.dart';

import '../../../support/fake_home_services.dart';

/// TAM-132 — multi-size smoke test for the 3-column shortcut grid. The tile
/// height (117 dp) is FIXED but the label is scalable text with `maxLines: 2`
/// — exactly the trap `patterns_library/testing/flutter-multi-size-smoke.md`
/// warns about. Pumps the grid at Pixel SE (720×1280) and Pixel 8 Pro
/// (1440×3120) plus a `TextScaler.linear(2.0)` variant at each; asserts no
/// `RenderFlex` overflow or other layout exception fires.
///
/// A tiny [HttpOverrides] stubs [Image.network] to a 404 for every URL so the
/// network rung's errorBuilder cleanly falls back to the bundled asset —
/// otherwise the widget would hang on the placeholder box and the "does the
/// laid-out tile explode" question can't be answered on both rungs.

const _sizes = <Size>[
  Size(720, 1280), // Pixel SE-ish
  Size(1440, 3120), // Pixel 8 Pro
];

List<HomeShortcutView> _sixRowFixture() => [
      homeShortcut(
        key: 'aarti_bhajans',
        label: 'Aarti & Bhajans',
        destinationValue: 'aarti',
        iconKey: 'aarti',
        iconUrl: 'https://example.com/aarti.png',
        sortOrder: 0,
      ),
      homeShortcut(
        key: 'mantras_stutis',
        label: 'Mantras & Stutis',
        destinationValue: 'mantras',
        iconKey: 'mantras',
        iconUrl: 'https://example.com/mantras.png',
        sortOrder: 1,
      ),
      homeShortcut(
        key: 'set_wallpaper',
        label: 'Set Wallpaper',
        destinationValue: 'wallpaper',
        iconKey: 'wallpaper',
        iconUrl: null,
        sortOrder: 2,
      ),
      homeShortcut(
        key: 'set_status',
        label: 'Set Status',
        destinationValue: 'status',
        iconKey: 'status',
        iconUrl: '',
        sortOrder: 3,
      ),
      homeShortcut(
        key: 'horoscope',
        label: 'Horoscope',
        destinationValue: 'horoscope',
        iconKey: 'horoscope',
        iconUrl: 'https://example.com/does-not-exist.png',
        sortOrder: 4,
      ),
      homeShortcut(
        key: 'set_ringtone',
        label: 'Set Ringtone',
        destinationValue: 'ringtone',
        iconKey: null,
        iconUrl: null,
        sortOrder: 5,
      ),
    ];

Future<void> _pump(
  WidgetTester tester, {
  required Size size,
  double textScale = 1.0,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

  final router = GoRouter(
    initialLocation: '/home',
    routes: [
      GoRoute(
        path: '/home',
        builder: (context, state) => Scaffold(
          body: SingleChildScrollView(
            child: HomeShortcutGrid(shortcuts: _sixRowFixture()),
          ),
        ),
      ),
    ],
  );

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        analyticsProvider.overrideWithValue(null),
      ],
      child: MaterialApp.router(
        theme: AppTheme.light(),
        routerConfig: router,
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  HttpOverrides? previous;

  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  setUp(() {
    previous = HttpOverrides.current;
    HttpOverrides.global = _AlwaysFailHttpOverrides();
  });

  tearDown(() {
    HttpOverrides.global = previous;
  });

  group('HomeShortcutGrid multi-size smoke (TAM-132, 3×2 layout)', () {
    for (final size in _sizes) {
      testWidgets(
        'no layout exception at ${size.width.toInt()}x${size.height.toInt()} × scale 1.0',
        (tester) async {
          final errors = <FlutterErrorDetails>[];
          final originalOnError = FlutterError.onError;
          FlutterError.onError = errors.add;
          addTearDown(() => FlutterError.onError = originalOnError);

          await _pump(tester, size: size);

          expect(
            errors,
            isEmpty,
            reason:
                'layout exceptions at ${size.width.toInt()}x${size.height.toInt()}:\n'
                '${errors.map((e) => e.exceptionAsString()).join('\n---\n')}',
          );
        },
      );

      testWidgets(
        'no layout exception at ${size.width.toInt()}x${size.height.toInt()} × scale 2.0',
        (tester) async {
          final errors = <FlutterErrorDetails>[];
          final originalOnError = FlutterError.onError;
          FlutterError.onError = errors.add;
          addTearDown(() => FlutterError.onError = originalOnError);

          await _pump(tester, size: size, textScale: 2.0);

          // The 117 dp FIXED tile height × two-line label × textScale 2.0 is
          // the exact configuration `flutter-multi-size-smoke.md` names.
          expect(
            errors,
            isEmpty,
            reason:
                'layout exceptions at ${size.width.toInt()}x${size.height.toInt()} × textScale 2.0 — '
                'did someone regress AppHome.shortcutCardHeight to a smaller '
                'fixed value or drop maxLines: 2?\n'
                '${errors.map((e) => e.exceptionAsString()).join('\n---\n')}',
          );
        },
      );
    }
  });
}

/// Uniform HttpOverrides: every [Image.network] load lands in errorBuilder,
/// which resolves to the bundled iconKey asset — a deterministic, no-network
/// render that lets us measure the LAID-OUT tile at every device size.
class _AlwaysFailHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) => _FailingHttpClient();
}

class _FailingHttpClient implements HttpClient {
  @override
  bool autoUncompress = true;
  @override
  Duration? connectionTimeout;
  @override
  Duration idleTimeout = const Duration(seconds: 15);
  @override
  int? maxConnectionsPerHost;
  @override
  String? userAgent;

  @override
  Future<HttpClientRequest> getUrl(Uri url) async =>
      throw const SocketException('offline (smoke test)');

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}
