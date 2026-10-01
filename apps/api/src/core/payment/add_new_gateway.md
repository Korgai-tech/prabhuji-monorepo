# Adding a new payment gateway

The payment module is a **registry of self-contained gateway plug-ins**. Adding a
provider means writing its provider-specific pieces and registering them in a few
one-liners.

**The cost is the same whether the new gateway REPLACES the current one or runs
ALONGSIDE it: new files plus three one-line registration edits. Nothing else.**

This doc used to end with "No controller, route, service, billing-engine, or
mobile changes", full stop. **That was only ever true of a replacement.** It was
written when exactly one gateway had ever existed, so provider selection happened
once at boot and every row in the database was implicitly on that gateway. The
moment a second gateway takes new registrations, that assumption charges existing
subscribers against a gateway that has never seen their ids.

Making the coexisting case true took a real refactor (TAM-152/153): per-row
provider resolution, one new adapter-declared member on `MandateProvider`
(`pdnLeadHours`), and a callback endpoint that resolves against the registry
rather than the active gateway. **That work is done** — so gateway N+1 needs no
edit to a controller, route, service or the billing engine, and no configuration
either.

This doc is the exact checklist. Examples use a hypothetical `acme` gateway.
**Razorpay is the worked reference** (`repositories/razorpay-mandate.repository.ts`,
`repositories/razorpay.constants.ts`, `providers/razorpay.gateway.ts`,
`services/razorpay-callback-auth.ts`) — it is the most recent gateway added and
it hit every seam below that is not obvious.

## ACTIVE is one variable, and there is deliberately no second one

`PAYMENT_PROVIDER` names the gateway **new** mandates register on, and only that.
Every gateway in the `PAYMENT_PROVIDERS` registry stays resolvable at all times —
there is no "enabled gateways" list to keep in step.

`mandates.provider` and `transactions.provider` have existed on every row since
the beginning and were, until TAM-152, written but never read. They are read now:
`ProviderResolver` (`mandate.provider.ts`) maps a row's provider name to that
gateway's adapter, and every call that touches an **existing** mandate goes
through it. `PAYMENT_PROVIDER` governs `createMandate` and nothing else.

That is the whole of "a user who signed up on gateway A stays on gateway A", and
it is why switching gateways is one env var with a free rollback: no row moves.

**An enabled-set variable was built (TAM-151 D6) and removed in review.** It
required naming the previously-active gateway in config at the moment you
switched away from it — and forgetting that one entry is precisely the case that
must never break, because its cost is every subscriber on the old gateway
silently ceasing to be debited. The registry already knows every gateway that
exists and `mandates.provider` already knows which one each subscriber is on;
neither needs a human to restate it.

**Adapters are therefore built LAZILY** — memoised on first use in
`initPaymentModule`. A gateway's client reads its credentials when constructed,
so building all of them eagerly would make an unconfigured gateway fail the
**boot**: "we have not set up Razorpay yet" would stop the service starting. Two
consequences follow, and both are deliberate:

- **Only the ACTIVE gateway's credentials are a boot requirement**
  (`PROVIDER_REQUIRED_KEYS` in `env.ts` is checked for `PAYMENT_PROVIDER` alone).
  A missing credential for a non-active gateway costs that gateway's rows —
  logged at error, that row skipped — instead of the whole process. Every other
  gateway's billing is untouched.
- **`UnknownProviderError` now means the ROW is wrong**, not that configuration
  is missing: a `provider` value naming no registered gateway (a hand-edited row,
  a restore from an older schema, a typo in a backfill).

## Architecture in one breath

- **`MandateProvider`** (`mandate.provider.ts`) — the interface every provider
  adapter implements: 7 methods plus 4 declared members. Business code depends
  only on this.
- **`ProviderResolver`** (`mandate.provider.ts`) — `(name) => MandateProvider`.
  How a ROW gets its own gateway. `MandateService` takes both this and the active
  adapter; `PdnService` and `BillingCycleService` take only this.
- **`PaymentGateway`** (`gateway.ts`) — a bundle that packages everything
  provider-specific behind provider-agnostic seams: the adapter, the webhook
  authenticator, and how to read/classify its webhook body.
