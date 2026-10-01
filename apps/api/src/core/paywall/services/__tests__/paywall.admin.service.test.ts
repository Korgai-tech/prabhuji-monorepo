import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import type { AppError } from "@api/shared/errors";
import type { PaywallConfigRepository } from "@api/core/paywall/repositories";
import type {
  PaywallAdminCopyRow,
  PaywallAdminHeroMediaRow,
  RawPaywallConfig,
} from "@api/core/paywall/types";
import { PaywallAdminService } from "../paywall.admin.service.js";

/**
 * Unit coverage for `PaywallAdminService` (TAM-159). The repository is mocked
 * and the MEDIA facade is registered into `GlobalServiceMap` as a fake so
 * `performServiceCall` resolves it.
 *
 * The behaviours worth pinning are the ones that are easy to regress into
 * silent breakage:
 *   - the SERVER-side diff (an echoed unchanged URL must never reach
 *     `validateOwnedUrl`, or the endpoint stops being idempotent);
 *   - a no-op writing nothing at all (`config_version` is an analytics
 *     dimension — a version that moves for nothing shreds its meaning);
 *   - the hero list compared WHOLE and ORDERED (a reorder is a real change;
 *     an identical list is not one, and must not re-validate every URL);
 *   - the single-hero rule, checked against the layout the PATCH RESULTS IN;
 *   - 404 vs 409 disambiguation;
 *   - invalidation firing once, for the PATCHED paywall, and only on a write.
 *
 * `paywallId` is a per-call parameter now, not a constructor constant — the
 * invalidation tests patch a NON-default paywall on purpose, so a service that
 * quietly went back to a fixed id fails here.
 *
 * BENEFITS are absent from this surface on purpose: their icon is a bundled app
 * asset keyed by name, not content, so there is nothing here to upload or diff.
 */

const PAYWALL_ID = "vip-membership-v2";
const TOKEN = "2026-07-28T10:00:00.000Z";

// URLs shaped like ones our presign flow minted (the fake media facade accepts
// anything; ownership is the media module's own tested concern).
const NEW_IMAGE = "https://cdn.example.com/paywall/paywall-hero-media/hero-2.jpg";
const NEW_POSTER = "https://cdn.example.com/paywall/paywall-hero-media/poster-2.jpg";
// What the seed leaves behind: EXTERNAL urls our presign never minted, which
// `validateOwnedUrl` would reject if the diff ever let them through.
const SEEDED_VIDEO = "https://cdn.jsdelivr.net/gh/x/big_buck_bunny.mp4";
const SEEDED_POSTER = "https://picsum.photos/seed/paywall/720/1280";
const SEEDED_IMAGE_A = "https://picsum.photos/seed/a/720/1280";
const SEEDED_IMAGE_B = "https://picsum.photos/seed/b/720/1280";

interface RepoMock {
  findConfig: Mock;
  findAllConfigs: Mock;
  findAdminCopy: Mock;
  findAdminHeroMedia: Mock;
  configExists: Mock;
  updatePaywallWithPrecondition: Mock;
}

/**
 * The stored paywall is a CAROUSEL, because the `en` fixture below is a
 * two-image list and only the carousel may hold one. Tests about the
 * single-hero layouts pass `config({ layout: "card_hero" })` explicitly.
 */
function config(overrides: Partial<RawPaywallConfig> = {}): RawPaywallConfig {
  return {
    id: "cfg-1",
    paywallId: PAYWALL_ID,
    configVersion: 3,
    enabled: true,
    defaultPlanId: "monthly",
    shimmerEnabled: true,
    hasVideoLocaleFallback: true,
    layout: "carousel",
    minAppVersion: "1.1.0",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date(TOKEN),
    ...overrides,
  };
}

function copyRow(overrides: Partial<PaywallAdminCopyRow> = {}): PaywallAdminCopyRow {
  return {
    locale: "hi",
    title: "VIP सदस्यता खोलें",
    cancelAnytimeText: "कभी भी रद्द करें",
    refundPolicyText: "रिफंड नीति",
    payNowCta: "आगे बढ़ें",
    ...overrides,
  };
}

