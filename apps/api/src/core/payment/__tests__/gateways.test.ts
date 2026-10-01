import { describe, expect, test } from "vitest";
import { PAYMENT_PROVIDERS, PROVIDER } from "@api/shared/config";
import { GATEWAYS, gatewayFor } from "../gateways.js";
import type { MandateProvider } from "../mandate.provider.js";
import { StubMandateProvider } from "../repositories/stub-mandate.repository.js";
import { DecentroMandateProvider } from "../repositories/decentro-mandate.repository.js";
import { CashfreeMandateProvider } from "../repositories/cashfree-mandate.repository.js";
import { RazorpayMandateProvider } from "../repositories/razorpay-mandate.repository.js";

/**
 * The registry is the extensibility contract: adding a provider is a tuple
 * entry + a registry entry, and these assertions fail if the two ever drift.
 */
describe("payment gateway registry", () => {
  test("has exactly one gateway per PAYMENT_PROVIDERS entry", () => {
    expect(Object.keys(GATEWAYS).sort()).toEqual([...PAYMENT_PROVIDERS].sort());
  });

  test("every gateway's name matches its registry key", () => {
    for (const [key, gateway] of Object.entries(GATEWAYS)) {
      expect(gateway.name).toBe(key);
    }
  });

  test("gatewayFor resolves each provider to its gateway", () => {
    for (const name of PAYMENT_PROVIDERS) {
      expect(gatewayFor(name).name).toBe(name);
    }
  });

  test("the stub gateway builds a provider named 'stub'", () => {
    // Only the stub provider constructs without vendor env; the real adapters
    // build their HTTP client (which reads credentials) lazily in createProvider.
    expect(gatewayFor(PROVIDER.STUB).createProvider().name).toBe("stub");
  });

  test("stub never classifies a callback (it has no webhooks)", () => {
    expect(gatewayFor(PROVIDER.STUB).callbackKindFor({ type: "x" })).toBeNull();
  });
});

/**
 * The PDN lead band is sampled at DAY granularity, and a band that spans no
 * whole day is empty — so the gateway declaring it silently never bills anyone.
 *
 * `canSendPreDebitNotification` measures the lead as
 * `cycleDate - istDateOnly(now)`. Both sides are calendar dates at UTC midnight
 * (`cycle_date` and `next_debit_date` are `@db.Date`), so the lead is only ever
 * a whole multiple of 24h regardless of what time the scheduler ticks.
 *
 * This exists because Razorpay shipped with `{min: 25, max: 30}` — which reads
 * like a tighter `{24,48}` and is in fact unsatisfiable. Nothing failed: every
 * tick just incremented `skippedOutsideWindow`, so the symptom was a gateway
 * that registered mandates happily and then never charged one, indefinitely.
 *
 * Asserted over the whole registry rather than per adapter, so the guard covers
 * gateways that do not exist yet.
 */
