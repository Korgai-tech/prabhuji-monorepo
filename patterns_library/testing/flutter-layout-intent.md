# Pattern: Flutter Layout-Intent Test

> Repo-specific pattern (monorepo-boilerplate). Companion to the spec template's **Layout intent (per screen)** block. Enforces the designer's pinned/flex intent as an executable test that fails when someone accidentally wraps the whole screen in a scrollable, un-pins a bottom bar, or removes the `Expanded` from the flex-fill zone.

## Use Case

Any Flutter screen whose spec has a **Layout intent** block (see `specs_templates/spec_template.md`). If the screen has a bottom-pinned bar, a fixed header, or a flex-fill zone that should scroll internally, this test is required — a golden alone cannot catch layout-intent regressions because goldens are one-height and self-baselined.

A screen whose entire tree is a single scrollable feed (e.g. Home) does NOT need this test.

## Why goldens are not enough

- Goldens self-baseline: `--update-goldens` locks whatever you built as "correct", so an initial mistake (whole-screen scroll instead of pinned bottom) is frozen in.
- Goldens render at ONE viewport. A bottom-pinned bar that isn't actually pinned still lands at the bottom of a 640-tall golden — the bug only surfaces on real devices at 800 or 1200 dp.
- Node-tree crosscheck ([apps/mobile/test/support/figma_crosscheck.dart](../../apps/mobile/test/support/figma_crosscheck.dart)) verifies component *presence*, not sizing behavior. `Row` vs `Column`, `Expanded` present vs absent, and `SingleChildScrollView` at root vs inside a zone are all invisible to it.

This pattern closes that gap by asserting geometric intent at three viewport heights.

## Prerequisites

1. Every zone listed in the spec's Layout intent block has a stable widget key: `Key('<screen>-<zone>')` — the same convention the fidelity crosscheck already uses (e.g. `Key('mantras-player-appbar')`, `Key('mantras-text-scroll')`).
2. The flex-fill zone's scrollable has its own key (`<screen>-<zone>-scroll`) so the test can assert it's the ONLY scrollable in the tree.
3. A pump helper in `test/support/<feature>_harness.dart` (matches the existing harness style — see [apps/mobile/test/support/](../../apps/mobile/test/support/)).

## The test

```dart
// apps/mobile/test/<feature>/<screen>_layout_intent_test.dart
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/<feature>_harness.dart';

/// Layout-intent test for the <Screen> screen (spec: TAM-XXX, Figma node
/// {node:id}). Asserts the pinned/flex zones declared in the spec's Layout
/// intent block hold at short, mid, and tall device heights — the bug class
/// that goldens (one-height, self-baselined) cannot catch.
///
/// Fails when someone:
///   - wraps the screen root in a SingleChildScrollView / ListView / Scrollable
///     (breaks the "only the flex-fill zone scrolls" rule)
///   - removes the Expanded from the flex-fill zone (the bottom bar floats up)
///   - un-pins a pinned-bottom zone (e.g. drops it out of the bottom Column)
///   - reorders zones so a pinned-bottom zone no longer sits flush against the
///     bottom edge
void main() {
  const width = 360.0;
  const heights = [600.0, 800.0, 1200.0]; // short phone / mid / tall

  for (final h in heights) {
    testWidgets('layout intent holds at ${h.toInt()}dp', (tester) async {
      // Pin the viewport. addTearDown so a failure here does not poison
      // subsequent tests. devicePixelRatio must be 1.0 or the assertions
      // below have to divide by it — keep it simple.
      tester.view.physicalSize = const Size(width, 0).copyWith(height: h);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await pump<Screen>(tester); // your harness pump — see prerequisites

      // 1. Pinned-top zone sits at y = 0.
      final appBar = tester.getRect(find.byKey(const Key('<screen>-appbar')));
      expect(appBar.top, 0,
          reason: 'pinned-top zone must sit at y=0 (was ${appBar.top})');

      // 2. Every pinned-bottom zone touches the bottom edge. The bottommost
      //    zone's `bottom` MUST equal screen height; zones above it stack
      //    upward without gaps.
      final queue = tester.getRect(find.byKey(const Key('<screen>-queue')));
      expect(queue.bottom, closeTo(h, 0.5),
          reason: 'bottommost pinned zone must be flush with bottom edge '
              '(was ${queue.bottom}, expected $h)');

      final controls = tester.getRect(find.byKey(const Key('<screen>-player-controls')));
      expect(controls.bottom, closeTo(queue.top, 0.5),
          reason: 'player controls must sit directly above the queue bar');

      final engagement = tester.getRect(find.byKey(const Key('<screen>-engagement')));
      expect(engagement.bottom, closeTo(controls.top, 0.5),
          reason: 'engagement bar must sit directly above the player controls');

      // 3. The flex-fill zone expands to consume all remaining vertical space.
      //    Its height = h − (all pinned zone heights above and below it).
      final flex = tester.getRect(find.byKey(const Key('<screen>-mantra-text')));
      final expectedFlexHeight = h
          - appBar.height
          - engagement.height
          - controls.height
          - queue.height
          - _intrinsicZonesAbove(tester); // deity card + title etc.
      expect(flex.height, closeTo(expectedFlexHeight, 1.0),
          reason: 'flex-fill zone must fill remaining vertical space');

      // 4. The ONLY scrollable in the tree is inside the flex-fill zone.
      //    A whole-screen scroll (SingleChildScrollView at root) fails here.
      final scrollables = find.byType(Scrollable);
      expect(scrollables, findsOneWidget,
          reason: 'exactly one Scrollable expected — the flex-fill zone');
      expect(
        find.descendant(
          of: find.byKey(const Key('<screen>-mantra-text')),
          matching: find.byType(Scrollable),
        ),
        findsOneWidget,
        reason: 'the sole Scrollable must live inside the flex-fill zone',
      );
    });
  }
}

double _intrinsicZonesAbove(WidgetTester tester) {
  // Sum the heights of intrinsic zones that sit above the flex-fill zone
  // (deity card, title row, etc.). Kept as a helper so adding a new intrinsic
  // zone is a one-line change to the test.
  final deity = tester.getRect(find.byKey(const Key('<screen>-deity-card')));
  final title = tester.getRect(find.byKey(const Key('<screen>-title')));
  return deity.height + title.height;
}
```

