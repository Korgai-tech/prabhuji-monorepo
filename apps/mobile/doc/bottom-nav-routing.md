# Bottom-nav routing (Flutter shell)

This doc explains what the shell scaffold does, why the code has more classes than a stateless bottom-nav would need, and how a tap on a tab lands the right screen with its state intact.

> Files in play (all under `apps/mobile/lib`):
>
> - `core/router.dart` — the `GoRouter` provider, including the `StatefulShellRoute.indexedStack` that hosts the shell branches.
> - `features/shell/presentation/app_shell_scaffold.dart` — the `Scaffold` that renders the bottom bar over the shell's active branch.
> - `features/audio/presentation/shell_mini_player_host.dart` — the persistent mini-player that sits above the bottom bar.

---

## What the shell is

The bottom-nav shell is a **persistent, tabbed home area**. Every route in the shell keeps its own `Navigator` and its own scroll position — switching from Home to Status and back does not rebuild Home or lose where you scrolled. Popping the shell exits the app (with a "press back again" confirmation).

Today's tabs (after the Mandir + Books removal):

| Index | Tab | Route | Where the branch is registered |
|---|---|---|---|
| 0 | Home | `/home` | `router.dart` — Branch 0 |
| 1 | Status | `/status` | `router.dart` — Branch 1 |
| 2 | Horoscope | `/horoscope` | `router.dart` — Branch 2 |

Everything else in the app (`/aarti-bhajans`, `/mantras`, `/ringtones`, `/wallpaper`, `/books`, `/paywall`, module preview / player / reader screens) is pushed **over** the shell as a full-screen route with its own back button and no bottom nav.

---

## The three-part shape (why it looks like a lot)

There are three layers that combine to make the shell work. Each has one job and doesn't leak into the others:

1. **`GoRouter` with a `StatefulShellRoute.indexedStack`** — decides which branch is active + owns each branch's `Navigator` stack. Lives in `core/router.dart`.
2. **`AppShellScaffold`** — the widget that draws the bottom bar and hosts the mini-player. Receives a `StatefulNavigationShell` from `GoRouter` and renders it as the body. Lives in `features/shell/presentation/app_shell_scaffold.dart`.
3. **`ShellDestination` + `_BottomNav` + `_NavTab` + `_NavGlyph`** — presentation helpers that turn one `kShellDestinations` list into a tinted 5- (now 3-) tab row. Same file.

Each item in more detail:

### 1. `StatefulShellRoute.indexedStack`

```dart
StatefulShellRoute.indexedStack(
  builder: (context, state, navigationShell) =>
      AppShellScaffold(navigationShell: navigationShell),
  branches: [
    // Branch 0 — Home
    StatefulShellBranch(routes: [GoRoute(path: HomeRoutes.home, builder: ...)]),
    // Branch 1 — Status
    StatefulShellBranch(routes: [GoRoute(path: StatusRoutes.home, builder: ...)]),
    // Branch 2 — Horoscope
    StatefulShellBranch(routes: [GoRoute(path: HoroscopeRoutes.main, builder: ...)]),
  ],
),
```

Key semantics:

- `indexedStack` means every branch is mounted at all times (like an `IndexedStack`). The inactive branches stay in the widget tree; switching tabs is O(1) and preserves state.
- Each `StatefulShellBranch` gets its own `Navigator`. Pushing a route inside Status (`/status/details`) doesn't affect Home's stack. When you switch away and back, that pushed detail is still on Status's stack.
- `builder` receives a `StatefulNavigationShell` — the thing that knows which branch is active. `AppShellScaffold` renders it as the body and drives it via `.goBranch(index)` on tab taps.

### 2. `AppShellScaffold` (the widget)

Two responsibilities:

1. **Draw the bottom bar and mini-player.**
   ```dart
   Scaffold(
     body: widget.navigationShell,        // the current branch's Navigator
     bottomNavigationBar: Column(
       children: [
         ShellMiniPlayerHost(),           // sticky above the tab bar
         _BottomNav(navigationShell: ...) // the 3-tab row
       ],
     ),
   )
   ```
2. **Own the back-press exit gate.**
   Wrapped in a `PopScope(canPop: false)`. Every system back press hits `_handlePop`. If the active branch isn't Home, it collapses to Home (`shell.goBranch(0)`); if it is Home, it shows a "press back again to exit" snackbar and only exits on a second press within 2 s. This matches the platform default (YouTube / Chrome / Instagram).

