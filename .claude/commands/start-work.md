---
description: Start work on a TAM spec with proper workflow
argument-hint: [TAM-number]
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

You are starting work on a TAM ticket. **This repo tracks tickets as in-repo spec files under `specs/` — there is no external tracker.**

**Workflow Authority**: This harness command provides execution steps. CONTRIBUTING.md is the northstar for conventions (branch naming, commit format, SAFe patterns). Follow both:

## Pre-Flight Checklist

1. **Spec Exists?**
   - If no ticket number provided in arguments, ask the user which spec — or, for new work, create the next `specs/TAM-{number}-{slug}.md` from `specs_templates/spec_template.md` (BSA role)
   - Verify the spec file exists: `ls specs/TAM-{number}-*.md`
   - Confirm its Status is Todo or In Progress

2. **Stop-the-Line: AC/DoD Check** (MANDATORY)
   - Verify the spec has **Acceptance Criteria** or **Definition of Done**
   - If AC/DoD is missing or unclear:
     - **STOP** - Do not proceed with implementation
     - Route back to BSA/POPM to define AC/DoD in the spec
     - Dev agents are NOT responsible for inventing AC/DoD
   - Work begins ONLY when AC/DoD exists

3. **Design Source Check** (if the spec has UI work)
   - Does the spec reference a figma.com frame (Design References section)?
   - If YES, the ticket's plan includes the figma-flutter skill's six phases —
     tokens, geometry, theme, assets, translation, rendered comparison — and the
     Phase 6 verdict is an acceptance criterion. If the AC lacks it, add it now
     (from `specs_templates/spec_template.md`); fidelity is this ticket's work,
     never a follow-up.
   - Prep the comparison environment NOW, not at PR time: boot an emulator
     (`flutter emulators --launch <id>`) or confirm goldens are runnable, so
     Phase 6 has somewhere to render when the build lands.
   - If the ticket is UI work but has NO Figma link and one should exist, route
     back to BSA to attach it (same stop-the-line as missing AC).

4. **Blocker Triage** (before any implementation)
   - Scan the spec's `#PLAN_UNCERTAINTY`, Dependencies, and Blockers sections
     (and any referenced open-questions file) for unresolved items.
   - An unresolved item that gates the first planned commits (e.g. a schema
     sign-off required before the migration) is stop-the-line: route it to
     POPM now, or re-sequence the plan to an unblocked lane (e.g.
     fake-repository-first mobile work) and record the re-sequencing in the spec.
   - Never discover a declared blocker mid-implementation.

5. **Branch Naming**
   - Format: `TAM-{number}-{short-description}`
   - Must start with TAM- and ticket number
   - Use lowercase with hyphens for the description

6. **Start from Latest Main**
   - Ensure starting from a clean main branch: `git checkout main && git pull origin main` (skip the pull if no remote is configured yet)
   - Verify no uncommitted changes

7. **Create Feature Branch**
   - Create branch: `git checkout -b TAM-{number}-{description}`
   - Confirm branch created successfully

8. **Mark Spec In Progress**
   - Set the spec's Status field to `In Progress`

## Workflow

If argument provided ($1):

- Use as ticket number (e.g., `/start-work 347` → TAM-347)
- Read `specs/TAM-347-*.md` for AC/DoD and context
- Suggest branch name based on the spec title
- Execute checkout workflow

If no argument:

- List open specs (`grep -l 'Status.*Todo\|Status.*In Progress' specs/*.md`) and ask which to work on
- Proceed with workflow

## Success Criteria

- ✅ Spec file located and read
- ✅ AC/DoD confirmed (Stop-the-Line gate passed)
- ✅ Figma-sourced UI: fidelity verdict in AC + comparison environment prepped
- ✅ Declared blockers triaged (resolved, routed to POPM, or plan re-sequenced)
- ✅ On latest main branch
- ✅ Feature branch created with correct naming
- ✅ Spec Status set to In Progress
- ✅ Ready to begin work

Report status and any blockers. If AC/DoD is missing, report blocker and route to BSA.
