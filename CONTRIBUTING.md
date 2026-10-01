# Contributing

Guide for humans and AI agents working in this Nx + pnpm monorepo. The SAW harness (`.claude/`) automates most of this workflow — this document is the northstar the harness commands defer to.

## Quick Start

**Prerequisites**: Node 22 (`.nvmrc`), pnpm 11, Docker. Flutter 3.44+ and JDK 17 only if working on `apps/mobile`.

```bash
pnpm install
cp .env.example .env            # then edit JWT_SECRET + DATABASE_URL
docker compose up -d            # Postgres, Redis, floci-aws emulator
pnpm prisma migrate deploy --schema apps/api/prisma/schema.prisma
pnpm nx serve api               # http://localhost:3000
```

## Tickets: In-Repo Specs

Tickets are markdown spec files in `specs/` (`TAM-{N}-{slug}.md`) — there is no external tracker. See `specs/README.md`.

- Create specs from `specs_templates/spec_template.md` (BSA role owns AC quality)
- **Stop-the-Line**: no Acceptance Criteria / Definition of Done in the spec → no implementation work begins
- Keep the spec's Status current: Todo → In Progress → Ready for Review → Done
- Harness commands: `/start-work N` → `/check-workflow` → `/pre-pr` → `/end-work`

## Branch Naming

**REQUIRED FORMAT**: `TAM-{number}-{short-description}`

✅ `TAM-42-add-user-pagination` · `TAM-57-fix-login-redirect`
❌ `feature/add-dark-mode` (no ticket) · `WIP` (not descriptive) · personal names/dates

Rules: starts with `TAM-{number}`, lowercase-with-hyphens description, max ~50 chars, reflects the actual work.

## Commit Messages

**REQUIRED FORMAT**: `type(scope): description [TAM-XXX]`

- **Types**: `feat` `fix` `docs` `style` `refactor` `test` `chore` `ci`
- **Scopes** (optional): `api` `admin` `mobile` `api-client` `db` `harness` `infra` `dx`
- Every commit references the spec ID it belongs to

✅ `feat(api): add users pagination [TAM-42]`
❌ `add new feature` (no ticket, no type)

## Workflow Process (rebase-first)

### 1. Start work

```bash
git checkout main && git pull origin main   # skip pull if no remote yet
git checkout -b TAM-{number}-{description}
```

### 2. During development

Commit in SAFe format; keep the branch updated with `git fetch origin && git rebase origin/main` (never merge commits).

### 3. Before creating a PR — validation gates

```bash
pnpm verify   # REQUIRED: arch boundaries + OpenAPI drift + typecheck + lint + unit tests
```

Additional gates depending on what you touched:

```bash
pnpm verify:mobile                              # apps/mobile touched (flutter analyze + test)
pnpm nx test api --configuration=integration    # api behavior changed (needs Docker)
```

**Contract-first codegen** — if you changed API routes/Zod schemas, regenerate IN ORDER and commit with the change:

```bash
pnpm nx run api:openapi          # re-emit apps/api/openapi.json
pnpm nx run api-client:generate  # TS types for admin
pnpm nx run mobile:generate      # Dart models (needs JDK 17)
```

### 4. Push and create the PR

```bash
git push --force-with-lease origin TAM-{number}-{description}
```

Use `.github/pull_request_template.md` and fill out all sections. PR title = commit format: `type(scope): description [TAM-XXX]`.

### 5. Merge

**Only "Rebase and merge"** — maintains linear history. Never squash or merge-commit.

## Agent Exit States

```
┌─────────────────┬───────────────────────────────────────────┐
│ Role            │ Exit State                                │
├─────────────────┼───────────────────────────────────────────┤
│ BE-Developer    │ "Ready for QAS"                           │
│ FE-Developer    │ "Ready for QAS"                           │
│ Data-Engineer   │ "Ready for QAS"                           │
│ QAS             │ "Approved for RTE"                        │
│ RTE             │ "Ready for HITL Review"                   │
│ System Architect│ "Stage 1 Approved - Ready for ARCHitect"  │
│ HITL            │ MERGED                                    │
└─────────────────┴───────────────────────────────────────────┘
```

### Gate Quick Reference

```
┌─────────────────┬─────────────────┬─────────────────────────┐
│ Gate            │ Owner           │ Blocking?               │
├─────────────────┼─────────────────┼─────────────────────────┤
│ Stop-the-Line   │ Implementer     │ YES - no AC = no work   │
│ QAS Gate        │ QAS             │ YES - no approval = stop│
│ Stage 1 Review  │ System Architect│ YES - pattern check     │
│ Stage 2 Review  │ ARCHitect-CLI   │ YES - architecture check│
│ HITL Merge      │ Aashish Agrawal │ YES - final authority   │
└─────────────────┴─────────────────┴─────────────────────────┘
```

### Role Collapsing

- **RTE**: collapsible (implementer may create the PR)
- **QAS**: NOT collapsible (independence gate — spawn a subagent)
- **SecEng**: NOT collapsible (security audit requires independence)

Role details: `AGENTS.md` + `.claude/agents/`. Quality-gate commands: `.claude/team-config.json`.

## CI Pipeline

`.github/workflows/ci.yml` runs three jobs on push/PR (active once a GitHub remote exists):

1. **verify** — `pnpm verify` (arch boundaries, OpenAPI drift, typecheck, lint, unit tests)
2. **api-integration** — testcontainers Postgres integration tests
3. **mobile** — `flutter analyze` + `flutter test`

If CI fails: run the same command locally (`pnpm verify` first), fix, push again.

## Local Development

```bash
pnpm nx serve api            # API from source (tsx watch, :3000)
pnpm nx serve admin          # Admin SPA (Vite; VITE_API_URL sets API base)
pnpm prisma studio --schema apps/api/prisma/schema.prisma   # DB GUI
pnpm nx test api --configuration=unit                       # fast mocked tests
```

Architecture rules (enforced by `pnpm check:arch-boundaries`): Route → Controller → Service → Repository → DB; Prisma only inside `repositories/`; cross-module calls via `performServiceCall` — see `apps/api/CLAUDE.md` and per-app `CLAUDE.md` files.

## Troubleshooting

**Branch name rejected**: `git branch -m TAM-{number}-{description}`
**Rebase required**: `git fetch origin && git rebase origin/main`, resolve conflicts, `git push --force-with-lease`
**Commit format error**: `git commit --amend -m "feat(scope): description [TAM-XXX]"`
**Validation failures**: `pnpm verify` locally to see the failing gate; fix and re-run.

---

**Maintained by**: monorepo-boilerplate development team. Workflow adapted from SAW (`bybren-llc/safe-agentic-workflow` v2.10.0).
