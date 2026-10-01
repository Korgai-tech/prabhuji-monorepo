import { describe, expect, test } from "vitest";
import {
  clientIpFromForwardedFor,
  ipAllowed,
  parseCidrList,
  tokensMatch,
} from "../callback-auth.js";
import { buildDedupeKey, extractRef } from "../callback.service.js";

/**
 * Callback authentication is the only thing standing between the public
 * internet and a write endpoint on our payment module. It is a weak control by
 * design — Decentro's India v3 stack offers no HMAC — which makes it more
 * important, not less, that the parts we do control are exactly right.
 */

describe("tokensMatch", () => {
  const token = "a".repeat(48);

  test("accepts the exact token", () => {
    expect(tokensMatch(token, token)).toBe(true);
  });

  test("rejects a wrong token of the same length", () => {
    expect(tokensMatch("b".repeat(48), token)).toBe(false);
  });

  test("rejects a missing token without throwing", () => {
    expect(tokensMatch(undefined, token)).toBe(false);
    expect(tokensMatch("", token)).toBe(false);
  });

  test("rejects a length mismatch WITHOUT throwing", () => {
    // `timingSafeEqual` throws on unequal buffer lengths. If that escaped, a
    // one-character header would produce a 500 instead of a 401 — turning the
    // auth check into a trivially-triggered error path.
    expect(() => tokensMatch("short", token)).not.toThrow();
    expect(tokensMatch("short", token)).toBe(false);
    expect(tokensMatch(token + "x", token)).toBe(false);
  });

  test("a correct prefix is not enough", () => {
    expect(tokensMatch("a".repeat(47) + "b", token)).toBe(false);
  });
});

describe("clientIpFromForwardedFor", () => {
  test("takes the LAST hop, not the first", () => {
    // The left-most entry is whatever the CLIENT sent. Trusting it lets anyone
    // forge their source address and walk straight through an IP allowlist;
    // only hops our own infrastructure appended can be believed.
    expect(clientIpFromForwardedFor("1.2.3.4, 10.0.0.1, 52.66.1.1")).toBe(
      "52.66.1.1"
    );
  });

  test("handles a single hop", () => {
    expect(clientIpFromForwardedFor("52.66.1.1")).toBe("52.66.1.1");
  });

  test("returns null with no header so the caller can fall back to the socket", () => {
    expect(clientIpFromForwardedFor(undefined)).toBeNull();
    expect(clientIpFromForwardedFor("")).toBeNull();
  });

  test("tolerates sloppy whitespace", () => {
    expect(clientIpFromForwardedFor("1.2.3.4 ,  52.66.1.1 ")).toBe("52.66.1.1");
  });
});

describe("ipAllowed", () => {
  test("an EMPTY allowlist allows everything", () => {
    // Deliberate: the provider publishes no stable egress ranges, and an
    // allowlist that silently drops every callback is a worse outage than not
    // having one. The composition root warns at boot so it stays visible.
    expect(ipAllowed("52.66.1.1", [])).toBe(true);
    expect(ipAllowed(null, [])).toBe(true);
  });

  test("exact match with an implicit /32", () => {
    expect(ipAllowed("52.66.1.1", ["52.66.1.1"])).toBe(true);
    expect(ipAllowed("52.66.1.2", ["52.66.1.1"])).toBe(false);
  });

  test("matches inside a CIDR block and rejects outside it", () => {
    expect(ipAllowed("52.66.1.200", ["52.66.1.0/24"])).toBe(true);
    expect(ipAllowed("52.66.2.1", ["52.66.1.0/24"])).toBe(false);
  });

  test("handles a wide mask without sign-extension breaking it", () => {
    // JS bitwise ops yield signed int32, so a /1 mask is negative unless it is
    // coerced unsigned — an easy way to silently allow or deny everything.
    expect(ipAllowed("52.66.1.1", ["0.0.0.0/1"])).toBe(true);
    expect(ipAllowed("200.1.1.1", ["0.0.0.0/1"])).toBe(false);
    expect(ipAllowed("200.1.1.1", ["0.0.0.0/0"])).toBe(true);
  });

  test("strips the IPv4-mapped IPv6 prefix Node reports on dual-stack sockets", () => {
    expect(ipAllowed("::ffff:52.66.1.1", ["52.66.1.0/24"])).toBe(true);
  });

  test("a null IP is denied when an allowlist exists", () => {
    expect(ipAllowed(null, ["52.66.1.0/24"])).toBe(false);
  });

  test("malformed input is denied, never allowed", () => {
    expect(ipAllowed("not-an-ip", ["52.66.1.0/24"])).toBe(false);
    expect(ipAllowed("999.1.1.1", ["0.0.0.0/0"])).toBe(false);
    expect(ipAllowed("52.66.1.1", ["garbage"])).toBe(false);
    expect(ipAllowed("52.66.1.1", ["52.66.1.0/99"])).toBe(false);
  });
});