/** `hi` = one seeded VIDEO hero; `en` = a two-image carousel. */
const HERO_ROWS: PaywallAdminHeroMediaRow[] = [
  {
    locale: "en",
    sortOrder: 0,
    mediaType: "image",
    url: SEEDED_IMAGE_A,
    thumbnailUrl: null,
    mediaId: "hero_a",
  },
  {
    locale: "en",
    sortOrder: 1,
    mediaType: "image",
    url: SEEDED_IMAGE_B,
    thumbnailUrl: null,
    mediaId: "hero_b",
  },
  {
    locale: "hi",
    sortOrder: 0,
    mediaType: "video",
    url: SEEDED_VIDEO,
    thumbnailUrl: SEEDED_POSTER,
    mediaId: "vip_intro_v1",
  },
];

/** The hero rows of one locale, in the wire shape the PATCH body carries. */
function storedHero(locale: string): {
  sortOrder: number;
  mediaType: string;
  url: string;
  thumbnailUrl: string | null;
  mediaId: string;
}[] {
  return HERO_ROWS.filter((r) => r.locale === locale).map((r) => ({
    sortOrder: r.sortOrder,
    mediaType: r.mediaType,
    url: r.url,
    thumbnailUrl: r.thumbnailUrl,
    mediaId: r.mediaId,
  }));
}

function makeRepo(
  overrides: {
    config?: RawPaywallConfig;
    copy?: PaywallAdminCopyRow[];
    heroMedia?: PaywallAdminHeroMediaRow[];
  } = {}
): RepoMock {
  return {
    findConfig: vi.fn().mockResolvedValue(overrides.config ?? config()),
    findAllConfigs: vi.fn().mockResolvedValue([]),
    findAdminCopy: vi
      .fn()
      .mockResolvedValue(
        overrides.copy ?? [copyRow({ locale: "en", title: "Unlock VIP" }), copyRow()]
      ),
    findAdminHeroMedia: vi.fn().mockResolvedValue(overrides.heroMedia ?? HERO_ROWS),
    configExists: vi.fn().mockResolvedValue(true),
    updatePaywallWithPrecondition: vi.fn().mockResolvedValue(1),
  };
}

let validateOwnedUrl: Mock;
let invalidate: Mock;

function makeService(repo: RepoMock): PaywallAdminService {
  return new PaywallAdminService(repo as unknown as PaywallConfigRepository, {
    invalidate,
  });
}

/** A patch that changes one shell-copy field — used to prove a write happened. */
const A_REAL_EDIT = { locale: "hi", payNowCta: "अभी खरीदें" };

beforeEach(() => {
  validateOwnedUrl = vi.fn().mockResolvedValue(undefined);
  invalidate = vi.fn();
  registerGlobalService("media", {
    presign: vi.fn(),
    head: vi.fn(),
    validateOwnedUrl,
    validateReusableUrl: vi.fn(),
    // TAM-125: IMediaApi grew presignGet + toKey for the downloads endpoint.
    // Paywall admin doesn't reach these; no-op mocks satisfy the interface.
    presignGet: vi.fn().mockResolvedValue(""),
    toKey: (keyOrUrl: string) => keyOrUrl,
  });
});

afterEach(() => {
  clearGlobalServices();
  vi.restoreAllMocks();
});

