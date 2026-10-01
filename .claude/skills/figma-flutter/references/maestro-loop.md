# Maestro + hot-reload pixel-perfect loop (Phase 6, screen level)

Read SKILL.md first. This is the FAST screen-level comparison loop — code change →
hot reload → screenshot → vision-compare — with no rebuild/reinstall between
iterations. Based on the VGV workflow:
<https://verygood.ventures/blog/pixel-perfect-flutter-designs-with-figma-and-maestro/>

Use it instead of the raw `adb exec-out screencap` loop whenever Maestro is
available; fall back to adb when it isn't. Golden tests (see translation.md)
remain the component-level regression lock either way.

## Roles

| Tool | Role in the loop |
| --- | --- |
| Figma MCP (`plugin:figma:figma`) | Read: component tree, spacing, colors, typography, `get_screenshot` reference |
| Dart MCP (via DTD) | Reload: hot-reload the running app after each code edit |
| Maestro MCP | Capture + drive: scroll/tap/enter text on the device, take screenshots |
| Claude (vision) | Compare: screenshot vs Figma reference → concrete diff list |

## One-time setup

```bash
# Maestro CLI
curl -Ls "https://get.maestro.mobile.dev" | bash

# MCP servers (Dart >= 3.9 required for dart mcp-server)
claude mcp add maestro -- maestro mcp
claude mcp add dart -- dart mcp-server
```

## Per-session

```bash
cd apps/mobile && flutter run --print-dtd   # note the printed DTD URI
```

Connect the Dart MCP to that DTD URI so it can trigger hot reloads.

## The five-step loop

1. **Read** — Figma MCP pulls the frame's tree, spacing, color values, typography
   (Phases 1–2 of SKILL.md already did the bulk extraction; re-read the specific
   node under repair).
2. **Write** — edit the Flutter widget/theme code.
3. **Reload** — Dart MCP hot reload (sub-second; no reinstall).
4. **Capture** — Maestro MCP screenshots the running app (scroll/tap first to
   reach the state under test — e.g. scroll the feed until the target card is
   fully in viewport).
5. **Compare** — never a full-screen glance: at fit-to-screen zoom, 2px padding
   drifts, near-miss grays, and Medium-vs-SemiBold weights all vanish, and the
   loop dies on iteration 1 with a false "perfect". The comparison verdict is a
   completed **sweep table** — one row per screen zone (header, each section,
   nav bar, …):

   | Zone | Figma value (the NUMBER from Phases 1–2: hex, px, radius, weight) | Rendered (from a matched CROP of both images) | Verdict |

   Verdict per row: `diff` / `matches` / `logged follow-up` (art/content pending
   elsewhere) / `intentional` (divergence authorized by the spec — cite the
   section, e.g. an element present in the frame but excluded from this phase;
   never "fix" an intentional row by implementing the excluded element).
   `matches` requires both the crop comparison and the number check — vision
   alone cannot certify a hex or a 2px gap. Any `diff` rows → go to 2. Stop only
   when a **completed** sweep table has no `diff` rows (remaining rows all
   `matches`, `logged follow-up`, or `intentional`). An empty diff list is the
   OUTPUT of a completed sweep table, never a first impression: "undetermined"
   and "empty" are different diff lists.

Expect two or three iterations for a straightforward screen. A clean sweep on
the very first capture is a red flag, not a success — it almost always means
the comparison ran at full-screen zoom; redo it with crops before trusting it.

## CLI fallback (no MCPs / CI)

```yaml
# .maestro/home_screenshot.yaml
appId: com.example.app # match applicationId in android/app/build.gradle
---
- launchApp
- takeScreenshot: home_screen # writes home_screen.png
```

```bash
maestro test .maestro/home_screenshot.yaml
```

## Gotchas

- **No Flutter web** — the Maestro MCP misbehaves in a browser window. Targets:
  iOS/Android emulator, physical device, or desktop.
- **Resolution ≠ Figma export** — device screenshots and Figma exports differ in
  scale/DPI. Compare proportions, spacing ratios, colors, and paint order
  visually; never diff raw pixel buffers across the two sources.
- **State first, then capture** — drive the app (scroll position, pro-flag
  toggles, fake-repo mode) to the exact state the Figma frame shows before
  screenshotting, or every "diff" is really a state mismatch.
- **Runtime-only issues** — this loop catches what goldens can't: real fonts,
  network image loading, gradients on device, scroll physics. Keep both.
- **Evidence** — commit the Phase 6 artifacts under
  `specs/evidence/<TICKET>/fidelity/` (sweep-table.md + side-by-side PNGs) and
  reference those paths from the spec's Evidence section — the PR gate verifies
  the referenced files exist; a prose-only verdict does not pass.
