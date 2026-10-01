import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  PinnedContentAuditRepository,
  PinnedContentRepository,
} from "@api/core/pinned-content/repositories";
import { AppError, ValidationError } from "@api/shared/errors";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import type { PinnedContentView } from "@api/core/pinned-content/types";
import { PinnedContentService } from "../pinned-content.service.js";

/**
 * Write-path unit coverage. The repo pair is mocked and the deity / home /
 * status facades are registered as fakes so `performServiceCall` resolves.
 *
 * Postgres-shape rules — the partial-unique 409 mapping, the CHECK on
 * surface⇔deity_slug, the transactional audit round-trip on a real database —
 * live in the integration suite.
 */

const ACTOR = "11111111-1111-4111-8111-111111111111";
const CONTENT_ID = "22222222-2222-4222-8222-222222222222";

interface RepoMock {
  findById: ReturnType<typeof vi.fn>;
  listPage: ReturnType<typeof vi.fn>;
  findActive: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  updateWithPrecondition: ReturnType<typeof vi.fn>;
  softDeleteWithPrecondition: ReturnType<typeof vi.fn>;
  restoreWithPrecondition: ReturnType<typeof vi.fn>;
}

interface AuditInsertArgs {
  pinnedContentId: string;
  action: string;
  actorUserId: string;
  snapshot: unknown;
  diff: unknown;
}

interface AuditRepoMock {
  insert: ReturnType<typeof vi.fn>;
  listForPin: ReturnType<typeof vi.fn>;
}

/** Read the last-recorded insert args as the strong shape. */
function lastInsertArgs(mock: AuditRepoMock): AuditInsertArgs {
  const call = mock.insert.mock.calls[0];
  if (!call) throw new Error("audit.insert was not called");
  return call[0] as AuditInsertArgs;
}

function makeRepo(): { mock: RepoMock; repo: PinnedContentRepository } {
  const mock: RepoMock = {
    findById: vi.fn(),
    listPage: vi.fn(),
    findActive: vi.fn(),
    create: vi.fn(),
    updateWithPrecondition: vi.fn(),
    softDeleteWithPrecondition: vi.fn(),
    restoreWithPrecondition: vi.fn(),
  };
  return { mock, repo: mock as unknown as PinnedContentRepository };
}

function makeAuditRepo(): {
  mock: AuditRepoMock;
  repo: PinnedContentAuditRepository;
} {
  const mock: AuditRepoMock = {
    insert: vi.fn().mockResolvedValue(undefined),
    listForPin: vi.fn(),
  };
  return { mock, repo: mock };
}

function pin(overrides: Partial<PinnedContentView> = {}): PinnedContentView {
  return {
    id: overrides.id ?? "33333333-3333-4333-8333-333333333333",
    surface: overrides.surface ?? "home",
    deitySlug: overrides.deitySlug ?? null,
    contentId: overrides.contentId ?? CONTENT_ID,
    pinPosition: overrides.pinPosition ?? 1,
    startAt: overrides.startAt ?? "2026-06-01T00:00:00.000Z",
    endAt: overrides.endAt ?? "2026-06-08T00:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-06-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-01T00:00:00.000Z",
    createdBy: overrides.createdBy ?? ACTOR,
    updatedBy: overrides.updatedBy ?? ACTOR,
    deletedAt: overrides.deletedAt ?? null,
  };
}

const nowMs = Date.parse("2026-06-05T00:00:00Z");
const fixedClock = (): Date => new Date(nowMs);

let repoMock: RepoMock;
let auditMock: AuditRepoMock;
let service: PinnedContentService;

