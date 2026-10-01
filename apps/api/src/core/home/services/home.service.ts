import { performServiceCall } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { resolveLocalizedLabel } from "@api/shared/i18n";
import { mediaUrl } from "@api/shared/schemas";
import { buildPage, decodeCursor, type CursorKey } from "@api/shared/pagination";
import {
  epochStartIso,
  getOrBuildCached,
  cursorNamesPair,
  feedAlgorithmLogFields,
  interleaveByType,
  resolveFeedAlgorithm,
  rotate,
  rotationPage,
  weave,
  NO_DEITY_PAIR,
  type DeityPair,
  type RotationCandidate,
} from "@api/shared/rotation";
import {
  HOME_FEED_SLOTS,
  HOME_OTHER_CONTENT_TYPES,
  HOME_POOL,
} from "./home.slots.js";
import {
  analyticsEventsClient,
  FEED_ANALYTICS_EVENT,
  SYSTEM_ACTOR_ID,
} from "@api/shared/analytics";
import { evaluateAbtest } from "@api/shared/abtest";
import type {
  HomeRepository,
  HomeBannerRow,
  HomeFeedRow,
  HomeShortcutRow,
} from "@api/core/home/repositories";
import {
  HOME_CONTENT_TYPE,
  type ContentFeedCardInput,
  type FeedBadge,
  type FeedContentType,
  type HomeBanner,
  type HomeFeedItem,
  type HomeFeedPage,
  type HomeLikeResult,
  type HomeShareResult,
  type HomeShortcut,
  type HomeShortcutTheme,
  type HomeViewResult,
} from "@api/core/home/types";
import type { ContentFeedCardData } from "@api/core/home/repositories";
import { semverGte } from "@api/shared/version";
import {
  HOME_GRID_VARIANT_CONTROL,
  resolveHomeGridVariant,
} from "./home.buckets.js";

const log = createModuleLogger("home:service");

/**
 * The shortcut-grid experiment's surface key on the shared abtesting service
 * (TAM-174).
 *
 * This is an **apiId**, not an experimentId — the distinction matters. The apiId
 * is OURS: a stable identifier for the surface, hardcoded here, and the only
 * identifier we ever send. The experimentId is the CONSOLE's: many experiments
 * may run against this one apiId over its lifetime, and the service reports
 * which one answered in a field our client deliberately leaves unparsed. Naming
 * an experimentId in this repo would couple a deploy to a console object and
 * break the moment that experiment is superseded.
 */
export const HOME_GRID_ABTEST_API_ID = "home.shortcut_grid";

/** Per-content-kind CTA button copy for an auto-generated feed card. */
const CTA_LABEL: Record<FeedContentType, string> = {
  wallpaper: "Set Wallpaper",
  status: "Share Status",
  aarti: "Play Aarti",
  mantra: "Play Mantra",
  ringtone: "Set Ringtone",
};

/**
 * Map a content item's facts to a full Home-feed card. Home owns everything the
 * caller doesn't supply: the CTA (a `content_detail` deep-link by slug), the
 * side-car `ctaContentId` (the underlying content UUID, used by the app to
 * build the by-id deep-link into the play screen), and the share metadata.
 * Auto-cards carry no `trendingScore` (they live in the default id-ordered
 * segment, not the trending one), and the slug is deterministic so re-writes
 * upsert the same card.
 *
 * `ctaDestinationValue` stays as the human-readable slug (unchanged wire
 * shape). `ctaContentId` is the id used by the mobile deep-link routes
 * (`/aarti-bhajans/audio/:audioId`, `/mantras/audio/:itemId`, …) and the
 * downstream `GET /aarti/audios/:id` / `GET /mantras/items/:id` lookups,
 * neither of which has a slug fallback. Admin-authored `content_detail`
 * cards don't populate it — the app then falls back to opening the module
 * home instead of 404-ing on a slug.
 */
function buildContentFeedCard(input: ContentFeedCardInput): ContentFeedCardData {
  return {
    slug: `feed-${input.contentType}-${input.contentSlug}`,
    contentType: input.contentType,
    module: input.contentType,
    // TAM-175 — carried through verbatim from the source content. Home does not
    // resolve, validate or default it: the producing module owns which deity its
    // content belongs to, and a null there is a real answer ("no god"), not a
    // gap for this function to fill in.
    deitySlug: input.deitySlug,
    // TAM-176 — carried through, never defaulted: the producing module owns
    // whether its content is live, and the card must not outlive it.
    isActive: input.isActive,
    title: input.title,
    heroImageUrl: input.heroImageUrl,
    audioPreviewUrl: input.audioPreviewUrl ?? null,
    ctaLabel: CTA_LABEL[input.contentType],
    ctaDestinationType: "content_detail",
    ctaDestinationValue: input.contentSlug,
    ctaContentId: input.contentId,
    headerDestinationModule: input.contentType,
    shareTitle: input.title,
    shareText: `${input.title} — Prabhuji`,
    shareDeepLink: `https://prabhuji.app/${input.contentType}/${input.contentSlug}`,
    shareThumbnailUrl: input.heroImageUrl,
  };
}

