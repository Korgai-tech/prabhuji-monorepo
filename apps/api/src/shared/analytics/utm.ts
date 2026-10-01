import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";

const log = createModuleLogger("analytics:utm");

/** Chars of an unexpected response body worth logging. */
const LOGGED_BODY_MAX_CHARS = 500;

/**
 * The four UTM components, ALWAYS all four, `""` for "not captured".
 *
 * Never a partial object and never an omitted key: ClickHouse drops absent keys
 * at ingest, so an omitted `utm_medium` would read as "this event never carried
 * one" rather than "this campaign had none". A blank is a statement.
 *
 * `utm_group` is the ad group inside the campaign. Upstream names it
 * `adgroup_name` and keeps it as a COLUMN, not a `referral_info` key — the
 * rename to our `_utm_group` suffix happens in `readUtmAttribution` and nowhere
 * else.
 */
export interface UtmAttribution {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_group: string;
}

/**
 * Which moment a UTM triple describes. Becomes the event-property prefix, so
 * these strings are the warehouse contract — `first_utm_source` and friends.
 */
export type UtmMoment = "first" | "latest" | "trial" | "sub";

/**
 * Shapes a triple as `<moment>_utm_*` event properties.
 *
 * One helper for all four events so a rename cannot drift between the capture
 * pair and the purchase pair.
 */
export function utmProperties(moment: UtmMoment, utm: UtmAttribution): Record<string, string> {
  return {
    [`${moment}_utm_source`]: utm.utm_source,
    [`${moment}_utm_medium`]: utm.utm_medium,
    [`${moment}_utm_campaign`]: utm.utm_campaign,
    [`${moment}_utm_group`]: utm.utm_group,
  };
}

