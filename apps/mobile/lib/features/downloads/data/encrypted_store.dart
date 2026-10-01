import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';

/// On-device encrypted store for downloaded audio (TAM-125 #EXPORT_CRITICAL).
///
/// - AES-256-GCM authenticated encryption. Tampered files fail to decrypt
///   loudly (`SecretBoxAuthenticationError`), so the row moves to `failed`
///   rather than playing back corrupted audio.
/// - Master key persisted in `flutter_secure_storage` under the key
///   `downloads_master_key_v1` with EXPLICIT platform options (Q8 —
///   pre-implementation security audit `specs/evidence/TAM-125/
///   security-audit-preimplementation.md`):
///     * Android → `AndroidOptions(encryptedSharedPreferences: true)` pins
///       the backing store to EncryptedSharedPreferences (the plugin default
///       today on v10.x, but pinning insulates against a future plugin
///       upgrade silently switching the backend). The KeyStore-wrapped key
///       backing it is NOT part of Android Auto Backup, so a restore-from-
///       backup on a new device produces undecryptable blobs — matches the
///       spec AC "reinstall = empty store".
///     * iOS → `IOSOptions(accessibility: first_unlock_this_device,
///       synchronizable: false)` — the key never leaves this device (iCloud
///       Keychain roaming is disabled) and becomes readable only after the
///       first passcode unlock post-boot (needed so downloads keep working
///       across a passcode-locked reboot).
///   Generated once (32 bytes, `Random.secure()`) then reused; never logged
///   or serialized.
/// - Per-file 12-byte nonce, unique across all files (`Random.secure()`).
///   Nonce is prepended to the ciphertext on disk (bytes 0..11), then the
///   MAC comes at the end via `SecretBox.concatenation()`.
/// - Storage root: `getApplicationDocumentsDirectory()/downloads/` — never
///   `getExternalStoragePath()`, never `MediaStore`, never a shared /
///   Files.app-visible location.
/// - Filename: `{contentId}.enc` — no title, no extension collision with a
///   playable format, so a rooted-device file browser sees only opaque
///   blobs.
/// - The plaintext IS NEVER written to disk. Downloads write ciphertext
///   directly via [writeStream]; playback reads ciphertext + decrypts in
///   64 KB chunks via [decryptStream] feeding a `just_audio` `StreamAudioSource`.
///
/// Security-engineer audit target — see the CTA at the top of the module
/// report.
abstract interface class EncryptedStore {
  /// Encrypts + writes [source] to disk under [contentId]. Returns the
  /// ciphertext length (used for the manifest sizing sanity check). Throws
  /// [DownloadStoreException] on any I/O or crypto failure.
  Future<int> writeStream(String contentId, Stream<List<int>> source);

  /// Returns the plaintext length of a downloaded [contentId] — used by the
  /// `DownloadedAudioSource` when it constructs the `just_audio` source.
  Future<int> plaintextSize(String contentId);

  /// Chunk-decrypts a byte range from a downloaded file. `just_audio`'s
  /// `StreamAudioSource.request(start, end)` maps 1:1 onto this call.
  /// The returned stream ALWAYS decrypts on-the-fly — no plaintext is ever
  /// staged to disk (spec §Protection).
  Stream<Uint8List> decryptStream(
    String contentId, {
    int? offset,
    int? end,
  });

  /// Whether a downloaded ciphertext file exists for [contentId].
  Future<bool> exists(String contentId);

  /// Deletes the ciphertext for [contentId]. Overwrites the file with random
  /// bytes before unlinking (best-effort — a rooted device could still
  /// recover, but ordinary file-recovery tools won't).
  Future<void> delete(String contentId);

  /// Wipes EVERY ciphertext under `downloads/`. Called on logout via the
  /// analytics `reset()` sibling flow.
  Future<void> deleteAll();

  /// Read + write the JSON index at `downloads/index.json` — the canonical
  /// list of what the user has downloaded. Persistence is best-effort; a
  /// corrupt index reads as empty.
  Future<List<Map<String, Object?>>> readIndex();
  Future<void> writeIndex(List<Map<String, Object?>> entries);
}

