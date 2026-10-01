# Design Execution Package: Prabhuji Mantras & Stutis

**App:** Prabhuji  
**Module:** Mantras & Stutis  
**Screen-Flow:** Module Main Page, Show All Listing, Mantra Player, Counter, Playlist, Background Mini-player  
**Version:** v1.0  
**Status:** Approved  
**Recommended Drive-wiki path:** Prabhuji / Mantras & Stutis / Module Spec / v1.0

## Source of Truth

- Main module section: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=683-5220&t=TzCwzI6RZASLubyK-1
- Main page: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=425-4944&t=TzCwzI6RZASLubyK-1
- Mantra Player: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=438-3074&t=TzCwzI6RZASLubyK-1
- Show All listing: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=1066-3358&t=TzCwzI6RZASLubyK-1

## Package Contents

- `README.md` — Quick overview, source links, status, and core build rule.
- `prd.md` — Human-readable product requirements, scope, access model, states, analytics, and handoff notes.
- `screen-spec.yaml` — Machine-readable behavior spec for developers and AI coding agents.
- `open-questions.yaml` — Non-blocking open questions and Phase 2 suggestions.
- `figma-links.md` — Figma node inventory and implementation notes.

## Core Rule

Mantras & Stutis is a paid devotional audio feature, but discovery remains free. Free users can enter the module and browse main/listing surfaces without lock badges, but any tap that expresses intent to play a mantra, stuti, deity, category, or audio item opens the unified paywall. Pro users open the audio player, stream with repeat counter, use playlist, like, share, and continue playback through the shared mini-player/background audio flow.