// Facade fakes — the write service resolves deity / home / status via
// performServiceCall on every write. Overridden per test as needed.
interface DeitySummary {
  id: string;
  slug: string;
  iconUrl: string;
  sortOrder: number;
  active: boolean;
}
const DEITY_OK: DeitySummary = {
  id: "deity-1",
  slug: "shiva",
  iconUrl: "https://x/s.png",
  sortOrder: 0,
  active: true,
};
const deityBySlug = vi.fn<(slug: string) => Promise<DeitySummary | null>>(() =>
  Promise.resolve(DEITY_OK)
);
const homeHasFeedItem = vi.fn<(id: string) => Promise<boolean>>(() =>
  Promise.resolve(true)
);
const statusPinValidation = vi.fn<
  (id: string) => Promise<{ deitySlug: string | null } | null>
>(() => Promise.resolve({ deitySlug: null }));

beforeEach(() => {
  const { mock: rm, repo: r } = makeRepo();
  const { mock: am, repo: a } = makeAuditRepo();
  repoMock = rm;
  auditMock = am;
  service = new PinnedContentService(r, a, fixedClock);
  registerGlobalService("deity", {
    getBySlug: deityBySlug,
    getActiveDeities: () => Promise.resolve([]),
  });
  registerGlobalService("home", {
    hasFeedItem: homeHasFeedItem,
    getActiveBannerCount: () => Promise.resolve(0),
    upsertContentFeedCard: () => Promise.resolve(),
  });
  registerGlobalService("status", {
    getPinValidation: statusPinValidation,
    getPreview: () => Promise.resolve(null),
    // Unused here — pinned-content never files reports. Present only to satisfy
    // the `IStatusApi` shape.
    getReportTarget: () => Promise.resolve(null),
  });
  // Prisma.$transaction — the service calls `getPrisma().$transaction`, which
  // in a unit test with no live DB means we intercept and run the callback
  // directly against the repo mocks (they take an optional `tx`).
  vi.mock("@api/shared/database", () => ({
    getPrisma: () => ({
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    }),
  }));
});

afterEach(() => {
  clearGlobalServices();
  vi.clearAllMocks();
  deityBySlug.mockImplementation(() => Promise.resolve(DEITY_OK));
  homeHasFeedItem.mockImplementation(() => Promise.resolve(true));
  statusPinValidation.mockImplementation(() =>
    Promise.resolve({ deitySlug: null })
  );
});

