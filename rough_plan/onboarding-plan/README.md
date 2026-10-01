# Design Execution Package: Prabhuji Onboarding + Paywall

App: Prabhuji
Module: Onboarding + Paywall
Screen-Flow: Splash, Phone Login, OTP, Name + Language, VIP Paywall
Version: v1.0
Status: approved
Recommended Drive-wiki path: Prabhuji / Onboarding + Paywall / Module Flow / v1.0

## Source of Truth

- Main Figma section: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=520-4992&t=TzCwzI6RZASLubyK-1
- Language selector and name: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=406-2953&t=TzCwzI6RZASLubyK-1
- Paywall after language selection: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=493-3349&t=TzCwzI6RZASLubyK-1

## Package Contents

- README.md: Quick overview, status, source links, package contents, and the core behavioral rule.
- prd.md: Human-readable product requirements for onboarding, login, language, paywall, payment, states, analytics, and handoff.
- screen-spec.yaml: Machine-readable behavior spec for developers and AI coding agents.
- open-questions.yaml: Remaining unresolved decisions and deferred Phase 2 ideas.
- figma-links.md: Figma URLs, node IDs, detected areas, and implementation notes.

## Core Rule

Onboarding is mandatory, but payment is not. Users must log in with phone OTP, accept terms, provide a name, and choose a language. After that, free users see the VIP paywall and can close it to explore Home. Free users see the paywall again on every future app open. Active Pro users skip the paywall and go directly to Home.