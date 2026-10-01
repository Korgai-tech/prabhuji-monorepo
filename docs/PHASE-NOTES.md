# Phase Notes — Consciously Deferred Items

Replaces the untracked `.superpowers/` SDD ledger as the durable record of what's deliberately not done yet.

## Seeds trimmed to skeleton-only (2026-07-20)

The TAM-80 seeds no longer populate **demo content** — they now create ONLY the navigational skeleton: categories, homepage sections/rows, the deity + zodiac taxonomies, the horoscope input flow (mode + step configs + result-background asset), home shortcuts + settings, book section headings, and paywall config. All content tables (`audio_items`, `mantra_audio_items`, `wallpapers`, `home_banners`, `home_feed_items`, `daily_horoscope_result`, `content`/`chapter`, and the `*_tag`/`*_row_item` joins) seed **empty** — content now comes from the content pipeline, not the seed. The only media a seed emits is picsum category/deity/zodiac icons.

Note: boot-seeding was **already removed** from `apps/api/src/index.ts` before this change (it "used to call `runAllSeeds()` after listen" — see the comment there), so seeding is now **explicit + local-only**: `pnpm seed` (force-runs all in dependency order) or `pnpm --dir apps/api seed:<module>`. `pnpm seed` is a plain pnpm script, **not** an nx task, so it does **not** get the root `.env` injected — pass `DATABASE_URL=…` explicitly (see [[nx-injects-root-dotenv]] for the inverse gotcha).

- **`ringtone.seed.ts` + `status.seed.ts` were DELETED** (both were 100% content, no navigation of their own), along with their `pnpm seed:ringtone` / `seed:status` scripts and their `all.seed.ts` steps.
- **Two `all.seed.ts` empty-check sentinels were repointed** off now-empty content tables onto structural ones — wallpaper → `wallpaperHomepageRow`, home → `homeShortcut` — so the non-force `runAllSeeds` path stays correct (correctness hygiene; the CLI `pnpm seed` force-runs regardless of sentinels, and boot no longer calls it). This is the exact "sentinel-table coupling" failure mode flagged as deferred in `specs/TAM-80-stage-boot-seeding.md`.
- **The 8 module route integration tests were gutted to the structural-only contract** (product-owner decision): they assert the skeleton is served and content endpoints return empty, with the content-count assertions → 0. The **content-serving coverage that needed seeded rows was removed** — most notably each module's `#EXPORT_CRITICAL` free-vs-Pro stream-gating proof, plus play/like/filter/pagination/detail tests. **Re-add via per-test content fixtures (not the demo seed) if that coverage is wanted back.** The `deity` migration/seed integration test is unaffected (asserts only the taxonomy).
- This advances the TAM-80 "removal checklist": the demo-content seeding is gone; `all.seed.ts` + the `pnpm seed:<module>` scripts are retained (they now seed the skeleton on demand).

## Phone numbers stored in plaintext; two login types (2026-07-22)

`User` now carries a `login_type` enum (`otp` | `email`) and a plaintext `phone_number`, replacing the peppered `SHA-256(pepper + cc + number)` in `phone_number_hash`. The app authenticates with phone + OTP and holds no email or password; the admin CMS authenticates with email + password and holds no phone. `user_login_type_shape` — a DB CHECK — enforces the split in both directions, so an `otp` row carrying a password is unrepresentable rather than merely discouraged.

This **reverses a documented privacy decision**, deliberately. Hashing meant a DB dump alone could not be rainbow-tabled back to a phone number; it also meant we could not contact a single user. That blocked the payment notifications the billing work needs (a failed debit, an NPCI-revoked mandate) and blocked live OTP outright — `OtpProvider.sendOtp` only ever received a digest, so no SMS provider could send anything, which is why `AUTH_OTP_PROVIDER=dostii` never got past a placeholder. Phone PII is now at rest in plaintext, protected by the same controls as the rest of the database and nothing more.

It also removed the fabricated credentials every phone signup used to invent (`otp-<id>@prabhuji.internal` plus 32 random bytes of hex) purely to satisfy two NOT NULL columns. That junk reached the JWT, the analytics warehouse (as a user `email` property), and the home avatar, which rendered "O" for every phone user.

Deferred / known:

- **EXISTING ACCOUNTS ARE ORPHANED (`#EXPORT_CRITICAL`).** SHA-256 is irreversible, so `phone_number` starts null for every pre-existing user. Their next OTP verify misses the lookup and creates a **new** `User` row, stranding the old row's subscription, mandate, playback history and likes. Chosen knowingly over a dual-key transition. **Before applying to stage, run `SELECT count(*) FROM "User" WHERE phone_number_hash IS NOT NULL;`** through the SSM bastion — if that is meaningfully non-zero, the loss is real and someone should decide again.
- **`phone_number_hash` is still there, unwritten and unread.** Dropping it in this migration would have 500'd every user read during the rollout window: the pipeline migrates before rolling services, and Prisma selects every scalar column by default, so old tasks would query a column that no longer exists — not just on OTP, but on the admin role check that runs per `/admin/*` request. The follow-up drops it and its stale unique index.
- **The CHECK is `NOT VALID`.** Backfilled `otp` rows hold a hash and no number, so they violate the otp branch by construction and an immediately-validated constraint would fail the migration. It is enforced on every future INSERT/UPDATE and grandfathers the legacy rows; run `ALTER TABLE "User" VALIDATE CONSTRAINT "user_login_type_shape"` once those rows are gone.
- **The constraint is duplicated in `src/shared/testing/pg.ts`.** `startTestDb` uses `prisma db push`, which applies only what the Prisma schema can express — and the schema language cannot declare a CHECK. Without replaying it the integration DB would silently lack constraints production has, and any test asserting one would pass vacuously. A Prisma migration is an immutable self-contained `.sql` and cannot be imported, so the two copies are kept in step **by hand**. Adding a CHECK anywhere means adding it in both places.
- **`AUTH_OTP_PEPPER` survives with one job**: bucketing the send-OTP Redis rate-limit key (`phone.bucket.ts`). A raw number there would leak through `MONITOR`, `SLOWLOG` and key dumps.
- **`email` is nullable end to end now** — `AuthUser`, the JWT claim, `PublicUser`. `/auth/me` and `/auth/users` are reachable by phone accounts, so the admin CMS user list mixes both populations and renders an em dash for the ones with no address.

## Recurring-payment scheduler — shipped disarmed, vendor contract unconfirmed (2026-07-22)

The recurring-debit engine (`core/payment/services/billing-cycle.service.ts`) had been complete and fully tested since it was written, but **nothing ever called it** — `runBillingCycle` had no call site anywhere in the repo, so registration and approval worked end to end while monthly debits never fired. That is now closed: `apps/api/src/billing.ts` (a second esbuild entry point alongside `telemetry.ts`) runs one cycle and exits, fired every 30 minutes by an EventBridge schedule → one-off ECS task on the api task definition (`modules/billing-scheduler`).

A second, independent break was closed with it: `presentDebit` answering `pending` is the vendor's *normal* response, but nothing consumed the eventual settlement — the presentation callback and the straggler sweep both re-read **mandate** status and never touched `payment_attempts`, so `settle('succeeded')` was reachable only from a synchronous provider answer. A sixth provider verb (`getDebitStatus`) now feeds the existing `onDebitSucceeded` / `onDebitFailed` handlers from both paths. Fixing it surfaced a related latent bug: `onDebitSucceeded` discarded `bankReferenceNumber` / `npciTransactionId`, so the columns the schema documents as "when a user disputes a charge, this row is the answer" were **never written by either path**. Both are now persisted.

Deferred / known:

- **`is_managed_by_decentro` is still unconfirmed, and it is the hard blocker (`#EXPORT_CRITICAL`).** We send `false`, on the reading that Decentro does *not* schedule PDN + presentation for us. If that reading is wrong, arming this scheduler against the real provider means **both sides present the same debit — a duplicate charge on every subscriber.** `PAYMENT_MANDATE_MANAGED_BY_PROVIDER` is the escape hatch (and the env schema refuses to let it and `ENABLE_BILLING_SCHEDULER` both be true), but no flag can detect a wrong reading of the vendor's semantics. **Confirm with Decentro before step 4 of the rollout in `docs/DEPLOYMENT.md`.**
- **`getDebitStatus`'s endpoint and query-parameter names are a guess.** `PATHS.presentationStatus` mirrors how the mandate status path relates to the mandate link path; the docs also reference a generic transaction-status lookup. It fails closed (an unrecognised or missing status maps to `pending`, never `succeeded`), so the failure mode is a debit that never settles rather than one wrongly settled — but a wrong path means asynchronous settlement silently never completes, visible as a climbing `reconciled` counter with no `debit_succeeded` lines. Joins the six pre-existing `TODO(decentro)` markers.
- **No payment env is wired into Terraform at all.** `services.tf` sets no `PAYMENT_*` or `DECENTRO_*`, so every deployed env runs `PAYMENT_PROVIDER=stub`. Deliberate for the first rollout — arming stage exercises the whole path with no money at risk — but it means **stage is not currently testing the real integration**, and `DECENTRO_*` + `PAYMENT_CALLBACK_TOKEN` still need Secrets Manager entries before it can.
- **Prod's schedule is wired but unapplied**, like admin (TAM-120): `modules/stack` instantiates it in both envs, and `envs/prod` has never been applied. Exposure is controlled by not running `pnpm deploy:infra prod`.
- **EventBridge cannot see what a cycle did.** Its retry policy only covers a failure to *launch* the task, so it is capped at one attempt — a re-run is safe (the unique constraint and the Redis lock both hold) but pointless, since the next tick is 30 minutes away and picks up whatever was missed. There is no alerting on a cycle that runs and reports zeros for the wrong reason; the signal would have to come from the `billing_cycle_report` log line.
- **The billing task boots every module**, because it reuses `bootstrap()` rather than a narrower composition root — `initPaymentModule` depends on the `subscription` and `paywall` facades being registered first, and a bespoke wiring would drift from `src/modules.ts` silently. Costs a few seconds of startup per tick on top of ~30–60s of Fargate cold start. Acceptable while most ticks are no-ops; revisit if the cycle ever needs to run more often than the NPCI windows allow.

