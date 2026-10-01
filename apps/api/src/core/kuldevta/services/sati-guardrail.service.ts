/**
 * Commission of Sati (Prevention) Act, 1987. The registry requires this to be
 * enforced here, in code, and NOT left to the model (spec §9.1). The prompt
 * rule is defence in depth; this is the control.
 *
 * Word-boundary matching matters: "Satara" (a registry district) and
 * "Saptashrungi" (a registry deity) must never be redacted, and neither must
 * any word that merely contains "sati" as a substring (e.g. "satisfied",
 * "sativa", or the Devanagari "सतीत्व" / "असती"). "sathi" (friend/companion
 * in Hindi) is deliberately NOT in the pattern — it does not contain "sati"
 * as a substring at all, and it is common, ordinary devotional vocabulary;
 * flagging it would be a damaging false positive.
 *
 * "suttee" (the standard historical English spelling — a persona discussing
 * the Jhunjhunu temple's history in English would plausibly use it) and
 * "satti" (a common misspelling) are included alongside "sati"/"satee" —
 * these are plausible ordinary phrasings, not evasion attempts.
 *
 * The boundary is expressed with lookbehind/lookahead (not consuming
 * capture groups) so that adjacent occurrences separated by a single
 * delimiter character — e.g. "sati sati" — are not skipped: a consuming
 * boundary group eats the delimiter on the first match, leaving nothing for
 * the second match's required leading boundary to consume.
 *
 * A fresh RegExp is constructed on every call (rather than reusing one
 * module-level /g instance) so that .test() and .replace() never share
 * mutable `lastIndex` state — a shared stateful /g regex used with .test()
 * can alternate true/false across consecutive calls on the very same input.
 */
const SATI_PATTERN = "(?<![\\p{L}])(?:sati|satee|suttee|satti|सती)(?![\\p{L}])";
const REDACTION = "[redacted]";

function satiRegex(): RegExp {
  return new RegExp(SATI_PATTERN, "giu");
}

/**
 * `scrubSati` is applied to arbitrary parsed LLM/user JSON, which is always
 * plain data — objects, arrays, strings, numbers, booleans, null. It must
 * deep-clone (never mutate its input) and never silently corrupt a value it
 * doesn't understand.
 *
 * `Date`, `RegExp`, `Map`, `Set`, and other non-plain objects need explicit
 * handling because the generic "rebuild via Object.entries" branch below
 * only sees *own enumerable properties* — which for a `Date` is an empty
 * set. `Object.entries(new Date())` is `[]`, so without a guard a `Date`
 * silently becomes `{}`: no exception, but the value and its type are
 * destroyed. `RegExp`, `Map`, and `Set` have the same failure shape (their
 * real data lives outside enumerable own properties).
 *
 * `Date` gets its own branch because it is a legitimate payload shape here
 * (timestamps on profile/chat records) and can never contain "sati" — so a
 * cloned `Date` with the same time value is both safe and correct. Every
 * *other* non-plain object (RegExp, Map, Set, class instances, etc.) is
 * passed through by reference untouched rather than flattened: it isn't
 * expected in this pipeline's JSON payloads, but if one arrives, returning
 * it unchanged preserves its type and data — silently corrupting it into an
 * empty object would be strictly worse than a no-op, and none of these
 * shapes are strings that could hide the guarded term anyway.
 */
/**
 * The recursive worker operates entirely on `unknown` rather than the
 * exported generic `T`. `Array.isArray`/`typeof` narrowing on an
 * unconstrained generic parameter degrades to `any` (Object.entries,
 * Object.getPrototypeOf, and Array.prototype.map all have `any`-flavoured
 * signatures upstream), which is exactly the kind of untracked type flow
 * `no-unsafe-*` exists to catch. Keeping every branch here typed as
 * `unknown` — with explicit, narrow casts only where a lib type
 * (`Object.getPrototypeOf`) hands back `any` — makes each step type-checked
 * instead of merely type-shaped. `scrubSati` itself does the one deliberate,
 * unavoidable cast at the public generic boundary.
 */
function scrub(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(satiRegex(), REDACTION);
  }
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (Array.isArray(value)) {
    return value.map((v: unknown) => scrub(v));
  }
  if (value !== null && typeof value === "object") {
    const proto = Object.getPrototypeOf(value) as object | null;
    const isPlainObject = proto === Object.prototype || proto === null;
    if (!isPlainObject) {
      // See the "Date, RegExp, Map, Set" note above: don't flatten opaque
      // non-plain objects into {}.
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = scrub(v);
    }
    return out;
  }
  return value;
}

