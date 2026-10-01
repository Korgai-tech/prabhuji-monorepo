---
name: pattern-discovery
description: Pattern library discovery for pattern-first development. Use BEFORE implementing any new feature, creating components, writing API routes, or adding database operations. Ensures existing patterns are checked first before writing new code.
context: fork
agent: Explore
allowed-tools: Read, Grep, Glob
---

# Pattern Discovery Skill

## Purpose

Enforce pattern-first development by checking the Pattern library before implementing new functionality. This reduces code duplication, ensures consistency, and leverages battle-tested solutions.

## When to Use

Invoke this skill when:

- About to create a new API route
- About to create a new UI component
- About to add database operations
- About to write integration tests
- User asks "how do I implement..." or "how should I build..."
- Starting work on any feature implementation

## Pattern Discovery Protocol

**ALWAYS follow this sequence before writing new code:**

### Step 1: Check Pattern Library

Search `patterns_library/` for existing patterns:

```bash
# Find patterns by category
ls patterns_library/api/      # API route patterns
ls patterns_library/ui/       # UI component patterns
ls patterns_library/database/ # Database operation patterns
ls patterns_library/testing/  # Testing patterns
```

### Step 2: Review Pattern Index

Check `patterns_library/README.md` for the complete pattern index:

| Category | Patterns Available                                                                            |
| -------- | --------------------------------------------------------------------------------------------- |
| API      | Module Shape, Cross-Module Call, User Context, Admin Context, Webhook Handler, Zod Validation |
| UI       | Authenticated Page, Form with Validation, Data Table                                          |
| Database | Prisma Transaction                                                                            |
| Testing  | API Integration Test, E2E User Flow                                                           |
| Security | Input Sanitization, Rate Limiting, Secrets Management                                         |
| CI       | Contract Codegen Chain, GitHub Actions Workflow, Deployment Pipeline                          |
| Config   | Environment Config, Structured Logging                                                        |

### Step 3: Apply or Escalate

**If pattern exists:**

1. Read the pattern file
2. Copy the code pattern
3. Follow the customization guide
4. Run validation commands

**If pattern is missing:**

1. Search codebase for similar implementations
2. If found, consider extracting as new pattern (BSA/ARCHitect only)
3. If not found, implement from scratch following existing conventions
4. Report pattern gap to BSA for future extraction

## Pattern Library Structure

```
patterns_library/
├── README.md           # Pattern index and usage guide
├── api/
│   ├── module-shape.md
│   ├── cross-module-call.md
│   └── zod-validation-api.md
├── ui/
│   ├── data-table.md
│   ├── flutter-feed-screen.md
│   └── form-with-validation.md
├── database/
│   └── prisma-transaction.md
├── testing/
│   └── api-integration-test.md
├── security/
│   ├── input-sanitization.md
│   ├── rate-limiting.md
│   └── secrets-management.md
├── ci/
│   └── contract-codegen-chain.md
└── config/
    ├── environment-config.md
    └── structured-logging.md
```

## Pattern Matching Guide

| If you need to...                           | Use this pattern                  |
| ------------------------------------------- | --------------------------------- |
| Create a new API module                     | `api/module-shape.md`             |
| Call another module's service               | `api/cross-module-call.md`        |
| Validate API input with Zod                 | `api/zod-validation-api.md`       |
| Build form with validation                  | `ui/form-with-validation.md`      |
| Display paginated data                      | `ui/data-table.md`                |
| Build a CMS-driven Flutter feed screen      | `ui/flutter-feed-screen.md`       |
| Run multi-step DB operations                | `database/prisma-transaction.md`  |
| Test API endpoints                          | `testing/api-integration-test.md` |
| Sanitize user input                         | `security/input-sanitization.md`  |
| Add API rate limiting                       | `security/rate-limiting.md`       |
| Manage secrets/env vars                     | `security/secrets-management.md`  |
| Regenerate API clients after schema changes | `ci/contract-codegen-chain.md`    |
| Load environment configuration              | `config/environment-config.md`    |
| Add structured logging                      | `config/structured-logging.md`    |

## Security Requirements

All patterns enforce:

- **Layered Architecture** - Route → Controller → Service → Repository; Prisma only in repositories
- **Authentication** - Protected routes verify the JWT (auth middleware) before processing
- **Input Validation** - All inputs validated with Zod schemas at the route boundary
- **Error Handling** - `AppError`/`ValidationError` with the `{success, message, data}` envelope

## Validation Commands

After applying a pattern, run:

```bash
pnpm verify                                   # All patterns (arch + OpenAPI drift + typecheck + lint + unit)
pnpm nx test api --configuration=integration  # API patterns
pnpm nx test admin                            # UI patterns (E2E deferred to a later phase)
```

## Authoritative Reference

- **Pattern Index**: `patterns_library/README.md`
- **API Patterns**: See `api-patterns` skill for Fastify module conventions
- **Frontend Patterns**: See `frontend-patterns` skill for UI conventions