## Terraform state / repo ownership — UNRESOLVED (discovered TAM-79, 2026-07-15)

Discovered while applying TAM-79: `prabhuji-monorepo` is a **fork of `monorepo-metaservice`** and is now the main line, but the live stage infra had been provisioned from the *old* checkout, whose `terraform.tfstate` sat on one laptop. This repo had **no state at all** — a plain `pnpm deploy:infra stage` planned **69 to add / 0 to change**, i.e. it would have recreated the whole live environment (colliding on named resources, duplicating the VPC/subnets/NAT). Resolved for now by copying `terraform.tfstate` + `secrets.auto.tfvars` from `/Users/rishabh/code/monorepo-metaservice/infra/terraform/envs/stage/` into this repo, after which the plan read a sane **0 add / 3 change / 0 destroy**. Still open:

- ~~**State is local, unbacked, and single-copy.**~~ — **RESOLVED (2026-07-27, TAM-128).** State now lives in **S3: `prabhuji-tfstate`** (ap-south-1), keys `stage/terraform.tfstate` and `prod/terraform.tfstate`, with native S3 lockfile locking (`use_lockfile = true`, Terraform ≥ 1.10 — no DynamoDB table). The bucket is versioned, SSE-S3 encrypted, fully public-access-blocked, and its policy denies non-TLS access; a lifecycle rule keeps ≥50 newest versions. It was created **out-of-band via the CLI**, not by Terraform — a bucket holding the state cannot be managed by the state it holds. `backend.tf` is uncommented in both env roots. Stage was migrated with `terraform init -migrate-state -force-copy` and verified: 120 instances before and after, identical resource-address set, and a post-migration plan of 9/6/3 rather than the 69-resource recreation. Recover a clobbered state with `aws s3api list-object-versions --bucket prabhuji-tfstate --prefix <env>/`.
  - The migration created a **new lineage** and reset the serial to 1 (an empty destination backend + `-force-copy`). Harmless going forward, but it means the S3 state and the old local file are not reconcilable by Terraform — do not attempt to `-migrate-state` back.
  - The superseded local files were renamed `envs/stage/terraform.tfstate{,.backup}.migrated-to-s3.bak` so they cannot be picked up by accident. They are still gitignored. Delete them once you trust S3.
- **The `monorepo-metaservice` copy of the state is STALE and should now be neutralized** — this repo's serial had already advanced past it, and stage's authoritative state is now in S3. Applying stage from that checkout would fight it. Deleting/archiving it was the stated precondition "once S3 state exists" — that precondition is now met and the cleanup is **still outstanding**.
- **`envs/prod` has never been provisioned** and has no state yet — but it is now **initialized against the S3 backend**, so its first apply writes `prod/terraform.tfstate` there rather than to a laptop. The 113-resource first apply is still ahead (verified by a dry-run plan, see the domain entry below).
- **`secrets.auto.tfvars` is gitignored and single-copy** (`clickhouse_host`, `clickhouse_password`). Applying without it silently sets `clickhouse_host = ""` ("feature off") → **deletes the ClickHouse secrets and unwires `events:migrate` from the pipeline.** No secret store, no documented recovery path.
- **Live drift, fixed in code:** the running `app-stage-deploy` had been repointed **by hand** to `prabhuji-monorepo.git`, while both checkouts' Terraform still said `monorepo-metaservice.git`. Any apply would have reverted the pipeline to the old repo. `envs/{stage,prod}/main.tf` now name this repo, matching reality. **Prod's project is unapplied, so its live source is whatever it was — verify before applying prod.**
- ~~**RDS `engine_version` drift**~~ — **NO LONGER PRESENT (observed 2026-07-27).** A full un-targeted `terraform plan` against stage no longer proposes any `engine_version` change, and no `aws_db_instance` appears in the plan at all. Whatever resolved it (a pin, or the code catching up to `18.3`), the documented reason for applying stage with `-target=module.cicd` is gone. `docs/DEPLOYMENT.md`'s "Known drift" entry said the same thing and has been corrected too. **Re-read the plan before relying on this** — it is an observation of the current plan, not a code change made here.
- ~~**Telemetry vars still unwired**~~ — **RESOLVED** by the ClickStack collector-sidecar change (2026-07-27). Both env roots now declare `enable_telemetry` / `otel_exporter_otlp_endpoint` / `hyperdx_api_key` / `clickstack_clickhouse_database` and pass them into `modules/stack`, so stage's long-ignored `secrets.auto.tfvars` values finally take effect. See `docs/OBSERVABILITY.md`.
- **Collector image is a Docker Hub pull, not mirrored into ECR** (deferred, from the same change): `clickhouse/clickstack-otel-collector:2.30.0` is pinned by **tag, not digest**, and pulled from Docker Hub on every task start — so it is exposed to pull-rate limits and to a tag being re-pointed upstream. If that bites (`toomanyrequests`) or digest-level immutability is wanted, mirror it into ECR the way `api`/`events` already are and set `clickstack_collector_image` to that ref.
- **prod telemetry is armed in code but has no credentials** (deferred): `envs/prod` declares and passes the telemetry variables, but there is no `envs/prod/secrets.auto.tfvars`, so `enable_telemetry` defaults false. Turning it on needs prod ClickHouse Cloud creds — and prod's stack has never been applied at all, so it is part of prod's first provisioning, not a standalone flip.

## TAM-120 — admin CMS hosting reverses "localhost-only" (2026-07-16)

