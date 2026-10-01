import { describe, expect, it } from "vitest";
import { loadRegistry } from "../index.js";

describe("kuldevta registry snapshot", () => {
  const r = loadRegistry();

  it("has 33 deities, 12 archetypes, 8 region defaults", () => {
    expect(r.deities).toHaveLength(33);
    expect(r.archetypes).toHaveLength(12);
    expect(r.regionDefaults).toHaveLength(8);
  });

  it("parses semicolon lists rather than comma lists", () => {
    const tulja = r.deities.find((d) => d.id === "tulja_bhavani")!;
    expect(tulja.communities).toContain("Maratha (many kul)");
    expect(tulja.communities).toContain("Bhosale");
  });

  it("preserves Devanagari intact", () => {
    const khandoba = r.deities.find((d) => d.id === "khandoba")!;
    expect(khandoba.nameDevanagari).toBe("खंडोबा");
    expect(khandoba.mantra).toContain("मार्तण्ड");
  });

  it("every archetype referenced by a deity exists", () => {
    const ids = new Set(r.archetypes.map((a) => a.id));
    for (const d of r.deities) expect(ids).toContain(d.archetype);
  });

  it("every region default points at a real deity id", () => {
    const ids = new Set(r.deities.map((d) => d.id));
    for (const rd of r.regionDefaults) expect(ids).toContain(rd.defaultDeityId);
  });

  it("applies the v1 overrides (D9a)", () => {
    expect(r.regionDefaults.find((x) => x.regionCode === "ALL")!.defaultDeityId).toBe("hanuman_ji");
    expect(r.deities.find((d) => d.id === "kuldevi_anaam")!.active).toBe(false);
  });
});

/**
 * The niyam is the most specific claim this product makes: the deity telling a
 * household what that household observes. A blank one is handled gracefully
 * (the persona says it does not carry the niyam and points to the elders), but
 * a MALFORMED one is not — it is read aloud as devotional instruction.
 */
describe("niyam", () => {
  const registry = loadRegistry();

  test("every persona-enabled deity carries at least one niyam", () => {
    const bare = registry.deities
      .filter((d) => d.personaEnabled && d.niyam.length === 0)
      .map((d) => d.id);
    expect(bare).toEqual([]);
  });

  test("no niyam string is empty or untrimmed", () => {
    for (const d of registry.deities) {
      for (const n of d.niyam) {
        expect(n).toBe(n.trim());
        expect(n.length).toBeGreaterThan(0);
      }
    }
  });

  test("niyam are Hinglish in Roman script, not Devanagari", () => {
    // Devanagari belongs to `mantra`, which is chanted verbatim. The niyam is
    // instruction, and the whole app's devotional register is Roman-script
    // Hinglish — matching the reasons on the identification screen.
    const devanagari = /[ऀ-ॿ]/;
    const offenders = registry.deities.flatMap((d) =>
      d.niyam.filter((n) => devanagari.test(n)).map((n) => `${d.id}: ${n}`)
    );
    expect(offenders).toEqual([]);
  });

  test("niyam are not the internal English notes they replaced", () => {
    // The original strings were research notes ABOUT a family, in English,
    // which the persona then read aloud TO that family. Third-person English
    // phrasing is the tell.
    const englishTell = /\b(families|the family|is not permitted|is performed|are observed)\b/i;
    const offenders = registry.deities.flatMap((d) =>
      d.niyam.filter((n) => englishTell.test(n)).map((n) => `${d.id}: ${n}`)
    );
    expect(offenders).toEqual([]);
  });

  test("niyam content is flagged as awaiting subject-matter review", () => {
    // Authored in-house from the reviewed weeklyDay/offerings/festivals on the
    // same row. Defensible, not verified. When an expert signs a deity off,
    // flip its flag — and this assertion is what will tell you the sweep is
    // finished.
    const reviewed = registry.deities.filter((d) => d.niyamReviewed).map((d) => d.id);
    expect(reviewed).toEqual([]);
  });
});
