import { loadRegistry } from "@prabhuji/kuldevta-registry";
import type { Registry, RegistryDeity } from "@prabhuji/kuldevta-registry";
import { describe, expect, it } from "vitest";

import { matchKuldevta } from "../services/kuldevta-matcher.service.js";
import type { KuldevtaProfile } from "../types.js";

const registry = loadRegistry();

function profile(over: Partial<KuldevtaProfile> = {}): KuldevtaProfile {
  return {
    surname: null,
    surname_raw: null,
    community: null,
    community_raw: null,
    community_inferred: null,
    gotra: null,
    gotra_raw: null,
    gotra_defaulted: false,
    ancestral_place: { village: null, district: null, state: null, raw: null },
    ancestral_place_may_be_current: false,
    language: null,
    soft_signals: { temple_mentioned: null, mandir_photo: null, other: [] },
    answers_provided: 0,
    ...over,
  };
}

/** Minimal, fully-valid RegistryDeity fixture for tests that need to control
 * confidence/isFallback/array-position independently of the real data. */
function fakeDeity(overrides: Partial<RegistryDeity> & { id: string }): RegistryDeity {
  return {
    nameRoman: overrides.id,
    nameDevanagari: overrides.id,
    aliases: ["Shared Test Alias"],
    archetype: "test_archetype",
    formOf: null,
    gender: "devi",
    states: ["ALL"],
    communities: [],
    templeName: null,
    templeVillage: null,
    templeDistrict: null,
    templeState: null,
    iconography: null,
    epithets: [],
    mantra: null,
    weeklyDay: null,
    festivals: [],
    offerings: [],
    niyam: [],
    toneNotes: null,
    personaEnabled: true,
    confidence: "medium",
    notes: null,
    active: true,
    isFallback: false,
    humanReviewed: true,
    niyamReviewed: false,
    ...overrides,
  };
}

function fakeRegistry(deities: RegistryDeity[]): Registry {
  return {
    deities,
    archetypes: [],
    regionDefaults: [
      {
        regionCode: "ALL",
        region: "Any / unknown",
        defaultDeityId: deities[0]?.id ?? "hanuman_ji",
        isNationalFallback: true,
        caveat: null,
      },
    ],
  };
}

