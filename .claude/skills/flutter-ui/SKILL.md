---
name: flutter-ui
description: UI capability for apps/mobile — widget composition, const discipline, RepaintBoundary, ListView.builder tuning, scoped rebuilds with BlocSelector, image cache sizing, accessibility via Semantics, the dispose audit, and leak_tracker in tests. Use when building screens, animations, lists, or reviewing PRs that touch widget trees.
user-invocable: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Flutter UI Skill

## Purpose

Ship UI for `apps/mobile` that hits 60/120 fps, does not leak memory, and is accessible — using Bloc as the state layer (see [flutter-state-bloc](../flutter-state-bloc/SKILL.md)). Written for Impeller-default Flutter (3.27+), so shader warmup is obsolete but rebuild and paint costs still dominate.

## When This Skill Applies

- Building a new screen in `lib/features/<feature>/`
- Adding animations, transitions, lists, grids, forms
- Investigating jank (dropped frames, stutter, scroll lag)
- Reviewing a PR that touches widget trees or introduces new controllers / streams / timers
- Pre-release performance + memory pass

## Widget Composition — Small Is Cheap, Big Is Expensive

- **Extract subtrees into their own `StatelessWidget` classes**, not into `Widget _buildFoo()` methods.
  - `const` constructors on extracted widgets let Flutter skip rebuild — a `_buildFoo` helper cannot be `const`.
  - Test surface: extracted widgets are testable in isolation.
- Prefer **composition over configuration**. Don't add an `isHighlighted` param when a separate `HighlightedTile` widget is clearer.
- Keep `build` short. If it's > ~80 lines, extract subtrees.

```dart
// BAD — subtree can never be const, rebuilt on every parent rebuild
class UsersScreen extends StatelessWidget {
  Widget _buildHeader() => const Padding(padding: EdgeInsets.all(16), child: Text('Users'));

  @override
  Widget build(BuildContext context) => Column(children: [_buildHeader(), ...]);
}

// GOOD — const constant, cached across rebuilds
class _UsersHeader extends StatelessWidget {
  const _UsersHeader();
  @override
  Widget build(BuildContext context) =>
      const Padding(padding: EdgeInsets.all(16), child: Text('Users'));
}

class UsersScreen extends StatelessWidget {
  const UsersScreen({super.key});
  @override
  Widget build(BuildContext context) => const Column(children: [_UsersHeader(), ...]);
}
```

## Navigation & Bottom-Nav Shell

Navigation belongs to [flutter-routing](../flutter-routing/SKILL.md) — persistent bottom nav must use `StatefulShellRoute.indexedStack` with the shell (not individual screens) owning the `Scaffold` + `bottomNavigationBar`. `context.push` vs `context.go` rules and the back-stack symptoms table live there. If a widget you're building has to wrap itself in a `Scaffold` under a shell, leave `bottomNavigationBar` unset — the shell provides it.

## Responsive & Adaptive — MANDATORY

`flutter analyze` and single-size widget tests DO NOT catch responsive bugs (a `RenderFlex overflowed by 240 pixels` at 600 dp still returns a widget tree — the exception goes to the console). Every screen you ship must work across the real device range this app targets: **320–428 dp wide, 600–1200+ dp tall, text-scale 1.0–2.0, portrait + landscape, keyboard open + closed**.

The five rules (full detail: [flutter-responsive-layout](../flutter-responsive-layout/SKILL.md)):