- **`GATEWAYS`** (`gateways.ts`) — a `name → PaymentGateway` registry. The
  composition root resolves any registered name out of it, building each adapter
  on first use; the single `/payment/callbacks/:provider` endpoint resolves the
  `:provider` param against the same map, for **every** registered gateway.
  **No `switch`, no per-provider branches anywhere.**

Design patterns: **Strategy** (swappable behavior) + **Abstract Factory** (the
bundle produces a coherent adapter+auth family) + **Registry** (selection) +
**Adapter / Anti-Corruption Layer** (vendor↔domain translation), wired at a
**Composition Root**, with a **Front Controller** for the unified webhook.

---

## A. Register it — 3 one-line/one-row edits, and nothing else

### 1. `apps/api/src/shared/config/payment-providers.ts`
Add the name to the tuple and constants. This single tuple drives **both** the
env enum and the registry key type.

```ts
export const PAYMENT_PROVIDERS = ["stub", "decentro", "cashfree", "razorpay", "acme"] as const;

export const PROVIDER = {
  STUB: "stub",
  DECENTRO: "decentro",
  CASHFREE: "cashfree",
  RAZORPAY: "razorpay",
  ACME: "acme",
} as const satisfies Record<string, PaymentProviderName>;
```

`isPaymentProviderName` lives in this same file and is driven off the same tuple,
so the resolver accepts the new name for free — and a `provider` value that is
NOT in the tuple raises `UnknownProviderError` on the row that carries it.

### 2. `apps/api/src/shared/config/env.ts`
Declare the provider's env keys (use `optionalSecret(...)`) and add **one row**
to the `PROVIDER_REQUIRED_KEYS` table. The `superRefine` applies that row to the
**active** provider only, so a half-configured gateway you are switching TO fails
the boot loudly, while a gateway you have not set up yet does not stop the
service from starting.

```ts
// in the schema object:
ACME_BASE_URL: optionalSecret(z.string().url()),
ACME_KEY_ID: optionalSecret(z.string().min(1)),
ACME_KEY_SECRET: optionalSecret(z.string().min(1)),
ACME_WEBHOOK_SECRET: optionalSecret(z.string().min(1)),

// in PROVIDER_REQUIRED_KEYS:
[PROVIDER.ACME]: ["ACME_BASE_URL", "ACME_KEY_ID", "ACME_KEY_SECRET", "ACME_WEBHOOK_SECRET"],
```

Add a sandbox/live guard in the `superRefine` too, and **check what actually
distinguishes the two for your vendor.** Cashfree and Decentro are guarded on the
HOST (`sandbox.cashfree.com` vs `api.cashfree.com`). Razorpay has no sandbox host
at all — `api.razorpay.com` serves both — so its guard reads the **key prefix**
(`rzp_test_` / `rzp_live_`) against `PAYMENT_ENV`. Guarding the URL there would
have been a check that always passed while a staging deploy debited real people.

### 3. `apps/api/src/core/payment/gateways.ts`
Add **one line** to the registry.

```ts
export const GATEWAYS = {
  [PROVIDER.STUB]: stubGateway,
  [PROVIDER.DECENTRO]: decentroGateway,
  [PROVIDER.CASHFREE]: cashfreeGateway,
  [PROVIDER.RAZORPAY]: razorpayGateway,
  [PROVIDER.ACME]: acmeGateway,
} as const satisfies Record<PaymentProviderName, PaymentGateway>;
```

That is the whole registration. Going live with the gateway is then one variable:

```bash
# the new gateway takes new registrations; the old one keeps serving its own
# mandates, with no second variable to say so
PAYMENT_PROVIDER=acme
```

What the outgoing gateway does still need is its **credentials** left in place —
they are what its adapter reads when a row on it is next touched. Delete them and
that gateway's rows fail one at a time (`mandate_provider_unavailable`, at error)
while everything else keeps billing.

---

## B. Write the provider-specific pieces — new files only

### 4. `repositories/acme.client.ts`
The ONLY place an HTTP call to the vendor is made. Mirror `razorpay.client.ts` /
`cashfree.client.ts` / `decentro.client.ts`:
- native `fetch`, no HTTP-client dependency and no vendor SDK;
- a typed `AcmeApiError` (`status` + vendor code) — and expose whichever field is
  the vendor's MACHINE-readable key as its own property, because that is what the
  adapter branches on (`RazorpayApiError.reason` exists for exactly this);
