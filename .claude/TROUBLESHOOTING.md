# Claude Code Harness Troubleshooting

## Skills Not Triggering

1. **Description too vague** — the `description` in the skill's YAML frontmatter must state _when_ to use it. Compare with a working skill, e.g. `.claude/skills/api-patterns/SKILL.md`.
2. **Wrong location** — must be `.claude/skills/{name}/SKILL.md` (a folder per skill, not a flat `.md` file).
3. **Malformed frontmatter** — `name:` and `description:` between two `---` lines at the top of the file.

Verify: ask Claude "What skills are available?" (compare against the roster in `.claude/skills/README.md`) or `ls -d .claude/skills/*/`.

## Command Not Found

- Commands must be flat files: `.claude/commands/{name}.md` — the filename becomes the command (`start-work.md` → `/start-work`).
- Extension must be `.md`.
- Verify: `ls .claude/commands/` (roster in `.claude/commands/README.md`).

## Hooks Not Firing

- Live hooks are in `.claude/settings.json`.
- The installer auto-updates `settings.json` when yours has no project-specific entries; if it printed a NOTICE instead, diff against `~/krutyug/krutyug-agent-harness/.claude/settings.json` and merge the new hooks.
- Inspect: `jq '.hooks' .claude/settings.json`. Test a hook's shell command manually.
- Restart the Claude Code session after editing settings.

## Hook Blocks My Push

Expected blockers from `settings.json`:

- **On `main`** — create a feature branch: `git checkout -b TAM-{number}-{description}`.
- **Uncommitted changes** — commit everything first.
- **Behind origin/main** is a warning, not a block — `git rebase origin/main`.

## /start-work Refuses to Proceed (Stop-the-Line)

- **Spec missing** — create `specs/TAM-{number}-{slug}.md` from `specs_templates/spec_template.md` (next number = highest existing + 1).
- **No Acceptance Criteria / Definition of Done** — implementation must not begin. Add AC/DoD to the spec (BSA role), then re-run. This gate is intentional; do not bypass it.

## `pnpm verify` Fails

`pnpm verify` runs arch-boundary checks, OpenAPI drift detection, then typecheck/lint/unit tests.

- **Arch boundaries** — Prisma is only allowed in `repositories/`; cross-module calls must go through `performServiceCall` facades. See `patterns_library/api/module-shape.md` and `patterns_library/api/cross-module-call.md`.
- **OpenAPI drift** — regenerate and commit the contract chain (`pnpm openapi:emit` and generated clients). See `patterns_library/ci/contract-codegen-chain.md`.
- Otherwise it is a normal typecheck/lint/unit failure — read the failing target's output.

## Integration Tests Won't Start

`pnpm nx test api --configuration=integration` uses testcontainers (Postgres), so Docker must be running: check with `docker ps`.

## `pnpm verify:mobile` Fails

Requires the Flutter SDK on PATH (`flutter --version`). It runs `flutter analyze` + `flutter test`.

## Wrong Agent Selected / Agent Missing Tools

- Be specific when delegating ("Create a migration to add user_roles (Data Engineer)") and consult the matrix in `AGENTS.md`.
- Tool restrictions are intentional: TDM has Read + Bash only; QAS, RTE, and Security Engineer are read-only + Bash. Do not widen them to "fix" an agent.

## Health Check

```bash
ls .claude/commands/ | grep -cv README     # matches the commands/README.md roster
ls -d .claude/skills/*/ | wc -l            # matches the skills/README.md roster
ls .claude/agents/ | grep -cv README       # matches the skills/README.md roster
ls .claude/hooks/                          # session-start-pattern-check.sh
jq . .claude/settings.json > /dev/null && echo "settings.json valid"
```

## Still Stuck

1. Re-run the installer (safe — refreshes harness-owned files, deletes nothing of yours): `bash ~/krutyug/krutyug-agent-harness/install.sh`
2. Check `.claude/README.md` (inventory), `AGENTS.md` (roles), `CONTRIBUTING.md` (workflow).