/**
 * TAM-175 — everything one refresh epoch needs, from one catalogue read.
 *
 * `any` is the ordinary mixed feed. `pools` is keyed `"<contentType>|<deitySlug>"`
 * — a flat record rather than a nested map because this is JSON in Redis, shared
 * between processes, and a flat shape survives the round trip without a revive
 * step.
 */
interface HomePlanBundle {
  any: string[];
  pools: Record<string, string[]>;
}

/**
 * Shape guard for a bundle read back from Redis. Required by `getOrBuildCached`
 * because a stored value may have been written by an older deploy with a
 * different shape; a mismatch is treated as a miss and rebuilt, never trusted
 * into a page.
 */
function isHomePlanBundle(value: unknown): value is HomePlanBundle {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as HomePlanBundle;
  if (!isIdList(candidate.any)) return false;
  if (typeof candidate.pools !== "object" || candidate.pools === null) return false;
  return Object.values(candidate.pools).every(isIdList);
}

function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === "string");
}

/** Resolved engagement for a batch of ids (counts + this-user like set). */
interface EngagementBatch {
  counts: Record<
    string,
    { likeCount: number; viewCount: number; shareCount: number }
  >;
  liked: Set<string>;
}

/**
 * Home business logic (TAM-61) — Prisma-free. Serves the discovery surface:
 *
 *   1. Banners — active rows in curated `sort_order`. Contract guards applied
 *      defensively on the way out: `informational` rows are non-navigable
 *      (`destinationValue = null`); `pro_paywall` rows force
 *      `isProFeatureDiscovery = true`. An empty banner set returns `[]` (200) —
 *      the client hides the section (PRD §8, §16).
 *
 *   1b. Shortcuts — the feature-shortcut grid: active rows in curated
 *      `sort_order`. Labels + order are CMS-owned (they used to be an app
 *      constant). The SAME destination contract guards as banners are applied on
 *      the way out; `destinationValue` is always a stable allowlist KEY, never a
 *      URL (the client resolves it, unknown ⇒ no-op).
 *
 *   2. Feed — a mixed, cursor-paginated feed. Default order is a stable
 *      id-ordered shuffle (`id` ASC). When the store-level `feedTrendingFirst`
 *      flag is on, items with a non-null `trendingScore` lead (`trendingScore`
 *      DESC) then the remaining id-ordered items — mixed content types PRESERVED
 *      (never grouped by `contentType`). A single opaque composite cursor pages both modes; a
 *      malformed cursor throws `ValidationError` (→ 400, never 500). Each card is
 *      enriched with engagement counts + `likedByMe` in ONE batched facade call
 *      per page, keyed on the shared engagement table under contentType
 *      `home_item` (the feed card is its own engageable entity).
 *
 *   3. Engagement writes — like (toggle) / view / share are thin FORWARDERS to
 *      the shared TAM-57 EngagementService (this module never counts). The client
 *      supplies `(contentType, contentId)`; Home validates the vocabulary at its
 *      Zod boundary and forwards the JWT subject as the identity.
 *
 * RANKING NEVER BRANCHES ON PRO/FREE (PRD §5, §10) — no subscription facade is
 * consulted anywhere in this module. Only `likedByMe` is per-user.
 */
export class HomeService {
  constructor(private readonly repo: HomeRepository) {}

  /**
   * Auto-feed: upsert a Home-feed card for a content item (called via the facade
   * by content modules on create/update). Idempotent on the deterministic slug,
   * so a re-import or an edit refreshes the same card rather than duplicating.
   */
  async upsertContentFeedCard(input: ContentFeedCardInput): Promise<void> {
    await this.repo.upsertContentFeedCard(buildContentFeedCard(input));
    log.info(
      { event: "feed_autocard", content_type: input.contentType, slug: input.contentSlug },
      "home feed card synced from content"
    );
  }

  // ---- banners ------------------------------------------------------------

  /**
   * `GET /home/banners` — active banners in curated order. Empty set → `[]`
   * (200). Applies the `informational` / `pro_paywall` contract guards. The
   * overlay `title` is localized for the requested locale (TAM-113); an absent
   * `locale` resolves to the base column (non-breaking).
   */
  async getBanners(params: { locale?: string } = {}): Promise<{
    banners: HomeBanner[];
  }> {
    const rows = await this.repo.listActiveBanners(params.locale);
    const banners = rows.map((row) => toBanner(row, params.locale));
    log.info(
      { event: "home_banners", count: banners.length },
      "home banners assembled"
    );
    return { banners };
  }

  // ---- shortcuts ----------------------------------------------------------