export function scrubSati<T>(value: T): T {
  return scrub(value) as T;
}

/**
 * Pyre / self-immolation vocabulary and husband vocabulary, in Latin
 * transliteration and Devanagari. Matched as whole words against a
 * lowercased, punctuation-stripped rendering of the reply.
 */
const PYRE_TERMS = ["chita", "chitaa", "pyre", "agni", "चिता", "अग्नि"];
const HUSBAND_TERMS = ["pati", "husband", "पति"];

/** The one deity whose persona this co-occurrence check is scoped to. */
const CO_OCCURRENCE_SCOPED_SLUG = "narayani_devi";

/**
 * Lowercase and reduce every character that is not a letter, number or
 * combining mark to a single space, so whole-word membership can be tested
 * with a Set.
 *
 * `\p{M}` (combining marks) is NOT optional: Devanagari matras are Marks, not
 * Letters, so stripping them shreds "चिता" into "चित" and "की" into "क" — the
 * Devanagari half of this check would silently never fire.
 */
function words(reply: string): Set<string> {
  return new Set(
    reply
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
      .split(" ")
      .filter(Boolean),
  );
}

function mentionsPyreWithHusband(reply: string): boolean {
  const w = words(reply);
  return PYRE_TERMS.some((t) => w.has(t)) && HUSBAND_TERMS.some((t) => w.has(t));
}

export interface SatiCheck {
  safe: boolean;
  /**
   * Which trigger fired, for a counter-friendly warn log. `null` when safe.
   * NEVER carries any of the model's prose.
   */
  reason: "literal_term" | "pyre_husband_co_occurrence" | null;
}

/**
 * Checks a single reply string intended for a kuldevta/kuldevi persona.
 *
 * TWO independent triggers, both returning `safe: false`:
 *
 * 1. **The literal term**, in Latin script ("sati", "satee", "suttee",
 *    "satti") and Devanagari ("सती"), with word-boundary checks so it does
 *    not fire on unrelated words that merely contain those letters.
 *
 * 2. **Pyre/immolation vocabulary CO-OCCURRING with husband vocabulary**,
 *    scoped to `narayani_devi` — the one persona whose own temple history is
 *    the Rani Sati Dadi shrine, and whose prompt already forbids the word.
 *    That prohibition is exactly what makes trigger 1 insufficient: told not
 *    to say "sati", a model paraphrases ("woh apne pati ki chita par chadh
 *    gayi") and emits no token at all. Trigger 2 is the likeliest REAL
 *    failure shape, not the literal one.
 *
 * LIMITS OF TRIGGER 2 — stated honestly, in the same spirit as this
 * module's other comments. It is a bag-of-words co-occurrence over the whole reply,
 * so it has both failure directions:
 *   - FALSE POSITIVES: a reply that mentions a husband in one sentence and a
 *     havan/agni in an entirely unrelated sentence trips it. Accepted
 *     deliberately — the cost is one safe redirect on an innocuous turn; the
 *     cost of the other direction is a criminal-law violation.
 *   - FALSE NEGATIVES: it catches neither a paraphrase that uses neither
 *     vocabulary ("she followed him into the flames of his last fire"), nor
 *     one that names the husband only by pronoun, nor transliterations
 *     outside the listed forms. It is NOT a semantic classifier and must not
 *     be described or relied upon as one.
 * Neither trigger addresses a deliberately obfuscated variant (spaced-out
 * letters, zero-width characters, fullwidth confusables). The threat model
 * remains an LLM narrating or glorifying sati in ordinary devotional prose,
 * not an adversary evading a filter. If that changes, revisit this function
 * before relying on it again.
 *
 * The caller MUST discard the model's text entirely when `safe` is false —
 * see `chatAsKuldevta`. Redacting the guarded token and shipping the rest of
 * the sentence leaves the valorising narration intact and only removes the
 * word; the registry's mandate is "never reference or valorise", not "never
 * spell". This function therefore returns no reply text at all.
 */
export function assertSafeForNarayaniDevi(reply: string, deitySlug?: string): SatiCheck {
  if (satiRegex().test(reply)) {
    return { safe: false, reason: "literal_term" };
  }
  if (deitySlug === CO_OCCURRENCE_SCOPED_SLUG && mentionsPyreWithHusband(reply)) {
    return { safe: false, reason: "pyre_husband_co_occurrence" };
  }
  return { safe: true, reason: null };
}
