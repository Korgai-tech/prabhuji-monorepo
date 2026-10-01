/**
 * TAM-73 seed — Horoscope navigational skeleton: zodiac grid + one daily mode +
 * the 8 example step configs + result-background media.
 *
 * Skeleton-only: seeds the zodiac taxonomy, the single daily mode, the step
 * configs that drive the input flow, and the result-background media asset —
 * but NO daily reading content. Predictions are produced by the content
 * pipeline (CMS/provider), not the seed. Idempotent (`upsert` on each model's
 * unique key), transactional (via `runSeed`). Zodiac icons + result background
 * use REAL, publicly-reachable picsum/Creative-Commons sample media.
 *
 * The 8 steps are seeded EXAMPLES, not code — reorder/rename/disable them via
 * `horoscope_step_config` row edits with no app release. The served daily result
 * resolves to empty until the content pipeline populates `daily_horoscope_result`
 * — which, with `OPENAI_API_KEY` configured, now happens automatically on
 * first request per sign per IST day (see services/generation/).
 *
 * Run:  pnpm --filter api run seed:horoscope
 */
import type { Prisma } from "@prisma/client";
import { SEED_MEDIA_URLS, type SeedCounts, isSeedCli, runSeed } from "./_shared.js";

const DAILY_MODE_ID = "daily_horoscope";
const RESULT_MEDIA_KEY = "horoscope_daily_result";

interface ZodiacSeed {
  zodiacId: string;
  en: string;
  hi: string;
  mr: string;
  te: string;
  sortOrder: number;
}

/**
 * 12 signs — typo-free labels (Sagittarius, Capricorn).
 *
 * Localized to every language the content pipeline generates
 * (`GENERATION_LOCALES`). Without `mr`/`te` here the grid falls back to the
 * ENGLISH sign name for Marathi and Telugu users, which reads as a bug next to
 * a fully-translated reading. Marathi mostly matches Hindi (both Devanagari,
 * both Sanskrit-derived) but not always — note `तूळ` vs `तुला` for Libra.
 *
 * ⚠️ Machine-authored, pending native review — see docs/PHASE-NOTES.md.
 */
const ZODIAC_SIGNS: ZodiacSeed[] = [
  { zodiacId: "aries", en: "Aries", hi: "मेष", mr: "मेष", te: "మేషం", sortOrder: 0 },
  { zodiacId: "taurus", en: "Taurus", hi: "वृषभ", mr: "वृषभ", te: "వృషభం", sortOrder: 1 },
  { zodiacId: "gemini", en: "Gemini", hi: "मिथुन", mr: "मिथुन", te: "మిథునం", sortOrder: 2 },
  { zodiacId: "cancer", en: "Cancer", hi: "कर्क", mr: "कर्क", te: "కర్కాటకం", sortOrder: 3 },
  { zodiacId: "leo", en: "Leo", hi: "सिंह", mr: "सिंह", te: "సింహం", sortOrder: 4 },
  { zodiacId: "virgo", en: "Virgo", hi: "कन्या", mr: "कन्या", te: "కన్య", sortOrder: 5 },
  { zodiacId: "libra", en: "Libra", hi: "तुला", mr: "तूळ", te: "తుల", sortOrder: 6 },
  { zodiacId: "scorpio", en: "Scorpio", hi: "वृश्चिक", mr: "वृश्चिक", te: "వృశ్చికం", sortOrder: 7 },
  { zodiacId: "sagittarius", en: "Sagittarius", hi: "धनु", mr: "धनु", te: "ధనుస్సు", sortOrder: 8 },
  { zodiacId: "capricorn", en: "Capricorn", hi: "मकर", mr: "मकर", te: "మకరం", sortOrder: 9 },
  { zodiacId: "aquarius", en: "Aquarius", hi: "कुंभ", mr: "कुंभ", te: "కుంభం", sortOrder: 10 },
  { zodiacId: "pisces", en: "Pisces", hi: "मीन", mr: "मीन", te: "మీనం", sortOrder: 11 },
];

interface StepSeed {
  stepId: string;
  /**
   * The key the AI provider answers this step under. Usually equal to `stepId`,
   * but NOT always — it is the indirection that lets the generation contract use
   * the PRD's section names while `stepId` stays the stable stored identity
   * (`good_time` is in every existing row; `good_time_today` is what the prompt
   * spec calls it). Never rename a `stepId` to close such a gap.
   */
  providerMapping: string;
  titleEn: string;
  titleHi: string;
  titleMr: string;
  titleTe: string;
  order: number;
  contentType: "text" | "number" | "color";
  safetyCategory: string;
  ttsEnabled: boolean;
}

/**
 * The 8 example steps (Figma sections) — seeded DATA, editable without release.
 *
 * Titles are localized to every generated language: the section TITLE comes from
 * this config, not from the model, so a missing `mr`/`te` here would render
 * Marathi and Telugu readings under English headings.
 *
 * ⚠️ Machine-authored Marathi/Telugu, pending native review.
 */
