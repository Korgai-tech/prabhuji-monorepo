import type { KuldevtaProfile } from "../types.js";

/**
 * Thrown when the RAGFlow parser agent's raw output cannot be turned into a
 * `KuldevtaProfile`, even after quote normalisation and fence stripping. The
 * original raw text is attached so a caller can log/inspect it.
 */
export class ProfileParseError extends Error {
  constructor(
    public readonly raw: string,
    cause?: unknown
  ) {
    super("Parser agent returned unparseable profile JSON");
    this.name = "ProfileParseError";
    this.cause = cause;
  }
}

// Characters that can legally sit immediately before a JSON string's OPENING
// delimiter (ignoring whitespace): the start of an object/array, a preceding
// comma, or the colon that separates a key from its value. `undefined` covers
// "start of input" after fence-stripping.
function isStructuralBefore(ch: string | undefined): boolean {
  return ch === undefined || ch === "{" || ch === "[" || ch === "," || ch === ":";
}

// Characters that can legally sit immediately after a JSON string's CLOSING
// delimiter (ignoring whitespace): the colon after a key, a following comma,
// or the close of the enclosing object/array. `undefined` covers "end of
// input".
function isStructuralAfter(ch: string | undefined): boolean {
  return ch === undefined || ch === ":" || ch === "," || ch === "}" || ch === "]";
}

function prevNonWhitespace(s: string, idx: number): string | undefined {
  for (let i = idx - 1; i >= 0; i--) {
    if (!/\s/.test(s[i])) return s[i];
  }
  return undefined;
}

function nextNonWhitespace(s: string, idx: number): string | undefined {
  for (let i = idx + 1; i < s.length; i++) {
    if (!/\s/.test(s[i])) return s[i];
  }
  return undefined;
}

/**
 * gpt-4o emits typographic quotes for some keys/strings — verified in
 * production on 2026-09-01: `"other": []` and `"answers_provided"` came back
 * as `“other”: []` / `“answers_provided”` (U+201C/U+201D), which
 * `JSON.parse` rejects outright (spec §7.1 — only U+0022 delimits a string).
 *
 * Only a smart quote acting as a JSON *string delimiter* is rewritten to
 * ASCII `"`. A smart quote that appears INSIDE a string's content (e.g. a
 * temple name quoted mid-sentence by the model) must be left untouched, or
 * we would corrupt the actual answer text while "fixing" the syntax.
 *
 * A smart quote is classified as a delimiter purely from its immediate
 * neighbours (skipping whitespace), never from a running "am I inside a
 * string" flag: it is a delimiter if the char right before it is one of
 * `{ [ , :` (an opening position) OR the char right after it is one of
 * `: , } ]` (a closing position); otherwise it is content and is left
 * untouched.
 *
 * This handles BOTH observed failure shapes:
 *  - the recorded production case, where only bare-word keys/values were
 *    smart-quoted (`“other”: []`) while everything else stayed ASCII;
 *  - the model uniformly substituting every quote with a smart one,
 *    INCLUDING a value that itself contains a nested quoted word
 *    (`“Jejuri “wale” khandoba”`) — here the outer pair sits next to `:`/`,`
 *    (structural) and gets converted, while the inner pair sits between
 *    ordinary letters (non-structural) and is left as content, exactly
 *    mirroring how the same nested word survives when the outer delimiters
 *    are already ASCII.
 *
 * Known limitation: a content quote that itself sits directly against a
 * structural character — e.g. a nested quoted aside ending right at a
 * comma, `“abc, said “hi”, bye”,` — is ambiguous for any neighbour-only
 * heuristic and can be misclassified as a delimiter. Resolving that needs a
 * real grammar-aware parser; not attempted here.
 */
function normaliseQuotes(input: string): string {
  let result = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "“" || ch === "”") {
      const looksLikeDelimiter =
        isStructuralBefore(prevNonWhitespace(input, i)) ||
        isStructuralAfter(nextNonWhitespace(input, i));
      result += looksLikeDelimiter ? '"' : ch;
      continue;
    }
    result += ch;
  }
  return result;
}

function stripFence(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

/**
 * Turns the parser agent's raw text output into a `KuldevtaProfile`. Repair
 * (fence stripping + smart-quote normalisation) is mandatory, not defensive
 * polish — the verified 2026-09-01 production run needed it to parse at all.
 */
export function repairAndParseProfile(raw: string): KuldevtaProfile {
  const candidate = normaliseQuotes(stripFence(raw ?? ""));
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new ProfileParseError(raw);
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as KuldevtaProfile;
  } catch (err) {
    throw new ProfileParseError(raw, err);
  }
}
