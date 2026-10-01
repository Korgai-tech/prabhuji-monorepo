import { describe, expect, test } from "vitest";
import {
  FAILURE_SUB_CODE,
  classifyFailure,
  isRecoverableByTopUp,
} from "../failure-sub-code.js";

/**
 * The mapping that decides whether we are allowed to tell a real person to top
 * up their bank account (TAM-186).
 *
 * Table-driven on purpose: the value of this module is entirely in its edges,
 * and the edge that matters most is the one where we DON'T classify. A wrong
 * `INSUFFICIENT_FUNDS` sends a push notification giving wrong advice to someone
 * who has no per-notification way to opt out of it.
 */
describe("classifyFailure — provider reason to our vocabulary", () => {
  const cases: Array<[string, string, string]> = [
    // Razorpay's lowercase snake_case
    ["razorpay", "insufficient_funds", FAILURE_SUB_CODE.INSUFFICIENT_FUNDS],
    ["razorpay", "payment_insufficient_balance", FAILURE_SUB_CODE.INSUFFICIENT_FUNDS],
    // Decentro / Cashfree upper-case
    ["decentro", "INSUFFICIENT_BALANCE", FAILURE_SUB_CODE.INSUFFICIENT_FUNDS],
    ["cashfree", "LOW BALANCE", FAILURE_SUB_CODE.INSUFFICIENT_FUNDS],

    ["razorpay", "payment_not_approved", FAILURE_SUB_CODE.USER_DID_NOT_APPROVE],
    ["razorpay", "user_declined", FAILURE_SUB_CODE.USER_DID_NOT_APPROVE],
    ["decentro", "COLLECT_EXPIRED", FAILURE_SUB_CODE.USER_DID_NOT_APPROVE],
    ["generic", "request timed out", FAILURE_SUB_CODE.USER_DID_NOT_APPROVE],

    ["razorpay", "payment_not_allowed", FAILURE_SUB_CODE.ACCOUNT_NOT_PERMITTED],
    ["decentro", "ACCOUNT_DORMANT", FAILURE_SUB_CODE.ACCOUNT_NOT_PERMITTED],
    ["decentro", "ACCOUNT_BLOCKED", FAILURE_SUB_CODE.ACCOUNT_NOT_PERMITTED],

    ["razorpay", "issuer_down", FAILURE_SUB_CODE.BANK_OR_GATEWAY_ERROR],
    ["decentro", "NPCI_TECHNICAL_ERROR", FAILURE_SUB_CODE.BANK_OR_GATEWAY_ERROR],
    ["generic", "gateway unavailable", FAILURE_SUB_CODE.BANK_OR_GATEWAY_ERROR],
  ];

  test.each(cases)("%s: %s -> %s", (_provider, reason, expected) => {
    expect(classifyFailure([reason])).toBe(expected);
  });

  test("the FIRST matching reason wins, so adapters order finest-first", () => {
    // Real Razorpay payloads carry both: `error_reason` says why, `error_code`
    // is the 3-value bucket. The adapter passes the finer one first and this is
    // what makes that ordering load-bearing rather than cosmetic.
    expect(classifyFailure(["insufficient_funds", "GATEWAY_ERROR"])).toBe(
      FAILURE_SUB_CODE.INSUFFICIENT_FUNDS
    );
  });

  test("null and empty reasons are skipped, not treated as a match", () => {
    expect(classifyFailure([null, undefined, "", "insufficient_funds"])).toBe(
      FAILURE_SUB_CODE.INSUFFICIENT_FUNDS
    );
  });

  describe("UNCLASSIFIED rather than a guess", () => {
    test("nothing recognisable", () => {
      expect(classifyFailure(["WEIRD_VENDOR_STRING"])).toBe(
        FAILURE_SUB_CODE.UNCLASSIFIED
      );
    });

    test("the provider sent us nothing at all", () => {
      expect(classifyFailure([])).toBe(FAILURE_SUB_CODE.UNCLASSIFIED);
      expect(classifyFailure([null, undefined])).toBe(
        FAILURE_SUB_CODE.UNCLASSIFIED
      );
    });

    test("GATEWAY_ERROR alone stays UNCLASSIFIED — it is the bucket, not a reason", () => {
      // The whole defect this column exists to fix. If `GATEWAY_ERROR` ever
      // resolved to a real sub-code, 91.9% of declines would be mislabelled in
      // one stroke and the notification would fire at all of them.
      expect(classifyFailure(["GATEWAY_ERROR"])).toBe(
        FAILURE_SUB_CODE.UNCLASSIFIED
      );
      expect(classifyFailure(["BAD_REQUEST_ERROR"])).toBe(
        FAILURE_SUB_CODE.UNCLASSIFIED
      );
    });
  });
});

/**
 * The gate on an outbound message to a real person. Asserted separately from
 * the mapping because the cost of a false positive here is not a wrong row in
 * a dashboard — it is wrong advice, unsolicited, with no way to opt out.
 */
describe("isRecoverableByTopUp — who may be told to top up", () => {
  test("only INSUFFICIENT_FUNDS", () => {
    expect(isRecoverableByTopUp(FAILURE_SUB_CODE.INSUFFICIENT_FUNDS)).toBe(true);
  });

  test.each([
    FAILURE_SUB_CODE.USER_DID_NOT_APPROVE,
    FAILURE_SUB_CODE.ACCOUNT_NOT_PERMITTED,
    FAILURE_SUB_CODE.BANK_OR_GATEWAY_ERROR,
    FAILURE_SUB_CODE.PDN_ABANDONED,
    FAILURE_SUB_CODE.UNCLASSIFIED,
  ])("never %s", (subCode) => {
    expect(isRecoverableByTopUp(subCode)).toBe(false);
  });

  test("never on a row that predates the column", () => {
    // Rows written before the column shipped are NULL for good — history is not
    // backfilled. Those users must not be messaged on the strength of an absent
    // value.
    expect(isRecoverableByTopUp(null)).toBe(false);
  });
});
