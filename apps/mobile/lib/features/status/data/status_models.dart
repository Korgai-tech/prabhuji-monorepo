import 'package:meta/meta.dart';

import '../../../api/generated/openapi.dart';

/// Domain models for the Status module (TAM-72), mapped from the generated
/// api-client types (TAM-71 contract) — never raw `dynamic`. Wire enums are
/// resolved through `fromWire` so the UI branches on a Dart enum, not a string.

/// Still image vs muted-loop video status.
enum StatusMediaType {
  image,
  video;

  static StatusMediaType fromWire(String value) =>
      value == 'video' ? StatusMediaType.video : StatusMediaType.image;

  bool get isVideo => this == StatusMediaType.video;
}

/// Which overlay profile is active. Exactly one drives the overlay everywhere
/// (TAM-71 flips it on save) — the feed never holds per-card profile state.
enum StatusProfileType {
  personal,
  business;

  static StatusProfileType fromWire(String value) =>
      value == 'business' ? StatusProfileType.business : StatusProfileType.personal;

  String get wire => name;

  StatusProfileBodyActiveProfileTypeEnum get body =>
      this == StatusProfileType.business
          ? StatusProfileBodyActiveProfileTypeEnum.business
          : StatusProfileBodyActiveProfileTypeEnum.personal;
}

/// Normalized overlay insets (TAM-71 `overlaySafeArea`) — **fractions of the
/// media box**, not pixels (seed: `{top:0.1, bottom:0.14, left:0.05,
/// right:0.05}`). The client composites the overlay strictly inside these so it
/// never covers a deity's face (PRD §6.7).
@immutable
class StatusSafeArea {
  const StatusSafeArea({
    required this.top,
    required this.bottom,
    required this.left,
    required this.right,
  });

  /// The Figma band (node I330:6125;322:1743 = 63.83 of the 448.69 hero
  /// = 0.1423) — the fallback when a card ships a zeroed/invalid safe area.
  static const StatusSafeArea figmaDefault =
      StatusSafeArea(top: 0.1, bottom: 0.1423, left: 0.0333, right: 0.0333);

  /// The smallest `bottom` fraction that can still hold the overlay's two text
  /// lines + padding at the design's media height (~449pt → ~22pt). Anything
  /// smaller is treated as unconfigured rather than squeezed into an unreadable
  /// sliver, and falls back to [figmaDefault].
  static const double minUsableBottom = 0.05;

  final double top;
  final double bottom;
  final double left;
  final double right;

  /// A card with no usable band (zeroed, degenerate, or out of range) falls back
  /// to the Figma band rather than rendering the overlay off-media.
  ///
  /// NOTE: a usable band's height is taken from [bottom] VERBATIM — the contract
  /// is the authority once it clears this check, so the client never silently
  /// overrides a CMS-configured band.
  bool get isUsable =>
      bottom >= minUsableBottom &&
      bottom <= 1 &&
      left >= 0 &&
      left < 1 &&
      right >= 0 &&
      right < 1;

  StatusSafeArea get orFigmaDefault => isUsable ? this : figmaDefault;

  factory StatusSafeArea.fromWire(StatusOverlaySafeArea a) => StatusSafeArea(
        top: a.top.toDouble(),
        bottom: a.bottom.toDouble(),
        left: a.left.toDouble(),
        right: a.right.toDouble(),
      );

  @override
  bool operator ==(Object other) =>
      other is StatusSafeArea &&
      other.top == top &&
      other.bottom == bottom &&
      other.left == left &&
      other.right == right;

  @override
  int get hashCode => Object.hash(top, bottom, left, right);
}

/// Who a status is attributed to (TAM-N).
///
/// Server-side this is always the single "house creator" account, because the
/// status catalogue is CMS-authored deity content with no real author. The app
/// does not know or care about that: it renders whatever the server attributes
/// the card to, so when genuine user-generated status arrives nothing here
/// changes.
@immutable
class StatusCreatorInfo {
  const StatusCreatorInfo({
    required this.id,
    required this.name,
    required this.avatarUrl,
  });

  /// The reportable account id. Never sent back on a report — the server
  /// resolves it from the status — but carried so the UI can key off it.
  final String id;

