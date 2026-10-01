---
description: Quick status check of current workflow state
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

Perform a quick workflow health check against @CONTRIBUTING.md requirements.

## Status Checks

### 1. Git Status

```bash
git status
git branch --show-current
```

Verify:

- Current branch follows `TAM-{number}-{description}` format
- No uncommitted changes (or document what's uncommitted)
- Branch relationship to origin/main

### 2. Spec Connection

Extract the TAM number from the branch name.

Check ticket status by reading the in-repo spec:

```bash
cat specs/TAM-{number}-*.md
```

Verify:

- Spec file exists
- Spec Status is appropriate (In Progress while working)
- Work aligns with the spec's Acceptance Criteria
- List unresolved `#PLAN_UNCERTAINTY` / Blockers items — an unresolved blocker on
  the critical path is RED when claiming Ready for Review, YELLOW mid-flight

If the spec has Design References (figma.com frame) and mobile UI changed, also report
fidelity progress as part of the traffic light:

- Tokens/theme real (not placeholders)? Assets + icons exported?
- Phase 6 verdict recorded in the Evidence section yet?
- Not started → YELLOW while building, RED if claiming ready for PR

### 3. Commit History

Review commits since main:

```bash
git log origin/main..HEAD --oneline
```

Verify:

- All commits follow SAFe format: `type(scope): description [TAM-XXX]`
- All commits reference the correct spec ID
- Commit messages are descriptive

### 4. Rebase Status

Check if branch needs rebasing:

```bash
git fetch origin
git log HEAD..origin/main --oneline
```

Report:

- How many commits behind main
- Whether rebase is needed

### 5. Documentation Status

Check if docs need updating:

- CLAUDE.md (architecture/commands changed?)
- CONTRIBUTING.md (process changed?)
- Feature-specific docs created?

## Output Format

Provide traffic-light status:

- ✅ GREEN: All checks pass, workflow healthy
- ⚠️ YELLOW: Minor issues, can proceed with caution
- ❌ RED: Blockers present, must fix before PR

List specific issues found and recommendations.