- constructor reads `ACME_*` via `loadEnv()` + a `required()` guard;
- **`get()` retries** (429/5xx/timeout); **`post()` is single-attempt, never
  retried** (a retried debit = double charge — recover via a status read);
- hard `AbortSignal.timeout`;
- strict logging: method/path/status/latency/correlation-id ONLY — never
  credentials, request/response bodies, or auth URLs;
- fail-closed: throw on a 2xx with an unparseable body.

### 5. `repositories/acme.constants.ts`
Every vendor-specific string in one greppable place (mirror
`razorpay.constants.ts` / `cashfree.constants.ts`): endpoint paths, webhook
**event-type** strings, the status → `MandateState` map, the PII field names, and
any hard vendor LIMIT the adapter has to respect (Razorpay's 40-char `receipt`,
50-char `description` and ₹1 order minimum all live there rather than as magic
numbers in the adapter).

### 6. `repositories/acme-mandate.repository.ts`
`export class AcmeMandateProvider implements MandateProvider`. Translation only —
no business rules. Implement the **7 methods**:

| Method | Purpose |
|---|---|
| `createMandate` | register the mandate; return `{ providerMandateId, authUrl, authExpiresAt, state }` — `authUrl` must be a launchable link (`upi://` intent or an https approval page). |
| `getMandateStatus` | the confirm-by-poll read; map status → `MandateState`, mask payer VPA/name. |
| `notifyPreDebit` | NPCI pre-debit notification; return the `presentationSequenceId` (**nullable** — see 7b). |
| `getPreDebitStatus` | read a notification back, including an id it may not have carried when accepted. |
| `presentDebit` | present the debit; return `pending \| succeeded \| failed` + reconciliation trail. |
| `getDebitStatus` | read an already-presented debit (fail-closed → `pending`). |
| `revokeMandate` | cancel/revoke; void (post-state comes from the next status read). |

…and **declare 4 members**. All four exist so that no service ever branches on a
provider NAME: the adapter states its own semantics and the engine reads them.

| Member | What it declares | Values today |
|---|---|---|
| `name` | the registry key, stamped onto every ledger row | — |
| `chargePhase` | which of OUR calls irreversibly moves money, so recovery can ask "could this failure have charged someone?" | `notification` (Cashfree — notify schedules the charge) · `submission` (Decentro, Razorpay — the POST moves money) |
| `supportsInitialDeposit` | does registering take money? Read by `PaymentController.resolvePlan` to tell a misconfigured plan from a gateway that registers at ₹0 | `true` on all three live gateways |
| `pdnLeadHours` | how far ahead of the debit this gateway's pre-debit notification must be raised | Cashfree/Decentro/Razorpay `{min:24,max:48}` |
| `presentationTatHours` | hours after the notification before this gateway accepts a presentation — `null` when it REPORTS its own instant | Razorpay `25` (unconfirmed, see PAYMENT-FLOW.md) · Decentro/Cashfree/stub `null` |

**`pdnLeadHours` is on the adapter because the band is a VENDOR contract, not the
regulation.** The 24h floor is RBI's and is common to everyone; the ceiling is
not. Decentro documents "at least 24 to 48 hours"; Cashfree publishes no ceiling,
so 48h is our own choice; Razorpay debits ~25h after the notification is
DELIVERED, and at a 24h lead the gap between notifying (some time the day before)
and presenting (from 00:00 IST on the cycle date) can be a few hours — under that
TAT — which is why its floor is 48 rather than 24. The NPCI **execution** windows
and the 23:50 IST blackout deliberately stay global in `npci-window.ts`: those are
law, and a gateway does not get an opinion about them.

**⚠️ THE BAND IS SAMPLED AT DAY GRANULARITY — it MUST span a whole multiple of 24
hours or it is EMPTY.** `canSendPreDebitNotification` computes the lead as
`cycleDate - istDateOnly(now)`, and both sides are calendar dates at UTC midnight
(`cycle_date` and `next_debit_date` are `@db.Date`), so the lead is ALWAYS exactly
24h or 48h — never 25, never 30 — no matter what time of day the scheduler ticks.
A band of `{min:25, max:30}` reads like a tighter version of `{24,48}` and in fact
matches nothing: every tick reports `skippedOutsideWindow`, and that gateway
silently never bills anyone. No error, no failed row, no alert — mandates register
happily and are never charged. That is not hypothetical; it is exactly what
Razorpay's first band was, and only review caught it.
`__tests__/gateways.test.ts` now asserts every registered adapter's band contains
a whole-day lead **and** that its adapter list matches `GATEWAYS`, so a new
gateway cannot quietly skip the check.

