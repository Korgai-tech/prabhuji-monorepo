import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resetEnvCache } from "@api/shared/config";
import {
  CHAT_RECOMMENDED_MESSAGES,
  CHAT_SUGGESTION_SET,
  VARIANT_AGENTS,
  agentForVariant,
  introVideoForAgent,
  recommendedForAgent,
  suggestionSetForAgent,
  variantForAgent,
} from "../chat.constants.js";

/**
 * The openers each agent offers.
 *
 * Read through the real variant map rather than restating agent ids, so
 * repointing a variant cannot leave these asserting an agent nobody serves.
 */
const GITA = VARIANT_AGENTS.bhagwat_gita_chat;
const CONTENT = VARIANT_AGENTS.content_chat;
const KULDEVTA = VARIANT_AGENTS.kuldevta_chat;

describe("recommendedForAgent", () => {
  test("the Gita agent offers its own scripture openers", () => {
    expect(recommendedForAgent(GITA ?? null).map((m) => m.text)).toEqual([
      "Krishna ne Arjun se kya kaha?",
      "Gita kya sikhati he?",
      "Mann shaant kaise rahe?",
    ]);
  });

  test("the content agent keeps the general set", () => {
    expect(recommendedForAgent(CONTENT ?? null)).toEqual(
      CHAT_RECOMMENDED_MESSAGES
    );
  });

  test("an unknown agent, and a disabled user, fall back rather than empty", () => {
    expect(recommendedForAgent("not-an-agent")).toEqual(
      CHAT_RECOMMENDED_MESSAGES
    );
    expect(recommendedForAgent(null)).toEqual(CHAT_RECOMMENDED_MESSAGES);
  });

  test("every agent's openers carry unique ids and a contiguous order", () => {
    for (const agentId of Object.values(VARIANT_AGENTS)) {
      const msgs = recommendedForAgent(agentId ?? null);
      expect(new Set(msgs.map((m) => m.id)).size).toBe(msgs.length);
      expect(msgs.map((m) => m.order)).toEqual(msgs.map((_, i) => i));
    }
  });
});

describe("variantForAgent", () => {
  test("round-trips every live variant through its agent", () => {
    // Asserted over the WHOLE map rather than one example, so adding an arm
    // that two variants happen to share — which would make this lookup
    // order-dependent and silently mislabel one of them — fails here.
    for (const variant of Object.keys(VARIANT_AGENTS)) {
      const agent = agentForVariant(variant);
      expect(agent).toBeDefined();
      expect(variantForAgent(agent ?? "")).toBe(variant);
    }
  });

  test("an agent no live variant maps to is null, not a guess", () => {
    // What a session opened against a since-retired agent returns. Null so the
    // CMS can say "unknown arm" instead of mislabelling it as control.
    expect(variantForAgent("e0000000000000000000000000000000")).toBeNull();
  });

  test("an empty agent id is null", () => {
    expect(variantForAgent("")).toBeNull();
  });
});

describe("suggestionSetForAgent", () => {
  test("the kuldevta persona serves its own deity-addressed openers", () => {
    // Addressed TO a deity ("Aapki pooja…"), which is why this agent cannot
    // share the general set.
    const set = suggestionSetForAgent(KULDEVTA ?? null);
    expect(set.id).toBe("kuldevta_v1");
    expect(set.messages.map((m) => m.text)).toEqual([
      "Meri manokamna poori hogi?",
      "Aapki pooja kis din karni chahiye?",
      "Mere liye sahi raasta kya hai?",
    ]);
  });

  test("the Gita set is UNCHANGED — no gratuitous id bump", () => {
    // TAM-178 #EXPORT_CRITICAL 3: this copy already matched the design, so
    // bumping it would break continuity on a set that did not change. This
    // test exists to fail a reflexive bump, not to describe the copy twice.
    const set = suggestionSetForAgent(GITA ?? null);
    expect(set.id).toBe("gita_v1");
    expect(set.messages.map((m) => m.text)).toEqual([
      "Krishna ne Arjun se kya kaha?",
      "Gita kya sikhati he?",
      "Mann shaant kaise rahe?",
    ]);
  });

  test("the default (content) set is general_v2 with the new copy", () => {
    const set = suggestionSetForAgent(CONTENT ?? null);
    expect(set).toBe(CHAT_SUGGESTION_SET);
    // The id MUST move with the copy — an unchanged id across a copy change
    // silently merges two different experiments in the warehouse.
    expect(set.id).toBe("general_v2");
    expect(set.messages.map((m) => m.text)).toEqual([
      "Aaj mann bahut pareshan hai",
      "Hanuman Chalisa suna do",
      "Aaj ka rashifal batao",
    ]);
  });

  test("chip ids track INTENT, not wording", () => {
    const ids = CHAT_SUGGESTION_SET.messages.map((m) => m.id);
    // Chip 1's intent flipped happy → distressed, so it is a different chip.
    expect(ids).toContain("troubled_mood");
    expect(ids).not.toContain("happy_mood");
    // Chips 2 and 3 were only reworded — their ids stay so taps remain
    // comparable across the change.
    expect(ids).toContain("play_hanuman_chalisa");
    expect(ids).toContain("today_horoscope");
  });
});

