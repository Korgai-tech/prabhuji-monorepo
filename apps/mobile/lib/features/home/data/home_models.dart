// `painting`, not `material`: this file needs only `Color`, `LinearGradient` and
// `Alignment` to parse a CMS palette (TAM-174). Pulling in all of material would
// put widgets on a data model's import graph for three painting primitives.
import 'package:flutter/painting.dart';
import 'package:meta/meta.dart';

import '../../../api/generated/openapi.dart';

/// Domain models for Home (TAM-62), mapped from the generated api-client types
/// (TAM-61 contract) — never raw `dynamic`.
///
/// Home is NOT Pro-gated (PRD §5): nothing in this file carries a "locked"
/// concept, and no card can render a lock badge because no model exposes one.
/// The only Pro-adjacent field on the whole surface is a banner's
/// [HomeBannerView.isProFeatureDiscovery], which is server-authored.

/// CMS tap-destination kind — the vocabulary the contract shares between a
/// BANNER (`HomeBannerDestinationTypeEnum`) and a SHORTCUT
/// (`HomeShortcutDestinationTypeEnum`). Both wire enums carry the identical four
/// values on purpose, so the client resolves both through ONE allowlist.
///
/// CMS data is untrusted input: this resolves through [HomeDestinations], never
/// by navigating a raw wire value (pattern §3).
enum HomeDestinationType {
  /// Open a module — `destinationValue` is a module key ("wallpaper", …).
  linkedModule,

  /// Open a content detail — `destinationValue` is a content id/slug.
  contentDetail,

  /// Open the unified paywall — `destinationValue` is a paywall id. The server
  /// forces `isProFeatureDiscovery` for these.
  proPaywall,

  /// Non-navigable by contract (`destinationValue` is always null). Renders as
  /// plain art with NO tap target.
  informational;

  /// Wire → enum. Unknown strings return `null`, so an unknown banner is
  /// dropped rather than rendered with an unresolvable tap.
  static HomeDestinationType? fromWire(String? wire) {
    switch (wire) {
      case 'linked_module':
        return HomeDestinationType.linkedModule;
      case 'content_detail':
        return HomeDestinationType.contentDetail;
      case 'pro_paywall':
        return HomeDestinationType.proPaywall;
      case 'informational':
        return HomeDestinationType.informational;
      default:
        return null;
    }
  }

  String get wire => switch (this) {
        HomeDestinationType.linkedModule => 'linked_module',
        HomeDestinationType.contentDetail => 'content_detail',
        HomeDestinationType.proPaywall => 'pro_paywall',
        HomeDestinationType.informational => 'informational',
      };

  /// `informational` rows have no destination at all — the carousel must render
  /// them non-tappable (AC / PRD §8).
  bool get isNavigable => this != HomeDestinationType.informational;
}

/// What a banner's [HomeBannerView.mediaUrl] actually is — a still, or a short
/// clip that autoplays behind its thumbnail.
///
/// The wire enum is `image | video`. An UNKNOWN value degrades to [image]
/// rather than dropping the banner: a future media kind we can't play is still
/// a URL we can paint, and hiding a published banner is the worse failure.
enum HomeBannerMediaType {
  image,
  video;

  /// Wire → enum. Unknown/absent ⇒ [image] (see the class doc).
  static HomeBannerMediaType fromWire(String? wire) =>
      wire == 'video' ? HomeBannerMediaType.video : HomeBannerMediaType.image;

  /// The analytics `media_type` property value — identical to the wire string
  /// so the funnel reads the same vocabulary the CMS writes.
  String get wire => switch (this) {
        HomeBannerMediaType.image => 'image',
        HomeBannerMediaType.video => 'video',
      };

  bool get isVideo => this == HomeBannerMediaType.video;
}

