/**
 * TAM-46 seed — Paywall remote-config source.
 *
 * Idempotent seed for the `vip-membership-v1` paywall (PRD §6.6/6.7/6.8).
 * Every insert is an `upsert` on the model's unique key + everything is
 * wrapped in a single `$transaction` so partial failure rolls back cleanly.
 * Runs locally and on stage; PROD seeding is manual (see spec).
 *
 * ONE plan: ₹299/month, entered by a ₹2 deposit at mandate registration that
 * buys a 1-day trial — NOT free, and not ₹5, both of which this line used to
 * say. The earlier `week` and
 * `quarter` plans are gone from `PLANS` — but because this seed is upsert-only
 * they still exist on already-seeded databases, so step 2 explicitly
 * deactivates any plan row not listed here (see the rationale there).
 *
 * Contains ONLY public-CDN sample media + example.com legal placeholders — no
 * live Prabhuji-controlled URLs. Media URLs are REAL and resolve (CC-BY sample
 * video + picsum poster) so the paywall renders end-to-end; the q4 items in the
 * spec (legal URLs, the real intro video) replace them at release time.
 *
 * Run:  pnpm --filter api run seed:paywall
 */

import { PrismaClient } from "@prisma/client";
import { isSeedCli } from "./_shared.js";

const prisma = new PrismaClient();

const PAYWALL_ID = "vip-membership-v1";

interface PlanSeed {
  planId: string;
  productId: string;
  period: "week" | "month" | "quarter";
  sortOrder: number;
  trialDays: number;
  // The machine-readable price, mirroring `PaywallPlan.amountPaise`/`currency`.
  // Integer paise so the charge amount never comes from parsing the localized
  // `displayPriceText` copy below.
  amountPaise: number;
  // Debited at mandate registration while the trial runs, to prove the payment
  // instrument works before the real price is due. Replaces a hardcoded ₹2 in
  // the Cashfree adapter — where it meant the amount actually charged existed
  // only in TypeScript, so changing it made past charges unreconstructible.
  initialDepositPaise: number;
  currency: string;
  translations: Record<
    "en" | "hi",
    {
      localizedLabel: string;
      trialLabel: string;
      displayPriceText: string;
      subscriptionDetailText: string;
    }
  >;
}

interface BenefitSeed {
  benefitId: string;
  icon: string;
  sortOrder: number;
  names: Record<"en" | "hi", string>;
}

interface PaywallShellSeed {
  locale: "en" | "hi";
  title: string;
  videoUrl: string;
  videoThumbnailUrl: string;
  videoId: string;
  cancelAnytimeText: string;
  refundPolicyText: string;
  payNowCta: string;
}

interface LegalSeed {
  locale: "en" | "hi";
  privacyPolicyUrl: string;
  termsServiceUrl: string;
  refundPolicyUrl: string;
}

// A single plan — there is no plan choice on the paywall, so `sortOrder` is 0
// and `PaywallConfig.defaultPlanId` below points at it.
const PLANS: PlanSeed[] = [
  {
    planId: "month",
    productId: "prabhuji_vip_month",
    period: "month",
    sortOrder: 0,
    // Matches PROD (TAM-164 moved it from 3 to 1; the migration
    // 20260901130000_trial_one_day is what changes a live database, not this).
    // This seed upserts `trialDays` on UPDATE as well as CREATE, so a stale
    // value here is not inert — running the seed against a live database
    // silently changes the trial every existing subscriber's plan advertises.
    //
    // 1 is at the FLOOR of every gateway's notification lead band, so it is only
    // purchasable on a gateway whose `pdnLeadHours.min` is 24. Anything higher
    // refuses these plans at registration (`plan_trial_shorter_than_pdn_lead`).
    trialDays: 1,
    amountPaise: 29900,
    initialDepositPaise: 200,
    currency: "INR",
    // NOT "free". ₹2 is debited with the UPI PIN that authorizes the mandate
    // (Decentro `is_first_txn_amount`), so the copy must say so — the previous
    // "1-day free trial" wording described a ₹0 registration this plan no
    // longer has, and it is the string the user consents against.
    translations: {
      en: {
        localizedLabel: "Monthly",
        trialLabel: "1 day for ₹2",
        displayPriceText: "₹299 / month",
        subscriptionDetailText: "for 1 day, then ₹299/month",
      },
      hi: {
        localizedLabel: "मासिक",
        trialLabel: "1 दिन ₹2 में",
        displayPriceText: "₹299 / महीना",
        subscriptionDetailText: "1 दिन के लिए, फिर ₹299/महीना",
      },
    },
  },
];

