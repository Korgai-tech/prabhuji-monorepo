# Deployment

How code gets from a branch to a running environment. Two layers: **[At a glance](#at-a-glance)** if you just want to know what happens, **[The detailed version](#the-detailed-version)** if you need to know why or you're debugging it.

Infra reference (modules, resources, per-env config) lives in [`infra/terraform/README.md`](../infra/terraform/README.md). This file is the *flow*.

---

## At a glance

**Deploying code — you push, everything else is automatic:**

- You push to `stage` (or merge a PR into it). Prod is the same story from `main`.
- A GitHub webhook starts the CodeBuild project (`app-stage-deploy` / `app-prod-deploy`).
- **Gates run**: `pnpm verify`, api + events integration tests, ClickHouse check. **Red = stop.** No images, no migration, no deploy.
- ClickHouse warehouse migrations apply (`events:migrate`).
- api + events + **admin** (TAM-120) Docker images build and push to ECR as `:<commit-sha>` and `:latest`.
- **Postgres migrations apply** — a one-off `api` task runs `prisma migrate deploy` inside the VPC. **Fails = stop.** Services keep running the old code. **admin has no migration** — it is a static SPA; only `api` migrates.
- The api + events + **admin** ECS services roll onto the new `:latest`.
- Net effect: **the database is migrated before the new code serves traffic.** No laptop involved.

**Running on a schedule, not on a push:**

- **The recurring-debit cycle.** EventBridge Scheduler fires a one-off `api` task every 30 minutes running `node billing.js` — pre-debit notifications, presentations, reconciliation. Same image, same task role, same secrets as the API. See "Recurring debits" below; it ships **disarmed** and both switches are manual.

**Still needs a human:**

- **Terraform changes** — `pnpm deploy:infra <stage|prod>`. The pipeline never runs Terraform.
- **Prod migrations** — the code is committed but *not applied* to prod yet (TAM-79 applied stage only). Until someone runs `pnpm deploy:infra prod`, prod deploys code **without** migrating.
- **Arming billing** — two independent flips, deliberately. See below.

**Two things that will bite you:**

- **Prod auto-deploys on push to `main`.** No approval gate. This was true before TAM-79 — that ticket only added the migration.
- **Write additive migrations.** During a rollout old containers still serve traffic against the new schema. Adding a column is safe; dropping or renaming one in the same deploy as the code change breaks live requests. Split it: add → backfill → remove later.

---

## The detailed version

### Environments

| | stage | prod |
|---|---|---|
| Branch | `stage` | `main` |
| CodeBuild project | `app-stage-deploy` | `app-prod-deploy` |
| Cluster / RDS | `app-stage` / `app-stage-pg` | `app-prod` / `app-prod-pg` |
| Auto-deploys code | yes | yes |
| Auto-migrates Postgres | **yes** | **not yet** — needs `deploy:infra prod` |

Both live in one AWS account (`661952267560`, `ap-south-1`), each in its own VPC with separate Terraform state. Every resource is env-prefixed (`app-stage-*`), so they never collide.

**Services behind the shared ALB** (one `modules/fargate-service` instance each, path-routed on the single HTTP listener):

| Service | Container | stage — ALB path (priority) | prod — ALB host + path (priority) | Migrates? |
|---|---|---|---|---|
| `api` | Fastify :3000 | `/*` catch-all (100) | `production-prabhuji-api.krutyug.ai` + `/*` (100) | **yes** (Prisma) |
| `events` | collector :3001 | `/2/httpapi*` (10) | `production-prabhuji-api.krutyug.ai` + `/2/httpapi*` (10) | no |
| `admin` (TAM-120) | nginx SPA :8080 | `/cms`, `/cms/*` (30) | `production-prabhuji-cms.krutyug.ai` + `/*` (30) | **no** (static SPA) |

**Two layouts, and the image must be built to match.** Stage is path-routed on a single hostname; prod is **host-routed** (TAM-128) because `admin_domain_name` is set, which is what lets the CMS own its hostname's root. A Vite bundle inlines `import.meta.env` at build time, so the admin image is built differently per env via `modules/cicd`'s per-service `build_args` — prod passes `VITE_BASE_PATH=/` and `VITE_API_URL=https://<domain_name>`, stage passes neither and keeps the `/cms/` defaults. Mismatch the halves and the CMS loads blank: a `/cms/`-built bundle on a host with no `/cms` rule requests `/cms/assets/*` and 404s every asset, with nothing in the server logs. At root the CMS is also **no longer same-origin** with the api, so `cors_allowed_origins` must carry the CMS origin.

**Renaming a prod hostname is never DNS-only.** `VITE_API_URL` is *compiled into* the admin bundle, so a rename needs the admin image **rebuilt** (`aws codebuild start-build --project-name app-prod-deploy`) — re-applying Terraform only changes the buildspec, not the running image. It also needs a **new certificate** (ACM covers an exact name set), which means dropping `cert_validated_externally` to `false` first: `wire_https` is variable-derived, so changing the name set while it is `true` tries to attach a `PENDING_VALIDATION` cert to the listener and fails the apply partway. And because ALB rules match on `Host`, the old names 404 rather than redirect the moment `domain_name` changes.

`admin` is wired into **both** envs' `modules/cicd` `services` list, so a push to `stage`/`main` builds+pushes+rolls it alongside api/events. **Prod admin is deliberately not applied yet**: it is served over the **cleartext HTTP ALB** (no TLS/domain), so admin JWTs + edits would ride plaintext — a TLS listener + domain + ACM is the tracked hardening follow-up before real editors use prod (`specs/TAM-120-admin-cms-deployment.md` `#EXPORT_CRITICAL`). The config wires prod; the owner controls exposure by **not** running `pnpm deploy:infra prod`.

### What each pipeline step does, and why

1. **Webhook → build.** `modules/cicd` creates `aws_codebuild_webhook` filtered to `refs/heads/<branch>`. It's unconditional, so **both** envs auto-deploy. There is no manual-approval action anywhere — that would require CodePipeline, which this repo doesn't use.

2. **Gates.** `pnpm verify` (arch boundaries, OpenAPI drift, typecheck, lint, unit), the api + events integration suites (testcontainers), and `nx run events:ch-check`. They run *before* any image exists, so a red gate can't ship anything. Mobile and e2e suites are excluded — the build image has no Flutter SDK or emulator. Run `pnpm verify:mobile` / `pnpm e2e:web` locally before merging.

3. **Warehouse migrations** (`events:migrate`). ClickHouse Cloud is a public TLS endpoint, so the build talks to it directly using credentials from the CodeBuild environment. Skipped entirely if `CLICKHOUSE_HOST` isn't wired.

4. **Image build + push.** All three Dockerfiles (`apps/api`, `apps/events`, `apps/admin`) build from the repo root and push `:<commit-sha>` and `:latest`. The sha tags exist for traceability and rollback; `:latest` is what the task definitions actually reference. The buildspec loops `var.services`, so adding admin as a third entry got it build+push+roll for free — **no change to the migrate step** (`admin` is a static SPA with no schema; `migrate_task` stays api-only).

5. **Postgres migrations** (TAM-79). A one-off `api` Fargate task with a `npx prisma migrate deploy` command override, started with `ecs run-task` and awaited with `ecs wait tasks-stopped`. A non-zero exit fails the build **before** step 6, so no service rolls onto code whose migration didn't apply.

   **Why a task and not a build step:** CodeBuild has no `vpc_config` — it runs outside the VPC. RDS is `publicly_accessible = false` and its security group admits 5432 *only* from the api-tasks SG. The build simply cannot reach Postgres. VPC-attaching it would mean ENI latency on every build, all build egress through the single NAT gateway (billed per GB), a second ingress source on the DB, and the DB password in the build environment. The task has all of that already — it reaches RDS from inside the VPC and reads the password exactly the way the api does.

   **Why here, between push and roll:** the task-def references `:latest`, and `run-task` on a family resolves to the latest ACTIVE revision — so the migration runs *the image this build just pushed*. Schema leads code.

6. **Roll.** `ecs update-service --force-new-deployment` per service. Fargate pulls the new `:latest`. Terraform stays the sole owner of task definitions — no revisions are registered outside it.

### Rollback

Both envs float `:latest`, which trades pinned-tag rollback for auto-deploy. To revert: retag the last-good image as `:latest` and force a new deployment (see `infra/terraform/README.md` → "Operating it").

**Migrations don't roll back.** If a migration applies and the code roll then fails, the DB is ahead of the code. That's survivable only because of expand/contract — which is the real reason the rule matters.

### Running migrations yourself

You normally don't — merge the branch and the migration ships with the code. See [`.claude/skills/migration-patterns/SKILL.md`](../.claude/skills/migration-patterns/SKILL.md) for authoring rules (`db push` and `migrate resolve` are forbidden; every id is a native `uuid`).

Break-glass / bootstrap (no image in ECR yet, or the pipeline is wedged): `pnpm deploy:infra <env>` runs the same task from your machine as step 5. `SKIP_MIGRATE=1` opts out.

### Recurring debits (the billing scheduler)

Monthly UPI Autopay debits are **pushed by us, not pulled by the provider**: the mandate is only permission, and every rupee is initiated by `BillingCycleService`. The trigger is an EventBridge schedule (`app-<env>-billing`) that runs a one-off Fargate task on the **api task definition** with a command override — the same `run-task` shape as the Prisma migrate step, so billing inherits the API's image, roles, VPC and Secrets Manager wiring for free. Adding a secret in `services.tf` arms both.

**Two switches, and both must be on before a cycle runs:**

| Switch | Where | What it does |
|---|---|---|
| `enable_billing_scheduler` | `envs/<env>/terraform.tfvars` | Sets the EventBridge schedule `ENABLED`. `false` still creates it, `DISABLED`. |
| `ENABLE_BILLING_SCHEDULER` | api task env, via `enable_billing_scheduler_env` | Arms `runBillingCycle`. Off = the task runs, logs `billing_cycle_disabled`, exits 0. |

They are separate on purpose: one is a Terraform apply and the other rides a task-definition change, so neither can start debiting on its own.

**A third guard is the provider itself.** `PAYMENT_PROVIDER` selects the active gateway and defaults to `stub` — an in-memory provider that auto-approves. Arming both switches on an env still running `stub` therefore exercises the full claim → PDN → presentation → settlement → entitlement path with **no real money**. That is the intended first rollout: prove the plumbing before a real credential exists in AWS.

#### `PAYMENT_PROVIDER` — one variable, and no companion

`PAYMENT_PROVIDER` names the gateway **new** mandates register on, and only that:
exactly one of `stub | decentro | cashfree | razorpay`. There is deliberately **no**
"enabled gateways" variable beside it.

Since TAM-152 everything touching an *existing* mandate resolves per row from
`mandates.provider` / `transactions.provider`, so switching gateways moves ACTIVE only
and rollback is the same one-line change with no companion step. Every gateway in the
registry stays resolvable — because a list you have to remember to update is a list
someone forgets, and the entry that gets forgotten is the gateway you just switched
away from, whose subscribers then silently stop being debited.

Adapters are built **lazily**, memoised on first use. A gateway's client reads its
credentials on construction, so building them all eagerly would make an unconfigured
gateway fail the **boot** — "we have not set up Razorpay yet" would stop the service
starting. So `env.ts` requires the credential set of the **active** provider only, and a
missing credential for a non-active gateway costs that gateway's rows
(`mandate_provider_unavailable`, at error, that row skipped) rather than the process.
Every registered gateway can still receive callbacks; one with no configured secret
answers **401**, which the provider retries — better than a 200 that drops a
settlement.

The startup line `payment_module_initialised` reports `provider` and
`resolvable_providers` (the whole registry) — the first thing to read when one
gateway's subscribers stop renewing.

#### One schedule for every gateway — and the `--provider` escape hatch

`billing.js` accepts an optional `--provider=<name>` that restricts the sweep to one
gateway's rows. **The EventBridge schedule does not pass it, and stays a single
`rate(30 minutes)` schedule for all gateways.** The reasoning is that the tick does not
decide when money moves: `npci-window.ts` does, and its execution windows
(00:00–10:00, 13:00–17:00, 21:30–24:00 IST) are **regulatory NPCI rules, identical for
every gateway**. The 30-minute tick only samples them, so a per-gateway cadence would
change nothing about debit timing while doubling Fargate invocations and duplicating
the two-switch arming surface per provider. What genuinely differs per gateway is the
pre-debit-notification lead band, and that lives on the adapter
(`MandateProvider.pdnLeadHours`), inside the one sweep.

The filter exists for two things: halting one gateway's debits during an incident
without stopping the other's revenue, and making a per-gateway schedule a
**terraform-only** change later — the schedule already passes a command override, so
that would need no application change. The Redis billing lock key is scoped to match
(`payment:billing:lock:<provider>`), so two single-gateway runs do not serialise
against each other; a full sweep takes the unscoped key and is mutually exclusive with
everything.

```bash
# same run-task invocation as the dry run below, different command override
"command":["node","--import","./telemetry.js","billing.js","--provider=decentro"]
```

#### Terraform variables (TAM-155)

`modules/stack` gained `razorpay_base_url` / `razorpay_key_id` / `razorpay_key_secret` /
`razorpay_webhook_secret` (sensitive, mirroring the Cashfree shape — the base URL is
wired as a secret too, so the four stay one block and one failure mode). They are
**inert until values are supplied**: the secrets are gated on a `wire_razorpay` local
that requires all four to be non-empty, so a plan that includes them on an env with no
Razorpay values proposes nothing.

**Razorpay has no sandbox host** — `api.razorpay.com` serves both — so test-vs-live is
decided by the `rzp_test_` / `rzp_live_` prefix on the key id, and `env.ts` fails the
boot when that prefix disagrees with `PAYMENT_ENV`. There is no URL to get wrong and no
URL to check; supply the right key.

**Sequence:**

1. Apply with both flags `false`. Resources exist, disarmed. Keep it targeted — `-target=module.stack.module.billing_scheduler` — to dodge the RDS drift below.
2. **Dry run by hand.** Read-only: it reports what the cycle *would* do without calling a provider write endpoint or claiming a cycle.

   ```bash
   cd infra/terraform/envs/stage
   CLUSTER=$(terraform output -raw cluster_name)
   SUBNETS=$(terraform output -json private_subnet_ids | tr -d '[]" \n')
   SG=$(terraform output -raw api_task_security_group_id)
   aws ecs run-task --region ap-south-1 --cluster "$CLUSTER" \
     --launch-type FARGATE --task-definition app-stage-api \
     --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=DISABLED}" \
     --overrides '{"containerOverrides":[{"name":"app-stage-api","command":["node","--import","./telemetry.js","billing.js","--dry-run"]}]}'
   ```

   Then `aws ecs wait tasks-stopped …`, confirm exit code 0, and read the `billing_cycle_report` line in CloudWatch `/ecs/app-stage-api`.
3. Flip `enable_billing_scheduler = true` and apply. Confirm a task appears every ~30 min with `dryRun: false`.
4. **Only then** wire a real gateway's credentials as secrets and set `PAYMENT_PROVIDER` to it — e.g. `DECENTRO_*` + `PAYMENT_CALLBACK_TOKEN` with `PAYMENT_PROVIDER=decentro`, or `RAZORPAY_*` with `PAYMENT_PROVIDER=razorpay`. Separate change, separate review — and see the blocker in `docs/PHASE-NOTES.md` first. **If a previous gateway still has live mandates, its credentials stay** — nothing has to name it, but delete its secrets and its subscribers stop being debited, one logged error per row.

**Most ticks do nothing, by design.** NPCI bars autopay execution outside `00:00–10:00`, `13:00–17:00`, `21:30–24:00` IST, and pre-debit notifications are only valid 24–48h ahead — so the engine skips most of what it looks at. A report of all zeros is normal; `lockBusy: true` means the run was disarmed or another task held the lock.

**Overlap is safe.** EventBridge does not guarantee a task has finished before firing the next. A Redis lock (`payment:billing:lock`) skips the overlapping run, but what actually prevents a double charge is the `(mandate_id, cycle_date)` unique constraint — which holds even when Redis is down. Billing never skips a cycle because Redis is unavailable.

### Terraform state — read this before you apply

**State is remote, in S3** (since 2026-07-27, TAM-128): bucket **`prabhuji-tfstate`** (ap-south-1), key `stage/terraform.tfstate` or `prod/terraform.tfstate`, locked by the native S3 lockfile — no DynamoDB table. `backend.tf` is uncommented in both env roots, so `terraform init` picks it up with no flags. The bucket is versioned, encrypted, public-access-blocked and TLS-only; roll back a bad write with `aws s3api list-object-versions --bucket prabhuji-tfstate --prefix <env>/`.

This repo is a **fork of `monorepo-metaservice`** and is now the main line. Stage was originally provisioned from that repo; its state was copied here on 2026-07-15 (TAM-79) and migrated to S3 on 2026-07-27. Consequences:

- **Never apply stage from the `monorepo-metaservice` checkout.** Its state file is stale twice over now — this repo's serial had already passed it, and the authoritative copy is in S3. Applying from it would fight the live state.
- **The superseded local files** are renamed `envs/stage/terraform.tfstate{,.backup}.migrated-to-s3.bak`. They are gitignored and inert; Terraform reads S3. Do not try to `-migrate-state` them back — the S3 state has its own lineage.
- **`secrets.auto.tfvars` is gitignored** and holds `clickhouse_host` / `clickhouse_password`. It is *not* in git — if you apply without it, `clickhouse_host` defaults to `""` ("feature off"), which **deletes the ClickHouse secrets and silently unwires warehouse migrations**. Copy it from whoever has it before applying. **The S3 backend does not help here** — it stores state, not variables, so this remains single-copy on a laptop.

Always read the plan. Expected diff for a code-only Terraform change is small and confined; if a plan proposes creating dozens of resources, **your state is missing — stop.**

**Applying TAM-120 (admin) is additive.** The first stage apply that includes admin adds only admin's own resources — ECR repo, target group, listener rule (priority 30), task SG (`admin_tasks`), task def, ECS service + autoscaling, and its execution/task IAM roles — reusing the existing VPC/subnets/cluster/ALB listener. It touches **no** shared resource and **no** data plane, and adds no migration. `-target=module.stack.module.admin` (plus the cicd `services` change) keeps the apply confined and dodges the RDS `engine_version` drift below. **Prod admin is intentionally left unapplied** (cleartext HTTP — see the services table above and `#EXPORT_CRITICAL`); wiring it in Terraform does not deploy it.

### Known drift

- ~~**RDS `engine_version`**~~ — **gone as of 2026-07-27.** A full un-targeted plan against stage proposes no `engine_version` change and contains no `aws_db_instance` at all, so the reason TAM-79 was applied with `-target=module.cicd` no longer holds. Confirm on your own plan before relying on it.
- ~~**Telemetry vars**~~ — **RESOLVED**: both env roots now declare and pass through the telemetry variables, so stage's `secrets.auto.tfvars` (`enable_telemetry = true`) takes effect. Consequence for the next stage apply: **both api and events task definitions are replaced** (an `otel-collector` sidecar is added and the task is resized 512/1024 → 1024/2048) and both services roll. `docs/OBSERVABILITY.md`.
- ~~**Bastion AMI drift**~~ — **RESOLVED 2026-07-30**: `aws_instance.bastion` still resolves the *latest* AL2023 AMI, but the resource now carries `lifecycle { ignore_changes = [ami] }`, so a newly published image no longer proposes replacing a running bastion in every plan. This matters more than it used to: the bastion is no longer break-glass-and-off — **both envs now pin `enable_bastion = true`** in `terraform.tfvars`, so the host is standing infrastructure and a silent replace would kill any live port-forward session. Take a fresh image deliberately with `terraform apply -replace 'module.stack.aws_instance.bastion[0]'`.
