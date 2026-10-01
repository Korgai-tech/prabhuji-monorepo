import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import { AppError } from "@api/shared/errors";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import type { IPaymentApi } from "@api/core/payment/api";
import type {
  CancellationRequestRow,
  SubscriptionRepository,
  SubscriptionRow,
} from "../../repositories/index.js";
import { PendingRequestExistsError } from "../../repositories/index.js";
import { SubscriptionCancelRequestService } from "../subscription-cancel-request.service.js";

/**
 * Unit coverage for the cancellation service (TAM-125, revised).
 *
 * What this file used to assert — via a grep-lint over the service source —
 * was that the service NEVER reaches the payment provider. That invariant is
 * gone on purpose: tapping Cancel in the app now revokes at the gateway
 * inline, because the queue it replaced left users subscribed at the provider
 * until an ops human ran the revoke by hand. See docs/PAYMENT-FLOW.md
 * § "Phase 3 — User-initiated cancellation".
 *
 * The grep-lint was DELETED rather than left to pass. It matched three
 * identifiers (`MandateProvider` / `revokeMandate` / `MandateService`), and
 * the service reaches payment through `performServiceCall("payment", …)` —
 * so it would have gone on passing while guarding nothing at all. A green
 * test asserting a property the code no longer has is worse than no test.
 *
 * What replaces it is behavioural, below: the revoke is actually dispatched,
 * its outcome is stamped on the row, and a gateway failure surfaces as a 502
 * with the row left RETRYABLE rather than stuck `pending`.
 */

interface RepoMock {
  findLatestForUser: Mock;
  createIfNoPending: Mock;
  markProcessed: Mock;
}

interface SubscriptionRepoMock {
  findByUserId: Mock;
}

function makeMocks(
  paymentOverrides: { cancelMandateForUser?: Mock } = {}
): {
  repo: RepoMock;
  subscriptionRepo: SubscriptionRepoMock;
  cancelMandateForUser: Mock;
  service: SubscriptionCancelRequestService;
} {
  const repo: RepoMock = {
    findLatestForUser: vi.fn(),
    createIfNoPending: vi.fn(),
    markProcessed: vi.fn(),
  };
  // Apply the requested transition ON TOP OF the row that was inserted, the way
  // a Prisma partial update does. Returning a bare fixture instead would silently
  // drop the columns `markProcessed` does not write (`reason` above all) and the
  // fake would disagree with the repository it stands in for.
  repo.markProcessed.mockImplementation(
    (input: { id: string; status: string; notes: string | null }) => {
      const created = repo.createIfNoPending.mock.results[0]?.value as
        | Promise<CancellationRequestRow>
        | undefined;
      const base = created ?? Promise.resolve(makeRequestRow());
      return base.then((row) => ({
        ...row,
        id: input.id,
        status: input.status,
        notes: input.notes,
        processedAt: new Date("2026-08-01T00:00:00.000Z"),
      }));
    }
  );
  const subscriptionRepo: SubscriptionRepoMock = {
    findByUserId: vi.fn(),
  };

  const cancelMandateForUser =
    paymentOverrides.cancelMandateForUser ?? vi.fn(() => Promise.resolve(true));
  clearGlobalServices();
  registerGlobalService("payment", {
    cancelMandateForUser,
  } as unknown as IPaymentApi);

  const service = new SubscriptionCancelRequestService(
    repo,
    subscriptionRepo as unknown as SubscriptionRepository
  );
  return { repo, subscriptionRepo, cancelMandateForUser, service };
}

