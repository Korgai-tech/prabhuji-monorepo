import { AppError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import { performServiceCall } from "@api/shared/workspace";
import type {
  CancellationRequestRow,
  SubscriptionCancelRequestRepository,
  SubscriptionRepository,
} from "@api/core/subscription/repositories";
import { PendingRequestExistsError } from "@api/core/subscription/repositories";

const log = createModuleLogger("subscription:cancel-request");

/**
 * Wire-facing view of a cancellation request (TAM-125).
 *
 * DELIBERATELY narrower than the row: `subscriptionId`, `notes`,
 * `processedBy`, `createdAt` and `updatedAt` are internal audit fields and
 * never reach the app. The Zod response schema
 * (`routes/subscription-cancel-request.schemas.ts`) is the enforcement layer;
 * this interface is its runtime companion.
 */
export interface CancellationRequestView {
  id: string;
  status: CancellationRequestStatusValue;
  reason: string | null;
  requestedAt: string;
  processedAt: string | null;
}

/**
 * The four wire statuses. The DB column is bare TEXT (like
 * `Subscription.status`) so adding a status needs no migration — we narrow at
 * read time here.
 */
const KNOWN_STATUSES = [
  "pending",
  "processing",
  "completed",
  "rejected",
] as const;

export type CancellationRequestStatusValue = (typeof KNOWN_STATUSES)[number];

/**
 * States from which a user may NOT raise a cancellation request. `free` /
 * `expired` mean "nothing to cancel"; the endpoint 409s with
 * `NO_ACTIVE_SUBSCRIPTION` rather than silently succeeding.
 *
 * `trialing`, `pending`, `active`, `past_due`, `cancelled` are all allowed
 * per PO ruling #3 and § "What this spec deliberately does NOT change" —
 * a trialing user MAY raise a request; a cancelled user with a paid-through
 * period MAY raise a request (it's a no-op at the provider by then, but the
 * queue keeps the audit trail regardless).
 */
const INELIGIBLE_STATES: readonly string[] = ["free", "expired"];

/**
 * Service for the user-initiated cancellation flow (TAM-125, revised).
 *
 * Creating a request now REVOKES AT THE GATEWAY, inline. It was originally a
 * pure audit row — ops fulfilled at the provider off-band — because two
 * questions were open: Cashfree's cancel endpoint had never been probed in
 * production, and entitlement policy on cancel-during-trial was unresolved.
 * Both have since closed. Prod registers on Razorpay, whose cancel is the
 * verified `PUT /customers/:cid/tokens/:tid/cancel` (NOT the `DELETE`, which
 * leaves the NPCI mandate live), and `applyMandateEnded({reason: "cancelled"})`
 * settled the trial question: a canceller keeps what they paid for until
 * `expiresAt`.
 *
 * What the queue was actually costing: a user tapped Cancel, got "we'll update
 * you", and stayed subscribed at the provider until a human noticed. There is
 * no admin surface over this table, so "a human noticed" meant direct SQL plus
 * the merchant dashboard.
 *
 * THE ORDER MATTERS, and it is: insert the row, THEN revoke.
 *
 *   - Insert first, so a crash mid-revoke leaves evidence a user asked. The
 *     reverse order can revoke at the gateway and record nothing.
 *   - Revoke OUTSIDE the insert's transaction — it is a third-party HTTP call
 *     plus an entitlement write through another module, and holding a row lock
 *     across that is how you exhaust the connection pool.
 *   - Stamp the outcome onto the row either way. `completed` on success,
 *     `rejected` (with the reason in `notes`) on failure — and `rejected`
 *     specifically because the partial unique index only blocks a second
 *     `pending` row, so leaving a failure `pending` would lock the user out of
 *     ever retrying their own cancellation.
 *
 * A failed revoke is reported to the user as a failure (502). It must never be
 * dressed up as success: "the app said cancelled, the gateway charged them
 * again" is the incident this whole path exists to avoid, and it is worse than
 * an honest retry prompt.
 *
 * The provider call goes through `performServiceCall("payment", …)`. This
 * module never touches a gateway, a mandate row or `mandates.state` directly —
 * `core/payment` owns all three, resolves the adapter from the MANDATE's own
 * `provider` column (never the currently-active one, so mandates registered on
 * Cashfree or Decentro are still revoked through the gateway that holds them),
 * and writes entitlement back through this module's own facade.
 */
export class SubscriptionCancelRequestService {
  constructor(
    private readonly repo: SubscriptionCancelRequestRepository,
    private readonly subscriptionRepo: SubscriptionRepository
  ) {}

  /**
   * Cancel `userId`'s subscription: record the request, then revoke at the
   * gateway.
   *
   * Returns the CLOSED-OUT row — `completed` when the mandate is revoked (or
   * there was nothing to revoke), never `pending`. The app renders
   * `pending` / `processing` / `completed` identically, so this is invisible to
   * it; the distinction is for ops reading the table.
   *
   * Throws `AppError`:
   *   - 409 `NO_ACTIVE_SUBSCRIPTION` — the user is on `free` or `expired`.
   *   - 409 `PENDING_REQUEST_EXISTS` — a `pending` row already exists (either
   *     from the SELECT-FOR-UPDATE gate or from the partial-unique-index
   *     race — the repository collapses both into one error type). Now rare
   *     rather than routine: rows no longer sit `pending` waiting for ops, so
   *     this means a genuinely concurrent second tap.
   *   - 502 `PROVIDER_CANCEL_FAILED` — the gateway refused or was unreachable.
   *     The row is stamped `rejected` first, so the user can retry.
   */
  async createRequest(input: {
    userId: string;
    reason: string | null;
  }): Promise<CancellationRequestView> {
    const subscription = await this.subscriptionRepo.findByUserId(input.userId);
    if (!subscription || INELIGIBLE_STATES.includes(subscription.status)) {
      throw new AppError(
        "No active subscription to cancel",
        409,
        "NO_ACTIVE_SUBSCRIPTION"
      );
    }

    // Scoped to the insert alone: it is the only call that raises
    // `PendingRequestExistsError`, and the revoke below must NOT be inside a
    // catch that could mistake a gateway failure for a duplicate request.
    let row: CancellationRequestRow;
    try {
      row = await this.repo.createIfNoPending({
        userId: input.userId,
        subscriptionId: subscription.id,
        reason: input.reason,
      });
    } catch (err) {
      if (err instanceof PendingRequestExistsError) {
        // Log at info — the 409 is expected in the double-tap /
        // second-device paths and is not an error condition. It now means a
        // genuinely concurrent second tap: a request no longer sits `pending`
        // waiting for ops, it is closed out before the response is written.
        log.info(
          {
            event: "subscription_cancel_request_duplicate",
            user_id: input.userId,
            existing_request_id: err.existingRequestId,
          },
          "cancellation request rejected — a pending row already exists"
        );
        throw new AppError(
          `A pending cancellation request already exists (${err.existingRequestId})`,
          409,
          "PENDING_REQUEST_EXISTS"
        );
      }
      throw err;
    }

    log.info(
      {
        event: "subscription_cancel_request_created",
        user_id: input.userId,
        request_id: row.id,
        subscription_id: subscription.id,
      },
      "user raised a cancellation request"
    );
    return toView(await this.revokeAndClose(input.userId, row.id));
  }

  /**
   * Revoke at the gateway and stamp the outcome onto `requestId`.
   *
   * Runs after `createIfNoPending`'s transaction has committed — see the class
   * docblock on why the network call must not be inside it.
   */
  private async revokeAndClose(
    userId: string,
    requestId: string
  ): Promise<CancellationRequestRow> {
    let revoked: boolean;
    try {
      revoked = await performServiceCall(
        "payment",
        (api) => api.cancelMandateForUser(userId, new Date()),
        "subscription:cancel-request",
        "failed to cancel the mandate at the payment provider"
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // `rejected`, not `pending`. The partial unique index only blocks a
      // second `pending` row, so parking a failure there would make the user's
      // own retry 409 forever — they could never cancel again from the app.
      // `rejected` also renders as a retryable state, and keeps the failed
      // attempt in the table with its reason instead of erasing it.
      await this.repo.markProcessed({
        id: requestId,
        status: "rejected",
        notes: `provider revoke failed: ${detail}`,
      });
      log.error(
        {
          event: "subscription_cancel_request_provider_failed",
          user_id: userId,
          request_id: requestId,
          detail,
        },
        "gateway refused the cancellation — request marked rejected"
      );
      // Deliberately NOT re-raising the underlying error. Whatever the gateway
      // said, the user-facing fact is one thing: we did not cancel them, and
      // they should try again. Leaking a 409 `MANDATE_NOT_CANCELLABLE` from
      // Razorpay to a phone helps nobody and reads as "you can't cancel".
      throw new AppError(
        "We couldn't cancel your subscription with the payment provider. Please try again.",
        502,
        "PROVIDER_CANCEL_FAILED"
      );
    }

    const closed = await this.repo.markProcessed({
      id: requestId,
      status: "completed",
      // A no-op revoke is still a completed cancellation from the user's side,
      // but ops should be able to tell the two apart without a gateway lookup.
      notes: revoked ? null : "no revocable mandate at the gateway — no-op",
    });
    log.info(
      {
        event: "subscription_cancel_request_completed",
        user_id: userId,
        request_id: requestId,
        revoked_at_gateway: revoked,
      },
      "cancellation completed"
    );
    return closed;
  }

  /**
   * The user's most recent cancellation request, or `null` if none. Matches
   * `GET /payment/mandate`'s "no row means the plain paywall, not an error"
   * convention — `null` is returned in the envelope's `data`, never 404.
   */
  async getLatestForUser(
    userId: string
  ): Promise<CancellationRequestView | null> {
    const row = await this.repo.findLatestForUser(userId);
    return row ? toView(row) : null;
  }
}

/** Repo row → wire-facing view. Narrows the DB status defensively. */
function toView(row: CancellationRequestRow): CancellationRequestView {
  return {
    id: row.id,
    status: narrowStatus(row.status),
    reason: row.reason,
    requestedAt: row.requestedAt.toISOString(),
    processedAt: row.processedAt ? row.processedAt.toISOString() : null,
  };
}

function narrowStatus(value: string): CancellationRequestStatusValue {
  return (KNOWN_STATUSES as readonly string[]).includes(value)
    ? (value as CancellationRequestStatusValue)
    : "pending";
}
