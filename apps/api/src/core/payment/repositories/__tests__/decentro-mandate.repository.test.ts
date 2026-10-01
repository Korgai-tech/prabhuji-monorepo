import { describe, expect, test, vi } from "vitest";
import type { DecentroClient } from "../decentro.client.js";
import { PreDebitTooSoonError } from "../../mandate.provider.js";
import {
  DecentroMandateProvider,
  mapMandateState,
  maskPayerName,
  maskVpa,
} from "../decentro-mandate.repository.js";

/**
 * The adapter's wire format, asserted field by field.
 *
 * This is the only code in the repo that moves real money, and every bug in it
 * is expensive in a way unit tests elsewhere are not:
 *
 *   - `amount` in paise instead of rupees bills a hundredfold (NOTE: the value
 *     assertions that pinned this were loosened to shape-only in TAM-131 so the
 *     suite carries no plan price — a paise/rupee mix-up is no longer caught
 *     here);
 *   - the wrong JSON type on a behaviour flag is rejected outright, and the
 *     rejection surfaces to the user as "payment failed" with no clue why —
 *     this happened for real: the docs say these are `"true"`/`"false"`
 *     strings, and the live API requires booleans;
 *   - `is_downpayment: true` silently debits at registration, selling a
 *     "3-day free trial" that charges immediately;
 *   - an unrecognised status mapped optimistically to `active` gives away paid
 *     content on a state we do not understand.
 *
 * None of that is observable without a Decentro sandbox, so it is pinned here.
 */

/** Records what the adapter sent, and replays a canned response. */
function fakeClient(response: Record<string, unknown> = {}) {
  // Typed via the generic rather than unused named params, so `mock.calls` is
  // a tuple TypeScript can index — vi.fn() with no signature infers `[]`, and
  // every argument read becomes a type error.
  const post =
    vi.fn<(path: string, body: Record<string, unknown>, ctx?: unknown) => Promise<Record<string, unknown>>>(
      () => Promise.resolve(response)
    );
  const get =
    vi.fn<(path: string, query: Record<string, string>, ctx?: unknown) => Promise<Record<string, unknown>>>(
      () => Promise.resolve(response)
    );
  const client = {
    consumerUrn: "urn:test:consumer",
    post,
    get,
  } as unknown as DecentroClient;
  return { client, post, get };
}

/** The body the adapter POSTed on its first call. */
function sentBody(
  post: { mock: { calls: [string, Record<string, unknown>, unknown?][] } }
): Record<string, unknown> {
  const call = post.mock.calls[0];
  if (!call) throw new Error("adapter made no request");
  return call[1];
}

const CREATE_OK = {
  decentro_mandate_id: "dm_1",
  decentro_txn_id: "dt_1",
  mandate_status: "Pending",
  data: { authorization_url: "upi://mandate?pa=merchant@bank&am=299.00" },
};

function baseInput() {
  return {
    referenceId: "pj_mnd_abc",
    type: "upi" as const,
    mandateName: "Prabhuji VIP Membership",
    purposeMessage: "Prabhuji VIP Membership",
    amountPaise: 29900,
    initialDepositPaise: 0,
    currency: "INR",
    frequency: "MONTHLY",
    amountRule: "MAX",
    ruleType: "BEFORE",
    ruleValue: 28,
    startDate: new Date("2026-07-24T00:00:00.000Z"),
    endDate: new Date("2056-07-21T00:00:00.000Z"),
    expiryMinutes: 15,
  };
}