const BENEFITS: BenefitSeed[] = [
  {
    benefitId: "mandir",
    icon: "benefit-mandir.png",
    sortOrder: 0,
    names: { en: "Mandir", hi: "मंदिर" },
  },
  {
    benefitId: "wallpaper",
    icon: "benefit-wallpaper.png",
    sortOrder: 1,
    names: { en: "Wallpaper", hi: "वॉलपेपर" },
  },
  {
    benefitId: "ringtone",
    icon: "benefit-ringtone.png",
    sortOrder: 2,
    names: { en: "Ringtone", hi: "रिंगटोन" },
  },
  {
    benefitId: "aarti_bhajans",
    icon: "benefit-aarti-bhajans.png",
    sortOrder: 3,
    names: { en: "Aarti & Bhajans", hi: "आरती और भजन" },
  },
  {
    benefitId: "mantras_stutis",
    icon: "benefit-mantras-stutis.png",
    sortOrder: 4,
    names: { en: "Mantras & Stutis", hi: "मंत्र और स्तुतियाँ" },
  },
  {
    benefitId: "whatsapp_status",
    icon: "benefit-whatsapp-status.png",
    sortOrder: 5,
    names: { en: "Whatsapp Status", hi: "व्हाट्सएप स्टेटस" },
  },
  {
    benefitId: "horoscope",
    icon: "benefit-horoscope.png",
    sortOrder: 6,
    names: { en: "Horoscope", hi: "राशिफल" },
  },
  {
    benefitId: "app_icon",
    icon: "benefit-app-icon.png",
    sortOrder: 7,
    names: { en: "App Icon", hi: "ऐप आइकन" },
  },
];

// Public CDN sample video URL — big_buck_bunny is CC-BY and safe to leave in
// non-prod deployments. Replace with the production video before launch (q4
// in the spec).
const SAMPLE_VIDEO_URL =
  "https://cdn.jsdelivr.net/gh/mediaelement/mediaelement-files@master/big_buck_bunny.mp4";
// Real, deterministic poster image (picsum). The previous `placehold.co` URL
// resolved but served `image/svg+xml`, which Flutter's `Image.network` cannot
// decode — so the paywall poster never rendered on device.
const SAMPLE_VIDEO_THUMBNAIL = "https://picsum.photos/seed/paywall-vip-intro/720/1280";

const PAYWALL_SHELLS: PaywallShellSeed[] = [
  {
    locale: "en",
    title: "Unlock VIP Membership",
    videoUrl: SAMPLE_VIDEO_URL,
    videoThumbnailUrl: SAMPLE_VIDEO_THUMBNAIL,
    videoId: "vip_intro_v1",
    cancelAnytimeText: "Cancel anytime",
    refundPolicyText: "Refund policy",
    payNowCta: "Continue",
  },
  {
    locale: "hi",
    title: "VIP सदस्यता खोलें",
    videoUrl: SAMPLE_VIDEO_URL,
    videoThumbnailUrl: SAMPLE_VIDEO_THUMBNAIL,
    videoId: "vip_intro_v1",
    cancelAnytimeText: "कभी भी रद्द करें",
    refundPolicyText: "रिफंड पॉलिसी",
    payNowCta: "आगे बढ़ें",
  },
];

