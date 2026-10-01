/// Typed sealed deep-link targets + a pure parser (TAM-124).
///
/// Accepts both:
///   - Custom scheme: `prabhuji://<type>[/<id>][?ref=…]`
///     Used internally — push notification payloads, `adb shell`, in-app
///     hand-offs, future app-to-app integrations. Never shared externally.
///   - HTTPS App Link: `https://<shareHost>/app/<type>[/<id>][?ref=…]`
///     Used for every user-facing share.
///
/// One parser handles both — path structure is intentionally identical
/// across schemes so downstream code (deep_link_service, router) never
/// branches on the URL flavour.
///
/// ## Bare module links (TAM-259)
///
/// The id is OPTIONAL on every content target: `prabhuji://ringtone` means the
/// ringtone module's own screen, `prabhuji://ringtone/<id>` means that one
/// ringtone. A bare slug used to be [UnknownDeepLink] and land on `/home`,
/// which made "open this module" inexpressible — and silently so, because
/// falling back to Home is exactly what a working link to Home looks like.
///
/// This is what lets the server hand the app a landing (TAM-258): the landing
/// for a status ad is the Status module, not one status item.
///
/// The parser is PURE (`Uri` → sealed target), NEVER throws, and NEVER
/// touches Flutter or IO — that makes it unit-testable in isolation. Every
/// failure mode (unknown type, missing required id, unrecognized scheme,
/// bare URI) collapses to [UnknownDeepLink] so the caller can log the
/// reason without a try/catch tax on the happy path.
///
/// Query params (`?ref=<sharer_id>`, `?utm_source=whatsapp`, …) are
/// preserved verbatim on every target as an unmodifiable [attribution]
/// map. They are ONLY read by analytics — never used for routing — so a
/// malicious `?ref=<garbage>` can never influence which screen opens.
library;

/// Base class for every parsed deep-link target. Sealed → downstream
/// switches are exhaustive at compile time and adding a new variant fails
/// the analyzer at every consumption site until they're all handled.
sealed class DeepLinkTarget {
  const DeepLinkTarget({this.attribution = const {}});

  /// Verbatim query params from the source URI. Unmodifiable; empty when
  /// the URI carried no query string. Emitted on the
  /// `deep_link_received` analytics event; NEVER used for routing.
  final Map<String, String> attribution;

  /// The `type` slug used in URLs (`aarti`, `book`, `pro`, …). Matches the
  /// keys in `ShareCopy.messageByType` + the second path segment of the
  /// HTTPS variant.
  String get typeSlug;
}

/// `prabhuji://status` — the Status module. `prabhuji://status/<id>` — that
/// module with one item named: it lands on the same feed with the id carried
/// as `?highlight=`, which the feed captures for analytics but does not yet
/// scroll to (follow-up per TAM-124 #PLAN_UNCERTAINTY on status target).
///
/// So for Status the two readings differ only in the query today. They are
/// still kept distinct, because the id is a promise to the sharer that the
/// follow-up will honour, and collapsing them would quietly discard it.
final class StatusDeepLink extends DeepLinkTarget {
  const StatusDeepLink({this.id, super.attribution});

  /// `null` = the module itself, no item named.
  final String? id;
  @override
  String get typeSlug => 'status';
}

/// `prabhuji://aarti` — the Aarti & Bhajans module home.
/// `prabhuji://aarti/<audioId>` — the existing `/aarti-bhajans/audio/<id>`
/// deep-link screen.
final class AartiDeepLink extends DeepLinkTarget {
  const AartiDeepLink({this.audioId, super.attribution});

  /// `null` = the module itself, no item named.
  final String? audioId;
  @override
  String get typeSlug => 'aarti';
}

/// `prabhuji://mantra` — the Mantras module home.
/// `prabhuji://mantra/<audioId>` / `krutyug.ai/app/mantra/<audioId>` —
/// routes to `/mantras/audio/<audioId>`, the module's own deep-link
/// resolver (it refreshes entitlement, then lands Pro users in the full
/// player and free users on the module home).
///
/// Singular `mantra` — the type slug is the content noun, matching
/// `aarti` / `book` / `ringtone`; the ROUTE is plural (`/mantras/...`)
/// because that's the module path locked in before TAM-124.
final class MantraDeepLink extends DeepLinkTarget {
  const MantraDeepLink({this.audioId, super.attribution});

  /// `null` = the module itself, no item named.
  final String? audioId;
  @override
  String get typeSlug => 'mantra';
}

/// `prabhuji://book` — the Books module home (discovery is free, PRD §2).
/// `prabhuji://book/<contentId>` — routes to `/books/contents/<id>`. Book
/// contents/reader are Pro-gated server-side; a non-Pro user hitting a book
/// deep link will (a) see the paywall interstitial first, then (b) still get
/// a 403 from the contents endpoint if they dismissed without paying.
final class BookDeepLink extends DeepLinkTarget {
  const BookDeepLink({this.contentId, super.attribution});

