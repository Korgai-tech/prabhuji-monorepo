import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import { ValidationError } from "@api/shared/errors";
import type { AppError } from "@api/shared/errors";
import type { MantrasRepository } from "../../repositories/mantras.repository.js";
import { MantrasAdminService } from "../mantras.admin.service.js";

/**
 * Unit coverage for the TAM-160 curated-membership write
 * (`PUT /admin/mantras/sections/:id/items`). The repo is mocked; the focus is
 * the guard ORDER — an unknown section is a 404, a built-in section is a 400,
 * and an unknown item id rejects the WHOLE set with nothing written.
 */

interface RepoMock {
  findSectionTypeById: Mock;
  findExistingItemIds: Mock;
  replaceSectionItems: Mock;
}

const SECTION_ID = "33333333-3333-3333-3333-333333333333";
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

let repo: RepoMock;
let service: MantrasAdminService;

beforeEach(() => {
  repo = {
    findSectionTypeById: vi.fn().mockResolvedValue("curated"),
    findExistingItemIds: vi.fn().mockImplementation((ids: string[]) =>
      Promise.resolve(ids)
    ),
    replaceSectionItems: vi
      .fn()
      .mockImplementation((_sectionId: string, ids: string[]) =>
        Promise.resolve(ids.map((itemId, position) => ({ itemId, position })))
      ),
  };
  // Only the three curated-membership methods are exercised here; the rest of
  // the repository surface is irrelevant to this write, hence the assertion.
  service = new MantrasAdminService(repo as unknown as MantrasRepository);
});

describe("setSectionItems (TAM-160)", () => {
  test("passes the array through unchanged, in order", async () => {
    const items = await service.setSectionItems(SECTION_ID, [B, A]);
    expect(repo.replaceSectionItems).toHaveBeenCalledWith(SECTION_ID, [B, A]);
    expect(items).toEqual([
      { itemId: B, position: 0 },
      { itemId: A, position: 1 },
    ]);
  });

  test("an empty array clears the section (set semantics)", async () => {
    const items = await service.setSectionItems(SECTION_ID, []);
    expect(items).toEqual([]);
    expect(repo.replaceSectionItems).toHaveBeenCalledWith(SECTION_ID, []);
    // No ids to validate ⇒ no existence probe.
    expect(repo.findExistingItemIds).not.toHaveBeenCalled();
  });

  test("an unknown section → 404, nothing written", async () => {
    repo.findSectionTypeById.mockResolvedValue(null);
    await expect(service.setSectionItems(SECTION_ID, [A])).rejects.toMatchObject(
      { statusCode: 404 }
    );
    expect(repo.replaceSectionItems).not.toHaveBeenCalled();
  });

  test("a NON-curated (built-in) section → 400, nothing written", async () => {
    repo.findSectionTypeById.mockResolvedValue("newly_added");
    await expect(
      service.setSectionItems(SECTION_ID, [A])
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.replaceSectionItems).not.toHaveBeenCalled();
  });

  test("an unknown item id → 400 naming it, with the WHOLE set rejected", async () => {
    repo.findExistingItemIds.mockResolvedValue([A]);
    const err = await service
      .setSectionItems(SECTION_ID, [A, B])
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as AppError).message).toContain(B);
    expect(repo.replaceSectionItems).not.toHaveBeenCalled();
  });
});
