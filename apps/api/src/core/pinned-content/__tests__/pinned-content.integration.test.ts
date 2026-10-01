import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import {
  PinnedContentAuditRepository,
  PinnedContentRepository,
} from "@api/core/pinned-content/repositories";
import {
  PinnedContentLookupService,
  PinnedContentService,
} from "@api/core/pinned-content/services";
import type { PinnedContentView } from "@api/core/pinned-content/types";

/**
 * TAM-173 integration coverage against a real Postgres brought up via
 * `startTestDb` (testcontainers). Exercises the invariants the unit suite
 * can't see because they live at the DB layer: the partial-unique 409
 * mapping, the CHECK constraint on `surface = 'status_deity' ⇔ deity_slug IS
 * NOT NULL`, transactional audit round-trips, and the read-side window
 * filtering with a test-injectable clock.
 */

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const HOME_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const STATUS_ITEM_ID = "33333333-3333-4333-8333-333333333333";
const STATUS_ITEM_ID_2 = "33333333-3333-4333-8333-333333333334";

const NOW = new Date("2026-06-05T12:00:00.000Z");
const clock = (): Date => NOW;

let repo: PinnedContentRepository;
let auditRepo: PinnedContentAuditRepository;
let service: PinnedContentService;
let lookupService: PinnedContentLookupService;

/**
 * A deity/home/status facade triple that unconditionally accepts anything —
 * so the write-path validations that live in this SUITE test the DB-shape
 * guards, not the facade calls (unit tests already cover the facade branches).
 */
function registerAllowlistFacades(overrides?: {
  homeItemExists?: boolean;
  statusItemDeity?: (id: string) => string | null;
  deityActive?: boolean;
}): void {
  registerGlobalService("deity", {
    getBySlug: (slug: string) =>
      Promise.resolve({
        id: "deity-1",
        slug,
        iconUrl: "https://x/s.png",
        sortOrder: 0,
        active: overrides?.deityActive ?? true,
      }),
    getActiveDeities: () => Promise.resolve([]),
  });
  registerGlobalService("home", {
    hasFeedItem: () => Promise.resolve(overrides?.homeItemExists ?? true),
    getActiveBannerCount: () => Promise.resolve(0),
    upsertContentFeedCard: () => Promise.resolve(),
  });
  registerGlobalService("status", {
    getPreview: () => Promise.resolve(null),
    getPinValidation: (id: string) =>
      Promise.resolve({ deitySlug: overrides?.statusItemDeity?.(id) ?? null }),
    // Unused here — pinned-content never files reports. Present only to satisfy
    // the `IStatusApi` shape.
    getReportTarget: () => Promise.resolve(null),
  });
}

beforeAll(async () => {
  await startTestDb();
}, 180_000);

afterAll(async () => {
  await disconnectPrisma();
  await stopTestDb();
});

beforeEach(async () => {
  repo = new PinnedContentRepository();
  auditRepo = new PinnedContentAuditRepository();
  service = new PinnedContentService(repo, auditRepo, clock);
  lookupService = new PinnedContentLookupService(repo);
  registerAllowlistFacades();
  // Nuke prior state — order matters (audit references pin id via
  // `pinnedContentId`, but no FK so either order is safe; keep it obvious).
  await getPrisma().pinnedContentAudit.deleteMany({});
  await getPrisma().pinnedContent.deleteMany({});
});

afterEach(() => {
  clearGlobalServices();
});

const homePinBody = (
  overrides: Partial<{
    contentId: string;
    pinPosition: number;
    startAt: string;
    endAt: string;
  }> = {}
): {
  surface: "home";
  contentId: string;
  pinPosition: number;
  startAt: string;
  endAt: string;
} => ({
  surface: "home",
  contentId: overrides.contentId ?? HOME_ITEM_ID,
  pinPosition: overrides.pinPosition ?? 1,
  startAt: overrides.startAt ?? "2026-06-01T00:00:00.000Z",
  endAt: overrides.endAt ?? "2026-06-10T00:00:00.000Z",
});

