import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { getPrisma } from "@api/shared/database";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { SubscriptionRepository } from "../subscription.repository.js";
import { computeIsEntitled } from "../../services/subscription.service.js";

/**
 * The billing transitions are the ONLY path that writes money-backed
 * entitlement, and every one of them runs against provider callbacks we do not
 * control the ordering or delivery count of. Two properties have to hold or
 * users get charged twice / lose access they paid for:
 *
 *   IDEMPOTENT — a replayed callback (Decentro retries, and `callback_attempt`
 *   increments on each) must not compound. Replaying "debit succeeded" must
 *   not grant a second month.
 *
 *   MONOTONIC — a callback that arrives late, for an event we have already
 *   moved past, must not overwrite the newer state. An authorization callback
 *   landing after the first debit must not pull an `active` user back to
 *   `trialing`.
 *
 * Both are enforced in the repository's WHERE clause rather than a
 * read-then-write, so these run against real Postgres — a mocked Prisma would
 * prove nothing about whether the predicate actually matches.
 */

const repo = new SubscriptionRepository();

const NOW = new Date("2026-07-21T00:00:00.000Z");
const PERIOD_END = new Date("2026-08-21T00:00:00.000Z");
const NEXT_PERIOD_END = new Date("2026-09-21T00:00:00.000Z");

beforeAll(async () => {
  await startTestDb();
}, 120_000);

afterAll(async () => {
  await stopTestDb();
});

/** A user id is just a uuid here — there is no FK to `users`. */
async function seedSubscription(status = "free"): Promise<string> {
  const userId = randomUUID();
  await getPrisma().subscription.create({ data: { userId, status } });
  return userId;
}

async function read(userId: string) {
  const row = await getPrisma().subscription.findUnique({ where: { userId } });
  if (!row) throw new Error("subscription row vanished");
  return row;
}

beforeEach(async () => {
  await getPrisma().subscription.deleteMany({});
});

describe("applyPendingMandate", () => {
  test("claims a free row without granting entitlement", async () => {
    const userId = await seedSubscription("free");
    await repo.applyPendingMandate({
      userId,
      provider: "decentro",
      providerSubscriptionId: "mandate-1",
      planId: "month",
      productId: "prabhuji_vip_month",
    });

    const row = await read(userId);
    expect(row.status).toBe("pending");
    expect(row.providerSubscriptionId).toBe("mandate-1");
    // The whole point: a created-but-unapproved mandate is worth nothing.
    expect(computeIsEntitled(row, NOW)).toBe(false);
  });

  test("does NOT knock an active user back to pending", async () => {
    // Re-registering while already subscribed (e.g. the user taps Pay again on
    // a second device) must not revoke the access they are paying for.
    const userId = await seedSubscription("active");
    await getPrisma().subscription.update({
      where: { userId },
      data: { expiresAt: PERIOD_END },
    });

    await repo.applyPendingMandate({
      userId,
      provider: "decentro",
      providerSubscriptionId: "mandate-2",
      planId: "month",
      productId: "prabhuji_vip_month",
    });

    const row = await read(userId);
    expect(row.status).toBe("active");
    expect(computeIsEntitled(row, NOW)).toBe(true);
  });
});

