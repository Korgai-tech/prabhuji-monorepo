---
name: flutter-routing
description: Routing for apps/mobile — one long-lived go_router with a refreshListenable bridge, auth-driven redirect, StatefulShellRoute.indexedStack for persistent bottom nav, context.push vs context.go rules, deep-link path parameters, and back-stack semantics. Use when adding a route, wiring auth redirects, building a bottom/tab shell, opening a deep screen from within a tab, or debugging "nav disappears / back button closes the app / scroll position resets."
user-invocable: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Flutter Routing Skill

## Purpose

Give `apps/mobile` one predictable routing model: a single long-lived `GoRouter` registered in `get_it`, an auth-reactive `redirect` fed by the auth Bloc's stream, and `StatefulShellRoute.indexedStack` for any persistent bottom nav. Routing decisions leak into every feature — this skill is the single owner so state, UI, and networking skills can stop re-explaining nav rules.

## When This Skill Applies

- Adding a new `GoRoute` or nested branch
- Wiring authentication redirects (login → home, logout → login)
- Building or changing a persistent bottom nav, tab bar, or side rail
- Opening a deep screen from within a tab (detail pages, drilldowns)
- Adding a deep link / URL parameter / query param
- Debugging any of the symptoms in the Symptom → Cause table below

Composes with:

- [flutter-state-bloc](../flutter-state-bloc/SKILL.md) — the auth Bloc/Cubit whose stream feeds `refreshListenable`.
- [flutter-modular-architecture](../flutter-modular-architecture/SKILL.md) — where the `GoRouter` is registered in `get_it`.
- [flutter-ui](../flutter-ui/SKILL.md) — screen scaffolding; the shell that owns `bottomNavigationBar` lives here.

## The Two Rules That Sit Above Everything

1. **One long-lived `GoRouter`.** Register it as a singleton in `get_it` (or a top-level provider) and never rebuild it. Rebuilding drops navigation state, breaks the Android back button, and re-runs all route builders.
2. **`redirect` is where auth logic lives — nowhere else.** No `if (!loggedIn) Navigator.push(...)` scattered in widgets. The redirect reads the current auth state and returns a path (or `null`). `refreshListenable` re-runs it when auth changes.

## Base Router — `refreshListenable` Bridge From the Auth Bloc

The router must react to auth state changes without being rebuilt. Bridge the auth `Bloc`/`Cubit` stream into a `ChangeNotifier` that `GoRouter` listens to.

```dart
// lib/core/router.dart
class _AuthRefresh extends ChangeNotifier {
  _AuthRefresh(AuthCubit auth) {
    _sub = auth.stream.listen((_) => notifyListeners());
  }
  late final StreamSubscription<AuthState> _sub;
  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

GoRouter buildRouter(AuthCubit auth) {
  final refresh = _AuthRefresh(auth);
  return GoRouter(
    initialLocation: '/home',
    refreshListenable: refresh,
    redirect: (context, state) {
      final loggedIn = auth.state is AuthAuthenticated;
      final onLogin = state.matchedLocation == '/login';
      if (!loggedIn && !onLogin) return '/login';
      if (loggedIn && onLogin) return '/home';
      return null;
    },
    routes: [ /* … */ ],
  );
}
```

Register once in `get_it` (see [flutter-modular-architecture](../flutter-modular-architecture/SKILL.md)):

```dart
getIt.registerLazySingleton<GoRouter>(() => buildRouter(getIt<AuthCubit>()));
```

`MaterialApp.router(routerConfig: getIt<GoRouter>())` — that's it.

## Persistent Bottom Nav — MUST Use `StatefulShellRoute.indexedStack`

If the app has a persistent bottom nav (or tab bar, or side rail) that stays visible across N destinations, the **shell** must own the `Scaffold` and its `bottomNavigationBar`. Individual tab screens must NOT wrap themselves in a `Scaffold` with their own bottom nav — that's the anti-pattern that lets tab switches destroy the nav and breaks the Android back button.

Use `StatefulShellRoute.indexedStack`. Each tab is a `StatefulShellBranch` with its own navigator; the shell keeps each branch's navigation stack alive across tab switches.