## Widget structure that satisfies the test

The implementation shape is a `Column` with the flex-fill zone wrapped in `Expanded`. This is the ONLY structure that satisfies "one flex zone, everything else pinned":

```dart
Scaffold(
  body: SafeArea(
    child: Column(
      children: [
        // pinned-top
        const AppBarZone(key: Key('<screen>-appbar')),

        // intrinsic zones above the flex
        const DeityCard(key: Key('<screen>-deity-card')),
        const TitleRow(key: Key('<screen>-title')),

        // THE flex-fill zone — the only Expanded on this screen
        Expanded(
          key: const Key('<screen>-mantra-text'),
          child: SingleChildScrollView(
            key: const Key('<screen>-mantra-text-scroll'),
            child: MantraText(text: state.mantra),
          ),
        ),

        // pinned-bottom stack (order matters: last child = closest to bottom)
        const EngagementBar(key: Key('<screen>-engagement')),
        const PlayerControls(key: Key('<screen>-player-controls')),
        const QueueBar(key: Key('<screen>-queue')),
      ],
    ),
  ),
)
```

Anti-patterns that this test catches:

| Anti-pattern | Why it fails |
| --- | --- |
| `SingleChildScrollView` wrapping the whole `Column` | Assertion 4: two Scrollables (root + flex zone) |
| Missing `Expanded` on the flex zone | Assertion 3: flex height too small; assertion 2: bottom bar floats up |
| `ListView` at screen root with all zones as children | Assertion 4: root is Scrollable |
| Pinned-bottom bars inside the flex zone | Assertion 2: bar scrolls with the mantra, doesn't touch bottom edge |
| Extra `Expanded` on an intrinsic zone | Assertion 3: flex zone gets less than its share |
| Fixed heights on the flex zone (e.g. `SizedBox(height: 400)`) | Assertion 3 at 1200dp: flex height doesn't grow |

## Running

The test lives under `apps/mobile/test/<feature>/` and runs with the rest of the mobile suite:

```bash
pnpm verify:mobile                              # flutter analyze + flutter test
pnpm nx test mobile -- <screen>_layout_intent   # single file
```

No new harness, no new Nx target — this is a plain `flutter_test` that plugs into the existing suite.

## Related patterns

- [figma-crosscheck](../../apps/mobile/test/support/figma_crosscheck.dart) — presence check (matched/missing/stray). Layout-intent is the geometric complement.
- Golden tests under [apps/mobile/test/goldens/](../../apps/mobile/test/goldens/) — visual regression at one height. Layout-intent covers what goldens structurally can't.
- [docs/FIDELITY-CROSSCHECK.md](../../docs/FIDELITY-CROSSCHECK.md) — the five-check fidelity gate; this pattern is the automated version of the geometric half of check 3.

## When to skip

- Screen root IS a single scrollable feed (Home, browse lists). Nothing to pin.
- No bottom-pinned bar, no flex-fill zone, no fixed header — the screen is a simple scrolling column. The spec's Layout intent block is omitted, and so is this test.

If in doubt, ask: **"On a 1200dp-tall device, would any element visibly move to a wrong spot?"** If yes, the screen needs a Layout intent block and this test.