describe("applyMandateAuthorized", () => {
  test("starts the trial and stamps trialConsumedAt", async () => {
    const userId = await seedSubscription("pending");
    const trialEndsAt = new Date("2026-07-24T00:00:00.000Z");

    await repo.applyMandateAuthorized({
      userId,
      providerSubscriptionId: "mandate-1",
      planId: "month",
      productId: "prabhuji_vip_month",
      trialEndsAt,
      startedAt: NOW,
      now: NOW,
    });

    const row = await read(userId);
    expect(row.status).toBe("trialing");
    expect(row.trialEndsAt?.toISOString()).toBe(trialEndsAt.toISOString());
    expect(row.trialConsumedAt).not.toBeNull();
    expect(computeIsEntitled(row, NOW)).toBe(true);
  });

  /**
   * THE SIGNAL `bk_trial_success` AND `bk_subscription_trial_started` FIRE ON
   * (TAM-181).
   *
   * The trial stamp is a single `UPDATE … WHERE trial_consumed_at IS NULL`, so
   * "this statement moved a row" means "this call granted this user their first
   * trial, ever". The payment module gates both trial-start analytics events on
   * it, which is what turns a re-entrant approval path into one event per user.
   *
   * Asserted against a real Postgres because the claim is about the DATABASE's
   * atomicity, not about our TypeScript: a unit test with a mocked Prisma would
   * assert only that we believe the guard works.
   */
  test("reports the trial stamp only on the call that actually stamps it", async () => {
    const userId = await seedSubscription("pending");
    const input = {
      userId,
      planId: "month",
      productId: "prabhuji_vip_month",
      trialEndsAt: new Date("2026-07-24T00:00:00.000Z"),
      startedAt: NOW,
      now: NOW,
    };

    const first = await repo.applyMandateAuthorized({
      ...input,
      providerSubscriptionId: "mandate-1",
    });
    expect(first.trialFirstConsumed).toBe(true);
    const stampedAt = (await read(userId)).trialConsumedAt;
    expect(stampedAt).not.toBeNull();

    // The replay — a provider callback arriving after the client's poll already
    // won, or the self-heal branch re-running the grant. The write is still
    // idempotent, but it did NOT stamp the trial, so it must not claim to.
    const second = await repo.applyMandateAuthorized({
      ...input,
      providerSubscriptionId: "mandate-1",
      now: new Date("2026-07-22T00:00:00.000Z"),
    });
    expect(second.trialFirstConsumed).toBe(false);
    // And the original stamp is untouched — a later `now` must not slide it.
    expect((await read(userId)).trialConsumedAt?.toISOString()).toBe(
      stampedAt?.toISOString()
    );
  });

  test("under concurrent callers exactly ONE reports the trial stamp", async () => {
    // The claim the whole design rests on, and the one a sequential test cannot
    // make: the callback and the client's poll genuinely race here. If the
    // guarded UPDATE were not atomic — or if we had read the column and then
    // decided — both would report `true` and the user would get two events.
    const userId = await seedSubscription("pending");
    const authorize = (ref: string) =>
      repo.applyMandateAuthorized({
        userId,
        providerSubscriptionId: ref,
        planId: "month",
        productId: "prabhuji_vip_month",
        trialEndsAt: new Date("2026-07-24T00:00:00.000Z"),
        startedAt: NOW,
        now: NOW,
      });

    const results = await Promise.all([
      authorize("mandate-race-a"),
      authorize("mandate-race-b"),
      authorize("mandate-race-c"),
    ]);

    expect(results.filter((r) => r.trialFirstConsumed)).toHaveLength(1);
    expect((await read(userId)).trialConsumedAt).not.toBeNull();
  });

  test("a SECOND mandate never re-opens the trial", async () => {
    // THE most important business rule in the module. NPCI auto-revokes a
    // mandate whose first debit fails, so re-registration is a normal path —
    // and it must not become a way to farm free trials indefinitely.
    const userId = await seedSubscription("pending");
    const firstStamp = new Date("2026-07-21T00:00:00.000Z");
    await repo.applyMandateAuthorized({
      userId,
      providerSubscriptionId: "mandate-1",
      planId: "month",
      productId: "prabhuji_vip_month",
      trialEndsAt: new Date("2026-07-24T00:00:00.000Z"),
      startedAt: firstStamp,
      now: firstStamp,
    });
    const afterFirst = await read(userId);

    // Mandate revoked after a failed first debit, user re-registers a month on.
    await repo.applyMandateEnded({ userId, reason: "expired", now: NOW });
    const later = new Date("2026-08-21T00:00:00.000Z");
    await repo.applyMandateAuthorized({
      userId,
      providerSubscriptionId: "mandate-2",
      planId: "month",
      productId: "prabhuji_vip_month",
      // The service passes null once `trialConsumedAt` is set — no second trial.
      trialEndsAt: null,
      startedAt: later,
      now: later,
    });

    const row = await read(userId);
    expect(row.status).toBe("pending");
    expect(row.trialEndsAt).toBeNull();
    // The original stamp survives — it is write-once.
    expect(row.trialConsumedAt?.toISOString()).toBe(
      afterFirst.trialConsumedAt?.toISOString()
    );
    expect(computeIsEntitled(row, later)).toBe(false);
  });

  test("a late authorization callback does NOT pull an active user back", async () => {
    const userId = await seedSubscription("pending");
    await repo.applyDebitSucceeded({
      userId,
      periodEnd: PERIOD_END,
      planId: "month",
      productId: "prabhuji_vip_month",
    });

    await repo.applyMandateAuthorized({
      userId,
      providerSubscriptionId: "mandate-1",
      planId: "month",
      productId: "prabhuji_vip_month",
      trialEndsAt: new Date("2026-07-24T00:00:00.000Z"),
      startedAt: NOW,
      now: NOW,
    });

    const row = await read(userId);
    expect(row.status).toBe("active");
    expect(row.expiresAt?.toISOString()).toBe(PERIOD_END.toISOString());
  });
});

