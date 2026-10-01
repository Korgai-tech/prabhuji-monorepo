@Tags(['golden'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/aarti/data/aarti_models.dart';
import 'package:mobile/features/aarti/listing/bloc/aarti_listing_bloc.dart';
import 'package:mobile/features/aarti/listing/bloc/aarti_listing_event.dart';
import 'package:mobile/features/aarti/listing/presentation/aarti_listing_screen.dart';
import 'package:mobile/features/aarti/main/bloc/aarti_main_bloc.dart';
import 'package:mobile/features/aarti/main/bloc/aarti_main_event.dart';
import 'package:mobile/features/aarti/main/presentation/aarti_main_screen.dart';
import 'package:mobile/features/aarti/player/presentation/aarti_player_screen.dart';

import '../support/aarti_harness.dart';
import '../support/fake_repositories.dart';

/// Component goldens for the Aarti module (TAM-60 Phase 6). Rendered headlessly
/// at a pinned phone size and reviewed side-by-side with the Figma frame exports
/// under `specs/evidence/TAM-64/fidelity/figma-refs/`. Tagged `golden` so the
/// cross-platform gate (`--exclude-tags golden`) skips them; refresh locally with
/// `flutter test --update-goldens test/goldens/aarti_golden_test.dart`.
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
    final repo = FakeAartiRepository();
    final bloc = AartiMainBloc(repository: repo)..add(const AartiMainLoadRequested());
    await _pump(
      tester,
      aartiTestApp(
        repository: repo,
        child: BlocProvider.value(value: bloc, child: const AartiMainScreen()),
      ),
      const Size(360, 800),
    );
    await expectLater(
      find.byType(AartiMainScreen),
      matchesGoldenFile('aarti_main.png'),
    );
  });

  testWidgets('golden: 2-column listing', (tester) async {
    final repo = FakeAartiRepository();
    const query = AartiListQuery(title: 'Aarti', sourceListType: 'category', categoryId: 'c1');
    final bloc = AartiListingBloc(repository: repo, query: query)
      ..add(const AartiListingLoadRequested());
    await _pump(
      tester,
      aartiTestApp(
        repository: repo,
        child: BlocProvider.value(value: bloc, child: const AartiListingScreen(query: query)),
      ),
      const Size(360, 800),
    );
    await expectLater(
      find.byType(AartiListingScreen),
      matchesGoldenFile('aarti_listing.png'),
    );
  });

  testWidgets('golden: full player', (tester) async {
    final repo = FakeAartiRepository();
    await _pump(
      tester,
      aartiTestApp(
        repository: repo,
        child: AartiPlayerScreen(args: playerArgs(const ['a0', 'a1'], 0)),
      ),
      const Size(360, 840),
    );
    await expectLater(
      find.byType(AartiPlayerScreen),
      matchesGoldenFile('aarti_player.png'),
    );
  });
}
