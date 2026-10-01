/**
 * "Add to feed" — derive a feed-item draft from a piece of module content.
 *
 * The home feed is a CURATED table, not an aggregate over the modules: a card
 * carries editorial fields no content row has (`ctaLabel`, `shareMetadata`,
 * `badge`, `trendingScore`, per-locale framing copy), and `ctaLabel` +
 * `shareMetadata` are REQUIRED in the mobile contract. So a card cannot be
 * projected from content — but almost all of it can be PRE-FILLED from it,
 * which is what this does. The editor reviews and overrides rather than retypes.
 *
 * WHAT IS DELIBERATELY NOT PREFILLED:
 *
 *  - `heroImageUrl`. It cannot reuse the content's own image URL: the api's
 *    `validateOwnedUrl` checks the key shape per (module, entity), so a feed hero
 *    must live under `home/home-feed-item/…`. A wallpaper URL
 *    (`wallpaper/wallpaper/…`) is rejected. The editor therefore picks/uploads
 *    the card hero — which is also the design intent: the hero is a CARD image,
 *    not the asset itself.
 *  - `badge` / `label` / `trendingScore`. A badge is an editorial claim
 *    ("TRENDING"), not a fact derivable from a row.
 */
import type { FeedItemPrefill } from './feed-item-form';
import type { ContentType, HomeModuleKey } from './home-constants';

/** The subset of any module row this needs. Kept structural so every module fits. */
export interface FeedableContent {
  slug: string;
  title: string;
  /**
   * The content's OWN image URL to reuse as the feed hero — no re-upload. The api
   * accepts it via the reusable-media path (validateReusableUrl): a wallpaper
   * thumbnail, status thumbnail, aarti cover, etc. Omit and the editor picks one.
   */
  imageUrl?: string;
}

/** Modules that can seed a feed card, mapped to the feed's own vocabulary. */
export type FeedableModule = 'wallpaper' | 'status' | 'aarti' | 'mantra' | 'ringtone';

/**
 * Per-module framing. `contentType` is the feed's display/routing token and
 * `module` is the app route prefix; they are separate vocabularies that happen to
 * coincide for most modules, so both are spelled out rather than inferred.
 */
const FRAMING: Record<
  FeedableModule,
  {
    contentType: ContentType;
    module: HomeModuleKey;
    headerDestinationModule: HomeModuleKey;
    ctaLabel: string;
  }
> = {
  wallpaper: { contentType: 'wallpaper', module: 'wallpaper', headerDestinationModule: 'wallpaper', ctaLabel: 'Set Wallpaper' },
  status: { contentType: 'status', module: 'status', headerDestinationModule: 'status', ctaLabel: 'View Status' },
  aarti: { contentType: 'aarti', module: 'aarti', headerDestinationModule: 'aarti', ctaLabel: 'Listen Now' },
  mantra: { contentType: 'mantra', module: 'mantra', headerDestinationModule: 'mantra', ctaLabel: 'Listen Now' },
  ringtone: { contentType: 'ringtone', module: 'ringtone', headerDestinationModule: 'ringtone', ctaLabel: 'Set Ringtone' },
};

/** Deep links are absolute (the api validates `shareDeepLink` as a URL). */
const DEEP_LINK_BASE = 'https://prabhuji.app';

export function buildFeedPrefill(
  module: FeedableModule,
  content: FeedableContent,
): FeedItemPrefill {
  const f = FRAMING[module];
  return {
    // `feed-` prefixed so a card and its content never collide on the unique slug.
    slug: `feed-${content.slug}`.slice(0, 96),
    title: content.title,
    // Reuse the content's own image as the hero — the api's reusable-media path
    // accepts it, so no duplicate upload. Absent ⇒ the editor picks one.
    ...(content.imageUrl ? { heroImageUrl: content.imageUrl } : {}),
    contentType: f.contentType,
    module: f.module,
    headerDestinationModule: f.headerDestinationModule,
    ctaLabel: f.ctaLabel,
    // content_detail routes the CTA at this exact row; `linked_module` would only
    // open the module index, losing which item the card is about.
    ctaDestinationType: 'content_detail',
    ctaDestinationValue: content.slug,
    shareTitle: content.title,
    shareText: `Check out ${content.title} on Prabhuji`,
    shareDeepLink: `${DEEP_LINK_BASE}/${f.module}/${content.slug}`,
  };
}