describe("listConfigs", () => {
  test("projects every paywall for the picker, timestamps as ISO strings", async () => {
    const repo = makeRepo();
    repo.findAllConfigs.mockResolvedValue([
      {
        paywallId: "vip-membership-v1",
        layout: "card_hero",
        minAppVersion: "0.0.0",
        enabled: true,
        configVersion: 7,
        updatedAt: new Date(TOKEN),
      },
      {
        paywallId: PAYWALL_ID,
        layout: "video_bleed",
        minAppVersion: "1.1.0",
        enabled: false,
        configVersion: 1,
        updatedAt: new Date(TOKEN),
      },
    ]);

    const out = await makeService(repo).listConfigs();

    // `minAppVersion` rides the picker so an editor can see WHICH paywalls are
    // gated above the live build without opening each one.
    expect(out).toEqual([
      {
        paywallId: "vip-membership-v1",
        layout: "card_hero",
        minAppVersion: "0.0.0",
        enabled: true,
        configVersion: 7,
        updatedAt: TOKEN,
      },
      {
        paywallId: PAYWALL_ID,
        layout: "video_bleed",
        minAppVersion: "1.1.0",
        enabled: false,
        configVersion: 1,
        updatedAt: TOKEN,
      },
    ]);
  });
});

describe("getConfig", () => {
  test("projects the config, every locale with a copy row and its hero list", async () => {
    const out = await makeService(makeRepo()).getConfig(PAYWALL_ID);

    expect(out.paywallId).toBe(PAYWALL_ID);
    expect(out.layout).toBe("carousel");
    expect(out.minAppVersion).toBe("1.1.0");
    expect(out.configVersion).toBe(3);
    expect(out.updatedAt).toBe(TOKEN);
    expect(out.translations.map((t) => t.locale)).toEqual(["en", "hi"]);
    expect(out.translations[0]?.title).toBe("Unlock VIP");
    // Hero rows are grouped under their own locale, in stored order.
    expect(out.translations[0]?.heroMedia.map((m) => m.url)).toEqual([
      SEEDED_IMAGE_A,
      SEEDED_IMAGE_B,
    ]);
    expect(out.translations[1]?.heroMedia).toEqual([
      {
        sortOrder: 0,
        mediaType: "video",
        url: SEEDED_VIDEO,
        thumbnailUrl: SEEDED_POSTER,
        mediaId: "vip_intro_v1",
      },
    ]);
  });

  test("a locale with no hero rows gets an empty list, not a missing key", async () => {
    const repo = makeRepo({ heroMedia: [] });

    const out = await makeService(repo).getConfig(PAYWALL_ID);

    expect(out.translations.map((t) => t.heroMedia)).toEqual([[], []]);
  });

  test("reads the CONFIG before its children (a lost update the other way round)", async () => {
    const repo = makeRepo();
    const order: string[] = [];
    repo.findConfig.mockImplementation(() => {
      order.push("config");
      return Promise.resolve(config());
    });
    repo.findAdminCopy.mockImplementation(() => {
      order.push("copy");
      return Promise.resolve([copyRow()]);
    });
    repo.findAdminHeroMedia.mockImplementation(() => {
      order.push("hero");
      return Promise.resolve(HERO_ROWS);
    });

    await makeService(repo).getConfig(PAYWALL_ID);

    expect(order[0]).toBe("config");
    expect(order.slice(1).sort()).toEqual(["copy", "hero"]);
  });

  test("passes the requested paywallId to every read", async () => {
    const repo = makeRepo();

    await makeService(repo).getConfig(PAYWALL_ID);

    expect(repo.findConfig).toHaveBeenCalledWith(PAYWALL_ID);
    expect(repo.findAdminCopy).toHaveBeenCalledWith(PAYWALL_ID);
    expect(repo.findAdminHeroMedia).toHaveBeenCalledWith(PAYWALL_ID);
  });

  test("a missing config row is a 404, not an empty page", async () => {
    const repo = makeRepo();
    repo.findConfig.mockResolvedValue(null);

    await expect(makeService(repo).getConfig(PAYWALL_ID)).rejects.toMatchObject({
      statusCode: 404,
      errorCode: "PAYWALL_CONFIG_MISSING",
    });
  });
});

