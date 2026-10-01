---
name: flutter-responsive-layout
description: Responsive & adaptive layout for apps/mobile — SafeArea, Flexible/Expanded, LayoutBuilder vs MediaQuery, viewInsets (keyboard), textScaler, AspectRatio/FractionallySizedBox/FittedBox, orientation, and the RenderFlex-overflow fix menu. Use when building any screen, diagnosing "RenderFlex overflowed by N pixels", or when a UI works on the Figma frame's height but breaks on a Pixel SE / Pixel 8 Pro / foldable / landscape / keyboard-open.
user-invocable: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Flutter Responsive Layout Skill

## Purpose

Ship widgets in `apps/mobile` that render correctly across the full range of real Android/iOS device sizes, orientations, text-scale settings, and keyboard states — not just the size of the Figma frame they were designed against. Prabhuji is mobile-only; the axis that varies most in production is **height** (600 → 1200 dp), not width. That is where the c6527cf-class defects live.

## When This Skill Applies

- Building a new screen or subtree in `lib/features/<feature>/`
- Translating a Figma frame to Flutter (loaded via [figma-flutter](../figma-flutter/SKILL.md) Phase 5)
- A UI works on your test device but "looks broken" or overflows on another size
- Diagnosing `RenderFlex overflowed by N pixels`, `RenderBox was not laid out`, keyboard-covers-input, notch collisions
- Adding forms (keyboard) or dialogs / bottom sheets (constrained max height)

## The Rule Underneath Everything

**Flutter's layout protocol is "constraints go down, sizes come up, parent positions"** — a widget's size is determined by its parent's constraints, not by the widget itself. Every "responsive" decision is about deciding which widget consumes the constraint and which one hugs its content. Get that wrong and the layout breaks the moment the constraint changes (different device, keyboard opens, text scales).

## The Real Device Range (mobile-only)

| Axis | Small | Median | Large | Extreme |
| ---- | ----- | ------ | ----- | ------- |
| Width (dp) | 320 (iPhone SE) | 360 (median Android) | 428 (Pro Max) | 280 (foldable folded) / 700+ (foldable open, tablet) |
| Height (dp) | 600 (short Android) | 800 (typical) | 892 (Pixel 8 Pro) | 1200+ (foldable, tablet) |
| Text scale | 1.0 | 1.15 | 1.5 | 2.0 (accessibility) |
| Orientation | Portrait | — | Landscape | — |
| Keyboard visible | `viewInsets.bottom = 0` | — | `viewInsets.bottom ≈ 260–360` | — |

Test at least three heights (600 / 800 / 1200) and one landscape flip for anything non-trivial. See [multi-size smoke test pattern](../../../patterns_library/testing/flutter-multi-size-smoke.md).

## The Six Primitives You Actually Reach For

### 1. `SafeArea` — always on the screen root

Without it, the app bar hides behind the notch and the bottom bar collides with the home indicator. Every screen's root goes:

```dart
Scaffold(
  body: SafeArea(
    child: Column(children: [...]),
  ),
)
```

Turn off individual edges only when the widget INTENTIONALLY paints under a system chrome (a hero image that goes edge-to-edge under the status bar):

```dart
SafeArea(top: false, child: HeroImage())
```

The bottom nav shell owns its own `SafeArea` — screens inside a `StatefulShellRoute.indexedStack` should NOT wrap their content in a bottom-SafeArea again (double padding). See [flutter-routing](../flutter-routing/SKILL.md).

### 2. `Flexible` / `Expanded` — the "who fills the remaining space" decision

Inside a `Column` or `Row`, a variable-size child MUST be wrapped in `Flexible` or `Expanded`, or Flutter will lay it out with unbounded constraints on the main axis → `RenderFlex overflowed`.

| Widget | Flex | Fit | Meaning |
| ------ | ---- | --- | ------- |
| `Expanded(child: X)` | 1 | tight | Take ALL remaining space. Child is FORCED to the given size. |
| `Flexible(child: X)` | 1 | loose | Take UP TO the remaining space. Child can be smaller. |
| `Flexible(flex: 2, child: X)` | 2 | loose | Take 2/N of the remaining space (N = sum of flexes). |
| (unwrapped child) | — | — | Take its intrinsic size. Overflows if that exceeds the parent. |

Rule of thumb:

