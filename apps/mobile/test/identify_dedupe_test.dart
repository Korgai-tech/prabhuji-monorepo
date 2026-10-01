import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/identify_dedupe.dart';

void main() {
  // Injectable clock: tests mutate `now` to travel in time.
  var now = DateTime.utc(2026, 7, 9, 12);
  IdentifyDeduper fresh({Duration? interval}) => IdentifyDeduper(
        reassertInterval:
            interval ?? IdentifyDeduper.defaultReassertInterval,
        now: () => now,
      );

  setUp(() => now = DateTime.utc(2026, 7, 9, 12));

  group('first send', () {
    test('fresh deduper sends the incoming payload as-is', () {
      final d = fresh();
      final decision =
          d.decide(set: {'email': 'a@b.c'}, setOnce: {'source': 'ad'});
      expect(decision.send, isTrue);
      expect(decision.set, {'email': 'a@b.c'});
      expect(decision.setOnce, {'source': 'ad'});
    });

    test('empty payload is a skip even on a fresh deduper', () {
      expect(fresh().decide(set: {}, setOnce: {}).send, isFalse);
    });
  });

  group('no-op detection', () {
    test('identical repeat (incl. nested values, deep equality) skips', () {
      final d = fresh();
      d.recordSent({
        'email': 'a@b.c',
        'tags': [
          'x',
          {'k': 1},
        ],
      }, {
        'source': 'ad',
      });
      final decision = d.decide(set: {
        'email': 'a@b.c',
        'tags': [
          'x',
          {'k': 1},
        ],
      }, setOnce: {
        'source': 'ad',
      });
      expect(decision.send, isFalse);
    });

    test('subset repeat skips (the per-launch signIn case)', () {
      final d = fresh();
      d.recordSent({'email': 'a@b.c', 'plan': 'free'}, {});
      expect(d.decide(set: {'email': 'a@b.c'}, setOnce: {}).send, isFalse);
    });

    test('changed \$set value sends the incoming payload', () {
      final d = fresh();
      d.recordSent({'email': 'a@b.c'}, {});
      final decision = d.decide(set: {'email': 'new@b.c'}, setOnce: {});
      expect(decision.send, isTrue);
      expect(decision.set, {'email': 'new@b.c'});
    });

    test('new \$set key sends', () {
      final d = fresh();
      d.recordSent({'email': 'a@b.c'}, {});
      expect(
        d.decide(set: {'email': 'a@b.c', 'plan': 'pro'}, setOnce: {}).send,
        isTrue,
      );
    });

    test('type change (1 vs \'1\') is a change and sends', () {
      final d = fresh();
      d.recordSent({'level': 1}, {});
      expect(d.decide(set: {'level': '1'}, setOnce: {}).send, isTrue);
    });
  });

  group(r'$setOnce semantics', () {
    test('repeated key skips regardless of value (first-write-wins)', () {
      final d = fresh();
      d.recordSent({}, {'source': 'ad'});
      expect(d.decide(set: {}, setOnce: {'source': 'organic'}).send, isFalse);
    });

    test('unseen key sends', () {
      final d = fresh();
      d.recordSent({}, {'source': 'ad'});
      expect(d.decide(set: {}, setOnce: {'medium': 'cpc'}).send, isTrue);
    });

    test('stored first value survives repeats and re-assert carries it', () {
      final d = fresh();
      d.recordSent({'email': 'a'}, {'source': 'ad'});
      // A later send repeats the setOnce key with a different value — the
      // server ignores it (first-write-wins), so the store must too.
      d.recordSent({'email': 'b'}, {'source': 'organic'});
      now = now.add(const Duration(hours: 25));
      final decision = d.decide(set: {'email': 'b'}, setOnce: {});
      expect(decision.send, isTrue);
      expect(decision.setOnce, {'source': 'ad'});
    });
  });

  group('TTL re-assert', () {
    test('no-op within the interval skips', () {
      final d = fresh();
      d.recordSent({'email': 'a'}, {});
      now = now.add(const Duration(hours: 23, minutes: 59));
      expect(d.decide(set: {'email': 'a'}, setOnce: {}).send, isFalse);
    });

    test('interval elapsed sends the FULL accumulated snapshot', () {
      final d = fresh();
      d.recordSent({'email': 'a', 'plan': 'free'}, {'source': 'ad'});
      now = now.add(const Duration(hours: 24));
      final decision = d.decide(set: {'plan': 'pro'}, setOnce: {});
      expect(decision.send, isTrue);
      // Accumulated snapshot merged with the incoming payload (incoming wins).
      expect(decision.set, {'email': 'a', 'plan': 'pro'});
      expect(decision.setOnce, {'source': 'ad'});
    });

    test('recordSent refreshes the clock — next no-op skips again', () {
      final d = fresh();
      d.recordSent({'email': 'a'}, {});
      now = now.add(const Duration(hours: 24));
      final decision = d.decide(set: {'email': 'a'}, setOnce: {});
      expect(decision.send, isTrue);
      d.recordSent(decision.set, decision.setOnce);
      expect(d.decide(set: {'email': 'a'}, setOnce: {}).send, isFalse);
    });

    test('backwards clock triggers a re-assert send', () {
      final d = fresh();
      d.recordSent({'email': 'a'}, {});
      now = now.subtract(const Duration(hours: 1));
      expect(d.decide(set: {'email': 'a'}, setOnce: {}).send, isTrue);
    });

    test('empty payload never sends, even past the interval', () {
      final d = fresh();
      d.recordSent({'email': 'a'}, {});
      now = now.add(const Duration(days: 2));
      expect(d.decide(set: {}, setOnce: {}).send, isFalse);
    });

    test('custom interval is honored', () {
      final d = fresh(interval: const Duration(minutes: 1));
      d.recordSent({'email': 'a'}, {});
      now = now.add(const Duration(minutes: 1));
      expect(d.decide(set: {'email': 'a'}, setOnce: {}).send, isTrue);
    });
  });

  group('identity binding', () {
    test('rebinding the same user preserves state (per-launch path)', () {
      final d = fresh();
      d.bindUser('user-1');
      d.recordSent({'email': 'a'}, {});
      d.bindUser('user-1');
      expect(d.decide(set: {'email': 'a'}, setOnce: {}).send, isFalse);
    });

    test('binding a different user discards state', () {
      final d = fresh();
      d.bindUser('user-1');
      d.recordSent({'email': 'a'}, {});
      d.bindUser('user-2');
      expect(d.decide(set: {'email': 'a'}, setOnce: {}).send, isTrue);
    });

    test('anonymous in-process state does not satisfy a later signed-in user',
        () {
      final d = fresh();
      d.recordSent({'email': 'a'}, {}); // anonymous send
      d.bindUser('user-1');
      expect(d.decide(set: {'email': 'a'}, setOnce: {}).send, isTrue);
    });

    test('clear() wipes everything', () {
      final d = fresh();
      d.bindUser('user-1');
      d.recordSent({'email': 'a'}, {'source': 'ad'});
      d.clear();
      expect(
        d.decide(set: {'email': 'a'}, setOnce: {'source': 'ad'}).send,
        isTrue,
      );
    });
  });

  group('serialization', () {
    test('anonymous state serializes to null (never persisted)', () {
      final d = fresh();
      d.recordSent({'email': 'a'}, {});
      expect(d.serialize(), isNull);
    });

    test('bound but nothing sent serializes to null', () {
      final d = fresh();
      d.bindUser('user-1');
      expect(d.serialize(), isNull);
    });

    test('round trip preserves decisions across a relaunch', () {
      final d = fresh();
      d.bindUser('user-1');
      d.recordSent({'email': 'a@b.c'}, {'source': 'ad'});
      final blob = d.serialize();
      expect(blob, isNotNull);

      final restored = IdentifyDeduper.restore(blob, now: () => now);
      expect(restored, isNotNull);
      restored!.bindUser('user-1');
      // Same launch-identify payload → deduped; setOnce repeat also no-op.
      expect(
        restored
            .decide(set: {'email': 'a@b.c'}, setOnce: {'source': 'x'}).send,
        isFalse,
      );
      // A real change still sends.
      expect(
        restored.decide(set: {'email': 'new@b.c'}, setOnce: {}).send,
        isTrue,
      );
    });

    test('restored lastSentAt drives the TTL across relaunches', () {
      final d = fresh();
      d.bindUser('user-1');
      d.recordSent({'email': 'a'}, {'source': 'ad'});
      final blob = d.serialize();

      now = now.add(const Duration(hours: 25));
      final restored = IdentifyDeduper.restore(blob, now: () => now)!;
      restored.bindUser('user-1');
      final decision = restored.decide(set: {'email': 'a'}, setOnce: {});
      expect(decision.send, isTrue);
      expect(decision.set, {'email': 'a'});
      expect(decision.setOnce, {'source': 'ad'});
    });

    test('restored state for user A is discarded on bindUser(B)', () {
      final d = fresh();
      d.bindUser('user-A');
      d.recordSent({'email': 'a'}, {});
      final restored = IdentifyDeduper.restore(d.serialize(), now: () => now)!;
      restored.bindUser('user-B');
      expect(restored.decide(set: {'email': 'a'}, setOnce: {}).send, isTrue);
    });

    test('restored state never activates without a matching bind (anonymous)',
        () {
      final d = fresh();
      d.bindUser('user-A');
      d.recordSent({'email': 'a'}, {});
      final restored = IdentifyDeduper.restore(d.serialize(), now: () => now)!;
      // Anonymous identify in the new process must NOT skip from A's state.
      expect(restored.decide(set: {'email': 'a'}, setOnce: {}).send, isTrue);
    });

    test('null, garbage, wrong shape, and wrong version restore to null', () {
      expect(IdentifyDeduper.restore(null), isNull);
      expect(IdentifyDeduper.restore('not json'), isNull);
      expect(IdentifyDeduper.restore('[1,2,3]'), isNull);
      expect(IdentifyDeduper.restore('{"v":1}'), isNull);
      expect(
        IdentifyDeduper.restore(
          '{"v":99,"userId":"u-1","lastSentAt":1,"set":{},"setOnce":{}}',
        ),
        isNull,
      );
      expect(
        IdentifyDeduper.restore(
          '{"v":1,"userId":"","lastSentAt":1,"set":{},"setOnce":{}}',
        ),
        isNull,
      );
      expect(
        IdentifyDeduper.restore(
          '{"v":1,"userId":"u-1","lastSentAt":"nope","set":{},"setOnce":{}}',
        ),
        isNull,
      );
    });
  });

  group('decide is read-only', () {
    test('two identical decide calls agree (send case)', () {
      final d = fresh();
      expect(d.decide(set: {'a': 1}, setOnce: {}).send, isTrue);
      expect(d.decide(set: {'a': 1}, setOnce: {}).send, isTrue);
    });

    test('two identical decide calls agree (skip case)', () {
      final d = fresh();
      d.recordSent({'a': 1}, {});
      expect(d.decide(set: {'a': 1}, setOnce: {}).send, isFalse);
      expect(d.decide(set: {'a': 1}, setOnce: {}).send, isFalse);
    });
  });
}
