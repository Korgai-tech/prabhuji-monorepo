# Pattern: Flutter Multi-Size Smoke Test

> Repo-specific pattern (monorepo-boilerplate). The cheap-but-catches-80% companion to [flutter-layout-intent.md](./flutter-layout-intent.md). Runs on every non-trivial screen and asserts that pumping it at 3 widths × 3 heights produces NO Flutter layout exceptions — no `RenderFlex overflowed`, no `RenderBox was not laid out`, no `BoxConstraints has NaN values`.

## Use Case

Every screen you build. Widget tests default to an 800×600 pump size — meaning `flutter test` and `flutter analyze` will pass while the screen overflows on a 600dp phone, floats badly on a 1200dp foldable, or crashes when the keyboard opens. This test closes that gap for the cost of ~30 lines per screen.

Distinct from [flutter-layout-intent.md](./flutter-layout-intent.md):

| | Multi-size smoke (this) | Layout intent |
| --- | --- | --- |
| **Applies to** | Every non-trivial screen | Only screens whose spec has a **Layout intent** block |
| **Asserts** | No exceptions fire at 3×3 sizes | Pinned/flex zones sit at correct y-coordinates |
| **Requires spec block** | No | Yes |
| **Catches** | Overflow, unbounded constraints, NaN layout | Whole-screen scroll, un-pinned bars, wrong flex distribution |

Run both when both apply — they're complementary, not redundant.

## The Sizes

3 widths × 3 heights = 9 pumps. Covers the real device range for a mobile-only Flutter app (see [flutter-responsive-layout](../../.claude/skills/flutter-responsive-layout/SKILL.md) for the derivation):

| Height ↓ / Width → | 320 dp (iPhone SE) | 390 dp (median) | 428 dp (Pro Max) |
| --- | --- | --- | --- |
| **600 dp** (short Android) | small-short | mid-short | large-short |
| **800 dp** (typical) | small-mid | mid-mid | large-mid |
| **1200 dp** (foldable/tablet) | small-tall | mid-tall | large-tall |

Add a landscape flip (e.g. 800×390) only if the app supports landscape for that screen — Prabhuji is portrait-only by default.

## The test

```dart
// apps/mobile/test/<feature>/<screen>_multi_size_test.dart
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/<feature>_harness.dart';

/// Multi-size smoke test for the <Screen> screen. Pumps it at 3 widths × 3
/// heights and asserts NO Flutter layout exception fires. This is the guardrail
/// that widget tests (single-size, 800×600 default) cannot provide — the class
/// of bug where "it looks fine on my emulator, breaks on a Pixel 8 Pro / small
/// Android / foldable".
///
/// Full primitive guidance: .claude/skills/flutter-responsive-layout/SKILL.md
void main() {
  const widths = [320.0, 390.0, 428.0];  // SE / median / Pro Max
  const heights = [600.0, 800.0, 1200.0]; // short / typical / foldable

  for (final w in widths) {
    for (final h in heights) {
      testWidgets('no layout exception at ${w.toInt()}×${h.toInt()}', (tester) async {
        // Capture Flutter framework errors so we can assert on them. Without
        // this, RenderFlex overflow prints to console but the test still passes.
        final errors = <FlutterErrorDetails>[];
        final originalOnError = FlutterError.onError;
        FlutterError.onError = errors.add;
        addTearDown(() => FlutterError.onError = originalOnError);

        // Pin the viewport. devicePixelRatio = 1.0 keeps the assertions in dp.
        tester.view.physicalSize = Size(w, h);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        await pump<Screen>(tester); // your harness pump helper

        expect(
          errors,
          isEmpty,
          reason: 'layout exceptions at ${w.toInt()}×${h.toInt()}:\n'
              '${errors.map((e) => e.exceptionAsString()).join('\n---\n')}',
        );
      });
    }
  }
}
```

### With a keyboard-open case

For screens with `TextField`s, add one more test that simulates the keyboard being up (`viewInsets.bottom > 0`):

