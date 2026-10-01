import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import type {
  SubscriptionRepository,
  SubscriptionRow,
} from "../../repositories/subscription.repository.js";
import {
  SubscriptionService,
  computeIsEntitled,
  entitlementDeadline,
} from "../subscription.service.js";
import {
  SubscriptionStatusData,
  SubscriptionStatusEnum,
} from "../../routes/subscription.schemas.js";
import { analyticsEventsClient } from "@api/shared/analytics";

/**
 * Provider mock — one `vi.fn()` per repository method, cast to the interface
 * shape. Tests set return values per case.
 */
interface RepoMock {
  findByUserId: Mock;
  upsertFreeForUser: Mock;
}

function makeRepoMock(): { mock: RepoMock; repo: SubscriptionRepository } {
  const mock: RepoMock = {
    findByUserId: vi.fn(),
    upsertFreeForUser: vi.fn(),
  };
  const repo = mock as unknown as SubscriptionRepository;
  return { mock, repo };
}

/**
 * Every test in this file runs at this instant. `getStatus` now computes
 * `isEntitled` against `new Date()`, so without a pinned clock the fixtures
 * below (which carry a 2026-12-31 expiry) would silently flip from entitled
 * to not-entitled on 2027-01-01 and the suite would start failing for
 * reasons unrelated to any code change.
 */
const NOW = new Date("2026-07-01T00:00:00.000Z");
/** Comfortably after NOW, so every deadline column is a live one. */
const LATER = new Date("2026-08-01T00:00:00.000Z");