describe("createMandate wire body", () => {
  test("sends a positive numeric amount", async () => {
    const { client, post } = fakeClient(CREATE_OK);
    await new DecentroMandateProvider(client).createMandate(baseInput());

    const body = sentBody(post);
    // Shape only — the plan price is remote config and must not be pinned in a
    // unit test. This asserts the fields are present, numeric and non-zero; it
    // deliberately does NOT verify the value.
    expect(typeof body.amount).toBe("number");
    expect(body.amount as number).toBeGreaterThan(0);
    expect(typeof body.default_amount).toBe("number");
    expect(body.default_amount as number).toBeGreaterThan(0);
  });

  test("behaviour flags are JSON BOOLEANS, per the live sandbox", async () => {
    // This test previously asserted STRINGS, following Decentro's public docs
    // which describe these as "true"/"false". The real staging API rejects
    // that:
    //     400 Generate PSP URI is not of type boolean.
    //         Hint: generate_psp_uri (boolean).
    // Kept as an explicit assertion because the docs still say otherwise, so
    // the next person reading them may well "fix" it back.
    const { client, post } = fakeClient(CREATE_OK);
    await new DecentroMandateProvider(client).createMandate(baseInput());
    const body = sentBody(post);

    for (const key of [
      "is_downpayment",
      "is_first_txn_amount",
      "generate_psp_uri",
      "is_managed_by_decentro",
      "is_qr_requested",
      "is_block_funds",
      "is_revokable",
      "is_collect_request",
      "is_tpv",
    ]) {
      expect(typeof body[key], `${key} must be a boolean`).toBe("boolean");
    }
  });

  test("AS_PRESENTED registers with no recurrence rule at all", async () => {
    // THE prod-billing fix. A calendar frequency anchors the mandate to a
    // recurrence cycle which the registration deposit already consumes, so the
    // trial's debit date sits inside a spent cycle and Decentro refuses the
    // notification: `400 debit_date is invalid for MONTHLY frequency`. Ten of
    // eleven cycles died that way between 2026-08-03 and 2026-08-05 and not one
    // recurring payment has ever succeeded in prod.
    //
    // Two assertions, both load-bearing:
    //   - the wire value is LOWER CASE and unseparated. `.toUpperCase()` alone
    //     sent `AS_PRESENTED`, which Decentro does not know.
    //   - `rule_type`/`rule_value` are ABSENT, not null. A recurrence rule with
    //     no recurrence is a 400 on the field set.
    const { client, post } = fakeClient(CREATE_OK);
    await new DecentroMandateProvider(client).createMandate({
      ...baseInput(),
      frequency: "AS_PRESENTED",
    });
    const body = sentBody(post);

    expect(body.frequency).toBe("aspresented");
    expect(body).not.toHaveProperty("rule_type");
    expect(body).not.toHaveProperty("rule_value");
  });

  test("a calendar frequency carries rule_type alone, with no day number", async () => {
    // The other side of the same branch. `rule_type` with NO `rule_value`, the
    // shape crickmate-monorepo sends — `rule_value` does not exist anywhere in
    // that codebase. Asserting its ABSENCE is the point of the test: a day
    // number is what the previous shape carried, and re-adding one silently is
    // the regression this guards.
    //
    // Untested against the live gateway by either codebase: every live mandate
    // in both is as-presented, so this branch does not execute in production.
    const { client, post } = fakeClient(CREATE_OK);
    await new DecentroMandateProvider(client).createMandate({
      ...baseInput(),
      ruleType: "AFTER",
    });
    const body = sentBody(post);

    expect(body.frequency).toBe("monthly");
    expect(body.rule_type).toBe("AFTER");
    expect(body).not.toHaveProperty("rule_value");
  });

  test("an unknown frequency falls back to as-presented, never monthly", async () => {
    // The fallback is a safety choice, not a formality. `monthly` is the exact
    // unbillable shape this change removes — a mandate registered under it has
    // every notification refused — so a typo or a future plan config must not
    // land there. As-presented bills correctly whatever the plan meant, since
    // our own scheduler owns the cadence and never reads this field back.
    const { client, post } = fakeClient(CREATE_OK);
    await new DecentroMandateProvider(client).createMandate({
      ...baseInput(),
      frequency: "QUARTERLY_TYPO",
    });
    const body = sentBody(post);

    expect(body.frequency).toBe("aspresented");
    expect(body).not.toHaveProperty("rule_type");
  });

  test("a plan with no deposit moves no money at registration", async () => {
    const { client, post } = fakeClient(CREATE_OK);
    await new DecentroMandateProvider(client).createMandate(baseInput());
    const body = sentBody(post);

    expect(body.is_first_txn_amount).toBe(false);
    // With nothing to charge up front, default_amount falls back to the plan
    // price — the same figure every cycle then debits.
    expect(body.default_amount).toBe(299);
    expect(body.start_date).toBe("2026-07-24");
  });

  test("a deposit is charged via is_first_txn_amount, NOT is_downpayment", async () => {
    // The two are mutually exclusive at the provider ("mandate creation will
    // fail if both flags are enabled"), and they are not interchangeable: a
    // downpayment is a SEPARATE auto-debit raised within 5 minutes of
    // registration, with its own downpayment_reference_id to reconcile. We take
    // the first debit of this mandate instead, which is what the ledger's
    // `initial_deposit` row already models.
    const { client, post } = fakeClient(CREATE_OK);
    await new DecentroMandateProvider(client).createMandate({
      ...baseInput(),
      initialDepositPaise: 200,
    });
    const body = sentBody(post);

    expect(body.is_first_txn_amount).toBe(true);
    expect(body.is_downpayment).toBe(false);
  });

  test("default_amount carries the DEPOSIT while amount stays the cycle cap", async () => {
    // The headline of the whole arrangement. `amount` is the ceiling the
    // mandate authorises; `default_amount` is only the FIRST debit, because
    // every later cycle names its own figure in the pre-debit notification.
    // Sending the plan price here instead would charge ₹299 at registration.
    const { client, post } = fakeClient(CREATE_OK);
    await new DecentroMandateProvider(client).createMandate({
      ...baseInput(),
      amountPaise: 29900,
      initialDepositPaise: 200,
    });
    const body = sentBody(post);

    expect(body.default_amount).toBe(2);
    expect(body.amount).toBe(299);
  });

  test("a deposit under a non-MAX rule is REFUSED, not silently dropped", async () => {
    // `default_amount` is only accepted under MAX, so a deposit on a FIXED plan
    // has no field to travel in. Registering anyway would authorise the mandate
    // while the ledger recorded a charge that never happened.
    const { client } = fakeClient(CREATE_OK);
    await expect(
      new DecentroMandateProvider(client).createMandate({
        ...baseInput(),
        amountRule: "EXACT",
        initialDepositPaise: 200,
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "PLAN_NOT_PURCHASABLE",
    });
  });

  test("uses the INTENT flow — NPCI barred collect for merchants like us", async () => {
    const { client, post } = fakeClient(CREATE_OK);
    await new DecentroMandateProvider(client).createMandate(baseInput());
    const body = sentBody(post);

    expect(body.is_collect_request).toBe(false);
    // Without this the response carries no upi:// link to approve at.
    expect(body.generate_psp_uri).toBe(true);
  });

  test("dates are YYYY-MM-DD", async () => {
    const { client, post } = fakeClient(CREATE_OK);
    await new DecentroMandateProvider(client).createMandate(baseInput());
    const body = sentBody(post);

    expect(body.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("default_amount is omitted when the rule is not MAX", async () => {
    const { client, post } = fakeClient(CREATE_OK);
    await new DecentroMandateProvider(client).createMandate({
      ...baseInput(),
      amountRule: "EXACT",
    });
    const body = sentBody(post);

    expect(body.amount_rule).toBe("EXACT");
    expect(body).not.toHaveProperty("default_amount");
  });

  test("a response with no approval link THROWS rather than returning an empty url", async () => {
    // A mandate may exist at the provider; returning a blank URL would strand
    // the user on a dead CTA instead of letting the service reconcile.
    const { client } = fakeClient({ mandate_status: "Pending" });
    await expect(
      new DecentroMandateProvider(client).createMandate(baseInput())
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe("mapMandateState", () => {
  test.each([
    ["Active", "active"],
    ["Pending", "pending"],
    ["Rejected", "rejected"],
    ["Expired", "expired"],
    ["Paused", "paused"],
    ["Failed", "failed"],
    ["Completed", "completed"],
    ["Revoked", "revoked"],
    // Two vendor spellings, one end state: the mandate is dead either way.
    ["Cancelled", "revoked"],
  ])("%s → %s", (raw, expected) => {
    expect(mapMandateState(raw)).toBe(expected);
  });

  test("is case-insensitive — callbacks have been seen shouting", () => {
    expect(mapMandateState("ACTIVE")).toBe("active");
    expect(mapMandateState("  active  ")).toBe("active");
  });

  test("an UNKNOWN status maps to pending, never active", () => {
    // The asymmetry that matters: `pending` costs one extra poll; `active`
    // gives away paid content on a state we do not understand, and is
    // unrecoverable once the user has it.
    expect(mapMandateState("SomethingNew")).toBe("pending");
    expect(mapMandateState("")).toBe("pending");
    expect(mapMandateState(null)).toBe("pending");
  });
});

describe("payer masking at the boundary", () => {
  test("a VPA keeps only enough to be recognisable", () => {
    const masked = maskVpa("ramesh.kumar@okhdfcbank");
    expect(masked).not.toBeNull();
    // The user must be able to tell which account they authorised with...
    expect(masked).toContain("@okhdfcbank");
    // ...without us retaining the handle itself.
    expect(masked).not.toContain("ramesh.kumar");
  });

  test("a payer name is reduced to initials", () => {
    const masked = maskPayerName("Ramesh Kumar");
    expect(masked).not.toBeNull();
    expect(masked).not.toContain("Ramesh");
    expect(masked).not.toContain("Kumar");
  });

  test("nulls pass through", () => {
    expect(maskVpa(null)).toBeNull();
    expect(maskPayerName(null)).toBeNull();
  });

  test("the full VPA never leaves getMandateStatus", async () => {
    const { client } = fakeClient({
      data: {
        mandate_status: "Active",
        payer_vpa: "ramesh.kumar@okhdfcbank",
        payer_name: "Ramesh Kumar",
      },
    });
    const result = await new DecentroMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: "dm_1",
    });

    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain("ramesh.kumar");
    expect(serialised).not.toContain("Ramesh Kumar");
    expect(result.state).toBe("active");
  });
});

describe("pre-debit notification", () => {
  // THE regression test for TAM-141. This asserted the exact opposite — that a
  // response without a sequence id THROWS — and that assumption is what made every
  // Decentro cycle fail at notify. Decentro's notify is ASYNCHRONOUS: it answers
  // PENDING with no id and issues one later, by callback. A missing id is the
  // normal case, not an error.
  test("no sequence id is ACCEPTED as pending — the notify API is asynchronous", async () => {
    const { client } = fakeClient({
      data: { notification_detail: { notification_status: "PENDING" } },
    });
    const res = await new DecentroMandateProvider(client).notifyPreDebit({
      referenceId: "pj_pdn_abc",
      notificationRef: "pj_pdn_wire",
      providerMandateId: "dm_1",
      amountPaise: 29900,
      currency: "INR",
      cycleDate: new Date("2026-08-24T00:00:00.000Z"),
      notBefore: null,
    });

    expect(res.presentationSequenceId).toBeNull();
    expect(res.status).toBe("sent");
  });

  // Pins the NESTING, which is the other half of why the id was never found: it
  // lives under `notification_detail`, and the old code read the top level of
  // `data`. A response shaped the old way must still yield null, or a future
  // "simplification" back to a flat read would pass.
  test("a sequence id at the TOP level of data is not read — it must be nested", async () => {
    const { client } = fakeClient({ data: { presentation_sequence_id: "seq_1" } });
    const res = await new DecentroMandateProvider(client).notifyPreDebit({
      referenceId: "pj_pdn_abc",
      notificationRef: "pj_pdn_wire",
      providerMandateId: "dm_1",
      amountPaise: 29900,
      currency: "INR",
      cycleDate: new Date("2026-08-24T00:00:00.000Z"),
      notBefore: null,
    });

    expect(res.presentationSequenceId).toBeNull();
  });

  test("a nested sequence id makes the notification addressable", async () => {
    const { client } = fakeClient({
      data: {
        notification_detail: {
          notification_status: "SUCCESS",
          presentation_sequence_id: "seq_1",
        },
      },
    });
    const res = await new DecentroMandateProvider(client).notifyPreDebit({
      referenceId: "pj_pdn_abc",
      notificationRef: "pj_pdn_wire",
      providerMandateId: "dm_1",
      amountPaise: 29900,
      currency: "INR",
      cycleDate: new Date("2026-08-24T00:00:00.000Z"),
      notBefore: null,
    });

    expect(res.presentationSequenceId).toBe("seq_1");
    expect(res.status).toBe("accepted");
  });

  // A 200 carrying `api_status: FAILURE` is a FAILURE. The client gates on
  // `response.ok` alone, so this used to read as success; the adapter then found
  // no fields and fabricated a pending outcome, leaving a rejected debit unsettled
  // forever.
  test("a 200 with api_status FAILURE is rejected, not read as success", async () => {
    const { client } = fakeClient({
      api_status: "FAILURE",
      message: "no",
      response_key: "error_something_else",
    });
    await expect(
      new DecentroMandateProvider(client).notifyPreDebit({
        referenceId: "pj_pdn_abc",
        notificationRef: "pj_pdn_wire",
        providerMandateId: "dm_1",
        amountPaise: 29900,
        currency: "INR",
        cycleDate: new Date("2026-08-24T00:00:00.000Z"),
        notBefore: null,
      })
    ).rejects.toThrow();
  });

  /**
   * `error_invalid_debit_date` is an UMBRELLA: the same key ships a recoverable
   * window rejection and a terminal cadence one. Deferring the terminal case
   * retries forever; failing the recoverable case writes off a cycle that would
   * have worked one tick later. Both variants are pinned.
   */
  describe("debit-date rejections", () => {
    const notify = (client: DecentroClient) =>
      new DecentroMandateProvider(client).notifyPreDebit({
        referenceId: "pj_pdn_abc",
        notificationRef: "pj_pdn_wire",
        providerMandateId: "dm_1",
        amountPaise: 29900,
        currency: "INR",
        cycleDate: new Date("2026-08-24T00:00:00.000Z"),
        notBefore: null,
      });

    test("the 48h ceiling DEFERS", async () => {
      const { client } = fakeClient({
        api_status: "FAILURE",
        message: "Debit date should not be more than 48 hours ahead of the current date.",
        response_key: "error_invalid_debit_date",
      });
      await expect(notify(client)).rejects.toBeInstanceOf(PreDebitTooSoonError);
    });

    test("a same-day debit_date DEFERS", async () => {
      const { client } = fakeClient({
        api_status: "FAILURE",
        message: "Debit Date cannot be equal to the Present Date.",
        response_key: "error_debit_date_equal_to_present_date",
      });
      await expect(notify(client)).rejects.toBeInstanceOf(PreDebitTooSoonError);
    });

    test("the FREQUENCY variant stays terminal", async () => {
      // The message prod died on for five days. No date will ever satisfy a
      // mandate whose cadence already consumed the cycle, so deferring would
      // retry until the debit date passed and the cycle vanished.
      const { client } = fakeClient({
        api_status: "FAILURE",
        message: "debit_date is invalid for MONTHLY frequency.",
        response_key: "error_invalid_debit_date",
      });
      await expect(notify(client)).rejects.not.toBeInstanceOf(PreDebitTooSoonError);
      await expect(notify(client)).rejects.toThrow(/frequency/i);
    });
  });

  // The body is EXACTLY four fields. Asserted as a whole key set rather than
  // field-by-field so that an accidentally-restored `consumer_urn` or `currency`
  // FAILS — neither is in this endpoint's contract, and Decentro validates field
  // sets (its `generate_psp_uri` boolean rejection proves it).
  test("sends exactly reference_id, mandate id, amount and debit_date", async () => {
    const { client, post } = fakeClient({
      data: {
        notification_detail: {
          notification_status: "SUCCESS",
          presentation_sequence_id: "seq_1",
        },
      },
    });
    const res = await new DecentroMandateProvider(client).notifyPreDebit({
      referenceId: "pj_pdn_abc",
      notificationRef: "pj_pdn_wire",
      providerMandateId: "dm_1",
      amountPaise: 29900,
      currency: "INR",
      cycleDate: new Date("2026-08-24T00:00:00.000Z"),
      notBefore: null,
    });

    const body = sentBody(post);
    expect(Object.keys(body).sort()).toEqual([
      "amount",
      "debit_date",
      "decentro_mandate_id",
      "reference_id",
    ]);
    // The wire `reference_id` comes from `notificationRef` — fresh per attempt.
    // NOT the mandate's `referenceId`, which is constant for its whole life and
    // which Decentro would refuse as a duplicate from cycle 2 onward.
    expect(body.reference_id).toBe("pj_pdn_wire");
    expect(body.reference_id).not.toBe("pj_pdn_abc");
    // Shape only — see the createMandate amount test.
    expect(typeof body.amount).toBe("number");
    expect(body.amount as number).toBeGreaterThan(0);
    expect(body.debit_date).toBe("2026-08-24");
    expect(res.presentationSequenceId).toBe("seq_1");
  });
});

describe("getDebitStatus", () => {
  function statusInput() {
    return {
      referenceId: "pj_mnd_abc",
      providerMandateId: "dm_1",
      presentationSequenceId: "seq_1",
      cycleDate: new Date("2026-08-24T00:00:00.000Z"),
      notBefore: null,
    };
  }

  // EXACTLY ONE identifier, and the corrected path. This asserted the opposite —
  // five parameters, on the theory that a wrong name degrades to a narrower lookup
  // — but Decentro's status endpoints take a single identifier, so several is a
  // different request, not belt-and-braces. The path also had a spurious
  // `/mandate` segment: a presentation is its own resource.
  test("identifies the debit by ONE parameter, on the presentation-status path", async () => {
    const { client, get } = fakeClient({
      data: { presentation_detail: { status: "SUCCESS" } },
    });
    await new DecentroMandateProvider(client).getDebitStatus(statusInput());

    const [path, query] = get.mock.calls[0];
    expect(path).toBe("/v3/payments/upi/autopay/presentation/status");
    expect(query).toEqual({ presentation_sequence_id: "seq_1" });
  });

  test("reads a settled debit's reconciliation trail", async () => {
    const { client } = fakeClient({
      data: {
        transaction_status: "SUCCESS",
        decentro_txn_id: "dt_9",
        bank_reference_number: "brn_9",
        npci_txn_id: "npci_9",
      },
    });
    const res = await new DecentroMandateProvider(client).getDebitStatus(
      statusInput()
    );

    expect(res.outcome).toBe("succeeded");
    expect(res.providerTxnId).toBe("dt_9");
    // What a disputed charge is answered from — it must survive the adapter.
    expect(res.bankReferenceNumber).toBe("brn_9");
    expect(res.npciTransactionId).toBe("npci_9");
  });

  test("a declined debit carries its failure code through", async () => {
    const { client } = fakeClient({
      data: {
        transaction_status: "FAILURE",
        error_code: "INSUFFICIENT_FUNDS",
        error_message: "insufficient balance",
      },
    });
    const res = await new DecentroMandateProvider(client).getDebitStatus(
      statusInput()
    );

    expect(res.outcome).toBe("failed");
    expect(res.failureCode).toBe("INSUFFICIENT_FUNDS");
  });

  test("an unrecognised status is pending, never succeeded", async () => {
    // The asymmetry is the point. Reading an unknown status as `succeeded`
    // grants an unpaid month and is unrecoverable once the user has the
    // content; reading it as `failed` duns someone who actually paid. `pending`
    // costs one more poll and is wrong in neither direction.
    const { client } = fakeClient({ data: { transaction_status: "IN_REVIEW" } });
    const res = await new DecentroMandateProvider(client).getDebitStatus(
      statusInput()
    );
    expect(res.outcome).toBe("pending");
  });

  test("a response with no status at all is pending", async () => {
    const { client } = fakeClient({ data: {} });
    const res = await new DecentroMandateProvider(client).getDebitStatus(
      statusInput()
    );
    expect(res.outcome).toBe("pending");
  });
});

describe("transport discipline", () => {
  test("every mutating call goes through post(), which never retries", async () => {
    // The retry policy is structural — `post()` has no retry path at all — so
    // this asserts the adapter never routes a mutation through `get()`, which
    // does retry. A retried presentation is a duplicate charge.
    const { client, post, get } = fakeClient({
      data: { presentation_sequence_id: "seq_1" },
      mandate_status: "Pending",
      decentro_mandate_id: "dm_1",
    });
    const provider = new DecentroMandateProvider(client);

    await provider.notifyPreDebit({
      referenceId: "r",
      notificationRef: "pj_pdn_wire",
      providerMandateId: "dm_1",
      amountPaise: 29900,
      currency: "INR",
      cycleDate: new Date("2026-08-24T00:00:00.000Z"),
      notBefore: null,
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();

    // Status is the one read, and the only thing allowed to retry.
    await provider.getMandateStatus({
      referenceId: "r",
      providerMandateId: "dm_1",
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);

    // So is the debit status read. It must never reach `post()`: a settlement
    // poll that mutated anything would turn the straggler sweep — which runs
    // on every tick — into a repeated write against a live debit.
    await provider.getDebitStatus({
      referenceId: "r",
      providerMandateId: "dm_1",
      presentationSequenceId: "seq_1",
      cycleDate: new Date("2026-08-24T00:00:00.000Z"),
    });
    expect(get).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledTimes(1);
  });
});

/**
 * Every status endpoint takes EXACTLY ONE identifier.
 *
 * The adapter used to send several at once — `reference_id` plus `consumer_urn`
 * plus the mandate id plus the sequence id plus the debit date — on the theory,
 * stated in its own TODO, that a wrong parameter name would degrade to a narrower
 * lookup. It does not: Decentro's status endpoints key on a single identifier, so
 * several is a different request, not belt-and-braces. Verified against the working
 * reference implementation, which builds each of these with a first-present-wins
 * helper.
 */
describe("status reads send one identifier", () => {
  test("getMandateStatus prefers the provider's mandate id", async () => {
    const { client, get } = fakeClient({ data: { mandate_status: "ACTIVE" } });
    await new DecentroMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: "dm_1",
    });

    const [path, query] = get.mock.calls[0];
    expect(path).toBe("/v3/payments/upi/autopay/mandate/status");
    expect(query).toEqual({ decentro_mandate_id: "dm_1" });
  });

  test("getMandateStatus falls back to our reference before we hold their id", async () => {
    const { client, get } = fakeClient({ data: { mandate_status: "ACTIVE" } });
    await new DecentroMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: null,
    });

    expect(get.mock.calls[0][1]).toEqual({ reference_id: "pj_mnd_abc" });
  });
});

/**
 * The notification status read — the endpoint whose ABSENCE made an asynchronous
 * notify unresolvable, so a notification that came back without a sequence id had
 * no path to ever becoming presentable.
 */
describe("getPreDebitStatus", () => {
  test("uses the notification-status path, preferring the sequence id", async () => {
    const { client, get } = fakeClient({
      data: {
        notification_detail: {
          notification_status: "SUCCESS",
          presentation_sequence_id: "seq_1",
        },
      },
    });
    const res = await new DecentroMandateProvider(client).getPreDebitStatus({
      referenceId: "pj_pdn_abc",
      presentationSequenceId: "seq_1",
    });

    const [path, query] = get.mock.calls[0];
    expect(path).toBe("/v3/payments/upi/autopay/notification/status");
    expect(query).toEqual({ presentation_sequence_id: "seq_1" });
    expect(res.status).toBe("accepted");
    expect(res.presentationSequenceId).toBe("seq_1");
  });

  test("falls back to our reference when no sequence id is held yet", async () => {
    // The case that matters: this is precisely the state a notification is in when
    // it needs polling, so keying on the id we do not have would be useless.
    const { client, get } = fakeClient({
      data: { notification_detail: { notification_status: "PENDING" } },
    });
    const res = await new DecentroMandateProvider(client).getPreDebitStatus({
      referenceId: "pj_pdn_abc",
      presentationSequenceId: null,
    });

    expect(get.mock.calls[0][1]).toEqual({ reference_id: "pj_pdn_abc" });
    expect(res.status).toBe("sent");
    expect(res.presentationSequenceId).toBeNull();
  });

  test("an unrecognised notification_status is FAILED, not pending", async () => {
    // The opposite default from `mapDebitOutcome`, deliberately: a notification is
    // upstream of any money movement, so giving up on one costs a retry. What makes
    // it safe is that `PdnRepository.rearm` refuses to act on a row that already
    // holds a sequence id, so a spurious failure cannot cancel a valid notification.
    const { client } = fakeClient({
      data: { notification_detail: { notification_status: "SOMETHING_NEW" } },
    });
    const res = await new DecentroMandateProvider(client).getPreDebitStatus({
      referenceId: "pj_pdn_abc",
      presentationSequenceId: null,
    });

    expect(res.status).toBe("failed");
  });

  test("reads the provider's own debit instant as IST", async () => {
    // Decentro reports the moment it will actually accept a presentation, and it
    // is NOT the cycle date's midnight — NPCI's 24h notice runs from when the
    // payer was told. Observed live: a notice raised on the 5th came back
    // "Aug 06, 2026 05:10:55 PM". Twelve-hour clock, month name, NO TIMEZONE;
    // read as IST like every other date this vendor sends.
    const { client } = fakeClient({
      data: {
        notification_detail: {
          notification_status: "SUCCESS",
          presentation_sequence_id: "seq_1",
          debit_date: "Aug 06, 2026 05:10:55 PM",
        },
      },
    });
    const res = await new DecentroMandateProvider(client).getPreDebitStatus({
      referenceId: "pj_pdn_abc",
      presentationSequenceId: "seq_1",
    });

    // 17:10:55 IST == 11:40:55 UTC.
    expect(res.scheduledDebitAt?.toISOString()).toBe("2026-08-06T11:40:55.000Z");
  });

  test("an unreadable debit instant is null, never a guess", async () => {
    // A vendor format change must degrade to the cycle-date gate, not produce a
    // confidently wrong deadline that delays every debit.
    const { client } = fakeClient({
      data: {
        notification_detail: {
          notification_status: "SUCCESS",
          presentation_sequence_id: "seq_1",
          debit_date: "sometime next Tuesday",
        },
      },
    });
    const res = await new DecentroMandateProvider(client).getPreDebitStatus({
      referenceId: "pj_pdn_abc",
      presentationSequenceId: "seq_1",
    });

    expect(res.scheduledDebitAt).toBeNull();
  });

  test("midnight and noon are not confused", async () => {
    // 12 AM is 00 and 12 PM is 12 — the two cases a naive `+12` inverts, and both
    // land a debit deadline half a day out.
    const { client } = fakeClient({
      data: {
        notification_detail: {
          notification_status: "SUCCESS",
          presentation_sequence_id: "seq_1",
          debit_date: "Aug 06, 2026 12:00:00 AM",
        },
      },
    });
    const res = await new DecentroMandateProvider(client).getPreDebitStatus({
      referenceId: "pj_pdn_abc",
      presentationSequenceId: "seq_1",
    });

    // 00:00 IST on the 6th == 18:30 UTC on the 5th.
    expect(res.scheduledDebitAt?.toISOString()).toBe("2026-08-05T18:30:00.000Z");
  });
});

/**
 * The presentation body is EXACTLY three fields, all three mandatory.
 *
 * `purpose_message` was ABSENT, which rejects the call on a missing required field
 * — so every presentation this adapter would ever have made was a 400. The four
 * fields removed alongside it are not in the contract: a presentation is addressed
 * purely by its sequence id, and the amount was FROZEN when the notification was
 * raised, so re-sending it is at best redundant and at worst a mismatch rejection.
 */
describe("presentDebit wire body", () => {
  function presentInput() {
    return {
      // The MANDATE's reference identifies the subscription; the per-attempt wire
      // reference is separate, because Decentro rejects a reused one while Cashfree
      // and the stub still need the mandate's.
      referenceId: "pj_mnd_abc",
      presentationRef: "pj_prs_abc",
      attemptNo: 1,
      providerMandateId: "dm_1",
      presentationSequenceId: "seq_1",
      amountPaise: 29900,
      currency: "INR",
      cycleDate: new Date("2026-08-24T00:00:00.000Z"),
      notBefore: null,
      purposeMessage: "Prabhuji VIP renewal 2026-08-24",
    };
  }

  test("sends exactly reference_id, presentation_sequence_id and purpose_message", async () => {
    const { client, post } = fakeClient({ data: { presentation_status: "SUCCESS" } });
    await new DecentroMandateProvider(client).presentDebit(presentInput());

    const body = sentBody(post);
    expect(Object.keys(body).sort()).toEqual([
      "presentation_sequence_id",
      "purpose_message",
      "reference_id",
    ]);
    // THIS attempt's reference, not the mandate's — Decentro rejects a reused one,
    // so a re-presentation after a retry must carry a fresh value.
    expect(body.reference_id).toBe("pj_prs_abc");
    expect(body.purpose_message).toBe("Prabhuji VIP renewal 2026-08-24");
  });

  test("reads the execute outcome FLAT under data", async () => {
    // The execute response is flat; the status READ nests under
    // `presentation_detail`. Reading the wrong shape yields a null status that maps
    // to a permanent `pending`, so a settled debit would never be recorded.
    const { client } = fakeClient({
      data: {
        presentation_status: "SUCCESS",
        npci_txn_id: "npci_1",
        decentro_txn_id: "dt_1",
      },
    });
    const res = await new DecentroMandateProvider(client).presentDebit(presentInput());

    expect(res.outcome).toBe("succeeded");
    expect(res.npciTransactionId).toBe("npci_1");
  });

  test("a 200 with api_status FAILURE does not read as a successful debit", async () => {
    const { client } = fakeClient({
      api_status: "FAILURE",
      message: "declined upstream",
      response_key: "error_something",
    });
    await expect(
      new DecentroMandateProvider(client).presentDebit(presentInput())
    ).rejects.toThrow();
  });
});

describe("revokeMandate", () => {
  const input = { referenceId: "pj_mnd_1", providerMandateId: "dm_1" };

  test("POSTs REVOKE to the manage endpoint", async () => {
    const { client, post } = fakeClient({ api_status: "SUCCESS" });
    await new DecentroMandateProvider(client).revokeMandate(input);

    const [path, body] = post.mock.calls[0];
    expect(path).toContain("mandate/manage");
    expect(body).toMatchObject({
      reference_id: "pj_mnd_1",
      decentro_mandate_id: "dm_1",
      action: "REVOKE",
    });
  });

  test("a 200 with api_status FAILURE is rejected, not read as a successful revoke", async () => {
    // The regression this guards is the expensive one. Revoke used to call the
    // bare client, which gates on `response.ok` alone — so Decentro's
    // application-level failure-inside-a-200 read as success, and the caller
    // then marked the mandate `revoked` and ended the subscription while it
    // stayed live and debitable at NPCI. The user is told they cancelled and
    // is charged again next cycle.
    const { client } = fakeClient({
      api_status: "FAILURE",
      message: "mandate not found",
      response_key: "error_something",
    });
    await expect(
      new DecentroMandateProvider(client).revokeMandate(input)
    ).rejects.toThrow();
  });
});