/// A CMS hero banner (`GET /home/banners`, contract `HomeBanner`).
@immutable
class HomeBannerView {
  const HomeBannerView({
    required this.id,
    required this.mediaUrl,
    required this.destinationType,
    required this.destinationValue,
    required this.isProFeatureDiscovery,
    required this.sortOrder,
    this.mediaType = HomeBannerMediaType.image,
    this.thumbnailUrl,
  });

  final String id;

  /// Whether [mediaUrl] is a still or a clip. Drives the carousel's render
  /// path AND the `media_type` property on `home_banner_viewed`/`_clicked`.
  final HomeBannerMediaType mediaType;

  /// Banner art — the image, or the VIDEO for a [HomeBannerMediaType.video]
  /// row. An empty/blank URL is the deterministic media-failure path —
  /// [AppNetworkImage] renders the branded fallback, never a broken glyph.
  final String mediaUrl;

  /// The video still. The contract guarantees it is non-null for a `video`
  /// banner and null for an `image` one, but the client never relies on that:
  /// [stillUrl] resolves what to paint either way.
  final String? thumbnailUrl;

  /// What the carousel paints BEFORE (and instead of, on failure) the video:
  /// the thumbnail for a video banner, the media itself for an image banner.
  /// A video row that somehow arrived without a thumbnail falls through to
  /// [AppNetworkImage]'s branded fallback rather than a black box.
  String get stillUrl => mediaType.isVideo ? (thumbnailUrl ?? '') : mediaUrl;

  /// The clip to play, or `null` when there is nothing playable — an image
  /// banner, or a video row with a blank `mediaUrl`. The carousel treats
  /// `null` as "thumbnail only", which is exactly the failure contract.
  String? get playableVideoUrl {
    if (!mediaType.isVideo) return null;
    final url = mediaUrl.trim();
    return url.isEmpty ? null : url;
  }

  final HomeDestinationType destinationType;

  /// Module key / content id / paywall id. `null` for [HomeDestinationType.informational].
  final String? destinationValue;

  /// Server's statement that this banner exists to sell Pro. A free user tapping
  /// it opens the unified paywall (PRD §8); the client NEVER invents this.
  final bool isProFeatureDiscovery;

  final int sortOrder;

  /// Contract → domain. Returns `null` for an unknown `destinationType` so the
  /// caller can drop the banner forward-compatibly.
  static HomeBannerView? fromBanner(HomeBanner b) {
    final destination = HomeDestinationType.fromWire(b.destinationType.value);
    if (destination == null) return null;
    return HomeBannerView(
      id: b.id,
      mediaType: HomeBannerMediaType.fromWire(b.mediaType.value),
      mediaUrl: b.mediaUrl,
      thumbnailUrl: b.thumbnailUrl,
      destinationType: destination,
      // Defensive: the contract says informational rows always carry a null
      // destinationValue, but a CMS row that disagrees must not become tappable.
      destinationValue:
          destination.isNavigable ? b.destinationValue : null,
      isProFeatureDiscovery: b.isProFeatureDiscovery,
      sortOrder: b.sortOrder,
    );
  }
}

/// One tile of the 3×2 feature-shortcut grid (`GET /home/shortcuts`, contract
/// `HomeShortcut`).
///
/// The label, the ORDER and WHICH tiles exist are CMS-owned — the client used to
/// hardcode all four (`kHomeShortcuts`) and no longer knows any of it.
///
/// TAM-132: the icon becomes CMS-owned too, via [iconUrl]. [iconKey]/[key] stay
/// as a client-side BUNDLED-asset fallback for older API responses that omit
/// [iconUrl] and for cold-start / airplane-mode. Priority is
/// `iconUrl` → bundled `iconKey`/`key` → no art (`SizedBox.shrink()`).
@immutable
class HomeShortcutView {
  const HomeShortcutView({
    required this.id,
    required this.key,
    required this.label,
    required this.destinationType,
    required this.destinationValue,
    required this.iconKey,
    required this.iconUrl,
    required this.theme,
    required this.sortOrder,
  });

  final String id;