**A gateway floor above 24h can make an existing PLAN unpurchasable — and that is
a 409, at registration.** `MandateService.createMandate` compares the plan's first
debit date against the ACTIVE gateway's `pdnLeadHours.min` and refuses with
`409 PLAN_NOT_PURCHASABLE` (logging `plan_trial_shorter_than_pdn_lead`) when the
debit lands inside it — so on Razorpay's 48h floor a 1-day trial is rejected up
front. The alternative is far worse than an error: the mandate registers, the
registration deposit is taken, and no cycle can ever be notified. Nothing fails,
because no cycle is ever claimed, so the only symptom is a subscriber who is never
billed again. If your gateway declares a floor above 24h, check `paywall_plans`
before you make it active.

**Retries are UNIFORM across gateways, and there is deliberately no member for
them.** `markForRetry` returns the row to `notified` KEEPING the sequence id, and
a later NPCI window re-presents against the still-live notification, bounded by
`MAX_PRESENTATION_RETRIES = 3`. There WAS a `retryNeedsNewNotification` member for
gateways that bind a debit to one id (Razorpay) and a
`redispatchReleasedNotifications` stage to re-arm those cycles. It shipped, and it
could not work for any gateway: a presentation only happens once the cycle date
has ARRIVED, so the lead available to a re-notification is ≤ 0 while the window
check demands ≥ 24h. Every released row failed that check forever, and a released
row is invisible to every other finder — not settled, not retried, not written off
— so the subscriber silently stopped being billed permanently. It is deleted. If
your gateway rejects a re-presentation of a spent id, that rejection burns the
retry budget LOUDLY and the cycle settles failed, which is the outcome to prefer.

**`debitRequestId(referenceId, cycleDate)` may need a gateway-specific FORMAT,
not just a value.** It is the per-cycle idempotency key: deterministic by
contract, persisted before dispatch, and what the recovery sweep asks the gateway
about after a transport failure — so the stored key and the sent key are built by
this one function precisely so they cannot drift. Return `null` only if the
gateway accepts no such key at all.

What is easy to miss is that the vendor may constrain the STRING. Razorpay has no
idempotency header anywhere on orders or payments; what it has is a uniqueness
constraint on an order's `receipt` — **capped at 40 ASCII characters**. The
template the other adapters use, `pj_pay_pj_mnd_<uuid>_<date>`, is about 45 and
does not fit, so the Razorpay adapter hashes instead of concatenating
(`pj_<YYYYMMDD>_<16 hex of SHA-256>`, 28 chars, and independent of how long a
reference id ever gets). Read your vendor's field limits before assuming the
shared template travels.

And check WHAT each key identifies before you reuse one. Razorpay's cycle order
carries a receipt derived from the NOTIFICATION's reference
(`pdn_notifications.reference_id`, re-minted on every re-arm), **not** from
`debitRequestId`: keyed on the cycle, a re-armed notification re-sent the spent
receipt, was refused as a duplicate every thirty minutes forever, and the
subscriber lapsed without a single failed debit anywhere. The notification's
reference has exactly the lifetime wanted — stable for one dispatch attempt, fresh
on a re-arm — so a transport retry stays idempotent while a genuine re-arm mints a
new order. It is also what lets `getPreDebitStatus` find the order when it holds
no order id, since the receipt is recomputable from the reference it is handed.

Rules the adapter MUST follow:
- Domain types only — **paise** (never rupee floats), `Date`s, our
  `MandateState`. The vendor's wire format never leaks past this file. Note which
  direction your vendor needs: Cashfree and Decentro take RUPEES on the wire and
  the adapter converts; Razorpay is paise in both directions and its adapter
  deliberately contains no `toRupees` at all, because adding one divides every
  charge by a hundred.
