@Tags(['golden'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/status/data/status_models.dart';
import 'package:mobile/features/status/details/bloc/status_profile_bloc.dart';
import 'package:mobile/features/status/details/bloc/status_profile_event.dart';
import 'package:mobile/features/status/details/presentation/status_details_screen.dart';
import 'package:mobile/features/status/feed/bloc/status_feed_bloc.dart';
import 'package:mobile/features/status/feed/bloc/status_feed_event.dart';
import 'package:mobile/features/status/feed/presentation/status_home_screen.dart';

import '../support/fake_repositories.dart';
import '../support/fake_status_services.dart';
import '../support/status_harness.dart';

/// Component goldens for the Status module (TAM-60 Phase 6). Rendered headlessly
/// at the Figma frame size (360×800) and reviewed side-by-side with the frame
/// exports under `specs/evidence/TAM-72/fidelity/figma-refs/`. Tagged `golden`
/// so the cross-platform gate (`--exclude-tags golden`) skips them; refresh
/// locally with
/// `flutter test --update-goldens test/goldens/status_golden_test.dart`.
///
/// Media is intentionally the branded AppNetworkImage fallback (the fixtures use
/// empty URLs) — a golden must never depend on the network. The Figma refs show
/// real deity art in that slot; everything AROUND it is what these lock.
Future<void> _pump(WidgetTester tester, Widget app, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(app);
  await tester.pumpAndSettle();
}

void main() {
  setUp(FakeStatusVideoPort.resetCounters);

  testWidgets('golden: status home (302:4384)', (tester) async {
    // TAM-168 — the personal fixture is used here because the mobile app now
    // only ever renders the personal face of the overlay.
    final repo = FakeStatusRepository(profile: statusPersonalProfileFixture());
    final bloc = StatusFeedBloc(
      repository: repo,
      viewThreshold: const Duration(milliseconds: 10),
    )..add(const StatusFeedStarted());
    addTearDown(bloc.close);
    await _pump(
      tester,
      statusTestApp(
        repository: repo,
        child: BlocProvider.value(value: bloc, child: const StatusHomeScreen()),
      ),
      const Size(360, 800),
    );
    await tester.pump(const Duration(milliseconds: 20));
    await tester.pumpAndSettle();

    await expectLater(
      find.byType(StatusHomeScreen),
      matchesGoldenFile('status_home.png'),
    );
  });

  testWidgets('golden: personal details (371:2185)', (tester) async {
    final repo = FakeStatusRepository(profile: statusPersonalProfileFixture());
    final bloc = StatusProfileBloc(
      repository: repo,
      avatarPicker: FakeStatusAvatarPicker(),
    )..add(const StatusProfileLoadRequested(StatusProfileType.personal));
    addTearDown(bloc.close);
    await _pump(
      tester,
      statusTestApp(
        repository: repo,
        child: BlocProvider.value(
          value: bloc,
          child: const StatusDetailsScreen(),
        ),
      ),
      const Size(360, 800),
    );

    await expectLater(
      find.byType(StatusDetailsScreen),
      matchesGoldenFile('status_personal_details.png'),
    );
  });

  // TAM-168 — the `golden: business details (371:3567)` case was deleted with
  // the Business persona. The Business Details screen no longer exists on
  // mobile; the Personal / Business tab-group is gone from Add-your-details
  // (see `status_details_screen.dart` and the TAM-168 spec's #PATH_DECISION).
}