function makeSubscriptionRow(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  const now = new Date("2026-07-31T00:00:00.000Z");
  return {
    id: "sub-1",
    userId: "user-1",
    status: "active",
    activePlanId: "month",
    activeProductId: "prabhuji_vip_month",
    provider: "decentro",
    providerSubscriptionId: "mandate_xyz",
    expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    startedAt: new Date("2026-06-01T00:00:00.000Z"),
    trialEndsAt: null,
    trialConsumedAt: now,
    graceUntil: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeRequestRow(
  overrides: Partial<CancellationRequestRow> = {}
): CancellationRequestRow {
  const now = new Date("2026-07-31T12:00:00.000Z");
  return {
    id: "req-1",
    userId: "user-1",
    subscriptionId: "sub-1",
    status: "pending",
    reason: null,
    notes: null,
    requestedAt: now,
    processedAt: null,
    processedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("SubscriptionCancelRequestService.createRequest", () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
  });

  test("happy path — inserts the row, revokes at the gateway, returns completed", async () => {
    mocks.subscriptionRepo.findByUserId.mockResolvedValueOnce(
      makeSubscriptionRow()
    );
    mocks.repo.createIfNoPending.mockResolvedValueOnce(makeRequestRow());

    const view = await mocks.service.createRequest({
      userId: "user-1",
      reason: null,
    });

    // THE regression this whole change exists to prevent: the row alone is not
    // a cancellation. If this assertion ever goes back to `pending`, users are
    // being told they cancelled while the mandate is still debitable.
    expect(mocks.cancelMandateForUser).toHaveBeenCalledWith(
      "user-1",
      expect.any(Date)
    );
    expect(view.status).toBe("completed");
    expect(mocks.repo.createIfNoPending).toHaveBeenCalledWith({
      userId: "user-1",
      subscriptionId: "sub-1",
      reason: null,
    });
    expect(mocks.repo.markProcessed).toHaveBeenCalledWith({
      id: "req-1",
      status: "completed",
      notes: null,
    });
  });

  test("the row is inserted BEFORE the gateway is called", async () => {
    // Ordering, not decoration: a crash mid-revoke must leave evidence that a
    // user asked to cancel. Revoking first can mutate the gateway and record
    // nothing at all.
    const order: string[] = [];
    mocks = makeMocks({
      cancelMandateForUser: vi.fn(() => {
        order.push("revoke");
        return Promise.resolve(true);
      }),
    });
    mocks.subscriptionRepo.findByUserId.mockResolvedValueOnce(
      makeSubscriptionRow()
    );
    mocks.repo.createIfNoPending.mockImplementationOnce(() => {
      order.push("insert");
      return Promise.resolve(makeRequestRow());
    });

    await mocks.service.createRequest({ userId: "user-1", reason: null });

    expect(order).toEqual(["insert", "revoke"]);
  });

  test("a user with nothing to revoke still completes, and the no-op is noted", async () => {
    // Comped / pre-mandate subscribers: the gateway has no live mandate, which
    // is not a failure — they asked to stop being charged and they will not be.
    mocks = makeMocks({
      cancelMandateForUser: vi.fn(() => Promise.resolve(false)),
    });
    mocks.subscriptionRepo.findByUserId.mockResolvedValueOnce(
      makeSubscriptionRow()
    );
    mocks.repo.createIfNoPending.mockResolvedValueOnce(makeRequestRow());

    const view = await mocks.service.createRequest({
      userId: "user-1",
      reason: null,
    });

    expect(view.status).toBe("completed");
    expect(mocks.repo.markProcessed).toHaveBeenCalledWith({
      id: "req-1",
      status: "completed",
      notes: "no revocable mandate at the gateway — no-op",
    });
  });

  test("a gateway failure returns 502 and leaves the request RETRYABLE", async () => {
    // The failure path that matters. `rejected` rather than `pending` because
    // the partial unique index only blocks a second `pending` row — parking a
    // failure there would 409 the user's own retry forever, locking them out
    // of cancelling from the app at all.
    mocks = makeMocks({
      cancelMandateForUser: vi.fn(() =>
        Promise.reject(new AppError("gateway said no", 409, "MANDATE_NOT_CANCELLABLE"))
      ),
    });
    mocks.subscriptionRepo.findByUserId.mockResolvedValueOnce(
      makeSubscriptionRow()
    );
    mocks.repo.createIfNoPending.mockResolvedValueOnce(makeRequestRow());

    await expect(
      mocks.service.createRequest({ userId: "user-1", reason: null })
    ).rejects.toMatchObject({
      constructor: AppError,
      statusCode: 502,
      errorCode: "PROVIDER_CANCEL_FAILED",
    });

    const call = mocks.repo.markProcessed.mock.calls[0][0] as {
      status: string;
      notes: string;
    };
    expect(call.status).toBe("rejected");
    expect(call.notes).toContain("gateway said no");
  });

  test("a failed revoke is never reported as a successful cancellation", async () => {
    // Guards the one shortcut nobody should ever take here: swallowing the
    // gateway error and returning `completed` because the audit row exists.
    mocks = makeMocks({
      cancelMandateForUser: vi.fn(() => Promise.reject(new Error("socket hang up"))),
    });
    mocks.subscriptionRepo.findByUserId.mockResolvedValueOnce(
      makeSubscriptionRow()
    );
    mocks.repo.createIfNoPending.mockResolvedValueOnce(makeRequestRow());

    await expect(
      mocks.service.createRequest({ userId: "user-1", reason: null })
    ).rejects.toThrow();
    expect(mocks.repo.markProcessed).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" })
    );
  });

  test("threads the caller's reason through to the repository", async () => {
    mocks.subscriptionRepo.findByUserId.mockResolvedValueOnce(
      makeSubscriptionRow()
    );
    mocks.repo.createIfNoPending.mockResolvedValueOnce(
      makeRequestRow({ reason: "too expensive" })
    );

    const view = await mocks.service.createRequest({
      userId: "user-1",
      reason: "too expensive",
    });

    expect(view.reason).toBe("too expensive");
    expect(mocks.repo.createIfNoPending).toHaveBeenCalledWith({
      userId: "user-1",
      subscriptionId: "sub-1",
      reason: "too expensive",
    });
  });

  test("trialing users MAY cancel (PO ruling #3)", async () => {
    // Explicit — the acceptance criteria in §3 hinge on this. `trialing` is a
    // valid state to cancel from; the service must not gate on `status === 'active'`.
    mocks.subscriptionRepo.findByUserId.mockResolvedValueOnce(
      makeSubscriptionRow({
        status: "trialing",
        expiresAt: null,
        trialEndsAt: new Date("2026-08-03T00:00:00.000Z"),
      })
    );
    mocks.repo.createIfNoPending.mockResolvedValueOnce(makeRequestRow());

    await expect(
      mocks.service.createRequest({ userId: "user-1", reason: null })
    ).resolves.toMatchObject({ status: "completed" });
    expect(mocks.cancelMandateForUser).toHaveBeenCalled();
  });

  test("throws NO_ACTIVE_SUBSCRIPTION when the user has no subscription row", async () => {
    mocks.subscriptionRepo.findByUserId.mockResolvedValueOnce(null);

    await expect(
      mocks.service.createRequest({ userId: "user-1", reason: null })
    ).rejects.toMatchObject({
      constructor: AppError,
      statusCode: 409,
      errorCode: "NO_ACTIVE_SUBSCRIPTION",
    });
    expect(mocks.repo.createIfNoPending).not.toHaveBeenCalled();
  });

  test.each(["free", "expired"])(
    "throws NO_ACTIVE_SUBSCRIPTION when the user is %s",
    async (status) => {
      mocks.subscriptionRepo.findByUserId.mockResolvedValueOnce(
        makeSubscriptionRow({ status })
      );

      await expect(
        mocks.service.createRequest({ userId: "user-1", reason: null })
      ).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 409,
        errorCode: "NO_ACTIVE_SUBSCRIPTION",
      });
      expect(mocks.repo.createIfNoPending).not.toHaveBeenCalled();
      // The eligibility gate runs BEFORE any gateway traffic — an ineligible
      // caller must not be able to provoke a provider call.
      expect(mocks.cancelMandateForUser).not.toHaveBeenCalled();
    }
  );

  test("throws PENDING_REQUEST_EXISTS when the repo reports a duplicate", async () => {
    mocks.subscriptionRepo.findByUserId.mockResolvedValueOnce(
      makeSubscriptionRow()
    );
    mocks.repo.createIfNoPending.mockRejectedValueOnce(
      new PendingRequestExistsError("existing-req-id")
    );

    await expect(
      mocks.service.createRequest({ userId: "user-1", reason: null })
    ).rejects.toMatchObject({
      constructor: AppError,
      statusCode: 409,
      errorCode: "PENDING_REQUEST_EXISTS",
    });
    // A duplicate loses the race for the row and must not also fire a second
    // revoke at the gateway.
    expect(mocks.cancelMandateForUser).not.toHaveBeenCalled();
  });

  test("re-throws unknown repository errors verbatim", async () => {
    mocks.subscriptionRepo.findByUserId.mockResolvedValueOnce(
      makeSubscriptionRow()
    );
    const boom = new Error("db is on fire");
    mocks.repo.createIfNoPending.mockRejectedValueOnce(boom);

    await expect(
      mocks.service.createRequest({ userId: "user-1", reason: null })
    ).rejects.toBe(boom);
  });
});

