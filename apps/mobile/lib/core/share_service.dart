import 'dart:io';

import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// What a module hands the [ShareService]: a caption + a deep link (+ optional
/// public thumbnail image). By construction there is **no** media-file field —
/// the interface shape enforces "deep link + thumbnail, never a raw media file"
/// (TAM-58 AC-f, Aarti PRD §share). Sharing the audio/video/wallpaper binary is
/// impossible through this API.
class ShareContent {
  const ShareContent({
    required this.text,
    required this.deepLink,
    this.thumbnailUrl,
    this.subject,
  });

  /// Caption / message body (e.g. "🙏 Listen to this Hanuman Aarti on Prabhuji").
  final String text;

  /// The deep link back into the app (e.g. `prabhuji://aarti-bhajans/audio/42`).
  /// Passed in by the caller per the module's route convention. Required — a
  /// share always carries a link, never a file.
  final String deepLink;

  /// Optional PUBLIC thumbnail image URL (poster/cover art) — fetched/cached and
  /// attached as a preview. This is NOT the media binary.
  final String? thumbnailUrl;

  /// Optional subject line (used by email-style targets).
  final String? subject;
}

/// What the Status module hands [ShareService.shareRenderedFile]: a caption plus
/// a file **the app itself rendered**.
///
/// ## Why this exists alongside [ShareContent] (TAM-72)
///
/// [ShareContent] forbids a media file by construction because sharing SOURCE
/// media (an aarti recording, a wallpaper, a ringtone) is a licensing problem —
/// those modules share a deep link instead (TAM-58 AC-f).
///
/// A Status export is categorically different and is the module's entire point:
/// the user's OWN overlay (their name/business + avatar) burned into the status
/// media, which PRD §6.8 requires to be a real file in the share sheet — a deep
/// link cannot carry a burned-in composite into WhatsApp.
///
/// The guarantee is preserved by TYPE, not by omission: [file] is only
/// obtainable from `StatusRenderService`, which exclusively returns composites
/// it just burned the overlay into. There is no path from a CDN/source-media URL
/// to this API, so this method cannot be repurposed to leak source media.
class RenderedShareContent {
  const RenderedShareContent({
    required this.file,
    required this.text,
    required this.mimeType,
    this.subject,
  });

  /// The burned-in export, in app-scoped cache. share_plus publishes it to the
  /// sheet via its own FileProvider content URI — it never reaches public
  /// storage (TAM-72 Data Protection).
  final File file;

  /// Caption / message body accompanying the image.
  final String text;

  /// `image/png` | `image/jpeg` | `video/mp4` (PRD §6.8).
  final String mimeType;

  final String? subject;
}

/// What the OS sheet reported back after a [ShareService.share].
///
/// Deliberately a domain type, not `share_plus`'s `ShareResult`: the SDK stays
/// behind this seam (same rule `lib/core/analytics.dart` applies to Amplitude),
/// so blocs and their tests never import `share_plus`.
enum ShareOutcomeStatus {
  /// The user picked a target. [ShareOutcome.destination] may still be null if
  /// the platform did not name it.
  success,

  /// The user dismissed the sheet without choosing.
  dismissed,

  /// The share happened but the platform cannot report the outcome (iOS/web,
  /// or Android returning the `unavailable` sentinel).
  unavailable,
}

/// Outcome of a native share.
class ShareOutcome {
  const ShareOutcome({required this.status, this.destination});

  final ShareOutcomeStatus status;

  /// The chosen target's raw platform identifier — on Android the component
  /// name (`com.whatsapp/com.whatsapp.ContactPicker`). Null when dismissed or
  /// when the platform doesn't report it. This is an app/component id, never
  /// user data — safe to put in analytics properties.
  final String? destination;

  static const ShareOutcome unavailable =
      ShareOutcome(status: ShareOutcomeStatus.unavailable);
  static const ShareOutcome dismissed =
      ShareOutcome(status: ShareOutcomeStatus.dismissed);
}

