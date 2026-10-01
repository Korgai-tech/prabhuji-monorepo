---
name: flutter-dependencies
description: Dependency injection for apps/mobile using get_it — the serviceLocator singleton (not `getIt`), configureLocator entry point, registerSingleton / registerLazySingleton / registerFactory lifetime choice, idempotent reset for tests, optional-registration guard for subsystems, Bloc interop (BlocProvider owns route-scoped Blocs; serviceLocator owns app-scoped infra), and the legacy Riverpod bridge. Use when adding a repository / service / store, wiring a new Bloc's dependencies, or asking "how do I share X across features."
user-invocable: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Flutter Dependencies Skill

## Purpose

Give `apps/mobile` one predictable place to wire long-lived infrastructure: `get_it` in the shape this repo committed to — `serviceLocator` (not `getIt`), `configureLocator` (not `configureDependencies`), string envs (not enums), and idempotent reset so tests re-run cleanly. Composes with `flutter_bloc` (Blocs are route-scoped, owned by `BlocProvider`, NOT registered here) and the legacy Riverpod code in `lib/state/providers.dart` (bridged in one direction only — Riverpod providers read from `serviceLocator`, never the reverse).

## When This Skill Applies

- Adding a new repository, store, service, or long-lived infra piece
- Wiring the dependencies for a new Bloc
- Asking "should this be a singleton or a factory?"
- Adding an optional subsystem (Firebase, FCM, paywall) that some tests skip
- Bridging a Riverpod provider to a get_it-registered service
- Debugging `Bad state: GetIt: Object/factory with type X is not registered inside GetIt`

## Composes With

- [flutter-state-bloc](../flutter-state-bloc/SKILL.md) — Blocs live under `BlocProvider`; `serviceLocator` gives them their dependencies, never their lifecycle
- [flutter-env-config](../flutter-env-config/SKILL.md) — `configureLocator` runs AFTER `AppConfig.initialize()`
- [flutter-secrets](../flutter-secrets/SKILL.md) — same; some registrations gate on `Secrets.instance.<feature>Enabled`
- [flutter-networking](../flutter-networking/SKILL.md) — `Dio` and repositories are what `serviceLocator` holds
- [flutter-routing](../flutter-routing/SKILL.md) — `GoRouter` is app-scoped and belongs here (long-lived, single instance)

## Package Baseline

```yaml
# apps/mobile/pubspec.yaml
dependencies:
  get_it: ^7.7.0
```

Do NOT add `injectable` / `injectable_generator` / `build_runner`. Wiring is plain manual registration in `lib/core/service_locator.dart` — no codegen, no `.g.dart` churn, no `--delete-conflicting-outputs`. If the graph ever grows past ~40 registrations that feel duplicative, revisit — until then, manual wins.

## The Naming — `serviceLocator`, Not `getIt`

The get_it README uses `getIt`. This repo uses `serviceLocator`. The reason is small but load-bearing:

