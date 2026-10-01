import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/status/share/data/story_share_launcher.dart';
import 'package:mobile/features/status/share/presentation/status_story_share_sheet.dart';

import '../support/fake_analytics.dart';

/// A launcher whose installed-apps probe resolves only when the test says so,
/// which is the whole point: `status_share_sheet_viewed` must wait for it.
class _ControllableLauncher implements StoryShareLauncher {
  final Completer<Set<StoryShareTarget>> completer = Completer();

  @override
  Future<Set<StoryShareTarget>> installedTargets() => completer.future;

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

Future<void> _openSheet(
  WidgetTester tester, {
  required StoryShareLauncher launcher,
  required RecordingAnalytics analytics,
  DateTime? ctaTappedAt,
}) async {
  await tester.pumpWidget(MaterialApp(
    home: Builder(
      builder: (context) => Scaffold(
        body: Center(
          child: ElevatedButton(
            onPressed: () => showStatusStoryShareSheet(
              context: context,
              launcher: launcher,
              analytics: analytics,
              shareSessionId: 'sess-1',
              statusId: 's1',
              mediaType: 'image',
              isProAtEvent: true,
              ctaTappedAt: ctaTappedAt ?? DateTime.now(),
            ),
            child: const Text('Share'),
          ),
        ),
      ),
    ),
  ));
  await tester.tap(find.text('Share'));
  await tester.pump(); // start the sheet's route + kick the probe
}

void main() {
  testWidgets('does NOT fire on first paint — the probe is still in flight',
      (tester) async {
    final launcher = _ControllableLauncher();
    final analytics = RecordingAnalytics();
    await _openSheet(tester, launcher: launcher, analytics: analytics);

    // The sheet is on screen with every tile dimmed and untappable. Firing
    // here would report `apps_shown: []` on EVERY share and make the
    // property worthless — the exact bug this ordering exists to avoid.
    expect(find.byKey(const Key('status-story-share-sheet')), findsOneWidget);
    expect(analytics.fired('status_share_sheet_viewed'), isFalse);

    launcher.completer.complete(const {StoryShareTarget.whatsapp});
    await tester.pumpAndSettle();
    expect(analytics.fired('status_share_sheet_viewed'), isTrue);
  });

  testWidgets('reports the installed apps, excluding the always-present '
      '"More apps" row', (tester) async {
    final launcher = _ControllableLauncher();
    final analytics = RecordingAnalytics();
    await _openSheet(tester, launcher: launcher, analytics: analytics);

    launcher.completer.complete(const {
      StoryShareTarget.whatsapp,
      StoryShareTarget.instagram,
      // `moreApps` is never "installed", but assert the filter anyway so a
      // future launcher that returns it can't silently inflate the count.
      StoryShareTarget.moreApps,
    });
    await tester.pumpAndSettle();

    final props = analytics.propsFor('status_share_sheet_viewed');
    expect(props['apps_shown'], ['instagram', 'whatsapp']); // sorted, stable
    expect(props['apps_shown_count'], 2);
    expect(props['share_session_id'], 'sess-1');
    expect(props['status_id'], 's1');
    expect(props['media_type'], 'image');
    expect(props['is_pro_at_event'], isTrue);
  });

  testWidgets('no installed apps → empty list and a zero count (the iOS shape)',
      (tester) async {
    final launcher = _ControllableLauncher();
    final analytics = RecordingAnalytics();
    await _openSheet(tester, launcher: launcher, analytics: analytics);

    launcher.completer.complete(const <StoryShareTarget>{});
    await tester.pumpAndSettle();

    final props = analytics.propsFor('status_share_sheet_viewed');
    expect(props['apps_shown'], isEmpty);
    expect(props['apps_shown_count'], 0);
  });

  testWidgets('a FAILED probe still reports the step, as a zero-app view',
      (tester) async {
    final launcher = _ControllableLauncher();
    final analytics = RecordingAnalytics();
    await _openSheet(tester, launcher: launcher, analytics: analytics);

    launcher.completer.completeError(Exception('channel unavailable'));
    await tester.pumpAndSettle();

    // The sheet is still usable — "More apps" is always there — so dropping
    // the funnel step would understate how many users reached it.
    final props = analytics.propsFor('status_share_sheet_viewed');
    expect(props['apps_shown_count'], 0);
  });

  testWidgets('time_to_sheet_ms is measured from the CTA tap, not sheet build',
      (tester) async {
    final launcher = _ControllableLauncher();
    final analytics = RecordingAnalytics();
    await _openSheet(
      tester,
      launcher: launcher,
      analytics: analytics,
      ctaTappedAt: DateTime.now().subtract(const Duration(milliseconds: 800)),
    );

    launcher.completer.complete(const {StoryShareTarget.whatsapp});
    await tester.pumpAndSettle();

    final ms =
        analytics.propsFor('status_share_sheet_viewed')['time_to_sheet_ms'];
    expect(ms, isA<int>());
    expect(ms as int, greaterThanOrEqualTo(800));
  });

  testWidgets('a sheet dismissed BEFORE the probe lands emits nothing',
      (tester) async {
    final launcher = _ControllableLauncher();
    final analytics = RecordingAnalytics();
    await _openSheet(tester, launcher: launcher, analytics: analytics);

    // Back out while every tile is still dimmed. The probe is not
    // cancellable and will still complete below — but this user never had a
    // usable sheet, and counting them would understate the tap → sheet drop.
    Navigator.of(tester.element(find.text('Share'))).pop();
    await tester.pumpAndSettle();

    launcher.completer.complete(const {StoryShareTarget.whatsapp});
    await tester.pumpAndSettle();

    expect(analytics.fired('status_share_sheet_viewed'), isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets('stays silent when no analytics seam is wired (tests / null '
      'provider) and never throws', (tester) async {
    final launcher = _ControllableLauncher();
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () => showStatusStoryShareSheet(
                context: context,
                launcher: launcher,
              ),
              child: const Text('Share'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('Share'));
    await tester.pump();
    launcher.completer.complete(const {StoryShareTarget.whatsapp});
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('status-story-share-sheet')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
