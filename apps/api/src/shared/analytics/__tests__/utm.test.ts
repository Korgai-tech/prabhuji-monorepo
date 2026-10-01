import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@api/shared/config";

const { fetchLatestUtm, fetchLatestUtmGroup, readUtmAttribution, readUtmGroup, utmProperties } =
  await import("../utm.js");

const ORIGINAL_ENV = { ...process.env };

/**
 * The minimum `loadEnv()` accepts, plus a configured referral lookup.
 *
 * `ANALYTICS_EVENTS_URL` points at a DIFFERENT host from `REFERRAL_BASE_URL` on
 * purpose: that is prod's real shape, and it is what a regression back to
 * deriving the referral origin from the collector url would break.
 */
const baseEnv = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  JWT_SECRET: "a-sufficiently-long-secret",
  MEDIA_BUCKET: "test-bucket",
  MEDIA_PUBLIC_BASE_URL: "https://media.example.test",
  ANALYTICS_EVENTS_ENABLED: "true",
  ANALYTICS_EVENTS_URL: "https://own-stack.example.test/2/httpapi",
  ANALYTICS_EVENTS_API_KEY: "events-key",
  ANALYTICS_EVENTS_TIMEOUT_MS: "1234",
  REFERRAL_BASE_URL: "https://platform.example.test",
  REFERRAL_TENANT_KEY: "prabhuji.keyid.secret",
};

const USER = "019f5f4c-793c-7358-aec3-f7941d852db6";

/** A `fetch` that answers with `body`/`status` and records every call. */
const stubFetch = (
  responder: () => Promise<Response>
): { calls: Array<{ url: string; init: RequestInit }> } => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return responder();
    })
  );
  return { calls };
};

const jsonResponse = (body: unknown, status = 200): (() => Promise<Response>) => () =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

/**
 * The real stage row — fetched 2026-08-18, trimmed to the keys that matter.
 *
 * The SHAPE is the point of this fixture: `utm_*` live INSIDE the schemaless
 * `referral_info` blob, while the paid-ads fields (`adgroup_name`,
 * `campaign_name`, `ad_id`, …) are COLUMNS beside it, null on an organic touch.
 */
const rowWith = (
  referralInfo: unknown,
  columns: Record<string, unknown> = {}
): Record<string, unknown> => ({
  id: "01a0140f-0db1-771e-9bf0-789fb3fb2847",
  user_id: USER,
  referral_info: referralInfo,
  ga_adid: null,
  ad_id: null,
  adgroup_id: null,
  adgroup_name: null,
  campaign_id: null,
  campaign_name: null,
  publisher_platform: null,
  created_at: "2026-08-18T08:48:46.181Z",
  updated_at: "2026-08-18T08:48:46.181Z",
  ...columns,
});

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, ...baseEnv };
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
  resetEnvCache();
});

describe("readUtmAttribution", () => {
  it("fills the missing components of a partial blob with blanks", () => {
    // The real organic Play install, verified live on stage. `toEqual` so an
    // OMITTED key fails: ClickHouse drops absent keys at ingest, and the reader
    // could not tell "had no medium" from "never carried one".
    expect(readUtmAttribution(rowWith({ utm_source: "google-play", utm_medium: "organic" }))).toEqual(
      {
        utm_source: "google-play",
        utm_medium: "organic",
        utm_campaign: "",
        utm_group: "",
      }
    );
  });

  it("passes every component through and ignores unrelated keys", () => {
    expect(
      readUtmAttribution(
        rowWith(
          {
            utm_source: "apps.facebook.com",
            utm_medium: "Social_facebook",
            utm_campaign: "fb4a",
            utm_content: '{"source":{"data":[]}}',
          },
          // COLUMNS, not blob keys — the shape verified against stage.
          { adgroup_name: "lookalike_2pct", adgroup_id: "6412", campaign_name: "fb4a" }
        )
      )
    ).toEqual({
      utm_source: "apps.facebook.com",
      utm_medium: "Social_facebook",
      utm_campaign: "fb4a",
      utm_group: "lookalike_2pct",
    });
  });

  it("ignores an adgroup_name INSIDE the blob — it is a column, never a blob key", () => {
    // Guards the shape: if this ever starts passing, upstream moved the field
    // and the row-level read is looking at the wrong level.
    expect(
      readUtmAttribution(rowWith({ utm_source: "meta", adgroup_name: "blob_group" }))?.utm_group
    ).toBe("");
  });

  it("reports an ad group that arrives with no utm components at all", () => {
    // A group alone is still attribution — emitting nothing would lose it.
    expect(readUtmAttribution(rowWith(null, { adgroup_name: " orphan_group " }))).toEqual({
      utm_source: "",
      utm_medium: "",
      utm_campaign: "",
      utm_group: "orphan_group",
    });
  });

  it("trims whitespace", () => {
    expect(readUtmAttribution(rowWith({ utm_source: "  meta  " }))?.utm_source).toBe("meta");
  });

  it.each([
    ["null — an organic touch upstream", null],
    ["the empty string — what older clients wrote", ""],
    ["a non-empty string", "utm_source=meta"],
    ["a number", 7],
    ["an array", [{ utm_source: "meta" }]],
  ])("reads a referral_info of %s as no campaign", (_label, input) => {
    expect(readUtmAttribution(rowWith(input))).toBeNull();
  });

  it("reads a blob whose components are all blank or whitespace as no campaign", () => {
    // Emitting a blank triple here would assert "this user came from no
    // campaign", a claim we cannot support. Nothing must be emitted at all.
    expect(
      readUtmAttribution(
        rowWith({ utm_source: "", utm_medium: "   ", utm_campaign: "" }, { adgroup_name: " " })
      )
    ).toBeNull();
  });

  it("reads a non-string component as not-captured rather than coercing it", () => {
    expect(
      readUtmAttribution(
        rowWith({ utm_source: "meta", utm_medium: 5, utm_campaign: { a: 1 } }, { adgroup_name: 7 })
      )
    ).toEqual({
      utm_source: "meta",
      utm_medium: "",
      utm_campaign: "",
      utm_group: "",
    });
  });
});