- `getIt<Foo>()` names the library.
- `serviceLocator<Foo>()` names the pattern (Fowler's Service Locator).

If get_it is ever swapped for something else, the second name doesn't lie. Match the convention:

```dart
// lib/core/service_locator.dart
import 'package:get_it/get_it.dart';

final GetIt serviceLocator = GetIt.instance;
```

The entry-point function is `configureLocator`, not `configureDependencies` — same rationale (locator is what's being configured; "dependencies" are what's being *put into* it).

## The Shape

### File layout

```text
apps/mobile/lib/
├── core/
│   ├── service_locator.dart       # the ONLY file that wires get_it
│   ├── auth_store.dart            # long-lived — registered here
│   ├── dio_client.dart            # buildDio(store) — result registered here
│   └── analytics.dart             # optional — nullable via isRegistered<Analytics>()
└── features/<feature>/
    ├── data/<feature>_repository.dart   # registered as LazySingleton
    └── bloc/<feature>_bloc.dart         # NOT registered as singleton — factory or BlocProvider
```

### The signature — `configureLocator`

```dart
// lib/core/service_locator.dart
Future<void> configureLocator({
  required AuthStore authStore,
  required Dio dio,
  Analytics? analytics,
  SharedPreferences? preferences,
  SessionContext? sessionContext,
  FirebaseTokenSync? firebaseTokenSync,
  FirebaseNotifications? firebaseNotifications,
}) async {
  if (serviceLocator.isRegistered<AuthStore>()) {
    await serviceLocator.reset();     // idempotent — tests re-run cleanly
  }

  // 1. Shared singletons (eager, cheap, everything depends on these)
  serviceLocator.registerSingleton<AuthStore>(authStore);
  serviceLocator.registerSingleton<Dio>(dio);
  if (analytics != null) {
    serviceLocator.registerSingleton<Analytics>(analytics);
  }
  serviceLocator.registerSingleton<SessionContext>(sessionContext ?? SessionContext());

  // 2. Repositories (lazy — one per app, materialized on first resolve)
  serviceLocator.registerLazySingleton<AuthRepository>(
    () => AuthRepository(serviceLocator<Dio>()),
  );
  serviceLocator.registerLazySingleton<UsersRepository>(
    () => UsersRepository(serviceLocator<Dio>()),
  );

  // 3. App-scoped Blocs (rare — orchestrators the router listens to)
  //    Lazy singleton because refreshListenable holds ONE stream reference.
  serviceLocator.registerLazySingleton<OnboardingOrchestratorBloc>(
    () => OnboardingOrchestratorBloc(
      authStore: serviceLocator<AuthStore>(),
      usersRepository: serviceLocator<UsersRepository>(),
      analytics: serviceLocator.isRegistered<Analytics>()
          ? serviceLocator<Analytics>()
          : null,
    ),
  );

  // 4. Route-scoped Blocs (factory — fresh instance per navigation)
  serviceLocator.registerFactory<PhoneOtpBloc>(
    () => PhoneOtpBloc(
      authRepository: serviceLocator<AuthRepository>(),
      analytics: serviceLocator.isRegistered<Analytics>()
          ? serviceLocator<Analytics>()
          : null,
    ),
  );

  // 5. Optional subsystems (guarded — tests skip Firebase / paywall)
  if (firebaseTokenSync != null) {
    serviceLocator.registerSingleton<FirebaseTokenSync>(firebaseTokenSync);
  }
  if (preferences != null) {
    serviceLocator.registerSingleton<SharedPreferences>(preferences);
    serviceLocator.registerFactory<PaywallBloc>(
      () => PaywallBloc(
        paywallRepository: serviceLocator<PaywallRepository>(),
        preferences: serviceLocator<SharedPreferences>(),
      ),
    );
  }
}
```

Real file: `apps/mobile/lib/core/service_locator.dart`.

## Registration Lifetimes — Which Fits What

| API | Lifetime | Use for |
|---|---|---|
| `registerSingleton<T>(instance)` | One, eager (created at `configureLocator` time — you construct it yourself) | `AuthStore`, `Dio`, `SessionContext`, `Analytics` — cheap-to-hold, everything depends on them, sometimes needs pre-construction (e.g., `AuthStore().hydrate()` runs BEFORE `configureLocator`) |
| `registerLazySingleton<T>(factory)` | One, on first resolve | Every repository. Also app-scoped orchestrator Blocs the router's `refreshListenable` listens to |
| `registerFactory<T>(factory)` | New instance per resolve | Every route-scoped Bloc that must start clean on re-entry (`PhoneOtpBloc`, `PaywallBloc`, `NameLanguageBloc`) |

**Rules of thumb:**

- Repository → always `LazySingleton`. Factory would give each Bloc its own connection pool.
- Route-scoped Bloc → `Factory`. Singleton would leak state across visits.
- App-scoped orchestrator Bloc → `LazySingleton`. The router holds ONE stream reference via `refreshListenable`.
- Something constructed in `main()` before `configureLocator` runs (like `AuthStore` after `.hydrate()`) → passed in as a parameter and `registerSingleton`.

## Idempotency — Reset First If Already Registered

The FIRST thing `configureLocator` does:

```dart
if (serviceLocator.isRegistered<AuthStore>()) {
  await serviceLocator.reset();
}
```

Why: tests call `configureLocator` in `setUp`. Without the reset, the second call throws "already registered." `AuthStore` is the sentinel because it's the first thing registered — if it's there, everything is.

## Optional Dependencies — The `isRegistered<T>()` Guard

Some subsystems are absent in tests (Firebase, FCM, paywall). The pattern:

```dart
// Registration side — only register when the caller provided it
if (firebaseTokenSync != null) {
  serviceLocator.registerSingleton<FirebaseTokenSync>(firebaseTokenSync);
}

// Consumer side — check before resolving
if (serviceLocator.isRegistered<FirebaseTokenSync>()) {
  unawaited(serviceLocator<FirebaseTokenSync>().syncIfAuthenticated());
}
```

Never `try { serviceLocator<X>() } catch(_) {}` — it hides real registration bugs behind a swallowed exception.

## `main()` Init Order

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // …platform prep (orientation lock, MediaKit init)

  await AppConfig.initialize();       // 1. env config
  await Secrets.initialize();         // 2. gitignored secrets

  // 3. Construct things configureLocator needs as inputs
  final store = AuthStore();
  await store.hydrate();
  final preferences = await SharedPreferences.getInstance();
  final analytics = await Analytics.init(/* … */);
  final dio = buildDio(store);
  // …optional: Firebase init, FCM

  // 4. Wire everything into the locator
  await configureLocator(
    authStore: store,
    dio: dio,
    analytics: analytics,
    preferences: preferences,
    // …
  );

  // 5. Optional post-wire side effects
  serviceLocator<UserPropertiesTracker>().onAppOpen();

  runApp(const MobileApp());
}
```

Real file: `apps/mobile/lib/main.dart`.

**Why `Dio`, `AuthStore`, `analytics` are constructed in `main()` and PASSED IN** (rather than built inside `configureLocator`):

- `AuthStore.hydrate()` must complete before anything reads the token — pulling this out of the locator keeps the async boundary explicit.
- `Dio` reads `AppConfig.instance.apiUrl` — building it in `main()` after `AppConfig.initialize()` puts the read at the same place as the init.
- `Analytics.init` can throw (Firebase / Amplitude platform channel) — wrapping in `try` in `main()` and passing null keeps the locator simple.

## Bloc Interop — Who Owns Whom

**`BlocProvider` owns the Bloc lifecycle. `serviceLocator` gives the Bloc its dependencies.**

```dart
// ✅ Correct — route builder pulls a fresh Bloc from the locator's factory,
// BlocProvider disposes it when the route pops.
GoRoute(
  path: '/phone-input',
  builder: (_, __) => BlocProvider<PhoneOtpBloc>(
    create: (_) => serviceLocator<PhoneOtpBloc>(),
    child: const PhoneInputScreen(),
  ),
),

