# SAFe Agent Team Quick Reference

> **Tamasha adaptation**: Tickets live in-repo as spec files (`specs/TAM-N-*.md`) — no external tracker. Stack: Fastify+Prisma+Zod monolith, React+Vite admin, Flutter mobile, Vitest (see per-app CLAUDE.md). Quality gates: `.claude/team-config.json`.

> **Philosophy**: "Search First, Reuse Always, Create Only When Necessary"
>
> Pattern discovery is MANDATORY before implementation.
>
> **Team Culture**: "We work as a round table team that has 4 pillars of SAFe inscribed on that round table. It means something."

## Documentation

**Workflow references:**

- `.claude/agents/README.md` - Role roster, exit states, gate chain, collapsibility
- `.claude/team-config.json` - Team structure, review stages, quality-gate commands
- `CONTRIBUTING.md` - Git workflow, branch/commit conventions, validation gates
- `.github/workflows/ci.yml` - CI jobs (verify / api-integration / mobile)

**Database SOPs:**

- `apps/api/prisma/schema.prisma` + `apps/api/CLAUDE.md` - MANDATORY for Data Engineer

## When to Use Which Agent

| Agent Role                           | Use Case                                                                                             | Success Criteria                                            | Primary Tools                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------- |
| **TDM** (Technical Delivery Manager) | Reactive blocker resolution, spec updates, evidence tracking (NOT orchestration - see v1.3 SOP)      | Blockers resolved, evidence attached, spec updated          | Specs, Markdown                     |
| **BSA** (Business Systems Analyst)   | Requirements decomposition, acceptance criteria, testing strategy                                    | Clear user stories, testable ACs, QA plan defined           | Specs, Markdown                     |
| **System Architect**                 | Pattern validation, Stage 1 PR review, migration approval, architectural decisions                   | ADR created, PR technical review complete, no conflicts     | Read, Grep, ADR templates           |
| **FE Developer**                     | UI components, client-side logic, user interactions                                                  | Lint and build passes                                       | Read, Write, Edit, Bash             |
| **BE Developer**                     | API routes, server logic, layered-architecture enforcement                                           | Integration tests pass                                      | Read, Write, Edit, Bash             |
| **DE** (Data Engineer)               | Schema changes, migrations, database architecture                                                    | Migration applied, layering maintained                      | Prisma, SQL, migration tools        |
| **TW** (Technical Writer)            | Documentation, guides, technical content                                                             | Markdown lint passes                                        | Read, Write, Edit, Grep, Glob, Bash |
| **QAS** (Quality Assurance)          | **GATE OWNER**: Execute testing, validate ACs, iteration authority, evidence to the spec             | All ACs verified, evidence posted, Exit: "Approved for RTE" | Vitest, Flutter tests, Specs        |
| **SecEng** (Security Engineer)       | Security validation, auth/JWT checks, vulnerability assessment (Independence Gate - not collapsible) | Security audit passed, arch gate green                      | Security tools, arch gate           |
| **RTE** (Release Train Engineer)     | **PR SHEPHERD**: PR creation, CI/CD monitoring (NO code, NO merge) - Exit: "Ready for HITL"          | PR created, CI green, Exit: "Ready for HITL Review"         | Git, GitHub CLI, CI tools           |

## Auto-Loaded Skills

Skills are loaded progressively—metadata at startup, full content when context triggers.

| Skill                    | Trigger                | Purpose                                   |
| ------------------------ | ---------------------- | ----------------------------------------- |
| `safe-workflow`          | Commits, branches, PRs | SAFe format, rebase-first workflow        |
| `pattern-discovery`      | Before writing code    | Pattern-first development (MANDATORY)     |
| `migration-patterns`     | Database operations    | Prisma migration SOP (repository layer)   |
| `frontend-patterns`      | UI work                | React+Vite admin, Flutter mobile patterns |
| `api-patterns`           | API route creation     | Route structure, error handling           |
| `testing-patterns`       | Writing tests          | Vitest + Flutter test patterns            |
| `orchestration-patterns` | Multi-step work        | Agent loop, evidence-based delivery       |
| `team-coordination`      | Agent Teams spawn      | Multi-agent orchestration (experimental)  |

