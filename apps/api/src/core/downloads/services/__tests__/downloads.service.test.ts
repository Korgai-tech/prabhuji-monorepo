import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import { fakeSubscriptionApi, freeStatus, proStatus } from "@api/shared/testing";
import { AppError } from "@api/shared/errors";
import { DownloadsService } from "../downloads.service.js";
import type { IAartiApi } from "@api/core/aarti/api";
import type { IMantrasApi } from "@api/core/mantras/api";
import type { IMediaApi } from "@api/core/media/api";

/**
 * Unit coverage for `DownloadsService` (TAM-125).
 *
 * The service owns NO repository (Phase 1 has no downloads registry table). It
 * orchestrates three FACADES via `performServiceCall`: `subscription`
 * (entitlement gate), `aarti` / `mantras` (content lookup), and `media`
 * (presign). All three are registered into `GlobalServiceMap` as fakes here so
 * the tests focus on the #EXPORT_CRITICAL Pro gate + the type-routing + the
 * TTL + envelope shape.
 */

const AARTI_ID = "11111111-1111-1111-1111-111111111111";
const MANTRA_ID = "22222222-2222-2222-2222-222222222222";
const AARTI_KEY = "aarti/audio-item/aud-1.mp3";
const MANTRA_KEY = "mantras/mantra-audio-item/man-1.mp3";
const SIGNED_URL_AARTI = "https://s3.example/aud-1?sig=abc";
const SIGNED_URL_MANTRA = "https://s3.example/man-1?sig=def";
const CHECKSUM_HEX = "a".repeat(64);
const PRESIGN_TTL_SECONDS = 5 * 60;

let presignGet: Mock;
let toKey: Mock;
let aartiGetDownloadSource: Mock;
let mantrasGetDownloadSource: Mock;

/** Register fake facades. Callers override entitlement status per test. */
function registerFacades(
  status: "free" | "active" | "lapsed" | "throws" = "active"
): void {
  registerGlobalService(
    "subscription",
    fakeSubscriptionApi({
      getStatus: () => {
        if (status === "throws") throw new Error("subscription down");
        if (status === "lapsed") return Promise.resolve(proStatus(false));
        return Promise.resolve(status === "active" ? proStatus() : freeStatus());
      },
    })
  );

  presignGet = vi.fn().mockImplementation((key: string) => {
    if (key === AARTI_KEY) return Promise.resolve(SIGNED_URL_AARTI);
    if (key === MANTRA_KEY) return Promise.resolve(SIGNED_URL_MANTRA);
    return Promise.resolve(`https://s3.example/${key}?sig=zzz`);
  });
  toKey = vi.fn((keyOrUrl: string) => keyOrUrl);
  registerGlobalService("media", {
    presign: vi.fn(),
    head: vi.fn(),
    validateOwnedUrl: vi.fn(),
    validateReusableUrl: vi.fn(),
    presignGet,
    toKey,
  } satisfies IMediaApi);

  aartiGetDownloadSource = vi.fn().mockResolvedValue({
    objectKey: AARTI_KEY,
    sizeBytes: 6_300_000,
    durationMs: 352_000,
    checksum: CHECKSUM_HEX,
    contentType: "aarti",
  });
  registerGlobalService("aarti", {
    getAudioSummary: vi.fn(),
    getDownloadSource: aartiGetDownloadSource,
  } satisfies IAartiApi);

  mantrasGetDownloadSource = vi.fn().mockResolvedValue({
    objectKey: MANTRA_KEY,
    sizeBytes: 4_200_000,
    durationMs: 240_000,
    checksum: CHECKSUM_HEX,
    contentType: "mantra",
  });
  registerGlobalService("mantras", {
    getItemSummary: vi.fn(),
    getItemForShare: vi.fn(),
    resolvePlaylist: vi.fn(),
    getDownloadSource: mantrasGetDownloadSource,
  } satisfies IMantrasApi);
}

let service: DownloadsService;

beforeEach(() => {
  service = new DownloadsService();
  // Freeze time so `expiresAt` is deterministic across the suite.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-13T12:00:00.000Z"));
});

