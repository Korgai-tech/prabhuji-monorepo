import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import {
  fakeSubscriptionApi,
  freeStatus,
  proStatus,
} from "@api/shared/testing";
import type {
  BooksRepository,
  BookSectionRow,
  ChapterRow,
  ContentCardRow,
  ScriptureRow,
  SubBookRow,
} from "../../repositories/books.repository.js";
import { BooksService } from "../books.service.js";

/**
 * Unit coverage for `BooksService` (TAM-75). The repo is mocked; the
 * `subscription` FACADE is registered into `GlobalServiceMap` as a fake so
 * `performServiceCall` resolves the entitlement check. Focus: home aggregation
 * (no reading body), listing/sort + offline flag, and the #EXPORT_CRITICAL Pro
 * gate (fail-closed) on contents/chapter/scripture — proving no reading payload
 * is built for a free caller, and the audio-only-for-major-books rule.
 */

interface RepoMock {
  findSections: Mock;
  findMajorBooks: Mock;
  findMajorBookPage: Mock;
  findScripturePage: Mock;
  findNewlyAdded: Mock;
  countByCategory: Mock;
  findContentCard: Mock;
  findContentHead: Mock;
  findSubBookTree: Mock;
  findLooseChapters: Mock;
  findChapter: Mock;
  findScripture: Mock;
}

function card(overrides: Partial<ContentCardRow> = {}): ContentCardRow {
  return {
    id: overrides.id ?? "c-1",
    contentType: overrides.contentType ?? "major_book",
    category: overrides.category ?? null,
    title: overrides.title ?? "Ramayan",
    coverImageUrl: "https://placehold.co/400x600",
    author: overrides.author ?? "Valmiki",
    languages: overrides.languages ?? ["hi"],
    offlineCacheEligible: overrides.offlineCacheEligible ?? true,
    sortOrder: overrides.sortOrder ?? 0,
  };
}

/** The CMS section rows the seed authors (title + order per Books surface). */
function sectionRows(): BookSectionRow[] {
  return [
    { key: "carousel", title: "Books", sortOrder: 0, isActive: true, translations: [] },
    { key: "categories", title: "Browse Categories", sortOrder: 1, isActive: true, translations: [] },
    { key: "newly_added", title: "Newly Added Books", sortOrder: 2, isActive: true, translations: [] },
    { key: "all_books", title: "All Books", sortOrder: 3, isActive: true, translations: [] },
  ];
}

function makeRepo(): RepoMock {
  return {
    findSections: vi.fn().mockResolvedValue(sectionRows()),
    findMajorBooks: vi.fn().mockResolvedValue([card()]),
    findMajorBookPage: vi.fn().mockResolvedValue([card()]),
    findScripturePage: vi.fn().mockResolvedValue([]),
    findNewlyAdded: vi.fn().mockResolvedValue([]),
    countByCategory: vi.fn().mockResolvedValue({ Chalisa: 2, Aarti: 1 }),
    findContentCard: vi.fn().mockResolvedValue(card()),
    findContentHead: vi.fn().mockResolvedValue({
      id: "c-1",
      contentType: "major_book",
      title: "Ramayan",
      coverImageUrl: "https://placehold.co/400x600",
      author: "Valmiki",
      languages: ["hi"],
      offlineCacheEligible: true,
    }),
    findSubBookTree: vi.fn().mockResolvedValue([] as SubBookRow[]),
    findLooseChapters: vi.fn().mockResolvedValue([]),
    findChapter: vi.fn(),
    findScripture: vi.fn(),
  };
}

let subscriptionStatus: "active" | "free";
function registerSubscription(): void {
  registerGlobalService(
    "subscription",
    fakeSubscriptionApi({
      // The gate reads `isEntitled`, not `status` — `trialing` and in-grace
      // `past_due` are entitled too, and a lapsed `active` is not.
      getStatus: () =>
        Promise.resolve(
          subscriptionStatus === "active" ? proStatus() : freeStatus()
        ),
    })
  );
}

let repo: RepoMock;

beforeEach(() => {
  subscriptionStatus = "active";
  repo = makeRepo();
  registerSubscription();
});

afterEach(() => {
  clearGlobalServices();
  vi.restoreAllMocks();
});

