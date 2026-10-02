import { performServiceCall } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import {
  cursorNamesPair,
  feedAlgorithmLogFields,
  getOrBuildPlan,
  resolveFeedAlgorithm,
  rotate,
  rotationPage,
  weave,
  NO_DEITY_PAIR,
  type DeityPair,
} from "@api/shared/rotation";
import { STATUS_ALL_SLOTS, STATUS_POOL } from "./status.slots.js";
import { houseCreator, HOUSE_CREATOR_ID } from "@api/core/status/status.creator";
import { AppError } from "@api/shared/errors";
import type {
  StatusRepository,
  StatusRow,
} from "@api/core/status/repositories";
import {
  STATUS_CONTENT_TYPE,
  type OverlaySafeArea,
  type StatusCard,
  type StatusCardPage,
  type StatusLikeResult,
  type StatusPreview,
  type StatusProfile,
  type StatusProfileInput,
  type StatusProfileType,
  type StatusViewResult,
} from "@api/core/status/types";

const log = createModuleLogger("status:service");

/** Locale used to resolve deity display names on feed cards. */
const DEFAULT_LOCALE = "en";

/** Zero overlay safe-area — a defensive fallback for a malformed JSON column. */
const ZERO_SAFE_AREA: OverlaySafeArea = { top: 0, bottom: 0, left: 0, right: 0 };

/** Resolved slug → localized display name lookup for card enrichment. */
type DeityNameMap = Map<string, string>;

/** Resolved engagement for a batch of ids (counts + this-user like set). */
interface EngagementBatch {
  counts: Record<
    string,
    { likeCount: number; viewCount: number; shareCount: number }
  >;
  liked: Set<string>;
}

/**
 * Status Sharing business logic (TAM-71) — Prisma-free. A structural sibling of
 * the wallpaper service, with the same KEY rule: EVERYTHING IS FREE and there is
 * NO server entitlement gate. Every feed media URL is returned to any
 * authenticated user — the ONLY Pro action is the final Share render, enforced
 * CLIENT-SIDE (TAM-72). Responsibilities:
 *   1. Feed — an `id`-ordered keyset page (a stable per-item shuffle now that the
 *      CMS `sort_order` column is dropped), optional deity-slug filter, enriched
 *      with engagement counts + `likedByMe`.
 *   2. Overlay profile — read + upsert. A persona save flips `activeProfileType`
 *      to the saved type (the last saved/selected persona becomes active for
 *      overlay previews). Char limits + Indian mobile are validated upstream in
 *      Zod (`routes/status.schemas.ts`); the service persists what it receives.
 *   3. Overlay template — the single fixed Phase-1 template the client renders.
 *   4. Like toggle + view record delegate to the shared `engagement` facade
 *      (contentType "status"); no local like/view tables.
 *
 * Deity tags reference the TAM-57 taxonomy by SLUG (filter + card display); the
 * feed carries slugs directly (no name resolution needed for the vertical feed).
 */
export class StatusService {
  constructor(private readonly repo: StatusRepository) {}

  // ---- feed ---------------------------------------------------------------