describe("utmProperties", () => {
  it("prefixes all four components by moment", () => {
    const utm = {
      utm_source: "meta",
      utm_medium: "cpc",
      utm_campaign: "spring",
      utm_group: "lookalike_2pct",
    };
    expect(utmProperties("first", utm)).toEqual({
      first_utm_source: "meta",
      first_utm_medium: "cpc",
      first_utm_campaign: "spring",
      first_utm_group: "lookalike_2pct",
    });
    expect(utmProperties("sub", utm)).toEqual({
      sub_utm_source: "meta",
      sub_utm_medium: "cpc",
      sub_utm_campaign: "spring",
      sub_utm_group: "lookalike_2pct",
    });
  });
});

describe("fetchLatestUtm", () => {
  it("requests the referral route on REFERRAL_BASE_URL, not the collector's host", async () => {
    const fetched = stubFetch(jsonResponse(rowWith({ utm_source: "google-play" })));

    const utm = await fetchLatestUtm(USER);

    expect(fetched.calls).toHaveLength(1);
    // The collector's own host must NOT appear. On prod the api posts events to
    // its own stack while attribution lives on the shared platform; deriving the
    // origin from the collector url would read every user as "no campaign".
    expect(fetched.calls[0].url).toBe(`https://platform.example.test/referral/v1/${USER}/latest`);
    expect(fetched.calls[0].url).not.toContain("own-stack");
    expect(utm).toEqual({
      utm_source: "google-play",
      utm_medium: "",
      utm_campaign: "",
      utm_group: "",
    });
  });

  it.each([
    ["a trailing slash", "https://platform.example.test/"],
    ["a path someone pasted on", "https://platform.example.test/referral"],
  ])("normalises a base url with %s", async (_label, base) => {
    // The prod base really is given with a trailing slash.
    process.env.REFERRAL_BASE_URL = base;
    resetEnvCache();
    const fetched = stubFetch(jsonResponse(rowWith({ utm_source: "meta" })));

    await fetchLatestUtm(USER);

    expect(fetched.calls[0].url).toBe(`https://platform.example.test/referral/v1/${USER}/latest`);
  });

  it("sends both credentials — the tenant id and the tenant key", async () => {
    // Verified against stage: the key ALONE is a 401, and so is a key whose
    // packed tenant disagrees with this header.
    const fetched = stubFetch(jsonResponse(rowWith({ utm_source: "meta" })));

    await fetchLatestUtm(USER);

    expect(fetched.calls[0].init.headers).toMatchObject({
      "x-tenant-id": "prabhuji",
      "x-tenant-key": "prabhuji.keyid.secret",
      accept: "application/json",
    });
  });

  it("url-encodes the user id", async () => {
    const fetched = stubFetch(jsonResponse(rowWith(null)));

    await fetchLatestUtm("a/../b");

    expect(fetched.calls[0].url).toBe("https://platform.example.test/referral/v1/a%2F..%2Fb/latest");
  });

  it.each([
    ["404 — never reported a touch", 404],
    ["401 — bad credential", 401],
    ["403 — app suspended", 403],
    ["423 — tenant suspended", 423],
    ["400 — non-uuid path param", 400],
    ["500 — upstream fault", 500],
  ])("returns null on %s", async (_label, status) => {
    stubFetch(jsonResponse({ error: { code: "X", message: "y" } }, status));

    await expect(fetchLatestUtm(USER)).resolves.toBeNull();
  });

  it("returns null when a gateway answers 200 with an html page", async () => {
    // A WAF or ALB error page must be a logged miss, never a throw on a login.
    stubFetch(() => Promise.resolve(new Response("<html>nope</html>", { status: 200 })));

    await expect(fetchLatestUtm(USER)).resolves.toBeNull();
  });

  it("returns null when a 200 body is not an object", async () => {
    stubFetch(jsonResponse("a string"));

    await expect(fetchLatestUtm(USER)).resolves.toBeNull();
  });

  it("returns null when the transport throws", async () => {
    stubFetch(() => Promise.reject(new Error("ECONNRESET")));

    await expect(fetchLatestUtm(USER)).resolves.toBeNull();
  });

  it("returns null for a touch that names no campaign", async () => {
    stubFetch(jsonResponse(rowWith(null)));

    await expect(fetchLatestUtm(USER)).resolves.toBeNull();
  });

  it("does not call out at all when analytics is disabled", async () => {
    process.env.ANALYTICS_EVENTS_ENABLED = "false";
    resetEnvCache();
    const fetched = stubFetch(jsonResponse(rowWith({ utm_source: "meta" })));

    await expect(fetchLatestUtm(USER)).resolves.toBeNull();
    expect(fetched.calls).toHaveLength(0);
  });

  it.each([
    ["the tenant key", "REFERRAL_TENANT_KEY"],
    ["the base url", "REFERRAL_BASE_URL"],
  ])("does not call out when %s is missing", async (_label, key) => {
    // Either half empty switches the feature off — it must not reach the network
    // only to be told 401, and must never guess a host.
    process.env[key] = "";
    resetEnvCache();
    const fetched = stubFetch(jsonResponse(rowWith({ utm_source: "meta" })));

    await expect(fetchLatestUtm(USER)).resolves.toBeNull();
    expect(fetched.calls).toHaveLength(0);
  });
});