describe("PinnedContent write path against real Postgres", () => {
  it("creates a pin and inserts one audit row in the SAME transaction", async () => {
    const pin = await service.create(homePinBody(), ADMIN_ID);
    expect(pin.surface).toBe("home");
    expect(pin.deletedAt).toBeNull();

    const audit = await getPrisma().pinnedContentAudit.findMany({
      where: { pinnedContentId: pin.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe("create");
    expect(audit[0]?.diff).toBeNull();
  });

  it("409 pin_position_taken on partial-unique collision at the SAME (surface, deity_slug, position)", async () => {
    const first = await service.create(homePinBody(), ADMIN_ID);
    expect(first.pinPosition).toBe(1);
    await expect(
      service.create(homePinBody({ pinPosition: 1 }), ADMIN_ID)
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "pin_position_taken",
    });
  });

  it("allows reusing a position on a DIFFERENT surface", async () => {
    await service.create(homePinBody({ pinPosition: 1 }), ADMIN_ID);
    // Another surface — no collision.
    const status = await service.create(
      {
        surface: "status_all_gods",
        contentId: STATUS_ITEM_ID,
        pinPosition: 1,
        startAt: "2026-06-01T00:00:00.000Z",
        endAt: "2026-06-10T00:00:00.000Z",
      },
      ADMIN_ID
    );
    expect(status.pinPosition).toBe(1);
    expect(status.surface).toBe("status_all_gods");
  });

  it("soft-deleting frees the position for re-use", async () => {
    const first = await service.create(homePinBody(), ADMIN_ID);
    await service.softDelete(
      first.id,
      { expectedUpdatedAt: first.updatedAt },
      ADMIN_ID
    );
    // Now a fresh pin at the same position should succeed.
    const replacement = await service.create(
      homePinBody({ pinPosition: 1 }),
      ADMIN_ID
    );
    expect(replacement.pinPosition).toBe(1);
    expect(replacement.id).not.toBe(first.id);
  });

  it("CHECK constraint rejects a raw insert violating surface⇔deity_slug shape", async () => {
    // The service NEVER emits a shape-violating INSERT — so we bypass the
    // service and go straight at the row. If db push (used by the integration
    // helper) failed to replay the CHECK, this test would silently pass.
    await expect(
      getPrisma().pinnedContent.create({
        data: {
          surface: "home",
          deitySlug: "ganesha", // forbidden: home + slug
          contentId: HOME_ITEM_ID,
          pinPosition: 42,
          startAt: new Date("2026-06-01T00:00:00Z"),
          endAt: new Date("2026-06-10T00:00:00Z"),
          createdBy: ADMIN_ID,
          updatedBy: ADMIN_ID,
        },
      })
    ).rejects.toThrow();
  });

  it("audit records a field-level diff on update", async () => {
    const created = await service.create(homePinBody(), ADMIN_ID);
    const updated = await service.update(
      created.id,
      { expectedUpdatedAt: created.updatedAt, pinPosition: 5 },
      ADMIN_ID
    );
    expect(updated.pinPosition).toBe(5);
    const audit = await getPrisma().pinnedContentAudit.findMany({
      where: { pinnedContentId: created.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit).toHaveLength(2);
    expect(audit[1]?.action).toBe("update");
    const diff = audit[1]?.diff as Record<string, { before: unknown; after: unknown }>;
    expect(diff.pinPosition).toEqual({ before: 1, after: 5 });
  });

  it("stale updatedAt precondition → 409 STALE_WRITE, and no audit row is written", async () => {
    const created = await service.create(homePinBody(), ADMIN_ID);
    // First update lands.
    await service.update(
      created.id,
      { expectedUpdatedAt: created.updatedAt, pinPosition: 2 },
      ADMIN_ID
    );
    // Second one uses the STALE updatedAt.
    await expect(
      service.update(
        created.id,
        { expectedUpdatedAt: created.updatedAt, pinPosition: 3 },
        ADMIN_ID
      )
    ).rejects.toMatchObject({ statusCode: 409, errorCode: "STALE_WRITE" });

    // Only ONE audit row for the successful update should exist beyond create.
    const audit = await getPrisma().pinnedContentAudit.findMany({
      where: { pinnedContentId: created.id },
    });
    expect(audit.length).toBe(2);
  });

  it("status_deity content_deity_mismatch is caught at the service, not the DB", async () => {
    clearGlobalServices();
    registerAllowlistFacades({
      statusItemDeity: () => "vishnu",
    });
    await expect(
      service.create(
        {
          surface: "status_deity",
          deitySlug: "shiva",
          contentId: STATUS_ITEM_ID,
          pinPosition: 1,
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: "2026-06-10T00:00:00.000Z",
        },
        ADMIN_ID
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "content_deity_mismatch",
    });
  });
});

describe("PinnedContentLookupService against real Postgres", () => {
  /** Seed a pin bypassing the service — window filtering under test. */
  async function seed(overrides: {
    surface: "home" | "status_all_gods" | "status_deity";
    deitySlug?: string | null;
    contentId?: string;
    pinPosition?: number;
    startAt: Date;
    endAt: Date;
  }): Promise<PinnedContentView> {
    const created = await getPrisma().pinnedContent.create({
      data: {
        surface: overrides.surface,
        deitySlug: overrides.deitySlug ?? null,
        contentId: overrides.contentId ?? HOME_ITEM_ID,
        pinPosition: overrides.pinPosition ?? 1,
        startAt: overrides.startAt,
        endAt: overrides.endAt,
        createdBy: ADMIN_ID,
        updatedBy: ADMIN_ID,
      },
    });
    return {
      id: created.id,
      surface: created.surface,
      deitySlug: created.deitySlug,
      contentId: created.contentId,
      pinPosition: created.pinPosition,
      startAt: created.startAt.toISOString(),
      endAt: created.endAt.toISOString(),
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      createdBy: created.createdBy,
      updatedBy: created.updatedBy,
      deletedAt: created.deletedAt?.toISOString() ?? null,
    };
  }

  it("start_at is INCLUSIVE (active AT the boundary)", async () => {
    await seed({
      surface: "home",
      pinPosition: 1,
      startAt: NOW,
      endAt: new Date(NOW.getTime() + 3_600_000),
    });
    const rows = await lookupService.getActivePinnedIds({
      surface: "home",
      atMs: NOW.getTime(),
    });
    expect(rows).toHaveLength(1);
  });

  it("end_at is EXCLUSIVE (inactive AT the boundary)", async () => {
    await seed({
      surface: "home",
      pinPosition: 1,
      startAt: new Date(NOW.getTime() - 3_600_000),
      endAt: NOW,
    });
    const rows = await lookupService.getActivePinnedIds({
      surface: "home",
      atMs: NOW.getTime(),
    });
    expect(rows).toHaveLength(0);
  });

  it("sort order is pin_position ASC, id ASC", async () => {
    const first = await seed({
      surface: "home",
      pinPosition: 2,
      startAt: new Date(NOW.getTime() - 3_600_000),
      endAt: new Date(NOW.getTime() + 3_600_000),
      contentId: HOME_ITEM_ID,
    });
    const second = await seed({
      surface: "home",
      pinPosition: 1,
      startAt: new Date(NOW.getTime() - 3_600_000),
      endAt: new Date(NOW.getTime() + 3_600_000),
      contentId: STATUS_ITEM_ID,
    });
    const rows = await lookupService.getActivePinnedIds({
      surface: "home",
      atMs: NOW.getTime(),
    });
    expect(rows.map((r) => r.id)).toEqual([second.id, first.id]);
  });

  it("scopes to surface — a status_all_gods pin does not appear on home", async () => {
    await seed({
      surface: "status_all_gods",
      pinPosition: 1,
      startAt: new Date(NOW.getTime() - 3_600_000),
      endAt: new Date(NOW.getTime() + 3_600_000),
      contentId: STATUS_ITEM_ID,
    });
    const home = await lookupService.getActivePinnedIds({
      surface: "home",
      atMs: NOW.getTime(),
    });
    expect(home).toHaveLength(0);
    const status = await lookupService.getActivePinnedIds({
      surface: "status_all_gods",
      atMs: NOW.getTime(),
    });
    expect(status).toHaveLength(1);
  });

  it("scopes to deity — a status_deity pin for shiva does not appear on ganesha", async () => {
    await seed({
      surface: "status_deity",
      deitySlug: "shiva",
      pinPosition: 1,
      startAt: new Date(NOW.getTime() - 3_600_000),
      endAt: new Date(NOW.getTime() + 3_600_000),
      contentId: STATUS_ITEM_ID,
    });
    const shivaRows = await lookupService.getActivePinnedIds({
      surface: "status_deity",
      deitySlug: "shiva",
      atMs: NOW.getTime(),
    });
    expect(shivaRows).toHaveLength(1);
    const ganeshaRows = await lookupService.getActivePinnedIds({
      surface: "status_deity",
      deitySlug: "ganesha",
      atMs: NOW.getTime(),
    });
    expect(ganeshaRows).toHaveLength(0);
  });

  it("skips soft-deleted rows", async () => {
    const pin = await seed({
      surface: "home",
      pinPosition: 1,
      startAt: new Date(NOW.getTime() - 3_600_000),
      endAt: new Date(NOW.getTime() + 3_600_000),
    });
    await service.softDelete(
      pin.id,
      { expectedUpdatedAt: pin.updatedAt },
      ADMIN_ID
    );
    const rows = await lookupService.getActivePinnedIds({
      surface: "home",
      atMs: NOW.getTime(),
    });
    expect(rows).toHaveLength(0);
  });

  it("multiple pins on multiple surfaces (all active) — sort + scope both hold", async () => {
    await seed({
      surface: "home",
      pinPosition: 1,
      startAt: new Date(NOW.getTime() - 3_600_000),
      endAt: new Date(NOW.getTime() + 3_600_000),
      contentId: HOME_ITEM_ID,
    });
    await seed({
      surface: "home",
      pinPosition: 2,
      startAt: new Date(NOW.getTime() - 3_600_000),
      endAt: new Date(NOW.getTime() + 3_600_000),
      contentId: STATUS_ITEM_ID,
    });
    await seed({
      surface: "status_all_gods",
      pinPosition: 1,
      startAt: new Date(NOW.getTime() - 3_600_000),
      endAt: new Date(NOW.getTime() + 3_600_000),
      contentId: STATUS_ITEM_ID_2,
    });
    const homeRows = await lookupService.getActivePinnedIds({
      surface: "home",
      atMs: NOW.getTime(),
    });
    expect(homeRows.map((r) => r.contentId)).toEqual([HOME_ITEM_ID, STATUS_ITEM_ID]);
  });
});

describe("Admin list filters", () => {
  it("`active` narrows to the currently-active bucket", async () => {
    await service.create(homePinBody({ pinPosition: 1 }), ADMIN_ID);
    // scheduled: starts tomorrow
    const scheduledStart = new Date(NOW.getTime() + 86_400_000).toISOString();
    const scheduledEnd = new Date(NOW.getTime() + 172_800_000).toISOString();
    await service.create(
      homePinBody({
        pinPosition: 2,
        startAt: scheduledStart,
        endAt: scheduledEnd,
      }),
      ADMIN_ID
    );
    // expired: ended yesterday
    const expiredStart = new Date(NOW.getTime() - 172_800_000).toISOString();
    const expiredEnd = new Date(NOW.getTime() - 86_400_000).toISOString();
    await service.create(
      homePinBody({
        pinPosition: 3,
        startAt: expiredStart,
        endAt: expiredEnd,
      }),
      ADMIN_ID
    );

    const activePage = await service.list({
      page: 1,
      pageSize: 25,
      active: "active",
    });
    expect(activePage.items.map((r) => r.pinPosition)).toEqual([1]);

    const scheduledPage = await service.list({
      page: 1,
      pageSize: 25,
      active: "scheduled",
    });
    expect(scheduledPage.items.map((r) => r.pinPosition)).toEqual([2]);

    const expiredPage = await service.list({
      page: 1,
      pageSize: 25,
      active: "expired",
    });
    expect(expiredPage.items.map((r) => r.pinPosition)).toEqual([3]);

    // `any` → all three, deleted excluded.
    const anyPage = await service.list({
      page: 1,
      pageSize: 25,
      active: "any",
    });
    expect(anyPage.total).toBe(3);
  });
});