// ---------------------------------------------------------------------------
// TAM-159 — the A/B variant paywalls.
//
// These exist as ROWS here rather than behind a CMS "create" button because a
// paywall id does nothing until the bucket map in
// `core/paywall/services/paywall.buckets.ts` routes traffic to it — and that is
// code. Creation is coupled to a deploy either way, so it belongs where it can
// be reviewed alongside the traffic split. The ids MUST match that map.
//
// Each variant seeds its own shell copy, benefits and HERO, but never its own
// `paywall_plans` (price is canonical and shared — one row set, so a price
// change is one edit) and never its own legal links (same documents whichever
// screen you saw).
//
// Everything here is CREATE-ONLY: the `update` branch is empty for variant rows
// so a force seed cannot revert a CMS edit. That is TAM-130's lesson —
// `pnpm seed` force-runs on boot, and the video columns had to be pulled out of
// their update branch after a stage seed silently reverted an editor's upload.
interface VariantSeed {
  paywallId: string;
  layout: "video_bleed" | "icon_grid" | "carousel";
  /**
   * The lowest app version allowed to receive this paywall. Every variant is
   * gated above the current release until the app ships its layout widgets; an
   * editor lowers it in the CMS once the build is live. `0.0.0` = no gate.
   */
  minAppVersion: string;
  /**
   * Hero rows per locale, in render order.
   *
   * THREE of the four screens are a single VIDEO — only the carousel takes a
   * list of images. A layout that renders one hero silently ignores rows past
   * the first, which the admin write path now rejects outright.
   */
  hero: { mediaType: "image" | "video"; url: string; thumbnailUrl: string | null; mediaId: string }[];
}

/**
 * Until the app ships the layout widgets, no released build may be served a
 * variant. One place to change when that lands.
 *
 * TAM-160 — dropped from `1.1.0` to `1.0.6` so a `1.0.6+N` pubspec crosses the
 * gate (user Q14 wants the gate at `> 1.0.5`). `meetsMinVersion` compares as a
 * numeric `[major, minor, patch]` tuple (`paywall.buckets.ts:150`) so `1.0.6`
 * passes cleanly. CREATE-only in the variant loop below (`update: {}`), so this
 * value only affects a fresh DB — a stage/prod row already at `1.1.0` stays
 * put and must be lowered via the CMS.
 */
const VARIANT_MIN_APP_VERSION = "1.0.6";

const VARIANTS: VariantSeed[] = [
  {
    paywallId: "vip-video-bleed-v1",
    layout: "video_bleed",
    minAppVersion: VARIANT_MIN_APP_VERSION,
    hero: [
      {
        mediaType: "video",
        url: SAMPLE_VIDEO_URL,
        thumbnailUrl: SAMPLE_VIDEO_THUMBNAIL,
        mediaId: "vip_intro_v1",
      },
    ],
  },
  {
    paywallId: "vip-icon-grid-v1",
    layout: "icon_grid",
    minAppVersion: VARIANT_MIN_APP_VERSION,
    // A VIDEO hero, same as the card and full-bleed screens — the design mock
    // shows a poster frame, not a still image.
    hero: [
      {
        mediaType: "video",
        url: SAMPLE_VIDEO_URL,
        thumbnailUrl: SAMPLE_VIDEO_THUMBNAIL,
        mediaId: "vip_intro_v1",
      },
    ],
  },
  {
    paywallId: "vip-carousel-v1",
    layout: "carousel",
    minAppVersion: VARIANT_MIN_APP_VERSION,
    // The ONLY screen with a list of images. Three frames so the carousel has
    // something to page through out of the box.
    hero: [1, 2, 3].map((n) => ({
      mediaType: "image" as const,
      url: `https://picsum.photos/seed/paywall-carousel-${n}/720/1280`,
      thumbnailUrl: null,
      mediaId: `vip_carousel_${n}_v1`,
    })),
  },
];

