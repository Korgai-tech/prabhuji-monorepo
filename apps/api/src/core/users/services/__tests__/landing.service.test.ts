import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetEnvCache } from "@api/shared/config";
import type { LandingUserRow } from "@api/core/users/types";
import { resolveLanding } from "../landing.service.js";
import {
  LANDING_DIRECT_ABTEST_API_ID,
  LANDING_DIRECT_TREATMENT_VARIANT,
  LANDING_REFERRAL_ABTEST_API_ID,
  LANDING_REFERRAL_TREATMENT_VARIANT,
  LANDING_EXPERIMENT_IDS,
  readLandingCode,
  safeLandingDeeplink,
} from "../landing.constants.js";

/**
 * TAM-258 — the landing ladder, rung by rung.
 *
 * The abtesting service is stubbed at `fetch` rather than by mocking
 * `evaluateAbtest`, matching `home.service.test.ts`. That keeps the real client
 * in the loop, so the collapse-everything-to-null contract this resolver leans
 * on is exercised here too rather than assumed.
 */

const USER = "019f5f4c-793c-7358-aec3-f7941d852db6";
const START = "2026-09-23T00:00:00.000Z";
/** Comfortably after the start date — an in-cohort registration. */
const AFTER = new Date("2026-09-24T10:00:00.000Z");
/** The day before the experiments began — out of cohort. */
const BEFORE = new Date("2026-09-22T10:00:00.000Z");
const VERSION = "1.2.0";

const row = (over: Partial<LandingUserRow> = {}): LandingUserRow => ({
  phoneVerifiedAt: AFTER,
  firstUtmGroup: null,
  adLandingConsumedAt: null,
  ...over,
});

/**
 * Answers `/evaluate` per apiId. `arms` names the variant each experiment should
 * report; an apiId left out answers "not in experiment", and `null` makes the
 * call fail outright (non-2xx) so the caller's fallback is what gets tested.
 */
function stubAbtest(
  arms: Record<string, string | null>,
  payloads: Record<string, Record<string, unknown>> = {}
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { apiId: string };
      const arm = arms[body.apiId];
      if (arm === null) return Promise.resolve(new Response("nope", { status: 503 }));
      const payload =
        arm === undefined
          ? { inExperiment: false, bucket: 12, defaultConfig: null }
          : {
              inExperiment: true,
              bucket: 951,
              variant: { id: arm, payload: payloads[body.apiId] ?? {} },
            };
      return Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    })
  );
}

const inDirectArm = (): void =>
  stubAbtest({ [LANDING_DIRECT_ABTEST_API_ID]: LANDING_DIRECT_TREATMENT_VARIANT });
const inReferralArm = (): void =>
  stubAbtest({ [LANDING_REFERRAL_ABTEST_API_ID]: LANDING_REFERRAL_TREATMENT_VARIANT });

beforeEach(() => {
  process.env.ABTEST_BASE_URL = "https://platform.test/abtesting";
  process.env.ABTEST_TENANT_KEY = "prabhuji.dev.key";
  process.env.LANDING_EXPERIMENT_START_AT = START;
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ABTEST_BASE_URL;
  delete process.env.ABTEST_TENANT_KEY;
  delete process.env.LANDING_EXPERIMENT_START_AT;
  resetEnvCache();
});

describe("rung 1 — the registration cohort", () => {
  test("registered before the start date ⇒ out of the experiment entirely", async () => {
    inDirectArm();
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ phoneVerifiedAt: BEFORE }),
    });
    expect(decision.landing).toEqual({
      deeplink: "",
      module: "home",
      source: "not_in_experiment",
      utmCode: "",
    });
  });

  test("never verified ⇒ out, even with a bucket assignment", async () => {
    inDirectArm();
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ phoneVerifiedAt: null }),
    });
    expect(decision.landing.module).toBe("home");
  });

  test("a missing user row is never an experiment subject", async () => {
    inDirectArm();
    const decision = await resolveLanding({ userId: USER, appVersion: VERSION, row: null });
    expect(decision.landing.source).toBe("not_in_experiment");
  });

  /**
   * The cohort gate runs BEFORE the evaluations, so an excluded user costs the
   * launch path nothing at all. If this regresses, every pre-experiment user
   * pays for two round trips on every app open to be told "no".
   */
  test("an excluded user never reaches the abtesting service", async () => {
    inDirectArm();
    await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ phoneVerifiedAt: BEFORE }),
    });
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  });
});

