---
name: flutter-testing
description: Testing patterns for apps/mobile — the tester.takeException() rule (never override FlutterError.onError + expect + tearDown-restore, which deadlocks the widget-test binding for 10 min per hang), the dart_test.yaml global timeout as the always-on safety net, hand-rolled fakes via noSuchMethod (no mockito/mocktail here), repository-layer HTTP stubbing (never MockAdapter), SharedPreferences.setMockInitialValues, AppConfig/Secrets.debugSetInstance seams, safe pumpAndSettle usage, multi-size smoke + layout-intent + golden test patterns, and leak_tracker in tests. Use when adding a new test, debugging a slow/hanging suite, or reviewing a PR that touches test files.
user-invocable: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Flutter Testing Skill

## Purpose

Give `apps/mobile` one predictable way to write tests that stay fast, honest, and easy to debug. This skill exists because the alternative — the default Flutter testing patterns — includes a small number of footguns that individually turn 42-second runs into 30-minute runs and drop real bugs on the floor.

Every rule here is tied to a real crash or slowdown observed in this codebase. No speculative "best practice" — only patterns that survived a specific investigation.

## When This Skill Applies

- Adding any test file to `test/` or `integration_test/`
- Adding a test for a Bloc, repository, widget, or golden
- Debugging a hanging suite, a suite that got slow, a test that fails only in CI
- Reviewing a PR that adds/changes test files
- Diagnosing "why did `/pre-pr` take 30 min"

## Composes With

- [flutter-async-safety](../flutter-async-safety/SKILL.md) — the crash class this skill catches at test time
- [flutter-state-bloc](../flutter-state-bloc/SKILL.md) — Bloc test shape (no `bloc_test` package in this repo; hand-rolled `stream.firstWhere`)
- [flutter-networking](../flutter-networking/SKILL.md) — HTTP is stubbed via repository-layer fakes, NOT `MockAdapter`
- [flutter-env-config](../flutter-env-config/SKILL.md) / [flutter-secrets](../flutter-secrets/SKILL.md) — seed via `debugSetInstance` in every test setUp
- [flutter-dependencies](../flutter-dependencies/SKILL.md) — `configureLocator` is idempotent so tests can re-run

## Package Baseline

```yaml
# apps/mobile/pubspec.yaml
dev_dependencies:
  flutter_test:
    sdk: flutter
  integration_test:
    sdk: flutter
```

**That's it.** No `mockito`, no `mocktail`, no `bloc_test`, no `golden_toolkit`. This is intentional:

- Fakes are hand-rolled — one small class per collaborator, `implements SomeInterface`, `noSuchMethod(...) => null` catches unimplemented surfaces. Zero dependency, zero codegen, exact shape control.
- Bloc tests use `bloc.stream.firstWhere((s) => s is SomeState)` directly — `bloc_test` adds no value at this codebase's size.
- Goldens use `matchesGoldenFile` directly — `golden_toolkit` adds a device abstraction we don't need.

If a NEW test dependency ever feels justified, the bar is: a specific pain that hand-rolling can't solve, not "the other codebase I worked in used this."

## The Suite Must Fail Fast — `dart_test.yaml` Global Timeout

**Non-negotiable.** `apps/mobile/dart_test.yaml` sets `timeout: 60s`.

```yaml
# apps/mobile/dart_test.yaml
timeout: 60s

tags:
  golden:
    description: >-
      Golden-image tests (Figma-fidelity render locks). Platform-sensitive;
      exclude on cross-platform CI runners.
```

### Why

`AutomatedTestWidgetsFlutterBinding` — the binding that powers `testWidgets` — sets its OWN internal 10-minute default timeout via a real-clock `Timer` inside `runTest`. **This is independent of the CLI `--timeout` flag**, so `flutter test --timeout=30s` does NOT preempt the binding's timer.

Only two things preempt it:

1. `dart_test.yaml`'s top-level `timeout:` (via `TestOn` metadata baked into the test package)
2. A per-test `@Timeout(Duration(...))` annotation

**Real cost of not having this.** On 2026-08-03 we investigated a 30-min `/pre-pr` runtime. Root cause: ONE file (`test/features/support/support_screen_multi_size_smoke_test.dart`) with 3 tests each hitting the 10-min default = 30 min flat, hiding real Support-screen overflow bugs behind a mysterious hang. Fix: add `timeout: 60s` + rewrite the offending test to use `tester.takeException()` (see next section). Result: 30 min → 42 sec.