// The REAL published legal pages, not placeholders. This seed runs
// unconditionally on every boot in every environment (see apps/api/src/index.ts)
// and the paywall screen PREFERS these values over the ones bundled in the app
// (apps/mobile/lib/features/paywall/presentation/paywall_screen.dart) — so an
// example.com URL here is what a paying user actually taps, and what a store
// reviewer sees next to a priced subscription. Same URLs as
// apps/mobile/env/*.json; keep the two in sync.
const PRIVACY_POLICY_URL = "https://krutyug.ai/privacy.html";
const TERMS_SERVICE_URL = "https://krutyug.ai/terms.html";
const REFUND_POLICY_URL = "https://krutyug.ai/pricing_policy.html";

const LEGAL_LINKS: LegalSeed[] = [
  {
    locale: "en",
    privacyPolicyUrl: PRIVACY_POLICY_URL,
    termsServiceUrl: TERMS_SERVICE_URL,
    refundPolicyUrl: REFUND_POLICY_URL,
  },
  {
    locale: "hi",
    privacyPolicyUrl: PRIVACY_POLICY_URL,
    termsServiceUrl: TERMS_SERVICE_URL,
    refundPolicyUrl: REFUND_POLICY_URL,
  },
];

interface SeedCounts {
  configs: number;
  plans: number;
  plansDeactivated: number;
  planTranslations: number;
  benefits: number;
  benefitTranslations: number;
  paywallTranslations: number;
  legalLinks: number;
  /** TAM-159 — hero rows seeded for the A/B variant paywalls. */
  heroMedia: number;
}