- Unknown mandate status → `"pending"`, **never** `"active"` (guessing active
  gives away paid content). Unknown debit outcome → `"pending"`.
- **A non-terminal-looking status may not be terminal.** Razorpay's
  `cancellation_initiated` is a request in flight with NPCI, so it maps to
  `active`; reading it as cancelled would strip a paying user's entitlement on a
  cancellation that may yet fail. Its payment status `created` means PENDING, not
  failed — HDFC and Axis settle from a batch file, so a healthy debit sits there
  for hours.
- **Mask payer PII** at the boundary using the shared `repositories/pii-mask.ts`
  (`maskVpa` / `maskPayerName`) — the full VPA/name never leaves the method.
- Reuse `repositories/intent-link.ts` (`findIntentLink`) if the approval link is
  buried in the response.
- **Read the vendor's cancel endpoint twice.** Razorpay's
  `DELETE /v1/customers/:cid/tokens/:tid` looks like the cancel and is not one:
  it deletes THEIR record of the token and leaves the NPCI mandate live and
  debitable — i.e. it removes our ability to stop the debits without stopping the
  debits. `PUT …/cancel` is the only correct call, and the adapter test asserts
  the verb.

### 7. `providers/acme.gateway.ts`
The `PaymentGateway` bundle — glue that ties the pieces together.

```ts
export const acmeGateway: PaymentGateway = {
  name: PROVIDER.ACME,
  createProvider: () => new AcmeMandateProvider(),
  createCallbackAuthenticator: (env) => new HmacAuthenticator(env.ACME_WEBHOOK_SECRET),
  extractRef,        // read THIS provider's webhook body → { referenceId, providerMandateId, presentationSequenceId, callbackTxnId, ... }
  callbackKindFor,   // map THIS provider's body → CALLBACK_KIND.MANDATE | .PDN | .PRESENTATION | null
};
```
- `extractRef(kind, body)` returns a `CallbackRef` — the routing fields (never
  the state). Use `str`/`int` from `callback.service.ts`.
- `callbackKindFor(body)` returns the internal kind, or `null` for events we
  don't act on (the endpoint acks those 200 and ignores them).

**Three kinds, and if your provider does not label its callbacks, check
most-specific-first.** `PDN` is the pre-debit notification's own lifecycle, and it is a
separate kind because it is about a different object than the debit. Two rules learned
the hard way:

- **Never make a kind the fallback.** Decentro's classifier was a two-way split with
  PRESENTATION as the default, so every PDN callback was handed to the settlement
  handler and its `presentation_sequence_id` discarded. Return `null` for anything you
  do not recognise — a body you cannot classify must not reach the code that settles
  money.
