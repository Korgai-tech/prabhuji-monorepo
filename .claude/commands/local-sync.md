---
description: Full local development sync after git pull
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

> **📋 TEMPLATE**: This command is a template. See "Customization Guide" below to adapt for your infrastructure.

Perform complete local development environment sync after pulling from main.
This ensures dependencies, database, and validation are all up-to-date.

## Workflow

### 1. Git Branch Cleanup (Best Practice)

**Check current branch and switch to main if needed:**

```bash
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"
```

**If on feature branch:**

- Check for uncommitted changes
- If clean, switch to main: `git checkout main`
- If dirty, offer to stash: `git stash && git checkout main`
- Save feature branch name for cleanup

**Switch to main branch:**

```bash
git checkout main
```

### 2. Git Pull

Pull latest changes from origin/main:

```bash
git pull origin main
```

If pull fails due to uncommitted changes:

- Stash changes: `git stash`
- Pull again
- Reapply stash: `git stash pop`

### 3. Branch Cleanup (Git Best Practice)

**After pulling latest main, clean up merged branches:**

**Check if previous feature branch is merged:**

```bash
# If we switched from a feature branch, check if it's merged
git branch --merged main | grep -v "^\*" | grep -v "main"
```

**Offer to delete merged feature branch:**

```bash
# Example: TAM-381-rename-slash-commands-remote-prefix
git branch -d TAM-381-rename-slash-commands-remote-prefix
```

**Prune remote tracking branches:**

```bash
# Remove stale remote tracking branches
git fetch --prune origin
```

**List stale local branches:**

```bash
# Show branches not updated in 30+ days
git for-each-ref --sort=-committerdate refs/heads/ --format='%(refname:short) | %(committerdate:relative)' | grep -E 'weeks|months|years' ago
```

**Offer to delete stale branches** (interactive)

### 4. Smart Change Detection

Detect what changed to determine necessary steps:

```bash
# Check if package.json changed
DEPS_CHANGED=$(git diff HEAD@{1} HEAD -- package.json pnpm-lock.yaml)

# Check if prisma schema changed
SCHEMA_CHANGED=$(git diff HEAD@{1} HEAD -- prisma/schema.prisma prisma/migrations/)
```

**Decision Logic:**

- If `$DEPS_CHANGED` is empty → **Skip Step 5 (pnpm install)**
- If `$SCHEMA_CHANGED` is empty → **Skip Step 6 (Prisma operations)**
- If both empty → **Fast path: Jump to Step 7 (Docker check)**

### 5. Install Dependencies (Conditional)

#### Only run if package.json or pnpm-lock.yaml changed

If `$DEPS_CHANGED` has content:

```bash
pnpm install
```

Show summary:

- Packages added
- Packages removed
- Packages updated

If `$DEPS_CHANGED` is empty:

```text
⏭️  Skipped: No dependency changes detected
```

### 6. Prisma Client Update (Conditional)

#### Only run if schema or migrations changed

If `$SCHEMA_CHANGED` has content:

```bash
npx prisma generate
```

Check for pending migrations:

```bash
npx prisma migrate status
```

If migrations pending:

- Show migration names
- Offer to run: `npx prisma migrate deploy`
- OR suggest: `npx prisma migrate dev` for development

If `$SCHEMA_CHANGED` is empty:

```text
⏭️  Skipped: No schema changes detected
```

### 7. Validation (Optional)

#### Only run if user opts in

Ask user: "Run full validation (pnpm verify)? This takes ~30s. (y/N)"

If user chooses Yes:

```bash
pnpm verify
```

This runs:

1. `pnpm nx run-many -t typecheck` - TypeScript validation
2. `pnpm nx run-many -t lint --exclude=mobile` - ESLint validation
3. `pnpm nx run-many -t test --exclude=mobile` - Unit tests

If user chooses No or skips:

```text
⏭️  Skipped: Run 'pnpm verify' manually if needed
```

### 8. Docker Services Check

Verify Docker services are running:

```bash
docker ps --filter name=monorepo-boilerplate --format 'table {{.Names}}\t{{.Status}}\t{{.State}}'
```

If services not running:

- Suggest: `./scripts/dev-docker.sh start`
- OR: `docker-compose up -d`