// ❌ Wrong — Bloc registered as singleton, state leaks across visits
serviceLocator.registerLazySingleton<PhoneOtpBloc>(() => PhoneOtpBloc(...));

// ❌ Wrong — resolving inside build() defeats testability and hides deps
Widget build(BuildContext context) {
  final bloc = serviceLocator<PhoneOtpBloc>();   // never do this
  return BlocBuilder<PhoneOtpBloc, PhoneOtpState>(bloc: bloc, /* … */);
}
```

**App-scoped orchestrator Blocs are the exception.** The router's `refreshListenable` needs ONE long-lived stream instance across every screen. Register as `LazySingleton` and provide via `BlocProvider<T>.value`:

```dart
BlocProvider<OnboardingOrchestratorBloc>.value(
  value: serviceLocator<OnboardingOrchestratorBloc>(),
  child: MaterialApp.router(routerConfig: router),
),
```

## Legacy Riverpod Bridge

`apps/mobile` still runs some legacy Riverpod code in `lib/state/providers.dart`. New code is Bloc-first (see [flutter-state-bloc](../flutter-state-bloc/SKILL.md)), but the bridge is one-way and stable: **Riverpod providers read from `serviceLocator`, never the reverse.**

```dart
// lib/state/providers.dart
final shareServiceProvider = Provider<ShareService>((ref) {
  return serviceLocator<ShareService>();   // Riverpod delegates to get_it
});
```

**Rules:**
- Do NOT register a Riverpod provider in `serviceLocator`. If a Bloc needs the value, resolve `serviceLocator<T>()` directly in `configureLocator`; if a Riverpod-consuming widget needs it, the existing provider in `providers.dart` already bridges.
- Do NOT `ref.read()` from inside a get_it factory — the locator has no `ref`.
- Overrides for tests happen in the Riverpod `ProviderScope`, not the locator. Both scoping systems own their own test surface.

The bridge is stable, not deprecated — no urgent rip-out. Migration happens ticket-by-ticket, feature-by-feature, over time.

## Testing

### Test setup

```dart
setUp(() async {
  // 1. Seed AppConfig + Secrets first (see flutter-env-config, flutter-secrets)
  AppConfig.debugSetInstance(AppConfig.forTest());
  Secrets.debugSetInstance(Secrets.forTest());

  // 2. Construct real (or fake) infra
  final store = AuthStore();          // in-memory; hydrate() no-ops in tests
  final dio = MockDio();              // or a real Dio with a mocked adapter

  // 3. Wire the locator — configureLocator's own `isRegistered` guard resets first
  await configureLocator(authStore: store, dio: dio);
});

