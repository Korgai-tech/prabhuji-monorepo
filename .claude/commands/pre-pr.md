---
description: Run complete validation workflow before creating PR
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

You are preparing to create a Pull Request. Execute the MANDATORY @CONTRIBUTING.md validation workflow:

## Validation Checklist

### 1. Code Quality Validation (all Node projects)

```bash
pnpm verify
```

This runs, in order:

- Architecture boundaries (`pnpm check:arch-boundaries`)
- OpenAPI contract drift (`pnpm check:openapi`)
- Typecheck + lint + unit tests for `api`, `admin`, `api-client`

**BLOCKER**: Must pass before proceeding. Fix any failures.

### 2. Mobile Validation (only if `apps/mobile` was touched)

```bash
pnpm verify:mobile   # flutter analyze + flutter test (needs Flutter SDK)
```

**Design fidelity (if the spec references a figma.com URL and `apps/mobile/lib` changed)**: the figma-flutter skill's Phase 6 rendered-comparison verdict (side-by-side vs the Figma frame) must be recorded in the spec's Evidence section, referencing committed artifacts under `specs/evidence/TAM-XXX/fidelity/` (sweep-table.md + PNGs). A hook blocks `gh pr create` until the verdict is present AND the referenced artifact files exist.

**BLOCKER**: Missing fidelity evidence on Figma-sourced UI work.

### 3. Integration Tests (if `apps/api` behavior changed)

```bash
pnpm nx test api --configuration=integration   # real Postgres via testcontainers (needs Docker)
```

### 4. Codegen Freshness (if API routes/schemas changed)

Regenerate downstream artifacts IN ORDER and commit them with the change:

```bash
pnpm nx run api:openapi          # re-emit apps/api/openapi.json
pnpm nx run api-client:generate  # TS types for admin
pnpm nx run mobile:generate      # Dart models (needs JDK 17)
```

### 5. Git Status Check

```bash
git status
```

**BLOCKER**: No uncommitted changes allowed in PR.

### 6. Rebase onto Latest Main

```bash
git fetch origin
git rebase origin/main
```

**BLOCKER**: Must be up-to-date with main. (Skip if no remote is configured yet.)

### 7. Commit Message Validation

```bash
git log origin/main..HEAD --oneline
```

**Required format**: `type(scope): description [TAM-XXX]`

**BLOCKER**: All commits must reference the spec ID (a `specs/TAM-XXX-*.md` file).

### 8. Documentation Updates

Verify related docs updated:

- [ ] Spec status current (`specs/TAM-XXX-*.md`)
- [ ] CLAUDE.md (if architecture/workflow changed)
- [ ] CONTRIBUTING.md (if process changed)
- [ ] docs/PHASE-NOTES.md (if work was consciously deferred)

### 9. PR Template Ready

Confirm you can fill out ALL sections of `.github/pull_request_template.md`.

If the spec spans the API contract boundary (api + regenerated clients + consumer
UI), confirm this PR is ONE side of the codegen seam (see safe-workflow "PR size"),
not both.

## Workflow

Execute steps 1-8 in order.

Report results for each step:

- ✅ PASS: Step completed successfully
- ⚠️ WARNING: Non-blocking issue found
- ❌ BLOCKER: Must fix before PR

## Success Criteria

All validation steps pass. Ready to create PR with:

```bash
git push --force-with-lease origin {branch-name}
gh pr create --title "..." --body "..."
```

Report final status and any remaining blockers.