  final String name;

  /// Null until the real asset is uploaded; the chip falls back to a glyph.
  final String? avatarUrl;

  factory StatusCreatorInfo.fromWire(StatusCreator c) => StatusCreatorInfo(
        id: c.id,
        name: c.name,
        avatarUrl: (c.avatarUrl ?? '').trim().isEmpty ? null : c.avatarUrl,
      );
}

/// A single status as it appears in the vertical feed (`GET /status/feed`).
/// Immutable; [copyWith] applies the optimistic like/view updates.
@immutable
class StatusFeedItem {
  const StatusFeedItem({
    required this.id,
    required this.slug,
    required this.title,
    required this.mediaType,
    required this.imageUrl,
    required this.videoUrl,
    required this.thumbnailUrl,
    required this.overlaySafeArea,
    required this.deitySlug,
    required this.deityName,
    required this.languages,
    required this.shareCaption,
    required this.creator,
    required this.likeCount,
    required this.viewCount,
    required this.likedByMe,
  });

  final String id;
  final String slug;
  final String title;
  final StatusMediaType mediaType;
  final String? imageUrl;
  final String? videoUrl;
  final String thumbnailUrl;
  final StatusSafeArea overlaySafeArea;

  /// The single deity this status belongs to — one deity per asset (TAM-108),
  /// nullable when uncategorised. [deitySlug] is the stable content tag
  /// (`deities.slug` — `hanuman`, `krishna`, …) used for analytics and
  /// routing; [deityName] is the localized display label. The internal deity
  /// uuid is never served to the app.
  final String? deitySlug;
  final String? deityName;

  /// Languages this status is available in (TAM-108). Empty = all languages.
  final List<String> languages;
  final String? shareCaption;

  /// Who this status is attributed to — drives the credit chip and is the
  /// account a "Report User" report targets.
  ///
  /// NULL only when the item did not come from the status contract. The Home
  /// feed synthesizes `StatusFeedItem`s out of `HomeFeedItemView` rows
  /// (`_statusFeedItemFromHome`), and that feed is module-agnostic — it carries
  /// no creator at all. Such an item must show no credit chip rather than a
  /// fabricated one, because a fabricated identity would be unreportable: the
  /// server resolves the reported account from the status id, so a chip over an
  /// item the status module does not know about could only produce a 404.
  final StatusCreatorInfo? creator;

  final int likeCount;
  final int viewCount;
  final bool likedByMe;

  bool get isVideo => mediaType.isVideo;

  /// The still shown for an image card, and the poster/fallback for a video
  /// card (also the frame the video share composites onto — see
  /// `StatusRenderService`).
  String get stillUrl {
    final img = (imageUrl ?? '').trim();
    if (!isVideo && img.isNotEmpty) return img;
    return thumbnailUrl;
  }

  /// The muted-loop source; `null` when this card has no playable video.
  String? get playableVideoUrl {
    if (!isVideo) return null;
    final url = (videoUrl ?? '').trim();
    return url.isEmpty ? null : url;
  }

  /// The caption the share sheet carries (server copy wins; falls back to the
  /// title so a share is never captionless).
  String get caption {
    final c = (shareCaption ?? '').trim();
    return c.isNotEmpty ? c : title;
  }

  factory StatusFeedItem.fromCard(StatusCard c) => StatusFeedItem(
        id: c.id,
        slug: c.slug,
        title: c.title,
        mediaType: StatusMediaType.fromWire(c.mediaType.value),
        imageUrl: c.imageUrl,
        videoUrl: c.videoUrl,
        thumbnailUrl: c.thumbnailUrl,
        overlaySafeArea: StatusSafeArea.fromWire(c.overlaySafeArea),
        deitySlug: c.deitySlug,
        deityName: c.deityName,
        languages: List<String>.unmodifiable(c.languages),
        shareCaption: c.shareCaption,
        creator: StatusCreatorInfo.fromWire(c.creator),
        likeCount: c.likeCount,
        viewCount: c.viewCount,
        likedByMe: c.likedByMe,
      );

