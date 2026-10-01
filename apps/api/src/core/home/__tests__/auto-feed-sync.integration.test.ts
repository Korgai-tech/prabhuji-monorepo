import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { clearGlobalServices, registerGlobalService } from "@api/shared/workspace";
import { HomeRepository } from "@api/core/home/repositories";
import { HomeService } from "@api/core/home/services";
import { HomeApi } from "@api/core/home/api";
import { StatusRepository } from "@api/core/status/repositories";
import { StatusAdminService } from "@api/core/status/services";
// The param types are not re-exported from the module barrel; import them from
// the service that declares them so the fixtures are type-checked rather than cast.
import type {
  AdminStatusItemCreateParams,
  AdminStatusItemUpdateParams,
} from "@api/core/status/services/status.admin.service";

/**
 * TAM-176 — the auto-feed card must track its content for its whole life, not
 * just at birth.
 *
 * `syncHomeFeed` used to run on CREATE only, and the upsert forced
 * `is_active: true`. Two consequences, neither of which surfaced as an error:
 *
 *   * re-tagging a status to a different deity left its card in the OLD god's
 *     pool — which matters a great deal now that `deity_slug` decides pool
 *     membership (TAM-175);
 *   * deactivating a status left a LIVE card whose CTA opened deleted content,
 *     because the feed reads `home_feed_items.is_active` and never joins back
 *     to the row a card points at.
 *
 * Exercised through the real StatusAdminService against real Postgres with the
 * real home module registered, because the bug lived in the wiring BETWEEN
 * those two modules — a mocked facade would have asserted the mock.
 */

const GANESHA = "ganesha";
const SHIVA = "shiva";

let admin: StatusAdminService;

/** The auto-card for a status slug, or null. */
async function cardFor(slug: string) {
  return getPrisma().homeFeedItem.findUnique({
    where: { slug: `feed-status-${slug}` },
    select: { deitySlug: true, isActive: true, title: true, heroImageUrl: true },
  });
}

async function createStatus(slug: string, deitySlug: string) {
  const params: AdminStatusItemCreateParams = {
    slug,
    title: `title-${slug}`,
    mediaType: "image",
    deitySlug,
    imageUrl: null,
    videoUrl: null,
    thumbnailUrl: "https://example.test/thumb.jpg",
    overlaySafeArea: { top: 0, bottom: 0, left: 0, right: 0 },
    languages: [],
    shareCaption: null,
    isActive: true,
  };
  return admin.createItem(params);
}

/** A partial patch, typed — the point is that params alone cannot describe the card. */
function patch(p: AdminStatusItemUpdateParams): AdminStatusItemUpdateParams {
  return p;
}

beforeAll(async () => {
  await startTestDb();
  // Real home module — this test is about the seam between the two.
  registerGlobalService("home", new HomeApi(new HomeService(new HomeRepository())));
  // The two validators the admin service consults are not under test.
  registerGlobalService("media", {
    validateOwnedUrl: () => Promise.resolve(undefined),
  } as never);
  registerGlobalService("deity", {
    getBySlug: (slug: string) => Promise.resolve({ id: slug, slug, active: true }),
  } as never);
  admin = new StatusAdminService(new StatusRepository());
}, 180_000);

afterAll(async () => {
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

beforeEach(async () => {
  await getPrisma().homeFeedItem.deleteMany({});
  await getPrisma().statusItem.deleteMany({});
});

describe("auto-feed card lifecycle (TAM-176)", () => {
  it("creates the card with the content's deity and active state", async () => {
    await createStatus("s1", GANESHA);
    await expect(cardFor("s1")).resolves.toMatchObject({
      deitySlug: GANESHA,
      isActive: true,
      title: "title-s1",
    });
  });

  it("creates an INACTIVE card for content created inactive", async () => {
    // Behaviour change from carrying `isActive` through the facade: create used
    // to rely on the column default (`true`), so a status created inactive got
    // a live card. The feed never joins back to the source, so that card would
    // have been served.
    const params: AdminStatusItemCreateParams = {
      slug: "draft",
      title: "draft",
      mediaType: "image",
      deitySlug: GANESHA,
      imageUrl: null,
      videoUrl: null,
      thumbnailUrl: "https://example.test/thumb.jpg",
      overlaySafeArea: { top: 0, bottom: 0, left: 0, right: 0 },
      languages: [],
      shareCaption: null,
      isActive: false,
    };
    await admin.createItem(params);
    await expect(cardFor("draft")).resolves.toMatchObject({ isActive: false });
  });

  it("RE-TAGS the card when the content's deity changes", async () => {
    // The TAM-175 consequence: a stale deity silently puts the card in the
    // wrong god's pool, and nothing errors.
    const row = await createStatus("s2", GANESHA);
    await admin.updateItem(row.id, patch({
      expectedUpdatedAt: row.updatedAt,
      deitySlug: SHIVA,
    }));

    await expect(cardFor("s2")).resolves.toMatchObject({ deitySlug: SHIVA });
  });

  it("propagates an edited title and hero image", async () => {
    const row = await createStatus("s3", GANESHA);
    await admin.updateItem(row.id, patch({
      expectedUpdatedAt: row.updatedAt,
      title: "renamed",
      thumbnailUrl: "https://example.test/new.jpg",
    }));

    await expect(cardFor("s3")).resolves.toMatchObject({
      title: "renamed",
      heroImageUrl: "https://example.test/new.jpg",
    });
  });

  it("DEACTIVATES the card when the content is deactivated", async () => {
    // Without this the feed keeps serving a card whose CTA opens deleted
    // content — the feed never joins back to the source row.
    const row = await createStatus("s4", GANESHA);
    await admin.deactivateItem(row.id, row.updatedAt);

    await expect(cardFor("s4")).resolves.toMatchObject({ isActive: false });
  });

  it("re-activates the card when the content comes back", async () => {
    const row = await createStatus("s5", GANESHA);
    const dead = await admin.deactivateItem(row.id, row.updatedAt);
    expect((await cardFor("s5"))?.isActive).toBe(false);

    await admin.updateItem(dead.id, patch({
      expectedUpdatedAt: dead.updatedAt,
      isActive: true,
    }));

    await expect(cardFor("s5")).resolves.toMatchObject({ isActive: true });
  });

  it("keeps ONE card across the whole lifecycle — the slug is the identity", async () => {
    const row = await createStatus("s6", GANESHA);
    const a = await admin.updateItem(row.id, patch({
      expectedUpdatedAt: row.updatedAt,
      deitySlug: SHIVA,
    }));
    await admin.deactivateItem(a.id, a.updatedAt);

    const count = await getPrisma().homeFeedItem.count({
      where: { ctaContentId: row.id },
    });
    expect(count).toBe(1);
  });
});
