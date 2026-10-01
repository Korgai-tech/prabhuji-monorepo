import 'package:meta/meta.dart';

/// go_router paths for the Ringtone module (TAM-68). The module opens
/// full-screen OVER the shell (its own back-nav + search, no bottom tabs), like
/// `/paywall`, Aarti, and Mantras.
class RingtoneRoutes {
  RingtoneRoutes._();

  /// Module entry — the search + deity-filter + 3-column grid Home.
  static const String home = '/ringtones';

  /// Search results screen — the [String] query rides as `extra`.
  static const String search = '/ringtones/search';

  /// Pro-only Preview — the [RingtonePreviewArgs] ride as `extra`; the `:id`
  /// path param supports a bare deep link.
  static const String previewPattern = '/ringtones/preview/:id';

  static String preview(String id) => '/ringtones/preview/$id';
}

/// Route extra for the Preview. Carries the tapped ringtone id + analytics
/// context so a post-purchase continuation restores EXACTLY the tapped surface
/// after the paywall round-trip and auto-plays (§5, §subscription continuation).
@immutable
class RingtonePreviewArgs {
  const RingtonePreviewArgs({
    required this.ringtoneId,
    this.entrySource = 'card',
    this.deityId,
    this.positionIndex,
    this.autoPlay = true,
  });

  /// The ringtone the Preview opens on and auto-plays.
  final String ringtoneId;

  /// Analytics `entry_source` (e.g. `card`, `search`, `post_purchase`).
  final String entrySource;

  /// Deity of the originating card (analytics `deity_id`), when known.
  final String? deityId;

  /// Card position in the originating grid (analytics `position_index`).
  final int? positionIndex;

  /// `true` to auto-play on entry (a card/post-purchase open); `false` when
  /// re-attaching to an already-active clip.
  final bool autoPlay;
}
