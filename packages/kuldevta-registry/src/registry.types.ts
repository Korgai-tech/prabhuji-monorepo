export type Gender = "devi" | "devta";
export type Confidence = "high" | "medium";

export interface RegistryArchetype {
  id: string;              // "shiva_form"
  name: string;            // "Shiva-form"
  description: string;
  voiceDirection: string;
}

export interface RegistryDeity {
  id: string;              // "khandoba" — the closed vocabulary
  nameRoman: string;
  nameDevanagari: string;
  aliases: string[];
  archetype: string;       // -> RegistryArchetype.id
  formOf: string | null;   // em-dash in source means null
  gender: Gender;
  states: string[];
  communities: string[];
  templeName: string | null;
  templeVillage: string | null;
  templeDistrict: string | null;
  templeState: string | null;
  iconography: string | null;
  epithets: string[];
  mantra: string | null;
  weeklyDay: string | null;
  festivals: string[];
  offerings: string[];
  niyam: string[];
  toneNotes: string | null;
  personaEnabled: boolean;
  confidence: Confidence;
  notes: string | null;
  // v1 operational layer, not present in the workbook (spec §6.1)
  active: boolean;
  isFallback: boolean;
  humanReviewed: boolean;
  /**
   * Whether a subject-matter expert has checked THIS DEITY'S `niyam` strings.
   *
   * Separate from `humanReviewed`, which covers the identification fields —
   * names, communities, temple — and is already true across the registry. The
   * niyam is different in kind: it is the deity telling a household what that
   * household observes, and it is the most specific claim this product makes.
   * A wrong one does not read as a bad recommendation, it reads as being told
   * the wrong thing about your own family.
   *
   * Currently `false` everywhere. The strings were authored in-house from the
   * `weeklyDay` / `offerings` / `festivals` / `iconography` already recorded
   * and reviewed on the same row, which makes them defensible but not
   * verified. This flag exists so that distinction survives in the data rather
   * than in a pull-request description nobody reads a year from now.
   */
  niyamReviewed: boolean;
}

export interface RegistryRegionDefault {
  regionCode: string;      // "MH", "RJ-W", "ALL"
  region: string;
  defaultDeityId: string;
  isNationalFallback: boolean;
  caveat: string | null;
}

export interface Registry {
  deities: RegistryDeity[];
  archetypes: RegistryArchetype[];
  regionDefaults: RegistryRegionDefault[];
}