describe("matchKuldevta", () => {
  it("alias hit on the temple village wins — the case retrieval got wrong", () => {
    const r = matchKuldevta(
      profile({
        community: "Maratha",
        ancestral_place: { village: null, district: "Satara", state: "Maharashtra", raw: "Satara" },
        soft_signals: { temple_mentioned: "Jejuri wale khandoba", mandir_photo: null, other: [] },
      }),
      registry,
    );
    expect(r.slug).toBe("khandoba");
    expect(r.tier).toBe("confirmed");
    expect(r.matchedOn).toContain("alias");
  });

  it("does NOT confuse ambaji with ambabai", () => {
    const r = matchKuldevta(
      profile({
        soft_signals: { temple_mentioned: "Ambabai", mandir_photo: null, other: [] },
        ancestral_place: { village: null, district: "Kolhapur", state: "Maharashtra", raw: "Kolhapur" },
      }),
      registry,
    );
    expect(r.slug).toBe("mahalakshmi_kolhapur");
    expect(r.slug).not.toBe("ambaji");
  });

  it("community plus gotra is likely, not confirmed", () => {
    const r = matchKuldevta(
      profile({
        community: "Dadhich Brahmin",
        gotra: "Dadhich",
        ancestral_place: { village: null, district: "Nagaur", state: "Rajasthan", raw: "Nagaur" },
      }),
      registry,
    );
    expect(r.slug).toBe("dadhimati");
    expect(r.tier).toBe("likely");
  });

  it("gotra_defaulted suppresses the gotra signal so the community+gotra tier does not fire", () => {
    const base = {
      community: "Dadhich Brahmin",
      gotra: "Dadhich",
      ancestral_place: { village: null, district: "Nagaur", state: "Rajasthan", raw: "Nagaur" },
    };

    // Defaulted: gotra must contribute nothing — the match (if any) cannot
    // come from the community+gotra tier.
    const defaulted = matchKuldevta(profile({ ...base, gotra_defaulted: true }), registry);
    expect(defaulted.matchedOn).not.toContain("gotra");
    expect(defaulted.matchedOn).not.toEqual(["community", "gotra"]);

    // Not defaulted: the same gotra must actually land the community+gotra tier.
    const notDefaulted = matchKuldevta(profile({ ...base, gotra_defaulted: false }), registry);
    expect(notDefaulted.slug).toBe("dadhimati");
    expect(notDefaulted.matchedOn).toEqual(["community", "gotra"]);
  });

  // --- I4: a bare state that maps to SEVERAL region-default rows must not
  // silently pick whichever sits first in region-defaults.json. Rajasthan
  // maps to RJ-W/RJ-E/RJ-S/RJ-NE, and RJ-W's own caveat is "Default only when
  // Rathore signal is present" — so applying nagnechi to every bare-Rajasthan
  // family contradicted the registry's own data. Rajasthan is 16 of 33
  // deities, making this the widest wrong answer available to the matcher.
  it("does not claim a region default for a bare state that maps to several regions", () => {
    const r = matchKuldevta(
      profile({ ancestral_place: { village: null, district: null, state: "Rajasthan", raw: "Rajasthan" } }),
      registry,
    );
    expect(r.slug).toBe("hanuman_ji");
    expect(r.tier).toBe("fallback");
    expect(r.matchedOn).not.toContain("region");
  });

  it("still applies the region default for a state that maps to exactly one region", () => {
    for (const [state, slug] of [
      ["Gujarat", "ambaji"],
      ["Maharashtra", "tulja_bhavani"],
      ["Karnataka", "renuka_mahur"],
    ] as const) {
      const r = matchKuldevta(
        profile({ ancestral_place: { village: null, district: null, state, raw: state } }),
        registry,
      );
      expect(r.slug).toBe(slug);
      expect(r.matchedOn).toEqual(["region"]);
    }
  });

  it("falls back to the region default when only the state is known", () => {
    const r = matchKuldevta(
      profile({
        ancestral_place: { village: null, district: null, state: "Gujarat", raw: "Gujarat" },
      }),
      registry,
    );
    expect(r.slug).toBe("ambaji");
    expect(["possible", "fallback"]).toContain(r.tier);
  });

  it("returns hanuman_ji when nothing at all matches", () => {
    const r = matchKuldevta(profile(), registry);
    expect(r.slug).toBe("hanuman_ji");
    expect(r.tier).toBe("fallback");
  });

  it("never returns an inactive deity", () => {
    const r = matchKuldevta(
      profile({
        soft_signals: { temple_mentioned: "Anaam Kuldevi", mandir_photo: null, other: [] },
      }),
      registry,
    );
    expect(r.slug).not.toBe("kuldevi_anaam");
  });

  it("always returns a slug that exists in the registry", () => {
    const ids = new Set(registry.deities.map((d) => d.id));
    for (const state of ["Maharashtra", "Gujarat", "Rajasthan", "Kerala", "", "asdf"]) {
      const r = matchKuldevta(
        profile({
          ancestral_place: { village: null, district: null, state, raw: state },
        }),
        registry,
      );
      expect(ids).toContain(r.slug);
    }
  });

  // --- CRITICAL 1: an ambiguous alias with no discriminating region signal
  // must not be reported as "confirmed" — that's a coin flip dressed up as
  // certainty. tulja_bhavani and mahalakshmi_kolhapur both carry the exact
  // alias "Ambabai" and both list states MH/KA-N, so with no ancestral place
  // at all neither can be preferred on region grounds.
  it("an ambiguous alias with no discriminating place detail is likely, not confirmed", () => {
    const r = matchKuldevta(
      profile({ soft_signals: { temple_mentioned: "Ambabai", mandir_photo: null, other: [] } }),
      registry,
    );
    expect(r.tier).not.toBe("confirmed");
    expect(r.tier).toBe("likely");
    expect(r.matchedOn).not.toContain("region");
  });

  // --- CRITICAL 2: the tiebreak among equally-scored alias candidates must
  // be driven by registry content (confidence, then id), never by where a
  // deity happens to sit in deities.json. Proven by running the identical
  // ambiguous case with the candidates in both array orders.
  it("tier-1 ties are broken by confidence, not array order", () => {
    const highConfidence = fakeDeity({ id: "high_conf_test_deity", confidence: "high" });
    const mediumConfidence = fakeDeity({ id: "medium_conf_test_deity", confidence: "medium" });
    const signalProfile = profile({
      soft_signals: { temple_mentioned: "Shared Test Alias", mandir_photo: null, other: [] },
    });

    const withMediumFirst = matchKuldevta(signalProfile, fakeRegistry([mediumConfidence, highConfidence]));
    const withHighFirst = matchKuldevta(signalProfile, fakeRegistry([highConfidence, mediumConfidence]));

    expect(withMediumFirst.slug).toBe("high_conf_test_deity");
    expect(withHighFirst.slug).toBe("high_conf_test_deity");
    expect(withMediumFirst.tier).toBe("likely");
  });

  it("tier-1 ties with equal confidence break alphabetically by id, not array order", () => {
    const deityA = fakeDeity({ id: "aaa_test_deity", confidence: "high" });
    const deityZ = fakeDeity({ id: "zzz_test_deity", confidence: "high" });
    const signalProfile = profile({
      soft_signals: { temple_mentioned: "Shared Test Alias", mandir_photo: null, other: [] },
    });

    const zFirst = matchKuldevta(signalProfile, fakeRegistry([deityZ, deityA]));
    const aFirst = matchKuldevta(signalProfile, fakeRegistry([deityA, deityZ]));

    expect(zFirst.slug).toBe("aaa_test_deity");
    expect(aFirst.slug).toBe("aaa_test_deity");
  });

  // --- IMPORTANT 3: a community match must include at least one registry-
  // distinctive token to reach the community tier. "Rajput" alone covers 12
  // of the 32 active deities and must not resolve anything; "Rathore" is
  // distinctive enough (karni_mata, nagnechi, pabuji) that "Rathore Rajput"
  // does resolve, and only nagnechi's community entry contains both words.
  it("a generic community token alone does not qualify for the community tier", () => {
    const r = matchKuldevta(profile({ community: "Rajput" }), registry);
    expect(r.tier).not.toBe("likely");
  });

  it("a distinctive community token alone qualifies for the community tier", () => {
    const r = matchKuldevta(profile({ community: "Rathore Rajput" }), registry);
    expect(r.slug).toBe("nagnechi");
    expect(r.tier).toBe("likely");
    expect(r.matchedOn).toEqual(["community"]);
  });

  it("a distinctive community token plus region still resolves to the region-specific deity", () => {
    const r = matchKuldevta(
      profile({
        community: "Rathore Rajput",
        ancestral_place: { village: null, district: null, state: "Rajasthan", raw: "Rajasthan" },
      }),
      registry,
    );
    expect(r.slug).toBe("nagnechi");
    expect(r.tier).toBe("likely");
    expect(r.matchedOn).toEqual(["community", "region"]);
  });

  // --- Round 2 / IMPORTANT: a bare varna or religion label must not pass
  // the distinctiveness gate just because it happens to have a low token
  // count in today's registry. "Brahmin" sits at count=2 (renuka_mahur via
  // "Deshastha Brahmin", dadhimati via "Dadhich / Dahima Brahmin") — two
  // unrelated lineages that merely share a varna, not a diagnostic signal —
  // so a bare "Brahmin" answer must fall through the community tier rather
  // than land an arbitrary pick between them at "likely".
  it('a bare varna label ("Brahmin") does not qualify for the community tier', () => {
    const r = matchKuldevta(profile({ community: "Brahmin" }), registry);
    expect(r.tier).not.toBe("likely");
  });

  it('bare "Bania" and bare "Rajput" are excluded from the community tier the same way as "Brahmin"', () => {
    const bania = matchKuldevta(profile({ community: "Bania" }), registry);
    const rajput = matchKuldevta(profile({ community: "Rajput" }), registry);
    const brahmin = matchKuldevta(profile({ community: "Brahmin" }), registry);
    expect(bania.tier).not.toBe("likely");
    expect(rajput.tier).not.toBe("likely");
    expect(brahmin.tier).not.toBe("likely");
  });

  // --- I5: buildCommunityTokenDeityCounts counts every WORD of every registry
  // community string, so the registry's own prose scores as distinctive:
  // "hindu"=1 (sachiya_mata), "muslim"=1 (ramdev_ji),
  // "kuldevi"/"deity"/"universal"/"interim"=1 (hanuman_ji), plus short
  // connectives like "the", "is", "by", "of" and "all". A family answering
  // samaj = "Hindu" — an entirely ordinary answer — was handed Sachiya Mata
  // at tier `likely`.
  it('a bare religion label ("Hindu") does not qualify for the community tier', () => {
    const r = matchKuldevta(profile({ community: "Hindu" }), registry);
    expect(r.tier).not.toBe("likely");
    expect(r.slug).not.toBe("sachiya_mata");
  });

  it('a bare religion label ("Muslim") does not qualify for the community tier', () => {
    const r = matchKuldevta(profile({ community: "Muslim" }), registry);
    expect(r.tier).not.toBe("likely");
    expect(r.slug).not.toBe("ramdev_ji");
  });

  it("registry prose tokens do not qualify for the community tier", () => {
    for (const community of ["Kuldevi", "Deity", "Universal", "Interim", "Community", "Families"]) {
      expect(matchKuldevta(profile({ community }), registry).tier).not.toBe("likely");
    }
  });

  it("short connective tokens do not qualify", () => {
    for (const community of ["The", "All", "Any", "Has", "Kul", "Pan", "Of", "By", "Is"]) {
      expect(matchKuldevta(profile({ community }), registry).tier).not.toBe("likely");
    }
  });

  // A three-character community ABBREVIATION is still a community. "CKP" —
  // Chandraseniya Kayastha Prabhu — is how members of that community routinely
  // name it, and it appears under exactly one deity in the registry.
  it('a three-character community abbreviation ("CKP") still reaches the community tier', () => {
    const r = matchKuldevta(profile({ community: "CKP" }), registry);
    expect(r.tier).toBe("likely");
    expect(r.slug).toBe("ekvira");
  });

  // "jat" sits at the numeric threshold across three unrelated lineages, so
  // lowering the length floor to 3 must not let it through.
  it('a caste label at the count threshold ("Jat") does not qualify', () => {
    expect(matchKuldevta(profile({ community: "Jat" }), registry).tier).not.toBe("likely");
  });

  it('the varna half of a compound community value does not poison the distinctive half ("Dadhich Brahmin")', () => {
    // Same profile as the "community plus gotra is likely" test above, but
    // asserted here specifically to prove that excluding "brahmin" from the
    // distinctiveness gate does not also block "dadhich" when both words
    // appear together in one community answer.
    const r = matchKuldevta(
      profile({
        community: "Dadhich Brahmin",
        gotra: "Dadhich",
        ancestral_place: { village: null, district: "Nagaur", state: "Rajasthan", raw: "Nagaur" },
      }),
      registry,
    );
    expect(r.slug).toBe("dadhimati");
    expect(r.matchedOn).toEqual(["community", "gotra"]);
  });

  // --- IMPORTANT 5: templeDistrict/templeVillage hold compound values
  // ("Dharashiv (Osmanabad)"); scoring must use whole-word containment, not
  // exact equality, or the single most natural district name a Tuljapur
  // family would give ("Osmanabad") scores nothing.
  it("temple-district scoring matches inside compound registry fields", () => {
    const r = matchKuldevta(
      profile({
        soft_signals: { temple_mentioned: "Ambabai", mandir_photo: null, other: [] },
        ancestral_place: { village: null, district: "Osmanabad", state: "Maharashtra", raw: "Osmanabad" },
      }),
      registry,
    );
    expect(r.slug).toBe("tulja_bhavani");
    expect(r.tier).toBe("confirmed");
    expect(r.matchedOn).toContain("region");
  });

  // --- IMPORTANT 6: "region" must only be credited in matchedOn when it
  // actually discriminated between candidates. Here both tulja_bhavani and
  // mahalakshmi_kolhapur list Maharashtra as their templeState, so state
  // alone ties them and cannot be reported as having separated anything.
  it('does not credit "region" in matchedOn when it discriminates nothing', () => {
    const r = matchKuldevta(
      profile({
        soft_signals: { temple_mentioned: "Ambabai", mandir_photo: null, other: [] },
        ancestral_place: { village: null, district: null, state: "Maharashtra", raw: "Maharashtra" },
      }),
      registry,
    );
    expect(r.tier).toBe("likely");
    expect(r.matchedOn).not.toContain("region");
  });
});

