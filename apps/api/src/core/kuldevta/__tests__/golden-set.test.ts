import { loadRegistry } from "@prabhuji/kuldevta-registry";
import { describe, expect, it } from "vitest";

import { matchKuldevta } from "../services/kuldevta-matcher.service.js";
import type { AssignmentTier, KuldevtaProfile } from "../types.js";
import families from "./fixtures/golden-families.json" with { type: "json" };

interface Family {
  name: string;
  profile: KuldevtaProfile;
  expectedSlug: string;
  expectedTier: AssignmentTier;
}

const registry = loadRegistry();
const cases = families as Family[];

describe("golden set", () => {
  it.each(cases.map((f) => [f.name, f] as const))("%s", (_name, f) => {
    const r = matchKuldevta(f.profile, registry);
    expect(r.slug).toBe(f.expectedSlug);
    expect(r.tier).toBe(f.expectedTier);
  });

  it("never returns a slug outside the registry", () => {
    const ids = new Set(registry.deities.map((d) => d.id));
    for (const f of cases) expect(ids).toContain(matchKuldevta(f.profile, registry).slug);
  });

  it("never returns an inactive deity", () => {
    const inactive = new Set(registry.deities.filter((d) => !d.active).map((d) => d.id));
    for (const f of cases) expect(inactive).not.toContain(matchKuldevta(f.profile, registry).slug);
  });

  it("is not over-generous with the confirmed tier", () => {
    const confirmed = cases.filter((f) => matchKuldevta(f.profile, registry).tier === "confirmed");
    // Spec §10: if most fixtures come back confirmed, the ladder is too loose.
    expect(confirmed.length).toBeLessThan(cases.length / 2);
  });
});
