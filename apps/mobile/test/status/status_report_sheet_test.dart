import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/status/feed/presentation/status_report_menu.dart';
import 'package:mobile/features/status/feed/presentation/status_report_sheet.dart';

/// Opens the sheet from a button, and records what it returned.
Future<void> _openSheet(
  WidgetTester tester, {
  required StatusReportKind kind,
  required void Function(StatusReportSubmission?) onResult,
}) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(
        body: Builder(
          builder: (context) => Center(
            child: ElevatedButton(
              onPressed: () async {
                final result = await showStatusReportSheet(
                  context: context,
                  kind: kind,
                );
                onResult(result);
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
}

Color _ctaColor(WidgetTester tester) {
  final container = tester.widget<Container>(
    find.descendant(
      of: find.byKey(const Key('status-report-submit')),
      matching: find.byType(Container),
    ),
  );
  return ((container.decoration! as BoxDecoration).color)!;
}

void main() {
  group('copy differs by kind, everything else is one sheet', () {
    testWidgets('Report User', (tester) async {
      await _openSheet(
        tester,
        kind: StatusReportKind.user,
        onResult: (_) {},
      );

      expect(find.text('Report this user'), findsOneWidget);
      expect(find.text('Why are you reporting this user?'), findsOneWidget);
      expect(find.byKey(const Key('status-report-icon-user')), findsOneWidget);
    });

    testWidgets('Report Content', (tester) async {
      await _openSheet(
        tester,
        kind: StatusReportKind.content,
        onResult: (_) {},
      );

      expect(find.text('Report this content'), findsOneWidget);
      expect(find.text('Why are you reporting this content?'), findsOneWidget);
      expect(
        find.byKey(const Key('status-report-icon-content')),
        findsOneWidget,
      );
    });

    testWidgets('both carry the privacy footer', (tester) async {
      await _openSheet(tester, kind: StatusReportKind.user, onResult: (_) {});

      expect(
        find.text("Your reason is private. The user won't be notified."),
        findsOneWidget,
      );
    });
  });

  group('the Report CTA gates on both fields', () {
    testWidgets('disabled with both fields empty', (tester) async {
      StatusReportSubmission? result;
      await _openSheet(
        tester,
        kind: StatusReportKind.user,
        onResult: (r) => result = r,
      );

      expect(_ctaColor(tester), AppColors.reportCtaDisabled);

      // Tapping a disabled CTA must do nothing at all — not close, not submit.
      await tester.tap(find.byKey(const Key('status-report-submit')));
      await tester.pumpAndSettle();

      expect(result, isNull);
      expect(find.byKey(const Key('status-report-submit')), findsOneWidget);
    });

    testWidgets('disabled with an email but no reason', (tester) async {
      await _openSheet(tester, kind: StatusReportKind.user, onResult: (_) {});

      await tester.enterText(
        find.byKey(const Key('status-report-email')),
        'someone@example.com',
      );
      await tester.pump();

      expect(_ctaColor(tester), AppColors.reportCtaDisabled);
    });

    testWidgets('disabled with a reason but no email', (tester) async {
      await _openSheet(tester, kind: StatusReportKind.user, onResult: (_) {});

      await tester.enterText(
        find.byKey(const Key('status-report-reason')),
        'Offensive',
      );
      await tester.pump();

      expect(_ctaColor(tester), AppColors.reportCtaDisabled);
    });

    testWidgets('stays disabled for a malformed email', (tester) async {
      await _openSheet(tester, kind: StatusReportKind.user, onResult: (_) {});

      await tester.enterText(
        find.byKey(const Key('status-report-email')),
        'not-an-email',
      );
      await tester.enterText(
        find.byKey(const Key('status-report-reason')),
        'Offensive',
      );
      await tester.pump();

      expect(_ctaColor(tester), AppColors.reportCtaDisabled);
    });

    testWidgets('stays disabled for whitespace-only input', (tester) async {
      await _openSheet(tester, kind: StatusReportKind.user, onResult: (_) {});

      await tester.enterText(
        find.byKey(const Key('status-report-email')),
        '   ',
      );
      await tester.enterText(
        find.byKey(const Key('status-report-reason')),
        '   ',
      );
      await tester.pump();

      expect(_ctaColor(tester), AppColors.reportCtaDisabled);
    });

    testWidgets('turns red and submits trimmed values once both are valid',
        (tester) async {
      StatusReportSubmission? result;
      await _openSheet(
        tester,
        kind: StatusReportKind.content,
        onResult: (r) => result = r,
      );

      await tester.enterText(
        find.byKey(const Key('status-report-email')),
        '  someone@example.com  ',
      );
      await tester.enterText(
        find.byKey(const Key('status-report-reason')),
        '  Offensive imagery  ',
      );
      await tester.pump();

      expect(_ctaColor(tester), AppColors.reportCtaEnabled);

      await tester.tap(find.byKey(const Key('status-report-submit')));
      await tester.pumpAndSettle();

      expect(result, isNotNull);
      expect(result!.email, 'someone@example.com');
      expect(result!.reason, 'Offensive imagery');
    });
  });

  testWidgets('dismissing without submitting returns null', (tester) async {
    var called = false;
    StatusReportSubmission? result;
    await _openSheet(
      tester,
      kind: StatusReportKind.user,
      onResult: (r) {
        called = true;
        result = r;
      },
    );

    // Tap the barrier above the sheet.
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    expect(called, isTrue);
    expect(result, isNull);
  });
}
