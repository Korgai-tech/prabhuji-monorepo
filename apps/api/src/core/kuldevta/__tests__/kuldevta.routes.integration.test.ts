import { randomUUID } from "node:crypto";

import { loadRegistry } from "@prabhuji/kuldevta-registry";
import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { buildApp } from "@api/app";
import { initAuthModule } from "@api/core/auth";
import { KuldevtaController } from "@api/core/kuldevta/controllers";
import { makeKuldevtaRepository } from "@api/core/kuldevta/repositories";
import { registerKuldevtaRoutes } from "@api/core/kuldevta/routes";
import { resetEnvCache } from "@api/shared/config";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { clearGlobalServices } from "@api/shared/workspace";

/**
 * Integration coverage for `POST /kuldevta/identify` (TAM-165) — real
 * Postgres via testcontainers, mirroring `deity.routes.integration.test.ts`.
 *
 * `initKuldevtaModule` is deliberately NOT used here: its composition root
 * wires the REAL `callParserAgent`, which requires `RAGFLOW_BASE_URL`/
 * `RAGFLOW_API_KEY` and a live network call. Instead this test wires the
 * same repo → controller → route chain by hand with a stub `callParser`, so
 * the persistence path (real Prisma via `makeKuldevtaRepository(getPrisma())`)
 * and the HTTP boundary (real route/schema/envelope) are both exercised for
 * real, while the network hop is a controlled double.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-kuldevta-tests";

const GOOD_ANSWERS = {
  surname: "Patil",
  ancestralPlace: "Satara, Maharashtra",
  community: "Maratha",
  gotra: "pata nahi",
  templeMentioned: "Jejuri wale khandoba",
  mandirPhoto: "bhandara wale devta",
};

const GOOD_RAW = `{"surname":"Patil","surname_raw":"Patil","community":"Maratha","community_raw":"Maratha","community_inferred":null,"gotra":"Kashyap","gotra_raw":"pata nahi","gotra_defaulted":true,"ancestral_place":{"village":null,"district":"Satara","state":"Maharashtra","raw":"Satara, Maharashtra"},"ancestral_place_may_be_current":false,"language":null,"soft_signals":{"temple_mentioned":"Jejuri wale khandoba","mandir_photo":"bhandara wale devta","other":[]},"answers_provided":5}`;

// A flag threaded through an otherwise-unused answer field so a single stub
// `callParser` can serve both the happy path and the unparseable-output path
// within the same test app.
const TRIGGER_PARSE_ERROR = "TRIGGER_PARSE_ERROR";

/**
 * Same threading trick as `TRIGGER_PARSE_ERROR`: makes the stub parser return
 * a DIFFERENT profile (a Rathore Rajput family, which the matcher resolves to
 * `nagnechi` on the community tier) so one test can re-identify the same user
 * onto a different deity.
 */
const TRIGGER_ALT_PROFILE = "TRIGGER_ALT_PROFILE";

const ALT_RAW = `{"surname":"Rathore","surname_raw":"Rathore","community":"Rathore Rajput","community_raw":"Rathore Rajput","community_inferred":null,"gotra":null,"gotra_raw":null,"gotra_defaulted":false,"ancestral_place":{"village":null,"district":null,"state":null,"raw":null},"ancestral_place_may_be_current":false,"language":null,"soft_signals":{"temple_mentioned":null,"mandir_photo":null,"other":[]},"answers_provided":2}`;

interface IdentifyBody {
  success: boolean;
  message: string;
  data: {
    slug: string;
    nameRoman: string;
    nameDevanagari: string;
    temple: { village: string | null; district: string | null; state: string | null };
    tier: string;
    matchedOn: string[];
  } | null;
}
interface ErrBody {
  success: boolean;
  message: string;
  data: null;
  errorCode?: string;
}

const PERSONA_SESSION_ID = "ragflow-session-from-first-turn";

let app: FastifyInstance;

function mintToken(sub: string): string {
  return jwt.sign({ sub, email: null }, JWT_SECRET, { expiresIn: "1h" });
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.AUTH_OTP_PEPPER = "integration-test-pepper-not-secret-32chars";
  process.env.AUTH_OTP_PROVIDER = "stub";
  process.env.ENABLE_REDIS = "false";
  resetEnvCache();
  await startTestDb();
  app = await buildApp();
  initAuthModule(app);

  const repo = makeKuldevtaRepository(getPrisma());
  const controller = new KuldevtaController({
    callParser: (answers) => {
      if (answers.gotra === TRIGGER_PARSE_ERROR) return Promise.resolve("not valid json {{{");
      if (answers.gotra === TRIGGER_ALT_PROFILE) return Promise.resolve(ALT_RAW);
      return Promise.resolve(GOOD_RAW);
    },
    loadRegistry,
    saveAssignment: (row) => repo.saveAssignment(row),
    imageUrlFor: (slug: string) => `https://cdn.test/kuldevta/kuldevta/${slug}.webp`,
  });
  void app.register((scoped) => {
    registerKuldevtaRoutes(scoped, controller);
  });

  await app.ready();
}, 120_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

describe("auth gate", () => {
  test("without a JWT returns 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/kuldevta/identify",
      payload: GOOD_ANSWERS,
    });
    expect(res.statusCode).toBe(401);
    const body: ErrBody = res.json();
    expect(body.success).toBe(false);
  });
});