/**
 * Place matching (proposal 1). The registry already records where every
 * deity's temple stands, so the ladder reads `templeDistrict` and
 * `templeVillage` directly instead of consulting a hand-maintained
 * district -> sub-region map. Across the 33 active deities those two fields
 * yield 61 place tokens, 55 of which identify exactly one deity.
 *
 * Families answer question 2 with a town or district — "Osian", "Deshnoke",
 * "Jhunjhunu" — essentially never with a historical sub-region, which is why
 * the sub-region map was the wrong artifact to build.
 */
describe("place matching", () => {
  const place = (district: string, over: Partial<KuldevtaProfile> = {}) =>
    profile({
      ancestral_place: { village: null, district, state: null, raw: district },
      ...over,
    });

  it("resolves a place that names exactly one deity", () => {
    const r = matchKuldevta(place("Deshnoke"), registry);
    expect(r.slug).toBe("karni_mata");
    expect(r.tier).toBe("likely");
    expect(r.matchedOn).toEqual(["place"]);
  });

  // The six ambiguous place tokens (jaipur, jodhpur, nagaur, sikar, mehsana,
  // pune) each point at exactly two deities, and community separates every
  // pair. This is the case the sub-region map was supposed to solve.
  it("uses community to separate the two deities a shared district points at", () => {
    const kachhwaha = matchKuldevta(place("Jaipur", { community: "Kachhwaha Rajput" }), registry);
    const chauhan = matchKuldevta(place("Jaipur", { community: "Chauhan Rajput" }), registry);
    expect(kachhwaha.slug).toBe("jamwai_mata");
    expect(chauhan.slug).toBe("shakambhari");
    expect(kachhwaha.slug).not.toBe(chauhan.slug);
  });

  // Both are population-level priors — being Oswal and being from Jodhpur is
  // a strong inference ABOUT a family, not the family telling us their
  // lineage. "confirmed" stays reserved for evidence the household supplies.
  it("does not award confirmed for community plus place", () => {
    const r = matchKuldevta(place("Jodhpur", { community: "Oswal" }), registry);
    expect(r.slug).toBe("sachiya_mata");
    expect(r.tier).toBe("likely");
    expect(r.matchedOn).toEqual(["community", "place"]);
  });

  it("does not let a bare state name match as a place", () => {
    // "Rajasthan" is every Rajasthani deity's templeState; matching on it
    // would resurrect exactly the wrong answer tier 6 was fixed to avoid.
    const r = matchKuldevta(place("Rajasthan"), registry);
    expect(r.matchedOn).not.toContain("place");
  });
});