describe("PinnedContentService.create — validation", () => {
  test("surface = home + deity_slug present → 400 deity_slug_not_allowed", async () => {
    await expect(
      service.create(
        {
          surface: "home",
          deitySlug: "ganesha",
          contentId: CONTENT_ID,
          pinPosition: 1,
          startAt: "2026-06-01T00:00:00Z",
          endAt: "2026-06-08T00:00:00Z",
        },
        ACTOR
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "deity_slug_not_allowed",
    });
  });

  test("surface = status_deity + no deity_slug → 400 deity_slug_required", async () => {
    await expect(
      service.create(
        {
          surface: "status_deity",
          contentId: CONTENT_ID,
          pinPosition: 1,
          startAt: "2026-06-01T00:00:00Z",
          endAt: "2026-06-08T00:00:00Z",
        },
        ACTOR
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "deity_slug_required",
    });
  });

  test("start_at >= end_at → 400 invalid_time_window", async () => {
    await expect(
      service.create(
        {
          surface: "home",
          contentId: CONTENT_ID,
          pinPosition: 1,
          startAt: "2026-06-08T00:00:00Z",
          endAt: "2026-06-01T00:00:00Z",
        },
        ACTOR
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "invalid_time_window",
    });
  });

  test("unknown deity slug → 400 unknown_deity (via facade, not the repo)", async () => {
    deityBySlug.mockResolvedValueOnce(null);
    await expect(
      service.create(
        {
          surface: "status_deity",
          deitySlug: "unknown",
          contentId: CONTENT_ID,
          pinPosition: 1,
          startAt: "2026-06-01T00:00:00Z",
          endAt: "2026-06-08T00:00:00Z",
        },
        ACTOR
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "unknown_deity",
    });
    expect(deityBySlug).toHaveBeenCalledWith("unknown");
  });

  test("inactive deity → 400 unknown_deity", async () => {
    deityBySlug.mockResolvedValueOnce({
      id: "deity-1",
      slug: "shiva",
      iconUrl: "https://x/s.png",
      sortOrder: 0,
      active: false,
    });
    await expect(
      service.create(
        {
          surface: "status_deity",
          deitySlug: "shiva",
          contentId: CONTENT_ID,
          pinPosition: 1,
          startAt: "2026-06-01T00:00:00Z",
          endAt: "2026-06-08T00:00:00Z",
        },
        ACTOR
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test("home content_id not in home_feed → 400 unknown_content_id", async () => {
    homeHasFeedItem.mockResolvedValueOnce(false);
    await expect(
      service.create(
        {
          surface: "home",
          contentId: CONTENT_ID,
          pinPosition: 1,
          startAt: "2026-06-01T00:00:00Z",
          endAt: "2026-06-08T00:00:00Z",
        },
        ACTOR
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "unknown_content_id",
    });
  });

  test("status content_id not in status_items → 400 unknown_content_id", async () => {
    statusPinValidation.mockResolvedValueOnce(null);
    await expect(
      service.create(
        {
          surface: "status_all_gods",
          contentId: CONTENT_ID,
          pinPosition: 1,
          startAt: "2026-06-01T00:00:00Z",
          endAt: "2026-06-08T00:00:00Z",
        },
        ACTOR
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "unknown_content_id",
    });
  });

  test("status_deity + content_id whose row belongs to a different deity → 400 content_deity_mismatch", async () => {
    statusPinValidation.mockResolvedValueOnce({ deitySlug: "vishnu" });
    await expect(
      service.create(
        {
          surface: "status_deity",
          deitySlug: "shiva",
          contentId: CONTENT_ID,
          pinPosition: 1,
          startAt: "2026-06-01T00:00:00Z",
          endAt: "2026-06-08T00:00:00Z",
        },
        ACTOR
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "content_deity_mismatch",
    });
  });

  test("valid create → inserts pin + audit row inside one transaction", async () => {
    const created = pin({
      surface: "home",
      contentId: CONTENT_ID,
    });
    repoMock.create.mockResolvedValueOnce(created);
    const row = await service.create(
      {
        surface: "home",
        contentId: CONTENT_ID,
        pinPosition: 1,
        startAt: "2026-06-01T00:00:00Z",
        endAt: "2026-06-08T00:00:00Z",
      },
      ACTOR
    );
    expect(row).toEqual(created);
    expect(repoMock.create).toHaveBeenCalledTimes(1);
    expect(auditMock.insert).toHaveBeenCalledTimes(1);
    const auditArgs = lastInsertArgs(auditMock);
    expect(auditArgs).toMatchObject({
      pinnedContentId: created.id,
      action: "create",
      actorUserId: ACTOR,
      diff: null,
    });
    expect(auditArgs.snapshot).toEqual(created);
  });
});

describe("PinnedContentService.update", () => {
  test("cross-field: new start_at >= stored end_at → 400 invalid_time_window", async () => {
    const stored = pin({
      startAt: "2026-06-01T00:00:00.000Z",
      endAt: "2026-06-08T00:00:00.000Z",
    });
    repoMock.findById.mockResolvedValueOnce(stored);
    await expect(
      service.update(
        stored.id,
        {
          expectedUpdatedAt: stored.updatedAt,
          startAt: "2026-06-09T00:00:00Z",
        },
        ACTOR
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "invalid_time_window",
    });
  });

  test("stale precondition → 409 STALE_WRITE", async () => {
    const stored = pin();
    repoMock.findById.mockResolvedValueOnce(stored);
    repoMock.updateWithPrecondition.mockResolvedValueOnce(null);
    await expect(
      service.update(
        stored.id,
        { expectedUpdatedAt: stored.updatedAt, pinPosition: 3 },
        ACTOR
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "STALE_WRITE",
    });
  });

  test("valid update → writes audit row with field-level diff", async () => {
    const before = pin({ pinPosition: 1 });
    const after = pin({ pinPosition: 5, updatedAt: "2026-06-06T00:00:00.000Z" });
    repoMock.findById.mockResolvedValueOnce(before);
    repoMock.updateWithPrecondition.mockResolvedValueOnce(after);
    const row = await service.update(
      before.id,
      { expectedUpdatedAt: before.updatedAt, pinPosition: 5 },
      ACTOR
    );
    expect(row).toEqual(after);
    const auditArgs = lastInsertArgs(auditMock);
    expect(auditArgs).toMatchObject({
      action: "update",
      actorUserId: ACTOR,
    });
    expect(auditArgs.diff).toMatchObject({
      pinPosition: { before: 1, after: 5 },
      updatedAt: {
        before: "2026-06-01T00:00:00.000Z",
        after: "2026-06-06T00:00:00.000Z",
      },
    });
  });
});

describe("PinnedContentService.softDelete + restore", () => {
  test("cannot delete an already-deleted pin", async () => {
    const stored = pin({ deletedAt: "2026-06-05T00:00:00.000Z" });
    repoMock.findById.mockResolvedValueOnce(stored);
    await expect(
      service.softDelete(
        stored.id,
        { expectedUpdatedAt: stored.updatedAt },
        ACTOR
      )
    ).rejects.toMatchObject({ statusCode: 409, errorCode: "pin_deleted" });
  });

  test("cannot restore a non-deleted pin", async () => {
    const stored = pin({ deletedAt: null });
    repoMock.findById.mockResolvedValueOnce(stored);
    await expect(
      service.restore(
        stored.id,
        { expectedUpdatedAt: stored.updatedAt },
        ACTOR
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "pin_not_deleted",
    });
  });

  test("soft-delete writes an audit `delete` row", async () => {
    const before = pin({ deletedAt: null });
    const after = pin({ deletedAt: "2026-06-05T00:00:00.000Z" });
    repoMock.findById.mockResolvedValueOnce(before);
    repoMock.softDeleteWithPrecondition.mockResolvedValueOnce(after);
    await service.softDelete(
      before.id,
      { expectedUpdatedAt: before.updatedAt },
      ACTOR
    );
    expect(auditMock.insert.mock.calls[0]?.[0]).toMatchObject({
      action: "delete",
      actorUserId: ACTOR,
    });
  });

  test("restore writes an audit `restore` row", async () => {
    const before = pin({ deletedAt: "2026-06-05T00:00:00.000Z" });
    const after = pin({ deletedAt: null, updatedAt: "2026-06-06T00:00:00.000Z" });
    repoMock.findById.mockResolvedValueOnce(before);
    repoMock.restoreWithPrecondition.mockResolvedValueOnce(after);
    await service.restore(
      before.id,
      { expectedUpdatedAt: before.updatedAt },
      ACTOR
    );
    expect(auditMock.insert.mock.calls[0]?.[0]).toMatchObject({
      action: "restore",
      actorUserId: ACTOR,
    });
  });
});

describe("PinnedContentService.getById + listAudit", () => {
  test("getById on unknown id → 404", async () => {
    repoMock.findById.mockResolvedValueOnce(null);
    await expect(service.getById("nope")).rejects.toBeInstanceOf(AppError);
  });

  test("listAudit → 404 when the pin does not exist (guarded before the audit read)", async () => {
    repoMock.findById.mockResolvedValueOnce(null);
    await expect(service.listAudit("nope")).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(auditMock.listForPin).not.toHaveBeenCalled();
  });

  test("listAudit passes through the audit rows", async () => {
    repoMock.findById.mockResolvedValueOnce(pin());
    auditMock.listForPin.mockResolvedValueOnce([
      { id: "a-1", action: "create" },
    ]);
    const rows = await service.listAudit("some-id");
    expect(rows).toHaveLength(1);
  });
});