  /// `null` = the module itself, no item named.
  final String? contentId;
  @override
  String get typeSlug => 'book';
}

/// `prabhuji://horoscope` — the Rashifal zodiac grid.
/// `prabhuji://horoscope/<zodiacId>` — routes to
/// `/horoscope/result/<zodiacId>`. Router's own zodiac-id allowlist still
/// applies; an unknown id bounces to the horoscope grid (`/horoscope`).
final class HoroscopeDeepLink extends DeepLinkTarget {
  const HoroscopeDeepLink({this.zodiacId, super.attribution});

  /// `null` = the grid itself, no sign named.
  final String? zodiacId;
  @override
  String get typeSlug => 'horoscope';
}

/// `prabhuji://ringtone` — the Ringtones module home (search + deity filter +
/// grid), which is free. `prabhuji://ringtone/<id>` — the Pro-only preview of
/// one ringtone at `/ringtones/preview/<id>`.
///
/// The two readings differ in what they cost the recipient, which is the
/// reason a bare module link is worth having: it is the one an ad can send
/// every arrival to.
final class RingtoneDeepLink extends DeepLinkTarget {
  const RingtoneDeepLink({this.id, super.attribution});

  /// `null` = the module itself, no item named.
  final String? id;
  @override
  String get typeSlug => 'ringtone';
}

/// `prabhuji://wallpaper` — the Wallpaper module home.
/// `prabhuji://wallpaper/<id>` — the same home with `?highlight=<id>`, until
/// the preview route accepts a URL param (currently `extra`-only).
final class WallpaperDeepLink extends DeepLinkTarget {
  const WallpaperDeepLink({this.id, super.attribution});

  /// `null` = the module itself, no item named.
  final String? id;
  @override
  String get typeSlug => 'wallpaper';
}

/// `prabhuji://pro` — opens the paywall directly. Has no id.
final class PaywallDeepLink extends DeepLinkTarget {
  const PaywallDeepLink({super.attribution});
  @override
  String get typeSlug => 'pro';
}

/// `prabhuji://home` / `krutyug.ai/app/home` — opens the home tab. Has no
/// id. Home is the app's free discovery surface (PRD §5, NOT Pro-gated) so
/// the DeepLinkService skips the paywall interstitial for this target — see
/// `DeepLinkService.handleUri`.
final class HomeDeepLink extends DeepLinkTarget {
  const HomeDeepLink({super.attribution});
  @override
  String get typeSlug => 'home';
}

/// `prabhuji://payment/return` / `krutyug.ai/app/payment/return` — the
/// return URL Cashfree's hosted authorization page (and, once Part B lands,
/// Decentro's SDK callback fallback) redirects to after the user finishes
/// the UPI mandate approval. Carries no path id; the query string may
/// carry `provider=cashfree|decentro` and `mandateId=…` as attribution
/// only — routing does not depend on them.
///
/// The DeepLinkService handles this target specially:
///   * It NEVER passes through the paywall-interstitial gate (a
///     payment-return link is not a Pro-gated destination; it IS the
///     paywall's own resume signal).
///   * It fires the injected `onPaymentReturn` callback so the currently
///     mounted `PaymentBloc` restarts its poll budget IMMEDIATELY rather
///     than waiting on Android's lifecycle-resume path (which is flaky
///     when the flow hopped through a browser tab or a hosted checkout
///     page).
///   * It navigates to `/paywall` if the user isn't already there.
final class PaymentReturnDeepLink extends DeepLinkTarget {
  const PaymentReturnDeepLink({super.attribution});
  @override
  String get typeSlug => 'payment-return';
}

/// Fallback for anything the parser doesn't recognize: unknown types,
/// missing required ids, malformed schemes, bare `prabhuji://`. The
/// [reason] is a short human-readable string suitable for logging; the
/// service layer routes UnknownDeepLink to `/home`.
final class UnknownDeepLink extends DeepLinkTarget {
  const UnknownDeepLink({
    super.attribution,
    this.reason = '',
    this.rawUri,
  });

  /// Why the parse failed (e.g. `"missing id for aarti"`,
  /// `"unknown type: xyz"`). Log-only.
  final String reason;

  /// The URI that failed to parse. Held for logging; never rendered.
  final Uri? rawUri;

  @override
  String get typeSlug => 'unknown';
}

