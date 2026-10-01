---
description: Fast-track workflow for small bug fixes
argument-hint: [TAM-number]
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

> **📋 TEMPLATE**: This command is a template. See "Customization Guide" below to adapt for your infrastructure.

Execute streamlined workflow for small, urgent bug fixes that need fast turnaround.

## When to Use

Quick fixes are appropriate for:

- ✅ Critical bugs blocking team
- ✅ Small, isolated changes (< 50 lines)
- ✅ No architecture changes
- ✅ Existing test coverage adequate

**NOT for**:

- ❌ New features
- ❌ Large refactors
- ❌ Breaking changes
- ❌ Dependency upgrades

## Streamlined Workflow

### 1. Setup (Fast)

If TAM number provided ($1):

- Read the spec: `cat specs/TAM-$1-*.md`
- Verify it's a bug fix
- Create branch: `git checkout -b TAM-$1-fix-{description}`

If no argument:

- Ask for the TAM number
- Proceed with setup

### 2. Make Fix

Guide user:

- Identify the bug location
- Make minimal, focused change
- Test locally
- Commit with clear description

```bash
git add .
git commit -m "fix(scope): resolve {issue} [TAM-XXX]"
```

### 3. Fast Validation

Run essential checks only:

```bash
pnpm nx run-many -t typecheck  # TypeScript
pnpm nx run-many -t lint --exclude=mobile        # ESLint
pnpm nx run-many -t test --exclude=mobile   # Fast tests only
```

**Skip** if time-critical:

- Integration tests
- E2E tests
- Build verification

### 4. Quick PR

```bash
git fetch origin && git rebase origin/main
git push --force-with-lease origin {branch}
```

Create PR with minimal template:

```markdown
## 🐛 Quick Fix

**Spec**: `specs/TAM-XXX-*.md`
**Type**: Bug fix
**Urgency**: High

### Issue

Brief description of bug

### Fix

What was changed (1-2 sentences)

### Testing

- [ ] Manually tested
- [ ] Unit tests pass
- [ ] No regressions expected

### Merge Fast?

- [ ] Yes, this is blocking team
- [ ] No, normal review process
```

### 5. Notify Team

If urgent:

- Tag reviewers in PR
- Note it in the spec file
- Notify in Slack (if configured)

## Success Criteria

- ✅ Fix applied in < 30 minutes
- ✅ Essential validations pass
- ✅ PR created with clear context
- ✅ Team notified if urgent

## Safety Checks

Even in quick fixes:

- ✅ Commit message follows SAFe format
- ✅ Branch naming correct
- ✅ Spec referenced in commit message
- ✅ TypeScript & ESLint pass

**Skip only** when justified:

- Full test suite (run essential tests)
- Full PR template (use quick version)
- Extensive documentation (update if needed, defer if urgent)

## After Merge

Follow up:

- [ ] Run full test suite
- [ ] Update documentation (if skipped)
- [ ] Verify fix in production
- [ ] Set spec Status to Done

This workflow balances speed with safety for urgent fixes.
