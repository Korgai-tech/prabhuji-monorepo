---
name: security-audit
description: Security audits, OWASP compliance, and vulnerability scanning. Use when auditing API routes or scanning for security issues.
context: fork
agent: Explore
allowed-tools: Read, Bash, Grep, Glob
---

# Security Audit Skill

## Purpose

Guide security validation with JWT auth enforcement, Zod input validation, layered-architecture boundaries, OWASP compliance, and vulnerability detection.

## When This Skill Applies

Invoke this skill when:

- Auditing API routes for auth (JWT middleware coverage)
- Validating input handling (Zod at route boundaries)
- Vulnerability scanning (dependencies)
- Pre-merge / release-readiness security review
- Checking for exposed credentials
- Reviewing database access patterns (Prisma confined to repositories)

## Stop-the-Line Conditions

### FORBIDDEN Patterns

```typescript
// FORBIDDEN: Prisma outside repositories/ (breaks the arch boundary)
// Only apps/api/src/core/<mod>/repositories/ may import @prisma/client

// FORBIDDEN: Missing authentication on protected routes
app.get("/users/:id", async (req, reply) => {
  // No auth middleware/preHandler before accessing user data
  return getUserData(req.params.id);
});

// FORBIDDEN: Exposed credentials
const JWT_SECRET = "super-secret-value"; // Hardcoded secret

// FORBIDDEN: SQL injection vulnerability
const query = `SELECT * FROM users WHERE id = ${userId}`; // Interpolated

// FORBIDDEN: Unvalidated input reaching a service
const body = req.body as CreateUserInput; // Cast instead of Zod parse
```

### CORRECT Patterns

```typescript
// CORRECT: Prisma only inside the module's repository
// apps/api/src/core/auth/repositories/auth.repository.ts

// CORRECT: Auth middleware before data access (401 via sendError envelope)
app.get("/auth/me", { preHandler: [requireAuth] }, controller.me);

// CORRECT: Secrets from environment (validated at startup)
const secret = env.JWT_SECRET; // from shared config, never hardcoded

// CORRECT: Zod schema at the route boundary (routes/<mod>.schemas.ts)
const parsed = createUserSchema.parse(req.body);

// CORRECT: Passwords hashed with bcryptjs; JWTs signed with jsonwebtoken
const hash = await bcrypt.hash(password, 10);
```

## Security Audit Checklist

### 1. Architecture Boundary Validation

- [ ] `pnpm check:arch-boundaries` passes (Route → Controller → Service → Repository)
- [ ] `@prisma/client` imported ONLY in `repositories/`
- [ ] Cross-module access only via `performServiceCall` facades

```bash
# Find Prisma imports outside repositories/
grep -rn "@prisma/client" apps/api/src --include="*.ts" | grep -v "repositories/\|shared/database"
pnpm check:arch-boundaries
```

### 2. Authentication Checks

- [ ] All protected routes go through the JWT auth middleware
- [ ] Tokens verified with `JWT_SECRET` from env (never hardcoded, sufficient length)
- [ ] Passwords hashed with bcryptjs (never stored or logged in plaintext)
- [ ] Proper 401/403 responses via `sendError` (`{success:false, message, data:null}`)
- [ ] Admin SPA: HTTP only via `src/lib/api.ts` (Bearer injection, 401 → /login)
- [ ] Mobile: token kept in `flutter_secure_storage`, never in plain prefs

```bash
# List route registrations, then verify each protected one has the auth preHandler
grep -rn "app\.\(get\|post\|put\|patch\|delete\)" apps/api/src/core/*/routes/ | head -20
```

### 3. Credential Scanning

- [ ] No hardcoded secrets in code
- [ ] No secrets in client-side code (admin bundle, mobile app)
- [ ] Environment variables used correctly (`JWT_SECRET`, `DATABASE_URL`)

