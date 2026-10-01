import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/core/analytics.dart';
import 'package:mobile/core/entitlement.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/books/books_providers.dart';
import 'package:mobile/features/books/books_routes.dart';
import 'package:mobile/features/books/data/books_models.dart';
import 'package:mobile/features/books/data/books_repository.dart';
import 'package:mobile/features/books/data/offline_text_cache.dart';
import 'package:mobile/features/books/data/reader_font_prefs.dart';
import 'package:mobile/features/books/home/bloc/books_home_bloc.dart';
import 'package:mobile/features/books/home/bloc/books_home_event.dart';
import 'package:mobile/features/books/home/presentation/books_home_screen.dart';
import 'package:mobile/features/books/listing/bloc/books_listing_bloc.dart';
import 'package:mobile/features/books/listing/bloc/books_listing_event.dart';
import 'package:mobile/features/books/listing/presentation/books_listing_screen.dart';
import 'package:mobile/state/providers.dart';


/// Wraps [child] in a ProviderScope with the common Books test overrides (fake
/// repo, in-memory cache + font prefs, seeded entitlement, no analytics) + the
/// real theme.
///
/// `shared_preferences` needs a platform channel widget tests don't have, hence
/// the in-memory doubles for both persistence seams.
Widget booksTestApp({
  required BooksRepository repository,
  required Widget child,
  OfflineTextCache? cache,
  ReaderFontPrefs? fontPrefs,
  Analytics? analytics,
  bool isPro = true,
}) {
  GoogleFonts.config.allowRuntimeFetching = false;
  return ProviderScope(
    overrides: [
      booksRepositoryProvider.overrideWithValue(repository),
      booksOfflineCacheProvider.overrideWithValue(cache ?? InMemoryOfflineTextCache()),
      booksReaderFontPrefsProvider
          .overrideWithValue(fontPrefs ?? InMemoryReaderFontPrefs()),
      analyticsProvider.overrideWithValue(analytics),
      entitlementStateProvider.overrideWith(() => SeededBooksEntitlement(isPro)),
    ],
    child: MaterialApp(theme: AppTheme.light(), home: child),
  );
}

/// Entitlement double whose value can FLIP mid-test — the post-purchase resume
/// path needs "free at tap, Pro after the paywall closes".
class SeededBooksEntitlement extends EntitlementNotifier {
  SeededBooksEntitlement(this._seed);

  bool _seed;

  /// Flips the live entitlement, simulating a successful purchase.
  static bool nextRefreshGrantsPro = false;

  @override
  Entitlement build() => Entitlement(granted: _seed, until: null);

  @override
  Future<void> refresh() async {
    if (nextRefreshGrantsPro) {
      _seed = true;
      state = const Entitlement(granted: true, until: null);
    }
  }
}

/// A router harness for gate tests: Books Home + a stub paywall + the downstream
/// destinations, so a tap's REAL destination can be asserted by location.
Widget booksRouterApp({
  required BooksRepository repository,
  required GoRouter router,
  Analytics? analytics,
  bool isPro = true,
}) {
  GoogleFonts.config.allowRuntimeFetching = false;
  return ProviderScope(
    overrides: [
      booksRepositoryProvider.overrideWithValue(repository),
      booksOfflineCacheProvider.overrideWithValue(InMemoryOfflineTextCache()),
      booksReaderFontPrefsProvider.overrideWithValue(InMemoryReaderFontPrefs()),
      analyticsProvider.overrideWithValue(analytics),
      entitlementStateProvider.overrideWith(() => SeededBooksEntitlement(isPro)),
    ],
    child: MaterialApp.router(
      theme: AppTheme.light(),
      routerConfig: router,
    ),
  );
}

/// Minimal route table covering every Books destination + a stub paywall.
GoRouter buildBooksTestRouter({
  required BooksRepository repository,
  Analytics? analytics,
}) {
  return GoRouter(
    initialLocation: BooksRoutes.home,
    routes: [
      GoRoute(
        path: BooksRoutes.home,
        builder: (context, state) => BlocProvider<BooksHomeBloc>(
          create: (_) => BooksHomeBloc(
            repository: repository,
            analytics: analytics,
          )..add(const BooksHomeLoadRequested()),
          child: const BooksHomeScreen(),
        ),
      ),
      GoRoute(
        path: BooksRoutes.all,
        builder: (context, state) {
          final query = state.extra is BookListQuery
              ? state.extra! as BookListQuery
              : const BookListQuery();
          return BlocProvider<BooksListingBloc>(
            create: (_) => BooksListingBloc(
              repository: repository,
              query: query,
              analytics: analytics,
            )..add(const BooksListingLoadRequested()),
            child: BooksListingScreen(query: query),
          );
        },
      ),
      GoRoute(
        path: BooksRoutes.categoryPattern,
        redirect: (context, state) =>
            BookCategory.fromWire(state.pathParameters['category']) == null
                ? BooksRoutes.home
                : null,
        builder: (context, state) {
          final category =
              BookCategory.fromWire(state.pathParameters['category'])!;
          final query = state.extra is BookListQuery
              ? state.extra! as BookListQuery
              : BookListQuery(category: category);
          return BlocProvider<BooksListingBloc>(
            create: (_) => BooksListingBloc(
              repository: repository,
              query: query,
              analytics: analytics,
            )..add(const BooksListingLoadRequested()),
            child: BooksListingScreen(query: query),
          );
        },
      ),
      // Stub destinations — the gate tests assert WHERE a tap landed, not what
      // the destination renders (those have their own tests).
      GoRoute(
        path: BooksRoutes.contentsPattern,
        builder: (context, state) => const _Stub('contents'),
      ),
      GoRoute(
        path: BooksRoutes.scripturePattern,
        builder: (context, state) => const _Stub('scripture'),
      ),
      GoRoute(
        path: BooksRoutes.readPattern,
        builder: (context, state) => const _Stub('read'),
      ),
      GoRoute(
        path: '/paywall',
        builder: (context, state) => const _Stub('paywall'),
      ),
    ],
  );
}

class _Stub extends StatelessWidget {
  const _Stub(this.name);
  final String name;

  @override
  Widget build(BuildContext context) =>
      Scaffold(body: Center(child: Text('stub-$name')));
}

/// Pins the surface to a phone size (+ resets after) — grids and lazy lists lay
/// out wrong on the default 800×600 desktop test surface.
void booksViewport(WidgetTester tester, {double height = 1600}) {
  tester.view.physicalSize = Size(360, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}