describe("POST /kuldevta/identify happy path + upsert", () => {
  test("returns the envelope shape and persists exactly one row across two calls", async () => {
    const userId = randomUUID();
    const token = mintToken(userId);

    const first = await app.inject({
      method: "POST",
      url: "/kuldevta/identify",
      headers: { authorization: `Bearer ${token}` },
      payload: GOOD_ANSWERS,
    });
    expect(first.statusCode).toBe(200);
    const firstBody: IdentifyBody = first.json();
    expect(firstBody.success).toBe(true);
    expect(firstBody.message).toBe("OK");
    expect(firstBody.data).not.toBeNull();
    expect(firstBody.data?.slug).toBe("khandoba");
    expect(firstBody.data?.nameDevanagari).toBe("खंडोबा");
    expect(firstBody.data?.tier).toBe("confirmed");
    expect(Array.isArray(firstBody.data?.matchedOn)).toBe(true);
    expect(firstBody.data).toHaveProperty("temple");

    // Re-answering (e.g. correcting a typo) must UPSERT, not duplicate or 500.
    const second = await app.inject({
      method: "POST",
      url: "/kuldevta/identify",
      headers: { authorization: `Bearer ${token}` },
      payload: GOOD_ANSWERS,
    });
    expect(second.statusCode).toBe(200);

    const rows = await getPrisma().userKuldevta.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kuldevtaSlug).toBe("khandoba");
    expect(rows[0]?.assignmentTier).toBe("confirmed");
  });
});

describe("POST /kuldevta/identify parser failure", () => {
  test("unparseable parser output maps to 502 PARSER_UNAVAILABLE", async () => {
    const token = mintToken(randomUUID());
    const res = await app.inject({
      method: "POST",
      url: "/kuldevta/identify",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...GOOD_ANSWERS, gotra: TRIGGER_PARSE_ERROR },
    });
    expect(res.statusCode).toBe(502);
    const body: ErrBody = res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe("PARSER_UNAVAILABLE");
  });
});

/**
 * C2 — `saveAssignment`'s UPDATE branch clears `ragflowSessionId` and advances
 * `assignedAt` on a re-answer (the latter closes deferred #11).
 *
 * DO NOT READ THIS AS THE PERSONA GUARD. It was written as one, and it is not
 * one any more. When the persona turn moved into `core/chat`, the provider
 * handle moved with it onto `chat_sessions.provider_session_id`; nothing has
 * written `user_kuldevtas.ragflow_session_id` since. So this test went on
 * passing while the behaviour it was protecting — "re-identifying must not
 * leave the persona speaking as the PREVIOUS deity" — silently lost its guard,
 * and stage confirmed the bug live: assignment `nagnechi`, persona still
 * answering "Khandoba".
 *
 * The real guard is now `chat_sessions.persona_slug` plus the drift check in
 * `ChatService.sendMessage`, covered by the "kuldevta persona identity" block
 * in `chat.service.test.ts`. What remains here is a data-hygiene assertion on
 * a column with no live reader — worth keeping while the column exists, worth
 * deleting with it.
 *
 * Step 2 seeds the session id through `saveSessionId` rather than by taking a
 * chat turn, because the persona turn now lives behind `POST /chat/messages`
 * and this test app deliberately wires no RAGFlow and no network (see the
 * header).
 */
describe("POST /kuldevta/identify — re-identification resets the persona session", () => {
  test("a re-assignment to a different deity clears ragflowSessionId and advances assignedAt", async () => {
    const userId = randomUUID();
    const token = mintToken(userId);
    const auth = { authorization: `Bearer ${token}` };

    // 1. Identify → khandoba.
    const first = await app.inject({
      method: "POST",
      url: "/kuldevta/identify",
      headers: auth,
      payload: GOOD_ANSWERS,
    });
    expect(first.statusCode).toBe(200);
    const firstRow = await getPrisma().userKuldevta.findUnique({ where: { userId } });
    expect(firstRow?.kuldevtaSlug).toBe("khandoba");
    const firstAssignedAt = firstRow?.assignedAt;

    // 2. A persona turn happens → a RAGFlow session id is persisted against
    //    that assignment, exactly as `core/chat` does it via the facade.
    await makeKuldevtaRepository(getPrisma()).saveSessionId(userId, PERSONA_SESSION_ID);
    expect((await getPrisma().userKuldevta.findUnique({ where: { userId } }))?.ragflowSessionId).toBe(
      PERSONA_SESSION_ID,
    );

    // 3. Re-identify with different answers → a DIFFERENT deity.
    const second = await app.inject({
      method: "POST",
      url: "/kuldevta/identify",
      headers: auth,
      payload: { ...GOOD_ANSWERS, gotra: TRIGGER_ALT_PROFILE },
    });
    expect(second.statusCode).toBe(200);

    const row = await getPrisma().userKuldevta.findUnique({ where: { userId } });
    expect(row?.kuldevtaSlug).toBe("nagnechi");
    expect(row?.kuldevtaSlug).not.toBe("khandoba");
    // The stale session — which RAGFlow still holds against the OLD deity's
    // Begin inputs — must be gone.
    expect(row?.ragflowSessionId).toBeNull();
    // Deferred #11: the row now describes a new assignment, made now.
    expect(row?.assignedAt.getTime()).toBeGreaterThan(firstAssignedAt?.getTime() ?? 0);
  });
});
