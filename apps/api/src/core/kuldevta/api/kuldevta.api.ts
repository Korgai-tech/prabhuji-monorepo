/**
 * The Kuldevta module's public facade — what OTHER modules may call.
 *
 * Exactly one operation, and it exists for exactly one caller: `core/chat`
 * serves the persona conversation, and to do that it needs the identity of
 * the deity this user was matched to. Everything else about kuldevta —
 * the six answers, the parsed lineage profile, the tier and the evidence —
 * stays behind the authenticated kuldevta routes. A lineage profile is the
 * most identifying thing this product holds, so the facade deliberately
 * exposes the DEITY and not the family.
 */

/** The deity fields needed to seed one persona chat turn. */
export interface PersonaIdentity {
  slug: string;
  nameRoman: string;
  gender: string;
  toneNotes: string | null;
  archetypeVoice: string;
  niyam: string[];
  mantra: string | null;
  templeVillage: string | null;
}

export interface IKuldevtaApi {
  /**
   * The deity this user speaks with, or `null` when they have not completed
   * kuldevta-khoj yet.
   *
   * Returns null rather than throwing: "no kuldevta yet" is an ordinary state
   * for a user in the kuldevta chat arm, not an error, and the caller turns it
   * into guidance ("answer the six questions first") rather than a 500.
   */
  getPersonaIdentity(userId: string): Promise<PersonaIdentity | null>;
}