  /// Stable slug (`aarti_bhajans`, …). Analytics `card_id` + the icon fallback
  /// lookup key.
  final String key;

  /// CMS display copy. Rendered verbatim.
  final String label;

  final HomeDestinationType destinationType;

  /// #EXPORT_CRITICAL — a stable module KEY ("aarti", "wallpaper", …), NOT a
  /// route/path/URL. Resolved through [HomeDestinations]' hardcoded allowlist;
  /// an unknown key is a no-op. `null` for [HomeDestinationType.informational].
  final String? destinationValue;

  /// Bundled-asset lookup key. Never a URL — distinct concern from [iconUrl].
  final String? iconKey;

  /// TAM-132 — CMS-served icon URL. When non-null/non-empty the grid renders
  /// it via [Image.network] as the primary art; a network failure or an
  /// absent/empty value falls back to the bundled [iconKey] asset.
  final String? iconUrl;

  /// TAM-174 — the tile's CMS palette, or null.
  ///
  /// Null is the ONLY signal the client gets about the A/B arm, and that is
  /// deliberate: the server collapses "control arm", "experiment off" and
  /// "this row is unthemed" into one value because the client renders all
  /// three identically (the shipped flat gradient). There is no variant flag
  /// to branch on and the app holds no cohort logic of its own.
  ///
  /// Also null when the wire value fails to parse — see
  /// [HomeShortcutThemeView.fromWire].
  final HomeShortcutThemeView? theme;

  final int sortOrder;

  /// Contract → domain. Returns `null` for an unknown `destinationType` so the
  /// caller can drop the tile forward-compatibly.
  static HomeShortcutView? fromShortcut(HomeShortcut s) {
    final destination = HomeDestinationType.fromWire(s.destinationType.value);
    if (destination == null) return null;
    return HomeShortcutView(
      id: s.id,
      key: s.key,
      label: s.label,
      destinationType: destination,
      // Defensive, mirroring the banner: an informational row that disagrees
      // with the contract must not become tappable.
      destinationValue: destination.isNavigable ? s.destinationValue : null,
      iconKey: s.iconKey,
      iconUrl: s.iconUrl,
      theme: HomeShortcutThemeView.fromWire(s.theme),
      sortOrder: s.sortOrder,
    );
  }
}

/// TAM-174 — a shortcut tile's palette, parsed into Flutter types.
///
/// Parsing happens HERE, at the data boundary, rather than in the widget, so an
/// unrenderable palette becomes `null` once — and the tile falls back to the
/// shipped gradient — instead of throwing mid-paint inside a `GridView`.
class HomeShortcutThemeView {
  const HomeShortcutThemeView({
    required this.backgroundFrom,
    required this.backgroundFromStop,
    required this.backgroundTo,
    required this.backgroundToStop,
    required this.labelColor,
  });

  final Color backgroundFrom;
  final Color backgroundTo;
  final Color labelColor;

  /// Gradient handle positions as fractions of the card. **May fall outside
  /// `0..1`** — `set_wallpaper` is authored `0.14734 → 1.4734`. Never pass
  /// these to [LinearGradient.stops] (which asserts `0..1`); use [begin]/[end].
  final double backgroundFromStop;
  final double backgroundToStop;

  /// The gradient, with the stops expressed as ALIGNMENTS.
  ///
  /// Flutter's `LinearGradient.stops` must lie in `0..1` and throws otherwise,
  /// which `set_wallpaper`'s `1.4734` would trip on every build. `Alignment`
  /// has no such constraint, so a handle that sits below the card's bottom edge
  /// is expressed by an end point below the card — which is exactly what Figma
  /// means by it.
  ///
  /// A fraction `f` down the box maps to `y = -1 + 2f` (`f=0` → `-1`, the top;
  /// `f=1` → `1`, the bottom).
  LinearGradient get gradient => LinearGradient(
        begin: Alignment(0, -1 + 2 * backgroundFromStop),
        end: Alignment(0, -1 + 2 * backgroundToStop),
        colors: <Color>[backgroundFrom, backgroundTo],
      );

