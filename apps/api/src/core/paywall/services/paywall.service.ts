import { AppError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import { performServiceCall } from "@api/shared/workspace";
import { fetchLatestUtmGroup } from "@api/shared/analytics";
import { evaluateAbtest } from "@api/shared/abtest";
import { PaywallUtmOverrideRepository } from "@api/core/paywall/repositories";
import {
  OVERRIDE_LOCALES,
  parsePaywallOverride,
  type PaywallOverride,
} from "@api/core/paywall/services/paywall-override.types";
import { PaywallLruCache } from "@api/core/paywall/services/cache";
import type { PaywallConfigProvider } from "@api/core/paywall/services/config.provider";
import {
  meetsMinVersion,
  resolvePaywallId,
} from "@api/core/paywall/services/paywall.buckets";
import type {
  RawBenefit,
  RawBenefitTranslation,
  RawHeroMedia,
  RawPlan,
  RawPlanTranslation,
} from "@api/core/paywall/services/config.types";

const log = createModuleLogger("paywall:service");

/**
 * Default paywall id — the CMS row seeded by TAM-46. Phase 2 (multi-paywall
 * experiments) may swap this to a lookup keyed on segment/experiment; for
 * now the client never picks a paywall.
 */
export const DEFAULT_PAYWALL_ID = "vip-membership-v1";

/**
 * The apiId the paywall evaluates on the shared abtesting service (TAM-173).
 *
 * Variant ids configured on that console ARE paywall ids (`vip-icon-grid-v1`,
 * …). An id without an enabled CMS row still falls back to the default via the
 * guards in `resolvePaywallIdForUser` — the console assigns, the CMS row
 * remains the kill switch.
 */
export const PAYWALL_ABTEST_API_ID = "paywall.layout";

/**
 * Server-side fallback locale used only when the requested locale and `hi`
 * both have no content. Never accepted from clients (the query enum rejects
 * it) — see `LanguageCodeSchema`.
 */
export const FINAL_FALLBACK_LOCALE = "en";

/**
 * The one key in `overrideIndexCache`. A constant because the cache holds a
 * single whole-table snapshot — there is nothing to key it BY.
 */
const OVERRIDE_INDEX_CACHE_KEY = "utm-override-index";

/**
 * Response-shape types for the paywall config endpoint (TAM-45).
 *
 * Kept module-internal — the wire shape lives in `routes/paywall.schemas.ts`
 * (the Zod schema is the OpenAPI source of truth). These type aliases mirror
 * that schema; if they drift, response serialization fails loudly in tests.
 */

export interface PaywallPlanDisplay {
  planId: string;
  productId: string;
  period: string;
  localizedLabel: string;
  trialLabel: string;
  trialDays: number;
  displayPriceText: string;
  subscriptionDetailText: string;
  sortOrder: number;
}

export interface PaywallBenefitDisplay {
  benefitId: string;
  localizedName: string;
  icon: string;
  sortOrder: number;
}

/** TAM-159. One hero asset, in render order. */
export interface PaywallHeroMediaDisplay {
  mediaType: string;
  url: string;
  thumbnailUrl: string | null;
  mediaId: string;
  sortOrder: number;
}

export interface PaywallLegalLinksDisplay {
  privacyPolicyUrl: string;
  termsServiceUrl: string;
  refundPolicyUrl: string;
}

export interface PaywallConfigResponseData {
  paywallId: string;
  configVersion: number;
  enabled: boolean;
  localeRequested: string;
  localeServed: string;
  fallbackUsed: boolean;
  fallbackFrom: string | null;
  missingFields: string[];
  title: string;
  /** TAM-159. Which built layout renders this config. Clients fall back on anything they don't know. */
  layout: string;
  /** TAM-159. The hero, in render order. Empty when the resolved locale has no assets. */
  heroMedia: PaywallHeroMediaDisplay[];
  /**
   * DEPRECATED (TAM-159) — superseded by `heroMedia`, kept because shipped APKs
   * read these three directly and a missing required key makes the generated
   * Dart `fromJson` return null, which `PaywallRepository` turns into an error
   * screen. Derived from `heroMedia`, never from the flat DB columns, so there
   * is still exactly one source of truth. Remove once no supported build reads them.
   */
  videoUrl: string | null;
  videoThumbnailUrl: string | null;
  videoId: string | null;
  defaultPlanId: string | null;
  plans: PaywallPlanDisplay[];
  benefits: PaywallBenefitDisplay[];
  legalLinks: PaywallLegalLinksDisplay;
  cancelAnytimeText: string;
  refundPolicyText: string;
  payNowCta: string;
  shimmerEnabled: boolean;
}

/**
 * Business-logic layer for the paywall config endpoint (TAM-45).
 *
 * Wires the raw `PaywallConfigProvider` from TAM-46 to the wire-facing
 * shape. Responsibilities:
 *
 * 1. **Locale fallback resolution** — server-side, one round trip from the
 *    client's perspective. Order per slice: `requested → hi → en`. Each
 *    localizable slice (top-level translation row, legal links, per-plan
 *    translation, per-benefit translation) is resolved independently so a
 *    partially localized locale (e.g. `mr` has translations but no legal
 *    links) still serves useful content.
 * 2. **Missing-fields tracking** — every slice we had to fall back from
 *    contributes an entry to `missingFields`. Consumed by mobile analytics
 *    (see `paywall_localization_fallback_used` in the ticket).
 * 3. **Empty-plans contract** — if the resolved plan list is empty (all
 *    plans disabled at the config level, OR no plan has a translation in
 *    any fallback locale), the endpoint returns 200 with `plans: []`. The
 *    mobile client has a specific path for this (`paywall_no_valid_plans`
 *    → route to Home) and it must NOT be a 404. See the spec's
 *    #EXPORT_CRITICAL.
 * 4. **Response cache** — one LRU keyed on `(paywallId, locale)` with a
 *    5-minute TTL. Complements (does not replace) the provider's raw-row
 *    LRU: the raw cache dedupes DB reads across concurrent requests, the
 *    response cache dedupes the full compose + fallback walk. Both wired
 *    with the same TTL so invalidation stays coherent.
 *
 * PII hygiene: log lines are content-only (paywall id, config version,
 * locale, fallback flags, source). No `req.user` fields — the paywall
 * config is not per-user in Phase 1 (see spec's #EXPORT_CRITICAL).
 */
export class PaywallService {
  private readonly responseCache: PaywallLruCache;
  private readonly utmGroupCache: PaywallLruCache;
  private readonly overrideIndexCache: PaywallLruCache;
  private readonly overrideRepo: PaywallUtmOverrideRepository;

  constructor(
    private readonly provider: PaywallConfigProvider,
    responseCache?: PaywallLruCache,
    utmGroupCache?: PaywallLruCache,
    overrideRepo?: PaywallUtmOverrideRepository
  ) {
    this.responseCache = responseCache ?? new PaywallLruCache();
    // Its OWN instance, not a namespace inside `responseCache`: this one is
    // keyed per USER, so sharing the 256-entry cap would let a busy minute of
    // logins evict the handful of composed responses the endpoint exists to
    // serve. Same 5-minute TTL — long enough to spare the repeat opens of one
    // session, short enough that a touch indexed late upstream is picked up on
    // the next visit rather than after half an hour of the wrong paywall.
    this.utmGroupCache = utmGroupCache ?? new PaywallLruCache({ maxEntries: 5000 });
    // One key, so a `maxEntries` above 1 would only ever hold dead weight. It is
    // a cache and not a plain field because that gives it the same 5-minute
    // self-healing TTL as everything else here: a CMS write invalidates it
    // explicitly, and the TTL bounds staleness on the OTHER api tasks, which
    // never see that invalidation (it is in-process, same as the response
    // cache). Worst case a new campaign starts serving up to 5 minutes late.
    this.overrideIndexCache = new PaywallLruCache({ maxEntries: 1 });
    this.overrideRepo = overrideRepo ?? new PaywallUtmOverrideRepository();
  }

  /**
   * Drops the cached ad-group index so the next request reloads it.
   *
   * Called by the admin service after any write. Deliberately does NOT clear
   * `utmGroupCache` — that holds "which ad group is this USER in", which a CMS
   * edit does not change.
   */
  invalidateUtmOverrides(): void {
    this.overrideIndexCache.clear();
  }

  /**
   * Which paywall an ORGANIC caller should be served (TAM-159).
   *
   * Not reached at all for a user matched to an ad campaign — `getPaywallConfig`
   * hands those the default shell before it gets here, so the A/B test and the
   * campaigns partition the traffic rather than compounding.
   *
   * Lives in the service, not the controller: the controller may not reach
   * `PaywallConfigProvider` without breaking Route → Controller → Service →
   * Repository.
   *
   * Three independent things must all hold before a user sees a variant, and
   * each one alone is enough to fall back to the shipped paywall:
   *   1. the assignment names a non-default variant — the abtesting service's
   *      arm when this env is configured for it (TAM-173), else the
   *      phone-digit bucket map, which needs the account to HAVE a phone
   *      (email and admin accounts do not, and an OTP row exists from `send`,
   *      before verify);
   *   2. that variant's config row exists AND is `enabled` — the CMS kill
   *      switch, which matters precisely because the fallback traffic map is
   *      code and a code change means a deploy. A missing row (variant named
   *      by an experiment or the map but not yet in the CMS) lands here too,
   *      which is the safe direction;
   *   3. the client's `app_version` is at or above THAT PAYWALL's
   *      `minAppVersion` — a build without the layout widget would render a
   *      broken screen.
   *
   * The version check is per-paywall and CMS-editable, so it comes AFTER the
   * config read rather than short-circuiting first. The cost is one user read
   * per paywall load; the config itself is served from the 5-minute LRU.
   *
   * The DEFAULT paywall is never version-checked: it is the fallback and the
   * screen every build already contains, so gating it could leave a client with
   * nothing to render at all.
   */
  private async resolveVariantPaywallId(
    userId: string | undefined,
    appVersion: unknown
  ): Promise<string> {
    const candidate = await this.resolvePaywallIdForUser(userId);
    if (candidate === DEFAULT_PAYWALL_ID) return candidate;

    // Second read, served from the provider's raw-row LRU — the gate above just
    // populated it. Cheaper than threading the config back out of a method whose
    // whole point is to answer with an id.
    const config = await this.provider.getConfig({ paywallId: candidate });
    if (!meetsMinVersion(appVersion, config?.minAppVersion ?? "")) {
      log.info(
        { paywall_id: candidate, min_app_version: config?.minAppVersion, reason: "app_too_old" },
        "paywall variant requires a newer app, falling back to default"
      );
      return DEFAULT_PAYWALL_ID;
    }
    return candidate;
  }

  /**
   * The paywall this user is ASSIGNED to — steps 1-2 of `resolveVariantPaywallId`
   * above, without the app-version gate.
   *
   * Split out for the backend analytics path (`paywall_id` on `bk_trial_success`
   * / `bk_subscription_started`), which has no `app_version` to gate on: those
   * events fire from a provider callback and from the billing sweep, neither of
   * which is an HTTP request from the app.
   *
   * The consequence is honest and bounded: a user on a build too old for their
   * variant SAW the default but is reported under their assigned variant. The
   * enabled/missing check is kept precisely because it is the one that would
   * otherwise skew a live experiment — a CMS kill switch moves everyone in that
   * arm to the default, and attributing their conversions to the dead arm would
   * be wrong for the whole arm rather than for a tail of stale clients.
   */
  async resolvePaywallIdForUser(userId: string | undefined): Promise<string> {
    if (userId === undefined) return DEFAULT_PAYWALL_ID;

    const candidate = await this.resolveAssignedPaywallId(userId);
    if (candidate === DEFAULT_PAYWALL_ID) return candidate;

    const config = await this.provider.getConfig({ paywallId: candidate });
    if (!config?.enabled) {
      log.info(
        { paywall_id: candidate, reason: config ? "disabled" : "missing" },
        "paywall variant unavailable, falling back to default"
      );
      return DEFAULT_PAYWALL_ID;
    }
    return candidate;
  }

  /**
   * Which paywall this user is assigned: the shared abtesting service first,
   * the in-process phone-digit bucketing (`paywall.buckets.ts`) when the
   * service is unconfigured or fails — so the user's phone is only read on the
   * fallback path (TAM-173).
   *
   * `inExperiment: false` mirrors chat's rule: a `paywallId` key in the
   * service's api-default is an explicit console answer (non-string reads as
   * the default), while an api-default WITHOUT the key means "nothing
   * configured for the paywall there yet" and falls back in-process, so wiring
   * the credentials before seeding experiments moves nobody.
   *
   * `appVersion` is deliberately NOT sent. The billing callback and sweep also
   * resolve this assignment and have no app version, and the service re-checks
   * targeting on sticky evaluations — so an experiment with an app-version
   * rule would flap a decided subject in and out between the two entry
   * points. Version gating stays where it is: the CMS row's `minAppVersion`,
   * applied by `resolveVariantPaywallId` on the one path that has a version.
   */
  private async resolveAssignedPaywallId(userId: string): Promise<string> {
    const evaluation = await evaluateAbtest(userId, PAYWALL_ABTEST_API_ID);
    if (evaluation !== null) {
      if (evaluation.inExperiment) return evaluation.variantId;
      const defaults = evaluation.defaultConfig;
      if (defaults !== null && "paywallId" in defaults) {
        return typeof defaults.paywallId === "string" ? defaults.paywallId : DEFAULT_PAYWALL_ID;
      }
    }

    const phoneNumber = await this.readPhoneNumber(userId);
    if (phoneNumber === null) return DEFAULT_PAYWALL_ID;
    return resolvePaywallId(phoneNumber);
  }

  /**
   * The caller's phone, for bucketing (TAM-159).
   *
   * The JWT carries `{sub, email}` only and `AuthService.verifyToken` never
   * touches the database, so the phone has to be read per request. That is the
   * price of bucketing on the phone rather than the user id; it is one indexed
   * primary-key lookup.
   *
   * FAILS SOFT. A users-module hiccup must not take the paywall down with it —
   * a user who cannot be bucketed sees the shipped paywall, which is exactly
   * what they saw before this feature existed. Throwing here would turn a
   * degraded dependency into a blank screen in front of the purchase flow.
   *
   * PII: the number is handed straight to `resolvePaywallId` and never stored or
   * logged — note the catch below records the user id and the failure, never the
   * phone. The country code is not read at all: the bucket is the last two
   * digits, so a prefix cannot affect it.
   */
  private async readPhoneNumber(userId: string): Promise<string | null> {
    try {
      const user = await performServiceCall(
        "users",
        (u) => u.getUserPublic(userId),
        "paywall:variant",
        "failed to read user for paywall bucketing"
      );
      return user?.phoneNumber ?? null;
    } catch {
      log.warn(
        { user_id: userId },
        "could not read phone for paywall bucketing; serving the default paywall"
      );
      return null;
    }
  }

  /**
   * Every enabled ad-group treatment, indexed by ad group — cached.
   *
   * The paywall's hot path must not pay a query per request for a table that
   * changes when a marketer clicks Save. One `SELECT` per five minutes (or per
   * CMS write, whichever comes first) serves every caller, and an EMPTY result
   * is the short-circuit that keeps an unconfigured deployment free: no rows
   * means no ad group could ever match, so the outbound referral lookup below
   * is never made.
   *
   * A failed read is cached as an EMPTY index, not left uncached. A database
   * that is refusing connections would otherwise get one retry per paywall open
   * from every task at once, and the answer we would serve while retrying is
   * the same either way — the unmodified paywall.
   */
  private async loadOverrideIndex(): Promise<ReadonlyMap<string, PaywallOverride>> {
    const cached =
      this.overrideIndexCache.get<ReadonlyMap<string, PaywallOverride>>(OVERRIDE_INDEX_CACHE_KEY);
    if (cached !== undefined) return cached;

    let index = new Map<string, PaywallOverride>();
    try {
      const rows = await this.overrideRepo.findEnabledRows();
      // Narrowed HERE rather than in the repository, which may not import from
      // `services/`. It also means the blob is validated exactly once per cache
      // load instead of once per request.
      index = new Map(rows.map((row) => [row.utmGroup, parsePaywallOverride(row.overrides)]));
    } catch (err) {
      log.warn(
        { err },
        "could not load paywall ad-group overrides; serving unmodified config"
      );
    }
    this.overrideIndexCache.set(OVERRIDE_INDEX_CACHE_KEY, index);
    return index;
  }

  /**
   * The treatment this caller's attribution selects, or `undefined`.
   *
   * Three things keep this cheap enough to sit on the paywall's read path:
   *
   *   1. **No enabled rows skips everything.** `enabled` is filtered in the
   *      QUERY (`findEnabledRows`), which does not even select the column, so a
   *      disabled campaign is absent from the index rather than something the
   *      request path re-checks. An empty index means nothing an attribution
   *      could select, so a deployment with no live campaign makes no outbound
   *      call at all — which is also the whole off switch: disabling every row
   *      in the CMS returns this endpoint to exactly its pre-feature behaviour,
   *      taking effect on the next request rather than on a task restart.
   *   2. **The ad group is cached per user, negatives included.** "This user is
   *      organic" is the common answer and must not re-ask upstream on every
   *      paywall open. A cached `null` is a HIT, not a miss — `PaywallLruCache`
   *      wraps values so the two stay distinguishable.
   *   3. **It fails soft, twice over.** `fetchLatestUtmGroup` already collapses
   *      every failure to `null`; the catch is belt-and-braces so a future
   *      change there can never turn a degraded referral service into a blank
   *      purchase screen.
   *
   * ⚠️ The ad group is the user's NEWEST attributed touch, which is their FIRST
   * only when they have had one. `/referral/v1/<user>/latest` returns a single
   * row and carries no id for the oldest, and this database stores only
   * `User.firstUtmReportedAt` — the once-only event guard — never the value. So
   * a returning user who clicks a second ad matches the SECOND ad group. Making
   * it truly first-touch means persisting the group at capture time and reading
   * the column here; nothing else in this file would change.
   */
  private async resolveOverride(
    userId: string | undefined
  ): Promise<PaywallOverride | undefined> {
    if (userId === undefined) return undefined;

    const index = await this.loadOverrideIndex();
    if (index.size === 0) return undefined;

    const cacheKey = `utmgroup:${userId}`;
    let utmGroup = this.utmGroupCache.get<string | null>(cacheKey);
    if (utmGroup === undefined) {
      utmGroup = null;
      try {
        utmGroup = await fetchLatestUtmGroup(userId);
      } catch {
        log.warn(
          { user_id: userId },
          "could not read ad attribution for the paywall; serving unmodified config"
        );
      }
      // A miss is cached too, which is what bounds the damage when the referral
      // service is down: one lookup per user per TTL, not one per request.
      this.utmGroupCache.set(cacheKey, utmGroup);
    }

    return utmGroup === null ? undefined : index.get(utmGroup);
  }

  async getPaywallConfig(input: {
    paywallId?: string;
    locale: string;
    userId?: string;
    appVersion?: unknown;
  }): Promise<PaywallConfigResponseData> {
    // Resolved BEFORE the paywall id, because it DECIDES the paywall id.
    // Applied after the cache read — the override is per-user and must never
    // reach the shared `(paywallId, locale)` entry, which is why
    // `applyPaywallOverride` copies rather than mutates.
    //
    // An EXPLICIT `paywallId` opts out entirely: overrides exist to redress the
    // default paywall for a campaign, and patching a caller-named one would let
    // a campaign's creative leak onto a paywall it was never signed off against.
    // No production caller passes it — the parameter is retained for tests — so
    // this is a guard, not a behaviour.
    const override =
      input.paywallId === undefined
        ? await this.resolveOverride(input.userId)
        : undefined;

    // An explicit `paywallId` wins — it is the internal/test override.
    //
    // ── AN AD GROUP REPLACES THE A/B TEST, IT DOES NOT LAYER ON IT ─────────
    // A user who arrived from a configured ad group is served the DEFAULT
    // paywall shell, whatever bucket their phone number falls in, and the
    // campaign's media and copy are patched onto that. Layering the two would
    // mean the campaign's video landing inside `video_bleed` for one quarter of
    // arrivals and `icon_grid` for another — the creative was signed off against
    // one screen, and an ad that renders four different ways is neither a
    // working campaign nor a readable experiment.
    //
    // Skipping the bucket also skips `resolveVariantPaywallId`'s user read, so
    // the ad path costs one query LESS than the organic one, and it inherits the
    // default paywall's freedom from the `minAppVersion` gate — `card_hero` is
    // the screen every build already contains, so no campaign can outrun the
    // installed base.
    //
    // Everyone else buckets on their phone exactly as before.
    const paywallId =
      input.paywallId ??
      (override !== undefined
        ? DEFAULT_PAYWALL_ID
        : await this.resolveVariantPaywallId(input.userId, input.appVersion));
    const requestedLocale = input.locale;
    const cacheKey = keyForResponse(paywallId, requestedLocale);

    const cached =
      this.responseCache.get<PaywallConfigResponseData>(cacheKey);
    if (cached !== undefined) {
      log.info(
        {
          source: "cache",
          paywall_id: paywallId,
          config_version: cached.configVersion,
          locale_requested: requestedLocale,
          locale_served: cached.localeServed,
          fallback_used: cached.fallbackUsed,
          missing_fields: cached.missingFields,
        },
        "paywall config served from cache"
      );
      return applyPaywallOverride(cached, override);
    }

    const config = await this.provider.getConfig({ paywallId });
    if (!config) {
      // The seed script guarantees `vip-membership-v1` exists in every env.
      // A missing row is a bug (bad seed / wrong env) — surface as 500 so
      // ops notice, rather than pretending "disabled" to the client.
      throw new AppError(
        `Paywall '${paywallId}' has no config row`,
        500,
        "PAYWALL_CONFIG_MISSING"
      );
    }

    const localesToTry = uniqueFallbackChain(requestedLocale);

    // Fetch every slice for every locale in one pass. Provider cache hits
    // the second locale onward when they overlap across resolutions.
    const translationsByLocale = new Map<string, Awaited<ReturnType<
      PaywallConfigProvider["getTranslation"]
    >>>();
    const legalByLocale = new Map<string, Awaited<ReturnType<
      PaywallConfigProvider["getLegalLinks"]
    >>>();
    const plansByLocale = new Map<string, RawPlan[]>();
    const benefitsByLocale = new Map<string, RawBenefit[]>();
    const heroByLocale = new Map<string, RawHeroMedia[]>();

    for (const locale of localesToTry) {
      // Sequential across locales is fine — the provider caches raw rows so
      // overlapping locales don't hit the DB twice, and the chain is at
      // most 3 entries deep.
      const [translation, legal, plans, benefits, hero] = await Promise.all([
        this.provider.getTranslation({ paywallId, locale }),
        // Legal links are canonical, never per-variant: privacy/terms/refund are
        // the same legal documents whichever screen you were shown, and reading
        // them from the variant would serve EMPTY policy URLs the moment a
        // variant has no rows of its own — a legal defect dressed up as a
        // missing translation.
        this.provider.getLegalLinks({ paywallId: DEFAULT_PAYWALL_ID, locale }),
        // Plans (and therefore price) always come from the canonical paywall;
        // only the copy is variant-scoped. See the repository docblock.
        this.provider.getEnabledPlans({
          paywallId: DEFAULT_PAYWALL_ID,
          locale,
          variantPaywallId: paywallId,
        }),
        this.provider.getEnabledBenefits({ paywallId, locale }),
        this.provider.getHeroMedia({ paywallId, locale }),
      ]);
      translationsByLocale.set(locale, translation);
      legalByLocale.set(locale, legal);
      plansByLocale.set(locale, plans);
      benefitsByLocale.set(locale, benefits);
      heroByLocale.set(locale, hero);
    }

    const missingFields: string[] = [];

    // Resolve top-level translation (video, title, ctas).
    const translationResolved = resolveWithFallback(
      localesToTry,
      (locale) => translationsByLocale.get(locale) ?? null
    );
    if (
      translationResolved.value !== null &&
      translationResolved.locale !== requestedLocale
    ) {
      missingFields.push("translation");
    }

    // Resolve legal links.
    const legalResolved = resolveWithFallback(
      localesToTry,
      (locale) => legalByLocale.get(locale) ?? null
    );
    if (
      legalResolved.value !== null &&
      legalResolved.locale !== requestedLocale
    ) {
      missingFields.push("legalLinks");
    }

    // Resolve plans: use the enabled-plan list from the requested locale
    // as the master list (plan enabled state is locale-independent) and
    // walk the fallback chain per plan for translations.
    const masterPlans = plansByLocale.get(requestedLocale) ?? [];
    const resolvedPlans: PaywallPlanDisplay[] = [];
    for (const plan of masterPlans) {
      const perPlan = resolvePlanTranslation(
        plan.planId,
        localesToTry,
        plansByLocale
      );
      if (perPlan.value === null) {
        // No translation in any fallback locale — skip the plan from the
        // wire response but record the miss.
        missingFields.push(`plans[${plan.planId}].translation`);
        continue;
      }
      if (perPlan.locale !== requestedLocale) {
        missingFields.push(`plans[${plan.planId}].translation`);
      }
      resolvedPlans.push({
        planId: plan.planId,
        productId: plan.productId,
        period: plan.period,
        localizedLabel: perPlan.value.localizedLabel,
        trialLabel: perPlan.value.trialLabel,
        trialDays: plan.trialDays,
        displayPriceText: perPlan.value.displayPriceText,
        subscriptionDetailText: perPlan.value.subscriptionDetailText,
        sortOrder: plan.sortOrder,
      });
    }

    // Resolve benefits (same shape as plans).
    const masterBenefits = benefitsByLocale.get(requestedLocale) ?? [];
    const resolvedBenefits: PaywallBenefitDisplay[] = [];
    for (const benefit of masterBenefits) {
      const perBenefit = resolveBenefitTranslation(
        benefit.benefitId,
        localesToTry,
        benefitsByLocale
      );
      if (perBenefit.value === null) {
        missingFields.push(`benefits[${benefit.benefitId}].translation`);
        continue;
      }
      if (perBenefit.locale !== requestedLocale) {
        missingFields.push(`benefits[${benefit.benefitId}].translation`);
      }
      resolvedBenefits.push({
        benefitId: benefit.benefitId,
        localizedName: perBenefit.value.localizedName,
        icon: benefit.icon,
        sortOrder: benefit.sortOrder,
      });
    }

    // Resolve the hero down the same fallback chain. An empty list is NOT a
    // resolved value — a locale with no hero rows should keep walking to `hi`
    // then `en` rather than serving a screen with no artwork.
    const heroResolved = resolveWithFallback(localesToTry, (locale) => {
      const rows = heroByLocale.get(locale) ?? [];
      return rows.length > 0 ? rows : null;
    });
    if (heroResolved.value !== null && heroResolved.locale !== requestedLocale) {
      missingFields.push("heroMedia");
    }
    const heroMedia: PaywallHeroMediaDisplay[] = (heroResolved.value ?? []).map((row) => ({
      mediaType: row.mediaType,
      url: row.url,
      thumbnailUrl: row.thumbnailUrl,
      mediaId: row.mediaId,
      sortOrder: row.sortOrder,
    }));

    // The "served locale" for the response is the top-level translation
    // locale (that's what drives title/video/ctas — the biggest visible
    // chunk). If we couldn't resolve a translation at all, we still report
    // the final fallback so the response has a stable non-null string.
    const localeServed =
      translationResolved.locale ??
      legalResolved.locale ??
      FINAL_FALLBACK_LOCALE;
    const fallbackUsed = localeServed !== requestedLocale;
    const fallbackFrom = fallbackUsed ? requestedLocale : null;

    const translation = translationResolved.value;
    const legal = legalResolved.value;

    const response: PaywallConfigResponseData = {
      paywallId,
      configVersion: config.configVersion,
      enabled: config.enabled,
      localeRequested: requestedLocale,
      localeServed,
      fallbackUsed,
      fallbackFrom,
      missingFields,
      title: translation?.title ?? "",
      layout: config.layout,
      heroMedia,
      ...legacyVideoFields(heroMedia),
      defaultPlanId: config.defaultPlanId,
      plans: resolvedPlans,
      benefits: resolvedBenefits,
      legalLinks: {
        privacyPolicyUrl: legal?.privacyPolicyUrl ?? "",
        termsServiceUrl: legal?.termsServiceUrl ?? "",
        refundPolicyUrl: legal?.refundPolicyUrl ?? "",
      },
      cancelAnytimeText: translation?.cancelAnytimeText ?? "",
      refundPolicyText: translation?.refundPolicyText ?? "",
      payNowCta: translation?.payNowCta ?? "",
      shimmerEnabled: config.shimmerEnabled,
    };

    this.responseCache.set(cacheKey, response);

    log.info(
      {
        source: "db",
        paywall_id: paywallId,
        config_version: response.configVersion,
        locale_requested: requestedLocale,
        locale_served: localeServed,
        fallback_used: fallbackUsed,
        fallback_from: fallbackFrom,
        missing_fields: missingFields,
        plan_count: resolvedPlans.length,
        benefit_count: resolvedBenefits.length,
      },
      "paywall config resolved"
    );

    // AFTER `responseCache.set` — the entry that got stored is the unmodified,
    // shareable one.
    return applyPaywallOverride(response, override);
  }

  /**
   * Clear every cached response for `paywallId` (defaults to the singleton
   * `vip-membership-v1`). Test-only + CMS-write hook (Phase 2). No-op when
   * nothing is cached.
   */
  invalidateResponseCache(paywallId: string = DEFAULT_PAYWALL_ID): void {
    const cleared = this.responseCache.deleteByPrefix(
      `response:${paywallId}:`
    );
    log.info(
      { paywall_id: paywallId, entries_cleared: cleared },
      "paywall response cache invalidated"
    );
  }
}

// ---- helpers ---------------------------------------------------------------

/**
 * Patches an ad group's treatment onto an already-composed response.
 *
 * Returns the SAME reference when there is no override, and a COPY otherwise —
 * never a mutation. That is load-bearing: the object handed in may be the
 * shared `(paywallId, locale)` cache entry, which every other caller is served
 * from, so writing through it would leak one campaign to everybody.
 *
 * Only the default paywall's own per-locale content is reachable — one hero
 * asset and the benefit list. `plans`, `defaultPlanId`, `legalLinks`, the four
 * `paywall_translations` copy fields, `layout` and `paywallId` are all left
 * exactly as composed; see `paywall-override.types.ts` for why each is out of
 * scope.
 *
 * COPIES, never mutates. `response` is the entry the response cache shares with
 * every caller on this `(paywallId, locale)`, so the benefit rows in particular
 * are rebuilt as new objects — renaming one in place would rename it for every
 * user, campaign or not.
 */
export function applyPaywallOverride(
  response: PaywallConfigResponseData,
  override: PaywallOverride | undefined
): PaywallConfigResponseData {
  if (override === undefined) return response;

  // Keyed on the locale actually SERVED, not the one requested — the response
  // may already have fallen back, and copy that follows the artwork's language
  // is the point.
  //
  // NO cross-locale fallback, deliberately. `localeServed` is the language the
  // plans, benefits and legal copy on this screen are ALREADY in, so borrowing
  // another locale's block would put an English headline and pay button over a
  // Hindi price list — with `fallbackUsed` still false, because the composer
  // did not fall back. A locale the campaign left blank keeps the CMS copy,
  // which is both the safe outcome and what the `hi`-only direction already did.
  const served = OVERRIDE_LOCALES.find((locale) => locale === response.localeServed);
  const patch = (served === undefined ? undefined : override.locales[served]) ?? {};

  // One row, because the default paywall carries exactly one hero per locale.
  // `sortOrder` is 0 for the same reason — there is nothing to order it against.
  const heroMedia: PaywallHeroMediaDisplay[] =
    patch.media === undefined
      ? response.heroMedia
      : [{ ...patch.media, sortOrder: 0 }];

  // REPLACES the list — a campaign picks which benefits show and in what order,
  // so a patch-by-id merge would make "show three of the eight" unexpressible.
  // Each row is a NEW object and `sortOrder` comes from the array index, which
  // is what makes the order the editor sees the order the app renders.
  const benefits: PaywallBenefitDisplay[] =
    patch.benefits === undefined
      ? response.benefits
      : patch.benefits.map((benefit, index) => ({
          benefitId: benefit.benefitId,
          icon: benefit.icon,
          localizedName: benefit.name,
          sortOrder: index,
        }));

  log.info(
    {
      paywall_id: response.paywallId,
      locale_served: response.localeServed,
      media_overridden: patch.media !== undefined,
      benefits_overridden: patch.benefits !== undefined,
      benefit_count: benefits.length,
    },
    "ad-group override applied to paywall config"
  );

  return {
    ...response,
    heroMedia,
    // Re-derived, never set independently: shipped APKs read these three and
    // they must keep agreeing with the hero the newer builds render.
    ...legacyVideoFields(heroMedia),
    benefits,
  };
}

/**
 * Build the fallback locale chain (order-preserving, de-duplicated).
 * `requested → hi → en`. When the requested locale is `hi` or `en`, the
 * chain collapses to the tail — the requested locale still appears at
 * position 0 so the `localeServed === requested` check stays correct.
 */
export function uniqueFallbackChain(requested: string): string[] {
  const chain = [requested, "hi", FINAL_FALLBACK_LOCALE];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const locale of chain) {
    if (seen.has(locale)) continue;
    seen.add(locale);
    out.push(locale);
  }
  return out;
}

