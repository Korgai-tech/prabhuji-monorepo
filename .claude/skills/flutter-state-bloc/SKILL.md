---
name: flutter-state-bloc
description: State management for apps/mobile using flutter_bloc — Cubit vs Bloc selection, sealed state hierarchies with Dart 3, BlocProvider composition, Bloc-to-Bloc communication (widget-level BlocListener bridge and constructor stream.listen), buildWhen and BlocSelector for scoped rebuilds, BlocListener for side effects, global BlocObserver for logging + error hook, and bloc_test coverage. Use when adding new features, wiring UI to state, bridging Blocs, or reviewing PRs that touch state boundaries.
user-invocable: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Flutter State Skill (Bloc)

## Purpose

Give `apps/mobile` a single, predictable state approach: `flutter_bloc` with Dart 3 sealed states, feature-scoped providers, and narrow rebuild boundaries.

**Inviolable rule: no Riverpod for new code.** The only tolerated Riverpod surface is the existing `lib/state/providers.dart`, and only as a one-way bridge that reads from `serviceLocator` for widgets that haven't been migrated yet. Detail in the "No Riverpod for New Code" section below.

## When This Skill Applies

- Building a new feature screen in `lib/features/<feature>/`
- Adding a state class, event class, or Cubit/Bloc
- Reviewing a PR that adds `context.watch`, `BlocBuilder`, or a new provider
- Deciding between `Cubit` and `Bloc` for a new controller
- Debugging spurious rebuilds or "state updated but UI didn't change"

## Packages (add if not present)

```yaml
# apps/mobile/pubspec.yaml
dependencies:
  flutter_bloc: ^9.0.0
  bloc: ^9.0.0
  equatable: ^2.0.7   # optional; simpler alt to freezed for value equality

dev_dependencies:
  bloc_test: ^10.0.0
  mocktail: ^1.0.4
```

Run `flutter pub get` after adding. Do NOT add `freezed` — Dart 3 sealed classes cover our needs without the codegen cost.

## Cubit vs Bloc — Pick One Per Controller

| | Cubit | Bloc |
|---|---|---|
| API | Method calls (`increment()`) | Events dispatched (`add(Increment())`) |
| Boilerplate | Low | Higher (events + `on<E>`) |
| Reasoning | Direct — method + `emit()` | Event-sourced — replayable, better for audit |
| Use for | 90% of feature state (form, screen, list) | Complex flows: checkout, wizards, sync engines, anything you'd want to log or replay |

**Default to Cubit.** Reach for Bloc only when you need event semantics (multiple event types funnelled through a single reducer, throttling / debouncing an event stream via `EventTransformer`, or replay).

## Sealed State Hierarchies (Dart 3, no freezed)

Every non-trivial state should be a sealed type so `switch` is exhaustive at compile time.

```dart
// lib/features/users/users_state.dart
sealed class UsersState {
  const UsersState();
}

final class UsersInitial extends UsersState {
  const UsersInitial();
}

final class UsersLoading extends UsersState {
  const UsersLoading();
}

final class UsersLoaded extends UsersState {
  const UsersLoaded(this.users);
  final List<PublicUser> users;
}

final class UsersError extends UsersState {
  const UsersError(this.message);
  final String message;
}
```

Rules:
- `sealed` on the base; `final` on each variant so no one adds a fifth case in another file.
- Prefer `const` constructors everywhere possible — needed for `buildWhen` reference equality.
- Value equality for list/collection states: use `Equatable` or hand-roll `==`/`hashCode`. Otherwise `state1 == state2` returns false even when the fields match, and `buildWhen` won't short-circuit.

```dart
final class UsersLoaded extends UsersState with EquatableMixin {
  const UsersLoaded(this.users);
  final List<PublicUser> users;
  @override
  List<Object?> get props => [users];
}
```

For events, same shape — sealed base, `final` variants.

```dart
sealed class UsersEvent {}
final class UsersRequested extends UsersEvent {}
final class UsersRefreshed extends UsersEvent {}
```

## Cubit — the 90% Case