describe("pdn lead bands are satisfiable at day granularity", () => {
  const DAY_LEADS = [24, 48, 72];

  // Constructed directly with a dummy client rather than through
  // `createProvider()`: the real adapters build an HTTP client that reads
  // vendor credentials, and this assertion is about a declared constant, not
  // about configuration being present.
  const dummy = {} as never;
  const ADAPTERS: [string, MandateProvider][] = [
    [PROVIDER.STUB, new StubMandateProvider()],
    [PROVIDER.DECENTRO, new DecentroMandateProvider(dummy)],
    [PROVIDER.CASHFREE, new CashfreeMandateProvider(dummy)],
    [PROVIDER.RAZORPAY, new RazorpayMandateProvider(dummy)],
  ];

  test("covers every registered gateway", () => {
    // Otherwise a new gateway could be added to the registry and quietly skip
    // the assertion below — which is the only thing standing between an empty
    // band and a gateway that never bills.
    expect(ADAPTERS.map(([name]) => name).sort()).toEqual(
      Object.keys(GATEWAYS).sort()
    );
  });

  test.each(ADAPTERS)(
    "%s declares a band containing a whole-day lead",
    (name, adapter) => {
      const { min, max } = adapter.pdnLeadHours;
      expect(min).toBeLessThanOrEqual(max);
      const reachable = DAY_LEADS.filter((h) => h >= min && h <= max);
      expect(
        reachable,
        `${name} declares pdnLeadHours {min:${min},max:${max}}, which no whole-day lead can satisfy — it would never send a pre-debit notification`
      ).not.toHaveLength(0);
    }
  );

  /**
   * The turnaround is a VENDOR contract, so every gateway has to state its
   * position on it — `null` ("I report my own instant") is an answer, an absent
   * member is not.
   *
   * Asserted across the registry for the same reason as the band above: the
   * failure mode of getting it wrong is silent. A gateway that reports no
   * instant AND declares no turnaround presents from the cycle date's midnight,
   * which for a short trial is only hours after the notification — under every
   * real vendor's TAT, so every presentation is rejected, the order is spent,
   * the retry budget burns and NPCI revokes the mandate on a failed first debit.
   */
  test.each(ADAPTERS)("%s declares a presentation turnaround", (name, adapter) => {
    const tat = adapter.presentationTatHours;
    expect(
      tat === null || typeof tat === "number",
      `${name} must declare presentationTatHours — a number for a gateway that reports no debit instant, or null for one that reports its own`
    ).toBe(true);
    if (tat !== null) {
      // NPCI's notice period is 24h and no gateway can accept a presentation
      // sooner; a value under it would be a misreading of the vendor's docs, and
      // being wrong LOW is the expensive direction.
      expect(tat).toBeGreaterThanOrEqual(24);
      // Above 48h a same-week cycle can never be presented within its own day,
      // and the whole-day lead above cannot reach far enough ahead to help.
      expect(tat).toBeLessThanOrEqual(48);
    }
  });
});

/**
 * Decentro does not label its callbacks, so the kind is inferred from which status
 * field the body carries — and the ORDER of those checks is load-bearing.
 *
 * This table exists because the previous implementation was a two-way split with
 * PRESENTATION as the fallback: anything without `mandate_status` was called a
 * presentation. A PDN callback carries `notification_status`, so every one was
 * routed to the settlement handler, which found no submitted debit and discarded
 * the `presentation_sequence_id` — leaving the asynchronous notify flow with no
 * inbound path and a symptom indistinguishable from "the provider isn't sending
 * callbacks".
 */
describe("decentro callbackKindFor", () => {
  const classify = (body: Record<string, unknown>) =>
    gatewayFor(PROVIDER.DECENTRO).callbackKindFor(body);

  test.each([
    [{ presentation_status: "SUCCESS" }, "presentation"],
    [{ notification_status: "SUCCESS" }, "pdn"],
    [{ mandate_status: "ACTIVE" }, "mandate"],
  ])("%o → %s", (body, expected) => {
    expect(classify(body)).toBe(expected);
  });

  test("the MOST SPECIFIC field wins — a presentation echoes the mandate id too", () => {
    expect(
      classify({ presentation_status: "SUCCESS", mandate_status: "ACTIVE" })
    ).toBe("presentation");
    expect(
      classify({ notification_status: "PENDING", mandate_status: "ACTIVE" })
    ).toBe("pdn");
    // And a presentation still outranks a notification, since it carries both.
    expect(
      classify({
        presentation_status: "SUCCESS",
        notification_status: "SUCCESS",
      })
    ).toBe("presentation");
  });

  test("an unrecognised body is UNCLASSIFIED, not assumed to be a presentation", () => {
    // The regression that matters. `transaction_status` is a real Decentro field
    // (it appears on refund callbacks), and under the old fallback it would have
    // been handed to the code that settles money. Null is the honest answer: the
    // controller acks 200 and logs it, and nothing is mutated on a body we do not
    // understand.
    expect(classify({ transaction_status: "SUCCESS" })).toBeNull();
    expect(classify({})).toBeNull();
    expect(classify({ some_future_field: 1 })).toBeNull();
  });
});