describe("applyDebitSucceeded", () => {
  test("replaying the SAME cycle does not grant a second month", async () => {
    // Decentro retries callbacks. If `periodEnd` were computed as
    // "expiresAt + 1 month" instead of being derived from the cycle date, three
    // delivery attempts would hand out three months for one payment.
    const userId = await seedSubscription("trialing");
    const input = {
      userId,
      periodEnd: PERIOD_END,
      planId: "month",
      productId: "prabhuji_vip_month",
    };

    await repo.applyDebitSucceeded(input);
    await repo.applyDebitSucceeded(input);
    await repo.applyDebitSucceeded(input);

    const row = await read(userId);
    expect(row.status).toBe("active");
    expect(row.expiresAt?.toISOString()).toBe(PERIOD_END.toISOString());
  });

  test("the NEXT cycle does extend, and clears trial + grace", async () => {
    const userId = await seedSubscription("trialing");
    await repo.applyDebitSucceeded({
      userId,
      periodEnd: PERIOD_END,
      planId: "month",
      productId: "prabhuji_vip_month",
    });
    await repo.applyDebitSucceeded({
      userId,
      periodEnd: NEXT_PERIOD_END,
      planId: "month",
      productId: "prabhuji_vip_month",
    });

    const row = await read(userId);
    expect(row.expiresAt?.toISOString()).toBe(NEXT_PERIOD_END.toISOString());
    expect(row.trialEndsAt).toBeNull();
    expect(row.graceUntil).toBeNull();
  });

  test("time only moves forward — an older cycle cannot shorten access", async () => {
    const userId = await seedSubscription("active");
    await repo.applyDebitSucceeded({
      userId,
      periodEnd: NEXT_PERIOD_END,
      planId: "month",
      productId: "prabhuji_vip_month",
    });
    // An out-of-order callback for the PREVIOUS cycle.
    await repo.applyDebitSucceeded({
      userId,
      periodEnd: PERIOD_END,
      planId: "month",
      productId: "prabhuji_vip_month",
    });

    const row = await read(userId);
    expect(row.expiresAt?.toISOString()).toBe(NEXT_PERIOD_END.toISOString());
  });
});

describe("applyDebitFailed", () => {
  test("keeps the user entitled through the grace window", async () => {
    // A 3am insufficient-balance failure must not lock someone out of content
    // they have been paying for — the retry may well succeed tomorrow.
    const userId = await seedSubscription("active");
    const graceUntil = new Date("2026-07-24T00:00:00.000Z");
    await repo.applyDebitFailed({ userId, graceUntil });

    const row = await read(userId);
    expect(row.status).toBe("past_due");
    expect(computeIsEntitled(row, NOW)).toBe(true);
    expect(computeIsEntitled(row, new Date("2026-07-25T00:00:00.000Z"))).toBe(
      false
    );
  });

  test("does not invent a grace window for a user who never paid", async () => {
    const userId = await seedSubscription("free");
    await repo.applyDebitFailed({
      userId,
      graceUntil: new Date("2026-07-24T00:00:00.000Z"),
    });

    const row = await read(userId);
    expect(row.status).toBe("free");
    expect(row.graceUntil).toBeNull();
  });
});

describe("applyMandateEnded", () => {
  test("cancelled preserves the paid-through date", async () => {
    const userId = await seedSubscription("active");
    await repo.applyDebitSucceeded({
      userId,
      periodEnd: PERIOD_END,
      planId: "month",
      productId: "prabhuji_vip_month",
    });

    await repo.applyMandateEnded({ userId, reason: "cancelled", now: NOW });

    const row = await read(userId);
    expect(row.status).toBe("cancelled");
    // They paid for this month; cancelling mid-month does not claw it back.
    expect(row.expiresAt?.toISOString()).toBe(PERIOD_END.toISOString());
    expect(computeIsEntitled(row, NOW)).toBe(true);
    expect(computeIsEntitled(row, new Date("2026-09-01T00:00:00.000Z"))).toBe(
      false
    );
  });

  test("expired (failed first debit) revokes immediately — nothing was paid", async () => {
    const userId = await seedSubscription("trialing");
    await getPrisma().subscription.update({
      where: { userId },
      data: { trialEndsAt: new Date("2026-07-24T00:00:00.000Z") },
    });

    await repo.applyMandateEnded({ userId, reason: "expired", now: NOW });

    const row = await read(userId);
    expect(row.status).toBe("expired");
    expect(row.expiresAt).toBeNull();
    expect(row.trialEndsAt).toBeNull();
    expect(computeIsEntitled(row, NOW)).toBe(false);
  });
});

