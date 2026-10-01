import { classifyFailure } from "@api/core/payment/failure-sub-code";
import { AppError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import type { MandateState, PdnStatus } from "@api/core/payment/types";
import type {
  CreateMandateInput,
  CreateMandateResult,
  DebitStatusInput,
  MandateProvider,
  MandateStatusResult,
  PreDebitInput,
  PreDebitResult,
  PreDebitStatusInput,
  PreDebitStatusResult,
  PresentDebitInput,
  PresentDebitResult,
} from "@api/core/payment/mandate.provider.js";
import {
  DuplicateReferenceError,
  NoSuchDebitError,
  PreDebitTooSoonError,
} from "@api/core/payment/mandate.provider.js";
import {
  DecentroApiError,
  DecentroClient,
  isJsonObject,
  isProviderSuccess,
  readString,
} from "./decentro.client.js";
import {
  DECENTRO_PATHS as PATHS,
  DECENTRO_WIRE_FLAGS as WIRE_FLAGS,
  DECENTRO_FREQUENCY as FREQUENCY,
  DECENTRO_AS_PRESENTED,
  DECENTRO_FREQUENCIES_WITHOUT_RULE_TYPE as FREQUENCIES_WITHOUT_RULE_TYPE,
  DECENTRO_STATE_BY_PROVIDER_STATUS as STATE_BY_PROVIDER_STATUS,
  DECENTRO_PDN_STATE_BY_PROVIDER_STATUS as PDN_STATE_BY_PROVIDER_STATUS,
  DECENTRO_MANDATE_ID_KEYS as MANDATE_ID_KEYS,
  DECENTRO_TXN_ID_KEYS as TXN_ID_KEYS,
  DECENTRO_STATUS_KEYS as STATUS_KEYS,
  DECENTRO_ERROR_KEYS as ERROR_KEYS,
  DECENTRO_QUERY_KEYS as QUERY_KEYS,
} from "./decentro.constants.js";
import { maskPayerName, maskVpa } from "./pii-mask.js";
import { findIntentLink } from "./intent-link.js";

const log = createModuleLogger("payment:decentro-provider");

// Re-exported so existing unit tests can keep importing the maskers from the
// adapter; the implementation now lives in the shared `pii-mask` module.
export { maskPayerName, maskVpa };

/**
 * Decentro UPI Autopay adapter — the production `MandateProvider`.
 *
 * Sibling of `StubMandateProvider` behind the same seam, selected at the
 * composition root by `PAYMENT_PROVIDER`. Its entire job is TRANSLATION, in
 * both directions:
 *
 *   domain → wire   paise become rupee floats, `Date`s become `YYYY-MM-DD`,
 *                   real booleans become the strings `"true"` / `"false"`.
 *   wire → domain   nine `mandate_status` spellings collapse onto our
 *                   `MandateState`, and the payer's VPA/name are masked before
 *                   they are allowed out of this file.
 *
 * No business rule lives here. If a decision would still make sense against a
 * different provider, it belongs in `services/`. Wire-level constants (paths,
 * flags, status map, id keys) live in `decentro.constants.ts`.
 */

/**
 * Map a provider `mandate_status` onto our state.
 *
 * An unrecognised value maps to `pending`, NEVER `active`. Entitlement is
 * granted off this state, so the failure mode of guessing wrong in the
 * optimistic direction is giving away paid content on a status we do not
 * understand. `pending` costs a poll; `active` costs revenue and is
 * unrecoverable once the user has the content. Same reasoning for a missing
 * status: absence is not approval.
 */
export function mapMandateState(raw: string | null): MandateState {
  if (!raw) return "pending";
  const mapped = STATE_BY_PROVIDER_STATUS[raw.trim().toLowerCase()];
  if (mapped) return mapped;
  log.warn(
    { event: "decentro_unknown_mandate_status", mandate_status: raw },
    "unrecognised Decentro mandate_status — treating as pending, not active"
  );
  return "pending";
}

export class DecentroMandateProvider implements MandateProvider {
  readonly name = "decentro";

  /**
   * Unlike Cashfree, `presentDebit` here is itself the money-moving POST — the
   * notification only schedules NPCI's mandatory warning. So a notification that
   * fails in transport CANNOT have moved money, and its cycle is safely
   * re-claimable once the gateway confirms it never arrived.
   */
  readonly chargePhase = "submission" as const;

  /**
   * Registration DOES move money here: `is_first_txn_amount` makes Decentro
   * debit `default_amount` with the same UPI PIN entry that authorizes the
   * mandate. There is no second call and no separate settlement — the user
   * approving IS the deposit succeeding, which is exactly the outcome
   * `MandateService` already settles `transactions.kind = 'initial_deposit'` on.
   *
   * Was false while the adapter refused any deposit outright. That refusal was
   * a real constraint of how it registered mandates (`start_date` in the future
   * during a trial, which Decentro will not accept a first-transaction amount
   * against), not of the gateway.
   */
  readonly supportsInitialDeposit = true;

  /**
   * Decentro's pre-debit notification API documents the band explicitly: it must
   * be used "at least 24 to 48 hours before the actual debit". The window our
   * code enforces matches that contract exactly rather than by coincidence — do
   * not widen it without re-reading that page.
   */
  readonly pdnLeadHours = { min: 24, max: 48 } as const;

  /**
   * `null` — Decentro TELLS us the instant. The notification status read
   * answers with a real `debit_date` (~notify + 24h), which `PdnService` writes
   * to `pdn_notifications.scheduled_debit_at`. Synthesising one here would
   * substitute a guess for a fact the vendor already supplies, and the two
   * would diverge the moment Decentro changed its turnaround.
   */
  readonly presentationTatHours = null;


  /**
   * The DETERMINISTIC per-cycle idempotency key, stored as
   * `transactions.gateway_request_id` before dispatch.
   *
   * This returned `null` before, on the reasoning that Decentro assigns its own
   * transaction ids and we cannot supply one. True of the *provider's* id, but the
   * wrong conclusion: this key is OURS, and two things depended on it existing.
   * The cycle-conflict guard has a second arm keyed on `gateway_request_id`, and
   * `recoverFailedNotifications` refuses to act without one — logging
   * `no_request_id` and deferring. So every Decentro cycle lost the second guard
   * AND was permanently unrecoverable.
   *
   * Deliberately NOT the value sent to Decentro as `reference_id`: this one is
   * stable per cycle, which is what makes "did my call land?" answerable, whereas
   * the wire reference must be fresh per attempt because Decentro rejects reuse.
   * Those two requirements are contradictory, which is why they are two columns.
   */
  debitRequestId(referenceId: string, cycleDate: Date): string | null {
    return `pj_pdb_${referenceId}_${toWireDate(cycleDate)}`;
  }

  private readonly client: DecentroClient;

  /** Client built here, as in `S3MediaRepository`; injectable for tests. */
  constructor(client?: DecentroClient) {
    this.client = client ?? new DecentroClient();
  }

  async createMandate(input: CreateMandateInput): Promise<CreateMandateResult> {
    const amountRule = input.amountRule.toUpperCase();

    // Whether Decentro debits at registration. Gated on MAX because
    // `default_amount` — the field that carries the amount — is only accepted
    // under that rule; under FIXED every debit is `amount` by definition and
    // there is no room for a different first one. A deposit configured on a
    // FIXED plan would therefore be silently dropped, so refuse it instead:
    // both the plan and the amount rule are ops-managed, making that a
    // misconfiguration rather than a runtime condition to absorb.
    const chargesDeposit = input.initialDepositPaise > 0 && amountRule === "MAX";
    if (input.initialDepositPaise > 0 && !chargesDeposit) {
      throw new AppError(
        `Decentro can only take a registration deposit under the MAX amount rule, not ${amountRule}`,
        409,
        "PLAN_NOT_PURCHASABLE"
      );
    }

    // LOWER CASE on the wire, and the lookup is what turns our `AS_PRESENTED`
    // into Decentro's `aspresented` — `.toUpperCase()` alone would send a value
    // it does not know.
    //
    // Falls back rather than throwing, and the fallback is AS-PRESENTED, not
    // monthly. A typo or a future plan config reaching here is exactly the
    // situation where the safe answer matters, and `monthly` is precisely the
    // unbillable shape this whole change exists to remove — it would register a
    // mandate whose every notification is refused. As-presented bills correctly
    // whatever the plan meant, because our own scheduler owns the cadence
    // regardless (`BillingCycleService` advances on `addMonthClamped` and never
    // reads this field back).
    const mapped = FREQUENCY[input.frequency.toUpperCase()];
    if (!mapped) {
      log.warn(
        { event: "decentro_unknown_frequency", frequency: input.frequency },
        "unrecognised plan frequency — registering as-presented, which our scheduler can bill"
      );
    }
    const frequency = mapped ?? DECENTRO_AS_PRESENTED;

    const body: Record<string, unknown> = {
      reference_id: input.referenceId,
      consumer_urn: this.client.consumerUrn,
      mandate_name: input.mandateName,
      // RUPEES, as a float — the vendor's unit, and the only place in this
      // codebase that a money value stops being an integer. Two decimals so a
      // paise value can never arrive as 2.9899999999999998.
      amount: toRupees(input.amountPaise),
      frequency,
      purpose_message: input.purposeMessage,
      // OMITTED on a merchant-scheduled mandate, not sent as null — a recurrence
      // rule with no recurrence is a 400 on the field set.
      //
      // On a calendar frequency it is `rule_type` ALONE, with no `rule_value`:
      // that is the shape crickmate-monorepo sends, and it carries no day
      // number at all (`decentro.provider.ts:44,267` — `rule_value` does not
      // exist anywhere in that codebase). Note neither codebase has exercised
      // this branch against Decentro: every live mandate in both is
      // as-presented, so this is the documented shape, not a proven one.
      ...(FREQUENCIES_WITHOUT_RULE_TYPE.includes(frequency)
        ? {}
        : { rule_type: input.ruleType.toUpperCase() }),
      amount_rule: amountRule,
      start_date: toWireDate(input.startDate),
      end_date: toWireDate(input.endDate),
      expiry_time: Math.trunc(input.expiryMinutes),
      ...WIRE_FLAGS,
      // Set together or not at all: Decentro only honours a first-transaction
      // amount that differs from the recurring one under the MAX rule, and the
      // flag alone with no `default_amount` has nothing to charge.
      is_first_txn_amount: chargesDeposit,
    };

    // `default_amount` is mandatory when the rule is MAX. It is the DEFAULT
    // amount, not the recurring one: `amount` is the cap this mandate may never
    // exceed, and every cycle names its own figure in the pre-debit
    // notification (`notifyPreDebit` sends the plan price). So with
    // `is_first_txn_amount` set, this is the ONE debit it governs — the deposit
    // taken at registration — and the plan price still bills each month
    // afterwards. Without a deposit it falls back to the plan price, which is
    // then both the default and every actual debit.
    //
    // Sent only under MAX so a FIXED mandate doesn't carry a field the vendor
    // may reject as contradictory.
    if (amountRule === "MAX") {
      body.default_amount = toRupees(
        chargesDeposit ? input.initialDepositPaise : input.amountPaise
      );
    }

    const response = await this.client.post(PATHS.create, body, {
      operation: "create_mandate",
      referenceId: input.referenceId,
    });

    const authUrl = findIntentLink(response);
    if (!authUrl) {
      // A registration with no link is useless to the client and, worse, may
      // have created a mandate at the provider. Throw so the service marks the
      // row failed and reconciles by `referenceId` — never return a result
      // with an empty URL.
      throw new AppError(
        "Decentro create-mandate returned no approval link",
        502,
        "PROVIDER_RESPONSE_INVALID"
      );
    }

    return {
      providerMandateId: pick(response, MANDATE_ID_KEYS),
      providerTxnId: pick(response, TXN_ID_KEYS),
      authUrl,
      // Computed, not read back: the vendor echoes `expiry_time` in minutes at
      // best, and the client needs an absolute instant to expire the CTA on.
      authExpiresAt: new Date(Date.now() + input.expiryMinutes * 60_000),
      // Registration only ever yields "awaiting the user"; `active` arrives via
      // a later status read, never from this call.
      state: mapMandateState(pick(response, STATUS_KEYS)),
    };
  }

  async getMandateStatus(input: {
    referenceId: string;
    providerMandateId: string | null;
  }): Promise<MandateStatusResult> {
    // EXACTLY ONE identifier, mandate id preferred. The old comment admitted this
    // was a guess and sent three keys at once — `reference_id`, `consumer_urn` and
    // the mandate id — on the theory that a wrong name would degrade to a narrower
    // lookup. It does not: Decentro's status endpoints take a single identifier, so
    // several is a DIFFERENT request. Same correction as the two presentation
    // status reads.
    const query = firstPresentQuery([
      [QUERY_KEYS.mandateId, input.providerMandateId],
      [QUERY_KEYS.referenceId, input.referenceId],
    ]);

    const response = await this.client.get(PATHS.status, query, {
      operation: "get_mandate_status",
      referenceId: input.referenceId,
    });
    const data = unwrapData(response);

    return {
      state: mapMandateState(pick(data, STATUS_KEYS)),
      stateReason: pick(data, ["status_description", "message", "reason"]),
      providerMandateId: pick(data, MANDATE_ID_KEYS),
      providerTxnId: pick(data, TXN_ID_KEYS),
      npciTransactionId: pick(data, [
        "npci_txn_id",
        "npciTxnId",
        "npci_transaction_id",
      ]),
      // MASKED HERE, AT THE BOUNDARY. The status response carries the payer's
      // VPA and legal name in the clear; both are personal financial data we
      // have no product use for beyond showing the user which account they
      // authorised with. Masking at the edge means the full values exist only
      // inside this function's stack frame — they are never returned, never
      // persisted (the `mandates` columns are `*_masked`), and never logged.
      payerHandleMasked: maskVpa(pick(data, ["payer_vpa", "payerVpa"])),
      payerNameMasked: maskPayerName(pick(data, ["payer_name", "payerName"])),
      nextDebitDate: parseWireDate(
        pick(data, ["next_debit_date", "nextDebitDate", "next_execution_date"])
      ),
    };
  }

  /**
   * Step A of the flow: tell the payer what is about to be taken.
   *
   * ASYNCHRONOUS, and everything about this method follows from that. Decentro
   * answers `notification_status: "PENDING"` with NO `presentation_sequence_id`
   * and issues the id later, delivering it by callback. This used to THROW on that
   * response — so every cycle was recorded `failure_phase='notify'` and no debit
   * was ever raised. A missing id is now a normal `sent` result, and
   * `getPreDebitStatus` is how it gets resolved.
   *
   * The body is EXACTLY four fields. `consumer_urn` and `currency` were removed:
   * neither is in the contract for this endpoint (the urn is a create-mandate
   * field, and the currency is implied by the mandate), and Decentro validates
   * field sets — the `generate_psp_uri` boolean rejection proves it.
   */
  async notifyPreDebit(input: PreDebitInput): Promise<PreDebitResult> {
    const response = await this.postChecked(
      PATHS.notify,
      {
        // The NOTIFICATION's own reference, fresh per attempt. Sending the
        // mandate's — which is what this did — means cycle 2 onward is refused
        // with `error_duplicate_reference_id`.
        reference_id: input.notificationRef,
        decentro_mandate_id: input.providerMandateId,
        amount: toRupees(input.amountPaise),
        debit_date: toWireDate(input.cycleDate),
      },
      { operation: "send_pdn", referenceId: input.referenceId }
    );

    // NESTED under `notification_detail`, not at the top level of `data`. Reading
    // the top level is why the id was never found even when Decentro did send one.
    const detail = notificationDetail(response);

    return {
      presentationSequenceId: readString(
        detail,
        QUERY_KEYS.presentationSequenceId
      ),
      status: mapPdnStatus(pick(detail, ["notification_status", "status"])),
      providerTxnId: pick(unwrapData(response), TXN_ID_KEYS),
      raw: response,
    };
  }

  /**
   * Read a notification back — the counterpart to the asynchronous notify, and the
   * endpoint whose absence made an async answer unresolvable.
   *
   * A READ on the retrying `get`. Throws {@link NoSuchDebitError} when Decentro
   * definitively answers that no such notification exists, which is the one signal
   * that lets a stranded cycle be superseded.
   */
  async getPreDebitStatus(
    input: PreDebitStatusInput
  ): Promise<PreDebitStatusResult> {
    let response: Record<string, unknown>;
    try {
      response = await this.client.get(
        PATHS.notificationStatus,
        // EXACTLY ONE identifier — prefer theirs when we hold it, else ours.
        firstPresentQuery([
          [QUERY_KEYS.presentationSequenceId, input.presentationSequenceId],
          [QUERY_KEYS.referenceId, input.referenceId],
        ]),
        { operation: "get_pdn_status", referenceId: input.referenceId }
      );
    } catch (err) {
      if (hasResponseKey(err, ERROR_KEYS.noPdnRecord)) {
        throw new NoSuchDebitError(
          `Decentro has no pre-debit notification for ${input.referenceId}`
        );
      }
      throw err;
    }

    const detail = notificationDetail(response);
    return {
      status: mapPdnStatus(pick(detail, ["notification_status", "status"])),
      presentationSequenceId: readString(
        detail,
        QUERY_KEYS.presentationSequenceId
      ),
      failureCode: pick(detail, ["error_key", "error_code"]),
      failureMessage: pick(detail, ["error_key_description", "message"]),
      // Classified from the provider's MACHINE reason fields, never from
      // the message above — that is user-facing copy (TAM-186).
      failureSubCode: classifyFailure([
        pick(detail, ["error_key"]),
        pick(detail, ["error_code"]),
      ]),
      // The instant Decentro will actually take the money — see
      // `PreDebitStatusResult.scheduledDebitAt`. Only present on an accepted
      // notification; null everywhere else, which the caller handles.
      scheduledDebitAt: parseVendorTimestamp(readString(detail, "debit_date")),
      raw: response,
    };
  }

  /**
   * Step B: take the money. IRREVERSIBLE, and never retried — `DecentroClient.post`
   * structurally cannot, and a thrown error here must be reconciled by READING
   * status, never by presenting again.
   *
   * The body is EXACTLY three fields, all three mandatory. `purpose_message` was
   * ABSENT before, so every presentation would have been rejected on a missing
   * required field. The four removed fields — `consumer_urn`, `decentro_mandate_id`,
   * `amount`, `currency`, `debit_date` — are not in the contract: the presentation
   * is addressed purely by the sequence id, and the amount was FROZEN when the
   * notification was raised. Re-sending it is at best redundant and at worst an
   * amount-mismatch rejection.
   */
  async presentDebit(input: PresentDebitInput): Promise<PresentDebitResult> {
    const response = await this.postChecked(
      PATHS.presentation,
      {
        // THIS attempt's reference, not the mandate's and not the notification's.
        reference_id: input.presentationRef,
        presentation_sequence_id: input.presentationSequenceId,
        purpose_message: input.purposeMessage,
      },
      { operation: "present_debit", referenceId: input.referenceId }
    );

    // FLAT under `data` on the execute response — unlike the status read below,
    // which nests under `presentation_detail`. The asymmetry is the vendor's, and
    // reading the wrong one yields a null status that maps to a permanent `pending`.
    const data = unwrapData(response);

    return {
      outcome: mapDebitOutcome(
        pick(data, ["presentation_status", "transaction_status", "status"])
      ),
      providerTxnId: pick(data, TXN_ID_KEYS),
      bankReferenceNumber: pick(data, [
        "bank_reference_number",
        "bankReferenceNumber",
        "rrn",
      ]),
      npciTransactionId: pick(data, ["npci_txn_id", "npciTxnId"]),
      failureCode: pick(data, ["error_key", "error_code", "errorCode"]),
      failureMessage: pick(data, [
        "error_key_description",
        "error_message",
        "message",
      ]),
      // Classified from the provider's MACHINE reason fields, never from
      // the message above — that is user-facing copy (TAM-186).
      failureSubCode: classifyFailure([
        pick(data, ["error_key"]),
        pick(data, ["error_code"]),
      ]),
    };
  }

  /**
   * Read back the outcome of a debit we already presented.
   *
   * Two corrections here. The PATH had a spurious `/mandate` segment — a
   * presentation is its own resource, hanging off `/autopay` directly — and the
   * query sent FIVE parameters where the endpoint takes exactly one, which the old
   * comment admitted was a guess.
   *
   * Fails CLOSED in both directions. A transport error propagates (the caller
   * leaves the attempt unsettled and the next sweep asks again), and an
   * unrecognised status maps to `pending` via `mapDebitOutcome` — never
   * `succeeded`, which grants an unpaid month, and never `failed`, which duns a
   * user who actually paid. Note this is the OPPOSITE default from
   * `mapPdnStatus`, deliberately: this call is about money that may already have
   * moved, where guessing either way is destructive, whereas an unresolvable
   * NOTIFICATION is safe to give up on because no money has moved yet.
   */
  async getDebitStatus(input: DebitStatusInput): Promise<PresentDebitResult> {
    const response = await this.client.get(
      PATHS.presentationStatus,
      // The sequence id ALONE. `DebitStatusInput` types it non-nullable, so a
      // reference-id fallback here would be unreachable code in a money path — and
      // the reference implementation sends only this one.
      { [QUERY_KEYS.presentationSequenceId]: input.presentationSequenceId },
      { operation: "get_presentation_status", referenceId: input.referenceId }
    );
    // NESTED under `presentation_detail` on the status read, unlike the flat
    // execute response above.
    const data = presentationDetail(response);

    return {
      outcome: mapDebitOutcome(
        pick(data, ["presentation_status", "transaction_status", "status"])
      ),
      providerTxnId: pick(data, TXN_ID_KEYS),
      bankReferenceNumber: pick(data, [
        "bank_reference_number",
        "bankReferenceNumber",
        "rrn",
      ]),
      npciTransactionId: pick(data, ["npci_txn_id", "npciTxnId"]),
      failureCode: pick(data, ["error_key", "error_code", "errorCode"]),
      failureMessage: pick(data, [
        "error_key_description",
        "error_message",
        "message",
      ]),
      // Classified from the provider's MACHINE reason fields, never from
      // the message above — that is user-facing copy (TAM-186).
      failureSubCode: classifyFailure([
        pick(data, ["error_key"]),
        pick(data, ["error_code"]),
      ]),
    };
  }

  async revokeMandate(input: {
    referenceId: string;
    providerMandateId: string;
  }): Promise<void> {
    // TODO(decentro): confirm with provider the `manage` action vocabulary.
    // "REVOKE" is what the docs show; the endpoint also covers pause/resume,
    // which we deliberately do not call (Decentro documents pause as
    // user-initiated from the payer's UPI app — observable, not commandable).
    //
    // `postChecked`, NOT `client.post` — this is a MUTATION, and Decentro
    // signals application-level failure inside a 200 via `api_status:
    // "FAILURE"`. On the bare client that reads as success, and the caller
    // (`MandateService.cancelForUser`) then flips the row to `revoked` and ends
    // the subscription while the mandate stays live and debitable at NPCI.
    // That is the exact "user thinks they cancelled and gets charged again"
    // failure, and it became reachable from a user's phone when the in-app
    // cancel started driving a real revoke.
    await this.postChecked(
      PATHS.manage,
      {
        reference_id: input.referenceId,
        consumer_urn: this.client.consumerUrn,
        decentro_mandate_id: input.providerMandateId,
        action: "REVOKE",
      },
      { operation: "manage_mandate", referenceId: input.referenceId }
    );
    // No return value on purpose: the authoritative post-revoke state comes
    // from the next status read, not from this response body.
  }

  /**
   * POST, then check the ENVELOPE — not just the HTTP status.
   *
   * Decentro signals application-level failure inside a **200** via
   * `api_status: "FAILURE"`. The client gates on `response.ok` alone, so such a
   * response used to be read as success; the caller then found the fields it
   * wanted missing and fabricated a `pending` outcome, leaving a rejected debit
   * unsettled forever. This closes that.
   *
   * It also translates the vendor's `response_key` into DOMAIN errors at the seam,
   * which is where provider vocabulary is supposed to stop — `services/` cannot
   * import this file, and it is the service that has to decide defer-versus-fail.
   *
   * Applied to the MUTATIONS only. The two status reads deliberately do not use it:
   * their own status field already carries the answer, and a hard throw there would
   * defeat the fail-soft reconciliation those calls exist for.
   */
  private async postChecked(
    path: string,
    body: Record<string, unknown>,
    ctx: { operation: string; referenceId: string }
  ): Promise<Record<string, unknown>> {
    let response: Record<string, unknown>;
    try {
      response = await this.client.post(path, body, ctx);
    } catch (err) {
      throw translateResponseKey(err);
    }

    if (!isProviderSuccess(response)) {
      // A 200 that means no. Raised as the same domain errors a 4xx would be, so a
      // caller never has to care which layer said no.
      const key = readString(response, "response_key");
      const translated = translateResponseKey(
        new DecentroApiError(
          `Decentro ${path} returned api_status FAILURE: ${
            readString(response, "message") ?? "no message"
          }`,
          200,
          key,
          { apiStatus: "FAILURE", responseKey: key }
        )
      );
      throw translated;
    }

    return response;
  }
}

/**
 * Provider `response_key` → a DOMAIN error, or the original error untouched.
 *
 * The three keys that matter are the three the flow branches on: whether a cycle
 * may be superseded, whether the previous attempt actually landed, and whether a
 * rejection is merely premature. Everything else passes through unchanged, so an
 * unrecognised failure stays a failure rather than being quietly reclassified.
 */
function translateResponseKey(err: unknown): unknown {
  if (!(err instanceof DecentroApiError)) return err;
  switch (err.responseKey) {
    case ERROR_KEYS.noPdnRecord:
      return new NoSuchDebitError(err.message);
    case ERROR_KEYS.duplicateReference:
      return new DuplicateReferenceError(err.message);
    case ERROR_KEYS.invalidDebitDate:
      // The umbrella key. Everything under it is a timing rejection EXCEPT the
      // cadence variant, which is terminal — so the one case we must not defer
      // gets checked by message and left as a hard failure.
      if (isCadenceRejection(err.message)) {
        log.error(
          {
            event: "decentro_cadence_rejection",
            response_key: err.responseKey,
            provider_message: err.message,
          },
          // Since TAM-152 no mandate carries a calendar frequency, so reaching
          // here means one was registered anyway — by an older build, by hand, or
          // by a regression in MANDATE_CONSENT_TERMS. Every cycle on that mandate
          // is unbillable until it is re-consented, and no retry will fix it.
          "Decentro rejected the debit date for the mandate's FREQUENCY — this mandate is not as-presented and cannot be billed"
        );
        return err;
      }
      return new PreDebitTooSoonError(err.message);
    case ERROR_KEYS.debitDateIsToday:
    case ERROR_KEYS.pdnTooSoon:
    case ERROR_KEYS.presentationWindowNotStarted:
      return new PreDebitTooSoonError(err.message);
    default:
      return err;
  }
}

/**
 * Is this `error_invalid_debit_date` the terminal cadence variant rather than a
 * window-timing one?
 *
 * Substring matching on a vendor message is fragile, and it is used here for
 * exactly one decision: whether to defer or to fail. It errs toward DEFERRING —
 * an unrecognised wording is treated as a timing problem, which is recoverable,
 * where a wrong `failed` writes the cycle off. The abandoned-cycle sweep is what
 * stops an endlessly-deferred cycle from disappearing quietly.
 */
function isCadenceRejection(message: string): boolean {
  return /frequency/i.test(message);
}

/** Did this error carry a specific `response_key`? */
function hasResponseKey(err: unknown, key: string): boolean {
  return err instanceof DecentroApiError && err.responseKey === key;
}

/**
 * The `notification_detail` object a notify / notification-status response nests
 * its answer in. Empty object when absent, so readers stay null-safe.
 */
function notificationDetail(
  response: Record<string, unknown>
): Record<string, unknown> {
  const inner = unwrapData(response).notification_detail;
  return isJsonObject(inner) ? inner : {};
}

/** The `presentation_detail` object a presentation-STATUS response nests under. */
function presentationDetail(
  response: Record<string, unknown>
): Record<string, unknown> {
  const data = unwrapData(response);
  const inner = data.presentation_detail;
  // Falls back to `data` rather than `{}`: the execute response is flat, so a
  // caller that reaches here with one still reads the right fields.
  return isJsonObject(inner) ? inner : data;
}

/**
 * Build a query carrying EXACTLY ONE identifier — the first candidate present.
 *
 * Decentro's status endpoints take a single identifier. Sending several is not
 * belt-and-braces, it is a different request, and the previous code's
 * five-parameter query was a documented guess. Ordering the candidates puts the
 * provider's own id first, since it is the more specific of the two.
 */
function firstPresentQuery(
  candidates: readonly (readonly [string, string | null | undefined])[]
): Record<string, string> {
  for (const [key, value] of candidates) {
    if (value) return { [key]: value };
  }
  return {};
}

/**
 * Provider `notification_status` → our `PdnStatus`.
 *
 * An unrecognised or absent status maps to `failed`, which is the OPPOSITE default
 * from `mapMandateState` and `mapDebitOutcome`, and the asymmetry is deliberate: a
 * notification is upstream of any money movement, so giving up on one costs a
 * retry, whereas guessing wrong about a mandate's state gives away paid content
 * and guessing wrong about a debit either duns a paying user or grants an unpaid
 * month.
 *
 * What makes `failed` safe is the guard on the other side: `PdnRepository.rearm`
 * refuses to act on a row that already HOLDS a sequence id, so a spurious `failed`
 * can never clear a valid notification and lose the cycle. Without that guard this
 * default would be the wrong choice.
 */
function mapPdnStatus(raw: string | null): PdnStatus {
  if (!raw) {
    log.warn(
      { event: "decentro_missing_notification_status" },
      "Decentro returned no notification_status — treating the notification as failed, which is recoverable only because re-arm cannot clear a held sequence id"
    );
    return "failed";
  }
  const mapped = PDN_STATE_BY_PROVIDER_STATUS[raw.trim().toLowerCase()];
  if (mapped) return mapped;
  log.warn(
    { event: "decentro_unknown_notification_status", notification_status: raw },
    "unrecognised Decentro notification_status — treating as failed"
  );
  return "failed";
}

/**
 * Decentro sometimes nests the payload under `data`. Returns the inner object
 * when there is one, so every reader below can be written flat.
 */
function unwrapData(response: Record<string, unknown>): Record<string, unknown> {
  const inner = response.data;
  return isJsonObject(inner) ? inner : response;
}

/** First non-empty string among `keys`, or null. */
function pick(
  obj: Record<string, unknown>,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const found = readString(obj, key);
    if (found) return found;
  }
  return null;
}

