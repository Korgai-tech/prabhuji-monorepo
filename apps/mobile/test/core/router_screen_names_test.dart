import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/app_config.dart';
import 'package:mobile/core/router.dart';

/// Every `GoRoute` in [routerProvider] MUST carry a stable, non-null,
/// non-empty `name:` (TAM-127).
///
/// This is the load-bearing invariant of the whole Clarity integration:
/// without a `name`, `ClarityNavigatorObserver` falls back to
/// `route.runtimeType.toString()` (i.e. `MaterialPage<dynamic>`) and the
/// Clarity dashboard shows every screen as an unreadable string.
///
/// A future PR that adds a route without a name silently breaks screen
/// labels for every session recorded after that release — this test
/// prevents that.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('every GoRoute in the router has a non-empty name', () {
    // The router doesn't touch `AppConfig` at construction time (only at
    // redirect time), but seed a fake anyway so a future accidental read
    // doesn't NPE the test.
    AppConfig.debugSetInstance(AppConfig.forTest(environment: 'test'));

    final container = ProviderContainer();
    addTearDown(container.dispose);

    final router = container.read(routerProvider);
    final missing = <String>[];
    final total = _walkAndCollect(router.configuration.routes, missing);

    expect(missing, isEmpty,
        reason:
            'Every GoRoute must carry a stable `name:` — Clarity screen '
            'labels depend on it. Routes missing a name:\n  '
            '${missing.join('\n  ')}');
    // Sanity check the walker actually saw the whole tree — the spec
    // counted 38 GoRoute declarations. If someone adds a route in a
    // future PR this number is expected to move (update it here too).
    expect(total, greaterThanOrEqualTo(38),
        reason:
            'Router walker found fewer routes than expected — did a branch '
            'stop being visited?');
  });
}

/// Recursively walk `routes`, appending any nameless `GoRoute.path` to
/// [missing], and return the total number of `GoRoute` nodes visited.
int _walkAndCollect(List<RouteBase> routes, List<String> missing) {
  var count = 0;
  for (final r in routes) {
    if (r is GoRoute) {
      count++;
      final name = r.name;
      if (name == null || name.trim().isEmpty) {
        missing.add(r.path);
      }
      count += _walkAndCollect(r.routes, missing);
    } else if (r is ShellRouteBase) {
      // ShellRoute / StatefulShellRoute — recurse into every child branch.
      if (r is StatefulShellRoute) {
        for (final branch in r.branches) {
          count += _walkAndCollect(branch.routes, missing);
        }
      } else {
        count += _walkAndCollect(r.routes, missing);
      }
    }
  }
  return count;
}