  /**
   * `GET /status/feed` — one page of active status items in the ROTATED order
   * for the current refresh epoch (TAM-150): ~65% of the catalogue shown,
   * reshuffled every 2h, with proven items periodically resurfaced. The epoch
   * rides in the cursor so a refresh never reorders an open session.
   *
   * Optionally narrowed to a single deity slug (TAM-108 single-deity model) and
   * to a `locale` (MEMBERSHIP: the item lists that language, OR lists none =
   * available in all languages) — the rotation runs over the FILTERED catalogue,
   * so each filter combination gets its own plan. An empty deity filter returns
   * an empty page (the client shows the All-Gods recovery). Each card carries
   * its single deity (id + name resolved via the deity facade).
   *
   * `pinnedId` (TAM-166) — when the caller (chat surface) recommends a status,
   * the FIRST page (`cursor == null`) prepends it at position 0 and dedupes any
   * later occurrence in the tail. Subsequent pages IGNORE `pinnedId` so the
   * recommendation never repeats on infinite scroll. Fail-soft: an unknown or
   * filter-excluded id logs a warning and the normal feed is returned unchanged
   * — a stale chat recommendation must not 404 the whole screen. `nextCursor`
   * is always the rotation tail's cursor, so no tail item is ever skipped (the
   * first page may return `limit + 1` items when the pin is not already in the
   * tail — the mobile client renders whatever it receives).
   */
  async getFeed(params: {
    userId: string;
    deityId?: string;
    locale?: string;
    cursor?: string;
    limit: number;
    pinnedId?: string;
  }): Promise<StatusCardPage> {
    const { userId, deityId, locale, cursor, limit, pinnedId } = params;

    // TAM-173: overlay ACTIVE pins. The surface picks the pin cohort — an
    // absent `deityId` (the "all gods" feed) reads `status_all_gods` pins,
    // a present one reads `status_deity` pins scoped to that deity. Pins on
    // the OTHER surface stay hidden here (per spec: a `status_deity` pin is
    // NOT on the all-gods feed). The plan cache is UNTOUCHED.
    const pinSurface: "status_all_gods" | "status_deity" =
      deityId === undefined ? "status_all_gods" : "status_deity";
    const activePins = await performServiceCall(
      "pinnedContent",
      (api) =>
        api.getActivePinnedIds({
          surface: pinSurface,
          deitySlug: deityId,
          atMs: Date.now(),
        }),
      "status:pins",
      "failed to load pinned content"
    );
    const pinnedIds = activePins.map((p) => p.contentId);

    // TAM-175 — the "All" tab is woven from the user's two gods plus the whole
    // catalogue; a deity CHIP is already that god's own list and is left alone
    // (spec §5). Reading the preference only on the All path keeps the chip
    // feed's cost exactly what it was.
    const isAllGods = deityId === undefined;
    // TAM-180 — which ALGORITHM this All-tab session gets, decided by the
    // shared abtesting service ONLY when the cursor cannot name the pair. A
    // cursor page is reproduced from its pinned `{d1, d2}` (a pinned null stays
    // null), so neither the service nor the preference is consulted again and
    // an arm can never flip a session already open. The OLD algorithm is the
    // weave with an EMPTY pair — byte-identical to the plain rotation — so the
    // control arm simply skips the preference.
    const decision =
      isAllGods && !cursorNamesPair(cursor) ? await resolveFeedAlgorithm(userId) : null;
    const deities = !isAllGods
      ? undefined
      : decision?.algorithm === "deity_split"
        ? await this.resolveDeities(userId)
        : NO_DEITY_PAIR;

    const page = await rotationPage({
      // A woven order is per-user, so it is NOT cached here — the POOLS it
      // composes are (see `buildAllGodsPlan`), and weaving them is array
      // indexing. A chip feed keeps its shared, cached plan.
      key: isAllGods ? null : `status:${deityId ?? "*"}:${locale ?? "*"}`,
      cursor,
      limit,
      buildPlan: (epoch, pair) =>
        isAllGods
          ? this.buildAllGodsPlan(epoch, pair, locale)
          : this.buildRotationPlan(epoch, deityId, locale),
      hydrate: (ids) => this.repo.findByIds(ids),
      pinnedIds,
      deities,
    });

    // First-page-only pin resolution. `cursor == null` gates it so the pin
    // never repeats on subsequent scroll pages.
    const pinRow =
      !cursor && pinnedId
        ? await this.resolvePin(pinnedId, deityId, locale)
        : null;

    const rows: StatusRow[] = pinRow
      ? [pinRow, ...page.items.filter((r) => r.id !== pinRow.id)]
      : page.items;

    const eng = await this.buildEngagement(
      userId,
      rows.map((r) => r.id)
    );
    const names = await this.resolveDeityNames(rows);

    log.info(
      {
        event: "status_feed",
        user_id: userId,
        items: rows.length,
        deity_id: deityId,
        refresh_epoch: page.epoch,
        // TAM-175 — the arms of the split, for rollout tracing. Slugs, not user
        // state: they are CMS identifiers, not anything personal.
        deity_main: deities?.primary ?? null,
        deity_second: deities?.secondary ?? null,
        ...(isAllGods ? feedAlgorithmLogFields(decision) : {}),
        pinned_id: pinRow?.id ?? null,
        pin_count: pinnedIds.length,
        pin_surface: pinSurface,
      },
      "status feed assembled"
    );
    return {
      items: rows.map((r) => this.toCard(r, eng, names)),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * Resolve the pinned status for a first-page feed request, or `null` when
   * the item is missing / filtered out of the active filter combo. Every
   * "return null" path logs a warning — the caller (chat) sent an id that
   * can no longer be honored and we degrade to the normal feed instead of
   * erroring the screen.
   *
   * Filter checks mirror `StatusRepository.listRotationCandidates` byte-for-byte:
   *   - `isActive: true` — already enforced by `findById` (returns null otherwise).
   *   - `deitySlug === deityId` (when `deityId` filter is set).
   *   - `languages` MEMBERSHIP — either includes `locale`, or is empty (= all
   *     languages), when `locale` filter is set.
   *
   * Judgment call (per spec): "filtered out by locale / deity" is detected via
   * an in-memory predicate check against the returned `StatusRow` — no separate
   * "does this id match the rotation candidate set" query. It stays consistent
   * with the repo's own filter, and any future filter widening should be
   * mirrored here (a colocated unit test guards this).
   */
  private async resolvePin(
    pinnedId: string,
    deityId: string | undefined,
    locale: string | undefined
  ): Promise<StatusRow | null> {
    const row = await this.repo.findById(pinnedId);
    if (!row) {
      log.warn(
        { event: "status_feed_pin_missing", pinned_id: pinnedId },
        "pinned status not found — returning normal feed"
      );
      return null;
    }
    if (deityId !== undefined && row.deitySlug !== deityId) {
      log.warn(
        {
          event: "status_feed_pin_filtered",
          pinned_id: pinnedId,
          reason: "deity",
          filter_deity_id: deityId,
          row_deity_slug: row.deitySlug,
        },
        "pinned status excluded by deity filter — returning normal feed"
      );
      return null;
    }
    if (
      locale !== undefined &&
      row.languages.length > 0 &&
      !row.languages.includes(locale)
    ) {
      log.warn(
        {
          event: "status_feed_pin_filtered",
          pinned_id: pinnedId,
          reason: "locale",
          filter_locale: locale,
          row_languages: row.languages,
        },
        "pinned status excluded by locale filter — returning normal feed"
      );
      return null;
    }
    return row;
  }

  /**
   * The status feed order for one refresh epoch. Status items keep no local
   * counters, so the resurfacing signal comes from the shared engagement table
   * (`contentType "status"`) — one batched call per epoch, not per request.
   */
  /**
   * The user's two gods, or a pair of nulls.
   *
   * NEVER THROWS AND NEVER BLOCKS THE FEED. The preference is a personalisation
   * input, not a precondition: if the users module is unreachable or nothing has
   * been synced for this person, both pools are simply empty, every slot falls
   * through to the whole catalogue, and the response is exactly what the feed
   * served before this feature existed (spec §6). Failing the screen because we
   * could not decide whose god to show first would be absurd.
   */
  private async resolveDeities(userId: string): Promise<DeityPair> {
    try {
      const pref = await performServiceCall(
        "users",
        (api) => api.getDeityPreference(userId),
        "status:deities",
        "failed to load deity preference"
      );
      return {
        primary: pref?.primaryDeitySlug ?? null,
        secondary: pref?.secondaryDeitySlug ?? null,
      };
    } catch (err) {
      log.warn(
        { err, event: "status_deity_preference_failed", user_id: userId },
        "deity preference unavailable — serving the unpersonalised feed"
      );
      return { primary: null, secondary: null };
    }
  }

  /**
   * The "All" tab's order: rotate each pool over its OWN catalogue, then lay
   * them into the slot map.
   *
   * The three pools reuse the EXACT plan keys a deity-chip feed already builds
   * (`status:<deity>:<locale>`), so the main pool a user sees here is the same
   * shared, fleet-wide plan their chip feed uses — one build per (deity, epoch)
   * for the whole service, not one per user. Only the weave is per-user, and it
   * is array indexing over those cached arrays.
   *
   * A null slug builds nothing rather than a pool: asking the catalogue for
   * `deity_slug = null` would return every untagged status, which is not "this
   * user's god" by any reading.
   */
  private async buildAllGodsPlan(
    epoch: number,
    deities: DeityPair,
    locale?: string
  ): Promise<string[]> {
    const poolFor = (slug: string | null): Promise<string[]> =>
      slug === null
        ? Promise.resolve([])
        : getOrBuildPlan(`status:${slug}:${locale ?? "*"}:${epoch}`, () =>
            this.buildRotationPlan(epoch, slug, locale)
          );

    const [main, second, any] = await Promise.all([
      poolFor(deities.primary),
      poolFor(deities.secondary),
      getOrBuildPlan(`status:*:${locale ?? "*"}:${epoch}`, () =>
        this.buildRotationPlan(epoch, undefined, locale)
      ),
    ]);

    return weave(
      STATUS_ALL_SLOTS,
      new Map<string, readonly string[]>([
        [STATUS_POOL.MAIN, main],
        [STATUS_POOL.SECOND, second],
        [STATUS_POOL.ANY, any],
      ])
    );
  }

  private async buildRotationPlan(
    epoch: number,
    deitySlug?: string,
    locale?: string
  ): Promise<string[]> {
    const candidates = await this.repo.listRotationCandidates({ deitySlug, locale });
    if (candidates.length === 0) return [];
    const counts = await performServiceCall(
      "engagement",
      (api) =>
        api.getCounts({
          contentType: STATUS_CONTENT_TYPE,
          contentIds: candidates.map((c) => c.id),
        }),
      "status:rotation",
      "failed to load engagement counts for rotation"
    );
    return rotate(
      candidates.map((c) => {
        const e = counts[c.id];
        // A share is the strongest signal, a view the weakest.
        const score = e ? e.shareCount * 3 + e.likeCount * 2 + e.viewCount : 0;
        return { id: c.id, createdAtMs: c.createdAtMs, score };
      }),
      epoch
    );
  }

  /**
   * `GET /status/:id` — one status card by id (404 for unknown/inactive).
   *
   * Structural sibling of `getFeed`'s per-row hydration: fetch the row, resolve
   * engagement (counts + `likedByMe`) and the deity display name, then run the
   * shared `toCard` mapper so the wire shape matches the feed byte-for-byte.
   * Deliberately RETURNS `null` on miss (the controller lifts that to a 404)
   * so callers stay symmetric with `getPreview`.
   */
  async getCard(userId: string, id: string): Promise<StatusCard | null> {
    const row = await this.repo.findById(id);
    if (!row) return null;
    const eng = await this.buildEngagement(userId, [row.id]);
    const names = await this.resolveDeityNames([row]);
    log.info(
      { event: "status_card", user_id: userId, status_id: id },
      "status card assembled"
    );
    return this.toCard(row, eng, names);
  }

  // ---- overlay profile ----------------------------------------------------

  /**
   * `GET /status/profile` — the user's overlay profile, or a default empty
   * profile (`activeProfileType=personal`, all fields null) if none saved.
   */
  async getProfile(userId: string): Promise<StatusProfile> {
    const row = await this.repo.findProfileByUserId(userId);
    if (!row) {
      return {
        activeProfileType: "personal",
        personalDisplayName: null,
        businessName: null,
        businessDetails: null,
        businessMobileNumber: null,
        avatarImageUrl: null,
        updatedAt: null,
      };
    }
    return toProfile(row);
  }

  /**
   * `PUT /status/profile` — upsert the overlay profile. The saved persona's
   * `activeProfileType` becomes active (business save needs `businessName`,
   * enforced in Zod). Returns the persisted profile.
   */
  /**
   * User-facing avatar presign — mints a scoped S3 PUT URL for
   * `status.userStatusProfile.avatarImageUrl`. The triple is hardcoded so a
   * mobile user cannot influence the module/entity/field (that would be an
   * escalation vector into other content types). The size cap + content-type
   * allowlist are enforced inside the media facade via the shared registry.
   *
   * After the client uploads to S3, it should call `PUT /status/profile` with
   * `avatarImageUrl = <publicUrl>` — the existing profile upsert path already
   * runs `validateOwnedUrl` on that field before persisting.
   */
  async presignAvatar(
    userId: string,
    input: { contentType: string; sizeBytes: number }
  ): Promise<{
    uploadUrl: string;
    publicUrl: string;
    key: string;
    expiresAt: string;
    headers: Record<string, string>;
  }> {
    return performServiceCall(
      "media",
      (media) =>
        media.presign({
          module: "status",
          entity: "userStatusProfile",
          field: "avatarImageUrl",
          // The mobile picker doesn't expose the original filename in most
          // cases; the media ledger echoes it for UX only and it influences
          // nothing that reaches the key. A stable placeholder is fine.
          filename: "avatar",
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          uploadedBy: userId,
        }),
      "status:presignAvatar",
      "avatar presign failed"
    );
  }

  async saveProfile(
    userId: string,
    input: StatusProfileInput
  ): Promise<StatusProfile> {
    // Coerce `null` (fields the client sent explicitly-null because they
    // belong to the OTHER tab) to `undefined` so the repo's partial-update
    // logic skips them — the previously-saved value stays. Personal and
    // Business are therefore INDEPENDENTLY persisted.
    const row = await this.repo.upsertProfile(userId, {
      activeProfileType: input.activeProfileType,
      personalDisplayName: input.personalDisplayName ?? undefined,
      businessName: input.businessName ?? undefined,
      businessDetails: input.businessDetails ?? undefined,
      businessMobileNumber: input.businessMobileNumber ?? undefined,
      avatarImageUrl: input.avatarImageUrl ?? undefined,
    });
    log.info(
      {
        event: "status_details_saved",
        user_id: userId,
        active_profile_type: input.activeProfileType,
      },
      "status profile saved"
    );
    return toProfile(row);
  }

  // ---- writes -------------------------------------------------------------

  /**
   * `POST /status/:id/like` (toggle) — FREE. Delegates to the shared
   * `engagement` facade (contentType "status"); no local like table.
   */
  async toggleLike(id: string, userId: string): Promise<StatusLikeResult> {
    const gate = await this.repo.findGateById(id);
    if (!gate) throw new AppError("Status not found", 404, "NOT_FOUND");

    const likedIds = await performServiceCall(
      "engagement",
      (api) =>
        api.getUserLikes({
          userId,
          contentType: STATUS_CONTENT_TYPE,
          contentIds: [id],
        }),
      "status:like",
      "failed to resolve like state"
    );
    const alreadyLiked = likedIds.includes(id);
    const state = await performServiceCall(
      "engagement",
      (api) =>
        alreadyLiked
          ? api.unlike({ userId, contentType: STATUS_CONTENT_TYPE, contentId: id })
          : api.like({ userId, contentType: STATUS_CONTENT_TYPE, contentId: id }),
      "status:like",
      "failed to toggle like"
    );
    log.info(
      { event: "status_like_toggled", user_id: userId, status_id: id, liked: state.liked },
      "status like toggled"
    );
    return { statusId: id, liked: state.liked, likeCount: state.likeCount };
  }

  /**
   * `POST /status/:id/view` — record a view (increment-only) via the shared
   * engagement counter. The 2-second visibility threshold is enforced by the
   * client (TAM-72); the API just records the view.
   */
  async recordView(id: string, userId: string): Promise<StatusViewResult> {
    const gate = await this.repo.findGateById(id);
    if (!gate) throw new AppError("Status not found", 404, "NOT_FOUND");

    const state = await performServiceCall(
      "engagement",
      (api) => api.recordView({ contentType: STATUS_CONTENT_TYPE, contentId: id }),
      "status:view",
      "failed to record view"
    );
    log.info(
      { event: "status_card_viewed", user_id: userId, status_id: id },
      "status view recorded"
    );
    return { statusId: id, viewCount: state.viewCount };
  }

  // ---- facade -------------------------------------------------------------

  /** Compact cross-module preview, or `null` if unknown/inactive. */
  async getPreview(id: string): Promise<StatusPreview | null> {
    const row = await this.repo.findById(id);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      mediaType: row.mediaType,
      thumbnailUrl: row.thumbnailUrl,
    };
  }

  /**
   * Write-side validation payload for a status id — gates the two invariants
   * TAM-173's pinned-content service needs before letting a pin land: the row
   * exists (returns non-null) and its single deity slug (so the pinned-content
   * service can enforce `content_deity_mismatch` on `status_deity` pins). Uses
   * the existing `findById` projection; a soft-inactive row is `null`.
   */
  async getPinValidation(
    id: string
  ): Promise<{ deitySlug: string | null } | null> {
    const row = await this.repo.findById(id);
    if (!row) return null;
    return { deitySlug: row.deitySlug };
  }

  /**
   * TAM-N — write-side resolution for `core/reports`: does this status exist,
   * and who is it attributed to?
   *
   * Returns `null` for an unknown or inactive id so the reports module can 404
   * without reaching into `status_items` itself. `creatorId` is the house
   * creator today; when real user-generated status arrives this reads the row's
   * own author and NOTHING in the reports module changes.
   */
  async getReportTarget(id: string): Promise<{ creatorId: string } | null> {
    // `findGateById`, not `findById`: this is a pure existence probe — nothing
    // below reads the row — and `findGateById` is the repository's own
    // write-path check that selects just the id instead of the whole record.
    // Both filter `isActive`, so a deactivated status is unreportable either
    // way, which is what the `null` contract above promises.
    const row = await this.repo.findGateById(id);
    if (!row) return null;
    return { creatorId: HOUSE_CREATOR_ID };
  }

  // ---- internals ----------------------------------------------------------

  private async buildEngagement(
    userId: string,
    ids: string[]
  ): Promise<EngagementBatch> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return { counts: {}, liked: new Set() };
    const counts = await performServiceCall(
      "engagement",
      (api) => api.getCounts({ contentType: STATUS_CONTENT_TYPE, contentIds: uniqueIds }),
      "status:engagement",
      "failed to load engagement counts"
    );
    const likedIds = await performServiceCall(
      "engagement",
      (api) =>
        api.getUserLikes({
          userId,
          contentType: STATUS_CONTENT_TYPE,
          contentIds: uniqueIds,
        }),
      "status:engagement",
      "failed to load like state"
    );
    return { counts, liked: new Set(likedIds) };
  }

