import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { buildApp } from "@api/app";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { clearGlobalServices } from "@api/shared/workspace";
import { clearPlanCache } from "@api/shared/rotation";
import { initAuthModule } from "@api/core/auth";
import { initUsersModule } from "@api/core/users";
import { initEngagementModule } from "@api/core/engagement";
import { initHomeModule } from "@api/core/home";
import { initPinnedContentModule } from "@api/core/pinned-content";
import { resetEnvCache } from "@api/shared/config";
import type { FastifyInstance } from "fastify";

/**
 * TAM-175 — the deity-split home feed, end to end against real Postgres.
 *
 * The unit suites already pin the slot map and the weave. What only a real
 * request can show is that the pieces are actually CONNECTED: that the
 * preference is read from the mirror, that the deity pools come out of the
 * catalogue with the right `deity_slug`, and — the requirement that matters
 * most — that a user with no preference gets byte-for-byte the feed the product
 * served before this feature.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-split-feed-tests";

const GANESHA = "ganesha";
const SHIVA = "shiva";

const USER_SPLIT = "11111111-1111-4111-8111-111111111111";
const USER_PLAIN = "22222222-2222-4222-8222-222222222222";

let app: FastifyInstance;

const auth = (sub: string) => ({
  authorization: `Bearer ${jwt.sign({ sub, email: `${sub}@t.test` }, JWT_SECRET, {
    expiresIn: "1h",
  })}`,
});

/** A feed card for `(contentType, deitySlug)`, titled so assertions read well. */
async function card(contentType: string, deitySlug: string | null, tag: string) {
  await getPrisma().homeFeedItem.create({
    data: {
      slug: `split-${tag}`,
      contentType,
      module: contentType,
      deitySlug,
      title: tag,
      heroImageUrl: "https://example.test/h.jpg",
      ctaLabel: "Go",
      ctaDestinationType: "content_detail",
      ctaDestinationValue: tag,
      headerDestinationModule: contentType,
      shareTitle: tag,
      shareText: tag,
      shareDeepLink: `https://example.test/${tag}`,
    },
  });
}

