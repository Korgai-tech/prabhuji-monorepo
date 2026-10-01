import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import { AppError } from "@api/shared/errors";
import { clearGlobalServices, registerGlobalService } from "@api/shared/workspace";
import { CHAT_CONTENT_TYPES } from "@api/core/chat/types";
import { resetEnvCache } from "@api/shared/config";
import { ChatService } from "../chat.service.js";
import {
  CHAT_REQUIRES_PRO,
  VARIANT_AGENTS,
  recommendedForAgent,
} from "../chat.constants.js";
import { CRISIS_RESPONSE } from "../crisis-detection.service.js";
import type {
  ChatMessageRow,
  ChatRepository,
  ChatSessionRow,
} from "@api/core/chat/repositories";
import type { ChatProvider } from "@api/core/chat/types";
import type { ContentRepository } from "@api/core/chat/repositories";

/**
 * Unit coverage for `ChatService`.
 *
 * The provider, the repository and the experiment service are all fakes, so
 * these tests are about the rules that are genuinely ours and would be
 * invisible in an HTTP test: the A/B grant (and that it fails CLOSED),
 * session-agent pinning across a remap, and "nothing is written unless the
 * agent answered".
 */

// Real ids, chosen so the REAL resolver (chat.buckets.ts) places each in the
// intended arm — the variant is no longer mockable, which is the point: the
// tests now exercise the bucketing that ships.
const USER = "user-1"; // content_chat (bucket 84)
const USER_B = "user-3"; // bhagwat_gita_chat (bucket 71)
const USER_CONTROL = "user-4"; // control, no agent (bucket 15)
// A DIFFERENT user in the SAME arm as USER (content_chat, bucket 90). It has
// to share the arm: the agent check runs before the ownership check, so a
// stranger from another arm would 400 on the agent and never reach the 404
// this file is testing.
const OTHER_USER = "user-5";
const SESSION = "33333333-3333-3333-3333-333333333333";
// Read from the real map rather than restated, so a change to `chat.agents.ts`
// cannot leave these tests asserting an agent nobody serves any more.
const [VARIANT_A, VARIANT_B] = Object.keys(VARIANT_AGENTS);
const AGENT_A = VARIANT_AGENTS[VARIANT_A ?? ""] ?? "";
const AGENT_B = VARIANT_AGENTS[VARIANT_B ?? ""] ?? "";
const PROVIDER_SESSION = "provider-session-1";

let createSession: Mock;
let findSession: Mock;
let appendExchange: Mock;
let findMessagePage: Mock;
let findRecentMessages: Mock;
let setProviderSessionId: Mock;
let setPersonaSlug: Mock;
let findLatestSession: Mock;
let findByTypeAndIds: Mock;
let ask: Mock;

/** A provider response body, trimmed to the fields we actually read. */
const RAW_BODY = {
  code: 0,
  data: {
    session_id: "provider-session-1",
    message_id: "provider-msg-1",
    data: { outputs: { content: "hello back" }, usage: { total_tokens: 9430 } },
  },
};

/** A stored bot turn in the agent's real output shape (JSON + trailer). */
const BOT_JSON = `{
  "intent_type": "followup",
  "reply_text": "Theek hai ji.",
  "content_ids": null
}
[SUGGESTED: none]`;

function row(
  id: string,
  role: "user" | "bot",
  content: string,
  isoTime: string
): ChatMessageRow {
  return {
    id,
    sessionId: SESSION,
    role,
    content,
    providerMessageId: role === "bot" ? "provider-msg-1" : null,
    createdAt: new Date(isoTime),
  };
}

/** The stored session as `findSession` resolves it — already provider-linked. */
const EXISTING: ChatSessionRow = {
  id: SESSION,
  userId: USER,
  agentId: AGENT_A,
  providerSessionId: PROVIDER_SESSION,
  personaSlug: null,
};

function repo(): ChatRepository {
  return {
    createSession,
    findSession,
    appendExchange,
    findMessagePage,
    findRecentMessages,
    setProviderSessionId,
    setPersonaSlug,
    findLatestSession,
  };
}

function provider(): ChatProvider {
  return { ask };
}

function content(): ContentRepository {
  return { findByTypeAndIds };
}

function service(): ChatService {
  return new ChatService(repo(), content(), provider());
}

beforeEach(() => {
  // `getChatConfig` fails CLOSED on an environment with no chat provider, so
  // the arm only resolves once these are set — see the fail-closed note in
  // `chat.service.ts`. Their ABSENCE is asserted deliberately further down.
  process.env.RAGFLOW_BASE_URL = "https://ragflow.test";
  process.env.RAGFLOW_API_KEY = "ragflow-test-key";
  resetEnvCache();

  createSession = vi.fn((userId: string, agentId: string) =>
    Promise.resolve({ id: SESSION, userId, agentId, providerSessionId: null })
  );
  findSession = vi.fn(() => Promise.resolve(EXISTING));
  setProviderSessionId = vi.fn(() => Promise.resolve(undefined));
  setPersonaSlug = vi.fn(() => Promise.resolve(undefined));
  appendExchange = vi.fn(
    (sessionId: string, userContent: string, bot: { content: string }) =>
      Promise.resolve([
        row("m1", "user", userContent, "2026-08-24T10:00:00.000Z"),
        row("m2", "bot", bot.content, "2026-08-24T10:00:01.000Z"),
      ])
  );
  findMessagePage = vi.fn(() => Promise.resolve([]));
  findLatestSession = vi.fn(() => Promise.resolve(EXISTING));
  findByTypeAndIds = vi.fn(() => Promise.resolve([]));
  findRecentMessages = vi.fn(() => Promise.resolve([]));
  ask = vi.fn(() =>
    Promise.resolve({
      content: "hello back",
      sessionId: PROVIDER_SESSION,
      messageId: "provider-msg-1",
      raw: RAW_BODY,
    })
  );
});