/// The absolute App Link for the URI go_router hands a `/app/*` redirect.
///
/// `GoRouterState.uri` for a platform-delivered App Link is ALREADY absolute
/// (`https://krutyug.ai/app/aarti/<id>` — observed on device, go_router
/// 17.3). It was previously assumed relative and prefixed with the share
/// host, producing `https://krutyug.aihttps//krutyug.ai/app/...`, which the
/// parser rightly rejects as [UnknownDeepLink] — so every App Link cold
/// start was redirected to `/home` regardless of its target or of whether
/// the user was logged in.
///
/// Handles both shapes, so a relative location (an in-app `go('/app/...')`)
/// still works.
Uri absoluteAppLink(Uri routeUri, {required String shareHost}) {
  if (routeUri.hasScheme) return routeUri;
  return Uri.parse('$shareHost$routeUri');
}

/// Parse a [uri] into a [DeepLinkTarget]. NEVER throws — every failure
/// path returns an [UnknownDeepLink] with a reason. The parser doesn't
/// know about routes, screens, or entitlements; it only knows the URL
/// contract.
DeepLinkTarget parseDeepLink(Uri uri) {
  final attribution = Map<String, String>.unmodifiable(uri.queryParameters);

  final (type, id) = _extractTypeAndId(uri);
  if (type == null || type.isEmpty) {
    return UnknownDeepLink(
      rawUri: uri,
      reason: 'unrecognized deep-link URI',
      attribution: attribution,
    );
  }

  switch (type) {
    // Every content slug takes an OPTIONAL id: bare = the module's own screen,
    // with an id = that item. `UnknownDeepLink` is reserved for slugs we do not
    // know at all, which is the only case where "land on Home" is honest.
    case 'status':
      return StatusDeepLink(id: id, attribution: attribution);
    case 'aarti':
      return AartiDeepLink(audioId: id, attribution: attribution);
    case 'mantra':
      return MantraDeepLink(audioId: id, attribution: attribution);
    case 'book':
      return BookDeepLink(contentId: id, attribution: attribution);
    case 'horoscope':
      return HoroscopeDeepLink(zodiacId: id, attribution: attribution);
    case 'ringtone':
      return RingtoneDeepLink(id: id, attribution: attribution);
    case 'wallpaper':
      return WallpaperDeepLink(id: id, attribution: attribution);
    case 'pro':
      // Paywall carries no id; a `prabhuji://pro/anything` is still routed
      // to the paywall (the trailing segment is ignored, not an error).
      return PaywallDeepLink(attribution: attribution);
    case 'home':
      // Home carries no id; any trailing segment is ignored (matches the
      // `pro` shape). Landing page composes `<shareHost>/app/home` when
      // the sharer wants to point recipients at the app's discovery surface
      // rather than a specific piece of content.
      return HomeDeepLink(attribution: attribution);
    case 'payment':
      // `prabhuji://payment/return[?provider=…&mandateId=…]` or
      // `https://<shareHost>/app/payment/return[?…]`. The trailing segment
      // must be `return` — any other subtype (a future `payment/receipt`,
      // `payment/history`, …) is deliberately UnknownDeepLink until it
      // gets its own case, so a typo in a provider's return-URL config
      // never silently falls through to /home. Query params (provider,
      // mandateId) ride on `attribution` for analytics only; routing does
      // not read them.
      return id == 'return'
          ? PaymentReturnDeepLink(attribution: attribution)
          : UnknownDeepLink(
              rawUri: uri,
              reason: 'unknown payment subtype: $id',
              attribution: attribution,
            );
    default:
      return UnknownDeepLink(
        rawUri: uri,
        reason: 'unknown type: $type',
        attribution: attribution,
      );
  }
}

/// Normalizes both URL flavours into a `(type, id?)` pair. Returns
/// `(null, null)` if the URI isn't a recognizable deep link.
///
/// prabhuji://status/abc  → host="status", pathSegments=["abc"]  → ("status", "abc")
/// prabhuji://pro         → host="pro",    pathSegments=[]        → ("pro", null)
/// prabhuji://home        → host="home",   pathSegments=[]        → ("home", null)
/// https://krutyug.ai/app/status/abc → pathSegments=["app","status","abc"] → ("status", "abc")
/// https://krutyug.ai/app/pro        → pathSegments=["app","pro"]          → ("pro", null)
/// https://krutyug.ai/app/home       → pathSegments=["app","home"]         → ("home", null)
/// anything else          → (null, null)
(String?, String?) _extractTypeAndId(Uri uri) {
  // Filter out empty segments left by trailing slashes (Uri.pathSegments
  // returns `["abc", ""]` for `/abc/`).
  final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();

  if (uri.scheme == 'prabhuji') {
    if (uri.host.isEmpty) return (null, null);
    return (
      uri.host,
      segments.isNotEmpty ? segments.first : null,
    );
  }

  if (uri.scheme == 'https' && segments.length >= 2 && segments.first == 'app') {
    return (
      segments[1],
      segments.length >= 3 ? segments[2] : null,
    );
  }

  return (null, null);
}