  /**
   * `GET /home/shortcuts` — the active feature-shortcut tiles in curated order.
   * Empty set → `[]` (200); the client falls back to hiding the grid. Applies the
   * same `informational` / `pro_paywall` destination guards as banners. The
   * `label` is localized for the requested locale (TAM-113); absent ⇒ base column.
   *
   * TAM-132 backwards-compat gate — a row's `minAppVersion` (when non-null)
   * hides it from any caller whose `app_version` header parses BELOW it.
   * Missing / empty / malformed `appVersion` = "very old client" ⇒ every gated
   * row is dropped. `minAppVersion` is DELIBERATELY NOT projected on the wire
   * — the mapping layer (`toShortcut`) drops it; the mobile client never has
   * to know the server-side rule exists.
   */
  async getShortcuts(
    params: { locale?: string; appVersion?: string; userId?: string } = {}
  ): Promise<{ shortcuts: HomeShortcut[] }> {
    const [rows, settings] = await Promise.all([
      this.repo.listActiveShortcuts(params.locale),
      this.repo.getSettings(),
    ]);
    const visible = rows.filter((row) => semverGte(params.appVersion, row.minAppVersion));

    // The kill switch short-circuits BEFORE the ladder: switching the experiment
    // off must never depend on the abtest service being reachable.
    const variant = settings.shortcutGridGradientEnabled
      ? await this.resolveGridVariant(params.userId)
      : null;
    // Control is a REAL arm with its own CMS row, not the absence of one — the
    // experiment ships a complete tile per arm (own artwork, copy and palette),
    // so "no experiment" and "control arm" are different lookups.
    const arm = variant ?? HOME_GRID_VARIANT_CONTROL;

    // The ARM id, not a boolean: the variant row is looked up by it, so an arm
    // the console names but this deployment has no rows for simply inherits the
    // base tile rather than erroring.
    const shortcuts = visible.map((row) =>
      toShortcut(row, params.locale, arm, params.appVersion)
    );
    log.info(
      {
        event: "home_shortcuts",
        count: shortcuts.length,
        // The gate ran when at least one row is filterable; log only the
        // gate-relevant counters so we can trace old-client rollout behaviour
        // without spamming per-request lines with every row's version.
        filtered_out: rows.length - visible.length,
        // TAM-174 — the ARM, never the bucket. A salted digest of a uuid is not
        // reversible, but the arm is the only dimension rollout tracing needs
        // and the bucket would add nothing to it.
        grid_variant: arm,
        grid_experiment_enabled: settings.shortcutGridGradientEnabled,
      },
      "home shortcuts assembled"
    );
    return { shortcuts };
  }

  /**
   * Which shortcut-grid arm this user is in: the shared abtesting service first,
   * the in-process bucket map on ANY client failure or unconfigured env
   * (TAM-174). The same ladder `ChatService.resolveVariant` and
   * `PaywallService.resolveAssignedPaywallId` run, for the same reasons.
   *
   * `inExperiment: false` is the one nuance, and it mirrors chat's rule exactly:
   * a `gridVariant` key in the service's api-default is an EXPLICIT console
   * answer — a string hands every out-of-experiment user that arm, anything else
   * (null included) is control for them. WITHOUT the key it reads as "nothing
   * configured for home there yet" and falls back in-process, so wiring the
   * credentials before seeding experiments moves nobody.
   *
   * `appVersion` is deliberately NOT forwarded. The service re-checks targeting
   * on sticky evaluations, and the tile-level backwards-compat story is already
   * handled by `minAppVersion` above — an app-version rule here would only add a
   * second, invisible gate that could flap.
   *
   * Never throws: `evaluateAbtest` collapses every failure to `null`, and the
   * in-process map is total.
   */
  private async resolveGridVariant(userId: string | undefined): Promise<string | null> {
    // No subject, no experiment. `/home/shortcuts` is `authMiddleware`-guarded so
    // this is not a reachable user state, but sending an empty `subjectId` would
    // ask the service to bucket "" — a real answer to a meaningless question,
    // and one it would then persist as a sticky assignment.
    if (userId === undefined || userId.trim() === "") return null;

    const evaluation = await evaluateAbtest(userId, HOME_GRID_ABTEST_API_ID);
    if (evaluation === null) return resolveHomeGridVariant(userId);
    if (evaluation.inExperiment) return evaluation.variantId;
    const defaults = evaluation.defaultConfig;
    if (defaults !== null && "gridVariant" in defaults) {
      return typeof defaults.gridVariant === "string" ? defaults.gridVariant : null;
    }
    return resolveHomeGridVariant(userId);
  }

  // ---- feed ---------------------------------------------------------------