describe("expireLapsed", () => {
  test("sweeps lapsed active/cancelled/past_due but leaves trialing alone", async () => {
    const past = new Date("2026-07-01T00:00:00.000Z");

    const lapsedActive = await seedSubscription("active");
    await getPrisma().subscription.update({
      where: { userId: lapsedActive },
      data: { expiresAt: past },
    });
    const lapsedCancelled = await seedSubscription("cancelled");
    await getPrisma().subscription.update({
      where: { userId: lapsedCancelled },
      data: { expiresAt: past },
    });
    const lapsedPastDue = await seedSubscription("past_due");
    await getPrisma().subscription.update({
      where: { userId: lapsedPastDue },
      data: { graceUntil: past },
    });
    // A trial whose window closed is mid-debit — the billing cycle owns that
    // outcome, and expiring it here would race the presentation we just fired.
    const closedTrial = await seedSubscription("trialing");
    await getPrisma().subscription.update({
      where: { userId: closedTrial },
      data: { trialEndsAt: past },
    });
    const liveActive = await seedSubscription("active");
    await getPrisma().subscription.update({
      where: { userId: liveActive },
      data: { expiresAt: PERIOD_END },
    });

    const swept = await repo.expireLapsed(NOW);

    // Rows, not a count — and PRE-transition, so each still carries the status
    // it lapsed FROM. That is what `bk_subscription_expired`'s `expiry_reason`
    // is built from.
    expect(swept.map((row) => row.status).sort()).toEqual([
      "active",
      "cancelled",
      "past_due",
    ]);
    expect((await read(lapsedActive)).status).toBe("expired");
    expect((await read(lapsedCancelled)).status).toBe("expired");
    expect((await read(lapsedPastDue)).status).toBe("expired");
    expect((await read(closedTrial)).status).toBe("trialing");
    expect((await read(liveActive)).status).toBe("active");
  });

  test("is safe to run repeatedly", async () => {
    const userId = await seedSubscription("active");
    await getPrisma().subscription.update({
      where: { userId },
      data: { expiresAt: new Date("2026-07-01T00:00:00.000Z") },
    });

    expect((await repo.expireLapsed(NOW)).map((row) => row.userId)).toEqual([
      userId,
    ]);
    // Second run returns nothing to emit for — the sweep is idempotent, and so
    // is the event stream that hangs off it.
    expect(await repo.expireLapsed(NOW)).toEqual([]);
  });
});

describe("trial eligibility (hasConsumedTrial)", () => {
  // Regression: found on-device. The first payment attempt moves the
  // subscription to `pending` BEFORE the user has approved anything. Inferring
  // "they've had a trial" from `status !== free` therefore burned the trial on
  // any first attempt that failed — no UPI app installed, user cancelled, link
  // expired, network dropped. All normal paths, none of which grant anything.
  //
  // The only correct signal is `trialConsumedAt`, which is stamped exclusively
  // when a trial is actually granted.

  test("a pending mandate does NOT consume the trial", async () => {
    const userId = await seedSubscription("free");
    await repo.applyPendingMandate({
      userId,
      provider: "decentro",
      providerSubscriptionId: "mandate-1",
      planId: "month",
      productId: "prabhuji_vip_month",
    });

    const row = await read(userId);
    expect(row.status).toBe("pending");
    // The user has received nothing, so they are still owed their trial.
    expect(row.trialConsumedAt).toBeNull();
  });

  test("only an ACTUAL grant stamps trialConsumedAt", async () => {
    const userId = await seedSubscription("pending");
    expect((await read(userId)).trialConsumedAt).toBeNull();

    await repo.applyMandateAuthorized({
      userId,
      providerSubscriptionId: "mandate-1",
      planId: "month",
      productId: "prabhuji_vip_month",
      trialEndsAt: new Date("2026-07-24T00:00:00.000Z"),
      startedAt: NOW,
      now: NOW,
    });

    expect((await read(userId)).trialConsumedAt).not.toBeNull();
  });

  test("authorizing WITHOUT a trial leaves the stamp unset", async () => {
    // A re-registration after a consumed trial passes trialEndsAt: null. That
    // must not retroactively stamp a user who never had one.
    const userId = await seedSubscription("pending");
    await repo.applyMandateAuthorized({
      userId,
      providerSubscriptionId: "mandate-2",
      planId: "month",
      productId: "prabhuji_vip_month",
      trialEndsAt: null,
      startedAt: NOW,
      now: NOW,
    });

    expect((await read(userId)).trialConsumedAt).toBeNull();
  });

  test("a failed first attempt leaves the user still eligible", async () => {
    // The exact on-device sequence: create a mandate (status -> pending), the
    // launch fails, the user retries. They must still get their 3 days.
    const userId = await seedSubscription("free");
    await repo.applyPendingMandate({
      userId,
      provider: "decentro",
      providerSubscriptionId: "mandate-1",
      planId: "month",
      productId: "prabhuji_vip_month",
    });

    // Second attempt, which succeeds.
    await repo.applyMandateAuthorized({
      userId,
      providerSubscriptionId: "mandate-2",
      planId: "month",
      productId: "prabhuji_vip_month",
      trialEndsAt: new Date("2026-07-24T00:00:00.000Z"),
      startedAt: NOW,
      now: NOW,
    });

    const row = await read(userId);
    expect(row.status).toBe("trialing");
    expect(computeIsEntitled(row, NOW)).toBe(true);
  });
});

