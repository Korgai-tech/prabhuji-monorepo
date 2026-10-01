import { getPrisma } from "@api/shared/database";
import type { ChatContentType } from "@api/core/chat/types";

/** One resolved piece of content, before Pro gating is applied. */
export interface ContentRow {
  type: ChatContentType;
  id: string;
  /** CMS-authored display title. Non-nullable in all six tables. */
  title: string;
  /** The playable asset, or null when the row has none (status/wallpaper/horoscope). */
  playUrl: string | null;
  /** Card art. Non-nullable in all six tables. */
  icon: string;
  /** True when `playUrl` is Pro-only and must be withheld from free callers. */
  gated: boolean;
}

/**
 * Batch-resolves the content ids an agent recommends into playable rows.
 *
 * Six tables, one query each, active-guarded — a row deactivated in the
 * CMS drops out of a recommendation rather than being served as a dead card.
 * Aarti and bhajan share `audio_items` and have NO discriminator column, so the
 * caller's content type (from the id map) is what separates them.
 *
 * URLs are returned VERBATIM. Every media column in this schema holds an
 * absolute https URL (the platform's media-URL convention); nothing here is an
 * object key and nothing is presigned. Presigning exists only on the downloads
 * path, and doing it here would be new behaviour, not parity.
 *
 * `gated` marks the rows whose `playUrl` is Pro-only on every existing surface
 * (`#EXPORT_CRITICAL` on aarti, mantras and ringtone). The service applies the
 * entitlement; the repository only reports which rows need it.
 */
/**
 * The title on every horoscope recommendation card.
 *
 * Constant rather than the sign's `displayName`: the card is a deeplink to the
 * horoscope screen, so the copy that belongs on it is the same whichever sign
 * it carries. Hinglish to match the agent's own reply ("Aapka rashifal main
 * yahan dikha deta hoon"), which is what the user reads directly above it.
 */
const HOROSCOPE_CARD_TITLE = "Aaj ka Rashifal";

