# Design Execution Package: Prabhuji Horoscope

```yaml
App: Prabhuji
Module: Horoscope
Screen-Flow: Module Spec
Version: v1.0
Status: approved
Recommended Drive-wiki path: Prabhuji / Horoscope / Module Spec / v1.0
```

## Source of Truth

- Main Horoscope module section: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=392-3149&t=TzCwzI6RZASLubyK-1
- Horoscope main tab / zodiac selection: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=371-3796&t=TzCwzI6RZASLubyK-1
- Result header with TTS mute/unmute icon: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=387-2491&t=TzCwzI6RZASLubyK-1
- Unified Prabhuji VIP Membership paywall: Figma node `493:3349` in file `ipSvV1FnmzvV8TK2Ig8Aiq`

## Package Contents

- `README.md` — overview, source links, package status, and core rule.
- `prd.md` — human-readable product intent, user behavior, access rules, states, analytics, and handoff notes.
- `screen-spec.yaml` — machine-readable behavior spec for developers and AI coding agents.
- `open-questions.yaml` — unresolved implementation and business decisions plus Phase 2 items.
- `figma-links.md` — Figma links, node IDs, detected UI areas, and implementation notes.

## Core Rule

Horoscope is a Pro-only result feature, but discovery remains free. Free users may open the Horoscope tab and view the zodiac grid. The unified paywall appears only after a free user taps a zodiac sign. Pro users tapping a zodiac sign enter the daily horoscope result flow, where CMS/admin-configured steps are read aloud using TTS and can auto-advance after speech finishes.