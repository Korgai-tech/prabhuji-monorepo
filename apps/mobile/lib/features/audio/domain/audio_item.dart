import 'package:meta/meta.dart';

/// Playback intent for a single `play()` call (TAM-59 AC-d).
///
/// Both modes share the ONE engine instance, so a preview and a full player can
/// never overlap — starting either stops the other. The difference is purely in
/// promotion: only [full] surfaces the mini-player.
enum PlaybackMode {
  /// Short, viewport-driven playback: Home feed autoplay (§13) and Ringtone
  /// preview. Treated as a preview — it NEVER promotes the mini-player.
  preview,

  /// Full Pro player playback (Aarti/Mantras). Promotes the mini-player so audio
  /// keeps playing as the user browses the app.
  full,
}

/// Which feature module a playing item belongs to (TAM-59 follow-up).
///
/// The shared mini-player uses this to route the "reopen full player" tap to
/// the correct feature's player screen — without it, mantra playback tapped
/// via the mini player would try to open the aarti player and fail on fetch.
enum AudioModule {
  aarti,
  mantras,
  ringtone,
  /// Anything the mini player shouldn't route to (previews, external
  /// integrations). The mini player treats `null` and `other` the same:
  /// no navigation on tap.
  other,
}

/// Where the audio bytes are coming from (TAM-125).
///
/// The mini-player reads this to render the OFFLINE pill on downloaded
/// playback (Figma `2641:22798`). Defaults to [streamed] so every existing
/// call-site keeps working unchanged.
enum AudioSource {
  streamed,
  downloaded,
}

/// Immutable audio DTO the engine plays (TAM-59).
///
/// Consuming modules build this from their generated content models
/// (TAM-63 Aarti / TAM-65 Mantras) — the engine never touches raw JSON, and it
/// assumes [audioUrl] is already resolved + Pro-gated upstream by the module's
/// `PaywallGate` (TAM-58). No credentials or PII belong here.
@immutable
class AudioItem {
  const AudioItem({
    required this.id,
    required this.title,
    required this.audioUrl,
    this.subtitle,
    this.artworkUrl,
    this.module = AudioModule.other,
    this.source = AudioSource.streamed,
    this.downloadSizeBytes,
  });

  /// Stable content id — also the "currently-playing item id" the single-active
  /// invariant keys on.
  final String id;

  /// Player + mini-player title line.
  final String title;

  /// Resolved stream URL. An empty/blank URL is a calm player-level error
  /// (Aarti §player error copy), never a crash — see [AudioController.play].
  final String audioUrl;

  /// Secondary line: singer/composer for Aarti, deity/category for Mantras.
  final String? subtitle;

  /// Cover-art URL rendered through `AppNetworkImage` (TAM-58).
  final String? artworkUrl;

  /// Which feature the item was launched from. The shared mini-player reads
  /// this to send the user back to the RIGHT full-player screen on tap. Defaults
  /// to [AudioModule.other] so the mini player no-ops on tap for anything that
  /// isn't a first-class module (previews, ringtones surfacing via home, etc.).
  final AudioModule module;

  /// Where the audio bytes come from (TAM-125). Defaults to
  /// [AudioSource.streamed]. The mini-player renders an OFFLINE pill when
  /// this equals [AudioSource.downloaded]. Set to `downloaded` by the
  /// downloads flow via [AudioController.playDownloaded].
  final AudioSource source;

  /// Plaintext audio-file size in bytes — REQUIRED when
  /// [source] is [AudioSource.downloaded]. `just_audio`'s
  /// `StreamAudioSource` needs the total content length up front to
  /// service range requests against the decrypt-on-play stream. The
  /// value is the ORIGINAL MP3 size (what was downloaded from S3), NOT
  /// the ciphertext-on-disk size. Ignored when [source] is streamed.
  final int? downloadSizeBytes;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AudioItem &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          title == other.title &&
          audioUrl == other.audioUrl &&
          subtitle == other.subtitle &&
          artworkUrl == other.artworkUrl &&
          module == other.module &&
          source == other.source;

  @override
  int get hashCode =>
      Object.hash(id, title, audioUrl, subtitle, artworkUrl, module, source);

  @override
  String toString() =>
      'AudioItem($id, "$title", module=$module, source=$source)';
}
