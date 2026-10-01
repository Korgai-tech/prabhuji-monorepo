# Pattern: Flutter Feed Screen (CMS-driven, mixed content)

> Repo-specific pattern (monorepo-boilerplate). Source of truth: `apps/mobile/lib/features/home/` (TAM-4). Reuse for the Status, Mandir, Horoscope, and Books modules.

## Use Case

A Flutter screen composed of independent CMS-backed sections (banners, feed) plus static chrome, with an infinite mixed-content list, viewport-driven media (autoplay audio/video previews), and impression/view analytics. The backend contract may not exist yet.

## Structure

```text
apps/mobile/lib/features/<feature>/
├── data/
│   ├── models.dart              # Mirrors the CMS contract; enums use wire strings + fromWire
│   ├── <feature>_repository.dart# Abstract repository + Fake<...>Repository (seeded, failure flags)
│   └── share_service.dart       # Platform-channel boundaries get an interface + fake
├── analytics.dart               # Event-name constants + vendor-agnostic sink interface
├── destinations.dart            # Route ALLOWLIST: CMS destination values never navigate raw
├── feed_controller.dart         # AsyncNotifier: cursor pagination, optimistic mutations
├── <feature>_screen.dart        # CustomScrollView of slivers, one per section
├── placeholders.dart            # Minimal screens for routes whose modules don't exist yet
└── widgets/                     # One file per section + shared card chrome
```

Providers live in `lib/state/providers.dart` (repo convention); controller/widget classes stay in the feature.

## Key Decisions

### 1. Repository abstraction ships before the API contract

The screen depends on an abstract repository; a seeded `Fake<X>Repository` (deterministic data, `Duration latency`, public `failX` flags and recorded calls) unblocks UI, demos, and tests. When the contract lands, a dio-backed implementation swaps in behind the same provider — UI untouched. Follow `patterns_library/ci/contract-codegen-chain.md` at that point.

### 2. Sections fail independently

Each section watches its own provider (`FutureProvider` for banners, `AsyncNotifierProvider` for the feed). Static chrome (shortcut grids, nav) has no CMS dependency and must render even when every remote section fails. Failure contract per section, decided by product: hide (banners), retry CTA (feed), drop-item (single failed media via an `onMediaError` callback — never a broken-image placeholder).

### 3. Route allowlist for CMS-driven navigation

CMS `destination_type`/`destination_value` resolve through a hardcoded map (`destinations.dart`). Unknown values are a no-op, not a deep link — CMS data is untrusted input.

### 4. Viewport-driven media via VisibilityDetector + a single shared player

One player instance behind an interface (`AudioPreviewPlayer`) + a `Notifier<String?>` holding the currently-playing item id makes one-at-a-time structural. Cards report enter/exit with hysteresis thresholds (play ≥ 0.6, pause ≤ 0.2). Capture the notifier in `initState` — VisibilityDetector fires a final 0-visibility callback after dispose, when `ref` is unusable.

### 5. Impression vs view

Impression = first visible pixel. View = continuous ≥ 50% visibility for 2s, enforced with a `Timer` that visibility-exit cancels; dedup per session in the controller, not the widget.

### 6. Optimistic engagement

Mutations (like) update state immediately, persist through the repository, revert on failure. Analytics events fire at the interaction site; the vendor SDK hides behind the `HomeAnalytics`-style interface so tests assert against a recording fake.

## Design fidelity (not optional when the spec cites Figma)

This pattern governs the screen's *architecture* — it does not narrow a
Figma-sourced ticket's scope to "functional build only". If the spec references
a figma.com frame, the figma-flutter skill applies in full: Phase 1 tokens go
into the real theme (placeholder tokens are a `diff`, not a done), and Phase 6's
rendered-comparison verdict (sweep table) is recorded in the spec's Evidence
section. CMS-driven images change nothing: chrome, icons, spacing, typography,
and tokens still come from the frame; runtime imagery is simply a logged
content follow-up in the sweep.

There is no deferral to a follow-up ticket: the Phase 6 verdict is part of THIS
ticket's Definition of Done and the PR gate blocks until it is in Evidence.
No emulator available? Boot one (`flutter emulators --launch`), or record the
verdict from component golden renders. Tokens not final? Phase 1–3 land the real
tokens in this ticket too — a placeholder theme is a `diff` row, not a done.
If genuinely blocked, stop and surface the blocker to the user; the PR waits.

## Testing (see `apps/mobile/test/home/`)

- One `support.dart`: fakes for every boundary (repo, analytics, player, share), seeded item builders, and a `pumpHomeApp` helper — full app with the real router on a phone-sized surface.
- `VisibilityDetectorController.instance.updateInterval = Duration.zero` in the pump helper.
- Images: override the `ImageProvider` factory provider with `MemoryImage(kTransparentImage)`; an empty URL is the deterministic media-failure path. Tests never touch the network.
- Timing tests (`settle: false`): flush async loads with `pump(1ms)` — zero-duration pumps don't advance the fake clock — then `pump(1900ms)` / `pump(200ms)` around the threshold.
- Scrolled-out slivers are offstage for finders: `scrollUntilVisible` for lazily built cards, drag back to top before tapping header chrome.

## Gotchas

- `pumpAndSettle` does not wait for pending one-shot timers; view timers are cancelled in `State.dispose`, which keeps teardown clean.
- Nested `VisibilityDetector`s (card + hero) are fine but need distinct keys.
- Give every interactive element a stable `Key('feature-element-id')` — the test suite drives navigation through them.
- Text in flex rows needs `Flexible` + ellipsis; the phone-sized test surface catches overflows desktop-sized defaults miss.
