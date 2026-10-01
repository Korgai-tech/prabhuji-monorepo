import {
  analyticsEventsClient,
  OTP_ANALYTICS_EVENT as E,
  UTM_ANALYTICS_EVENT as U,
  utmProperties,
  type AnalyticsEventInput,
  type UtmAttribution,
} from "@api/shared/analytics";
import { createModuleLogger } from "@api/shared/logs";

const log = createModuleLogger("otp:analytics");

/** `result` — the server sees a verify resolve exactly one way. */
type OtpResult = "success" | "failure";

/**
 * Publishes the OTP login funnel to the analytics warehouse.
 *
 * Same two load-bearing properties as `PaymentAnalyticsService`, for the same
 * reasons:
 *
 * 1. **It never reads the database.** Everything it needs is already on the
 *    caller's stack, so tracking adds no query to the login path and the arch
 *    boundary keeping `repositories/` out of `services/` needs no exception.
 *    `userId` is resolved by `OtpService`, which legitimately owns the repo.
 * 2. **It never throws.** A dead collector must leave the login byte-identical.
 *    Every send is swallowed here, so callers can `void` without risking an
 *    unhandled rejection.
 *
 * Callers are on a REQUEST path, so they `void` these rather than awaiting: a
 * user staring at the OTP screen must not wait out `ANALYTICS_EVENTS_TIMEOUT_MS`
 * because the collector is down.
 */
export class OtpAnalyticsService {
  /**
   * One verify attempt resolved.
   *
   * `attemptNumber` comes from the provider's session counter, which is
   * incremented BEFORE the code is compared (both `LocalOtpProvider` and
   * `StubOtpProvider` do this so the exhaustion signal is precise). A first-try
   * success therefore already reports 1, matching the client's `attempt_number`
   * without any adjustment here.
   *
   * The floor of 1 covers the branches that return before that increment —
   * `session_expired` and a replay against an already-burned session both carry
   * whatever the counter happened to hold, which can be 0. Zero would be a lie:
   * the caller did submit a code, and this event exists to count that.
   */
  async trackVerificationResult(input: {
    userId: string;
    otpSessionId: string;
    /** Full E.164-ish number, `${countryCode}${number}` — both call sites have it. */
    phoneNumber: string;
    result: OtpResult;
    errorCode: string | null;
    attemptNumber: number;
    responseTimeMs: number;
  }): Promise<void> {
    const attemptNumber = Math.max(input.attemptNumber, 1);
    await this.safeSend({
      event_type: E.VERIFICATION_RESULT,
      user_id: input.userId,
      // Keyed on SESSION + ATTEMPT, not the session alone: five wrong guesses
      // are five distinct events and collapsing them would erase the retry
      // curve this event exists to show. Deterministic, so a retried send
      // dedupes rather than double-counting.
      insert_id: [E.VERIFICATION_RESULT, input.otpSessionId, attemptNumber].join(":"),
      event_properties: {
        result: input.result,
        phone_number: input.phoneNumber,
        // Always present, null on success — a key that is absent on some rows
        // makes `WHERE error_code = ...` silently drop them.
        error_code: input.errorCode,
        attempt_number: attemptNumber,
        response_time_ms: input.responseTimeMs,
      },
    });
  }