function makeFreeRow(userId: string): SubscriptionRow {
  const now = new Date("2026-01-01T00:00:00Z");
  return {
    id: `sub-${userId}`,
    userId,
    status: "free",
    activePlanId: null,
    activeProductId: null,
    provider: null,
    providerSubscriptionId: null,
    expiresAt: null,
    startedAt: null,
    trialEndsAt: null,
    trialConsumedAt: null,
    graceUntil: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeActiveRow(userId: string): SubscriptionRow {
  const started = new Date("2026-06-01T00:00:00Z");
  const expires = new Date("2026-12-31T23:59:59Z");
  return {
    id: `sub-${userId}`,
    userId,
    status: "active",
    activePlanId: "plan_month",
    activeProductId: "product_month",
    provider: "decentro",
    providerSubscriptionId: "mandate_xyz",
    expiresAt: expires,
    startedAt: started,
    trialEndsAt: null,
    trialConsumedAt: started,
    graceUntil: null,
    createdAt: started,
    updatedAt: started,
  };
}

describe("SubscriptionService.getStatus", () => {
  let mock: RepoMock;
  let service: SubscriptionService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const built = makeRepoMock();
    mock = built.mock;
    service = new SubscriptionService(built.repo);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns the free shape when no row exists (defensive default)", async () => {
    mock.findByUserId.mockResolvedValueOnce(null);
    const result = await service.getStatus("user-x");
    expect(result).toEqual({
      status: "free",
      isEntitled: false,
      entitledUntil: null,
      activePlanId: null,
      activeProductId: null,
      provider: null,
      expiresAt: null,
      trialEndsAt: null,
      startedAt: null,
    });
  });

  test("returns the free shape verbatim for a seeded free row", async () => {
    mock.findByUserId.mockResolvedValueOnce(makeFreeRow("user-1"));
    const result = await service.getStatus("user-1");
    expect(result).toEqual({
      status: "free",
      isEntitled: false,
      entitledUntil: null,
      activePlanId: null,
      activeProductId: null,
      provider: null,
      expiresAt: null,
      trialEndsAt: null,
      startedAt: null,
    });
  });

  test("passes through an active subscription (plan/product/provider/expires)", async () => {
    mock.findByUserId.mockResolvedValueOnce(makeActiveRow("user-2"));
    const result = await service.getStatus("user-2");
    expect(result.status).toBe("active");
    expect(result.isEntitled).toBe(true);
    expect(result.activePlanId).toBe("plan_month");
    expect(result.activeProductId).toBe("product_month");
    expect(result.provider).toBe("decentro");
    // ISO-8601 wire format.
    expect(result.expiresAt).toBe("2026-12-31T23:59:59.000Z");
    // TAM-125: "member since" — sourced from `subscriptions.startedAt`.
    expect(result.startedAt).toBe("2026-06-01T00:00:00.000Z");
  });

  test("an `active` row whose expiresAt has PASSED is not entitled", async () => {
    // The regression this ticket fixes: the read path used to return the row
    // verbatim and never compare `expiresAt` to now, so a lapsed `active`
    // row granted Pro forever. `status` still reads `active` (the write path
    // owns the transition to `expired`); `isEntitled` is what gates access.
    mock.findByUserId.mockResolvedValueOnce({
      ...makeActiveRow("user-lapsed"),
      expiresAt: new Date("2026-06-30T23:59:59Z"), // one day before NOW
    });
    const result = await service.getStatus("user-lapsed");
    expect(result.status).toBe("active");
    expect(result.isEntitled).toBe(false);
  });

  test("a `trialing` row inside its window is entitled", async () => {
    mock.findByUserId.mockResolvedValueOnce({
      ...makeActiveRow("user-trial"),
      status: "trialing",
      expiresAt: null,
      trialEndsAt: new Date("2026-07-04T00:00:00Z"),
      trialConsumedAt: NOW,
    });
    const result = await service.getStatus("user-trial");
    expect(result.status).toBe("trialing");
    expect(result.isEntitled).toBe(true);
    expect(result.trialEndsAt).toBe("2026-07-04T00:00:00.000Z");
  });

  test("expiresAt is null when the row's expiresAt column is null", async () => {
    const row = makeFreeRow("user-3");
    // Row is 'free' but we still want to prove the null passthrough works
    // when the column is absent — mimics the seeded free-tier row shape.
    mock.findByUserId.mockResolvedValueOnce(row);
    const result = await service.getStatus("user-3");
    expect(result.expiresAt).toBeNull();
  });

  test("expiresAt is a valid ISO 8601 datetime string when present", async () => {
    mock.findByUserId.mockResolvedValueOnce(makeActiveRow("user-4"));
    const result = await service.getStatus("user-4");
    expect(result.expiresAt).not.toBeNull();
    // The `.datetime()` schema check succeeds on this string — this is the
    // same guard the Fastify response serializer applies at runtime.
    const parsed = SubscriptionStatusData.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  test("passes through expired status (no auto-downgrade to free in this ticket)", async () => {
    // Per the TAM-47 spec's "Notes for Execution Agent": the read path is
    // pure — if the row says `expired`, we return `expired`. Computing
    // expiry vs now() is a follow-up ticket concern.
    const row = { ...makeActiveRow("user-5"), status: "expired" };
    mock.findByUserId.mockResolvedValueOnce(row);
    const result = await service.getStatus("user-5");
    expect(result.status).toBe("expired");
  });

  test("unknown DB status narrows to 'free' defensively", async () => {
    const row = { ...makeFreeRow("user-6"), status: "banana" };
    mock.findByUserId.mockResolvedValueOnce(row);
    const result = await service.getStatus("user-6");
    expect(result.status).toBe("free");
  });
});

describe("computeIsEntitled (the single entitlement rule)", () => {
  const PAST = new Date("2026-06-01T00:00:00Z");
  const FUTURE = new Date("2026-08-01T00:00:00Z");

  /** Build the minimal entitlement input; every date defaults to null. */
  function row(
    status: string,
    dates: { expiresAt?: Date; trialEndsAt?: Date; graceUntil?: Date } = {}
  ) {
    return {
      status,
      expiresAt: dates.expiresAt ?? null,
      trialEndsAt: dates.trialEndsAt ?? null,
      graceUntil: dates.graceUntil ?? null,
    };
  }

  test.each([
    // --- never entitled, regardless of dates -------------------------------
    ["free", {}, false],
    ["free", { expiresAt: FUTURE }, false],
    ["pending", {}, false],
    // A mandate exists but the user hasn't approved it in their UPI app yet.
    // Entitling here would give away the product for a tap that costs nothing.
    ["pending", { expiresAt: FUTURE, trialEndsAt: FUTURE }, false],
    ["expired", {}, false],
    ["expired", { expiresAt: FUTURE }, false],

    // --- trialing: keys on trialEndsAt ------------------------------------
    ["trialing", { trialEndsAt: FUTURE }, true],
    ["trialing", { trialEndsAt: PAST }, false],
    // No deadline recorded ⇒ no deadline to be past. Shouldn't happen (the
    // write path always stamps it), but fail-open here is harmless: the
    // billing cycle sweeps the row within the hour.
    ["trialing", {}, true],
    // `expiresAt` is irrelevant while trialing — no money has moved yet.
    ["trialing", { trialEndsAt: FUTURE, expiresAt: PAST }, true],

    // --- active: keys on expiresAt ----------------------------------------
    ["active", { expiresAt: FUTURE }, true],
    ["active", { expiresAt: PAST }, false],
    // Lifetime grant — exactly what devtools' mark-pro writes.
    ["active", {}, true],

    // --- past_due: keys on graceUntil, and null does NOT grant ------------
    ["past_due", { graceUntil: FUTURE }, true],
    ["past_due", { graceUntil: PAST }, false],
    // The one case where a null date denies: no grace window was ever
    // opened, so there is nothing to be inside of.
    ["past_due", {}, false],
    // A still-valid expiresAt must NOT rescue a past_due row whose grace has
    // run out — grace is the only thing that keeps dunning users entitled.
    ["past_due", { graceUntil: PAST, expiresAt: FUTURE }, false],

    // --- cancelled: paid through the period end ---------------------------
    ["cancelled", { expiresAt: FUTURE }, true],
    ["cancelled", { expiresAt: PAST }, false],
    // Unlike `active`, null grants nothing — there is no period to be in.
    ["cancelled", {}, false],
    // Cancelled MID-TRIAL keeps the trial. A trialing subscriber has no
    // `expiresAt` at all — only a settled debit writes one — so matching on
    // `expiresAt` alone ended their access the instant they cancelled.
    ["cancelled", { trialEndsAt: FUTURE }, true],
    ["cancelled", { trialEndsAt: PAST }, false],
    // Whichever deadline runs out LAST wins, in either order: cancelling must
    // never take away access the user has not used up yet.
    ["cancelled", { trialEndsAt: FUTURE, expiresAt: PAST }, true],
    ["cancelled", { trialEndsAt: PAST, expiresAt: FUTURE }, true],
    ["cancelled", { trialEndsAt: PAST, expiresAt: PAST }, false],

    // --- unknown statuses narrow to free ----------------------------------
    ["banana", { expiresAt: FUTURE }, false],
    ["", { expiresAt: FUTURE }, false],
  ])("%s %j → entitled=%s", (status, dates, expected) => {
    expect(computeIsEntitled(row(status, dates), NOW)).toBe(expected);
  });

  test("the boundary instant is exclusive — entitlement ends AT the deadline", () => {
    // `now < deadline`, not `<=`. At exactly the expiry instant the user is
    // out. Picking the other side would hand out a free extra millisecond,
    // which matters only in that it must be decided once and tested.
    expect(computeIsEntitled(row("active", { expiresAt: NOW }), NOW)).toBe(false);
    expect(computeIsEntitled(row("trialing", { trialEndsAt: NOW }), NOW)).toBe(
      false
    );
    expect(computeIsEntitled(row("past_due", { graceUntil: NOW }), NOW)).toBe(
      false
    );
  });

  /**
   * `computeIsEntitled` and `entitlementDeadline` are two functions that must
   * agree, and the client now depends on that agreement: it caches `isEntitled`
   * and expires it using `entitledUntil`. If the deadline were ever more
   * generous than the rule, a lapsed user would keep a Pro UI; if it were
   * stricter, a paying one would lose it early.
   *
   * So assert the PAIRING rather than each function separately, across every
   * status and both sides of every boundary.
   */
  test.each(SubscriptionStatusEnum.options)(
    "%s: the deadline and the rule agree in both directions",
    (status) => {
      const dates = {
        expiresAt: LATER,
        trialEndsAt: LATER,
        graceUntil: LATER,
      };
      const r = row(status, dates);
      const deadline = entitlementDeadline(r);

      if (computeIsEntitled(r, NOW)) {
        // Entitled ⇒ either no deadline at all, or it is still ahead of us.
        expect(deadline === null || NOW < deadline).toBe(true);
      }
      if (deadline !== null) {
        // Past the deadline ⇒ never entitled. This is the direction the client
        // relies on to revoke by itself.
        const after = new Date(deadline.getTime() + 1);
        expect(computeIsEntitled(r, after)).toBe(false);
      }
    }
  );

  test("a status with no deadline never reports one", () => {
    // free/pending/expired are not "entitled until some time" — they are not
    // entitled at all, and a non-null deadline would read as a live grant.
    for (const status of ["free", "pending", "expired"]) {
      expect(entitlementDeadline(row(status, { expiresAt: LATER }))).toBeNull();
    }
  });

  test("every status in the wire enum is handled", () => {
    // Guards the switch against a new enum member being added to the schema
    // without a corresponding entitlement decision. `computeIsEntitled` is
    // exhaustive over the union, so this is a runtime backstop for the
    // schema/type pair drifting apart.
    for (const status of SubscriptionStatusEnum.options) {
      expect(() => computeIsEntitled(row(status), NOW)).not.toThrow();
      expect(() => entitlementDeadline(row(status))).not.toThrow();
    }
  });
});

describe("SubscriptionService.createFreeSubscriptionForUser", () => {
  test("delegates to the repository upsert (no tx)", async () => {
    const { mock, repo } = makeRepoMock();
    mock.upsertFreeForUser.mockResolvedValueOnce(makeFreeRow("user-7"));
    const service = new SubscriptionService(repo);
    await service.createFreeSubscriptionForUser("user-7");
    expect(mock.upsertFreeForUser).toHaveBeenCalledTimes(1);
    expect(mock.upsertFreeForUser).toHaveBeenCalledWith("user-7", undefined);
  });

  test("forwards a Prisma transaction client when provided", async () => {
    const { mock, repo } = makeRepoMock();
    mock.upsertFreeForUser.mockResolvedValueOnce(makeFreeRow("user-8"));
    const service = new SubscriptionService(repo);
    // The service doesn't touch the tx object — just forwards it — so any
    // narrow-shaped object satisfies `SubscriptionTxHandle`.
    const fakeTx = { subscription: {} };
    await service.createFreeSubscriptionForUser("user-8", fakeTx);
    expect(mock.upsertFreeForUser).toHaveBeenCalledWith("user-8", fakeTx);
  });
});

describe("Zod schema (SubscriptionStatusData)", () => {
  test("accepts ISO 8601 expiresAt", () => {
    const result = SubscriptionStatusData.safeParse({
      status: "active",
      isEntitled: true,
      entitledUntil: null,
      activePlanId: "plan_month",
      activeProductId: "product_month",
      provider: "razorpay",
      trialEndsAt: null,
      expiresAt: "2026-12-31T23:59:59.000Z",
      startedAt: null,
    });
    expect(result.success).toBe(true);
  });

  test("rejects a malformed expiresAt string", () => {
    const result = SubscriptionStatusData.safeParse({
      status: "active",
      isEntitled: true,
      entitledUntil: null,
      activePlanId: "plan_month",
      activeProductId: "product_month",
      provider: "razorpay",
      trialEndsAt: null,
      expiresAt: "not-a-date",
      startedAt: null,
    });
    expect(result.success).toBe(false);
  });

  test("accepts null expiresAt for free users", () => {
    const result = SubscriptionStatusData.safeParse({
      status: "free",
      isEntitled: false,
      entitledUntil: null,
      activePlanId: null,
      activeProductId: null,
      provider: null,
      expiresAt: null,
      trialEndsAt: null,
      startedAt: null,
    });
    expect(result.success).toBe(true);
  });

  test("SubscriptionStatusEnum accepts every canonical value", () => {
    for (const status of ["free", "active", "pending", "cancelled", "expired"]) {
      expect(SubscriptionStatusEnum.safeParse(status).success).toBe(true);
    }
  });

  test("SubscriptionStatusEnum rejects unknown values", () => {
    expect(SubscriptionStatusEnum.safeParse("banana").success).toBe(false);
  });
});

describe("expireLapsed", () => {
  const send = vi.spyOn(analyticsEventsClient, "send");

  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue(undefined);
  });

  function makeService(rows: SubscriptionRow[]): SubscriptionService {
    const { mock, repo } = makeRepoMock();
    (mock as unknown as { expireLapsed: Mock }).expireLapsed = vi
      .fn()
      .mockResolvedValue(rows);
    return new SubscriptionService(repo);
  }

  test("returns the swept COUNT — the billing-cycle report is unchanged", async () => {
    const service = makeService([makeFreeRow("u1"), makeFreeRow("u2")]);
    expect(await service.expireLapsed(NOW)).toBe(2);
  });

  test("emits one expiry event per swept row", async () => {
    const service = makeService([makeFreeRow("u1"), makeFreeRow("u2")]);
    await service.expireLapsed(NOW);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].map((e) => e.user_id)).toEqual(["u1", "u2"]);
  });

  test("emits nothing when the sweep moved nothing", async () => {
    const service = makeService([]);
    expect(await service.expireLapsed(NOW)).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  test("a dead collector cannot fail the sweep", async () => {
    send.mockRejectedValue(new Error("collector down"));
    const service = makeService([makeFreeRow("u1")]);

    expect(await service.expireLapsed(NOW)).toBe(1);
  });
});
