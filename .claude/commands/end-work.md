---
description: Complete work session with final checklist
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

You are completing a work session. Execute final checklist before context switch or session end.

## Completion Checklist

### 1. Work Status

Verify current state:

```bash
git status
git log origin/main..HEAD --oneline
```

Status options:

- **Work Complete**: Ready for PR
- **Work In Progress**: Safe stopping point, commit and document
- **Blocked**: Document blockers

### 2. Commit All Work

If uncommitted changes:

```bash
git add .
git commit -m "type(scope): description [TAM-XXX]"
```

Verify all work committed:

```bash
git status  # Should show clean working tree
```

### 3. Documentation Status

Quick check:

- [ ] Inline comments for complex logic?
- [ ] README updated if new feature?
- [ ] CLAUDE.md/CONTRIBUTING.md updated if workflow changed?
- [ ] Spec status current (`specs/TAM-XXX-*.md`)?

### 4. Update Spec Status

The ticket is the spec file `specs/TAM-XXX-*.md` — update it directly:

**If Complete**:

- Set the spec's Status to "Ready for Review" (or "Done" once merged)
- Add a Progress note summarizing work done
- Reference the PR/branch in the spec
- Figma-sourced UI: confirm the Phase 6 fidelity verdict is in the Evidence
  section — "Complete" is not available without it (run the loop or stay In Progress)

**If In Progress**:

- Add progress notes to the spec
- Document any blockers or questions
- Set Status appropriately

**If Blocked**:

- Document the blocker clearly in the spec's Blockers section
- Note what input is needed to unblock

### 5. Context Preservation

If stopping mid-work, document:

- What was completed
- What's next
- Any decisions made
- Any blockers encountered
- Questions to discuss

Create context document if needed:

```markdown
## Session Context - [Date]

### Completed

- Item 1
- Item 2

### Next Steps

1. Task 1
2. Task 2

### Decisions

- Decision 1: Rationale

### Blockers

- Blocker 1: Details

### Questions

- Question 1
```

### 6. Branch Status

Decide next action:

**If Ready for PR**:

- Push branch: `git push origin {branch-name}`
- Create PR (or remind to create)
- Reference `/pre-pr` command

**If In Progress**:

- Push work: `git push origin {branch-name}` (if exists)
- Or: Keep local until next session

**If Experimental**:

- Consider creating WIP PR for visibility
- Or: Keep local and document intent

## Output Format

Provide summary:

- ✅ Work status (complete/in-progress/blocked)
- ✅ All changes committed
- ✅ Documentation current
- ✅ Spec updated
- ✅ Context preserved (if needed)
- ✅ Ready for next session

Include any action items for user:

- PR creation needed?
- Blockers to resolve?
- Questions to answer?
- Follow-up tasks?

## Success Criteria

Session ends cleanly:

- No uncommitted work (if complete)
- or: Safe stopping point documented (if in-progress)
- Spec reflects current status
- Next session can pick up smoothly

This ensures continuity and prevents context loss.
