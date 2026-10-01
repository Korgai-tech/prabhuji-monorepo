/**
 * Redact a third-party payload so the whole body can be logged.
 *
 * Lives in `shared/logs` rather than beside the payment adapters because BOTH
 * the repository layer (the gateway clients, logging what they sent and got
 * back) and the controller layer (logging an inbound webhook) need it, and the
 * arch gate correctly forbids a controller from importing a repository. It is a
 * logging concern, so it belongs with logging.
 *
 * WHY LOG BODIES AT ALL. Until now the clients logged only method, path, status
 * and latency. When Cashfree started answering `404 endpoint or method is not
 * valid` to every debit in prod, that told us a call failed and nothing about
 * why; the gateway's own explanation was reachable only by querying the
 * database afterwards. A payment integration is mostly a contract with someone
 * else's server, and you cannot debug a contract you never wrote down.
 *
 * WHY NOT RAW. These logs leave the building — pino → OpenTelemetry → a
 * ClickHouse Cloud instance and the HyperDX UI. A raw Cashfree body carries the
 * payer's UPI handle, phone number and email; a raw Decentro body can echo
 * credentials. Shipping those to a third party is a data-protection problem
 * that no amount of debugging value pays for, and the module already refuses to
 * store the payer's full handle even in our OWN database (see
 * `core/payment/repositories/pii-mask.ts`).
 *
 * So: the full structure, with sensitive LEAVES replaced by a marker. You keep
 * every field name, every status, every error code, every id — and lose only
 * the values nobody should be reading out of a log viewer anyway.
 */

/** What a redacted value is replaced with. Distinct from `null` on purpose. */
const REDACTED = "[redacted]";

/** Lower-cased with separators stripped, so `payer_va`/`payerVa` compare equal. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, "");
}

/**
 * Key fragments whose STRING values are payer identity or secrets.
 *
 * Matched as substrings on the normalized key, because the two gateways
 * disagree about spelling for every one of these (`customer_phone` vs
 * `payerMobile`, `upi_id` vs `vpa` vs `payer_va`). An exact-key list would
 * silently miss the next vendor's variant, and the cost of missing one is a
 * real phone number in a third party's log.
 */
const SENSITIVE_FRAGMENTS = [
  "vpa",
  "upiid",
  "payer",
  "phone",
  "mobile",
  "email",
  "accountnumber",
  "ifsc",
  "aadhaar",
  "secret",
  "password",
  "signature",
  "apikey",
  "clientid",
  "token",
];

/**
 * Keys that are sensitive EXACTLY, and dangerous as substrings.
 *
 * `authorization` is the HTTP header — but `authorization_status: "SUCCESS"` and
 * `authorization_amount: 2` are the two fields that tell you whether a mandate
 * was approved and for how much, and blanking those makes the log useless for
 * the exact flow it exists to debug. Same shape of problem for `pan` (matches
 * "company", "expander") and `account` (matches "account_status").
 */
const SENSITIVE_EXACT = new Set([
  "authorization",
  "pan",
  "account",
  "cvv",
  // Cashfree puts the payer's UPI handle here on both the subscription status
  // response and every presentation webhook. It reads like an opaque
  // correlation id and is not — a live prod response carried
  // `…@okicici`. Exact-match rather than a `reference` fragment, which would
  // also blank `bank_reference_number` (an RRN, and the thing a disputed charge
  // is traced by).
  "authorizationreference",
]);

/**
 * A payment handle or email, wherever it turns up.
 *
 * The key-based rules above are only as good as the vendor's naming, and both
 * gateways have already surprised us once. This is the backstop: a value shaped
 * like `name@provider` is a UPI VPA or an email address regardless of the key
 * it arrived under, and neither belongs in a log that leaves the building.
 *
 * Deliberately strict — no whitespace, a single `@`, a dotted-or-plain right
 * hand side — so ordinary copy ("Prabhuji @ VIP") is untouched.
 */
const HANDLE_SHAPE = /^[\w.+-]+@[\w.-]+$/;

function isSensitiveKey(key: string): boolean {
  const k = normalizeKey(key);
  return SENSITIVE_EXACT.has(k) || SENSITIVE_FRAGMENTS.some((f) => k.includes(f));
}

/**
 * Redact in place-ish (returns a new value; never mutates the input).
 *
 * Note the recursion rule for a sensitive key whose value is an OBJECT: it
 * recurses rather than blanking the whole subtree. That keeps structurally
 * useful nesting like `payment_method: { upi: { channel: "link" } }` readable —
 * `channel` is exactly the sort of field you need when a gateway rejects a
 * request — while `upi_id: "someone@okhdfcbank"` is still replaced. Blanking
 * the subtree would throw away the shape along with the secret.
 */
function redactValue(value: unknown, keyIsSensitive: boolean): unknown {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, keyIsSensitive));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(v, isSensitiveKey(k));
    }
    return out;
  }

  // A leaf. Numbers and booleans are never identity — an amount, a status code
  // and a retry count are the whole point of logging this.
  if (typeof value !== "string" || value.length === 0) return value;
  if (keyIsSensitive || HANDLE_SHAPE.test(value)) return REDACTED;
  return value;
}

/** Deep-redact a gateway payload, preserving its structure. */
export function redactPayload(payload: unknown): unknown {
  return redactValue(payload, false);
}

/**
 * The form that goes into a log line: redacted, stringified, length-capped.
 *
 * Stringified rather than nested so the whole body lands in ONE searchable
 * field. Nested objects get flattened into dozens of columns by the log
 * pipeline, which makes `grep`-style incident work much harder than it should
 * be, and the shapes differ per endpoint so the columns never stabilise.
 *
 * The cap exists because a gateway that answers an error with an HTML page will
 * otherwise bury every surrounding line.
 */
export function redactedJson(payload: unknown, max = 4000): string | null {
  if (payload === null || payload === undefined) return null;
  let text: string;
  try {
    text = JSON.stringify(redactPayload(payload));
  } catch {
    // Circular or otherwise unserialisable. Say so rather than throwing from a
    // log statement — a logging failure must never fail a payment.
    return "[unserializable]";
  }
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…[truncated ${text.length - max} chars]`;
}