describe("rung 2 — the app-version floor", () => {
  test.each([["1.1.9"], [""], ["not-a-version"], [undefined]])(
    "%s cannot be routed, whatever the console says",
    async (version) => {
      inDirectArm();
      const decision = await resolveLanding({ userId: USER, appVersion: version, row: row() });
      expect(decision.landing).toEqual({
        deeplink: "",
        module: "home",
        source: "not_in_experiment",
        utmCode: "",
      });
    }
  );

  test("the floor version itself is allowed in", async () => {
    inDirectArm();
    const decision = await resolveLanding({ userId: USER, appVersion: "1.2.0", row: row() });
    expect(decision.landing.module).toBe("status");
  });
});

describe("rungs 3–6 — the one-time ad arrival", () => {
  test("an STS ad group lands in Status and spends the marker", async () => {
    inReferralArm();
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "prabhuji_STS_hi" }),
    });
    expect(decision.landing).toEqual({
      deeplink: "prabhuji://status",
      module: "status",
      source: "utm_matched",
      utmCode: "STS",
    });
    expect(decision.consume).toBe(true);
  });

  test("an RTG ad group lands in Ringtone and spends the marker", async () => {
    inReferralArm();
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "RTG-summer-2026" }),
    });
    expect(decision.landing).toEqual({
      deeplink: "prabhuji://ringtone",
      module: "ringtone",
      source: "utm_matched",
      utmCode: "RTG",
    });
    expect(decision.consume).toBe(true);
  });

  test("already consumed ⇒ Home, and the marker is not re-spent", async () => {
    inReferralArm();
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "prabhuji_STS_hi", adLandingConsumedAt: AFTER }),
    });
    expect(decision.landing).toEqual({
      deeplink: "",
      module: "home",
      source: "not_in_experiment",
      utmCode: "",
    });
    expect(decision.consume).toBe(false);
  });

  test("no first touch at all ⇒ utm_missing, and nothing is spent", async () => {
    inReferralArm();
    const decision = await resolveLanding({ userId: USER, appVersion: VERSION, row: row() });
    expect(decision.landing).toEqual({
      deeplink: "",
      module: "home",
      source: "utm_missing",
      utmCode: "",
    });
    expect(decision.consume).toBe(false);
  });

  test("a touch carrying no known code ⇒ utm_unmatched, and nothing is spent", async () => {
    inReferralArm();
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "ARTIST_CAMPAIGN" }),
    });
    expect(decision.landing).toEqual({
      deeplink: "",
      module: "home",
      source: "utm_unmatched",
      utmCode: "",
    });
    expect(decision.consume).toBe(false);
  });

  /**
   * The distinction the funnel is FOR: organic traffic landing in the arm vs an
   * ad group somebody named wrong. Collapsing them would hide the second one.
   */
  test("utm_missing and utm_unmatched are not the same answer", async () => {
    inReferralArm();
    const missing = await resolveLanding({ userId: USER, appVersion: VERSION, row: row() });
    const unmatched = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "ARTIST_CAMPAIGN" }),
    });
    expect(missing.landing.source).not.toBe(unmatched.landing.source);
  });
});

describe("rung 7 — the standing landing", () => {
  test("the direct arm lands on Status on every open, spending nothing", async () => {
    inDirectArm();
    const decision = await resolveLanding({ userId: USER, appVersion: VERSION, row: row() });
    expect(decision.landing).toEqual({
      deeplink: "prabhuji://status",
      module: "status",
      source: "bucket_assigned",
      utmCode: "",
    });
    expect(decision.consume).toBe(false);
  });

  /**
   * The ranges are disjoint so this cannot happen in the console — but if it ever
   * does, the answer must be fixed rather than decided by promise timing.
   */
  test("in both arms, the ad arrival wins deterministically", async () => {
    stubAbtest({
      [LANDING_DIRECT_ABTEST_API_ID]: LANDING_DIRECT_TREATMENT_VARIANT,
      [LANDING_REFERRAL_ABTEST_API_ID]: LANDING_REFERRAL_TREATMENT_VARIANT,
    });
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "prabhuji_RTG_hi" }),
    });
    expect(decision.landing.module).toBe("ringtone");
  });
});