```dart
// lib/features/users/users_cubit.dart
class UsersCubit extends Cubit<UsersState> {
  UsersCubit(this._repo) : super(const UsersInitial());
  final UsersRepository _repo;

  Future<void> load() async {
    if (state is UsersLoading) return; // idempotent: no double-fetch
    emit(const UsersLoading());
    final result = await _repo.listUsers();
    emit(switch (result) {
      Ok<List<PublicUser>>(:final value) => UsersLoaded(value),
      Err<List<PublicUser>>(:final error) => UsersError(error.userMessage),
    });
  }
}
```

Notes:
- Cubit exposes intent via methods (`load`, `refresh`, `dismissError`) — never expose the repository through the Cubit.
- Never `emit` after `close()`. Guard long-running async work with `if (isClosed) return;` before `emit`.
- Return `Future` from methods that mutate state so tests can `await` them.

## Bloc — When Events Matter

```dart
// lib/features/checkout/checkout_bloc.dart
class CheckoutBloc extends Bloc<CheckoutEvent, CheckoutState> {
  CheckoutBloc(this._repo) : super(const CheckoutInitial()) {
    on<CheckoutStarted>(_onStarted);
    on<CheckoutStepSubmitted>(_onStep, transformer: droppable());
    on<CheckoutCancelled>(_onCancelled);
  }

  final CheckoutRepository _repo;

  Future<void> _onStep(CheckoutStepSubmitted e, Emitter<CheckoutState> emit) async {
    emit(const CheckoutSubmitting());
    final result = await _repo.submitStep(e.step, e.payload);
    emit(switch (result) {
      Ok(:final value) => CheckoutStepAdvanced(value),
      Err(:final error) => CheckoutError(error.userMessage),
    });
  }
}
```

`EventTransformer`s (`droppable`, `restartable`, `debounce`) come from `bloc_concurrency` — install if you need them:

```yaml
dependencies:
  bloc_concurrency: ^0.3.0
```

## Provider Composition — Where State Lives

### Route-scoped (default)

Attach a Cubit/Bloc to the smallest widget subtree that needs it — usually the screen route. Repositories come from `get_it` (see [flutter-modular-architecture](../flutter-modular-architecture/SKILL.md)); the Bloc's *lifecycle* is owned by `BlocProvider`.

```dart
// lib/core/router.dart
import '../core/di/injection.dart';

GoRoute(
  path: '/users',
  builder: (context, state) => BlocProvider(
    create: (_) => UsersCubit(getIt<UsersRepository>())..load(),
    child: const UsersScreen(),
  ),
),
```

Notes:
- `getIt<UsersRepository>()` inside `create:` is the composition boundary — never resolve inside `build()`.
- `..load()` cascades the initial fetch — no `initState` needed.
- The Cubit is auto-closed when the route pops. Never manually instantiate a Bloc/Cubit outside a provider (`final c = UsersCubit(...)`) — you own `close()` and will forget.
- **Blocs / Cubits are NOT registered in `get_it`.** `get_it` gives them their dependencies; `BlocProvider` gives them their lifecycle. Registering in both doubles ownership.

### App-scoped (rare — auth, feature flags, session)

Some Cubits genuinely need to survive navigation (the auth session, feature flags loaded once). Provide them above the router. Their dependencies still come from `get_it`.

```dart
// lib/main.dart
import 'core/di/injection.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  _initLogging(); // see flutter-networking

  await configureDependencies(
    env: AppEnv.dev,
    onUnauthorized: _signOut,
  );

  runApp(BlocProvider(
    create: (_) => AuthCubit(getIt<AuthRepository>())..restore(),
    child: const MobileApp(),
  ));
}
```

Reserve app-scope for state that must survive navigation (auth, feature flags, device info). Everything else is feature-scoped.

### Repositories live in `get_it`, not `RepositoryProvider`

We do NOT use `flutter_bloc`'s `RepositoryProvider` / `MultiRepositoryProvider`. `get_it` is the single source of truth for app-scoped infrastructure — using both would fragment the wiring. Repository registrations live in `lib/core/di/injection.dart`; Blocs resolve them via `getIt<T>()` inside their `BlocProvider`'s `create:`.