  /**
   * `GET /home/feed` — one page of the mixed feed.
   *
   * Default: the ROTATED order (TAM-150) — each content type rotated over its
   * own catalogue for the current refresh epoch, then interleaved so no type
   * clumps. The epoch rides in the cursor, so a 00:00/12:00 refresh landing
   * mid-scroll cannot reorder a page the user is already on; it applies on the
   * next cold start.
   *
   * `feedTrendingFirst` (the CMS override) keeps the original keyset ordering
   * untouched — when ops has hand-ranked the feed, a shuffle would fight them.
   *
   * Either way the page is enriched with engagement counts + `likedByMe`.
   */
  async getFeed(params: {
    userId: string;
    cursor?: string;
    limit: number;
    locale?: string;
  }): Promise<HomeFeedPage> {
    const { userId, cursor, limit, locale } = params;
    const { feedTrendingFirst } = await this.repo.getSettings();
    if (feedTrendingFirst) {
      return this.getTrendingFirstFeed(params);
    }

    // TAM-173: overlay ACTIVE pins on the rotation plan. Read is one indexed
    // query returning a handful of rows; the plan cache is UNTOUCHED (its key
    // stays `(epoch, catalogue)`) so pin churn never busts it. Empty pins ⇒
    // response byte-identical to the pre-TAM-173 path.
    const activePins = await performServiceCall(
      "pinnedContent",
      (api) => api.getActivePinnedIds({ surface: "home", atMs: Date.now() }),
      "home:pins",
      "failed to load pinned content"
    );
    const pinnedIds = activePins.map((p) => p.contentId);

    // TAM-180 — which ALGORITHM this session gets, decided by the shared
    // abtesting service ONLY when the cursor cannot name the pair (page one,
    // an unreadable cursor, or one minted before TAM-175). A cursor page is
    // reproduced from its pinned `{d1, d2}` — a pinned null stays null — so
    // neither the service nor the preference is consulted again, and an arm
    // can never flip a session already open.
    const decision = cursorNamesPair(cursor) ? null : await resolveFeedAlgorithm(userId);
    // TAM-175 — the user's two gods drive the slot map. Resolved before paging
    // so the pair can be pinned into the cursor. The OLD algorithm is the weave
    // with an EMPTY pair (byte-identical to the plain rotation), so the control
    // arm simply skips the preference.
    const deities =
      decision?.algorithm === "deity_split" ? await this.resolveDeities(userId) : NO_DEITY_PAIR;

    const page = await rotationPage({
      // Per-user order ⇒ not cached here. The POOLS it composes are cached as
      // one bundle per epoch (`buildPlanBundle`), so the catalogue is still read
      // twice a day for the whole fleet.
      key: null,
      cursor,
      limit,
      buildPlan: (epoch, pair) => this.buildWovenFeedPlan(epoch, pair),
      hydrate: (ids) => this.repo.findFeedByIds(ids, locale),
      pinnedIds,
      deities,
    });
    const eng = await this.buildEngagement(
      userId,
      page.items.map((r) => r.id)
    );

    log.info(
      {
        event: "home_feed",
        user_id: userId,
        items: page.items.length,
        refresh_epoch: page.epoch,
        trending_first: false,
        deity_main: deities.primary,
        deity_second: deities.secondary,
        ...feedAlgorithmLogFields(decision),
        pin_count: pinnedIds.length,
      },
      "home feed assembled"
    );
    return {
      items: page.items.map((r) => this.toFeedItem(r, eng, locale)),
      nextCursor: page.nextCursor,
    };
  }

