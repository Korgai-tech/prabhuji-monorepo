import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import { AppError } from "@api/shared/errors";
import { clearGlobalServices, registerGlobalService } from "@api/shared/workspace";
import type {
  ChatAdminRepository,
  ContentRepository,
} from "@api/core/chat/repositories";
import type { IUsersApi } from "@api/core/users/api";
import { ChatAdminService } from "../chat.admin.service.js";
import { VARIANT_AGENTS } from "../chat.constants.js";

/**
 * Unit coverage for the CMS transcript read.
 *
 * The repository and the users facade are fakes, so what is under test is the
 * mapping the CMS actually depends on and which no HTTP test would make
 * legible: the bot envelope being unwrapped to the text the user saw, the tail
 * being reversed into reading order, `truncated` being derived from the COUNT
 * rather than the cap, and an unknown user failing as a 404 instead of quietly
 * looking like a user with no conversations.
 */

const USER_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "22222222-2222-2222-2222-222222222222";
// Read from the real map, so repointing a variant cannot leave this asserting
// an agent nobody serves.
const CONTENT_AGENT = VARIANT_AGENTS.content_chat ?? "";

let countSessions: Mock;
let findSessionPage: Mock;
let countMessagesBySession: Mock;
let findMessageTail: Mock;
let findByTypeAndIds: Mock;
let getUserPublic: Mock;

function repo(): ChatAdminRepository {
  return {
    countSessions,
    findSessionPage,
    countMessagesBySession,
    findMessageTail,
  };
}

function content(): ContentRepository {
  return { findByTypeAndIds };
}

function makeService(): ChatAdminService {
  return new ChatAdminService(repo(), content());
}

const USER_PUBLIC = {
  id: USER_ID,
  name: "Asha",
  selectedLanguage: "hi",
  onboardingCompletedAt: null,
  phoneCountryCode: "+91",
  phoneNumber: "9876543210",
};

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    agentId: CONTENT_AGENT,
    personaSlug: null,
    createdAt: new Date("2026-02-01T10:00:00.000Z"),
    ...overrides,
  };
}

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    role: "user" as const,
    content: "namaste",
    createdAt: new Date("2026-02-01T10:00:01.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  countSessions = vi.fn().mockResolvedValue(1);
  findSessionPage = vi.fn().mockResolvedValue([session()]);
  countMessagesBySession = vi.fn().mockResolvedValue(new Map([[SESSION_ID, 2]]));
  findMessageTail = vi.fn().mockResolvedValue([]);
  findByTypeAndIds = vi.fn().mockResolvedValue([]);
  getUserPublic = vi.fn().mockResolvedValue(USER_PUBLIC);
  registerGlobalService("users", { getUserPublic } as unknown as IUsersApi);
});

afterEach(() => {
  clearGlobalServices();
  vi.restoreAllMocks();
});

/**
 * A REAL tag from the committed id map, read rather than restated — a map edit
 * that drops it should fail this file, not leave it asserting a tag the agent
 * can no longer emit.
 */
const MAPPED_TAG = "art_0002";
const MAPPED_TYPE = "aarti";
const MAPPED_ROW_ID = "b6f7be63-34d6-40fc-8b4f-7e56a2434235";

/** A bot turn recommending `tags`, in the content agent's envelope format. */
function botTurnRecommending(tags: string[]) {
  return message({
    id: "55555555-5555-5555-5555-555555555555",
    role: "bot",
    content: JSON.stringify({ reply_text: "Yeh rahi aarti.", content_ids: tags }),
  });
}