describe("updateConfig — the server-side diff", () => {
  test("writes only the config flags that actually differ", async () => {
    // Single-row hero everywhere, so moving to a single-hero layout is legal —
    // the layout guard has its own block below.
    const repo = makeRepo({ heroMedia: HERO_ROWS.filter((r) => r.locale === "hi") });

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      layout: "icon_grid",
    });

    expect(repo.updatePaywallWithPrecondition).toHaveBeenCalledWith(
      expect.objectContaining({
        paywallId: PAYWALL_ID,
        expectedUpdatedAt: new Date(TOKEN),
        config: { layout: "icon_grid" },
        copy: [],
        heroMedia: [],
      })
    );
  });

  test("minAppVersion is written when it differs and dropped when echoed", async () => {
    const repo = makeRepo();

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      minAppVersion: "1.3.0",
    });

    expect(repo.updatePaywallWithPrecondition).toHaveBeenCalledWith(
      expect.objectContaining({ config: { minAppVersion: "1.3.0" } })
    );

    const echo = makeRepo();
    await makeService(echo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      minAppVersion: "1.1.0", // what is stored
    });
    expect(echo.updatePaywallWithPrecondition).not.toHaveBeenCalled();
  });

  test("writes only the shell-copy fields that differ", async () => {
    const repo = makeRepo();
    const stored = copyRow();

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      translations: [
        {
          locale: "hi",
          title: stored.title, // echoed
          cancelAnytimeText: stored.cancelAnytimeText, // echoed
          payNowCta: "अभी खरीदें", // changed
        },
      ],
    });

    expect(repo.updatePaywallWithPrecondition).toHaveBeenCalledWith(
      expect.objectContaining({
        copy: [{ locale: "hi", data: { payNowCta: "अभी खरीदें" } }],
      })
    );
  });

  test("a payload echoing the full current state is a clean no-op", async () => {
    const repo = makeRepo();
    const stored = copyRow();

    const out = await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      layout: "carousel",
      minAppVersion: "1.1.0",
      translations: [
        {
          locale: "hi",
          title: stored.title,
          cancelAnytimeText: stored.cancelAnytimeText,
          refundPolicyText: stored.refundPolicyText,
          payNowCta: stored.payNowCta,
          heroMedia: storedHero("hi"),
        },
        { locale: "en", heroMedia: storedHero("en") },
      ],
    });

    expect(repo.updatePaywallWithPrecondition).not.toHaveBeenCalled();
    expect(validateOwnedUrl).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    // Returns current state rather than erroring.
    expect(out.configVersion).toBe(3);
    expect(out.updatedAt).toBe(TOKEN);
  });

  test("an echoed UNCHANGED hero list never reaches validateOwnedUrl", async () => {
    const repo = makeRepo();

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      // The seeded EXTERNAL urls, re-sent verbatim alongside a real edit.
      translations: [{ ...A_REAL_EDIT, heroMedia: storedHero("hi") }],
    });

    expect(validateOwnedUrl).not.toHaveBeenCalled();
    expect(repo.updatePaywallWithPrecondition).toHaveBeenCalledWith(
      expect.objectContaining({
        heroMedia: [],
        copy: [{ locale: "hi", data: { payNowCta: A_REAL_EDIT.payNowCta } }],
      })
    );
  });

  test("a pure reorder IS a change — the list is compared whole and ordered", async () => {
    const repo = makeRepo();
    const [first, second] = storedHero("en");
    const swapped = [
      { ...second, sortOrder: 0 },
      { ...first, sortOrder: 1 },
    ];

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      translations: [{ locale: "en", heroMedia: swapped }],
    });

    expect(repo.updatePaywallWithPrecondition).toHaveBeenCalledWith(
      expect.objectContaining({
        heroMedia: [{ locale: "en", rows: swapped }],
      })
    );
  });

  /**
   * The seeded hero URLs are public CDN links our presign flow never minted, so
   * validating them would 400. Reordering a carousel must not demand that the
   * editor re-upload every frame to move one of them up.
   */
  test("a reorder re-validates NOTHING — every url is already stored", async () => {
    const repo = makeRepo();
    const [first, second] = storedHero("en");

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      translations: [
        {
          locale: "en",
          heroMedia: [
            { ...second, sortOrder: 0 },
            { ...first, sortOrder: 1 },
          ],
        },
      ],
    });

    expect(repo.updatePaywallWithPrecondition).toHaveBeenCalled();
    expect(validateOwnedUrl).not.toHaveBeenCalled();
  });

  test("adding a row to an existing list validates ONLY the new url", async () => {
    const repo = makeRepo();
    const stored = storedHero("en");

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      translations: [
        {
          locale: "en",
          heroMedia: [
            ...stored,
            {
              sortOrder: stored.length,
              mediaType: "image",
              url: NEW_IMAGE,
              thumbnailUrl: null,
              mediaId: "hero-new",
            },
          ],
        },
      ],
    });

    expect(validateOwnedUrl).toHaveBeenCalledTimes(1);
    expect(validateOwnedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ url: NEW_IMAGE })
    );
  });

  test("an empty heroMedia array clears that locale's hero", async () => {
    const repo = makeRepo();

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      translations: [{ locale: "hi", heroMedia: [] }],
    });

    expect(repo.updatePaywallWithPrecondition).toHaveBeenCalledWith(
      expect.objectContaining({ heroMedia: [{ locale: "hi", rows: [] }] })
    );
    // Nothing to validate — clearing is not an upload.
    expect(validateOwnedUrl).not.toHaveBeenCalled();
  });

  test("an already-empty hero list stays a no-op when cleared again", async () => {
    const repo = makeRepo({ heroMedia: [] });

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      translations: [{ locale: "hi", heroMedia: [] }],
    });

    expect(repo.updatePaywallWithPrecondition).not.toHaveBeenCalled();
  });

  test("an omitted heroMedia leaves the locale's hero untouched", async () => {
    const repo = makeRepo();

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      translations: [A_REAL_EDIT],
    });

    expect(repo.updatePaywallWithPrecondition).toHaveBeenCalledWith(
      expect.objectContaining({ heroMedia: [] })
    );
  });

  test("validates every changed url BEFORE writing, with the right media triple", async () => {
    const repo = makeRepo();
    const calls: string[] = [];
    repo.updatePaywallWithPrecondition.mockImplementation(() => {
      calls.push("write");
      return Promise.resolve(1);
    });
    validateOwnedUrl.mockImplementation(() => {
      calls.push("validate");
      return Promise.resolve(undefined);
    });

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      translations: [
        {
          locale: "hi",
          heroMedia: [
            {
              sortOrder: 0,
              mediaType: "image",
              url: NEW_IMAGE,
              thumbnailUrl: NEW_POSTER,
              mediaId: "hero_v2",
            },
          ],
        },
      ],
    });

    expect(calls).toEqual(["validate", "validate", "write"]);
    expect(validateOwnedUrl).toHaveBeenCalledWith({
      url: NEW_IMAGE,
      module: "paywall",
      entity: "paywallHeroMedia",
      field: "url",
    });
    expect(validateOwnedUrl).toHaveBeenCalledWith({
      url: NEW_POSTER,
      module: "paywall",
      entity: "paywallHeroMedia",
      field: "thumbnailUrl",
    });
  });
});