- **A PDN callback may not carry the mandate's reference.** Decentro's carries the
  *notification's*, so `CallbackService` resolves PDN callbacks through
  `PdnService.findForCallback` (our reference, then the provider's sequence id) before
  looking up the mandate. If your provider's PDN callback identifies the mandate
  instead, say so in a test — this failed silently for every delivery and looked
  exactly like the provider not sending callbacks.

If your gateway raises refunds, note that a refund callback often reuses
presentation-shaped keys; classify it FIRST or it will overwrite the original debit's
outcome with the refund's.

**`extractRef` sees the parsed BODY and nothing else — no headers.** That is a real
constraint, not a formality: Razorpay's true per-delivery id is the
`X-Razorpay-Event-Id` header, and it is the right dedupe key, but it is simply
unreachable from this seam. That adapter derives a body-only substitute
(`<event>:<entity id>`, stable across redeliveries of the same event) instead of
widening the interface. If your vendor's only usable dedupe key is a header, that is
the moment to widen the seam rather than invent something weaker — and say which you
did, in a comment.

**One opaque id may not be enough.** `MandateProvider` hands an adapter a single
`providerMandateId`, but Razorpay addresses a mandate as
`/customers/:cid/tokens/:tid` and its recurring-payment body takes `customer_id` and
`token` as separate fields. That adapter therefore stores the pair composited as
`cust_xxx:token_xxx` and parses it back out, with the webhook — the one payload
carrying both halves — as the place the pair is captured. Compose/parse through one
pair of functions so they cannot drift.

### 7b. Asynchronous notifications

`PreDebitResult.presentationSequenceId` is **nullable**, and `getPreDebitStatus` exists
because of it: a gateway may accept a notification and issue its id minutes later, by
callback. If yours is synchronous (Cashfree, the stub), return `status: "accepted"` with
the id and implement `getPreDebitStatus` as an echo. If it is asynchronous, return
`status: "sent"` with `null` and let the poll or the webhook resolve it — do **not**
throw, which is what made every Decentro cycle fail at notify.

Throw `NoSuchDebitError` from `getPreDebitStatus` only on a definitive "I looked and it
is not there". It is the one signal that lets a stranded cycle be superseded, so a
transport error thrown as this becomes a double charge.

### 8. `services/acme-callback-auth.ts` — ONLY if a new auth scheme is needed
Reuse an existing `CallbackAuthenticator` where possible:
- static token + IP allowlist → **`TokenIpAuthenticator`** (`callback-auth.ts`).
- HMAC-signed body → **`HmacAuthenticator`** (`cashfree-callback-auth.ts`) — but
  read the vendor's scheme before assuming it fits. "HMAC" is not one scheme:
  Cashfree signs `base64(HMAC(timestamp + rawBody))` and Razorpay signs
  `hex(HMAC(rawBody))` with no timestamp, which is why
  `services/razorpay-callback-auth.ts` exists as its own class. Copying the
  wrong shape produces a digest that never matches, and the symptom is every
  webhook 401ing while the code looks correct.
- provider issues no signing key at all → **`UnverifiedAuthenticator`**
  (`cashfree-callback-auth.ts`), which is what Cashfree wires. Only acceptable
  because `CallbackService` never trusts a callback body — it re-reads the
  provider's status API — so an unauthenticated POST triggers a re-check and
  nothing more. Do not reach for it to skip work on a provider that does sign.

A genuinely new scheme = one new class implementing `CallbackAuthenticator`
(`authenticate(ctx: CallbackAuthContext): boolean`). It reads only
`ctx.headers` / `ctx.rawBody` / `ctx.sourceIp` — no web-framework types, so it
stays trivially unit-testable. Return `false` → the controller responds 401.

> Note: if the scheme needs the **raw request bytes** (HMAC), they're already
> captured by the scoped content-type parser on the callback route (`index.ts`),
> exposed as `ctx.rawBody`. No extra wiring.

### 9. Tests
- `repositories/__tests__/acme-mandate.repository.test.ts` — mirror the
  Razorpay/Cashfree/Decentro adapter tests: fake `get`/`post` client, assert the
  outgoing body mapping, the status/outcome maps (`test.each`), a
  `JSON.stringify` PII no-leak boundary, and transport discipline (mutations via
  `post`, reads via `get`).
- **Encode each vendor limit and each "looks right, is wrong" call as a test.**
  The Razorpay suite asserts the `receipt` is ≤40 ASCII chars and deterministic,
  that `payments.status === "created"` maps to `pending`, and that revoke issues
  a `PUT …/cancel` and never a `DELETE`.
- If you wrote a new authenticator, unit-test the digest against a known
  secret/body pair — that is the failure mode with no other symptom than 401s.
- The **registry self-consistency test** (`__tests__/gateways.test.ts`)
  automatically verifies your tuple, enum, and registry all agree, and that your
  `pdnLeadHours` band contains a whole-day lead — no new test needed for either.
  It does require adding your adapter to that file's `ADAPTERS` list; a separate
  assertion fails if you do not, because an unlisted gateway would skip the band
  check.

---

## C. Deploy wiring (Terraform)

Mirror the Razorpay/Cashfree pattern:
- `infra/terraform/modules/stack/variables.tf` — sensitive `acme_*` vars, plus
  the non-secret `payment_provider` value.
- `infra/terraform/modules/stack/main.tf` — a `wire_acme` local (all credentials
  non-empty) + `aws_secretsmanager_secret[_version]` per credential (OpenAI-secret
  shape). Gated on the local, so the secrets are **inert until values are
  supplied**.
- `infra/terraform/modules/stack/services.tf` — add the credential ARNs to the
  `secrets` map. (The billing one-off task reuses the api task def, so it
  inherits these automatically.)
- `envs/<stage|prod>/{variables,main}.tf` — pass the vars through; real values in
  the gitignored `secrets.auto.tfvars`.

Note what belongs in `secrets` vs plain env: `RAZORPAY_BASE_URL` is wired as a
**secret** even though a base URL is not sensitive, so the four credentials stay
one block and one failure mode. Copy that rather than splitting them.

---

## What you do NOT touch (still true, and now true for a COEXISTING gateway too)

- ❌ `gateway.ts` — the interface is stable.
- ❌ `controllers/payment.callback.controller.ts` — generic; zero per-provider branches. It resolves `:provider` against the **whole registry**, so your gateway's webhooks work the day it is registered and the previous gateway's keep working after you switch. A gateway with no configured secret has nothing to verify against and its authenticator answers 401 — correct, and better than a 200 that silently drops a real settlement, because the provider retries a 401.
- ❌ `services/callback.service.ts` — generic; consumes the gateway's `extractRef`, and refuses a callback whose resolved mandate belongs to another gateway.
- ❌ `index.ts` composition root — lazy registry lookup, no `switch`.
- ❌ `routes/payment.routes.ts` — one unified `POST /payment/callbacks/:provider`.
- ❌ `mandate.provider.ts`, `services/mandate.service.ts`, `services/billing-cycle.service.ts` — the billing engine reads your DECLARED members (`chargePhase`, `supportsInitialDeposit`, `pdnLeadHours`, `presentationTatHours`) instead of branching on your name. Adding a member is an interface change; declaring the existing ones is not.
- ❌ **The Flutter app** — provider-agnostic, as long as `createMandate` returns a launchable `authUrl`. It reads the gateway name from `MandateData.provider` on the response; it used to carry a hardcoded `'decentro'` for analytics, which mislabelled every payment the moment a second gateway existed.

**And there is no configuration left over either** — registering the gateway is
what makes it resolvable, and `mandates.provider` is what routes each subscriber
to it. The only deploy-side obligation is that a gateway holding live mandates
keeps its credentials.

## The one unavoidable coupling (by design)

`shared/` may not import `core/` (arch boundary), so the provider **name** lives
in the tuple in `shared/config/payment-providers.ts` and its **required keys** in
`env.ts`. That's why steps 1–2 are in config. Everything *behavioral* is pure
registry-driven plug-in code under `core/payment/`.

---

## Verify

```bash
pnpm verify                                             # arch-boundaries, OpenAPI drift, typecheck, lint, unit
pnpm nx test api --configuration=unit                   # includes the registry self-consistency test
```

Then boot with `PAYMENT_PROVIDER=acme`:
- with all `ACME_*` set → boots on the new gateway;
- with any required key missing → fails the boot loudly with the missing-key list;
- with a *Decentro* credential missing → **still boots**, by design: Decentro's
  adapter is built lazily, so the failure lands on Decentro's own rows (at error,
  skipped) rather than on the whole service.

