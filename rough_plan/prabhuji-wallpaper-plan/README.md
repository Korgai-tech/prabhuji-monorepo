# Design Execution Package: Prabhuji Wallpaper

**App:** Prabhuji  
**Module:** Wallpaper  
**Screen-Flow:** Module Spec  
**Version:** v1.0  
**Status:** Approved  
**Recommended Drive-wiki path:** Prabhuji / Wallpaper / Module Spec / v1.0

## Source of Truth

- Main Wallpaper module section: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=712-7121&t=TzCwzI6RZASLubyK-1
- Wallpaper Home: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=704-5223&t=TzCwzI6RZASLubyK-1
- Deity/category listing: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=707-6427&t=TzCwzI6RZASLubyK-1
- Static wallpaper preview: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=282-2812&t=TzCwzI6RZASLubyK-1
- Live wallpaper preview: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=712-6622&t=TzCwzI6RZASLubyK-1

## Package Contents

- `README.md` — Quick overview, status, source links, contents, and core rule.
- `prd.md` — Human-readable product intent, requirements, access rules, states, analytics, and handoff notes.
- `screen-spec.yaml` — Machine-readable implementation behavior, CMS schema, interactions, states, analytics, and QA checks.
- `open-questions.yaml` — Non-blocking engineering/CMS follow-ups and Phase 2 brainstorm items.
- `figma-links.md` — Figma source links, detected nodes, and implementation notes.

## Core Rule

Wallpaper discovery and preview are free for logged-in users, but setting any wallpaper is a Pro-only action. Free users must not see paywalls on module entry, browsing, filtering, liking, sharing, or preview. The unified paywall appears only after a free user taps `Set Wallpaper` or `Set Lockscreen`.