const STEPS: StepSeed[] = [
  { stepId: "namaste", providerMapping: "namaste", titleEn: "Namaste", titleHi: "नमस्ते", titleMr: "नमस्कार", titleTe: "నమస్తే", order: 0, contentType: "text", safetyCategory: "greeting", ttsEnabled: true },
  { stepId: "good_time", providerMapping: "good_time_today", titleEn: "A good time today", titleHi: "आज का शुभ समय", titleMr: "आजची शुभ वेळ", titleTe: "ఈరోజు శుభ సమయం", order: 1, contentType: "text", safetyCategory: "general", ttsEnabled: true },
  { stepId: "be_careful", providerMapping: "be_careful", titleEn: "Be careful", titleHi: "सावधानी", titleMr: "सावधगिरी", titleTe: "జాగ్రత్త", order: 2, contentType: "text", safetyCategory: "general", ttsEnabled: true },
  { stepId: "work_money", providerMapping: "work_and_money", titleEn: "Work and money", titleHi: "कार्य और धन", titleMr: "काम आणि पैसा", titleTe: "పని మరియు ధనం", order: 3, contentType: "text", safetyCategory: "general", ttsEnabled: true },
  { stepId: "health_care", providerMapping: "health_care", titleEn: "Health care", titleHi: "स्वास्थ्य", titleMr: "आरोग्य", titleTe: "ఆరోగ్యం", order: 4, contentType: "text", safetyCategory: "general", ttsEnabled: true },
  { stepId: "todays_solution", providerMapping: "todays_solution", titleEn: "Today's solution", titleHi: "आज का समाधान", titleMr: "आजचा उपाय", titleTe: "ఈరోజు పరిష్కారం", order: 5, contentType: "text", safetyCategory: "general", ttsEnabled: true },
  { stepId: "lucky_number", providerMapping: "lucky_number", titleEn: "Lucky number", titleHi: "शुभ अंक", titleMr: "शुभ अंक", titleTe: "అదృష్ట సంఖ్య", order: 6, contentType: "number", safetyCategory: "general", ttsEnabled: true },
  { stepId: "lucky_colour", providerMapping: "lucky_colour", titleEn: "Lucky colour", titleHi: "शुभ रंग", titleMr: "शुभ रंग", titleTe: "అదృష్ట రంగు", order: 7, contentType: "color", safetyCategory: "general", ttsEnabled: true },
];

export async function seedHoroscope(
  tx: Prisma.TransactionClient
): Promise<SeedCounts> {
  const counts: SeedCounts = {
    zodiacSigns: 0,
    modes: 0,
    steps: 0,
    mediaAssets: 0,
  };

  // 1. Zodiac signs (upsert by zodiacId).
  for (const sign of ZODIAC_SIGNS) {
    const data = {
      displayName: sign.en,
      localizedDisplayName: {
        en: sign.en,
        hi: sign.hi,
        mr: sign.mr,
        te: sign.te,
      } as Prisma.InputJsonValue,
      iconAssetUrl: SEED_MEDIA_URLS.zodiacIcon(sign.zodiacId),
      sortOrder: sign.sortOrder,
      enabled: true,
    };
    await tx.zodiacSign.upsert({
      where: { zodiacId: sign.zodiacId },
      update: data,
      create: { zodiacId: sign.zodiacId, ...data },
    });
    counts.zodiacSigns += 1;
  }

  // 2. The single enabled daily mode (upsert by modeId).
  await tx.horoscopeMode.upsert({
    where: { modeId: DAILY_MODE_ID },
    update: { modeName: "Daily Horoscope", enabled: true, phase: 1 },
    create: { modeId: DAILY_MODE_ID, modeName: "Daily Horoscope", enabled: true, phase: 1 },
  });
  counts.modes += 1;

  // 3. The 8 example step configs (upsert by (modeId, stepId)).
  for (const step of STEPS) {
    const data = {
      title: step.titleEn,
      localizedTitle: {
        en: step.titleEn,
        hi: step.titleHi,
        mr: step.titleMr,
        te: step.titleTe,
      } as Prisma.InputJsonValue,
      order: step.order,
      enabled: true,
      contentType: step.contentType,
      providerMapping: step.providerMapping,
      ttsEnabled: step.ttsEnabled,
      safetyCategory: step.safetyCategory,
    };
    await tx.horoscopeStepConfig.upsert({
      where: { horoscope_step_config_unique: { modeId: DAILY_MODE_ID, stepId: step.stepId } },
      update: data,
      create: { modeId: DAILY_MODE_ID, stepId: step.stepId, ...data },
    });
    counts.steps += 1;
  }

  // 4. Result-background media (upsert by assetKey).
  await tx.mediaAsset.upsert({
    where: { assetKey: RESULT_MEDIA_KEY },
    update: {
      resultBackgroundVideoUrl: SEED_MEDIA_URLS.horoscopeBackgroundVideo(RESULT_MEDIA_KEY),
      resultBackgroundStaticFallbackUrl: SEED_MEDIA_URLS.horoscopeBackgroundStatic(RESULT_MEDIA_KEY),
      assetVersion: 1,
    },
    create: {
      assetKey: RESULT_MEDIA_KEY,
      resultBackgroundVideoUrl: SEED_MEDIA_URLS.horoscopeBackgroundVideo(RESULT_MEDIA_KEY),
      resultBackgroundStaticFallbackUrl: SEED_MEDIA_URLS.horoscopeBackgroundStatic(RESULT_MEDIA_KEY),
      assetVersion: 1,
    },
  });
  counts.mediaAssets += 1;

  return counts;
}

export async function runHoroscopeSeed(): Promise<SeedCounts> {
  return runSeed("horoscope", seedHoroscope);
}

// CLI entrypoint — guarded so importing this file (e.g. from an integration
// test) has no side effect.
if (isSeedCli(import.meta.url)) {
  runHoroscopeSeed()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      process.stderr.write(
        `horoscope seed failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    });
}