  /**
   * Batch slug → localized display-name map from the deity facade (one call for
   * the whole page). Skipped (empty map) when no row on the page carries a deity
   * slug, so an empty feed never hits the deity module.
   */
  private async resolveDeityNames(rows: StatusRow[]): Promise<DeityNameMap> {
    const hasDeity = rows.some((r) => r.deitySlug !== null);
    if (!hasDeity) return new Map();
    const deities = await performServiceCall(
      "deity",
      (api) => api.getActiveDeities({ locale: DEFAULT_LOCALE }),
      "status:deities",
      "failed to load deities"
    );
    return new Map(deities.map((d) => [d.slug, d.displayName]));
  }

  private toCard(
    row: StatusRow,
    eng: EngagementBatch,
    names: DeityNameMap
  ): StatusCard {
    const c = eng.counts[row.id];
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      mediaType: row.mediaType,
      imageUrl: row.imageUrl,
      videoUrl: row.videoUrl,
      thumbnailUrl: row.thumbnailUrl,
      overlaySafeArea: coerceSafeArea(row.overlaySafeArea),
      deitySlug: row.deitySlug,
      deityName:
        row.deitySlug !== null ? names.get(row.deitySlug) ?? row.deitySlug : null,
      languages: row.languages,
      shareCaption: row.shareCaption,
      // TAM-N — the house creator stands in as the author of every status. One
      // shared mapper, so the feed and the single-card route agree byte for byte.
      creator: houseCreator(),
      likeCount: c?.likeCount ?? 0,
      viewCount: c?.viewCount ?? 0,
      shareCount: c?.shareCount ?? 0,
      likedByMe: eng.liked.has(row.id),
    };
  }
}

/** Map a raw profile row to the wire shape. */
function toProfile(row: {
  activeProfileType: StatusProfileType;
  personalDisplayName: string | null;
  businessName: string | null;
  businessDetails: string | null;
  businessMobileNumber: string | null;
  avatarImageUrl: string | null;
  updatedAt: Date;
}): StatusProfile {
  return {
    activeProfileType: row.activeProfileType,
    personalDisplayName: row.personalDisplayName,
    businessName: row.businessName,
    businessDetails: row.businessDetails,
    businessMobileNumber: row.businessMobileNumber,
    avatarImageUrl: row.avatarImageUrl,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Coerce a Prisma JSON value to overlay safe-area insets (zero fallback). */
function coerceSafeArea(value: unknown): OverlaySafeArea {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as OverlaySafeArea).top === "number" &&
    typeof (value as OverlaySafeArea).bottom === "number" &&
    typeof (value as OverlaySafeArea).left === "number" &&
    typeof (value as OverlaySafeArea).right === "number"
  ) {
    const { top, bottom, left, right } = value as OverlaySafeArea;
    return { top, bottom, left, right };
  }
  return { ...ZERO_SAFE_AREA };
}