afterEach(() => {
  resetEnvCache();
  vi.restoreAllMocks();
});

describe("ChatService.sendMessage", () => {
  test("opens a new session on the agent its A/B variant maps to", async () => {
    const result = await service().sendMessage({ userId: USER, message: "hi", agentId: AGENT_A });

    expect(createSession).toHaveBeenCalledWith(USER, AGENT_A);
    expect(result.agentId).toBe(AGENT_A);
    expect(result.userMessage.message).toBe("hi");
    expect(result.botMessage.message).toBe("hello back");
    // ISO-8601 on the wire, never a Date.
    expect(result.botMessage.createdAt).toBe("2026-08-24T10:00:01.000Z");
  });

  test("400s when the client names an agent it was not granted", async () => {
    // The body's agentId is a confirmation, never a selector: naming another
    // arm's agent must not reach it.
    await expect(
      service().sendMessage({
        userId: USER,
        message: "hi",
        agentId: AGENT_B,
      })
    ).rejects.toMatchObject({ statusCode: 400, errorCode: "UNKNOWN_AGENT" });
    expect(ask).not.toHaveBeenCalled();
  });

  test("403s a control user — their bucket maps to no agent", async () => {
    await expect(
      service().sendMessage({ userId: USER_CONTROL, message: "hi", agentId: AGENT_A })
    ).rejects.toMatchObject({ statusCode: 403, errorCode: "CHAT_DISABLED" });
    expect(ask).not.toHaveBeenCalled();
  });

  test("403s when there is no id to bucket on (fail closed)", async () => {
    // Resolution can no longer fail for an outage reason — it is in-process —
    // but an empty id must still land in control rather than the treatment.
    await expect(
      service().sendMessage({ userId: "", message: "hi", agentId: AGENT_A })
    ).rejects.toMatchObject({ statusCode: 403, errorCode: "CHAT_DISABLED" });
  });

  test("403s an open conversation when the caller's arm grants no chat", async () => {
    await expect(
      service().sendMessage({
        userId: USER_CONTROL,
        message: "hi",
        agentId: AGENT_A,
        sessionId: SESSION,
      })
    ).rejects.toMatchObject({ statusCode: 403, errorCode: "CHAT_DISABLED" });
  });

  test("a session opened on another agent is retired, never answered by the new one", async () => {
    // The user now resolves to VARIANT_B, so that is what their profile reports
    // and what the client echoes — but this session was opened on agent A. A
    // transcript answered by two agents is one no reader can interpret, so B
    // must not answer it. Nor may A keep answering (TAM-264): when content chat
    // was repointed to a fixed agent, open conversations stayed on the broken
    // one. UNKNOWN_AGENT makes the app drop the session and resend on a fresh
    // one, which opens on the current agent.
    await expect(
      service().sendMessage({
        userId: USER_B,
        message: "hi",
        agentId: AGENT_B,
        sessionId: SESSION,
      })
    ).rejects.toMatchObject({ statusCode: 400, errorCode: "UNKNOWN_AGENT" });

    expect(ask).not.toHaveBeenCalled();
    expect(appendExchange).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  test("sends the stored provider session id on a follow-up", async () => {
    await service().sendMessage({
      userId: USER,
      message: "and more",
      agentId: AGENT_A,
      sessionId: SESSION,
    });
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: PROVIDER_SESSION })
    );
    // Unchanged handle — no redundant write.
    expect(setProviderSessionId).not.toHaveBeenCalled();
  });

  test("stores the provider handle on the first answer", async () => {
    await service().sendMessage({ userId: USER, message: "hi", agentId: AGENT_A });
    // A new session has no handle yet, so none is sent...
    expect(ask).toHaveBeenCalledWith({ agentId: AGENT_A, query: "hi" });
    // ...and the one the provider mints is persisted. The third argument is
    // the deity the conversation was opened as, and it is `undefined` off the
    // kuldevta persona agent — no other agent has a per-user identity to drift.
    expect(setProviderSessionId).toHaveBeenCalledWith(
      SESSION,
      PROVIDER_SESSION,
      undefined
    );
  });

  test("archives the provider's raw body and message id on the bot turn", async () => {
    await service().sendMessage({ userId: USER, message: "hi", agentId: AGENT_A });

    expect(appendExchange).toHaveBeenCalledWith(SESSION, "hi", {
      content: "hello back",
      providerMessageId: "provider-msg-1",
      raw: RAW_BODY,
    });
  });

  test("re-persists the handle when the provider hands back a different one", async () => {
    // The client opens a replacement session when the provider forgot ours; a
    // stale handle would re-trigger that on every later turn.
    ask = vi.fn(() =>
      Promise.resolve({
        content: "hello back",
        sessionId: "provider-session-2",
        messageId: "provider-msg-2",
        raw: RAW_BODY,
      })
    );
    await service().sendMessage({
      userId: USER,
      message: "and more",
      agentId: AGENT_A,
      sessionId: SESSION,
    });
    expect(setProviderSessionId).toHaveBeenCalledWith(
      SESSION,
      "provider-session-2",
      undefined
    );
  });

  test("replays the transcript oldest-first with the new question", async () => {
    findRecentMessages = vi.fn(() =>
      Promise.resolve([
        // Repository order is NEWEST first — the service must reverse it.
        row("m2", "bot", BOT_JSON, "2026-08-24T10:00:01.000Z"),
        row("m1", "user", "Hanuman ji ke bhajan chahiye", "2026-08-24T10:00:00.000Z"),
      ])
    );

    await service().sendMessage({
      userId: USER,
      message: "aur uske alawa?",
      agentId: AGENT_A,
      sessionId: SESSION,
    });

    const { query } = (ask.mock.calls[0]?.[0] ?? {}) as { query: string };
    expect(query).toBe(
      [
        "Previous conversation:",
        "User: Hanuman ji ke bhajan chahiye",
        "Assistant: Theek hai ji.",
        "",
        "Current message: aur uske alawa?",
      ].join("\n")
    );
    // The agent's JSON wrapper and [SUGGESTED:] trailer are NOT replayed.
    expect(query).not.toContain("intent_type");
    expect(query).not.toContain("SUGGESTED");
  });

  test("replays a non-JSON bot message verbatim rather than dropping it", async () => {
    findRecentMessages = vi.fn(() =>
      Promise.resolve([row("m1", "bot", "plain answer", "2026-08-24T10:00:00.000Z")])
    );

    await service().sendMessage({
      userId: USER,
      message: "more",
      agentId: AGENT_A,
      sessionId: SESSION,
    });

    const { query } = (ask.mock.calls[0]?.[0] ?? {}) as { query: string };
    expect(query).toContain("Assistant: plain answer");
  });

  test("sends a new session's first question bare, with no history wrapper", async () => {
    await service().sendMessage({ userId: USER, message: "hi", agentId: AGENT_A });

    expect(ask).toHaveBeenCalledWith({ agentId: AGENT_A, query: "hi" });
    expect(findRecentMessages).not.toHaveBeenCalled();
  });

  test("still replays history alongside the provider session id", async () => {
    // Deliberate redundancy (~52 tokens): it is what keeps an expired provider
    // session from silently resetting the conversation.
    findRecentMessages = vi.fn(() =>
      Promise.resolve([row("m1", "user", "pehla sawaal", "2026-08-24T10:00:00.000Z")])
    );
    await service().sendMessage({
      userId: USER,
      message: "doosra",
      agentId: AGENT_A,
      sessionId: SESSION,
    });
    const call = (ask.mock.calls[0]?.[0] ?? {}) as {
      query: string;
      sessionId: string;
    };
    expect(call.sessionId).toBe(PROVIDER_SESSION);
    expect(call.query).toContain("User: pehla sawaal");
  });

  test("writes nothing when the agent fails", async () => {
    ask = vi.fn(() =>
      Promise.reject(new AppError("boom", 502, "CHAT_PROVIDER_ERROR"))
    );

    await expect(
      service().sendMessage({
        userId: USER,
        message: "hi",
        agentId: AGENT_A,
        sessionId: SESSION,
      })
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(appendExchange).not.toHaveBeenCalled();
  });

  test("serves each agent its OWN openers, chosen by the caller's variant", async () => {
    findMessagePage = vi.fn(() => Promise.resolve([]));

    const forVariant = async (userId: string): Promise<string[]> => {
      const page = await service().getHistory({ userId, limit: 10 });
      return page.chatConfig.recommendedMessages.map((m) => m.text);
    };

    // Not merely "different" — each set must be the one belonging to that
    // agent, so a mapping swapped between the two arms fails here.
    expect(await forVariant(USER)).toEqual(
      recommendedForAgent(AGENT_A).map((m) => m.text)
    );
    expect(await forVariant(USER_B)).toEqual(
      recommendedForAgent(AGENT_B).map((m) => m.text)
    );
    expect(await forVariant(USER)).not.toEqual(
      await forVariant(USER_B)
    );
  });

  test("a disabled user still gets openers to render behind the paywall", async () => {
    findMessagePage = vi.fn(() => Promise.resolve([]));

    const page = await service().getHistory({ userId: USER_CONTROL, limit: 10 });
    expect(page.chatConfig.enabled).toBe(false);
    expect(page.chatConfig.recommendedMessages.length).toBeGreaterThan(0);
  });

  test("404s a session the caller does not own", async () => {
    // The repository scopes by owner, so someone else's id reads as absent.
    findSession = vi.fn(() => Promise.resolve(null));

    await expect(
      service().sendMessage({
        userId: OTHER_USER,
        message: "hi",
        agentId: AGENT_A,
        sessionId: SESSION,
      })
    ).rejects.toMatchObject({ statusCode: 404, errorCode: "NOT_FOUND" });
  });

});