async function seed(): Promise<SeedCounts> {
  const counts: SeedCounts = {
    configs: 0,
    plans: 0,
    plansDeactivated: 0,
    planTranslations: 0,
    benefits: 0,
    benefitTranslations: 0,
    paywallTranslations: 0,
    legalLinks: 0,
    heroMedia: 0,
  };

  await prisma.$transaction(async (tx) => {
    // 1. The root config row.
    await tx.paywallConfig.upsert({
      where: { paywallId: PAYWALL_ID },
      update: {
        enabled: true,
        defaultPlanId: "month",
        shimmerEnabled: true,
        hasVideoLocaleFallback: true,
      },
      create: {
        paywallId: PAYWALL_ID,
        enabled: true,
        defaultPlanId: "month",
        shimmerEnabled: true,
        hasVideoLocaleFallback: true,
      },
    });
    counts.configs += 1;

    // 2. Plans + their translations. Upsert the plan first, then upsert the
    // translations against the plan id we get back.
    for (const plan of PLANS) {
      const upserted = await tx.paywallPlan.upsert({
        where: {
          paywall_plan_unique: {
            paywallId: PAYWALL_ID,
            planId: plan.planId,
          },
        },
        update: {
          productId: plan.productId,
          period: plan.period,
          sortOrder: plan.sortOrder,
          enabled: true,
          trialDays: plan.trialDays,
          initialDepositPaise: plan.initialDepositPaise,
          // Also on `update` so re-running backfills the price onto rows that
          // were seeded before `amountPaise`/`currency` existed (they default
          // to 0 paise, which would charge nothing).
          amountPaise: plan.amountPaise,
          currency: plan.currency,
        },
        create: {
          paywallId: PAYWALL_ID,
          planId: plan.planId,
          productId: plan.productId,
          period: plan.period,
          sortOrder: plan.sortOrder,
          enabled: true,
          trialDays: plan.trialDays,
          initialDepositPaise: plan.initialDepositPaise,
          amountPaise: plan.amountPaise,
          currency: plan.currency,
        },
      });
      counts.plans += 1;

      for (const [locale, t] of Object.entries(plan.translations)) {
        // TAM-159: the seed owns the CANONICAL copy row only. A variant's
        // override carries its own `paywallId` and is authored in the CMS, so
        // pinning the sentinel here keeps a re-seed from clobbering it.
        await tx.paywallPlanTranslation.upsert({
          where: {
            paywall_plan_translation_unique: {
              planId: upserted.id,
              locale,
              paywallId: PAYWALL_ID,
            },
          },
          update: t,
          create: { planId: upserted.id, locale, paywallId: PAYWALL_ID, ...t },
        });
        counts.planTranslations += 1;
      }
    }

    // The seed is upsert-only, so plans removed from PLANS would otherwise
    // survive on an already-seeded database. Deactivate rather than delete:
    // the read path already filters on the [paywallId, enabled, sortOrder]
    // index, translations are preserved, and it is trivially reversible.
    const deactivated = await tx.paywallPlan.updateMany({
      where: { paywallId: PAYWALL_ID, planId: { notIn: PLANS.map((p) => p.planId) } },
      data: { enabled: false },
    });
    counts.plansDeactivated = deactivated.count;

    // 3. Benefits + translations.
    for (const benefit of BENEFITS) {
      const upserted = await tx.paywallBenefit.upsert({
        where: {
          paywall_benefit_unique: {
            paywallId: PAYWALL_ID,
            benefitId: benefit.benefitId,
          },
        },
        update: {
          icon: benefit.icon,
          sortOrder: benefit.sortOrder,
          enabled: true,
        },
        create: {
          paywallId: PAYWALL_ID,
          benefitId: benefit.benefitId,
          icon: benefit.icon,
          sortOrder: benefit.sortOrder,
          enabled: true,
        },
      });
      counts.benefits += 1;

      for (const [locale, localizedName] of Object.entries(benefit.names)) {
        await tx.paywallBenefitTranslation.upsert({
          where: {
            paywall_benefit_translation_unique: {
              benefitId: upserted.id,
              locale,
            },
          },
          update: { localizedName },
          create: { benefitId: upserted.id, locale, localizedName },
        });
        counts.benefitTranslations += 1;
      }
    }

    // 4. Paywall-shell translations (title / video / CTA copy).
    //
    // The three VIDEO columns are in `create` but deliberately NOT in `update`
    // (TAM-130). They are CMS-owned now — `pnpm seed` and `pnpm seed:paywall`
    // both force-run, so leaving them in the update branch meant a force seed
    // on stage silently reverted whatever an editor had uploaded. The seed owns
    // the FIRST write of a locale's video; after that the CMS does.
    for (const shell of PAYWALL_SHELLS) {
      await tx.paywallTranslation.upsert({
        where: {
          paywall_translation_unique: {
            paywallId: PAYWALL_ID,
            locale: shell.locale,
          },
        },
        update: {
          title: shell.title,
          cancelAnytimeText: shell.cancelAnytimeText,
          refundPolicyText: shell.refundPolicyText,
          payNowCta: shell.payNowCta,
        },
        create: {
          paywallId: PAYWALL_ID,
          locale: shell.locale,
          title: shell.title,
          videoUrl: shell.videoUrl,
          videoThumbnailUrl: shell.videoThumbnailUrl,
          videoId: shell.videoId,
          cancelAnytimeText: shell.cancelAnytimeText,
          refundPolicyText: shell.refundPolicyText,
          payNowCta: shell.payNowCta,
        },
      });
      counts.paywallTranslations += 1;
    }

    // 5. Legal links.
    for (const legal of LEGAL_LINKS) {
      await tx.paywallLegalLinks.upsert({
        where: {
          paywall_legal_links_unique: {
            paywallId: PAYWALL_ID,
            locale: legal.locale,
          },
        },
        update: {
          privacyPolicyUrl: legal.privacyPolicyUrl,
          termsServiceUrl: legal.termsServiceUrl,
          refundPolicyUrl: legal.refundPolicyUrl,
        },
        create: {
          paywallId: PAYWALL_ID,
          locale: legal.locale,
          privacyPolicyUrl: legal.privacyPolicyUrl,
          termsServiceUrl: legal.termsServiceUrl,
          refundPolicyUrl: legal.refundPolicyUrl,
        },
      });
      counts.legalLinks += 1;
    }

    // 6. TAM-159 — the A/B variant paywalls.
    //
    // CREATE-ONLY throughout (`update: {}`): a force seed must never revert a
    // CMS edit. The canonical paywall's shell copy and benefits are the starting
    // point so a variant renders correctly the moment it is enabled; an editor
    // then diverges the copy and assets per variant from the CMS.
    //
    // No plans and no legal links per variant — price is canonical and shared
    // (one row set, so a price change is one edit), and the legal documents are
    // the same whichever screen you were shown.
    for (const variant of VARIANTS) {
      await tx.paywallConfig.upsert({
        where: { paywallId: variant.paywallId },
        update: {},
        create: {
          paywallId: variant.paywallId,
          layout: variant.layout,
          minAppVersion: variant.minAppVersion,
          enabled: true,
          defaultPlanId: "month",
          shimmerEnabled: true,
          hasVideoLocaleFallback: true,
        },
      });
      counts.configs += 1;

      for (const shell of PAYWALL_SHELLS) {
        await tx.paywallTranslation.upsert({
          where: {
            paywall_translation_unique: {
              paywallId: variant.paywallId,
              locale: shell.locale,
            },
          },
          update: {},
          create: {
            paywallId: variant.paywallId,
            locale: shell.locale,
            title: shell.title,
            cancelAnytimeText: shell.cancelAnytimeText,
            refundPolicyText: shell.refundPolicyText,
            payNowCta: shell.payNowCta,
          },
        });
        counts.paywallTranslations += 1;

        for (const [index, media] of variant.hero.entries()) {
          await tx.paywallHeroMedia.upsert({
            where: {
              paywall_hero_media_unique: {
                paywallId: variant.paywallId,
                locale: shell.locale,
                sortOrder: index,
              },
            },
            update: {},
            create: {
              paywallId: variant.paywallId,
              locale: shell.locale,
              sortOrder: index,
              mediaType: media.mediaType,
              url: media.url,
              thumbnailUrl: media.thumbnailUrl,
              mediaId: media.mediaId,
            },
          });
          counts.heroMedia += 1;
        }
      }

      for (const benefit of BENEFITS) {
        const upserted = await tx.paywallBenefit.upsert({
          where: {
            paywall_benefit_unique: {
              paywallId: variant.paywallId,
              benefitId: benefit.benefitId,
            },
          },
          update: {},
          create: {
            paywallId: variant.paywallId,
            benefitId: benefit.benefitId,
            icon: benefit.icon,
            sortOrder: benefit.sortOrder,
            enabled: true,
          },
        });
        counts.benefits += 1;

        for (const [locale, localizedName] of Object.entries(benefit.names)) {
          await tx.paywallBenefitTranslation.upsert({
            where: {
              paywall_benefit_translation_unique: {
                benefitId: upserted.id,
                locale,
              },
            },
            update: {},
            create: { benefitId: upserted.id, locale, localizedName },
          });
          counts.benefitTranslations += 1;
        }
      }
    }
  });

  return counts;
}

export async function runPaywallSeed(): Promise<SeedCounts> {
  try {
    const counts = await seed();
    // stdout is intentional here — seed is a CLI script, not app runtime code.
    process.stdout.write(`paywall seed ok: ${JSON.stringify(counts)}\n`);
    return counts;
  } finally {
    await prisma.$disconnect();
  }
}

// CLI entrypoint — guarded so importing this file (e.g. from all.seed.ts) has no
// side effect. This seed predates the `_shared.ts` `runSeed` convention the other
// module seeds use; the guard + named export bring it in line without touching
// its transactional body.
if (isSeedCli(import.meta.url)) {
  runPaywallSeed()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      process.stderr.write(
        `paywall seed failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    });
}
