/**
 * TAM-258 — every tunable of the app-landing experiments, in one file.
 *
 * ── WHY THEY ARE ALL HERE ───────────────────────────────────────────────────
 * The UTM codes, the apiIds and the variant ids are PLACEHOLDERS: growth names
 * the real strings after the console experiments exist. Collecting them means a
 * rename is one edit plus its fixtures, rather than a grep across a resolver,
 * a controller and three test files — and it makes the blast radius of "the
 * console says `ad_module_v2` now" visible at a glance.
 *
 * Nothing here does IO and nothing here reads `loadEnv()`. The one genuinely
 * environmental knob (the experiment start date) is read by the resolver, which
 * falls back to [DEFAULT_LANDING_EXPERIMENT_START_AT] below.
 *
 * What has to exist in the abtesting console for any of this to do anything —
 * the apiIds, the bucket ranges, the variant ids and the payload shapes — is
 * written down in `docs/LANDING-EXPERIMENTS-CONSOLE.md`. With no console
 * objects every user lands on Home, which is a safe state to deploy into.
 */

/**
 * The two **apiIds** in the shared abtesting console, as they were actually
 * created there.
 *
 * SEPARATE ids, not one four-arm experiment: they start, stop and get read
 * independently, and the ranges are disjoint (0–49/900–949 vs 50–99/950–999) so
 * no user can ever be in both. A single id would couple their lifecycles for no
 * gain.
 *
 * These do not follow the `<surface>.<thing>` shape the older ids use
 * (`home.shortcut_grid`, `chat.agent`, `paywall.layout`, `feed.deity_split`),
 * and they do not match each other's separator either. That is on purpose:
 * **the console is the source of truth for an apiId**, these are the strings
 * the rows were created with, and a value copied "tidily" rather than exactly
 * is a 100%-control experiment that looks healthy in the console. If they are
 * ever renamed there, rename them here in the same change.
 */

/**
 * "Land on Status" — the standing, every-open landing (control 0–49,
 * treatment 900–949).
 *
 * Console experiment currently running against it:
 * `e1eeb4f0-74ec-4391-a9d5-50b7f8a98b0d`. Recorded for operators reading the
 * console, NOT used by this code — see [LANDING_EXPERIMENT_IDS].
 */
export const LANDING_DIRECT_ABTEST_API_ID = "land-on-status";

/**
 * "Land as UTM" — the one-time ad arrival (control 50–99, treatment 950–999).
 *
 * Console experiment currently running against it:
 * `a1abe8f0-89e6-4dc7-bf65-7c45471e0cea`. Recorded, not used — see
 * [LANDING_EXPERIMENT_IDS].
 */
export const LANDING_REFERRAL_ABTEST_API_ID = "land_as_utm";

/**
 * The console experiment ids, for humans only.
 *
 * ── WHY THEY ARE NOT SENT ───────────────────────────────────────────────────
 * `POST /evaluate` takes `{subjectId, apiId, appVersion?, traits?}` and has no
 * experimentId field — the service resolves the live experiment for an apiId
 * itself. That is the design worth keeping, not a limitation to work around:
 * the apiId is OURS and permanent, an experiment is the console's and
 * temporary, and pinning one in code would mean a deploy every time an
 * experiment is restarted, re-scoped or replaced.
 *
 * So these exist purely so someone reading this file can find the matching row
 * in the console, and someone debugging an exposure can tell whether the
 * experiment they are looking at is the one this code expects. A value that
 * goes stale here is a stale COMMENT, never a routing bug.
 */
export const LANDING_EXPERIMENT_IDS = {
  [LANDING_DIRECT_ABTEST_API_ID]: "e1eeb4f0-74ec-4391-a9d5-50b7f8a98b0d",
  [LANDING_REFERRAL_ABTEST_API_ID]: "a1abe8f0-89e6-4dc7-bf65-7c45471e0cea",
} as const;

