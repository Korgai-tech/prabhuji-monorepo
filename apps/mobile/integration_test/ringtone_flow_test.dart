import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile/features/ringtone/home/bloc/ringtone_home_bloc.dart';
import 'package:mobile/features/ringtone/home/bloc/ringtone_home_event.dart';
import 'package:mobile/features/ringtone/home/presentation/ringtone_home_screen.dart';
import 'package:mobile/features/ringtone/preview/presentation/ringtone_preview_screen.dart';
import 'package:mobile/features/ringtone/ringtone_routes.dart';

// The integration_test harness reuses the widget-test doubles so it runs
// headlessly (no live API / no Android device needed) — the Pro-vs-free gate,
// the preview auto-play, and the native-set state machine (fake channel) are
// exercised end-to-end through the real widgets, blocs and shared audio engine.
// On-device native set (WRITE_SETTINGS → RingtoneManager) is deferred to the
// epic device sweep (spec Evidence).
import '../test/support/fake_audio_engine.dart';
import '../test/support/fake_repositories.dart';
import '../test/support/fake_set_ringtone_service.dart';
import '../test/support/ringtone_harness.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Pro: preview auto-plays → Set Ringtone (granted) → success',
      (tester) async {
    tester.view.physicalSize = const Size(400, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final engine = FakeAudioEngine();
    final setService = FakeSetRingtoneService(granted: true, setResult: true);
    final repo = FakeRingtoneRepository(pro: true, setCount: 1500);

    await tester.pumpWidget(ringtoneTestApp(
      repository: repo,
      setService: setService,
      engine: engine,
      isPro: true,
      child: const RingtonePreviewScreen(
        args: RingtonePreviewArgs(ringtoneId: 'rt1'),
      ),
    ));
    await tester.pumpAndSettle();

    // Auto-plays on entry.
    expect(engine.calls, contains('play'));
    expect(find.byKey(const Key('ringtone-preview-set-cta')), findsOneWidget);

    // Set Ringtone with the permission already granted → native set + success.
    await tester.tap(find.byKey(const Key('ringtone-preview-set-cta')));
    await tester.pumpAndSettle();
    expect(setService.setCalls, 1);
    expect(repo.incrementSetCountCalls, 1);
    expect(find.text('Ringtone set'), findsOneWidget);
  });

  testWidgets('Set Ringtone denied path shows the settings copy', (tester) async {
    tester.view.physicalSize = const Size(400, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final setService = FakeSetRingtoneService(granted: false);
    await tester.pumpWidget(ringtoneTestApp(
      repository: FakeRingtoneRepository(pro: true),
      setService: setService,
      isPro: true,
      child: const RingtonePreviewScreen(
        args: RingtonePreviewArgs(ringtoneId: 'rt1'),
      ),
    ));
    await tester.pumpAndSettle();

    // Tap → permission required → settings deep-link opened.
    await tester.tap(find.byKey(const Key('ringtone-preview-set-cta')));
    await tester.pumpAndSettle();
    expect(setService.openSettingsCalls, 1);

    // User returns without granting → the app resumes → denied copy surfaces
    // (the screen re-checks canWrite() via the lifecycle observer).
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(
      find.text(
        'Please enable ringtone permission from Settings to set this ringtone.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('Free: home renders (discovery free), no preview/paywall on entry',
      (tester) async {
    tester.view.physicalSize = const Size(400, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final repo = FakeRingtoneRepository(pro: false, pageSize: 6);
    final bloc = RingtoneHomeBloc(repository: repo)
      ..add(const RingtoneHomeLoadRequested());
    await tester.pumpWidget(ringtoneTestApp(
      repository: repo,
      isPro: false,
      child: BlocProvider<RingtoneHomeBloc>.value(
        value: bloc,
        child: const RingtoneHomeScreen(),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('ringtone-home-screen')), findsOneWidget);
    expect(find.byType(RingtonePreviewScreen), findsNothing);
    expect(find.byKey(const Key('ringtone-grid')), findsOneWidget);
  });
}
