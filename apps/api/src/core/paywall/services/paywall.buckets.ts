/**
 * Paywall A/B assignment (TAM-159).
 *
 * Pure, synchronous, IO-free functions — deliberately, and for the same reason
 * `core/otp/services/phone.bucket.ts` is: determinism is the property that
 * matters, and a resolver that varied between calls would silently move users
 * between variants rather than fail loudly. Trivially unit testable with no
 * database and no fixtures.
 *
 * ── THIS MODULE HANDLES PII, AND THE BUCKET IS PART OF IT ──────────────────
 * The bucket is the phone number's LAST TWO DIGITS. That is not a one-way
 * derivation: publishing a bucket publishes two digits of someone's phone
 * number. So the bucket must be treated as PII-adjacent — do NOT emit it as an
 * analytics property, and do not log it next to a user id. The resolved paywall
 * id is the safe dimension to report on, and it is the one the funnel needs.
 *
 * The number itself never leaves these functions: `PaywallService`'s log lines
 * are content-only by design.
 *
 * ── WHY THERE IS NO ASSIGNMENT TABLE ────────────────────────────────────────
 * Stickiness ("a user always sees the same paywall") is structural here, not
 * enforced: the same phone number always yields the same bucket, and the bucket
 * map is a constant. That holds for exactly as long as both do, which is
 * why traffic changes are a reviewed code change and a deploy rather than a CMS
 * click. The trade is deliberate — a persisted assignment would survive a map
 * edit, but it would also add a write to a read path that has none.
 */

/** The default/shipped paywall. Duplicated from `paywall.service` to keep this module dependency-free. */
const DEFAULT_PAYWALL_ID = "vip-membership-v1";

/**
 * Bucket range (inclusive, 0–99) → paywall id.
 *
 * MUST cover 0–99 exactly once — asserted in `__tests__/paywall.buckets.test.ts`.
 * A gap silently dumps users on the default; an overlap makes the lookup
 * order-dependent. Both are invisible in production, which is why the test
 * exists rather than a comment asking you to be careful.
 *
 * Explicit ranges rather than percentage weights: weights are cumulative, so
 * adding a fifth variant would shift every boundary after it and re-bucket live
 * users. Ranges move only the users whose range you deliberately edit.
 */
const BUCKETS: readonly (readonly [number, number, string])[] = [
  [0, 24, DEFAULT_PAYWALL_ID],
  [25, 49, "vip-video-bleed-v1"],
  [50, 74, "vip-icon-grid-v1"],
  [75, 99, "vip-carousel-v1"],
];

/**
 * The digits a phone number buckets on: the national number, non-digits stripped.
 *
 * ── NORMALIZATION IS WHAT MAKES THIS STICKY ────────────────────────────────
 * If the same human ever produces a different string here, they move to a
 * different paywall — the one thing this feature promises will not happen.
 * `phoneNumber` is stored bare and `phoneCountryCode` separately, but that is a
 * convention rather than a constraint, so spaces, hyphens and parentheses are
 * all stripped.
 *
 * The COUNTRY CODE is deliberately not part of this. The bucket is the last two
 * digits, so a prefix could not affect the result even if it were included —
 * concatenating it would just be a misleading line of code.
 *
 * What this cannot defend against is the stored VALUE changing: a user who
 * changes their number moves variants. Inherent to bucketing on the phone.
 *
 * Returns `null` when there is no usable number, which is a real state —
 * `User.phoneNumber` is nullable (email and admin accounts have none, and the
 * row is written at OTP *send*, before verify). Those callers get the default
 * paywall rather than being bucketed on a placeholder.
 */
export function phoneBucketDigits(
  phoneNumber: string | null | undefined
): string | null {
  const digits = (phoneNumber ?? "").replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/**
 * Which paywall this user belongs to, from their phone number.
 *
 * A null bucket (no phone on the account) resolves to the default paywall.
 */
export function resolvePaywallId(phoneNumber: string | null | undefined): string {
  const bucket = bucketFor(phoneNumber);
  if (bucket === null) return DEFAULT_PAYWALL_ID;
  return BUCKETS.find(([lo, hi]) => bucket >= lo && bucket <= hi)?.[2] ?? DEFAULT_PAYWALL_ID;
}

/**
 * The 0–99 bucket: the phone number's last two digits.
 *
 * `slice(-2)` rather than `Number(digits) % 100` — identical for every real
 * number, but it cannot lose precision on a long string and it says what it
 * means. A single-digit number yields itself (0–9), which is fine: those are not
 * real phone numbers, and the value is still in range.
 *
 * Indian mobile numbers allocate the OPERATOR in the leading digits and the
 * subscriber within that block in the trailing ones, so the last two digits are
 * effectively uniform and this splits evenly. Note the consequence in the module
 * docblock: unlike a hash, this bucket is reversible into two digits of the
 * number, so it must not be emitted as analytics.
 *
 * `null` when the account has no phone number to bucket on.
 */
export function bucketFor(phoneNumber: string | null | undefined): number | null {
  const digits = phoneBucketDigits(phoneNumber);
  if (digits === null) return null;
  return Number(digits.slice(-2));
}

/**
 * Parse a `major.minor.patch` string into a numeric tuple. `null` when it is not
 * exactly three non-negative integers — `"1.1"`, `"v1.1.0"`, `"1.1.0-beta"` and
 * `""` all fail, and every one of those is reachable in production
 * (`DeviceContext.appVersion` degrades to `''` when the platform channel fails,
 * and pre-header builds send nothing at all).
 */
function parseVersion(value: unknown): [number, number, number] | null {
  if (typeof value !== "string") return null;
  const parts = value.trim().split(".");
  if (parts.length !== 3) return null;
  const parsed = parts.map((part) => (/^\d+$/.test(part) ? Number.parseInt(part, 10) : Number.NaN));
  if (parsed.some((n) => !Number.isInteger(n))) return null;
  return [parsed[0], parsed[1], parsed[2]];
}

/**
 * May this client be served a paywall gated at `minAppVersion`?
 *
 * A layout only exists inside an app binary, so serving one to a build that
 * predates it renders a broken screen. This is that guard — and it takes the
 * minimum as an ARGUMENT rather than reading a module constant, because the
 * value now lives on the paywall row and is editable from the CMS. That also
 * removes the ceiling the old single global gate had: "layouts 1-4 shipped in
 * 1.1.0, layout 5 in 1.3.0" is now expressible, where before raising the one
 * constant would have cut off the four that were fine.
 *
 * Compared as a numeric 3-tuple, never as a string — `"1.0.99" > "1.1.0"`
 * lexicographically, which would hand a variant to a build that cannot render it.
 *
 * `0.0.0` means no gate. Anything unparseable on EITHER side denies: a typo in a
 * CMS-entered minimum sends users to the default paywall, which is the safe
 * direction, rather than to a screen their app cannot draw.
 *
 * The app version arrives in a client-controlled header and this is not a
 * security boundary: the worst a forged version buys you is seeing a variant early.
 */
export function meetsMinVersion(appVersion: unknown, minAppVersion: string): boolean {
  const min = parseVersion(minAppVersion);
  if (min === null) return false;
  if (min[0] === 0 && min[1] === 0 && min[2] === 0) return true;

  const actual = parseVersion(appVersion);
  if (actual === null) return false;
  for (let i = 0; i < 3; i += 1) {
    if (actual[i] !== min[i]) return actual[i] > min[i];
  }
  return true;
}

/** Exported for the coverage test only — the map itself is not part of the module's API. */
export const __BUCKETS_FOR_TEST = BUCKETS;