describe("rung 8 — everything else is Home", () => {
  test("control arms land on Home", async () => {
    stubAbtest({});
    const decision = await resolveLanding({ userId: USER, appVersion: VERSION, row: row() });
    expect(decision.landing).toEqual({
      deeplink: "",
      module: "home",
      source: "not_in_experiment",
      utmCode: "",
    });
  });

  test("a variant id the console renamed reads as control, not as a treatment", async () => {
    stubAbtest({
      [LANDING_DIRECT_ABTEST_API_ID]: "status_v2",
      [LANDING_REFERRAL_ABTEST_API_ID]: "ad_module_v2",
    });
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "prabhuji_STS_hi" }),
    });
    expect(decision.landing.module).toBe("home");
  });

  test("the service failing outright is Home, never a throw", async () => {
    stubAbtest({
      [LANDING_DIRECT_ABTEST_API_ID]: null,
      [LANDING_REFERRAL_ABTEST_API_ID]: null,
    });
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "prabhuji_STS_hi" }),
    });
    expect(decision.landing.module).toBe("home");
    expect(decision.consume).toBe(false);
  });

  test("an unconfigured environment makes no request at all", async () => {
    delete process.env.ABTEST_BASE_URL;
    delete process.env.ABTEST_TENANT_KEY;
    resetEnvCache();
    const fetchSpy = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", fetchSpy);
    const decision = await resolveLanding({ userId: USER, appVersion: VERSION, row: row() });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(decision.landing.module).toBe("home");
  });
});

describe("the start date is configuration, but a broken value is not 'no gate'", () => {
  test("an unparseable LANDING_EXPERIMENT_START_AT falls back to the built-in default", async () => {
    process.env.LANDING_EXPERIMENT_START_AT = "last tuesday";
    resetEnvCache();
    inDirectArm();
    // The built-in default is the ticket's deploy date, so a 2026-09-24
    // registration is still in cohort and a 2020 one is still out.
    const current = await resolveLanding({ userId: USER, appVersion: VERSION, row: row() });
    const ancient = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ phoneVerifiedAt: new Date("2020-01-01T00:00:00.000Z") }),
    });
    expect(current.landing.module).toBe("status");
    expect(ancient.landing.source).toBe("not_in_experiment");
  });
});

describe("readLandingCode — whole tokens only", () => {
  test.each([
    ["prabhuji_STS_hi", "STS"],
    ["RTG-summer-2026", "RTG"],
    ["sts", "STS"],
    ["Prabhuji STS Hindi", "STS"],
    ["STS", "STS"],
  ])("%s → %s", (group, code) => {
    expect(readLandingCode(group)).toBe(code);
  });

  /**
   * The reason this is a token match and not a substring search: `"STS"` really
   * does occur inside `ARTISTS_2026`, and a campaign nobody meant to include
   * would route silently — invisible in the funnel, because the landing would
   * look intentional.
   */
  test.each([["ARTISTS_2026"], ["ARTIST_CAMPAIGN"], ["nothing_here"], [""], [null]])(
    "%s carries no code",
    (group) => {
      expect(readLandingCode(group)).toBeNull();
    }
  );

  /** A `Map`, so object prototype keys are not lookup hits. */
  test("a group named after a prototype key resolves to nothing", () => {
    expect(readLandingCode("prabhuji_constructor_hi")).toBeNull();
    expect(readLandingCode("toString")).toBeNull();
  });
});

