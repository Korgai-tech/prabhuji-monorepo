import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { buildApp } from "@api/app";
import { initAuthModule } from "@api/core/auth";
import { initChatModule } from "@api/core/chat";
import { resetEnvCache } from "@api/shared/config";
import { disconnectPrisma } from "@api/shared/database";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { clearGlobalServices } from "@api/shared/workspace";

/**
 * Integration coverage for `GET /chat/history`'s screen config (TAM-177 /
 * TAM-178) — real Postgres via testcontainers, the real route, the real Zod
 * response serialization.
 *
 * WHY THIS IS AN INTEGRATION TEST AND NOT A UNIT ONE: `introVideo` is built
 * from `MEDIA_PUBLIC_BASE_URL` and then re-validated on the way OUT by
 * `serializerCompiler` against `ChatIntroVideo` (`url` is `.url()`). A base URL
 * that produced a malformed absolute URL would pass every service-level test
 * and 500 the endpoint in `FST_ERR_RESPONSE_SERIALIZATION` — the one failure
 * mode that only shows up once the response crosses the route boundary.
 *
 * The provider is never called: `GET /chat/history` reads, it does not ask the
 * agent anything. The RAGFlow vars are set only because `getChatConfig` FAILS
 * CLOSED (no provider configured ⇒ no variant ⇒ chat disabled for everyone),
 * and this suite is about what each ENABLED arm is served.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-chat-history-tests";

/**
 * One user per arm, chosen so the REAL in-process resolver (`chat.buckets.ts`)
 * places each where this suite needs it — the variant is not mockable, which is
 * the point. Uuids rather than labels because `chat_sessions.user_id` is
 * `@db.Uuid` and the latest-session lookup runs for real here.
 */
const CONTENT_USER = "11111111-1111-4111-8111-000000000004"; // bucket 97
const GITA_USER = "11111111-1111-4111-8111-000000000001"; // bucket 52
const KULDEVTA_USER = "11111111-1111-4111-8111-000000000007"; // bucket 49

interface IntroVideo {
  videoId: string;
  url: string;
  durationMs: number;
  posterUrl?: string;
}

interface HistoryBody {
  success: boolean;
  message: string;
  data: {
    sessionId: string | null;
    previousChat: unknown[];
    nextCursor: string | null;
    chatConfig: {
      enabled: boolean;
      agentId: string | null;
      suggestionSetId?: string;
      recommendedMessages: { id: string; order: number; text: string }[];
      introVideo: IntroVideo | null;
    };
  };
}

let app: FastifyInstance;

function mintToken(sub: string): string {
  return jwt.sign({ sub, email: null }, JWT_SECRET, { expiresIn: "1h" });
}

async function history(userId: string): Promise<HistoryBody> {
  const res = await app.inject({
    method: "GET",
    url: "/chat/history",
    headers: { authorization: `Bearer ${mintToken(userId)}` },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body) as HistoryBody;
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.AUTH_OTP_PEPPER = "integration-test-pepper-not-secret-32chars";
  process.env.AUTH_OTP_PROVIDER = "stub";
  process.env.ENABLE_REDIS = "false";
  // Only so chat is ENABLED at all — see the file comment. No call is made.
  process.env.RAGFLOW_BASE_URL = "https://ragflow.test.invalid";
  process.env.RAGFLOW_API_KEY = "ragflow-integration-test-key";
  resetEnvCache();
  await startTestDb();
  app = await buildApp();
  initAuthModule(app);
  initChatModule(app);
  await app.ready();
}, 120_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

describe("GET /chat/history — chatConfig.introVideo", () => {
  test("the content arm gets a fully-formed clip, hosted on the configured media base", async () => {
    const body = await history(CONTENT_USER);

    expect(body.success).toBe(true);
    expect(body.data.chatConfig.enabled).toBe(true);

    const video = body.data.chatConfig.introVideo;
    expect(video).not.toBeNull();
    expect(video).toMatchObject({
      videoId: "content_chat_intro_v1",
      durationMs: 27_200,
    });

    // THE assertion this ticket exists for: the host is whatever this
    // environment configured, never a value baked into the constants file. A
    // hardcoded CDN would make production serve stage's bucket.
    const base = process.env.MEDIA_PUBLIC_BASE_URL ?? "";
    expect(new URL(video?.url ?? "").origin).toBe(new URL(base).origin);
    // CASE-SENSITIVE, and asserted as such: S3 keys are, so the constant has to
    // spell the uploaded object exactly. `content_chat.mp4` and
    // `Content_Chat.mp4` are different objects, and the wrong one 404s into a
    // play button that never starts rather than into an error anyone notices.
    expect(video?.url).toBe(`${base}/chat/intro/Content_Chat.mp4`);
  });

  test("the gita arm gets its own clip", async () => {
    const body = await history(GITA_USER);
    expect(body.data.chatConfig.enabled).toBe(true);

    const video = body.data.chatConfig.introVideo;
    expect(video).not.toBeNull();
    expect(video).toMatchObject({
      videoId: "gita_chat_intro_v1",
      // MEASURED off Bhagvad_Gita.mp4 — the client paints its badge from this
      // before the first frame decodes and never reconciles it against the
      // file, so a guessed value is wrong forever and silently.
      durationMs: 20_880,
    });
    expect(video?.url).toBe(
      `${process.env.MEDIA_PUBLIC_BASE_URL ?? ""}/chat/intro/Bhagvad_Gita.mp4`
    );
    expect(body.data.chatConfig.suggestionSetId).toBe("gita_v1");
  });

  test("the kuldevta arm gets the clip its deleted intro screen used to show", async () => {
    const body = await history(KULDEVTA_USER);

    const video = body.data.chatConfig.introVideo;
    expect(video).not.toBeNull();
    expect(video).toMatchObject({
      videoId: "kuldevta_chat_intro_v1",
      durationMs: 23_760,
    });
    // A RELATIVE key like the other two, under a different prefix because this
    // asset predates the ticket — it was a hardcoded absolute URL in the entry
    // screen this work deletes. That URL's host was STAGE's media CDN, so
    // keeping it absolute would have had production serving stage's bucket.
    expect(video?.url).toBe(
      `${process.env.MEDIA_PUBLIC_BASE_URL ?? ""}/tutorial/use-audio-as-voice.mp4`
    );
    expect(body.data.chatConfig.suggestionSetId).toBe("kuldevta_v1");
    expect(body.data.chatConfig.recommendedMessages.map((m) => m.text)).toEqual([
      "Meri manokamna poori hogi?",
      "Aapki pooja kis din karni chahiye?",
      "Mere liye sahi raasta kya hai?",
    ]);
  });

  test("the envelope and the content arm's openers are the ones the app ships", async () => {
    const body = await history(CONTENT_USER);

    expect(body.success).toBe(true);
    expect(typeof body.message).toBe("string");
    expect(body.data.chatConfig.suggestionSetId).toBe("general_v2");
    expect(body.data.chatConfig.recommendedMessages.map((m) => m.text)).toEqual([
      "Aaj mann bahut pareshan hai",
      "Hanuman Chalisa suna do",
      "Aaj ka rashifal batao",
    ]);
  });
});
