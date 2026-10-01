# Claude Code Configuration

This directory contains the TAM Claude Code harness: agents, slash commands, skills, and hooks for the SAFe specs-driven workflow.

**Source of truth**: the `krutyug-agent-harness` repo. Install or update with:

```bash
cd /path/to/this/project
bash ~/krutyug/krutyug-agent-harness/install.sh   # optional: --prefix ABC --project name
```

Re-running refreshes harness-owned files and never deletes `specs/`, `.claude/settings.local.json`, an existing `.claude/settings.json`, or files you added. Harness-wide changes belong in the harness repo; project-only additions can live here and survive updates.

## Harness Layers

| Layer          | Location                                 | Invoked by                              |
| -------------- | ---------------------------------------- | --------------------------------------- |
| Hooks          | `settings.json` (+ 1 script in `hooks/`) | Automatic guardrails                    |
| Slash commands | `commands/` (13)                         | User (`/start-work`, `/pre-pr`, ...)    |
| Skills         | `skills/`                           | Model (auto-loaded on matching context) |
| Agents         | `agents/` (11)                           | Orchestrator via the Task tool          |

## Workflow: In-Repo Specs

- Tickets are markdown files: `specs/TAM-N-{slug}.md`, created from `specs_templates/spec_template.md`.
- Status: Todo → In Progress → Ready for Review → Done (or Blocked). `/start-work` and `/end-work` read and update it.
- **Stop-the-Line**: no Acceptance Criteria / Definition of Done in the spec → no implementation begins.
- Branch `TAM-N-{description}` off `main`; commits `type(scope): description [TAM-N]`.
- Rebase-first; PRs merge via rebase-and-merge only.

## Roles, Exit States, and Gates

| Role                       | Exit state            |
| -------------------------- | --------------------- |
| BE / FE / Data Engineer    | Ready for QAS         |
| QAS (gate owner)           | Approved for RTE      |
| RTE                        | Ready for HITL Review |
| System Architect (Stage 1) | Stage 1 Approved      |

Gate chain: Stop-the-Line (implementer) → QAS gate → Stage 1 review (System Architect) → Stage 2 review (ARCHitect-in-CLI) → HITL merge (human).

**Role collapsing**: coordination roles (e.g. RTE) may be collapsed into the main session — label the hat, e.g. "Operating as RTE (collapsed) → exit state Ready for HITL Review". QAS and Security Engineer are independence gates and are **not** collapsible; if self-QA is unavoidable for a low-risk change, label it "Self-QA (non-independent)" and record the exception in the spec. HITL merge authority is never collapsed.

## Slash Commands (13)

| Command                | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `/start-work`          | Start work on a TAM spec with proper workflow                   |
| `/check-workflow`      | Quick status check of current workflow state                    |
| `/pre-pr`              | Run complete validation workflow before creating a PR           |
| `/end-work`            | Complete work session with final checklist                      |
| `/quick-fix`           | Fast-track workflow for small bug fixes                         |
| `/local-sync`          | Full local development sync after git pull                      |
| `/local-deploy`        | Build + run the full stack locally (API image + floci-aws emulator) |
| `/update-docs`         | Check and update relevant documentation for current work        |
| `/retro`               | Conduct retrospective analysis of work session                  |
| `/release`             | Full version release: merge PRs, version bump, tag, GH Release  |
| `/audit-deps`          | Run comprehensive dependency audit                              |
| `/check-docker-status` | Check if the local Docker environment needs updating            |

## Skills

Model-invoked expertise packs in `skills/{name}/SKILL.md` — metadata loads at startup, full content when the context matches. Roster with descriptions: [skills/README.md](skills/README.md). Notables: `pattern-discovery` is mandatory before implementation, `safe-workflow` covers git conventions, `testing-patterns` covers Vitest + Flutter tests.

## Agents (11)

SAFe role profiles in `agents/` with per-role tool restrictions. Roster: [agents/README.md](agents/README.md); usage matrix and validation commands: `AGENTS.md` (repo root) and `team-config.json`.

## Hooks

Live hooks are configured in `.claude/settings.json` (created by the installer only if missing):

| Event                     | Behavior                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| UserPromptSubmit          | Reminds to create a `TAM-N-{description}` feature branch when on `main`                           |
| PreToolUse `git commit`   | Commit-format reminder: `type(scope): description [TAM-N]`                                        |
| PreToolUse `git push`     | **Blocks** push on `main`; **blocks** push with uncommitted changes; warns if behind origin/main  |
| PreToolUse `gh pr create` | Reminds to run `/pre-pr` first                                                                    |
| PostToolUse Write/Edit    | Reminds to update related docs when CLAUDE.md / CONTRIBUTING.md / AGENTS.md / README.md change    |
| SessionStart              | Prints workflow banner, then runs `hooks/session-start-pattern-check.sh` (pattern-library status) |
| SessionEnd                | Warns if the session ends with uncommitted changes                                                |

The installer auto-updates `settings.json` on re-install when yours has no project-specific entries; otherwise it prints a notice — diff against the harness copy to pick up new hooks. Hook scripts: `session-start-pattern-check.sh` (pattern-library status) plus three figma fidelity gates — `figma-skill-gate.sh` (blocks Flutter UI edits on Figma-sourced tickets until the figma-flutter skill is loaded), `figma-skill-marker.sh` (records the load), `figma-fidelity-pr-gate.sh` (blocks `gh pr create` until the fidelity verdict is in the spec's Evidence).

## Quality Gates (`team-config.json`)

| Gate                  | Command                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| Full CI validation    | `pnpm verify` (arch boundaries + OpenAPI drift + typecheck/lint/unit tests) |
| API integration tests | `pnpm nx test api --configuration=integration` (testcontainers Postgres)    |
| Mobile                | `pnpm verify:mobile` (flutter analyze + flutter test)                       |
| Build                 | `pnpm nx run-many -t build --exclude=mobile`                                |
| Migrations            | `pnpm prisma migrate deploy --schema apps/api/prisma/schema.prisma`         |
| Markdown              | `pnpm exec prettier --check '**/*.md'`                                      |

## Pattern Library

`patterns_library/` (repo root) ships 3 repo-stack patterns — `api/module-shape.md`, `api/cross-module-call.md`, `ci/contract-codegen-chain.md` — **check these first** — plus generic upstream patterns that use double-brace placeholder tokens you fill in when instantiating one.

## Typical Workflow

```bash
/start-work 347        # reads specs/TAM-347-*.md, enforces AC/DoD, creates branch
# implement; commit as: feat(scope): description [TAM-347]
/check-workflow        # periodic status check
/update-docs           # documentation updates before PR
/pre-pr                # pnpm verify + integration/mobile gates as applicable
gh pr create --title "feat(scope): description [TAM-347]" --body "$(cat .github/pull_request_template.md)"
/end-work              # clean session end, spec status update
```

## Customization

- **New command**: add `commands/{name}.md` with frontmatter (`description`, optional `argument-hint`, `allowed-tools`).
- **New skill**: add `skills/{name}/SKILL.md` with `name` + `description` frontmatter.
- **New pattern**: add under `patterns_library/`.

The installer never deletes files you add. If a quality-gate command diverges from monorepo-boilerplate conventions, adjust `team-config.json`.

## More Documentation

- [SETUP.md](SETUP.md) — install and post-install checklist
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — common failure modes
- [AGENT_OUTPUT_GUIDE.md](AGENT_OUTPUT_GUIDE.md) — where agents write evidence
- `AGENTS.md` + `CONTRIBUTING.md` (repo root) — roles and git conventions