export class ContentRepository {
  async findByTypeAndIds(
    idsByType: Map<ChatContentType, string[]>
  ): Promise<ContentRow[]> {
    const audioIds = [
      ...(idsByType.get("aarti") ?? []),
      ...(idsByType.get("bhajan") ?? []),
    ];
    const aartiIds = new Set(idsByType.get("aarti") ?? []);
    const mantraIds = idsByType.get("mantra") ?? [];
    const ringtoneIds = idsByType.get("ringtone") ?? [];
    const statusIds = idsByType.get("status") ?? [];
    const wallpaperIds = idsByType.get("wallpaper") ?? [];
    const horoscopeIds = idsByType.get("horoscope") ?? [];

    const prisma = getPrisma();
    const [audio, mantras, ringtones, statuses, wallpapers, zodiacSigns] = await Promise.all([
      audioIds.length === 0
        ? []
        : prisma.audioItem.findMany({
            where: { isActive: true, id: { in: audioIds } },
            select: {
              id: true,
              title: true,
              audioStreamUrl: true,
              coverImageUrl: true,
            },
          }),
      mantraIds.length === 0
        ? []
        : prisma.mantraAudioItem.findMany({
            where: { isActive: true, id: { in: mantraIds } },
            select: {
              id: true,
              title: true,
              audioUrl: true,
              artworkUrl: true,
            },
          }),
      ringtoneIds.length === 0
        ? []
        : prisma.ringtone.findMany({
            where: { isActive: true, id: { in: ringtoneIds } },
            select: {
              id: true,
              title: true,
              audioUrl: true,
              thumbnailImageUrl: true,
            },
          }),
      statusIds.length === 0
        ? []
        : prisma.statusItem.findMany({
            where: { isActive: true, id: { in: statusIds } },
            select: {
              id: true,
              title: true,
              videoUrl: true,
              imageUrl: true,
              thumbnailUrl: true,
            },
          }),
      wallpaperIds.length === 0
        ? []
        : prisma.wallpaper.findMany({
            where: { isActive: true, id: { in: wallpaperIds } },
            select: {
              id: true,
              title: true,
              previewVideoUrl: true,
              previewImageUrl: true,
              thumbnailUrl: true,
            },
          }),
      // Horoscope is looked up by `zodiacId` — the stable slug ("aries") —
      // NOT by primary key, which is the one place this type deliberately
      // breaks the pattern the other five follow.
      //
      // `horoscope.seed.ts` upserts by `zodiacId` and lets Prisma generate the
      // uuid, so `zodiac_sign.id` is a DIFFERENT random value in every
      // environment that ran the seed. Putting those uuids in the committed
      // `content-id-map.json` would resolve on the environment they were read
      // from and silently return nothing everywhere else — a recommendation
      // that just vanishes, with no error to notice.
      //
      // `zodiac_sign` also guards with `enabled`, not `isActive`.
      horoscopeIds.length === 0
        ? []
        : prisma.zodiacSign.findMany({
            where: { enabled: true, zodiacId: { in: horoscopeIds } },
            // `zodiacId`, NOT `id`. This is the one type whose id map holds a
            // stable slug rather than a primary key, and the service joins the
            // rows back onto the ids it asked for — so returning the uuid here
            // meant every horoscope row missed that join and was dropped. It
            // also matches what `GET /horoscope/zodiac-signs` publishes, which
            // is the grid the client is expected to match against.
            // `displayName` is deliberately NOT selected: the card's title is a
            // fixed CTA (see `HOROSCOPE_CARD_TITLE`), so the sign's name is
            // never read on this path.
            select: { zodiacId: true, iconAssetUrl: true },
          }),
    ]);

    const rows: ContentRow[] = [
      ...audio.map((r): ContentRow => ({
        // Same table, two content types — the id map decides which.
        type: aartiIds.has(r.id) ? "aarti" : "bhajan",
        id: r.id,
        title: r.title,
        playUrl: r.audioStreamUrl,
        icon: r.coverImageUrl,
        gated: true,
      })),
      ...mantras.map((r): ContentRow => ({
        type: "mantra",
        id: r.id,
        title: r.title,
        playUrl: r.audioUrl,
        icon: r.artworkUrl,
        gated: true,
      })),
      ...ringtones.map((r): ContentRow => ({
        type: "ringtone",
        id: r.id,
        title: r.title,
        playUrl: r.audioUrl,
        icon: r.thumbnailImageUrl,
        gated: true,
      })),
      ...statuses.map((r): ContentRow => ({
        type: "status",
        id: r.id,
        title: r.title,
        // Exactly one of these is set per `mediaType`, but that invariant lives
        // at the Zod/seed boundary and not in the database — so both can be
        // null and `playUrl` has to tolerate it.
        playUrl: r.videoUrl ?? r.imageUrl,
        icon: r.thumbnailUrl,
        gated: false,
      })),
      ...wallpapers.map((r): ContentRow => ({
        type: "wallpaper",
        id: r.id,
        title: r.title,
        // Deliberately NOT `liveWallpaperAssetUrl`: that asset is Pro-gated on
        // the wallpaper screen, and a recommendation card wants the free
        // preview anyway. Serving it here would reopen a hole that module
        // closed on purpose.
        playUrl: r.previewVideoUrl ?? r.previewImageUrl,
        icon: r.thumbnailUrl,
        gated: false,
      })),
      ...zodiacSigns.map((r): ContentRow => ({
        type: "horoscope",
        // The stable slug ("aries"), for the reasons on the query above.
        id: r.zodiacId,
        // A FIXED CTA, not the sign's name — the one type whose `title` is not
        // CMS copy. The other five title a thing you play; this one titles a
        // door into the horoscope screen, and "मेष" alone reads as a label with
        // no verb. The sign is still fully identified by `id`, which the client
        // matches against the grid `GET /horoscope/zodiac-signs` already gives
        // it, so nothing is lost by not repeating the name here.
        title: HOROSCOPE_CARD_TITLE,
        // A sign has nothing to play. The client takes `id`, matches it against
        // the zodiac grid it already loads, and opens the horoscope screen.
        playUrl: null,
        icon: r.iconAssetUrl,
        // The zodiac grid is deliberately free and carries no Pro flags
        // (see the schema comment on horoscope.schemas.ts).
        gated: false,
      })),
    ];
    return rows;
  }
}
