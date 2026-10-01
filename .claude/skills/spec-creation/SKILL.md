---
name: spec-creation
description: Spec creation with pattern references, acceptance criteria, demo scripts, and Figma design references. Use when creating implementation specs, defining acceptance criteria, breaking down user stories, or attaching Figma node IDs to UI specs.
context: fork
argument-hint: "[ticket-id]"
allowed-tools: Read, Write, Grep, Glob
---

# Spec Creation Skill

## Purpose

Guide spec creation with clear acceptance criteria, pattern references for execution agents, and testable success validation commands.

## When This Skill Applies

Invoke this skill when:

- Creating implementation specs
- Breaking down user stories
- Defining acceptance criteria
- Adding pattern references for execution
- Creating demo scripts for validation
- Translating business requirements to technical specs
- Attaching Figma design references (file key + node IDs) to UI specs

## Stop-the-Line Conditions

### FORBIDDEN Patterns

```markdown
# FORBIDDEN: Missing acceptance criteria

## Implementation

Just do the thing.

<!-- No testable outcomes defined -->

# FORBIDDEN: No pattern reference

## Technical Approach

Build it however you want.

<!-- Execution agents need pattern pointers -->

# FORBIDDEN: No success validation

## Done Criteria

Looks good to reviewer.

<!-- No command to verify completion -->

# FORBIDDEN: Untraceable design reference

## Design

See Figma.

<!-- No file key, no node IDs — execution agents cannot extract variables, geometry, or assets -->
```

### CORRECT Patterns

````markdown
# CORRECT: Clear acceptance criteria

## Acceptance Criteria

- [ ] User can click button → modal appears
- [ ] Modal shows validation errors for empty fields
- [ ] Successful submission shows success toast

# CORRECT: Pattern reference for execution

## Pattern Reference

- **UI Pattern**: `patterns_library/ui/form-with-validation.md`
- **API Pattern**: `patterns_library/api/module-shape.md`
- **Security Pattern**: `patterns_library/security/input-sanitization.md`

# CORRECT: Figma reference with node IDs

## Design References (Figma)

- **Figma file**: `ipSvV1FnmzvV8TK2Ig8Aiq`
- **Main frame**: Home — node `285:3464` — https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=285-3464

| Area             | Node ID    | Notes                          |
| ---------------- | ---------- | ------------------------------ |
| Header container | `285:3482` | Logo, help icon, avatar        |
| Search bar       | `285:3499` | Do NOT implement — Phase 2     |

# CORRECT: Success validation command

## Success Validation

```bash
# Run these commands to verify implementation
pnpm exec vitest run -t "ModalForm"
curl -X POST http://localhost:3000/auth/register -H 'content-type: application/json' -d '{"email":"a@b.com","name":"A","password":"password1"}'
```
````