describe("console-authored landings — the point of a deep link", () => {
  /**
   * The whole reason a landing is a URL and not an enum: a new destination —
   * including one pointing at a SPECIFIC item — is a console edit, with no API
   * deploy and no app release.
   */
  test("an override sends the ad's traffic to a specific item", async () => {
    stubAbtest(
      { [LANDING_REFERRAL_ABTEST_API_ID]: LANDING_REFERRAL_TREATMENT_VARIANT },
      {
        [LANDING_REFERRAL_ABTEST_API_ID]: {
          landings: { RTG: "prabhuji://ringtone/019f5f4c-793c-7358-aec3-000000000001" },
        },
      }
    );
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "prabhuji_RTG_hi" }),
    });
    expect(decision.landing.deeplink).toBe(
      "prabhuji://ringtone/019f5f4c-793c-7358-aec3-000000000001"
    );
    expect(decision.landing.module).toBe("ringtone");
    expect(decision.consume).toBe(true);
  });

  test("a code with no built-in mapping can be introduced entirely from the console", async () => {
    stubAbtest(
      { [LANDING_REFERRAL_ABTEST_API_ID]: LANDING_REFERRAL_TREATMENT_VARIANT },
      { [LANDING_REFERRAL_ABTEST_API_ID]: { landings: { STS: "prabhuji://wallpaper/42" } } }
    );
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "prabhuji_STS_hi" }),
    });
    // The analytics label follows the link rather than a closed enum, so the
    // funnel shows the new surface the day it starts serving.
    expect(decision.landing.module).toBe("wallpaper");
  });

  test("the bucket arm is overridable too", async () => {
    stubAbtest(
      { [LANDING_DIRECT_ABTEST_API_ID]: LANDING_DIRECT_TREATMENT_VARIANT },
      { [LANDING_DIRECT_ABTEST_API_ID]: { deeplink: "prabhuji://horoscope/leo" } }
    );
    const decision = await resolveLanding({ userId: USER, appVersion: VERSION, row: row() });
    expect(decision.landing.deeplink).toBe("prabhuji://horoscope/leo");
    expect(decision.landing.source).toBe("bucket_assigned");
  });

  /**
   * A console payload is operator input that reaches the client as a navigation
   * instruction. A junk override must fall back to the built-in map, never ship.
   */
  test.each([
    ["https://evil.example/phish"],
    ["javascript:alert(1)"],
    ["intent://scan#Intent;scheme=zxing;end"],
    ["prabhuji://user:pw@status"],
    ["not a url"],
    [""],
    [42],
    [null],
  ])("an override of %s is ignored in favour of the built-in map", async (bad) => {
    stubAbtest(
      { [LANDING_REFERRAL_ABTEST_API_ID]: LANDING_REFERRAL_TREATMENT_VARIANT },
      { [LANDING_REFERRAL_ABTEST_API_ID]: { landings: { STS: bad } } }
    );
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "prabhuji_STS_hi" }),
    });
    expect(decision.landing.deeplink).toBe("prabhuji://status");
  });

  test("a landings blob that is not an object is ignored", async () => {
    stubAbtest(
      { [LANDING_REFERRAL_ABTEST_API_ID]: LANDING_REFERRAL_TREATMENT_VARIANT },
      { [LANDING_REFERRAL_ABTEST_API_ID]: { landings: ["prabhuji://wallpaper/1"] } }
    );
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "prabhuji_STS_hi" }),
    });
    expect(decision.landing.deeplink).toBe("prabhuji://status");
  });
});

describe("safeLandingDeeplink — the only thing standing between the console and the client", () => {
  test.each([
    ["prabhuji://status"],
    ["prabhuji://ringtone/abc-123"],
    ["prabhuji://status?highlight=1"],
  ])("%s is allowed", (value) => {
    expect(safeLandingDeeplink(value)).toBe(value);
  });

  test.each([
    ["https://evil.example/phish"],
    ["http://localhost"],
    ["javascript:alert(1)"],
    ["file:///etc/passwd"],
    ["prabhuji://UPPER"],
    ["prabhuji://sta tus"],
    ["prabhuji://"],
    ["prabhuji://user@status"],
    ["  "],
    [undefined],
    [{}],
  ])("%s is refused", (value) => {
    expect(safeLandingDeeplink(value)).toBeNull();
  });
});