### Multi provider composition

```dart
BlocProvider(
  create: (_) => UsersCubit(...)..load(),
  child: BlocProvider(
    create: (_) => UsersFilterCubit(),
    child: const UsersScreen(),
  ),
);

// Preferred sugar:
MultiBlocProvider(
  providers: [
    BlocProvider(create: (_) => UsersCubit(...)..load()),
    BlocProvider(create: (_) => UsersFilterCubit()),
  ],
  child: const UsersScreen(),
);
```

## Bloc-to-Bloc Communication — When One Bloc Reacts to Another

Sometimes a Bloc needs to react to another Bloc's state (`ProfileCubit` clears on sign-out, `CartCubit` refreshes when the currency changes). Two patterns; pick by lifetime.

### Same-scope / widget-level: `BlocListener` bridge

When both Blocs live under the same subtree, don't couple them in code — bridge in the widget layer.

```dart
MultiBlocListener(
  listeners: [
    BlocListener<AuthCubit, AuthState>(
      listenWhen: (prev, curr) => curr is Unauthenticated,
      listener: (context, _) => context.read<ProfileCubit>().clear(),
    ),
  ],
  child: const ProfileScreen(),
);
```

### Cross-scope / app-level: constructor `stream.listen`

When the reacting Bloc lives further down than the source Bloc (or is registered in `get_it` for testability), subscribe in the constructor and cancel in `close()`.

```dart
class ProfileCubit extends Cubit<ProfileState> {
  ProfileCubit(this._repo, AuthCubit auth) : super(const ProfileInitial()) {
    _authSub = auth.stream.listen((s) {
      if (s is Unauthenticated) emit(const ProfileInitial());
    });
  }

  final ProfileRepository _repo;
  late final StreamSubscription<AuthState> _authSub;

  @override
  Future<void> close() {
    _authSub.cancel();          // MUST cancel — leaks the sub otherwise
    return super.close();
  }
}
```

Rules:

- Cancel the subscription in `close()`. Missing this is the most common Bloc leak.
- Never `await` the other Bloc's stream inside a UI method — subscribe once in the constructor and let state flow.
- Never let two Blocs mutate each other in a cycle (`A → B → A`). If you need bidirectional state, they're one Bloc.
- Repositories, not other Blocs, are the source of truth. Bloc-to-Bloc bridges propagate state — they don't share ownership.

The router's `_AuthRefresh` in [flutter-routing](../flutter-routing/SKILL.md#base-router-refreshlistenable-bridge-from-the-auth-bloc) is a concrete instance of this pattern outside a widget tree.

## Reading State in Widgets — Pick the Narrowest Tool

| API | When to use |
|---|---|
| `BlocBuilder<C, S>` | Rebuild widget subtree on state change |
| `BlocBuilder` + `buildWhen` | Coarse Cubit, only rebuild on specific transitions |
| `BlocSelector<C, S, T>` | Rebuild only when a projected slice `T` changes — narrower than `buildWhen` |
| `context.select<C, T>((s) => ...)` | Same as `BlocSelector`, inline inside a `build` |
| `context.read<C>()` | Get the Cubit to call a method — never in `build` unless in an event handler |
| `context.watch<C>()` | Rebuild on any change — avoid when a `select` will do |
| `BlocListener` | Fire-and-forget side effects (navigation, snackbars, dialogs) — no rebuild |
| `BlocConsumer` | Combine listener + builder in one widget |

### Rebuild-scope examples

```dart
// BAD: rebuilds whole screen on every UsersState change
BlocBuilder<UsersCubit, UsersState>(
  builder: (context, state) => Column(children: [
    _Toolbar(),           // rebuilds every state change
    _UsersList(state),    // rebuilds — expected
  ]),
);

// GOOD: only the list rebuilds
Column(children: [
  const _Toolbar(),
  BlocBuilder<UsersCubit, UsersState>(
    builder: (context, state) => _UsersList(state),
  ),
]);

// BETTER: only rebuild when the users LIST changes, not on loading transitions
BlocSelector<UsersCubit, UsersState, List<PublicUser>?>(
  selector: (state) => switch (state) {
    UsersLoaded(:final users) => users,
    _ => null,
  },
  builder: (context, users) {
    if (users == null) return const _UsersSkeleton();
    return _UsersList(users);
  },
);
```

