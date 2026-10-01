import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@api/shared/errors";
import { clearGlobalServices, registerGlobalService } from "@api/shared/workspace";
import type {
  PaywallUtmOverrideRepository,
  PaywallUtmOverrideRow,
} from "@api/core/paywall/repositories";
import { PaywallUtmOverrideAdminService } from "../paywall-utm-override.admin.service.js";

const ROW: PaywallUtmOverrideRow = {
  id: "0199a0e0-0000-7000-8000-000000000001",
  utmGroup: "Diwali - Hindi",
  enabled: true,
  overrides: {
    locales: {
      hi: {
        media: {
          mediaType: "video",
          url: "https://cdn/stored.mp4",
          thumbnailUrl: null,
          mediaId: "stored_v1",
        },
      },
    },
  },
  createdAt: new Date("2026-08-19T00:00:00Z"),
  updatedAt: new Date("2026-08-19T00:00:00Z"),
};

const repo = {
  findAll: vi.fn(),
  findById: vi.fn(),
  findIdByUtmGroup: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const invalidateUtmOverrides = vi.fn();
const validateOwnedUrl = vi.fn();

function makeService(): PaywallUtmOverrideAdminService {
  return new PaywallUtmOverrideAdminService(
    repo as unknown as PaywallUtmOverrideRepository,
    { invalidateUtmOverrides }
  );
}

beforeEach(() => {
  for (const fn of Object.values(repo)) fn.mockReset();
  invalidateUtmOverrides.mockReset();
  validateOwnedUrl.mockReset().mockResolvedValue(undefined);
  registerGlobalService("media", { validateOwnedUrl } as never);
});

afterEach(() => {
  clearGlobalServices();
});

describe("create", () => {
  it("trims the ad group, writes, and invalidates the cached index", async () => {
    repo.findIdByUtmGroup.mockResolvedValue(null);
    repo.create.mockResolvedValue(ROW);

    const out = await makeService().create({
      utmGroup: "  Diwali - Hindi  ",
      enabled: true,
      overrides: { locales: {} },
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ utmGroup: "Diwali - Hindi" })
    );
    expect(invalidateUtmOverrides).toHaveBeenCalledTimes(1);
    expect(out.utmGroup).toBe("Diwali - Hindi");
  });

  /** A readable 409 beats a unique-violation surfacing as a 500. */
  it("409s when the ad group already has an override", async () => {
    repo.findIdByUtmGroup.mockResolvedValue("some-other-id");

    await expect(
      makeService().create({ utmGroup: "Diwali - Hindi", enabled: true, overrides: { locales: {} } })
    ).rejects.toMatchObject({ statusCode: 409, errorCode: "ALREADY_EXISTS" });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("rejects a hero URL our presign flow did not mint, before writing", async () => {
    repo.findIdByUtmGroup.mockResolvedValue(null);
    validateOwnedUrl.mockRejectedValue(new AppError("not ours", 400, "VALIDATION_ERROR"));

    await expect(
      makeService().create({
        utmGroup: "Diwali",
        enabled: true,
        overrides: {
          locales: {
            hi: {
              media: {
                mediaType: "image",
                url: "https://evil.example/a.png",
                thumbnailUrl: null,
                mediaId: "a",
              },
            },
          },
        },
      })
    ).rejects.toBeInstanceOf(AppError);
    expect(repo.create).not.toHaveBeenCalled();
    expect(invalidateUtmOverrides).not.toHaveBeenCalled();
  });
});

describe("update", () => {
  it("404s on an unknown id without touching the repository's write path", async () => {
    repo.findById.mockResolvedValue(null);

    await expect(makeService().update(ROW.id, { enabled: false })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("passes only the keys the caller sent", async () => {
    repo.findById.mockResolvedValue(ROW);
    repo.update.mockResolvedValue({ ...ROW, enabled: false });

    await makeService().update(ROW.id, { enabled: false });

    expect(repo.update).toHaveBeenCalledWith(ROW.id, { enabled: false });
  });

  it("allows a rename to the SAME ad group without a self-409", async () => {
    repo.findById.mockResolvedValue(ROW);
    repo.update.mockResolvedValue(ROW);

    await makeService().update(ROW.id, { utmGroup: "Diwali - Hindi" });

    expect(repo.findIdByUtmGroup).not.toHaveBeenCalled();
  });

  it("409s when renaming onto another row's ad group", async () => {
    repo.findById.mockResolvedValue(ROW);
    repo.findIdByUtmGroup.mockResolvedValue("another-id");

    await expect(makeService().update(ROW.id, { utmGroup: "Holi" })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(repo.update).not.toHaveBeenCalled();
  });

  /**
   * Idempotency: a form re-save carries the stored hero back down, and those
   * URLs are already ours. Re-validating them would 400 an edit to the title.
   */
  it("does not re-validate a hero URL the row already holds", async () => {
    repo.findById.mockResolvedValue(ROW);
    repo.update.mockResolvedValue(ROW);

    await makeService().update(ROW.id, {
      overrides: {
        locales: {
          hi: {
            media: {
              mediaType: "video",
              url: "https://cdn/stored.mp4",
              thumbnailUrl: null,
              mediaId: "stored_v1",
            },
          },
        },
      },
    });

    expect(validateOwnedUrl).not.toHaveBeenCalled();
  });

  it("validates a hero URL the row does NOT already hold", async () => {
    repo.findById.mockResolvedValue(ROW);
    repo.update.mockResolvedValue(ROW);

    await makeService().update(ROW.id, {
      overrides: {
        locales: {
          hi: {
            media: {
              mediaType: "image",
              url: "https://cdn/new.png",
              thumbnailUrl: null,
              mediaId: "new",
            },
          },
        },
      },
    });

    expect(validateOwnedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn/new.png", entity: "paywallHeroMedia" })
    );
  });

  /** The row existed a moment ago, so a null write result means a concurrent DELETE. */
  it("404s when the row is deleted mid-update", async () => {
    repo.findById.mockResolvedValue(ROW);
    repo.update.mockResolvedValue(null);

    await expect(makeService().update(ROW.id, { enabled: false })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(invalidateUtmOverrides).not.toHaveBeenCalled();
  });
});

describe("remove", () => {
  it("invalidates the cached index", async () => {
    repo.delete.mockResolvedValue(true);
    await makeService().remove(ROW.id);
    expect(invalidateUtmOverrides).toHaveBeenCalledTimes(1);
  });

  it("404s and invalidates nothing when the row is already gone", async () => {
    repo.delete.mockResolvedValue(false);
    await expect(makeService().remove(ROW.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(invalidateUtmOverrides).not.toHaveBeenCalled();
  });
});

describe("read", () => {
  /** The CMS must show exactly what the paywall would serve, junk keys and all removed. */
  it("narrows the stored blob on the way out", async () => {
    repo.findById.mockResolvedValue({
      ...ROW,
      overrides: { locales: { hi: { payNowCTA: "typo" } }, layout: "video_bleed" },
    });

    const out = await makeService().read(ROW.id);

    expect(out.overrides).toEqual({ locales: {} });
    expect(out.createdAt).toBe("2026-08-19T00:00:00.000Z");
  });
});
