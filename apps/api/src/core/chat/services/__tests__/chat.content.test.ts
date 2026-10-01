import { describe, expect, test } from "vitest";

import CONTENT_ID_MAP from "@api/core/chat/assets/content-id-map.json";
import { CHAT_CONTENT_TYPES } from "@api/core/chat/types";
import { emptyContentGroups, parseAnswer } from "../chat.content.js";

const ID_MAP = CONTENT_ID_MAP as Record<string, { type: string; id: string }>;
const HOROSCOPES = Object.values(ID_MAP).filter((e) => e.type === "horoscope");

/**
 * The two agent reply shapes we actually receive, captured from live calls.
 *
 * The envelope is the content agent's; the bare prose with a `[META: ...]`
 * trailer is the Bhagavad Gita agent's, which never wraps its answer. Both
 * trailers are addressed to us, so neither may reach the reader.
 */
describe("parseAnswer", () => {
  test("unwraps the content agent's JSON envelope and drops the SUGGESTED trailer", () => {
    const raw = `{"reply_text":"Suniye ye bhajan","confidence":"high","content_ids":["bhj_0001"]}\n[SUGGESTED: aur bhajan]`;

    expect(parseAnswer(raw)).toEqual({
      replyText: "Suniye ye bhajan",
      confidence: "high",
      contentIds: ["bhj_0001"],
      // Absent from this envelope — an older reply shape must still parse, and
      // a missing analytics key is null rather than a thrown error.
      intentType: null,
      recommendedDeity: null,
      jaapCount: null,
      declineCategory: null,
    });
  });

  /**
   * The envelope the content agent ACTUALLY sends, copied verbatim from a
   * stored `chat_messages.content` row on stage. All 271 of its bot messages
   * carry these seven keys; we parsed three of them and dropped the rest, which
   * is why the client's `recommended_deity` / `matched_tags` events arrived
   * empty. Pinned here so a regression to the three-key parse fails loudly.
   */
  test("keeps every analytics field of the real production envelope", () => {
    const raw = `{
  "intent_type": "open_suggestion",
  "reply_text": "Aaj ke liye Vishnu ji ka status share karna shubh hoga.",
  "recommended_deity": "vishnu",
  "jaap_count": null,
  "content_ids": ["sts_0427", "sts_0422"],
  "decline_category": null,
  "confidence": "high"
}
[SUGGESTED: sts_0427, sts_0422]`;

    expect(parseAnswer(raw)).toEqual({
      replyText: "Aaj ke liye Vishnu ji ka status share karna shubh hoga.",
      confidence: "high",
      contentIds: ["sts_0427", "sts_0422"],
      intentType: "open_suggestion",
      recommendedDeity: "vishnu",
      jaapCount: null,
      declineCategory: null,
    });
  });

  test("reads a declined turn's category and a prescribed jaap count", () => {
    const raw = `{"reply_text":"Yeh main nahi bata sakta.","intent_type":"out_of_scope","decline_category":"financial","jaap_count":108,"content_ids":[],"confidence":"low"}`;

    const parsed = parseAnswer(raw);
    expect(parsed.declineCategory).toBe("financial");
    expect(parsed.intentType).toBe("out_of_scope");
    expect(parsed.jaapCount).toBe(108);
  });

  test("treats an empty-string analytics field as absent, not as a value", () => {
    // The agent writes JSON `null` for "not set", but a prompt edit could make
    // it emit "". An empty string would group in the warehouse as its own
    // category, which is worse than an honest null.
    const parsed = parseAnswer(
      `{"reply_text":"Namaste","recommended_deity":"","intent_type":"","content_ids":[]}`
    );
    expect(parsed.recommendedDeity).toBeNull();
    expect(parsed.intentType).toBeNull();
  });

  test("returns the Gita agent's prose without its META trailer", () => {
    const raw =
      "Fal ki chinta chhod dein - yeh hi karma yoga hai.\n\n[META: verses=2.48; flag=none]";

    expect(parseAnswer(raw)).toEqual({
      replyText: "Fal ki chinta chhod dein - yeh hi karma yoga hai.",
      confidence: null,
      contentIds: [],
      // Every analytics field is null for this agent and for the kuldevta
      // persona: both answer in prose with no envelope. Two of the three live
      // arms therefore report nothing here, which is a property of the agents
      // rather than a gap in this parse.
      intentType: null,
      recommendedDeity: null,
      jaapCount: null,
      declineCategory: null,
    });
  });

  /**
   * Captured from the content agent (RAGFlow, 25 Sep 2026): after a tool call
   * it wraps the envelope in a ```json fence despite its prompt. Before the
   * unfence, this reply reached the reader as raw JSON with no cards.
   */
  test("unwraps an envelope the agent fenced in a json code block", () => {
    const raw = [
      "```json",
      "{",
      '  "intent_type": "direct_request",',
      '  "reply_text": "Hanuman ji ke liye yeh mantra shubh hai.",',
      '  "recommended_deity": "hanuman",',
      '  "jaap_count": 108,',
      '  "content_ids": ["mnt_0069", "mnt_0066"],',
      '  "decline_category": null,',
      '  "confidence": "high"',
      "}",
      "```",
      "[SUGGESTED: mnt_0069, mnt_0066]",
    ].join("\n");

    expect(parseAnswer(raw)).toEqual({
      replyText: "Hanuman ji ke liye yeh mantra shubh hai.",
      confidence: "high",
      contentIds: ["mnt_0069", "mnt_0066"],
      intentType: "direct_request",
      recommendedDeity: "hanuman",
      jaapCount: 108,
      declineCategory: null,
    });
  });

  test("unwraps a bare fence with no language tag", () => {
    const raw = '```\n{"reply_text":"Namaste","content_ids":["art_0049"]}\n```';
    expect(parseAnswer(raw)).toMatchObject({
      replyText: "Namaste",
      contentIds: ["art_0049"],
    });
  });

  test("leaves a fence inside prose to the prose path", () => {
    // Only a fence around the WHOLE reply is an envelope. Prose that happens to
    // contain a code block is still prose, and must reach the reader intact.
    const raw = 'Yeh dekhiye:\n```json\n{"reply_text":"x"}\n```';
    expect(parseAnswer(raw)).toMatchObject({ replyText: raw, contentIds: [] });
  });

  test("passes through prose that carries no trailer at all", () => {
    expect(parseAnswer("Namaste! Kaise hain aap?").replyText).toBe(
      "Namaste! Kaise hain aap?"
    );
  });
});

