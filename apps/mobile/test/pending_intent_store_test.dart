import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/pending_intent_store.dart';

/// Coverage matrix (TAM-124):
///   - write → consumeOnce returns the URI
///   - consumeOnce clears the store (second call → null)
///   - consumeOnce returns null when nothing is stored
///   - stale entries (> staleAfter) → null AND cleared
///   - malformed JSON → null AND cleared (never wedges the app)
///   - clear() removes without consuming
///   - overwriting is silent (new write replaces old)
///
/// Uses an in-memory `_FakeStorage` so we don't need a platform-channel mock
/// for `flutter_secure_storage`.

class _FakeStorage implements PendingIntentStorage {
  String? _value;

  @override
  Future<String?> read() async => _value;

  @override
  Future<void> write(String value) async {
    _value = value;
  }

  @override
  Future<void> delete() async {
    _value = null;
  }
}

/// Storage whose read takes real time, like `flutter_secure_storage`'s
/// platform-channel round-trip — the gap in which two consumers used to both
/// see the same payload.
class _SlowStorage extends _FakeStorage {
  @override
  Future<String?> read() async {
    await Future<void>.delayed(const Duration(milliseconds: 20));
    return super.read();
  }
}

void main() {
  group('PendingIntentStore.consumeOnce — concurrency', () {
    test('two overlapping consumes hand the intent to exactly one caller',
        () async {
      // Observed on device: the home-landing trigger ran twice in one frame
      // and both consumes returned the URI, so the target was navigated to
      // twice and `deep_link_replayed` was reported twice.
      final store = PendingIntentStore(storage: _SlowStorage());
      final uri = Uri.parse('https://krutyug.ai/app/aarti/a1');
      await store.write(uri);

      final results = await Future.wait([
        store.consumeOnce(persistentOnly: true),
        store.consumeOnce(persistentOnly: true),
        store.consumeOnce(),
      ]);

      expect(results.whereType<Uri>(), [uri]);
    });

    test('a failing consume does not wedge the ones after it', () async {
      final storage = _ThrowOnceStorage();
      final store = PendingIntentStore(storage: storage);
      await store.write(Uri.parse('https://krutyug.ai/app/aarti/a1'));

      await expectLater(store.consumeOnce(), throwsStateError);
      expect(await store.consumeOnce(), isNotNull);
    });
  });

  group('PendingIntentStore.consumeOnce', () {
    test('returns null when nothing has been written', () async {
      final store = PendingIntentStore(storage: _FakeStorage());
      expect(await store.consumeOnce(), isNull);
    });

    test('write → consumeOnce returns the URI', () async {
      final store = PendingIntentStore(storage: _FakeStorage());
      final uri = Uri.parse('prabhuji://aarti/audio-42');
      await store.write(uri);
      final consumed = await store.consumeOnce();
      expect(consumed, uri);
    });

    test('second consumeOnce returns null (write is consumed once)', () async {
      final store = PendingIntentStore(storage: _FakeStorage());
      await store.write(Uri.parse('prabhuji://aarti/audio-42'));
      await store.consumeOnce(); // consumes
      expect(await store.consumeOnce(), isNull);
    });
  });

  group('PendingIntentStore.consumeOnce — staleness', () {
    test('discards entries older than the stale threshold AND clears them',
        () async {
      final storage = _FakeStorage();
      var now = DateTime(2026, 7, 28, 12, 0);
      final store = PendingIntentStore(
        storage: storage,
        now: () => now,
        staleAfter: const Duration(hours: 24),
      );
      await store.write(Uri.parse('prabhuji://aarti/audio-42'));
      // Fast-forward past the stale threshold.
      now = now.add(const Duration(hours: 25));

      expect(await store.consumeOnce(), isNull);
      // AND the store is cleared — stale garbage doesn't linger.
      expect(await storage.read(), isNull);
    });

    test('returns URIs saved right at the boundary', () async {
      final storage = _FakeStorage();
      var now = DateTime(2026, 7, 28, 12, 0);
      final store = PendingIntentStore(
        storage: storage,
        now: () => now,
        staleAfter: const Duration(hours: 24),
      );
      await store.write(Uri.parse('prabhuji://aarti/audio-42'));
      // Exactly 24h later — still fresh (staleness is `>`, not `>=`).
      now = now.add(const Duration(hours: 24));
      expect(await store.consumeOnce(), isNotNull);
    });
  });

  group('PendingIntentStore.consumeOnce — malformed payloads', () {
    test('malformed JSON → null AND cleared (no wedge)', () async {
      final storage = _FakeStorage();
      // Simulate a corrupted / partial write from a prior version.
      await storage.write('{{{ not json');
      final store = PendingIntentStore(storage: storage);

      expect(await store.consumeOnce(), isNull);
      // AND the corrupt payload is gone — a future read can't hit it again.
      expect(await storage.read(), isNull);
    });

    test('valid JSON with missing fields → null AND cleared', () async {
      final storage = _FakeStorage();
      await storage.write('{"savedAt":"2026-07-28T12:00:00.000"}'); // no uri
      final store = PendingIntentStore(storage: storage);

      expect(await store.consumeOnce(), isNull);
      expect(await storage.read(), isNull);
    });

    test('valid JSON with garbage savedAt → null AND cleared', () async {
      final storage = _FakeStorage();
      await storage
          .write('{"uri":"prabhuji://aarti/x","savedAt":"not-a-timestamp"}');
      final store = PendingIntentStore(storage: storage);

      expect(await store.consumeOnce(), isNull);
      expect(await storage.read(), isNull);
    });
  });

  group('PendingIntentStore.clear', () {
    test('clears without returning anything', () async {
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);
      await store.write(Uri.parse('prabhuji://aarti/x'));

      await store.clear();

      expect(await storage.read(), isNull);
      expect(await store.consumeOnce(), isNull);
    });
  });

  group('PendingIntentStore.write — overwrite semantics', () {
    test('a second write silently replaces the first', () async {
      final store = PendingIntentStore(storage: _FakeStorage());
      await store.write(Uri.parse('prabhuji://aarti/first'));
      await store.write(Uri.parse('prabhuji://aarti/second'));

      final consumed = await store.consumeOnce();
      expect(consumed, Uri.parse('prabhuji://aarti/second'));
    });
  });

  group('PendingIntentStore.write — sessionOnly (TAM-124 follow-up)', () {
    test('sessionOnly write does NOT touch the persistent store', () async {
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);
      final uri = Uri.parse('prabhuji://aarti/session-1');

      await store.write(uri, sessionOnly: true);

      expect(await storage.read(), isNull,
          reason:
              'sessionOnly must never persist — dies with the isolate on app kill');
      // But consumeOnce should still return it from the in-memory cache.
      expect(await store.consumeOnce(), uri);
    });

    test('sessionOnly write CLEARS a previously-persistent intent', () async {
      // Invariant: at most one intent at a time. A new write of either
      // flavour wipes the other so the OLDER intent can never resurrect
      // itself.
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);

      await store
          .write(Uri.parse('prabhuji://aarti/persistent-old')); // persistent
      expect(await storage.read(), isNotNull);

      await store.write(
        Uri.parse('prabhuji://aarti/session-new'),
        sessionOnly: true,
      );
      expect(await storage.read(), isNull,
          reason: 'the persistent entry must be wiped by the session write');
      expect(
        await store.consumeOnce(),
        Uri.parse('prabhuji://aarti/session-new'),
      );
    });

    test('persistent write CLEARS a previously-set session intent', () async {
      // Mirror of the above — same invariant, other direction.
      final store = PendingIntentStore(storage: _FakeStorage());

      await store
          .write(Uri.parse('prabhuji://aarti/session-old'), sessionOnly: true);
      await store.write(Uri.parse('prabhuji://aarti/persistent-new'));

      expect(
        await store.consumeOnce(),
        Uri.parse('prabhuji://aarti/persistent-new'),
      );
    });

    test('consumeOnce prefers session cache over persistent', () async {
      // Belt-and-braces: even if both were somehow set (a race across the
      // two write flavours), session wins as the more-recent in-session
      // context.
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);

      // Simulate a stray persistent entry from a prior process (e.g. this
      // isn't cleared by an in-process write — write to storage directly).
      await storage.write(
        '{"uri":"prabhuji://aarti/persistent","savedAt":"${DateTime(2026, 7, 29).toIso8601String()}"}',
      );
      await store.write(
        Uri.parse('prabhuji://aarti/session'),
        sessionOnly: true,
      );

      final consumed = await store.consumeOnce();
      expect(consumed, Uri.parse('prabhuji://aarti/session'));
    });

    test('clear() wipes both session cache AND persistent storage',
        () async {
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);

      // Seed both surfaces (bypassing write's invariant for this test).
      await storage.write(
        '{"uri":"prabhuji://aarti/x","savedAt":"${DateTime(2026, 7, 29).toIso8601String()}"}',
      );
      await store.write(Uri.parse('prabhuji://aarti/y'), sessionOnly: true);

      await store.clear();

      expect(await storage.read(), isNull);
      expect(await store.consumeOnce(), isNull);
    });

    test('sessionOnly consumeOnce is consumed-once (second call → null)',
        () async {
      final store = PendingIntentStore(storage: _FakeStorage());
      final uri = Uri.parse('prabhuji://aarti/session');
      await store.write(uri, sessionOnly: true);

      expect(await store.consumeOnce(), uri);
      expect(await store.consumeOnce(), isNull,
          reason: 'consume must clear the session cache too');
    });

    test('stale sessionOnly entry falls through to check persistent',
        () async {
      var now = DateTime(2026, 7, 29, 12, 0);
      final storage = _FakeStorage();
      final store = PendingIntentStore(
        storage: storage,
        now: () => now,
        staleAfter: const Duration(hours: 1),
      );

      // Session write at t=0.
      await store
          .write(Uri.parse('prabhuji://aarti/stale-session'), sessionOnly: true);

      // Fast-forward past the session's stale window.
      now = now.add(const Duration(hours: 2));

      // Now seed a FRESH persistent entry directly to storage (bypassing
      // write's invariant — simulating an entry that arrived from a
      // different code path, e.g. install-referrer read on this launch).
      await storage.write(
        '{"uri":"prabhuji://aarti/persistent-fresh","savedAt":"${now.toIso8601String()}"}',
      );

      final consumed = await store.consumeOnce();
      expect(consumed, Uri.parse('prabhuji://aarti/persistent-fresh'),
          reason:
              'stale session should NOT block a fresh persistent replay');
    });
  });
}

class _ThrowOnceStorage extends _FakeStorage {
  var _thrown = false;

  @override
  Future<String?> read() async {
    if (!_thrown) {
      _thrown = true;
      throw StateError('keystore unavailable');
    }
    return super.read();
  }
}
