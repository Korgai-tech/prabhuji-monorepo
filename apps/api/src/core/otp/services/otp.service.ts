import jwt from "jsonwebtoken";
import {
  cacheDeviceContext,
  fetchLatestUtm,
  type DeviceContext,
  reportRegistrationConversion,
} from "@api/shared/analytics";
import { fetchSubjectBucket } from "@api/shared/abtest";
import { loadEnv } from "@api/shared/config";
import { AppError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import { performServiceCall } from "@api/shared/workspace";
import type { OtpRepository } from "@api/core/otp/repositories";
import type {
  ResendOtpInput,
  ResendOtpResult,
  SendOtpInput,
  SendOtpResult,
  VerifyOtpInput,
  VerifyOtpResult,
} from "@api/core/otp/types";
import {
  OTP_LENGTH,
  OTP_RESEND_SECONDS,
  RESEND_RATE_LIMIT_MAX,
  RESEND_RATE_LIMIT_WINDOW_SECONDS,
  SEND_RATE_LIMIT_MAX,
  SEND_RATE_LIMIT_WINDOW_SECONDS,
  UTM_CAPTURE_VERIFY_BUDGET_MS,
} from "@api/core/otp/services/otp.config";
import { rateLimitBucket } from "@api/core/otp/services/phone.bucket";
import type { OtpProvider } from "@api/core/otp/services/otp.provider";
import { RedisRateLimiter } from "@api/shared/rate-limit";
import { otpAnalytics } from "@api/core/otp/services/otp-analytics.service";

const log = createModuleLogger("otp:service");

/**
 * `email` is OPTIONAL and simply absent for phone accounts, which have none.
 * Matches `core/auth`'s payload so one `verifyToken` reads both. Consumers must
 * treat it as optional — `analytics.dart` already does, skipping its identify
 * call when the claim is missing.
 */
interface TokenPayload {
  sub: string;
  email?: string;
}

export class OtpService {
  constructor(
    private readonly repo: OtpRepository,
    private readonly provider: OtpProvider,
    private readonly rateLimiter: RedisRateLimiter = new RedisRateLimiter()
  ) {}

  async sendOtp(input: SendOtpInput): Promise<SendOtpResult> {
    const startedAt = Date.now();
    const env = loadEnv();

    // Rate limit against the phone, not the IP. The key is a peppered digest
    // rather than the number itself — a raw number here would be recoverable
    // from `MONITOR`, `SLOWLOG` or any key listing. See `phone.bucket.ts`.
    const verdict = await this.rateLimiter.consume(
      `otp:send:${input.phoneCountryCode}${rateLimitBucket(
        env.AUTH_OTP_PEPPER,
        input.phoneCountryCode,
        input.phoneNumber
      )}`,
      SEND_RATE_LIMIT_MAX,
      SEND_RATE_LIMIT_WINDOW_SECONDS
    );
    if (!verdict.allowed) {
      log.warn(
        {
          country_code: input.phoneCountryCode,
          phone_number_length: input.phoneNumber.length,
          retry_after_seconds: verdict.retryAfterSeconds,
          error_code: "OTP_RATE_LIMITED",
        },
        "send-otp rate limited"
      );
      throw new AppError(
        "Too many OTP requests for this phone",
        429,
        "OTP_RATE_LIMITED"
      );
    }

    // TAM-154 — lead capture. The row goes in the moment the request is ACCEPTED,
    // so someone who never enters the code still leaves a userId and a number to
    // call. Deliberately BEFORE the provider call: a send whose SMS never lands is
    // exactly the drop-off this exists for.
    //
    // After the rate-limit gate because there is no reason to write for a request
    // we are about to reject — but do NOT read that as flood protection. The
    // bucket is keyed per PHONE, and there is no global or per-IP limiter on this
    // unauthenticated route, so someone spraying distinct numbers is not throttled
    // at all and gets one row per number. What actually deters that is the cost:
    // every accepted send also dispatches a billable SMS. If junk rows ever become
    // a real problem, the fix is a limiter that is not keyed on the phone.
    //
    // Not best-effort, and not wrapped. If Postgres is down, the verify 30 seconds
    // later cannot mint a user either — a "successful" send would just spend a real
    // SMS on a code nobody can redeem and move the failure one screen later. Fails
    // closed, like the Redis session store.
    const userId = await this.repo.ensureUserForPhone(
      input.phoneCountryCode,
      input.phoneNumber
    );

    const meta = await this.provider.sendOtp({
      phoneCountryCode: input.phoneCountryCode,
      phoneNumber: input.phoneNumber,
      // TAM-123 — the client's runtime SMS Retriever hash, passed straight
      // through to the provider. `LocalOtpProvider` stores it on the session
      // and forwards it to the SMS sender so MSG91's template suffixes it
      // into the message body.
      appSignatureHash: input.appSignatureHash,
      // Analytics identity, not delivery: the provider only parks it on the
      // session so verify can stamp it on `bk_account_created`. Normalised
      // here so a wire `null` never reaches the store as a stored "null".
      pseudoId: input.pseudoId ?? undefined,
    });

    log.info(
      {
        country_code: input.phoneCountryCode,
        phone_number_length: input.phoneNumber.length,
        provider: this.provider.name,
        result: "success",
        latency_ms: Date.now() - startedAt,
        resend_available_after_seconds: OTP_RESEND_SECONDS,
      },
      "send-otp ok"
    );

    return {
      otpSessionId: meta.otpSessionId,
      userId,
      resendAvailableAfterSeconds: OTP_RESEND_SECONDS,
      otpLength: OTP_LENGTH,
    };
  }

  /**
   * `deviceContext` is the caller's request headers, already mapped
   * (`readDeviceContext`). Passed in rather than read here because a service
   * has no request; null for anything that did not send them.
   */
  async verifyOtp(
    input: VerifyOtpInput,
    deviceContext?: DeviceContext | null
  ): Promise<VerifyOtpResult> {
    const startedAt = Date.now();

    // Session-scoped rate limit (max attempts is also enforced by the
    // provider — this is defense in depth in case someone spams verify).
    const rlVerdict = await this.rateLimiter.consume(
      `otp:verify:${input.otpSessionId}`,
      // Provider owns the definitive count; add slack so the limiter never
      // reports before the provider has invalidated the session.
      10,
      15 * 60
    );
    if (!rlVerdict.allowed) {
      log.warn(
        {
          error_code: "OTP_RATE_LIMITED",
          otp_digit_count_entered: input.otp.length,
          retry_after_seconds: rlVerdict.retryAfterSeconds,
        },
        "verify-otp rate limited"
      );
      throw new AppError("Too many verify attempts", 429, "OTP_RATE_LIMITED");
    }

    const verdict = await this.provider.verifyOtp({
      otpSessionId: input.otpSessionId,
      otp: input.otp,
    });

    if (!verdict.ok) {
      const errorCode = mapReasonToErrorCode(verdict.reason);
      log.warn(
        {
          result: "failed",
          error_code: errorCode,
          attempt_count: verdict.metadata.attempts,
          resend_count: verdict.metadata.resendCount,
          otp_digit_count_entered: input.otp.length,
          latency_ms: Date.now() - startedAt,
        },
        "verify-otp failed"
      );
      // `void` for the same reason as the success path, plus one more: this
      // needs a lookup to find who failed, and a DB hiccup must not turn a
      // clean 401 into a 500. `trackFailedVerify` swallows everything.
      void this.trackFailedVerify(input, verdict, errorCode, startedAt);
      throw new AppError(publicMessageFor(errorCode), 401, errorCode);
    }

    // The row already exists (written at send), so this only stamps
    // `phoneVerifiedAt` — and `isNewUser` means "this verify was the one that
    // stamped it", which is the same thing it meant when the insert lived here.
    const { user, isNewUser } = await this.repo.markPhoneVerified(
      verdict.metadata.phoneCountryCode,
      verdict.metadata.phoneNumber
    );

    // Cache the device context for every event this user will ever produce —
    // this is the first moment a user id exists for these headers, and the
    // billing task's events later have no request behind them at all.
    //
    // AWAITED, and deliberately before the `void`ed sends below: those start
    // reading the cache the instant they are called, so writing after them
    // would leave the login funnel — the one series this most needs to segment
    // — unenriched. It costs a single bounded (200ms) Redis SET that swallows
    // its own failures, so it cannot fail or stall a login.
    if (deviceContext) await cacheDeviceContext(user.id, deviceContext);

    // TAM-47: seed a free-tier `subscriptions` row for every user right
    // after User creation succeeds. Idempotent — the underlying repository
    // upsert no-ops on repeat so calling this for existing users (e.g. a
    // returning phone number) is safe. Best-effort atomicity: this runs
    // AFTER the User transaction commits, so there's a tiny window where a
    // new User exists without a subscription row. `SubscriptionService.
    // getStatus` defensively returns the free shape when no row exists, so
    // that window is invisible to clients — worst case a stray warn log.
    await performServiceCall(
      "subscription",
      (svc) => svc.createFreeSubscriptionForUser(user.id),
      "otp:verify",
      "failed to create free subscription for new user"
    );

    const env = loadEnv();
    // No `email` key at all — a phone account has none, and signing an empty
    // string would put a falsy-but-present claim in front of every consumer.
    const payload: TokenPayload = { sub: user.id };
    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    });

    log.info(
      {
        result: "success",
        is_new_user: isNewUser,
        attempt_count: verdict.metadata.attempts,
        resend_count: verdict.metadata.resendCount,
        latency_ms: Date.now() - startedAt,
      },
      "verify-otp ok"
    );

    // `void`, not `await` — this is a REQUEST path and the user is watching a
    // spinner on the OTP screen; with the collector down they would wait out
    // `ANALYTICS_EVENTS_TIMEOUT_MS` for a number nobody reads in real time. The
    // send cannot reject (`OtpAnalyticsService` swallows), so nothing is lost.
    void otpAnalytics.trackVerificationResult({
      userId: user.id,
      otpSessionId: input.otpSessionId,
      // From the SESSION, not the `user` row: `UpsertResult.user.phone*` is
      // `string | null`, and a template literal swallows null without a type
      // error — a null pair would file the literal string "nullnull" as
      // somebody's phone number. `SessionMetadata` is non-null by construction
      // (it is the number the code was texted to), and it is what the failure
      // path already reports, so both branches now name the same source.
      phoneNumber: `${verdict.metadata.phoneCountryCode}${verdict.metadata.phoneNumber}`,
      result: "success",
      errorCode: null,
      attemptNumber: verdict.metadata.attempts,
      responseTimeMs: Date.now() - startedAt,
    });

    // Same `void` reasoning, gated on the flip: `isNewUser` is the only
    // admissible signal that THIS call created the account, so a replayed verify
    // stays silent here even before the deterministic `insert_id` dedupes it.
    if (isNewUser) {
      // `isNewUser` is the one signal that THIS verify created the account, so
      // this reports once per account, never per login. ONE chain, not two
      // side-by-side sends: `bk_account_created` first, and the registration
      // conversion only once the collector has taken it (`reportNewAccount`).
      void this.reportNewAccount({
        userId: user.id,
        createdAt: user.createdAt,
        // From the SESSION — captured at send, which is the only request in
        // this flow the client sends it on. Undefined for iOS / older builds
        // and for sessions created before the field existed.
        pseudoId: verdict.metadata.pseudoId,
        phone: `${verdict.metadata.phoneCountryCode}${verdict.metadata.phoneNumber}`,
      });
    }

    // The CAPTURE moment for attribution — a login is the only place the server
    // learns a user is present, so it is where the campaign pair is reported.
    //
    // No longer a bare `void`: on a FIRST capture this reply waits (briefly, and
    // never past `UTM_CAPTURE_VERIFY_BUDGET_MS`) for the stamp to land, because
    // the app calls `GET /users/me` the instant it has this token and the ad
    // landing is decided from the column this capture writes. See
    // `captureUtmBeforeReply`. Every other login still returns immediately.
    //
    // The old reasoning for `void` still holds and is preserved inside:
    // `trackUtmCaptured` swallows everything, so a burned OTP session can never
    // be answered with a 500 the user cannot retry.
    await this.captureUtmBeforeReply(user.id);

    return {
      token,
      user: {
        id: user.id,
        phoneCountryCode: user.phoneCountryCode,
        phoneNumber: user.phoneNumber,
      },
      isNewUser,
    };
  }

  /**
   * The failed-verify twin of the success-path track call.
   *
   * It needs a lookup the success path gets for free: a rejected verify has no
   * user on the stack, only the session's phone. That is answerable ONLY because
   * TAM-154 writes the row at send time — before it, a failed login was
   * structurally anonymous and this event could not have existed.
   *
   * Two branches deliberately emit nothing rather than guessing:
   *
   * - `session_not_found`, where the provider returns empty phone strings. There
   *   is no identity to attach, and the collector drops identity-less events.
   * - The 429 above, which short-circuits before the provider is consulted, so
   *   not even a session is in hand. A rate-limited caller is therefore absent
   *   from this series — the rate-limit warn log is where that lives.
   *
   * Never throws: a login must not fail because analytics could not.
   */
  private async trackFailedVerify(
    input: VerifyOtpInput,
    verdict: { metadata: { phoneCountryCode: string; phoneNumber: string; attempts: number } },
    errorCode: string,
    startedAt: number
  ): Promise<void> {
    try {
      const { phoneCountryCode, phoneNumber } = verdict.metadata;
      if (!phoneCountryCode || !phoneNumber) return;

      const userId = await this.repo.findIdByPhone(phoneCountryCode, phoneNumber);
      if (!userId) return;

      await otpAnalytics.trackVerificationResult({
        userId,
        otpSessionId: input.otpSessionId,
        phoneNumber: `${phoneCountryCode}${phoneNumber}`,
        result: "failure",
        errorCode,
        attemptNumber: verdict.metadata.attempts,
        responseTimeMs: Date.now() - startedAt,
      });
    } catch (err) {
      log.warn({ err, error_code: errorCode }, "failed to track otp verification result");
    }
  }

  /**
   * Report the user's campaign, at the one moment the server can: a verify that
   * SUCCEEDED.
   *
   * Deliberately not wired to a failed verify. `/auth/otp/verify` is public and a
   * failed attempt names a phone the caller has not proven they own, so reporting
   * from there would let anyone spraying codes at a stranger's number rewrite that
   * stranger's `latest` campaign — and, worse, burn their once-only `first` on
   * whatever campaign happened to be standing. A verified code is the only proof
   * that the person and the number are the same.
   *
   * No UTM upstream means NOTHING happens: no event and no stamp. A user with no
   * touch must stay unstamped so their real first campaign can still be captured
   * on a later login.
   *
   * Never throws. `fetchLatestUtm` already collapses every failure to null, but
   * both repository calls can throw, and this runs after the OTP session is gone.
   */
  /**
   * Report the new account, with the user's bucket-space position attached.
   *
   * The lookup lives HERE rather than inside `OtpAnalyticsService` so that
   * service keeps the property its whole docblock rests on: it reads nothing,
   * everything it sends is already on its caller's stack. This method is the
   * caller that goes and gets it — the same shape as `trackUtmCaptured` above,
   * and `void`ed by the same call site for the same reason, so the signup
   * response never waits on the abtesting service.
   *
   * `fetchSubjectBucket` collapses every failure to `null`, which ships as
   * `bucket_id: null`. Nothing here can throw, so the `void` is safe.
   */
  /**
   * The two records of a new account, in ORDER.
   *
   * `bk_account_created` goes first, and the registration conversion
   * (`CompleteRegistration` + `registration_successful`, to the referral
   * service) is sent only once the collector has ACCEPTED it. A signup Meta is
   * told about therefore always exists in the warehouse; a collector outage
   * suppresses the conversion rather than reporting a signup the funnel cannot
   * show. The conversion is one-shot and unretried (see `referral-conversions`),
   * so the skip is logged for reconciliation.
   *
   * Never rejects — both halves swallow their own failures — so the request
   * path `void`s it without risking an unhandled rejection.
   */
  private async reportNewAccount(input: {
    userId: string;
    createdAt: Date;
    pseudoId?: string;
    phone: string;
  }): Promise<void> {
    const { phone, ...account } = input;
    const accountCreated = await this.trackAccountCreated(account);
    if (!accountCreated) {
      log.warn(
        { user_id: input.userId, event: "registration_conversion_skipped" },
        "bk_account_created was not accepted by the collector; registration conversion not reported"
      );
      return;
    }
    await reportRegistrationConversion({ userId: input.userId, phone });
  }

  /** `true` when the collector took `bk_account_created`; `false` when the send failed. */
  private async trackAccountCreated(input: {
    userId: string;
    createdAt: Date;
    pseudoId?: string;
  }): Promise<boolean> {
    // The USER ID is the subject, matching every `evaluateAbtest` call site —
    // so the bucket stamped here is the one that decides which arm of every
    // future experiment this user lands in.
    const bucketId = await fetchSubjectBucket(input.userId);
    return otpAnalytics.trackAccountCreated({ ...input, bucketId });
  }

  /**
   * Run the capture, waiting for it ONLY when it can still change this user's
   * ad landing — i.e. on their first ever capture.
   *
   * ── WHY THE ORDER IS INVERTED HERE ──────────────────────────────────────────
   * `trackUtmCaptured` resolves "is this the first capture?" AFTER its upstream
   * fetch, because it needs the fetch's result either way for the analytics
   * fire. Deciding whether to WAIT cannot pay for that fetch first — the whole
   * point is to not put an upstream call in front of a returning user's login.
   * So the cheap local read runs here, and the answer is handed down so the
   * query is not repeated.
   *
   * A returning login keeps today's behaviour exactly: `void`, zero added
   * latency. It still makes the referral round trip — `bk_latest_utm_source`
   * is reported on EVERY login, not just the first — it simply is not waited
   * on, because nothing it finds can be stamped a second time.
   *
   * ── NEVER BLOCKS PAST THE BUDGET, NEVER THROWS ──────────────────────────────
   * The MARKER READ IS INSIDE THE RACE, not in front of it, so the budget is the
   * whole added latency of this method rather than just the capture's share.
   * That matters under connection-pool pressure: `new PrismaClient()` takes the
   * default pool timeout (~10s) to acquire a connection, and a read placed ahead
   * of the timer could sit there for all of it while the budget stood by
   * unstarted. Postgres is already a hard dependency of verify by this point —
   * several awaited queries precede it — but this method should not widen that
   * exposure, and now it cannot.
   *
   * The race is against a timer, not a cancellation: work that overruns keeps
   * going and still stamps, just after the reply. That is precisely the old
   * behaviour, so the timeout path is the previous worst case rather than a new
   * one. `trackUtmCaptured` swallows its own failures and the marker read is
   * guarded, so a dead database degrades to `void` rather than failing a verify
   * whose OTP session is already burned.
   */
  private async captureUtmBeforeReply(userId: string): Promise<void> {
    let budget: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.resolveThenCapture(userId),
        new Promise<void>((resolve) => {
          budget = setTimeout(resolve, UTM_CAPTURE_VERIFY_BUDGET_MS);
        }),
      ]);
    } finally {
      // The loser of the race must not hold the event loop open for the rest of
      // the budget once the capture has already won.
      if (budget !== undefined) clearTimeout(budget);
    }
  }

  /**
   * The raced half of {@link captureUtmBeforeReply}: read the marker, then run
   * the capture — awaited on a first capture, `void`ed on every other login.
   *
   * Never rejects. A marker read that throws falls back to the old `void` shape
   * rather than surfacing on a reply the user cannot retry.
   */
  private async resolveThenCapture(userId: string): Promise<void> {
    let isFirstCapture: boolean;
    try {
      isFirstCapture = (await this.repo.findFirstUtmReportedAt(userId)) === null;
    } catch (err) {
      log.warn({ err, user_id: userId }, "could not resolve first-utm marker; not waiting");
      void this.trackUtmCaptured(userId);
      return;
    }

    if (!isFirstCapture) {
      void this.trackUtmCaptured(userId);
      return;
    }

    await this.trackUtmCaptured(userId, isFirstCapture);
  }

  /**
   * @param knownFirstCapture Precomputed by `captureUtmBeforeReply` so the
   *        marker read is not issued twice. Omitted on the `void` paths, which
   *        resolve it here as before.
   */
  private async trackUtmCaptured(
    userId: string,
    knownFirstCapture?: boolean
  ): Promise<void> {
    try {
      const utm = await fetchLatestUtm(userId);
      if (!utm) return;

      const isFirstCapture =
        knownFirstCapture ?? (await this.repo.findFirstUtmReportedAt(userId)) === null;
      await otpAnalytics.trackUtmCaptured({ userId, utm, isFirstCapture });

      // AFTER the send, and only for a first capture. `trackUtmCaptured` swallows,
      // so "the send was attempted" is all this can wait for — but stamping first
      // would mean a collector outage silently spends the marker and `first` is
      // never emitted for that user again.
      //
      // A failed stamp is logged and nothing more. Retrying it here would be the
      // one shape that can loop, and the cost of leaving it is bounded: their next
      // login re-emits `first`, and both rows carry the same user-keyed
      // `insert_id`, so the warehouse collapses them.
      // TAM-258: the ad group goes down in the same guarded write as the marker,
      // so the landing resolver reads the campaign that ACTUALLY brought this
      // user in rather than whichever ad they clicked most recently. `/latest`
      // cannot answer that question later — this is the only moment it is
      // answerable at all.
      if (isFirstCapture) {
        await this.repo.markFirstUtmReported(userId, new Date(), utm.utm_group);
      }
    } catch (err) {
      log.warn({ err, user_id: userId }, "failed to report utm capture");
    }
  }

  async resendOtp(input: ResendOtpInput): Promise<ResendOtpResult> {
    const startedAt = Date.now();

    // A resend is a billable SMS on the same footing as a send, so it is capped
    // too. Keyed on the session because that is all this layer is given — the
    // number never reaches it. The per-PHONE ceiling that catches "a fresh
    // session per resend" lives in `LocalOtpProvider.deliver`, which does know
    // the handset (see DELIVERY_RATE_LIMIT_MAX).
    const rlVerdict = await this.rateLimiter.consume(
      `otp:resend:${input.otpSessionId}`,
      RESEND_RATE_LIMIT_MAX,
      RESEND_RATE_LIMIT_WINDOW_SECONDS
    );
    if (!rlVerdict.allowed) {
      log.warn(
        {
          error_code: "OTP_RATE_LIMITED",
          retry_after_seconds: rlVerdict.retryAfterSeconds,
        },
        "resend-otp rate limited"
      );
      throw new AppError("Too many resend attempts", 429, "OTP_RATE_LIMITED");
    }

    const meta = await this.provider.resendOtp({ otpSessionId: input.otpSessionId });
    log.info(
      {
        result: "success",
        resend_count: meta.resendCount,
        provider: this.provider.name,
        latency_ms: Date.now() - startedAt,
        next_resend_available_after_seconds: OTP_RESEND_SECONDS,
      },
      "resend-otp ok"
    );
    return { resendAvailableAfterSeconds: OTP_RESEND_SECONDS };
  }
}

function mapReasonToErrorCode(reason: string | undefined): string {
  switch (reason) {
    case "invalid_otp":
      return "OTP_INVALID";
    case "session_expired":
      return "OTP_SESSION_EXPIRED";
    case "session_exhausted":
      return "OTP_SESSION_EXHAUSTED";
    case "session_not_found":
      return "OTP_SESSION_EXPIRED";
    default:
      return "OTP_INVALID";
  }
}

function publicMessageFor(errorCode: string): string {
  switch (errorCode) {
    case "OTP_SESSION_EXPIRED":
      return "OTP session expired";
    case "OTP_SESSION_EXHAUSTED":
      return "OTP session exhausted — request a new OTP";
    default:
      return "Invalid OTP";
  }
}