/**
 * Horoscope (the seventh content type). A horoscope is not a playable
 * catalogue row: the item points at a zodiac SIGN, and the reading itself
 * comes from `GET /horoscope/daily?zodiac=…`, so the client navigates rather
 * than plays.
 */
describe("horoscope content type", () => {
  test("is part of the group map, so the key is always present", () => {
    expect(CHAT_CONTENT_TYPES).toContain("horoscope");
    expect(emptyContentGroups()).toHaveProperty("horoscope", []);
  });

  // `zodiac_sign` rows are seeded with GENERATED uuids, so their primary keys
  // differ per environment. A uuid in the committed map would resolve on the
  // environment it was read from and silently return nothing on every other —
  // a recommendation that vanishes with no error to notice.
  test("maps horoscope codes to a stable slug, never a uuid", () => {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(HOROSCOPES.length).toBeGreaterThan(0);
    for (const entry of HOROSCOPES) {
      expect(entry.id).not.toMatch(UUID);
      expect(entry.id).toMatch(/^[a-z]+$/);
    }
  });

  test("covers all twelve signs exactly once", () => {
    expect(HOROSCOPES.map((e) => e.id).sort()).toEqual([
      "aquarius", "aries", "cancer", "capricorn", "gemini", "leo",
      "libra", "pisces", "sagittarius", "scorpio", "taurus", "virgo",
    ]);
  });
});
