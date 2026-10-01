import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/auth_store.dart';
import 'package:mobile/core/router.dart';
import 'package:mobile/core/service_locator.dart';
import 'package:mobile/features/onboarding/bloc/onboarding_orchestrator_bloc.dart';
import 'package:mobile/features/onboarding/bloc/onboarding_orchestrator_state.dart';

import 'support/fake_auth_store.dart';

/// Flatten every [GoRoute] path across top-level routes AND
/// [StatefulShellRoute] branches so shell-nested paths (e.g. `/home`) are seen.
Set<String> _collectPaths(List<RouteBase> routes) {
  final paths = <String>{};
  for (final route in routes) {
    if (route is GoRoute) {
      paths.add(route.path);
      paths.addAll(_collectPaths(route.routes));
    } else if (route is ShellRouteBase) {
      for (final branch in (route as StatefulShellRoute).branches) {
        paths.addAll(_collectPaths(branch.routes));
      }
    }
  }
  return paths;
}

void main() {
  setUp(() async {
    if (GetIt.instance.isRegistered<AuthStore>()) {
      await GetIt.instance.reset();
    }
  });

  tearDown(() async {
    if (GetIt.instance.isRegistered<AuthStore>()) {
      await GetIt.instance.reset();
    }
  });

  test('pathForRouteTarget maps every RouteTarget to a non-empty path', () {
    // Guards against a future new RouteTarget value that forgets to add a
    // matching GoRoute — the router redirect would fall through silently.
    for (final target in RouteTarget.values) {
      expect(pathForRouteTarget(target), isNotEmpty);
    }
  });

  test('pathForRouteTarget spot-checks for the five real onboarding routes', () {
    expect(pathForRouteTarget(RouteTarget.phoneInput), '/phone-input');
    expect(pathForRouteTarget(RouteTarget.otp), '/otp');
    expect(pathForRouteTarget(RouteTarget.nameLanguage), '/name-language');
    expect(pathForRouteTarget(RouteTarget.paywall), '/paywall');
    expect(pathForRouteTarget(RouteTarget.home), '/home');
  });

  testWidgets(
    'routerProvider registers every onboarding + admin route',
    (tester) async {
      // Configure the locator so the router provider can pull the (unused)
      // orchestrator without crashing.
      await configureLocator(
        authStore: FakeAuthStore(token: null),
        dio: Dio(),
      );

      final container = ProviderContainer();
      addTearDown(container.dispose);

      final router = container.read(routerProvider);

      // Collect paths recursively — `/home` (and the other shell tabs) now live
      // inside a StatefulShellRoute's branches, not as top-level GoRoutes.
      final paths = _collectPaths(router.configuration.routes);

      // Every path the orchestrator can redirect to must be registered — a
      // missing route would surface as a silent redirect fall-through.
      expect(paths, containsAll([
        '/splash',
        '/phone-input',
        '/otp',
        '/name-language',
        '/paywall',
        '/home',
        // Bottom-nav shell branches (TAM-58): reduced to Home / Status /
        // Horoscope. Mandir was retired; /books stays as a top-level route
        // pushed over the shell (home shortcuts + deep links still reach it).
        '/status',
        '/horoscope',
        '/books',
        // Admin backward-compat routes still exist.
        '/login',
        '/users',
      ]));

      expect(router.routeInformationProvider.value.uri.path, '/splash',
          reason: 'the initial location must be /splash');

      // Sanity: the orchestrator singleton is reachable via the same locator
      // instance the router provider used.
      expect(
        GetIt.instance<OnboardingOrchestratorBloc>(),
        isNotNull,
      );
    },
  );
}