The admin SPA (`apps/admin`) is now hosted like `api`/`events`: a containerized Fargate service (`apps/admin/Dockerfile` → nginx on :8080) behind the **same shared HTTP ALB**, routed on the `/cms` path prefix (listener priority 30, below api's `/*` catch-all at 100), auto-deploying via `modules/cicd` (a third `services` entry in **both** env roots). This **supersedes** the epic's deferred "admin is localhost-only" decision and the `docs/ADMIN-CMS-ARCHITECTURE.md` §D6 **S3 + CloudFront + OAC** design (reframed there, and risks D-R1/D-R2 revised). Why the reversal works without the TLS/domain that §D6 treated as a hard blocker: serving admin behind the same **HTTP** ALB makes admin + API **same-scheme, same-origin**, so there is no browser mixed-content block — the SPA reaches the API via `window.location.origin` (`apps/admin/src/lib/api.ts`). Vite `base: '/cms/'` + react-router `basename` + nginx `location /cms/` keep assets and client routes resolving under the prefix. Deferred / known:

- **Cleartext transport (`#EXPORT_CRITICAL`).** The ALB has only an HTTP listener — admin login sends an admin JWT in the clear and every CRUD edit rides plaintext. **Accepted for stage / internal use.** The hardening follow-up (its own ticket) is a **TLS listener + domain + ACM cert + HTTP→HTTPS redirect** (ideally + edge IP allowlist), required before real editors use **prod**.
- **Prod is wired but deliberately unapplied.** Per the product owner, admin is a normal service in **both** `envs/stage` and `envs/prod` Terraform (no feature flag) — exposure is controlled by **not running `pnpm deploy:infra prod`**. Applying stage realizes admin; prod stays unrealized until the TLS follow-up lands and someone applies it.
- **api.ts 401 redirect is basename-unaware.** The 401 interceptor does a hard `window.location.assign('/login')` (not react-router), which under the `/cms` basename targets `/cms`-less `/login`. Primary login/nav flows use react-router (`<Navigate>`/`navigate`, basename-aware) and work; only the expired-token mid-session hard-redirect lands off-base. Left as-is this ticket (interceptor scope was frozen); fold into the refresh-token/session work.
- **No migration for admin.** It is a static SPA; the pipeline `migrate_task` stays api-only. Applying admin is additive (ECR/target-group/listener-rule/SG/task-def/service/IAM) and touches no shared resource — `-target=module.stack.module.admin` keeps it confined (and dodges the RDS `engine_version` drift).

## TAM-79 deferred (pipeline Prisma migrations, 2026-07-15)

The CodeBuild pipeline now applies Postgres migrations itself — a one-off `api` Fargate task (`npx prisma migrate deploy`) run after images are pushed and **before** `ecs update-service`, so a failed migration fails the build and rolls nothing (`modules/cicd`'s `migrate_task`). This closed a real gap: the pipeline previously rolled code onto an unmigrated database, and only a **local** `pnpm deploy:infra` ever ran migrations. Deferred / known:

- **No approval gate, both envs.** Needs CodePipeline (a manual-approval action); CodeBuild has no such primitive and `infra/` has no CodePipeline. Not a regression: prod **already** auto-deploys — `envs/prod/main.tf` passes `branch = "main"` and `aws_codebuild_webhook` is unconditional. CLAUDE.md's "`main` … deployed manually" and `modules/cicd/variables.tf`'s "main … triggers nothing" were **stale and are corrected**; `infra/terraform/README.md` was already right. If prod auto-deploy is unintended, the bug is the webhook, not the migrate step.
- **APPLIED TO STAGE ONLY.** `envs/prod` declares `migrate_task` but was not applied — the live `app-prod-deploy` project still runs the migration-less buildspec until someone runs `pnpm deploy:infra prod`. Prod's code and its live pipeline are intentionally out of sync until then.
- **No rollback**: a migration that applies but whose code roll then fails leaves the DB ahead of the code. Mitigated by expand/contract discipline, not automation.
- **Expand/contract is now load-bearing** — old tasks serve traffic against the new schema during the rollout, so the migration skill's two-step deprecation rule (add → backfill → remove) is a requirement, not advice.
- **Duplicated invocation**: `scripts/deploy-infra.sh` step 5 and the buildspec each build the same `run-task` call from scratch — two places to change, no shared source. Step 5 stays as the bootstrap (no image in ECR yet) and break-glass path.
- **Image-tag coupling**: the migrate task runs whatever the task-def points at, which is `:latest` (`envs/*/terraform.tfvars`). If `api_image` is ever pinned to a sha, the migration runs that pinned image, not the build's.
- **10-minute ceiling**: `aws ecs wait tasks-stopped` polls 100 × 6s, then fails the build. Fine at current schema size; revisit for long backfills.
- `.claude/skills/migration-patterns/SKILL.md` was corrected in-repo (its "no production environment yet — SOP arrives with Phase 6" text predated Phase 6 being RESOLVED). It is harness-installed, so **mirror this into `krutyug-agent-harness` or the next `install.sh` reverts it** — the same divergence already exists from the earlier `uuid fix` commit.

## Phase 6 / deploy — RESOLVED (TAM-3, 2026-07-02)

`nx build api` now bundles workspace code (`bundle:true`, `thirdParty:false`, `external:["@prisma/client"]`) and `apps/api/package.json` declares the 10 runtime deps, so `pnpm nx prune api` emits a complete artifact (`dist/{index.js,package.json,pnpm-lock.yaml}`). Acceptance verified: `node apps/api/dist/index.js` boots (`/health` + `/ready` OK); `pnpm nx start api` runs it.
Deploy layers: `apps/api/Dockerfile` (runtime image ships the Prisma CLI so the same image can run `migrate deploy` jobs), `pnpm deploy:local` (full stack in compose against the floci-aws emulator), `infra/terraform/` (ECS Fargate + ALB + RDS + ElastiCache + Secrets Manager + optional MSK — `terraform validate` passes but never applied against a real AWS account; see `infra/terraform/README.md`). Migrated GCP → AWS in TAM-5 (2026-07-03); the GCP scaffold (Cloud Run/Cloud SQL/Memorystore/floci-gcp) lives in git history before that.

## TAM-6 deferred (events service, 2026-07-05)

`apps/events` (click-events → Kinesis) consciously defers: Terraform multi-service refactor (shared stack + per-service module; ECS service + ALB target + real Kinesis stream provisioning), retry/DLQ for failed `PutRecords` records (v1 logs and drops), the ClickHouse consumer of the stream, TLS on the listener, and per-client API keys (single shared `EVENTS_API_KEY` for now).

**Update (TAM-7, 2026-07-06)**: transport converted gRPC → HTTP (Amplitude V2 at `/2/httpapi`, port 3001) because mobile tracks clicks via `amplitude_flutter` v4 (`serverUrl`) and no Amplitude SDK speaks gRPC. `packages/grpc-contracts`, the `check:grpc-contracts` drift gate, and all gRPC deps were removed (git history has them if a true s2s gRPC service is ever needed). Also closed the anonymous-user gap: `device_id` added, `user_id` optional (one of the two required), Kinesis partitions by `user_id || device_id`.

**Update (TAM-8, 2026-07-06)**: closed the audit gaps. Terraform refactored to shared-stack + `modules/fargate-service` (api + events both real ECS services behind one path-routed ALB); **events now has full production infra** — Kinesis stream, ECR repo, ECS service, `EVENTS_API_KEY` secret, least-privilege `kinesis:PutRecords` task role. The MSK/Kafka scaffold was removed. Mobile disables Amplitude autocapture (click-only). Events endpoint got a 256 KiB body limit + a floci-Kinesis testcontainers integration test and CI job. Still deferred: PutRecords retry/DLQ (silent-loss tradeoff documented), the ClickHouse consumer (must dedupe by `eventId`), TLS/HTTPS listener, per-client API keys, and a real `terraform apply` (still validate-only — no AWS account).

**Correction (TAM-9, 2026-07-06)**: the MSK/Kafka removal in TAM-8 was mischaracterized as "dead scaffold." Kafka is **planned, not dead** — it is the API's internal domain-event bus (each `core/<module>` emits domain events consumed async by other modules; event-driven modular monolith). It was removed only because no producer/consumer code exists yet, so provisioning was premature. Kafka (internal domain events) and Kinesis (external Amplitude analytics → ClickPipe → ClickHouse) are two independent pipes and **both will exist** — see the new `docs/EVENT-ARCHITECTURE.md`.

**Update (TAM-10, 2026-07-06)**: MSK Terraform re-added as an **opt-in** resource (`enable_kafka`, default off, named `${name_prefix}-domain-events` to avoid the old collision with the Kinesis `events` stream). `enable_kafka=true` provisions the SASL/IAM cluster + SG and conditionally wires the api task's `ENABLE_KAFKA`/`KAFKA_BROKERS` env and a least-privilege `kafka-cluster:*`-on-its-own-topics task role. Still deferred (the "when implementing" checklist in `docs/EVENT-ARCHITECTURE.md`): the api-side `ENABLE_KAFKA` env parsing, `.env.example`/compose wiring, and the `shared/events/` producer/consumer registry. Infra is ready; app code is not.

**Update (TAM-15/16/17, 2026-07-07)**: the "ClickHouse consumer" deferral above is **RESOLVED** — `apps/events/db/` (formerly `db/clickhouse/`) now implements the warehouse (Kinesis → ClickPipe → `events_raw` → `events`, dedup at query by `insert_id`/`eventId` via `LIMIT 1 BY`), plus a persons/`$identify` enrichment layer; the collector was generalized to a scoped `StoredEvent` (see `docs/ANALYTICS-WAREHOUSE.md` + `docs/ANALYTICS-EVENT-CONTRACT.md`). Consciously deferred from this wave: **events/events_raw TTL** (unbounded retention until a one-line migration; owner decision), **Amplitude array/counter identify ops** (`$add`/`$append`/… logged verbatim, not resolved — PostHog scope), **the transitional `event_properties.player_id` identity fallback** (remove once old app builds are gone), **cloud apply + ClickPipe wiring** (user-run per the runbook; Terraform IAM role is opt-in `enable_clickpipe`), and the pre-existing PutRecords retry/DLQ gap (unchanged). Env-root passthrough for the TAM-14 telemetry vars is also still missing (README documents `-var enable_telemetry=…` but `envs/*` declare no such variables — the ClickPipe vars got wired, telemetry's never were).

**Update (2026-07-09)**: the persons / `$identify` enrichment layer from TAM-17 above was **REMOVED pre-release** (not merely deferred-as-planned) — the app is not live yet, so there was no history to migrate. Dropped from the warehouse: the `persons`/`persons_mv`/`persons_state`/`persons_state_mv`/`persons_current`/`persons_current_json`/`persons_dict` objects **and** the server-side `dictGetOrDefault(…)`/`JSONMergePatch` stamp inside `events_mv`. Unchanged: the collector and wire contract (still accept `$identify` on `/2/httpapi`, still forward to Kinesis) and the mobile SDK's client-side identify dedupe (TAM-20). Consequences: **`$identify` still lands in `events_raw` 1:1 but is now consumed nowhere** (`events_mv` keeps its `WHERE eventName != '$identify'` guard), and **`events.user_properties` is the client snapshot as-sent only** — no server-side merge of accumulated user state. **Future**: if identity resolution returns, it ingests on its **own separate Kinesis stream** (a separate pipe), not bolted onto this collector. The removed design + its load-test evidence live in git history (`specs/TAM-17-persons-enrichment.md` is historical).

**Update (2026-07-10)**: the warehouse's 3-object pipeline was **collapsed into a single `events` table**. `events_raw` (landing) and `events_mv` (transformer) are **removed**; the transform now lives in `events`'s **column DEFAULT expressions** (epoch-ms → `DateTime64`, property-bag `String`s → native `JSON`); `groups` is sent as a native JSON object → the `groups` `Map`, and the device/app context is sent **flat** (snake_case) → its promoted typed columns (no `context` blob, no `groupsRaw`, no `JSONExtract`). ClickPipe now writes **directly into `events`** as a clean **1:1 by field name — no overrides**; each row co-locates raw wire columns (camelCase, replay/debug backstop) + derived analytics columns (snake_case). **`$identify` is now dropped at the collector** — `apps/events` skips it before Kinesis (logs a skip, still returns 200), so it never reaches the warehouse. **This supersedes the 2026-07-09 entry above**: `$identify` no longer "lands in `events_raw` 1:1" — there is no `events_raw`, the single `events` table has no insert-time filter, and identity ops must not reach it, so the collector skips them. Trade-off: the single table stores both raw and derived columns per row (storage bloat), but removes the landing table + the materialized view (and its live-pipe rebuild procedure) entirely. Unchanged: `events.user_properties` is the client snapshot as-sent only (no server-side merge), the wire contract still _defines_ `$identify` (producers may send it), and the mobile SDK's client-side identify dedupe (TAM-20) is intact — those `$identify` events are just dropped server-side now.

**Update (2026-07-10, cont.)**: analytics time model reworked. (1) **Timestamps are IST** (`Asia/Kolkata`) — every `DateTime64` column + `event_date` + the monthly partition read IST; the stored instant is unchanged (a UTC epoch), only display/calendar functions are IST. (`now()`/`today()` still follow the server/session tz — pass `'Asia/Kolkata'`.) (2) **Partition switched** from client `event_date` to **`toYYYYMM(server_time)`** (server-receive IST month) so offline/late events don't scatter into stale partitions and TTL stays clean; trade-off is that client-`event_date` filters no longer prune partitions. (3) New wire field **`event_id` → `eventSeqId`** (Amplitude's per-device event sequence) plus two derived columns: **`corrected_time`** (skew-corrected event time `= server_time − (sent_at − event_time)`; the device-clock skew cancels since both stamps are the device clock — falls back to `event_time` when `sent_at` is absent or the clock ran backwards) and **`synthetic_sequence_time`** `UInt64` (`corrected_ms × 1e6 + event_seq_id % 1e6`, a deterministic within-device ordering key). Both are `MATERIALIZED`. All proven locally against ClickHouse; the collector maps `event_id`, defaulting to 0.

**Update (2026-07-10, cont. — SDK wire verified on emulator)**: captured the REAL `amplitude-flutter/4.6.0 → amplitude-analytics-android/1.27.0` payload at the collector (via a new opt-in `EVENTS_LOG_RAW_PAYLOAD` debug flag + a throwaway integration-test probe on a booted emulator). Findings: `time` is sent (epoch ms) ✓; **`event_id` IS sent** (monotonic per-device — so `synthetic_sequence_time` gets a real tiebreaker) ✓; **there is NO per-event `sent_at`** ✗ — the upload time is **`client_upload_time` at the batch level** (ISO-8601). Consequently the initial `corrected_time` (built on per-event `sent_at`) was inert; **fixed** to use the batch `client_upload_time` (parsed ISO/epoch→ms in the collector, stamped on every event as `clientUploadTimeMs`), re-verified against ClickHouse. **Known issue (deferred):** the SDK sends `ip: "$remote"` (a sentinel Amplitude's own server resolves to the request IP); our collector stores it verbatim, so `events.ip` is literally `"$remote"` — either resolve it to the request's remote IP in the collector or drop it. The `EVENTS_LOG_RAW_PAYLOAD` diagnostic is off by default and kept for future wire inspection.

**Update (2026-07-12)**: the `events` table was **collapsed to a single-column snake_case schema — 33 columns** (was 49). The old design co-located two column families per row: camelCase "raw" wire columns duplicating the snake_case "derived" analytics columns, property bags stored twice (as raw `String`s **and** as `JSON`), and separate raw epoch-ms columns. **All that duplication is removed.** Dropped: the camelCase raw duplicates (`eventId`, `eventName`, `userId`, `deviceId`, `pseudoId`, `sessionId`, `eventSeqId`, `reqGuid`, `retryCount`) and the raw-ms columns (`clientTsMs`, `receivedAtMs`, `clientUploadTimeMs`); the raw `String` bag columns (`eventProperties`/`userProperties`/`groupProperties`); and **`sent_at` / `sentAtMs` entirely** (Amplitude V2 sends no per-event `sent_at` — the upload time is the batch `client_upload_time` — so it was unused; removed from the table, the Kinesis wire, the `StoredEvent` domain type, and the input Zod schema). The collector's `toWireRecord` now emits a snake_case, correctly-typed `StoredEvent`, so **ClickPipe writes each field directly into its typed column — 1:1 by name, no overrides**: **timestamps as epoch-ms integers → `DateTime64(3,'Asia/Kolkata')`** and **property bags + `groups` as JSON objects → `JSON` / `Map`** (both verified against ClickHouse's integer→DateTime64-as-ms and JSON-object parsers), context flat. Only **three columns are computed on insert**, all `MATERIALIZED`: `corrected_time`, then `event_date` (`toDate(corrected_time)`) and `synthetic_sequence_time`, both derived from it (so `corrected_time` is declared first); `corrected_time` is computed from the `DateTime64` columns (via `toUnixTimestamp64Milli`), falling back to `event_time` when `client_upload_time` is epoch 0 or precedes the event. **`event_date` derives from the skew-corrected time, not the raw device `event_time`** — an untrusted client clock must not decide which day (hence which leading `ORDER BY` bucket) a row lands in; the `corrected_time` fallback keeps healthy clocks identical. (`event_date` was briefly a `DEFAULT toDate(event_time)` column earlier the same day.) **This supersedes the 2026-07-10 "raw + derived co-located columns" description** — there are no raw duplicate columns anymore. Unchanged: IST timestamps, `PARTITION BY toYYYYMM(server_time)`, `ORDER BY (event_date, event_type, user_id)`, query-time dedup by `insert_id`, the collector's `$identify` skip, and the Amplitude V2 **input** contract (this changed only the internal Kinesis `StoredEvent` wire and the table, not app → collector).

**Update (2026-07-12, cont. — ClickPipe timezone constraint)**: **ClickPipe refuses destination columns whose type carries a timezone** — creating the pipe failed with `destination schema "DateTime64(3, 'Asia/Kolkata')" ... is unsupported [data types with time zones are not permitted]` for `event_time` / `server_time` / `client_upload_time` (the columns ClickPipe writes; the `MATERIALIZED` `corrected_time` wasn't flagged because ClickPipe doesn't map it). **This supersedes the "timestamps are IST via `DateTime64(3,'Asia/Kolkata')` columns" claim in the 2026-07-10 (cont.) and 2026-07-12 entries above.** Fix: **all `DateTime64(3)` columns are now timezone-naive** (a UTC epoch — the stored instant is identical). IST is applied at the calendar boundaries with an explicit arg instead: **`event_date = toDate(corrected_time, 'Asia/Kolkata')`** and **`PARTITION BY toYYYYMM(server_time, 'Asia/Kolkata')`** (and the future TTL `toDate(server_time, 'Asia/Kolkata')`). Consequence: a bare `SELECT event_time` now shows UTC — queries convert per-call (`toDate(event_time, 'Asia/Kolkata')`) or `SET session_timezone = 'Asia/Kolkata'`. Verified locally: `toDate`/`toYYYYMM` accept the tz arg and produce the correct IST value on tz-naive input; `events:ch-check` passes.

## The `User` row is now created at OTP SEND, not at verify (TAM-154, 2026-08-10)

`POST /auth/otp/send` writes the `User` row the moment the request is accepted, so someone who asks for a code and never enters it still leaves a userId and a phone number to follow up on. Previously the insert lived in the verify handler, and a drop-off left nothing at all — the product bottleneck this closes.

The consequence worth internalising: **"a `User` row exists" no longer means the phone was verified.** The new nullable `phone_verified_at` carries that, stamped once on the first successful verify by a conditional `updateMany` whose row count is also where `isNewUser` now comes from (two racing verifies that each *read* a null would both claim to be first). The migration backfills `phone_verified_at = "createdAt"` for every existing `otp` row, which is exact rather than approximate — those rows were inserted *by* the verify handler. The `/auth/otp/verify` response is unchanged, so no app or contract change shipped with this.

Deferred / known:

- **The admin user list now mixes leads with real users.** `buildUserWhere` filters only `role != admin`, sorts newest-first, and its `total` is documented in both `auth.repository.ts` and `apps/admin/src/features/users/use-users.ts` as "the count of app users" — all three statements are now loose. No admin work was in scope for TAM-154. The fix is a `verified` filter next to `notAdmin` (where a querystring cannot disable it) plus a column in the SPA; `<DataTable>` already supports `type: 'select'` filters and passes arbitrary keys through, so it is a server-side change plus one `filterFields` entry.
- **Nothing sweeps abandoned leads.** Rows for phones that never verify accumulate forever. There is no user-iterating job in the repo to hook into, so a TTL sweep is net-new infra (a `billing.ts`-style entry point + EventBridge schedule), and per the `20260727120000_drop_phone_number_hash` precedent, data cleanup must be a separately-reviewed exercise, never a migration side effect. Note that only `firebase_tokens` cascades — every other `user_id` is a logical link, so a sweep must delete `subscriptions` and the rest explicitly.
- **`phone_verified_at` is unindexed.** Nothing filters on it yet; add an index with the lead-list ticket.
- **Free-tier subscription seeding stays at verify.** Leads get no `subscriptions` row, which keeps the sweep above from having to clean two tables instead of one. `getStatus` already returns the free shape when no row exists.
- **`POST /devtools/mark-pro` will now resolve an unverified phone.** Non-prod only (`ENABLE_DEV_TOOLS`), but it is a path that grants entitlement to a number nobody proved they own.

## Phase 2

Wire route `response` schemas (per status code) for richer OpenAPI docs — currently only request bodies are validated/documented (see `// TODO(phase-2)` in `apps/api/src/core/auth/routes/auth.routes.ts`).

## Phase 2 deferred

`@nx/eslint:lint` is deprecated in Nx v24 — migrate to `@nx/eslint/plugin` at the Nx 24 bump.
`nx.json` has a repo-global `test` targetDefault `dependsOn:["^build"]` — revisit/scope before the package count grows.
The 3 auth route handler adapters (`register`/`login`/`me` in `apps/api/src/core/auth/routes/auth.routes.ts`) could become a shared helper if a second module needs the same shape.

## Phase 3 deferred

~~Playwright E2E~~ (done in TAM-3: `pnpm e2e:web` + CI job; android e2e wired as `pnpm e2e:android`) | refresh-token flow | roles/permissions | pagination/search on users | production CORS config (terraform scaffold exists, apply pending).
Create-user form needs error feedback and should not optimistically reset before success confirmation; the create-user mutation path needs a test (both → Phase 5 admin polish). `@nx/eslint:lint` deprecated in Nx v24 — migrate to `@nx/eslint/plugin` at the Nx 24 bump. auth-context react-refresh warning is the idiomatic React-context shape (hook + provider in one file) — accepted.

## Follow-up (no fixed phase)

Revisit Prisma 6.19.3 → 7: v7 moves `datasource.url` out of the Prisma schema into `prisma.config.ts` — plan the migration before bumping.
Consider wiring `/ready` (`apps/api/src/app.ts`) to a real health check (Prisma `SELECT 1` + Redis ping) instead of the static `{ status: "ready" }` stub.

## Phase 4 (Flutter mobile, Android)

- Emulator integration_test PASSED: login -> users list ran on an android-35 arm64 headless emulator against the live API (`flutter test integration_test/app_test.dart -d emulator-5554 --dart-define=API_URL=http://10.0.2.2:3000`). APK builds; unit + widget tests + `flutter analyze` green.
- [DEV half RESOLVED in commit `eda9ba8`; deploy half RESOLVED in TAM-3] `pnpm nx serve api` runs from source via `tsx watch`; the build artifact issue is fixed (see the Phase 6 section above).

### Phase 4 final review (complete)

Whole-branch review (multi-dimension + adversarial verify): `ready-with-fixes`, 0 merge blockers. Fixed in-wave (commits `ddd3271`,`01a85b8`): mobile Users create-form + `createUser` action (spec-gap: was list-only, `register()` was dead code); login now distinguishes 401 auth errors from network/timeout; `parseUsers` redundant success re-check removed; `generate-mobile-models.sh` portable `JAVA_HOME` (set only if unset, prefer `java_home -v 17`); router uses one long-lived `GoRouter` + `refreshListenable` bridge instead of rebuilding per token change. Mobile tests 4→11, `flutter analyze` clean.
Deferred (codegen-cleanup bucket, batch with the unused `*Input` schemas): `ErrorEnvelope` `data: z.null()` (`apps/api/src/core/auth/routes/auth.schemas.ts`) serializes a self-contradictory `enum:[null]` schema → an empty `ErrorEnvelopeDataEnum` in the generated Dart; zero runtime impact (the error path reads `body['message']` directly). Fix = `z.unknown().nullable()` + regenerate `openapi.json` + api-client + mobile models.
Minor (accepted, non-blocking): create-form widget test asserts `register()` is called with entered values but not the `usersProvider` invalidation; login `_error` clears on next submit rather than immediately after a prior failure.

## SAW harness adoption (TAM-1, 2026-07-02)

Adopted `bybren-llc/safe-agentic-workflow` v2.10.0, Claude-only (spec: `specs/TAM-1-adopt-saw-harness.md`; sync config: `.harness-manifest.yml`, remote `harness`). Consciously NOT vendored:

- Linear/Confluence integration (`/sync-linear`, `linear-sop` skill, Linear/RLS hooks) — tickets are in-repo specs (`specs/`); revisit if a tracker is adopted.
- Remote-deploy command family (`/remote-*`, `/deploy-dev`, `/rollback-dev`, `/local-deploy`, `/test-pr-docker`, `/dev-health`, `/dev-logs`) — no deploy infra yet; re-sync from upstream at Phase 6.
- Other provider harnesses (`.gemini/`, `.codex/`, `.cursor/`, `.agents/`, `dark-factory/`) — add to `sync_scope` in `.harness-manifest.yml` when needed.
- markdownlint — repo standardizes on prettier for markdown.
- Skills `stripe-patterns`, `rls-patterns`, `confluence-docs` + `patterns_library/database/rls-migration.md` — no payments, no RLS, no Confluence.

Upstream sync re-adds dropped `.claude/` files — re-delete them after `./scripts/sync-claude-harness.sh sync`.
Sync prerequisites (one-time): `pip install pyyaml` (manifest parsing falls back to legacy without it) and `./scripts/sync-claude-harness.sh init`.

**Update (TAM-2, 2026-07-02)**: harness extracted to its own repo — `~/krutyug/krutyug-agent-harness` (source of truth for all projects). This boilerplate is now LEAN: no vendored `.claude/` workflow, `AGENTS.md`, `CONTRIBUTING.md`, `patterns_library/`, or `specs_templates/`, and the bybren sync machinery above (`.harness-manifest.yml`, `sync-claude-harness.sh`, `harness` remote, PyYAML prereq) was removed with it — the dropped-items list stays as historical record of what was and wasn't adapted. New projects: clone this boilerplate → `bash ~/krutyug/krutyug-agent-harness/install.sh [--prefix X] [--project name]`. Harness changes are made in that repo and re-installed. This repo's ticket history remains in `specs/`.
**Amendment (TAM-2, 2026-07-02)**: an installed copy of the harness is now committed in this repo after all — new projects cloned from the boilerplate inherit it out of the box, and `install.sh --prefix X --project y` rebrands it in the clone. The harness repo remains the source of truth; refresh here by re-running the installer.

## TAM-56 epic — tracked contract-consistency gaps (address before final PR)

- **Aarti like persistence** — RESOLVED (2026-07-14): `core/aarti` now exposes `POST /aarti/audios/:id/like`, a JWT-guarded, Pro-only toggle that mirrors `core/mantras` (`toggleLike` via the shared `engagement` facade, contentType `"aarti"`; no local like table). Returns `{ audioId, liked, likeCount }`; the toggled state is reflected in `likedByMe` on detail/listing (already engagement-sourced from TAM-63). Unit + integration tests added (toggle on→off, like count reflected, free→403, auth required); OpenAPI + `api-client` regenerated. Mobile wiring (TAM-64 repository) is owned separately by the mobile consistency pass.

## TAM-56 epic — dynamic-data gaps CLOSED on the API side (2026-07-15)

Product constraint: _"All the data should be dynamic, everything should come from backend. STRICTLY no static data except for icons."_ A static-data audit of the Flutter app found content hardcoded **because the API had no field/endpoint to serve it**. The backend half is now closed (migration `20260715090000_add_dynamic_content_fields` — purely additive; seeds carry the real values):

- **Home shortcut grid** (was `kHomeShortcuts`: 4 labels + their order, entirely client-side with no server story) → new `home_shortcuts` table + **`GET /home/shortcuts`** (JWT-guarded, active + `sort_order`). A dedicated resource route, NOT a `shortcuts[]` field on `/home/banners`: the module's convention is one resource per route with a resource-named envelope, and the grid must render when banners fail (PRD §9/§16), which a shared response would prevent. `destinationType`/`destinationValue` mirror the `home_banners` convention; **`destinationValue` is a stable allowlist KEY** (`aarti`/`mantras`/`ringtone`/`wallpaper` — module keys the client's existing `HomeDestinations._moduleRoutes` allowlist already resolves), never a URL/path, so an untrusted CMS string can never become a raw deep link.
- **Books section titles** (was hardcoded "Books" / "Newly Added Books" / "Browse Categories" / "All Books") → new `book_sections` table (mirrors aarti's `homepage_sections`). **`GET /books/home` is RESTRUCTURED** (breaking): the bare `carousel`/`categories`/`newlyAdded` arrays become `sections[]` of `{key, title, sortOrder, items[]}` with `kind`-discriminated items, mirroring `AartiSection`. `GET /books` + `/books/categories/:category` now carry a `data.title`. Empty/deactivated sections are omitted (aarti's hide-when-empty rule).
- **Mantra counter options** (was hardcoded `[7, 11, 21, 108, 1008]`) → `/mantras/counter-preference` now serves **`availableTargets: number[]`** beside `repeatTarget`, sourced from the existing `MANTRA_REPEAT_TARGETS` (still the single server-side source of truth for validation, so the picker can never offer a value the `PUT` would 400). Modelled as a plain integer array — **never an OpenAPI int enum**, which breaks the Dart generator (same bug already fixed for `repeatTarget`).
- **Home feed badge copy** (was hardcoded "TRENDING"/"SUGGESTED") → new `home_feed_items.badge_label` + wire `badgeLabel`. Invariant enforced in the service: non-null **exactly** when `badge` is — a badged row whose CMS label is missing is served with BOTH nulled (an unlabelled badge cannot be drawn without the client inventing copy).
- **`WallpaperHomeRow.iconKey`** — audit finding: **already correct, no change needed.** The API serves it on every row and the seed populates all 5 (`top-live→live`, `trending→trending`, `new→new`, `festival-specials→festival`, `liked→heart`). The client ignoring it in favour of a magic `'top_live'` string is a MOBILE-side bug. An integration assertion now locks the contract for the mobile pass.

**Known residue (server-side, honest):** `BooksService.CATEGORY_TITLE` (Chalisa/Aarti/Kavach/Stotram) and `DEFAULT_SECTION_TITLE` remain **server-owned constants**. Both are served to the client (so no app hardcoding), but they are not yet CMS-editable: the category titles have no table, and the section defaults are the fallback for an unauthored/unseeded `book_sections` row (a CMS row always wins). A heading must always be servable, so the fallback cannot simply be dropped — give categories their own table in Phase 2 if ops needs to rename them.

## TAM-56 epic — Material-icon residue audit (fix in TAM-78 closeout)

Every NEW module screen is clean (aarti/mantras/ringtone/wallpaper/status/horoscope: zero `Icons.*`). Remaining `Icons.*` in `apps/mobile/lib`:
- `features/home/presentation/home_screen.dart` — placeholder, replaced by TAM-62.
- `core/router.dart` (books placeholder) — replaced by TAM-76.
- `features/shell/presentation/module_placeholder_screen.dart` — becomes dead code once TAM-62 lands; DELETE at closeout if unused.
- `features/shell/presentation/mandir_coming_soon_screen.dart` — swap to the real Figma mandir asset (`assets/nav/mandir.png`, node I750:6252;750:5529;750:5912).
- `shared/widgets/app_network_image.dart` — image-load error fallback; no Figma source exists for it. Decide: bundle a Figma-sourced mark or accept as a non-design error state.
- `features/paywall/presentation/paywall_screen.dart` (x2) — PRE-EXISTING (TAM-41..55), outside this epic's scope. Leave unless product asks.

Also for closeout: the specs' DoD cites `pnpm check:no-hex-literals` and `pnpm check:figma-tokens-committed`, which DO NOT exist in package.json (every FE agent flagged this). Either wire them (they would machine-enforce the STRICT Figma gate: no raw hex outside theme.dart; every asset present in tools/figma-assets.manifest.json) or strike them from the DoD.

## TAM-56 epic — Home Pro crown badge: DROPPED from Phase 1

The TAM-62 spec called for a Pro crown/VIP badge beside the Home profile avatar. **No crown/VIP node exists anywhere in the Figma file** (`ipSvV1FnmzvV8TK2Ig8Aiq`) — both the Home frame (`285:3464`) and the unified paywall (`493:3349`) were swept. Per the STRICT design-fidelity gate (TAM-56 Decision 2 — nothing invented), the art was NOT authored.

**Product decision 2026-07-15: dropped from Phase 1.** Revisit in Phase 2 if the design owner adds a Figma node; then wire it from the exported asset. Recorded as `intentional` (not a blocker) in `specs/evidence/TAM-62/fidelity/`.

## Horoscope daily content is AI-generated on demand (2026-07-23)

The horoscope module shipped complete end to end (API → CMS → mobile) with **zero content**: the seed creates only the skeleton, so `GET /horoscope/daily` returned `404 RESULT_NOT_FOUND` for every sign, every day — the state the integration test still pins when generation is off. The content pipeline its header promised is now built, in `core/horoscope/services/generation/`.

One OpenAI call per zodiac sign returns all eight sections in **all four languages at once** (`en`/`hi`/`mr`/`te`), which is stored as four `daily_horoscope_result` rows. That is 12 calls a day, not 48, and it is what makes the four languages *translations of one another* rather than four independent readings that disagree about the day. Triggered lazily: the free zodiac-grid read warms missing signs in the background (it fires when the tab opens, seconds before a tap), and `/horoscope/daily` generates on demand as a backstop, bounded by `HOROSCOPE_GENERATION_WAIT_MS` before it answers `409 GENERATION_IN_PROGRESS` — a status the app already renders as "isn't ready yet" with a Retry.

Writes go through `HoroscopeAdminService.createResult`, not the repository, so generated content passes the *same* step-config cross-validation and content-safety re-run as hand-authored CMS content and cannot forge a `contentSafetyStatus`.

**Validation is deliberately thin.** `response-validator.ts` checks SHAPE only — expected keys, right types, non-empty strings, `lucky_number` an integer in range — because Structured Outputs (`strict: true`) already constrains decoding and the check is just an assertion that the guarantee held. Language, length, punctuation and markup rules are stated in the prompt and NOT re-checked: an earlier revision validated all of them (plus an LLM judge second-opinion pass) and it bought regenerations and latency, not correctness. Content SAFETY is the exception and is still enforced, by the pre-existing `content-safety.ts` deny-list, on both the generation and the serve path.

Deferred / known:

- **The Indic deny-lists are machine-authored and UNREVIEWED (`#EXPORT_CRITICAL`).** `content-safety.ts` was English-only regex, which made a `passed` verdict *vacuous* for exactly the three languages now being mass-generated. Hindi/Marathi/Telugu buckets now exist for all five categories, but they were written from the PRD's prohibited list, not by a native speaker — Marathi and Telugu especially. **A native speaker should review `INDIC_DENY_LIST` before this is armed in prod.**
- **Nothing verifies the OUTPUT LANGUAGE.** The prompt asks for each locale by name and warns that Hindi and Marathi are different languages despite sharing Devanagari; no code confirms compliance. That is a deliberate trade (see above) — the consequence of drift is a Marathi user reading Hindi, which is degraded, not harmful. If it turns out to matter, the cheap fix is a second-opinion LLM pass: an LLM *can* tell the two apart where a Unicode-range regex structurally cannot.
- **The seeded `mr`/`te` zodiac names and step titles are machine-authored too.** Without them a Marathi user read Marathi body text under English headings; they still want a review pass (note `तूळ` vs Hindi `तुला`).
- **The LLM judge is an LLM checking an LLM** and can share the generator's blind spots. It fails closed — a transport error or malformed verdict blocks storage.
- **No pre-generated buffer.** Content is generated for *today*, on first demand. A multi-hour provider outage means no horoscope that day, degrading to "being prepared". The fix, deliberately not built, is a scheduled warm job — `modules/billing-scheduler` is a working template for exactly that shape (EventBridge → one-off ECS task on the api task definition).
- **`prompt_version` was dropped** from the spec's storage key. `providerName` records `"openai"`; the determinism key stays the 4-tuple. Regenerating a day overwrites rather than versioning — an editor deletes the row in the CMS and the next request regenerates it, which is also the entire regeneration story (no admin generate route was added).
- **Cold start is hidden, not eliminated.** A user who taps a sign within ~10s of a cold tab-open still sees the Retry state.
- **Generation is gated on `OPENAI_API_KEY` presence** (the `ENABLE_HOROSCOPE_GENERATION` flag was removed 2026-07-23): set a key and generation runs; leave it unset and the module is byte-for-byte its old self — no generator is constructed, no key is read, the daily endpoint 404s. On stage/prod the key lives in Secrets Manager (wired via `modules/stack`), so generation is on by default there; keyless local/CI boots green with generation off.

## Paywall video is CMS-editable; the rest of the paywall is not (TAM-130, 2026-07-28)

`/admin/paywall/config` (GET + PATCH) lets an editor swap the paywall hero video, its poster and the `videoId`, per locale. It exists because the only previous way to change the video was a hand-written `UPDATE` against prod through the SSM bastion, or a force seed re-run. This partially answers `docs/ADMIN-CMS-ARCHITECTURE.md` P3 — **only** for the video; plans, pricing, benefits, legal links and the paywall shell copy stay ops-managed and P3 stays open for them.

Two behaviours are load-bearing rather than incidental, and are covered by tests that will fail if they are "simplified" away:

- **The server computes the diff.** `validateOwnedUrl` rejects any URL our presign flow did not mint, and the seeded values point at public CDNs (`cdn.jsdelivr.net`, `picsum.photos`). If the *client's* diff were what kept unchanged URLs out of the payload, a curl, a retry, or any re-render that resurrected a stored value would 400. The service reads current values first and drops every field already equal to what is stored, so a PATCH echoing the full current state is a clean 200 no-op.
- **The concurrency token is the PARENT `paywall_configs.updatedAt`.** `PaywallTranslation` has no timestamp columns, so the write preconditions on the config row and bumps `config_version` in the same transaction. **Invariant: this only detects concurrent edits because every writer of `paywall_translations` bumps the parent.** A future copy-editing endpoint must do the same, or `PaywallTranslation` must gain its own `updatedAt` (a non-breaking additive migration). Documented on `PaywallConfigRepository.updateVideoTranslationsWithPrecondition` and pinned by an integration test that replays a spent token.

Deferred / accepted:

- **Cross-task cache staleness, up to ~5 minutes.** The paywall caches are in-process LRUs with a 5-minute TTL and prod runs 2–3 ECS tasks, so `invalidate()` only clears the task that served the write; the others self-heal on the TTL. The admin page says so in its copy rather than pretending the change is instant. A shared-cache or pub/sub invalidation is the real fix and is not built.
- **No locale-row creation from the CMS.** Only locales that already have a copy row (`en`, `hi` from the seed) are editable — a new row needs the four NOT NULL copy columns (`title`, `cancelAnytimeText`, `refundPolicyText`, `payNowCta`) this surface does not own. The API returns 400 for an unknown locale; the UI never offers one.
- **No clearing.** A video can be replaced, never blanked: `<MediaUploadField>` has no remove affordance, so the write body deliberately accepts no `null` rather than shipping a contract the UI cannot reach.
- **`hasVideoLocaleFallback` is a dead flag.** It is carried from the DB into `RawPaywallConfig` and read by nothing — absent from the composed public response and from `apps/mobile` entirely. It is deliberately NOT surfaced in the admin view (a switch that controls nothing is worse than no switch). Removing the column is a separate cleanup.
- **The seed no longer owns the video after first write.** `paywall-config.seed.ts` keeps the three video columns in its `create:` branch but dropped them from `update:`, because `pnpm seed` and `pnpm seed:paywall` both force-run and were silently reverting CMS edits on stage.

## Paywall A/B variants: the server half is live, the experiment is INERT (TAM-159, 2026-08-12)

Four paywall screens now exist as data (`vip-membership-v1`, `vip-video-bleed-v1`, `vip-icon-grid-v1`,
`vip-carousel-v1`), assignment is the user's PHONE NUMBER modulo 100 (its last two digits) against a
0–99 bucket map, and the CMS can edit each one's hero, shell copy, layout and minimum app version. **No production user sees a variant yet**, and that is
deliberate — see the gate below.

Supersedes the TAM-130 note above: `/admin/paywall/config` (singleton) is gone, replaced by
`/admin/paywall/configs[/:paywallId]`. Its PATCH wrote the flat `paywall_translations.video_*` columns,
which TAM-159 made dead — the wire now derives the hero from `paywall_hero_media`, so leaving that
endpoint would have let an editor upload a video that silently never reached a device. The two
load-bearing behaviours from TAM-130 (server-side diff, parent-row concurrency token) are preserved and
still pinned by tests; the invariant now has a single writer, `updatePaywallWithPrecondition`, which is
what makes it true rather than merely documented.

Deferred / accepted:

- **The experiment is off until the mobile ticket lands — and the switch is now IN THE CMS.** Each
  paywall row carries `minAppVersion`; the three variants are seeded at `1.1.0`, above every released
  build (pubspec is `1.0.4`), so no real client is assigned one. **The seed loop is create-only, so a
  stage/prod row still at `1.1.0` must be lowered from the CMS — check it before reading any variant
  funnel, because until it moves every user is served the default while `bk_*` events still report
  their assigned arm.** When the app ships its layouts the
  variants activate for that build with no deploy, and if the release slips an editor moves the number
  instead. **This is the most dangerous field in the CMS**: setting it below a version that actually
  contains the layout hands users a screen their app cannot draw. The default paywall is never
  version-checked — it is the fallback and every build has it.
- **`apps/mobile` is untouched.** No layout widgets, no `_ =>` fallback switch, no
  `heroMedia`/`layout` consumption. The wire contract is final and both fields are OPTIONAL precisely so
  the app can be written against it later and survive an API rollback. The generated Dart models were
  regenerated (contract-first chain) but no hand-written Dart changed.
- **~~`paywall_id` is missing from the payment events~~ — RESOLVED, on both sides, with a caveat.**
  The client stamps it on every payment event from `SessionContext` (`payment_bloc._track`, TAM-160) —
  that value is the paywall actually RENDERED, and it is exact. The backend adds it to
  `bk_trial_success` / `bk_subscription_started` too, resolved through
  `IPaywallApi.resolvePaywallIdForUser`; that value is the ASSIGNMENT, because those events fire from a
  provider callback and from the billing sweep and neither has a client `app_version` to gate on.
  **The two can disagree** for a client below the variant's `minAppVersion` (default rendered, variant
  reported). Prefer the client's value where both exist; the backend's exists for the trial CONVERSION,
  which fires weeks later with no app in the loop and which no client event can cover. See
  `docs/PAYMENT-FLOW.md` § the property bag.
