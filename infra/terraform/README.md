# infra/terraform — AWS production infra

Two isolated environments — **stage** and **prod** — each a dedicated VPC containing the full stack (ALB, ECS cluster, RDS Postgres 18, ElastiCache Redis, Kinesis, MSK, Secrets Manager) plus one `modules/fargate-service` instance per backend service (`api`, `events`). Both services run as ECS Fargate tasks in private subnets behind one ALB, routed by path. Locally, `pnpm deploy:local` mirrors this via docker-compose + the floci-aws emulator.

## Layout

> Looking for a specific resource? See [NAVIGATION.md](./NAVIGATION.md) — a topic index of the whole tree.

- `envs/stage/`, `envs/prod/` — one root module per environment; **the only directories you run terraform from**. Each pins its own sizes/flags and (once uncommented) its own S3 state key. Applying one env never touches the other.
- `modules/stack/` — everything one environment needs: `network.tf` (VPC, subnets, IGW, NAT, route tables), `main.tf` (SGs, RDS, Redis, Kinesis, MSK, secrets, ALB, ECS cluster), `services.tf` (`module "api"` + `module "events"`), `media.tf` (the admin-CMS media bucket + CDN — see [Media storage](#media-storage-admin-cms-uploads)). **Adding service N+1 = another module block in `services.tf`** (its own ECR/task/service/routing/IAM) + a task SG in `main.tf` + a unique listener-rule priority — it lands in both envs on their next apply.
- `modules/fargate-service/` — reusable: ECR, task def, ECS service + autoscaling, target group + listener rule, execution/task IAM.

## Prerequisites

- Terraform >= 1.7
- `aws` CLI authenticated — verify with `aws sts get-caller-identity` (note the 12-digit account id)
- Docker (only for step 3 — deploying the app images)
- No default VPC needed — each env creates its own network

## Setup & run

All commands run from the env directory: `infra/terraform/envs/stage` or `infra/terraform/envs/prod`. Deploy **stage first**, verify, then repeat for prod (substitute `stage` → `prod` everywhere).

### Quickstart — one command (`scripts/deploy-infra.sh`)

Rather than run raw terraform, use the wrapper — it does `init` + `plan` + `apply`
(create **and** update, safe to re-run) and then the Postgres migration for one env:

```bash
# from the repo root; stage auto-applies, prod shows the plan and makes you type "prod"
AWS_PROFILE=my-profile ./scripts/deploy-infra.sh stage     # or: pnpm deploy:infra stage
AWS_PROFILE=my-profile ./scripts/deploy-infra.sh prod
```

Everything is driven by env vars (only AWS credentials are required):

| var | purpose |
|---|---|
| `AWS_PROFILE` **or** `AWS_ACCESS_KEY_ID`+`AWS_SECRET_ACCESS_KEY` | **required** — standard AWS creds (script aborts if `sts get-caller-identity` fails) |
| `AWS_REGION` | region (default `ap-south-1`) |
| `IMAGE_TAG` | pin both images to this tag instead of the tfvars `:latest` (e.g. a commit sha) |
| `CLICKHOUSE_HOST`, `CLICKHOUSE_PASSWORD` | ClickHouse Cloud creds → stored in Secrets Manager for the warehouse migrate step |
| `ENABLE_CLICKPIPE=true` + `CLICKPIPE_TRUSTED_PRINCIPAL_ARN` + `CLICKPIPE_EXTERNAL_ID` | provision the ClickPipe reader role |
| `AUTO_APPROVE=1` | skip the prod typed-confirmation (for CI) |
| `SKIP_MIGRATE=1` | apply infra only; don't run the DB migration |

**Images are built & pushed by the CI/CD pipeline** (push to `stage`/`main`), not by
this script. So on a brand-new env: run the script once to provision, push to the
branch so the pipeline builds the first image, then the migrate step works (the
script auto-skips it until an api image exists in ECR). The numbered steps below
document what the script automates and the manual equivalents.

### 0. Remote state — DONE, nothing to do

State is in **S3: `prabhuji-tfstate`** (ap-south-1), keys `stage/terraform.tfstate` and `prod/terraform.tfstate`, locked by the native S3 lockfile (Terraform ≥ 1.10 — no DynamoDB table). The `backend "s3"` block is uncommented in both `envs/stage/backend.tf` and `envs/prod/backend.tf`, so a plain `terraform init` picks it up.

The bucket was created out-of-band (a bucket holding state cannot be managed by the state it holds) with versioning, SSE-S3, all four public-access blocks, a TLS-only bucket policy, and a lifecycle rule keeping ≥50 state versions. To recover from a bad write:

```bash
aws s3api list-object-versions --bucket prabhuji-tfstate --prefix stage/
aws s3api get-object --bucket prabhuji-tfstate --key stage/terraform.tfstate --version-id <id> restored.tfstate
```

Setting the same up in a fresh account: create the bucket, enable versioning + encryption + public-access-block, then point both `backend.tf` blocks at it and `terraform init -migrate-state` in each env dir.

### 1. Provision the infrastructure (no images needed)

```bash
cd infra/terraform/envs/stage
terraform init
terraform apply -var api_image=placeholder -var events_image=placeholder
```

Takes **30–45 min** (MSK ~35 min, RDS ~10 min — not a hang). Creates everything: VPC, subnets, NAT, ALB, RDS, Redis, Kinesis, MSK, secrets, ECR repos, IAM, ECS cluster + services. With `placeholder` images the ECS services show failed deployments (`CannotPullContainerError`) and run zero tasks — harmless until step 3.

### 2. Build & push images (when ready to deploy the apps)

From the **repo root**; `<ACCOUNT>` = your account id, repo URLs also via `terraform output -raw api_ecr_repository` / `events_ecr_repository`:

```bash
aws ecr get-login-password --region ap-south-1 \
  | docker login --username AWS --password-stdin <ACCOUNT>.dkr.ecr.ap-south-1.amazonaws.com

docker build -f apps/api/Dockerfile    -t <ACCOUNT>.dkr.ecr.ap-south-1.amazonaws.com/app-stage-api-images:v1 .
docker build -f apps/events/Dockerfile -t <ACCOUNT>.dkr.ecr.ap-south-1.amazonaws.com/app-stage-events-images:v1 .
docker push <ACCOUNT>.dkr.ecr.ap-south-1.amazonaws.com/app-stage-api-images:v1
docker push <ACCOUNT>.dkr.ecr.ap-south-1.amazonaws.com/app-stage-events-images:v1
```

(Prod repos: `app-prod-api-images`, `app-prod-events-images`.)

### 3. Point the services at the images

```bash
cd infra/terraform/envs/stage
terraform apply \
  -var api_image=$(terraform output -raw api_ecr_repository):v1 \
  -var events_image=$(terraform output -raw events_ecr_repository):v1
```

ECS rolls the services onto the new task definition. Ship a new version later the same way with `:v2`. Once each env's branch pipeline is live (see **CI/CD** below), ongoing app deploys are automatic on push — this manual apply is just the initial bootstrap (or a pinned-tag override).

### 4. Migrate the database

The api image ships the Prisma CLI — run it as a one-off Fargate task in the private subnets:

```bash
# values: terraform output private_subnet_ids / -raw api_task_security_group_id
aws ecs run-task \
  --cluster app-stage --launch-type FARGATE \
  --task-definition app-stage-api \
  --network-configuration "awsvpcConfiguration={subnets=[<ONE_PRIVATE_SUBNET>],securityGroups=[<API_TASK_SG>],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"app-stage-api","command":["npx","prisma","migrate","deploy","--schema","./prisma/schema.prisma"]}]}'
```

(Prod: `app-prod` cluster / `app-prod-api` task def + container name. Alternative: port-forward via the bastion below, then `pnpm prisma migrate deploy` locally.)

### 5. Verify

```bash
curl "$(terraform output -raw api_url)/health"     # api via ALB
terraform output                                   # all endpoints
terraform output -raw events_url                   # mobile SDK serverUrl
terraform output -raw kafka_brokers                # MSK bootstrap brokers
aws secretsmanager get-secret-value --secret-id app-stage-events-api-key --query SecretString --output text   # Amplitude apiKey for mobile builds
```

### Tear down

```bash
cd infra/terraform/envs/stage && terraform destroy   # stage only; prod has RDS deletion protection
```

Gotcha: destroy schedules Secrets Manager secrets for a 30-day recovery window, which blocks re-creating the same names. Before re-applying stage: `aws secretsmanager delete-secret --secret-id app-stage-jwt-secret --force-delete-without-recovery` (repeat for `-database-url`, `-events-api-key`).

## CI/CD — auto-deploy (stage + prod)

> **The deploy flow — push → gates → images → migrate → roll — is documented in [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md)**, with a skim-level summary and a detailed version. That file also covers the Terraform state situation (local, unbacked, forked from `monorepo-metaservice`) — **read it before your first apply.** This section is the infra-side reference.

Both environments continuously deploy from a long-lived branch — **stage from `stage`, prod from `main`** — no Jenkins, no GitHub Actions, no CodePipeline. **CodeBuild is this repo's only pipeline: it runs the CI gates AND the deploy.** Promotion flows branch-to-branch: a feature merges to `stage` (auto-deploys the stage env), then `stage` merges to `main` (auto-deploys prod). Each env instantiates `modules/cicd` as its own CodeBuild project — `app-stage-deploy` (webhook on `stage`) and `app-prod-deploy` (webhook on `main`), account-globally distinct names in the shared account. Each build:

1. **runs the CI gates** — `pnpm verify` (arch boundaries, OpenAPI drift, typecheck/lint/unit), the api + events integration suites (testcontainers), and `nx run events:ch-check` (warehouse migration drift) — a red gate stops the build before any image exists (mobile/e2e suites are excluded: no Flutter SDK/emulator on the build image — run `pnpm verify:mobile` / `pnpm e2e:web` locally),
2. builds `apps/api/Dockerfile` and `apps/events/Dockerfile` from the repo root,
3. pushes each image to that env's ECR repo tagged `:<commit-sha>` **and** `:latest`,
4. **applies the Postgres (Prisma) migrations** — a one-off `api` Fargate task with a `npx prisma migrate deploy` command override (`modules/cicd`'s `migrate_task`, TAM-79). It runs here, after the push and before step 5, so the schema leads the code; a non-zero exit fails the build and **no service rolls**. RDS is only reachable from inside the VPC wearing the api-tasks SG, which is why this is a task rather than a build step — the build stays outside the VPC and never holds the DB password. Same invocation as `scripts/deploy-infra.sh` step 5; keep the two in sync,
5. runs `aws ecs update-service --force-new-deployment` on both of that env's services.

Because the migration runs on every push to the env's branch, **old tasks briefly serve traffic against the new schema** while the rollout completes. Additive (expand/contract) migrations are safe; destructive ones are not — follow the two-step deprecation rule in `.claude/skills/migration-patterns/SKILL.md` (add → backfill → remove). There is no approval gate before a migration, which matches the pipeline it sits in: the code roll has no gate either.

Both envs' task definitions reference the mutable `:latest` tag (see each env's `terraform.tfvars`), so the force-new-deployment pulls the fresh image without registering task-def revisions — Terraform remains sole owner of task definitions, and `terraform apply` never fights the pipeline. The `:<commit-sha>` tags exist for traceability and rollback. Because prod also floats `:latest`, it trades pinned-tag rollback for auto-deploy: to revert prod, retag the last-good image as `:latest` and force a new deployment (see "Operating it"). Every prod pipeline resource is named `app-prod-*` and tagged `Environment = prod` (provider `default_tags`), so it never collides with stage in the shared account.

### One-time prerequisite: GitHub credentials

Each project's webhook resource fails to apply (`No source credentials found`) until account-level GitHub source credentials exist. Import them once per AWS account — **both `app-stage-deploy` and `app-prod-deploy` reuse the same credential** (PAT scopes: `repo`, `admin:repo_hook`; never goes in git or Terraform state):

```bash
aws codebuild import-source-credentials --server-type GITHUB \
  --auth-type PERSONAL_ACCESS_TOKEN --token <PAT>
```

### Operating it

Commands below use the stage project; for prod swap `app-stage-deploy` → `app-prod-deploy` and cluster `app-stage` → `app-prod`.

```bash
# watch the latest build
aws codebuild list-builds-for-project --project-name app-stage-deploy --max-items 1
aws codebuild batch-get-builds --ids <build-id> --query 'builds[0].{phase:currentPhase,status:buildStatus}'
# logs live in CloudWatch group /codebuild/app-stage-deploy (or the CodeBuild console)
```

- **Deploy failure**: the ECS deployment circuit breaker halts a rollout whose tasks keep failing; old tasks keep serving. Because stage floats on `:latest`, automatic rollback re-points at the same tag — to truly revert, retag the last good image and force a deploy:

  ```bash
  # find the previous good sha in ECR, then:
  docker pull <repo>:<good-sha> && docker tag <repo>:<good-sha> <repo>:latest && docker push <repo>:latest
  aws ecs update-service --cluster app-stage --service app-stage-api --force-new-deployment
  ```

- **Postgres/Prisma migrations ARE run by the pipeline** (TAM-79): a one-off `api` task runs `prisma migrate deploy` between the image push and the service roll, so the schema leads the code and a failed migration stops the deploy. The one-off `run-task` flow (step 4 above) is now break-glass only — bootstrapping a new env, or a wedged pipeline. Write **additive** migrations: old containers still serve traffic against the new schema during the rollout. (The ClickHouse **warehouse** migration `events:migrate` is also run by the pipeline when that env's ClickHouse creds are wired — stage → `staging`, prod → `prod`.) Full flow: `docs/DEPLOYMENT.md`.
- Builds too slow? Set `docker_layer_cache = true` on the `cicd` module in that env's `main.tf` (best-effort local Docker layer cache).

## Where config lives — three planes, don't confuse them

App configuration reaches the running services through exactly two channels, and a
third exists that has nothing to do with runtime. Getting these mixed up is how a
value ends up readable by the wrong audience, or set in a place the app never reads.

| plane | declared in | how the app sees it | who can read the value |
|---|---|---|---|
| **ECS task env** (plaintext) | `modules/stack/services.tf` → `environment = { … }` | an ordinary env var | anyone with `ecs:DescribeTaskDefinition` |
| **ECS task secrets** | `modules/stack/services.tf` → `secrets = { … }`, value is a **Secrets Manager ARN** | an ordinary env var — ECS resolves the ARN at task start | needs `secretsmanager:GetSecretValue`; the task definition shows only the ARN |
| **CodeBuild env** | `modules/cicd` (`plaintext_env` / `secret_env`) + the `env:` block in `buildspec.yml.tftpl` | **build time only** — never reaches a running task | anyone with `codebuild:BatchGetProjects` |

The app cannot read CodeBuild variables. Today the pipeline passes **no** app config at
all: `module "cicd"` in `envs/*/main.tf` sets neither `plaintext_env` nor `secret_env`,
and the buildspec's only variables are `JWT_SECRET` / `DATABASE_URL` placeholders that
exist purely so the integration suite can boot (testcontainers overwrites
`DATABASE_URL` with the real container URI at runtime). Putting runtime config there
would silently do nothing.

**Which plane a value belongs in** is decided by who is allowed to read it, not by how
secret it feels. `ecs:DescribeTaskDefinition` is a far broader grant than
`secretsmanager:GetSecretValue`, so anything that functions as a credential belongs in
the secrets plane even when it looks trivial.

### Worked example: the OTP test numbers (TAM-149)

| var | plane | value set in | why |
|---|---|---|---|
| `TEST_NUMBERS` | ECS task env (plaintext) | `envs/<env>/terraform.tfvars` — **committed** | the list is not the credential. Knowing a test number without the code just gets you an ordinary, undeliverable OTP. |
| `TEST_OTP` | **Secrets Manager** — `app-<env>-test-otp` | `envs/<env>/secrets.auto.tfvars` — **gitignored** (`*.auto.tfvars`) | it is a login bypass into real production accounts. It never enters git and never appears in a task definition. |

Both are created only when **both** are non-empty (`local.wire_test_numbers` in
`modules/stack/main.tf`), mirroring `wire_msg91`. Half-configured is the dangerous state:
`apps/api`'s `EnvSchema` fails the boot when `TEST_NUMBERS` is set without `TEST_OTP`, so
the task crash-loops rather than coming up with listed numbers quietly receiving a real
SMS that no handset can answer.

Quote `test_otp` in tfvars — an unquoted `0123` is parsed as a number and arrives as `123`.

## Environments at a glance

| | stage | prod |
|---|---|---|
| VPC CIDR | 10.10.0.0/16 | 10.20.0.0/16 |
| RDS | db.t4g.micro, deletion protection **off** | db.t4g.medium, deletion protection **on** |
| Redis | cache.t4g.micro | cache.t4g.small |
| MSK | 2× kafka.t3.small | 2× kafka.t3.small (bump when volume warrants) |
| ECS autoscaling | 1–2 tasks/service | 1–3 tasks/service |
| State key | `stage/terraform.tfstate` | `prod/terraform.tfstate` |
| CI/CD | CodeBuild `app-stage-deploy`, auto-deploys `stage` branch | CodeBuild `app-prod-deploy`, auto-deploys `main` |

Cost note: MSK (~$70–80/mo) + NAT gateway (~$35/mo) + RDS + Redis bill from apply, per env, even with zero traffic. Set `enable_kafka = false` in an env's `main.tf` to skip MSK.

## Media storage (admin CMS uploads)

`modules/stack/media.tf` — the object store the admin panel (TAM-81) uploads into and the mobile app fetches from. Design: `docs/ADMIN-CMS-ARCHITECTURE.md` §A2/§A3/§A7.

**Shape**: a **private** S3 bucket (`app-<env>-media`) fronted by a **CloudFront distribution attached directly to it via Origin Access Control**. The browser presigns a `PUT` and uploads bytes straight to S3 — media never traverses the api task or the ALB. Reads go through the CDN only.

| | Local dev | stage / prod |
|---|---|---|
| Object store | floci-aws S3 (`http://localhost:4566`), bucket `app-local-media` | real S3, **private**, BPA fully on, SSE-S3 |
| Public reader | **none — floci is addressed directly** | **CloudFront + OAC** — the only principal that can read the bucket |
| `MEDIA_PUBLIC_BASE_URL` | `http://localhost:4566/app-local-media` | `https://<distribution>.cloudfront.net` (`terraform output media_public_base_url`) — **never** `*.s3.amazonaws.com` |
| Presign credentials | floci test creds | the **api ECS task role** — no static keys |
| Bucket bootstrap | `floci-init` compose service (`scripts/floci-init.sh`), automatic on `docker compose up -d` | Terraform |

**A locally-uploaded asset is reachable only locally.** floci is a dev convenience; S3 + CloudFront is the product — a phone on a mobile network cannot fetch `http://localhost:4566/...`. Content is entered per environment.

**Invariants — do not "fix" these:**

- **The bucket is private, forever.** All four Block Public Access flags on, ACLs disabled (`BucketOwnerEnforced`), and the bucket policy grants `s3:GetObject` **only** to this distribution's ARN. "Media is public" is about reachability *through the CDN*, not about the bucket. **If a plan ever makes the bucket public, the plan is wrong.**
- **The api task role gets `s3:PutObject` + `s3:GetObject` on `<bucket>/*` and nothing else** (`services.tf` → `local.api_media_statements`). **No `s3:DeleteObject`** — we never delete objects (ADR A6), and withholding the permission makes that structural. **No `s3:ListBucket`** — nothing enumerates the bucket. No wildcard bucket ARN.
- **Versioning is off and there is no lifecycle rule**, on purpose: keys are immutable (`<module>/<entity>/<uuid>.<ext>`), so a replace is a new key and a new URL, and nothing is ever overwritten or deleted. Reconsider only if the never-delete rule changes.
- **CloudFront invalidation is never wired** — not a resource, not a pipeline step, not a script. A new asset is a new URL. **Adding it is a review-blocker.**
- **`MEDIA_ALLOW_INSECURE_URLS` is never set in Terraform.** Its absence is its correct production value; the api hard-fails boot if it is true while `NODE_ENV=production`.
- **Everything in this bucket is world-readable via the CDN by design** (risk A-R1). **Nothing secret, no PII** — devotional media only.

**CORS**: the browser PUTs directly to S3, so `media_cors_allowed_origins` (default `["http://localhost:4200"]`, the Vite dev server — the admin panel is localhost-only this epic) lists the origins allowed to upload. It is an explicit list and a variable validation rejects `"*"`.

## Networking

Each env is a single VPC across 2 AZs:

- **Public subnets** — only the ALB and one NAT gateway.
- **Private subnets** — Fargate tasks, RDS, Redis, MSK brokers. No public IPs; egress (ECR pulls, Secrets Manager, Kinesis) routes through the NAT gateway.

RDS/Redis/MSK security groups admit only the api task SG on their service port; task SGs admit only the ALB. One NAT gateway per env is a cost/availability trade-off (an AZ outage of its subnet stops private egress); VPC endpoints (ecr.api, ecr.dkr, S3 gateway, logs, secretsmanager) are the standard follow-up to cut NAT data charges.

## Connecting to RDS / Redis from your laptop

Both live in the private subnets and admit only the api task SG, so there is **no** path from a laptop by default. `enable_bastion` adds one: an SSM-only host in a private subnet, plus the matching RDS/Redis SG rules. No public IP, no key pair, no inbound rules — `aws ssm start-session` is the only way in, and it is IAM-authorized and CloudTrail-logged. ~$3/month.

**Both `stage` and `prod` pin `enable_bastion = true` in their `terraform.tfvars`, so the host is always there and no `-var` is needed.** The variable still *defaults* to `false` for a fresh env; that default is why the flag must be pinned in a file rather than passed per-apply — `pnpm deploy:infra <env>` passes no `-var`, so a command-line-only value gets reverted (and the host destroyed) by the next routine apply. That happened to prod on 2026-07-29.

One-time local setup: `brew install --cask session-manager-plugin` (needs sudo — it's a pkg installer), and your IAM principal needs `ssm:StartSession`.

Local ports are **one per env**, so both tunnels can be open at once and a query never hits the wrong database:

| env   | Postgres | Redis |
| ----- | -------- | ----- |
| prod  | 5433     | 6380  |
| stage | 1234     | 6381  |

```bash
cd infra/terraform/envs/prod   # or envs/stage — use that env's ports below

# Postgres on localhost:5433 (stage: 1234)
aws ssm start-session --target "$(terraform output -raw bastion_instance_id)" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters host="$(terraform output -raw rds_address)",portNumber=5432,localPortNumber=5433

# Redis on localhost:6380 (stage: 6381) — a SECOND terminal; one remote host per session
aws ssm start-session --target "$(terraform output -raw bastion_instance_id)" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters host="$(terraform output -raw redis_host)",portNumber=6379,localPortNumber=6380
```

The session holds the terminal open; Ctrl-C ends it. With it up, `psql "$(aws secretsmanager get-secret-value --secret-id app-stage-database-url --query SecretString --output text | sed 's/@.*:5432/@localhost:1234/')"`, or point TablePlus / Prisma Studio / `redis-cli -p 6380` at the local ports.

Nothing to turn off — the host is standing infrastructure now, and `aws ssm start-session` requires an IAM principal with `ssm:StartSession` regardless of whether it exists. To retire it in an env, set `enable_bastion = false` in that env's `terraform.tfvars` and apply; don't do it with a `-var`, or the setting will drift back on the next apply.

## Notes

- **Naming**: everything is prefixed `app-<env>` (`app-stage-api`, `app-prod-pg`, …) — both envs share one AWS account, and ECR repos/IAM roles/log groups are account-global, so names must not collide.
- **Routing** (per-env ALB, HTTP :80): `/2/httpapi*` → events (Amplitude V2 collector), everything else → api; unmatched → 404. HTTPS (ACM cert + 443 listener) is a per-project follow-up.
- **Secrets**: `JWT_SECRET`, `DATABASE_URL`, `EVENTS_API_KEY` are generated by `random_password` per env, stored in Secrets Manager, and injected via the task def `secrets` (never plaintext env). Each service's execution role gets `GetSecretValue` on only its own secret ARNs.
- **Least-privilege task roles**: the events task role may `kinesis:PutRecord(s)` on only its own stream; the api task role gets `kafka-cluster:*` on only its own MSK cluster's topics/groups.
- **Kafka/MSK (API domain-event bus)**: an MSK cluster per env (`app-<env>-domain-events`, SASL/IAM auth) for the API's internal domain events (see `docs/EVENT-ARCHITECTURE.md`), distinct from the Kinesis analytics stream. Broker count must be a multiple of the AZ count (2 AZs → 2 or 4 brokers). **The app is not wired to it yet**: `kafka_app_enabled` (default `false`) keeps `ENABLE_KAFKA`/`KAFKA_BROKERS` out of the api task env, because the app's kafkajs client is plaintext (local redpanda) and crash-loops against MSK's TLS + SASL/IAM :9098. Flip it to `true` per env once the client supports IAM auth (spec TAM-14).
- **Scaling**: `min_instances`/`max_instances` drive per-service ECS autoscaling (CPU target-tracking). Fargate cannot scale to zero — `min_instances` must stay >= 1.
- **First-apply drift**: expect occasional account-specific failures (quotas, AZ capacity, MSK version availability) — fix and re-apply is normal.