/**
 * Candidates (proposal 2a). Surfaced ONLY where the ladder had a real choice
 * and broke a tie to return one slug. Nothing renders these yet — they exist
 * so ambiguity can be measured on real traffic before a disambiguation screen
 * is designed.
 */
describe("candidates", () => {
  it("attaches the alternatives when a place points at more than one deity", () => {
    const r = matchKuldevta(
      profile({
        ancestral_place: { village: null, district: "Jodhpur", state: null, raw: "Jodhpur" },
      }),
      registry,
    );
    expect(r.tier).toBe("possible");
    expect(r.candidates).toBeDefined();
    expect(r.candidates!.length).toBeGreaterThan(1);
    expect(r.candidates).toContain("sachiya_mata");
    expect(r.candidates).toContain("pabuji");
  });

  it("always lists the returned slug first, so the answer is unambiguous", () => {
    const r = matchKuldevta(
      profile({
        ancestral_place: { village: null, district: "Jodhpur", state: null, raw: "Jodhpur" },
      }),
      registry,
    );
    expect(r.candidates![0]).toBe(r.slug);
  });

  it("leaves candidates undefined for an unambiguous match", () => {
    const r = matchKuldevta(
      profile({
        ancestral_place: { village: null, district: "Deshnoke", state: null, raw: "Deshnoke" },
      }),
      registry,
    );
    expect(r.candidates).toBeUndefined();
  });
});

