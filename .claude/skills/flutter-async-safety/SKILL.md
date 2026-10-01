---
name: flutter-async-safety
description: Async safety for apps/mobile — the mount check after every await in a State (if (!mounted) return; before setState/context/Navigator/ScaffoldMessenger/Theme), BuildContext-across-async-gaps discipline (capture before await), StreamSubscription/Timer/AnimationController/TextEditingController/FocusNode dispose audit, unawaited(...) rules (when a Future's failure truly doesn't matter vs when it does), and the Bloc `if (isClosed) return;` guard before emit. Prevents the most common Flutter runtime crash class ("setState called after dispose", "Looking up a deactivated widget's ancestor", "Bad state: Cannot add new events after calling close"). Use when adding any async work inside a State, wiring a Cubit/Bloc side effect, adding a StreamSubscription, or reviewing a PR that touches lifecycle.
user-invocable: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Flutter Async Safety Skill

## Purpose

The single largest class of runtime crashes in a Flutter app is async work that outlives the widget it was started from: a network call that lands after the user navigated away, a `Timer` that fires after `dispose()`, a `StreamSubscription` that was never cancelled, a `Bloc.emit` on a closed Bloc. These crashes are silent in dev, loud in production, and 100% preventable with the same six mechanical rules applied every time.

This skill is the rulebook. Every rule here is inviolable. Every rule is small enough to enforce in review. Every rule has a "why" tied to a real crash pattern.

## When This Skill Applies

- Adding any `await` inside a `State`'s method
- Adding a `StreamSubscription`, `Timer`, `AnimationController`, `TextEditingController`, `FocusNode`, or `ScrollController`
- Wiring a Bloc side effect that calls `emit` after an `await`
- Using `Navigator.of(context)`, `ScaffoldMessenger.of(context)`, `Theme.of(context)`, `MediaQuery.of(context)` after an `await`
- Calling `Future` producers you don't intend to await (analytics, notifications, fire-and-forget writes)
- Debugging `setState called after dispose`, `Looking up a deactivated widget's ancestor`, `Bad state: Cannot emit new states after calling close`, or `Bad state: Stream has already been listened to`

## Composes With

- [flutter-state-bloc](../flutter-state-bloc/SKILL.md) — the `if (isClosed) return;` guard before `emit` lives here
- [flutter-ui](../flutter-ui/SKILL.md) — dispose audit is the widget-side surface; `leak_tracker` in tests catches misses
- [flutter-testing](../flutter-testing/SKILL.md) — `tester.takeException()` captures async crashes; unmocked platform channels cause the widget test to hang

## The Six Rules

Every rule links to the specific crash it prevents. No rule is optional.

### Rule 1 — `if (!mounted) return;` after EVERY `await` in a `State` before touching `context` / `setState` / `Navigator` / `ScaffoldMessenger` / `Theme`

The single most-violated Flutter rule. The moment you `await`, control leaves your method. When it returns, the widget may have been removed from the tree — a Navigator pop, a parent rebuild, a route replacement. `mounted` is `false` at that point; `setState` throws, `Navigator.of(context)` returns a stale reference, `ScaffoldMessenger.of(context)` crashes with "Looking up a deactivated widget's ancestor."

```dart
// ❌ Wrong — crash if the screen is popped before the await returns
Future<void> _submit() async {
  final result = await _repo.save(form);
  setState(() => _saving = false);                           // may throw
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(...));  // may throw
  Navigator.of(context).pop();                                // may throw
}

// ✅ Correct — one mount check right after the await, before ANY context/setState use
Future<void> _submit() async {
  final result = await _repo.save(form);
  if (!mounted) return;
  setState(() => _saving = false);
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(...));
  Navigator.of(context).pop();
}
```

**Multiple awaits — check after each one that precedes context use:**

```dart
Future<void> _submitAndNavigate() async {
  final result = await _repo.save(form);
  if (!mounted) return;
  setState(() => _result = result);

  await _analytics.trackEvent('form_saved');   // await #2
  if (!mounted) return;                        // second mount check
  Navigator.of(context).pushReplacementNamed('/thanks');
}
```

