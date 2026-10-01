import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "@api/app";
import { AppError } from "@api/shared/errors";
import { clearGlobalServices, registerGlobalService } from "@api/shared/workspace";
import type { GlobalServiceMap } from "@api/shared/workspace";
import type { UserRole } from "@api/shared/schemas";
import { MediaService } from "@api/core/media/services";
import type { S3MediaRepository } from "@api/core/media/repositories";
import type { HeadResult } from "@api/core/media/types";
import { registerMediaAdminRoutes } from "../media.admin.routes.js";

/**
 * TAM-267 — the `/admin/media/*` wire edge with fake S3/ledger repositories and
 * fake auth/users facades, so it runs in `pnpm verify` with no database or S3.
 * The guard pair is the REAL `authMiddleware` + `adminMiddleware` (via
 * `registerAdminRoute`); only the token check and the role lookup behind them
 * are faked.
 */

const BASE = "https://cdn.example.test";
const ADMIN_TOKEN = "admin-token";
const USER_TOKEN = "user-token";
const KEY = "status/status-item/11111111-1111-4111-8111-111111111111.mp4";

const roles: Record<string, UserRole> = { "admin-id": "admin", "user-id": "user" };

const fakeAuth = {
  verifyToken: (token: string) => {
    if (token === ADMIN_TOKEN) return Promise.resolve({ id: "admin-id", email: "a@x.test" });
    if (token === USER_TOKEN) return Promise.resolve({ id: "user-id", email: "u@x.test" });
    return Promise.reject(new AppError("Invalid token", 401, "INVALID_TOKEN"));
  },
} as unknown as GlobalServiceMap["auth"];

const fakeUsers = {
  getRole: (id: string) => Promise.resolve(roles[id] ?? "user"),
} as unknown as GlobalServiceMap["users"];

let head: HeadResult = { exists: false, contentType: null, sizeBytes: null };
const s3 = {
  presignPut: vi.fn((params: { key: string }) =>
    Promise.resolve(`https://s3.example.test/${params.key}?sig=x`)
  ),
  presignGet: vi.fn(() => Promise.resolve("https://s3.example.test/get")),
  headObject: vi.fn<(key: string) => Promise<HeadResult>>(() => Promise.resolve(head)),
};
const ledger = { record: vi.fn(() => Promise.resolve()) };

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  const service = new MediaService(
    s3 as unknown as S3MediaRepository,
    ledger,
    BASE,
    { optimizeUploads: true }
  );
  await app.register(
    (scoped) => {
      registerMediaAdminRoutes(scoped, service);
    },
    { prefix: "/admin" }
  );
  await app.ready();
});

afterAll(async () => {
  await app.close();
  clearGlobalServices();
});

beforeEach(() => {
  registerGlobalService("auth", fakeAuth);
  registerGlobalService("users", fakeUsers);
  head = { exists: false, contentType: null, sizeBytes: null };
  s3.headObject.mockClear();
  s3.presignPut.mockClear();
});

function getStatus(key: string | undefined, token: string | null = ADMIN_TOKEN) {
  const qs = key === undefined ? "" : `?key=${encodeURIComponent(key)}`;
  return app.inject({
    method: "GET",
    url: `/admin/media/status${qs}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("GET /admin/media/status", () => {
  test("ready:false while the final key does not exist yet", async () => {
    const res = await getStatus(KEY);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { ready: false } });
    expect(s3.headObject).toHaveBeenCalledWith(KEY);
  });

  test("ready:true once the optimizer has written it", async () => {
    head = { exists: true, contentType: "video/mp4", sizeBytes: 10 };
    const res = await getStatus(KEY);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { ready: true } });
  });

  test.each([
    ["an incoming/ staging key", `incoming/${KEY}`],
    ["a two-segment incoming/ key", "incoming/status/11111111-1111-4111-8111-111111111111.mp4"],
    ["a non-uuid key", "status/status-item/not-a-uuid.mp4"],
    ["a traversal-shaped key", "../status-item/11111111-1111-4111-8111-111111111111.mp4"],
    ["an empty key", ""],
    ["a missing key", undefined],
  ])("400 VALIDATION_ERROR for %s", async (_label, key) => {
    const res = await getStatus(key);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, errorCode: "VALIDATION_ERROR" });
    expect(s3.headObject).not.toHaveBeenCalled();
  });

  test("401 without a bearer token (guard runs before validation)", async () => {
    const res = await getStatus(KEY, null);
    expect(res.statusCode).toBe(401);
    expect(s3.headObject).not.toHaveBeenCalled();
  });

  test("401 with an invalid token", async () => {
    const res = await getStatus(KEY, "garbage");
    expect(res.statusCode).toBe(401);
    expect(s3.headObject).not.toHaveBeenCalled();
  });

  test("403 for an authenticated non-admin", async () => {
    const res = await getStatus(KEY, USER_TOKEN);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, errorCode: "FORBIDDEN" });
    expect(s3.headObject).not.toHaveBeenCalled();
  });
});

describe("POST /admin/media/presign (flag on)", () => {
  test("an optimisable upload returns processing:true, the FINAL key, and signs incoming/", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/media/presign",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: {
        module: "status",
        entity: "statusItem",
        field: "videoUrl",
        filename: "clip.mp4",
        contentType: "video/mp4",
        sizeBytes: 1_000_000,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ data: { key: string; publicUrl: string; processing: boolean } }>();
    expect(body.data.processing).toBe(true);
    expect(body.data.key).toMatch(/^status\/status-item\//);
    expect(body.data.publicUrl).toBe(`${BASE}/${body.data.key}`);
    expect(s3.presignPut).toHaveBeenCalledWith(
      expect.objectContaining({ key: `incoming/${body.data.key}` })
    );
  });
});
