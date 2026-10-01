import { createHash } from "node:crypto";

/**
 * Home shortcut-grid A/B assignment (TAM-174).
 *
 * Pure, synchronous, IO-free — the same shape as `chat.buckets.ts` and
 * `paywall.buckets.ts`, and for the same reason: determinism is the property
 * that matters, and a resolver that varied between calls would silently move
 * users between arms rather than fail loudly. Trivially unit testable with no
 * database and no fixtures.
 *
 * ── WHAT THIS IS AND IS NOT ─────────────────────────────────────────────────
 * This is the FALLBACK rung of the ladder `HomeService` runs, not the whole
 * story. The shared abtesting service is asked first (`evaluateAbtest` with
 * `HOME_GRID_ABTEST_API_ID`); this map answers when that service is
 * unconfigured, unreachable, or has no experiment seeded for the surface —
 * which is every environment where `ABTEST_TENANT_KEY` is unset, prod included
 * at time of writing.
 *
 * Note what the two buckets are NOT: the service's response carries its own
 * `bucket` in a much larger space (values like 720 and 5529, with -1 as its
 * fail-soft tell). It is unrelated to the 0–99 map below and the two must never
 * be compared or conflated.
 *
 * ── WHY THE USER ID, SALTED ─────────────────────────────────────────────────
 * Same reasoning `chat.buckets.ts` sets out. Bucketing on the phone number (as
 * `paywall.buckets.ts` does) would make this experiment perfectly correlated
 * with the paywall's — every user in paywall arm A would also be in grid arm A
 * — and neither result could then be read independently. An experiment-specific
 * salt over the user id keeps the arms orthogonal, and costs nothing on the
 * request path because `getShortcuts` already holds the id.
 *
 * It also avoids the PII hazard the paywall module documents at length: that
 * bucket IS two digits of a phone number and can never be logged. A salted
 * digest of a uuid is not reversible to anything, so this bucket is safe to log
 * — though the ARM is the dimension the funnel actually needs, and the bucket
 * adds nothing to it.
 *
 * ── WHY THERE IS NO ASSIGNMENT TABLE ────────────────────────────────────────
 * Stickiness is structural, not enforced: the same user id always yields the
 * same bucket, and the map is a constant. That holds for exactly as long as both
 * do, which is why a traffic change here is a reviewed code change and a deploy
 * — and why the console is the better place to run the split once the service is
 * wired. The same trade the other two bucket modules make.
 */

/**
 * Salts the digest so this experiment's buckets are independent of any other
 * that hashes the same user id. Changing this value RE-BUCKETS EVERY USER —
 * it is not a secret, it is an experiment identity, and it should change only
 * when you deliberately want a fresh randomisation.
 *
 * Deliberately distinct from `chat.buckets.ts`'s `chat_agent_v1`: sharing a salt
 * would align the two experiments' arms and make each one's result unreadable
 * without conditioning on the other.
 */
const HOME_GRID_EXPERIMENT_SALT = "home_shortcut_grid_v1";

/**
 * The control arm's id.
 *
 * A REAL arm with its own CMS row, not the absence of one: the experiment ships
 * a complete tile per arm (own artwork, copy and palette), so control is
 * something ops authors rather than a fallback nobody owns.
 *
 * `resolveHomeGridVariant` still returns `null` for it — "no variant assigned"
 * and "assigned to control" are the same decision to the caller, and collapsing
 * them keeps the ladder's `null` checks single-branch. The caller maps `null`
 * onto this id when it goes looking for the row.
 */
export const HOME_GRID_VARIANT_CONTROL = "control";

/** `null` from the resolver reads as "control" — see the constant above. */
const CONTROL: null = null;

/** The gradient arm's id. Also the value reported to analytics as `grid_variant`. */
export const HOME_GRID_VARIANT_GRADIENT = "gradient_v1";

/**
 * Bucket range (inclusive, 0–99) → variant id, or `null` for the control arm.
 *
 * MUST cover 0–99 exactly once — asserted in `__tests__/home.buckets.test.ts`.
 * A gap silently drops users into control; an overlap makes the lookup
 * order-dependent. Both are invisible in production, which is why the test
 * exists rather than a comment asking you to be careful.
 *
 * Explicit ranges rather than percentage weights: weights are cumulative, so
 * adding a third arm would shift every boundary after it and re-bucket live
 * users. Ranges move only the users whose range you deliberately edit.
 *
 * 50/50 — product decision, 2026-09-11.
 */
const BUCKETS: readonly (readonly [number, number, string | null])[] = [
  [0, 49, CONTROL],
  [50, 99, HOME_GRID_VARIANT_GRADIENT],
];

/**
 * The 0–99 bucket for a user, or `null` when there is no id to bucket on.
 *
 * A null id is the caller's bug rather than a user state — `/home/shortcuts` is
 * `authMiddleware`-guarded, so every path into this reaches it from an
 * authenticated request — but it resolves to control rather than throwing,
 * because failing a whole Home load over an experiment is the wrong trade.
 */
export function homeGridBucketFor(userId: string | null | undefined): number | null {
  const id = (userId ?? "").trim();
  if (id === "") return null;
  const digest = createHash("sha256").update(`${HOME_GRID_EXPERIMENT_SALT}:${id}`).digest();
  // First two bytes, so the bucket does not depend on the digest's tail and is
  // stable if the hash length ever changes. Identical derivation to
  // `chat.buckets.ts` — only the salt differs, which is what keeps the two
  // experiments' arms independent.
  return ((digest[0] << 8) | digest[1]) % 100;
}

/**
 * Which grid arm this user falls in when the abtest service has not answered:
 * `HOME_GRID_VARIANT_GRADIENT`, or `null` for control.
 */
export function resolveHomeGridVariant(userId: string | null | undefined): string | null {
  const bucket = homeGridBucketFor(userId);
  if (bucket === null) return CONTROL;
  for (const [low, high, variant] of BUCKETS) {
    if (bucket >= low && bucket <= high) return variant;
  }
  // Unreachable while BUCKETS covers 0–99, which the test asserts.
  return CONTROL;
}

/** Exported for the coverage test only — the map itself is not part of the module's API. */
export const __HOME_GRID_BUCKETS_FOR_TEST = BUCKETS;
