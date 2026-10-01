import { getPrisma } from "@api/shared/database";
import type { DeityPreference, DeityPreferenceSyncRow } from "@api/core/users/types";

/**
 * Postgres side of the deity-preference mirror (TAM-175).
 *
 * Owns three operations and nothing else: the per-request READ the feed uses,
 * the batched UPSERT the sync writes, and the WATERMARK the sync resumes from.
 *
 * The warehouse (`custom_user_properties` in ClickHouse) remains the source of
 * truth — see `UserDeityPreference` in `schema.prisma` for why the read path
 * never talks to it directly.
 */
export class DeityPreferenceRepository {
  /**
   * One user's preference, or `null` when nothing has been synced for them.
   *
   * `null` is a NORMAL answer, not an error: a user the warehouse has no
   * opinion about (brand new, or never shared anything) simply has no
   * preference, every pool falls through to "any god", and the feed serves what
   * it served before this feature existed.
   *
   * A primary-key lookup, so it is the same cost class as the feed's existing
   * per-page hydrate rather than a new bottleneck on the cold-start screen.
   */
  async findByUserId(userId: string): Promise<DeityPreference | null> {
    const row = await getPrisma().userDeityPreference.findUnique({
      where: { userId },
      select: {
        primaryDeitySlug: true,
        secondaryDeitySlug: true,
        adDeitySlug: true,
        source: true,
      },
    });
    return row;
  }

  /**
   * The newest `warehouse_updated_at` we have mirrored, or `null` on a cold
   * table (which makes the first run a full backfill).
   *
   * The watermark lives in the data rather than a separate cursor row on
   * purpose: a cursor table can advance past rows that failed to write and
   * silently strand them. Derived from `MAX()` it cannot — the mark only moves
   * when a row is actually here.
   */
  async findWatermark(): Promise<Date | null> {
    const row = await getPrisma().userDeityPreference.aggregate({
      _max: { warehouseUpdatedAt: true },
    });
    return row._max.warehouseUpdatedAt;
  }

  /**
   * Upsert a batch in ONE statement.
   *
   * Raw SQL rather than N `prisma.upsert` calls: a backfill run moves every
   * user in the product, and a round trip each would make the job's runtime a
   * function of the user base rather than of what changed. `unnest` turns the
   * batch into a relation, so this is one parameterised query regardless of
   * batch size.
   *
   * IDEMPOTENT by primary key, which is what lets the sync re-read its own
   * watermark boundary (`>=`) without having to reason about millisecond ties.
   * Re-running the whole job from scratch is therefore always safe.
   */
  async upsertMany(rows: readonly DeityPreferenceSyncRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    const userIds = rows.map((r) => r.userId);
    const primary = rows.map((r) => r.primaryDeitySlug);
    const secondary = rows.map((r) => r.secondaryDeitySlug);
    const ad = rows.map((r) => r.adDeitySlug);
    const source = rows.map((r) => r.source);
    const updatedAt = rows.map((r) => r.warehouseUpdatedAt);

    return getPrisma().$executeRaw`
      INSERT INTO "user_deity_preferences" (
        "user_id", "primary_deity_slug", "secondary_deity_slug",
        "ad_deity_slug", "source", "warehouse_updated_at", "synced_at"
      )
      SELECT
        batch.user_id,
        batch.primary_deity_slug,
        batch.secondary_deity_slug,
        batch.ad_deity_slug,
        batch.source,
        batch.warehouse_updated_at,
        NOW()
      FROM unnest(
        ${userIds}::uuid[],
        ${primary}::text[],
        ${secondary}::text[],
        ${ad}::text[],
        ${source}::text[],
        ${updatedAt}::timestamptz[]
      ) AS batch(
        user_id, primary_deity_slug, secondary_deity_slug,
        ad_deity_slug, source, warehouse_updated_at
      )
      ON CONFLICT ("user_id") DO UPDATE SET
        "primary_deity_slug"   = EXCLUDED."primary_deity_slug",
        "secondary_deity_slug" = EXCLUDED."secondary_deity_slug",
        "ad_deity_slug"        = EXCLUDED."ad_deity_slug",
        "source"               = EXCLUDED."source",
        "warehouse_updated_at" = EXCLUDED."warehouse_updated_at",
        "synced_at"            = NOW()
      -- Never move a row BACKWARDS. Two runs overlapping (a slow batch and a
      -- manual re-run) would otherwise let an older warehouse row overwrite a
      -- newer one. A NULL stored mark means "never synced", so it always loses.
      WHERE "user_deity_preferences"."warehouse_updated_at" IS NULL
         OR EXCLUDED."warehouse_updated_at" >= "user_deity_preferences"."warehouse_updated_at"
    `;
  }
}