`````

## Spec Template (MANDATORY)

Every spec must include:

````markdown
# Spec: {Feature Name} (TAM-{number})

## Summary

{One paragraph describing the feature}

## User Story

As a [user type], I want [goal] so that [benefit].

## Design References (Figma)

<!-- Required when the spec has a UI surface designed in Figma; omit otherwise -->

- **Figma file**: `{fileKey}`
- **Main frame**: {frame name} — node `{node:id}` — {URL with ?node-id=}

| Area        | Node ID     | Notes                             |
| ----------- | ----------- | --------------------------------- |
| {UI area}   | `{node:id}` | {behavior / constraint}           |
| {excluded}  | `{node:id}` | Do NOT implement — {reason/phase} |

## Acceptance Criteria

- [ ] {Testable criterion 1}
- [ ] {Testable criterion 2}
- [ ] {Testable criterion 3}

## Pattern References

- **UI**: `patterns_library/ui/{pattern}.md`
- **API**: `patterns_library/api/{pattern}.md`
- **Database**: `patterns_library/database/{pattern}.md`
- **Security**: `patterns_library/security/{pattern}.md`

## Success Validation Command

```bash
# Run this to verify the feature works
{validation command}
`````

## Demo Script

1. Navigate to {page}
2. Click {button}
3. Observe {expected behavior}
4. Verify {success indicator}

## Logical Commits

1. `feat(scope): implement data model [TAM-{number}]`
2. `feat(scope): add API endpoint [TAM-{number}]`
3. `feat(scope): create UI component [TAM-{number}]`
4. `test(scope): add unit tests [TAM-{number}]`

````

## Acceptance Criteria Patterns

### User Action Criteria

```markdown
- [ ] User can {action} → {result}
- [ ] When user {triggers}, system {responds}
- [ ] User receives {feedback} after {action}
```

### Data Criteria

```markdown
- [ ] Data persists after {action}
- [ ] User can only see their own {data type}
- [ ] {field} validates {constraint}
```

### Error Criteria

```markdown
- [ ] Invalid input shows {error message}
- [ ] Network failure shows retry option
- [ ] Unauthorized access returns 401
```

## Figma Node ID Support

UI specs must pin their design source to Figma node IDs so execution agents can extract variables, geometry, and assets instead of eyeballing screenshots.

### Getting node IDs

- **From a Figma URL**: "Copy link to selection" yields `figma.com/design/{fileKey}/{Name}?node-id=285-3464`. The URL uses a dash; the **canonical node ID uses a colon**: `285-3464` → `285:3464`. Record canonical IDs in the table; keep at least one full URL per frame.
- **From a design package**: design handoff packages (e.g. `spec_library/`) ship a `figma-links.md` with a node table — copy it into the spec's Design References section, don't just link it.
- **From the Figma MCP**: `get_metadata` on the parent frame returns the node tree with IDs for each child area.

### Coverage rules

- Every UI area the spec asks an agent to build gets its own node ID row (header, sections, card variants, nav — not just the screen root).
- Elements visible in the Figma frame but OUT of scope get an explicit `Do NOT implement` row (e.g. a search bar deferred to Phase 2) — otherwise agents faithfully build them.
- Design states not drawn in Figma (e.g. a Pro-badge variant) are called out as notes so nobody hunts for a nonexistent node.

### Downstream consumers

- The `figma-flutter` skill's phases (`get_variable_defs`, `get_metadata`, `download_assets`, `get_screenshot`) take these node IDs directly.
- Figma-sourced UI specs must carry the fidelity hooks from `specs_templates/spec_template.md`: the rendered-comparison acceptance criterion, the token/asset/Phase-6 frontend tasks, and the Design-fidelity line in Definition of Done + Evidence.

## Pattern Discovery for Specs

Before writing any spec:

```bash
# Find existing patterns
ls patterns_library/

# Search for similar implementations
grep -r "similar feature" apps/

# Check existing specs for format
ls specs/
cat specs/TAM-XXX-example.md
```

## Spec Quality Checklist

Before submitting spec:

- [ ] All acceptance criteria are testable (can verify pass/fail)
- [ ] Pattern references point to existing patterns
- [ ] Success validation command is runnable
- [ ] Demo script is step-by-step reproducible
- [ ] Logical commits follow SAFe format
- [ ] Spec file follows `specs/TAM-{number}-{slug}.md` naming with a Status field
- [ ] UI specs have a Design References (Figma) section: file key + canonical node IDs (`285:3464`) per UI area, out-of-scope Figma elements flagged `Do NOT implement`, fidelity hooks included

## Output Locations

| Output Type  | Location                                              |
| ------------ | ----------------------------------------------------- |
| Impl specs   | `specs/TAM-{number}-{description}.md`                 |
| Requirements | `docs/agent-outputs/requirements/TAM-{number}-*.md`   |
| ADRs         | `docs/adr/ADR-{number}-{description}.md`              |

## Evidence in the Spec File

After spec approval:

```markdown
**BSA Spec Evidence**

**Spec**: specs/TAM-{number}-{description}.md
**Status**: Approved by [reviewer]

**Deliverables**:

- [x] Acceptance criteria defined
- [x] Pattern references added
- [x] Demo script created
- [x] Ready for implementation
```

## Authoritative References

- **Spec Template**: `specs_templates/spec_template.md`
- **Pattern Library**: `patterns_library/README.md`
- **Planning Templates**: `specs_templates/planning_template.md`
- **SAFe Workflow**: `CONTRIBUTING.md`
````