- **`insert_id` for the two trial-start events changed shape at the TAM-181 deploy — NO BACKFILL.**
  `bk_trial_success` and `bk_subscription_trial_started` keyed on the MANDATE until TAM-181 and key
  on the USER after it. `events` is append-only and a plain MergeTree, so the old rows keep their
  old keys and cannot be rewritten. **`LIMIT 1 BY insert_id` collapses within each form but not
  across the boundary** — for a window spanning the deploy date, dedupe on `user_id` instead.
  Record the deploy date beside any funnel query that reaches back past it. Full reasoning in
  `docs/PAYMENT-FLOW.md` § the trial-start events.
- **`MandateRepository.applyStatus` is still an unconditional update — deliberately, for now.**
  TAM-181 removed the trial-start duplicates by gating the EMIT once per user, not by closing the
  underlying race: two callers can still both observe a `pending → active` transition and both run
  every other side effect in `onStateChanged` (entitlement grant, deposit settle, first-notification
  raise). Those are individually idempotent, which is why this is survivable. Making `applyStatus` a
  compare-and-set is the real fix and is filed as its own ticket — it changes the behaviour of every
  `onStateChanged` side effect at once, which is why it was not bundled into an analytics fix.
- **~~ONE global version gate~~ — RESOLVED.** The gate is per-paywall now, so "layouts 1–4 shipped in
  1.1.0, layout 5 in 1.3.0" is expressible. The ceiling the single global constant created is gone.