  StatusFeedItem copyWith({
    int? likeCount,
    int? viewCount,
    bool? likedByMe,
  }) =>
      StatusFeedItem(
        id: id,
        slug: slug,
        title: title,
        mediaType: mediaType,
        imageUrl: imageUrl,
        videoUrl: videoUrl,
        thumbnailUrl: thumbnailUrl,
        overlaySafeArea: overlaySafeArea,
        deitySlug: deitySlug,
        deityName: deityName,
        languages: languages,
        shareCaption: shareCaption,
        creator: creator,
        likeCount: likeCount ?? this.likeCount,
        viewCount: viewCount ?? this.viewCount,
        likedByMe: likedByMe ?? this.likedByMe,
      );
}

/// One page of the feed (`GET /status/feed`) with cursor pagination.
@immutable
class StatusFeedPage {
  const StatusFeedPage({required this.items, required this.nextCursor});

  final List<StatusFeedItem> items;
  final String? nextCursor;

  bool get hasMore => (nextCursor ?? '').isNotEmpty;
}

/// The user's overlay profile (`GET/PUT /status/profile`). ONE profile drives
/// the overlay across the whole feed; [activeProfileType] selects which face of
/// it renders.
@immutable
class StatusProfileData {
  const StatusProfileData({
    required this.activeProfileType,
    this.personalDisplayName,
    this.businessName,
    this.businessDetails,
    this.businessMobileNumber,
    this.avatarImageUrl,
    this.updatedAt,
  });

  /// The default the API returns when nothing is saved yet.
  static const StatusProfileData empty =
      StatusProfileData(activeProfileType: StatusProfileType.personal);

  final StatusProfileType activeProfileType;
  final String? personalDisplayName;
  final String? businessName;
  final String? businessDetails;
  final String? businessMobileNumber;
  final String? avatarImageUrl;
  final String? updatedAt;

  bool get isBusiness => activeProfileType == StatusProfileType.business;

  /// Whether the profile has EITHER a saved name OR a saved photo — the TAM-168
  /// gate that decides whether the on-screen band shows the tappable "add
  /// details" prompt or the filled overlay, AND whether an export burns the
  /// overlay band into the shared file. Business fields are ignored: after
  /// TAM-168 the mobile app only ever renders the personal face (see
  /// `docs`/spec §PATH_DECISION — grandfathered business rows are read as
  /// personal, never rewritten).
  bool get hasNameOrPhoto => hasName || hasPhoto;

  /// Whether a personal display name is saved. The first half of
  /// [hasNameOrPhoto], exposed on its own so the share funnel can report
  /// WHICH detail the user had (`has_name` / `has_photo`) rather than only
  /// the OR of the pair — the question TAM-168 left unanswerable when it
  /// stopped bouncing empty-profile users to the details editor.
  ///
  /// Business fields are deliberately excluded, exactly as [hasNameOrPhoto]
  /// excludes them: after TAM-168 mobile only renders the personal face, so
  /// a grandfathered business-only row reports `false` here — matching what
  /// actually gets burned into the export.
  bool get hasName => (personalDisplayName ?? '').trim().isNotEmpty;

  /// Whether an avatar is saved. The second half of [hasNameOrPhoto]; see
  /// [hasName].
  bool get hasPhoto => (avatarImageUrl ?? '').trim().isNotEmpty;

  /// Legacy alias — kept only for wire back-compat inside the model layer; UI
  /// and gate call sites use [hasNameOrPhoto]. TAM-168 removed every UI
  /// reference.
  @Deprecated('Use hasNameOrPhoto (TAM-168 — details are optional on share).')
  bool get hasActiveDetails => hasNameOrPhoto;

  /// Overlay line 1 — the saved personal name. Empty/null means the user has
  /// only a photo saved (or nothing saved); the overlay widget renders a
  /// zero-width row in that case to keep the band's baseline metrics stable
  /// (TAM-168 photo-only fix). Business fields are never rendered on mobile
  /// after TAM-168.
  String? get overlayTitle {
    final t = (personalDisplayName ?? '').trim();
    return t.isEmpty ? null : t;
  }

