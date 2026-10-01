import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/ringtone/ringtone_routes.dart';

import '../support/fake_audio_engine.dart';
import '../support/fake_repositories.dart';
import '../support/ringtone_harness.dart';

void main() {
  testWidgets('Pro preview auto-plays on entry + renders hero/title/CTA',
      (tester) async {
    final engine = FakeAudioEngine();
    await pumpRingtonePreview(
      tester,
      repository: FakeRingtoneRepository(pro: true),
      args: const RingtonePreviewArgs(ringtoneId: 'rt1'),
      engine: engine,
    );

    expect(find.byKey(const Key('ringtone-preview-screen')), findsOneWidget);
    expect(find.byKey(const Key('ringtone-preview-image')), findsOneWidget);
    expect(find.byKey(const Key('ringtone-preview-title')), findsOneWidget);
    expect(find.byKey(const Key('ringtone-preview-set-cta')), findsOneWidget);
    expect(find.text('Set Ringtone'), findsOneWidget);
    // Auto-play on entry — the engine loaded + played the clip.
    expect(engine.calls.any((c) => c.startsWith('setUrl:')), isTrue);
    expect(engine.calls, contains('play'));
  });

  testWidgets('free/gated preview shows the restore prompt, never plays',
      (tester) async {
    final engine = FakeAudioEngine();
    await pumpRingtonePreview(
      tester,
      repository: FakeRingtoneRepository(pro: false),
      args: const RingtonePreviewArgs(ringtoneId: 'rt1'),
      engine: engine,
    );
    expect(find.byKey(const Key('ringtone-preview-restore')), findsOneWidget);
    expect(engine.calls.contains('play'), isFalse);
  });

  testWidgets('back/exit stops the audio (dispose → stop)', (tester) async {
    final engine = FakeAudioEngine();
    await pumpRingtonePreview(
      tester,
      repository: FakeRingtoneRepository(pro: true),
      args: const RingtonePreviewArgs(ringtoneId: 'rt1'),
      engine: engine,
    );
    expect(engine.calls, contains('play'));

    // Dispose the Preview subtree while the ProviderScope stays mounted — the
    // Preview's dispose stops playback (back/exit). Replacing the home subtree
    // keeps the shared AudioController/engine alive to observe the stop.
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(milliseconds: 10));
    expect(engine.calls, contains('stop'));
  });

  testWidgets('detail error → error copy + Retry', (tester) async {
    await pumpRingtonePreview(
      tester,
      repository: FakeRingtoneRepository(pro: true, failDetail: true),
      args: const RingtonePreviewArgs(ringtoneId: 'rt1'),
    );
    expect(find.byKey(const Key('ringtone-preview-error')), findsOneWidget);
    expect(find.byKey(const Key('ringtone-preview-retry')), findsOneWidget);
  });
}