- **Benefit icons are deliberately NOT CMS-controlled.** `PaywallBenefit.icon` is a bundled asset KEY;
  there is no `iconUrl` column, wire field or upload target. The artwork has to match each layout's tile
  size and the palette, and one wrong upload is visible on every paywall at once — that makes it design
  system, not content. Changing a benefit icon is an app release.
- **Only the carousel layout may hold more than one hero row.** The other three render one video and
  ignore the rest, so the admin write path rejects a longer list rather than storing work that never
  renders. Checked against the layout AND the hero lists the save RESULTS IN — not just the patched
  ones, or `layout: carousel → card_hero` with no hero edit would slip through and strand the extra
  rows. Scope follows what moved: a hero edit answers for the locale it rewrites, a layout change
  answers for every locale that already has rows, and an unrelated copy edit on an already over-quota
  paywall is deliberately NOT blocked (the editor did not cause it, and blocking would strand them).
- **Removing a SEEDED hero row and re-adding it needs a re-upload.** Ownership validation skips URLs
  the paywall already holds, so a reorder is free — but once a row is deleted its URL is no longer
  "held", and the seed's public-CDN URLs (`picsum`, `jsdelivr`) were never minted by our presign flow,
  so re-adding them 400s. Only affects seeded/legacy assets; anything an editor uploaded re-validates
  fine. Not worth widening the trust boundary for.