/**
 * The treatment variant ids — the FALLBACK way of telling the arms apart, not
 * the primary one.
 *
 * ── WHY ANY OF THIS IS NEEDED ───────────────────────────────────────────────
 * `inExperiment: true` means "this subject is in the experiment", and that
 * INCLUDES control: the control arm has its own bucket range (0–49 / 50–99), so
 * the service answers those users `inExperiment: true` with the control
 * variant. Treating every `inExperiment: true` as treatment would route control
 * to the landing too, leaving the experiment with nothing to compare against.
 *
 * ── WHY THE PAYLOAD IS ASKED FIRST ──────────────────────────────────────────
 * A treatment arm has to name a destination anyway, and control has no reason
 * to carry one. So "does this variant's payload name a landing?" already
 * separates the arms — without the console and this file having to agree on a
 * string. That is the same order `deity-split.experiment.ts` uses, for the same
 * reason: an experiment seeded with whatever ids the operator chose still
 * behaves correctly.
 *
 * These ids are what answers the question when the payload does not: an arm
 * seeded bare, with the destinations left to the built-in map below. Both paths
 * have to miss before a treatment user is read as control.
 *
 * A miss on both still fails SAFE (Home) — but QUIETLY, which is the part worth
 * knowing: the console shows a running experiment with normal exposures and no
 * effect. `docs/LANDING-EXPERIMENTS-CONSOLE.md` says so where an operator sees it.
 */
export const LANDING_DIRECT_TREATMENT_VARIANT = "status";
export const LANDING_REFERRAL_TREATMENT_VARIANT = "ad_module";

/**
 * The release that ships the mobile side (TAM-259).
 *
 * Enforced HERE, in code, and not only as a console targeting rule — this is a
 * correctness guard, not redundancy. A build below this version has no
 * `status`/`ringtone` route target at all, so a console misconfiguration must
 * not be able to hand one to it. A missing or unparseable `app_version` header
 * reads as "very old client" and is excluded, the same convention the home
 * shortcut filter uses.
 */
export const LANDING_MIN_APP_VERSION = "1.2.0";

/**
 * When the experiments started. Users who registered before this are excluded
 * from both arms — they are not control, they are not in the experiment at all.
 *
 * Overridden by `LANDING_EXPERIMENT_START_AT`. This default is the deploy date
 * of TAM-258 and a PLACEHOLDER until growth names the real start; it is
 * deliberately not "the beginning of time", because a null-ish default would
 * silently sweep the entire existing user base into an experiment whose cohort
 * definition says otherwise.
 */
export const DEFAULT_LANDING_EXPERIMENT_START_AT = "2026-09-23T00:00:00.000Z";

/**
 * The app's internal deep-link scheme — `prabhuji://<slug>[/<id>][?query]`.
 *
 * A landing is a DEEP LINK, not a destination enum, and this is the only scheme
 * one may use. The app's own parser documents this scheme as the internal
 * hand-off channel (push payloads, `adb`, in-app hand-offs) while `https://
 * <shareHost>/app/...` is the user-facing share flavour — a server telling the
 * app where to open is exactly the former.
 *
 * Restricting to it is also what makes a console-authored landing SAFE: the
 * payload is operator input, it arrives as a navigation instruction, and
 * anything that is not this scheme (an `https://` phishing page, an `intent://`,
 * a `javascript:`) must never reach the client as one.
 */
export const LANDING_DEEPLINK_SCHEME = "prabhuji:";

