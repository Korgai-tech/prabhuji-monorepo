import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/downloads/data/encrypted_store.dart';

/// AES-256-GCM store round-trip + tamper detection + delete semantics
/// (spec §Tests §encrypted_store_test). Uses the real DefaultEncryptedStore
/// against a temp directory with a fixed test key override so no
/// flutter_secure_storage platform channel is touched under `flutter test`.
DefaultEncryptedStore _newStore(Directory tempDir) => DefaultEncryptedStore(
      applicationDocumentsDirectory: () async => tempDir,
      masterKeyBytesOverride: List<int>.generate(32, (i) => i),
    );

void main() {
  late Directory tempDir;
  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('downloads_test_');
  });
  tearDown(() async {
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  test('writes then decrypts back the same bytes', () async {
    final store = _newStore(tempDir);
    final input = Uint8List.fromList(List<int>.generate(2048, (i) => i % 256));
    await store.writeStream('c1', Stream<List<int>>.value(input));
    final out = <int>[];
    await for (final chunk in store.decryptStream('c1')) {
      out.addAll(chunk);
    }
    expect(out, equals(input));
  });

  test('nonces differ across two writes of the same plaintext', () async {
    final store = _newStore(tempDir);
    final bytes = Uint8List.fromList(List<int>.generate(1024, (i) => i));
    await store.writeStream('c1', Stream<List<int>>.value(bytes));
    await store.writeStream('c2', Stream<List<int>>.value(bytes));
    final f1 =
        await File('${tempDir.path}/downloads/c1.enc').readAsBytes();
    final f2 =
        await File('${tempDir.path}/downloads/c2.enc').readAsBytes();
    // The first 12 bytes are the nonce — they must differ.
    expect(f1.sublist(0, 12), isNot(equals(f2.sublist(0, 12))));
  });

  test('bit-flipped ciphertext fails to decrypt', () async {
    final store = _newStore(tempDir);
    final input = Uint8List.fromList(List<int>.generate(1024, (i) => i));
    await store.writeStream('c1', Stream<List<int>>.value(input));
    final f = File('${tempDir.path}/downloads/c1.enc');
    final bytes = await f.readAsBytes();
    // Flip a bit deep in the ciphertext (past the 12-byte nonce).
    bytes[50] ^= 0xFF;
    await f.writeAsBytes(bytes, flush: true);
    var threw = false;
    try {
      await for (final _ in store.decryptStream('c1')) {}
    } on DownloadStoreException {
      threw = true;
    } on SecretBoxAuthenticationError {
      threw = true;
    }
    expect(threw, isTrue, reason: 'tampered file must not decrypt');
  });

  test('delete removes the file', () async {
    final store = _newStore(tempDir);
    final input = Uint8List.fromList(List<int>.generate(64, (i) => i));
    await store.writeStream('c1', Stream<List<int>>.value(input));
    expect(await store.exists('c1'), isTrue);
    await store.delete('c1');
    expect(await store.exists('c1'), isFalse);
  });

  test('index round-trips through readIndex/writeIndex', () async {
    final store = _newStore(tempDir);
    final entries = <Map<String, Object?>>[
      <String, Object?>{'contentId': 'a1', 'title': 'One'},
      <String, Object?>{'contentId': 'a2', 'title': 'Two'},
    ];
    await store.writeIndex(entries);
    final round = await store.readIndex();
    expect(round.length, 2);
    expect(round.first['contentId'], 'a1');
  });
}