- **Traffic changes need an API deploy.** The bucket ranges are a code constant, not a DB column, so
  stickiness holds exactly as long as that constant does. Accepted trade: a code review and a deploy log
  in front of a change that silently moves users between variants. The CMS `enabled` flag is the
  no-deploy kill switch for a bad variant.
- **The bucket map and the seed must agree, and nothing enforces it.** An id in `BUCKETS` with no
  `paywall_configs` row silently sends that whole slice to the default (the resolver falls back and logs,
  so it degrades rather than breaks — but a quarter of the experiment quietly disappears). Verified by
  hand at seed time; a test asserting the two lists match would need DB access from a unit test or a
  cross-import from `prisma/seeds`.
- **The flat `paywall_translations.video_*` columns are now dead data.** They are still emitted ON THE
  WIRE (derived from `paywall_hero_media`) because shipped APKs read them, but nothing reads the columns
  themselves. Dropping them is a separate migration, safe once no supported build reads the wire fields.
- **Price and legal links are canonical, never per-variant.** `paywall_plans` is one shared row set and
  legal links always resolve from `vip-membership-v1`. Only `paywall_plan_translations` is variant-scoped
  (via a NOT NULL `paywall_id` with a sentinel default — a nullable "canonical means NULL" would have
  lost uniqueness, since Postgres treats NULLs as distinct in unique indexes). A price experiment would
  touch the mandate contract and NPCI timing and is deliberately out of scope.

