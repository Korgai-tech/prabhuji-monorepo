import { describe, expect, it } from "vitest";
import { ProfileParseError, repairAndParseProfile } from "../services/profile-json.service.js";

const GOOD = `{"surname":"Patil","surname_raw":"Patil","community":"Maratha","community_raw":"Maratha","community_inferred":null,"gotra":"Kashyap","gotra_raw":"pata nahi","gotra_defaulted":true,"ancestral_place":{"village":null,"district":"Satara","state":"Maharashtra","raw":"Satara, Maharashtra"},"ancestral_place_may_be_current":false,"language":null,"soft_signals":{"temple_mentioned":"Jejuri wale khandoba","mandir_photo":null,"other":[]},"answers_provided":5}`;

describe("repairAndParseProfile", () => {
  it("parses clean JSON", () => {
    expect(repairAndParseProfile(GOOD).surname).toBe("Patil");
  });

  it("repairs the smart quotes gpt-4o actually emitted", () => {
    const broken = GOOD.replace('"other":[]', '“other”:[]').replace(
      '"answers_provided"',
      "“answers_provided”"
    );
    expect(repairAndParseProfile(broken).soft_signals.other).toEqual([]);
  });

  it("strips a markdown fence", () => {
    expect(repairAndParseProfile("```json\n" + GOOD + "\n```").community).toBe("Maratha");
  });

  it("never lets a smart quote inside a value corrupt the text", () => {
    const withQuoted = GOOD.replace(
      '"Jejuri wale khandoba"',
      '"Jejuri “wale” khandoba"'
    );
    expect(repairAndParseProfile(withQuoted).soft_signals.temple_mentioned).toBe(
      "Jejuri “wale” khandoba"
    );
  });

  it("repairs a value whose own delimiters are ALSO smart-quoted, with a nested smart quote inside", () => {
    // gpt-4o substituting quotes uniformly rather than only at bare-word key
    // boundaries: the value's opening/closing delimiters are smart quotes
    // too, and it still contains a nested smart-quoted word. The outer pair
    // sits against `:`/`,` (structural) and must convert; the inner pair
    // sits between ordinary letters (non-structural) and must survive,
    // exactly like the ASCII-delimited case above.
    const uniformSmart = GOOD.replace(
      '"temple_mentioned":"Jejuri wale khandoba"',
      "“temple_mentioned”:“Jejuri “wale” khandoba”"
    );
    expect(repairAndParseProfile(uniformSmart).soft_signals.temple_mentioned).toBe(
      "Jejuri “wale” khandoba"
    );
  });

  it("throws ProfileParseError on unrecoverable output", () => {
    expect(() => repairAndParseProfile("I could not determine the deity.")).toThrow(
      ProfileParseError
    );
  });
});