  factory StatusProfileData.fromWire(StatusProfile p) => StatusProfileData(
        activeProfileType: StatusProfileType.fromWire(p.activeProfileType.value),
        personalDisplayName: p.personalDisplayName,
        businessName: p.businessName,
        businessDetails: p.businessDetails,
        businessMobileNumber: p.businessMobileNumber,
        avatarImageUrl: p.avatarImageUrl,
        updatedAt: p.updatedAt,
      );

  StatusProfileData copyWith({
    StatusProfileType? activeProfileType,
    String? personalDisplayName,
    String? businessName,
    String? businessDetails,
    String? businessMobileNumber,
    String? avatarImageUrl,
  }) =>
      StatusProfileData(
        activeProfileType: activeProfileType ?? this.activeProfileType,
        personalDisplayName: personalDisplayName ?? this.personalDisplayName,
        businessName: businessName ?? this.businessName,
        businessDetails: businessDetails ?? this.businessDetails,
        businessMobileNumber: businessMobileNumber ?? this.businessMobileNumber,
        avatarImageUrl: avatarImageUrl ?? this.avatarImageUrl,
        updatedAt: updatedAt,
      );
}


/// Result of a like toggle (server-authoritative, TAM-71 `/like`).
@immutable
class StatusLikeOutcome {
  const StatusLikeOutcome({required this.liked, required this.likeCount});
  final bool liked;
  final int likeCount;
}

// ---------------------------------------------------------------------------
// Client-side validation — MIRRORS the TAM-71 Zod schema so the user gets
// inline feedback before the round-trip. The server stays the source of truth.
// Limits quoted from apps/api/openapi.json (StatusProfileBody):
//   personalDisplayName maxLength 40 · businessName 50 · businessDetails 80
//   businessMobileNumber pattern ^[6-9]\d{9}$
// ---------------------------------------------------------------------------

/// Field limits, mirrored from the contract (spec q6).
class StatusLimits {
  StatusLimits._();

  static const int personalName = 40;
  static const int businessName = 50;
  static const int businessDetails = 80;
  static const int mobileDigits = 10;
}

/// The server's Indian-mobile rule: exactly 10 digits starting 6–9.
final RegExp kIndianMobile = RegExp(r'^[6-9]\d{9}$');

/// Validate the personal name. Returns an error string, or `null` when valid.
/// Required on a personal save (there is nothing to overlay otherwise).
String? validatePersonalName(String? value) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return 'Please enter your name';
  if (v.length > StatusLimits.personalName) {
    return 'Name must be ${StatusLimits.personalName} characters or less';
  }
  return null;
}

/// Business name — REQUIRED for a business save (PRD §6.6).
String? validateBusinessName(String? value) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return 'Please enter your business name';
  if (v.length > StatusLimits.businessName) {
    return 'Business name must be ${StatusLimits.businessName} characters or less';
  }
  return null;
}

/// Business details — optional, capped at 80.
String? validateBusinessDetails(String? value) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return null;
  if (v.length > StatusLimits.businessDetails) {
    return 'Business details must be ${StatusLimits.businessDetails} characters or less';
  }
  return null;
}

/// Business mobile — OPTIONAL, but must be a valid Indian 10-digit number when
/// present. No OTP (PRD §6.6).
String? validateBusinessMobile(String? value) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return null;
  if (!kIndianMobile.hasMatch(v)) return 'Enter a valid 10-digit mobile number';
  return null;
}

/// Indian compact-count formatting (Figma "24K", "1.4L"; nodes
/// I330:6125;322:1728 / 322:1735):
///  * `< 1000`        → plain (`99`, `842`)
///  * `1_000..99_999` → thousands with `K` (`1K`, `24K`, `12.5K`)
///  * `>= 100_000`    → lakhs with `L` (`1.4L`)
/// One decimal place, trailing `.0` trimmed.
String formatStatusCount(int value) {
  if (value <= 0) return '0';
  if (value < 1000) return '$value';
  if (value < 100000) return '${_trim(value / 1000)}K';
  return '${_trim(value / 100000)}L';
}

String _trim(double v) {
  final s = v.toStringAsFixed(1);
  return s.endsWith('.0') ? s.substring(0, s.length - 2) : s;
}
