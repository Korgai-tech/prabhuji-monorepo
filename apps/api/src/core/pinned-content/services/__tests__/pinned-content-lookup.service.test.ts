import { describe, expect, test, vi } from "vitest";
import type { PinnedContentRepository } from "@api/core/pinned-content/repositories";
import { PinnedContentLookupService } from "../pinned-content-lookup.service.js";

/**
 * Read-path unit coverage. The repo is mocked — this suite exercises argument
 * normalization, cross-surface slug handling, and the "returns whatever the
 * repo returned" passthrough. Postgres semantics (window filtering, sort
 * order) live in the integration suite (see `pinned-content.integration.test.ts`).
 */

function makeRepo(): { mock: { findActive: ReturnType<typeof vi.fn> }; repo: PinnedContentRepository } {
  const mock = { findActive: vi.fn() };
  return { mock, repo: mock as unknown as PinnedContentRepository };
}

describe("PinnedContentLookupService.getActivePinnedIds", () => {
  test("home surface never carries a deitySlug", async () => {
    const { mock, repo } = makeRepo();
    mock.findActive.mockResolvedValue([]);
    const service = new PinnedContentLookupService(repo);
    await service.getActivePinnedIds({
      surface: "home",
      atMs: Date.parse("2026-06-01T12:00:00Z"),
    });
    expect(mock.findActive).toHaveBeenCalledWith({
      surface: "home",
      deitySlug: null,
      at: new Date("2026-06-01T12:00:00Z"),
    });
  });

  test("status_all_gods normalizes a stray deitySlug to null", async () => {
    const { mock, repo } = makeRepo();
    mock.findActive.mockResolvedValue([]);
    const service = new PinnedContentLookupService(repo);
    await service.getActivePinnedIds({
      surface: "status_all_gods",
      deitySlug: "ganesha",
      atMs: 0,
    });
    expect(mock.findActive).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "status_all_gods", deitySlug: null })
    );
  });

  test("status_deity passes the slug through", async () => {
    const { mock, repo } = makeRepo();
    mock.findActive.mockResolvedValue([]);
    const service = new PinnedContentLookupService(repo);
    await service.getActivePinnedIds({
      surface: "status_deity",
      deitySlug: "shiva",
      atMs: 0,
    });
    expect(mock.findActive).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "status_deity", deitySlug: "shiva" })
    );
  });

  test("status_deity WITHOUT a deitySlug returns [] (defence-in-depth; empty pin block, no throw)", async () => {
    const { mock, repo } = makeRepo();
    const service = new PinnedContentLookupService(repo);
    const rows = await service.getActivePinnedIds({
      surface: "status_deity",
      atMs: 0,
    });
    expect(rows).toEqual([]);
    expect(mock.findActive).not.toHaveBeenCalled();
  });

  test("passes the repo result through unchanged", async () => {
    const { mock, repo } = makeRepo();
    const payload = [
      { id: "p-1", contentId: "c-1", pinPosition: 1 },
      { id: "p-2", contentId: "c-2", pinPosition: 2 },
    ];
    mock.findActive.mockResolvedValue(payload);
    const service = new PinnedContentLookupService(repo);
    const rows = await service.getActivePinnedIds({
      surface: "home",
      atMs: 0,
    });
    expect(rows).toEqual(payload);
  });
});