## Success Validation Commands

### Frontend Development

```bash
pnpm nx run-many -t typecheck,lint,build --projects=admin,api-client && echo "FE SUCCESS" || echo "FE FAILED"
pnpm verify:mobile   # Flutter work: flutter analyze + flutter test
```

### Backend Development

```bash
pnpm nx test api --configuration=integration && echo "BE SUCCESS" || echo "BE FAILED"
```

### Documentation

```bash
pnpm exec prettier --check '**/*.md' && echo "DOCS SUCCESS" || echo "DOCS FAILED"
```

### Pre-Push Validation

```bash
pnpm verify && echo "CI SUCCESS" || echo "CI FAILED"
```

### Database Migration

```bash
pnpm prisma migrate dev --name migration_name --schema apps/api/prisma/schema.prisma && echo "MIGRATION SUCCESS" || echo "MIGRATION FAILED"
```

## SAFe Specs-Driven Workflow

### Planning Phase (BSA)

```bash
# Large initiative → Use planning template
cp specs_templates/planning_template.md specs/{feature}-planning.md
# Fill with Epic → Features → Stories → Enablers

# User story → Use spec template
cp specs_templates/spec_template.md specs/TAM-XXX-{feature}-spec.md
# Fill with implementation details
```

### Execution Phase (All Agents)

```bash
# 1. Read spec for clear goal
cat specs/TAM-XXX-{feature}-spec.md

# 2. Extract:
# - User story (goal)
# - Acceptance criteria (success)
# - Low-level tasks (steps)
# - Demo script (validation)

# 3. Implement using Simon's loop:
# - Clear goal from spec
# - Pattern discovery (codebase + specs)
# - Iterate until demo script passes
# - Escalate if blocked
```

## Pattern Discovery Protocol (MANDATORY)

### 0. Search Specs Directory (FIRST)

```bash
# Find similar implementations in specs
ls specs/*-spec.md | grep "similar_feature"

# Review SAFe user stories
grep -r "As a.*I want to" specs/

# Check patterns from past specs
cat specs/XXX-similar-spec.md
```

### 1. Search Pattern Library, Then Codebase

```bash
# Patterns FIRST
cat patterns_library/README.md && ls patterns_library/*/

# Then similar functionality in the apps
grep -r "feature_name" apps/api/src/ apps/admin/src/ apps/mobile/lib/

# Existing route/module conventions
ls apps/api/src/modules/ && grep -rn "performServiceCall" apps/api/src/
```

### 2. Search Session History

```bash
# Search agent session todos
grep -r "similar_feature|pattern" ~/.claude/todos/ 2>/dev/null

# Find recent implementation patterns
ls -lt ~/.claude/todos/ | head -20
```

### 3. Consult Documentation

- `CONTRIBUTING.md` - Workflow and git process
- `apps/api/prisma/schema.prisma` - Database schema (SINGLE SOURCE OF TRUTH)
- `apps/api/CLAUDE.md` - Module conventions + layered architecture (MANDATORY for DB ops)
- `arch-boundaries.json` - Machine-enforced layering rules

### 4. Architectural Validation

- Propose pattern to System Architect
- Get approval before implementation
- Document decision in session notes

## Agent Workflow

### Standard Agent Loop (Per Simon Willison)

1. **Clear Goal** - BSA defines with acceptance criteria
2. **Pattern Discovery** - Search codebase and sessions
3. **Iterative Problem Solving**:
   - Implement approach
   - Run validation command
   - If fails → analyze error, adjust, repeat
   - If blocked → escalate to TDM with context
4. **Evidence Attachment** - Session ID + validation results in the spec

### No Over-Engineering

- ❌ No file locks
- ❌ No circuit breakers
- ❌ No arbitrary retry limits
- ✅ Let agents iterate until success or blocked
- ✅ Agent decides when to escalate

