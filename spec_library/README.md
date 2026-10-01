# Design Execution Package: Prabhuji Home Screen

**App:** Prabhuji  
**Module:** Home  
**Screen/Flow:** Home Screen / Infinite Scroll Feed  
**Version:** v1.0  
**Status:** Approved for design-handoff draft  
**Recommended Drive/wiki path:** `Prabhuji / Home / Home Screen / v1.0`

## Source of Truth

- Main Figma frame: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=285-3464&t=8GTJCrqUNd9uTCCg-1
- Feed card header reference: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=285-3641&t=8GTJCrqUNd9uTCCg-1

## Package Contents

- `prd.md` - human-readable product/design requirement document
- `screen-spec.yaml` - machine-readable screen and behavior specification
- `open-questions.yaml` - unresolved decisions and phase-2 notes
- `figma-links.md` - Figma references and important node IDs

## Core Rule

Home is the main discovery surface for Prabhuji. It should show the same UI to free and Pro users, except Pro users should see a small crown/VIP badge near the profile avatar. Home should not show lock badges or Pro labels on feed cards. Paywalls should trigger only after users take Pro-gated actions inside modules or from CMS-controlled feature discovery banners.
