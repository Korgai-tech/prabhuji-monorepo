# Commands

Workflow commands installed by krutyug-agent-harness. Invoke as `/command-name` in Claude Code.

## Core Workflow (in order)

| Command           | Purpose                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/start-work N`   | Start work on spec `specs/TAM-N-*.md`: verify AC/DoD (Stop-the-Line), branch off main, mark spec In Progress                  |
| `/check-workflow` | Health check: branch naming, spec status, commit format, rebase state                                                         |
| `/pre-pr`         | Full pre-PR validation: `pnpm verify`, mobile/integration gates when relevant, codegen freshness, docs, PR template readiness |
| `/end-work`       | Close a session: commit state, update spec status + evidence, push/PR decision                                                |

## Supporting

| Command                | Purpose                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| `/quick-fix N`         | Fast-track for small, isolated bug fixes (essential gates only)      |
| `/release`             | Version release: merge PRs, tag, GitHub release, cleanup             |
| `/retro`               | Retrospective of a work session                                      |
| `/update-docs`         | Check and update docs affected by current work                       |
| `/audit-deps`          | Dependency audit (`pnpm audit`, outdated, unused)                    |
| `/local-sync`          | Full local sync after `git pull`: install, migrations, verify        |
| `/local-deploy`        | Build + run the full stack locally (API image + floci-aws emulator)  |
| `/check-docker-status` | Health of local docker-compose services (Postgres, Redis, floci-aws) |

## Conventions

- Tickets are in-repo specs: `specs/TAM-N-{slug}.md` (see `specs/README.md`)
- Branch `TAM-N-{description}` off `main`; commits `type(scope): description [TAM-N]`
- Quality-gate commands live in `.claude/team-config.json`; the umbrella is `pnpm verify`

## Adding a Command

Create `.claude/commands/<name>.md` with a frontmatter `description` (+ optional `argument-hint`, `allowed-tools`). Add it here and re-install into projects.
