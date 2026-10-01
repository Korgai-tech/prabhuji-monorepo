import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import type {
  DeityRepository,
  DeityRow,
} from "../../repositories/deity.repository.js";
import { DeityService } from "../deity.service.js";
import { decodeCursor } from "@api/shared/pagination";

interface RepoMock {
  findAllActive: Mock;
  findActivePage: Mock;
  findBySlug: Mock;
}

function makeRepoMock(): { mock: RepoMock; repo: DeityRepository } {
  const mock: RepoMock = {
    findAllActive: vi.fn(),
    findActivePage: vi.fn(),
    findBySlug: vi.fn(),
  };
  // `DeityService` only touches these three read methods; the admin write
  // methods (TAM-88) live on the same repo but are exercised by their own
  // surface, so the mock stays minimal via a double assertion.
  return { mock, repo: mock as unknown as DeityRepository };
}

function row(
  id: string,
  slug: string,
  sortOrder: number,
  translations: { locale: string; displayName: string }[]
): DeityRow {
  return { id, slug, iconUrl: `https://cdn.example.com/${slug}.png`, sortOrder, active: true, translations };
}

describe("DeityService.getActiveDeities (localization + ordering)", () => {
  let mock: RepoMock;
  let service: DeityService;

  beforeEach(() => {
    const built = makeRepoMock();
    mock = built.mock;
    service = new DeityService(built.repo);
  });

  test("maps repo rows to localized views preserving repo order", async () => {
    mock.findAllActive.mockResolvedValueOnce([
      row("id-1", "ganesha", 0, [
        { locale: "hi", displayName: "गणेश" },
        { locale: "en", displayName: "Ganesha" },
      ]),
      row("id-2", "shiva", 1, [
        { locale: "hi", displayName: "शिव" },
        { locale: "en", displayName: "Shiva" },
      ]),
    ]);
    const result = await service.getActiveDeities({ locale: "hi" });
    expect(result.map((d) => d.slug)).toEqual(["ganesha", "shiva"]);
    expect(result[0]?.displayName).toBe("गणेश");
    expect(result[1]?.displayName).toBe("शिव");
    // active filter + sortOrder ordering are the repo's DB query; the service
    // passes the requested locale through and never re-sorts.
    expect(mock.findAllActive).toHaveBeenCalledWith("hi");
  });

  test("falls back to 'en' when the requested locale translation is missing", async () => {
    mock.findAllActive.mockResolvedValueOnce([
      row("id-1", "durga", 5, [{ locale: "en", displayName: "Durga" }]),
    ]);
    const result = await service.getActiveDeities({ locale: "mr" });
    expect(result[0]?.displayName).toBe("Durga");
  });

  test("falls back to the slug when neither requested nor 'en' translation exists", async () => {
    mock.findAllActive.mockResolvedValueOnce([row("id-1", "kubera", 9, [])]);
    const result = await service.getActiveDeities({ locale: "mr" });
    expect(result[0]?.displayName).toBe("kubera");
  });
});

describe("DeityService.listDeities (cursor pagination)", () => {
  let mock: RepoMock;
  let service: DeityService;

  beforeEach(() => {
    const built = makeRepoMock();
    mock = built.mock;
    service = new DeityService(built.repo);
  });

  test("no cursor → passes undefined afterKey; full-and-then-some sets nextCursor", async () => {
    // Repo over-fetches limit+1 (3 rows for limit 2) to signal a next page.
    mock.findActivePage.mockResolvedValueOnce([
      row("id-1", "a", 0, [{ locale: "en", displayName: "A" }]),
      row("id-2", "b", 1, [{ locale: "en", displayName: "B" }]),
      row("id-3", "c", 2, [{ locale: "en", displayName: "C" }]),
    ]);
    const page = await service.listDeities({ locale: "en", limit: 2 });
    expect(mock.findActivePage).toHaveBeenCalledWith({
      locale: "en",
      limit: 2,
      afterKey: undefined,
    });
    expect(page.items.map((d) => d.slug)).toEqual(["a", "b"]);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeCursor(page.nextCursor as string)).toEqual({
      sortOrder: 1,
      id: "id-2",
    });
  });

  test("last page (rows <= limit) → nextCursor null", async () => {
    mock.findActivePage.mockResolvedValueOnce([
      row("id-1", "a", 0, [{ locale: "en", displayName: "A" }]),
    ]);
    const page = await service.listDeities({ locale: "en", limit: 20 });
    expect(page.nextCursor).toBeNull();
  });

  test("decodes an incoming cursor into the repo afterKey", async () => {
    const { encodeCursor } = await import("@api/shared/pagination");
    const cursor = encodeCursor({ sortOrder: 3, id: "id-x" });
    mock.findActivePage.mockResolvedValueOnce([]);
    await service.listDeities({ locale: "en", cursor, limit: 10 });
    expect(mock.findActivePage).toHaveBeenCalledWith({
      locale: "en",
      limit: 10,
      afterKey: { sortOrder: 3, id: "id-x" },
    });
  });

  test("a malformed cursor throws (surfaces as 400) before hitting the repo", async () => {
    await expect(
      service.listDeities({ locale: "en", cursor: "@@bad@@", limit: 10 })
    ).rejects.toThrowError(/Invalid pagination cursor/);
    expect(mock.findActivePage).not.toHaveBeenCalled();
  });
});

describe("DeityService.getBySlug", () => {
  test("delegates to the repository", async () => {
    const { mock, repo } = makeRepoMock();
    mock.findBySlug.mockResolvedValueOnce({
      id: "id-1",
      slug: "shiva",
      iconUrl: "https://cdn.example.com/shiva.png",
      sortOrder: 1,
      active: true,
    });
    const service = new DeityService(repo);
    const result = await service.getBySlug("shiva");
    expect(result?.slug).toBe("shiva");
    expect(mock.findBySlug).toHaveBeenCalledWith("shiva");
  });

  test("returns null for an unknown slug", async () => {
    const { mock, repo } = makeRepoMock();
    mock.findBySlug.mockResolvedValueOnce(null);
    const service = new DeityService(repo);
    expect(await service.getBySlug("nope")).toBeNull();
  });
});