describe("parseCidrList", () => {
  test("splits, trims, and drops blanks", () => {
    expect(parseCidrList("52.66.1.0/24, 13.234.0.0/16 ,, ")).toEqual([
      "52.66.1.0/24",
      "13.234.0.0/16",
    ]);
  });

  test("undefined and empty yield an empty list", () => {
    expect(parseCidrList(undefined)).toEqual([]);
    expect(parseCidrList("")).toEqual([]);
  });
});

describe("buildDedupeKey", () => {
  const body = {
    reference_id: "pj_mnd_1",
    decentro_mandate_id: "dm_1",
    callback_txn_id: "cb_1",
    mandate_status: "Active",
  };

  test("keys on the provider's callback txn id when present", () => {
    const ref = extractRef("mandate", { ...body, callback_attempt: 1 });
    expect(buildDedupeKey("mandate", ref, body)).toBe("mandate:cb_1");
  });

  test("callback_attempt does NOT change the key", () => {
    // THE property this table exists for. Decentro re-delivers the same
    // logical event with an incrementing attempt counter; if that counter fed
    // the key, every retry would look new and the dedupe would do nothing.
    const first = { ...body, callback_attempt: 1 };
    const third = { ...body, callback_attempt: 3 };
    expect(
      buildDedupeKey("mandate", extractRef("mandate", first), first)
    ).toBe(buildDedupeKey("mandate", extractRef("mandate", third), third));
  });

  test("falls back to a body hash when the provider omits the txn id", () => {
    const noTxn = { reference_id: "pj_mnd_1", mandate_status: "Active" };
    const key = buildDedupeKey("mandate", extractRef("mandate", noTxn), noTxn);
    expect(key).toMatch(/^mandate:sha256:[0-9a-f]{64}$/);
  });

  test("the hash fallback also ignores callback_attempt", () => {
    const a = { reference_id: "x", mandate_status: "Active", callback_attempt: 1 };
    const b = { reference_id: "x", mandate_status: "Active", callback_attempt: 9 };
    expect(buildDedupeKey("mandate", extractRef("mandate", a), a)).toBe(
      buildDedupeKey("mandate", extractRef("mandate", b), b)
    );
  });

  test("different bodies hash differently", () => {
    const a = { reference_id: "x" };
    const b = { reference_id: "y" };
    expect(buildDedupeKey("mandate", extractRef("mandate", a), a)).not.toBe(
      buildDedupeKey("mandate", extractRef("mandate", b), b)
    );
  });

  test("the same event on the two callback kinds does not collide", () => {
    const ref = extractRef("mandate", body);
    expect(buildDedupeKey("mandate", ref, body)).not.toBe(
      buildDedupeKey("presentation", ref, body)
    );
  });
});

describe("extractRef", () => {
  test("pulls only the routing fields out of an untrusted body", () => {
    const ref = extractRef("mandate", {
      reference_id: "pj_mnd_1",
      decentro_mandate_id: "dm_1",
      callback_txn_id: "cb_1",
      callback_attempt: "2",
      mandate_status: "Active",
      payer_vpa: "victim@okhdfcbank",
    });
    expect(ref).toEqual({
      kind: "mandate",
      referenceId: "pj_mnd_1",
      providerMandateId: "dm_1",
      // Absent from THIS body, but part of the shape: a PDN or presentation
      // callback carries it, and it is how such a callback is routed to its
      // notification when our own reference is missing.
      presentationSequenceId: null,
      callbackTxnId: "cb_1",
      callbackAttempt: 2,
      // Always null here: Decentro reports its own debit instant on the status
      // read, so nothing is synthesised for it and a delivery confirmation has
      // nothing to correct.
      notificationDeliveredAt: null,
    });
    // `mandate_status` is deliberately absent: the body's claim about state is
    // never carried forward. State comes from the provider's status API.
    expect(ref).not.toHaveProperty("mandateStatus");
  });

  test("missing and wrong-typed fields become null rather than throwing", () => {
    expect(extractRef("presentation", {})).toEqual({
      kind: "presentation",
      referenceId: null,
      providerMandateId: null,
      presentationSequenceId: null,
      callbackTxnId: null,
      callbackAttempt: null,
      notificationDeliveredAt: null,
    });
    expect(extractRef("mandate", { reference_id: 42, callback_attempt: {} })).toEqual(
      {
        kind: "mandate",
        referenceId: null,
        providerMandateId: null,
        presentationSequenceId: null,
        callbackTxnId: null,
        callbackAttempt: null,
        notificationDeliveredAt: null,
      }
    );
  });
});