### 9. Status Report

Generate comprehensive sync report:

```text
🔄 Local Development Sync Complete

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Git Sync
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Branch:        main
Commits:       3 new commits pulled
Latest:        fd85ba3 - feat(marketing): RenderTrust pages [TAM-379]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dependencies
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

package.json:  ✅ No changes
pnpm-lock.yaml:     ✅ No changes
Status:        ⏭️  Skipped (no changes)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Database
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Prisma Schema: ✅ No changes
Migrations:    ✅ All applied (14 total)
Client:        ⏭️  Skipped (schema unchanged)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Validation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Status:        ⏭️  Skipped (user opted out)
Suggestion:    Run `pnpm verify` manually if needed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Docker Services (TAM-401: STANDARD Ports)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

monorepo-boilerplate-app-1:             ✅ Up 3 hours (healthy) → port 3000
monorepo-boilerplate-postgres-1:   ✅ Up 3 hours (healthy) → port 5432
monorepo-boilerplate-redis-1:         ✅ Up 3 hours (healthy) → port 6379

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Local environment fully synced and validated
✅ Ready for development

Next Steps:
• Start dev server: pnpm nx serve api
• View local app: http://localhost:3000
• Check health: /local-health
```

## Error Handling

### Git Pull Fails (Merge Conflicts)

If pull fails due to conflicts:

```text
⚠️  MERGE CONFLICT DETECTED

Files with conflicts:
• app/example/page.tsx
• lib/helper.ts

Resolution:
1. Resolve conflicts manually
2. Stage resolved files: git add .
3. Complete merge: git commit
4. Re-run /local-sync
```

### pnpm Install Fails

If dependency installation fails:

```bash
# Clear cache and retry
pnpm store prune
rm -rf node_modules
pnpm install
```

### Prisma Generate Fails

If Prisma client generation fails:

```bash
# Check schema validity
npx prisma validate

# Force regenerate
npx prisma generate --force
```

### ci:validate Fails

If validation fails, show specific failures:

- **TypeScript errors**: Run `pnpm nx run-many -t typecheck` to see details
- **ESLint errors**: Run `pnpm nx run-many -t lint --exclude=mobile` to see details
- **Test failures**: Run `pnpm nx run-many -t test --exclude=mobile` to see details

Provide command to fix each type of error.

### Database Migration Pending

If migrations not applied:

```text
⚠️  PENDING MIGRATIONS DETECTED

Migrations to apply:
• 20250115123456_add_user_roles
• 20250116234567_add_audit_fields

Options:
1. Apply migrations: npx prisma migrate deploy
2. Apply with dev mode: npx prisma migrate dev
3. Skip for now (re-run sync later)
```

## Success Criteria

- ✅ Git pull successful
- ✅ Dependencies installed (if changed)
- ✅ Prisma client generated (if schema changed)
- ✅ No pending migrations (or applied if schema changed)
- ✅ Docker services running
- ✅ Clear status report with skip reasons provided
- ⚠️ CI validation optional (user choice)

## Related Commands

- `/local-health` - Check local environment health
- `/local-restart` - Restart Docker services
- `/local-logs` - View application logs
- `pnpm nx serve api` - Start development server
- `pnpm verify` - Run validation manually

## Notes

**When to Run**:

- After receiving Slack notification in `#github-feed` (TAM-411)
- After every `git pull origin main`
- When switching branches
- After long periods away from project
- When seeing unexpected errors

**Slack Notifications (TAM-411)**:

- Normal PRs: Basic merge notification
- High-Risk PRs: `@channel` mention - sync immediately!
- High-risk files: schema, migrations, Docker, dependencies

**What Gets Checked**:

- Git status and latest commits
- Docker services status
- Package.json/pnpm-lock.yaml changes (detection only)
- Prisma schema changes (detection only)

**What Gets Skipped** (Smart Detection):

- pnpm install (if no dependency changes)
- Prisma generate (if schema unchanged)
- Prisma migrate status (if schema unchanged)
- CI validation (user must opt in - not run by default)

**Performance**:

- Fast path (no changes): ~5-10 seconds
- With dependencies: ~30 seconds
- With validation opt-in: ~60 seconds
