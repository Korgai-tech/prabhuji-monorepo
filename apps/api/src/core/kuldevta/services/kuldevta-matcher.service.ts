import type { Registry, RegistryDeity } from "@prabhuji/kuldevta-registry";

import type { AssignmentTier, KuldevtaProfile, MatchResult } from "../types.js";

/**
 * Lowercase, strip punctuation (keeping Devanagari/Gujarati script ranges),
 * and collapse whitespace so free-text profile fields and registry fields
 * compare on equal footing.
 */
const norm = (s: string | null | undefined): string =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ઀-૿ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Whole-word containment, so "amba" does not match inside "ambabai". */
function mentions(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return new RegExp(`(^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(haystack);
}

/**
 * A registry community string often bundles several communities together
 * ("Dadhich / Dahima Brahmin", "Maratha (many kul)"). A profile value only
 * ever names one of them ("Dadhich Brahmin"). Rather than requiring the
 * profile phrase to appear verbatim (it usually won't — the source strings
 * interleave extra words), require every whole word of the profile phrase to
 * appear as a whole word in the registry entry. The direction matters: it
 * must NOT be picked by "whichever side is shorter", or a bare one-word
 * registry entry like khodiyar's `"Rajput"` would match any profile phrase
 * that merely contains "rajput" among other words — e.g. "Rathore Rajput"
 * would wrongly match khodiyar even though khodiyar's data never mentions
 * Rathore at all.
 */
function communityMatches(registryCommunity: string, profileValue: string): boolean {
  if (!registryCommunity || !profileValue) return false;
  const registryWords = new Set(registryCommunity.split(" ").filter(Boolean));
  const profileWords = profileValue.split(" ").filter(Boolean);
  return profileWords.length > 0 && profileWords.every((w) => registryWords.has(w));
}

/**
 * How many active deities a normalised community word appears under, computed
 * fresh from the registry each call (never hand-maintained) so it can't drift
 * from the data it describes. Words like "families" or "Rajput" cover a large
 * share of the 32 active deities and are useless for narrowing anything down;
 * words like "Dadhich" or "Rathore" name one lineage or a small handful.
 */
function buildCommunityTokenDeityCounts(pool: RegistryDeity[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of pool) {
    const tokens = new Set<string>();
    for (const c of d.communities) {
      for (const w of norm(c).split(" ").filter(Boolean)) tokens.add(w);
    }
    for (const w of tokens) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return counts;
}

/**
 * A community token counts as "distinctive" when at most this many active
 * deities carry it. Chosen from the real registry distribution (32 active
 * deities): the tokens that identify a single lineage or a small cluster of
 * closely related ones top out at 3 ("rathore" → karni_mata/nagnechi/pabuji,
 * "dadhich" → dadhimati alone), while the generic connective words used
 * across many rows start at 6 ("maratha") and climb past that ("many" 8,
 * "rajput" 12, "families" 16). 3 draws the line on the distinctive side of
 * that gap without excluding any of the real multi-lineage tokens.
 *
 * This count alone is not sufficient — see NON_DISTINCTIVE_COMMUNITY_TOKENS.
 */
const DISTINCTIVE_TOKEN_MAX_DEITIES = 3;

/**
 * The minimum length of a token that may be called distinctive.
 *
 * `buildCommunityTokenDeityCounts` counts EVERY word of every registry
 * community string, including the prose the registry writes those strings in,
 * so short connectives score as rare. Two characters is enough to exclude
 * "is", "by" and "of"; the remaining three-character prose ("the", "all",
 * "any", "has", "kul", "pan") is named explicitly in
 * NON_DISTINCTIVE_COMMUNITY_TOKENS instead of being cut by length.
 *
 * The threshold sits at 3 rather than 4 because "ckp" — Chandraseniya
 * Kayastha Prabhu — is a genuine community name at count=1, uniquely
 * identifying ekvira. A length cut of 4 silently sent every family answering
 * with that abbreviation to a region default. No two-character token in the
 * registry is a community name, so 3 is the lowest useful floor.
 */
const DISTINCTIVE_TOKEN_MIN_LENGTH = 3;

/**
 * Words that a plain deity-count cannot flag as generic. Two groups.
 *
 * GROUP 1 — varna and religion labels. "Brahmin" happens to sit at count=2 in
 * today's registry (renuka_mahur via "Deshastha Brahmin", dadhimati via
 * "Dadhich / Dahima Brahmin") — two completely unrelated lineages that merely
 * share a varna — so the numeric threshold would wrongly call it distinctive.
 * Statistics can't fix this: "jain" sits at count=1 (only sachiya_mata's
 * community list mentions it) yet names a religion spanning thousands of
 * unrelated families, so a *lower* threshold would just create a new false
 * negative rather than closing this one. "Hindu" and "Muslim" are the same
 * failure at its most damaging: verified count=1 each (sachiya_mata,
 * ramdev_ji), so before this list a family answering samaj = "Hindu" — an
 * entirely ordinary answer — was handed Sachiya Mata at tier `likely`.
 *
 * GROUP 2 — the registry's own descriptive prose, which the token counter
 * cannot distinguish from a community name because it counts every word of
 * every community string. "kuldevi", "deity", "universal" and "interim" all
 * sit at count=1 via hanuman_ji's placeholder description; "family",
 * "families" and "community" are how the registry phrases entries generally.
 *
 * This is documented domain knowledge — a label describing a caste, varna or
 * religious category, or a word the registry writes ABOUT communities rather
 * than one that names a community — not a tuned cutoff, so it is kept as an
 * explicit, commented set. Deliberately small: only labels wide enough to
 * span many unrelated lineages, and prose that is not a community name at
 * all, belong here. Longer descriptive words the counter still calls
 * distinctive ("revered", "descended", "border", "line") are left to the
 * numeric threshold: none is a plausible answer to "aap kis samaj se hain?",
 * and hand-maintaining the registry's entire vocabulary here would be its own
 * drift hazard.
 */
const NON_DISTINCTIVE_COMMUNITY_TOKENS = new Set([
  // Group 1 — varna / caste / religion labels
  "brahmin", // varna label; spans dadhimati and renuka_mahur, two unrelated lineages
  "rajput", // caste label; already the highest-count token in the registry (12/32)
  "bania", // trading-caste label; spans Oswal/Agarwal/Khandelwal/Maheshwari and more
  "kshatriya", // varna label, not a lineage
  "vaishya", // varna label, not a lineage
  "jain", // religion, not a lineage; registry token count (1) understates its breadth
  "hindu", // religion; count=1 (sachiya_mata) but names the majority of India
  "muslim", // religion; count=1 (ramdev_ji) via its cross-community description
  "sikh", // religion, not a lineage
  // Group 2 — registry prose, not community names
  "family",
  "families",
  "community",
  "universal",
  "deity",
  "kuldevi",
  "interim",
  "the",
  "all",
  "any",
  "has",
  "kul",
  "pan",
  // Group 3 — a caste label that the count alone calls distinctive.
  // "jat" sits at count=3, at the numeric threshold, across three unrelated
  // lineages. Admitting it would hand a Jat family an arbitrary pick among
  // them; falling through to a region default is the better failure.
  "jat",
]);

function hasDistinctiveCommunityToken(value: string, tokenCounts: Map<string, number>): boolean {
  return value
    .split(" ")
    .filter(Boolean)
    .some(
      (w) =>
        w.length >= DISTINCTIVE_TOKEN_MIN_LENGTH &&
        !NON_DISTINCTIVE_COMMUNITY_TOKENS.has(w) &&
        (tokenCounts.get(w) ?? Number.POSITIVE_INFINITY) <= DISTINCTIVE_TOKEN_MAX_DEITIES,
    );
}

const confidenceRank = (c: RegistryDeity["confidence"]): number => (c === "high" ? 1 : 0);

const STATE_CODES: Record<string, string[]> = {
  maharashtra: ["MH"],
  gujarat: ["GJ"],
  rajasthan: ["RJ", "RJ-W", "RJ-E", "RJ-S", "RJ-NE"],
  karnataka: ["KA", "KA-N"],
  haryana: ["HR"],
  punjab: ["PB"],
  "madhya pradesh": ["MP", "MP-N"],
  "uttar pradesh": ["UP-W"],
};

/**
 * The minimum length of a place token that may be trusted to identify a
 * deity. Same reasoning as DISTINCTIVE_TOKEN_MIN_LENGTH: the registry writes
 * its geography in prose ("Jaipur / Sikar", "Sundha hill, Bhinmal"), so the
 * connectives have to be excluded. No place name in the registry is shorter.
 */
const PLACE_TOKEN_MIN_LENGTH = 4;

/**
 * Place tokens that name a region rather than a locality, and so cannot
 * narrow anything: a state name matches every deity in that state.
 */
const NON_DISTINCTIVE_PLACE_TOKENS = new Set([
  "rajasthan",
  "gujarat",
  "maharashtra",
  "karnataka",
  "india",
  "hill",
  "near",
  "region",
  "district",
]);

/**
 * Which deities each place token points at, built fresh from the registry's
 * OWN geography (`templeDistrict`, `templeVillage`) rather than from a
 * hand-maintained district map.
 *
 * This is the whole reason a separate district -> sub-region table is not
 * needed. The registry already records where each deity's temple stands, and
 * across the 33 active deities those two fields yield 61 place tokens of
 * which 55 identify exactly one deity. The six that do not — jaipur,
 * jodhpur, nagaur, sikar, mehsana, pune — each point at exactly two, and
 * every one of those pairs is separated by community.
 *
 * Deriving the index instead of authoring it means adding a deity extends
 * the index in the same commit, and the index can never disagree with the
 * data it describes.
 */
function buildPlaceIndex(pool: RegistryDeity[]): Map<string, RegistryDeity[]> {
  const index = new Map<string, RegistryDeity[]>();
  for (const d of pool) {
    const tokens = new Set<string>();
    for (const field of [d.templeDistrict, d.templeVillage]) {
      for (const word of norm(field).split(" ")) {
        if (word.length >= PLACE_TOKEN_MIN_LENGTH && !NON_DISTINCTIVE_PLACE_TOKENS.has(word)) {
          tokens.add(word);
        }
      }
    }
    for (const token of tokens) {
      const bucket = index.get(token);
      if (bucket) {
        if (!bucket.includes(d)) bucket.push(d);
      } else {
        index.set(token, [d]);
      }
    }
  }
  return index;
}

/**
 * The deities whose temple geography matches the place the family named.
 *
 * A family answers question 2 with a town or a district — "Osian",
 * "Jhunjhunu", "Deshnoke" — not with a historical sub-region. Both the
 * village and district fields of the profile are searched against the same
 * index, because families do not reliably put a town in the town slot.
 *
 * Returned in registry order and de-duplicated; an empty array means the
 * place told us nothing, which is the common case and not an error.
 */
function matchPlace(placeIndex: Map<string, RegistryDeity[]>, values: string[]): RegistryDeity[] {
  const hits: RegistryDeity[] = [];
  for (const value of values) {
    for (const word of value.split(" ")) {
      if (word.length < PLACE_TOKEN_MIN_LENGTH) continue;
      for (const d of placeIndex.get(word) ?? []) {
        if (!hits.includes(d)) hits.push(d);
      }
    }
  }
  return hits;
}

/**
 * Attaches `candidates` only when the ladder actually had a choice to make.
 * A single candidate leaves the field undefined — see MatchResult.
 */
function withCandidates(result: MatchResult, candidates: RegistryDeity[]): MatchResult {
  if (candidates.length < 2) return result;
  const ids = [result.slug, ...candidates.map((d) => d.id).filter((id) => id !== result.slug)];
  return { ...result, candidates: ids };
}

/**
 * The state named inside a free-text place answer, or "".
 *
 * `STATE_CODES` is keyed by state name, and the parser often leaves
 * `ancestral_place.state` null while `raw` holds "Tuljapur, Maharashtra". With
 * no state the region tiers cannot fire at all, so a family that named their
 * state in plain words was treated as having named nothing.
 *
 * Whole-word matched, longest first, so "uttar pradesh" is not shadowed by a
 * shorter key that happens to be a substring of it.
 */
function stateWithin(raw: string): string {
  if (!raw) return "";
  const names = Object.keys(STATE_CODES).sort((a, b) => b.length - a.length);
  return names.find((name) => mentions(raw, name)) ?? "";
}

/**
 * Deterministically assigns a kuldevta to a lineage profile by walking a
 * fixed ladder of tiers from most to least specific. Pure function: no I/O,
 * no randomness — the same profile against the same registry always
 * produces the same result.
 */
export function matchKuldevta(profile: KuldevtaProfile, registry: Registry): MatchResult {
  const pool = registry.deities.filter((d) => d.active);

  const signals = norm(
    [profile.soft_signals.temple_mentioned, profile.soft_signals.mandir_photo, ...profile.soft_signals.other]
      .filter(Boolean)
      .join(" "),
  );
  const community = norm(profile.community);
  const communityInferred = norm(profile.community_inferred);
  const gotra = profile.gotra_defaulted ? "" : norm(profile.gotra);
  const village = norm(profile.ancestral_place.village);
  const district = norm(profile.ancestral_place.district);
  const placeRaw = norm(profile.ancestral_place.raw);
  // The parser routinely fills `raw` and leaves the structured fields null —
  // verified on stage, where the answer "Jodhpur" arrived as
  // {raw: "Jodhpur", village: null, district: null, state: null}. Reading only
  // the structured fields meant place matching never fired for the single most
  // common shape of answer: a bare place name. `raw` is free text, but
  // `matchPlace` tokenises and requires a >=4-character token that is not a
  // state name, so feeding it prose is safe.
  const state = norm(profile.ancestral_place.state) || stateWithin(placeRaw);
  const stateCodes = STATE_CODES[state] ?? [];
  const placeIndex = buildPlaceIndex(pool);
  // Both slots are searched: families do not reliably put a town in the town
  // field, and the parser records whatever they said where it best fits.
  const placeMatches = matchPlace(placeIndex, [village, district, placeRaw].filter(Boolean));

  const hasCommunity = (d: RegistryDeity, value: string): boolean =>
    !!value && d.communities.some((x) => communityMatches(norm(x), value));
  const inRegion = (d: RegistryDeity): boolean =>
    d.states.some((s) => stateCodes.includes(s)) || d.states.includes("ALL");

  // Tier 1 — alias hit. The family named the deity or its temple themselves.
  // Some deities legitimately share an alias (e.g. "Ambabai" is used for
  // both Tulja Bhavani and the Kolhapur Mahalakshmi), so collect every
  // matching deity and, when there is more than one, break the tie using
  // whatever ancestral-place detail the profile carries before falling
  // back to registry order.
  if (signals) {
    const candidates = pool.filter((d) => {
      const names = [d.nameRoman, d.nameDevanagari, ...d.aliases, d.templeVillage ?? ""]
        .map(norm)
        .filter(Boolean)
        // longest first so a longer alias match is not shadowed while checking
        .sort((a, b) => b.length - a.length);
      return names.some((n) => mentions(signals, n));
    });

    if (candidates.length === 1) {
      return { slug: candidates[0].id, tier: "confirmed", matchedOn: ["alias"] };
    }
    if (candidates.length > 1) {
      // Compound fields like templeDistrict ("Jaipur / Sikar") and
      // templeVillage ("Chittorgarh / Udaipur") bundle more than one place
      // name, so score with the same whole-word `mentions` helper tier 2
      // uses below rather than exact equality — otherwise the single most
      // natural place name a family gives (e.g. "Osmanabad" for Tuljapur's
      // district, officially "Dharashiv (Osmanabad)") scores nothing.
      const scored = candidates
        .map((d) => {
          let score = 0;
          if (village && mentions(norm(d.templeVillage), village)) score += 3;
          if (district && mentions(norm(d.templeDistrict), district)) score += 2;
          if (state && mentions(norm(d.templeState), state)) score += 1;
          return { d, score };
        })
        // Rank deterministically by content the registry carries, never by
        // where a deity happens to sit in deities.json: region score first,
        // then the registry's own confidence rating, then never preferring
        // a designated fallback deity, then alphabetically by id as the
        // final tiebreaker. Reordering the JSON file cannot change any of
        // these, so it cannot flip the answer.
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (confidenceRank(b.d.confidence) !== confidenceRank(a.d.confidence)) {
            return confidenceRank(b.d.confidence) - confidenceRank(a.d.confidence);
          }
          if (a.d.isFallback !== b.d.isFallback) return a.d.isFallback ? 1 : -1;
          return a.d.id.localeCompare(b.d.id);
        });

      const best = scored[0];
      const runnerUp = scored[1];
      // An ambiguous alias (two deities sharing one exact name/alias) only
      // earns "confirmed" when the place details actually separate them. A
      // tied region score means the alias alone is still ambiguous — the
      // deterministic tiebreak above still has to pick one slug to return,
      // but it does not get to claim the top-confidence tier for a coin
      // flip, and "region" cannot be credited with discriminating nothing.
      const regionDiscriminated = best.score > runnerUp.score;
      const tier: AssignmentTier = regionDiscriminated ? "confirmed" : "likely";
      const matchedOn = regionDiscriminated && best.score > 0 ? ["alias", "region"] : ["alias"];
      // When the place details did NOT separate them, the returned slug is a
      // deterministic tiebreak among equals — exactly the case a follow-up
      // question resolves, so the alternatives travel with the answer.
      const result: MatchResult = { slug: best.d.id, tier, matchedOn };
      return regionDiscriminated ? result : withCandidates(result, candidates);
    }
  }

  // Tier 2 — community + gotra + village
  for (const d of pool) {
    if (
      hasCommunity(d, community) &&
      gotra &&
      hasCommunity(d, gotra) &&
      village &&
      mentions(norm(d.templeVillage ?? ""), village)
    ) {
      return { slug: d.id, tier: "confirmed", matchedOn: ["community", "gotra", "village"] };
    }
  }

  // Tier 3 — community + gotra
  for (const d of pool) {
    if (hasCommunity(d, community) && gotra && hasCommunity(d, gotra)) {
      return { slug: d.id, tier: "likely", matchedOn: ["community", "gotra"] };
    }
  }

  // Tier 3b — community + place. The family named both a community the
  // registry lists and a town or district where one of those deities' temples
  // actually stands.
  //
  // Deliberately "likely" and NOT "confirmed", even on a unique hit. Both
  // signals are population-level priors: being Oswal and being from Jodhpur
  // makes Sachiya Mata a very good inference about a family, but neither is
  // the family telling us anything about their own lineage. "confirmed" is
  // reserved for evidence that comes from the household itself — tier 1's
  // alias (they named the deity) or tier 2's three-way agreement. Promoting
  // this tier pushed the golden set to 23 of 40 confirmed, which is what the
  // over-generosity tripwire exists to catch, and the tripwire was right.
  //
  // What place DOES buy here is discrimination: jaipur maps to jamwai_mata
  // (Kachhwaha) and shakambhari (Chauhan / Khandelwal), and the community
  // picks between them.
  if (community && placeMatches.length > 0) {
    const byCommunityAndPlace = placeMatches.filter((d) => hasCommunity(d, community));
    if (byCommunityAndPlace.length === 1) {
      return {
        slug: byCommunityAndPlace[0].id,
        tier: "likely",
        matchedOn: ["community", "place"],
      };
    }
    if (byCommunityAndPlace.length > 1) {
      return withCandidates(
        {
          slug: byCommunityAndPlace[0].id,
          tier: "likely",
          matchedOn: ["community", "place"],
        },
        byCommunityAndPlace,
      );
    }
  }

  // Tier 4 — community + region. Prefer an explicit community listing.
  // A community-only match is only trustworthy when the profile's community
  // text contains at least one token that is itself distinctive in the
  // registry (see hasDistinctiveCommunityToken). Otherwise the "match" is
  // really just a generic word ("Rajput", "families") that a dozen unrelated
  // deities all happen to share, and the wrong one wins purely by whichever
  // sits earliest in the data file — exactly the failure mode this guards.
  const communityTokenCounts = buildCommunityTokenDeityCounts(pool);
  const communityIsDistinctive = hasDistinctiveCommunityToken(community, communityTokenCounts);
  if (communityIsDistinctive) {
    const byCommunityAndRegion = pool.filter((d) => hasCommunity(d, community) && inRegion(d));
    if (byCommunityAndRegion.length > 0) {
      return { slug: byCommunityAndRegion[0].id, tier: "likely", matchedOn: ["community", "region"] };
    }
    const byCommunity = pool.filter((d) => hasCommunity(d, community));
    if (byCommunity.length > 0) {
      // Community with NO region filter is the weakest thing this tier can
      // return: it picks whichever listed deity sits first in the registry.
      // Surface the alternatives rather than pretending the pick was reasoned.
      return withCandidates(
        { slug: byCommunity[0].id, tier: "likely", matchedOn: ["community"] },
        byCommunity,
      );
    }
  }

  // Tier 4c — place alone. Weaker than any community signal, so it sits
  // below them: sharing a home district with a temple is real evidence but
  // not proof of lineage, and plenty of families live near a temple that is
  // not theirs. A place naming exactly one deity is "likely"; a place naming
  // several is "possible", with the alternatives attached.
  if (placeMatches.length === 1) {
    return { slug: placeMatches[0].id, tier: "likely", matchedOn: ["place"] };
  }
  if (placeMatches.length > 1) {
    return withCandidates(
      { slug: placeMatches[0].id, tier: "possible", matchedOn: ["place"] },
      placeMatches,
    );
  }

  // Tier 5 — surname-inferred community + region
  const byInferred = pool.filter((d) => hasCommunity(d, communityInferred) && inRegion(d));
  if (byInferred.length > 0) {
    return { slug: byInferred[0].id, tier: "possible", matchedOn: ["community_inferred", "region"] };
  }

  // Tier 6 — region default, but ONLY when the state resolves to exactly one.
  //
  // A bare state answer can map to several region codes. Rajasthan maps to
  // five (RJ, RJ-W, RJ-E, RJ-S, RJ-NE) and `.find` took whichever sat first
  // in region-defaults.json — RJ-W — so every bare-Rajasthan profile was
  // assigned nagnechi, flatly contradicting that row's own caveat, "Default
  // only when Rathore signal is present". Rajasthan is 16 of the 33 deities,
  // so this was the single widest wrong answer the matcher could give.
  //
  // Splitting Rajasthan correctly needs a district → sub-region map that does
  // not exist and that this code has no business inventing. When more than
  // one default matches, the honest answer is the one the registry already
  // designed for exactly this situation: fall through to tier 7's national
  // fallback (`hanuman_ji`, "THE TRUE FALLBACK … Never claims a name"). A
  // family that names a district or a community still reaches a real deity
  // through the tiers above; a family that says only "Rajasthan" gets told,
  // truthfully, that we do not know yet.
  //
  // Gujarat (GJ), Maharashtra (MH) and Karnataka (KA/KA-N, only KA-N having a
  // default) each resolve to exactly one row and are unaffected.
  const regionDefaults = registry.regionDefaults.filter((r) => stateCodes.includes(r.regionCode));
  if (regionDefaults.length === 1) {
    const tier: AssignmentTier = communityInferred ? "possible" : "fallback";
    return { slug: regionDefaults[0].defaultDeityId, tier, matchedOn: ["region"] };
  }

  // Tier 7 — national fallback. Always available.
  const national = registry.regionDefaults.find((r) => r.isNationalFallback);
  return { slug: national?.defaultDeityId ?? "hanuman_ji", tier: "fallback", matchedOn: [] };
}
