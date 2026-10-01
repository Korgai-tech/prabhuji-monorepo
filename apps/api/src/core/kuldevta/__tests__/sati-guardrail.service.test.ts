import { describe, expect, it } from "vitest";

import { assertSafeForNarayaniDevi, scrubSati } from "../services/sati-guardrail.service.js";

describe("sati guardrail", () => {
  // --- Brief's prescribed tests, verbatim ---

  it("redacts the term from nested user input", () => {
    const out = scrubSati({ a: { b: "Rani Sati Dadi mandir" }, c: ["sati sthal"] });
    expect(JSON.stringify(out).toLowerCase()).not.toContain("sati");
  });

  it("leaves innocent text untouched", () => {
    expect(scrubSati({ t: "Satara" })).toEqual({ t: "Satara" }); // must not match inside "Satara"
    expect(scrubSati({ t: "Saptashrungi" })).toEqual({ t: "Saptashrungi" });
  });

  it("blocks a reply that narrates sati", () => {
    expect(assertSafeForNarayaniDevi("She became sati on her husband's pyre.").safe).toBe(false);
  });

  it("allows ordinary devotional replies", () => {
    expect(assertSafeForNarayaniDevi("Beta, come to Jhunjhunu before the wedding.").safe).toBe(true);
  });

  it("catches the Devanagari form", () => {
    expect(assertSafeForNarayaniDevi("वह सती हो गईं").safe).toBe(false);
  });

  // --- Trap 1: word boundaries against real registry data ---

  it("does not redact 'Satara' (registry district)", () => {
    expect(scrubSati("Satara")).toBe("Satara");
  });

  it("does not redact 'Saptashrungi' (registry deity)", () => {
    expect(scrubSati("Saptashrungi")).toBe("Saptashrungi");
  });

  it("does not redact 'sati' when it is a substring of a longer word", () => {
    expect(scrubSati("I am satisfied with the darshan")).toBe("I am satisfied with the darshan");
    expect(scrubSati("dissatisfied devotees")).toBe("dissatisfied devotees");
    expect(scrubSati("Cannabis sativa is a plant")).toBe("Cannabis sativa is a plant");
  });

  // --- Trap 2: overlapping matches / consumed delimiters ---

  it("redacts both occurrences in 'sati sati' (single-space delimiter)", () => {
    const out = scrubSati("sati sati") as string;
    expect(out.toLowerCase()).not.toContain("sati");
    expect(out).toBe("[redacted] [redacted]");
  });

  it("redacts both occurrences in 'sati, sati'", () => {
    const out = scrubSati("sati, sati") as string;
    expect(out.toLowerCase()).not.toContain("sati");
    expect(out).toBe("[redacted], [redacted]");
  });

  it("redacts all three occurrences in 'sati sati sati'", () => {
    const out = scrubSati("sati sati sati") as string;
    expect(out.toLowerCase()).not.toContain("sati");
    expect(out).toBe("[redacted] [redacted] [redacted]");
  });

  // --- Trap 3: stateful /g regex used with .test() ---

  it("returns safe: false on repeated calls with the same unsafe string", () => {
    const input = "She became sati on her husband's pyre.";
    const first = assertSafeForNarayaniDevi(input);
    const second = assertSafeForNarayaniDevi(input);
    expect(first.safe).toBe(false);
    expect(second.safe).toBe(false);
  });

  it("returns safe: true on repeated calls with the same safe string", () => {
    const input = "Beta, come to Jhunjhunu before the wedding.";
    const first = assertSafeForNarayaniDevi(input);
    const second = assertSafeForNarayaniDevi(input);
    expect(first.safe).toBe(true);
    expect(second.safe).toBe(true);
  });

  // --- Trap 4: Devanagari word boundaries ---

  it("catches सती with a hyphen boundary (sati-pratha)", () => {
    expect(assertSafeForNarayaniDevi("सती-प्रथा बंद होनी चाहिए").safe).toBe(false);
  });

  it("catches सती joined with a following anusvara (सतीं)", () => {
    // सतीं = सती + ं (anusvara, a Mark, not \p{L}) — must still be caught
    expect(assertSafeForNarayaniDevi("वे सतीं हो गईं").safe).toBe(false);
  });

  it("does not redact सतीत्व (chastity/virtue), which contains सती as a substring", () => {
    // ती is followed by त (a letter), so this is a real, unrelated Sanskrit/Hindi word
    expect(scrubSati("सतीत्व एक गुण है")).toBe("सतीत्व एक गुण है");
  });

  it("does not redact असती, which contains सती prefixed by a letter", () => {
    expect(scrubSati("असती शब्द का प्रयोग मत करो")).toBe("असती शब्द का प्रयोग मत करो");
  });

  // --- Trap 5: scrubSati deep-clones and handles arbitrary JSON shapes ---

  it("does not mutate the input value", () => {
    const input = { a: { b: "sati sthal" }, c: ["sati"] };
    const snapshot = JSON.parse(JSON.stringify(input)) as typeof input;
    scrubSati(input);
    expect(input).toEqual(snapshot);
  });

  it("deep-clones nested objects and arrays rather than returning the same references", () => {
    const input = { a: { b: "hello" }, c: ["world"] };
    const out = scrubSati(input);
    expect(out).not.toBe(input);
    expect(out.a).not.toBe(input.a);
    expect(out.c).not.toBe(input.c);
    expect(out).toEqual(input);
  });

  it("passes through null, undefined, numbers and booleans without throwing", () => {
    expect(scrubSati(null)).toBe(null);
    expect(scrubSati(undefined)).toBe(undefined);
    expect(scrubSati(42)).toBe(42);
    expect(scrubSati(true)).toBe(true);
    expect(scrubSati(false)).toBe(false);
  });

  it("handles a deeply nested mixed structure with primitives, arrays and objects", () => {
    const input = {
      count: 3,
      active: true,
      note: null as string | null,
      meta: undefined,
      nested: {
        list: ["sati sthal", "Satara", { deep: "Rani Sati Dadi" }],
      },
    };
    const out = scrubSati(input);
    expect(JSON.stringify(out).toLowerCase()).not.toContain("sati");
    expect(out.count).toBe(3);
    expect(out.active).toBe(true);
    expect(out.note).toBe(null);
    expect(out.meta).toBe(undefined);
    expect((out.nested.list[1] as string)).toBe("Satara");
  });

  // --- Follow-up review: Date must round-trip, not be flattened to {} ---

  it("round-trips a Date value with its instanceof-ness and timestamp intact", () => {
    const input = new Date("2026-09-01T18:28:30.613Z");
    const out = scrubSati(input);
    expect(out).toBeInstanceOf(Date);
    expect(out.getTime()).toBe(input.getTime());
    expect(out).not.toBe(input);
  });

  it("preserves a nested Date field instead of flattening it to {}", () => {
    const input = { meta: { createdAt: new Date("2026-09-01T18:28:30.613Z"), label: "sati sthal" } };
    const out = scrubSati(input);
    expect(out.meta.createdAt).toBeInstanceOf(Date);
    expect(out.meta.createdAt.getTime()).toBe(input.meta.createdAt.getTime());
    expect(out.meta.label).toBe("[redacted] sthal");
  });

  // --- Follow-up review: additional plausible spellings, and "sathi" excluded ---

  it("catches 'suttee' (standard historical English spelling)", () => {
    expect(assertSafeForNarayaniDevi("The temple's history includes a suttee legend.").safe).toBe(false);
  });

  it("catches 'satti' (common misspelling)", () => {
    expect(assertSafeForNarayaniDevi("She was said to have performed satti.").safe).toBe(false);
  });

  it("does NOT flag 'sathi' (friend/companion in Hindi) as unsafe", () => {
    expect(assertSafeForNarayaniDevi("mera sathi").safe).toBe(true);
    expect(scrubSati("mera sathi")).toBe("mera sathi");
  });

  // --- C1: the function returns NO reply text at all ---

  it("returns no reply text on a hit — the caller must discard the model's prose, not redact it", () => {
    const out = assertSafeForNarayaniDevi("She became sati on her husband's pyre.");
    expect(out).toEqual({ safe: false, reason: "literal_term" });
    expect(out).not.toHaveProperty("redactedReply");
  });

  // --- C1 second trigger: pyre + husband co-occurrence, scoped to narayani_devi ---

  it("flags a paraphrase carrying NO guarded token (chita + pati) for narayani_devi", () => {
    const out = assertSafeForNarayaniDevi("Woh apne pati ki chita par chadh gayi thi.", "narayani_devi");
    expect(out.safe).toBe(false);
    expect(out.reason).toBe("pyre_husband_co_occurrence");
  });

  it("flags the English paraphrase (pyre + husband) for narayani_devi", () => {
    expect(assertSafeForNarayaniDevi("She climbed her husband's pyre.", "narayani_devi").safe).toBe(false);
  });

  it("flags the Devanagari paraphrase (चिता + पति) for narayani_devi", () => {
    expect(assertSafeForNarayaniDevi("वह अपने पति की चिता पर चढ़ गई", "narayani_devi").safe).toBe(false);
  });

  it("does not flag pyre vocabulary WITHOUT husband vocabulary", () => {
    expect(assertSafeForNarayaniDevi("Agni ke saamne sankalp lijiye.", "narayani_devi").safe).toBe(true);
  });

  it("does not flag husband vocabulary WITHOUT pyre vocabulary", () => {
    expect(assertSafeForNarayaniDevi("Apne pati se baat kijiye, beta.", "narayani_devi").safe).toBe(true);
  });

  it("scopes the co-occurrence trigger to narayani_devi only", () => {
    const line = "Uske pati ne agni ke saamne vachan liya.";
    expect(assertSafeForNarayaniDevi(line, "khandoba").safe).toBe(true);
    expect(assertSafeForNarayaniDevi(line).safe).toBe(true);
    expect(assertSafeForNarayaniDevi(line, "narayani_devi").safe).toBe(false);
  });

  it("still applies the literal-term trigger to every deity, not just narayani_devi", () => {
    expect(assertSafeForNarayaniDevi("She became sati.", "khandoba").safe).toBe(false);
  });
});
