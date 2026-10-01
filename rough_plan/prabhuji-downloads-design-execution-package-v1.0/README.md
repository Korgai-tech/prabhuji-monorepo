# Design Execution Package: Prabhuji — Downloads

**App:** Prabhuji
**Module:** Downloads (offline audio for Aarti / Bhajan / Mantra)
**Screen / Flow:** Downloads library, play-page download button, action sheets, offline mode, empty state
**Version:** v1.0
**Status:** DRAFT FOR REVIEW (awaiting designer approval before finalizing as v1.0)
**Recommended path:** `Prabhuji / Downloads / Module Spec / v1.0`

## Source of Truth

- Figma is visual truth. This package is behavior truth. Where the PM PRD and Figma diverge, Figma wins on layout/visual and the divergence is flagged.
- Main Figma section: `Downloads` — node `2632:21210`
  https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=2632-21210
- Original PM PRD: `Prabhuji-Downloads-PRD.md` (Ronak, v1.0). This package reconciles that PRD with the current Figma.
- See `figma-links.md` for every node and PRD-vs-Figma reconciliation.

## Package Contents

- `README.md` — this overview, status, source-of-truth links, Core Rule.
- `prd.md` — reconciled product intent, free vs premium behavior, per-section requirements, states, analytics, handoff notes.
- `screen-spec.yaml` — machine-readable behavior spec to build against.
- `open-questions.yaml` — remaining decisions (owners, priority, blocker flags) and Phase 2 items.
- `figma-links.md` — Figma URLs, node IDs, PRD-vs-Figma notes.

## Core Rule

Downloads are **premium-only, in-app-only offline audio** for Aarti, Bhajan, and Mantra. One tap on a play page downloads in place; everything downloaded lives in the Downloads screen. Downloaded audio is stored in the app's private, encrypted storage, decrypted only while playing — it is never a shareable or externally-openable file, and it never feeds the ringtone flow. A free user tapping download gets the **existing unified paywall** (no downloads-specific paywall). When premium **lapses**, downloaded items stay visible but tapping one to play **re-fires the unified paywall**.
