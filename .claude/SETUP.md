# Claude Code Harness Setup

How to install the harness into a project and verify it works.

## Prerequisites

- Claude Code CLI installed (`claude --version`)
- Target project is a git repository — normally cloned from `monorepo-boilerplate` (Nx + pnpm monorepo, Node 22: Fastify 5 + Prisma + Zod API, React 19 + Vite admin, Flutter mobile)
- Harness repo cloned at `~/krutyug/krutyug-agent-harness`

## Install / Update

```bash
cd /path/to/your-project
bash ~/krutyug/krutyug-agent-harness/install.sh
# per-project values (defaults: prefix TAM, project = directory name):
bash ~/krutyug/krutyug-agent-harness/install.sh --prefix ACM --project acme-api
```

The installer:

- copies `agents/`, `commands/`, `skills/`, `hooks/`, `team-config.json`, and these docs into `.claude/`
- copies `AGENTS.md`, `CONTRIBUTING.md`, the PR template, `specs_templates/`, `patterns_library/`, and a `specs/README.md`
- rewrites the `TAM` ticket prefix and project name in harness-owned files when you pass `--prefix` / `--project`
- creates `.claude/settings.json` (hooks + permissions) if missing; auto-updates it when yours has no project-specific entries, otherwise leaves it and prints a notice

**Re-running is safe**: harness-owned files are refreshed; `specs/`, `.claude/settings.local.json`, an existing `.claude/settings.json`, and any files you added (custom commands/skills/patterns) are never deleted. Files removed from the harness upstream are not auto-deleted — clean those up manually.

## Verify the Installation

```bash
ls .claude/commands/ | grep -cv README     # matches the commands/README.md roster
ls -d .claude/skills/*/ | wc -l            # matches the skills/README.md roster
ls .claude/agents/ | grep -cv README       # matches the skills/README.md roster
jq . .claude/settings.json > /dev/null && echo "settings.json valid"
```

Then start Claude Code in the project:

- The SessionStart hook prints the workflow banner and pattern-library status.
- Ask "What skills are available?" — expect the harness skills (roster: .claude/skills/README.md).
- On `main`, attempt `git push` — the hook must block it.

## First Ticket

```bash
# 1. Create a spec (BSA role owns AC/DoD quality)
cp specs_templates/spec_template.md specs/TAM-1-my-feature.md
# fill in user story, Acceptance Criteria, Definition of Done
# Stop-the-Line: no AC/DoD in the spec -> no implementation

# 2. Start work (verifies the spec, enforces AC/DoD, creates branch TAM-1-...)
/start-work 1

# 3. Implement, validate, ship
/pre-pr
gh pr create --body "$(cat .github/pull_request_template.md)"
/end-work
```

## Project-Specific Tuning

- Quality gates assume monorepo-boilerplate conventions (`pnpm verify`, `pnpm verify:mobile`, integration tests via testcontainers). If this project diverges, edit `.claude/team-config.json`.
- Machine-local overrides belong in `.claude/settings.local.json` (never touched by the installer).
- After a harness update, new hooks are **not** applied automatically if `.claude/settings.json` already existed — diff it against `~/krutyug/krutyug-agent-harness/.claude/settings.json` and merge manually.

## Directory Structure (after install)

```text
.claude/
├── agents/             # 11 SAFe role profiles (+ README)
├── commands/           # 13 slash commands (+ README)
├── skills/             # one folder per skill ({name}/SKILL.md)
├── hooks/              # 4 scripts: pattern-library check + 3 figma fidelity gates
├── settings.json       # live hooks + permissions (created if missing)
├── team-config.json    # roles, review stages, quality-gate commands
├── README.md, SETUP.md, TROUBLESHOOTING.md, AGENT_OUTPUT_GUIDE.md
specs/                  # in-repo tickets: TAM-N-{slug}.md
specs_templates/        # spec + planning templates
patterns_library/       # 3 repo-stack patterns + generic upstream patterns
AGENTS.md, CONTRIBUTING.md, .github/pull_request_template.md
```

## Next Steps

1. Read `AGENTS.md` — when to use which agent, exit states, gates
2. Read `CONTRIBUTING.md` — branch/commit/PR conventions
3. Read `.claude/README.md` — full harness inventory
4. Check `TROUBLESHOOTING.md` if anything misbehaves
