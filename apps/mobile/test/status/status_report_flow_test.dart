import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/status/feed/presentation/status_credit_chip.dart';

import '../support/fake_repositories.dart';
import '../support/status_harness.dart';

/// End-to-end wiring for the report flow on Status Home: chip kebab → menu →
/// sheet → repository → toast.
///
/// The unit tests around each piece pass even when the pieces are not connected
/// to each other. This file is what catches "the menu opens but picking a row
/// does nothing", "the sheet submits but never calls the API", and "the report
/// failed but the user was told it succeeded".
Future<void> _openReportMenu(WidgetTester tester) async {
  // Let the chip finish its auto-expand so the kebab is hit-testable.
  await tester.pump(kCreditChipAnimationDuration);
  await tester.tap(find.byKey(const Key('status-credit-chip-menu')).first);
  await tester.pumpAndSettle();
}

Future<void> _fillAndSubmit(
  WidgetTester tester, {
  String email = 'someone@example.com',
  String reason = 'Offensive imagery',
}) async {
  await tester.enterText(find.byKey(const Key('status-report-email')), email);
  await tester.enterText(find.byKey(const Key('status-report-reason')), reason);
  await tester.pump();
  await tester.tap(find.byKey(const Key('status-report-submit')));
  await tester.pumpAndSettle();
}

/// Drain the chip's hold timer so teardown does not trip `!timersPending`.
Future<void> _settleChipTimers(WidgetTester tester) async {
  await tester.pump(kCreditChipHoldDuration);
  await tester.pump(kCreditChipAnimationDuration);
}

void main() {
  testWidgets('the kebab opens the two-item report menu', (tester) async {
    await pumpStatusHome(tester, repository: FakeStatusRepository());
    await _openReportMenu(tester);

    expect(find.text('Report User'), findsOneWidget);
    expect(find.text('Report Content'), findsOneWidget);

    // Dismiss so the test ends clean.
    await tester.tapAt(const Offset(5, 5));
    await tester.pumpAndSettle();
    await _settleChipTimers(tester);
  });

  testWidgets('Report Content files a content report and toasts success',
      (tester) async {
    final repo = FakeStatusRepository();
    await pumpStatusHome(tester, repository: repo);
    await _openReportMenu(tester);

    await tester.tap(find.text('Report Content'));
    await tester.pumpAndSettle();
    expect(find.text('Report this content'), findsOneWidget);

    await _fillAndSubmit(tester);

    expect(repo.submittedReports, hasLength(1));
    final filed = repo.submittedReports.single;
    expect(filed.type, 'content');
    expect(filed.reporterEmail, 'someone@example.com');
    expect(filed.reason, 'Offensive imagery');
    // The status the report was filed FROM — the server resolves the reported
    // account from exactly this id, so it must be the card the user was on.
    expect(filed.statusId, isNotEmpty);

    expect(find.text('Reported successfully'), findsOneWidget);
    expect(find.text('Report this content'), findsNothing); // sheet closed

    await _settleChipTimers(tester);
  });

  testWidgets('Report User files a user report against the same status',
      (tester) async {
    final repo = FakeStatusRepository();
    await pumpStatusHome(tester, repository: repo);
    await _openReportMenu(tester);

    await tester.tap(find.text('Report User'));
    await tester.pumpAndSettle();
    expect(find.text('Report this user'), findsOneWidget);

    await _fillAndSubmit(tester, reason: 'Abusive account');

    expect(repo.submittedReports.single.type, 'user');
    expect(find.text('Reported successfully'), findsOneWidget);

    await _settleChipTimers(tester);
  });

  testWidgets('dismissing the menu files nothing', (tester) async {
    final repo = FakeStatusRepository();
    await pumpStatusHome(tester, repository: repo);
    await _openReportMenu(tester);

    await tester.tapAt(const Offset(5, 5));
    await tester.pumpAndSettle();

    expect(repo.submittedReports, isEmpty);
    expect(find.text('Report this user'), findsNothing);

    await _settleChipTimers(tester);
  });

  testWidgets('dismissing the sheet files nothing', (tester) async {
    final repo = FakeStatusRepository();
    await pumpStatusHome(tester, repository: repo);
    await _openReportMenu(tester);

    await tester.tap(find.text('Report Content'));
    await tester.pumpAndSettle();
    await tester.tapAt(const Offset(5, 5));
    await tester.pumpAndSettle();

    expect(repo.submittedReports, isEmpty);
    expect(find.text('Reported successfully'), findsNothing);

    await _settleChipTimers(tester);
  });

  testWidgets('a failed report is NOT reported as a success', (tester) async {
    // The regression that matters most here: if the catch branch ever falls
    // through to the success toast, users are told their report was filed when
    // nothing was written — the worst possible outcome for a compliance flow.
    final repo = FakeStatusRepository()..failSubmitReport = true;
    await pumpStatusHome(tester, repository: repo);
    await _openReportMenu(tester);

    await tester.tap(find.text('Report Content'));
    await tester.pumpAndSettle();
    await _fillAndSubmit(tester);

    expect(find.text('Reported successfully'), findsNothing);
    expect(find.text('report failed'), findsOneWidget);

    await _settleChipTimers(tester);
  });
}
