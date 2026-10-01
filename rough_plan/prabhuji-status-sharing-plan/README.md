# Design Execution Package: Prabhuji Status Sharing

- App: Prabhuji
- Module: Status Sharing
- Screen-Flow: Module Spec
- Version: v1.0
- Status: Approved
- Recommended Drive-wiki path: Prabhuji / Status Sharing / Module Spec / v1.0

## Source of Truth

- Main Figma section: Status, node `371:2182`
- Status Home frame: node `302:4384`
- Personal Details frame: node `371:2185`
- Business Details frame: node `371:3567`
- Main file key: `ipSvV1FnmzvV8TK2Ig8Aiq`

## Package Contents

- `README.md` — Quick overview, status, source links, contents, and core module rule.
- `prd.md` — Human-readable product intent, access rules, behavior, states, scope, analytics, and handoff notes.
- `screen-spec.yaml` — Machine-readable behavior spec for developers and AI coding agents.
- `open-questions.yaml` — Non-blocking implementation questions and approved Phase 2 items.
- `figma-links.md` — Figma frame links, detected areas, and implementation notes.

## Core Rule

Logged-in free users can discover, filter, like, customize, and preview devotional status content, but any final output action is Pro-only. The unified paywall must appear only after clear share/export intent, mainly when a free user taps `Share`. Do not block browsing or previewing with Pro gates.