describe("ChatService.getChatConfig — the chat paywall switch", () => {
  // `CHAT_REQUIRES_PRO` is the ONE line that arms or disarms the app's three
  // chat paywall gates (see its docblock). These tests pin the two properties
  // the app depends on, WITHOUT pinning today's value — flipping the switch is
  // supposed to be a one-line change, so a test that hard-codes `false` would
  // turn that into a two-line change and teach the next person to edit the
  // assertion rather than think about it.

  test("every arm publishes the switch verbatim — including the disabled ones", async () => {
    // The key must never be absent from a live server's payload: the client
    // reads a missing key as "ungated", so an arm that forgot to emit it would
    // silently disarm the paywall for exactly that arm, which is the kind of
    // bug that only shows up in revenue.
    registerGlobalService("kuldevta", {
      getPersonaIdentity: () => Promise.resolve(null),
    });
    // USER_B = a granted arm, USER_CONTROL = control, "" = no id to bucket on,
    // "user-2" = bucket 36 = the kuldevta arm.
    for (const user of [USER, USER_B, USER_CONTROL, "", "user-2"]) {
      const config = await service().getChatConfig(user);
      expect(config.requiresPro).toBe(CHAT_REQUIRES_PRO);
    }
    clearGlobalServices();
  });

  test("the switch is independent of whether chat is enabled", async () => {
    // The two answer different questions — "may this user chat at all" (A/B)
    // versus "must they pay for it" (the switch) — and nothing should couple
    // them. A control user still carries the flag.
    const granted = await service().getChatConfig(USER_B);
    const control = await service().getChatConfig(USER_CONTROL);
    expect(granted.enabled).toBe(true);
    expect(control.enabled).toBe(false);
    expect(granted.requiresPro).toBe(control.requiresPro);
  });

  test("chat is FREE today", async () => {
    // The deliberate exception to "don't pin the value": this asserts the
    // shipped state, so re-arming the paywall has to be a conscious edit here
    // with a reviewer looking at it, rather than something that rides along in
    // an unrelated diff. If you flipped CHAT_REQUIRES_PRO on purpose, flip
    // this too.
    expect(CHAT_REQUIRES_PRO).toBe(false);
    await expect(service().getChatConfig(USER_B)).resolves.toMatchObject({
      requiresPro: false,
    });
  });
});