## Session Archaeology

### Monitor Concurrent Sessions

```bash
# See active sessions
ls -lt ~/.claude/todos/*.json | head -10

# Check for concurrent work on same files
grep -l "file_path" ~/.claude/todos/*.json
```

### Cross-Agent Coordination

```bash
# Find related work by another agent
grep -rn "TAM-" specs/

# Discover implementation patterns
grep -rn "performServiceCall" apps/api/src/
```

## Exit States (vNext Contract)

Each agent has explicit exit states that define handoff points:

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
│ HITL Merge      │ Aashish Agrawal            │ YES - final authority   │
└─────────────────┴─────────────────┴─────────────────────────┘
```

### Role Collapsing

- **RTE**: Collapsible (PR creation, CI shepherding can be done by implementer)
- **QAS**: NOT collapsible (independence gate - spawn subagent for verification)
- **SecEng**: NOT collapsible (security audit requires independence)

See `.claude/agents/README.md` and `.claude/team-config.json` for details.

### Agent Teams (Experimental)

Agent Teams enable real-time multi-agent orchestration using Claude Code's experimental Agent Teams feature. When enabled, agents are spawned as teammates with shared task lists and SAFe quality gates enforced via task dependencies.

- **Enable**: Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `.claude/settings.json`
- **Skill**: `/team-coordination` — patterns for TeamCreate, SendMessage, shared TaskList
- **Config**: `agent_teams` block in `.claude/team-config.json` (gate dependencies, recommended team sizes)

---

## Quick Reference

### Key Documentation

- `CONTRIBUTING.md` - Complete workflow guide (MANDATORY READ)
- `apps/api/prisma/schema.prisma` - Database schema (SINGLE SOURCE OF TRUTH)
- `apps/api/prisma/migrations/` - Schema changes via Prisma migrations (ARCHitect approval required)
- `apps/api/CLAUDE.md` + `arch-boundaries.json` - Architecture conventions + enforced layering

### Agent Files

- `.claude/agents/bsa.md` - Business Systems Analyst
- `.claude/agents/system-architect.md` - System Architect
- `.claude/agents/tdm.md` - Technical Delivery Manager
- `.claude/agents/fe-developer.md` - Frontend Developer
- `.claude/agents/be-developer.md` - Backend Developer
- `.claude/agents/data-engineer.md` - Data Engineer
- `.claude/agents/tech-writer.md` - Technical Writer
- `.claude/agents/qas.md` - Quality Assurance Specialist
- `.claude/agents/security-engineer.md` - Security Engineer
- `.claude/agents/rte.md` - Release Train Engineer

## Human-in-the-Loop (HITL) Model

**Product Owner / Product Manager**: Aashish Agrawal

- All work requires evidence in the spec before POPM review
- Swimlane workflow: Backlog → Ready → In Progress → Testing → Ready for Review → Done
- POPM has final approval on all deliverables

---

## 🎯 Agent Invocation Examples

### Simple Invocation (Direct Mention)

Use `@agent-name` for simple, single-step tasks:

```bash
# Planning
@bsa Create a spec for user profile API endpoint
@system-architect Review the repository layer for the user-profiles module

# Implementation
@be-developer Implement the GET /api/user/profile endpoint
@fe-developer Create a UserProfile component with form validation
@data-engineer Add email_verified column to users table

# Quality & Documentation
@qas Write integration tests for user profile feature
@security-engineer Audit auth middleware + input validation for the user-profiles module
@tech-writer Document the user profile API in README

