import { AppError, ValidationError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import { performServiceCall } from "@api/shared/workspace";
import type { PaywallConfigRepository } from "@api/core/paywall/repositories";
import type {
  PaywallAdminCopyRow,
  PaywallAdminHeroMediaRow,
  PaywallAdminListRow,
  PaywallCopyUpdate,
  PaywallCopyWriteData,
  PaywallHeroMediaReplacement,
  RawPaywallConfig,
} from "@api/core/paywall/types";

const log = createModuleLogger("paywall:admin:service");

/**
 * The narrow slice of the paywall facade this service needs: wipe every cached
 * artefact for a paywall. Injected as a PORT rather than the concrete
 * `PaywallApi` so `services/` never takes a value import on `api/` (which
 * already type-imports `services/`), and so the unit tests can assert the call
 * without constructing the facade.
 */
export interface PaywallCacheInvalidator {
  invalidate(paywallId: string): void;
}

/** One row of the paywall picker. */
export interface AdminPaywallListItem {
  paywallId: string;
  layout: string;
  minAppVersion: string;
  enabled: boolean;
  configVersion: number;
  updatedAt: string;
}

/** One paywall as the CMS editor sees it. */
export interface AdminPaywallDetailData {
  paywallId: string;
  layout: string;
  minAppVersion: string;
  configVersion: number;
  enabled: boolean;
  defaultPlanId: string | null;
  shimmerEnabled: boolean;
  /** The concurrency token to echo back on `PATCH`. */
  updatedAt: string;
  translations: {
    locale: string;
    title: string;
    cancelAnytimeText: string;
    refundPolicyText: string;
    payNowCta: string;
    heroMedia: {
      sortOrder: number;
      mediaType: string;
      url: string;
      thumbnailUrl: string | null;
      mediaId: string;
    }[];
  }[];
}

/** One locale's requested change, as parsed at the route boundary. */
interface CopyPatchRow {
  locale: string;
  title?: string;
  cancelAnytimeText?: string;
  refundPolicyText?: string;
  payNowCta?: string;
  heroMedia?: {
    sortOrder: number;
    mediaType: string;
    url: string;
    thumbnailUrl?: string | null;
    mediaId: string;
  }[];
}

interface PaywallPatchInput {
  paywallId: string;
  expectedUpdatedAt: string;
  layout?: string;
  minAppVersion?: string;
  translations?: CopyPatchRow[];
}

/**
 * Admin write-side service for the paywall CMS (TAM-159) — **Prisma-free** (all
 * DB access is delegated to `PaywallConfigRepository`).
 *
 * Supersedes TAM-130's hero-video-only surface, which wrote the flat
 * `paywall_translations.video_*` columns. Those are dead now that the wire
 * derives the hero from `paywall_hero_media`, so leaving that endpoint in place
 * would have let an editor upload a video that silently never reached a device.
 *
 * Scope: the paywall SHELL COPY (`title`, `cancelAnytimeText`,
 * `refundPolicyText`, `payNowCta`), the HERO list, `layout` and `minAppVersion`.
 *
 * `enabled` is READ-ONLY here. The column still exists and the resolver still
 * honours it, but nothing in the CMS writes it — raising `minAppVersion` above
 * every shipped build parks a variant just as well, and two ways to disable the
 * same thing is one more than anyone will keep straight.
 *
 * Pricing, plans and legal links remain ops-managed — money and legal text, a
 * materially different blast radius. `displayPriceText` in particular stays out:
 * it is the only copy an editor could use to contradict what we actually charge.
 *
 * BENEFIT ICONS are also deliberately absent. They are part of the app's design
 * system, not content: the artwork has to match the layout's tile size and the
 * palette, and one wrong upload is visible on every paywall at once. Benefits
 * carry a bundled icon KEY; changing the artwork is an app release.
 *
 * There is no create endpoint. A new paywall id does nothing until the bucket
 * map in `paywall.buckets.ts` routes traffic to it, and that is code — so
 * creation is coupled to a deploy either way and belongs in the seed, where it
 * is reviewable, rather than behind a button that produces an unreachable row.
 *
 * Three behaviours are load-bearing and worth reading before changing anything:
 *
 * **1. The SERVER computes the diff.** `IMediaApi.validateOwnedUrl` rejects any
 * URL our own presign flow did not mint, and the seeded values point at public
 * CDNs. If the client's diff were what kept unchanged URLs out of the payload,
 * then a curl, a retry, or any re-render that resurrected a stored value would
 * 400 — and the endpoint would not be idempotent. So this service reads the
 * current state first and drops everything already equal to what is stored.
 *
 * **2. A no-op writes NOTHING.** No `config_version` bump, no transaction, no
 * cache invalidation. `config_version` is a paywall analytics dimension; a
 * version that moves when nothing changed would shred its meaning.
 *
 * **3. Hero media is compared as a WHOLE LIST, but validated PER URL.** The list
 * is ordered and replace-set, so "changed" means the list differs, not that some
 * row differs — a pure reorder is a real change. Ownership validation, however,
 * is keyed on the URL and skips anything the paywall already holds. Without that
 * split, reordering the seeded carousel would 400: the replacement contains
 * every URL, and the seeded ones are public CDN links our presign flow never
 * minted.
 */
export class PaywallAdminService {
  constructor(
    private readonly repo: PaywallConfigRepository,
    private readonly invalidator: PaywallCacheInvalidator
  ) {}

  /** Every paywall, for the CMS picker. */
  async listConfigs(): Promise<AdminPaywallListItem[]> {
    const rows = await this.repo.findAllConfigs();
    return rows.map(toListItem);
  }

  /** The full editable picture for one paywall. */
  async getConfig(paywallId: string): Promise<AdminPaywallDetailData> {
    return toView(await this.read(paywallId));
  }

  /**
   * Apply the requested changes under the parent row's `updatedAt`
   * precondition.
   */
  async updateConfig(params: PaywallPatchInput): Promise<AdminPaywallDetailData> {
    const current = await this.read(params.paywallId);

    const expected = new Date(params.expectedUpdatedAt);
    if (Number.isNaN(expected.getTime())) {
      throw new ValidationError("expectedUpdatedAt is not a valid timestamp");
    }

    // Cheap rejection first: a stale editor should not pay a round of S3 HEADs
    // to be told it is stale. The AUTHORITATIVE check still lives in the
    // repository's `WHERE` — this is a fast path, not the guard.
    if (current.config.updatedAt.getTime() !== expected.getTime()) {
      throw staleWrite();
    }

    const configPatch = diffConfig(params, current.config);
    const copy = diffCopy(params.translations ?? [], current.copy);
    const heroMedia = diffHeroMedia(params.translations ?? [], current.heroMedia);

    // A locale must already have a copy row: the four NOT NULL columns belong to
    // the seed, not to this surface, so there is nothing sensible to insert.
    const knownLocales = new Set(current.copy.map((c) => c.locale));
    for (const row of params.translations ?? []) {
      if (!knownLocales.has(row.locale)) {
        throw new ValidationError(
          `no paywall copy row for locale "${row.locale}" — the locale's copy must be seeded before it can be edited`
        );
      }
    }

    // Only the carousel renders more than one hero. Every other layout draws the
    // FIRST row and silently ignores the rest, so leaving five images on
    // `card_hero` stores work the editor will never see rendered and cannot
    // explain.
    //
    // Two things make this check what it is:
    //
    // 1. It runs against the layout this PATCH RESULTS IN, not the stored one —
    //    otherwise switching carousel→card_hero and trimming the list in a
    //    single save would be rejected against the layout being replaced.
    // 2. It runs against the RESULTING hero list of every locale in scope, not
    //    against the diff. A diff-scoped check passes a layout switch that
    //    touches no hero list at all, and leaves a `card_hero` paywall holding
    //    three stored rows — precisely the silent state it exists to prevent.
    //
    // Which locales are in scope depends on what moved. A hero edit is
    // answerable for the locale it rewrites. A LAYOUT change is answerable for
    // every locale that already has rows, because it is what made their stored
    // lists unrenderable. An unrelated copy edit on a paywall that was already
    // over quota is deliberately NOT blocked — the editor did not cause that,
    // and refusing their title change would strand them.
    const effectiveLayout = configPatch.layout ?? current.config.layout;
    if (effectiveLayout !== "carousel") {
      const resultingCount = new Map<string, number>();
      if (configPatch.layout !== undefined) {
        for (const row of current.heroMedia) {
          resultingCount.set(row.locale, (resultingCount.get(row.locale) ?? 0) + 1);
        }
      }
      // A supplied list REPLACES that locale's stored one, so it wins outright.
      for (const replacement of heroMedia) {
        resultingCount.set(replacement.locale, replacement.rows.length);
      }
      const overfull = [...resultingCount].find(([, count]) => count > 1);
      if (overfull) {
        throw new ValidationError(
          `layout "${effectiveLayout}" renders a single hero, but locale "${overfull[0]}" would have ${overfull[1]} — only the carousel layout takes multiple`
        );
      }
    }

    const nothingChanged =
      Object.keys(configPatch).length === 0 &&
      copy.length === 0 &&
      heroMedia.length === 0;
    if (nothingChanged) {
      log.info(
        { event: "paywall_admin_noop", paywallId: params.paywallId },
        "paywall patch changed nothing"
      );
      return toView(current);
    }

    // Ownership validation runs BEFORE any DB write, and OUTSIDE the
    // transaction on purpose: an S3 HEAD inside an interactive Prisma
    // transaction burns the 5s default timeout.
    //
    // ── ONLY URLs NOT ALREADY STORED ARE VALIDATED ──────────────────────────
    // This is TAM-130's idempotency rule ("an unchanged value never reaches
    // `validateOwnedUrl`") applied to an ORDERED list. Hero media is replace-set,
    // so a pure REORDER produces a whole-list replacement in which every URL is
    // already stored — and validating those would make reordering the seeded
    // carousel impossible, because the seed's URLs are public CDN links
    // (`picsum`, `jsdelivr`) our presign flow never minted. The editor would have
    // been told to re-upload three images to move one of them up.
    //
    // Not a widening of the trust boundary: a URL can only be in this set
    // because it passed this same check on an earlier write, or because we
    // seeded it. What must be validated is a url the paywall has never held —
    // and that is exactly what remains.
    const storedUrls = new Set<string>();
    for (const row of current.heroMedia) {
      storedUrls.add(row.url);
      if (row.thumbnailUrl !== null) storedUrls.add(row.thumbnailUrl);
    }

    for (const replacement of heroMedia) {
      for (const row of replacement.rows) {
        if (!storedUrls.has(row.url)) {
          await this.validateMediaUrl(row.url, "paywallHeroMedia", "url");
        }
        if (row.thumbnailUrl !== null && !storedUrls.has(row.thumbnailUrl)) {
          await this.validateMediaUrl(row.thumbnailUrl, "paywallHeroMedia", "thumbnailUrl");
        }
      }
    }

    const count = await this.repo.updatePaywallWithPrecondition({
      paywallId: params.paywallId,
      expectedUpdatedAt: expected,
      config: configPatch,
      copy,
      heroMedia,
    });
    if (count === 0) {
      // 0 is ambiguous — the config row could be GONE (404) or the caller's
      // token STALE (409). One probe disambiguates.
      if (!(await this.repo.configExists(params.paywallId))) {
        throw new AppError("Paywall config not found", 404, "NOT_FOUND");
      }
      throw staleWrite();
    }

    // TAM-46 was explicit: a CMS write endpoint MUST invalidate. Note this only
    // clears THIS task's caches — the other ECS tasks self-heal on the 5-minute
    // TTL, which the admin UI states in its page copy.
    this.invalidator.invalidate(params.paywallId);

    const fresh = await this.read(params.paywallId);
    log.info(
      {
        event: "paywall_admin_updated",
        paywallId: params.paywallId,
        locales: Array.from(
          new Set([...copy.map((c) => c.locale), ...heroMedia.map((h) => h.locale)])
        ),
        configFields: Object.keys(configPatch),
        configVersion: fresh.config.configVersion,
      },
      "paywall updated"
    );
    return toView(fresh);
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  /**
   * Repository-direct — the cached provider is deliberately NOT used here.
   *
   * Order matters: the config row is read FIRST. Reading children first would
   * pair a fresh token with values read before someone else's write, and the
   * next save would silently clobber them (a lost update). This ordering fails
   * the other way — a stale token with fresh values — which surfaces as a 409
   * the editor can act on.
   */
  private async read(paywallId: string): Promise<PaywallSnapshot> {
    const config = await this.repo.findConfig(paywallId);
    if (!config) {
      throw new AppError("Paywall config not found", 404, "PAYWALL_CONFIG_MISSING");
    }
    const [copy, heroMedia] = await Promise.all([
      this.repo.findAdminCopy(paywallId),
      this.repo.findAdminHeroMedia(paywallId),
    ]);
    return { config, copy, heroMedia };
  }

  /**
   * Media-URL ownership validation (ADR §A4) — the ONE call site, reaching
   * `IMediaApi.validateOwnedUrl` (TAM-84) only via `performServiceCall`. It
   * throws `ValidationError` (→ 400) unless the URL was minted by our presign
   * flow for this exact `(module, entity, field)` and the object exists with an
   * allowlisted content type. `entity` is the camelCase model name.
   */
  private async validateMediaUrl(
    url: string,
    entity: "paywallHeroMedia",
    field: "url" | "thumbnailUrl"
  ): Promise<void> {
    await performServiceCall(
      "media",
      (m) => m.validateOwnedUrl({ url, module: "paywall", entity, field }),
      "paywall:admin:media",
      "media URL validation failed"
    );
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

interface PaywallSnapshot {
  config: RawPaywallConfig;
  copy: PaywallAdminCopyRow[];
  heroMedia: PaywallAdminHeroMediaRow[];
}

function staleWrite(): AppError {
  return new AppError(
    "Paywall config was modified by someone else; reload and retry",
    409,
    "STALE_WRITE"
  );
}

/** Config-level flags that actually differ from what is stored. */
function diffConfig(
  requested: PaywallPatchInput,
  stored: RawPaywallConfig
): { layout?: string; minAppVersion?: string } {
  const patch: { layout?: string; minAppVersion?: string } = {};
  if (requested.layout !== undefined && requested.layout !== stored.layout) {
    patch.layout = requested.layout;
  }
  if (
    requested.minAppVersion !== undefined &&
    requested.minAppVersion !== stored.minAppVersion
  ) {
    patch.minAppVersion = requested.minAppVersion;
  }
  return patch;
}

/**
 * Keep only the shell-copy fields that differ. `undefined` (omitted) is never a
 * change; an identical value is never a change either — that is what makes the
 * endpoint idempotent.
 */
function diffCopy(
  requested: CopyPatchRow[],
  stored: PaywallAdminCopyRow[]
): PaywallCopyUpdate[] {
  const byLocale = new Map(stored.map((row) => [row.locale, row]));
  const updates: PaywallCopyUpdate[] = [];
  for (const row of requested) {
    const current = byLocale.get(row.locale);
    if (!current) continue; // caller validates existence and throws
    const data: PaywallCopyWriteData = {};
    if (row.title !== undefined && row.title !== current.title) data.title = row.title;
    if (
      row.cancelAnytimeText !== undefined &&
      row.cancelAnytimeText !== current.cancelAnytimeText
    ) {
      data.cancelAnytimeText = row.cancelAnytimeText;
    }
    if (
      row.refundPolicyText !== undefined &&
      row.refundPolicyText !== current.refundPolicyText
    ) {
      data.refundPolicyText = row.refundPolicyText;
    }
    if (row.payNowCta !== undefined && row.payNowCta !== current.payNowCta) {
      data.payNowCta = row.payNowCta;
    }
    if (Object.keys(data).length > 0) updates.push({ locale: row.locale, data });
  }
  return updates;
}

/**
 * Hero lists that differ, compared WHOLE rather than row-by-row.
 *
 * The list is ordered and replace-set, so a reorder is a real change even
 * though every row is individually unchanged — and conversely, an unchanged
 * list must produce no replacement at all, or a no-op PATCH would bump
 * `config_version`. Which URLs get re-validated is a SEPARATE question, decided
 * per URL by the caller — see the `storedUrls` set in `updateConfig`.
 */
function diffHeroMedia(
  requested: CopyPatchRow[],
  stored: PaywallAdminHeroMediaRow[]
): PaywallHeroMediaReplacement[] {
  const byLocale = new Map<string, PaywallAdminHeroMediaRow[]>();
  for (const row of stored) {
    const list = byLocale.get(row.locale) ?? [];
    list.push(row);
    byLocale.set(row.locale, list);
  }

  const replacements: PaywallHeroMediaReplacement[] = [];
  for (const row of requested) {
    if (row.heroMedia === undefined) continue; // omitted = untouched
    const next = row.heroMedia.map((m) => ({
      sortOrder: m.sortOrder,
      mediaType: m.mediaType,
      url: m.url,
      thumbnailUrl: m.thumbnailUrl ?? null,
      mediaId: m.mediaId,
    }));
    const current = (byLocale.get(row.locale) ?? []).map((m) => ({
      sortOrder: m.sortOrder,
      mediaType: m.mediaType,
      url: m.url,
      thumbnailUrl: m.thumbnailUrl,
      mediaId: m.mediaId,
    }));
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      replacements.push({ locale: row.locale, rows: next });
    }
  }
  return replacements;
}

function toListItem(row: PaywallAdminListRow): AdminPaywallListItem {
  return {
    paywallId: row.paywallId,
    layout: row.layout,
    minAppVersion: row.minAppVersion,
    enabled: row.enabled,
    configVersion: row.configVersion,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toView(snapshot: PaywallSnapshot): AdminPaywallDetailData {
  const heroByLocale = new Map<string, PaywallAdminHeroMediaRow[]>();
  for (const row of snapshot.heroMedia) {
    const list = heroByLocale.get(row.locale) ?? [];
    list.push(row);
    heroByLocale.set(row.locale, list);
  }

  return {
    paywallId: snapshot.config.paywallId,
    layout: snapshot.config.layout,
    minAppVersion: snapshot.config.minAppVersion,
    configVersion: snapshot.config.configVersion,
    enabled: snapshot.config.enabled,
    defaultPlanId: snapshot.config.defaultPlanId,
    shimmerEnabled: snapshot.config.shimmerEnabled,
    updatedAt: snapshot.config.updatedAt.toISOString(),
    translations: snapshot.copy.map((c) => ({
      locale: c.locale,
      title: c.title,
      cancelAnytimeText: c.cancelAnytimeText,
      refundPolicyText: c.refundPolicyText,
      payNowCta: c.payNowCta,
      heroMedia: (heroByLocale.get(c.locale) ?? []).map((m) => ({
        sortOrder: m.sortOrder,
        mediaType: m.mediaType,
        url: m.url,
        thumbnailUrl: m.thumbnailUrl,
        mediaId: m.mediaId,
      })),
    })),
  };
}