  /** The CMS-ranked ordering mode — unchanged keyset paging over `(trendingScore, id)`. */
  private async getTrendingFirstFeed(params: {
    userId: string;
    cursor?: string;
    limit: number;
    locale?: string;
  }): Promise<HomeFeedPage> {
    const { userId, cursor, limit, locale } = params;
    const afterKey = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.repo.listFeedPage({
      trendingFirst: true,
      limit,
      afterKey,
      locale,
    });
    const page = buildPage(rows, limit, (r) => feedOrderKey(r, true));
    const eng = await this.buildEngagement(
      userId,
      page.items.map((r) => r.id)
    );
    log.info(
      {
        event: "home_feed",
        user_id: userId,
        items: page.items.length,
        trending_first: true,
      },
      "home feed assembled"
    );
    return {
      items: page.items.map((r) => this.toFeedItem(r, eng, locale)),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * The user's two gods, or a pair of nulls. Never throws — see the identical
   * reasoning on `StatusService.resolveDeities`: personalisation is an input to
   * the feed, never a precondition for serving it.
   */
  private async resolveDeities(userId: string): Promise<DeityPair> {
    try {
      const pref = await performServiceCall(
        "users",
        (api) => api.getDeityPreference(userId),
        "home:deities",
        "failed to load deity preference"
      );
      return {
        primary: pref?.primaryDeitySlug ?? null,
        secondary: pref?.secondaryDeitySlug ?? null,
      };
    } catch (err) {
      log.warn(
        { err, event: "home_deity_preference_failed", user_id: userId },
        "deity preference unavailable — serving the unpersonalised feed"
      );
      return { primary: null, secondary: null };
    }
  }

  /**
   * One page's worth of order for this user: take the shared per-epoch bundle
   * and lay its pools into the slot map.
   *
   * Everything expensive happened in `buildPlanBundle` (once per epoch, whole
   * fleet). This is array indexing.
   */
  private async buildWovenFeedPlan(
    epoch: number,
    deities: DeityPair
  ): Promise<string[]> {
    const bundle = await this.getPlanBundle(epoch);

    const poolFor = (contentType: string, slug: string | null): readonly string[] =>
      slug === null ? [] : bundle.pools[`${contentType}|${slug}`] ?? [];

    // The main god's OTHER modules, interleaved so two consecutive
    // "other module" slots don't both land on, say, wallpapers.
    const otherEntries: [string, readonly string[]][] = [];
    for (const contentType of HOME_OTHER_CONTENT_TYPES) {
      const ids = poolFor(contentType, deities.primary);
      // An empty type is OMITTED rather than passed as []: `interleaveByType`
      // rotates block order by the SET of keys present, so an always-empty key
      // would shift the mix for no content.
      if (ids.length > 0) otherEntries.push([contentType, ids]);
    }
    const otherByType = new Map<string, readonly string[]>(otherEntries);

    return weave(
      HOME_FEED_SLOTS,
      new Map<string, readonly string[]>([
        [HOME_POOL.STATUS_MAIN, poolFor("status", deities.primary)],
        [HOME_POOL.STATUS_SECOND, poolFor("status", deities.secondary)],
        [HOME_POOL.OTHER_MAIN, interleaveByType(otherByType, epoch)],
        [HOME_POOL.ANY, bundle.any],
      ])
    );
  }

  /**
   * The shared per-epoch bundle: the ordinary mixed feed PLUS one rotated list
   * per `(contentType, deity)`.
   *
   * ONE cache entry rather than one per pool, because all of them come out of a
   * SINGLE catalogue read. Keyed per pool it would be ~`types × deities` reads
   * per refresh instead of one — the exact cost the plan cache exists to avoid.
   */
  private async getPlanBundle(epoch: number): Promise<HomePlanBundle> {
    return getOrBuildCached(
      `home:bundle:${epoch}`,
      () => this.buildPlanBundle(epoch),
      isHomePlanBundle
    );
  }

  /**
   * Build the bundle for one refresh epoch from one catalogue read.
   *
   * `any` is the pre-existing mixed feed, byte-for-byte: rotate per content
   * type, then interleave. The per-`(contentType, deity)` pools are the same
   * `rotate()` over narrower slices, so a personalised slot and the general feed
   * agree about what "new" and "proven" mean.
   */
  private async buildPlanBundle(epoch: number): Promise<HomePlanBundle> {
    const candidates = await this.repo.listFeedRotationCandidates();
    const scores = await this.loadRotationScores(candidates.map((c) => c.id));

    const byType = new Map<string, RotationCandidate[]>();
    const byTypeDeity = new Map<string, RotationCandidate[]>();
    for (const c of candidates) {
      const candidate: RotationCandidate = {
        id: c.id,
        createdAtMs: c.createdAtMs,
        score: scores.get(c.id) ?? 0,
      };
      const typeBucket = byType.get(c.contentType) ?? [];
      typeBucket.push(candidate);
      byType.set(c.contentType, typeBucket);
      // An untagged card belongs to NO god's pool. It still reaches users
      // through `any`; it must never be silently adopted into someone's
      // personalised slots.
      if (c.deitySlug !== null) {
        const key = `${c.contentType}|${c.deitySlug}`;
        const deityBucket = byTypeDeity.get(key) ?? [];
        deityBucket.push(candidate);
        byTypeDeity.set(key, deityBucket);
      }
    }

    const rotated = new Map<string, string[]>();
    const counts: Record<string, number> = {};
    for (const [contentType, items] of byType) {
      const order = rotate(items, epoch);
      rotated.set(contentType, order);
      counts[contentType] = order.length;
    }
    const any = interleaveByType(rotated, epoch);

    const pools: Record<string, string[]> = {};
    for (const [key, items] of byTypeDeity) {
      pools[key] = rotate(items, epoch);
    }

    this.emitRefreshEvent(epoch, counts);
    log.info(
      {
        event: "feed_refresh",
        refresh_epoch: epoch,
        items: any.length,
        counts,
        deity_pools: Object.keys(pools).length,
      },
      "home feed rotation plan built"
    );
    return { any, pools };
  }

  /**
   * Action-click weight per feed card, from the shared engagement counters. A
   * share is the strongest signal (the user pushed it to someone else), a view
   * the weakest. Used ONLY to pick which proven items resurface.
   */
  private async loadRotationScores(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const counts = await performServiceCall(
      "engagement",
      (api) => api.getCounts({ contentType: HOME_CONTENT_TYPE, contentIds: ids }),
      "home:rotation",
      "failed to load engagement counts for rotation"
    );
    return new Map(
      Object.entries(counts).map(([id, c]) => [
        id,
        c.shareCount * 3 + c.likeCount * 2 + c.viewCount,
      ])
    );
  }

  /**
   * `bk_feed_refresh_triggered` — fired once per refresh epoch, when the new
   * order is computed. Best-effort: an analytics outage must never fail a feed
   * read.
   *
   * `insert_id` is keyed on the epoch, so the N instances that each build the
   * same plan dedupe to ONE row in the warehouse.
   */
  private emitRefreshEvent(epoch: number, counts: Record<string, number>): void {
    void analyticsEventsClient
      .send([
        {
          event_type: FEED_ANALYTICS_EVENT.REFRESH_TRIGGERED,
          // Server-produced events carry no end user; the collector requires an
          // identity of at least 5 chars, so the producer names itself.
          user_id: SYSTEM_ACTOR_ID.FEED_ROTATION,
          insert_id: `feed_refresh:${epoch}`,
          event_properties: {
            refresh_id: String(epoch),
            refresh_time: epochStartIso(epoch),
            content_type_counts: counts,
          },
        },
      ])
      .catch((err: unknown) => {
        log.warn({ err, refresh_epoch: epoch }, "feed refresh analytics send failed");
      });
  }

  // ---- engagement forwarders ----------------------------------------------

  /**
   * `POST /home/engagement/like` — toggle a like via the shared engagement
   * facade (idempotent per (user, content)). Returns the fresh state. The
   * `contentType` is the caller-supplied, Zod-validated engagement token.
   */
  async toggleLike(
    userId: string,
    contentType: string,
    contentId: string
  ): Promise<HomeLikeResult> {
    const likedIds = await performServiceCall(
      "engagement",
      (api) => api.getUserLikes({ userId, contentType, contentIds: [contentId] }),
      "home:like",
      "failed to resolve like state"
    );
    const alreadyLiked = likedIds.includes(contentId);
    const state = await performServiceCall(
      "engagement",
      (api) =>
        alreadyLiked
          ? api.unlike({ userId, contentType, contentId })
          : api.like({ userId, contentType, contentId }),
      "home:like",
      "failed to toggle like"
    );
    log.info(
      {
        event: "home_feed_like_tapped",
        user_id: userId,
        content_type: contentType,
        content_id: contentId,
        liked: state.liked,
      },
      "home like toggled"
    );
    return { liked: state.liked, likeCount: state.likeCount };
  }

  /**
   * `POST /home/engagement/view` — record a view via the shared engagement
   * facade. The de-dup / visibility-threshold policy is owned by
   * EngagementService (and the 2s client rule, TAM-62) — Home just forwards.
   */
  async recordView(
    userId: string,
    contentType: string,
    contentId: string
  ): Promise<HomeViewResult> {
    const state = await performServiceCall(
      "engagement",
      (api) => api.recordView({ contentType, contentId }),
      "home:view",
      "failed to record view"
    );
    log.info(
      {
        event: "home_feed_item_viewed",
        user_id: userId,
        content_type: contentType,
        content_id: contentId,
      },
      "home view recorded"
    );
    return { viewCount: state.viewCount };
  }

  /**
   * `POST /home/engagement/share` — record a share intent via the shared
   * engagement facade. `channel` is client analytics metadata (the facade counts
   * shares without a channel dimension in Phase 1) — logged, not forwarded.
   */
  async recordShare(
    userId: string,
    contentType: string,
    contentId: string,
    channel?: string
  ): Promise<HomeShareResult> {
    const state = await performServiceCall(
      "engagement",
      (api) => api.recordShare({ contentType, contentId }),
      "home:share",
      "failed to record share"
    );
    log.info(
      {
        event: "home_feed_share_tapped",
        user_id: userId,
        content_type: contentType,
        content_id: contentId,
        channel: channel ?? null,
      },
      "home share recorded"
    );
    return { shareCount: state.shareCount };
  }

  // ---- facade -------------------------------------------------------------

  /** Cross-module summary (Phase-1: active banner count only). */
  async getActiveBannerCount(): Promise<number> {
    const rows = await this.repo.listActiveBanners();
    return rows.length;
  }

  /**
   * Existence check for an active Home-feed item — the write-side gate the
   * pinned-content module (TAM-173) hits before letting a pin land. Delegates
   * to the repository's existing `findFeedItemById` (the same probe the
   * shared engagement gate uses); an inactive or missing row is `false`.
   */
  async hasFeedItem(id: string): Promise<boolean> {
    const row = await this.repo.findFeedItemById(id);
    return row !== null;
  }

  // ---- internals ----------------------------------------------------------

  /**
   * Batch engagement for a feed page — one `getCounts` + one `getUserLikes`
   * call, keyed on the CONSTANT `home_item` contentType with the feed item ids.
   * The feed CARD is its own engageable entity (distinct from the underlying
   * wallpaper/aarti/… content it links to).
   */
  private async buildEngagement(
    userId: string,
    ids: string[]
  ): Promise<EngagementBatch> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return { counts: {}, liked: new Set() };
    const counts = await performServiceCall(
      "engagement",
      (api) => api.getCounts({ contentType: HOME_CONTENT_TYPE, contentIds: uniqueIds }),
      "home:engagement",
      "failed to load engagement counts"
    );
    const likedIds = await performServiceCall(
      "engagement",
      (api) =>
        api.getUserLikes({
          userId,
          contentType: HOME_CONTENT_TYPE,
          contentIds: uniqueIds,
        }),
      "home:engagement",
      "failed to load like state"
    );
    return { counts, liked: new Set(likedIds) };
  }

  private toFeedItem(
    row: HomeFeedRow,
    eng: EngagementBatch,
    locale?: string
  ): HomeFeedItem {
    const c = eng.counts[row.id];
    // Localize the framing labels for the requested locale; each resolves to its
    // base column when there is no override (or `locale` is absent) — preserving
    // nullability for the optional fields (TAM-113).
    const title = resolveLocalizedLabel(
      row.title,
      row.translations,
      locale,
      (t) => t.title
    );
    const subtitle = resolveLocalizedLabel(
      row.subtitle,
      row.translations,
      locale,
      (t) => t.subtitle
    );
    const label = resolveLocalizedLabel(
      row.label,
      row.translations,
      locale,
      (t) => t.label
    );
    const ctaLabel = resolveLocalizedLabel(
      row.ctaLabel,
      row.translations,
      locale,
      (t) => t.ctaLabel
    );
    const localizedBadgeLabel = resolveLocalizedLabel(
      row.badgeLabel,
      row.translations,
      locale,
      (t) => t.badgeLabel
    );
    const badge = resolveBadge(row.badge, localizedBadgeLabel);
    return {
      id: row.id,
      contentType: row.contentType,
      module: row.module,
      title,
      subtitle,
      mediaUrl: row.heroImageUrl,
      audioPreviewUrl: row.audioPreviewUrl,
      ctaLabel,
      ctaDestinationType: row.ctaDestinationType,
      ctaDestinationValue: row.ctaDestinationValue,
      ctaContentId: row.ctaContentId,
      headerDestinationModule: row.headerDestinationModule,
      label,
      badge: badge.badge,
      badgeLabel: badge.badgeLabel,
      likeCount: c?.likeCount ?? 0,
      viewCount: c?.viewCount ?? 0,
      shareCount: c?.shareCount ?? 0,
      likedByMe: eng.liked.has(row.id),
      shareMetadata: {
        title: row.shareTitle,
        text: row.shareText,
        deepLink: row.shareDeepLink,
        thumbnailUrl: row.shareThumbnailUrl,
      },
      trendingScore: row.trendingScore,
    };
  }
}

/**
 * Map a banner row to the wire shape with the contract guards enforced
 * server-side (never trusting stored data):
 *   - `informational` → `destinationValue` is always null (non-navigable);
 *   - `pro_paywall` → `isProFeatureDiscovery` is forced true.
 */
function toBanner(row: HomeBannerRow, locale?: string): HomeBanner {
  const isPaywall = row.destinationType === "pro_paywall";
  // `title` is nullable — the resolver returns the requested-locale override when
  // present, else the (possibly null) base column; nullability is preserved.
  const title = resolveLocalizedLabel(
    row.title,
    row.translations,
    locale,
    (t) => t.title
  );
  return {
    id: row.id,
    mediaType: row.mediaType,
    mediaUrl: row.mediaUrl,
    thumbnailUrl: row.thumbnailUrl,
    title,
    destinationType: row.destinationType,
    destinationValue:
      row.destinationType === "informational" ? null : row.destinationValue,
    isProFeatureDiscovery: isPaywall ? true : row.isProFeatureDiscovery,
    sortOrder: row.sortOrder,
  };
}

/**
 * Map a shortcut row to the wire shape with the SAME contract guards as a banner
 * (never trusting stored data):
 *   - `informational` → `destinationValue` is always null (non-navigable).
 *
 * `destinationValue` is passed through verbatim BY DESIGN: it is a stable KEY the
 * client resolves through its own hardcoded route allowlist (unknown ⇒ no-op), so
 * the server never has to interpret — or sanitize — it as a link.
 */
function toShortcut(
  row: HomeShortcutRow,
  locale?: string,
  arm: string = HOME_GRID_VARIANT_CONTROL,
  appVersion?: string
): HomeShortcut {
  // TAM-174 — the arm's overrides, or nothing. Every field on it is nullable
  // and null means INHERIT, so this is an overlay on the base row rather than a
  // replacement for it.
  //
  // BACKWARDS COMPAT. An arm is dropped ENTIRELY for a client below its
  // `minAppVersion`, rather than partially applied: its artwork, copy and
  // palette are authored together for the layout that ships with it, so half of
  // it on an old card is worse than none. A gated-out client falls back to the
  // base row — byte-for-byte what it renders today — so an API change cannot
  // break a build already in the wild.
  //
  // Reuses `semverGte`, the same tolerant comparison TAM-132's shortcut-level
  // gate uses: a missing, empty or malformed version reads as "very old
  // client", which keeps the failure on the safe side.
  const candidate = row.variants.find((v) => v.variant === arm) ?? null;
  const override =
    candidate !== null && semverGte(appVersion, candidate.minAppVersion) ? candidate : null;
  // `label` is non-null — the resolver returns the override else the base column.
  const label = resolveLocalizedLabel(
    row.label,
    row.translations,
    locale,
    (t) => t.label
  );
  return {
    id: row.id,
    key: row.key,
    // The arm's copy wins over the base row's. Note it also wins over a LOCALE
    // override, which is a known and deliberate limitation while each arm's
    // copy is authored per-arm rather than per-(arm, locale) — see the
    // `label` resolution comment below.
    label: override?.label ?? label,
    destinationType: row.destinationType,
    destinationValue:
      row.destinationType === "informational" ? null : row.destinationValue,
    iconKey: row.iconKey,
    // TAM-132 — nullable; the client's fallback ladder handles null (→ bundled
    // `iconKey` asset → nothing).
    // TAM-174 — the arm's artwork, falling back to the base row's.
    // Filtered through `servableIconUrl` for the same reason the palette is
    // re-checked below: a stored value the wire schema would refuse is a 500,
    // not a missing picture.
    iconUrl: servableIconUrl(override?.iconUrl ?? row.iconUrl),
    // The arm's palette. Control's row normally carries none, so it resolves to
    // `null` and the client paints its shipped gradient — which is what makes
    // the arm a server decision the client never has to reproduce.
    theme: override === null ? null : toShortcutTheme(override),
    sortOrder: row.sortOrder,
  };
}

/**
 * A stored `iconUrl` the public wire can actually carry, else `null`.
 *
 * `HomeShortcutSchema.iconUrl` is `mediaUrl`, and Fastify validates it on the
 * way OUT. A stored value that fails it is therefore NOT a broken picture on
 * one tile — it throws during response serialization and `GET /home/shortcuts`
 * returns 500, blanking the WHOLE grid for every user the row reaches. Dropping
 * it to `null` here costs that one tile its art (the client falls back to its
 * bundled `iconKey` asset, which is exactly what a pre-TAM-132 row does) and
 * keeps the endpoint up.
 *
 * The admin write path is the authoritative gate and validates the same schema,
 * so this should never fire for CMS-authored data. It exists because a row can
 * reach the column WITHOUT passing through it — a seed, a migration carry-over,
 * direct SQL — and because the predicate is ENVIRONMENT-COUPLED: `mediaUrl`
 * accepts `http://` on loopback only while `MEDIA_ALLOW_INSECURE_URLS` is on,
 * so a URL written on a dev box is legal there and unservable on stage. The
 * same "re-check what Postgres cannot enforce" reasoning as `toShortcutTheme`;
 * `home.admin.schemas.ts` makes the mirror-image call on the admin READ side,
 * keeping the bad value visible so ops can fix it.
 */
function servableIconUrl(value: string | null): string | null {
  if (value === null) return null;
  return mediaUrl.safeParse(value).success ? value : null;
}

/**
 * The row's five palette columns as a `HomeShortcutTheme`, or `null`.
 *
 * ALL-OR-NOTHING, re-checked here rather than trusted. `home.admin.service.ts`
 * enforces the invariant on write, but Postgres cannot, so a row touched by
 * direct SQL could arrive with three of five columns set. Publishing that would
 * hand the client a half-gradient it cannot render; treating it as "no theme"
 * degrades the tile to the shipped look, which is the safe direction.
 */
function toShortcutTheme(row: {
  themeBackgroundFrom: string | null;
  themeBackgroundFromStop: number | null;
  themeBackgroundTo: string | null;
  themeBackgroundToStop: number | null;
  themeLabelColor: string | null;
}): HomeShortcutTheme | null {
  const {
    themeBackgroundFrom: from,
    themeBackgroundFromStop: fromStop,
    themeBackgroundTo: to,
    themeBackgroundToStop: toStop,
    themeLabelColor: labelColor,
  } = row;
  if (
    from === null ||
    to === null ||
    labelColor === null ||
    fromStop === null ||
    toStop === null
  ) {
    return null;
  }
  return {
    backgroundFrom: from,
    backgroundFromStop: fromStop,
    backgroundTo: to,
    backgroundToStop: toStop,
    labelColor,
  };
}

/**
 * Resolve a feed card's badge + its CMS-owned display copy, enforcing the wire
 * invariant `badgeLabel !== null ⇔ badge !== null`:
 *   - no badge → no label;
 *   - a badge whose CMS row carries NO label is dropped entirely — an unlabelled
 *     badge cannot be rendered without the client inventing copy, which is
 *     exactly the hardcoding this field exists to remove.
 */
function resolveBadge(
  badge: FeedBadge | null,
  badgeLabel: string | null
): {
  badge: HomeFeedItem["badge"];
  badgeLabel: string | null;
} {
  if (badge === null || badgeLabel === null) {
    return { badge: null, badgeLabel: null };
  }
  return { badge, badgeLabel };
}

/**
 * Stable composite keyset key for a feed row under the active ordering mode.
 *
 * Default (id-ordered) mode → `{ sortOrder: 0, id }`: every row shares the
 * non-negative constant `0`, so the keyset pages purely by `id`.
 *
 * Trending-first mode → a trending row (non-null `trendingScore`) gets a NEGATIVE
 * key `-(trendingScore + 1)` so, ascending, higher scores sort FIRST and every
 * trending row precedes every id-ordered row (whose key sits at the non-negative
 * `0`). The repository reads the sign of the key to know which segment a cursor
 * points into. Content types are never part of the key — the mixed feed is
 * preserved (no grouping).
 */
function feedOrderKey(row: HomeFeedRow, trendingFirst: boolean): CursorKey {
  if (trendingFirst && row.trendingScore !== null) {
    return { sortOrder: -(row.trendingScore + 1), id: row.id };
  }
  return { sortOrder: 0, id: row.id };
}