### Side effects — never in `builder`

```dart
// BAD: navigation from BlocBuilder builder runs on every rebuild
BlocBuilder<AuthCubit, AuthState>(builder: (context, state) {
  if (state is Unauthenticated) Navigator.of(context).pushNamed('/login'); // ❌
  return const HomeScaffold();
});

// GOOD: BlocListener for side effects, BlocBuilder (or nothing) for UI
BlocListener<AuthCubit, AuthState>(
  listenWhen: (prev, curr) => curr is Unauthenticated,
  listener: (context, _) => context.go('/login'),
  child: const HomeScaffold(),
);
```

Rule: `builder` is a pure function of state → widgets. Anything with a side effect goes in `listener`.

## Testing — `bloc_test`

Every Cubit/Bloc gets a test file next to it in `test/features/<feature>/`.

```dart
// test/features/users/users_cubit_test.dart
import 'package:bloc_test/bloc_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:test/test.dart';

class _MockRepo extends Mock implements UsersRepository {}

void main() {
  late _MockRepo repo;

  setUp(() => repo = _MockRepo());

  blocTest<UsersCubit, UsersState>(
    'emits [Loading, Loaded] on successful load',
    build: () {
      when(() => repo.listUsers()).thenAnswer(
        (_) async => Ok([PublicUser(id: '1', email: 'a@b.c', name: 'A')]),
      );
      return UsersCubit(repo);
    },
    act: (c) => c.load(),
    expect: () => [
      const UsersLoading(),
      isA<UsersLoaded>().having((s) => s.users.length, 'users.length', 1),
    ],
  );

  blocTest<UsersCubit, UsersState>(
    'emits [Loading, Error] when the repo fails',
    build: () {
      when(() => repo.listUsers()).thenAnswer(
        (_) async => const Err(AppError.network('offline')),
      );
      return UsersCubit(repo);
    },
    act: (c) => c.load(),
    expect: () => [
      const UsersLoading(),
      isA<UsersError>().having((s) => s.message, 'message', contains('offline')),
    ],
  );
}
```

Rules:
- One `blocTest` per behavior. Don't chain `act:` scenarios in a single test.
- Expect the states you emit, in order. Use `isA<T>().having(...)` when the state carries data.
- Mock the repository, not `Dio`. Networking has its own tests in the networking skill.
- Run `flutter test` (leaks are checked via `leak_tracker` — see the UI skill).

### Widget tests

For UI tests that need a Bloc, use `BlocProvider.value` and inject a mock Bloc from `bloc_test`:

```dart
class _MockUsersCubit extends MockCubit<UsersState> implements UsersCubit {}

testWidgets('renders the list when loaded', (tester) async {
  final cubit = _MockUsersCubit();
  when(() => cubit.state).thenReturn(UsersLoaded(const []));
  await tester.pumpWidget(
    MaterialApp(home: BlocProvider.value(value: cubit, child: const UsersScreen())),
  );
  expect(find.byType(_UsersList), findsOneWidget);
});
```

## Global Observability — `BlocObserver`

Every Bloc/Cubit transition and every uncaught error flows through the app-wide `Bloc.observer`. Install one — it's the single hook for debug logging and (later) crash reporting, and it costs nothing when nothing's wired to it.

