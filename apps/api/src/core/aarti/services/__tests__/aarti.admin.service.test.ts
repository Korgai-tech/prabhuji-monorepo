import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import { ValidationError } from "@api/shared/errors";
import type { AartiRepository } from "../../repositories/aarti.repository.js";
import { AartiAdminService } from "../aarti.admin.service.js";

/**
 * Unit coverage for the TAM-160 curated-membership write
 * (`PUT /admin/aarti/sections/:id/items`). The repo is mocked; this path calls
 * no facade, so no `GlobalServiceMap` fakes are needed.
 *
 * The invariant under test: an unknown section 404s, a BUILT-IN section 400s,
 * and an unknown audio id 400s with NOTHING written (the whole set is rejected).
 */

interface RepoMock {
  findSectionTypeById: Mock;
  findExistingAudioIds: Mock;
  replaceSectionItems: Mock;
}

let repo: RepoMock;
let service: AartiAdminService;

const SECTION = "0199aaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa";
const AUD_1 = "0199bbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb1";
const AUD_2 = "0199bbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb2";

beforeEach(() => {
  repo = {
    findSectionTypeById: vi.fn().mockResolvedValue("curated"),
    findExistingAudioIds: vi.fn().mockResolvedValue([AUD_1, AUD_2]),
    replaceSectionItems: vi.fn().mockResolvedValue([
      { audioId: AUD_1, position: 0 },
      { audioId: AUD_2, position: 1 },
    ]),
  };
  service = new AartiAdminService(repo as unknown as AartiRepository);
});

describe("setSectionItems", () => {
  test("unknown section → 404 and NO write", async () => {
    repo.findSectionTypeById.mockResolvedValue(null);
    await expect(service.setSectionItems(SECTION, [AUD_1])).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repo.replaceSectionItems).not.toHaveBeenCalled();
  });

  test("a BUILT-IN section → 400 and NO write", async () => {
    repo.findSectionTypeById.mockResolvedValue("newly_added");
    await expect(
      service.setSectionItems(SECTION, [AUD_1])
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.replaceSectionItems).not.toHaveBeenCalled();
  });

  test("an unknown audio id → 400 naming it, with NOTHING written", async () => {
    repo.findExistingAudioIds.mockResolvedValue([AUD_1]); // AUD_2 missing
    await expect(
      service.setSectionItems(SECTION, [AUD_1, AUD_2])
    ).rejects.toThrowError(new RegExp(AUD_2));
    expect(repo.replaceSectionItems).not.toHaveBeenCalled();
  });

  test("happy path passes the array through UNCHANGED (order is the position)", async () => {
    const items = await service.setSectionItems(SECTION, [AUD_2, AUD_1]);
    expect(repo.replaceSectionItems).toHaveBeenCalledWith(SECTION, [
      AUD_2,
      AUD_1,
    ]);
    expect(items).toEqual([
      { audioId: AUD_1, position: 0 },
      { audioId: AUD_2, position: 1 },
    ]);
  });

  test("an EMPTY array clears the section without an id existence probe", async () => {
    repo.replaceSectionItems.mockResolvedValue([]);
    expect(await service.setSectionItems(SECTION, [])).toEqual([]);
    expect(repo.findExistingAudioIds).not.toHaveBeenCalled();
    expect(repo.replaceSectionItems).toHaveBeenCalledWith(SECTION, []);
  });
});