/// Native-share seam. Interface + real impl + [FakeShareService] for tests, per
/// flutter-feed-screen.md ("platform-channel boundaries get an interface +
/// fake"). Modules share ONLY through this — WhatsApp-first.
abstract class ShareService {
  /// Link + thumbnail share (Aarti/Mantras/Ringtone/Wallpaper). Never a file.
  ///
  /// Returns the sheet's outcome so a module can report which destination the
  /// user chose (Ringtone does — `ringtone_share_destination_selected`).
  /// Ignoring the result is fine and is what every other module does.
  Future<ShareOutcome> share(ShareContent content);

  /// App-RENDERED file share (Status overlay burn-in). See
  /// [RenderedShareContent] for why this does not weaken [share]'s guarantee.
  Future<void> shareRenderedFile(RenderedShareContent content);
}

/// Real implementation over `share_plus`.
///
/// The payload is IMAGE + caption (never audio/video source media, per
/// [ShareContent]'s type-level guarantee): the recipient's messaging app
/// renders a preview automatically, so shares are visually rich even when
/// the receiver taps into a client that ignores OG meta tags on the URL
/// (e.g. iMessage's summary card, DMs in older WhatsApp).
///
/// Image resolution priority (TAM-124):
///   1. `content.thumbnailUrl` — the server-supplied content thumbnail
///      (aarti cover art, wallpaper still, status media, etc.). Downloaded
///      through `flutter_cache_manager` so a subsequent share hits the disk
///      cache instead of the network.
///   2. Bundled fallback: `assets/onboarding/login-background.png` — the
///      app-icon-quality image the user picked as the canonical OG asset.
///      Applied when the thumbnail URL is missing, empty, or fails to
///      download.
///
/// The fallback is copied to app-scoped cache on first use and pointed at
/// from there — share_plus needs a real file path, not an asset reference.
class SharePlusShareService implements ShareService {
  SharePlusShareService({BaseCacheManager? cacheManager})
      : _cacheManager = cacheManager ?? DefaultCacheManager();

  final BaseCacheManager _cacheManager;

  /// Bundled asset used when the caller supplies no thumbnail (or the
  /// download fails). Cached on disk after first use so subsequent shares
  /// skip the rootBundle round-trip.
  static const _fallbackAsset = 'assets/onboarding/login-background.png';
  static const _fallbackCacheFileName = 'share_fallback_thumbnail.png';
  File? _cachedFallbackFile;

  @override
  Future<ShareOutcome> share(ShareContent content) async {
    final message = content.deepLink.trim().isEmpty
        ? content.text
        : '${content.text}\n\n${content.deepLink}'.trim();

    final resolved = await _resolveShareImage(content.thumbnailUrl);

    // Attach the image via `files:` so the RECIPIENT sees it in-message —
    // `previewThumbnail:` alone only surfaces in the sender's chooser
    // dialog and never leaves the device.
    //
    // MIME type MUST be a specific image type (image/png, image/jpeg),
    // NOT the `image/*` wildcard — WhatsApp's image-caption code path
    // only auto-fills the caption field from `EXTRA_TEXT` when the intent
    // resolves to a concrete image subtype. With `image/*`, WhatsApp
    // treats the intent as an ambiguous stream and drops the text, so
    // recipients see the image with a blank caption. See TAM-124 history.
    //
    // `previewThumbnail:` is deliberately NOT set alongside `files:` —
    // when both are present, share_plus's Android bridge synthesizes a
    // second content URI which some target apps (WhatsApp among them)
    // treat as a multi-attach and further muddle the caption. The image
    // in `files:` already shows in the chooser preview via the OS's own
    // rendering of the shared stream.
    final result = await SharePlus.instance.share(
      ShareParams(
        text: message,
        subject: content.subject,
        files: resolved == null
            ? null
            : [
                XFile(
                  resolved.file.path,
                  mimeType: resolved.mimeType,
                ),
              ],
      ),
    );
    return _toOutcome(result);
  }