/**
 * Three of the four screens render exactly ONE hero and silently ignore the
 * rest; only the carousel pages through a list. Storing five images for
 * `card_hero` is work the editor will never see rendered and cannot explain, so
 * the write is rejected — and rejected against the layout the PATCH RESULTS IN,
 * not the one being replaced.
 */
describe("updateConfig — one hero unless the layout is a carousel", () => {
  /** A hero list of `n` distinct, already-stored-or-new image rows. */
  function images(n: number): {
    sortOrder: number;
    mediaType: string;
    url: string;
    thumbnailUrl: null;
    mediaId: string;
  }[] {
    return Array.from({ length: n }, (_, i) => ({
      sortOrder: i,
      mediaType: "image",
      url: `${NEW_IMAGE}?frame=${i}`,
      thumbnailUrl: null,
      mediaId: `hero_${i}`,
    }));
  }

  test("a two-row hero on a stored single-hero layout is a 400 that writes nothing", async () => {
    const repo = makeRepo({ config: config({ layout: "card_hero" }) });

    await expect(
      makeService(repo).updateConfig({
        paywallId: PAYWALL_ID,
        expectedUpdatedAt: TOKEN,
        translations: [{ locale: "hi", heroMedia: images(2) }],
      })
    ).rejects.toMatchObject({ statusCode: 400, errorCode: "VALIDATION_ERROR" });

    expect(repo.updatePaywallWithPrecondition).not.toHaveBeenCalled();
    // Rejected before any S3 round-trip — the layout is knowable without one.
    expect(validateOwnedUrl).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  test.each([["card_hero"], ["video_bleed"], ["icon_grid"]])(
    "switching TO %s with a multi-image list in the same PATCH is rejected",
    async (layout) => {
      const repo = makeRepo();

      await expect(
        makeService(repo).updateConfig({
          paywallId: PAYWALL_ID,
          expectedUpdatedAt: TOKEN,
          layout,
          translations: [{ locale: "hi", heroMedia: images(3) }],
        })
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(repo.updatePaywallWithPrecondition).not.toHaveBeenCalled();
    }
  );

  test("one hero row is fine for a single-hero layout", async () => {
    const repo = makeRepo({ config: config({ layout: "card_hero" }) });

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      translations: [{ locale: "hi", heroMedia: images(1) }],
    });

    expect(repo.updatePaywallWithPrecondition).toHaveBeenCalled();
  });

  test("clearing the hero is fine for a single-hero layout — zero is not more than one", async () => {
    const repo = makeRepo({ config: config({ layout: "card_hero" }) });

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      translations: [{ locale: "hi", heroMedia: [] }],
    });

    expect(repo.updatePaywallWithPrecondition).toHaveBeenCalled();
  });

  test("a carousel takes a list", async () => {
    const repo = makeRepo(); // stored layout is already `carousel`

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      translations: [{ locale: "hi", heroMedia: images(3) }],
    });

    expect(repo.updatePaywallWithPrecondition).toHaveBeenCalledWith(
      expect.objectContaining({ heroMedia: [{ locale: "hi", rows: images(3) }] })
    );
  });

  /**
   * The reason the check runs against the RESULTING layout. Trimming the list is
   * the editor's fix for the switch; demanding two saves to do it would mean the
   * paywall spends one save in a state its own rule forbids.
   */
  test("carousel → card_hero WITH the list trimmed in the same save is accepted", async () => {
    const repo = makeRepo(); // stored: carousel, `en` holds two images

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      layout: "card_hero",
      translations: [{ locale: "en", heroMedia: images(1) }],
    });

    expect(repo.updatePaywallWithPrecondition).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { layout: "card_hero" },
        heroMedia: [{ locale: "en", rows: images(1) }],
      })
    );
  });

  /** And the reverse: the list only becomes legal because the layout moved too. */
  test("card_hero → carousel WITH a three-image list in the same save is accepted", async () => {
    const repo = makeRepo({ config: config({ layout: "card_hero" }) });

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      layout: "carousel",
      translations: [{ locale: "hi", heroMedia: images(3) }],
    });

    expect(repo.updatePaywallWithPrecondition).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { layout: "carousel" },
        heroMedia: [{ locale: "hi", rows: images(3) }],
      })
    );
  });

  /**
   * The rule is about the RESULTING state, not about the diff. A layout switch
   * that touches no hero list at all used to sail through and leave a
   * `card_hero` paywall holding a three-image carousel — the app draws the first
   * row and silently drops the rest, which is exactly the unexplainable state
   * this guard exists to prevent. The admin SPA blocks it client-side, but the
   * client is fast feedback, never the enforcement point.
   */
  test("switching to a single-hero layout is rejected when a STORED locale is over quota", async () => {
    const repo = makeRepo(); // stored: carousel, `en` holds two images

    await expect(
      makeService(repo).updateConfig({
        paywallId: PAYWALL_ID,
        expectedUpdatedAt: TOKEN,
        layout: "card_hero", // no heroMedia in the patch at all
      })
    ).rejects.toMatchObject({ statusCode: 400, errorCode: "VALIDATION_ERROR" });

    expect(repo.updatePaywallWithPrecondition).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  test("the same switch is accepted when every stored list is single-row", async () => {
    const repo = makeRepo({ heroMedia: HERO_ROWS.filter((r) => r.locale === "hi") });

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      layout: "card_hero",
    });

    expect(repo.updatePaywallWithPrecondition).toHaveBeenCalledWith(
      expect.objectContaining({ config: { layout: "card_hero" }, heroMedia: [] })
    );
  });

  /**
   * The flip side of scoping by what MOVED: an editor who only fixes a typo did
   * not cause the over-quota list, and blocking their save would strand them on
   * a paywall they cannot edit at all.
   */
  test("an unrelated copy edit is NOT blocked by an already over-quota stored list", async () => {
    const repo = makeRepo({ config: config({ layout: "card_hero" }) });

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      translations: [A_REAL_EDIT],
    });

    expect(repo.updatePaywallWithPrecondition).toHaveBeenCalled();
  });

  test("the message names the offending locale and the layout", async () => {
    const repo = makeRepo({ config: config({ layout: "video_bleed" }) });

    const err = await makeService(repo)
      .updateConfig({
        paywallId: PAYWALL_ID,
        expectedUpdatedAt: TOKEN,
        translations: [{ locale: "hi", heroMedia: images(2) }],
      })
      .catch((e: Error) => e);

    expect((err as Error).message).toContain('"hi"');
    expect((err as Error).message).toContain('"video_bleed"');
  });
});