  /// Contract → domain. Returns `null` when there is no theme OR when any part
  /// of it is unusable, so a malformed palette degrades the tile to the shipped
  /// look rather than crashing the grid (#EXPORT_CRITICAL — the grid must
  /// always paint).
  static HomeShortcutThemeView? fromWire(HomeShortcutTheme? t) {
    if (t == null) return null;
    final from = _parseHexColor(t.backgroundFrom);
    final to = _parseHexColor(t.backgroundTo);
    final label = _parseHexColor(t.labelColor);
    if (from == null || to == null || label == null) return null;
    // `.toDouble()`: the generated model types the stops as `num` (JSON numbers
    // arrive as `int` when the CMS holds a whole value like `1`, and `Alignment`
    // takes `double`). Converting here keeps the cast out of the widget.
    final fromStop = t.backgroundFromStop.toDouble();
    final toStop = t.backgroundToStop.toDouble();
    if (!fromStop.isFinite || !toStop.isFinite) return null;
    return HomeShortcutThemeView(
      backgroundFrom: from,
      backgroundFromStop: fromStop,
      backgroundTo: to,
      backgroundToStop: toStop,
      labelColor: label,
    );
  }
}

/// `#RRGGBB` → an opaque [Color], or null if the string is not exactly that.
///
/// The server validates the same shape at both its boundaries, so this should
/// never reject in practice — it exists because "should never" is not "cannot",
/// and the cost of being wrong here is a crash inside a build method.
Color? _parseHexColor(String? hex) {
  final value = hex?.trim() ?? '';
  if (value.length != 7 || !value.startsWith('#')) return null;
  final rgb = int.tryParse(value.substring(1), radix: 16);
  if (rgb == null) return null;
  return Color(0xFF000000 | rgb);
}

/// Feed content shape (contract enum `HomeFeedItemContentTypeEnum`). The feed is
/// MIXED — this never groups the list, it only picks the card's hero treatment.
enum HomeContentType {
  wallpaper,
  status,
  aarti,
  mantra,
  ringtone;

  static HomeContentType? fromWire(String? wire) {
    switch (wire) {
      case 'wallpaper':
        return HomeContentType.wallpaper;
      case 'status':
        return HomeContentType.status;
      case 'aarti':
        return HomeContentType.aarti;
      case 'mantra':
        return HomeContentType.mantra;
      case 'ringtone':
        return HomeContentType.ringtone;
      default:
        return null;
    }
  }

  String get wire => switch (this) {
        HomeContentType.wallpaper => 'wallpaper',
        HomeContentType.status => 'status',
        HomeContentType.aarti => 'aarti',
        HomeContentType.mantra => 'mantra',
        HomeContentType.ringtone => 'ringtone',
      };

  /// The three audio-bearing types render the `285:3639/3689/3739` mini-player
  /// treatment; wallpaper/status render the `285:3539/3574` 9:16 hero.
  bool get isAudio =>
      this == HomeContentType.aarti ||
      this == HomeContentType.mantra ||
      this == HomeContentType.ringtone;

  /// The 40px module tile in the card header (nodes 285:3545/3580/3645/3695/3745).
  String get thumbAsset => switch (this) {
        HomeContentType.wallpaper => 'assets/home/module-thumb-wallpaper.png',
        HomeContentType.status => 'assets/home/module-thumb-status.png',
        HomeContentType.aarti => 'assets/home/module-thumb-aarti.png',
        HomeContentType.mantra => 'assets/home/module-thumb-mantra.png',
        HomeContentType.ringtone => 'assets/home/module-thumb-ringtone.png',
      };
}