```dart
GoRouter(
  routes: [
    // Deep screens reached from *within* a tab (e.g. an item detail
    // opened from the Home feed). Root-level = cover the shell entirely
    // so the bottom nav disappears while they're on top (matches most
    // designs) AND the Android back button pops them back to the shell.
    GoRoute(path: '/aarti-bhajans', builder: (_, _) => AartiBhajansScreen()),

    StatefulShellRoute.indexedStack(
      builder: (context, state, shell) => MainShell(shell: shell),
      branches: [
        StatefulShellBranch(routes: [
          GoRoute(path: '/home',   builder: (_, _) => HomeScreen()),
        ]),
        StatefulShellBranch(routes: [
          GoRoute(path: '/status', builder: (_, _) => StatusScreen()),
        ]),
        // ...
      ],
    ),
  ],
);

class MainShell extends StatelessWidget {
  const MainShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: shell,                                 // <-- the branch's navigator
    bottomNavigationBar: BottomNavigationBar(
      currentIndex: shell.currentIndex,
      // Re-tapping the current tab pops that tab's stack to its root —
      // the platform-standard behavior.
      onTap: (i) => shell.goBranch(
        i, initialLocation: i == shell.currentIndex,
      ),
      items: [ /* ... */ ],
    ),
  );
}
```

Inside the tab screens: **do not** add another `Scaffold` with a `bottomNavigationBar`. The shell already provides one. A per-screen `Scaffold` is fine only for an `AppBar` local to that screen; leave `bottomNavigationBar` unset.

## `context.push` vs `context.go` — the Rule

- **Switching tabs** (bottom nav taps): the shell handles it via `shell.goBranch(index)`. Never `context.go('/status')` from a nav button — that replaces the whole route and destroys the shell.
- **Opening a deep screen from within a tab** (e.g. tapping a home-feed card): use **`context.push(...)`**. The device back button then pops it, returning to the shell tab.
- **`context.go(...)`** replaces the whole location. Reserve for auth redirects (`context.go('/login')`) and successful login (`context.go('/home')`), where you actually want the history wiped.

## Deep Links & Path Parameters

- Prefer `/entity/:id` over query strings for canonical entity URLs — `content_detail/:id` not `content_detail?id=`.
- Read parameters from `GoRouterState`:
  ```dart
  GoRoute(
    path: '/content/:id',
    builder: (context, state) =>
        ContentDetailScreen(id: state.pathParameters['id']!),
  ),
  ```
- Query params are legitimate for filters/pagination (`/search?q=…&page=2`) — anything that isn't identity.
- Push-notification tap targets should be raw path strings you `context.go(...)` to inside the notification handler. Do NOT stash a screen widget in the notification payload.

## Testing the Router

Router redirect logic is real business logic — test it. Pump `MaterialApp.router` with a **fake `AuthCubit`** whose state you control, then assert what renders. No real network, no real secure storage.

```dart
// test/router_test.dart
import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router.dart';
import 'package:mobile/features/auth/auth_cubit.dart';

class _FakeAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

Future<void> _pump(WidgetTester tester, AuthState initial) async {
  final auth = _FakeAuthCubit();
  whenListen(auth, const Stream<AuthState>.empty(), initialState: initial);

  await tester.pumpWidget(
    MaterialApp.router(routerConfig: buildRouter(auth)),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('logged out → redirects to /login', (tester) async {
    await _pump(tester, const AuthUnauthenticated());
    expect(find.byType(LoginScreen), findsOneWidget);
  });

  testWidgets('logged in → renders /home', (tester) async {
    await _pump(tester, const AuthAuthenticated(userId: 'u1'));
    expect(find.byType(HomeScreen), findsOneWidget);
  });
}
```

Rules that make these tests reliable:

- **Stub the auth Cubit; do not use the real one.** The real Cubit reads secure storage / calls the API on construction. Use `MockCubit` + `whenListen` from `bloc_test` to seed a state.
- **Stub any feature Cubit whose screen the redirect lands on** (e.g. override its network call to return an empty list) — otherwise `pumpAndSettle` hangs waiting on network.
- **Assert on widget types (`find.byType(LoginScreen)`), not on strings** that will drift with copy changes.
- **For `refreshListenable` behavior** — testing that a state change re-runs `redirect` — emit a new state on the fake stream and `pumpAndSettle` between assertions:
  ```dart
  whenListen(auth,
    Stream.fromIterable([const AuthAuthenticated(userId: 'u1')]),
    initialState: const AuthUnauthenticated());
  ```
- **Do NOT test `context.push` vs `context.go` in the router test.** That's a widget-level concern — test it on the screen that does the pushing.

See [flutter-state-bloc](../flutter-state-bloc/SKILL.md#testing---bloc_test) for the broader `bloc_test` setup.

## Symptom → Cause

| Symptom | Cause |
|---|---|
| Bottom nav disappears when I tap a tab | Tabs are top-level `GoRoute`s and the nav is inside `HomeScreen`'s Scaffold. Refactor to `StatefulShellRoute`. |
| Device back closes the app instead of returning to Home | Feature grid uses `context.go` (replace) instead of `context.push` (stack). Swap. |
| Scroll position resets when I switch tabs | Not using `StatefulShellRoute.indexedStack` — or using stateless `ShellRoute`. Use the *stateful* variant. |
| Redirect fires but the screen doesn't update after logout | `refreshListenable` isn't wired, or the `_AuthRefresh` bridge disposed its subscription without emitting. Confirm the auth Bloc's stream is what fires it. |
| Router seems to "forget" logged-in state after hot reload | Router is being rebuilt on every widget rebuild instead of held as a `get_it` singleton. Move construction out of `build()`. |
| Deep link opens the login screen even when authenticated | `redirect` returns `/login` too aggressively — check the `onLogin` early return and any per-route guards. |
| Query params leak into the URL after navigation | Using `context.pushNamed(..., queryParameters: {...})` where `pathParameters` should be canonical identity. |

## Anti-patterns

```dart
// ❌ Rebuilding the router on every auth-state change.
// This drops nav state and breaks the back button.
Widget build(BuildContext context) {
  final router = GoRouter(routes: [...]);   // constructed inside build
  return MaterialApp.router(routerConfig: router);
}

// ❌ Bottom nav taps that replace the whole location.
// Destroys the shell → each tab press remounts everything.
BottomNavigationBar(onTap: (i) => context.go(_paths[i]));

// ❌ Auth check inside a widget.
// Widget-scoped redirects race with the router and produce flicker.
if (!loggedIn) Navigator.of(context).pushReplacementNamed('/login');

// ❌ Per-screen Scaffold owning its own bottomNavigationBar
// under a StatefulShellRoute. The shell already owns it.
Scaffold(bottomNavigationBar: BottomNavigationBar(...));
```

## Checklist for a New Route

- [ ] Added to the top-level `routes:` list (or inside the correct `StatefulShellBranch`)?
- [ ] Uses `context.push` from within a tab, `context.go` only for auth flows?
- [ ] Identity params in `:id` path segments; filters/pagination in query params?
- [ ] Screen does NOT wrap itself in a `Scaffold` with `bottomNavigationBar` when nested in a shell?
- [ ] If the route needs auth, is the check in the router's `redirect` — not in the widget?
- [ ] If a Bloc scoped to the route needs to live only while the route is on the stack, is it created via `BlocProvider` in the route's `builder` (see [flutter-state-bloc](../flutter-state-bloc/SKILL.md))?

## Authoritative References

- `apps/mobile/lib/core/router.dart` — the concrete router.
- `apps/mobile/CLAUDE.md` — mobile-app conventions.
- [flutter-state-bloc](../flutter-state-bloc/SKILL.md) — auth Cubit stream feeds `refreshListenable`.
- [flutter-modular-architecture](../flutter-modular-architecture/SKILL.md) — `get_it` registration of the router.
- [flutter-ui](../flutter-ui/SKILL.md) — the shell widget's rendering rules.