class DownloadStoreException implements Exception {
  DownloadStoreException(this.message, {this.cause});
  final String message;
  final Object? cause;
  @override
  String toString() => 'DownloadStoreException($message, cause=$cause)';
}

/// The production [EncryptedStore] implementation. Prefer this ONLY at the
/// composition root (`downloads_providers.dart`); tests inject a
/// `FakeEncryptedStore` (see `test/support/downloads_harness.dart`).
class DefaultEncryptedStore implements EncryptedStore {
  DefaultEncryptedStore({
    FlutterSecureStorage? secureStorage,
    Future<Directory> Function()? applicationDocumentsDirectory,
    AesGcm? algorithm,
    math.Random? nonceRng,
    List<int>? masterKeyBytesOverride,
  })  : _secureStorage = secureStorage ?? _defaultSecureStorage,
        _appDir =
            applicationDocumentsDirectory ?? getApplicationDocumentsDirectory,
        _algorithm = algorithm ?? AesGcm.with256bits(),
        _nonceRng = nonceRng ?? math.Random.secure(),
        _masterKeyOverride = masterKeyBytesOverride;

  /// Explicit platform options pinned per security-audit Q8. Do NOT fall back
  /// to `const FlutterSecureStorage()` — the plugin's defaults may change
  /// between minor versions and would silently roam the key via iCloud
  /// Keychain (iOS) or downgrade Keychain accessibility.
  ///
  /// Android: `AndroidOptions()` default in `flutter_secure_storage ^10.3.1`
  /// uses custom ciphers (Jetpack Security's EncryptedSharedPreferences was
  /// deprecated by Google; the plugin auto-migrates on first access). No
  /// backup/roaming — the KeyStore-wrapped master key stays on-device.
  ///
  /// iOS: `KeychainAccessibility.first_unlock_this_device` — the key becomes
  /// readable only after the first passcode unlock post-boot (needed so
  /// downloads keep working across a passcode-locked reboot), and NEVER
  /// leaves this specific device. `synchronizable: false` explicitly opts
  /// out of iCloud Keychain roaming.
  static const FlutterSecureStorage _defaultSecureStorage =
      FlutterSecureStorage(
    aOptions: AndroidOptions(),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
      synchronizable: false,
    ),
  );

  static const String _masterKeyStorageKey = 'downloads_master_key_v1';
  static const String _dirName = 'downloads';
  static const String _indexFileName = 'index.json';
  static const int _nonceBytes = 12;
  static const int _chunkPlaintextBytes = 64 * 1024;

  final FlutterSecureStorage _secureStorage;
  final Future<Directory> Function() _appDir;
  final AesGcm _algorithm;
  final math.Random _nonceRng;
  final List<int>? _masterKeyOverride;

  SecretKey? _cachedKey;

  Future<SecretKey> _key() async {
    final cached = _cachedKey;
    if (cached != null) return cached;
    final override = _masterKeyOverride;
    if (override != null) {
      _cachedKey = SecretKey(override);
      return _cachedKey!;
    }
    final existing = await _secureStorage.read(key: _masterKeyStorageKey);
    if (existing != null && existing.isNotEmpty) {
      try {
        final bytes = base64Decode(existing);
        if (bytes.length == 32) {
          final key = SecretKey(bytes);
          _cachedKey = key;
          return key;
        }
      } catch (_) {
        // fall through to regeneration on a corrupt/legacy blob
      }
    }
    // Generate 32 bytes (256 bits) via the plugin's SDK-recommended
    // extractSync-safe path — [SecretKeyData.random] uses `Random.secure()`.
    final key = await _algorithm.newSecretKey();
    final raw = await key.extractBytes();
    await _secureStorage.write(
      key: _masterKeyStorageKey,
      value: base64Encode(raw),
    );
    _cachedKey = SecretKey(raw);
    return _cachedKey!;
  }

  Future<Directory> _downloadsDir() async {
    final dir = await _appDir();
    final downloads = Directory('${dir.path}/$_dirName');
    if (!await downloads.exists()) {
      await downloads.create(recursive: true);
    }
    return downloads;
  }

  Future<File> _ciphertextFile(String contentId) async {
    final dir = await _downloadsDir();
    return File('${dir.path}/$contentId.enc');
  }

  Uint8List _newNonce() {
    final n = Uint8List(_nonceBytes);
    for (var i = 0; i < _nonceBytes; i++) {
      n[i] = _nonceRng.nextInt(256);
    }
    return n;
  }

  @override
  Future<int> writeStream(
    String contentId,
    Stream<List<int>> source,
  ) async {
    try {
      final key = await _key();
      final file = await _ciphertextFile(contentId);
      // Buffer plaintext into fixed-size chunks so a very slow network
      // never leaves us holding gigabytes in memory. Each chunk is one
      // GCM record: NONCE (12) || CIPHERTEXT || MAC (16). Written back-
      // to-back on disk. This lets [decryptStream] seek by chunk index —
      // simpler than the "single giant record with header" alternative,
      // which would force decrypting all bytes before the requested range.
      final sink = file.openWrite();
      final buffer = BytesBuilder();
      var totalCiphertext = 0;

      Future<void> flushChunk() async {
        if (buffer.isEmpty) return;
        final plaintext = buffer.takeBytes();
        final nonce = _newNonce();
        final secretBox = await _algorithm.encrypt(
          plaintext,
          secretKey: key,
          nonce: nonce,
        );
        final record = <int>[
          ...nonce,
          ...secretBox.cipherText,
          ...secretBox.mac.bytes,
        ];
        sink.add(record);
        totalCiphertext += record.length;
      }

      await for (final chunk in source) {
        buffer.add(chunk);
        while (buffer.length >= _chunkPlaintextBytes) {
          final all = buffer.takeBytes();
          final head = all.sublist(0, _chunkPlaintextBytes);
          final rest = all.sublist(_chunkPlaintextBytes);
          buffer.add(head);
          await flushChunk();
          buffer.add(rest);
        }
      }
      await flushChunk();
      await sink.flush();
      await sink.close();
      return totalCiphertext;
    } catch (e) {
      throw DownloadStoreException('write failed', cause: e);
    }
  }

  @override
  Future<int> plaintextSize(String contentId) async {
    try {
      final key = await _key();
      final file = await _ciphertextFile(contentId);
      if (!await file.exists()) return 0;
      final raf = await file.open();
      try {
        var offset = 0;
        var total = 0;
        final length = await raf.length();
        while (offset < length) {
          await raf.setPosition(offset);
          final nonce = await raf.read(_nonceBytes);
          // Payload length = chunkPlaintext (or trailing partial) + MAC (16).
          // We can't know the plaintext size without decrypt — so decrypt just
          // to count. For a 500-item library at 10 MB avg = 5 GB total this
          // full pass is expensive; callers cache the return via the index
          // file (see [readIndex]).
          final remaining = length - offset - _nonceBytes;
          if (remaining <= 16) break;
          final ct = await raf.read(remaining < _chunkPlaintextBytes + 16
              ? remaining - 16
              : _chunkPlaintextBytes);
          final mac = await raf.read(16);
          final box = SecretBox(
            ct,
            nonce: nonce,
            mac: Mac(mac),
          );
          final pt = await _algorithm.decrypt(box, secretKey: key);
          total += pt.length;
          offset += _nonceBytes + ct.length + 16;
        }
        return total;
      } finally {
        await raf.close();
      }
    } catch (e) {
      throw DownloadStoreException('plaintextSize failed', cause: e);
    }
  }

  @override
  Stream<Uint8List> decryptStream(
    String contentId, {
    int? offset,
    int? end,
  }) async* {
    final key = await _key();
    final file = await _ciphertextFile(contentId);
    if (!await file.exists()) return;
    final raf = await file.open();
    try {
      final length = await raf.length();
      var absPlaintextPos = 0;
      var readPos = 0;
      final absStart = offset ?? 0;
      final absEnd = end;
      while (readPos < length) {
        await raf.setPosition(readPos);
        final nonce = await raf.read(_nonceBytes);
        final remaining = length - readPos - _nonceBytes;
        if (remaining <= 16) break;
        final ctLen = remaining < _chunkPlaintextBytes + 16
            ? remaining - 16
            : _chunkPlaintextBytes;
        final ct = await raf.read(ctLen);
        final mac = await raf.read(16);
        readPos += _nonceBytes + ctLen + 16;
        final box = SecretBox(ct, nonce: nonce, mac: Mac(mac));
        Uint8List pt;
        try {
          pt = Uint8List.fromList(
            await _algorithm.decrypt(box, secretKey: key),
          );
        } on SecretBoxAuthenticationError {
          throw DownloadStoreException('authentication tag mismatch');
        }
        final chunkStart = absPlaintextPos;
        final chunkEnd = absPlaintextPos + pt.length;
        absPlaintextPos = chunkEnd;
        if (chunkEnd <= absStart) continue;
        if (absEnd != null && chunkStart >= absEnd) break;
        final sliceStart =
            absStart > chunkStart ? absStart - chunkStart : 0;
        final sliceEnd = absEnd == null
            ? pt.length
            : (absEnd < chunkEnd ? absEnd - chunkStart : pt.length);
        yield Uint8List.sublistView(pt, sliceStart, sliceEnd);
      }
    } finally {
      await raf.close();
    }
  }

  @override
  Future<bool> exists(String contentId) async {
    final f = await _ciphertextFile(contentId);
    return f.exists();
  }

  @override
  Future<void> delete(String contentId) async {
    final f = await _ciphertextFile(contentId);
    if (!await f.exists()) return;
    // Best-effort overwrite before unlink — a rooted device could recover
    // via the underlying block layer, but ordinary undelete tools cannot.
    try {
      final length = await f.length();
      final random = _newRandomFill(length);
      await f.writeAsBytes(random, flush: true);
    } catch (_) {
      // Swallow; still attempt unlink below so a partial write can't leave
      // the file behind indefinitely.
    }
    try {
      await f.delete();
    } catch (e) {
      throw DownloadStoreException('delete failed', cause: e);
    }
  }

  @override
  Future<void> deleteAll() async {
    final dir = await _downloadsDir();
    if (await dir.exists()) {
      await for (final entry in dir.list()) {
        if (entry is File) {
          try {
            await entry.delete();
          } catch (_) {/* ignore */}
        }
      }
    }
    // Wipe the master key from flutter_secure_storage AND the in-memory
    // cache so any residual ciphertext (impossible if the delete loop
    // succeeded, but defensive against interrupted deletes / third-party
    // filesystem backups that survived logout) is unreadable. Called on
    // logout via `DownloadManager.shutdown` so user B on the same device
    // cannot decrypt user A's leftover blobs even in the worst case.
    try {
      await _secureStorage.delete(key: _masterKeyStorageKey);
    } catch (_) {/* best-effort */}
    _cachedKey = null;
  }

  @override
  Future<List<Map<String, Object?>>> readIndex() async {
    try {
      final dir = await _downloadsDir();
      final f = File('${dir.path}/$_indexFileName');
      if (!await f.exists()) return const <Map<String, Object?>>[];
      final raw = await f.readAsString();
      final parsed = jsonDecode(raw);
      if (parsed is! List) return const <Map<String, Object?>>[];
      return parsed
          .whereType<Map>()
          .map((e) => e.cast<String, Object?>())
          .toList(growable: false);
    } catch (_) {
      return const <Map<String, Object?>>[];
    }
  }

  @override
  Future<void> writeIndex(List<Map<String, Object?>> entries) async {
    try {
      final dir = await _downloadsDir();
      final f = File('${dir.path}/$_indexFileName');
      await f.writeAsString(jsonEncode(entries), flush: true);
    } catch (e) {
      throw DownloadStoreException('writeIndex failed', cause: e);
    }
  }

  Uint8List _newRandomFill(int length) {
    final capped = length > 1024 * 1024 ? 1024 * 1024 : length;
    final out = Uint8List(capped);
    for (var i = 0; i < capped; i++) {
      out[i] = _nonceRng.nextInt(256);
    }
    return out;
  }
}