describe("getTranscript", () => {
  test("404s on an unknown user rather than returning an empty transcript", async () => {
    getUserPublic.mockResolvedValue(null);

    await expect(
      makeService().getTranscript({ userId: USER_ID, page: 1, pageSize: 10 })
    ).rejects.toMatchObject({ statusCode: 404, errorCode: "NOT_FOUND" });
    // The point of the 404: a mistyped id must not read as "never chatted".
    expect(findSessionPage).not.toHaveBeenCalled();
  });

  test("a known user with no sessions is a 200 with an empty page", async () => {
    countSessions.mockResolvedValue(0);
    findSessionPage.mockResolvedValue([]);

    const result = await makeService().getTranscript({
      userId: USER_ID,
      page: 1,
      pageSize: 10,
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.user).toEqual({
      id: USER_ID,
      name: "Asha",
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });
  });

  test("unwraps the bot envelope to the text the user actually saw", async () => {
    findMessageTail.mockResolvedValue([
      message({
        id: "44444444-4444-4444-4444-444444444444",
        role: "bot",
        content: JSON.stringify({
          reply_text: "Hanuman Chalisa suniye.",
          confidence: "high",
          content_ids: ["art_0011"],
        }),
        createdAt: new Date("2026-02-01T10:00:02.000Z"),
      }),
      message(),
    ]);

    const [only] = (
      await makeService().getTranscript({ userId: USER_ID, page: 1, pageSize: 10 })
    ).items;

    expect(only?.messages.map((m) => m.message)).toEqual([
      "namaste",
      "Hanuman Chalisa suniye.",
    ]);
    expect(only?.messages[1]?.confidence).toBe("high");
    // A user turn never round-tripped through the agent, so it has no envelope
    // and therefore no confidence.
    expect(only?.messages[0]?.confidence).toBeNull();
  });

  test("reverses the newest-first tail into reading order", async () => {
    findMessageTail.mockResolvedValue([
      message({ id: "b", createdAt: new Date("2026-02-01T10:00:09.000Z") }),
      message({ id: "a", createdAt: new Date("2026-02-01T10:00:01.000Z") }),
    ]);

    const [only] = (
      await makeService().getTranscript({ userId: USER_ID, page: 1, pageSize: 10 })
    ).items;

    expect(only?.messages.map((m) => m.id)).toEqual(["a", "b"]);
  });

  test("labels the session with the arm its stored agent serves", async () => {
    const [only] = (
      await makeService().getTranscript({ userId: USER_ID, page: 1, pageSize: 10 })
    ).items;

    expect(only?.variant).toBe("content_chat");
    expect(only?.agentId).toBe(CONTENT_AGENT);
  });

  test("a retired agent reports an unknown arm, NOT control", async () => {
    findSessionPage.mockResolvedValue([session({ agentId: "deadbeef-retired" })]);

    const [only] = (
      await makeService().getTranscript({ userId: USER_ID, page: 1, pageSize: 10 })
    ).items;

    // Null is the honest answer — collapsing it to "control" would misreport
    // the experiment for every conversation opened before the arm was retired.
    expect(only?.variant).toBeNull();
  });

  test("truncated is derived from the stored COUNT, not from the tail length", async () => {
    countMessagesBySession.mockResolvedValue(new Map([[SESSION_ID, 812]]));
    findMessageTail.mockResolvedValue([message()]);

    const [only] = (
      await makeService().getTranscript({ userId: USER_ID, page: 1, pageSize: 10 })
    ).items;

    expect(only?.truncated).toBe(true);
    expect(only?.messageCount).toBe(812);
  });

  test("a complete session is not flagged as truncated", async () => {
    countMessagesBySession.mockResolvedValue(new Map([[SESSION_ID, 2]]));
    findMessageTail.mockResolvedValue([message({ id: "b" }), message({ id: "a" })]);

    const [only] = (
      await makeService().getTranscript({ userId: USER_ID, page: 1, pageSize: 10 })
    ).items;

    expect(only?.truncated).toBe(false);
  });

  test("a session absent from the count map reports zero, not NaN", async () => {
    countMessagesBySession.mockResolvedValue(new Map());

    const [only] = (
      await makeService().getTranscript({ userId: USER_ID, page: 1, pageSize: 10 })
    ).items;

    expect(only?.messageCount).toBe(0);
    expect(only?.truncated).toBe(false);
  });

  test("translates the page number into an offset", async () => {
    await makeService().getTranscript({ userId: USER_ID, page: 3, pageSize: 10 });

    expect(findSessionPage).toHaveBeenCalledWith({
      userId: USER_ID,
      skip: 20,
      take: 10,
    });
  });

  test("surfaces a users-facade failure rather than swallowing it", async () => {
    getUserPublic.mockRejectedValue(new Error("boom"));

    await expect(
      makeService().getTranscript({ userId: USER_ID, page: 1, pageSize: 10 })
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("recommendations", () => {
  test("resolves an agent tag to its catalogue title", async () => {
    findMessageTail.mockResolvedValue([botTurnRecommending([MAPPED_TAG])]);
    findByTypeAndIds.mockResolvedValue([
      {
        type: MAPPED_TYPE,
        id: MAPPED_ROW_ID,
        title: "Om Jai Jagdish Hare",
        playUrl: "https://cdn/a.mp3",
        icon: "https://cdn/a.png",
        gated: true,
      },
    ]);

    const [only] = (
      await makeService().getTranscript({ userId: USER_ID, page: 1, pageSize: 10 })
    ).items;

    expect(only?.messages[0]?.recommendations).toEqual([
      { tag: MAPPED_TAG, type: MAPPED_TYPE, title: "Om Jai Jagdish Hare" },
    ]);
  });

  test("a tag absent from the id map is REPORTED, not dropped", async () => {
    findMessageTail.mockResolvedValue([botTurnRecommending(["not_a_real_tag"])]);

    const [only] = (
      await makeService().getTranscript({ userId: USER_ID, page: 1, pageSize: 10 })
    ).items;

    // The mobile path drops these silently, which is right for a caller that
    // can do nothing with them. Here it is the answer to "why was this card
    // empty in the app", so it must survive to the wire.
    expect(only?.messages[0]?.recommendations).toEqual([
      { tag: "not_a_real_tag", type: null, title: null },
    ]);
  });

  test("a mapped tag whose row is gone keeps its type but has no title", async () => {
    findMessageTail.mockResolvedValue([botTurnRecommending([MAPPED_TAG])]);
    // Deactivated or deleted in the CMS — the catalogue query returns nothing.
    findByTypeAndIds.mockResolvedValue([]);

    const [only] = (
      await makeService().getTranscript({ userId: USER_ID, page: 1, pageSize: 10 })
    ).items;

    expect(only?.messages[0]?.recommendations).toEqual([
      { tag: MAPPED_TAG, type: MAPPED_TYPE, title: null },
    ]);
  });

  test("a user turn never carries recommendations", async () => {
    findMessageTail.mockResolvedValue([message()]);

    const [only] = (
      await makeService().getTranscript({ userId: USER_ID, page: 1, pageSize: 10 })
    ).items;

    expect(only?.messages[0]?.recommendations).toEqual([]);
  });

  test("the catalogue is queried ONCE for the whole page, not per turn", async () => {
    findMessageTail.mockResolvedValue([
      botTurnRecommending([MAPPED_TAG]),
      botTurnRecommending([MAPPED_TAG]),
    ]);

    await makeService().getTranscript({ userId: USER_ID, page: 1, pageSize: 10 });

    expect(findByTypeAndIds).toHaveBeenCalledTimes(1);
  });

  test("no catalogue query at all when nothing was recommended", async () => {
    findMessageTail.mockResolvedValue([message()]);

    await makeService().getTranscript({ userId: USER_ID, page: 1, pageSize: 10 });

    expect(findByTypeAndIds).not.toHaveBeenCalled();
  });
});
