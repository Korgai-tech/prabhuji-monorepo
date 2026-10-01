import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  houseCreator,
  houseCreatorAvatarUrl,
  HOUSE_CREATOR_ID,
  HOUSE_CREATOR_NAME,
} from "@api/core/status/status.creator";

/**
 * The house creator's identity lives in TWO places that cannot import each
 * other: this TypeScript constant, and the raw SQL data-migration that actually
 * inserts the row into stage and prod.
 *
 * If they drift, nothing fails at boot and nothing fails in CI — the first
 * report a user files simply writes a `reported_user_id` pointing at no row, and
 * nobody finds out until someone tries to read the moderation table. These tests
 * are the only thing standing between that and a silent data-integrity bug, so
 * they read the migration off disk rather than trusting a copied literal.
 */
describe("house creator constants match the seed migration", () => {
  // Resolved from THIS file, not `process.cwd()` — vitest runs from the repo
  // root, so a cwd-relative path silently resolves to the wrong tree.
  const migrationsDir = fileURLToPath(
    new URL("../../../../prisma/migrations", import.meta.url)
  );

  const seedMigrationSql = (): string => {
    const dir = readdirSync(migrationsDir).find((d) =>
      d.endsWith("_tam_n_seed_house_creator")
    );
    expect(
      dir,
      "the seed-house-creator migration is missing — did it get renamed?"
    ).toBeDefined();
    return readFileSync(join(migrationsDir, dir as string, "migration.sql"), "utf8");
  };

  it("pins the same uuid as the migration", () => {
    expect(seedMigrationSql()).toContain(HOUSE_CREATOR_ID);
  });

  it("pins the same display name as the migration", () => {
    expect(seedMigrationSql()).toContain(`'${HOUSE_CREATOR_NAME}'`);
  });

  it("inserts idempotently, so a redeploy is a no-op", () => {
    expect(seedMigrationSql()).toMatch(/ON CONFLICT \(id\) DO NOTHING/i);
  });
});

/**
 * The credit block as it goes on the wire, and the one rule that governs its
 * avatar: the HOST is the environment's, never the file's.
 *
 * Constants are asserted as LITERALS here. Comparing `houseCreator().name` to
 * `HOUSE_CREATOR_NAME` would pass through any rename; the literal forces a
 * rename to be a deliberate edit made alongside the seed migration above.
 */
describe("houseCreator()", () => {
  it("builds the credit block from the pinned identity", () => {
    // `toStrictEqual`, not `toEqual`: `avatarUrl` must be PRESENT and null, not
    // absent. An omitted key serializes away and the client's non-nullable
    // field loses its value.
    expect(houseCreator()).toStrictEqual({
      id: "019f8c40-0000-7000-8000-000000000001",
      name: "Amit",
      avatarUrl: null,
    });
  });

  it("ships a null avatarUrl while no asset key is configured", () => {
    // The shipping config: HOUSE_CREATOR_AVATAR_KEY is null, so the app renders
    // its generic person glyph instead of a broken-image slot. If someone sets
    // a key, this test is the reminder that the asset must actually exist.
    expect(houseCreatorAvatarUrl()).toBeNull();
    expect(houseCreator().avatarUrl).toBeNull();
  });
});

/**
 * The avatar host must never be baked into this file.
 *
 * `HOUSE_CREATOR_AVATAR_KEY` is a module constant, so there is no seam to set
 * it from a test and observe the composed URL — which is exactly why the rule
 * is asserted against the SOURCE instead. The regression it guards is silent
 * and permanent: a full URL pasted in as the "key" works perfectly in whichever
 * environment it was copied from and makes every other environment serve that
 * one's bucket (the failure `chat.constants.ts` already shipped once).
 */
describe("the avatar host comes from the environment, not this file", () => {
  const source = (): string =>
    readFileSync(
      fileURLToPath(new URL("../status.creator.ts", import.meta.url)),
      "utf8"
    );

  it("composes the URL from loadEnv().MEDIA_PUBLIC_BASE_URL", () => {
    expect(source()).toContain("loadEnv().MEDIA_PUBLIC_BASE_URL");
  });

  it("stores a RELATIVE object key — never an absolute URL", () => {
    const decl = /export const HOUSE_CREATOR_AVATAR_KEY[^=]*=\s*([^;]+);/.exec(
      source()
    );
    expect(decl, "the HOUSE_CREATOR_AVATAR_KEY declaration moved or changed shape")
      .not.toBeNull();

    const value = (decl?.[1] ?? "").trim();
    // Either unset (today) or a bare object key — anything with a scheme or a
    // leading slash means a host got pasted in alongside it.
    if (value !== "null") {
      expect(value, `${value} looks like an absolute URL, not an object key`)
        .not.toMatch(/:\/\//);
      expect(value).toMatch(/^["'`][^/]/);
    }
  });
});
