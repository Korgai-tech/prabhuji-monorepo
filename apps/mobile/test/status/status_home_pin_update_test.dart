import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/status/feed/bloc/status_feed_bloc.dart';
import 'package:mobile/features/status/feed/presentation/status_home_screen.dart';

import '../support/fake_repositories.dart';
import '../support/status_harness.dart';

/// Chat's status card `go`es to `/status?pinnedId=<id>` — the SAME Status
/// page, so an already-mounted screen must pick the new pin up and reload
/// (no second page is stacked on the feed any more).
Future<void> _settle(WidgetTester tester) async {
  await tester.pumpAndSettle();
  await tester.pump(const Duration(milliseconds: 20));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a new pinnedStatusId on the mounted screen reloads with the pin',
      (tester) async {
    tester.view.physicalSize = const Size(400, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final repo = FakeStatusRepository(pageSize: 6);
    final bloc = StatusFeedBloc(
      repository: repo,
      // Short, and pumped past below — a pending dwell Timer at teardown
      // trips flutter_test's `!timersPending` invariant.
      viewThreshold: const Duration(milliseconds: 10),
    );
    addTearDown(bloc.close);
    final pin = ValueNotifier<String?>(null);
    addTearDown(pin.dispose);

    await tester.pumpWidget(statusTestApp(
      repository: repo,
      child: BlocProvider<StatusFeedBloc>.value(
        value: bloc,
        child: ValueListenableBuilder<String?>(
          valueListenable: pin,
          builder: (_, id, _) => StatusHomeScreen(pinnedStatusId: id),
        ),
      ),
    ));
    await _settle(tester);
    expect(repo.pinnedIdCalls, [null], reason: 'plain tab entry');

    // Chat pins a status.
    pin.value = 'pin-1';
    await _settle(tester);
    expect(repo.pinnedIdCalls, [null, 'pin-1']);
    expect(bloc.state.pinnedStatusId, 'pin-1');

    // Same pin again → no extra fetch.
    pin.value = 'pin-1';
    await _settle(tester);
    expect(repo.pinnedIdCalls, [null, 'pin-1']);

    // A different pin → reload with it.
    pin.value = 'pin-2';
    await _settle(tester);
    expect(repo.pinnedIdCalls, [null, 'pin-1', 'pin-2']);

    // Pin cleared (Status tab re-tapped) → left to the reselect refresh.
    pin.value = null;
    await _settle(tester);
    expect(repo.pinnedIdCalls, [null, 'pin-1', 'pin-2']);
  });
}
