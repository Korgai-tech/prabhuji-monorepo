import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { buildApp } from "@api/app";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import { resetEnvCache } from "@api/shared/config";
import { initAuthModule } from "@api/core/auth";
import { initSubscriptionModule } from "@api/core/subscription";
import { initEngagementModule } from "@api/core/engagement";
import { initDeityModule } from "@api/core/deity";
import { initAartiModule } from "@api/core/aarti";
import { initMantrasModule } from "@api/core/mantras";
import { initDownloadsModule } from "@api/core/downloads";
import type { IMediaApi } from "@api/core/media/api";

/**
 * Integration coverage for the Downloads endpoint (TAM-125) against real
 * Postgres via testcontainers.
 *
 * SHAPE: JWT + fixtures for three subscription profiles (Pro / lapsed / free)
 * + one aarti/bhajan row + one mantra row. Asserts:
 *   - Free / lapsed callers → 403 FORBIDDEN with no signed URL.
 *   - Pro caller for `aarti|bhajan|mantra` → 200 with envelope + signed URL.
 *   - Unknown id → 404 NOT_FOUND.
 *   - Missing Authorization → 401 UNAUTHORIZED (authMiddleware).
 *   - Zod-invalid `type` or `id` → 400 VALIDATION_ERROR.
 *
 * The `media` facade is REGISTERED AS A STUB in-suite (never `initMediaModule`)
 * so this test does not need `@aws-sdk/*` connectivity — the presign contract
 * is unit-tested in `apps/api/src/core/media/__tests__/media.service.test.ts`;
 * here the download endpoint's plumbing is what's under test.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-downloads-tests";

interface ManifestBody {
  success: boolean;
  message: string;
  data: {
    signedUrl: string;
    sizeBytes: number;
    durationMs: number | null;
    checksum: string | null;
    expiresAt: string;
  };
}

interface ErrorBody {
  success: false;
  message: string;
  data: null;
  errorCode?: string;
}

const PRO_USER = randomUUID();
const FREE_USER = randomUUID();
const LAPSED_USER = randomUUID();

const AARTI_ID = randomUUID();
const MANTRA_ID = randomUUID();

// Stable stub values so the assertions can compare bytes.
const AARTI_URL = "https://cdn.example.com/aarti/audio-item/aarti-1.mp3";
const MANTRA_URL = "https://cdn.example.com/mantras/mantra-audio-item/mantra-1.mp3";
const AARTI_KEY = "aarti/audio-item/aarti-1.mp3";
const MANTRA_KEY = "mantras/mantra-audio-item/mantra-1.mp3";
const SIGNED_AARTI = "https://s3.example.local/aarti-1?sig=aaa";
const SIGNED_MANTRA = "https://s3.example.local/mantra-1?sig=mmm";
const CHECKSUM = "b".repeat(64);

let app: FastifyInstance;

function token(sub: string): string {
  return jwt.sign({ sub, email: `${sub}@prabhuji.internal` }, JWT_SECRET, {
    expiresIn: "1h",
  });
}
const auth = (userId: string): { authorization: string } => ({
  authorization: `Bearer ${token(userId)}`,
});

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.AUTH_OTP_PEPPER = "integration-test-pepper-not-secret-32chars";
  process.env.AUTH_OTP_PROVIDER = "stub";
  process.env.ENABLE_REDIS = "false";
  process.env.MEDIA_BUCKET = "test-bucket";
  process.env.MEDIA_PUBLIC_BASE_URL = "https://cdn.example.com";
  resetEnvCache();

  await startTestDb();
  app = await buildApp();

  // Wire ONLY the modules under test. `initMediaModule` is intentionally
  // NOT called — the stub facade below covers `presignGet` + `toKey` with
  // deterministic values.
  initAuthModule(app);
  initSubscriptionModule(app);
  initEngagementModule();
  initDeityModule(app);
  initAartiModule(app);
  initMantrasModule(app);
  initDownloadsModule(app);

  // Stub media facade — the aarti/mantras service calls `toKey` on the stored
  // URL, and the downloads service calls `presignGet` on the resolved key.
  // Register AFTER the module inits so it wins the resolution (both go
  // through the same `services` map in `context.ts`).
  const stubMedia: IMediaApi = {
    presign: () => Promise.reject(new Error("presign not stubbed for downloads integration test")),
    head: () =>
      Promise.resolve({
        exists: false,
        contentType: null,
        sizeBytes: null,
        etag: null,
        metadata: null,
      }),
    validateOwnedUrl: () => Promise.resolve(),
    validateReusableUrl: () => Promise.resolve(),
    presignGet: (key) => {
      if (key === AARTI_KEY) return Promise.resolve(SIGNED_AARTI);
      if (key === MANTRA_KEY) return Promise.resolve(SIGNED_MANTRA);
      return Promise.resolve(`https://s3.example.local/${key}?sig=xxx`);
    },
    toKey: (keyOrUrl) => {
      const prefix = "https://cdn.example.com/";
      return keyOrUrl.startsWith(prefix) ? keyOrUrl.slice(prefix.length) : keyOrUrl;
    },
  };
  registerGlobalService("media", stubMedia);

  await app.ready();

  const prisma = getPrisma();

  // Seed one aarti/bhajan row (audio_items) — sizeBytes populated so
  // getDownloadSource returns non-null.
  await prisma.audioItem.create({
    data: {
      id: AARTI_ID,
      slug: `download-aarti-${AARTI_ID.slice(0, 8)}`,
      title: "Sample Aarti",
      coverImageUrl: "https://cdn.example.com/aarti/audio-item/cover.png",
      audioStreamUrl: AARTI_URL,
      isActive: true,
      sizeBytes: BigInt(6_300_000),
      durationMs: 352_000,
      checksum: CHECKSUM,
    },
  });

  // Seed one mantra row.
  await prisma.mantraAudioItem.create({
    data: {
      id: MANTRA_ID,
      slug: `download-mantra-${MANTRA_ID.slice(0, 8)}`,
      title: "Sample Mantra",
      type: "mantra",
      artworkUrl: "https://cdn.example.com/mantras/mantra-audio-item/art.png",
      audioUrl: MANTRA_URL,
      mantraText: "ॐ नमः शिवाय",
      isActive: true,
      sizeBytes: BigInt(4_200_000),
      durationMs: 240_000,
      checksum: CHECKSUM,
    },
  });

  // Seed subscription rows. `SubscriptionService.getStatus` returns a
  // defensive free shape for a missing row, so FREE_USER needs no fixture;
  // PRO_USER gets an entitled `active` row (future `expiresAt`); LAPSED_USER
  // gets an `active` row whose `expiresAt` has passed — `computeIsEntitled`
  // then reports `isEntitled: false` for the same status label.
  await prisma.subscription.upsert({
    where: { userId: PRO_USER },
    create: {
      userId: PRO_USER,
      status: "active",
      provider: "decentro",
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
    update: {},
  });
  await prisma.subscription.upsert({
    where: { userId: LAPSED_USER },
    create: {
      userId: LAPSED_USER,
      status: "active",
      provider: "decentro",
      expiresAt: new Date(Date.now() - 24 * 3600 * 1000),
    },
    update: {},
  });
}, 180_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

describe("auth gate", () => {
  test("no JWT → 401 UNAUTHORIZED", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/content/aarti/${AARTI_ID}/download`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("Zod validation on path params", () => {
  test("invalid `type` → 400 VALIDATION_ERROR", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/content/podcast/${AARTI_ID}/download`,
      headers: auth(PRO_USER),
    });
    expect(res.statusCode).toBe(400);
  });

  test("non-uuid `id` → 400 VALIDATION_ERROR", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/content/aarti/not-a-uuid/download`,
      headers: auth(PRO_USER),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("entitlement gate (#EXPORT_CRITICAL)", () => {
  test("FREE user → 403 FORBIDDEN, no signed URL", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/content/aarti/${AARTI_ID}/download`,
      headers: auth(FREE_USER),
    });
    expect(res.statusCode).toBe(403);
    const body = res.json<ErrorBody>();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe("FORBIDDEN");
  });

  test("LAPSED Pro user → 403 FORBIDDEN, no signed URL", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/content/mantra/${MANTRA_ID}/download`,
      headers: auth(LAPSED_USER),
    });
    expect(res.statusCode).toBe(403);
    const body = res.json<ErrorBody>();
    expect(body.errorCode).toBe("FORBIDDEN");
  });
});

describe("Pro caller happy paths", () => {
  test("aarti → 200 with envelope + signed URL", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/content/aarti/${AARTI_ID}/download`,
      headers: auth(PRO_USER),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<ManifestBody>();
    expect(body.success).toBe(true);
    expect(body.data.signedUrl).toBe(SIGNED_AARTI);
    expect(body.data.sizeBytes).toBe(6_300_000);
    expect(body.data.durationMs).toBe(352_000);
    expect(body.data.checksum).toBe(CHECKSUM);
    // `expiresAt` is ISO-8601; assert format, not exact time.
    expect(body.data.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
  });

  test("bhajan (same aarti facade, echoed type) → 200 with signed URL", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/content/bhajan/${AARTI_ID}/download`,
      headers: auth(PRO_USER),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<ManifestBody>();
    expect(body.data.signedUrl).toBe(SIGNED_AARTI);
    expect(body.data.sizeBytes).toBe(6_300_000);
  });

  test("mantra → 200 with envelope + signed URL", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/content/mantra/${MANTRA_ID}/download`,
      headers: auth(PRO_USER),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<ManifestBody>();
    expect(body.data.signedUrl).toBe(SIGNED_MANTRA);
    expect(body.data.sizeBytes).toBe(4_200_000);
  });
});

describe("content lookup", () => {
  test("unknown aarti id → 404 NOT_FOUND", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/content/aarti/${randomUUID()}/download`,
      headers: auth(PRO_USER),
    });
    expect(res.statusCode).toBe(404);
    const body = res.json<ErrorBody>();
    expect(body.errorCode).toBe("NOT_FOUND");
  });

  test("unknown mantra id → 404 NOT_FOUND", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/content/mantra/${randomUUID()}/download`,
      headers: auth(PRO_USER),
    });
    expect(res.statusCode).toBe(404);
  });
});