### If a specific test legitimately needs longer

```dart
testWidgets(
  'expensive golden regeneration',
  (tester) async { ... },
  timeout: const Timeout(Duration(minutes: 2)),
);
```

## The `tester.takeException()` Rule — NEVER Override `FlutterError.onError`

The Flutter widget-test binding has a subtle contract: when a widget-under-test throws, the exception is stashed in `_pendingExceptionDetails`, and the test framework expects EXACTLY ONE thing to consume it — either `tester.takeException()` (which clears it) or the natural end-of-test flow (which surfaces it).

The "helpful" antipattern below LOOKS like it captures exceptions cleanly. It doesn't:

```dart
// ❌ WRONG — DEADLOCKS THE BINDING FOR 10 MIN ON EVERY FAILURE
testWidgets('no layout exception at 320×600', (tester) async {
  final errors = <FlutterErrorDetails>[];
  final originalOnError = FlutterError.onError;
  FlutterError.onError = errors.add;
  addTearDown(() => FlutterError.onError = originalOnError);

  await pumpAt(tester, w: 320, h: 600);

  expect(errors, isEmpty, reason: '...');
  // If errors is NOT empty (real overflow):
  //   expect() throws TestFailure → routed through the STILL-overridden
  //   FlutterError.onError → added to errors → framework sees
  //   _pendingExceptionDetails != null → assertion fires → binding waits
  //   for the exception to be handled → nothing handles it → HANG for
  //   the 10-min binding timeout.
});
```

**Correct pattern:**

```dart
// ✅ CORRECT — idiomatic, no deadlock, fails cleanly in <1s
testWidgets('no layout exception at 320×600', (tester) async {
  await pumpAt(tester, w: 320, h: 600);
  final exception = tester.takeException();
  expect(
    exception,
    isNull,
    reason: 'layout exception at 320×600: $exception',
  );
});
```

`tester.takeException()`:
- Pulls out whatever the framework caught (a `RenderFlex overflowed`, an assertion, a Zone-caught throw)
- Clears the pending-exception slot so the framework moves on
- Returns the exception (or `null` if none)

**Rules:**
- **Never override `FlutterError.onError` in a test.** If you think you need to, you want `tester.takeException()`.
- **Never `addTearDown(() => FlutterError.onError = originalOnError)`.** Even the RIGHT restore order can't save you from the ordering trap above.
- **If you need to inspect MULTIPLE exceptions** in one test, call `tester.takeException()` after each pump/settle boundary and accumulate. Do not batch.

## Widget Test Provisioning

### Seed `AppConfig` + `Secrets` in setUp — always

`AppConfig.instance` and `Secrets.instance` throw before `.initialize()`. Widget tests never call the real initialize (it reads a bundled asset via the platform channel), so every test file must seed:

```dart
setUp(() {
  AppConfig.debugSetInstance(AppConfig.forTest());
  Secrets.debugSetInstance(Secrets.forTest());
});
```

For a test that exercises secret-gated code:

```dart
Secrets.debugSetInstance(Secrets.forTest(
  metaAppId: '1234567890',
  metaClientToken: 'abcdef',
));
```

See [flutter-env-config](../flutter-env-config/SKILL.md) and [flutter-secrets](../flutter-secrets/SKILL.md).

### `SharedPreferences` — always `setMockInitialValues` before `getInstance`

Real `SharedPreferences.getInstance()` hits a platform channel that isn't wired in test binding → hangs. Always:

```dart
Future<SharedPreferences> _prefs() async {
  SharedPreferences.setMockInitialValues({});   // {} or a seeded map
  return SharedPreferences.getInstance();
}
```

To seed values:

```dart
SharedPreferences.setMockInitialValues({
  'paywall.impressions': 3,
  'app_launch.first_open_seen': true,
});
```

### Provide Blocs via `BlocProvider(create: ...)` at the route boundary

Do NOT resolve `serviceLocator<T>()` inside `build()` — hides the dependency and breaks tests that skip `configureLocator`. Provide the Bloc at the widget under test:

```dart
await tester.pumpWidget(
  MaterialApp(
    home: BlocProvider<PhoneOtpBloc>(
      create: (_) => PhoneOtpBloc(authRepository: FakeAuthRepository()),
      child: const PhoneInputScreen(),
    ),
  ),
);
```

