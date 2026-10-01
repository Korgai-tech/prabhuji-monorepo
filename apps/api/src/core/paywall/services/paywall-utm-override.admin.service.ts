import { AppError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import { performServiceCall } from "@api/shared/workspace";
import type {
  PaywallUtmOverrideRepository,
  PaywallUtmOverrideRow,
} from "@api/core/paywall/repositories";
import {
  parsePaywallOverride,
  type PaywallOverride,
} from "@api/core/paywall/services/paywall-override.types";

const log = createModuleLogger("paywall:utm-override:admin");

/**
 * The narrow port this service needs from `PaywallService`: forget the cached
 * ad-group index. A port rather than the concrete service for the same reason
 * `PaywallCacheInvalidator` is one — it keeps the dependency one-way and lets
 * the unit tests assert the call without building a paywall service.
 */
export interface PaywallOverrideInvalidator {
  invalidateUtmOverrides(): void;
}

/** One row as the CMS reads it. `overrides` is narrowed, never the raw blob. */
export interface AdminUtmOverrideView {
  id: string;
  utmGroup: string;
  enabled: boolean;
  overrides: PaywallOverride;
  createdAt: string;
  updatedAt: string;
}

function toView(row: PaywallUtmOverrideRow): AdminUtmOverrideView {
  return {
    id: row.id,
    utmGroup: row.utmGroup,
    enabled: row.enabled,
    // Narrowed on the way OUT as well as on the read path, so the CMS renders
    // exactly what the paywall would serve. An editor debugging "why is my
    // title not showing" must not be shown a field the server drops.
    overrides: parsePaywallOverride(row.overrides),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * CMS write surface for `paywall_utm_overrides`.
 *
 * Unlike `PaywallAdminService` this one has full CRUD, and the difference is not
 * an inconsistency. A paywall id does nothing until `paywall.buckets.ts` routes
 * traffic to it — that is code, so creating one from a button would produce an
 * unreachable row. An override row is the opposite: it is self-contained data
 * keyed on a string the ad platform already owns, and it takes effect the moment
 * it exists. Creating and deleting one is exactly the operation this table is
 * for.
 *
 * No optimistic-concurrency token either, and that is also deliberate. The
 * paywall PATCH needs `expectedUpdatedAt` because it writes four tables at once
 * from a form an editor may have held open for an hour, where a silent
 * last-write-wins can drop a colleague's whole locale. A row here is one ad
 * group edited by one marketer; a 409 would cost more in confusion than the
 * conflict it prevents.
 */
export class PaywallUtmOverrideAdminService {
  constructor(
    private readonly repo: PaywallUtmOverrideRepository,
    private readonly invalidator: PaywallOverrideInvalidator
  ) {}

  async list(): Promise<AdminUtmOverrideView[]> {
    const rows = await this.repo.findAll();
    return rows.map(toView);
  }

  async read(id: string): Promise<AdminUtmOverrideView> {
    const row = await this.repo.findById(id);
    if (row === null) throw new AppError("Override not found", 404, "NOT_FOUND");
    return toView(row);
  }

  async create(input: {
    utmGroup: string;
    enabled: boolean;
    overrides: PaywallOverride;
  }): Promise<AdminUtmOverrideView> {
    const utmGroup = input.utmGroup.trim();
    // Checked before the insert so the editor gets "that ad group already has a
    // treatment" instead of a Prisma unique-violation surfacing as a 500. The
    // race between this and the INSERT is real and left alone: the database
    // constraint is still the guarantee, this is only the readable message.
    if ((await this.repo.findIdByUtmGroup(utmGroup)) !== null) {
      throw new AppError(
        `Ad group '${utmGroup}' already has an override`,
        409,
        "ALREADY_EXISTS"
      );
    }

    await this.validateOverrideMedia(input.overrides, null);

    const row = await this.repo.create({
      utmGroup,
      enabled: input.enabled,
      overrides: input.overrides,
    });
    this.afterWrite("created", row);
    return toView(row);
  }

  async update(
    id: string,
    patch: { utmGroup?: string; enabled?: boolean; overrides?: PaywallOverride }
  ): Promise<AdminUtmOverrideView> {
    const current = await this.repo.findById(id);
    if (current === null) throw new AppError("Override not found", 404, "NOT_FOUND");

    const utmGroup = patch.utmGroup?.trim();
    if (utmGroup !== undefined && utmGroup !== current.utmGroup) {
      const clash = await this.repo.findIdByUtmGroup(utmGroup);
      if (clash !== null) {
        throw new AppError(
          `Ad group '${utmGroup}' already has an override`,
          409,
          "ALREADY_EXISTS"
        );
      }
    }

    if (patch.overrides !== undefined) {
      await this.validateOverrideMedia(patch.overrides, parsePaywallOverride(current.overrides));
    }

    const row = await this.repo.update(id, {
      ...(utmGroup === undefined ? {} : { utmGroup }),
      ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
      ...(patch.overrides === undefined ? {} : { overrides: patch.overrides }),
    });
    // The row existed a moment ago, so `null` here means a concurrent DELETE.
    // 404 is the honest answer — the thing the caller edited is gone.
    if (row === null) throw new AppError("Override not found", 404, "NOT_FOUND");

    this.afterWrite("updated", row);
    return toView(row);
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new AppError("Override not found", 404, "NOT_FOUND");
    // No row to log the ad group from — the id is what the caller sent and what
    // the admin UI can correlate.
    log.info({ event: "paywall_utm_override_deleted", id }, "utm override deleted");
    this.invalidator.invalidateUtmOverrides();
  }

  /**
   * Rejects any hero URL our own presign flow did not mint.
   *
   * Same trust boundary as the paywall CMS, and the same carve-out: a URL the
   * row ALREADY holds is skipped, so re-saving a form never re-validates what
   * was validated on the way in. Without that, an edit to the title would 400
   * because the untouched hero came back down with the form.
   *
   * Reuses the `paywall.paywallHeroMedia.*` allowlist entries rather than
   * minting new ones: these are paywall hero assets for the same paywall,
   * uploaded through the same component, under the same size and content-type
   * limits. A separate entity would be a second registry row saying the same
   * thing.
   */
  private async validateOverrideMedia(
    next: PaywallOverride,
    current: PaywallOverride | null
  ): Promise<void> {
    const stored = new Set<string>();
    for (const locale of Object.values(current?.locales ?? {})) {
      if (locale.media === undefined) continue;
      stored.add(locale.media.url);
      if (locale.media.thumbnailUrl !== null) stored.add(locale.media.thumbnailUrl);
    }

    for (const locale of Object.values(next.locales)) {
      const media = locale.media;
      if (media === undefined) continue;
      if (!stored.has(media.url)) {
        await this.validateMediaUrl(media.url, "url");
      }
      if (media.thumbnailUrl !== null && !stored.has(media.thumbnailUrl)) {
        await this.validateMediaUrl(media.thumbnailUrl, "thumbnailUrl");
      }
    }
  }

  private async validateMediaUrl(url: string, field: "url" | "thumbnailUrl"): Promise<void> {
    await performServiceCall(
      "media",
      (m) =>
        m.validateOwnedUrl({ url, module: "paywall", entity: "paywallHeroMedia", field }),
      "paywall:admin:utm-override:media",
      "media URL validation failed"
    );
  }

  private afterWrite(action: "created" | "updated", row: PaywallUtmOverrideRow): void {
    log.info(
      {
        event: `paywall_utm_override_${action}`,
        id: row.id,
        utm_group: row.utmGroup,
        enabled: row.enabled,
      },
      `utm override ${action}`
    );
    // Only THIS task's cache. The other ECS tasks self-heal on the 5-minute TTL,
    // same as every other paywall cache — the admin page says so in its copy.
    this.invalidator.invalidateUtmOverrides();
  }
}