/**
 * Presentation outcome. Defaults to `pending`, which is also the NORMAL
 * result: a submitted debit settles asynchronously and the answer arrives by
 * callback (or by the straggler sweep). Only an explicit success/failure moves
 * off it — an unrecognised value must not be read as either.
 */
function mapDebitOutcome(raw: string | null): PresentDebitResult["outcome"] {
  if (!raw) return "pending";
  const value = raw.trim().toLowerCase();
  if (["success", "successful", "succeeded", "completed"].includes(value)) {
    return "succeeded";
  }
  if (["failure", "failed", "rejected", "declined"].includes(value)) {
    return "failed";
  }
  if (value !== "pending" && value !== "initiated" && value !== "in_progress") {
    log.warn(
      { event: "decentro_unknown_transaction_status", transaction_status: raw },
      "unrecognised Decentro transaction_status — treating as pending"
    );
  }
  return "pending";
}

/** Paise → the vendor's rupee float, fixed at two decimals. */
function toRupees(amountPaise: number): number {
  return Number((amountPaise / 100).toFixed(2));
}

/**
 * `Date` → the vendor's date string.
 *
 * TODO(decentro): confirm with provider (a) that `YYYY-MM-DD` is the accepted
 * format for `start_date` / `end_date` / `debit_date` — some Decentro APIs take
 * `DD-MM-YYYY` — and (b) whether the vendor interprets a bare date as IST. We
 * assume IST, which is the assumption the rest of the module already makes:
 * these `Date`s arrive as UTC-midnight IST calendar days from `istDateOnly`,
 * so slicing the ISO string yields the intended Indian calendar date with no
 * timezone reinterpretation. If the vendor turns out to read them as UTC, a
 * mandate starting "today" in IST would register a day early in the small
 * hours — visible as an off-by-one on the trial end date.
 */
function toWireDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Wire date → UTC-midnight `Date`, matching the module's date-only convention. */
function parseWireDate(raw: string | null): Date | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

/** IST is UTC+5:30, no DST. Same constant `npci-window.ts` works from. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

/**
 * The vendor's human-formatted timestamp → an absolute instant.
 *
 * Decentro answers a notification status read with `"Aug 06, 2026 05:10:55 PM"`
 * — 12-hour clock, month name, and NO TIMEZONE. It is read as IST, which is the
 * assumption the whole module already makes about this vendor's dates (see
 * `toWireDate`) and the only one consistent with a debit executed under NPCI's
 * Indian windows.
 *
 * Hand-parsed rather than handed to `new Date(...)`: that constructor's
 * behaviour on a non-ISO string is implementation-defined, and it would resolve
 * the missing zone against the HOST's — UTC in the container, something else on
 * a laptop. A money deadline that means two different things in two places is
 * the bug class `npci-window.ts` opens by refusing `Intl` for.
 *
 * Returns null on anything it does not fully recognise. The caller treats null as
 * "no better information than the cycle date", so a vendor format change
 * degrades to today's behaviour instead of producing a confidently wrong instant.
 */
function parseVendorTimestamp(raw: string | null): Date | null {
  if (!raw) return null;
  const match =
    /^([A-Za-z]{3})\w*\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i.exec(
      raw.trim()
    );
  if (!match) {
    log.warn(
      { event: "decentro_unparsed_debit_date", debit_date: raw },
      "could not read the provider's debit timestamp — falling back to the cycle date"
    );
    return null;
  }
  const [, mon, day, year, hour, minute, second, meridiem] = match;
  const month = MONTHS.indexOf((mon ?? "").toLowerCase());
  if (month < 0) return null;

  let hours = Number(hour);
  if (meridiem) {
    const pm = meridiem.toUpperCase() === "PM";
    // 12 AM is 00, 12 PM is 12 — the two cases a naive `+12` gets wrong.
    if (pm && hours !== 12) hours += 12;
    if (!pm && hours === 12) hours = 0;
  }

  const asIfUtc = Date.UTC(
    Number(year),
    month,
    Number(day),
    hours,
    Number(minute),
    Number(second)
  );
  if (Number.isNaN(asIfUtc)) return null;
  // The parts were IST wall-clock, so subtract the offset to land on the instant.
  return new Date(asIfUtc - IST_OFFSET_MS);
}