For Riverpod-consuming widgets (legacy `lib/state/providers.dart`), wrap in `ProviderScope` with overrides. Do NOT expand the Riverpod surface for new code — see [flutter-state-bloc](../flutter-state-bloc/SKILL.md).

## HTTP Stubbing — Repository-Layer Fakes

**The rule: no HTTP call should reach the network in a widget/unit test.** This codebase does NOT use `MockAdapter` / `http_mock_adapter`. Instead, every screen depends on a repository interface, and tests inject a fake repository.

```dart
// Production shape
class PaywallBloc extends Bloc<...> {
  PaywallBloc({required this.paywallRepository, ...});
  final PaywallRepository paywallRepository;   // abstract or concrete class
}

// Test-side fake — one per test file, tight to what the test needs
class _ScriptedPaywallRepository implements PaywallRepository {
  _ScriptedPaywallRepository({Iterable<Future<PaywallConfigData> Function()> configs = const []})
      : _configs = List.of(configs);
  final List<Future<PaywallConfigData> Function()> _configs;
  int getConfigCalls = 0;

  @override
  Future<PaywallConfigData> getConfig({required String locale}) async {
    getConfigCalls++;
    if (_configs.isEmpty) throw StateError('getConfig called with no scripted response');
    return _configs.removeAt(0)();
  }
}
```

**Why this shape over `MockAdapter`:**

- No hidden dependency on Dio internals or a specific stubbing lib
- Contract stays at the repository interface — the boundary the app was designed to swap
- `noSuchMethod(...) => null` catches unimplemented surfaces automatically:

```dart
class _RecordingAnalytics implements Analytics {
  final List<_TrackedEvent> events = [];

  @override
  Future<void> trackEvent(String name, {Map<String, Object?> properties = const {}}) async {
    events.add(_TrackedEvent(name, properties));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}
```

The `noSuchMethod` fallback returns `null` for any method the test doesn't care about. Any real production method that returns a non-`Future`/`void` and the test tries to exercise it? You'll get a `NoSuchMethodError` — good, that's the signal to add the method to the fake.

## Pumping — When `pump` vs `pumpAndSettle`

- `tester.pump()` — advance one frame. Safe. Use when you know exactly what should render next.
- `tester.pump(Duration(milliseconds: 100))` — advance by a known duration. Safe with a bounded animation.
- `tester.pumpAndSettle()` — pump frames until the frame scheduler is idle. **Dangerous** — hangs for the binding timeout (10 min default, or your `dart_test.yaml` cap) if any widget under test has continuous work (shimmer, spinner, running animation, un-fired Timer).

**Rules:**
- Prefer `pump()` with a known duration over `pumpAndSettle()`
- If you must `pumpAndSettle()`, mock every platform channel and stub every async source in the tree first
- `pumpAndSettle(const Duration(milliseconds: 500))` puts a per-pump ceiling — safer than the unbounded form
- Multi-size smoke tests (see below) should use `tester.pump(const Duration(milliseconds: 16))` — single-frame, unambiguous

## Multi-Size Smoke Tests (Layout Robustness)

Every screen with `Text` inside a fixed-height container OR a `Row` with a scalable label ships a multi-size smoke test. Pattern lives at `patterns_library/testing/flutter-multi-size-smoke.md`.

Correct shape (post-2026-08-03 fix):

```dart
void main() {
  const widths = [320.0, 390.0, 428.0];
  const heights = [600.0, 800.0, 1200.0];

  for (final w in widths) {
    for (final h in heights) {
      testWidgets('no layout exception at ${w.toInt()}×${h.toInt()}',
          (tester) async {
        await pumpMyScreen(tester, viewport: Size(w, h));
        expect(
          tester.takeException(),
          isNull,
          reason: 'layout exception at ${w.toInt()}×${h.toInt()}',
        );
      });
    }
  }

  testWidgets('no layout exception at textScale 2.0 on small screen (320×600)',
      (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await pumpMyScreen(tester, viewport: const Size(320, 600));
    expect(tester.takeException(), isNull);
  });
}
```

**Do NOT** override `FlutterError.onError` in these tests. See the `tester.takeException()` section above.

## Layout-Intent Tests