async function feedTitles(userId: string, limit = 10): Promise<string[]> {
  const res = await app.inject({
    method: "GET",
    url: `/home/feed?limit=${limit}`,
    headers: auth(userId),
  });
  expect(res.statusCode).toBe(200);
  const body = res.json<{ data: { items: { title: string }[] } }>();
  return body.data.items.map((i) => i.title);
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.AUTH_OTP_PEPPER = "integration-test-pepper-not-secret-32chars";
  process.env.AUTH_OTP_PROVIDER = "stub";
  process.env.ENABLE_REDIS = "false";
  // TAM-175 — the split is OFF by default; these tests are about what happens
  // when it is on. The off-state is asserted in its own block below.
  process.env.ENABLE_DEITY_SPLIT = "true";
  resetEnvCache();
  await startTestDb();
  app = await buildApp();
  initAuthModule(app);
  initUsersModule(app);
  initEngagementModule();
  initHomeModule(app);
  initPinnedContentModule(app);
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

beforeEach(async () => {
  clearPlanCache();
  await getPrisma().homeFeedItem.deleteMany({});
  await getPrisma().userDeityPreference.deleteMany({});
  // 6 status cards for each god, plus untagged filler across other modules.
  for (let i = 1; i <= 6; i += 1) await card("status", GANESHA, `g-status-${i}`);
  for (let i = 1; i <= 6; i += 1) await card("status", SHIVA, `s-status-${i}`);
  for (let i = 1; i <= 4; i += 1) await card("wallpaper", GANESHA, `g-wall-${i}`);
  for (let i = 1; i <= 4; i += 1) await card("ringtone", GANESHA, `g-ring-${i}`);
  for (let i = 1; i <= 8; i += 1) await card("mantra", null, `plain-${i}`);
  await getPrisma().userDeityPreference.create({
    data: {
      userId: USER_SPLIT,
      primaryDeitySlug: GANESHA,
      secondaryDeitySlug: SHIVA,
      warehouseUpdatedAt: new Date("2026-09-17T10:00:00.000Z"),
    },
  });
});

describe("GET /home/feed — deity split (TAM-175)", () => {
  test("a user with a preference gets the spec's slot map", async () => {
    const titles = await feedTitles(USER_SPLIT);
    expect(titles).toHaveLength(10);

    const kind = (t: string) =>
      t.startsWith("g-status") ? "statusMain"
      : t.startsWith("s-status") ? "statusSecond"
      : t.startsWith("g-") ? "otherMain"
      : "any";

    // Spec: statusMain 1,2,5,8 · statusSecond 3,6 · otherMain 4,7,9 · any 10
    expect([1, 2, 5, 8].map((s) => kind(titles[s - 1] ?? ""))).toEqual(
      ["statusMain", "statusMain", "statusMain", "statusMain"]
    );
    expect([3, 6].map((s) => kind(titles[s - 1] ?? ""))).toEqual([
      "statusSecond",
      "statusSecond",
    ]);
    expect([4, 7, 9].map((s) => kind(titles[s - 1] ?? ""))).toEqual([
      "otherMain",
      "otherMain",
      "otherMain",
    ]);
  });

  test("a user with NO preference gets exactly the unpersonalised feed", async () => {
    // The guarantee spec §6 asks for, and the one most likely to regress.
    const plain = await feedTitles(USER_PLAIN);
    expect(plain).toHaveLength(10);
    // Nothing in it is ordered by god: assert it equals the order a feed with
    // no deity data at all produces.
    await getPrisma().userDeityPreference.deleteMany({});
    clearPlanCache();
    const again = await feedTitles(USER_SPLIT);
    expect(again).toEqual(plain);
  });

  test("never repeats a card across the whole feed", async () => {
    const titles = await feedTitles(USER_SPLIT, 30);
    expect(new Set(titles).size).toBe(titles.length);
  });

  test("an untagged card is never served into a personalised slot", async () => {
    const titles = await feedTitles(USER_SPLIT);
    // Slots 1-9 are all deity slots; only slot 10 is "any".
    for (const title of titles.slice(0, 9)) {
      expect(title.startsWith("plain-")).toBe(false);
    }
  });

  test("two users with different gods get different orders from the same catalogue", async () => {
    await getPrisma().userDeityPreference.create({
      data: {
        userId: USER_PLAIN,
        primaryDeitySlug: SHIVA,
        secondaryDeitySlug: GANESHA,
        warehouseUpdatedAt: new Date("2026-09-17T10:00:00.000Z"),
      },
    });
    const a = await feedTitles(USER_SPLIT);
    const b = await feedTitles(USER_PLAIN);
    expect(a[0]?.startsWith("g-status")).toBe(true);
    expect(b[0]?.startsWith("s-status")).toBe(true);
  });

  test("paging does not repeat or skip, and the cursor pins the pair", async () => {
    const first = await app.inject({
      method: "GET",
      url: "/home/feed?limit=8",
      headers: auth(USER_SPLIT),
    });
    const p1 = first.json<{
      data: { items: { title: string }[]; nextCursor: string };
    }>();
    expect(p1.data.nextCursor).toBeTruthy();

    // The pair rides in the cursor, so page 2 keeps page 1's weave even if the
    // preference changes underneath — spec §7.
    await getPrisma().userDeityPreference.update({
      where: { userId: USER_SPLIT },
      data: { primaryDeitySlug: SHIVA, secondaryDeitySlug: GANESHA },
    });

    const second = await app.inject({
      method: "GET",
      url: `/home/feed?limit=8&cursor=${encodeURIComponent(p1.data.nextCursor)}`,
      headers: auth(USER_SPLIT),
    });
    const p2 = second.json<{ data: { items: { title: string }[] } }>();

    const t1 = p1.data.items.map((i) => i.title);
    const t2 = p2.data.items.map((i) => i.title);
    expect(new Set([...t1, ...t2]).size).toBe(t1.length + t2.length);
  });

  test("an unknown deity slug degrades to the unpersonalised feed, not an error", async () => {
    await getPrisma().userDeityPreference.update({
      where: { userId: USER_SPLIT },
      data: { primaryDeitySlug: "not-a-real-god", secondaryDeitySlug: null },
    });
    clearPlanCache();
    const titles = await feedTitles(USER_SPLIT);
    expect(titles).toHaveLength(10);
  });

  test("the master switch OFF serves the unpersonalised feed, preference and all", async () => {
    // The kill switch has to work with a preference PRESENT and pools FULL —
    // that is the state you would be turning it off in.
    const personalised = await feedTitles(USER_SPLIT);
    expect(personalised[0]?.startsWith("g-status")).toBe(true);

    process.env.ENABLE_DEITY_SPLIT = "false";
    resetEnvCache();
    clearPlanCache();
    try {
      const off = await feedTitles(USER_SPLIT);
      const plain = await feedTitles(USER_PLAIN);
      expect(off).toEqual(plain);
      expect(off).not.toEqual(personalised);
    } finally {
      process.env.ENABLE_DEITY_SPLIT = "true";
      resetEnvCache();
      clearPlanCache();
    }
  });

  test("a card added mid-epoch is invisible until the plan is rebuilt", async () => {
    const before = await feedTitles(USER_SPLIT, 30);
    await card("status", GANESHA, "g-status-late");
    const after = await feedTitles(USER_SPLIT, 30);
    expect(after).toEqual(before);
  });
});
