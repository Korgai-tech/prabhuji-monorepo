# TAM Skills

Skills for the monorepo-boilerplate multi-agent harness (installed from `krutyug-agent-harness`). Each lives in `.claude/skills/{name}/SKILL.md`; Claude loads the metadata at startup and the full content when the `description` matches the working context.

## Roster

| Skill                    | Purpose                                                                           |
| ------------------------ | --------------------------------------------------------------------------------- |
| `api-patterns`           | API routes with Zod validation and error handling in the Fastify modular monolith |
| `frontend-patterns`      | React 19 + Vite admin SPA (TanStack Query) and Flutter mobile UI patterns         |
| `figma-flutter`          | Figma→Flutter design-fidelity workflow (MCP variables/geometry/assets → theme tokens → rendered-comparison loop) |
| `flutter-clarity`        | Microsoft Clarity session-replay integration for Flutter (ClarityService seam, per-flavour navigator observer, tags/events/screen naming) |
| `migration-patterns`     | Database migration creation and Prisma schema changes with architect approval     |
| `orchestration-patterns` | Agentic orchestration for long-running multi-step work; evidence-based delivery   |
| `pattern-discovery`      | Pattern-library discovery — use BEFORE implementing any new feature               |
| `safe-workflow`          | Branch naming, commit format, rebase-first workflow, CI validation                |
| `security-audit`         | Security audits, OWASP compliance, and vulnerability scanning                     |
| `spec-creation`          | Specs with pattern references, acceptance criteria, and demo scripts              |
| `team-coordination`      | Agent Teams orchestration patterns for multi-agent SAFe workflows                 |
| `testing-patterns`       | Vitest (unit + testcontainers integration) and Flutter test patterns              |
| `visual-verify`          | QAS gate — vision-LLM verification of layout intent (FIXED / FLEX / ASPECT / RESPONSIVE / PINNED) at 3+ viewports per screen; catches "hero card stretched at 1200dp" / "app-bar shrank on foldable" bugs the geometric gates cannot see |

## Structure

Each skill folder contains:

- `SKILL.md` — the skill itself; frontmatter: `name`, `description`, `allowed-tools`, plus optional `user-invocable`, `disable-model-invocation`, `argument-hint`
- `README.md` — quick reference (optional)

## Creating New Skills

Add `.claude/skills/{name}/SKILL.md` with a `description` that states _when_ to trigger. Project-specific skills are safe to add — the harness installer never deletes files you add. Promote generally useful skills to the `krutyug-agent-harness` repo so every project gets them.

## License

MIT (see `/LICENSE`). Adapted from `bybren-llc/safe-agentic-workflow` v2.10.0, portions © ByBren, LLC.