function resolveWithFallback<T>(
  locales: readonly string[],
  lookup: (locale: string) => T | null
): { value: T | null; locale: string | null } {
  for (const locale of locales) {
    const value = lookup(locale);
    if (value !== null) return { value, locale };
  }
  return { value: null, locale: null };
}

function resolvePlanTranslation(
  planId: string,
  locales: readonly string[],
  plansByLocale: Map<string, RawPlan[]>
): { value: RawPlanTranslation | null; locale: string | null } {
  for (const locale of locales) {
    const list = plansByLocale.get(locale) ?? [];
    const found = list.find((p) => p.planId === planId);
    if (found?.translation) {
      return { value: found.translation, locale };
    }
  }
  return { value: null, locale: null };
}

function resolveBenefitTranslation(
  benefitId: string,
  locales: readonly string[],
  benefitsByLocale: Map<string, RawBenefit[]>
): { value: RawBenefitTranslation | null; locale: string | null } {
  for (const locale of locales) {
    const list = benefitsByLocale.get(locale) ?? [];
    const found = list.find((b) => b.benefitId === benefitId);
    if (found?.translation) {
      return { value: found.translation, locale };
    }
  }
  return { value: null, locale: null };
}

/** Exported for tests + parity with the provider's key helpers. */
export function keyForResponse(paywallId: string, locale: string): string {
  return `response:${paywallId}:${locale}`;
}

