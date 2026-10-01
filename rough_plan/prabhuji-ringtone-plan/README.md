# Design Execution Package: Prabhuji Ringtone

**App:** Prabhuji  
**Module:** Ringtone  
**Screen-Flow:** Module Spec  
**Version:** v1.0  
**Status:** approved  
**Recommended Drive-wiki path:** Prabhuji / Ringtone / Module Spec / v1.0

## Source of Truth

- Main module section: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=712-7122&t=TzCwzI6RZASLubyK-1
- Ringtone Home: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=670-4481&t=TzCwzI6RZASLubyK-1
- Search Results: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=1073-3472&t=TzCwzI6RZASLubyK-1
- Ringtone Preview: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=683-4775&t=TzCwzI6RZASLubyK-1
- Share Ringtone: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=683-5084&t=TzCwzI6RZASLubyK-1

## Package Contents

- `README.md` — quick overview, status, source links, and core behavioral rule.
- `prd.md` — product intent, user goals, business goals, access rules, states, analytics, and handoff notes.
- `screen-spec.yaml` — machine-readable behavior spec for implementation and QA.
- `open-questions.yaml` — non-blocking unresolved choices and Phase 2 items.
- `figma-links.md` — Figma URLs, node IDs, detected nodes, and implementation notes.

## Core Rule

Ringtone is a paid Pro feature, but discovery is free. Free users may browse the ringtone grid, use deity filters, and search. The paywall appears only after clear intent, when a free user taps a ringtone card or play action. Pro users open the preview, auto-play the selected ringtone, and can like, share, and set it as the phone ringtone.