import type { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";

/**
 * The Zod-validated document the service hands down, in the shape Prisma wants.
 *
 * A cast and not a parse: the value has already been validated at the route
 * boundary, and `PaywallOverride` is a plain JSON document by construction —
 * it just lacks the index signature `InputJsonObject` asks for.
 */
function asJson(value: unknown): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

/** One override as the CMS edits it. `overrides` is the raw stored blob. */
export interface PaywallUtmOverrideRow {
  id: string;
  utmGroup: string;
  enabled: boolean;
  overrides: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/** One enabled row as the public paywall reads it, blob still untrusted. */
export interface PaywallUtmOverrideEnabledRow {
  utmGroup: string;
  overrides: unknown;
}

/**
 * Fields an admin write may set. `undefined` means "leave alone".
 *
 * `overrides` is `unknown` rather than the domain type because narrowing lives
 * in `services/`, which this layer may not import — and because what reaches
 * Postgres is a JSON document either way.
 */
export interface PaywallUtmOverrideWrite {
  utmGroup?: string;
  enabled?: boolean;
  overrides?: unknown;
}

/**
 * The `paywall_utm_overrides` table — the second Prisma importer in this module
 * (`PaywallConfigRepository` is the other), split out because it shares no
 * query, no row shape and no transaction with the paywall CMS tables.
 *
 * The read side deliberately exposes ONE method that loads every enabled row at
 * once, rather than a `findByUtmGroup`. A per-request point lookup would put a
 * database round trip on the paywall's hot path for the ~99% of callers whose
 * ad group matches nothing, and the answer for those is "no row" — the single
 * most cacheable fact there is. Loading the whole set instead lets the service
 * cache one map and answer every miss from memory. The set is a hand-authored
 * CMS table: tens of rows, not thousands.
 */
export class PaywallUtmOverrideRepository {
  /**
   * Every ENABLED row. The service narrows each blob and indexes them.
   *
   * Disabled rows are filtered in SQL rather than in the service so a paused
   * campaign cannot be served by a stale in-memory map that still holds it.
   */
  async findEnabledRows(): Promise<PaywallUtmOverrideEnabledRow[]> {
    return getPrisma().paywallUtmOverride.findMany({
      where: { enabled: true },
      select: { utmGroup: true, overrides: true },
    });
  }

  async findAll(): Promise<PaywallUtmOverrideRow[]> {
    return getPrisma().paywallUtmOverride.findMany({
      orderBy: { utmGroup: "asc" },
    });
  }

  async findById(id: string): Promise<PaywallUtmOverrideRow | null> {
    return getPrisma().paywallUtmOverride.findUnique({ where: { id } });
  }

  async create(input: {
    utmGroup: string;
    enabled: boolean;
    overrides: unknown;
  }): Promise<PaywallUtmOverrideRow> {
    return getPrisma().paywallUtmOverride.create({
      data: {
        utmGroup: input.utmGroup,
        enabled: input.enabled,
        overrides: asJson(input.overrides),
      },
    });
  }

  /** `null` when no row has that id — the controller turns that into a 404. */
  async update(id: string, patch: PaywallUtmOverrideWrite): Promise<PaywallUtmOverrideRow | null> {
    // `updateMany` rather than `update`, because `update` throws P2025 on a
    // missing row and a 404 should not travel as an exception.
    const result = await getPrisma().paywallUtmOverride.updateMany({
      where: { id },
      data: {
        ...(patch.utmGroup === undefined ? {} : { utmGroup: patch.utmGroup }),
        ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
        ...(patch.overrides === undefined ? {} : { overrides: asJson(patch.overrides) }),
      },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  /** `false` when nothing was deleted. */
  async delete(id: string): Promise<boolean> {
    const result = await getPrisma().paywallUtmOverride.deleteMany({ where: { id } });
    return result.count > 0;
  }

  /** The id already using this ad group, or `null`. Used to 409 before writing. */
  async findIdByUtmGroup(utmGroup: string): Promise<string | null> {
    const row = await getPrisma().paywallUtmOverride.findUnique({
      where: { utmGroup },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}