function svc(): BooksService {
  // The public `BooksService` uses only the discovery/reading repo methods
  // mocked in `RepoMock`; the admin methods added by TAM-102 are irrelevant
  // here, so the mock is cast (the deity exemplar does the same). Behaviour of
  // the Pro-gate assertions below is unchanged.
  return new BooksService(repo as unknown as BooksRepository);
}

describe("getHome (FREE discovery)", () => {
  test("composes titled carousel/categories/newly-added sections, no reading body", async () => {
    repo.findMajorBooks.mockResolvedValue([card({ id: "b1" }), card({ id: "b2" })]);
    repo.findNewlyAdded.mockResolvedValue([card({ id: "b1" })]);
    const { sections } = await svc().getHome();

    // Every section is self-describing: stable key + CMS title + order.
    expect(sections.map((s) => s.key)).toEqual([
      "carousel",
      "categories",
      "newly_added",
    ]);
    expect(sections.map((s) => s.title)).toEqual([
      "Books",
      "Browse Categories",
      "Newly Added Books",
    ]);
    expect(sections.map((s) => s.sortOrder)).toEqual([0, 1, 2]);

    const bySection = new Map(sections.map((s) => [s.key, s]));
    expect(bySection.get("carousel")?.items).toHaveLength(2);
    expect(bySection.get("newly_added")?.items).toHaveLength(1);
    expect(bySection.get("carousel")?.items.every((i) => i.kind === "book")).toBe(true);

    // Exactly the 4 categories, in order, with counts surfaced.
    const categories = bySection.get("categories")?.items ?? [];
    expect(
      categories.map((i) => (i.kind === "category" ? i.category : null))
    ).toEqual(["Chalisa", "Aarti", "Kavach", "Stotram"]);
    const counts = categories.map((i) => (i.kind === "category" ? i.itemCount : -1));
    expect(counts[0]).toBe(2);
    expect(counts[2]).toBe(0); // Kavach absent from counts → 0

    // No reading body leaks into any discovery shape.
    expect(JSON.stringify(sections)).not.toMatch(/bodyText|contentBody|audioUrl/);
  });

  test("sections render in the CMS sortOrder, not the code order", async () => {
    repo.findNewlyAdded.mockResolvedValue([card({ id: "b1" })]);
    repo.findSections.mockResolvedValue([
      { key: "newly_added", title: "Fresh", sortOrder: 0, isActive: true, translations: [] },
      { key: "carousel", title: "Books", sortOrder: 5, isActive: true, translations: [] },
      { key: "categories", title: "Browse", sortOrder: 9, isActive: true, translations: [] },
    ]);
    const { sections } = await svc().getHome();
    expect(sections.map((s) => s.key)).toEqual([
      "newly_added",
      "carousel",
      "categories",
    ]);
  });

  test("a deactivated CMS section row hides that section", async () => {
    repo.findNewlyAdded.mockResolvedValue([card({ id: "b1" })]);
    repo.findSections.mockResolvedValue([
      ...sectionRows().filter((s) => s.key !== "newly_added"),
      { key: "newly_added", title: "Newly Added Books", sortOrder: 2, isActive: false, translations: [] },
    ]);
    const { sections } = await svc().getHome();
    expect(sections.map((s) => s.key)).not.toContain("newly_added");
  });

  test("an empty section is omitted (hide-when-empty, never fabricated)", async () => {
    repo.findNewlyAdded.mockResolvedValue([]); // nothing newly added
    const { sections } = await svc().getHome();
    expect(sections.map((s) => s.key)).toEqual(["carousel", "categories"]);
  });

  test("an unauthored section row falls back to the server-owned title", async () => {
    repo.findNewlyAdded.mockResolvedValue([card({ id: "b1" })]);
    repo.findSections.mockResolvedValue([]); // CMS table not seeded yet
    const { sections } = await svc().getHome();
    // Headings must ALWAYS be servable — the client never carries copy.
    expect(sections.map((s) => s.title)).toEqual([
      "Books",
      "Browse Categories",
      "Newly Added Books",
    ]);
  });

  test("TAM-112: localizes section titles to the requested locale (base when absent)", async () => {
    repo.findMajorBooks.mockResolvedValue([card({ id: "b1" })]);
    repo.findSections.mockResolvedValue([
      {
        key: "carousel",
        title: "Books",
        sortOrder: 0,
        isActive: true,
        translations: [{ locale: "hi", title: "पुस्तकें" }],
      },
    ]);
    const localized = await svc().getHome({ locale: "hi" });
    expect(localized.sections.find((s) => s.key === "carousel")?.title).toBe(
      "पुस्तकें"
    );
    // an un-updated client (no locale) still gets the base title — non-breaking.
    const base = await svc().getHome();
    expect(base.sections.find((s) => s.key === "carousel")?.title).toBe("Books");
  });

  test("does not resolve entitlement for the free home (no subscription call)", async () => {
    const getStatus = vi.fn();
    clearGlobalServices();
    registerGlobalService("subscription", fakeSubscriptionApi({ getStatus }));
    await svc().getHome();
    expect(getStatus).not.toHaveBeenCalled();
  });
});

