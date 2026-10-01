import { createHash } from "node:crypto";

/**
 * Chat A/B assignment.
 *
 * Pure, synchronous, IO-free — the same shape as `paywall.buckets.ts` and for
 * the same reason: determinism is the property that matters, and a resolver
 * that varied between calls would silently move users between arms rather than
 * fail loudly. Trivially unit testable with no database and no fixtures.
 *
 * ── WHY THIS REPLACED AN EXTERNAL CALL ──────────────────────────────────────
 * Chat used to resolve its variant over HTTP against the shared experiment
 * platform, on the request path of `GET /users/me` — the call every app launch
 * makes. That cost a network round trip per launch, made "who gets chat" depend
 * on a service outside this repo, and required a per-environment tenant key
 * that production never had, so the whole feature was dark on prod. Any blip
 * resolved to "no variant", which meant chat silently switching off for
 * everyone until the platform recovered.
 *
 * ── WHY THE USER ID AND NOT THE PHONE NUMBER ────────────────────────────────
 * `paywall.buckets.ts` buckets on the phone number's last two digits. Reusing
 * that input here would make the two experiments PERFECTLY CORRELATED — every
 * user in paywall arm A would also be in chat arm A — and neither result could
 * then be read independently of the other. Hashing the user id with an
 * experiment-specific salt keeps the arms orthogonal, and it costs nothing on
 * the launch path because `getChatConfig` already holds the id.
 *
 * It also avoids the PII hazard the paywall module documents at length: the
 * paywall bucket IS two digits of a phone number, so it can never be logged.
 * A salted digest of a uuid is not reversible to anything, so the chat bucket
 * is safe to log and report on.
 *
 * ── WHY THERE IS NO ASSIGNMENT TABLE ────────────────────────────────────────
 * Stickiness is structural, not enforced: the same user id always yields the
 * same bucket, and the bucket map is a constant. That holds for exactly as long
 * as both do, which is why a traffic change is a reviewed code change and a
 * deploy rather than a console click — the same trade `paywall.buckets.ts`
 * makes, and the same one the old `VARIANT_AGENTS` comment already argued for
 * when it said an arm is only live once the code serving it exists.
 */

/**
 * Salts the digest so this experiment's buckets are independent of any other
 * that hashes the same user id. Changing this value RE-BUCKETS EVERY USER —
 * it is not a secret, it is an experiment identity, and it should change only
 * when you deliberately want a fresh randomisation.
 */
const CHAT_EXPERIMENT_SALT = "chat_agent_v1";

/**
 * Bucket range (inclusive, 0–99) → variant id, or `null` for the control arm.
 *
 * MUST cover 0–99 exactly once — asserted in `__tests__/chat.buckets.test.ts`.
 * A gap silently drops users into control; an overlap makes the lookup
 * order-dependent. Both are invisible in production, which is why the test
 * exists rather than a comment asking you to be careful.
 *
 * Explicit ranges rather than percentage weights: weights are cumulative, so
 * adding a fifth arm would shift every boundary after it and re-bucket live
 * users. Ranges move only the users whose range you deliberately edit.
 *
 * Every non-null id here MUST exist in `VARIANT_AGENTS` (`chat.constants.ts`)
 * or that arm resolves to no agent and behaves as control — asserted by the
 * same test file, so the two maps cannot drift apart.
 */
const BUCKETS: readonly (readonly [number, number, string | null])[] = [
  [0, 24, null],
  [25, 49, "kuldevta_chat"],
  [50, 74, "bhagwat_gita_chat"],
  [75, 99, "content_chat"],
];

/**
 * The 0–99 bucket for a user, or `null` when there is no id to bucket on.
 *
 * A null id is the caller's bug rather than a user state — every path into
 * this reaches it from an authenticated request — but it resolves to control
 * rather than throwing, because failing a whole app launch over an experiment
 * is the wrong trade.
 */
export function chatBucketFor(userId: string | null | undefined): number | null {
  const id = (userId ?? "").trim();
  if (id === "") return null;
  const digest = createHash("sha256").update(`${CHAT_EXPERIMENT_SALT}:${id}`).digest();
  // First two bytes, so the bucket does not depend on the digest's tail and is
  // stable if the hash length ever changes.
  return ((digest[0] << 8) | digest[1]) % 100;
}

/** The variant this user is in, or `null` for control / no chat. */
export function resolveChatVariant(userId: string | null | undefined): string | null {
  const bucket = chatBucketFor(userId);
  if (bucket === null) return null;
  for (const [low, high, variant] of BUCKETS) {
    if (bucket >= low && bucket <= high) return variant;
  }
  // Unreachable while BUCKETS covers 0–99, which the test asserts.
  return null;
}

export const __CHAT_BUCKETS_FOR_TEST = BUCKETS;