Every screen with a pinned bar / flex-fill zone / internally-scrolling region ships a layout-intent test. Pattern lives at `patterns_library/testing/flutter-layout-intent.md`. Asserts each zone appears at the expected screen coordinate at 600 / 800 / 1200 dp heights.

## Golden Tests

Golden tests are platform-sensitive (macOS font rasterization ≠ Linux). This repo's convention (from the top of `dart_test.yaml`):

- Local / same-platform CI: `flutter test` runs everything
- Cross-platform CI: `flutter test --exclude-tags golden`
- Regenerate goldens: `flutter test --update-goldens test/goldens/`

Tag golden tests with `@Tags(<String>['golden'])` at the top of the file (already conventional in this repo).

## Bloc Tests — Hand-Rolled, No `bloc_test`

```dart
group('PaywallBloc', () {
  test('happy path — PaywallReady with defaultPlanId', () async {
    final repo = _ScriptedPaywallRepository(configs: [() async => _buildConfig()]);
    final bloc = PaywallBloc(
      paywallRepository: repo,
      preferences: await _prefs(),
    );
    bloc.add(const ConfigRequested('hi'));

    final state = await bloc.stream.firstWhere((s) => s is PaywallReady) as PaywallReady;
    expect(state.defaultPlanId, 'plan-weekly');
    expect(repo.getConfigCalls, 1);

    await bloc.close();
  });
});
```

