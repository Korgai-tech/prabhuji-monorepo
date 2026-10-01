import 'app_config.dart';
import 'deep_link_parser.dart';

/// Constructs share URLs from typed [DeepLinkTarget]s (TAM-124).
///
/// The inverse of `deep_link_parser.dart`. There are TWO builders — one per
/// scheme — because the two schemes serve different audiences:
///
///   * [buildShareUrl] emits `https://<shareHost>/app/<type>[/<id>]` — the
///     HTTPS App Link used for every user-facing share. Messaging apps
///     render the OG preview from the landing page and, once installed,
///     open the app directly.
///
///   * [buildCustomSchemeUrl] emits `prabhuji://<type>[/<id>]` — the custom
///     scheme used for internal entry points only: push notification
///     payloads, dev testing via `adb shell`, in-app hand-offs. NEVER put
///     this in a share_plus payload — messaging apps silently swallow it.
///
/// Path structure is identical between the two so the parser accepts
/// either form and downstream code doesn't branch on the scheme.
///
/// Query parameter injection (e.g. `?ref=<user>&utm_source=whatsapp`) is
/// [attribution] — passed as a map, appended if non-empty. This is the ONE
/// place attribution is added: parser preserves whatever's on the incoming
/// URI, builder writes whatever the caller passes.

/// Emit the public HTTPS App Link for [target]. Use this for every user-
/// facing share. Requires `AppConfig.instance.shareHost` to be initialized.
String buildShareUrl(
  DeepLinkTarget target, {
  Map<String, String> attribution = const {},
}) {
  final (type, id) = _typeAndId(target);
  final path = id == null ? '/$type' : '/$type/$id';
  return _appendAttribution(
    '${AppConfig.instance.shareHost}/app$path',
    attribution,
  );
}

/// Emit the internal custom-scheme URL for [target]. Use this for push
/// notification payloads and dev testing — NEVER for external shares.
String buildCustomSchemeUrl(
  DeepLinkTarget target, {
  Map<String, String> attribution = const {},
}) {
  final (type, id) = _typeAndId(target);
  final base = id == null ? 'prabhuji://$type' : 'prabhuji://$type/$id';
  return _appendAttribution(base, attribution);
}

/// The (type, id?) pair used by both schemes. `UnknownDeepLink` is not
/// shareable — there's nothing to link to; guarded with an assertion so
/// callers who try get a loud failure rather than a silent bad URL.
(String, String?) _typeAndId(DeepLinkTarget target) {
  return switch (target) {
    StatusDeepLink(:final id) => ('status', id),
    AartiDeepLink(:final audioId) => ('aarti', audioId),
    MantraDeepLink(:final audioId) => ('mantra', audioId),
    BookDeepLink(:final contentId) => ('book', contentId),
    HoroscopeDeepLink(:final zodiacId) => ('horoscope', zodiacId),
    RingtoneDeepLink(:final id) => ('ringtone', id),
    WallpaperDeepLink(:final id) => ('wallpaper', id),
    PaywallDeepLink() => ('pro', null),
    HomeDeepLink() => ('home', null),
    // PaymentReturnDeepLink is a provider→app bounce URL, not a shareable
    // target. Nothing composes a share URL to it; the API layer builds
    // the return URL as a plain string (see `CASHFREE_RETURN_URL`). We
    // still handle the case so a caller who tries gets a loud failure
    // rather than the exhaustive-switch analyzer error, and so the
    // sealed hierarchy stays exhaustive by construction.
    PaymentReturnDeepLink() =>
      throw ArgumentError('Cannot build share URL for PaymentReturnDeepLink'),
    UnknownDeepLink() =>
      throw ArgumentError('Cannot build share URL for UnknownDeepLink'),
  };
}

/// Append `?k=v&k=v` iff [attribution] is non-empty. Uses
/// `Uri.encodeQueryComponent` so `?ref=user@example.com` becomes
/// `?ref=user%40example.com`.
String _appendAttribution(String base, Map<String, String> attribution) {
  if (attribution.isEmpty) return base;
  final query = attribution.entries
      .map((e) =>
          '${Uri.encodeQueryComponent(e.key)}=${Uri.encodeQueryComponent(e.value)}')
      .join('&');
  return '$base?$query';
}
