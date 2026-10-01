# Agent Output Directory Guide

**Purpose**: standardized locations for AI agent work artifacts (evidence, reports, plans) in the target project.

## Quick Reference

| Agent            | Output directory                       | Naming convention                 |
| ---------------- | -------------------------------------- | --------------------------------- |
| QAS              | `docs/agent-outputs/qa-validations/`   | `TAM-{number}-qa-validation.md`   |
| BSA              | `docs/agent-outputs/requirements/`     | `TAM-{number}-requirements.md`    |
| System Architect | `docs/adr/`                            | `ADR-{number}-{title}.md`         |
| Tech Writer      | `docs/agent-outputs/technical-docs/`   | `TAM-{number}-technical-docs.md`  |
| Data Engineer    | `docs/agent-outputs/technical-docs/`   | `TAM-{number}-migration-plan.md`  |
| TDM              | `docs/agent-outputs/delivery-reports/` | `TAM-{number}-delivery-report.md` |

## Directory Structure

```text
docs/agent-outputs/
  qa-validations/     <- QAS test reports and validation results
  requirements/       <- BSA requirements analysis
  technical-docs/     <- Tech Writer docs, Data Engineer migration plans
  delivery-reports/   <- TDM delivery status and blocker reports

docs/adr/             <- System Architect ADRs (team-wide, sequential numbers)
```

The ticket itself stays in `specs/TAM-{number}-{slug}.md` — agent outputs are supporting evidence, not the spec.

## Fixed Locations (Do Not Move)

- `specs/` + `specs_templates/` — in-repo tickets and their templates
- `patterns_library/` — pattern library; the repo-stack patterns `api/module-shape.md`, `api/cross-module-call.md`, and `ci/contract-codegen-chain.md` are checked FIRST before implementing
- `apps/api/prisma/schema.prisma` — database schema source of truth
- `docs/adr/` — architecture decision records

## Mandatory Reading Before Work (`team-config.json`)

- **Always**: `CLAUDE.md`, `CONTRIBUTING.md`, `AGENTS.md`
- **Database work**: `apps/api/prisma/schema.prisma`, `apps/api/CLAUDE.md`
- **Security work**: `apps/api/CLAUDE.md`
- **Architecture work**: `arch-boundaries.json`, `docs/adr/`
- **Any implementation**: check `patterns_library/` first (pattern-discovery skill)

## What Each Agent Includes

- **QAS**: test execution results (pass/fail counts), acceptance-criteria validation, evidence (commands run + output), recommendation (APPROVE or REQUEST CHANGES)
- **BSA**: user story, testable acceptance criteria, testing strategy, pattern references — implementation specs themselves go in `specs/`
- **System Architect**: ADRs with sequential numbering (ADR-001, ADR-002, ...), pattern validation notes
- **Tech Writer**: API documentation, guides, migration guides
- **Data Engineer**: migration plan, rollback strategy, data impact analysis

## File Lifecycle

1. **During work**: write to `docs/agent-outputs/{category}/TAM-{number}-*.md`
2. **Hand-off**: link the file from the spec (`specs/TAM-{number}-*.md`) and the PR description as evidence
3. **After merge**: files remain in `docs/agent-outputs/` as the audit trail

## Do / Don't

**DO**

- Use the ticket number in every filename (`TAM-{number}-*`)
- Write to the designated category directory
- Append an evidence summary to the spec before hand-off
- Read the mandatory docs before starting work

**DON'T**

- Move `specs/`, `patterns_library/`, or `docs/adr/`
- Skip the mandatory reading checklist
- Invent new output categories without updating this guide