The startup line `payment_module_initialised` reports `provider` and
`resolvable_providers` — the latter is the whole registry, not configuration, so
"is the old gateway still reachable after the switch?" is answered by
construction.

Switching between gateways is a one-line env change —
`PAYMENT_PROVIDER=cashfree | decentro | razorpay | acme | stub` — and it is safe
in both directions, because no existing mandate moves. Rollback is the same line.

---

## Summary

| Change | Where | Size |
|---|---|---|
| Provider name | `shared/config/payment-providers.ts` | 1 tuple entry + 1 const |
| Required keys + schema | `shared/config/env.ts` | its keys + 1 table row |
| Registry entry | `core/payment/gateways.ts` | 1 line |
| HTTP client | `repositories/<gw>.client.ts` | new file |
| Wire constants | `repositories/<gw>.constants.ts` | new file |
| Adapter (7 methods + 4 declared members) | `repositories/<gw>-mandate.repository.ts` | new file |
| Gateway bundle | `providers/<gw>.gateway.ts` | new file |
| Auth (if new scheme) | `services/<gw>-callback-auth.ts` | new file (optional) |
| Tests | `repositories/__tests__/<gw>-mandate.repository.test.ts` | new file |
| Deploy secrets | `infra/terraform/modules/stack/*` + `envs/*` | mirror razorpay |

No controller, route, service, billing-engine or mobile **code** changes, and no
configuration change either — the per-row resolver, the lazily-built registry and
the adapter-declared members are what buy that.
