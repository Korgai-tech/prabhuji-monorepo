import { loadRegistry } from "@prabhuji/kuldevta-registry";
import { describe, expect, it, vi } from "vitest";

import { identifyKuldevta } from "../services/kuldevta-identify.service.js";

const ANSWERS = {
  surname: "Patil",
  ancestralPlace: "Satara, Maharashtra",
  community: "Maratha",
  gotra: "pata nahi",
  templeMentioned: "Jejuri wale khandoba",
  mandirPhoto: "bhandara wale devta",
};
const RAW = `{"surname":"Patil","surname_raw":"Patil","community":"Maratha","community_raw":"Maratha","community_inferred":null,"gotra":"Kashyap","gotra_raw":"pata nahi","gotra_defaulted":true,"ancestral_place":{"village":null,"district":"Satara","state":"Maharashtra","raw":"Satara, Maharashtra"},"ancestral_place_may_be_current":false,"language":null,"soft_signals":{"temple_mentioned":"Jejuri wale khandoba","mandir_photo":"bhandara wale devta","other":[]},"answers_provided":5}`;

describe("identifyKuldevta", () => {
  it("returns khandoba and persists the assignment", async () => {
    const saveAssignment = vi.fn().mockResolvedValue(undefined);
    const r = await identifyKuldevta("u-1", ANSWERS, {
      callParser: () => Promise.resolve(RAW),
      loadRegistry,
      saveAssignment,
      imageUrlFor: (slug: string) => `https://cdn.test/kuldevta/kuldevta/${slug}.webp`,
    });
    expect(r.slug).toBe("khandoba");
    expect(r.tier).toBe("confirmed");
    expect(r.nameDevanagari).toBe("खंडोबा");
    expect(saveAssignment).toHaveBeenCalledOnce();
  });

  it("scrubs the sati term out of what is persisted (spec §9.2)", async () => {
    const saveAssignment = vi.fn().mockResolvedValue(undefined);
    const raw = RAW.replace("Jejuri wale khandoba", "Rani Sati Dadi mandir Jhunjhunu");
    await identifyKuldevta(
      "u-2",
      { ...ANSWERS, templeMentioned: "Rani Sati Dadi mandir" },
      {
        callParser: () => Promise.resolve(raw),
        loadRegistry,
        saveAssignment,
        imageUrlFor: (slug: string) => `https://cdn.test/kuldevta/kuldevta/${slug}.webp`,
      }
    );
    const persisted = JSON.stringify(saveAssignment.mock.calls[0][0]);
    expect(persisted.toLowerCase()).not.toContain("sati");
  });
});
