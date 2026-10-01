@Tags(['golden'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mantras/data/mantras_models.dart';
import 'package:mobile/features/mantras/listing/bloc/mantras_listing_bloc.dart';
import 'package:mobile/features/mantras/listing/bloc/mantras_listing_event.dart';
import 'package:mobile/features/mantras/listing/presentation/mantras_listing_screen.dart';
import 'package:mobile/features/mantras/main/bloc/mantras_main_bloc.dart';
import 'package:mobile/features/mantras/main/bloc/mantras_main_event.dart';
import 'package:mobile/features/mantras/main/presentation/mantras_main_screen.dart';
import 'package:mobile/features/mantras/player/presentation/mantras_player_screen.dart';

import '../support/fake_repositories.dart';
import '../support/mantras_harness.dart';

/// Component goldens for the Mantras module (TAM-60 Phase 6). Rendered headlessly
/// at a pinned phone size and reviewed side-by-side with the Figma frame exports
/// under `specs/evidence/TAM-66/fidelity/figma-refs/`. Tagged `golden` so the
/// cross-platform gate (`--exclude-tags golden`) skips them; refresh locally with
/// `flutter test --update-goldens test/goldens/mantras_golden_test.dart`.
Future<void> _pump(WidgetTester tester, Widget app, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(app);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('golden: main page', (tester) async {
    final repo = FakeMantrasRepository();
    final bloc = MantrasMainBloc(repository: repo)
      ..add(const MantrasMainLoadRequested());
    await _pump(
      tester,
      mantrasTestApp(
        repository: repo,
        child: BlocProvider.value(value: bloc, child: const MantrasMainScreen()),
      ),
      const Size(360, 800),
    );
    await expectLater(
      find.byType(MantrasMainScreen),
      matchesGoldenFile('mantras_main.png'),
    );
  });

  testWidgets('golden: 2-column listing', (tester) async {
    final repo = FakeMantrasRepository();
    const query = MantraListQuery(
      title: 'Newly Added Mantras',
      sourceListType: 'newly_added',
      section: MantraListSection.newlyAdded,
    );
    final bloc = MantrasListingBloc(repository: repo, query: query)
      ..add(const MantrasListingLoadRequested());
    await _pump(
      tester,
      mantrasTestApp(
        repository: repo,
        child:
            BlocProvider.value(value: bloc, child: const MantrasListingScreen(query: query)),
      ),
      const Size(360, 800),
    );
    await expectLater(
      find.byType(MantrasListingScreen),
      matchesGoldenFile('mantras_listing.png'),
    );
  });

  testWidgets('golden: full player', (tester) async {
    final repo = FakeMantrasRepository();
    await _pump(
      tester,
      mantrasTestApp(
        repository: repo,
        child: MantrasPlayerScreen(args: mantrasPlayerArgs(const ['m0', 'm1'], 0)),
      ),
      const Size(360, 840),
    );
    await expectLater(
      find.byType(MantrasPlayerScreen),
      matchesGoldenFile('mantras_player.png'),
    );
  });
}
