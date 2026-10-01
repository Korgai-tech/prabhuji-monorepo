import { evaluateAbtest, type AbtestEvaluation } from "@api/shared/abtest";
import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";
import { semverGte } from "@api/shared/version";
import type { LandingConfig, LandingUserRow } from "@api/core/users/types";
import {
  DEFAULT_LANDING_EXPERIMENT_START_AT,
  LANDING_DIRECT_ABTEST_API_ID,
  LANDING_DIRECT_DEEPLINK,
  LANDING_DIRECT_TREATMENT_VARIANT,
  LANDING_MIN_APP_VERSION,
  LANDING_REFERRAL_ABTEST_API_ID,
  LANDING_REFERRAL_TREATMENT_VARIANT,
  deeplinkForLandingCode,
  moduleForLandingDeeplink,
  readLandingCode,
  safeLandingDeeplink,
} from "./landing.constants.js";

const log = createModuleLogger("users:landing");

/**
 * A resolved landing, plus whether serving it spends the user's one-time
 * ad-arrival redirect.
 *
 * `consume` is returned rather than written here on purpose: this function does
 * no database IO, which is what makes the whole ladder testable with three
 * fields and no fakes. `UsersService` owns the write.
 */
export interface LandingDecision {
  landing: LandingConfig;
  consume: boolean;
}

const HOME_NOT_IN_EXPERIMENT: LandingConfig = {
  deeplink: "",
  module: "home",
  source: "not_in_experiment",
  utmCode: "",
};

/** Home — `deeplink: ""` is the client's "open your default landing". */
function home(source: LandingConfig["source"], utmCode: string): LandingConfig {
  return { deeplink: "", module: "home", source, utmCode };
}

/** A resolved landing, with its analytics label derived from the link itself. */
function landAt(deeplink: string, source: LandingConfig["source"], utmCode: string): LandingConfig {
  return { deeplink, module: moduleForLandingDeeplink(deeplink), source, utmCode };
}

/**
 * The deep link a console variant names for this ad code, or `null`.
 *
 * `payload.landings` is a `{ [code]: deeplink }` object the operator authors in
 * the abtesting console, and it is what makes "add a landing page" a console
 * edit rather than a deploy — including landings that point at a SPECIFIC item
 * (`prabhuji://ringtone/<id>`), which a static code map cannot express.
 *
 * Every value goes through `safeLandingDeeplink`, so a typo, an `https://` URL
 * or anything with credentials in it is ignored and the built-in map answers
 * instead. An override is an addition to the fallback, never a way around it.
 */
function overrideFor(payload: Record<string, unknown> | undefined, code: string): string | null {
  const landings = payload?.["landings"];
  if (typeof landings !== "object" || landings === null || Array.isArray(landings)) return null;
  return safeLandingDeeplink((landings as Record<string, unknown>)[code]);
}

/**
 * Is this evaluation a TREATMENT arm, or control?
 *
 * The question exists because `inExperiment: true` covers both: the control arm
 * has its own bucket range, so control users come back in-experiment too, and
 * routing them to the landing would leave nothing to measure against.
 *
 * Two ways to answer, in order:
 *
 *  1. **The payload names a landing.** A treatment arm has to say where it
 *     sends people; control has no reason to carry that. This separates the
 *     arms with no agreement needed between the console and this file, which is
 *     what makes an experiment seeded with any variant ids work correctly.
 *  2. **The variant id matches.** For an arm seeded bare, leaving the
 *     destinations to the built-in map.
 *
 * Both have to miss before a treatment user reads as control — deliberately
 * belt-and-braces, because that particular mistake is invisible from the
 * console (normal exposures, no effect).
 *
 * `payloadKey` is the key that would carry a destination for this surface:
 * `deeplink` for the standing arm, `landings` for the per-code one.
 */
function isTreatment(
  evaluation: AbtestEvaluation | null,
  treatmentVariantId: string,
  payloadKey: "deeplink" | "landings"
): evaluation is { inExperiment: true; variantId: string; payload: Record<string, unknown> } {
  if (evaluation === null || !evaluation.inExperiment) return false;
  if (payloadKey in evaluation.payload) return true;
  return evaluation.variantId === treatmentVariantId;
}