```bash
# Scan for potential secrets
grep -rEn "(password|secret|api[_-]?key|token)\s*[:=]\s*['\"][^'\"]+['\"]" apps --include="*.ts" --include="*.tsx" --include="*.dart" | grep -v "process.env\|import.meta.env\|test"
```

### 4. Dependency Vulnerabilities

```bash
# Run security audit (production deps)
pnpm audit --prod

# Fail the review on high/critical vulnerabilities
pnpm audit --prod --audit-level=high
```

### 5. Input Validation

- [ ] User input validated with Zod schemas in `routes/<mod>.schemas.ts`
- [ ] Schemas drive the OpenAPI contract (`pnpm check:openapi` clean)
- [ ] No raw query interpolation (Prisma parameterizes; `$queryRaw` uses tagged templates)
- [ ] File upload restrictions in place where applicable

## OWASP Top 10 Checklist

| Risk                 | Check                                             | Status |
| -------------------- | ------------------------------------------------- | ------ |
| A01 Broken Access    | Auth middleware on all protected routes           | ☐      |
| A02 Crypto Failures  | Secrets in env vars; bcryptjs for passwords       | ☐      |
| A03 Injection        | Prisma parameterized queries, Zod validation      | ☐      |
| A04 Insecure Design  | Layered architecture gate passes                  | ☐      |
| A05 Misconfiguration | Env validated at startup; no debug in prod config | ☐      |
| A06 Vulnerable Deps  | `pnpm audit --prod` clean                         | ☐      |
| A07 Auth Failures    | JWT verify + expiry correct; 401 envelope         | ☐      |
| A08 Data Integrity   | Repository layer is the only DB write path        | ☐      |
| A09 Logging Failures | `createModuleLogger` used; no secrets in logs     | ☐      |
| A10 SSRF             | External URLs validated                           | ☐      |

## Security Validation Commands

```bash
# Complete security check
pnpm audit --prod && pnpm check:arch-boundaries && pnpm nx run-many -t lint --exclude=mobile && echo "Security checks passed"

# Arch bypass detection
grep -rn "@prisma/client" apps/api/src --include="*.ts" | grep -v "repositories/\|shared/database"

# Secret detection
git secrets --scan  # If git-secrets installed
grep -rEn "JWT_SECRET\s*=\s*['\"]" apps --include="*.ts"
```

## Pre-Merge Security Review

Before merging security-relevant changes (and before any release tag):

- [ ] `pnpm audit --prod` shows no high/critical issues
- [ ] `pnpm check:arch-boundaries` passes (no new Prisma outside repositories)
- [ ] New routes covered by auth middleware where required
- [ ] New inputs covered by Zod schemas (`pnpm check:openapi` clean)
- [ ] Environment variables documented (no secrets committed)
- [ ] Migrations reviewed; rollback plan documented for destructive changes

## Security Audit Report Template

```markdown
## Security Audit Report - TAM-XXX

### Summary

- **Date**: [date]
- **Auditor**: Security Engineer
- **Scope**: [what was audited]

### Findings

| Severity | Issue | Location | Status |
| -------- | ----- | -------- | ------ |
| HIGH     | ...   | ...      | FIXED  |
| MEDIUM   | ...   | ...      | OPEN   |

### Auth & Boundary Validation

- [x] Protected routes verified against auth middleware
- [x] Arch gate (`pnpm check:arch-boundaries`) passes
- [x] Zod coverage on new inputs; OpenAPI drift clean

### Recommendations

1. [recommendation]
2. [recommendation]

### Approval

- [ ] Security Engineer approves
- [ ] Ready to merge
```

## Authoritative References

- **API conventions (auth, errors, layering)**: `apps/api/CLAUDE.md`, `arch-boundaries.json` (layer rules)
- **Security patterns**: `patterns_library/security/` (`rate-limiting.md`, `input-sanitization.md`, `secrets-management.md`)
- **Validation pattern**: `patterns_library/api/zod-validation-api.md`
- **OWASP Top 10**: <https://owasp.org/Top10/>
