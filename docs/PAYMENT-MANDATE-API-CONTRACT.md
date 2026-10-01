# Payment Mandate API — Contract for Multi-SDK Support

**Owner:** Mobile team
**Audience:** Backend team
**Status:** Proposed
**Related:** `apps/api/src/core/payment/routes/payment.routes.ts`, `apps/api/src/core/payment/routes/payment.schemas.ts`

## Goal

Extend `POST /payment/mandate` so the mobile client can pick the right in-app SDK to open based solely on the response. Client decides nothing, holds no credentials — it reads a `provider` discriminator and the paired SDK parameters, and opens the matching SDK.

Two SDKs to support:

- **Razorpay** — `razorpay_flutter` package. Needs a public API key + a subscription id.
- **Decentro** — Android SDK bridged via a Flutter MethodChannel. Needs a server-minted JWT + a composed mandate-request blob.

Both are Android-only today; iOS is out of scope.

## Endpoint

`POST /payment/mandate`

No change to auth (JWT-scoped, user acts on their own mandate) or to the request body (only `planId` in, per the existing contract — server owns the price).

### Request (unchanged)

```json
{ "planId": "vip_monthly" }
```

### Response — extended

The existing `MandateData` shape gains **one new required field** (`provider`) and **two optional payload blocks** (`razorpay`, `decentro`). Exactly one of the payload blocks is populated based on `provider`; the other is null.

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "mandateId": "mnd_abc123",
    "state": "initiated",
    "planId": "vip_monthly",
    "amountPaise": 29900,
    "currency": "INR",
    "requiresReRegistration": false,
    "subscription": { "...existing SubscriptionStatusData shape..." },
    "nextDebitDate": null,
    "startedAt": null,
    "authUrl": null,
    "authExpiresAt": null,

    "provider": "razorpay",   // NEW — see below
    "razorpay": {              // NEW — populated iff provider == "razorpay"
      "keyId": "rzp_live_XXXXXXXXXXXX",
      "orderId": "order_XXXXXXXXXXXX",
      "customerId": "cust_XXXXXXXXXXXX",
      "recurring": "1"
    },
    "decentro": null            // NEW — populated iff provider == "decentro"
  }
}
```

### Field reference (NEW fields only)

#### `provider` — required, one of a closed enum

```
"cashfree" | "decentro" | "razorpay"
```

Tells the client which flow to run. **Every response carries this field**, including when the user re-enters the paywall while entitled (in which case the SDK payloads may still be populated so the client can render context, but the bloc short-circuits on `isEntitled`).

The value MUST match the row's `mandates.provider` column — this is the wire representation of the server's choice for THIS mandate. It never changes across polls for the same mandate.

#### `razorpay` — object, nullable

Populated only when `provider == "razorpay"`. Null otherwise.

| Field | Type | Description |
|---|---|---|
| `keyId` | `string` | Razorpay's public API key (`rzp_live_XXX` / `rzp_test_XXX`). Public by design — safe to ship to the client. Consumed by the SDK's `Razorpay.open({key})`. |
| `orderId` | `string` | Razorpay's order id (`order_XXX`), minted by the server's call to `POST /v1/orders` with `payment_capture: 1`. Consumed by `Razorpay.open({order_id})`. |
| `customerId` | `string \| null` | Razorpay's customer id (`cust_XXX`), optional. When present the SDK enables saved-instrument reuse — required for the UPI Autopay flow. Consumed by `Razorpay.open({customer_id})`. |
| `recurring` | `string \| bool` | Marks the order as a recurring autopay mandate. Backend currently ships the literal string `"1"`; the client tolerates `"1"` / `1` / `true` / `"true"` and passes `recurring: true` to the SDK. |

`name`, `description`, `prefill.*` the client hard-codes locally — those don't change per user. `method: {upi: true}` is also client-side, restricting the sheet to UPI (autopay orders reject card / netbanking).

#### `decentro` — object, nullable

Populated only when `provider == "decentro"`. Null otherwise.

| Field | Type | Description |
|---|---|---|
| `accessToken` | `string` | JWT the Decentro SDK's `initialize(accessToken)` needs. Server obtains it by calling Decentro's `POST /sdk_exc/v2/auth/token` (client_credentials grant, 24h TTL). |
| `refreshToken` | `string \| null` | Optional refresh token from the same Decentro mint. |
| `mandateRequest` | `object` | Pre-composed `MandateDetails` blob the SDK's `startMandateCreation(request)` consumes. Server owns the composition — see `mandateRequest` shape below. |

##### `decentro.mandateRequest` shape

```json
{
  "referenceId": "pj_mnd_abc123",
  "consumerUrn": "urn:pjai:merchant",
  "mandateName": "Prabhuji VIP",
  "amountRupees": 299.00,
  "frequency": "ADHO",
  "ruleType": "BEFORE",
  "ruleValue": 28,
  "amountRule": "MAX",
  "startDate": "2026-08-05",
  "endDate": "2056-08-05",
  "expiryMinutes": 30,
  "purposeMessage": "Prabhuji VIP"
}
```

Every field is a passthrough to the Decentro SDK's `MandateDetails` schema. Amounts are RUPEES (double, 2-decimal) because that's Decentro's wire unit — server converts from paise before shipping. Dates are `YYYY-MM-DD` in IST.

## Client behaviour

Pseudocode of what the mobile client does with the response:

```dart
final snapshot = await repo.createMandate(planId: 'vip_monthly');