/**
 * Where does this user land on app open? (TAM-258)
 *
 * ── THE LADDER ──────────────────────────────────────────────────────────────
 *  1. Registered before the experiment start (or never verified) → out.
 *  2. App version below the floor, absent, or garbled → out.
 *  3–6. Referral arm, ad landing not yet consumed → the module their install ad
 *       names (`utm_matched`), or Home with the reason why (`utm_missing` /
 *       `utm_unmatched`).
 *  7. Direct arm → Status (`bucket_assigned`).
 *  8. Everything else — control, no answer, already consumed → Home.
 *
 * ── WHY THE AD ARM IS CHECKED FIRST ─────────────────────────────────────────
 * It cannot actually collide: the console ranges are disjoint (950–999 vs
 * 900–949), so no subject is ever in both arms. The order is fixed anyway so
 * that a console misconfiguration producing an overlap resolves deterministically
 * instead of depending on which promise settled first.
 *
 * ── NEVER THROWS ────────────────────────────────────────────────────────────
 * `evaluateAbtest` collapses every failure — unconfigured env, timeout, 5xx,
 * HTML from a WAF, the service's own fail-soft `bucket: -1` — to `null`, and
 * `null` here means Home. This resolves on `GET /users/me`, the call the app
 * boots on; an experiment answer is the least important thing happening on that
 * request.
 *
 * Note what is deliberately ABSENT: an in-process bucket fallback, the shape
 * `chat.buckets.ts` / `home.buckets.ts` / `paywall.buckets.ts` all have. Those
 * surfaces have a sensible local answer when the service is down. This one does
 * not — the whole experiment is defined by bucket ranges that live in the
 * console, so "the console could not be reached" cannot mean anything except
 * today's behaviour, which is Home.
 */
export async function resolveLanding(args: {
  userId: string;
  appVersion: string | undefined;
  row: LandingUserRow | null;
  now?: Date;
}): Promise<LandingDecision> {
  const { userId, appVersion, row } = args;

  // Rung 1 — cohort. `phoneVerifiedAt`, not `createdAt`: the row is written at
  // OTP SEND (TAM-154), so `createdAt` would sweep in leads who asked for a code
  // and never came back, while this column is stamped by the verify that also
  // emits `registration_successful` — the event the cohort is defined on.
  if (row === null || row.phoneVerifiedAt === null) return { landing: HOME_NOT_IN_EXPERIMENT, consume: false };
  if (row.phoneVerifiedAt.getTime() < experimentStartAt().getTime()) {
    return { landing: HOME_NOT_IN_EXPERIMENT, consume: false };
  }

  // Rung 2 — the client has to be able to RENDER the destination.
  if (!semverGte(appVersion, LANDING_MIN_APP_VERSION)) {
    return { landing: HOME_NOT_IN_EXPERIMENT, consume: false };
  }

  // Both evaluations are independent and both sit on the app-launch path, so
  // pay for one round trip rather than two.
  const [direct, referral] = await Promise.all([
    evaluateAbtest(userId, LANDING_DIRECT_ABTEST_API_ID, { appVersion }),
    evaluateAbtest(userId, LANDING_REFERRAL_ABTEST_API_ID, { appVersion }),
  ]);

  // Rungs 3–6 — the one-time ad arrival.
  if (
    isTreatment(referral, LANDING_REFERRAL_TREATMENT_VARIANT, "landings") &&
    row.adLandingConsumedAt === null
  ) {
    const code = readLandingCode(row.firstUtmGroup);
    // Console first, built-in map second — and both are validated by the same
    // rule, so the trusted path cannot drift from the untrusted one.
    const deeplink =
      code === null
        ? null
        : (overrideFor(referral.payload, code) ??
          safeLandingDeeplink(deeplinkForLandingCode(code)));
    if (code !== null && deeplink !== null) {
      // The only rung that spends the marker: a landing was actually served.
      return { landing: landAt(deeplink, "utm_matched", code), consume: true };
    }
    // Nothing was served, so nothing is spent — a user whose first touch is
    // organic keeps an unspent marker forever, which costs nothing and means a
    // naming fix upstream is not defeated by a lookup that already "used" it.
    const hasGroup = (row.firstUtmGroup ?? "").trim() !== "";
    return {
      landing: home(hasGroup ? "utm_unmatched" : "utm_missing", ""),
      consume: false,
    };
  }

  // Rung 7 — the standing, every-open landing. Console-overridable too
  // (`payload.deeplink`), so this arm can be pointed at a different surface
  // without a deploy; an invalid override falls back to the built-in default
  // rather than to Home, because the arm's intent is "land them somewhere".
  if (isTreatment(direct, LANDING_DIRECT_TREATMENT_VARIANT, "deeplink")) {
    const deeplink =
      safeLandingDeeplink(direct.payload["deeplink"]) ??
      safeLandingDeeplink(LANDING_DIRECT_DEEPLINK) ??
      "";
    return { landing: landAt(deeplink, "bucket_assigned", ""), consume: false };
  }

  // Rung 8. Controls, unanswered evaluations and already-consumed ad landings
  // all arrive here, and they are genuinely the same answer: Home, as today.
  return { landing: HOME_NOT_IN_EXPERIMENT, consume: false };
}

/**
 * The configured experiment start, or the placeholder default.
 *
 * An unparseable env value falls back to the default rather than to "no gate":
 * a typo must not be able to enrol the entire existing user base in an
 * experiment whose cohort rule explicitly excludes them.
 */
function experimentStartAt(): Date {
  const raw = loadEnv().LANDING_EXPERIMENT_START_AT;
  if (raw !== undefined && raw !== "") {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    log.warn({ value: raw }, "LANDING_EXPERIMENT_START_AT is unparseable; using the built-in default");
  }
  return new Date(DEFAULT_LANDING_EXPERIMENT_START_AT);
}
