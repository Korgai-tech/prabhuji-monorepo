# Pattern: UUID ids (Prisma / Postgres)

> Stack pattern (monorepo-boilerplate). **STRICT, repo-wide convention** — also
> encoded in the `migration-patterns` skill and the `data-engineer` agent.

## Rule

Every surrogate **primary key `id`** and every **foreign-key column that
references one** is a native Postgres `uuid` — never a bare `String` (which
Prisma maps to TEXT).

- Primary key: `String @id @default(uuid(…)) @db.Uuid` — see [Which version](#which-version)
- FK / logical link to such an id: `String @db.Uuid` (plus `@map(...)` as needed)

Prisma still surfaces these as `string` in TypeScript — `@db.Uuid` only changes
the **column type**, not the client type — so no downstream (`api-client`,
mobile, OpenAPI) regen is triggered by this attribute alone.

## Which version

Not a free choice. Both are the same 128-bit value in the same `uuid` column, so
a table holding both is expected, not drift — but they behave differently under
`ORDER BY`.

| Use | Where |
| --- | --- |
| `@default(uuid(7))` | **identity + payment tables only** — the 11 listed in `docs/UUID-V7-MIGRATION.md`. Time-ordered, so append-heavy ledgers (`transactions`, `payment_provider_api_logs`, `webhook_events`) get index locality instead of scattering B-tree writes. |
| `@default(uuid())` | **v4, everywhere else.** Not legacy, not "not migrated yet". |

**Why content tables must stay v4:** six modules use `ORDER BY id ASC` as their
entire product shuffle — the per-item `sort_order` columns were dropped on
purpose and v4 randomness *is* the replacement (`aarti`, `wallpaper`, `mantras`,
`ringtone`, `home`, `status` repositories). v7 there turns every discovery grid
into oldest-first. Do not "finish the migration".

**Two more rules that fall out of this:**

- **v7 ids are time-decodable** — they publish creation time to the millisecond.
  Never use one where security rests on unguessability (session tokens, public
  S3 object keys, lock fencing tokens). Those stay `randomUUID()`.
- **Never truncate a v7 id.** The first 8 hex chars are pure timestamp, so a
  prefix is not a discriminator. Full id or nothing.

Ids are **never rewritten**. A v4→v7 switch changes the generator for new rows
only; existing rows keep their ids forever.

## Do NOT uuid-ify business identifiers

A column ending in `Id` is not automatically a uuid. **Business / external
identifiers stay plain `String` (TEXT)** because they store human/vendor slugs,
not generated uuids:

| Column                      | Example value          | Type     |
| --------------------------- | ---------------------- | -------- |
| `paywallId`                 | `"vip-membership-v1"`  | `String` |
| `planId` (business)         | `"week"`, `"month"`    | `String` |
| `productId`                 | app-store product id   | `String` |
| `providerSubscriptionId`    | payment-provider id    | `String` |
| `id` (surrogate PK)         | generated uuid         | `@db.Uuid` |
| `userId` → `User.id`        | generated uuid         | `@db.Uuid` |

**Check what the column actually stores before adding `@db.Uuid`.** A cast of a
slug like `"week"` to `uuid` fails with Postgres `22P02 invalid_input_syntax`.

## Example

```prisma
model Subscription {
  id     String @id @default(uuid(7)) @db.Uuid     // payment table → v7
  userId String @unique @map("user_id") @db.Uuid   // holds a User.id (uuid)
  // ...
  activePlanId           String? @map("active_plan_id")            // slug → stays TEXT
  providerSubscriptionId String? @map("provider_subscription_id")  // vendor id → stays TEXT
}
```

Emitted migration SQL:

```sql
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "active_plan_id" TEXT,
    "provider_subscription_id" TEXT,
    ...
);
```

## FK type parity

Postgres requires both sides of a foreign key to share a type. If a PK is
`uuid`, its referencing column must be `uuid` too — a `uuid` vs `text` mismatch
makes `ADD CONSTRAINT ... FOREIGN KEY` fail. When you make an `id` a uuid,
sweep every column that references it.

## Why native `uuid` over TEXT

- 16 bytes vs ~37 for a TEXT uuid → smaller, faster indexes and joins.
- Malformed values rejected by the DB, not silently stored.
- Binary comparison/sort instead of lexical string compare.

## Checklist

- [ ] Every surrogate PK `id` is `@id @default(uuid()) @db.Uuid`
- [ ] Every FK / logical-link column to a uuid id carries `@db.Uuid`
- [ ] Business/slug `*Id` columns left as plain `String`
- [ ] FK constraints reference matching `uuid` columns on both sides
- [ ] `pnpm nx test api --configuration=integration` passes (real Postgres)