The rule is mechanical: **every `await` that precedes `context`/`setState`/`Navigator`/`ScaffoldMessenger`/`Theme` needs its own `if (!mounted) return;` immediately after.**

**Same rule inside `BlocListener`:**

```dart
BlocListener<FormBloc, FormState>(
  listener: (context, state) async {
    if (state is! FormSaved) return;
    await _analytics.trackEvent('form_saved');
    if (!context.mounted) return;               // BlocListener uses context.mounted
    Navigator.of(context).pushReplacementNamed('/thanks');
  },
  child: ...,
),
```

`BlocListener`'s callback receives a `BuildContext`, not a `State` — check `context.mounted` (Flutter 3.7+), NOT `mounted`.

### Rule 2 — Capture `Navigator` / `ScaffoldMessenger` / `Theme` / `MediaQuery` BEFORE the `await`

Even with the mount check, `Navigator.of(context)` after an `await` looks up the WIDGET-TREE ancestor at that moment. If the tree structure changed (unlikely but possible with route builders), the resolved Navigator may not be the one you meant. Capture before:

```dart
// ❌ Wrong — resolves Navigator against the post-await tree
Future<void> _submit() async {
  await _repo.save(form);
  if (!mounted) return;
  Navigator.of(context).pop();
}

// ✅ Correct — capture the Navigator handle before the await
Future<void> _submit() async {
  final navigator = Navigator.of(context);
  final messenger = ScaffoldMessenger.of(context);
  await _repo.save(form);
  if (!mounted) return;
  messenger.showSnackBar(const SnackBar(content: Text('Saved')));
  navigator.pop();
}
```

`Navigator`/`ScaffoldMessenger` handles remain valid as long as the underlying element wasn't disposed — the `mounted` check + captured handle is safe.

### Rule 3 — Every controller / subscription / timer disposed

`AnimationController`, `TextEditingController`, `FocusNode`, `ScrollController`, `PageController`, `StreamSubscription`, `Timer`, `WidgetsBindingObserver`, `TabController` — every one is a leak waiting to happen if you skip `dispose()` / `cancel()`. Leaks compound: an app that navigates through 20 screens over a session with an un-disposed `AnimationController` per screen holds 20 tickers running forever.

**The dispose audit — do it at PR time:**

```dart
class _MyScreenState extends State<MyScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _anim;
  late final TextEditingController _text;
  late final FocusNode _focus;
  StreamSubscription<AuthEvent>? _authSub;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(vsync: this, duration: const Duration(seconds: 1));
    _text = TextEditingController();
    _focus = FocusNode();
    _authSub = context.read<AuthBloc>().stream.listen(_onAuth);
    _pollTimer = Timer.periodic(const Duration(seconds: 30), (_) => _poll());
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    unawaited(_authSub?.cancel());
    _focus.dispose();
    _text.dispose();
    _anim.dispose();
    super.dispose();               // super.dispose() LAST — always
  }
}
```

**Rules:**
- Dispose IN REVERSE ORDER of creation (mirror the initState).
- `super.dispose()` is ALWAYS the last line.
- `StreamSubscription.cancel()` returns a `Future` — `unawaited(...)` it in `dispose` (dispose is sync).
- If a subscription/controller is nullable (conditional creation), `?.cancel()` / `?.dispose()` — null-safe.

**Verification: `leak_tracker` in tests.** The `flutter_test` package includes leak tracking; use `LeakTesting.settings = LeakTesting.settings.withTracked...` in your test config. See [flutter-testing](../flutter-testing/SKILL.md).

### Rule 4 — `unawaited(...)` when a `Future`'s failure truly doesn't matter — NEVER as a shortcut

`unawaited(f)` is a marker that says "I know this returns a Future and I am DELIBERATELY not awaiting it because failure is acceptable." It's the right call for:

- **Analytics events** — a dropped event should never block a user action
- **Fire-and-forget writes** where you already updated UI optimistically
- **Notifications, sound effects, haptics** — user experience overhead
- **`Timer.cancel()` inside `dispose()`** — cancel returns a Future; dispose is sync
- **`StreamSubscription.cancel()` inside `dispose()`** — same reason