  /**
   * A phone account came into existence — this verify was the one that stamped
   * `phoneVerifiedAt`. Fires beside the verification result, never instead.
   *
   * `time` is deliberately NOT set, so the event times at now. `createdAt` is the
   * OTP SEND moment (TAM-154 writes the row when the code goes out), so
   * backdating to it would file every signup minutes early — the account became
   * real here. The column still ships as `account_created_at` for anyone who
   * wants the lead's age.
   *
   * Resolves `true` when the collector took the event (or the send was a
   * configured no-op — disabled or unconfigured analytics does not throw), and
   * `false` when the send FAILED. `OtpService` chains the registration
   * conversion on that answer: Meta hears about a signup only after the
   * warehouse has the row, so the two can never disagree about whether an
   * account exists.
   */
  async trackAccountCreated(input: {
    userId: string;
    createdAt: Date;
    /**
     * Where this user sits in the shared abtesting service's bucket space, from
     * `fetchSubjectBucket`. `null` when the service could not be asked — the key
     * still ships, because a property that is absent on some rows makes every
     * `WHERE bucket_id = …` drop them silently, which reads as "that cohort
     * never signed up" rather than "we could not ask". Same rule as
     * `error_code` on the verification event.
     *
     * Required rather than optional on purpose: the bucket is a pure function
     * of the user id, so every caller CAN answer, and an omitted argument would
     * be a silent null rather than a decision.
     */
    bucketId: number | null;
    /**
     * Firebase `app_instance_id`, captured on `/auth/otp/send`. TOP-LEVEL on
     * the wire, not an event property: it is an IDENTITY, the warehouse has a
     * promoted `pseudo_id` column for it, and that column is what joins this
     * signup to the install's own client-side rows. Omitted entirely when the
     * client did not send one — an empty string would be a fake identity.
     */
    pseudoId?: string;
  }): Promise<boolean> {
    return this.safeSend({
      event_type: E.ACCOUNT_CREATED,
      user_id: input.userId,
      // Keyed on the USER alone: an account is created exactly once, and the
      // verify path can be replayed, so a second row would double-count signups.
      insert_id: [E.ACCOUNT_CREATED, input.userId].join(":"),
      ...(input.pseudoId ? { pseudo_id: input.pseudoId } : {}),
      event_properties: {
        account_created_at: input.createdAt.toISOString(),
        bucket_id: input.bucketId,
      },
    });
  }

  /**
   * The user's campaign, reported at the CAPTURE moment — a verify that just
   * succeeded.
   *
   * `latest` always, `first` only when `isFirstCapture`. Both go out in ONE
   * `safeSend` call, not two: they are one send to the collector, so a hiccup
   * either lands both or neither. Two calls could store `latest` and drop
   * `first`, and `first` is once-per-user — the marker its caller stamps means
   * nothing would ever re-fire it.
   *
   * `isFirstCapture` is decided by the caller against `User.firstUtmReportedAt`,
   * because this service never reads the database (see the class dartdoc). It
   * cannot be derived from the triple: `/latest` returns one row and cannot say
   * whether it is the user's oldest touch.
   */
  async trackUtmCaptured(input: {
    userId: string;
    utm: UtmAttribution;
    isFirstCapture: boolean;
  }): Promise<void> {
    const events: AnalyticsEventInput[] = [
      {
        event_type: U.LATEST,
        user_id: input.userId,
        // Keyed on the USER, not the login. `latest` is re-reported at every
        // capture, so a per-verify key would mint a row per login and the
        // question this answers — "which campaign does this user stand under
        // now" — needs one row per user, not a history.
        //
        // NOTE this is a query-time key, NOT an ingest guarantee. `events` is a
        // plain MergeTree with no dedupe, so the duplicates a returning user
        // produces on every login ARE stored; the key only makes them
        // collapsible with `LIMIT 1 BY insert_id`, which every read of this
        // table must carry.
        insert_id: [U.LATEST, input.userId].join(":"),
        event_properties: utmProperties("latest", input.utm),
      },
    ];
    if (input.isFirstCapture) {
      events.push({
        event_type: U.FIRST,
        user_id: input.userId,
        // The USER for the stronger reason: this event claims "the first
        // campaign we ever saw for this person", so a second row is not a
        // duplicate reading, it is a contradiction. The marker the caller
        // stamps is what keeps the send side honest; this makes the rows a
        // replayed verify can still produce collapse to one.
        insert_id: [U.FIRST, input.userId].join(":"),
        event_properties: utmProperties("first", input.utm),
      });
    }
    await this.safeSend(...events);
  }

  /**
   * Analytics is strictly best-effort. A failure is logged with the event type
   * and never propagated into the login flow that triggered it.
   *
   * Answers whether the send went through, for the one caller that sequences
   * on it (`trackAccountCreated`). `true` covers a configured no-op as well as
   * an accepted batch: only a send that actually FAILED is `false`.
   */
  private async safeSend(...events: AnalyticsEventInput[]): Promise<boolean> {
    if (events.length === 0) return true;
    try {
      await analyticsEventsClient.send(events);
      return true;
    } catch (err) {
      log.warn(
        {
          err,
          event_type: events.map((e) => e.event_type),
          user_id: events[0].user_id,
        },
        "otp analytics event send failed"
      );
      return false;
    }
  }
}

export const otpAnalytics = new OtpAnalyticsService();
