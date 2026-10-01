export type AssignmentTier = "confirmed" | "likely" | "possible" | "fallback";

export interface KuldevtaProfile {
  surname: string | null;
  surname_raw: string | null;
  community: string | null;
  community_raw: string | null;
  community_inferred: string | null;
  gotra: string | null;
  gotra_raw: string | null;
  gotra_defaulted: boolean;
  ancestral_place: {
    village: string | null;
    district: string | null;
    state: string | null;
    raw: string | null;
  };
  ancestral_place_may_be_current: boolean;
  language: string | null;
  soft_signals: {
    temple_mentioned: string | null;
    mandir_photo: string | null;
    other: string[];
  };
  answers_provided: number;
}

export interface MatchResult {
  slug: string;
  tier: AssignmentTier;
  matchedOn: string[];
  /**
   * Every deity the ladder found plausible, when it found more than one and
   * had to break a tie to return a single `slug`.
   *
   * Present ONLY when the choice was genuinely ambiguous — an alias two
   * deities share, or a place that maps to two temples. A confident match
   * leaves this undefined rather than echoing its own answer, so the field's
   * presence is itself the signal that a follow-up question would help.
   *
   * `slug` is always the first entry: it stays the answer regardless of
   * whether anything consumes this. Nothing renders it today — it exists so
   * ambiguity rates can be measured on real traffic before deciding whether
   * to ask the user to choose.
   */
  candidates?: string[];
}