describe("ChatService.getChatConfig", () => {
  test("enabled with the mapped agent for a granted variant", async () => {
    await expect(service().getChatConfig(USER_B)).resolves.toEqual({
      enabled: true,
      agentId: AGENT_B,
      // The variant string rides on the wire so the warehouse can slice funnels
      // by arm without joining back through `/users/me`.
      chatType: VARIANT_B,
      // Not the kuldevta arm, so the assignment lookup is skipped entirely.
      kuldevtaAssigned: false,
      showKuldevtaChat: false,
      kuldevtaName: null,
      requiresPro: CHAT_REQUIRES_PRO,
    });
  });

  test("disabled with a null agent for control", async () => {
    await expect(service().getChatConfig(USER_CONTROL)).resolves.toEqual({
      enabled: false,
      agentId: null,
      // Control is the null-labelled bucket — no bucket to attribute.
      chatType: null,
      kuldevtaAssigned: false,
      showKuldevtaChat: false,
      kuldevtaName: null,
      requiresPro: CHAT_REQUIRES_PRO,
    });
  });

  test("disabled when there is no id to bucket on", async () => {
    await expect(service().getChatConfig("")).resolves.toEqual({
      enabled: false,
      agentId: null,
      chatType: null,
      kuldevtaAssigned: false,
      showKuldevtaChat: false,
      kuldevtaName: null,
      requiresPro: CHAT_REQUIRES_PRO,
    });
  });

  test("showKuldevtaChat is true for exactly the kuldevta arm", async () => {
    // The whole point of the field: the client must not have to recognise the
    // agent's hex id to know which arm it is in. Asserted against the REAL
    // resolver, so a re-bucketing or an agent-id change fails here rather than
    // silently hiding the entry point in production.
    registerGlobalService("kuldevta", {
      getPersonaIdentity: () => Promise.resolve(null),
    });
    // "user-2" -> bucket 36 -> kuldevta_chat.
    const kuldevta = await service().getChatConfig("user-2");
    expect(kuldevta.showKuldevtaChat).toBe(true);
    expect(kuldevta.agentId).toBe(VARIANT_AGENTS["kuldevta_chat"]);
    clearGlobalServices();

    // Every other arm, including control, is false.
    for (const other of [USER, USER_B, USER_CONTROL, ""]) {
      const config = await service().getChatConfig(other);
      expect(config.showKuldevtaChat).toBe(false);
    }
  });

  test("kuldevtaAssigned is only ever true when showKuldevtaChat is", async () => {
    // `kuldevtaAssigned: false` outside the arm means "not applicable", never
    // "this user has no kuldevta" — so the pair (false, true) must not exist.
    for (const user of [USER, USER_B, USER_CONTROL, ""]) {
      const config = await service().getChatConfig(user);
      expect(config.kuldevtaAssigned && !config.showKuldevtaChat).toBe(false);
    }
  });

  test("chat is OFF on an environment with no chat provider", async () => {
    // Production deliberately leaves RAGFlow unset until launch. Resolving the
    // A/B arm in-process made `getChatConfig` succeed everywhere, including an
    // environment that cannot answer a single message — so without this the
    // launch payload would grant an agent, the app would render the entry
    // point, and every tap would 503.
    for (const missing of ["RAGFLOW_BASE_URL", "RAGFLOW_API_KEY"] as const) {
      const saved = process.env[missing];
      delete process.env[missing];
      resetEnvCache();

      // A user who WOULD have chat if the provider were configured.
      await expect(service().getChatConfig(USER)).resolves.toEqual({
        enabled: false,
        agentId: null,
        // Provider check short-circuits the variant resolver, so the bucket
        // isn't even computed — chat_type reads as null with the rest.
        chatType: null,
        kuldevtaAssigned: false,
        showKuldevtaChat: false,
        kuldevtaName: null,
        requiresPro: CHAT_REQUIRES_PRO,
      });

      process.env[missing] = saved;
      resetEnvCache();
    }

    // ...and it comes back on once both halves are present again.
    expect((await service().getChatConfig(USER)).enabled).toBe(true);
  });

  test("kuldevtaName is the assigned deity, and null whenever there is none", async () => {
    // The three states the client can see, pinned together: outside the arm
    // there is no name, inside the arm without an assignment there is no name,
    // and with one the name is the deity's own — never a slug, never a label
    // invented here.
    for (const user of [USER, USER_B, USER_CONTROL, ""]) {
      await expect(service().getChatConfig(user)).resolves.toMatchObject({
        kuldevtaName: null,
      });
    }

    // "user-2" -> bucket 36 -> kuldevta_chat, but khoj not answered yet.
    registerGlobalService("kuldevta", {
      getPersonaIdentity: () => Promise.resolve(null),
    });
    await expect(service().getChatConfig("user-2")).resolves.toMatchObject({
      showKuldevtaChat: true,
      kuldevtaAssigned: false,
      kuldevtaName: null,
    });
    clearGlobalServices();

    registerGlobalService("kuldevta", {
      getPersonaIdentity: () =>
        Promise.resolve({
          slug: "khandoba",
          nameRoman: "Khandoba",
          gender: "devta",
          toneNotes: null,
          archetypeVoice: "warm",
          niyam: [],
          mantra: null,
          templeVillage: null,
        }),
    });
    await expect(service().getChatConfig("user-2")).resolves.toMatchObject({
      showKuldevtaChat: true,
      kuldevtaAssigned: true,
      // The ROMAN name — the one the persona agent answers to.
      kuldevtaName: "Khandoba",
    });
    clearGlobalServices();
  });

  test("every mapped variant resolves to its own agent", () => {
    // Guards the map itself: a blank or duplicated agent id would silently send
    // one arm's users to another arm's agent and quietly void the experiment.
    const ids = Object.values(VARIANT_AGENTS);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(VARIANT_AGENTS["control"]).toBeUndefined();
  });

  test("is stable — the same user always resolves to the same arm", async () => {
    // Stickiness is the one promise this feature makes. It is structural here
    // (same id, same hash, same bucket) rather than persisted, so the test has
    // to assert it directly.
    const first = await service().getChatConfig(USER);
    const second = await service().getChatConfig(USER);
    expect(second).toEqual(first);
  });
});

