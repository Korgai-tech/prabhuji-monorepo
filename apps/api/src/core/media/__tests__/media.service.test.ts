import { describe, expect, test, vi } from "vitest";
import { ValidationError } from "@api/shared/errors";
import { MediaService } from "@api/core/media/services";
import type { S3MediaRepository } from "@api/core/media/repositories";
import type { HeadResult } from "@api/core/media/types";

const BASE = "http://localhost:4566/app-local-media";
const KEY_RE =
  /^aarti\/audio-item\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$/;

function makeService(
  headResult: HeadResult = { exists: true, contentType: "audio/mpeg", sizeBytes: 100 },
  options: { optimizeUploads?: boolean } = {}
) {
  const s3 = {
    presignPut: vi.fn<(...args: unknown[]) => Promise<string>>().mockResolvedValue(
      "https://s3.example/signed?sig=abc"
    ),
    presignGet: vi.fn<(...args: unknown[]) => Promise<string>>().mockResolvedValue(
      "https://s3.example/signed-get?sig=abc"
    ),
    headObject: vi.fn<(...args: unknown[]) => Promise<HeadResult>>().mockResolvedValue(headResult),
  };
  const ledger = {
    record: vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
  };
  const service = new MediaService(s3 as unknown as S3MediaRepository, ledger, BASE, options);
  return { service, s3, ledger };
}

const validPresign = {
  module: "aarti",
  entity: "audioItem",
  field: "audioStreamUrl",
  filename: "morning-aarti.mp3",
  contentType: "audio/mpeg",
  sizeBytes: 5_000_000,
  uploadedBy: "11111111-1111-1111-1111-111111111111",
};