1. **Every screen root wraps its body in `SafeArea`** — no notch collisions, no home-indicator overlap.
2. **Inside every `Column`/`Row`, wrap variable-size children in `Flexible` or `Expanded`.** Unwrapped variable children overflow. At most ONE `Expanded` per screen-level Column (the flex-fill zone from the spec's [Layout intent](../../../specs_templates/spec_template.md#layout-intent-per-screen) block).
3. **Never wrap the whole screen tree in a `SingleChildScrollView` when the screen has pinned bars** — they scroll away. Only the flex-fill zone scrolls.
4. **Forms leave `resizeToAvoidBottomInset: true` (default) and put the form inside a scrollable** — or handle `MediaQuery.viewInsetsOf(context).bottom` manually. Never set to `false` without handling insets yourself.
5. **Use narrow `MediaQuery` accessors** (`sizeOf`, `viewInsetsOf`, `viewPaddingOf`, `textScalerOf`, `orientationOf`), not `MediaQuery.of(context)` — the wide accessor rebuilds the subtree on ANY MediaQuery change (including keyboard opens).

**Verification (both required for non-trivial screens):**

- [Multi-size smoke test](../../../patterns_library/testing/flutter-multi-size-smoke.md) — pumps the screen at 3 widths × 3 heights, asserts no Flutter exception. Every screen.
- [Layout-intent test](../../../patterns_library/testing/flutter-layout-intent.md) — asserts pinned/flex zones stay put at 600/800/1200 dp. Only when the spec has a Layout intent block.

## Visual Verification Against Figma — MANDATORY Before Claiming Done

`flutter analyze` and `flutter test` prove the code compiles and the widget tree renders — **not** that the UI matches the design. Every screen you build against a Figma frame **must** be visually verified before you report the work as done.

### The gate (spec-level)

If a spec references `docs/figma/screens/<name>.png`, the "done" criteria include:

- [ ] Cold-launched the app on an emulator or physical device.
- [ ] Captured a screenshot of the built screen via `flutter screenshot` (or DevTools).
- [ ] Saved next to the Figma reference at `docs/figma/evidence/<name>.png`.
- [ ] Side-by-side compared: header, spacing, colors, iconography, bottom nav presence, typography weight. Report visible deltas even if you don't fix them.
- [ ] The design tokens actually used (colors from `PrabhujiColors.brand400`, not a stray `Color(0xFFFF7300)`) — grep the screen file for hex literals as a smoke test.

### The screenshot workflow

```bash
# Boot the app on a running emulator/device. To point at your laptop's API,
# edit apps/mobile/env/staging.json (see flutter-env-config); no --dart-define.
flutter run

# In another terminal — once you've navigated to the screen:
flutter screenshot -o docs/figma/evidence/<name>.png

# Compare visually in your editor's split view against
# docs/figma/screens/<name>.png. There is no automated pixel diff yet;
# a human-eye pass is the gate.
```

### Widget tests do not count as visual verification

A widget test asserts `find.text('Prabhuji')` — it doesn't know if the wordmark is orange or if it collides with the mail icon. Neither `flutter analyze` (static) nor `flutter test` (semantic) is a substitute for a rendered screenshot next to the design.

### If you cannot boot a device

Say so explicitly in your handoff report ("Visual verification skipped — no emulator available in this session"). Do NOT claim "matches Figma" without evidence.

## `const` Discipline

Every constructor with no runtime-dependent fields should be `const`. Cost: zero. Benefit: identity equality skips diffing of the whole subtree.

Enable enforcement in `apps/mobile/analysis_options.yaml`:

```yaml
linter:
  rules:
    prefer_const_constructors: true
    prefer_const_declarations: true
    prefer_const_literals_to_create_immutables: true
    prefer_const_constructors_in_immutables: true
```

Run `flutter analyze` — this is what CI checks via `pnpm verify:mobile`.

## `RepaintBoundary` — When Yes, When No

Impeller's tile system culls unchanged tiles inside boundaries. Use only where a subtree updates at a different rate than its surroundings.

Yes:
- Around an animating widget whose parent doesn't animate (Lottie, custom painter, video preview).
- Around charts / maps / image-heavy widgets when a nearby ticker rebuilds.
- Around complex custom-painted content inside a scroll view.

No:
- Around small stateless widgets (`Icon`, `Text`, short `Row`) — overhead > savings.
- Reflexively on every list child — `ListView.builder` already boundaries them.
- Around widgets that always rebuild with their parent — no independent update rate = no benefit.

```dart
Column(children: [
  const _ClockToolbar(),                 // rebuilds every second
  RepaintBoundary(child: EquityChart()), // isolated — no repaint on tick
]);
```

## Scroll Views — Always `.builder`, Always Give Extents

```dart
// BAD — builds every child up front
ListView(children: users.map((u) => UserTile(u)).toList());

// GOOD — lazy visible-window build
ListView.builder(
  itemCount: users.length,
  itemBuilder: (context, i) => UserTile(users[i]),
);
```

If every row is a fixed height, tell Flutter — it skips layout math and can jump directly to any offset:

```dart
ListView.builder(
  itemCount: users.length,
  itemExtent: 72,                // fixed height → O(1) scroll positioning
  itemBuilder: (context, i) => UserTile(users[i]),
);

// Variable but representative:
ListView.builder(
  itemCount: users.length,
  prototypeItem: const UserTile.prototype(),
  itemBuilder: (context, i) => UserTile(users[i]),
);
```

`cacheExtent` default is 250 px. Bump to 500 only if fling reveals blank tiles briefly. Larger values allocate offscreen widgets.

Reorderable / animated lists: give each item a stable `Key(item.id)`. Without it, Flutter reconciles by position and animates the wrong rows.

## Scoped Rebuilds via `BlocSelector` / `context.select`

Full detail lives in [flutter-state-bloc](../flutter-state-bloc/SKILL.md). Rebuild scope is a UI concern, so the summary:

```dart
// BAD — rebuilds whenever ANY UsersState field changes (loading transitions, errors...)
BlocBuilder<UsersCubit, UsersState>(
  builder: (context, state) => Text('${state is UsersLoaded ? state.users.length : 0} users'),
);

// GOOD — rebuilds only when the projected int changes
BlocSelector<UsersCubit, UsersState, int>(
  selector: (state) => state is UsersLoaded ? state.users.length : 0,
  builder: (context, count) => Text('$count users'),
);

// GOOD — inline form
final count = context.select((UsersCubit c) =>
    c.state is UsersLoaded ? (c.state as UsersLoaded).users.length : 0);
```

## Move CPU Work Off the UI Thread

Sync JSON parsing of a 500 KB payload will drop frames. Use `compute()`:

```dart
// BAD — blocks main thread
final decoded = jsonDecode(hugePayload);

// GOOD — one-shot isolate
final decoded = await compute(jsonDecode, hugePayload);
```

Spawn overhead is ~50 ms. For sustained work (image processing pipeline, complex parsing loop), use a long-lived isolate via `Isolate.spawn` + `SendPort` — reserve `compute` for one-shot tasks.

## Images

### Resize decoded images to display size

Loading a 4000×3000 photo into a 96×96 avatar burns memory. Always pass `cacheWidth`/`cacheHeight`:

```dart
Image.network(
  url,
  cacheWidth: 96,   // decoded at target size — not source
  cacheHeight: 96,
);
```

### Tune the global image cache

Default is 100 MB / 1000 images. Lower for low-end target devices; raise if scrolling causes repeated network fetches.

```dart
// lib/main.dart, after WidgetsFlutterBinding.ensureInitialized()
final cache = PaintingBinding.instance.imageCache;
cache.maximumSize = 200;         // count
cache.maximumSizeBytes = 30 << 20; // 30 MB
```

### SVGs for icons

Add `flutter_svg` when we need vector icons/illustrations. One asset, all densities. Do NOT rasterize icons to PNG.

## Accessibility Checklist

- [ ] Every interactive element reachable via Talkback / VoiceOver
- [ ] Icon-only buttons wrapped in `Semantics(label: '...')` or `IconButton(tooltip: '...')`
- [ ] Form fields have visible labels or `Semantics(label:)`
- [ ] Error messages announced via `Semantics(liveRegion: true)` or `SemanticsService.announce`
- [ ] Contrast ratio ≥ 4.5:1 for body text — verify with the DevTools Widget Inspector "Accessibility" tab
- [ ] Tap targets ≥ 48 × 48 dp (Material) or 44 × 44 pt (iOS)

```dart
// Icon button with an accessible label
IconButton(
  tooltip: 'Delete user',   // read by screen readers, also shows on long-press
  icon: const Icon(Icons.delete),
  onPressed: onDelete,
);

// Announcing an error
BlocListener<UsersCubit, UsersState>(
  listenWhen: (prev, curr) => curr is UsersError,
  listener: (context, state) {
    if (state is UsersError) {
      SemanticsService.announce(state.message, TextDirection.ltr);
    }
  },
  child: ...,
);
```

## The Dispose Audit — Golden Rule of `StatefulWidget`

Every resource with a `dispose` / `close` / `cancel` / `removeListener` method must be paired in `dispose()`.

- [ ] `TextEditingController` → `dispose()`
- [ ] `ScrollController` / `PageController` → `dispose()`
- [ ] `AnimationController` → `dispose()`
- [ ] `FocusNode` → `dispose()`
- [ ] `StreamSubscription` → `cancel()` (assign to a field first)
- [ ] `Timer` (`Timer.periodic`) → `cancel()`
- [ ] `ValueNotifier` / `ChangeNotifier` → `dispose()`
- [ ] Manually-instantiated `Cubit`/`Bloc` → `close()` (avoid manual instantiation — use `BlocProvider`)

Reference pattern:

```dart
class _MyScreenState extends State<MyScreen> {
  final _searchCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final _focusNode = FocusNode();
  late final StreamSubscription<_> _sub;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _sub = context.read<UsersCubit>().stream.listen(_onState);
    _pollTimer = Timer.periodic(const Duration(seconds: 30), _poll);
  }

  @override
  void dispose() {
    // Release in reverse order of acquisition (defensive habit).
    _pollTimer?.cancel();
    _sub.cancel();
    _focusNode.dispose();
    _scrollCtrl.dispose();
    _searchCtrl.dispose();
    super.dispose(); // ALWAYS last
  }
}
```

## `leak_tracker` — Fail the Test When Someone Forgets `dispose`

Add:

```yaml
dev_dependencies:
  leak_tracker: ^11.0.0
  leak_tracker_flutter_testing: ^3.0.0
```

Auto-apply to every widget test in `apps/mobile/test/flutter_test_config.dart`:

```dart
import 'dart:async';
import 'package:leak_tracker_flutter_testing/leak_tracker_flutter_testing.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  LeakTesting.enable();
  LeakTesting.settings = LeakTesting.settings.withTrackedAll();
  await testMain();
}
```

Any widget test where a `StatefulWidget` forgets to dispose a controller now fails with a report naming the leaked type. `pnpm verify:mobile` picks this up.

## Common Leak Patterns

### Stream subscription without cancel

```dart
// BAD — subscription outlives the widget
Stream.periodic(...).listen(_onTick);

// GOOD
_sub = Stream.periodic(...).listen(_onTick);
// cancel in dispose
```

### `BuildContext` captured in a long-lived closure

```dart
// BAD — captures the entire subtree; survives dispose
Future.delayed(const Duration(minutes: 5), () {
  ScaffoldMessenger.of(context).showSnackBar(...);
});

// GOOD — capture only what you need + mounted guard
final messenger = ScaffoldMessenger.of(context);
Future.delayed(const Duration(minutes: 5), () {
  if (!mounted) return;
  messenger.showSnackBar(...);
});
```

### Static list that only grows

```dart
// BAD — module-level cache never evicted
final _log = <String>[];

// GOOD — bounded
final _log = ListQueue<String>();
if (_log.length > 200) _log.removeFirst();
```

### `GlobalKey` retained across rebuilds

`GlobalKey` holds its `Element`, which holds its subtree. Use only when actually necessary (form validation across screens, hero animations across routes). Not as a "just in case" habit.

### Bloc/Cubit not closed

Never `final c = MyCubit()` in a widget — you own `close()` and will forget. Use `BlocProvider`.

## Performance Profiling — the Loop

1. `flutter run --profile` on real hardware (never a simulator/emulator for scroll or animation work).
2. Open DevTools → Performance.
3. Reproduce the jank.
4. Frame chart bars > 16 ms (60 fps target) or > 8 ms (120 fps) are drops.
5. Look at CPU vs Raster split:
   - Long CPU = widget rebuild / state work → apply `const`, scope rebuilds, split Blocs.
   - Long Raster = paint / compositing work → too many `RepaintBoundary`s or heavy `BackdropFilter`.
6. Attach timeline events for hot code paths:
   ```dart
   import 'dart:developer';
   Timeline.startSync('decode-users');
   final users = _decodeUsers(json);
   Timeline.finishSync();
   ```
7. Fix the worst frame first. One 60 ms frame is more visible than a hundred 17 ms frames.

Enable the on-device overlay for a quick check:

```dart
MaterialApp(showPerformanceOverlay: kDebugMode, ...);
```

Top graph = raster thread, bottom = UI thread. Red bars = dropped frames.

## Common Perf Bugs → Fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| Whole screen rebuilds on any state change | Watching whole state from the top | `BlocSelector` / `context.select` for narrow slices |
| Scroll jank on long lists | Non-builder `ListView` or missing `itemExtent` | Convert to `.builder` + `itemExtent` |
| Occasional 100+ ms frame | Sync JSON decode / crypto / regex | Move to `compute()` |
| Steady memory growth while scrolling images | Full-res decode into small display | `cacheWidth`/`cacheHeight` on `Image.network` |
| Raster thread pegged | Too many `RepaintBoundary`s / complex `BackdropFilter` | Remove boundaries, cache blurred backgrounds as images |
| App startup > 3 s | Sync work in `main()` before `runApp` | Defer with `addPostFrameCallback`, or move to background |
| `_TextFieldState` count grows in Memory tab | `TextEditingController` not disposed | Wire in `dispose()` — leak_tracker would have caught it in tests |
| `RenderFlex overflowed by N pixels` on some devices only | Variable-size child in a `Column`/`Row` with no `Flexible`/`Expanded`, OR fixed `SizedBox`/`Container` height around scalable text | Wrap the variable child in `Flexible` (loose, may shrink) or `Expanded` (tight, fills), or drop the fixed height. Fix menu + primitive selection: [flutter-responsive-layout](../flutter-responsive-layout/SKILL.md). |
| **Video plays distorted / blocky / low-res in the app but is crisp in the browser** — happens with `VideoPlayer` inside `FittedBox(fit: BoxFit.cover)` where the intermediate `SizedBox` is sized with `width: controller.value.aspectRatio, height: 1` (a "just use the ratio, FittedBox scales it up" pattern) | The `VideoPlayer` widget's underlying `Texture` layer takes the layout size as its paint bounds. When those bounds are ~1×1 logical pixels, Skia can synthesize a `saveLayer` at that tiny size (triggered by clip/transform combos), which downsamples the full-res decoded frame into a 1-pixel raster before `FittedBox` scales it back up — amplifying an already-destroyed sample | Size the `FittedBox` child to the video's **native pixel resolution**, not `aspectRatio × 1`: `SizedBox(width: controller.value.size.width, height: controller.value.size.height, child: VideoPlayer(controller))`. The absolute pixel numbers matter — they must give the video texture enough sampling area before any transform/scale. Reference implementation: `apps/mobile/lib/features/paywall/presentation/paywall_screen.dart`. Same pattern applies to any port-wrapped `VideoPlayer` — expose `Size get intrinsicSize => controller.value.size` on the port interface, never `double get aspectRatio` used with `height: 1`. |
| Layout works on your emulator, breaks on Pixel 8 Pro / small Android / landscape / keyboard-open | Screen designed against ONE height/width; no multi-size test | Commit a [multi-size smoke test](../../../patterns_library/testing/flutter-multi-size-smoke.md). |
| Keyboard covers text field | `resizeToAvoidBottomInset: false` or form not inside a scrollable | Leave the default `true` and wrap the form in `SingleChildScrollView`, or handle `MediaQuery.viewInsetsOf(context).bottom` manually — see [flutter-responsive-layout](../flutter-responsive-layout/SKILL.md#4-mediaqueryviewinsetsofcontextbottom--the-keyboard). |
| App bar hides under the notch, bottom nav under home indicator | Missing `SafeArea` on screen root | Wrap `Scaffold.body` in `SafeArea`. |

## Pre-Release Budget

- Cold-start time: < 2 s on mid-tier Android
- Scroll: > 90% of frames under 16 ms
- Memory: no steady-state growth > 15% over a 5-minute session
- APK size: track delta per PR (`flutter build apk --analyze-size`)

## Checklist for a New Screen

- [ ] **Screen is inside the correct nav layer** — a tab screen has NO own bottom nav (shell owns it); a deep screen is pushed via `context.push`, not `context.go`.
- [ ] **Visual verification** — screenshot saved to `docs/figma/evidence/<name>.png` and eyeballed against `docs/figma/screens/<name>.png`. Deltas listed even if deferred.
- [ ] **Design tokens actually used** — `Theme.of(context).extension<PrabhujiColors>()` (or equivalent), no stray hex literals in the screen file.
- [ ] **Responsive baseline** (see [flutter-responsive-layout](../flutter-responsive-layout/SKILL.md)):
  - [ ] Screen root wraps its body in `SafeArea`
  - [ ] Every `Column`/`Row` audited — variable-size children in `Flexible`/`Expanded`; at most one `Expanded` per screen-level Column
  - [ ] No `SingleChildScrollView` wrapping the whole tree if the screen has pinned bars
  - [ ] Forms use default `resizeToAvoidBottomInset: true` + scrollable body (or manual `viewInsets.bottom` handling)
  - [ ] Narrow `MediaQuery` accessors (`sizeOf`/`viewInsetsOf`/`textScalerOf`), never bare `MediaQuery.of(context)`
  - [ ] [Multi-size smoke test](../../../patterns_library/testing/flutter-multi-size-smoke.md) committed + passing (3 widths × 3 heights, no `RenderFlex` overflow)
  - [ ] (If spec has a Layout intent block) [layout-intent test](../../../patterns_library/testing/flutter-layout-intent.md) committed + passing at 600/800/1200 dp
- [ ] Extracted subtrees into small `StatelessWidget`s (not `_buildFoo` methods)
- [ ] All `const` opportunities taken (analyzer clean)
- [ ] Lists use `.builder` with `itemExtent`/`prototypeItem` when possible
- [ ] Rebuilds scoped via `BlocSelector` / `context.select`
- [ ] Images pass `cacheWidth`/`cacheHeight`
- [ ] **Any `VideoPlayer` inside a `FittedBox`** sizes its intermediate `SizedBox` to the video's **native pixel resolution** (`controller.value.size.width/height`), NEVER `aspectRatio × 1`. See "Video plays distorted…" row in the perf-bugs table for the Skia downsampling trap that produces app-only distortion.
- [ ] Every `StatefulWidget` has a matching `dispose()` for every controller / subscription / timer
- [ ] Semantics wired: labels on icon buttons, tap targets ≥ 48 dp
- [ ] Widget tests pass with `leak_tracker` enabled
- [ ] Manual profile-mode smoke on real device before merging any animation- or list-heavy change

## Report format for the fe-developer sub-agent

When a fe-developer sub-agent finishes UI work, its handoff **must include**:

1. Files created / modified
2. `flutter analyze` exit code
3. `flutter test` exit code + pass count
4. **A "Visual verification" section** with one of these three states per screen:
   - `✅ verified against docs/figma/screens/<name>.png — evidence at docs/figma/evidence/<name>.png; notes: <deltas>`
   - `⚠️ skipped — no emulator/device available in this session; caller must verify before ship`
   - `❌ mismatch — evidence at docs/figma/evidence/<name>.png; called out for follow-up`
5. Anything deliberately deferred + why

A report that omits (4) is treated as an incomplete handoff and the reviewer (qas) should bounce it back.

## Authoritative References

- **Impeller**: https://docs.flutter.dev/perf/impeller
- **Performance profiling**: https://docs.flutter.dev/perf/ui-performance
- **DevTools Performance view**: https://docs.flutter.dev/tools/devtools/performance
- **DevTools Memory view**: https://docs.flutter.dev/tools/devtools/memory
- **`leak_tracker`**: https://pub.dev/packages/leak_tracker
- **Semantics widgets**: https://api.flutter.dev/flutter/widgets/Semantics-class.html
- Related skills: [flutter-responsive-layout](../flutter-responsive-layout/SKILL.md) (SafeArea, Flexible/Expanded, MediaQuery accessors, RenderFlex-overflow fix menu — mandatory before shipping any screen), [flutter-modular-architecture](../flutter-modular-architecture/SKILL.md) (feature-first layout + `get_it`), [flutter-state-bloc](../flutter-state-bloc/SKILL.md) (rebuild scoping via Bloc), [flutter-networking](../flutter-networking/SKILL.md) (image URLs, cancellation), [frontend-patterns](../frontend-patterns/SKILL.md) (Admin + Mobile index)
- Mobile conventions: `apps/mobile/CLAUDE.md`