/** `null`/absent/non-string reads as "not captured", never as the literal. */
function readComponent(info: Record<string, unknown>, key: string): string {
  const value = info[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Narrows an upstream referral row into an attribution, or `null` when it names
 * no campaign at all.
 *
 * Takes the WHOLE row, because the fields live at two levels — verified against
 * stage on 2026-08-18. `referral_info` is a schemaless blob holding ONLY the
 * `utm_*` components, partial by design (a real organic Play install arrives as
 * `{"utm_source":"google-play","utm_medium":"organic"}`). The paid-ads fields
 * are real columns beside it — `adgroup_name`, `adgroup_id`, `campaign_name`,
 * `ad_id`, `publisher_platform` — all null on an organic touch. Every field is
 * read defensively and missing ones become `""`.
 *
 * `null` (no campaign named) is deliberately distinct from all-blank: the caller
 * emits nothing for `null`, matching crickmate, where a login or locale report
 * carries no UTM and must not blank a user's attribution.
 */
export function readUtmAttribution(row: unknown): UtmAttribution | null {
  // Live rows carry `null` in referral_info for an organic touch, and older
  // clients wrote `""` — both read as an empty bag, never as a throw.
  const bag = (value: unknown): Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const rowObj = bag(row);
  const info = bag(rowObj.referral_info);
  const utm: UtmAttribution = {
    utm_source: readComponent(info, "utm_source"),
    utm_medium: readComponent(info, "utm_medium"),
    utm_campaign: readComponent(info, "utm_campaign"),
    // A COLUMN on the row, not a blob key — the only one of the four that is.
    utm_group: readComponent(rowObj, "adgroup_name"),
  };
  const namesACampaign =
    utm.utm_source !== "" || utm.utm_medium !== "" || utm.utm_campaign !== "" || utm.utm_group !== "";
  return namesACampaign ? utm : null;
}

/**
 * Reads the user's newest attribution touch from the shared platform's referral
 * service and returns its UTM attribution, or `null` when there is nothing to
 * report.
 *
 * Configured by its OWN `REFERRAL_BASE_URL`, not derived from the collector's
 * url. On stage the two are one host (path-routed `/events/*` vs `/referral/*`),
 * which makes derivation look free — but on prod the api posts events to its own
 * stack collector while the referral service stays on the shared platform. A
 * derived origin would quietly look every user up on prabhuji's own ALB and read
 * them all as "no campaign", which is indistinguishable from honest organic
 * traffic. The credential is its own too: `/referral` verifies a per-service
 * tenant key in a header, while the collector takes its key in the POST body.
 *
 * **Never throws, and never returns a partial answer.** Every failure mode —
 * unconfigured, 404, 4xx, 5xx, timeout, non-JSON — collapses to `null`, because
 * every caller sits on a path where attribution is the least important thing
 * happening: a login completing, or a settled payment being reported. An
 * unreachable referral service must not change either outcome.
 *
 * A `404` is the documented "this user has never reported a touch" and is logged
 * at debug; everything else is a warn, because an enabled-but-broken attribution
 * source shows up as an empty campaign report months later otherwise.
 */
export async function fetchLatestUtm(userId: string): Promise<UtmAttribution | null> {
  const env = loadEnv();
  // The collector's switch, because these events have nowhere to land without it
  // — no point paying for an outbound lookup whose result cannot be sent.
  //
  // Deliberately checked HERE and not in `fetchLatestReferralRow`: this switch is
  // about whether an EVENT can be published, which is meaningless to the paywall
  // caller below. A deployment with analytics off still resolves ad creatives.
  if (!env.ANALYTICS_EVENTS_ENABLED) return null;
  const row = await fetchLatestReferralRow(userId);
  return row === null ? null : readUtmAttribution(row);
}

/**
 * The user's newest attribution touch as the RAW upstream row, or `null`.
 *
 * Extracted from `fetchLatestUtm` so a second reader can take a different field
 * off the same row without duplicating the fetch — or inheriting the analytics
 * publish switch, which has nothing to say about whether a field is readable.
 *
 * Same guarantees as its caller: never throws, every failure mode collapses to
 * `null`.
 */
export async function fetchLatestReferralRow(
  userId: string
): Promise<Record<string, unknown> | null> {
  const env = loadEnv();
  if (!env.REFERRAL_BASE_URL || !env.REFERRAL_TENANT_KEY) {
    // Half-configured is a DEPLOY defect, not a quiet no-op — the same reasoning
    // as the collector's own warn in `events-client.ts`. Logged at debug when
    // BOTH are absent, because "this env does not do UTM" is a valid state.
    const level = !env.REFERRAL_BASE_URL && !env.REFERRAL_TENANT_KEY ? "debug" : "warn";
    log[level](
      {
        userId,
        hasBaseUrl: Boolean(env.REFERRAL_BASE_URL),
        hasTenantKey: Boolean(env.REFERRAL_TENANT_KEY),
      },
      "referral lookup not configured; no UTM reported"
    );
    return null;
  }

  // Origin only. An absolute path replaces whatever path the configured base
  // carries, so a base with a trailing slash, or one that someone pasted a path
  // onto, both resolve to `<origin>/referral/v1/...` and no `//` is minted.
  const url = new URL(
    `/referral/v1/${encodeURIComponent(userId)}/latest`,
    env.REFERRAL_BASE_URL
  ).toString();

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), env.ANALYTICS_EVENTS_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        // Both are required: the key alone is a 401, and a key whose packed
        // tenant disagrees with this header is a 401 too. Constant for the same
        // reason the collector's is — this deployment is one tenant.
        "x-tenant-id": "prabhuji",
        "x-tenant-key": env.REFERRAL_TENANT_KEY,
      },
      signal: abortController.signal,
    });

    if (response.status === 404) {
      log.debug({ userId }, "no referral touch upstream; no UTM reported");
      return null;
    }
    if (response.status >= 400) {
      const text = await response.text();
      log.warn(
        { userId, status: response.status, body: text.slice(0, LOGGED_BODY_MAX_CHARS) },
        "referral lookup failed; no UTM reported"
      );
      return null;
    }

    // A gateway or WAF can answer 200 with an HTML page. Parsing that must be a
    // logged miss, not a thrown error on a login path.
    const row: unknown = await response.json();
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      log.warn({ userId }, "referral lookup returned a non-object; no UTM reported");
      return null;
    }
    return row as Record<string, unknown>;
  } catch (err) {
    log.warn({ err, userId }, "referral lookup errored; no UTM reported");
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * The AD GROUP name from an upstream referral row — `""`/absent/non-string all
 * read as `null`.
 *
 * A real COLUMN on the row (`adgroup_name`), beside `campaign_name` /
 * `adgroup_id` / `ad_id` / `publisher_platform`, not a `referral_info` key —
 * the same split `readUtmAttribution` navigates, and the same field it reports
 * as `utm_group`. An operator reading `first_utm_group` in the warehouse is
 * reading this string.
 *
 * Deliberately a SEPARATE reader from `readUtmAttribution` rather than a field
 * plucked off its result: that function returns `null` for a row naming no
 * campaign at all and blanks every component it cannot read, because it feeds a
 * warehouse contract where `""` is a statement. The paywall needs the opposite —
 * "is there a group name here, yes or no" — and `""` must not be a lookup key,
 * or one blank row would match an override someone saved with an empty name.
 */
export function readUtmGroup(row: unknown): string | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return null;
  const value = (row as Record<string, unknown>).adgroup_name;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The ad group the user was last attributed to, or `null` for organic, an
 * unconfigured referral service, or any failure.
 *
 * Read by the paywall to decide whether a CMS-configured override applies.
 * Never throws — a paywall must render whatever the referral service is doing.
 *
 * ⚠️ LATEST, not provably first. `/latest` returns one row and carries no id
 * for the user's oldest touch, so a returning user who clicks a second ad
 * resolves to the SECOND ad group. See `PaywallService.resolveOverride`.
 */
export async function fetchLatestUtmGroup(userId: string): Promise<string | null> {
  const row = await fetchLatestReferralRow(userId);
  return row === null ? null : readUtmGroup(row);
}