afterEach(() => {
  clearGlobalServices();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("#EXPORT_CRITICAL entitlement gate", () => {
  test("Pro caller receives the manifest for AARTI content", async () => {
    registerFacades("active");
    const manifest = await service.getDownloadManifest({
      userId: "pro-user",
      type: "aarti",
      id: AARTI_ID,
    });
    expect(manifest.signedUrl).toBe(SIGNED_URL_AARTI);
    expect(manifest.sizeBytes).toBe(6_300_000);
    expect(manifest.durationMs).toBe(352_000);
    expect(manifest.checksum).toBe(CHECKSUM_HEX);
    expect(manifest.expiresAt).toBe("2026-08-13T12:05:00.000Z");
    // TTL EXACTLY PRESIGN_TTL_SECONDS — wire time must not drift from what
    // S3 signed.
    expect(presignGet).toHaveBeenCalledWith(AARTI_KEY, PRESIGN_TTL_SECONDS);
    // aarti facade got the request `type` verbatim so it can echo it back.
    expect(aartiGetDownloadSource).toHaveBeenCalledWith(AARTI_ID, "aarti");
  });

  test("Pro caller receives the manifest for BHAJAN (same aarti facade, different label)", async () => {
    registerFacades("active");
    const manifest = await service.getDownloadManifest({
      userId: "pro-user",
      type: "bhajan",
      id: AARTI_ID,
    });
    expect(manifest.signedUrl).toBe(SIGNED_URL_AARTI);
    // The service passes `type` to the aarti facade so the label is available
    // for analytics / audit — the facade may echo it in the returned source.
    expect(aartiGetDownloadSource).toHaveBeenCalledWith(AARTI_ID, "bhajan");
    // Mantras facade must NOT be called on the aarti/bhajan branch.
    expect(mantrasGetDownloadSource).not.toHaveBeenCalled();
  });

  test("Pro caller receives the manifest for MANTRA content (via mantras facade)", async () => {
    registerFacades("active");
    const manifest = await service.getDownloadManifest({
      userId: "pro-user",
      type: "mantra",
      id: MANTRA_ID,
    });
    expect(manifest.signedUrl).toBe(SIGNED_URL_MANTRA);
    expect(manifest.sizeBytes).toBe(4_200_000);
    expect(presignGet).toHaveBeenCalledWith(MANTRA_KEY, PRESIGN_TTL_SECONDS);
    // Aarti facade must NOT be called on the mantra branch.
    expect(aartiGetDownloadSource).not.toHaveBeenCalled();
    expect(mantrasGetDownloadSource).toHaveBeenCalledWith(MANTRA_ID);
  });

  test("FREE caller → AppError 403 FORBIDDEN, no signed URL, no lookup", async () => {
    registerFacades("free");
    await expect(
      service.getDownloadManifest({ userId: "free-user", type: "aarti", id: AARTI_ID })
    ).rejects.toMatchObject({
      statusCode: 403,
      errorCode: "FORBIDDEN",
    });
    // Gate throws BEFORE any content lookup or presign — mirrors aarti/mantras play gate.
    expect(aartiGetDownloadSource).not.toHaveBeenCalled();
    expect(mantrasGetDownloadSource).not.toHaveBeenCalled();
    expect(presignGet).not.toHaveBeenCalled();
  });

  test("LAPSED Pro caller → AppError 403 FORBIDDEN (isEntitled=false with status=active)", async () => {
    registerFacades("lapsed");
    await expect(
      service.getDownloadManifest({ userId: "lapsed-user", type: "aarti", id: AARTI_ID })
    ).rejects.toMatchObject({
      statusCode: 403,
      errorCode: "FORBIDDEN",
    });
    expect(presignGet).not.toHaveBeenCalled();
  });

  test("subscription facade throws → FAILS CLOSED (treated as free, 403)", async () => {
    registerFacades("throws");
    await expect(
      service.getDownloadManifest({ userId: "user", type: "aarti", id: AARTI_ID })
    ).rejects.toBeInstanceOf(AppError);
    expect(presignGet).not.toHaveBeenCalled();
  });
});

describe("content lookup", () => {
  test("unknown aarti id → AppError 404 NOT_FOUND (no presign)", async () => {
    registerFacades("active");
    aartiGetDownloadSource.mockResolvedValue(null);
    await expect(
      service.getDownloadManifest({ userId: "pro-user", type: "aarti", id: AARTI_ID })
    ).rejects.toMatchObject({
      statusCode: 404,
      errorCode: "NOT_FOUND",
    });
    expect(presignGet).not.toHaveBeenCalled();
  });

  test("unknown mantra id → AppError 404 NOT_FOUND", async () => {
    registerFacades("active");
    mantrasGetDownloadSource.mockResolvedValue(null);
    await expect(
      service.getDownloadManifest({ userId: "pro-user", type: "mantra", id: MANTRA_ID })
    ).rejects.toMatchObject({
      statusCode: 404,
      errorCode: "NOT_FOUND",
    });
  });

  test("aarti facade returning a source with null durationMs/checksum survives to the wire", async () => {
    registerFacades("active");
    aartiGetDownloadSource.mockResolvedValue({
      objectKey: AARTI_KEY,
      sizeBytes: 6_300_000,
      durationMs: null,
      checksum: null,
      contentType: "aarti",
    });
    const manifest = await service.getDownloadManifest({
      userId: "pro-user",
      type: "aarti",
      id: AARTI_ID,
    });
    // Backfill-in-progress: mobile client falls back to a local probe.
    expect(manifest.durationMs).toBeNull();
    expect(manifest.checksum).toBeNull();
    expect(manifest.sizeBytes).toBe(6_300_000);
    expect(manifest.signedUrl).toBe(SIGNED_URL_AARTI);
  });
});

describe("presign TTL + envelope shape", () => {
  test("expiresAt is exactly now + PRESIGN_TTL_SECONDS (ISO-8601 UTC)", async () => {
    registerFacades("active");
    const start = new Date("2026-08-13T00:00:00.000Z");
    vi.setSystemTime(start);
    const manifest = await service.getDownloadManifest({
      userId: "pro-user",
      type: "aarti",
      id: AARTI_ID,
    });
    const expected = new Date(start.getTime() + PRESIGN_TTL_SECONDS * 1000);
    expect(manifest.expiresAt).toBe(expected.toISOString());
  });

  test("manifest shape includes exactly the wire-facing fields", async () => {
    registerFacades("active");
    const manifest = await service.getDownloadManifest({
      userId: "pro-user",
      type: "aarti",
      id: AARTI_ID,
    });
    // Field-set is fixed — the Zod response schema strips extras, but the
    // service should not emit any either.
    expect(Object.keys(manifest).sort()).toEqual(
      ["checksum", "durationMs", "expiresAt", "signedUrl", "sizeBytes"].sort()
    );
  });
});
