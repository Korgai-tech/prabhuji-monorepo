# Design Execution Package: Prabhuji Aarti & Bhajans

```yaml
App: Prabhuji
Module: Aarti & Bhajans
Screen-Flow: Module Spec
Version: v1.0
Status: approved
Recommended Drive-wiki path: Prabhuji / Aarti & Bhajans / Module Spec / v1.0
```

## Source of Truth

- Main module section: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=683-5219&t=TzCwzI6RZASLubyK-1
- Aarti & Bhajans main page: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=412-2656&t=TzCwzI6RZASLubyK-1
- Aarti & Bhajans listing page: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=420-2909&t=TzCwzI6RZASLubyK-1
- Aarti & Bhajans player: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=423-4387&t=TzCwzI6RZASLubyK-1
- Player controls component variant: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=423-4384&t=TzCwzI6RZASLubyK-1

## Package Contents

- `README.md` — quick overview, source links, package status, and the core behavioral rule.
- `prd.md` — human-readable product intent, access rules, feature requirements, states, analytics, and handoff notes.
- `screen-spec.yaml` — machine-readable behavior spec for build agents and developers.
- `open-questions.yaml` — remaining implementation questions and Phase 2 items.
- `figma-links.md` — Figma frame links, detected nodes, and implementation notes.

## Core Rule

Aarti & Bhajans must allow free devotional discovery but reserve actual audio playback for Pro. Do not show a paywall on module entry, category browsing, deity browsing, or listing views. Trigger the unified paywall only when a free user taps an audio item with clear intent to listen. After successful purchase, return to and auto-play the originally tapped audio item.

## Decision Classification

### Confirmed decisions

- Free users can browse the full module.
- Playback is Pro-only.
- Paywall triggers when a free user taps an audio item.
- Successful purchase from this flow must continue to the originally tapped item.
- Pro users can browse, stream, like/favorite, and share item links.
- Browse Categories are CMS-controlled samples, not a hardcoded final list.
- Category taps and deity taps open the same reusable 2-column audio listing UI.
- Empty Recently Played is hidden.
- Pro playback auto-starts when the player opens.
- Queue is based on the list or section the user came from.
- Next/previous move through the current queue.
- Auto-play next item only within the current queue, then stop at the end.
- Audio continues through an in-app mini-player when the user leaves the full player.
- Lyrics, repetition counter, next-track card, and favorite library are not Phase 1.

### AI assumptions marked in specs

- CMS provides all audio, category, deity, artwork, metadata, and aggregate counts.
- Browse cards do not show lock badges or Pro labels.
- The mini-player uses a compact sticky pattern because Figma does not yet include its visual design.

### Open questions

See `open-questions.yaml`. The main open item is the final visual design for the Phase 1 mini-player.