describe("MediaService.presign", () => {
  test("mints a server-side key, records the ledger, pins signed headers", async () => {
    const { service, s3, ledger } = makeService();
    const res = await service.presign(validPresign);

    expect(res.key).toMatch(KEY_RE);
    expect(res.publicUrl).toBe(`${BASE}/${res.key}`);
    expect(res.uploadUrl).toBe("https://s3.example/signed?sig=abc");
    // Content-Type + Content-Length + immutable Cache-Control pinned into the presign.
    expect(s3.presignPut).toHaveBeenCalledWith(
      expect.objectContaining({
        key: res.key,
        contentType: "audio/mpeg",
        contentLength: 5_000_000,
        cacheControl: "public, max-age=31536000, immutable",
        expiresInSeconds: 300,
      })
    );
    // Ledger written at presign with the JWT subject, never a client field.
    expect(ledger.record).toHaveBeenCalledWith(
      expect.objectContaining({ key: res.key, uploadedBy: validPresign.uploadedBy })
    );
  });

  test("the filename CANNOT influence the key (path traversal is structurally impossible)", async () => {
    const { service } = makeService();
    const res = await service.presign({ ...validPresign, filename: "../../etc/passwd" });
    expect(res.key).toMatch(KEY_RE); // extension from content-type, uuid server-minted
    expect(res.key).not.toContain("etc");
    expect(res.key).not.toContain("..");
  });

  test("fails closed on an unknown (module, entity, field) triple", async () => {
    const { service } = makeService();
    await expect(
      service.presign({ ...validPresign, field: "notARealField" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test("rejects a content type outside the field's allowlist (no MP3 in an image slot)", async () => {
    const { service } = makeService();
    await expect(
      service.presign({
        ...validPresign,
        entity: "audioItem",
        field: "coverImageUrl",
        contentType: "audio/mpeg",
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test("rejects a size over the per-class cap", async () => {
    const { service } = makeService();
    await expect(
      service.presign({ ...validPresign, sizeBytes: 51 * 1024 * 1024 }) // audio cap = 50 MB
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("MediaService.presign — upload optimizer (TAM-267)", () => {
  const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const STATUS_KEY_RE = new RegExp(`^status/status-item/${UUID}\\.mp4$`);
  const statusVideo = {
    ...validPresign,
    module: "status",
    entity: "statusItem",
    field: "videoUrl",
    filename: "clip.mp4",
    contentType: "video/mp4",
    sizeBytes: 19_000_000,
  };
  const signedHeaders = {
    "Content-Type": "video/mp4",
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  test("flag OFF: an optimisable upload signs the FINAL key directly, processing:false", async () => {
    const { service, s3, ledger } = makeService(undefined, { optimizeUploads: false });
    const res = await service.presign(statusVideo);

    expect(res.processing).toBe(false);
    expect(res.key).toMatch(STATUS_KEY_RE);
    expect(s3.presignPut).toHaveBeenCalledWith(expect.objectContaining({ key: res.key }));
    expect(ledger.record).toHaveBeenCalledWith(expect.objectContaining({ key: res.key }));
    expect(res.headers).toEqual(signedHeaders);
  });

  test("flag defaults OFF when the option is omitted", async () => {
    const { service, s3 } = makeService();
    const res = await service.presign(validPresign);
    expect(res.processing).toBe(false);
    expect(s3.presignPut).toHaveBeenCalledWith(expect.objectContaining({ key: res.key }));
  });

  test("flag ON + status mp4: PUT signs incoming/<key>; key, publicUrl and ledger stay FINAL", async () => {
    const { service, s3, ledger } = makeService(undefined, { optimizeUploads: true });
    const res = await service.presign(statusVideo);

    expect(res.processing).toBe(true);
    expect(res.key).toMatch(STATUS_KEY_RE);
    expect(res.publicUrl).toBe(`${BASE}/${res.key}`);
    expect(s3.presignPut).toHaveBeenCalledWith({
      key: `incoming/${res.key}`,
      contentType: "video/mp4",
      contentLength: 19_000_000,
      cacheControl: "public, max-age=31536000, immutable",
      expiresInSeconds: 300,
    });
    expect(ledger.record).toHaveBeenCalledWith(expect.objectContaining({ key: res.key }));
    // The signed headers are identical to the direct path.
    expect(res.headers).toEqual(signedHeaders);
  });

  test("flag ON + aarti mp3: audio is optimised too", async () => {
    const { service, s3 } = makeService(undefined, { optimizeUploads: true });
    const res = await service.presign(validPresign);
    expect(res.processing).toBe(true);
    expect(s3.presignPut).toHaveBeenCalledWith(
      expect.objectContaining({ key: `incoming/${res.key}` })
    );
  });

  test("flag ON + an IMAGE in a banner field (video-capable) uploads directly", async () => {
    const { service, s3 } = makeService(undefined, { optimizeUploads: true });
    const res = await service.presign({
      ...validPresign,
      module: "home",
      entity: "homeBanner",
      field: "mediaUrl",
      filename: "banner.webp",
      contentType: "image/webp",
      sizeBytes: 500_000,
    });
    expect(res.processing).toBe(false);
    expect(res.key).toMatch(/^home\/home-banner\/.+\.webp$/);
    expect(s3.presignPut).toHaveBeenCalledWith(expect.objectContaining({ key: res.key }));
  });

  test("flag ON + a field that is never optimised (aarti cover image) uploads directly", async () => {
    const { service, s3 } = makeService(undefined, { optimizeUploads: true });
    const res = await service.presign({
      ...validPresign,
      field: "coverImageUrl",
      filename: "cover.png",
      contentType: "image/png",
      sizeBytes: 100_000,
    });
    expect(res.processing).toBe(false);
    expect(s3.presignPut).toHaveBeenCalledWith(expect.objectContaining({ key: res.key }));
  });

  test("saving the final URL before the optimizer wrote it is REJECTED (HEAD miss)", async () => {
    const { service, s3 } = makeService(
      { exists: false, contentType: null, sizeBytes: null },
      { optimizeUploads: true }
    );
    const res = await service.presign(statusVideo);
    expect(res.processing).toBe(true);

    await expect(
      service.validateOwnedUrl({
        module: "status",
        entity: "statusItem",
        field: "videoUrl",
        url: res.publicUrl,
      })
    ).rejects.toThrow("Media object does not exist");
    // It checked the FINAL key — the uploaded incoming/ object does not count.
    expect(s3.headObject).toHaveBeenCalledWith(res.key);
  });
});

describe("MediaService.status (TAM-267)", () => {
  const KEY = "status/status-item/11111111-1111-4111-8111-111111111111.mp4";

  test("ready:false while the final key does not exist", async () => {
    const { service, s3 } = makeService({ exists: false, contentType: null, sizeBytes: null });
    await expect(service.status(KEY)).resolves.toEqual({ ready: false });
    expect(s3.headObject).toHaveBeenCalledWith(KEY);
  });

  test("ready:true once it does", async () => {
    const { service } = makeService({ exists: true, contentType: "video/mp4", sizeBytes: 10 });
    await expect(service.status(KEY)).resolves.toEqual({ ready: true });
  });

  test.each([
    [`incoming/${KEY}`],
    ["incoming/status/11111111-1111-4111-8111-111111111111.mp4"],
    ["status/status-item/not-a-uuid.mp4"],
    ["status/11111111-1111-4111-8111-111111111111.mp4"],
    ["../status/status-item/11111111-1111-4111-8111-111111111111.mp4"],
    ["Status/status-item/11111111-1111-4111-8111-111111111111.mp4"],
    ["status/status-item/11111111-1111-4111-8111-111111111111"],
    [""],
  ])("rejects a non-final key %j without touching S3", async (key) => {
    const { service, s3 } = makeService();
    await expect(service.status(key)).rejects.toBeInstanceOf(ValidationError);
    expect(s3.headObject).not.toHaveBeenCalled();
  });
});

describe("MediaService.validateOwnedUrl (the write-path gate)", () => {
  const target = { module: "aarti", entity: "audioItem", field: "audioStreamUrl" };

  test("accepts a URL this platform minted (prefix + shape + HEAD + content-type)", async () => {
    const { service } = makeService();
    const { key } = await service.presign(validPresign);
    await expect(
      service.validateOwnedUrl({ ...target, url: `${BASE}/${key}` })
    ).resolves.toBeUndefined();
  });

  test("REJECTS a foreign origin (an admin token cannot point at a third-party asset)", async () => {
    const { service } = makeService();
    await expect(
      service.validateOwnedUrl({ ...target, url: "https://evil.example/tracker.gif" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test("rejects a right-origin URL with a foreign/mismatched key shape", async () => {
    const { service } = makeService();
    await expect(
      service.validateOwnedUrl({ ...target, url: `${BASE}/aarti/audio-item/not-a-uuid.mp3` })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test("rejects a minted-shaped URL whose object does not exist (no dangling URLs)", async () => {
    const { service } = makeService({ exists: false, contentType: null, sizeBytes: null });
    const url = `${BASE}/aarti/audio-item/00000000-0000-0000-0000-000000000000.mp3`;
    await expect(service.validateOwnedUrl({ ...target, url })).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  test("rejects when the stored content-type is outside the field's allowlist", async () => {
    const { service } = makeService({ exists: true, contentType: "image/png", sizeBytes: 10 });
    const url = `${BASE}/aarti/audio-item/00000000-0000-0000-0000-000000000000.mp3`;
    await expect(service.validateOwnedUrl({ ...target, url })).rejects.toBeInstanceOf(
      ValidationError
    );
  });
});

describe("MediaService.presignGet (TAM-125 downloads)", () => {
  test("delegates to the S3 repo with the exact key + TTL", async () => {
    const { service, s3 } = makeService();
    const url = await service.presignGet("aarti/audio-item/abc.mp3", 300);
    expect(url).toBe("https://s3.example/signed-get?sig=abc");
    expect(s3.presignGet).toHaveBeenCalledWith({
      key: "aarti/audio-item/abc.mp3",
      expiresInSeconds: 300,
    });
  });
});

describe("MediaService.toKey (TAM-125 downloads)", () => {
  test("strips the public base URL prefix from a stored URL to recover the key", () => {
    const { service } = makeService();
    expect(service.toKey(`${BASE}/aarti/audio-item/abc.mp3`)).toBe(
      "aarti/audio-item/abc.mp3"
    );
  });

  test("returns a bare key unchanged (idempotent)", () => {
    const { service } = makeService();
    expect(service.toKey("aarti/audio-item/abc.mp3")).toBe(
      "aarti/audio-item/abc.mp3"
    );
  });
});

describe("MediaService.validateReusableUrl", () => {
  // Reuse lets a home-feed hero point at a wallpaper's OWN image with no
  // re-upload — a cross-field URL that validateOwnedUrl (strict prefix) rejects.
  const feedHero = { module: "home", entity: "homeFeedItem", field: "heroImageUrl" };

  test("accepts an owned URL minted for a DIFFERENT field (the reuse case)", async () => {
    const { service } = makeService({ exists: true, contentType: "image/webp", sizeBytes: 100 });
    // a wallpaper's own thumbnail key — foreign to home/home-feed-item/
    const url = `${BASE}/wallpaper/wallpaper/11111111-1111-1111-1111-111111111111.webp`;
    await expect(service.validateReusableUrl({ ...feedHero, url })).resolves.toBeUndefined();
  });

  test("still rejects a foreign origin (ownership is non-negotiable)", async () => {
    const { service } = makeService({ exists: true, contentType: "image/webp", sizeBytes: 100 });
    const url = "https://evil.example/wallpaper/wallpaper/11111111-1111-1111-1111-111111111111.webp";
    await expect(service.validateReusableUrl({ ...feedHero, url })).rejects.toBeInstanceOf(ValidationError);
  });

  test("still rejects the wrong media class (an audio object as an image hero)", async () => {
    const { service } = makeService({ exists: true, contentType: "audio/mpeg", sizeBytes: 100 });
    const url = `${BASE}/aarti/audio-item/11111111-1111-1111-1111-111111111111.mp3`;
    await expect(service.validateReusableUrl({ ...feedHero, url })).rejects.toBeInstanceOf(ValidationError);
  });

  test("still rejects a missing object", async () => {
    const { service } = makeService({ exists: false, contentType: null, sizeBytes: null });
    const url = `${BASE}/wallpaper/wallpaper/11111111-1111-1111-1111-111111111111.webp`;
    await expect(service.validateReusableUrl({ ...feedHero, url })).rejects.toBeInstanceOf(ValidationError);
  });

  test("still rejects a non-uuid / traversal-shaped key", async () => {
    const { service } = makeService({ exists: true, contentType: "image/webp", sizeBytes: 100 });
    const url = `${BASE}/wallpaper/wallpaper/not-a-uuid.webp`;
    await expect(service.validateReusableUrl({ ...feedHero, url })).rejects.toBeInstanceOf(ValidationError);
  });
});
