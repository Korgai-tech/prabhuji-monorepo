# Adding a new OTP provider

The OTP module is a **registry of delivery plug-ins**. Because we own the OTP
lifecycle and the vendor only carries the message, adding a provider is one small
file and three one-line edits — you touch **none** of the routes, schemas,
controller, `OtpService`, `LocalOtpProvider`, the OpenAPI chain, or the app.

This doc is the exact checklist. Examples use a hypothetical `twilio` provider.

> **A real worked example lives in the tree.** `trustsignal` (TAM-162) was added
> by following this checklist exactly, so `git log --oneline -- apps/api/src/core/otp`
> shows the whole diff. It is also the more interesting of the two providers to
> copy from, because it is the vendor that **composes its own message text**:
> TrustSignal has no server-side template rendering, so the DLT-registered body
> is an env var (`TRUSTSIGNAL_MESSAGE_TEMPLATE`) that the client substitutes
> into. If your vendor works like MSG91, copy MSG91; if it wants finished text,
> copy TrustSignal.

## Architecture in one breath

- **`OtpProvider`** (`services/otp.provider.ts`) — the interface `OtpService`
  depends on. Three methods: send, verify, resend. You almost certainly do
  **not** implement this.
- **`LocalOtpProvider`** (`services/local-otp.provider.ts`) — the shared
  implementation of that interface. It generates the code, HMACs it, expires it,
  counts attempts against it, burns it on first success, and enforces the
  per-phone delivery cap. Every real provider is this class plus a sender.
- **`OtpSmsSender`** (`services/sms-sender.ts`) — the vendor seam. **One method.**
  This is what you write.
- **`OTP_PROVIDER_FACTORIES`** (`providers.ts`) — a `name → () => OtpProvider`
  registry. The composition root looks a provider up by `AUTH_OTP_PROVIDER`.
  **No `switch`, no per-provider branches anywhere.**

Design patterns: **Strategy** (swappable delivery) + **Registry** (selection) +
**Adapter / Anti-Corruption Layer** (vendor↔domain translation), wired at a
**Composition Root**. Same shape as `core/payment` — see
`core/payment/add_new_gateway.md`.

### Why the vendor's own OTP product is not used

MSG91, Twilio Verify and friends all sell a full OTP service: they generate,
store and verify the code. We deliberately use only the SMS transport, because
otherwise every vendor brings its own expiry rules, its own attempt semantics,
and its own session identity — and `OTP_EXPIRY_MINUTES` / `OTP_MAX_ATTEMPTS`
become advisory numbers that mean something different per environment. Owning
the lifecycle keeps behaviour identical across providers and makes the
security-critical part unit-testable with no network and no credentials.

---

## A. Register it — 3 one-line/one-row edits

### 1. `apps/api/src/shared/config/otp-providers.ts`

Add the name to the tuple and the constants. This single tuple drives **both**
the env enum and the registry key type.

```ts
export const OTP_PROVIDERS = ["stub", "msg91", "twilio"] as const;

export const OTP_PROVIDER = {
  STUB: "stub",
  MSG91: "msg91",
  TWILIO: "twilio",
} as const satisfies Record<string, OtpProviderName>;
```

### 2. `apps/api/src/shared/config/env.ts`

Declare the provider's env keys (use `optionalSecret(...)`) and add **one row**
to the `OTP_PROVIDER_REQUIRED_KEYS` table. It is enforced in the `superRefine`,
so a half-configured provider fails the boot rather than failing every login.

```ts
// in the schema object:
TWILIO_ACCOUNT_SID: optionalSecret(z.string().min(1)),
TWILIO_AUTH_TOKEN: optionalSecret(z.string().min(1)),
TWILIO_FROM_NUMBER: optionalSecret(z.string().min(1)),

// in OTP_PROVIDER_REQUIRED_KEYS:
[OTP_PROVIDER.TWILIO]: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"],
```

The Redis requirement is already generic — it applies to every non-stub provider
and needs no edit.

### 3. `apps/api/src/core/otp/providers.ts`

Add **one line** to the registry. Note it is a factory, not an instance: booting
on another provider must never construct your client, whose constructor reads
credentials.

```ts
export const OTP_PROVIDER_FACTORIES = {
  [OTP_PROVIDER.STUB]: () => new StubOtpProvider(),
  [OTP_PROVIDER.MSG91]: () => new LocalOtpProvider(new Msg91SmsSender(new Msg91Client()), new RedisOtpSessionStore()),
  [OTP_PROVIDER.TWILIO]: () => new LocalOtpProvider(new TwilioSmsSender(new TwilioClient()), new RedisOtpSessionStore()),
} as const satisfies Record<OtpProviderName, () => OtpProvider>;
```

---

## B. Write the provider-specific pieces — new files only

### 4. `repositories/twilio.client.ts`

The ONLY place an HTTP call to the vendor is made. Mirror `msg91.client.ts`:

- native `fetch`, no HTTP-client dependency;
- a typed `TwilioApiError` (`status` + the vendor's code/reason);
- constructor reads `TWILIO_*` via `loadEnv()` behind the `required()` guard;
- hard `AbortSignal.timeout`;
- **never retried.** A retry is a second SMS — a duplicate code, double cost,
  and on a timeout you cannot tell whether the first one went out. The user
  pressing "resend" is the retry.
- **fail closed on the BODY, not just the status.** MSG91 answers HTTP 200 with
  `{"type":"error"}`; check whatever your vendor's equivalent is. Reporting
  "sent" for a message that never left strands the user on a code screen.
- strict logging: method, path, status, latency, the vendor's request id — and
  **nothing else**. Never the credential, never the recipient's number, and
  never the OTP.

### 5. `repositories/twilio.constants.ts`

Every vendor string in one greppable place (mirror `msg91.constants.ts`):
endpoint paths, header names, request/response field names, success literals.

### 6. `services/twilio.sms-sender.ts`

```ts
export class TwilioSmsSender implements OtpSmsSender {
  readonly name = OTP_PROVIDER.TWILIO;
  constructor(private readonly client: TwilioClient = new TwilioClient()) {}
  async sendOtp(input: { phoneCountryCode: string; phoneNumber: string; otp: string }): Promise<void> {
    await this.client.sendSms(/* … */);
  }
}
```

Translation only. It resolves when the vendor accepted the message and throws
otherwise — `LocalOtpProvider` reads a resolved promise as "the SMS is on its
way" and burns the session on a throw.

> It lives in `services/`, not `repositories/`: `arch-boundaries.json` forbids
> `repositories/` importing `/services/` (including type-only imports), and this
> must implement the `OtpSmsSender` interface declared there.
> `services/ → repositories/` is the sanctioned direction.

### 7. Tests

- `repositories/__tests__/twilio.client.test.ts` — mirror
  `msg91.client.test.ts`: a fake `fetch`, the outgoing body mapping, the
  number format, every fail-closed path (non-2xx, unparseable body, 200-with-error),
  "never retries", and a `JSON.stringify` no-leak assertion over the thrown
  error (no credential, no phone, no OTP).
- The **registry self-consistency test** (`__tests__/providers.test.ts`)
  automatically verifies your tuple and registry agree — no new test needed.
- You do **not** need lifecycle tests. `local-otp.provider.test.ts` already
  covers expiry, attempts, exhaustion, replay and resend for every provider.

---

## C. Deploy wiring (Terraform)

Mirror the MSG91 pattern:

- `infra/terraform/modules/stack/variables.tf` — sensitive `twilio_*` vars.
- `infra/terraform/modules/stack/main.tf` — a `wire_twilio` local +
  `aws_secretsmanager_secret[_version]` per credential.
- `infra/terraform/modules/stack/services.tf` — add the credential ARNs to the
  `secrets` map. `AUTH_OTP_PROVIDER` and `ENABLE_REDIS` are already wired.
- `envs/<stage|prod>/{variables,main}.tf` — pass the vars through; real values in
  the gitignored `secrets.auto.tfvars`.

Arm **stage first**. Real SMS costs money per message, and a mis-registered
template fails every login in the environment.

---

## What you do NOT touch (the whole point)

- ❌ `services/otp.provider.ts` — the interface is stable.
- ❌ `services/local-otp.provider.ts` — the lifecycle is provider-agnostic.
- ❌ `services/otp-session.store.ts` — every provider shares it.
- ❌ `services/otp.service.ts`, `controllers/`, `routes/` — no per-provider branches.
- ❌ `index.ts` composition root — registry lookup, no `switch`.
- ❌ `openapi.json` / `packages/api-client` / `apps/mobile` — the HTTP contract
  does not change. If `pnpm check:openapi` fires, something leaked into the
  route layer.

## The one unavoidable coupling (by design)

`shared/` may not import `core/` (arch boundary), so the provider **name** lives
in the tuple in `shared/config/otp-providers.ts` and its **required keys** in
`env.ts`. That is why steps 1–2 are in config. Everything *behavioral* is pure
registry-driven plug-in code under `core/otp/`.

---

## Verify

```bash
pnpm verify                                  # arch boundaries, OpenAPI drift, typecheck, lint, unit
pnpm nx test api --configuration=unit        # includes the registry self-consistency test
```

Then boot with `AUTH_OTP_PROVIDER=twilio`:

- with all `TWILIO_*` set and Redis on → boots on the new provider;
- with any required key missing → fails the boot loudly with the missing-key list;
- with `ENABLE_REDIS=false` → fails the boot (the session store is Redis-backed
  and the rate limiter silently no-ops without it).

Switching providers is a one-line env change:
`AUTH_OTP_PROVIDER=msg91 | trustsignal | twilio | stub`.

---

## Summary

| Change | Where | Size |
|---|---|---|
| Provider name | `shared/config/otp-providers.ts` | 1 tuple entry + 1 const |
| Required keys + schema | `shared/config/env.ts` | its keys + 1 table row |
| Registry entry | `core/otp/providers.ts` | 1 line |
| HTTP client | `repositories/<p>.client.ts` | new file |
| Wire constants | `repositories/<p>.constants.ts` | new file |
| Sender (1 method) | `services/<p>.sms-sender.ts` | new file |
| Tests | `repositories/__tests__/<p>.client.test.ts` | new file |
| Deploy secrets | `infra/terraform/modules/stack/*` + `envs/*` | mirror msg91 |

No route, schema, controller, service, lifecycle, contract, or mobile changes.
