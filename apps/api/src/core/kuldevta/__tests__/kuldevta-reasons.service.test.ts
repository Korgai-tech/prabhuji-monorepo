import { loadRegistry } from "@prabhuji/kuldevta-registry";
import { describe, expect, it } from "vitest";

import { buildReasons } from "../services/kuldevta-reasons.service.js";
import type { KuldevtaProfile, MatchResult } from "../types.js";

const registry = loadRegistry();
const deity = (id: string) => registry.deities.find((d) => d.id === id)!;

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
const match = (matchedOn: string[], slug = "tulja_bhavani"): MatchResult => ({
  slug,
  tier: "likely",
  matchedOn,
});

describe("buildReasons", () => {
  it("quotes the family's own words back to them", () => {
    const r = buildReasons(
      match(["community", "place"]),
      profile({
        community: "Deshastha Brahmin",
        ancestral_place: { village: null, district: null, state: null, raw: "Tuljapur" },
      }),
      deity("tulja_bhavani")
    );
    expect(r.join(" ")).toContain("Deshastha Brahmin");
    expect(r.join(" ")).toContain("Tuljapur");
  });

  it("uses devi or devta from the registry, not a guess", () => {
    const devi = buildReasons(match(["community"]), profile({ community: "Maratha" }), deity("tulja_bhavani"));
    const devta = buildReasons(match(["community"]), profile({ community: "Dhangar" }), deity("khandoba"));
    expect(devi[0]).toContain("devi");
    expect(devta[0]).toContain("devta");
  });

  // An empty list reads as a broken screen. A fallback is a real outcome and
  // the family can act on it — by answering again — so it says so plainly
  // rather than inventing evidence for a deity nobody matched them to.
  it("never returns an empty list, and is honest about a fallback", () => {
    const r = buildReasons(match([], "hanuman_ji"), profile(), deity("hanuman_ji"));
    expect(r.length).toBeGreaterThan(0);
    expect(r.join(" ")).toContain("pakka nahi");
    expect(r.join(" ")).toContain("Hanuman");
  });

  it("emits one line per piece of evidence", () => {
    const r = buildReasons(
      match(["community", "gotra"]),
      profile({ community: "Oswal", gotra: "Dadhich" }),
      deity("sachiya_mata")
    );
    expect(r).toHaveLength(2);
  });

  it("does not claim evidence the profile does not carry", () => {
    // matchedOn says community, but the profile has no community text — the
    // line would be "Aapka samaj — null —", so it is skipped.
    const r = buildReasons(match(["community"]), profile(), deity("tulja_bhavani"));
    expect(r.join(" ")).not.toContain("null");
  });
});

describe("place wording", () => {
  it("does not name the same place twice", () => {
    // Nagnechi's temple is at Nagana, Barmer — exactly what a Rathore family
    // from there answers, so the two-clause form repeated itself verbatim.
    const r = buildReasons(
      match(["community", "place"], "nagnechi"),
      profile({
        community: "Rathore Rajput",
        ancestral_place: {
          village: null,
          district: null,
          state: null,
          raw: "Nagana, Barmer, Rajasthan",
        },
      }),
      deity("nagnechi")
    );
    const placeLine = r.find((x) => x.includes("mandir"))!;
    expect(placeLine).toBeDefined();
    expect(placeLine.match(/Nagana/g)).toHaveLength(1);
  });

  it("keeps both clauses when the places genuinely differ", () => {
    const r = buildReasons(
      match(["place"], "karni_mata"),
      profile({
        ancestral_place: { village: null, district: null, state: null, raw: "Deshnoke" },
      }),
      deity("karni_mata")
    );
    expect(r.join(" ")).toContain("Deshnoke");
  });
});