  /// Resolve the image to attach: server thumbnail if present + reachable,
  /// bundled fallback otherwise. Never throws — a share must not fail just
  /// because we couldn't fetch an image.
  Future<_ResolvedImage?> _resolveShareImage(String? thumbnailUrl) async {
    final url = thumbnailUrl?.trim();
    if (url != null && url.isNotEmpty) {
      try {
        final file = await _cacheManager.getSingleFile(url);
        return _ResolvedImage(file: file, mimeType: _mimeTypeFor(url));
      } catch (_) {
        // fall through to bundled fallback
      }
    }
    try {
      final fallback = await _bundledFallback();
      return _ResolvedImage(file: fallback, mimeType: 'image/png');
    } catch (_) {
      return null;
    }
  }

  /// Infer a specific `image/<subtype>` MIME from the URL path's extension.
  /// Defaults to `image/jpeg` because that's what most CMS thumbnails are —
  /// a wrong-but-specific guess still beats `image/*` (see the WhatsApp
  /// caption-drop note in [share]).
  static String _mimeTypeFor(String url) {
    final lower = url.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
    // .jpg, .jpeg, or unknown — jpeg is the safest, widest-supported guess.
    return 'image/jpeg';
  }

  /// Copy `assets/onboarding/login-background.png` to app-scoped cache on
  /// first call, then reuse the cached path for every subsequent share.
  Future<File> _bundledFallback() async {
    final cached = _cachedFallbackFile;
    if (cached != null && await cached.exists()) return cached;

    final tmpDir = await getTemporaryDirectory();
    final destination = File('${tmpDir.path}/$_fallbackCacheFileName');
    if (!await destination.exists()) {
      final data = await rootBundle.load(_fallbackAsset);
      await destination.writeAsBytes(data.buffer.asUint8List(), flush: true);
    }
    _cachedFallbackFile = destination;
    return destination;
  }

  /// Maps share_plus's result onto the seam's domain type. `raw` is only a
  /// meaningful destination on a `success` — on Android it's the chosen
  /// component name; elsewhere it's an empty string or the `unavailable`
  /// sentinel, both of which must not be reported as a destination.
  static ShareOutcome _toOutcome(ShareResult result) {
    switch (result.status) {
      case ShareResultStatus.success:
        final raw = result.raw.trim();
        return ShareOutcome(
          status: ShareOutcomeStatus.success,
          destination: raw.isEmpty ? null : raw,
        );
      case ShareResultStatus.dismissed:
        return ShareOutcome.dismissed;
      case ShareResultStatus.unavailable:
        return ShareOutcome.unavailable;
    }
  }

  @override
  Future<void> shareRenderedFile(RenderedShareContent content) async {
    // The native Android sheet with WhatsApp prioritized (not WhatsApp-only —
    // TAM-58 boundary / PRD §6.8): share_plus resolves the system chooser, and
    // an image/* payload + caption is exactly the shape WhatsApp ranks first.
    //
    // Text handling: normalise the empty string to null. `ShareParams(text:
    // '')` on some share_plus builds writes `EXTRA_TEXT=""` onto the intent,
    // which a subset of receiving apps (and some OEM chooser sheets) treat
    // as an ambiguous payload and reject the share entirely — turning up as
    // a MissingPluginException / PlatformException thrown out of
    // `SharePlus.instance.share`. Passing `null` produces an intent with no
    // EXTRA_TEXT at all, which is what a "files only" share should look
    // like and which every receiver handles correctly.
    final rawText = content.text.trim();
    final rawSubject = content.subject?.trim();
    await SharePlus.instance.share(
      ShareParams(
        text: rawText.isEmpty ? null : rawText,
        subject: (rawSubject == null || rawSubject.isEmpty) ? null : rawSubject,
        files: [XFile(content.file.path, mimeType: content.mimeType)],
      ),
    );
  }
}

/// A resolved share image: the actual file on disk PLUS the concrete MIME
/// type to advertise to share_plus. Pairing the two so callers can't
/// accidentally pass a `.png` with `image/jpeg` — the WhatsApp caption bug
/// documented in [SharePlusShareService.share] is triggered by MIME
/// mismatches too, not only by the wildcard.
class _ResolvedImage {
  const _ResolvedImage({required this.file, required this.mimeType});
  final File file;
  final String mimeType;
}