describe("updateConfig — failure modes", () => {
  test("a locale with no copy row is a 400, and nothing is written", async () => {
    const repo = makeRepo({ copy: [copyRow({ locale: "hi" })] });

    await expect(
      makeService(repo).updateConfig({
        paywallId: PAYWALL_ID,
        expectedUpdatedAt: TOKEN,
        translations: [{ locale: "ta", payNowCta: "வாங்கு" }],
      })
    ).rejects.toMatchObject({ statusCode: 400, errorCode: "VALIDATION_ERROR" });

    expect(repo.updatePaywallWithPrecondition).not.toHaveBeenCalled();
    expect(validateOwnedUrl).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  test("an unseeded locale is a 400 even when the rest of the payload is a no-op", async () => {
    const repo = makeRepo({ copy: [copyRow({ locale: "hi" })] });

    await expect(
      makeService(repo).updateConfig({
        paywallId: PAYWALL_ID,
        expectedUpdatedAt: TOKEN,
        layout: "carousel", // unchanged
        translations: [{ locale: "ta", heroMedia: [] }],
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("an unparseable expectedUpdatedAt is a 400, not a silent NaN comparison", async () => {
    const repo = makeRepo();

    await expect(
      makeService(repo).updateConfig({
        paywallId: PAYWALL_ID,
        expectedUpdatedAt: "not-a-timestamp",
        translations: [A_REAL_EDIT],
      })
    ).rejects.toMatchObject({ statusCode: 400, errorCode: "VALIDATION_ERROR" });

    expect(repo.updatePaywallWithPrecondition).not.toHaveBeenCalled();
  });

  test("a stale token is rejected BEFORE any media round-trip", async () => {
    const repo = makeRepo();

    await expect(
      makeService(repo).updateConfig({
        paywallId: PAYWALL_ID,
        expectedUpdatedAt: "2026-07-28T09:00:00.000Z",
        translations: [
          {
            locale: "hi",
            heroMedia: [
              {
                sortOrder: 0,
                mediaType: "image",
                url: NEW_IMAGE,
                thumbnailUrl: null,
                mediaId: "hero_v2",
              },
            ],
          },
        ],
      })
    ).rejects.toMatchObject({ statusCode: 409, errorCode: "STALE_WRITE" });

    expect(validateOwnedUrl).not.toHaveBeenCalled();
    expect(repo.updatePaywallWithPrecondition).not.toHaveBeenCalled();
  });

  test("a 0-count write with a surviving row is 409, not 404", async () => {
    const repo = makeRepo();
    repo.updatePaywallWithPrecondition.mockResolvedValue(0);
    repo.configExists.mockResolvedValue(true);

    await expect(
      makeService(repo).updateConfig({
        paywallId: PAYWALL_ID,
        expectedUpdatedAt: TOKEN,
        translations: [A_REAL_EDIT],
      })
    ).rejects.toMatchObject({ statusCode: 409, errorCode: "STALE_WRITE" });

    expect(repo.configExists).toHaveBeenCalledWith(PAYWALL_ID);
    expect(invalidate).not.toHaveBeenCalled();
  });

  test("a 0-count write with a vanished row is 404", async () => {
    const repo = makeRepo();
    repo.updatePaywallWithPrecondition.mockResolvedValue(0);
    repo.configExists.mockResolvedValue(false);

    const err = await makeService(repo)
      .updateConfig({
        paywallId: PAYWALL_ID,
        expectedUpdatedAt: TOKEN,
        translations: [A_REAL_EDIT],
      })
      .catch((e: AppError) => e);

    expect(err).toMatchObject({ statusCode: 404, errorCode: "NOT_FOUND" });
    expect(invalidate).not.toHaveBeenCalled();
  });

  test("patching a paywall that does not exist is a 404 before anything else", async () => {
    const repo = makeRepo();
    repo.findConfig.mockResolvedValue(null);

    await expect(
      makeService(repo).updateConfig({
        paywallId: "no-such-paywall",
        expectedUpdatedAt: TOKEN,
        translations: [A_REAL_EDIT],
      })
    ).rejects.toMatchObject({ statusCode: 404, errorCode: "PAYWALL_CONFIG_MISSING" });

    expect(repo.updatePaywallWithPrecondition).not.toHaveBeenCalled();
  });

  test("media rejection stops the write", async () => {
    const repo = makeRepo();
    validateOwnedUrl.mockRejectedValue(new Error("not one we minted"));

    await expect(
      makeService(repo).updateConfig({
        paywallId: PAYWALL_ID,
        expectedUpdatedAt: TOKEN,
        translations: [
          {
            locale: "hi",
            heroMedia: [
              {
                sortOrder: 0,
                mediaType: "image",
                url: NEW_IMAGE,
                thumbnailUrl: null,
                mediaId: "hero_v2",
              },
            ],
          },
        ],
      })
    ).rejects.toThrow();

    expect(repo.updatePaywallWithPrecondition).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("updateConfig — cache invalidation", () => {
  test("invalidates the PATCHED paywall exactly once after a real write", async () => {
    const repo = makeRepo();

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      translations: [A_REAL_EDIT],
    });

    expect(invalidate).toHaveBeenCalledExactlyOnceWith(PAYWALL_ID);
  });

  test("a flags-only write still invalidates", async () => {
    const repo = makeRepo();

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      minAppVersion: "2.0.0",
    });

    expect(invalidate).toHaveBeenCalledExactlyOnceWith(PAYWALL_ID);
  });

  /**
   * `enabled` is a column the resolver still honours, but the CMS does not write
   * it — parking a variant is done by raising `minAppVersion`. A body carrying it
   * must be REJECTED by the route's `.strict()` schema rather than silently
   * ignored here; this pins that the service never grew a second way in.
   */
  test("the service exposes no way to write `enabled`", async () => {
    const repo = makeRepo();

    await makeService(repo).updateConfig({
      paywallId: PAYWALL_ID,
      expectedUpdatedAt: TOKEN,
      minAppVersion: "2.0.0",
    });

    const call = repo.updatePaywallWithPrecondition.mock.calls[0]?.[0] as {
      config: Record<string, unknown>;
    };
    expect(Object.keys(call.config)).toEqual(["minAppVersion"]);
  });
});
