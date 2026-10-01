---
name: safe-workflow
description: SAFe development workflow guidance including branch naming conventions, commit message format, rebase-first workflow, and CI validation. Use when starting work on a TAM spec, preparing commits, creating branches, writing PR descriptions, or asking about contribution guidelines.
user-invocable: false
allowed-tools: Read, Grep, Glob
---

# SAFe Workflow Skill

> **📋 TEMPLATE**: This skill uses `TAM` as a placeholder. Replace with your project's ticket prefix (e.g., `WOR`, `PROJ`, `FEAT`).

## Purpose

Enforce SAFe-compliant git workflow with standardized branch naming, commit message format, and rebase-first merge strategy. Ensures linear history and full traceability to in-repo spec files (`specs/TAM-N-*.md`).

## When This Skill Applies

Invoke this skill when:

- User mentions starting work on a ticket (e.g., "I'm starting TAM-447")
- User is about to create a commit
- User is creating or naming a branch
- User asks about PR workflow or contribution guidelines
- User references CONTRIBUTING.md or workflow process
- User asks "how should I commit this?" or similar

## Branch Naming Convention

**Required Format**: `TAM-{number}-{short-description}`

### Rules

- MUST start with `TAM-` followed by ticket number
- Use lowercase letters and hyphens for description
- Keep description short but meaningful (max 50 chars total)
- Never include personal names or dates

### Examples

```text
TAM-447-create-safe-workflow-skill
TAM-123-fix-login-redirect
TAM-234-add-users-module
```

### Anti-Patterns (Do NOT use)

```text
feature/add-dark-mode       (missing ticket number)
fix/broken-login            (missing ticket number)
john-new-feature            (personal naming)
WIP                         (not descriptive)
```

## SAFe Commit Message Format

**Required Format**: `type(scope): description [TAM-XXX]`

### Types (Required)

| Type       | When to Use                         |
| ---------- | ----------------------------------- |
| `feat`     | New feature                         |
| `fix`      | Bug fix                             |
| `docs`     | Documentation only                  |
| `style`    | Formatting (no logic changes)       |
| `refactor` | Code restructuring (no feature/bug) |
| `test`     | Adding or updating tests            |
| `chore`    | Maintenance, dependencies           |
| `ci`       | CI/CD pipeline changes              |

### Scope (Optional)

Common scopes: `api`, `admin`, `mobile`, `auth`, `db`, `infra`, `harness`

### Ticket Reference (MANDATORY)

Every commit MUST end with `[TAM-XXX]` referencing the ticket.

### Examples

```text
feat(harness): create safe-workflow skill [TAM-447]
fix(auth): resolve login redirect issue [TAM-57]
docs: update API documentation [TAM-123]
refactor(db): optimize query performance [TAM-234]
chore: upgrade dependencies [TAM-337]
```

## Rebase-First Workflow

This project enforces **linear history** through rebase-first workflow. Never create merge commits.

### Workflow Steps

```bash
# 1. Start from latest main
git checkout main && git pull origin main

# 2. Create feature branch
git checkout -b TAM-{number}-{description}

# 3. Make commits (SAFe format)
git add .
git commit -m "type(scope): description [TAM-XXX]"

# 4. Keep branch updated during development
git fetch origin
git rebase origin/main

# 5. Before pushing - rebase one final time
git fetch origin
git rebase origin/main
# Resolve any conflicts locally

# 6. Push with force-with-lease (safe after rebase)
git push --force-with-lease origin TAM-{number}-{description}

# 7. Create PR using template
# Use "Rebase and merge" strategy ONLY
```

### PR size: split at the contract seam

A spec spanning the API contract boundary (api module + regenerated clients +
consumer UI) ships as TWO PRs, cut where the codegen chain runs:

1. **PR 1** — API module + migration + regenerated `openapi.json` / api-client / Dart models
2. **PR 2** — consumer UI built on the landed contract

One-sided specs ship as one PR. A nine-commit single PR starves the Stage 1/2
reviews — reviewers approve shapes that size, not code.

### Why `--force-with-lease`?

- Safer than `--force` (won't overwrite unseen remote changes)
- Required after rebasing to push cleanly
- Prevents accidental overwrites in team environments

## Pre-PR Validation Checklist

Before creating a PR, ALL of these must pass:

### 1. Code Quality Validation

```bash
pnpm verify
```

This runs: arch boundaries, OpenAPI drift check, typecheck, lint, and unit tests across all Node projects (run `pnpm verify:mobile` too when mobile changed)

### 2. Markdown Linting

```bash
pnpm exec prettier --check "**/*.md"
```

### 3. Git Status Check

```bash
git status
# Must show: nothing to commit, working tree clean
```

### 4. Rebase Status

```bash
git fetch origin
git rebase origin/main
# Must be up-to-date with main branch
```

### 5. Commit Message Audit

```bash
git log origin/main..HEAD --oneline
# All commits must follow SAFe format with [TAM-XXX]
```

**Shortcut**: Use `/pre-pr` command to run all validation steps.

## Available Slash Commands

| Command           | Purpose                        | When to Use              |
| ----------------- | ------------------------------ | ------------------------ |
| `/start-work`     | Begin work on a ticket         | Starting any new work    |
| `/check-workflow` | Quick status check             | Periodically during work |
| `/pre-pr`         | Full validation before PR      | Before creating PR       |
| `/end-work`       | Complete session cleanly       | End of work session      |
| `/quick-fix`      | Fast-track for small bug fixes | Minor, isolated fixes    |

## Multi-Team Coordination

### High-Risk Files (Announce Before Touching)

| File                            | Risk   | Required Action                   |
| ------------------------------- | ------ | --------------------------------- |
| `apps/api/prisma/schema.prisma` | HIGH   | Announce BEFORE touching          |
| `apps/api/prisma/migrations/*`  | HIGH   | Coordinate with all teams         |
| `apps/api/openapi.json`         | HIGH   | Regenerate via the codegen chain  |
| `docker-compose*.yml`           | HIGH   | All teams must restart containers |
| `package.json`                  | MEDIUM | Run `pnpm install` after sync     |
| `.env.template`                 | MEDIUM | Update local `.env` files         |

### Before Starting Work

Always sync with latest main:

```bash
git checkout main && git pull origin main
```

Or use `/local-sync` command for full synchronization.

## Authoritative Reference

For complete workflow documentation, see:

- **CONTRIBUTING.md** - Full contributor guide (SINGLE SOURCE OF TRUTH)
- **CLAUDE.md** - Development commands and architecture
- **.claude/README.md** - Harness configuration and commands

## Why These Rules Matter

1. **Linear History**: Rebase-first prevents merge conflicts between teams
2. **Ticket Traceability**: Every commit links to tickets for audit trail
3. **Quality Gates**: CI validation catches issues before production
4. **Team Coordination**: Branch naming enables automated workflows
5. **SAFe Compliance**: Standardized format supports sprint reporting

---

## Customization Guide

| Placeholder                            | Description              | Example                                |
| -------------------------------------- | ------------------------ | -------------------------------------- |
| `TAM`                                  | Your ticket/issue prefix | `WOR`, `PROJ`, `FEAT`                  |
| `main`                                 | Main git branch name     | `main`, `dev`                          |
| `pnpm verify`                          | CI validation command    | `pnpm verify`                          |
| `pnpm exec prettier --check "**/*.md"` | Markdown linting command | `pnpm exec prettier --check "**/*.md"` |
| `pnpm install`                         | Package install command  | `pnpm install`                         |