- Only ONE `Expanded` per screen-level Column (the "flex-fill" zone from the [spec's Layout intent](../../../specs_templates/spec_template.md#layout-intent-per-screen) block).
- Text that could grow → `Flexible` (loose) with `TextOverflow.ellipsis`.
- Fixed-size chrome (headers, bars) → unwrapped.

```dart
// BAD — the mantra text expands past the screen, engagement bar disappears
Column(children: [
  const AppBarZone(),
  MantraText(text: state.mantra),        // ← no Flexible, unbounded, overflows
  const EngagementBar(),
])

// GOOD — mantra takes remaining space, engagement bar stays pinned
Column(children: [
  const AppBarZone(),
  Expanded(child: SingleChildScrollView(child: MantraText(text: state.mantra))),
  const EngagementBar(),
])
```

### 3. `LayoutBuilder` vs `MediaQuery` — parent constraints vs screen size

They answer different questions. Choose deliberately:

- **`LayoutBuilder`** — "how much space did MY PARENT give me?" Use inside a card, a grid cell, a bottom sheet. Adapts even when the parent's constraint changes (split-screen, resizable window).
- **`MediaQuery.sizeOf(context)`** — "how big is the SCREEN?" Use for whole-screen layout decisions (portrait vs landscape branch, tablet vs phone).

```dart
// GOOD — LayoutBuilder: this CARD adapts to whatever slot it's placed in
LayoutBuilder(builder: (context, constraints) {
  if (constraints.maxWidth < 240) return const _CardCompact();
  return const _CardWide();
});

// GOOD — MediaQuery: whole-screen orientation branch
final size = MediaQuery.sizeOf(context);
final isLandscape = size.width > size.height;
return isLandscape ? const _LandscapeLayout() : const _PortraitLayout();
```

`MediaQuery.of(context)` (without `.sizeOf`) rebuilds on ANY MediaQuery change — including keyboard opens. Prefer the narrow `.sizeOf`, `.viewInsetsOf`, `.viewPaddingOf`, `.textScalerOf`, `.orientationOf` accessors to scope rebuilds.

### 4. `MediaQuery.viewInsetsOf(context).bottom` — the keyboard

Every screen with a `TextField` needs to handle this or the keyboard covers the input. Two patterns:

**Pattern A — let Scaffold do it (default).** `Scaffold(resizeToAvoidBottomInset: true)` (the default) reflows the body to sit above the keyboard. Works when your form is inside a scrollable.

```dart
Scaffold(
  // resizeToAvoidBottomInset: true is the default; do NOT set to false
  // unless your body handles insets manually
  body: SafeArea(
    child: SingleChildScrollView(              // scrolls so the focused field stays visible
      padding: const EdgeInsets.all(16),
      child: Column(children: [const _NameField(), const _EmailField(), ...]),
    ),
  ),
)
```

**Pattern B — manual inset (bottom sheets, custom overlays).** When `resizeToAvoidBottomInset` doesn't apply, pad by `viewInsets.bottom` yourself:

```dart
Padding(
  padding: EdgeInsets.only(
    bottom: MediaQuery.viewInsetsOf(context).bottom,
  ),
  child: TextField(...),
)
```

Never set `resizeToAvoidBottomInset: false` unless you're doing Pattern B.

### 5. `AspectRatio` / `FractionallySizedBox` / `FittedBox` — proportional sizing

- **`AspectRatio`** — "keep this ratio regardless of width" (hero images, video previews, deity cards). The height derives from the parent's width, not the screen height:

  ```dart
  AspectRatio(
    aspectRatio: 360 / 574,      // from the Figma bounding box
    child: Image.network(url, fit: BoxFit.cover),
  )
  ```

- **`FractionallySizedBox`** — "70% of the parent". Use inside constrained parents; do NOT stack fractional inside fractional — the math gets confusing.

  ```dart
  FractionallySizedBox(widthFactor: 0.7, child: PrimaryButton(...))
  ```

- **`FittedBox`** — "shrink me to fit". The last-resort escape hatch when content might exceed a container (e.g. a large price number in a fixed card). Prefer real layout fixes first.

  ```dart
  SizedBox(width: 60, child: FittedBox(fit: BoxFit.scaleDown, child: Text('₹49,999')))
  ```

`BoxFit` on `Image` matters:

| `fit` | Behavior | Use for |
| ----- | -------- | ------- |
| `BoxFit.cover` | fills the box, crops overflow | hero images, avatars |
| `BoxFit.contain` | fits inside, letterboxes | logos, must-see-all art |
| `BoxFit.fill` | stretches (distorts) | almost never |
| `BoxFit.fitWidth` / `fitHeight` | fits one axis, may overflow the other | photo carousels with fixed width |

### 6. `MediaQuery.textScalerOf` — text scaling

A user with accessibility text at 200% doubles every font size. A `Row` with a fixed-height `Container` and a `Text` child that scales will overflow.

Rules:

- **Body text** (paragraphs, mantra text, descriptions) → let it scale freely. Wrap the surrounding column in a scrollable if needed.
- **Chrome text** (app bar titles, button labels) → let it scale, but ensure the container is `Flexible`/scrollable so it doesn't overflow.
- **Tight rows with mixed content** (a counter chip, a badge) → clamp with `MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(1.0..1.3)), child: ...)` on the narrow subtree ONLY. Never clamp at the app root — that breaks accessibility everywhere.

```dart
// Prabhuji-specific: mantra text MUST scale for accessibility
Text(mantra, style: theme.textTheme.bodyLarge)  // no clamping; scrollable parent

// Chip with number + icon — clamp so it doesn't wrap onto two lines
MediaQuery(
  data: MediaQuery.of(context).copyWith(
    textScaler: TextScaler.linear(
      MediaQuery.textScalerOf(context).scale(1.0).clamp(1.0, 1.3),
    ),
  ),
  child: const _CounterChip(count: 24987),
)
```

## The RenderFlex Overflow Fix Menu

`A RenderFlex overflowed by N pixels on the [bottom|right]` — the most common Flutter layout error. Diagnose by asking: **which direction, and is the overflowing child a text or a box?**

| Symptom | Fix |
| ------- | --- |
| `Column` overflowed on the BOTTOM by ~N px | Wrap the variable-height child in `Expanded` (want it to fill) or `Flexible` (want it to shrink), OR wrap the whole column in `SingleChildScrollView`. |
| `Row` overflowed on the RIGHT, child is `Text` | Wrap the `Text` in `Expanded` or `Flexible` + `overflow: TextOverflow.ellipsis`. |
| `Row` overflowed on the RIGHT, child is a `Container`/`Icon` group | Wrap in `Expanded` if it should stretch, or replace `Row` with `Wrap` if children should flow to a new line. |
| Overflow appears only when keyboard opens | Screen body isn't scrollable — wrap in `SingleChildScrollView` (Pattern A above). |
| Overflow appears only at text scale 200% | Fixed-height `Container` around a `Text`. Remove the height, or use `Flexible` + let `Text` reflow. |
| Overflow appears only in landscape | Vertical `Column` too tall for the short landscape height — wrap in `SingleChildScrollView` or split into two columns. |

**Never "fix" overflow with `SizedBox(height: <arbitrary>)` on the child.** That works on your device and re-breaks on the next size. Fix the constraint chain instead.

## Screen-Root Shape (the default)

Almost every screen in this app should start from this shape and remove pieces only when there's a reason:

```dart
class MantrasPlayerScreen extends StatelessWidget {
  const MantrasPlayerScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // resizeToAvoidBottomInset defaults to true — leave it.
      body: SafeArea(
        child: Column(
          children: [
            const _AppBar(key: Key('mantras-player-appbar')),           // pinned-top
            const _DeityCard(key: Key('mantras-player-deity')),         // intrinsic
            Expanded(                                                    // flex-fill
              key: const Key('mantras-player-mantra'),
              child: SingleChildScrollView(
                key: const Key('mantras-player-mantra-scroll'),
                child: MantraText(text: state.mantra),
              ),
            ),
            const _EngagementBar(key: Key('mantras-player-engagement')), // pinned-bottom
            const _PlayerControls(key: Key('mantras-player-controls')),
            const _QueueBar(key: Key('mantras-player-queue')),
          ],
        ),
      ),
    );
  }
}
```

This shape:
- Uses `SafeArea` so no notch/home-indicator collision
- Has exactly ONE `Expanded` (the flex-fill zone from the spec's [Layout intent](../../../specs_templates/spec_template.md#layout-intent-per-screen) block)
- Never wraps the whole tree in a `SingleChildScrollView` — only the flex zone scrolls
- Every zone has a stable `Key` so the [layout-intent test](../../../patterns_library/testing/flutter-layout-intent.md) and the [figma crosscheck](../../../apps/mobile/test/support/figma_crosscheck.dart) can find it

## Anti-Pattern Table

| Anti-pattern | Why it breaks | Fix |
| ------------ | ------------- | --- |
| `Container(height: 800, child: ...)` at screen root | Overflows on 600dp devices; wastes space on 1200dp | Remove the fixed height; use `Expanded` inside a `Column` |
| `SingleChildScrollView` wrapping the whole `Column` on a screen with pinned bars | Bars scroll away | Only the flex-fill zone scrolls; pin bars stay outside `Expanded` |
| No `SafeArea` on screen root | App bar hidden by notch, bottom nav under home indicator | Wrap `Scaffold.body` in `SafeArea` |
| `MediaQuery.of(context)` accessed at the top of `build` | Whole subtree rebuilds when keyboard opens | Use narrow accessors: `sizeOf`, `viewInsetsOf`, `textScalerOf` |
| Fixed `fontSize: 14` on user-facing text | Ignores the user's system text-scale setting | Use `Theme.of(context).textTheme.*`; if you must set size, use `TextStyle` from the theme extension |
| `Platform.isAndroid` / `Platform.isIOS` for layout branching | Wrong axis — foldables and tablets are Android too | Branch on `MediaQuery.sizeOf(context)` or `LayoutBuilder` instead |
| `resizeToAvoidBottomInset: false` with no manual `viewInsets` handling | Keyboard covers text field | Leave the default `true`, or handle `viewInsets.bottom` manually |
| Two `Expanded`s in a `Column` with different content | Splits 50/50 regardless of intent | Use `flex:` to weight, or make one `Flexible` (loose) and one `Expanded` |
| Fixed height on a row containing scalable text | Overflows at 150%+ text scale | Remove the height; use `Padding` around the text instead |

## Verification

Every non-trivial screen commits a **multi-size smoke test** that pumps it at 3 widths × 3 heights and asserts no `FlutterError` fires (see [flutter-multi-size-smoke.md](../../../patterns_library/testing/flutter-multi-size-smoke.md)). Screens with pinned bars or a flex-fill zone ALSO commit a [layout-intent test](../../../patterns_library/testing/flutter-layout-intent.md).

`flutter analyze` and single-size widget tests will NOT catch responsive bugs — a `RenderFlex` overflow at 600dp still returns a widget tree; the exception is thrown to the console. The multi-size smoke test is the guardrail.

## Interaction with the Figma flow

- **Figma Phase 2** ([figma-flutter](../figma-flutter/SKILL.md)) already harvests `layoutMode`, `layoutGrow`, `primaryAxisSizingMode` per node. That is the mechanical hint about which zones are pinned vs flex. Reconcile against the spec's Layout intent block (this skill is the "how to implement" companion).
- **Figma Phase 5** (widget translation) should reach for the primitives above — never a fixed-height `Container` where an `Expanded` or `AspectRatio` fits.
- **Figma Phase 6** (rendered comparison) is at the frame's height only. Multi-size testing is orthogonal — a Phase 6 PASS says nothing about behavior at 600dp or landscape.

## Related skills & patterns

- [flutter-ui](../flutter-ui/SKILL.md) — const discipline, rebuild scoping, dispose, images (`cacheWidth`/`cacheHeight` matters for responsive images too)
- [figma-flutter](../figma-flutter/SKILL.md) — where the design intent enters (Phase 2 Auto-Layout, Phase 5 widget translation)
- [flutter-routing](../flutter-routing/SKILL.md) — the shell owns `SafeArea` bottom for tabbed screens
- [patterns_library/testing/flutter-layout-intent.md](../../../patterns_library/testing/flutter-layout-intent.md) — pinned/flex zone assertions at 3 heights (opt-in per spec)
- [patterns_library/testing/flutter-multi-size-smoke.md](../../../patterns_library/testing/flutter-multi-size-smoke.md) — 3×3 no-overflow smoke test (every screen)

## Checklist Before Claiming Done

- [ ] Screen root wrapped in `SafeArea`
- [ ] Every `Column`/`Row` audited: variable-size children in `Flexible`/`Expanded`; fixed chrome unwrapped
- [ ] At most one `Expanded` per screen-level `Column` (matches the Layout intent block)
- [ ] No `SingleChildScrollView` wrapping the whole tree on a screen with pinned bars
- [ ] Forms handle the keyboard (default `resizeToAvoidBottomInset` + scrollable body, OR manual `viewInsets` padding)
- [ ] No `Platform.isAndroid`/`isIOS` used for LAYOUT branching (behavior differences are fine)
- [ ] Multi-size smoke test committed and passing at 3 widths × 3 heights
- [ ] (If the spec has a Layout intent block) layout-intent test committed and passing