It's the WRONG call when:

- The user is waiting for the result (form save, fetch, submit)
- Success depends on the Future completing successfully (auth token refresh)
- A subsequent step reads state the Future writes

```dart
// ✅ Correct — analytics failure never breaks the UI
onTap: () {
  unawaited(analytics?.trackEvent('button_tapped'));
  Navigator.of(context).pushNamed('/next');
}

// ❌ Wrong — user tapped Save, we swallow the failure
onTap: () {
  unawaited(_repo.save(form));                 // failure lost
  Navigator.of(context).pop();
}

// ✅ Correct — await + error surface
onTap: () async {
  setState(() => _saving = true);
  try {
    await _repo.save(form);
    if (!mounted) return;
    Navigator.of(context).pop();
  } catch (e) {
    if (!mounted) return;
    setState(() => _saving = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Save failed: $e')));
  }
}
```

**Lint rule:** `unawaited_futures` in `analysis_options.yaml` catches un-awaited Futures that aren't explicitly `unawaited(...)`d. This forces you to make the decision at each call site instead of silently dropping them.

### Rule 5 — `if (isClosed) return;` before `emit` in a Bloc/Cubit that awaits

A Bloc's `close()` completes any pending event handlers, but any `emit` AFTER `close()` throws `Bad state: Cannot emit new states after calling close`. When your event handler awaits, you may return from the await after the Bloc was closed by its `BlocProvider` disposing.

```dart
// ❌ Wrong — crash if the screen popped mid-fetch
class UsersCubit extends Cubit<UsersState> {
  Future<void> load() async {
    emit(UsersLoading());
    final list = await _repo.fetch();
    emit(UsersLoaded(list));           // may throw
  }
}

// ✅ Correct — guard before emit
class UsersCubit extends Cubit<UsersState> {
  Future<void> load() async {
    emit(UsersLoading());
    final list = await _repo.fetch();
    if (isClosed) return;
    emit(UsersLoaded(list));
  }
}
```

**Same for `on<Event>` handlers in a `Bloc`:**

```dart
on<LoadRequested>((event, emit) async {
  emit(UsersLoading());
  final list = await _repo.fetch();
  if (emit.isDone) return;             // handler-scoped guard
  emit(UsersLoaded(list));
});
```

`emit.isDone` is the per-handler equivalent of `isClosed` — use it inside `Bloc.on` callbacks.

### Rule 6 — Every screen that starts async work has a cancellation story

Any screen that fires long-running work in `initState` (network fetch, timer, animation) needs a way to cancel or ignore that work on `dispose`. Three patterns depending on the primitive:

- **`StreamSubscription`** → hold as a field, `cancel()` in dispose
- **`Timer`** → hold as a field, `cancel()` in dispose
- **`Future` with no cancellation token** (e.g., a `Dio` request) → either (a) use `CancelToken` and cancel in dispose, or (b) use the mount check + isClosed pattern to make the return a no-op if the widget/Bloc is gone

Do NOT let a `Future` continue to hold references to your `State` after `dispose` when you can help it. Leaks compound.

## Anti-Patterns

- **`setState` after `await` without a mount check.** Fires on every real-world "user navigated away" case. This is the #1 crash.
- **`Navigator.of(context)` / `ScaffoldMessenger.of(context)` after `await` without capturing before.** Even with a mount check, resolving after can look up the wrong ancestor.
- **`unawaited(_repo.save(...))` where the user is waiting for the save.** Silent data loss on failure.
- **`Future.delayed(Duration(seconds: 30), _refresh)` in `initState` with no cancellation.** The Future fires after dispose; `_refresh` calls `setState` on a dead State; crash.
- **`super.dispose()` at the top of `dispose()`.** The controllers get disposed AFTER the framework torn everything down; race conditions in disposal.
- **`Timer.periodic` without a field / cancel.** Runs forever, holds a reference to the `State` closure, memory leak.
- **`BlocListener` callback that awaits and then uses `context` without `context.mounted`.** Same class of bug as State's mounted, just different check.
- **`emit` in a Bloc after `await` with no `isClosed` guard.** Crashes on route-scoped Blocs during navigation-heavy flows.
- **Swallowing `try/catch` around an `await` that hides real failures** (`catch (_) {}`). If failure matters, surface it; if it doesn't, `unawaited` is the honest signal.
- **`ChangeNotifier.notifyListeners()` after `await` without a mount / isClosed check.** Same class as `setState` and `emit`.

