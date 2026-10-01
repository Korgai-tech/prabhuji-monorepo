# Spec: [Feature Name]

## Ticket

- **ID**: TAM-XXX (this file: `specs/TAM-XXX-{slug}.md`)
- **Status**: Todo <!-- Todo | In Progress | Ready for Review | Done | Blocked -->

## Design References (Figma)

<!-- REQUIRED for any spec with a UI surface. Delete this section for backend-only specs. -->
<!-- Node ID format: the Figma URL uses a dash (?node-id=285-3464); the canonical node ID uses a colon (285:3464). Record canonical IDs in the table and keep at least one full URL per frame. -->

- **Figma file**: `{fileKey}` <!-- from figma.com/design/{fileKey}/{FileName} -->
- **Main frame**: [frame name] — node `{node:id}` — [URL with ?node-id=]

| Area                    | Node ID     | Notes                                |
| ----------------------- | ----------- | ------------------------------------ |
| [Screen root]           | `{node:id}` | [main frame]                         |
| [UI area 1]             | `{node:id}` | [behavior / constraint]              |
| [Out-of-scope element]  | `{node:id}` | Do NOT implement — [reason/phase]    |

- **Fidelity workflow**: run the `figma-flutter` skill (Flutter) or Figma MCP `get_design_context`/`get_metadata`/`get_screenshot` (web) against these node IDs — extract variables, geometry, and assets; never eyeball the design.

### Layout intent (per screen)

<!-- REQUIRED whenever the screen has ANY of: a bottom-pinned bar, a fixed header,
     a flex-fill zone (something that fills remaining vertical space), or an
     internally-scrolling region. Skip only for screens whose ENTIRE tree is a
     single scrollable feed (e.g. Home). Figma frames do NOT encode this — the
     designer's intent has to be captured here or it drifts on the first tall/short
     device that isn't the Figma frame's height.

     Sizing vocabulary (exhaustive):
       - pinned-top      → sits at y=0, intrinsic height, never moves
       - pinned-bottom   → sits at y = screenHeight − h, intrinsic height, never moves
       - intrinsic       → takes its natural height, laid out in document order
       - flex-fill       → takes ALL remaining vertical space; if content overflows,
                           scrolls INTERNALLY (the screen root does NOT scroll)

     Rules:
       - AT MOST ONE flex-fill zone per screen (multiple → ambiguous distribution).
       - A screen with a flex-fill zone MUST NOT wrap the whole tree in a
         SingleChildScrollView / ListView / Scrollable. Only the flex-fill zone
         may scroll.
       - Every pinned-bottom zone stays glued to the bottom at ALL device heights
         (tested by the layout-intent test at 600 / 800 / 1200 dp — see
         `patterns_library/testing/flutter-layout-intent.md`). -->

**Screen: [Screen name] (`{node:id}`)** — screen root [does / does not] scroll.

| Zone (top → bottom) | Node        | Sizing         | Overflow behavior       |
| ------------------- | ----------- | -------------- | ----------------------- |
| [App bar]           | `{node:id}` | pinned-top     | clip                    |
| [Content title]     | `{node:id}` | intrinsic      | clip                    |
| [Primary content]   | `{node:id}` | **flex-fill**  | scroll internally       |
| [Engagement bar]    | `{node:id}` | pinned-bottom  | clip                    |
| [Player controls]   | `{node:id}` | pinned-bottom  | clip                    |

<!-- Worked example — Mantras Player (delete when filling in your own):

**Screen: Mantras Player (`285:XXXX`)** — screen root does NOT scroll.

| Zone (top → bottom)     | Node        | Sizing         | Overflow behavior |
| ----------------------- | ----------- | -------------- | ----------------- |
| App bar (back + counter)| `285:X1`    | pinned-top     | clip              |
| Deity card              | `285:X2`    | intrinsic      | clip              |
| Song title + composer   | `285:X3`    | intrinsic      | clip              |
| Mantra text             | `285:X4`    | **flex-fill**  | scroll internally |
| Engagement bar (♥ / ⇪)  | `285:X5`    | pinned-bottom  | clip              |
| Player controls (⏮ ⏸ ⏭) | `285:X6`    | pinned-bottom  | clip              |
| Queue "Next" bar        | `285:X7`    | pinned-bottom  | clip              |

Rationale: on a short device the mantra shrinks and scrolls inside its zone;
the player controls and queue bar stay pinned so playback is always reachable.
On a tall device the mantra grows to fill the gap — the player never floats
mid-screen.
-->

## High-Level Objective

### User Story

**As a** [user type]  
**I want to** [capability]  
**So that** [business value]

### Business Context

[Brief explanation of why this work is important and how it fits into the larger initiative]

## Acceptance Criteria

- [ ] [Testable outcome 1]
- [ ] [Testable outcome 2]
- [ ] [Testable outcome 3]
- [ ] [Performance requirement if applicable]
- [ ] [Security requirement if applicable]
- [ ] (Figma-sourced UI only) figma-flutter Phase 6 rendered-comparison verdict recorded in Evidence — delete this line if the spec has no Design References section
- [ ] (Screens with a Layout intent block only) `*_layout_intent_test.dart` asserts each pinned/flex zone at 600 / 800 / 1200 dp heights — see `patterns_library/testing/flutter-layout-intent.md`
- [ ] (Any UI screen with Text inside fixed-height containers) `*_multi_size_smoke_test.dart` includes a `textScaleFactorTestValue = 2.0` variant asserting no `RenderFlex` overflow exceptions — see `patterns_library/testing/flutter-multi-size-smoke.md`. Catches the "literal Figma height around scalable text" trap (figma-flutter SKILL.md, Traps table) at PR time instead of on users with accessibility font scale bumps.

## Pattern References

### Primary Patterns

