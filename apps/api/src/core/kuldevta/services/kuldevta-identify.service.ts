import type { Registry } from "@prabhuji/kuldevta-registry";

import { createModuleLogger } from "@api/shared/logs";

import type { SixAnswers } from "../repositories/index.js";
import type { AssignmentTier, KuldevtaProfile, MatchResult } from "../types.js";
import { matchKuldevta } from "./kuldevta-matcher.service.js";
import { buildReasons } from "./kuldevta-reasons.service.js";
import { repairAndParseProfile } from "./profile-json.service.js";
import { scrubSati } from "./sati-guardrail.service.js";

const log = createModuleLogger("kuldevta:identify");

/**
 * The HTTP-facing shape of a completed lineage identification. Deliberately
 * omits the raw `KuldevtaProfile`/registry internals — the controller/route
 * only ever needs the deity's public display fields plus the tier/evidence
 * used to reach them.
 */
export interface IdentifyResult {
  slug: string;
  nameRoman: string;
  nameDevanagari: string;
  /** `devi` or `devta` — drives the screen's copy ("Mata se baat karein"). */
  gender: string;
  /**
   * The deity image, an absolute URL built from `MEDIA_PUBLIC_BASE_URL` so it
   * resolves to each environment's OWN CDN. Never stored in the registry:
   * `deities.json` ships to every environment, so a baked-in host would serve
   * stage assets from production.
   */
  imageUrl: string;
  temple: { village: string | null; district: string | null; state: string | null };
  /**
   * The temple's place as one line — "Nagana, Barmer, Rajasthan" — so the card
   * does not have to decide how to join three nullable fields.
   */
  location: string | null;
  /**
   * "Ye aapki kuldevi kyu he?" — one line per piece of evidence, quoting what
   * the family actually said. Never empty; a fallback match says so plainly.
   */
  reasons: string[];
  tier: AssignmentTier;
  matchedOn: string[];
  /**
   * The other deities the matcher found plausible, when it had to break a tie.
   * Absent on an unambiguous match. Additive and currently unrendered — see
   * MatchResult.candidates.
   */
  candidates?: string[];
}

/**
 * Explicit dependency object rather than importing `callParserAgent` /
 * `loadRegistry` / a Prisma-backed repository directly: this keeps
 * `identifyKuldevta` unit-testable without network or a database, and — for
 * `saveAssignment` specifically — is the only way to satisfy
 * arch-boundaries.json, which forbids `/services/` from importing
 * `@prisma/client` at all.
 */
export interface IdentifyDeps {
  callParser: (answers: SixAnswers) => Promise<string>;
  loadRegistry: () => Registry;
  saveAssignment: (row: {
    userId: string;
    kuldevtaSlug: string;
    assignmentTier: AssignmentTier;
    matchedOn: string[];
    answers: unknown;
    profile: unknown;
  }) => Promise<void>;
  /**
   * Builds the absolute image URL for a slug. Injected rather than imported so
   * this service stays free of env and config, the same reason `saveAssignment`
   * and `callParser` are injected.
   */
  imageUrlFor: (slug: string) => string;
}

/**
 * Orchestrates the full kuldevta identification flow for one user:
 * parse the family's six free-text answers into a structured profile, match
 * it deterministically against the deity registry, then persist the
 * assignment.
 *
 * Ordering matters (spec §9.2): the matcher runs against the UNSCRUBBED
 * profile (a family may legitimately name the guarded term in a real temple
 * name — the matcher still needs it for alias matching), and `scrubSati` is
 * applied only to what gets PERSISTED, never to what is returned to the
 * caller or used for matching.
 */
export async function identifyKuldevta(
  userId: string,
  answers: SixAnswers,
  deps: IdentifyDeps
): Promise<IdentifyResult> {
  const raw = await deps.callParser(answers);
  const profile: KuldevtaProfile = repairAndParseProfile(raw);
  const registry = deps.loadRegistry();
  const match: MatchResult = matchKuldevta(profile, registry);
  const deity = registry.deities.find((d) => d.id === match.slug);
  if (!deity) throw new Error(`Matcher returned unknown slug: ${match.slug}`);

  logPlaceEvidence(profile, match);

  await deps.saveAssignment({
    userId,
    kuldevtaSlug: match.slug,
    assignmentTier: match.tier,
    matchedOn: match.matchedOn,
    answers: scrubSati(answers),
    profile: scrubSati(profile),
  });

  return {
    slug: deity.id,
    nameRoman: deity.nameRoman,
    nameDevanagari: deity.nameDevanagari,
    gender: deity.gender,
    imageUrl: deps.imageUrlFor(deity.id),
    reasons: buildReasons(match, profile, deity),
    location:
      [deity.templeVillage, deity.templeDistrict, deity.templeState]
        .filter((x): x is string => Boolean(x))
        .join(", ") || null,
    temple: {
      village: deity.templeVillage,
      district: deity.templeDistrict,
      state: deity.templeState,
    },
    tier: match.tier,
    matchedOn: match.matchedOn,
    ...(match.candidates ? { candidates: match.candidates } : {}),
  };
}

/**
 * Records what the family's ancestral place did — or failed to do — for the
 * match, so the place index grows from evidence rather than from a guess
 * about which districts belong to which historical sub-region.
 *
 * Lives here rather than in `matchKuldevta`, which is documented as a pure
 * function and must stay that way: it is the reason the ladder is testable.
 *
 * Only the place text is logged, never the surname, gotra or community, and
 * it is scrubbed first — this is a lineage question, and the answer text is
 * the most identifying thing in the profile.
 */
function logPlaceEvidence(profile: KuldevtaProfile, match: MatchResult): void {
  const place = profile.ancestral_place;
  const gaveAPlace = Boolean(place.village ?? place.district ?? place.raw);
  if (!gaveAPlace) return;

  if (!match.matchedOn.includes("place")) {
    log.info(
      {
        event: "kuldevta_place_unmatched",
        village: scrubSati(place.village),
        district: scrubSati(place.district),
        state: scrubSati(place.state),
        tier: match.tier,
        matchedOn: match.matchedOn,
      },
      "ancestral place did not match any temple in the registry"
    );
    return;
  }

  if (match.candidates) {
    log.info(
      {
        event: "kuldevta_place_ambiguous",
        district: scrubSati(place.district),
        candidates: match.candidates,
      },
      "ancestral place matched more than one deity"
    );
  }
}