/**
 * The per-agent intro clip and, above all, WHERE ITS HOST COMES FROM.
 *
 * The regression these guard is silent: an absolute URL pasted into the
 * constants map would work perfectly in whichever environment it was copied
 * from, and make production serve stage's bucket.
 */
describe("introVideoForAgent", () => {
  const ORIGINAL_BASE = process.env.MEDIA_PUBLIC_BASE_URL;
  const BASE = "https://cdn.example.invalid/media";

  beforeEach(() => {
    process.env.MEDIA_PUBLIC_BASE_URL = BASE;
    resetEnvCache();
  });

  afterEach(() => {
    if (ORIGINAL_BASE === undefined) delete process.env.MEDIA_PUBLIC_BASE_URL;
    else process.env.MEDIA_PUBLIC_BASE_URL = ORIGINAL_BASE;
    resetEnvCache();
  });

  test("the content agent resolves an absolute URL under MEDIA_PUBLIC_BASE_URL", () => {
    const video = introVideoForAgent(CONTENT ?? null);
    expect(video).not.toBeNull();
    expect(video?.videoId).toBe("content_chat_intro_v1");
    expect(video?.url).toBe(`${BASE}/chat/intro/Content_Chat.mp4`);
    expect(new URL(video?.url ?? "").origin).toBe(new URL(BASE).origin);
  });

  test("the stored value is a RELATIVE key — no baked-in host", () => {
    // Everything after the configured base is the constant as stored. If a
    // full URL were pasted into the map, this is what would catch it.
    const url = introVideoForAgent(CONTENT ?? null)?.url ?? "";
    const stored = url.slice(`${BASE}/`.length);
    expect(url.startsWith(`${BASE}/`)).toBe(true);
    expect(stored.startsWith("http")).toBe(false);
    expect(stored).toBe("chat/intro/Content_Chat.mp4");
  });

  test("the host follows the environment, not the file", () => {
    process.env.MEDIA_PUBLIC_BASE_URL = "https://other.example.invalid";
    resetEnvCache();
    expect(introVideoForAgent(CONTENT ?? null)?.url).toBe(
      "https://other.example.invalid/chat/intro/Content_Chat.mp4"
    );
  });

  test("durationMs is the MEASURED length of the real asset", () => {
    // 27.2 s, measured off Content_Chat.mp4 — not the 0:10 the design mocks.
    // The client paints its badge from this before the first frame decodes and
    // never reconciles it against the file, so a wrong value is permanent.
    expect(introVideoForAgent(CONTENT ?? null)?.durationMs).toBe(27_200);
  });

  test("the gita agent serves its own clip, under its own key", () => {
    const video = introVideoForAgent(GITA ?? null);
    expect(video?.url.endsWith("/chat/intro/Bhagvad_Gita.mp4")).toBe(true);
    expect(video?.videoId).toBe("gita_chat_intro_v1");
    // MEASURED off Bhagvad_Gita.mp4 (20.88 s).
    expect(video?.durationMs).toBe(20_880);
  });

  test("the kuldevta agent serves the clip the intro was ALREADY showing", () => {
    const video = introVideoForAgent(KULDEVTA ?? null);
    expect(video).not.toBeNull();
    // The same OBJECT the deleted `kKuldevtaEntryHeroVideoUrl` constant held,
    // so the video survives the screen it used to live on — but addressed
    // relatively, because that constant's host was stage's media CDN and every
    // environment must resolve its own copy.
    expect(video?.url.endsWith("/tutorial/use-audio-as-voice.mp4")).toBe(true);
    expect(video?.videoId).toBe("kuldevta_chat_intro_v1");
    // MEASURED off that asset (23.76 s) — a badge value copied from anywhere
    // else is wrong forever and silently.
    expect(video?.durationMs).toBe(23_760);
  });

  test("EVERY agent's clip follows MEDIA_PUBLIC_BASE_URL — no baked-in host", () => {
    // The regression this replaces shipped as an "absolute URL" escape hatch
    // for a clip believed to be on a CDN shared by all environments. That host
    // was stage's media distribution, so prod would have served stage's bucket
    // — the exact failure the relative-key rule exists to prevent.
    //
    // Asserted over the whole variant map, not one agent, because the hatch was
    // added for a single entry and a per-agent test is what let it through.
    process.env.MEDIA_PUBLIC_BASE_URL = "https://somewhere-else.example.invalid";
    resetEnvCache();

    let checked = 0;
    for (const agentId of Object.values(VARIANT_AGENTS)) {
      const url = introVideoForAgent(agentId ?? null)?.url;
      if (url === undefined) continue; // not every variant ships a clip
      checked += 1;
      expect(
        url.startsWith("https://somewhere-else.example.invalid/"),
        `${agentId} resolved to ${url}, which ignores MEDIA_PUBLIC_BASE_URL`
      ).toBe(true);
    }
    // Without this the guard passes vacuously the day the map is emptied or a
    // variant is repointed at an agent with no clip.
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  test("an unknown agent, and a disabled user, are null rather than a fallback clip", () => {
    // No fallback: one shared clip would pitch the content agent to everybody.
    expect(introVideoForAgent("not-an-agent")).toBeNull();
    expect(introVideoForAgent(null)).toBeNull();
  });
});