```dart
// apps/mobile/lib/core/observers/app_bloc_observer.dart
import 'package:bloc/bloc.dart';
import 'package:logging/logging.dart';

class AppBlocObserver extends BlocObserver {
  AppBlocObserver({this.verbose = false});
  final bool verbose;
  static final _log = Logger('bloc');

  @override
  void onChange(BlocBase bloc, Change change) {
    super.onChange(bloc, change);
    if (verbose) {
      _log.fine('${bloc.runtimeType} ${change.currentState.runtimeType} '
                '→ ${change.nextState.runtimeType}');
    }
  }

  @override
  void onError(BlocBase bloc, Object error, StackTrace stackTrace) {
    // Every uncaught error inside a Bloc/Cubit lands here. Report before
    // rethrowing to the framework — future Sentry/Crashlytics wire-up goes here.
    _log.severe('${bloc.runtimeType} error', error, stackTrace);
    super.onError(bloc, error, stackTrace);
  }
}
```

Install once, before `runApp`:

```dart
// apps/mobile/lib/main.dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  _initLogging();                                        // see flutter-networking
  Bloc.observer = AppBlocObserver(verbose: !kReleaseMode);
  // configureDependencies(...); runApp(...);
}
```

Rules:

- **Never log state contents at INFO** — same PII rule as the networking logger. Log types (`UsersLoaded → UsersError`), not payloads.
- **Do not use `onTransition` for Cubits** — Cubits emit via `onChange`; `onTransition` only fires for Blocs (event → state). Prefer `onChange` when you want a uniform hook across both.
- **One observer, not many.** `Bloc.observer` is a single global slot; a chain is your own concern (compose inside `AppBlocObserver`).
- **Crash reporting when it exists** — the `onError` branch is where you'd `Sentry.captureException(error, stackTrace: stackTrace)`. Do not add it until crash reporting is actually installed.

## Anti-patterns

- **Rebuilding the `MaterialApp` on auth change.** State updates ripple down; a Cubit + `BlocListener` calling `context.go('/login')` is enough. The single long-lived `GoRouter` stays put — see `apps/mobile/CLAUDE.md`.
- **One giant `AppCubit`.** Force every screen to rebuild on unrelated updates. Split by feature.
- **`context.read` inside `build`.** It won't rebuild when the Bloc replaces itself (rare, but real). Read via `select`/`watch` if you're in `build`; `read` only in event handlers.
- **`emit` after `close()`.** Throws in strict mode. Guard with `if (isClosed) return;` before every `emit` in an async method.
- **Manually-instantiated Cubit.** `final c = MyCubit()` in a widget = you own `close()` and will forget → leak. Always use `BlocProvider`.
- **Reading a Cubit that isn't yet provided.** `context.read<UsersCubit>()` in a route above the `BlocProvider` throws at runtime. Provide at or above the widget that reads.
- **Freezed / json_serializable for state.** Sealed classes + `Equatable` are enough for state. Reserve codegen for API models (which are OpenAPI-generated anyway).

## No Riverpod for New Code — INVIOLABLE RULE

The state approach for `apps/mobile` is **Bloc only**. Riverpod is legacy — tolerated in exactly one file, added nowhere else. Every PR review checks this.

### The rule

**New feature code adds ZERO new Riverpod symbols anywhere except `lib/state/providers.dart`.** Specifically banned everywhere else in `lib/`:

- `import 'package:flutter_riverpod/flutter_riverpod.dart';`
- `Provider<T>`, `StateProvider<T>`, `FutureProvider<T>`, `StreamProvider<T>`, `NotifierProvider<T>`, `AsyncNotifierProvider<T>` or any of their `.family` / `.autoDispose` variants
- `Consumer`, `ConsumerWidget`, `ConsumerStatefulWidget`, `HookConsumerWidget`
- `ref.watch(...)`, `ref.read(...)`, `ref.listen(...)`
- `ProviderScope` anywhere outside `main.dart`'s single top-level scope

### The single tolerated exception

`lib/state/providers.dart` is the ONE file where Riverpod may live. Its only legitimate role is a **one-way bridge** — Riverpod providers that read from `serviceLocator` for widgets that haven't been migrated to Bloc yet. Real shape:

```dart
// lib/state/providers.dart — the ONLY Riverpod file
final shareServiceProvider = Provider<ShareService>((ref) {
  return serviceLocator<ShareService>();     // bridge to get_it
});
```

