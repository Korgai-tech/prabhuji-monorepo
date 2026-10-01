# Admin CMS — Architecture Decision Record (TAM-81)

**Status**: Accepted (decision record; specs + code follow)
**Epic**: TAM-81 — full admin CMS panel for the Prabhuji platform
**Branch**: `TAM-81-admin-cms` (off the TAM-56 epic branch — all 8 content modules present)
**Date**: 2026-07-16
**Author**: System Architect

---

## 0. Context

### The ask

> "Create an admin panel so I can upload, see and modify the data."

TAM-56 Scope Decision 1 deliberately deferred the admin UI: **Postgres IS the Phase-1 CMS store**, populated by committed `*.seed.ts` files. Ten module schemas carry comments saying "the write-side of these tables is owned by CMS/ops (Phase 2 admin UI); the API only reads." This epic is that Phase 2.

TAM-80 made it worse in a useful way: stage now boot-seeds empty tables with **picsum photos and SoundHelix sample MP3s**. There is no path from "demo content" to "real content" that does not go through a human editing rows by hand. That is the gap TAM-81 closes.

### Confirmed product decisions (inputs, not up for re-litigation)

1. **Real S3 upload** — admin uploads a file, it lands in object storage, the URL is stored in Postgres. floci-aws locally; new Terraform (bucket + CDN + IAM) for stage/prod.
2. **Use the EXISTING admin design system** — `apps/admin` already has shadcn-style components + Tailwind v4. No Figma exists for admin and none will be supplied. **The STRICT Figma fidelity gate (TAM-56) applies to `apps/mobile` ONLY** and is explicitly NOT imposed here.
3. **Full CMS scope** — all 8 content modules + taxonomy.
4. **Media stays PUBLIC** — no short-lived signed URLs for Pro content in this epic (product owner, 2026-07-16). See [A5](#a5-no-signed-urls-for-pro-media--product-decision).

### What exists today (verified, not assumed)

| Thing | State |
| ----- | ----- |
| `apps/admin` | React 19 + Vite SPA. Router with exactly 2 routes (`/login`, `/users`). `AuthProvider` (JWT in `localStorage` under `admin_token`). `lib/api.ts` = typed `@repo/api-client` + Bearer injection + 401→`/login`. `lib/query.ts` = TanStack Query. **One** UI primitive: `components/ui/button.tsx`. |
| `apps/api` | Fastify 5 layered modular monolith. 16 modules; all 8 content modules present (`aarti`, `mantras`, `ringtone`, `wallpaper`, `status`, `horoscope`, `books`, `home`) + `deity`/`engagement` foundation. |
| Layering | `pnpm check:arch-boundaries` enforces Route→Controller→Service→Repository, Prisma only in `repositories/`, `shared/` never imports `core/` (type-only facade allowlist). |
| `User` model | `id`, `email`, `name?`, `passwordHash`, phone/onboarding fields. **NO role field.** |
| Auth | `/auth/login` = email+password → JWT `{sub, email}`, `JWT_EXPIRES_IN` default `1h`. `authMiddleware` verifies via the `auth` facade. **`/auth/register` is PUBLIC** (no guard). |
| Mobile auth | `/otp/*` — phone+OTP. `otp.repository.ts` inserts a **stub row**: `email = otp-<uuid>@prabhuji.internal`, `passwordHash = randomHex(32)`. That hex is **not a bcrypt hash**, so `bcrypt.compare` can never succeed → **mobile users physically cannot use `/auth/login` today.** |
| Media contract | `shared/schemas/media.ts` → `mediaUrl = z.url({ protocol: /^https$/ })`. Absolute https strings in TEXT columns. No blob storage, no `MediaAsset` join table. Pro-gating = the owning service **nulls the URL field** before serialization for free callers. |
| Infra | `modules/stack` = VPC/ALB/ECS/RDS/Redis/Kinesis/MSK/Secrets. `modules/fargate-service` × 2 (`api`, `events`). **NO S3 bucket. NO CloudFront. NO TLS listener. NO hosting for `apps/admin` whatsoever.** |
| Codegen | `apps/api/openapi.json` → `packages/api-client/src/types.ts` (admin) **and** → `apps/mobile/lib/api/generated/**` (Dart, via `--global-property models`, which emits a model for **every schema in the document**). |

### Two findings that shape everything below

1. **Mobile and admin do not actually share a login today.** They share a `User` table and a JWT format, but the OTP path produces accounts with no usable password. This makes a `User.role` column materially safer than it first appears — see [B1](#b1-userrole-enum--not-a-separate-admin-model-not-a-jwt-claim).
2. **The Dart generator emits a model per schema in `openapi.json`.** Admin write schemas would land in the mobile app's generated code verbatim. This is not cosmetic — it is the reason for [D5](#d5-openapi-split--openapijson-stays-the-source-of-truth-openapipublicjson-feeds-mobile).

---

## A. Media storage + upload

### A1. Presigned PUT direct-to-S3 — NOT API-proxied multipart

**Decision**: The browser uploads bytes **directly to S3** using a presigned `PUT` URL minted by the API. The API never sees the file body.

**Options weighed**:

| Option | Verdict |
| ------ | ------- |
| **API-proxied multipart** (`@fastify/multipart`, bytes through the Fargate task) | **Rejected.** The api task is sized for JSON. Audio and video are the whole point of this CMS (`audio_stream_url`, `preview_video_url`, `live_wallpaper_asset_url`, chapter audio) and run to tens of MB. Streaming them through Node ties up the event loop and task memory for the duration of an upload, on a service with `min_instances` as low as 1 — a single 80 MB upload on a slow office link degrades the API for every mobile user. It also collides with the ALB's 60s idle timeout and needs a body-limit raise on a shared instance. The only thing it buys is server-side byte inspection, which we are not doing anyway (no AV scanning — see [A9](#a9-tracked-risks--accepted-tradeoffs)). |
| **Presigned POST policy** (`createPresignedPost`) | Viable; supports a true `content-length-range`. **Rejected for ergonomics**: it requires multipart form assembly in the browser and returns an opaque field bag. The PUT variant pins Content-Type and Content-Length as *signed headers*, which gets us the same enforcement (see below) with a one-line `fetch`. |
| **Presigned PUT** | **Chosen.** |

**Enforcement details** (these are the AC, not decoration):

- The presign request is validated at the Zod boundary: `{ module, entity, field, filename, contentType, sizeBytes }`.
- **Content-Type allowlist is per (module, field)** — e.g. `aarti.audioStreamUrl` accepts only `audio/mpeg`; `deity.iconUrl` accepts only `image/png|image/webp|image/svg+xml`. A generic "images and audio" allowlist is not good enough: it lets an editor put an MP3 in a thumbnail slot and discover it in the app.
- **`Content-Type` and `Content-Length` are signed headers** on the presigned PUT. S3 rejects the upload if the browser sends anything else. This is what makes the client-asserted size/type trustworthy — the assertion is made at presign time, to the API, and S3 enforces it at PUT time.
- **Max size is per media class** (image / audio / video), enforced at presign (reject) and by the signed `Content-Length`.
- Presign TTL: **5 minutes**. Long enough for a slow client to start, short enough that a leaked presign is not a write primitive.

### A2. Bucket is PRIVATE; CloudFront OAC serves it publicly

**Decision**: S3 bucket with **Block Public Access fully ON**, SSE-S3 encryption, no ACLs. A **CloudFront distribution with Origin Access Control (OAC)** is the only reader. The distribution is public and unauthenticated.

**Why this and not a public bucket**: the product decision is that *media is publicly readable*, not that *the bucket is public*. OAC delivers identical public reachability while keeping the bucket itself unreadable by anything but the distribution. It costs one extra Terraform resource and removes an entire class of misconfiguration (bucket-policy drift making the bucket listable). There is no tradeoff to weigh — it is strictly better.

**Consequence**: the origin is never addressed directly. `MEDIA_PUBLIC_BASE_URL` is always the CloudFront domain, never `*.s3.amazonaws.com`.

**Custom domain**: **deferred, flagged for product** ([E4](#e4-decisions-that-need-product-not-engineering)). A custom CDN domain needs a domain we control + an ACM cert in `us-east-1`. Stage/prod ship on the default `d111111abcdef8.cloudfront.net` domain until product supplies one. This is safe to change later — it is a DNS/cert change plus a `MEDIA_PUBLIC_BASE_URL` flip, and because keys are immutable ([A3](#a3-immutable-keys-never-overwrite-no-versioning-no-invalidations)), old URLs can be redirected rather than rewritten.

### A3. Immutable keys, never overwrite, no versioning, no invalidations

**Decision**:

```
Key layout:  <module>/<entity>/<uuid>.<ext>
Examples:    aarti/audio-item/9f2c1e4a-....mp3
             deity/icon/3b7d0a11-....webp
             wallpaper/live-asset/c41e88f2-....mp4
```

- The **uuid is minted server-side at presign**. The client's `filename` is used **only** to derive the extension, and the extension is re-derived from the allowlisted `contentType`, not trusted from the filename. A caller cannot influence the key.
- **Objects are never overwritten.** "Replace this wallpaper's image" = presign a new key → upload → update the row's column. The old object is orphaned by design.
- **Bucket versioning: OFF.** Versioning protects against overwrite and delete. We never overwrite and we never delete ([A6](#a6-deleting-a-row-does-not-delete-the-object)). It would be pure cost and noise. (Explicitly reconsider if [A6](#a6-deleting-a-row-does-not-delete-the-object) is ever revisited.)
- **`Cache-Control: public, max-age=31536000, immutable`** set at upload time.
- **CloudFront invalidation is never needed and must never be wired.** A new asset is a new URL. This is the single biggest operational benefit of immutable keys and it is why "overwrite in place + invalidate" was rejected: invalidations are async, rate-limited, billed, and routinely leave a stale asset in some edge for minutes — an editor replacing a wrong image would see the old one and re-upload in a loop.

### A4. The API owns the URL written to Postgres

**Decision**: three-step, and step 3 is not optional.

1. `POST /admin/media/presign` → API mints `key`, returns `{ uploadUrl, publicUrl, key, expiresAt }`.
2. Browser `PUT`s bytes to `uploadUrl`.
3. Admin submits the entity form carrying `publicUrl`. **Before writing the row, the owning module's service:**
   - **validates the URL is one we minted** — it must start with `MEDIA_PUBLIC_BASE_URL` and its key must match the expected `<module>/<entity>/<uuid>.<ext>` shape for *that field*; and
   - **HEADs the object** (via the `media` facade) to confirm it exists and its stored content-type matches the field's allowlist.

**Why step 3 exists**: without it, "the API owns the URL" is a fiction. The entity `PATCH` body is just a string field — an admin (or anything holding an admin token) could store `https://evil.example/tracker.gif` and the app would render it on every user's home screen. The prefix check makes the CMS incapable of pointing at third-party origins. The HEAD makes it incapable of storing a dangling URL that 404s in production.

**Accepted cost**: one S3 HEAD per media field per entity write. Admin writes are rare; correctness wins.

**Note on the existing seeds**: `SEED_MEDIA_URLS` produces picsum/SoundHelix URLs that would **fail** the prefix check. This is fine and intended — the check runs on the **admin write path only**, not on seeds (which write via Prisma directly, outside the app layering) and not on reads. See [A8](#a8-migrating-the-seeded-third-party-media).

### A5. NO signed URLs for Pro media — PRODUCT DECISION

**Decision (product owner, 2026-07-16): media stays PUBLIC. Short-lived signed URLs for Pro content are OUT OF SCOPE for this epic.** Public CDN objects, plain https URLs in Postgres, exactly as the current `mediaUrl` contract works today.

**What this means concretely**:

- No URL signing, no TTL, no expiry-mid-playback problem, no per-request signing cost, fully cacheable at the edge (`max-age=31536000, immutable` is only possible *because* the URL is stable and unsigned).
- **Pro-gating behaviour does not change and must not regress.** The server decides, after a **fail-closed** entitlement check via the `subscription` facade, whether to include a media URL in a response at all. `aarti.audioStreamUrl`, `mantras.audioUrl`, `ringtone.audioUrl` + `previewImageUrl`, book `bodyText`/`contentBody`/chapter `audioUrl` are nulled before serialization for free callers. **The DB always holds the real URL; the wire never carries it for a free user.** Every admin-CMS ticket inherits this invariant untouched — the existing integration tests that assert "free caller gets null" are regression gates for this epic.

**RESIDUAL RISK — recorded explicitly and honestly**:

> A Pro media URL, once obtained **by any means** — a subscriber sharing it, a proxy, a leaked or logged response, a device with a debug proxy attached — **is a permanent public link**. Anyone holding it can fetch that asset **forever**, from any client, with **no entitlement check**, at CDN speed. The entitlement gate protects *discovery of the URL*, not *access to the object*. There is no revocation: the only way to cut off a leaked URL is to delete the object, which breaks it for legitimate subscribers too (and we do not delete objects — [A6](#a6-deleting-a-row-does-not-delete-the-object)).
>
> This is a **conscious product decision**, taken with the tradeoff understood, in exchange for CDN cacheability and implementation simplicity.
>
> **The mitigation, if/when premium-content leakage becomes a business concern**: CloudFront signed URLs or signed cookies for the Pro media classes (audio, chapter audio, book content), leaving free/discovery assets (thumbnails, covers, icons, deity/zodiac icons) public and cached.
>
> **Adopting it later is a contained change**, which is why deferring it is defensible rather than reckless: the DB would keep storing the same canonical `publicUrl`, and **URL minting moves server-side to response time** — the owning service, at the exact point where it already decides *whether* to emit the URL, would instead emit a signed variant. The blast radius is (a) the media facade gains a `sign(key, ttl)` op, (b) the ~6 services that already null Pro URLs call it, (c) a CloudFront key group + private key in Secrets Manager, (d) a client-side retry-on-403 for expiry-mid-playback. **No schema migration, no re-upload, no key-layout change, no admin-UI change.** The decision is reversible; the leaked URLs are not.

Mirrored into `docs/PHASE-NOTES.md` by the coordinator.

### A6. Deleting a row does not delete the object

**Decision**: deleting or unlinking a content row **never** deletes the S3 object. Orphans accumulate.

**Options weighed**:

- *Delete the object on row delete* — **rejected.** The row→object relation is not 1:1 (nothing stops two rows referencing one key; a replace already orphans the old object with no row pointing at it). A delete-on-unlink rule would eventually delete a live asset. Worse, it is irreversible and the CMS has no undo.
- *S3 lifecycle expiry* — **rejected.** S3 cannot distinguish an orphan from a live asset; a lifecycle rule would delete assets that active rows point at.
- *Accept orphans + a ledger for future reaping* — **chosen.**

**A minimal `MediaObject` ledger table is created at presign time**:

```
media_objects: id (uuid PK), key (unique), content_type, size_bytes,
               module, entity, field, uploaded_by (user id), created_at
```

Rationale for paying for a table now: it is the input to any future reaper, it gives "who uploaded this" for audit, and it is the backing store for a media-library UI later. Backfilling it after the fact is impossible — S3 does not know who uploaded what or why. It is cheap now and unrecoverable later.

**Reaping is explicitly deferred** (a job that diffs `media_objects` against every media column across ~20 tables). Tracked in [A9](#a9-tracked-risks--accepted-tradeoffs).

### A7. Local dev — floci-aws, and the `https`-only problem

floci-aws already emulates Secrets Manager and Kinesis for this repo and is wired into compose at `http://floci-aws:4566` (host: `http://localhost:4566`). It emulates S3 the same way. Locally there is **no CloudFront** — `MEDIA_PUBLIC_BASE_URL` points straight at the floci S3 endpoint.

**The problem**: `mediaUrl` is `z.url({ protocol: /^https$/ })` and is composed into **response** schemas. floci is reachable over **http** only. A locally-uploaded asset would produce `http://localhost:4566/...`, which **fails response serialization** → a 500 on read. Self-signed TLS in front of floci was considered and rejected: Android and the browser both reject the cert, so it trades one broken path for two.

**Decision**: introduce `MEDIA_PUBLIC_BASE_URL` (required env) + a **dev-only, env-gated carve-out** in the `mediaUrl` helper:

- New env `MEDIA_ALLOW_INSECURE_URLS` (bool, **default `false`**).
- `env.ts`'s `superRefine` **hard-fails boot if `MEDIA_ALLOW_INSECURE_URLS=true` while `NODE_ENV=production`.** The image runs `NODE_ENV=production` on both stage and prod (`modules/stack/services.tf` hardcodes it — see TAM-80 Scope Decision 5), so this single assertion covers both real environments. The carve-out cannot reach a deployed environment.
- When enabled, `mediaUrl` additionally accepts `http://` on `localhost` / `127.0.0.1` / `10.0.2.2` (the Android emulator's host alias) origins only. Nothing else.

**Implementer note (do not skip)**: changing the `mediaUrl` helper **may change the emitted JSON Schema** for the shared `MediaUrl` component (`format`/`pattern`), which is an OpenAPI drift → the codegen chain must be regenerated and committed **within the foundation ticket** (TAM-84), not discovered later. Verify the `openapi.json` diff explicitly. If the emitted shape is byte-identical, say so in the ticket evidence. The generated Dart/TS clients do not enforce URL format at runtime, so the blast radius is a codegen diff, not behaviour.

### A8. Migrating the seeded third-party media

**Decision**: **no bulk importer. Seeds are left exactly as they are.**

- The seeds (`SEED_MEDIA_URLS` → picsum/SoundHelix/CC videos) are demo data and stay demo data. They are what makes stage testable end-to-end (TAM-80).
- TAM-80's boot-seeder **only fills empty tables** and never overwrites, so real content entered through the admin panel survives every deploy. The migration path is therefore: **ops uploads real assets through the panel and edits the rows.** That is the entire point of the epic.
- The DB will hold a **mix** of picsum URLs and CDN URLs during the transition. `mediaUrl` accepts both, reads don't care, and the admin write-path prefix check ([A4](#a4-the-api-owns-the-url-written-to-postgres)) only applies to fields being written. A row keeps its picsum URL until a human replaces it. This is fine and visible: an admin list view showing a `picsum.photos` thumbnail is a self-evident "not done yet" marker.
- **A server-side "import from URL" bulk migrator is explicitly rejected for this epic.** It is a textbook SSRF primitive (an admin-authenticated endpoint that fetches an arbitrary URL from inside the VPC, where RDS, Redis, MSK and the ECS metadata endpoint live). If bulk import is ever needed it must be an offline ops script with an explicit allowlist, not an API endpoint.

### A9. Tracked risks & accepted tradeoffs (section A)

| # | Risk | Status |
| - | ---- | ------ |
| A-R1 | **Leaked Pro media URLs are permanently public** (see [A5](#a5-no-signed-urls-for-pro-media--product-decision)) | **Accepted — product decision.** Mitigation (CloudFront signed URLs) scoped and contained; out of scope now. |
| A-R2 | **No virus/malware scanning.** Direct-to-S3 means no server-side byte inspection. An admin can upload a malicious file with a valid `Content-Type`. | **Accepted.** Trust boundary is the admin role itself; the blast radius is limited to assets the app renders/plays. Mitigation if needed: S3 event → scanner Lambda → quarantine, which composes cleanly with the ledger. |
| A-R3 | **Orphaned objects accumulate forever** (replaces + deletes) | **Accepted.** Storage is cheap; `media_objects` ledger makes a future reaper possible. |
| A-R4 | **Media of deleted content stays fetchable forever** — a direct consequence of A-R1 + A-R3 combined. Takedown of an asset is not possible without manual S3 deletion. | **Accepted.** Flagged for product ([E4](#e4-decisions-that-need-product-not-engineering)) — if there is a legal/takedown requirement, this is where it lands. |
| A-R5 | **Content-Type is asserted by the uploader**, then pinned by S3. A file whose bytes disagree with its declared type is storable. | **Accepted.** Same trust boundary as A-R2. |
| A-R6 | `MEDIA_ALLOW_INSECURE_URLS` weakens the media contract in dev | **Contained.** Hard boot failure when `NODE_ENV=production`; localhost origins only. |

---

## B. Admin authN / authZ

### B1. `User.role` enum — NOT a separate Admin model, NOT a JWT claim

**Decision**: add `role` to the existing `User` model.

```prisma
enum UserRole {
  user
  admin

  @@map("user_role")
}

model User {
  // ...
  role UserRole @default(user)
  // ...
  @@index([role])
}
```

**Options weighed**:

| Option | Analysis |
| ------ | -------- |
| **Separate `Admin` model + separate login + separate JWT** | Strongest isolation: a mobile token is structurally incapable of being an admin token. **Rejected** — it duplicates the entire auth stack (login, hashing, token issue, middleware, `/me`), and the isolation it buys is already provided by [B2](#b2-the-guard-resolves-the-role-from-the-database-fail-closed) at a fraction of the cost. It also fragments identity: `uploaded_by` on the ledger, and any future audit log, would need to point at one of two tables. Reconsider only if admins ever need a genuinely different auth factor (SSO/MFA), which is not on the table. |
| **JWT `role` claim** | Zero DB reads on the hot path. **Rejected — this is the dangerous option.** `JWT_EXPIRES_IN` defaults to `1h`, so **demoting or offboarding an admin leaves them fully admin for up to an hour**, with no revocation path (there is no refresh-token or denylist infrastructure in this repo — "refresh-token flow" is still deferred in `PHASE-NOTES.md`). It also changes the token payload, which is a contract the mobile app reads (`lib/core/jwt.dart` decodes it). The admin panel is a low-traffic internal surface; trading instant revocation for a saved SELECT on it is a bad trade. |
| **`User.role` column, resolved per request** | **Chosen.** One identity, one login, one `sub` for audit; revocation is instant (next request re-reads); zero JWT/contract churn. |

**Why a role column on the shared `User` table is safe here** — the objection is "a mobile user must never reach admin routes", and the answer has three independent layers:

1. `role` defaults to `user`. Every existing row and every future OTP row is a non-admin.
2. **The OTP path cannot produce a login.** `otp.repository.ts` writes `passwordHash = randomBytes(32).toString("hex")` — a raw hex string, not a bcrypt hash. `bcrypt.compare(anything, thatHex)` returns false. **No mobile-originated account can authenticate via `/auth/login` at all**, let alone reach `/admin/*`. The two auth paths are already disjoint in practice.
3. Even if (2) changed, promotion to `admin` is only possible by a direct DB write or the bootstrap path ([B4](#b4-bootstrapping-the-first-admin--no-default-password-ever)). It is never reachable from any request input ([B3](#b3-harden-authregister--role-is-never-an-input)).

**Migration**: additive, expand-only, `DEFAULT 'user'` — safe under TAM-79's rolling deploy (old tasks serve traffic against the new schema during rollout; the column is nullable-by-default from their perspective because they never read it).

### B2. The guard resolves the role from the database, fail-closed

**Decision**: a new `adminMiddleware` in `core/auth/middleware/`, mirroring the existing `authMiddleware` exactly.

```
preHandler: [authMiddleware, adminMiddleware]
```

- `authMiddleware` runs first and populates `req.user` (unchanged).
- `adminMiddleware` resolves the role **from the DB** via `performServiceCall("users", u => u.getRole(req.user.id), ...)` and rejects with **403 `FORBIDDEN`** unless it is `admin`.
- **Fail-closed**: no `req.user` → 401; role lookup throws → 403 (never "allow on error"); role is anything other than `admin` → 403. This mirrors the fail-closed entitlement pattern the content modules already use for Pro checks.
- `IUsersApi` gains `getRole(userId): Promise<UserRole>`. This is a **read-only facade addition** — it does not widen any module's write surface.

**Uniform enforcement, and how it is tested**: a guard that is merely *available* gets forgotten on route #47. Therefore:

- Every admin route is registered through a **single helper** (`registerAdminRoute`) that applies `[authMiddleware, adminMiddleware]` and the `admin` tag; hand-rolled `r.post("/admin/...")` is a review-blocker.
- **A contract test asserts the invariant mechanically**: enumerate `app.printRoutes()` / the emitted OpenAPI, and assert **every path under `/admin/` carries both guards and the `admin` tag**. This test is the actual gate — it fails when someone adds route #47 without the guard, which no amount of convention will catch. It lives alongside the existing `routes/__tests__/openapi-contract.test.ts` precedent.
- Per-module integration tests assert: no token → 401; valid non-admin token → 403; admin token → 200.

**Cost**: one indexed `SELECT` per admin request. Irrelevant on an internal panel. Not cached — caching would reintroduce exactly the revocation lag we rejected the JWT claim to avoid.

### B3. Harden `/auth/register` — `role` is never an input

**Decision**: `RegisterBody` **must not** accept `role`, and `AuthService.register` **must** hard-code `role: user`.

This is called out as its own decision because `/auth/register` is **public and unguarded today**, and the admin SPA's `useCreateUser` calls it. Adding a `role` column to `User` without pinning this turns a public endpoint into "anyone on the internet can mint themselves an admin." Zod strips unknown keys by default, which makes this safe-by-default — **and that is exactly why it must be an explicit AC with an explicit test** (`POST /auth/register {role:"admin"}` → the created user is `user`), rather than something we rely on a library default to keep true forever.

**Also noted**: the admin SPA creating platform users via a public `/auth/register` is pre-existing weirdness. Out of scope; not made worse.

### B4. Bootstrapping the first admin — no default password, ever

**Decision**: env-driven bootstrap at boot, credentials from Secrets Manager, reusing the exact `JWT_SECRET` wiring pattern.

- New env: `ADMIN_BOOTSTRAP_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD` (Secrets Manager ARN in stage/prod; `.env` locally).
- At boot: **if both are absent → skip entirely** (no admin exists → no admin access; fail-closed). If present:
  - user does not exist → create with `role: admin` and the bcrypt-hashed bootstrap password;
  - user exists → **ensure `role: admin`** and **never touch the password**.
- **There is no default value for either var** — not in `env.ts`, not in `.env.example` (which documents them with an empty placeholder and a "generate one" note), not in Terraform. A missing secret produces no admin, not a weak admin.
- Idempotent, so it is safe on every task start (which is how it must be — stage runs `min=1/max=2`).

**Why boot and not a CLI**: the runtime image installs `--prod` and has **no `tsx`** (TAM-80 Technical Notes), so a `.ts` CLI script cannot execute in a deployed task. TAM-80 already solved this shape by importing the seeds from `src/index.ts` so esbuild bundles them. The admin bootstrap follows the identical, proven pattern. A one-off ECS task (TAM-79's `run-task`) was considered and rejected as heavier for a strictly idempotent no-op.

**Known gap, deferred**: there is **no change-password endpoint**. The bootstrap admin's password can only be rotated by rotating the secret and… nothing, because bootstrap never touches an existing user's password. **Rotating the bootstrap admin's password is therefore a manual DB write today.** A `PATCH /admin/session/password` is a follow-up ticket ([E3](#e3-explicitly-out-of-scope-for-this-epic)). Flagged rather than silently shipped.

### B5. Admin routes live under `/admin/*` — a separate surface per module

**Decision**: admin CRUD is a **separate route surface**, `/admin/<module>/*`, owned by each module. It does **not** reuse the public module routes with a guard bolted on.

**Options weighed**:

| Option | Analysis |
| ------ | -------- |
| **Reuse module routes + role guard** (e.g. `POST /aarti/audios` guarded) | **Rejected on two counts.** (1) **Contract stability**: `/aarti/*` is the mobile app's read contract and it must not churn. Admin write schemas would attach to the same paths and the same tag. (2) **Codegen blast radius**: the Dart generator emits a model per schema in the document — admin write bodies (`CreateAudioItemBody`, `UpdateWallpaperBody`, `AdminListQuery`, …) would be generated into `apps/mobile/lib/api/generated/**` and shipped in the APK. That is not a style objection; it is dead code in a mobile binary that the mobile team must then ignore forever. |
| **One central `core/admin` module owning all CRUD** | **Rejected.** It would need Prisma access to every module's tables, which either breaks table ownership outright or forces every module's facade to grow a full write surface (`create`/`update`/`delete` per entity) purely to serve one consumer. Facades exist to expose the *minimum* another module needs; inflating 10 of them into CRUD gateways inverts that. It would also make `core/admin` a merge-conflict funnel for every parallel module ticket. |
| **Per-module admin routes under `/admin/<mod>/*`** | **Chosen.** |

**Shape** — each module gains, inside its own tree (module-shape pattern preserved):

```
apps/api/src/core/<mod>/
├── routes/<mod>.admin.routes.ts     # /admin/<mod>/* — registerAdminRoute() only
├── routes/<mod>.admin.schemas.ts    # admin Zod schemas, tag: ['admin']
├── controllers/<mod>.admin.controller.ts
├── services/<mod>.admin.service.ts
├── repositories/                    # REUSED — admin write methods added here
└── index.ts                         # init<Mod>Module(app) also mounts admin routes
```

**Consequences**:
- Table ownership is preserved — a module's Prisma access stays inside its own `repositories/`.
- The public contract is untouched. `openapi.json`'s existing paths do not move.
- Module tickets are **disjoint trees** → genuinely parallelizable ([E2](#e2-dependencies--parallelism)).
- No `arch-boundaries.json` change is needed: the admin files sit in the same layer dirs and obey the same rules ([C5](#c5-arch-boundaries-and-facades--no-changes-needed)).

---

## C. Admin API shape

### C1. CRUD surface per entity

For each entity, under `/admin/<mod>/`:

| Verb | Path | Notes |
| ---- | ---- | ----- |
| `GET` | `/admin/<mod>/<entity>` | list — paginated, filtered, sorted ([C2](#c2-listing--offset-pagination-filtering-sorting)) |
| `GET` | `/admin/<mod>/<entity>/:id` | full row, **including** Pro-gated fields (an editor must see what they are editing) |
| `POST` | `/admin/<mod>/<entity>` | create |
| `PATCH` | `/admin/<mod>/<entity>/:id` | partial update + concurrency precondition ([C3](#c3-optimistic-concurrency-via-updatedat-precondition)) |
| `DELETE` | `/admin/<mod>/<entity>/:id` | deactivate-or-409 ([C4](#c4-delete-means-deactivate-hard-delete-is-guarded)) |

**Admin reads are NOT Pro-gated.** The `/admin/*` detail endpoint returns `audioStreamUrl` etc. in full — the gate exists to protect the *free user's* wire, and an editor with an admin role is not that. This is an explicit carve-out, implemented by the admin service **not calling** the subscription facade at all (rather than by passing a bypass flag through the public service — the public service's fail-closed gate must remain unconditional and untouched).

**Entity inventory** (drives the ticket split in [E1](#e1-child-tickets)):

| Module | Entities |
| ------ | -------- |
| Taxonomy | `Deity` + `DeityTranslation` |
| Aarti | `AudioCategory`, `AudioItem` (+ category/deity tags), `HomepageSection` |
| Mantras | `MantraCategory`, `MantraAudioItem` (+ tags), `MantraHomepageSection` |
| Ringtone | `Ringtone` |
| Wallpaper | `Wallpaper` (+ deity tags), `WallpaperHomepageRow`, `WallpaperRowItem` |
| Status | `StatusItem` (+ deity tags), `StatusOverlayTemplate` |
| Horoscope | `ZodiacSign`, `HoroscopeMode`, `HoroscopeStepConfig`, `DailyHoroscopeResult`, `MediaAsset` |
| Books | `BookContent`, `BookSubBook`, `BookChapter`, `BookSection` |
| Home | `HomeBanner`, `HomeFeedItem`, `HomeShortcut`, `HomeSettings` (singleton) |

**Never CRUD-able** (deliberate): `UserLike`, `EngagementCounter`, `UserPlaybackHistory`, `MantraRecentlyPlayed`, `RingtonePlaySession`, `UserStatusProfile`, `Subscription`, `MantraCounterPreference`. These are **user-generated or server-authoritative** state. `EngagementCounter` in particular is a denormalized aggregate kept in sync inside a repository `$transaction` — an admin write would silently desync it from `UserLike`. `Subscription` is explicitly server-authoritative ("no client input can ever flip status"); an admin panel that can grant Pro is a payments decision, not a CMS one ([E4](#e4-decisions-that-need-product-not-engineering)).

### C2. Listing — offset pagination, filtering, sorting

**Decision**: **offset pagination** (`?page=&pageSize=`) for admin lists, returning `{ items, total, page, pageSize }`.

The public/mobile surfaces use **keyset** pagination, deliberately, on indexed columns. Admin is the opposite problem: an editor needs "page 7 of 23" and a total count, and jumps around. Keyset cannot do either. Admin list volumes are thousands of rows, not millions, so offset's cost is irrelevant. **This is a considered divergence from the mobile convention, not an oversight.**

- `pageSize` capped (default 25, max 100) at the Zod boundary.
- **Sorting**: `?sort=<field>&order=asc|desc`, where `<field>` is a **Zod enum of an explicit per-entity allowlist**, never a free string. (A free string reaches Prisma's `orderBy` and becomes an injection/enumeration surface.) The allowlist is the entity's already-indexed columns plus `createdAt`/`updatedAt`.
- **Filtering**: per-entity explicit params — `isActive`, `deitySlug`, `categoryId`, `mediaType`, `q` (title/slug substring). `q` maps to Prisma `contains` + `mode: insensitive`. Ringtone/wallpaper already have GIN indexes on `tags`/`searchKeywords`/`customCategoryTags` for tag filters.
- **`total` is a second `COUNT` query** in the same repository method. Accepted.

### C3. Optimistic concurrency via `updatedAt` precondition

**Decision**: every `PATCH` and `DELETE` body/param carries the client's last-known `updatedAt`. The repository writes with it in the `WHERE`:

```ts
const n = await prisma.audioItem.updateMany({
  where: { id, updatedAt: expectedUpdatedAt },
  data: { ... },
});
if (n.count === 0) throw new AppError("Modified by someone else", 409, "STALE_WRITE");
```

- **409 `STALE_WRITE`** → the UI refetches and shows a conflict.
- **No schema change** — every model already has `@updatedAt`.
- Rejected: `If-Unmodified-Since` headers (second-granularity HTTP dates lose precision against `DateTime` and are awkward through the typed client) and a `version Int` column (a migration on ~20 tables to buy nothing over `updatedAt`).
- **Caveat, accepted**: a 0-count result is ambiguous between "stale" and "row is gone". The service disambiguates with a follow-up existence check to return 404 vs 409 correctly.

### C4. "Delete" means deactivate; hard delete is guarded

**Decision**: `DELETE /admin/<mod>/<entity>/:id` performs a **soft delete** — it sets the entity's existing `isActive` / `active` / `enabled` flag to `false`. **Hard delete is not exposed in this epic.**

**Why this is not a cop-out**:

- **Every content model already has the flag** (`Deity.active`, `AudioItem.isActive`, `Ringtone.isActive`, `Wallpaper.isActive`, `StatusItem.isActive`, `ZodiacSign.enabled`, `BookContent.isActive`, `HomeBanner.isActive`, …), **every public read path already filters on it**, and **every listing index is already `(isActive, sortOrder)`**. Deactivation is the *native* delete semantic of this schema. Adding `deletedAt` alongside would be a second, redundant, un-indexed liveness concept.
- **Referential integrity is the real driver.** Deity tags are **logical references by slug with no DB FK across module boundaries** (`AudioDeityTag.deitySlug`, `MantraDeityTag`, `WallpaperDeityTag`, `StatusDeityTag`, `Ringtone.deitySlug`). Postgres will happily hard-delete a deity and leave five modules' tags pointing at a slug that no longer exists — **the DB cannot protect us here by design**. Deactivation makes the row disappear from every read path while the tags stay referentially meaningful.
- **The mobile client prunes unknown values**, so a deactivated category/deity vanishing from a list is a handled, non-breaking case — the client already copes.

**Consequences and rules**:

- **`Deity` is never hard-deleted, full stop.** It is the cross-module taxonomy root.
- Rows with **real FKs and `onDelete: Cascade`** (`DeityTranslation`, `AudioCategoryTag`, `BookChapter` under `BookSubBook`, `WallpaperRowItem`, `PaywallPlanTranslation`) are **genuinely deletable** — the cascade is declared and correct. Unlinking a tag or removing a curated row item is a hard delete of the join row, and that is fine and expected.
- A future hard-delete endpoint must **count references across modules first** and 409 if any exist. That requires `countByDeitySlug`-style read ops on 5 facades. **Deferred** — it is real work in service of a capability nobody has asked for.

**Tracked risk (C-R1)**: deactivated rows accumulate forever; there is no purge. If a legal takedown ever requires true erasure, it is a manual DB + S3 operation today ([E4](#e4-decisions-that-need-product-not-engineering)).

### C5. Arch boundaries and facades — no changes needed

**This design requires zero changes to `arch-boundaries.json`**, and that is a deliberate design constraint, not a happy accident:

- `<mod>.admin.routes.ts` lives in `routes/` → forbidden from importing `repositories/` or `@prisma/client`. ✔
- `<mod>.admin.controller.ts` lives in `controllers/` → imports services only. ✔
- `<mod>.admin.service.ts` lives in `services/` → imports repositories only. ✔ (It calls the `media` facade via `performServiceCall`, exactly like existing services call `subscription`/`deity`/`engagement`.)
- Admin write methods are added to the **existing** `repositories/` → Prisma stays in exactly one layer. ✔
- The new `core/media` module publishes `IMediaApi` → **one line added to `GlobalServiceMap`** and **one entry in the `shared` rule's `allowTypeOnly` list** in `arch-boundaries.json`. This is the documented, expected way to add module N+1 (the list already has 14 entries) — it is config data, not a rule change.
- `adminMiddleware` lives in `core/auth/middleware/` beside `authMiddleware` and reaches `users` via `performServiceCall`. ✔

**`pnpm check:arch-boundaries` must stay green throughout. Any ticket that proposes relaxing a rule is wrong and gets sent back.**

---

## D. Admin UI architecture

**Design-system rule for this epic**: extend the **existing** shadcn-style + Tailwind v4 system in `apps/admin`. **The STRICT Figma gate does NOT apply to `apps/admin`** — no Figma file exists for admin and none is coming. Implementers use shadcn defaults and existing tokens (`src/styles.css`); no hex literals invented ad hoc. (Note: `pnpm check:no-hex-literals` / `check:figma-tokens-committed` are `verify:mobile` scripts and are **mobile-scoped** — they must not be pointed at `apps/admin`.)

### D1. Route shell and layout

Today's router is a flat 2-route table. It becomes a nested tree:

```
/login                                   → LoginPage (public)
/                                        → AdminLayout (ProtectedRoute + AdminRoute)
  ├── /dashboard
  ├── /taxonomy/deities
  ├── /aarti/{items,categories,sections}
  ├── /mantras/…  /ringtones  /wallpapers/…  /status/…
  ├── /horoscope/…  /books/…  /home/…
  └── /users
```

- `<AdminLayout>` = persistent sidebar nav + header (user email, logout) + `<Outlet/>`.
- **`<AdminRoute>` is a new guard** wrapping `<ProtectedRoute>`: it calls **`GET /admin/session`** and renders children only on 200.
  - **Decision: a dedicated `/admin/session` endpoint (returns `{id, email, role}`, admin-guarded) rather than adding `role` to the shared `PublicUser`.** `PublicUser` is consumed by `/auth/me` and `/auth/users` and is generated into the **Dart** client; adding a field there churns the mobile contract to serve an admin-only need. `/admin/session` is self-gating (403 = not an admin, 401 = no/expired token), costs nothing extra, and keeps the public contract still.
  - A non-admin who logs in sees an explicit "not authorized" screen, not a redirect loop.

### D2. UI primitives — this is real work, not a formality

`apps/admin/src/components/ui/` currently contains **exactly one file** (`button.tsx`). A CMS needs, at minimum: `input`, `textarea`, `label`, `select`, `checkbox`/`switch`, `table`, `dialog`, `dropdown-menu`, `badge`, `card`, `tabs`, `form`, `sonner` (toast), `skeleton`, `alert`. All are standard shadcn primitives added the standard way (cva + `cn()` from `lib/utils.ts`, matching `button.tsx`'s shape exactly). `lucide-react` and `@radix-ui/react-slot` are already dependencies.

This is called out as its own foundation ticket because underestimating it is the classic way this kind of epic slips.

### D3. List / detail / form patterns

- **Server state goes through TanStack Query only** — `src/features/<feature>/use-<entity>.ts`, following `use-users.ts` verbatim (`api.GET`/`api.POST` → check `error || !data?.success` → return `data.data`; mutations `invalidateQueries` on success). **No ad-hoc `useEffect` fetching**, per `apps/admin/CLAUDE.md`.
- Query keys: `['admin', '<entity>', params]` so a list invalidation is one prefix.
- **`<DataTable>`** — one shared, generic component (columns config + pagination + sort + filter bar + empty/loading/error states). Every list view is a config of it. 20+ hand-rolled tables is the failure mode to avoid.
- **`<EntityForm>`** — shared create/edit form kit; `PATCH` payloads carry the row's `updatedAt` ([C3](#c3-optimistic-concurrency-via-updatedat-precondition)); a 409 surfaces a "modified by someone else — reload" conflict toast.
- **Errors/toasts**: `sonner`. **All mutations must surface failure.** `PHASE-NOTES.md` already flags the existing create-user form as needing error feedback and *not* optimistically resetting before success — do not replicate that bug 20 more times. Mutation error → error toast; success → success toast + invalidate.
- **`api.ts` is the only HTTP entry point.** Unchanged: Bearer injection + 401→`/login`. **It needs one addition: the presigned `PUT` to S3 must NOT go through `api` at all** (it must not carry our Bearer token to a third-party origin) — it is a bare `fetch` inside the upload hook.

### D4. The upload widget

**`<MediaUploadField>`** — a form field bound to a media column:

1. file picked → client-side pre-validation (type/size, mirroring the server allowlist for fast feedback, **never as the enforcement point**);
2. `POST /admin/media/presign` → `{ uploadUrl, publicUrl }`;
3. bare `fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })` — **no Authorization header**;
4. progress via `XMLHttpRequest`/`upload.onprogress` (`fetch` cannot report upload progress);
5. on success → set the form field to `publicUrl` and render a preview (`<img>` / `<audio>` / `<video>` by media class);
6. the entity form `POST`/`PATCH` then submits `publicUrl` like any other field.

Failure modes handled explicitly: presign 4xx (bad type/size), PUT network failure (retry the same presign until `expiresAt`, then re-presign), submit-without-upload-finishing (the field is empty → form validation blocks).

### D5. OpenAPI split — `openapi.json` stays the source of truth; `openapi.public.json` feeds mobile

**Decision**:

| Artifact | Content | Consumer |
| -------- | ------- | -------- |
| `apps/api/openapi.json` | **FULL** — public + admin. Unchanged name, unchanged emitter, still the source of truth, still drift-gated by `pnpm check:openapi`. | `packages/api-client` (admin SPA — it legitimately needs both `/auth/login` and `/admin/*`) |
| `apps/api/openapi.public.json` | **FILTERED** — admin paths and admin-only component schemas removed. | `apps/mobile` Dart codegen **only** |

- Every admin route declares `schema.tags: ['admin']` (applied centrally by `registerAdminRoute`, [B2](#b2-the-guard-resolves-the-role-from-the-database-fail-closed)).
- The public doc is produced by a **filter step**: drop every operation tagged `admin`, then transitively prune orphaned `components.schemas`. Deterministic, committed, and gated (`check:openapi` verifies **both** files).
- **A test asserts the two selectors agree** — "tagged `admin`" ⇔ "path starts with `/admin/`". Belt and braces: if they ever diverge, the failure is a red test, not admin schemas silently shipping in the APK.
- `apps/mobile`'s `tools/generate-mobile-models.sh` changes its `-i` input to `openapi.public.json`. **One line.**

**Options weighed**: re-architecting module `init` functions into `init<Mod>Module` / `init<Mod>AdminModule` pairs so two emitter passes produce two docs natively. **Rejected** — it forces a composition-root refactor across 10 modules, duplicates service/repo instantiation, and makes every module ticket touch `openapi-doc.ts` (a merge funnel). The filter step achieves the same isolation as a pure post-processing function with a test proving the invariant.

**Chain becomes**: `api:openapi` (emits both) → `api-client:generate` (full) → `mobile:generate` (public). Order and the "commit generated artifacts with the change" rule are unchanged.

### D6. The elephant: `apps/admin` has no hosting

> **⚠️ SUPERSEDED by TAM-120 (`specs/TAM-120-admin-cms-deployment.md`).** The
> S3 + CloudFront + OAC hosting design below made **ALB TLS + a domain + ACM a
> hard prerequisite** — because a CloudFront (https) SPA cannot call an http API
> without a browser mixed-content block. TAM-120 **reverses that**: the admin is
> hosted as a **containerized Fargate service behind the SAME HTTP ALB** as
> `api`/`events` (its own `fargate-service` instance, `/cms` path prefix, ECR
> repo, auto-deploy in `modules/cicd`). Admin and API are then **same-scheme,
> same-origin (both HTTP)** — no mixed content, so it **works with no domain and
> no TLS**. Hosted admin is now **IN SCOPE via the same-ALB HTTP path**, not
> blocked on TLS. The tradeoff is cleartext transport: TLS + domain + ACM is a
> tracked **hardening follow-up** (see the revised D-R1/D-R2 below and
> `#EXPORT_CRITICAL` in the TAM-120 spec) — required before real editors use
> prod, but no longer a blocker for stage. The original S3+CloudFront framing is
> retained below for provenance only.

**There is no Terraform for the admin SPA.** `modules/stack` provisions ALB/ECS/RDS/Redis/Kinesis/MSK/Secrets; `modules/fargate-service` is instantiated for `api` and `events`. Nothing builds, uploads, or serves `apps/admin`. It has only ever run on `pnpm nx serve admin` against localhost. **(Historical — TAM-120 adds a third `fargate-service` instance `admin` and an `apps/admin/Dockerfile`.)**

**Decision (superseded)**: ~~**admin SPA hosting is IN SCOPE for this epic** (an admin panel nobody can reach is not an admin panel) as its own ticket: **S3 (private) + CloudFront + OAC**, the same pattern as the media bucket, with SPA fallback routing (403/404 → `/index.html`), and `VITE_API_URL` pointed at the stage ALB at build time.~~ TAM-120 instead serves the SPA from an **nginx container behind the shared ALB** (SPA fallback → `/cms/index.html`; API base resolved same-origin from `window.location.origin`). The CodeBuild pipeline (`modules/cicd`) gains admin as a third `services` entry that builds+pushes+rolls (no migration).

**The blocker that no longer blocks** — the stage ALB has NO TLS listener (`aws_lb_listener.http`; "TLS on the listener" is still a deferred item in `PHASE-NOTES.md`). Under the **superseded** CloudFront design that was fatal:

> Serving the admin panel over CloudFront (https) while the API is http-only produces **mixed-content errors that browsers hard-block** — the SPA literally cannot call the API. And even setting that aside, **an admin logging in over plaintext http puts an admin-privileged JWT and a password on the wire in the clear.**

**Under TAM-120 the first half evaporates** (admin is HTTP too → same-origin → no mixed content), so hosting no longer needs a domain/ACM. **The second half remains**: admin login + edits ride **cleartext HTTP**. That is an accepted tradeoff for **stage / internal use**, but a genuine risk for **prod** — so a TLS listener + domain + ACM (+ HTTP→HTTPS redirect) is the tracked hardening follow-up, and **prod, while wired in Terraform, is deliberately not applied until it lands** (`#EXPORT_CRITICAL`). The old fallback of "admin-on-localhost-against-stage only" is no longer the only option.

---

## E. Epic breakdown

Sized like TAM-57…78: one surface per ticket, foundations first, then per-module. **TAM-79/80 are taken** (`codebuild-prisma-migrate`, `stage-boot-seeding`); the epic itself is **TAM-81**; children start at **TAM-82**.

### E1. Child tickets

**Foundations (build once — these gate everything)**

| Ticket | Title | Surface |
| ------ | ----- | ------- |
| TAM-82 | Admin identity & authorization: `User.role` migration, `adminMiddleware`, `IUsersApi.getRole`, `GET /admin/session`, `registerAdminRoute` helper + the "every `/admin/*` route is guarded" contract test, `/auth/register` hardening, bootstrap admin (no default password) | api |
| TAM-83 | **TLS + domain**: ACM cert + HTTPS listener on the stage/prod ALB (+ http→https redirect). **Hard prerequisite for TAM-85/86.** | infra |
| TAM-84 | Media infra: S3 bucket (private, BPA on, SSE) + CloudFront + OAC + IAM presign policy on the api task role; floci-aws S3 local wiring; `MEDIA_PUBLIC_BASE_URL` / `MEDIA_ALLOW_INSECURE_URLS` env + the `NODE_ENV=production` assertion | infra |
| TAM-85 | `core/media` module: `POST /admin/media/presign`, `IMediaApi` (`presign`/`head`/`validateOwnedUrl`), `media_objects` ledger + migration, per-(module,field) content-type/size allowlist, `mediaUrl` dev carve-out **+ codegen chain regen** | api |
| TAM-86 | OpenAPI admin/public split: `openapi.public.json` emitter + filter, `check:openapi` gates both, tag⇔path-prefix invariant test, `mobile:generate` input switch | api/tooling |
| TAM-87 | Admin SPA hosting: S3 + CloudFront + OAC + SPA fallback; `modules/cicd` build/sync/invalidate step; `VITE_API_URL` per env | infra |
| TAM-88 | Admin UI foundation: `<AdminLayout>` + sidebar nav + `<AdminRoute>`, shadcn primitive expansion ([D2](#d2-ui-primitives--this-is-real-work-not-a-formality)), `sonner` toasts, `<DataTable>`, `<EntityForm>` kit, query-key convention, 409 conflict handling | admin |
| TAM-89 | Admin UI: `<MediaUploadField>` (presign → PUT + progress → preview), per-class preview components, upload error handling | admin |

**Modules (API track ‖ UI track)**

| Ticket | Module | Surface |
| ------ | ------ | ------- |
| TAM-90 / TAM-91 | **Taxonomy** — Deity + translations (never hard-deleted) | api / admin |
| TAM-92 / TAM-93 | Aarti — categories, audio items (+ tags), homepage sections | api / admin |
| TAM-94 / TAM-95 | Mantras — categories, items (+ tags), homepage sections | api / admin |
| TAM-96 / TAM-97 | Ringtone — ringtones (+ tags/keywords) | api / admin |
| TAM-98 / TAM-99 | Wallpaper — wallpapers (+ deity tags), homepage rows, curated row items | api / admin |
| TAM-100 / TAM-101 | Status — status items (+ deity tags), overlay template | api / admin |
| TAM-102 / TAM-103 | Horoscope — zodiac signs, modes, step config, daily results, media assets | api / admin |
| TAM-104 / TAM-105 | Books — content, sub-books, chapters, sections | api / admin |
| TAM-106 / TAM-107 | Home — banners, feed items, shortcuts, settings singleton | api / admin |

**Closeout**

| Ticket | Title | Surface |
| ------ | ----- | ------- |
| TAM-108 | Playwright E2E: admin CMS happy path — login → list → create with real upload (against floci S3) → edit → deactivate; extends `apps/admin-e2e` | e2e |
| TAM-109 | Final integration: full `pnpm verify`, codegen chain committed, **Pro-gating regression sweep** (every "free caller gets null" integration test still green), stage deploy + smoke, `PHASE-NOTES.md` update, one PR | all |

**28 tickets** (TAM-82…109). Comparable to TAM-56's 22.

### E2. Dependencies & parallelism

```
TAM-82 (identity) ─┬─────────────────────────────► every /admin/* API ticket
TAM-83 (TLS)  ─────┼──► TAM-87 (admin hosting)  [HARD blocker — mixed content]
TAM-84 (S3 infra) ─┴──► TAM-85 (media API) ──► TAM-89 (upload widget)
TAM-86 (openapi split) ──► (must land before the 2nd module API ticket)
TAM-88 (UI foundation) ──► every admin UI ticket
```

- **Two tracks run in parallel after the foundations**: the **API track** (TAM-90/92/94/96/98/100/102/104/106) and the **UI track** (TAM-91/93/…/107). They touch **disjoint trees** (`apps/api/src/core/<mod>/` vs `apps/admin/src/features/<feature>/`).
- **Within the API track, every module ticket is disjoint from every other** — that is precisely what [B5](#b5-admin-routes-live-under-admin--a-separate-surface-per-module) buys. The only shared files are `openapi.json` (regenerated — conflicts are mechanical, resolved by re-running the chain) and, for TAM-85 only, `GlobalServiceMap` + `arch-boundaries.json`.
- **A UI ticket depends on its own API ticket** (it needs the generated client types), TAM-88, and TAM-89 if it has media fields.
- **TAM-86 should land early** — before the second module API ticket — so admin schemas never reach `openapi.json` unfiltered while mobile codegen is running against it.
- **TAM-83 is on the critical path** and has an **external dependency (a domain)**. Start it first; if the domain stalls, TAM-87 stalls and the fallback is localhost-only admin ([E4](#e4-decisions-that-need-product-not-engineering)).

### E3. Explicitly OUT of scope for this epic

Engineering calls, recorded so nobody "helpfully" adds them:

- **Signed URLs for Pro media** — product decision ([A5](#a5-no-signed-urls-for-pro-media--product-decision)).
- **Orphan reaping / media deletion** ([A6](#a6-deleting-a-row-does-not-delete-the-object)).
- **Hard delete + cross-module reference counting** ([C4](#c4-delete-means-deactivate-hard-delete-is-guarded)).
- **Bulk "import from URL" migrator** — SSRF ([A8](#a8-migrating-the-seeded-third-party-media)).
- **Admin change-password endpoint** — known gap ([B4](#b4-bootstrapping-the-first-admin--no-default-password-ever)).
- **Audit log** of admin writes (who changed what, when). Genuinely valuable; the `media_objects.uploaded_by` column is a deliberate down payment. Not in this epic.
- **Granular roles** (editor/reviewer/viewer), publish/draft workflow, scheduled publishing, content preview-as-mobile, image resizing/transcoding, i18n editing beyond the existing translation tables.
- **CMS-editable `BooksService.CATEGORY_TITLE` / `DEFAULT_SECTION_TITLE`** — the known server-owned constants residue documented in `PHASE-NOTES.md`. Give categories a table if ops asks.
- **Removing TAM-80's unconditional boot-seeding.** It is owner-committed removal work with its own checklist and it interacts with prod's first boot. Related, but not ours.

### E4. Decisions that need PRODUCT, not engineering

**These block or reshape tickets. Get answers before the tickets they gate start.**

| # | Question | Blocks | Why it can't be an engineering call |
| - | -------- | ------ | ----------------------------------- |
| **P1** | **Is there a domain we control, and can we get an ACM cert?** (For the ALB's TLS listener, and optionally a custom CDN domain.) | **TAM-83 → TAM-87** (critical path) | We cannot invent a domain. Without one: no TLS, and therefore **no hosted admin panel** — the fallback is admin-on-localhost-against-stage. That is a business call about who uses this and from where. |
| **P2** | **Who are the admins, and is one flat `admin` role enough?** Or are editor / reviewer / viewer needed? | TAM-82 (the enum) | The enum shape is cheap now and a migration + guard rewrite later. Needs the real org answer, not a guess. |
| **P3** | **Is the Paywall CMS in scope?** ~~`PaywallConfig`/`PaywallPlan`/`PaywallBenefit`/`PaywallTranslation`/`PaywallLegalLinks` all carry "write-side owned by CMS/ops (Phase 2 admin UI)" comments — but the brief says "8 modules + taxonomy", and paywall is not one of them.~~ **PARTIALLY ANSWERED (TAM-130): the paywall HERO VIDEO is in scope; everything else is not.** `/admin/paywall/config` edits `PaywallTranslation.{videoUrl,videoThumbnailUrl,videoId}` per locale and nothing more. `PaywallPlan`, `PaywallBenefit`, `PaywallLegalLinks` and the paywall shell copy remain OUT — this question stays open for them. | a possible follow-up | It is ~5 more entities and it edits **pricing and legal copy**, which is a different blast radius from devotional content. Deliberately not assumed in. The video was carved out because swapping a creative is routine marketing work whose worst case is a wrong clip, whereas the rest can mis-state a price or a refund term. |
| **P4** | **Should admins be able to grant/revoke Pro?** (`Subscription` is server-authoritative today.) | scope of TAM-82 | Comping a subscription is a payments/finance decision with revenue-recognition implications, not a CMS feature. Currently **excluded** ([C1](#c1-crud-surface-per-entity)). |
| **P5** | **Is there a legal/takedown requirement for true content erasure?** Today: soft delete only, and media objects are never deleted and stay publicly fetchable forever ([A-R4](#a9-tracked-risks--accepted-tradeoffs)). | TAM-85, TAM-90+ | If "delete" must mean *gone*, [C4](#c4-delete-means-deactivate-hard-delete-is-guarded) and [A6](#a6-deleting-a-row-does-not-delete-the-object) both change, and hard delete + reference counting come back into scope. |
| **P6** | **Max upload size per media class?** Proposed defaults: image 10 MB, audio 50 MB, video 200 MB. | TAM-85 | Depends on the real content library's assets. Wrong-low blocks editors; wrong-high invites cost. |
| **P7** | **Does the content team need bulk import** (CSV/spreadsheet, or many-assets-at-once)? | possible follow-up | Row-at-a-time CRUD for a large existing library may be unusable in practice. If the answer is "we have 500 items in a sheet", the epic shape changes. |

### E5. Tracked risks — consolidated

| # | Risk | Status |
| - | ---- | ------ |
| **A-R1** | **Leaked Pro media URLs are permanently public, unrevocable, no entitlement check on fetch.** | **Accepted — explicit product decision** ([A5](#a5-no-signed-urls-for-pro-media--product-decision)). Mitigation scoped + contained. Mirrored to `PHASE-NOTES.md`. |
| A-R2 | No AV/malware scanning on uploads | Accepted; trust boundary = admin role |
| A-R3 | Orphaned S3 objects accumulate forever | Accepted; ledger enables a future reaper |
| A-R4 | Media of deleted content stays fetchable forever | Accepted; **P5** may reopen |
| A-R5 | Content-Type asserted by uploader (S3 pins it, bytes unverified) | Accepted |
| A-R6 | `MEDIA_ALLOW_INSECURE_URLS` weakens the media contract in dev | Contained: hard boot-fail on `NODE_ENV=production` |
| C-R1 | Deactivated rows accumulate; no purge | Accepted; **P5** may reopen |
| **D-R1** | ~~No TLS on the ALB → CloudFront-hosted admin cannot call an http API (mixed content); admin JWT + password in cleartext.~~ **REFRAMED by TAM-120.** The mixed-content half is **gone** — admin is now hosted **behind the same HTTP ALB** (`/cms`), so admin + API are same-origin HTTP and no domain/TLS is needed to make it *work*. The cleartext half **remains**: admin login + edits ride plaintext HTTP. | **No longer a hosting BLOCKER** (stage ships cleartext admin, accepted for an internal tool). **Still a prod gate**: a TLS listener + domain + ACM (+ http→https redirect) is a tracked hardening follow-up; **prod admin is wired in Terraform but deliberately NOT applied** until it lands (`#EXPORT_CRITICAL` in `specs/TAM-120-admin-cms-deployment.md`). |
| D-R2 | Admin JWT in `localStorage` (XSS-exfiltratable), pre-existing; now carries **admin** privilege | **Elevated further by TAM-120.** `api.ts` already flags it ("Production should prefer an httpOnly refresh cookie"). Its prior mitigation ("admin is localhost-only this epic") **no longer holds** now that admin is hosted, and **cleartext HTTP transport compounds** the exposure (a stolen token can be sniffed off the wire, not only exfiltrated via XSS). No refresh-token infra exists (deferred in `PHASE-NOTES.md`); the 1h expiry + no denylist is still the only limit. **Accepted for stage**; revisit with the refresh-token ticket and the TLS follow-up before prod exposure. |
| D-R3 | `/auth/register` is public and the admin SPA uses it to create users | Pre-existing; **hardened but not fixed** in TAM-82 ([B3](#b3-harden-authregister--role-is-never-an-input)) |
| E-R1 | TAM-80 boot-seeds unconditionally, environment-blind — **prod's first boot would seed demo content** | Pre-existing, owner-committed removal (`PHASE-NOTES.md`). **This epic makes it more urgent**: real content entered via the CMS lives beside picsum rows, and the empty-table guard is the only thing preventing demo data landing in prod. |
| E-R2 | Terraform state is local, unbacked, single-copy; `envs/prod` never applied; RDS `engine_version` drift makes every un-targeted apply hazardous | Pre-existing (`PHASE-NOTES.md`). **This epic adds 3 Terraform tickets (TAM-83/84/87)** — each apply must be `-target`ed and reviewed, and **the state situation should be fixed first.** Read `docs/DEPLOYMENT.md` before applying. |

---

## F. Definition of Done (epic level)

- [ ] All 8 modules + taxonomy have full CRUD in the admin panel; an editor can upload, see, and modify every content entity.
- [ ] `pnpm verify` green (arch boundaries, OpenAPI drift on **both** docs, typecheck, lint, unit tests).
- [ ] `pnpm nx test api --configuration=integration` green (real Postgres).
- [ ] `pnpm e2e:web` green, including a **real upload against floci S3**.
- [ ] Codegen chain regenerated + committed; **`apps/mobile/lib/api/generated/**` contains ZERO admin models** (asserted by test).
- [ ] **Pro-gating regression sweep**: every existing "free caller gets null" assertion still green ([A5](#a5-no-signed-urls-for-pro-media--product-decision)).
- [ ] **Every `/admin/*` route carries `[authMiddleware, adminMiddleware]`** — asserted mechanically, not by review ([B2](#b2-the-guard-resolves-the-role-from-the-database-fail-closed)).
- [ ] `pnpm check:arch-boundaries` green — **no rule relaxed**.
- [ ] No default admin password anywhere in the repo, Terraform, or `.env.example`.
- [ ] `docs/PHASE-NOTES.md` updated with A-R1 and the deferred items.
- [ ] One PR against `main`, referencing TAM-81.

---

## References

- `apps/api/CLAUDE.md` — module conventions, layering, facades
- `apps/admin/CLAUDE.md` — SPA conventions (`lib/api.ts` is the only HTTP entry point)
- `arch-boundaries.json` — machine-enforced layering
- `apps/api/prisma/schema.prisma` — single source of truth for every content model
- `apps/api/src/shared/schemas/media.ts` — the `mediaUrl` contract
- `docs/DEPLOYMENT.md` — **read before any Terraform apply** (state situation)
- `docs/PHASE-NOTES.md` — deferred-work ledger
- `specs/TAM-56-prabhuji-phase1-modules-epic.md` — Scope Decision 1 ("no admin UI in Phase 1") — this epic closes it
- `specs/TAM-79-codebuild-prisma-migrate.md`, `specs/TAM-80-stage-boot-seeding.md` — pipeline migration + boot-seeding context