describe("listMajorBooks (FREE, cursor)", () => {
  test("surfaces offlineCacheEligible on each card", async () => {
    repo.findMajorBookPage.mockResolvedValue([
      card({ id: "b1", offlineCacheEligible: true }),
    ]);
    const page = await svc().listMajorBooks({ limit: 20 });
    expect(page.items[0]?.offlineCacheEligible).toBe(true);
    expect(page.nextCursor).toBeNull();
  });

  test("over-fetch (limit+1) trims to limit and sets a nextCursor", async () => {
    repo.findMajorBookPage.mockResolvedValue([
      card({ id: "b1", sortOrder: 0 }),
      card({ id: "b2", sortOrder: 1 }),
      card({ id: "b3", sortOrder: 2 }),
    ]);
    const page = await svc().listMajorBooks({ limit: 2 });
    expect(page.items.map((i) => i.contentId)).toEqual(["b1", "b2"]);
    expect(page.nextCursor).not.toBeNull();
  });

  test("serves the CMS all-books listing title (client never hardcodes it)", async () => {
    repo.findSections.mockResolvedValue([
      { key: "all_books", title: "Every Book", sortOrder: 3, isActive: true, translations: [] },
    ]);
    expect((await svc().listMajorBooks({ limit: 20 })).title).toBe("Every Book");
  });

  test("falls back to the server-owned title when the CMS row is unauthored", async () => {
    repo.findSections.mockResolvedValue([]);
    expect((await svc().listMajorBooks({ limit: 20 })).title).toBe("All Books");
  });

  test("TAM-112: localizes the all-books title to the requested locale", async () => {
    repo.findSections.mockResolvedValue([
      {
        key: "all_books",
        title: "All Books",
        sortOrder: 3,
        isActive: true,
        translations: [{ locale: "hi", title: "सभी पुस्तकें" }],
      },
    ]);
    // requested locale present → override wins
    expect((await svc().listMajorBooks({ limit: 20, locale: "hi" })).title).toBe(
      "सभी पुस्तकें"
    );
    // absent locale → base title unchanged (non-breaking)
    expect((await svc().listMajorBooks({ limit: 20 })).title).toBe("All Books");
  });
});

describe("listCategory (FREE, cursor)", () => {
  test("is headed by the category's own title", async () => {
    repo.findScripturePage.mockResolvedValue([
      card({ id: "s1", contentType: "direct_scripture", category: "Chalisa" }),
    ]);
    const page = await svc().listCategory({ category: "Chalisa", limit: 20 });
    expect(page.title).toBe("Chalisa");
    expect(page.items).toHaveLength(1);
  });
});

describe("#EXPORT_CRITICAL Pro gate (fail-closed)", () => {
  test("free user → contents 403 and NO contents query runs", async () => {
    subscriptionStatus = "free";
    await expect(
      svc().getContents({ userId: "u", contentId: "c-1" })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.findContentHead).not.toHaveBeenCalled();
    expect(repo.findSubBookTree).not.toHaveBeenCalled();
  });

  test("free user → chapter 403 and NO chapter body query runs", async () => {
    subscriptionStatus = "free";
    await expect(
      svc().getChapter({ userId: "u", contentId: "c-1", chapterId: "ch-1" })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.findChapter).not.toHaveBeenCalled();
  });

  test("free user → scripture 403 and NO contentBody query runs", async () => {
    subscriptionStatus = "free";
    await expect(
      svc().getScripture({ userId: "u", contentId: "c-1" })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.findScripture).not.toHaveBeenCalled();
  });

  test("entitlement facade error → fails CLOSED to 403 (no reading query)", async () => {
    clearGlobalServices();
    registerGlobalService(
      "subscription",
      fakeSubscriptionApi({
        getStatus: () => Promise.reject(new Error("boom")),
      })
    );
    await expect(
      svc().getChapter({ userId: "u", contentId: "c-1", chapterId: "ch-1" })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.findChapter).not.toHaveBeenCalled();
  });
});