**Rules for the bridge:**
- The bridge reads from `serviceLocator`, never the reverse
- Do NOT `ref.read(...)` from inside a get_it factory
- The bridge does NOT grow over time — every migration ticket shrinks it
- New code depends on `serviceLocator<T>()` directly (via a Bloc constructor) OR uses `BlocProvider`; new code never depends on a Riverpod provider

### Why banned outright, not "prefer Bloc"

Mixed state approaches double the surface a new dev has to learn, split the debugging story (Riverpod dev tools vs Bloc observer), and create decision paralysis at every "how do I share this across widgets" moment. One approach forces one answer. See [flutter-dependencies](../flutter-dependencies/SKILL.md) for the DI side of the same principle.

### Review gate (auto-reject any PR that violates this)

```bash
# Any add of a Riverpod symbol outside lib/state/providers.dart is a red flag
git diff --diff-filter=A origin/main..HEAD -- 'apps/mobile/lib/**/*.dart' ':!apps/mobile/lib/state/providers.dart' | \
  grep -E '^\+.*\b(flutter_riverpod|ConsumerWidget|ConsumerStatefulWidget|Consumer|ProviderScope|ref\.(watch|read|listen)|Provider<|StateProvider<|FutureProvider<|StreamProvider<|NotifierProvider<|AsyncNotifierProvider<)'
```

Non-empty output = reject. Reviewer's paste-ready snippet.

### Migrating an existing Riverpod-consuming feature

Per-feature, not big-bang:

1. Pick a feature (`users`, `auth`, `entitlement`).
2. Introduce a repository interface + impl (see [flutter-networking](../flutter-networking/SKILL.md)) if it doesn't exist.
3. Write a Cubit/Bloc + sealed states next to the feature.
4. Register the repository in `serviceLocator` via `configureLocator` (see [flutter-dependencies](../flutter-dependencies/SKILL.md)).
5. Register the Bloc at route scope via `BlocProvider(create: (_) => serviceLocator<MyBloc>())`.
6. Convert the screen from `ConsumerWidget` to `StatelessWidget` (or `StatefulWidget` if it holds controllers).
7. Delete the corresponding Riverpod providers in `lib/state/providers.dart` when the feature is fully cut over.
8. When `lib/state/providers.dart` is empty, remove `flutter_riverpod` from `pubspec.yaml` and delete the file.

Do NOT mix Riverpod and Bloc on the same feature — pick one per feature. Every migration ticket must SHRINK `lib/state/providers.dart`, never expand it.

## Checklist for a New Feature Cubit/Bloc

- [ ] Sealed state hierarchy in `<feature>_state.dart`
- [ ] Events sealed (if a Bloc, not a Cubit) in `<feature>_event.dart`
- [ ] Cubit/Bloc constructor takes explicit dependencies (repository interfaces, not concrete types)
- [ ] Registered via `BlocProvider` at the smallest scope that needs it
- [ ] UI reads via `BlocSelector` or `select` — never blanket `watch` on a big state
- [ ] Side effects in `BlocListener`, never in `builder`
- [ ] `bloc_test` covers happy path + error path + edge (idempotency, no-op if already loading)
- [ ] No manual `close()` — provider owns lifecycle

## Authoritative References

- **`flutter_bloc`**: https://pub.dev/packages/flutter_bloc
- **`bloc_test`**: https://pub.dev/packages/bloc_test
- **`bloc_concurrency`**: https://pub.dev/packages/bloc_concurrency
- **Bloc official docs**: https://bloclibrary.dev/
- Related skills: [flutter-modular-architecture](../flutter-modular-architecture/SKILL.md) (`get_it` wiring for the repositories Blocs depend on), [flutter-networking](../flutter-networking/SKILL.md) (repository + interceptor layer), [flutter-ui](../flutter-ui/SKILL.md) (rebuild scope + dispose audit), [frontend-patterns](../frontend-patterns/SKILL.md) (index across Admin + Mobile)
- Mobile conventions: `apps/mobile/CLAUDE.md`