/**
 * Ad-group code → the deep link that ad's traffic lands on. PLACEHOLDER codes.
 *
 * ── WHY A DEEP LINK AND NOT A MODULE NAME ───────────────────────────────────
 * A closed `status | ringtone | home` enum meant every new landing destination
 * was an app release. A deep link is the app's existing navigation instruction —
 * parsed by `deep_link_parser.dart`, stacked by `navigationStackFor` so Home
 * sits underneath — so new landings are a server change, and an ad for one
 * specific ringtone can land on THAT ringtone (`prabhuji://ringtone/<id>`)
 * rather than on the module's home.
 *
 * The honest limit: the app can only open a slug its parser knows. An unknown
 * one parses to `UnknownDeepLink` and lands on Home, which is why the client
 * treats this string as a hint it may refuse rather than an order it must obey.
 *
 * A `Map`, not an object literal: the lookup key comes from an operator-typed ad
 * group name, and `"constructor" in {}` is `true`. A Map has no prototype keys to
 * collide with, so a campaign named `prabhuji_constructor_hi` cannot resolve to
 * anything.
 */
export const LANDING_UTM_CODES: ReadonlyMap<string, string> = new Map([
  ["STS", "prabhuji://status"],
  ["RTG", "prabhuji://ringtone"],
]);

/** Where the bucket-assigned (non-ad) arm lands, absent a console override. */
export const LANDING_DIRECT_DEEPLINK = "prabhuji://status";

/**
 * The module code carried by an ad group name, or `null`.
 *
 * ── THE MATCHING RULE ───────────────────────────────────────────────────────
 * Case-insensitive match against whole TOKENS, where a token is a run of
 * alphanumerics: `prabhuji_STS_hi` → `STS`, `RTG-summer-2026` → `RTG`,
 * `ARTIST_CAMPAIGN` → `null`.
 *
 * Deliberately NOT a substring search. A code is three characters, ad group
 * names are free text typed by whoever set the campaign up, and `"STS" in
 * "ARTISTS_2026"` is true — a substring rule would silently route a campaign
 * nobody meant to include, and the mistake would be invisible in the funnel
 * because the landing would look intentional.
 *
 * First matching token wins, so a group naming two codes resolves to the one
 * that appears first. That is arbitrary but deterministic; the real answer is
 * that such a group is a naming bug, and `utm_unmatched`/the funnel is where it
 * should surface.
 */
export function readLandingCode(group: string | null | undefined): string | null {
  if (group === null || group === undefined) return null;
  const tokens = group.toUpperCase().split(/[^A-Z0-9]+/);
  for (const token of tokens) {
    if (token !== "" && LANDING_UTM_CODES.has(token)) return token;
  }
  return null;
}

/** The deep link a code maps to. `null` for an unknown code — never a throw. */
export function deeplinkForLandingCode(code: string | null): string | null {
  if (code === null) return null;
  return LANDING_UTM_CODES.get(code) ?? null;
}

/**
 * A deep link the client may be handed, or `null`.
 *
 * Applied to EVERY landing that leaves this service, including the ones in the
 * map above — a rule enforced only on the untrusted path is a rule waiting to be
 * bypassed the day someone moves the map into the console.
 *
 * The slug is the `host` component (`prabhuji://status/123` → host `status`,
 * path `/123`), and it must look like a slug: lowercase alphanumerics and
 * dashes. Credentials are rejected outright — `prabhuji://user:pw@status` has no
 * legitimate reading, and a URL that carries them is not one an operator typed
 * by accident.
 */
export function safeLandingDeeplink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== LANDING_DEEPLINK_SCHEME) return null;
  if (url.username !== "" || url.password !== "") return null;
  if (!/^[a-z0-9-]+$/.test(url.host)) return null;
  return trimmed;
}

/**
 * The analytics label for a landing — the deep link's slug, or `home`.
 *
 * Derived rather than carried so the two can never disagree, and deliberately
 * NOT narrowed to a closed set: a console that starts sending
 * `prabhuji://wallpaper/123` should show up in the funnel as `wallpaper`, not as
 * `other`. The mobile client forwards whatever it is given verbatim.
 */
export function moduleForLandingDeeplink(deeplink: string): string {
  if (deeplink === "") return "home";
  try {
    return new URL(deeplink).host;
  } catch {
    return "home";
  }
}
