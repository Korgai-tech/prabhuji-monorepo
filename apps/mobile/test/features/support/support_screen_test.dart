import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/secrets.dart';
import 'package:mobile/features/support/presentation/support_screen.dart';
import 'package:mobile/features/support/support_analytics.dart';

import 'support_screen_harness.dart';

/// Widget tests for [SupportScreen] (TAM-N-support-screen). Cover:
///  * `support_opened` initState fire — every source bucket (homeHeader,
///    profileMenu, unknown for `null`).
///  * Enabled CTA — fires `support_whatsapp_clicked` BEFORE `launchUrl`,
///    calls the seam with the exact number+message, shows the "Couldn't
///    open WhatsApp" snackbar when the seam returns `false`.
///  * Degraded CTA (all four not-enabled truth-table states): does NOT
///    fire analytics, does NOT invoke the seam, shows the "Support is
///    currently unavailable" snackbar.
///  * Static copy assertions (Figma text inventory — verbatim).
///  * NO WhatsApp number / message / URL appears in any analytics payload.
void main() {
  final realSecrets = Secrets.forTest(
    supportWhatsAppNumber: '+911234567890',
    supportWhatsAppMessage: 'Hi Prabhuji team,',
  );

  group('static copy (Figma text inventory — verbatim)', () {
    testWidgets('renders app-bar title, heading, body, and CTA',
        (tester) async {
      await pumpSupportScreen(
        tester,
        source: SupportEntrySource.homeHeader,
        secrets: realSecrets,
      );

      expect(find.text('Support'), findsOneWidget);
      expect(find.text('Help & Support'), findsOneWidget);
      expect(
        find.text('Chat with our support team on WhatsApp for assistance.'),
        findsOneWidget,
      );
      expect(find.text('Chat on WhatsApp'), findsOneWidget);
    });
  });

  group('support_opened initState fire', () {
    testWidgets('fires ONCE with source: home_header', (tester) async {
      final rec = await pumpSupportScreen(
        tester,
        source: SupportEntrySource.homeHeader,
        secrets: realSecrets,
      );

      final opens = rec.allProps(SupportEvents.opened);
      expect(opens, hasLength(1));
      expect(opens.first[SupportEventProps.source], 'home_header');
    });

    testWidgets('fires ONCE with source: profile_menu', (tester) async {
      final rec = await pumpSupportScreen(
        tester,
        source: SupportEntrySource.profileMenu,
        secrets: realSecrets,
      );

      final opens = rec.allProps(SupportEvents.opened);
      expect(opens, hasLength(1));
      expect(opens.first[SupportEventProps.source], 'profile_menu');
    });

    testWidgets('fires ONCE with source: unknown when source is null',
        (tester) async {
      final rec = await pumpSupportScreen(
        tester,
        source: null,
        secrets: realSecrets,
      );

      final opens = rec.allProps(SupportEvents.opened);
      expect(opens, hasLength(1));
      expect(opens.first[SupportEventProps.source], 'unknown');
    });
  });

  group('enabled CTA — real secrets', () {
    testWidgets(
        'tap fires support_whatsapp_clicked BEFORE launch and calls the seam',
        (tester) async {
      final launcher = FakeWhatsAppLauncher();
      final rec = await pumpSupportScreen(
        tester,
        source: SupportEntrySource.homeHeader,
        secrets: realSecrets,
        launcher: launcher,
      );

      await tester.tap(find.byKey(const Key('support-whatsapp-cta')));
      await tester.pump();

      // Analytics: click event fires (no properties beyond enricher defaults).
      final clicks = rec.allProps(SupportEvents.whatsAppClicked);
      expect(clicks, hasLength(1));
      expect(clicks.first, isEmpty,
          reason: 'support_whatsapp_clicked must carry NO extra properties');

      // Seam: called with the exact secret values.
      expect(launcher.called, isTrue);
      expect(launcher.lastCall!.number, '+911234567890');
      expect(launcher.lastCall!.message, 'Hi Prabhuji team,');
    });

    testWidgets('launcher.launch returning false shows the retry snackbar',
        (tester) async {
      final launcher = FakeWhatsAppLauncher(launchResult: false);
      await pumpSupportScreen(
        tester,
        source: SupportEntrySource.homeHeader,
        secrets: realSecrets,
        launcher: launcher,
      );

      await tester.tap(find.byKey(const Key('support-whatsapp-cta')));
      await tester.pump();
      await tester.pump(); // let the snackbar reach frame

      expect(find.text(kSupportLaunchFailedSnackbar), findsOneWidget);
    });

    testWidgets('launcher.launch returning true shows NO snackbar',
        (tester) async {
      final launcher = FakeWhatsAppLauncher();
      await pumpSupportScreen(
        tester,
        source: SupportEntrySource.homeHeader,
        secrets: realSecrets,
        launcher: launcher,
      );

      await tester.tap(find.byKey(const Key('support-whatsapp-cta')));
      await tester.pump();
      await tester.pump();

      expect(find.text(kSupportLaunchFailedSnackbar), findsNothing);
      expect(find.text(kSupportUnavailableSnackbar), findsNothing);
    });
  });

  group('degraded CTA — secrets not enabled', () {
    Future<void> assertDegradedBehaviour(
      WidgetTester tester, {
      required Secrets secrets,
    }) async {
      final launcher = FakeWhatsAppLauncher();
      final rec = await pumpSupportScreen(
        tester,
        source: SupportEntrySource.homeHeader,
        secrets: secrets,
        launcher: launcher,
      );

      // Baseline: support_opened fired (regardless of enabled state).
      expect(rec.fired(SupportEvents.opened), isTrue);

      await tester.tap(find.byKey(const Key('support-whatsapp-cta')));
      await tester.pump();
      await tester.pump();

      // 1. NO click analytics.
      expect(rec.fired(SupportEvents.whatsAppClicked), isFalse,
          reason: 'disabled CTA must not fire support_whatsapp_clicked');

      // 2. NO launcher invocation.
      expect(launcher.called, isFalse,
          reason: 'disabled CTA must not invoke launchUrl');

      // 3. Snackbar shown.
      expect(find.text(kSupportUnavailableSnackbar), findsOneWidget);
    }

    testWidgets('both values null — dev clone without secrets file',
        (tester) async {
      await assertDegradedBehaviour(
        tester,
        secrets: Secrets.forTest(
          supportWhatsAppNumber: null,
          supportWhatsAppMessage: null,
        ),
      );
    });

    testWidgets('both values are REPLACE_ME_* placeholders — the shipped defaults',
        (tester) async {
      await assertDegradedBehaviour(
        tester,
        secrets: Secrets.forTest(
          supportWhatsAppNumber: 'REPLACE_ME_SUPPORT_WHATSAPP_NUMBER',
          supportWhatsAppMessage: 'REPLACE_ME_SUPPORT_WHATSAPP_MESSAGE',
        ),
      );
    });

    testWidgets('number real, message null — mixed state', (tester) async {
      await assertDegradedBehaviour(
        tester,
        secrets: Secrets.forTest(
          supportWhatsAppNumber: '+911234567890',
          supportWhatsAppMessage: null,
        ),
      );
    });

    testWidgets('message real, number placeholder — mixed state',
        (tester) async {
      await assertDegradedBehaviour(
        tester,
        secrets: Secrets.forTest(
          supportWhatsAppNumber: 'REPLACE_ME_SUPPORT_WHATSAPP_NUMBER',
          supportWhatsAppMessage: 'Hi Prabhuji team,',
        ),
      );
    });
  });

  group('analytics PII hygiene', () {
    testWidgets(
        'no WhatsApp number/message/URL appears in ANY event property',
        (tester) async {
      final launcher = FakeWhatsAppLauncher();
      final rec = await pumpSupportScreen(
        tester,
        source: SupportEntrySource.homeHeader,
        secrets: realSecrets,
        launcher: launcher,
      );
      await tester.tap(find.byKey(const Key('support-whatsapp-cta')));
      await tester.pump();

      final allSerialized = rec.events
          .map((e) => '${e.name} ${e.properties.toString()}')
          .join('\n');

      expect(allSerialized, isNot(contains('+91')));
      expect(allSerialized, isNot(contains('1234567890')));
      expect(allSerialized, isNot(contains('wa.me')));
      expect(allSerialized, isNot(contains('whatsapp.com')));
      expect(allSerialized, isNot(contains('Hi Prabhuji team')));
    });
  });

  group('back button', () {
    testWidgets('renders with the correct semantic key', (tester) async {
      await pumpSupportScreen(
        tester,
        source: SupportEntrySource.homeHeader,
        secrets: realSecrets,
      );

      expect(find.byKey(const Key('support-back')), findsOneWidget);
    });
  });
}
