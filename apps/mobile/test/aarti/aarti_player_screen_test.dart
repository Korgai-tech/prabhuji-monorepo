import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/aarti/aarti_analytics.dart';

import '../support/aarti_harness.dart';
import '../support/fake_analytics.dart';
import '../support/fake_audio_engine.dart';
import '../support/fake_repositories.dart';

void main() {
  testWidgets('player renders cover/title/metadata/engagement/progress + controls',
      (tester) async {
    await pumpAartiPlayer(
      tester,
      repository: FakeAartiRepository(),
      args: playerArgs(['a0', 'a1'], 0),
    );

    for (final key in const [
      'aarti-player-cover',
      'aarti-player-title',
      'aarti-player-singer',
      'aarti-player-composer',
      'aarti-player-like',
      'aarti-player-share',
      'aarti-player-progress',
      'aarti-player-elapsed',
      'aarti-player-total',
      'aarti-player-rewind',
      'aarti-player-prev',
      'aarti-player-playpause',
      'aarti-player-next',
      'aarti-player-forward',
    ]) {
      expect(find.byKey(Key(key)), findsOneWidget, reason: key);
    }
    expect(find.text('Aarti 1'), findsOneWidget); // detail title for a0
  });

  testWidgets('play/pause toggles the shared engine', (tester) async {
    final engine = FakeAudioEngine();
    await pumpAartiPlayer(
      tester,
      repository: FakeAartiRepository(),
      args: playerArgs(['a0'], 0),
      engine: engine,
    );
    // Auto-play started the engine on open.
    expect(engine.calls.contains('play'), isTrue);

    await tester.tap(find.byKey(const Key('aarti-player-playpause')));
    await tester.pumpAndSettle();
    expect(engine.calls.contains('pause'), isTrue);
  });

  testWidgets('next advances to the next queue item', (tester) async {
    await pumpAartiPlayer(
      tester,
      repository: FakeAartiRepository(),
      args: playerArgs(['a0', 'a1'], 0),
    );
    expect(find.text('Aarti 1'), findsOneWidget);

    await tester.tap(find.byKey(const Key('aarti-player-next')));
    await tester.pumpAndSettle();
    expect(find.text('Aarti 2'), findsOneWidget); // advanced to a1
  });

  testWidgets('rewind/forward seek the engine ±10s (clamped)', (tester) async {
    final engine = FakeAudioEngine();
    await pumpAartiPlayer(
      tester,
      repository: FakeAartiRepository(),
      args: playerArgs(['a0'], 0),
      engine: engine,
    );
    engine.emitDuration(const Duration(seconds: 300));
    engine.emitPosition(const Duration(seconds: 100));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('aarti-player-forward')));
    await tester.pumpAndSettle();
    expect(engine.lastSeek, const Duration(seconds: 110));

    await tester.tap(find.byKey(const Key('aarti-player-rewind')));
    await tester.pumpAndSettle();
    expect(engine.lastSeek, const Duration(seconds: 100));
  });

  testWidgets('like toggles the count optimistically', (tester) async {
    final analytics = RecordingAnalytics();
    await pumpAartiPlayer(
      tester,
      repository: FakeAartiRepository(),
      args: playerArgs(['a0'], 0),
      analytics: analytics,
    );
    expect(find.text('24987 likes'), findsOneWidget);

    await tester.tap(find.byKey(const Key('aarti-player-like')));
    await tester.pumpAndSettle();
    expect(find.text('24988 likes'), findsOneWidget);
    expect(analytics.fired(AartiEvents.audioLikeChanged), isTrue);
  });

  testWidgets('share opens the sheet + fires share_tapped', (tester) async {
    final analytics = RecordingAnalytics();
    await pumpAartiPlayer(
      tester,
      repository: FakeAartiRepository(),
      args: playerArgs(['a0'], 0),
      analytics: analytics,
    );
    await tester.tap(find.byKey(const Key('aarti-player-share')));
    await tester.pumpAndSettle();
    expect(analytics.fired(AartiEvents.audioShareClicked), isTrue);
  });

  testWidgets('no server URL (unverified entitlement) → calm restore prompt',
      (tester) async {
    await pumpAartiPlayer(
      tester,
      repository: FakeAartiRepository(pro: false),
      args: playerArgs(['a0'], 0),
    );
    expect(find.byKey(const Key('aarti-player-restore')), findsOneWidget);
  });
}