tearDown(() async {
  await serviceLocator.reset();       // belt-and-suspenders; setUp resets too
});
```

### Skipping optional subsystems

Tests that don't touch paywall/Firebase/FCM simply DON'T pass those params:

```dart
await configureLocator(authStore: store, dio: dio);
// preferences omitted → paywall blocs never registered → any /paywall
// navigation surfaces a clear "not registered" error at the boundary
```

### Overriding a single registration

```dart
await configureLocator(authStore: store, dio: dio);
await serviceLocator.unregister<UsersRepository>();
serviceLocator.registerLazySingleton<UsersRepository>(() => FakeUsersRepository());
```

### Widget-test provisioning

Provide the Bloc directly, not via `serviceLocator` inside `build()`:

```dart
await tester.pumpWidget(
  BlocProvider<PhoneOtpBloc>(
    create: (_) => PhoneOtpBloc(authRepository: FakeAuthRepository()),
    child: const MaterialApp(home: PhoneInputScreen()),
  ),
);
```

## Anti-Patterns

- **Registering a Bloc as `Singleton` or `LazySingleton`** when it's route-scoped. State leaks across visits; the second visit sees the first visit's errors.
- **Resolving `serviceLocator<X>()` inside `build()`.** Hides the dependency, breaks widget tests that don't wire the locator, defeats route-scoped Bloc semantics.
- **Registering `Dio` as `Factory`.** New connection pool per resolve, interceptors re-registered per resolve. Always singleton.
- **Constructing `AuthStore()` in `main()` AND registering `AuthStore()` (fresh) inside `configureLocator`.** Two sources of truth; the token you just hydrated is unreachable. Pass the constructed instance in, register that.
- **Reading a `Secrets` / `AppConfig` value inside a get_it factory that runs before their `.initialize()` completed.** All factories are lazy — the read runs when someone resolves the type, not at registration. But if `configureLocator` calls `registerSingleton<X>(X(AppConfig.instance…))` eagerly, that read happens NOW. Order matters: `AppConfig.initialize()` → `Secrets.initialize()` → `configureLocator(...)`.
- **`try { serviceLocator<X>() } catch(_) {}`** to "handle optional deps." Use `isRegistered<X>()` — the try-catch hides real registration bugs.
- **Circular DI at registration time** (`AuthCubit` needs `Repository` needs `AuthCubit`'s sign-out callback). Break the cycle with an event bus / `ChangeNotifier` that both sides read; register the bus, not the callback.
- **Registering a Riverpod provider inside `serviceLocator`.** The bridge goes one direction only.
- **Skipping the `isRegistered<AuthStore>()` reset guard.** Test re-runs throw "already registered" and the failure looks like a bug in your test, not the setup.

## Common Mistakes

- **`Bad state: GetIt: Object with type X is not registered`** — either `configureLocator` didn't run (widget test forgot to call it), or the type was gated on an optional param the test didn't pass. Check `isRegistered<X>()` at the call site if the type is genuinely optional.
- **A Bloc's state persists across navigation into and out of a screen** — the Bloc is registered as a singleton. Switch to `registerFactory`.
- **Widget test hangs on `SharedPreferences.getInstance()`** — the platform channel is stubbed in test binding. Resolve `SharedPreferences` in `main()` and pass it into `configureLocator`; skip that param in tests that don't need the paywall.
- **`serviceLocator.reset()` in a test doesn't clear a specific type** — `reset()` clears everything. To clear one, `unregister<T>()`.

## Checklist for a New Registration

- [ ] Decide lifetime: `Singleton` (eager, cheap) / `LazySingleton` (repo / long-lived) / `Factory` (route-scoped Bloc)
- [ ] Added to `configureLocator` in `service_locator.dart`
- [ ] Dependencies pulled from `serviceLocator<...>()` inside the factory — never `new X()` at registration if `X` needs other registered types
- [ ] Optional subsystem? Guard registration on `param != null`; guard consumer on `isRegistered<T>()`
- [ ] Bloc? Provided via `BlocProvider` (route builder) or `BlocProvider<T>.value` (app-scoped)
- [ ] Widget code does NOT call `serviceLocator<T>()` inside `build()`
- [ ] Widget test either wires `configureLocator` in `setUp` OR provides the Bloc directly via `BlocProvider(create:)`
- [ ] `flutter analyze` clean

## Authoritative References

- Real implementation: `apps/mobile/lib/core/service_locator.dart`
- Real init call site: `apps/mobile/lib/main.dart` (after `AppConfig` + `Secrets` init, before `runApp`)
- Riverpod bridge: `apps/mobile/lib/state/providers.dart`
- `get_it` docs: https://pub.dev/packages/get_it
- Mobile conventions: `apps/mobile/CLAUDE.md`
- Related skills: [flutter-env-config](../flutter-env-config/SKILL.md), [flutter-secrets](../flutter-secrets/SKILL.md), [flutter-state-bloc](../flutter-state-bloc/SKILL.md), [flutter-networking](../flutter-networking/SKILL.md), [flutter-routing](../flutter-routing/SKILL.md), [flutter-modular-architecture](../flutter-modular-architecture/SKILL.md) (feature layout / dependency direction), [frontend-patterns](../frontend-patterns/SKILL.md)
