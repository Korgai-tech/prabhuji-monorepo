import { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";

const UNIQUE_VIOLATION = "P2002";

export interface CallbackEventRow {
  id: string;
  provider: string;
  kind: string;
  dedupeKey: string;
  referenceId: string | null;
  providerMandateId: string | null;
  callbackAttempt: number | null;
  status: string;
  receivedAt: Date;
  processedAt: Date | null;
  errorMessage: string | null;
}

export type IngestOutcome =
  | { kind: "accepted"; row: CallbackEventRow }
  | { kind: "duplicate" };

/**
 * Provider callback audit + replay log.
 *
 * Decentro retries callbacks until it gets a 200, and delivers the same event
 * multiple times with an incrementing `callback_attempt`. Without dedupe, one
 * "debit succeeded" event processed three times is three trips through the
 * entitlement write path.
 */
export class CallbackEventRepository {
  /**
   * Record a callback, or report it as already seen.
   *
   * INSERT-FIRST on the unique `dedupeKey`, catching the violation. The
   * obvious alternative — SELECT then INSERT — has a race that two concurrent
   * provider retries hit routinely, since retries arrive in bursts rather than
   * spread out. Letting the unique index arbitrate makes dedupe atomic.
   */
  async ingest(input: {
    provider: string;
    kind: string;
    dedupeKey: string;
    referenceId: string | null;
    providerMandateId: string | null;
    callbackAttempt: number | null;
    payload: unknown;
    sourceIp: string | null;
  }): Promise<IngestOutcome> {
    try {
      const row = await getPrisma().paymentCallbackEvent.create({
        data: {
          // Explicit now that more than one provider exists — the column still
          // defaults to "decentro", but a Cashfree row must be tagged correctly.
          provider: input.provider,
          kind: input.kind,
          dedupeKey: input.dedupeKey,
          referenceId: input.referenceId,
          providerMandateId: input.providerMandateId,
          callbackAttempt: input.callbackAttempt,
          payload: input.payload as Prisma.InputJsonValue,
          sourceIp: input.sourceIp,
          status: "received",
        },
      });
      return { kind: "accepted", row };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === UNIQUE_VIOLATION
      ) {
        return { kind: "duplicate" };
      }
      throw err;
    }
  }

  async markProcessed(id: string, at: Date): Promise<void> {
    await getPrisma().paymentCallbackEvent.update({
      where: { id },
      data: { status: "processed", processedAt: at },
    });
  }

  /**
   * A callback we accepted but could not resolve to a known mandate. Kept
   * rather than dropped: a burst of these is the signature of a
   * mis-whitelisted callback URL or a reference-id mismatch, and that is only
   * diagnosable after the fact if the rows exist.
   */
  async markIgnoredUnknown(id: string, at: Date): Promise<void> {
    await getPrisma().paymentCallbackEvent.update({
      where: { id },
      data: { status: "ignored_unknown", processedAt: at },
    });
  }

  async markFailed(id: string, message: string, at: Date): Promise<void> {
    await getPrisma().paymentCallbackEvent.update({
      where: { id },
      data: { status: "failed", errorMessage: message, processedAt: at },
    });
  }

  async listRecent(limit = 50): Promise<CallbackEventRow[]> {
    return getPrisma().paymentCallbackEvent.findMany({
      orderBy: { receivedAt: "desc" },
      take: limit,
    });
  }
}
