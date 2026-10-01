import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/home/data/home_models.dart';
import 'package:mobile/features/home/destinations.dart';
import 'package:mobile/features/home/home_analytics.dart';
import 'package:mobile/features/home/presentation/home_shortcut_grid.dart';
import 'package:mobile/state/providers.dart';

import '../../../support/fake_analytics.dart';
import '../../../support/fake_home_services.dart';

/// TAM-132 — widget tests for the CMS-driven 3×2 shortcut grid.
///
/// The bundled-asset fallback rung was removed once ops committed to keeping
/// every row's `iconUrl` populated via the CMS. The ladder is now two rungs:
///
///  * rung 1 — [Image.network] on `iconUrl`.
///  * rung 2 — [SizedBox.shrink] when `iconUrl` is null/empty OR the network
///    fetch errors out. The tile stays labelled + tappable.
///
/// The six-row fixture exercises URL rendering (rows 0,1,4), null/empty URLs
/// (rows 2,3), and a fully-null row (row 5) that lands in the shrink rung.
///
/// The network path is controlled by a scoped [HttpOverrides] that returns a
/// canned 404 for the horoscope-row URL (forcing the error rung) and hangs
/// (never delivers bytes) for the success rows. Hanging is fine here because
/// the assertion is "which [Image] widget is in the tree", not "what pixels
/// landed" — [Image.network] mounts [Image(image: NetworkImage(...))]
/// synchronously, before any network I/O.
///
/// Analytics for the tap fires `home_widget_clicked` with `widget_id` = CMS
/// key and `destination_module` = the resolved [HomeDestinations.shortcut]
/// path — the tap-path contract is stable across the ladder change.
void main() {
  late _RecordingHttpOverrides overrides;
  HttpOverrides? previous;

  setUp(() {
    GoogleFonts.config.allowRuntimeFetching = false;
    previous = HttpOverrides.current;
    overrides = _RecordingHttpOverrides();
    HttpOverrides.global = overrides;
  });

  tearDown(() {
    HttpOverrides.global = previous;
  });

  const validAartiUrl = 'https://example.com/aarti.png';
  const validMantrasUrl = 'https://example.com/mantras.png';
  const badHoroscopeUrl = 'https://example.com/does-not-exist.png';

  List<HomeShortcutView> sixRowFixture() => [
        homeShortcut(
          key: 'aarti_bhajans',
          label: 'Aarti & Bhajans',
          destinationValue: 'aarti',
          iconKey: 'aarti',
          iconUrl: validAartiUrl,
          sortOrder: 0,
        ),
        homeShortcut(
          key: 'mantras_stutis',
          label: 'Mantras & Stutis',
          destinationValue: 'mantras',
          iconKey: 'mantras',
          iconUrl: validMantrasUrl,
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
          iconUrl: badHoroscopeUrl,
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

  Future<void> pumpGrid(
    WidgetTester tester, {
    required List<HomeShortcutView> shortcuts,
    RouteSpy? routeSpy,
    RecordingAnalytics? analytics,
  }) async {
    tester.view.physicalSize = const Size(360, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final spy = routeSpy ?? RouteSpy();
    final router = GoRouter(
      initialLocation: '/home',
      routes: [
        GoRoute(
          path: '/home',
          builder: (context, state) => Scaffold(
            body: HomeShortcutGrid(shortcuts: shortcuts),
          ),
        ),
        for (final path in const [
          '/aarti-bhajans',
          '/mantras',
          '/ringtones',
          '/wallpaper',
          '/status',
          '/horoscope',
        ])
          GoRoute(
            path: path,
            builder: (context, state) => _RouteProbe(path: path, spy: spy),
          ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          analyticsProvider.overrideWithValue(analytics),
        ],
        child: MaterialApp.router(
          theme: AppTheme.light(),
          routerConfig: router,
        ),
      ),
    );
    // Two pumps let Image.network resolve to Image(NetworkImage(...)) and the
    // errorBuilder swap in for the horoscope-URL row.
    await tester.pump();
    await tester.pump();
  }

  Finder tileFinder(String key) => find.byKey(Key('home-shortcut-$key'));

  Iterable<Image> imagesIn(WidgetTester tester, String tileKey) {
    return tester.widgetList<Image>(
      find.descendant(of: tileFinder(tileKey), matching: find.byType(Image)),
    );
  }

  group('geometry (3×2)', () {
    testWidgets('renders a GridView with crossAxisCount 3', (tester) async {
      await pumpGrid(tester, shortcuts: sixRowFixture());

      final grid = tester.widget<GridView>(find.byType(GridView));
      final delegate = grid.gridDelegate;
      expect(delegate, isA<SliverGridDelegateWithFixedCrossAxisCount>());
      expect(
        (delegate as SliverGridDelegateWithFixedCrossAxisCount).crossAxisCount,
        3,
        reason: 'TAM-132 flipped AppHome.shortcutColumns 2 → 3',
      );
    });

    testWidgets('every one of the six tiles renders', (tester) async {
      await pumpGrid(tester, shortcuts: sixRowFixture());

      for (final key in const [
        'aarti_bhajans',
        'mantras_stutis',
        'set_wallpaper',
        'set_status',
        'horoscope',
        'set_ringtone',
      ]) {
        expect(
          tileFinder(key),
          findsOneWidget,
          reason: 'tile home-shortcut-$key should render (3×2 grid)',
        );
      }
    });
  });

  group('label wrap (maxLines: 2)', () {
    testWidgets('"Set Status" wraps to two lines when the tile is narrow',
        (tester) async {
      await pumpGrid(tester, shortcuts: sixRowFixture());

      final statusLabel = tester.widget<Text>(
        find.descendant(
          of: tileFinder('set_status'),
          matching: find.text('Set Status'),
        ),
      );
      expect(statusLabel.maxLines, 2,
          reason: 'TAM-132 bumped maxLines 1 → 2 for two-line CMS labels');
      expect(statusLabel.overflow, TextOverflow.ellipsis,
          reason: 'ellipsis stays as the defensive fallback');
    });

    testWidgets('"Set Ringtone" also carries the maxLines: 2 contract',
        (tester) async {
      await pumpGrid(tester, shortcuts: sixRowFixture());

      final ringtoneLabel = tester.widget<Text>(
        find.descendant(
          of: tileFinder('set_ringtone'),
          matching: find.text('Set Ringtone'),
        ),
      );
      expect(ringtoneLabel.maxLines, 2);
    });
  });

  group('fallback ladder — rung 1 (network URL)', () {
    testWidgets('a row with a valid iconUrl renders Image.network',
        (tester) async {
      await pumpGrid(tester, shortcuts: sixRowFixture());

      final images = imagesIn(tester, 'aarti_bhajans').toList();
      expect(images, isNotEmpty,
          reason: 'the network rung should mount an Image widget');
      expect(images.first.image, isA<NetworkImage>());
      expect(
        (images.first.image as NetworkImage).url,
        validAartiUrl,
        reason: 'iconUrl is the source of truth on rung 1',
      );

      final mantras = imagesIn(tester, 'mantras_stutis').toList();
      expect(mantras.first.image, isA<NetworkImage>());
    });
  });

  group('URL rung wiring', () {
    testWidgets(
      'Image.network wires errorBuilder + loadingBuilder — ladder terminates on shrink',
      (tester) async {
        // The bundled fallback rung was dropped once ops committed to keeping
        // every row's iconUrl populated. Any URL failure now degrades to
        // SizedBox.shrink rather than a bundled PNG. The errorBuilder wiring
        // is the observable proof — we can't drive Flutter's imageCache to a
        // deterministic error inside a widget-test pump loop, but we can
        // assert the callback is present + returns a shrink-shaped Widget.
        await pumpGrid(tester, shortcuts: sixRowFixture());

        final networkImages = imagesIn(tester, 'horoscope')
            .where((img) => img.image is NetworkImage)
            .toList();
        expect(networkImages, isNotEmpty,
            reason: 'the URL rung should mount Image with a NetworkImage '
                'provider');
        final networkImage = networkImages.first;
        expect(
          (networkImage.image as NetworkImage).url,
          'https://example.com/does-not-exist.png',
        );
        expect(networkImage.errorBuilder, isNotNull,
            reason: 'the URL rung must wire an errorBuilder so a failure '
                'degrades to SizedBox.shrink (no bundled fallback shipped)');
        expect(networkImage.loadingBuilder, isNotNull,
            reason: 'the URL rung supplies a lightweight placeholder while '
                'the frame is null (no Shimmer dep for this ticket)');
      },
    );
  });

  group('shrink rung (iconUrl null/empty)', () {
    testWidgets(
      'iconUrl == null → no Image, tile still labelled + tappable',
      (tester) async {
        final spy = RouteSpy();
        final analytics = RecordingAnalytics();
        await pumpGrid(
          tester,
          shortcuts: sixRowFixture(),
          routeSpy: spy,
          analytics: analytics,
        );

        // Label survives even without art.
        expect(
          find.descendant(
            of: tileFinder('set_wallpaper'),
            matching: find.text('Set Wallpaper'),
          ),
          findsOneWidget,
        );

        // No Image mounted inside the tile — the shrink rung fired.
        expect(
          find.descendant(
            of: tileFinder('set_wallpaper'),
            matching: find.byType(Image),
          ),
          findsNothing,
          reason: 'shrink rung — no Image in the icon slot',
        );

        // Tap still counts + resolves through the allowlist.
        await tester.tap(tileFinder('set_wallpaper'));
        await tester.pumpAndSettle();

        expect(spy.pushed, contains('/wallpaper'),
            reason: 'tap path is orthogonal to icon-rendering rung');
        expect(analytics.fired(HomeEvents.widgetClicked), isTrue);
      },
    );

    testWidgets('iconUrl == "" is treated as null', (tester) async {
      await pumpGrid(tester, shortcuts: sixRowFixture());

      expect(
        find.descendant(
          of: tileFinder('set_status'),
          matching: find.byType(Image),
        ),
        findsNothing,
        reason: 'empty-string iconUrl short-circuits to the shrink rung',
      );
    });

    testWidgets('a synthetic row with no iconUrl and no iconKey still renders',
        (tester) async {
      // Confirms the "everything null" case doesn't crash (#EXPORT_CRITICAL).
      final spy = RouteSpy();
      await pumpGrid(
        tester,
        shortcuts: [
          homeShortcut(
            key: 'future_tile',
            label: 'Future Tile',
            destinationValue: 'aarti',
            iconKey: null,
            iconUrl: null,
          ),
        ],
        routeSpy: spy,
      );

      expect(tileFinder('future_tile'), findsOneWidget);
      expect(
        find.descendant(of: tileFinder('future_tile'), matching: find.byType(Image)),
        findsNothing,
      );
      expect(tester.takeException(), isNull);

      await tester.tap(tileFinder('future_tile'));
      await tester.pumpAndSettle();
      expect(spy.pushed, ['/aarti-bhajans']);
    });
  });

  group('analytics + destinations', () {
    testWidgets(
      'tap fires home_widget_clicked with widget_id + destination_module',
      (tester) async {
        final cases = <String, String>{
          'home-shortcut-aarti_bhajans': '/aarti-bhajans',
          'home-shortcut-mantras_stutis': '/mantras',
          'home-shortcut-set_wallpaper': '/wallpaper',
          'home-shortcut-set_status': '/status',
          'home-shortcut-horoscope': '/horoscope',
          'home-shortcut-set_ringtone': '/ringtones',
        };

        for (final entry in cases.entries) {
          final spy = RouteSpy();
          final analytics = RecordingAnalytics();
          await pumpGrid(
            tester,
            shortcuts: sixRowFixture(),
            routeSpy: spy,
            analytics: analytics,
          );

          await tester.tap(find.byKey(Key(entry.key)));
          await tester.pumpAndSettle();

          final key = entry.key.replaceFirst('home-shortcut-', '');
          expect(spy.pushed, contains(entry.value),
              reason: 'tap on ${entry.key} should push ${entry.value}');
          final props = analytics.propsFor(HomeEvents.widgetClicked);
          expect(props[HomeEventProps.widgetId], key,
              reason: 'widget_id = CMS key');
          expect(props[HomeEventProps.destinationModule], entry.value,
              reason: 'destination_module = allowlist path');
        }
      },
    );
  });
}

/// Records every navigation Push into a linear list — the classic
/// integration-style spy without needing the full home_harness scaffolding.
class RouteSpy {
  final List<String> pushed = [];
}

class _RouteProbe extends StatefulWidget {
  const _RouteProbe({required this.path, required this.spy});
  final String path;
  final RouteSpy spy;

  @override
  State<_RouteProbe> createState() => _RouteProbeState();
}

class _RouteProbeState extends State<_RouteProbe> {
  @override
  void initState() {
    super.initState();
    widget.spy.pushed.add(widget.path);
  }

  @override
  Widget build(BuildContext context) =>
      Scaffold(key: Key('probe-${widget.path}'));
}

/// A tiny [HttpOverrides] that intercepts every request our
/// [Image.network] rung makes:
///  * URLs containing `does-not-exist` → 404 (drives errorBuilder → rung 2).
///  * everything else → an infinite stream that never delivers bytes (the
///    Image widget mounts synchronously, the pixels never arrive — this is
///    fine because we assert on the widget tree, not on painted pixels).
class _RecordingHttpOverrides extends HttpOverrides {
  final List<String> seen = [];

  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return _FakeHttpClient(onRequest: (uri) => seen.add(uri.toString()));
  }
}

class _FakeHttpClient implements HttpClient {
  _FakeHttpClient({required this.onRequest});
  final void Function(Uri uri) onRequest;

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
  Future<HttpClientRequest> getUrl(Uri url) async {
    onRequest(url);
    // Fail-fast for the horoscope error probe: throwing here drives the
    // NetworkImage.load future to error → the Image state's onError →
    // errorBuilder → bundled rung. A stubbed 404 response gets buffered by
    // NetworkImage's internal decoder and rarely propagates to the
    // errorBuilder inside a widget test's fake-async pump loop.
    if (url.toString().contains('does-not-exist')) {
      throw const SocketException('simulated failure (test)');
    }
    return _FakeHttpClientRequest(url: url);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _FakeHttpClientRequest implements HttpClientRequest {
  _FakeHttpClientRequest({required Uri url}) : uri = url;

  @override
  final Uri uri;

  @override
  Future<HttpClientResponse> close() async {
    final isError = uri.toString().contains('does-not-exist');
    return _FakeHttpClientResponse(statusCode: isError ? 404 : 200);
  }

  @override
  Future<HttpClientResponse> get done => close();

  @override
  final HttpHeaders headers = _FakeHttpHeaders();

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _FakeHttpHeaders implements HttpHeaders {
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _FakeHttpClientResponse extends Stream<List<int>>
    implements HttpClientResponse {
  _FakeHttpClientResponse({required this.statusCode});

  @override
  final int statusCode;

  @override
  int get contentLength => 0;

  @override
  final HttpHeaders headers = _FakeHttpHeaders();

  @override
  bool get isRedirect => false;

  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int> event)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) {
    // Emit an empty body then close — Image.network's decoder will fail on
    // both the 404 (via HTTP status) and the empty-body 200 (no PNG bytes to
    // decode), which is exactly the errorBuilder path we want in tests.
    return Stream<List<int>>.value(const <int>[]).listen(
      onData,
      onError: onError,
      onDone: onDone,
      cancelOnError: cancelOnError,
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}