```dart
testWidgets('no layout exception with keyboard open (390×800, insets=320)',
    (tester) async {
  final errors = <FlutterErrorDetails>[];
  final originalOnError = FlutterError.onError;
  FlutterError.onError = errors.add;
  addTearDown(() => FlutterError.onError = originalOnError);

  tester.view.physicalSize = const Size(390, 800);
  tester.view.devicePixelRatio = 1.0;
  tester.view.viewInsets = const FakeViewPadding(bottom: 320); // simulated IME
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetViewInsets);

  await pump<Screen>(tester);

  // Tap into the first TextField so the framework re-lays out for the inset.
  await tester.tap(find.byType(EditableText).first);
  await tester.pump();

  expect(errors, isEmpty, reason: 'layout exceptions with keyboard open');
});
```

### With a text-scale case

For screens with lots of text (mantra text, book reader, long descriptions), add one test at 1.5× / 2.0× scale — anything a11y users could set:

```dart
testWidgets('no layout exception at textScale 2.0 (390×800)', (tester) async {
  final errors = <FlutterErrorDetails>[];
  final originalOnError = FlutterError.onError;
  FlutterError.onError = errors.add;
  addTearDown(() => FlutterError.onError = originalOnError);

  tester.view.physicalSize = const Size(390, 800);
  tester.view.devicePixelRatio = 1.0;
  tester.platformDispatcher.textScaleFactorTestValue = 2.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

  await pump<Screen>(tester);

  expect(errors, isEmpty, reason: 'layout exceptions at textScale 2.0');
});
```

## What it catches

| Bug class | How this test catches it |
| --------- | ------------------------ |
| `Column` child with no `Flexible`/`Expanded` overflows at short heights | Overflow exception at 600dp; test fails, message names the offending widget |
| Fixed-height row around scalable text overflows at 150%+ scale | Overflow exception in the textScale variant |
| Form without `SingleChildScrollView` overflows when keyboard opens | Overflow exception in the keyboard variant |
| `Row` of chips overflows on narrow widths | Overflow exception at 320dp width |
| Widget assumes minimum width (e.g. hard-coded `SizedBox(width: 400)`) | Overflow at 320dp |
| Whole-screen `SingleChildScrollView` masking real layout — content extends past 1200dp | Does NOT catch this — use the [layout-intent test](./flutter-layout-intent.md) |
| Bottom bar floating mid-screen on tall devices | Does NOT catch this — use the [layout-intent test](./flutter-layout-intent.md) |

This test's job is "does it explode." The layout-intent test's job is "is it in the right place."

## What it does NOT catch

- **Visual regressions** — use golden tests ([apps/mobile/test/goldens/](../../apps/mobile/test/goldens/)).
- **Design fidelity** — use figma-flutter Phase 6 + goldens.
- **Correct pinned/flex placement** — use [flutter-layout-intent.md](./flutter-layout-intent.md).
- **Behavior with real data** — the harness typically pumps fixtures; test with realistic longest-string / edge-case data in a separate widget test.

## Prerequisites

Same as [flutter-layout-intent.md](./flutter-layout-intent.md):

1. A pump helper in `test/support/<feature>_harness.dart` that renders the screen with its fixtures.
2. The screen composes reasonable fixtures (fake repository seeded with mantra text, deity image, etc.) so the pump doesn't die on missing data.

## Running

```bash
pnpm verify:mobile                          # runs with the rest of the mobile suite
pnpm nx test mobile -- _multi_size_test     # this pattern only
```

No new Nx target, no new tooling. Plain `flutter_test`.

## When to skip

- **Pure static widgets** with no responsive intent (small internal debug pages, splash screens with a single centered logo). If it's a single centered element with no `Row`/`Column`/`Text`, there's nothing to overflow.
- **A screen fully covered by both the layout-intent test AND a landscape widget test** — the layout-intent test already asserts at three heights; adding this on top adds only the width sweep. Judgement call.

If in doubt, add it. Nine cheap assertions catch a lot of bugs.

## Related

- [flutter-responsive-layout](../../.claude/skills/flutter-responsive-layout/SKILL.md) — the "how to write widgets that pass this test" companion.
- [flutter-layout-intent.md](./flutter-layout-intent.md) — the geometric complement (pinned/flex placement at 3 heights). Run both when the spec has a Layout intent block.
- [flutter-ui skill](../../.claude/skills/flutter-ui/SKILL.md#responsive--adaptive--mandatory) — the five responsive rules and the new-screen checklist.