### 3. `ShellDestination` + `_BottomNav` + `_NavTab` + `_NavGlyph`

These look redundant at a glance ("why not just inline the row?") but each earns its keep:

| Class | Responsibility | Why it's separate |
|---|---|---|
| `ShellDestination` | Immutable DTO holding one tab's `key`, `label`, two SVG/PNG asset paths (active + inactive), and `tintable`. | Lets `kShellDestinations` be a plain `const` list. Adding / removing a tab is one-line edit in one place; no widget code changes. |
| `_BottomNav` | The `Container` + `SafeArea` chrome + `Row` that lays out the tabs. Reads `kShellDestinations` and emits one `_NavTab` per entry. | Isolates the shared bar chrome (border, background colour, safe-area) from the per-tab drawing. Also the only place that calls `navigationShell.goBranch(...)` so tap semantics (including "re-tap resets the branch to its root") live in ONE spot, not five. |
| `_NavTab` | One column with an icon frame + label. Reads `destination.tintable` to decide whether the glyph is tinted at the call site. | Isolates the tap target (`InkResponse`) and per-state colour. Keeps `_BottomNav` a plain layout. |
| `_NavGlyph` | Renders one glyph — `SvgPicture.asset` for `.svg`, `Image.asset` for `.png` — applying a `ColorFilter.mode(BlendMode.srcIn)` tint when `tint != null`. | Two of the destinations ship self-coloured PNGs (Home badge, Mandir diya originally) that must not be tinted, and three ship monochrome SVGs that must. Isolating "how to draw one asset" here means `_NavTab` doesn't branch on asset type. |

None of these need to be split further; each split has a specific reason:

- **`ShellDestination`** — configuration.
- **`_BottomNav`** — chrome + tap orchestration.
- **`_NavTab`** — one tab.
- **`_NavGlyph`** — one glyph.

If any of these were merged, the merged class would either grow a conditional inside its build (asset-type / colouring / re-tap semantics) or duplicate work across siblings. Four small classes read cleaner than one big one with three inline `if` blocks.

---

## How a tap becomes a screen switch

1. User taps a `_NavTab`. Its `InkResponse.onTap` calls `navigationShell.goBranch(i, initialLocation: i == navigationShell.currentIndex)`.
2. `GoRouter`'s `StatefulShellRoute` sets the active branch index to `i`. If `initialLocation: true` (re-tap on the active tab), the branch's `Navigator` also pops back to its root.
3. `StatefulNavigationShell` rebuilds; the internal `IndexedStack` swaps which child is visible. The previously-active branch stays mounted and off-screen.
4. `AppShellScaffold` rebuilds because the shell's `currentIndex` changed; the `_BottomNav` re-renders with the newly-active tab highlighted.
5. **Scroll position, bloc state, active bloc listeners of the previous branch are all preserved** — the branch's widget tree wasn't disposed, just made invisible.

---

## Where non-shell routes live

Anything that opens a full-screen flow with its own back button is registered **outside** the `StatefulShellRoute` in `router.dart` — the shell isn't rendered, the bottom nav isn't visible. Examples:

- `/paywall` — the paywall interstitial.
- `/aarti-bhajans`, `/aarti-bhajans/show-all`, `/aarti-bhajans/player`, `/aarti-bhajans/audio/:id`
- `/mantras`, `/mantras/show-all`, `/mantras/player`, `/mantras/audio/:id`
- `/ringtones`, `/ringtones/search`, `/ringtones/preview/:id`
- `/wallpaper`, `/wallpaper/list`, `/wallpaper/preview`
- `/books`, `/books/all`, `/books/category/:category`, `/books/contents/:id`, `/books/read/:id`, `/books/scripture/:id`
- `/status/details`
- `/horoscope/:zodiacId`
- `/webview`, `/name-language`, `/otp`, `/phone-input`, `/splash`

These are `context.push()`'d. `pop()` returns the user to whatever shell tab they were on — which is still mounted, still scrolled to the same spot.

**Note on Books** — Books used to be a shell branch. It was removed from the bottom nav but kept as a top-level route so home shortcuts + deep links continue to work. Its home screen now pushes over the shell like every other module.