describe("the console rows these constants name", () => {
  /**
   * Pinned as LITERALS on purpose. Every other assertion in this file goes
   * through the constants, so a typo in one of them would still pass — and the
   * failure mode of a wrong apiId is the quiet kind: the service answers
   * `inExperiment: false` for an id nobody created, every user lands on Home,
   * and the console shows a healthy experiment converting nobody.
   *
   * These two strings, and their separators, are what the rows were actually
   * created with. Do not tidy them.
   */
  test("the apiIds are exactly what exists in the console", () => {
    expect(LANDING_DIRECT_ABTEST_API_ID).toBe("land-on-status");
    expect(LANDING_REFERRAL_ABTEST_API_ID).toBe("land_as_utm");
  });

  test("each apiId records the experiment running against it", () => {
    expect(LANDING_EXPERIMENT_IDS[LANDING_DIRECT_ABTEST_API_ID]).toBe(
      "e1eeb4f0-74ec-4391-a9d5-50b7f8a98b0d"
    );
    expect(LANDING_EXPERIMENT_IDS[LANDING_REFERRAL_ABTEST_API_ID]).toBe(
      "a1abe8f0-89e6-4dc7-bf65-7c45471e0cea"
    );
  });

  /**
   * The experiment id is a comment, not a parameter: `/evaluate` has no
   * experimentId field, and the service resolves the live experiment for an
   * apiId itself. If this ever fails, someone has started sending it — which
   * would pin a console object's lifecycle to a deploy.
   */
  test("the experiment id is never put on the wire", async () => {
    inReferralArm();
    await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "prabhuji_STS_hi" }),
    });
    const bodies = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(
        (call) => JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>
      );
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(Object.keys(body).sort()).toEqual(["apiId", "appVersion", "subjectId"]);
    }
  });
});

describe("telling the arms apart WITHOUT agreeing on a variant id", () => {
  /**
   * The reason this matters: `inExperiment: true` includes CONTROL — the
   * control arm has its own bucket range, so those users come back
   * in-experiment too. Something has to separate them, or the experiment has
   * nothing to measure against.
   *
   * The payload answers it first: a treatment arm has to name a destination,
   * control has no reason to carry one. So an experiment seeded with variant
   * ids nobody told this code about still behaves correctly.
   */
  test("a treatment variant named anything works, as long as it names a landing", async () => {
    stubAbtest(
      { [LANDING_REFERRAL_ABTEST_API_ID]: "whatever_ops_called_it" },
      {
        [LANDING_REFERRAL_ABTEST_API_ID]: {
          landings: { STS: "prabhuji://status" },
        },
      }
    );
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "prabhuji_STS_hi" }),
    });
    expect(decision.landing.deeplink).toBe("prabhuji://status");
    expect(decision.consume).toBe(true);
  });

  test("same for the standing arm", async () => {
    stubAbtest(
      { [LANDING_DIRECT_ABTEST_API_ID]: "variant_b" },
      { [LANDING_DIRECT_ABTEST_API_ID]: { deeplink: "prabhuji://status" } }
    );
    const decision = await resolveLanding({ userId: USER, appVersion: VERSION, row: row() });
    expect(decision.landing.source).toBe("bucket_assigned");
  });

  /** The fallback: an arm seeded bare, destinations left to the built-in map. */
  test("a bare treatment arm still works when its id matches", async () => {
    stubAbtest({ [LANDING_REFERRAL_ABTEST_API_ID]: LANDING_REFERRAL_TREATMENT_VARIANT });
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "prabhuji_STS_hi" }),
    });
    expect(decision.landing.deeplink).toBe("prabhuji://status");
  });

  /**
   * CONTROL, both ways it can arrive: named `control` with no payload, and
   * outside every range. Neither may be routed, or there is no control group.
   */
  test("a control arm carrying no landing is not routed", async () => {
    stubAbtest({ [LANDING_REFERRAL_ABTEST_API_ID]: "control" });
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "prabhuji_STS_hi" }),
    });
    expect(decision.landing.deeplink).toBe("");
    expect(decision.consume).toBe(false);
  });

  test("an empty payload object is not a landing", async () => {
    stubAbtest(
      { [LANDING_REFERRAL_ABTEST_API_ID]: "control" },
      { [LANDING_REFERRAL_ABTEST_API_ID]: {} }
    );
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "prabhuji_STS_hi" }),
    });
    expect(decision.landing.deeplink).toBe("");
  });

  /**
   * The key is what marks the arm, but a junk VALUE must not smuggle a
   * destination past `safeLandingDeeplink` — the arm is read as treatment and
   * then falls through to the built-in map, never to the junk.
   */
  test("a landings key holding a junk value falls back to the built-in map", async () => {
    stubAbtest(
      { [LANDING_REFERRAL_ABTEST_API_ID]: "some_name" },
      { [LANDING_REFERRAL_ABTEST_API_ID]: { landings: { STS: "https://evil.example" } } }
    );
    const decision = await resolveLanding({
      userId: USER,
      appVersion: VERSION,
      row: row({ firstUtmGroup: "prabhuji_STS_hi" }),
    });
    expect(decision.landing.deeplink).toBe("prabhuji://status");
  });
});
