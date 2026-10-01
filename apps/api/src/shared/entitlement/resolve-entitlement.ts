import { createModuleLogger } from "@api/shared/logs";
import { performServiceCall } from "@api/shared/workspace";
import type { SubscriptionStatus } from "./types.js";

const log = createModuleLogger("shared:entitlement");

/**
 * THE ONLY PLACE IN THE API THAT MAY CALL `subscription.getStatus`.
 * (#EXPORT_CRITICAL)
 *
 * `computeIsEntitled` was already the single entitlement RULE. What was not
 * single was the way to reach it: three call sites read the facade directly and
 * ended up with three different failure behaviours — not by decision, but by
 * whichever file each was copied from. Two threw, one failed closed, and
 * nothing said which was correct where.
 *
 * The three wrappers below fix that by putting the failure policy IN THE NAME,
 * so choosing one is a deliberate act:
 *
 *   resolveProEntitlement   → false on failure   (content reads)
 *   requireProEntitlement   → throws on failure  (money decisions)
 *   readSubscriptionStatus  → throws on failure  (callers needing the full row)
 *   readSubscriptionStatuses → throws on failure (admin listings, batch)
 *
 * `scripts/check-entitlement-single-read.mjs` fails `pnpm verify` if a fourth
 * call site appears outside this directory. The arch-boundary checker cannot
 * express that — every one of them is a legal `shared/` import — so it is a
 * dedicated gate.
 *
 * Lives in `shared/` rather than a core module because the callers are
 * themselves core modules, and core→core imports are forbidden by the arch
 * gate. `shared/workspace/context.ts` already type-imports `ISubscriptionApi`
 * for the `GlobalServiceMap`, so this adds no new boundary crossing.
 */
async function readStatus(
  userId: string,
  context: string
): Promise<SubscriptionStatus> {
  return performServiceCall(
    "subscription",
    (api) => api.getStatus(userId),
    context,
    "failed to resolve entitlement"
  );
}

/**
 * The full subscription row, for callers that need more than a boolean.
 *
 * THROWS if the facade is unreachable. Note what cannot cause that: a user with
 * no subscription row. `SubscriptionService.getStatus` returns the free shape
 * defensively for a missing row, so the only way here is a dead facade or a
 * dead database — exactly the conditions under which guessing is worse than
 * failing.
 *
 * @param context Short `"<module>:<operation>"` label, surfaced in
 *                `performServiceCall` errors.
 */
export async function readSubscriptionStatus(
  userId: string,
  context: string
): Promise<SubscriptionStatus> {
  return readStatus(userId, context);
}

/**
 * TAM-187 — `readSubscriptionStatus` for a batch, keyed by userId, in one query.
 * For admin DISPLAY (the test-users list), never for a gate. THROWS on failure:
 * a list that silently shows everyone as free would be a lie, not a fallback.
 */
export async function readSubscriptionStatuses(
  userIds: string[],
  context: string
): Promise<Record<string, SubscriptionStatus>> {
  return performServiceCall(
    "subscription",
    (api) => api.getStatuses(userIds),
    context,
    "failed to resolve subscription statuses"
  );
}

/**
 * Pro entitlement, FAIL-CLOSED — any error resolving the subscription means
 * "free": no stream URL, no Pro payload.
 *
 * The right choice for a content read, where being wrong costs a user one
 * screen's worth of media they can retry into, and being wrong the other way
 * gives away paid content to everyone during an outage.
 */
export async function resolveProEntitlement(
  userId: string,
  context: string
): Promise<boolean> {
  try {
    const status = await readStatus(userId, context);
    return status.isEntitled;
  } catch {
    log.warn(
      { event: "entitlement_resolve_failed", user_id: userId, context },
      "entitlement check failed — failing closed (treating as free)"
    );
    return false;
  }
}

/**
 * Pro entitlement, FAIL-LOUD — an unresolvable subscription throws.
 *
 * For decisions about MONEY, where fail-closed is the dangerous direction.
 * The case that forces this: `MandateService.createMandate` reuses an existing
 * mandate when the caller is entitled, and RETIRES it (stamping `expired`, then
 * registering a fresh one) when they are not. A genuinely paying subscriber
 * whose approval link expired months ago — so `authUrl` is null — is protected
 * from that path by `entitled === true` and nothing else.
 *
 * Fail closed there and a transient database blip stamps a live NPCI mandate
 * `expired` and mints a second one against the same user: two live mandates and
 * a double charge waiting to happen. A 500 the client retries is strictly
 * better than silently destroying a working payment instrument.
 */
export async function requireProEntitlement(
  userId: string,
  context: string
): Promise<boolean> {
  const status = await readStatus(userId, context);
  return status.isEntitled;
}
