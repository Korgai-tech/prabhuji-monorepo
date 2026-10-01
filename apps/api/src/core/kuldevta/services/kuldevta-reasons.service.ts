import type { RegistryDeity } from "@prabhuji/kuldevta-registry";

import type { KuldevtaProfile, MatchResult } from "../types.js";

/**
 * The "Ye aapki kuldevi kyu he?" list — why THIS family was matched to THIS
 * deity, in the family's own words wherever possible.
 *
 * Built from `matchedOn` (which tier fired) plus the profile values that
 * actually fired it, so every line quotes something the family said. A screen
 * that asserts a deity without saying why is asking for trust it has not
 * earned; a lineage answer is not something a devotee can verify from the
 * outside, so the evidence has to travel with the answer.
 *
 * Hinglish in Latin script, matching the agent prompts and the app's own copy.
 *
 * NOT a translation layer: these are short factual statements about the match,
 * not devotional prose. The persona agent writes prose; this explains a
 * decision the API made.
 */

/**
 * `devi` / `devta`. The registry's `gender` column already holds exactly these
 * two words for all 33 deities, so it is used verbatim; anything else falls
 * back to the neutral "devta" rather than guessing.
 */
function honorific(deity: RegistryDeity): string {
  const g = deity.gender.trim().toLowerCase();
  return g === "devi" ? "devi" : "devta";
}

/** The place the family named, preferring the most specific field they filled. */
function familyPlace(profile: KuldevtaProfile): string | null {
  const p = profile.ancestral_place;
  return p.village ?? p.district ?? p.raw ?? null;
}

/**
 * Whether the family's place and the temple's place name the same location.
 * Compared by containment in either direction, so "Nagana" matches "Nagana,
 * Barmer, Rajasthan" and vice versa.
 */
function samePlace(a: string, b: string): boolean {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const [x, y] = [norm(a), norm(b)];
  return x === y || x.includes(y) || y.includes(x);
}

/** Where the temple stands, as one human phrase. */
function templePlace(deity: RegistryDeity): string | null {
  const parts = [deity.templeVillage, deity.templeDistrict, deity.templeState].filter(
    (x): x is string => Boolean(x)
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * One line per piece of evidence, in the order the ladder weighed it.
 *
 * Never empty: a fallback match still gets a line saying so plainly, because
 * "we do not know yet" is information the family can act on — they can answer
 * the questions again — whereas an empty list reads as a broken screen.
 */
export function buildReasons(
  match: MatchResult,
  profile: KuldevtaProfile,
  deity: RegistryDeity
): string[] {
  const on = new Set(match.matchedOn);
  const reasons: string[] = [];
  const dv = honorific(deity);

  if (on.has("alias")) {
    const named = profile.soft_signals.temple_mentioned ?? profile.soft_signals.mandir_photo;
    reasons.push(
      named
        ? `Aapne khud inka naam liya — "${named}".`
        : `Aapke ghar ke jawaab mein in ${dv} ka naam aaya.`
    );
  }

  if (on.has("community") && profile.community) {
    reasons.push(`Aapka samaj — ${profile.community} — in ${dv} ke bhakton mein aata hai.`);
  }

  if (on.has("gotra") && profile.gotra) {
    reasons.push(`Aapka gotra ${profile.gotra} in parivaron mein milta hai.`);
  }

  if (on.has("village") || on.has("place")) {
    const mine = familyPlace(profile);
    const temple = templePlace(deity);
    if (mine && temple) {
      // A family that names its village often names the temple's village, so
      // the two-clause form would read "Aapka mool sthan Nagana, Barmer,
      // Rajasthan hai, aur inka mandir Nagana, Barmer, Rajasthan mein hai" —
      // the same place twice, which reads like a bug to the person it is
      // meant to reassure.
      reasons.push(
        samePlace(mine, temple)
          ? `Inka mandir aapke hi mool sthan — ${temple} — mein hai.`
          : `Aapka mool sthan ${mine} hai, aur inka mandir ${temple} mein hai.`
      );
    } else if (temple) {
      reasons.push(`Inka mandir ${temple} mein hai — aapke mool sthan ke paas.`);
    }
  }

  if (on.has("region") && profile.ancestral_place.state) {
    reasons.push(`${profile.ancestral_place.state} ke parivaron mein inki pooja hoti hai.`);
  }

  if (on.has("community_inferred") && profile.surname) {
    reasons.push(`Aapka surname ${profile.surname} is samaj se juda hua hai.`);
  }

  if (reasons.length === 0) {
    // Tier 7. Say so honestly rather than inventing evidence: this deity was
    // not matched to this family, it is who the registry offers when nothing
    // in the answers narrows things down.
    reasons.push(
      "Abhi aapke jawaabon se koi ek kuldevta pakka nahi ho paaya.",
      `Tab tak ${deity.nameRoman} — jo sabke rakshak maane jaate hain — aapke saath hain.`,
      "Aap dobara jawaab dekar apni kuldevi/kuldevta dhoondh sakte hain."
    );
  }

  return reasons;
}