if (snapshot.isEntitled) {
  return _succeed();  // Already Pro; re-entry
}

switch (snapshot.provider) {
  case 'razorpay':
    await razorpayGateway.open(
      keyId: snapshot.razorpay!.keyId,
      subscriptionId: snapshot.razorpay!.subscriptionId,
    );
  case 'decentro':
    await decentroGateway.initialize(
      accessToken: snapshot.decentro!.accessToken,
      refreshToken: snapshot.decentro!.refreshToken,
    );
    await decentroGateway.startMandate(snapshot.decentro!.mandateRequest);
  case 'cashfree':
    // Existing intent-launch path — reads snapshot.authUrl.
    await upiLauncher.launch(snapshot.authUrl!);
}

// Poll GET /payment/mandate for entitlement — same as today.
```

The client:
- Holds NO SDK credentials at any point (all come from the response).
- Runs NO provider-selection logic (server decides).
- Cannot flip providers mid-mandate (the row's `provider` is immutable).

## Server behaviour (guidance, not prescriptive)

How the server picks `provider` per request is the backend team's call. Simplest options:

1. **Env-configured default** (`PAYMENT_PROVIDER=razorpay`) — fixed per environment, ops flips to switch.
2. **Load balancing** — round-robin, cost-based, or health-based split.
3. **Per-user pinning** — sticky assignment stored on the user row.

Whichever mechanism is chosen, the invariants that MUST hold:

- **Exactly one provider per mandate row.** `mandates.provider` is written on create and never mutated.
- **`authUrl` semantics preserved.** For `cashfree` the response still carries an `authUrl` (intent-launch). For `razorpay` / `decentro` the SDK path replaces it; `authUrl` should be `null` in those responses. (Or an empty string — client tolerates both, but null is cleaner.)
- **`GET /payment/mandate` returns the same provider + payload shape** as the create response, so polling doesn't switch flows underfoot.
- **Callback signature verification stays per-provider** — Razorpay's `X-Razorpay-Signature` HMAC-SHA256, Decentro's static token, Cashfree unsigned (existing).

## Non-goals

- Client-driven provider selection (e.g. `?preferredProvider=razorpay` in the request). Not needed for the pattern above; can be added later without breaking the shape.
- iOS support. Mobile is Android-first; both SDKs' iOS wiring is deferred.
- Multi-provider load-time coexistence. If the backend runs one active provider per environment, that's fine — the client contract doesn't care.

## Backward compatibility

If the response omits `provider` / `razorpay` / `decentro` (i.e. the backend hasn't shipped this contract yet), the mobile client must gracefully fall back to reading `authUrl` (the existing Cashfree/Decentro intent-launch path). All three new fields ship as nullable in the wire schema for exactly this reason — the mobile app can be updated to consume them before the backend implements, and vice versa.

## Zod schema sketch (`payment.schemas.ts`)

```typescript
export const RazorpaySdkPayload = z.object({
  keyId: z.string(),
  orderId: z.string(),
  customerId: z.string().nullable(),
  // Backend currently emits the literal string "1" — client tolerates
  // both bool and string. Tighten to `z.boolean()` if backend switches.
  recurring: z.union([z.string(), z.boolean()]),
}).meta({ id: "RazorpaySdkPayload" });

export const DecentroMandateRequestData = z.object({
  referenceId: z.string(),
  consumerUrn: z.string(),
  mandateName: z.string(),
  amountRupees: z.number(),
  frequency: z.string(),
  ruleType: z.string(),
  ruleValue: z.number().int(),
  amountRule: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  expiryMinutes: z.number().int(),
  purposeMessage: z.string().nullable(),
}).meta({ id: "DecentroMandateRequestData" });

export const DecentroSdkPayload = z.object({
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  mandateRequest: DecentroMandateRequestData,
}).meta({ id: "DecentroSdkPayload" });

export const PaymentProviderEnum = z
  .enum(["cashfree", "decentro", "razorpay"])
  .meta({ id: "PaymentProviderEnum" });

// Existing MandateData gains three fields:
export const MandateData = z.object({
  // ... all existing fields ...
  provider: PaymentProviderEnum,
  razorpay: RazorpaySdkPayload.nullable(),
  decentro: DecentroSdkPayload.nullable(),
}).meta({ id: "MandateData" });
```

## Callback endpoints (no client-facing change)

Existing route stays as-is: `POST /payment/callbacks/:provider` dispatches by URL path. Adding a `razorpay` case is a backend-only concern — the mobile client never sees callbacks.

## Rollout suggestion

1. Backend ships this contract (nullable fields → no drift for existing clients).
2. Mobile ships the SDK gateways + bloc branches that read `provider`.
3. Ops flips a test env to a new provider → validates end-to-end.
4. Prod rollout per-provider on the ops team's schedule.

Mobile release and backend release can be **independent** because every new field is nullable — an older mobile app reading a Razorpay response just ignores the `razorpay` block and falls to `authUrl` (which is null → surfaces the existing "no live link" failure, but doesn't crash).