/// CMS merchandising pill KIND (contract enum `HomeFeedItemBadgeEnum`). Absent ⇒
/// no pill. This is NEVER a lock/Pro label (#EXPORT_CRITICAL) — the enum is
/// closed to exactly these two values.
///
/// This carries NO display copy. The pill's text is the server's
/// [HomeFeedItemView.badgeLabel] (CMS-owned); the kind only exists for analytics
/// and for the closed-vocabulary guard in the repository's prune. A client-side
/// `label` getter used to hardcode "TRENDING"/"SUGGESTED" here — that was
/// content, and it is gone.
enum HomeBadge {
  trending,
  suggested;

  static HomeBadge? fromWire(String? wire) {
    switch (wire) {
      case 'trending':
        return HomeBadge.trending;
      case 'suggested':
        return HomeBadge.suggested;
      default:
        return null;
    }
  }

  String get wire => switch (this) {
        HomeBadge.trending => 'trending',
        HomeBadge.suggested => 'suggested',
      };
}

/// The native-share payload the server assembles per item (contract
/// `HomeShareMetadata`). Deep link + thumbnail, never a media file — the shape
/// mirrors `ShareContent` (TAM-58 AC-f).
@immutable
class HomeShareMetadataView {
  const HomeShareMetadataView({
    required this.title,
    required this.text,
    required this.deepLink,
    required this.thumbnailUrl,
  });

  final String title;
  final String text;
  final String deepLink;
  final String? thumbnailUrl;

  static HomeShareMetadataView fromMetadata(HomeShareMetadata m) =>
      HomeShareMetadataView(
        title: m.title,
        text: m.text,
        deepLink: m.deepLink,
        thumbnailUrl: m.thumbnailUrl,
      );
}

/// One card of the mixed feed (`GET /home/feed`, contract `HomeFeedItem`).
///
/// Deliberately carries NO entitlement/lock field: free and Pro users get the
/// identical feed and identical card chrome (PRD §5). The destination module
/// enforces its own gate on arrival.
@immutable
class HomeFeedItemView {
  const HomeFeedItemView({
    required this.id,
    required this.contentType,
    required this.module,
    required this.title,
    required this.subtitle,
    required this.mediaUrl,
    required this.audioPreviewUrl,
    required this.ctaLabel,
    required this.ctaDestinationType,
    required this.ctaDestinationValue,
    required this.ctaContentId,
    required this.headerDestinationModule,
    required this.label,
    required this.badge,
    required this.badgeLabel,
    required this.likeCount,
    required this.viewCount,
    required this.shareCount,
    required this.likedByMe,
    required this.shareMetadata,
  });

  final String id;
  final HomeContentType contentType;

  /// Owning module key (analytics + the header tap's destination fallback).
  final String module;
  final String title;
  final String? subtitle;

  /// Hero art. Empty ⇒ branded fallback (never a broken image).
  final String mediaUrl;

  /// Present only for aarti | mantra | ringtone. Blank/absent ⇒ this card has no
  /// preview and never touches the shared player.
  final String? audioPreviewUrl;

  final String ctaLabel;

  /// Untrusted CMS strings — resolved through [HomeDestinations], never raw.
  final String ctaDestinationType;
  final String ctaDestinationValue;

  /// UUID of the underlying content the CTA opens — a side-car to
  /// [ctaDestinationValue] (a slug). Populated by the server's auto-feed sync
  /// so the app can build the by-id deep-link into per-content play screens
  /// (`/aarti-bhajans/audio/:id`, `/mantras/audio/:id`) that look up by id
  /// with no slug fallback. Null on manually-authored admin cards ⇒
  /// [HomeDestinations.feedCta] falls back to opening the owning module.
  final String? ctaContentId;
  final String headerDestinationModule;

  /// Small module/context caption above the title (e.g. "New this week").
  final String? label;

  /// The pill's KIND. Never its copy — see [badgeLabel].
  final HomeBadge? badge;

