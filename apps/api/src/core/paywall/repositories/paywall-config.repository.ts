import { getPrisma } from "@api/shared/database";
import type {
  PaywallAdminCopyRow,
  PaywallAdminHeroMediaRow,
  PaywallAdminListRow,
  PaywallCopyUpdate,
  PaywallHeroMediaReplacement,
  RawBenefit,
  RawHeroMedia,
  RawLegalLinks,
  RawPaywallConfig,
  PurchasablePlan,
  RawPlan,
  RawTranslation,
} from "@api/core/paywall/types";

/**
 * Paywall CMS repository — the ONLY place `@prisma/client` is imported for
 * the paywall module. All layered reads live here; the provider service is
 * Prisma-free.
 *
 * Reads for the public surface came first (TAM-46); the admin CMS write-side
 * lives at the bottom of this class, wrapped in `$transaction`. The seed script
 * (`prisma/seeds/paywall-config.seed.ts`) uses the Prisma client directly
 * because it lives outside the app layering.
 */
export class PaywallConfigRepository {
  async findConfig(paywallId: string): Promise<RawPaywallConfig | null> {
    const row = await getPrisma().paywallConfig.findUnique({
      where: { paywallId },
    });
    if (!row) return null;
    return {
      id: row.id,
      paywallId: row.paywallId,
      configVersion: row.configVersion,
      enabled: row.enabled,
      defaultPlanId: row.defaultPlanId,
      shimmerEnabled: row.shimmerEnabled,
      hasVideoLocaleFallback: row.hasVideoLocaleFallback,
      layout: row.layout,
      minAppVersion: row.minAppVersion,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * The hero assets for one `(paywallId, locale)`, in render order (TAM-159).
   *
   * Empty when that locale has no hero — a real state, not an error: the service
   * resolves the locale fallback chain and only then decides what to serve.
   */
  async findHeroMedia(paywallId: string, locale: string): Promise<RawHeroMedia[]> {
    const rows = await getPrisma().paywallHeroMedia.findMany({
      where: { paywallId, locale },
      orderBy: { sortOrder: "asc" },
      select: {
        paywallId: true,
        locale: true,
        sortOrder: true,
        mediaType: true,
        url: true,
        thumbnailUrl: true,
        mediaId: true,
      },
    });
    return rows;
  }

  /**
   * Enabled plans with their billing fields only — no locale, no translations.
   *
   * Separate from `findEnabledPlansWithTranslations` on purpose: the amount we
   * charge must not depend on which locale was requested, and joining
   * translations here would make that dependency structurally possible.
   */
  async findPurchasablePlans(paywallId: string): Promise<PurchasablePlan[]> {
    return getPrisma().paywallPlan.findMany({
      where: { paywallId, enabled: true },
      orderBy: { sortOrder: "asc" },
      select: {
        planId: true,
        productId: true,
        period: true,
        trialDays: true,
        amountPaise: true,
        initialDepositPaise: true,
        currency: true,
      },
    });
  }

  /**
   * Enabled plans, joined with the requested locale's translation (nullable —
   * TAM-45 resolves the locale fallback). Ordered by `sortOrder` so the wire
   * response is deterministic.
   *
   * ── PLANS ARE CANONICAL; ONLY THE COPY VARIES BY VARIANT (TAM-159) ─────────
   * `plansPaywallId` is the canonical paywall that owns the plan rows — and
   * therefore `amountPaise`, `productId` and `initialDepositPaise`. Every
   * variant shares them, so a price change is one row rather than one per
   * variant, and no variant can accidentally charge a different amount.
   *
   * `variantPaywallId` selects only the COPY. Both the variant's and the
   * canonical row are fetched (`take` is 2, not 1) and the service prefers the
   * variant's — doing the preference here would mean returning a row without
   * saying which paywall it came from, which is exactly the ambiguity that
   * makes "why is this variant showing the default wording" unanswerable.
   */
  async findEnabledPlansWithTranslations(
    plansPaywallId: string,
    locale: string,
    variantPaywallId: string
  ): Promise<RawPlan[]> {
    const paywallIds = Array.from(new Set([variantPaywallId, plansPaywallId]));
    const rows = await getPrisma().paywallPlan.findMany({
      where: { paywallId: plansPaywallId, enabled: true },
      orderBy: { sortOrder: "asc" },
      include: {
        translations: {
          where: { locale, paywallId: { in: paywallIds } },
          take: paywallIds.length,
        },
      },
    });
    return rows.map((row) => {
      const t =
        row.translations.find((tr) => tr.paywallId === variantPaywallId) ??
        row.translations.find((tr) => tr.paywallId === plansPaywallId);
      return {
        id: row.id,
        paywallId: row.paywallId,
        planId: row.planId,
        productId: row.productId,
        period: row.period,
        sortOrder: row.sortOrder,
        enabled: row.enabled,
        trialDays: row.trialDays,
        translation: t
          ? {
              locale: t.locale,
              paywallId: t.paywallId,
              localizedLabel: t.localizedLabel,
              trialLabel: t.trialLabel,
              displayPriceText: t.displayPriceText,
              subscriptionDetailText: t.subscriptionDetailText,
            }
          : null,
      };
    });
  }

  /**
   * Enabled benefits for a paywall, joined with the requested locale's
   * translation. Ordered by `sortOrder`.
   */
  async findEnabledBenefitsWithTranslations(
    paywallId: string,
    locale: string
  ): Promise<RawBenefit[]> {
    const rows = await getPrisma().paywallBenefit.findMany({
      where: { paywallId, enabled: true },
      orderBy: { sortOrder: "asc" },
      include: {
        translations: {
          where: { locale },
          take: 1,
        },
      },
    });
    return rows.map((row) => {
      const t = row.translations[0];
      return {
        id: row.id,
        paywallId: row.paywallId,
        benefitId: row.benefitId,
        icon: row.icon,
        sortOrder: row.sortOrder,
        enabled: row.enabled,
        translation: t
          ? {
              locale: t.locale,
              localizedName: t.localizedName,
            }
          : null,
      };
    });
  }

  async findTranslation(
    paywallId: string,
    locale: string
  ): Promise<RawTranslation | null> {
    const row = await getPrisma().paywallTranslation.findUnique({
      where: { paywall_translation_unique: { paywallId, locale } },
    });
    if (!row) return null;
    return {
      id: row.id,
      paywallId: row.paywallId,
      locale: row.locale,
      title: row.title,
      videoUrl: row.videoUrl,
      videoThumbnailUrl: row.videoThumbnailUrl,
      videoId: row.videoId,
      cancelAnytimeText: row.cancelAnytimeText,
      refundPolicyText: row.refundPolicyText,
      payNowCta: row.payNowCta,
    };
  }

  // =========================================================================
  // admin write-side (TAM-159) — the multi-paywall CMS
  //
  // Appended to this repository rather than split into a `*.admin.repository.ts`,
  // matching every other module (`status.repository.ts:243+`). Reads here are
  // called by the ADMIN service only, which deliberately does NOT go through
  // `DbPaywallConfigProvider`: a config row served from another task's 5-minute
  // LRU would hand the editor a stale `updatedAt` and 409 their next save even
  // though nobody else touched anything.
  // =========================================================================

  /** Every paywall, for the CMS picker. Ordered so the default sorts first. */
  async findAllConfigs(): Promise<PaywallAdminListRow[]> {
    const rows = await getPrisma().paywallConfig.findMany({
      orderBy: { paywallId: "asc" },
      select: {
        paywallId: true,
        layout: true,
        minAppVersion: true,
        enabled: true,
        configVersion: true,
        updatedAt: true,
      },
    });
    return rows;
  }

  /** Every hero row for a paywall, all locales, in render order (TAM-159). */
  async findAdminHeroMedia(paywallId: string): Promise<PaywallAdminHeroMediaRow[]> {
    const rows = await getPrisma().paywallHeroMedia.findMany({
      where: { paywallId },
      orderBy: [{ locale: "asc" }, { sortOrder: "asc" }],
      select: {
        locale: true,
        sortOrder: true,
        mediaType: true,
        url: true,
        thumbnailUrl: true,
        mediaId: true,
      },
    });
    return rows;
  }

  /** The editable shell copy of every locale that has a row (TAM-159). */
  async findAdminCopy(paywallId: string): Promise<PaywallAdminCopyRow[]> {
    const rows = await getPrisma().paywallTranslation.findMany({
      where: { paywallId },
      orderBy: { locale: "asc" },
      select: {
        locale: true,
        title: true,
        cancelAnytimeText: true,
        refundPolicyText: true,
        payNowCta: true,
      },
    });
    return rows;
  }

  /**
   * Apply every requested change to one paywall under the parent row's
   * optimistic-concurrency precondition (TAM-159). Returns the `updateMany`
   * count — `0` means stale-or-gone and the SERVICE disambiguates 404 vs 409.
   *
   * ── THE INVARIANT TAM-130 DOCUMENTED, HONOURED ──────────────────────────
   * `paywall_translations`, `paywall_hero_media` and `paywall_benefits` have no
   * `updatedAt` of their own, so the concurrency token lives on
   * `paywall_configs.updatedAt` and EVERY writer must bump the parent row in the
   * SAME transaction — the `configVersion` increment is what moves `@updatedAt`.
   * This method is now the only writer of all three child tables, which is what
   * keeps that invariant true rather than merely documented.
   *
   * Hero media is REPLACE-SET per locale (delete then insert): the table is
   * wholly owned here and the list is ordered, so an in-place patch would need a
   * reindexing dance to express "insert at position 2". Shell copy stays an
   * in-place UPDATE because its columns are NOT NULL and only some are in scope.
   */
  async updatePaywallWithPrecondition(params: {
    paywallId: string;
    expectedUpdatedAt: Date;
    config: { layout?: string; minAppVersion?: string };
    copy: PaywallCopyUpdate[];
    heroMedia: PaywallHeroMediaReplacement[];
  }): Promise<number> {
    return getPrisma().$transaction(async (tx) => {
      const res = await tx.paywallConfig.updateMany({
        where: {
          paywallId: params.paywallId,
          updatedAt: params.expectedUpdatedAt,
        },
        data: { ...params.config, configVersion: { increment: 1 } },
      });
      if (res.count === 0) return 0; // stale-or-gone; the service disambiguates

      for (const update of params.copy) {
        await tx.paywallTranslation.update({
          where: {
            paywall_translation_unique: {
              paywallId: params.paywallId,
              locale: update.locale,
            },
          },
          data: update.data,
        });
      }

      for (const replacement of params.heroMedia) {
        await tx.paywallHeroMedia.deleteMany({
          where: { paywallId: params.paywallId, locale: replacement.locale },
        });
        if (replacement.rows.length > 0) {
          await tx.paywallHeroMedia.createMany({
            data: replacement.rows.map((row) => ({
              paywallId: params.paywallId,
              locale: replacement.locale,
              ...row,
            })),
          });
        }
      }

      return res.count;
    });
  }

  /** Existence probe that disambiguates a 0-count write: gone (404) vs stale (409). */
  async configExists(paywallId: string): Promise<boolean> {
    const row = await getPrisma().paywallConfig.findUnique({
      where: { paywallId },
      select: { id: true },
    });
    return row !== null;
  }

  async findLegalLinks(
    paywallId: string,
    locale: string
  ): Promise<RawLegalLinks | null> {
    const row = await getPrisma().paywallLegalLinks.findUnique({
      where: { paywall_legal_links_unique: { paywallId, locale } },
    });
    if (!row) return null;
    return {
      id: row.id,
      paywallId: row.paywallId,
      locale: row.locale,
      privacyPolicyUrl: row.privacyPolicyUrl,
      termsServiceUrl: row.termsServiceUrl,
      refundPolicyUrl: row.refundPolicyUrl,
    };
  }
}