describe("ChatService.getHistory", () => {
  const rows = [
    row("m3", "bot", "newest", "2026-08-24T10:00:03.000Z"),
    row("m2", "user", "middle", "2026-08-24T10:00:02.000Z"),
    row("m1", "bot", "oldest", "2026-08-24T10:00:01.000Z"),
  ];

  test("serves newest first and pages on the last kept row", async () => {
    // The repo over-fetches by one (limit 2 -> 3 rows), so there IS a next page.
    findMessagePage = vi.fn(() => Promise.resolve(rows));

    const page = await service().getHistory({
      userId: USER,
      sessionId: SESSION,
      limit: 2,
    });

    expect(page.previousChat.map((m) => m.message)).toEqual([
      "newest",
      "middle",
    ]);
    expect(page.nextCursor).not.toBeNull();

    // The cursor names the last KEPT row, so page 2 resumes at "oldest".
    const key = JSON.parse(
      Buffer.from(page.nextCursor ?? "", "base64url").toString("utf8")
    ) as { sortOrder: number; id: string };
    expect(key.id).toBe("m2");
    expect(key.sortOrder).toBe(new Date("2026-08-24T10:00:02.000Z").getTime());
  });

  test("no next cursor on the last page", async () => {
    findMessagePage = vi.fn(() => Promise.resolve(rows.slice(0, 2)));

    const page = await service().getHistory({
      userId: USER,
      sessionId: SESSION,
      limit: 2,
    });
    expect(page.nextCursor).toBeNull();
  });

  test("404s a session the caller does not own", async () => {
    findSession = vi.fn(() => Promise.resolve(null));

    await expect(
      service().getHistory({
        userId: OTHER_USER,
        sessionId: SESSION,
        limit: 10,
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test("falls back to the caller's most recent session when none is named", async () => {
    // What the chat screen does on open: it has no session id yet.
    findMessagePage = vi.fn(() => Promise.resolve(rows.slice(0, 1)));

    const page = await service().getHistory({ userId: USER, limit: 10 });

    expect(findLatestSession).toHaveBeenCalledWith(USER);
    expect(findSession).not.toHaveBeenCalled();
    expect(page.sessionId).toBe(SESSION);
  });

  test("rejects a malformed cursor even with no history to page", async () => {
    findLatestSession = vi.fn(() => Promise.resolve(null));
    await expect(
      service().getHistory({ userId: USER, cursor: "garbage", limit: 10 })
    ).rejects.toMatchObject({ statusCode: 400, errorCode: "INVALID_CURSOR" });
  });

  test("a first-time user gets an empty transcript, not a 404", async () => {
    findLatestSession = vi.fn(() => Promise.resolve(null));

    const page = await service().getHistory({ userId: USER, limit: 10 });

    expect(page.sessionId).toBeNull();
    expect(page.previousChat).toEqual([]);
    expect(page.nextCursor).toBeNull();
    // The screen still has everything it needs to render.
    expect(page.chatConfig.enabled).toBe(true);
    expect(page.chatConfig.agentId).toBe(AGENT_A);
    expect(page.chatConfig.recommendedMessages.length).toBeGreaterThan(0);
  });

  test("is readable even when the variant no longer grants chat", async () => {
    // Sending is gated; reading your own words is not. `agentId: null` is what
    // tells the client the screen is read-only.
    findMessagePage = vi.fn(() => Promise.resolve(rows.slice(0, 1)));

    const page = await service().getHistory({ userId: USER_CONTROL, limit: 10 });

    expect(page.chatConfig.enabled).toBe(false);
    expect(page.chatConfig.agentId).toBeNull();
    expect(page.previousChat).toHaveLength(1);
  });

  test("unwraps the agent envelope and never leaks the raw JSON", async () => {
    findMessagePage = vi.fn(() =>
      Promise.resolve([row("m9", "bot", BOT_JSON, "2026-08-24T10:00:09.000Z")])
    );

    const page = await service().getHistory({ userId: USER, limit: 10 });
    const [msg] = page.previousChat;

    expect(msg?.message).toBe("Theek hai ji.");
    expect(msg?.confidence).toBeNull();
    expect(msg?.message).not.toContain("intent_type");
    expect(msg?.message).not.toContain("SUGGESTED");
    // Every group key is present so the client never branches on undefined.
    // Derived from CHAT_CONTENT_TYPES rather than listed, so adding a type
    // updates the assertion instead of breaking it.
    expect(Object.keys(msg?.content ?? {}).sort()).toEqual([...CHAT_CONTENT_TYPES].sort());
  });

  test("a bot turn that is not JSON is still readable", async () => {
    findMessagePage = vi.fn(() =>
      Promise.resolve([row("m9", "bot", "plain text", "2026-08-24T10:00:09.000Z")])
    );
    const page = await service().getHistory({ userId: USER, limit: 10 });
    expect(page.previousChat[0]?.message).toBe("plain text");
  });
});

/**
 * The kuldevta persona agent is the one agent whose identity is per-user, and
 * RAGFlow binds those Begin variables ONCE, when the provider conversation is
 * created, then never re-reads them.
 *
 * So re-answering kuldevta-khoj onto a different deity used to be invisible to
 * the chat path: the assignment row said `nagnechi` while the persona went on
 * answering "Khandoba", for the life of the session. Confirmed live on stage
 * before this guard existed. The guard that was supposed to prevent it lived
 * on `user_kuldevtas.ragflow_session_id` — a column nothing has written since
 * the persona turn moved into `core/chat`, so it had quietly become inert.
 */
describe("ChatService.sendMessage — kuldevta persona identity", () => {
  // Real id, placed in the kuldevta arm by the real resolver (bucket 36).
  const PERSONA_USER = "user-2";
  const PERSONA_AGENT = VARIANT_AGENTS["kuldevta_chat"] ?? "";

  /** `ask` is a bare `Mock`, so its recorded argument needs a shape to read. */
  interface AskArgs {
    agentId: string;
    query: string;
    sessionId?: string;
    inputs?: Record<string, { type: string; value: string }>;
  }
  function askArgs(): AskArgs {
    return ask.mock.calls[0]?.[0] as AskArgs;
  }

  function identity(slug: string) {
    return {
      slug,
      nameRoman: slug === "khandoba" ? "Khandoba" : "Nagnechi",
      gender: "devta",
      toneNotes: null,
      archetypeVoice: "warm",
      niyam: [],
      mantra: null,
      templeVillage: null,
    };
  }

  function withDeity(slug: string): void {
    registerGlobalService("kuldevta", {
      getPersonaIdentity: () => Promise.resolve(identity(slug)),
    });
  }

  afterEach(() => {
    clearGlobalServices();
  });

  test("reuses the provider conversation while the deity is unchanged", async () => {
    withDeity("khandoba");
    findSession = vi.fn(() =>
      Promise.resolve({ ...EXISTING, agentId: PERSONA_AGENT, personaSlug: "khandoba" })
    );

    await service().sendMessage({
      userId: PERSONA_USER,
      message: "pranam",
      agentId: PERSONA_AGENT,
      sessionId: SESSION,
    });

    const call = askArgs();
    expect(call.sessionId).toBe(PROVIDER_SESSION);
    // Inputs ride along on EVERY persona turn, not only the opening one.
    // RAGFlow substitutes Begin variables on the turn they arrive and never
    // again, so a follow-up sent without them empties the persona's identity —
    // on stage it answered "mujhe mantra nahi diya gaya hai" from turn 2 and
    // then denied being the family's kuldevta at all.
    expect(call.inputs?.kuldevta_slug).toEqual({ type: "line", value: "khandoba" });
  });

  test("drops the provider handle and re-sends the identity when the deity changed", async () => {
    withDeity("nagnechi");
    findSession = vi.fn(() =>
      Promise.resolve({ ...EXISTING, agentId: PERSONA_AGENT, personaSlug: "khandoba" })
    );

    await service().sendMessage({
      userId: PERSONA_USER,
      message: "aap kaun hain?",
      agentId: PERSONA_AGENT,
      sessionId: SESSION,
    });

    const call = askArgs();
    // No handle → RAGFlow opens a NEW conversation, which is the only moment
    // it will read the Begin inputs at all.
    expect(call.sessionId).toBeUndefined();
    expect(call.inputs?.kuldevta_slug).toEqual({ type: "line", value: "nagnechi" });
    expect(call.inputs?.name).toEqual({ type: "line", value: "Nagnechi" });
  });

  test("sends the identity on a FOLLOW-UP turn, not only when opening", async () => {
    // The regression that made the feature useless in practice: RAGFlow
    // substitutes Begin variables on the turn they arrive and never again, so
    // a follow-up sent with only a session_id leaves every `{begin@...}`
    // empty. The deity forgot its temple, mantra and niyam after ONE message
    // and told the family "Main aapka kuldevta nahi hoon".
    //
    // Asserted on the second turn specifically — the first turn always carried
    // them, which is exactly why this survived every test and every manual
    // check that only ever asked one question.
    withDeity("khandoba");
    findSession = vi.fn(() =>
      Promise.resolve({ ...EXISTING, agentId: PERSONA_AGENT, personaSlug: "khandoba" })
    );

    await service().sendMessage({
      userId: PERSONA_USER,
      message: "Aapka mantra kya hai?",
      agentId: PERSONA_AGENT,
      sessionId: SESSION,
    });

    const call = askArgs();
    // An established conversation — the handle is reused...
    expect(call.sessionId).toBe(PROVIDER_SESSION);
    // ...and the identity goes with it anyway.
    expect(call.inputs?.name).toEqual({ type: "line", value: "Khandoba" });
    expect(call.inputs?.kuldevta_slug).toEqual({ type: "line", value: "khandoba" });
    expect(Object.keys(call.inputs ?? {}).sort()).toEqual(
      [
        "archetype_voice",
        "gender",
        "kuldevta_slug",
        "mantra",
        "name",
        "niyam",
        "temple",
        "tone_notes",
      ].sort()
    );
  });

  test("records the new deity alongside the new handle, so the reset happens once", async () => {
    withDeity("nagnechi");
    findSession = vi.fn(() =>
      Promise.resolve({ ...EXISTING, agentId: PERSONA_AGENT, personaSlug: "khandoba" })
    );
    ask = vi.fn(() =>
      Promise.resolve({
        content: "hello back",
        sessionId: "provider-session-2",
        messageId: "provider-msg-2",
        raw: RAW_BODY,
      })
    );

    await service().sendMessage({
      userId: PERSONA_USER,
      message: "pranam",
      agentId: PERSONA_AGENT,
      sessionId: SESSION,
    });

    // Handle and deity written together — a handle stored without its deity
    // would read as "no drift" forever and re-pin the session.
    expect(setProviderSessionId).toHaveBeenCalledWith(
      SESSION,
      "provider-session-2",
      "nagnechi"
    );
  });

  test("records the deity even when the provider returns no new handle", async () => {
    withDeity("nagnechi");
    findSession = vi.fn(() =>
      Promise.resolve({ ...EXISTING, agentId: PERSONA_AGENT, personaSlug: "khandoba" })
    );
    // Same handle back: without the fallback write the next turn would see the
    // OLD slug, reset again, and discard the persona's context every turn.
    ask = vi.fn(() =>
      Promise.resolve({
        content: "hello back",
        sessionId: PROVIDER_SESSION,
        messageId: "provider-msg-1",
        raw: RAW_BODY,
      })
    );

    await service().sendMessage({
      userId: PERSONA_USER,
      message: "pranam",
      agentId: PERSONA_AGENT,
      sessionId: SESSION,
    });

    expect(setProviderSessionId).not.toHaveBeenCalled();
    expect(setPersonaSlug).toHaveBeenCalledWith(SESSION, "nagnechi");
  });

  test("a session predating the column is left alone, not reset", async () => {
    withDeity("khandoba");
    findSession = vi.fn(() =>
      Promise.resolve({ ...EXISTING, agentId: PERSONA_AGENT, personaSlug: null })
    );

    await service().sendMessage({
      userId: PERSONA_USER,
      message: "pranam",
      agentId: PERSONA_AGENT,
      sessionId: SESSION,
    });

    // NULL is "unknown", not "mismatched": resetting every pre-existing
    // conversation on deploy would throw away context that is very probably
    // correct.
    expect(askArgs().sessionId).toBe(PROVIDER_SESSION);
  });

  test("409s when a user in the kuldevta arm has not answered kuldevta-khoj", async () => {
    registerGlobalService("kuldevta", { getPersonaIdentity: () => Promise.resolve(null) });
    findSession = vi.fn(() =>
      Promise.resolve({ ...EXISTING, agentId: PERSONA_AGENT, personaSlug: null })
    );

    await expect(
      service().sendMessage({
        userId: PERSONA_USER,
        message: "pranam",
        agentId: PERSONA_AGENT,
        sessionId: SESSION,
      })
    ).rejects.toMatchObject({ statusCode: 409, errorCode: "KULDEVTA_NOT_ASSIGNED" });
  });
});

describe("ChatService.getChatConfig — shared abtesting service (TAM-173)", () => {
  // Through the REAL client on purpose, like the rest of this file exercises
  // the real bucket map: env configures the service, a stubbed global fetch
  // plays it, and only the resolution ORDER is ours to assert.
  const evaluateAnswer = (body: unknown): void => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })))
    );
  };

  beforeEach(() => {
    process.env.ABTEST_BASE_URL = "https://platform.test/abtesting";
    process.env.ABTEST_TENANT_KEY = "prabhuji.dev.key";
    resetEnvCache();
  });

  afterEach(() => {
    delete process.env.ABTEST_BASE_URL;
    delete process.env.ABTEST_TENANT_KEY;
    resetEnvCache();
    vi.unstubAllGlobals();
  });

  test("the service's arm beats the in-process bucket", async () => {
    // USER_CONTROL is control in the in-process map; the service assigns an arm.
    evaluateAnswer({ inExperiment: true, bucket: 7, variant: { id: VARIANT_B, payload: {} } });

    await expect(service().getChatConfig(USER_CONTROL)).resolves.toMatchObject({
      enabled: true,
      agentId: AGENT_B,
    });
  });

  test("a service variant with no reviewed agent mapping stays OFF", async () => {
    // The console cannot point our provider key at an agent `VARIANT_AGENTS`
    // does not name — an unmapped id is control, exactly like a map gap.
    evaluateAnswer({ inExperiment: true, bucket: 7, variant: { id: "rogue_arm", payload: {} } });

    await expect(service().getChatConfig(USER)).resolves.toMatchObject({
      enabled: false,
      agentId: null,
    });
  });

  test("an api-default with a string variant hands that arm to out-of-experiment users", async () => {
    evaluateAnswer({ inExperiment: false, bucket: 7, defaultConfig: { variant: VARIANT_A } });

    await expect(service().getChatConfig(USER_CONTROL)).resolves.toMatchObject({
      enabled: true,
      agentId: AGENT_A,
    });
  });

  test("an api-default with variant: null switches chat off for out-of-experiment users", async () => {
    // USER would be content_chat in-process; the explicit console answer wins.
    evaluateAnswer({ inExperiment: false, bucket: 7, defaultConfig: { variant: null } });

    await expect(service().getChatConfig(USER)).resolves.toMatchObject({
      enabled: false,
      agentId: null,
    });
  });

  test("an api-default without the variant key falls back to the in-process map", async () => {
    // Credentials wired before any chat experiment is seeded must move nobody.
    evaluateAnswer({ inExperiment: false, bucket: 7, defaultConfig: { unrelated: true } });

    await expect(service().getChatConfig(USER)).resolves.toMatchObject({
      enabled: true,
      agentId: AGENT_A,
    });
  });

  test("a service failure degrades to the in-process map, not to chat off", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))));

    await expect(service().getChatConfig(USER)).resolves.toMatchObject({
      enabled: true,
      agentId: AGENT_A,
    });
    await expect(service().getChatConfig(USER_CONTROL)).resolves.toMatchObject({
      enabled: false,
    });
  });

  test("the provider fail-closed gate short-circuits before any evaluation", async () => {
    delete process.env.RAGFLOW_BASE_URL;
    delete process.env.RAGFLOW_API_KEY;
    resetEnvCache();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(service().getChatConfig(USER)).resolves.toMatchObject({ enabled: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * The analytics fields the client attaches to its `chat_reply_received` and
 * `chat_page_viewed` events.
 *
 * These exist because the content agent already emits `intent_type`,
 * `recommended_deity`, `jaap_count` and `decline_category` on every turn and
 * the API parsed three keys and dropped the rest — so the events for them
 * arrived empty in the warehouse. The parse is covered in
 * `chat.content.test.ts`; what is asserted here is that the values survive the
 * service and reach the wire.
 */
describe("ChatService — analytics pass-through", () => {
  test("carries the agent's envelope fields onto the bot message", async () => {
    ask = vi.fn(() =>
      Promise.resolve({
        content: `{"intent_type":"horoscope","reply_text":"Aapka rashifal.","recommended_deity":"hanuman","jaap_count":108,"decline_category":null,"content_ids":["hor_0006"],"confidence":"high"}\n[SUGGESTED: hor_0006]`,
        sessionId: PROVIDER_SESSION,
        messageId: "provider-msg-1",
        raw: RAW_BODY,
      })
    );

    const out = await service().sendMessage({
      userId: USER,
      message: "aaj ka rashifal",
      agentId: AGENT_A,
      sessionId: SESSION,
    });

    expect(out.botMessage).toMatchObject({
      intentType: "horoscope",
      recommendedDeity: "hanuman",
      jaapCount: 108,
      declineCategory: null,
      // The agent's OWN tag, not the resolved catalogue row id — a tag the id
      // map cannot place is dropped from `content` and survives only here,
      // which is what makes a catalogue gap countable.
      matchedTags: ["hor_0006"],
    });
  });

  test("leaves the user's own turn with no analytics of its own", async () => {
    const out = await service().sendMessage({
      userId: USER,
      message: "hi",
      agentId: AGENT_A,
      sessionId: SESSION,
    });

    expect(out.userMessage).toMatchObject({
      intentType: null,
      recommendedDeity: null,
      jaapCount: null,
      declineCategory: null,
      matchedTags: [],
      distressDetected: false,
    });
  });

  test("names the suggestion set the openers came from", async () => {
    const out = await service().getHistory({ userId: USER, limit: 30 });

    // Not derivable from the messages: a second agent serves a different set,
    // and the same set's copy changes over time.
    // TAM-178 bumped this to `general_v2` along with the copy — the id moving
    // with the messages is the whole contract of this field.
    expect(out.chatConfig.suggestionSetId).toBe("general_v2");
    expect(out.chatConfig.recommendedMessages[0]).toMatchObject({
      id: "troubled_mood",
      category: "mood",
    });
  });

  test("serves the agent's intro clip, resolved against this env's media host", async () => {
    const out = await service().getHistory({ userId: USER, limit: 30 });

    // AGENT_A is the content agent.
    const base = process.env.MEDIA_PUBLIC_BASE_URL ?? "";
    expect(out.chatConfig.introVideo).toEqual({
      videoId: "content_chat_intro_v1",
      url: `${base}/chat/intro/Content_Chat.mp4`,
      durationMs: 27_200,
    });
  });

  test("the gita arm serves its own clip, not the content one", async () => {
    // Every arm has an asset now, so the interesting property is that they do
    // not collide: one shared clip would pitch the content bot to everybody.
    const base = process.env.MEDIA_PUBLIC_BASE_URL ?? "";
    const out = await service().getHistory({ userId: USER_B, limit: 30 });
    expect(out.chatConfig.introVideo).toEqual({
      videoId: "gita_chat_intro_v1",
      url: `${base}/chat/intro/Bhagvad_Gita.mp4`,
      durationMs: 20_880,
    });
  });
});

/**
 * `distressDetected` — the flag that tells the client to render the crisis card
 * instead of a chat bubble.
 *
 * The load-bearing property is that it is recomputed from the stored text
 * rather than read from a column, so a transcript replayed out of history flags
 * the same turns the live exchange did with no migration and no second query.
 */
describe("ChatService — distress flag", () => {
  test("flags the bot turn of a crisis exchange, and only the bot turn", async () => {
    ask = vi.fn(() =>
      Promise.resolve({
        content: "DISTRESS_DETECTED",
        sessionId: PROVIDER_SESSION,
        messageId: null,
        raw: RAW_BODY,
      })
    );

    const out = await service().sendMessage({
      userId: USER,
      message: "i cannot go on",
      agentId: AGENT_A,
      sessionId: SESSION,
    });

    expect(out.botMessage.distressDetected).toBe(true);
    // The agent's sentinel must never be rendered to the person who triggered
    // it — the helpline card replaces it entirely.
    expect(out.botMessage.message).toBe(CRISIS_RESPONSE.text);
    expect(out.botMessage.message).not.toContain("DISTRESS_DETECTED");
    // The user's own turn is what triggered the card, but the flag describes
    // what was RENDERED, and the card renders on the bot bubble.
    expect(out.userMessage.distressDetected).toBe(false);
  });

  test("still flags the same turn when the transcript is replayed from history", async () => {
    findMessagePage = vi.fn(() =>
      Promise.resolve([
        row("m2", "bot", CRISIS_RESPONSE.text, "2026-08-24T10:00:01.000Z"),
        row("m1", "user", "i cannot go on", "2026-08-24T10:00:00.000Z"),
      ])
    );

    const out = await service().getHistory({ userId: USER, limit: 30 });

    expect(out.previousChat.map((m) => m.distressDetected)).toEqual([true, false]);
  });

  test("does not flag an ordinary reply", async () => {
    const out = await service().sendMessage({
      userId: USER,
      message: "hi",
      agentId: AGENT_A,
      sessionId: SESSION,
    });

    expect(out.botMessage.distressDetected).toBe(false);
  });
});