/**
 * The paywall's key. A SEPARATE reader from `readUtmAttribution` because the
 * two disagree about what a blank means: the warehouse contract says `""` is a
 * statement ("captured nothing"), while a lookup key of `""` would match an
 * override someone saved with an empty name.
 */
describe("readUtmGroup", () => {
  it("reads the adgroup_name COLUMN, not a referral_info key", () => {
    expect(readUtmGroup(rowWith({ utm_source: "google" }, { adgroup_name: "Diwali - Hindi" }))).toBe(
      "Diwali - Hindi"
    );
  });

  it("ignores an adgroup_name hidden inside referral_info", () => {
    expect(readUtmGroup(rowWith({ adgroup_name: "Sneaky" }))).toBeNull();
  });

  it("reads an organic touch as null", () => {
    expect(readUtmGroup(rowWith({ utm_source: "google-play", utm_medium: "organic" }))).toBeNull();
  });

  it("reads blank and whitespace-only names as null, never as a key", () => {
    expect(readUtmGroup(rowWith(null, { adgroup_name: "" }))).toBeNull();
    expect(readUtmGroup(rowWith(null, { adgroup_name: "   " }))).toBeNull();
  });

  it("trims, so a trailing space in the ad platform still matches", () => {
    expect(readUtmGroup(rowWith(null, { adgroup_name: " Diwali " }))).toBe("Diwali");
  });

  it("reads a non-string, a non-object and an array as null", () => {
    expect(readUtmGroup(rowWith(null, { adgroup_name: 42 }))).toBeNull();
    expect(readUtmGroup("nope")).toBeNull();
    expect(readUtmGroup([])).toBeNull();
    expect(readUtmGroup(null)).toBeNull();
  });
});

describe("fetchLatestUtmGroup", () => {
  it("returns the ad group from the live row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(jsonResponse(rowWith(null, { adgroup_name: "Diwali - Hindi - Video" })))
    );
    await expect(fetchLatestUtmGroup(USER)).resolves.toBe("Diwali - Hindi - Video");
  });

  /**
   * It must NOT inherit `ANALYTICS_EVENTS_ENABLED` the way `fetchLatestUtm`
   * does: that switch decides whether an EVENT can be published, which has
   * nothing to say about whether the paywall may read a field.
   */
  it("still resolves with analytics publishing disabled", async () => {
    process.env.ANALYTICS_EVENTS_ENABLED = "false";
    resetEnvCache();
    vi.stubGlobal("fetch", vi.fn(jsonResponse(rowWith(null, { adgroup_name: "Diwali" }))));

    await expect(fetchLatestUtmGroup(USER)).resolves.toBe("Diwali");
  });

  it("collapses an upstream failure to null rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))));
    await expect(fetchLatestUtmGroup(USER)).resolves.toBeNull();
  });

  it("reads a 404 (never reported a touch) as null", async () => {
    vi.stubGlobal("fetch", vi.fn(jsonResponse({}, 404)));
    await expect(fetchLatestUtmGroup(USER)).resolves.toBeNull();
  });
});