## Common Mistakes

- **"setState() called on a disposed widget"** — missing `if (!mounted) return;` after an `await`.
- **"Looking up a deactivated widget's ancestor"** — `Navigator.of(context)` / `ScaffoldMessenger.of(context)` after an `await` without capturing before AND without the mount check.
- **"Bad state: Cannot emit new states after calling close"** — Bloc/Cubit `emit` after an `await` without `if (isClosed) return;`.
- **"Bad state: Stream has already been listened to"** — you're re-subscribing on every rebuild. Move `.listen(...)` from `build` to `initState` and store the subscription.
- **Screen memory keeps growing** — an un-disposed `AnimationController` / `Timer.periodic` / `StreamSubscription`. Run the app, navigate through 10 screens, check `flutter run --observe` DevTools for the retained-object count.
- **Widget test hangs (no output for 10 min)** — an unmocked platform channel returns a Future that never completes; `pumpAndSettle()` waits for it. See [flutter-testing](../flutter-testing/SKILL.md) — the `test/features/support/support_screen_multi_size_smoke_test.dart` 2026-08-03 investigation is the canonical example.

## Checklist — Every PR That Touches a `State`

- [ ] Every `await` in a `State` method has `if (!mounted) return;` after it, before any `context`/`setState`/`Navigator`/`ScaffoldMessenger` use
- [ ] `Navigator` / `ScaffoldMessenger` / `Theme` handles CAPTURED before the `await`, not resolved after
- [ ] Every `BlocListener` callback that awaits uses `context.mounted` (not `mounted`) as the guard
- [ ] Every controller (`AnimationController`, `TextEditingController`, `FocusNode`, `ScrollController`, `TabController`, `PageController`) created in `initState` is disposed in `dispose` in reverse order
- [ ] Every `StreamSubscription` cancelled with `unawaited(_sub?.cancel())` in `dispose`
- [ ] Every `Timer` cancelled with `_timer?.cancel()` in `dispose`
- [ ] `super.dispose()` is the LAST line of `dispose()`
- [ ] Every Bloc/Cubit method that awaits has `if (isClosed) return;` before the post-await `emit`
- [ ] Every `on<Event>` handler that awaits has `if (emit.isDone) return;` before the post-await `emit`
- [ ] `unawaited(...)` used only where the Future's failure genuinely doesn't matter; user-blocking work is `await`ed with error handling
- [ ] `flutter analyze` clean (relies on `unawaited_futures` lint being enabled in `analysis_options.yaml`)

## Enforcement

- **`unawaited_futures`** lint enabled in `analysis_options.yaml` — makes fire-and-forget explicit at every call site
- **PR review** — the mount check pattern is mechanical; a reviewer scanning for `await` inside `State` methods and looking for a following mount check catches 90% of misses
- **`leak_tracker` in `flutter test`** — catches un-disposed controllers/subscriptions in widget tests (see [flutter-testing](../flutter-testing/SKILL.md))

## Authoritative References

- Flutter docs on `BuildContext` across async gaps: https://api.flutter.dev/flutter/widgets/State/mounted.html
- `unawaited_futures` lint: https://dart.dev/tools/linter-rules/unawaited_futures
- flutter_bloc `isClosed` / `emit.isDone`: https://pub.dev/documentation/bloc/latest/bloc/Bloc/isClosed.html
- Related skills: [flutter-state-bloc](../flutter-state-bloc/SKILL.md), [flutter-ui](../flutter-ui/SKILL.md), [flutter-testing](../flutter-testing/SKILL.md), [flutter-routing](../flutter-routing/SKILL.md), [frontend-patterns](../frontend-patterns/SKILL.md)