  /// CMS-owned pill COPY (e.g. "TRENDING"). Non-null exactly when [badge] is: a
  /// badged row whose CMS label is missing is served with BOTH fields null,
  /// because an unlabelled badge is not renderable. The client renders this
  /// string verbatim and NEVER invents copy — no label ⇒ no pill ([hasBadge]).
  final String? badgeLabel;

  final int likeCount;
  final int viewCount;
  final int shareCount;
  final bool likedByMe;
  final HomeShareMetadataView shareMetadata;

  /// Whether this card drives an inline audio preview.
  bool get hasAudioPreview =>
      contentType.isAudio && (audioPreviewUrl ?? '').trim().isNotEmpty;

  /// Whether the merchandising pill renders. BOTH the kind and the server's copy
  /// must be present — a badge with no authored label draws nothing at all,
  /// rather than the client inventing a word for it.
  bool get hasBadge => badge != null && (badgeLabel ?? '').trim().isNotEmpty;

  HomeFeedItemView copyWith({
    int? likeCount,
    int? viewCount,
    int? shareCount,
    bool? likedByMe,
  }) =>
      HomeFeedItemView(
        id: id,
        contentType: contentType,
        module: module,
        title: title,
        subtitle: subtitle,
        mediaUrl: mediaUrl,
        audioPreviewUrl: audioPreviewUrl,
        ctaLabel: ctaLabel,
        ctaDestinationType: ctaDestinationType,
        ctaDestinationValue: ctaDestinationValue,
        ctaContentId: ctaContentId,
        headerDestinationModule: headerDestinationModule,
        label: label,
        badge: badge,
        badgeLabel: badgeLabel,
        likeCount: likeCount ?? this.likeCount,
        viewCount: viewCount ?? this.viewCount,
        shareCount: shareCount ?? this.shareCount,
        likedByMe: likedByMe ?? this.likedByMe,
        shareMetadata: shareMetadata,
      );

  /// Contract → domain. Returns `null` for an unknown `contentType` so the
  /// caller can skip the item forward-compatibly.
  static HomeFeedItemView? fromItem(HomeFeedItem i) {
    final type = HomeContentType.fromWire(i.contentType.value);
    if (type == null) return null;
    // The pill is all-or-nothing. An unknown badge kind drops to `null`, and its
    // copy MUST drop with it — otherwise a future CMS badge this build can't
    // classify would still paint its text in a pill it can't style.
    final badge = HomeBadge.fromWire(i.badge?.value);
    return HomeFeedItemView(
      id: i.id,
      contentType: type,
      module: i.module,
      title: i.title,
      subtitle: i.subtitle,
      mediaUrl: i.mediaUrl,
      audioPreviewUrl: i.audioPreviewUrl,
      ctaLabel: i.ctaLabel,
      ctaDestinationType: i.ctaDestinationType,
      ctaDestinationValue: i.ctaDestinationValue,
      ctaContentId: i.ctaContentId,
      headerDestinationModule: i.headerDestinationModule,
      label: i.label,
      badge: badge,
      badgeLabel: badge == null ? null : i.badgeLabel,
      likeCount: i.likeCount,
      viewCount: i.viewCount,
      shareCount: i.shareCount,
      likedByMe: i.likedByMe,
      shareMetadata: HomeShareMetadataView.fromMetadata(i.shareMetadata),
    );
  }
}

/// One cursor-paginated page of the mixed feed.
@immutable
class HomeFeedPage {
  const HomeFeedPage({required this.items, required this.nextCursor});

  /// Server order is authoritative and MIXED — never re-sorted or grouped by
  /// contentType on the client (#EXPORT_CRITICAL / PRD §10).
  final List<HomeFeedItemView> items;

  /// `null` == last page.
  final String? nextCursor;

  bool get hasMore => (nextCursor ?? '').isNotEmpty;
}

/// Result of a like toggle (`POST /home/engagement/like`).
@immutable
class HomeLikeOutcome {
  const HomeLikeOutcome({required this.liked, required this.likeCount});
  final bool liked;
  final int likeCount;
}