---

## The mini-player (`ShellMiniPlayerHost`)

Sits directly above the `_BottomNav` inside the same `Column`. Two invariants:

1. **One instance across the whole shell**, so audio started in any tab stays visible as the user navigates between tabs.
2. **Renders `SizedBox.shrink()` when idle**, so it costs no vertical space when nothing's playing.

Tapping the mini-player reopens the full player for the currently-active audio. It reads `currentItem.module` off the shared `AudioController` and dispatches:

- `AudioModule.aarti` → pushes `/aarti-bhajans/player`
- `AudioModule.mantras` → pushes `/mantras/player`
- `AudioModule.ringtone` / `AudioModule.other` → no-op (no full-player screen for those)

The module-specific hosts (`AartiMiniPlayerHost`, `MantrasMiniPlayerHost`) used on the aarti/mantras own screens do the same dispatch — the aarti module can be entered while a mantra is playing and vice versa, and either host has to route to the right full-player.

---

## Common changes and where to make them

| Task | Files to touch |
|---|---|
| **Rename a tab** | `kShellDestinations` (label field) |
| **Change a tab's icon** | Drop new asset under `apps/mobile/assets/nav/`, update the two `*Asset` paths in `kShellDestinations` |
| **Add a tab** | Add to `kShellDestinations` (nav row) + add a matching `StatefulShellBranch` in `router.dart` (route) |
| **Remove a tab** | Drop from `kShellDestinations` + drop the matching branch in `router.dart`; if the removed module still needs to be reachable, promote its route to a top-level `GoRoute` pushed over the shell (see `/books` for the pattern) |
| **Reorder tabs** | Reorder both `kShellDestinations` AND the `branches: [...]` list in `router.dart` — the order in both must match, index 0 must remain Home (the exit-gate assumption in `_handlePop`) |
| **Change tab bar height / padding** | `AppNav` constants in `core/theme.dart` |
| **Change what happens on back press** | `_AppShellScaffoldState._handlePop` |
| **Change the mini-player behaviour** | `ShellMiniPlayerHost` (dispatch) + `MiniPlayer` (rendering) |

---

## Navigating TO a shell branch programmatically

If code needs to move the user to a shell-branch tab (e.g. a Home feed card whose CTA says "View Status" resolves to `/status`), it must **not** use `context.push('/status')`. Push nests a new route on the current stack; on a `StatefulShellRoute` branch path this either creates a shell-over-shell instance or replaces the current stack — either way, the "just switch the tab, keep everything else" UX is gone.

Use `context.go(path)` for shell-branch paths. That routes through the `StatefulShellRoute` correctly, calls `goBranch(...)` under the hood, and preserves every other branch's state off-screen.

For the Home feature specifically, `features/home/destinations.dart` exports a helper that already knows which paths are shell branches:

```dart
if (kShellBranchPaths.contains(path)) {
  context.go(path);  // tab switch — state preserved
} else {
  context.push(path); // over-shell full-screen route
}

// Or, using the helper directly:
openHomeDestinationPath(context, path);
```

Every Home tap surface (feed card header / feed card CTA / banner / shortcut grid) routes through `openHomeDestinationPath`. Missing it on any one caller reintroduces the bug: opening Status from the feed replaces the Home stack instead of switching tabs.

---

## What NOT to do

- **Don't add `Navigator.push` calls that bypass GoRouter.** The shell only preserves state for its known branches. A raw `Navigator.push` from inside a shell branch creates a route the shell doesn't know about; it works, but back semantics + deep-link resume + analytics get inconsistent.
- **Don't merge `_BottomNav` into `AppShellScaffold.build`.** Preserving the split keeps the re-tap semantics (`initialLocation: i == navigationShell.currentIndex` pops the branch to root) in one place. Inlining it makes that easy to accidentally forget.
- **Don't remove `SafeArea(top: false)` around the bottom bar.** On edge-to-edge Android displays (API 35+), the bar would slide under the gesture nav bar.
- **Don't move Home off index 0.** The exit-gate in `_handlePop` assumes Home is `_homeBranchIndex = 0`. If the order changes, update that constant.
- **Don't wrap the shell in a second `Scaffold`.** `AppShellScaffold` already is a Scaffold; nesting one adds a phantom AppBar area and breaks safe-area math.
