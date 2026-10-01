# TAM Agents

11 SAFe role profiles for the monorepo-boilerplate multi-agent harness (installed from `krutyug-agent-harness`). Each file's YAML frontmatter defines `name`, `description`, `tools`, and `model`.

## Roster

| Agent                      | File                       | Description                                                                             |
| -------------------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| BSA                        | `bsa.md`                   | Business Systems Analyst — pattern discovery, spec creation, AC definition              |
| System Architect           | `system-architect.md`      | Pattern validation, architectural decisions, conflict prevention                        |
| BE Developer               | `be-developer.md`          | Fastify module implementation using patterns, layered-architecture enforcement          |
| FE Developer               | `fe-developer.md`          | UI implementation using patterns                                                        |
| Data Engineer              | `data-engineer.md`         | Database schema changes and migrations                                                  |
| QAS                        | `qas.md`                   | Quality Assurance Specialist — testing execution using test patterns                    |
| Security Engineer          | `security-engineer.md`     | Security audits, auth/JWT validation, vulnerability scanning                            |
| RTE                        | `rte.md`                   | Release Train Engineer — PR creation, CI/CD validation, release coordination            |
| TDM                        | `tdm.md`                   | Technical Delivery Manager — orchestrates agents, manages blockers, keeps specs current |
| Tech Writer                | `tech-writer.md`           | Documentation creation using documentation patterns                                     |

## Exit States

| Role                       | Exit state            |
| -------------------------- | --------------------- |
| BE / FE / Data Engineer    | Ready for QAS         |
| QAS (gate owner)           | Approved for RTE      |
| RTE                        | Ready for HITL Review |
| System Architect (Stage 1) | Stage 1 Approved      |

## Gates and Collapsibility

Gate chain: Stop-the-Line (implementer) → QAS gate → Stage 1 review (System Architect) → Stage 2 review (ARCHitect-in-CLI) → HITL merge (human).

- **QAS** and **Security Engineer** are independence gates — never silently collapsed into the implementing session.
- **RTE** is a coordination role and may be collapsed (label the hat: "Operating as RTE (collapsed)").
- HITL merge authority always stays with a human.

Full usage matrix, validation commands, and gate ownership: `/AGENTS.md` and `.claude/team-config.json`.

## License

MIT (see `/LICENSE`). Adapted from `bybren-llc/safe-agentic-workflow` v2.10.0, portions © ByBren, LLC.