/**
 * Verified against stage on 2026-09-02, where this was a live defect.
 *
 * The parser routinely fills `ancestral_place.raw` and leaves village,
 * district and state null. Answering "Deshnoke" produced
 * `{raw: "Deshnoke", village: null, district: null, state: null}`, the matcher
 * read only the structured fields, and every bare place answer — the single
 * most common shape — fell through to the national fallback.
 *
 * Every unit test above set `district` directly, so all of them passed while
 * the feature did nothing in production.
 */
describe("place answers that arrive only in `raw`", () => {
  const rawPlace = (raw: string, over: Partial<KuldevtaProfile> = {}) =>
    profile({
      ancestral_place: { village: null, district: null, state: null, raw },
      ...over,
    });

  it("matches a bare place name given only in raw", () => {
    const r = matchKuldevta(rawPlace("Deshnoke"), registry);
    expect(r.slug).toBe("karni_mata");
    expect(r.matchedOn).toContain("place");
  });

  it("matches a place inside a longer raw phrase", () => {
    const r = matchKuldevta(rawPlace("Jhunjhunu, Rajasthan"), registry);
    expect(r.slug).toBe("narayani_devi");
    expect(r.matchedOn).toContain("place");
  });

  it("surfaces candidates for an ambiguous place given only in raw", () => {
    const r = matchKuldevta(rawPlace("Jodhpur"), registry);
    expect(r.candidates).toBeDefined();
    expect(r.candidates).toContain("sachiya_mata");
    expect(r.candidates).toContain("pabuji");
  });

  // With `state` null the region tiers could not fire at all, so a family who
  // named their state in plain words was treated as having named nothing.
  it("recovers the state from raw when the structured field is null", () => {
    const r = matchKuldevta(rawPlace("Unjha, Gujarat", { community: "Kadva Patidar" }), registry);
    expect(r.slug).toBe("umiya");
    expect(r.tier).not.toBe("fallback");
  });

  it("still does not treat a bare state as a place match", () => {
    expect(matchKuldevta(rawPlace("Rajasthan"), registry).matchedOn).not.toContain("place");
  });
});
