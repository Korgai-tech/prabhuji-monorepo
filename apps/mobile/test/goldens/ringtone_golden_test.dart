@Tags(['golden'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/ringtone/home/bloc/ringtone_home_bloc.dart';
import 'package:mobile/features/ringtone/home/bloc/ringtone_home_event.dart';
import 'package:mobile/features/ringtone/home/presentation/ringtone_home_screen.dart';
import 'package:mobile/features/ringtone/ringtone_routes.dart';
import 'package:mobile/features/ringtone/search/bloc/ringtone_search_bloc.dart';
import 'package:mobile/features/ringtone/search/bloc/ringtone_search_event.dart';
import 'package:mobile/features/ringtone/search/presentation/ringtone_search_screen.dart';
import 'package:mobile/features/ringtone/preview/presentation/ringtone_preview_screen.dart';

import '../support/fake_repositories.dart';
import '../support/ringtone_harness.dart';

/// Component goldens for the Ringtone module (TAM-60 Phase 6). Rendered
/// headlessly at a pinned phone size and reviewed side-by-side with the Figma
/// frame exports under `specs/evidence/TAM-68/fidelity/figma-refs/`. Tagged
/// `golden` so the cross-platform gate (`--exclude-tags golden`) skips them;
/// refresh locally with
/// `flutter test --update-goldens test/goldens/ringtone_golden_test.dart`.
Future<void> _pump(WidgetTester tester, Widget app, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(app);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('golden: ringtone home (670:4481)', (tester) async {
    final repo = FakeRingtoneRepository(pageSize: 9);
    final bloc = RingtoneHomeBloc(repository: repo)
      ..add(const RingtoneHomeLoadRequested());
    await _pump(
      tester,
      ringtoneTestApp(
        repository: repo,
        child: BlocProvider.value(value: bloc, child: const RingtoneHomeScreen()),
      ),
      const Size(360, 800),
    );
    await expectLater(
      find.byType(RingtoneHomeScreen),
      matchesGoldenFile('ringtone_home.png'),
    );
  });

  testWidgets('golden: search results (1073:3472)', (tester) async {
    final repo = FakeRingtoneRepository(pageSize: 9);
    final bloc = RingtoneSearchBloc(repository: repo)
      ..add(const RingtoneSearchSubmitted('Krishna'));
    await _pump(
      tester,
      ringtoneTestApp(
        repository: repo,
        child: BlocProvider.value(
          value: bloc,
          child: const RingtoneSearchScreen(query: 'Krishna'),
        ),
      ),
      const Size(360, 800),
    );
    await expectLater(
      find.byType(RingtoneSearchScreen),
      matchesGoldenFile('ringtone_search.png'),
    );
  });

  testWidgets('golden: ringtone preview (683:4775)', (tester) async {
    final repo = FakeRingtoneRepository(pro: true);
    await _pump(
      tester,
      ringtoneTestApp(
        repository: repo,
        child: const RingtonePreviewScreen(
          args: RingtonePreviewArgs(ringtoneId: 'rt1'),
        ),
      ),
      const Size(360, 840),
    );
    await expectLater(
      find.byType(RingtonePreviewScreen),
      matchesGoldenFile('ringtone_preview.png'),
    );
  });
}