**Rules:**
- Always `await bloc.close()` at the end — ties into the [flutter-async-safety](../flutter-async-safety/SKILL.md) `isClosed` rule (if the test's next line accidentally adds an event, it should throw clearly)
- Use `bloc.stream.firstWhere((s) => s is TargetState)` — no need for `bloc_test`'s DSL
- Timing-out on `firstWhere` = your bloc never emitted the expected state; the 60s `dart_test.yaml` cap ensures you find out fast

## Integration Tests

Live under `integration_test/`. NOT picked up by `flutter test` — need a booted device:

```bash
flutter test integration_test/app_test.dart -d <device>
```

Or via Nx: `pnpm e2e:android` (which wraps `flutter test integration_test/app_test.dart` with device selection). Local dev workflow: edit `env/staging.json` to point at your laptop's API first (see [flutter-env-config](../flutter-env-config/SKILL.md)).

Integration tests are slow (real emulator + real app boot) — reserve for critical end-to-end flows; do NOT reach for them when a widget test would do.

## `leak_tracker` — Catches Un-disposed Controllers

`flutter_test` includes `leak_tracker` support. Enable in `flutter_test_config.dart` (create if not present):

```dart
// test/flutter_test_config.dart
import 'dart:async';
import 'package:flutter_test/flutter_test.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  LeakTesting.enable();
  LeakTesting.settings = LeakTesting.settings.withTrackedAll();
  await testMain();
}
```

Any widget test that leaks a controller/subscription/timer past dispose will now fail — the [flutter-async-safety](../flutter-async-safety/SKILL.md) dispose-audit rules become mechanically enforced.

## Anti-Patterns

- **Overriding `FlutterError.onError` in a test.** Use `tester.takeException()`. The override pattern deadlocks the binding for 10 min when it matters — see the 2026-08-03 investigation.
- **Missing `dart_test.yaml` `timeout:`.** Widget-test binding's 10-min default hides slow/hanging tests for a very long time.
- **Unbounded `pumpAndSettle()` on a tree with animation/shimmer/streams.** Hangs until timeout. Prefer `pump(Duration)` or bound the settle.
- **Real `SharedPreferences.getInstance()` in a widget test.** Hangs on the platform channel. Always `setMockInitialValues` first.
- **`AppConfig.instance` / `Secrets.instance` without `debugSetInstance` in setUp.** Throws immediately. Every test file needs the seed.
- **`MockAdapter` / `http_mock_adapter` for HTTP stubbing.** Not this codebase. Fake at the repository layer.
- **Adding `mocktail` / `mockito` / `bloc_test` / `golden_toolkit` as dev deps.** Not this codebase. Hand-rolled fakes are the convention; the bar for a new test dep is a specific pain hand-rolling can't solve.
- **Resolving `serviceLocator<T>()` inside a widget's `build()`.** Not just an architecture violation — makes the widget untestable without spinning up the full locator.
- **Not calling `await bloc.close()` at test end.** Leaks subscriptions, may cause "emit after close" on the NEXT test if the fixture is shared.
- **`Timeout(...)` on individual tests without the `dart_test.yaml` cap.** Fine as a per-test override, but the project-wide cap is the safety net that catches everyone.

## Common Mistakes

- **Suite takes 30 minutes** — a single test somewhere is hanging for the 10-min binding default. Grep for `FlutterError.onError` overrides; add `dart_test.yaml` `timeout: 60s`; re-run with `--file-reporter=json:...` and inspect the last `testStart` without a matching `testDone`.
- **Test passes locally, fails in CI** — usually goldens (platform-sensitive). Exclude via `--exclude-tags golden` on cross-platform CI; regenerate with `--update-goldens` locally if the change was intentional.
- **`AppConfig.instance read before AppConfig.initialize()`** — missing `AppConfig.debugSetInstance(AppConfig.forTest())` in setUp.
- **`Bad state: Cannot emit new states after calling close`** in a test — the Bloc closed between one `stream.firstWhere` and a subsequent `bloc.add`. Order your assertions before `close`.
- **`Stream has already been listened to`** — you called `bloc.stream.firstWhere` twice on a broadcast-not-being-broadcast stream. Store the subscription or use `bloc.stream.take(N).toList()` for multiple states.
- **Widget test crashes with `NoSuchMethodError` on a fake** — the fake's `noSuchMethod` returned `null` but the caller expected a `Future<X>`. Add the missing method to the fake.

## Checklist — New Test File

- [ ] `setUp` seeds `AppConfig.debugSetInstance(AppConfig.forTest())` and `Secrets.debugSetInstance(Secrets.forTest())`
- [ ] Any `SharedPreferences` access uses `setMockInitialValues` before `getInstance`
- [ ] Widget provided via `BlocProvider(create:)` — no `serviceLocator<T>()` in `build`
- [ ] HTTP mocked at the repository interface, not at the Dio layer
- [ ] Every `testWidgets` that could see an exception uses `tester.takeException()` — NEVER `FlutterError.onError` override
- [ ] `pumpAndSettle()` bounded with a duration OR replaced with `pump(Duration)` where the settle target is known
- [ ] Every Bloc test `await`s `bloc.close()` at the end
- [ ] Multi-size smoke test present if the screen has scalable text inside fixed-height containers
- [ ] Layout-intent test present if the screen has pinned bars or a flex-fill zone
- [ ] Golden test (if present) tagged with `@Tags(<String>['golden'])`
- [ ] Test runs in <60s (the global cap in `dart_test.yaml` — anything close is a smell)
- [ ] `flutter analyze` clean
- [ ] `flutter test <this-file>` passes and takes what you'd expect (<5s for a widget test, <1s for a unit test)

## Enforcement

- **`dart_test.yaml timeout: 60s`** — the always-on backstop. New hang → fails in 60s, not 10 min.
- **`leak_tracker` in `flutter_test_config.dart`** — un-disposed controllers fail the test.
- **`flutter analyze`** — catches missing `await` (via `unawaited_futures` lint if enabled).
- **PR review** — grep for `FlutterError.onError` in the diff; auto-reject any override.

## Authoritative References

- Flutter test binding source: https://api.flutter.dev/flutter/flutter_test/AutomatedTestWidgetsFlutterBinding-class.html
- `tester.takeException()`: https://api.flutter.dev/flutter/flutter_test/WidgetTester/takeException.html
- `dart_test.yaml` config: https://github.com/dart-lang/test/blob/master/pkgs/test/doc/configuration.md
- `leak_tracker`: https://pub.dev/packages/leak_tracker_flutter_testing
- **2026-08-03 investigation** (the story behind the `tester.takeException()` rule + `dart_test.yaml` timeout): commit `4686c7d` in this repo; the failing file was `test/features/support/support_screen_multi_size_smoke_test.dart`
- Related skills: [flutter-async-safety](../flutter-async-safety/SKILL.md), [flutter-state-bloc](../flutter-state-bloc/SKILL.md), [flutter-networking](../flutter-networking/SKILL.md), [flutter-env-config](../flutter-env-config/SKILL.md), [flutter-secrets](../flutter-secrets/SKILL.md), [frontend-patterns](../frontend-patterns/SKILL.md)
- Patterns: `patterns_library/testing/flutter-multi-size-smoke.md`, `patterns_library/testing/flutter-layout-intent.md`