- **Bucketing costs one user read per paywall load, behind the gate.** The phone lives on the `User`
  table and the JWT carries `{sub, email}` only, so `PaywallService` reads it through
  `performServiceCall("users", u => u.getUserPublic(id))` on every gated request. The version gate is
  checked FIRST, so while the gate is closed this costs zero queries. It fails soft — a users-module
  error serves the default paywall rather than 500-ing the purchase flow.
- **The bucket is PII-adjacent — do not emit it as analytics.** It is `phone_number % 100`, i.e. the
  last two digits, which is trivially reversible into part of someone's number. An earlier draft hashed
  the phone, which made the bucket one-way; plain modulo does not. Report on the resolved `paywall_id`
  instead — that is the dimension the funnel actually needs, and it leaks nothing.
- **Phone bucketing is only as stable as the stored number.** Digits are normalized before slicing, so
  spaces and hyphens are all the same value. But a user who CHANGES their number moves to a different
  variant, and so would a bulk re-format of the column.
  That is inherent to bucketing on the phone rather than the immutable `user.id`; it was an explicit
  product decision. Accounts with no phone (email/admin, and OTP rows between send and verify) get the
  default paywall.

## `transactions.failure_sub_code` is NULL on every pre-deploy row — NO BACKFILL (TAM-186, 2026-09-22)