/**
 * Project `heroMedia` back onto the three flat video fields shipped APKs read
 * (TAM-159).
 *
 * These are the ONLY hero fields builds before the layouts release understand,
 * and they are required on the wire — a missing key makes the generated Dart
 * `fromJson` return null, which `PaywallRepository` turns into
 * `throw ApiException('Malformed response')`, i.e. an error screen instead of a
 * paywall. So they are derived, never dropped.
 *
 * The rules mirror what the shipped screen already does with them:
 *   - a video hero → the video, with its poster as the thumbnail;
 *   - an image-only hero (P-1/P-3/P-4) → no video, and the FIRST image lands in
 *     `videoThumbnailUrl`, which is exactly the field that screen falls back to
 *     rendering as a still when `videoUrl` is null;
 *   - no hero at all → all three null, the same nulls an empty locale produced
 *     before this change.
 *
 * Derived from `heroMedia` rather than from the flat DB columns on purpose:
 * `paywall_hero_media` is the single source of truth, and reading the old
 * columns here would resurrect the two-writers problem the migration removed.
 */
export function legacyVideoFields(heroMedia: readonly PaywallHeroMediaDisplay[]): {
  videoUrl: string | null;
  videoThumbnailUrl: string | null;
  videoId: string | null;
} {
  const video = heroMedia.find((m) => m.mediaType === "video");
  if (video) {
    return {
      videoUrl: video.url,
      videoThumbnailUrl: video.thumbnailUrl,
      videoId: video.mediaId,
    };
  }
  const image = heroMedia.find((m) => m.mediaType === "image");
  if (image) {
    return {
      videoUrl: null,
      videoThumbnailUrl: image.url,
      videoId: image.mediaId,
    };
  }
  return { videoUrl: null, videoThumbnailUrl: null, videoId: null };
}