# Coordination
@tdm Coordinate implementation of TAM-123 user profile feature
@rte Create PR for TAM-123 and run CI validation
```

### Task Tool Invocation (Complex Tasks)

Use `Task()` for complex, multi-step tasks with detailed instructions:

```typescript
// BSA: Create comprehensive spec
Task({
  subagent_type: "bsa",
  description: "Create spec for TAM-123",
  prompt: `Create comprehensive spec for TAM-123 user profile feature.

Requirements:
- User can view and edit their profile
- Profile includes: name, email, bio, avatar
- Email verification required
- Admin can view all profiles

Please:
1. Search for existing user/profile patterns in patterns_library/
2. Create user story with acceptance criteria
3. Define testing strategy (unit, integration, E2E)
4. Add #EXPORT_CRITICAL tags for security requirements
5. Reference relevant patterns from pattern library`,
});

// Backend Developer: Implement with pattern discovery
Task({
  subagent_type: "be-developer",
  description: "Implement TAM-123 API",
  prompt: `Read spec at specs/TAM-123-user-profile-spec.md

Implement the user profile API endpoints:
1. GET /api/user/profile - Get current user's profile
2. PUT /api/user/profile - Update current user's profile
3. GET /api/admin/users/:id/profile - Admin view any profile

Requirements:
- Use withUserContext for user endpoints
- Use withAdminContext for admin endpoints
- Follow database patterns from patterns_library/database/ (transactions live in repositories/)
- Validate input with Zod schemas
- Write unit tests for each endpoint

Pattern discovery is MANDATORY before implementation.`,
});

// QAS: Execute comprehensive testing
Task({
  subagent_type: "qas",
  description: "Test TAM-123 feature",
  prompt: `Read spec at specs/TAM-123-user-profile-spec.md

Execute the testing strategy defined by BSA:

1. Unit Tests:
   - Test Zod validation schemas
   - Test repository methods (mocked unit + testcontainers integration)
   - Test error handling

2. Integration Tests:
   - Test GET /api/user/profile with user context
   - Test PUT /api/user/profile with valid/invalid data
   - Test admin endpoints with admin context
   - Test authorization (user A cannot access user B's data)

3. E2E Tests:
   - User can view their profile
   - User can edit their profile
   - Admin can view any profile
   - Unauthorized access is blocked

Validate all acceptance criteria from the spec.`,
});

// TDM: Reactive blocker resolution (NOT orchestration)
Task({
  subagent_type: "tdm",
  description: "Resolve blocker for TAM-123",
  prompt: `A blocker has been reported for TAM-123.

TDM Responsibilities (per v1.3 SOP):
1. Monitor progress - read session archaeology, specs, PR comments
2. Identify blocker details - search for "FAILED|error|blocked"
3. Escalate to appropriate specialist to resolve
4. Track evidence - attach session IDs, test results to the spec
5. Update the spec with resolution

NOTE: TDM is REACTIVE, not an orchestrator.
ARCHitect-in-CLI is the primary orchestrator.`,
});
```

### When to Use Which Invocation Method

| Scenario                  | Method         | Example                                             |
| ------------------------- | -------------- | --------------------------------------------------- |
| **Simple question**       | Direct mention | `@bsa What patterns exist for user authentication?` |
| **Single-step task**      | Direct mention | `@be-developer Add logging to the login endpoint`   |
| **Multi-step task**       | Task tool      | BSA creating spec with pattern discovery            |
| **Complex coordination**  | Task tool      | Multiple agents working on related features         |
| **Detailed requirements** | Task tool      | QAS executing comprehensive test strategy           |
| **Blocker resolution**    | Task tool      | TDM investigating and escalating blockers           |

### Pro Tips

1. **Always reference specs**: `Read spec at specs/TAM-XXX-spec.md`
2. **Mandate pattern discovery**: `Pattern discovery is MANDATORY before implementation`
3. **Check #EXPORT_CRITICAL tags**: `Review #EXPORT_CRITICAL tags in spec first`
4. **Validate with commands**: Use success validation commands from agent prompts
5. **Update the spec**: TDM records status/evidence directly in `specs/TAM-N-*.md`
6. **TDM is reactive**: Don't use TDM for orchestration—use ARCHitect-in-CLI

---

**Quick Start**: Read CONTRIBUTING.md, search codebase, propose to System Architect, validate with test command, attach evidence to the spec.
