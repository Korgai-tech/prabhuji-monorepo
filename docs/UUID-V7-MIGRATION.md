# UUID v4 → v7 for identity & payment tables

Scope: `apps/api` Prisma ids for **user/identity and payment** tables only.
Paywall CMS and content tables stay v4 — deliberately, see [Excluded](#excluded-and-why).

**Status: wave 1 implemented and verified locally. Not yet deployed —
[Phase 0 preflight](#rollout) is still outstanding.** Wave 2 (user activity) is
not started and may never be.

---

## The one thing to understand first

**This is not a data migration.** UUIDv7 is the same 128-bit RFC 9562 value in the
same Postgres `uuid` column. Only the *generator* changes.

Consequences, all verified against this repo:

- Existing v4 rows stay v4. Forever. They remain valid.
- A table holding both v4 and v7 ids is the **expected** end state, not a broken one.
- No `ALTER COLUMN`, no type change, no index rebuild, no backfill, no lock, no downtime.
- No FK breakage — an id that is never rewritten cannot break a constraint that references it.

Anything that proposes rewriting existing ids is wrong and should be rejected. It would
cascade through `transactions`' self-referential FKs, every id the mobile app has cached
in secure storage, every `pj_mnd_<uuid>` reference already sent to Cashfree/Razorpay,
and every `user_id` already in ClickHouse. There is no upside that pays for that.

**Preconditions, all confirmed:**

| | Status |
|---|---|
| Prisma `6.19.3` | `@default(uuid(7))` available since 5.14 ✅ |
| Postgres `18.4` (local compose + RDS `engine_version = "18"`) | native `uuidv7()`, no extension ✅ |
| Zod `4.4.3` | `z.uuid()` regex is `[1-8]` on the version nibble → accepts v7 ✅ |
| All in-scope `id` columns | already native `uuid` (checked live, not just in migrations) ✅ |

> Zod 3's `.uuid()` used `[1-5]` and **would have rejected v7**. This repo is on Zod 4, so
> it passes — but that makes the Zod major version a load-bearing dependency of this change.
> The regression test in [Step 5](#5-tests) exists to pin it.

---

## Tables to migrate

All 11 currently declare `id String @id @default(uuid()) @db.Uuid`.

### Identity (3)

| Model | Table | Note |
|---|---|---|
| `User` | `"User"` | quoted mixed-case, no `@@map`. Only 1 real inbound FK in the whole DB (`firebase_tokens`); the other 13 user references are logical-only by design |
| `FirebaseToken` | `firebase_tokens` | real FK → `"User"(id)` CASCADE |
| `UserStatusProfile` | `user_status_profiles` | 1:1 user extension row |

### Payment (8)

| Model | Table | Note |
|---|---|---|
| `Subscription` | `subscriptions` | 1 row/user, read on every Pro gate |
| `SubscriptionCancellationRequest` | `subscription_cancellation_requests` | ⚠️ **also has a Postgres-level `DEFAULT gen_random_uuid()`** — needs SQL, see Step 2 |
| `Mandate` | `mandates` | |
| `Transaction` | `transactions` | ⚠️ **also mints one id in application code** — needs a code fix, see Step 3. Highest-churn payment table; biggest index-locality win |
| `PaymentPdnNotification` | `pdn_notifications` | |
| `PaymentProviderApiLog` | `payment_provider_api_logs` | highest raw insert rate in the schema; second-biggest win |
| `PaymentWebhookEvent` | `webhook_events` | note the table name is not `payment_webhook_events` |
| `PaymentCallbackEvent` | `payment_callback_events` | frozen — superseded by `webhook_events`, takes no new writes. Included only so the convention is uniform; zero runtime effect |

`MantraCounterPreference` (`mantra_counter_preferences`) is user-scoped but its PK **is**
`user_id` — there is no generated uuid. Nothing to change.

### Optional wave 2 — user activity (4)

Not required by the ask; do it as a separate PR after wave 1 has soaked, or not at all.

| Model | Table | Verdict |
|---|---|---|
| `RingtonePlaySession` | `ringtone_play_sessions` | **best candidate** — unbounded append, one row per play, no dedupe ceiling |
| `UserLike` | `user_likes` | append/delete on toggle |
| `UserPlaybackHistory` | `user_playback_history` | bounded at 1 row per (user, audio); modest win |
| `MantraRecentlyPlayed` | `mantra_recently_played` | same shape |

**Exclude `EngagementCounter`** (`engagement_counters`) even though user activity drives it:
it has no `user_id` at all, is keyed `(content_type, content_id)`, row count = catalogue
size, and it is UPDATE-heavy rather than INSERT-heavy. v7 buys nothing there.

---

## Excluded, and why

**Paywall CMS (7 tables) and content CMS (35 tables) — do not touch.**

Beyond "not what was asked", there is a hard product reason. Six content modules use
`ORDER BY id ASC` as their **entire product-level shuffle** — the per-item `sort_order`
columns were dropped on purpose and v4 randomness is the replacement:

- `aarti.repository.ts:197` — "stable pseudo-random order — it keys on the uuid `id` alone"
- `wallpaper.repository.ts:206` — "a stable, random-looking order now that the per-item display-order column is gone"
- `mantras.repository.ts:253` — "STABLE SHUFFLE BY id"
- `ringtone.repository.ts:206` — "id-order is an effectively-random but STABLE shuffle"
- `home.repository.ts:861`, `status.repository.ts:27` — same

v7 turns every one of those discovery grids into strict oldest-first. That is a visible
product regression, not a technical one. If v7 is ever wanted on content tables, the
shuffle has to move to `shared/rotation` (already built) or to the `ORDER BY md5(id || :seed)`
already scoped in `ponytail:` comments at `home.repository.ts:371` and `ringtone.repository.ts:142`.

**Also stays v4 — the unguessability boundaries.** These are `randomUUID()` call sites where
time-ordering is an active downgrade:

| Site | Why |
|---|---|
| `media.service.ts:83` | mints the public S3 object key `<module>/<entity>/<uuid>.<ext>`; the immutability contract depends on it being unguessable |
| `local-otp.provider.ts:64`, `stub-otp.provider.ts:35` | `otpSessionId` — a session token. v7 would leak issue time and narrow the guess space |
| `generation-lock.ts:49`, `billing-lock.ts:68` | lock fencing tokens |
| `app.ts:78` | correlation-id fallback — not a row id |
| `pj_mnd_/pj_pdn_/pj_pay_` reference ids (`mandate.service.ts:426`, `pdn.service.ts:84`, `billing-cycle.service.ts:778`) | external business identifiers sent to payment providers; TEXT columns looked up by equality, never range-scanned. No win, and v7 would hand the provider our creation timestamps |
| all of `apps/mobile/lib` (`uuid.dart`, `analytics_enricher.dart`, `firebase_token_sync.dart`) | client-local analytics/device ids, never a Prisma row id |

---

## Change set

Five steps. Total production diff is ~13 lines plus one helper.

### 1. Schema — the actual change

`apps/api/prisma/schema.prisma`, on the 11 models above only:

```diff
- id String @id @default(uuid()) @db.Uuid
+ id String @id @default(uuid(7)) @db.Uuid
```

Prisma's `uuid()` default is **client-side** — the id is minted in Node and sent in the
INSERT. So for 10 of the 11 tables this produces **no SQL at all**.

### 2. The one table that needs SQL

`subscription_cancellation_requests.id` carries `DEFAULT gen_random_uuid()` (hand-written
in `20260801120000_add_subscription_cancellation_requests/migration.sql:25`, unlike every
Prisma-generated migration). Prisma always supplies `id`, so the default is unreachable
through the ORM — but a raw insert or an `INSERT … DEFAULT` would silently mint v4.

Because there is no schema diff, `prisma migrate dev` will report "no changes" and refuse
to emit a file. Force one:

```bash
pnpm prisma migrate dev --create-only \
  --name uuidv7_default_on_cancellation_requests \
  --schema apps/api/prisma/schema.prisma
```

then hand-write:

```sql
ALTER TABLE "subscription_cancellation_requests"
  ALTER COLUMN "id" SET DEFAULT uuidv7();
```

Catalog-only, instant. Repointing rather than dropping keeps the existing safety net.

### 3. The one application-code id

`apps/api/src/core/payment/repositories/transactions.repository.ts:587` mints a
`Transaction.id` with `randomUUID()`, bypassing Prisma's default. It has to — the two
writes in `supersedeCycleClaim` are mutually dependent (`transactions_supersede_shape`
forbids marking a row superseded without naming its replacement, while
`transactions_recurring_cycle_unique` forbids the insert until the old row is released),
so the id must be known before either write.

That constraint is exactly why the change stays client-side: a DB-side `DEFAULT uuidv7()`
approach would not give the id up front and would break this path.

```diff
- const replacementId = randomUUID();
+ const replacementId = uuidv7();
```

### 4. The generator for that one call site

Node 22 has no v7 (`crypto.randomUUID()` is v4-only), so this needs something.
Use the **`uuid` package** — `import { v7 as uuidv7 } from "uuid"`.

`uuid@14` is zero-dependency and 64 KB, so the usual "don't add a dep for one call
site" instinct does not apply here — and the naive alternative is **wrong**, not merely
longer. A hand-rolled `Date.now()` + `randomBytes` implementation is not monotonic
within a millisecond: measured over 50 000 calls it produced an out-of-order pair on
the **second** call, whereas `uuid`'s v7 was strictly increasing across all 50 000.

That matters precisely here. `supersedeCycleClaim` mints a replacement claim for a
mandate's billing cycle, and a retry storm can put two claims in the same millisecond.
Ids that are "v7-shaped but unordered" would silently defeat the ordering the whole
change exists to buy, in the one table where it matters most.

The rule that falls out: **never hand-roll a UUID**. There is no version of this worth
15 lines of bit-twiddling.

### 4b. Where Postgres 18's native `uuidv7()` is used — and where it is not

Three distinct generators produce v7 ids in this codebase. Keeping them straight
matters when debugging:

| Generator | Covers | Notes |
|---|---|---|
| **Prisma `@default(uuid(7))`** | all 11 tables, every ORM insert | Prisma's own internal implementation, minted in Node. This is >99% of ids. |
| **`uuid` package `v7()`** | exactly one call site (`supersedeCycleClaim`) | needed because the id must be known before either write lands |
| **Postgres 18 native `uuidv7()`** | one column default (`subscription_cancellation_requests.id`) | only reachable by a raw SQL insert; Prisma always supplies `id` |

Postgres 18 is confirmed on every environment — `docker-compose.yml` (`postgres:18`),
testcontainers (`postgres:18-alpine`, `shared/testing/pg.ts:124`) and RDS
(`engine_version = "18"`) — so `uuidv7()` needs no extension anywhere.

**Why not push all 11 tables onto the DB default and delete the Node side entirely?**
It reads cleaner, but `@default(dbgenerated("uuidv7()"))` means Prisma no longer knows
the id before the insert — which breaks `supersedeCycleClaim` outright, since its two
writes are mutually dependent and one has to name the other's id up front. Keeping
generation client-side also keeps the id available for logging and events before the
row commits. The DB default stays as a backstop for raw SQL only.

### 5. Tests

`shared/__tests__/uuid-v7-contract.test.ts` pins the two properties the rest of the
codebase assumes about a v7 id, and deliberately does **not** re-test the `uuid`
package's own implementation:

1. **`z.uuid()` and `z.string().uuid()` accept it.** Load-bearing — Zod 3's `.uuid()`
   pinned the version nibble to `[1-5]` and would reject every v7 id, including on
   *response* schemas like `CancellationRequestData.id`, which would 500 in production
   rather than fail cleanly at the request boundary. A version range in `package.json`
   cannot catch a downgrade; this assertion can.
2. **String order equals the byte order Postgres sorts `uuid` on**, so reasoning about
   id ordering in JS matches what the database actually does.

One existing test needs fixing: `subscription-cancel-request.integration.test.ts:89`
builds `mandate_${input.userId.slice(0, 8)}`. Under v7 the first 8 hex chars are pure
timestamp, so two users minted in the same millisecond collide. It is the only
id-prefix truncation in the repo. Replace the slice with the full id.

The OTP tests that assert `-4[0-9a-f]{3}-[89ab]` (`otp.routes.integration.test.ts:76`,
`otp.service.test.ts:166`, `local-otp.provider.test.ts:162`) are **correct as-is** —
they cover `otpSessionId`, which stays v4 on purpose.

### Not needed

- **No codegen chain.** Prisma defaults never reach the Zod schemas, so `openapi.json` /
  `openapi.public.json` are unchanged, and `api-client:generate` / `mobile:generate` are
  no-ops. `pnpm check:openapi` will pass untouched.
- **No mobile or admin change.** Both treat ids as opaque strings; the Dart generator
  emits plain `String` and there is no client-side UUID validation anywhere.
- **No ClickHouse change.** `user_id` is `String`, not a `UUID` column. It is the third
  component of `ORDER BY (event_date, event_type, user_id)` and the *leading* column of
  `sessions_projection` — v7 is mildly **better** there (same-cohort users cluster,
  improving compression). Kinesis shards on MD5 of the partition key, which v7's shared
  prefix does not concentrate.

---

## Rollout

The deploy model is expand/contract by force: migrations run as a one-off ECS task while
the *previous* version's tasks are still serving (TAM-79). So for a window, old tasks mint
v4 and new tasks mint v7 into the same tables simultaneously.

**That window is a non-event here** — mixed versions in one column is the design, not a
transient state to be drained. This change has no expand/contract hazard at all, which is
unusual and worth stating explicitly.

**Phase 0 — preflight (read-only, both envs).** Confirm `id` is really `uuid` and not
`text` in stage and prod, not just in `schema.prisma`. Stage has a documented history of
`"User".id` being `text`, and prod's schema is known to lag `main`. Connect via SSM
(see the runbook) and run:

```sql
SELECT table_name, data_type, column_default
FROM information_schema.columns
WHERE column_name = 'id'
  AND table_name IN ('User','firebase_tokens','user_status_profiles','subscriptions',
                     'subscription_cancellation_requests','mandates','transactions',
                     'pdn_notifications','payment_provider_api_logs','webhook_events',
                     'payment_callback_events');
```

A `text` column is **not a blocker** — a v7 uuid is still a 36-char string and inserts
fine. But it changes what Step 2's `ALTER` is allowed to say, so know before you go.

**Phase 1 — the PR.** Steps 1–5, one commit. `pnpm verify` +
`pnpm nx test api --configuration=integration` (testcontainers uses `db push`, which emits
the same DDL, so nothing changes there either).

**Phase 2 — stage.** Merge to `stage`. Stage runs against a **live Decentro/Razorpay host
with production credentials and a prod DB restore** — real money. Nothing here touches the
billing path's logic, but stage is where a v7 id first travels to a payment provider as
`<referenceId>@no-reply.prabhuji.app`. Do one real mandate registration and one debit
cycle end-to-end before promoting.

**Phase 3 — soak.** Leave it a few days. The verification query below should show both
versions on `transactions` and `webhook_events`.

**Phase 4 — prod.** Merge to `main`. Never apply prod Terraform during the build — the
task-definition replacement kills the pipeline's migrate step.

---

## Verification — what was actually run

Evidence from the implementation pass, not predictions:

| Check | Result |
|---|---|
| `prisma validate` | schema valid — Prisma 6.19.3 accepts `@default(uuid(7))` |
| `prisma migrate diff --from-migrations --to-schema-datamodel` | **byte-identical to the pre-change baseline.** `@default(uuid(7))` emits no SQL for any of the 11 tables; the one drift line (`subscription_cancellation_requests` DROP DEFAULT + the `firebase_token` index rename) pre-dates this change |
| DMMF scan of all 58 uuid PKs | exactly **11 generate v7, 47 generate v4**, and every model matches the intended bucket — no over- or under-reach |
| live insert probe (isolated DB) | `User`, `Subscription`, `FirebaseToken`, `UserStatusProfile`, `SubscriptionCancellationRequest`, `PaymentProviderApiLog`, `Transaction` all minted `…-7xxx-…`; `Deity` still minted v4 |
| `ALTER … SET DEFAULT uuidv7()` | applied cleanly to Postgres 18.4, then reverted — the local dev DB is untouched |
| `pnpm verify` | ✅ arch boundaries, OpenAPI drift (both contracts), media targets, entitlement single-read, typecheck + lint + unit across 5 projects. 79 files / 1231 tests |
| `pnpm nx test api --configuration=integration` | ✅ 34 files / 299 tests against real Postgres via testcontainers |
| `apps/api/src/shared/__tests__/uuid.test.ts` | ✅ 5 tests, incl. the Zod-acceptance assertion |

The migration was **not** applied to the shared local dev DB: its
`_prisma_migrations` has 42 rows against this branch's 40 directories, i.e. it is
ahead of this branch. Applying from here would have been wrong.

## Verification — after deploy

Run in any env after deploy. Both rows appearing is the success condition, not a warning:

```sql
SELECT substring(id::text, 15, 1) AS uuid_version, count(*), max(created_at)
FROM transactions
GROUP BY 1 ORDER BY 1;
```

Every row created after the deploy should be version `7`; everything before, `4`.
Repeat for `"User"`, `mandates`, `webhook_events`.

---

## Risks accepted

1. **v7 ids are time-decodable.** Anyone holding a `User`/`Mandate`/`Transaction` id can
   read its creation time to the millisecond. That id appears in log lines and support
   tickets (`auth.repository.ts:147` documents ids getting "pasted whole, out of a log
   line"), in the ClickHouse `user_id` column, and — via `<referenceId>@no-reply.prabhuji.app`
   — is handed to Razorpay and Cashfree. This is inherent to v7 and is the price of the
   change. It is not enumeration: 74 random bits remain.
2. **Test factories drift.** ~20 test files fabricate `userId`s with `randomUUID()` (v4).
   They stay correct, but stop resembling production ids. Not worth churning.
3. **Zod major version becomes load-bearing.** Covered by the Step 5 assertion.
4. **Docs to amend**, all of which state the id rule version-neutrally today:
   `patterns_library/database/uuid-ids.md`, `.claude/skills/migration-patterns/SKILL.md`,
   `.claude/agents/data-engineer.md`, and the `schema.prisma` header comment. The last
   three are **harness-installed** — mirror the edit into `~/krutyug/krutyug-agent-harness`
   or the next `install.sh` silently reverts it (`docs/PHASE-NOTES.md:84`).

---

## Revert

Two steps, both ordinary:

```bash
git revert <commit-sha>          # schema + the uuid dep + the one call site
```

Then, if you also want the DB-level default back on the one table that has one, a new
migration containing:

```sql
ALTER TABLE "subscription_cancellation_requests"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
```

That second step is optional — the default is unreachable through Prisma, which always
supplies `id`, so leaving it as `uuidv7()` is harmless.

**Do not revert the data, and there is no script that will.** Rows already minted as v7
keep their ids; the table simply goes back to accumulating v4 alongside them. Mixed
versions in one `uuid` column is the normal end state, both forwards and backwards.
Rewriting existing ids is the catastrophic option described at the top of this document.

Sanity check afterwards (both versions appearing is correct, not a warning):

```sql
SELECT substring(id::text, 15, 1) AS uuid_version, count(*), max(created_at)
FROM transactions GROUP BY 1 ORDER BY 1;
```
