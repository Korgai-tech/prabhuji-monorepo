// just_audio marks StreamAudioSource / StreamAudioResponse as "experimental"
// but they've been the documented decrypt-on-play seam in the package's
// README since 2020 and every consumer in the ecosystem uses them.
// ignore_for_file: experimental_member_use, prefer_initializing_formals

import 'dart:async';
import 'dart:typed_data';

import 'package:just_audio/just_audio.dart' as ja;

import '../../downloads/data/encrypted_store.dart';

/// A `just_audio` [ja.StreamAudioSource] that decrypts the on-device
/// ciphertext for a downloaded item on-demand as `just_audio` seeks + reads.
///
/// - `just_audio` is CONFINED to the audio `data/` layer per the arch rules
///   (the domain and above never see `ja.*`); this class is the ONLY place
///   the encrypted store meets a `just_audio` API.
/// - No plaintext file is ever staged to disk — the decrypt stream is
///   materialised into a `Uint8List` here in memory just long enough to
///   satisfy the request range, then GC'd.
class DownloadedAudioSource extends ja.StreamAudioSource {
  DownloadedAudioSource({
    required this.contentId,
    required this.mimeType,
    required this.sourceLength,
    required EncryptedStore store,
  }) : _store = store;

  final String contentId;
  final String mimeType;
  final int sourceLength;
  final EncryptedStore _store;

  @override
  Future<ja.StreamAudioResponse> request([int? start, int? end]) async {
    final absStart = start ?? 0;
    final absEnd = end ?? sourceLength;
    final chunks = <int>[];
    await for (final Uint8List chunk in _store.decryptStream(
      contentId,
      offset: absStart,
      end: absEnd,
    )) {
      chunks.addAll(chunk);
    }
    final data = Uint8List.fromList(chunks);
    return ja.StreamAudioResponse(
      sourceLength: sourceLength,
      contentLength: data.length,
      offset: absStart,
      stream: Stream<List<int>>.value(data),
      contentType: mimeType,
    );
  }
}