/**
 * The two-write sequence a FULL-PRICE (no-trial) registration produces (TAM-148).
 *
 * `MandateService.onStateChanged` calls `applyMandateAuthorized` — which writes
 * `pending` when `trialEndsAt` is null — and then `applyDebitSucceeded` for the
 * period the registration charge already bought. Neither call alone is the
 * behaviour; the pair is, so it is the pair that gets pinned.
 *
 * Shipping only the first half is what left a production user `pending` after
 * paying ₹299, unentitled until the first cycle debit a month later.
 */
describe("a full-price registration (authorized + debit-succeeded)", () => {
  test("ends entitled, through the period the charge paid for", async () => {
    const userId = await seedSubscription("expired");

    await repo.applyMandateAuthorized({
      userId,
      providerSubscriptionId: "mandate-fp",
      planId: "month",
      productId: "prabhuji_vip_month",
      // No trial — this user already consumed theirs, so registration took the
      // full price rather than the ₹2 deposit.
      trialEndsAt: null,
      startedAt: NOW,
      now: NOW,
    });

    // Halfway through the sequence the user is deliberately NOT entitled: the
    // mandate is live but nothing has yet recorded what was paid for.
    expect(computeIsEntitled(await read(userId), NOW)).toBe(false);

    await repo.applyDebitSucceeded({
      userId,
      periodEnd: PERIOD_END,
      planId: "month",
      productId: "prabhuji_vip_month",
    });

    const row = await read(userId);
    expect(row.status).toBe("active");
    expect(row.expiresAt).toEqual(PERIOD_END);
    expect(computeIsEntitled(row, NOW)).toBe(true);
    // The trial was never granted, so it must not have been consumed either —
    // this user is re-registering precisely because theirs is already spent.
    expect(row.trialEndsAt).toBeNull();
  });

  test("replaying the whole sequence grants nothing extra", async () => {
    const userId = await seedSubscription("expired");
    const authorize = () =>
      repo.applyMandateAuthorized({
        userId,
        providerSubscriptionId: "mandate-fp",
        planId: "month",
        productId: "prabhuji_vip_month",
        trialEndsAt: null,
        startedAt: NOW,
        now: NOW,
      });
    const settle = () =>
      repo.applyDebitSucceeded({
        userId,
        periodEnd: PERIOD_END,
        planId: "month",
        productId: "prabhuji_vip_month",
      });

    await authorize();
    await settle();
    await authorize();
    await settle();

    const row = await read(userId);
    expect(row.status).toBe("active");
    // Not NEXT_PERIOD_END — a replay must not roll the period forward.
    expect(row.expiresAt).toEqual(PERIOD_END);
  });

  test("a late authorization callback does not revoke the granted period", async () => {
    // Decentro retries callbacks, so the authorization can land AFTER the grant.
    // `active` is outside CLAIMABLE_STATES, which is the only thing stopping it
    // from writing `pending` over a paid-up row.
    const userId = await seedSubscription("expired");

    await repo.applyDebitSucceeded({
      userId,
      periodEnd: PERIOD_END,
      planId: "month",
      productId: "prabhuji_vip_month",
    });
    await repo.applyMandateAuthorized({
      userId,
      providerSubscriptionId: "mandate-fp",
      planId: "month",
      productId: "prabhuji_vip_month",
      trialEndsAt: null,
      startedAt: NOW,
      now: NOW,
    });

    const row = await read(userId);
    expect(row.status).toBe("active");
    expect(computeIsEntitled(row, NOW)).toBe(true);
  });
});