- **The column starts at the deploy.** `failure_sub_code` (why a payment died, in our own
  vocabulary rather than the gateway's) is written at capture time from the provider's machine
  fields. Every failed row written before the TAM-186 migration landed stays NULL for good: the
  planned one-off backfill was dropped on 2026-09-22, and nothing else writes to existing ledger
  rows.
- **Why it was dropped.** Classifying old rows would have meant matching their `failure_message`
  copy — the one mechanism the live path forbids — and every reader already treats NULL as
  "unknown", which is the honest answer for a row we never classified.
- **What this means for a query.** Bound any distribution over `failure_sub_code` to rows written
  after the deploy. A comparison against the pre-deploy figures in
  `specs/TAM-186-payment-flow-remediation.md` §E1 compares two different measurements (frozen copy
  read by hand vs provider fields read at capture), not one continuous series. Record the deploy
  date beside any funnel query that reaches back past it.
- **What this means for the payment-failure message.** `isRecoverableByTopUp(null)` is false, so no
  pre-deploy row ever qualifies for `bk_payment_recovery_due`. That is the intended behaviour, not
  a gap.

## Ack-first callbacks shipped OFF; pre-warm and sweep pacing deferred (TAM-260, 2026-09-25)

`POST /payment/callbacks/:provider` can now reply 200 as soon as the `webhook_events` row has
committed and process it afterwards from that row (an in-process worker with lease-based claims
and a re-driver). Design and knobs: `docs/PAYMENT-FLOW.md`, "Callbacks can be acknowledged first,
then processed". Deliberately not done, and known:

- **It ships with an EMPTY deferred list**, so merging changes nothing about callback handling —
  Razorpay included. Turning it on for Razorpay is a one-line change of
  `DEFAULT_DEFERRED_CALLBACK_PROVIDERS` in `shared/config/env.ts` (preferred over Terraform: a
  bare `terraform apply` from a laptop strips two live API secrets) or
  `PAYMENT_CALLBACK_DEFERRED_PROVIDERS=razorpay`. Do it outside an NPCI execution window and
  watch `callback_processing_failed`, `callback_stale_claim`, `debit_failed_already_settled` and
  the forwarder's timeouts on the next renewal day. Rollback is the EMPTY STRING, never "unset".
- **Pre-warm / scheduled scaling / pacing `presentDueDebits` (spec D4) is deferred.** The API
  autoscales on CPU at 70 % and this load is I/O-bound, so a renewal window's burst will not
  scale it. With deferral on, the ack is one INSERT and the worker is bounded, so the burst
  becomes a short backlog rather than timeouts. Revisit only if the first renewal day's drain time
  (to be recorded in the spec's Evidence) turns out to matter.
- **`received` rows older than 24 h are never re-driven.** The re-driver's window is rolling (no
  env knob). Anything older was orphaned by a crash before ack-first existed, its money state was
  reconciled by the sweep long ago, and replaying old events on a boot would be a behaviour change
  nobody asked for. List them for a human:
  `SELECT id, provider, kind, received_at FROM webhook_events WHERE status = 'received' AND kind
  <> 'unroutable' AND received_at < now() - interval '24 hours';`
- **Prisma pool size in the deployed tasks is unverified.** `new PrismaClient()` uses the
  CPU-derived default; worker concurrency (4) plus request handlers plus the re-driver must stay
  under it. Queries are released per statement (no interactive transactions on this path), so
  the exposure is pool-wait latency, not deadlock — but it has not been measured.
- **Stage's Razorpay credentials / webhook secret are unverified** (an older note here says
  deployed envs ran `PAYMENT_PROVIDER=stub`). That decides whether the stage burst replay in the
  spec's Rollout can be signed deliveries or has to be synthetic.
- **The spec's burst target arithmetic does not close as written**: 500 rows × 600 ms provider
  double ÷ concurrency 4 is ≈ 75 s, above the "< 60 s drain" line. Either the burst test raises
  `PAYMENT_CALLBACK_WORKER_CONCURRENCY` or the target is restated; the ack-latency targets
  (p95 < 150 ms) are unaffected.
- Out of scope, still open from the same reading: Razorpay payer PII (`email`, `contact`, `vpa`)
  is not in `REDACT_KEYS`; the sibling app receiving 401s from Razorpay (`cricsignal`); widening
  the dedupe key to `X-Razorpay-Event-Id`.

## Chat is FREE — the paywall is dormant, not deleted (2026-09-25)

Product turned the chat paywall off for all three A/B arms (`content_chat`,
`bhagwat_gita_chat`, `kuldevta_chat`). **Nothing was deleted.** The three client gates are intact
and re-arm from one server-side line:

    apps/api/src/core/chat/services/chat.constants.ts
    export const CHAT_REQUIRES_PRO = true;   // currently false

It rides to the app as `GET /users/me → chatConfig.requiresPro`, so **shipped APKs obey the flip on
their next launch — no app release**. The mobile seam is
`apps/mobile/lib/features/chat/chat_paywall.dart` (`chatPaywallRequiredProvider` +
`runChatPaywallGate`); the gates are `open_chat.dart` (entry), `chat_screen.dart`
(`_onKuldevtaChatPressed`), and `chat_bloc.dart` (send-time re-gate, wired at `core/router.dart`).

Load-bearing details, each covered by a test that fails if it is "simplified" away:

- **Silence means UNGATED on the client, ARMED in the bloc — deliberately opposite defaults.** The
  wire parser reads a missing/null/non-bool `requiresPro` as `false`, because a paywall raised on a
  blank or stale payload charges a real user for a product we made free. `ChatBloc`'s constructor
  default is `true`, because an unwired bloc is a coding mistake and a surprise paywall is loud and
  reported in minutes, where a silent revenue leak is not.
- **"Off" must RUN the wrapped action, not just skip the paywall.** Both navigation gates wrap real
  work (swap to the chat branch; complete the kuldevta handoff). `runChatPaywallGate` exists so
  that is written once — hand-rolling `if (requiresPro)` at each site is how you ship a dead Chat
  button.
- **`requiresPro` is a client-behaviour instruction, NOT a permission.** The server has never
  checked entitlement on `POST /chat/messages` and still does not. Turning the flag back on is not
  by itself a security control; a client that ignores it is not stopped. If chat ever needs real
  enforcement, that is `resolveProEntitlement` in `chat.service.ts`, which every other module
  already uses and chat alone does not.

Deferred / accepted:

- **Pro-only CONTENT CARDS inside chat replies stay gated** (`chat.content.ts` still strips
  `playUrl` for a non-Pro caller). Free chat must not become a backdoor around the aarti / books /
  mantras paywalls, which gate the very same rows. Product decision, 2026-09-25.
- **A Pro-locked content card tap is still a silent no-op** (`chat_screen.dart` — `if (isProLocked)
  return;`). No paywall, no toast. Pre-existing; unchanged here.
- **`CHAT_REQUIRES_PRO` is a constant, not an env var.** The `ENABLE_*` flags reach ECS through
  four Terraform files plus `pnpm deploy:infra`, so an env var would not be cheaper to flip — just
  slower to review. Promote it to `boolFromString` if ops ever needs the flip without a deploy; the
  wire contract does not change when you do.
- **Chat paywall analytics stop firing while the flag is off** — no `paywall_viewed` with
  `entry_source: chat`, and `chat_message_sent` never reports `dropped_paywall`. Expected, not a
  regression: there is no paywall to view. The pre-existing attribution mismatch between the three
  gates (entry/CTA use `triggerModule: chat`, the send-time re-gate uses `appOpen`) is untouched
  and still needs analytics sign-off.