- **Pattern Used**: [pattern-file-name.md]
- **Justification**: [Why this pattern was chosen]

### Secondary Patterns

- **Pattern Used**: [pattern-file-name.md]
- **Usage**: [How this pattern applies]

## Low-Level Implementation Tasks

### Backend Tasks

1. [ ] [Specific backend task 1]
2. [ ] [Specific backend task 2]
3. [ ] [Specific backend task 3]

### Frontend Tasks

1. [ ] [Specific frontend task 1]
2. [ ] [Specific frontend task 2]
3. [ ] [Specific frontend task 3]

<!-- If Design References lists a Figma frame, keep these as explicit tasks (figma-flutter skill): -->

4. [ ] Extract tokens (`get_variable_defs`) + geometry (`get_metadata`) into the real theme — no placeholder tokens
5. [ ] Export assets incl. every icon node (asset inventory) and wire them
6. [ ] Phase 6 rendered-comparison loop (emulator or goldens) → sweep-table verdict into Evidence
7. [ ] (If a Layout intent block is present) implement per `patterns_library/testing/flutter-layout-intent.md`: give each zone a stable `Key`, wire the Column/Expanded structure so the flex-fill zone is the only scrollable, and commit the `*_layout_intent_test.dart`
8. [ ] (Any card / row / header with Text inside a fixed container height) translate Figma's `height: X` to `constraints: BoxConstraints(minHeight: X)` — NEVER a rigid `height:` around scalable Text. Commit a multi-size smoke test (see `patterns_library/testing/flutter-multi-size-smoke.md`) with a `textScaleFactorTestValue = 2.0` variant so the "literal Figma height around scalable text" trap is caught at PR time.

### Database Tasks

1. [ ] [Migration or schema change]
2. [ ] [Prisma schema/migration updates if applicable]
3. [ ] [Data seeding if applicable]

## Critical Handoff Notes

### #PATH_DECISION

[Document why particular architectural or implementation paths were chosen over alternatives]

### #PLAN_UNCERTAINTY

[Flag any assumptions made during planning that require validation during execution]

### #EXPORT_CRITICAL

[Highlight non-negotiable requirements, security rules, or architectural constraints]

## Testing Strategy

### Unit Tests

- [ ] [Component/function to test]
- [ ] [Edge case to cover]

### Integration Tests

- [ ] [API endpoint to test]
- [ ] [Database interaction to verify]

### End-to-End Tests

- [ ] [User flow to test]
- [ ] [Critical path to verify]

### Manual Testing

- [ ] [Manual verification step]
- [ ] [UI/UX validation]

## Security Considerations

### Authentication/Authorization

- [ ] [Auth requirement 1]
- [ ] [Auth requirement 2]

### Data Protection

- [ ] [Data protection requirement]
- [ ] [Authorization checks if applicable]

### Input Validation

- [ ] [Validation requirement 1]
- [ ] [Validation requirement 2]

## Performance Requirements

### Response Time

- [Endpoint]: < [X]ms
- [Page Load]: < [X]ms

### Scalability

- [Requirement 1]
- [Requirement 2]

## Dependencies

### Technical Dependencies

- [ ] [Dependency 1]
- [ ] [Dependency 2]

### Business Dependencies

- [ ] [Business approval needed]
- [ ] [External integration required]

## Definition of Done

- [ ] All acceptance criteria met
- [ ] All tests passing (`pnpm verify`)
- [ ] Security review completed (if applicable)
- [ ] Performance requirements met
- [ ] Documentation updated
- [ ] PR created with evidence attached
- [ ] Spec Evidence section updated with session ID and validation results
- [ ] (Figma-sourced UI only) Design-fidelity verdict in Evidence — same ticket, not a follow-up
- [ ] (Screens with a Layout intent block only) layout-intent widget test committed + passing at 600 / 800 / 1200 dp
- [ ] (Any UI screen with Text inside fixed-height containers) multi-size smoke test with `textScaleFactorTestValue = 2.0` committed + passing (no `RenderFlex` overflow exceptions) — pins the "literal Figma height around scalable text" trap

## Evidence

<!-- Filled during execution; the PR references this section. -->

- **Validation**: [pnpm verify / verify:mobile output summary]
- **Tests**: [suites run + results]
- **Design fidelity** (Figma-sourced UI only): [Phase 6 sweep-table verdict — commit artifacts under `specs/evidence/TAM-XXX/fidelity/` (sweep-table.md + side-by-side PNGs) and reference the actual paths here; the PR gate verifies they exist]
- **Session ID**: [Claude session ID]

## Pull Request Template

```markdown
## Summary

[Brief description of changes]

## Spec

Closes TAM-XXX (`specs/TAM-XXX-{slug}.md`)

## Changes Made

- [Change 1]
- [Change 2]
- [Change 3]

## Testing Evidence

- [ ] Unit tests: [Link to test results]
- [ ] Integration tests: [Link to test results]
- [ ] Manual testing: [Screenshots/videos]

## Security Review

- [ ] No new security concerns
- [ ] Security review completed (if applicable)

## Session Evidence

- **Session ID**: [Claude session ID]
- **Validation Results**: [Link to ci:validate output]
```

## Notes for Execution Agent

### Before Starting

1. Read this entire spec carefully
2. Pay special attention to #EXPORT_CRITICAL items
3. Review referenced patterns in `patterns_library/`
4. Validate any #PLAN_UNCERTAINTY items with POPM if needed

### During Implementation

1. Follow the low-level tasks in order
2. Make atomic commits for each logical change
3. Run `pnpm verify` frequently
4. Update this spec if you discover issues

### Before Completing

1. Verify all acceptance criteria are met
2. Run full test suite
3. Record evidence in this spec's Evidence section
4. Create PR using the template above