describe("SubscriptionCancelRequestService.getLatestForUser", () => {
  test("returns null when the user has never raised a request", async () => {
    const { repo, service } = makeMocks();
    repo.findLatestForUser.mockResolvedValueOnce(null);
    await expect(service.getLatestForUser("user-1")).resolves.toBeNull();
  });

  test("maps a row to the wire view", async () => {
    const { repo, service } = makeMocks();
    repo.findLatestForUser.mockResolvedValueOnce(
      makeRequestRow({
        status: "processing",
        processedAt: new Date("2026-08-01T00:00:00.000Z"),
      })
    );

    await expect(service.getLatestForUser("user-1")).resolves.toEqual({
      id: "req-1",
      status: "processing",
      reason: null,
      requestedAt: "2026-07-31T12:00:00.000Z",
      processedAt: "2026-08-01T00:00:00.000Z",
    });
  });

  test("narrows an unknown DB status to 'pending' defensively", async () => {
    // Matches how `SubscriptionService.getStatus` narrows unknown values —
    // protects the wire response from a manual DB edit inserting an
    // unexpected string.
    const { repo, service } = makeMocks();
    repo.findLatestForUser.mockResolvedValueOnce(
      makeRequestRow({ status: "banana" })
    );

    const view = await service.getLatestForUser("user-1");
    expect(view?.status).toBe("pending");
  });
});

/*
 * The TAM-125 "no-mandate-provider invariant" grep-lint stood here. It is gone
 * because the property it asserted is gone: the user-facing cancel path now
 * revokes at the gateway on purpose.
 *
 * Deleted rather than relaxed, and that distinction is the point. It matched
 * three identifiers in this module's service source, none of which the new
 * implementation names — it reaches payment through
 * `performServiceCall("payment", …)`. So it would have stayed green forever
 * while the behaviour it was written to prevent shipped underneath it. The
 * behavioural tests above are the replacement.
 */