describe("contents assembly (Pro)", () => {
  test("kanda tree + loose chapters → correct total chapter count", async () => {
    repo.findSubBookTree.mockResolvedValue([
      {
        id: "sb-1",
        title: "Bala Kanda",
        order: 0,
        chapterCount: 2,
        chapters: [
          { id: "ch-1", title: "Ch 1", order: 0, hasAudio: true },
          { id: "ch-2", title: "Ch 2", order: 1, hasAudio: false },
        ],
      },
    ] as SubBookRow[]);
    repo.findLooseChapters.mockResolvedValue([
      { id: "ch-loose", title: "Loose", order: 0, hasAudio: false },
    ]);
    const contents = await svc().getContents({ userId: "u", contentId: "c-1" });
    expect(contents.subBooks).toHaveLength(1);
    expect(contents.subBooks[0]?.chapters).toHaveLength(2);
    expect(contents.chapters).toHaveLength(1); // loose
    expect(contents.totalChapterCount).toBe(3);
    // Contents is metadata only — no chapter bodies.
    expect(JSON.stringify(contents)).not.toMatch(/bodyText|contentBody|audioUrl/);
  });

  test("unknown / non-major content → 404", async () => {
    repo.findContentHead.mockResolvedValue(null);
    await expect(
      svc().getContents({ userId: "u", contentId: "missing" })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("chapter reader (Pro) — audio rule", () => {
  test("chapter WITH audio → audioUrl present, hasAudio true", async () => {
    repo.findChapter.mockResolvedValue({
      id: "ch-1",
      contentId: "c-1",
      subBookId: "sb-1",
      title: "Ch 1",
      order: 0,
      bodyText: "sample",
      audioUrl: "https://cdn.example.com/a.mp3",
    } satisfies ChapterRow);
    const res = await svc().getChapter({
      userId: "u",
      contentId: "c-1",
      chapterId: "ch-1",
    });
    expect(res.bodyText).toBe("sample");
    expect(res.audioUrl).toBe("https://cdn.example.com/a.mp3");
    expect(res.hasAudio).toBe(true);
  });

  test("major-book chapter WITHOUT audio → audioUrl null, hasAudio false", async () => {
    repo.findChapter.mockResolvedValue({
      id: "ch-2",
      contentId: "c-1",
      subBookId: null,
      title: "Ch 2",
      order: 1,
      bodyText: "sample",
      audioUrl: null,
    } satisfies ChapterRow);
    const res = await svc().getChapter({
      userId: "u",
      contentId: "c-1",
      chapterId: "ch-2",
    });
    expect(res.audioUrl).toBeNull();
    expect(res.hasAudio).toBe(false);
  });
});

describe("scripture reader (Pro) — never carries audio", () => {
  test("direct-scripture response has contentBody and NO audio field", async () => {
    repo.findScripture.mockResolvedValue({
      id: "s-1",
      category: "Chalisa",
      title: "Hanuman Chalisa",
      coverImageUrl: "https://placehold.co/400x600",
      author: null,
      languages: ["hi"],
      contentBody: "sample scripture body",
      offlineCacheEligible: true,
    } satisfies ScriptureRow);
    const res = await svc().getScripture({ userId: "u", contentId: "s-1" });
    expect(res.contentBody).toBe("sample scripture body");
    expect(res.offlineCacheEligible).toBe(true);
    // The scripture shape has no audio key at all (r7).
    expect(Object.keys(res)).not.toContain("audioUrl");
    expect(JSON.stringify(res)).not.toMatch(/audioUrl/);
  });
});
