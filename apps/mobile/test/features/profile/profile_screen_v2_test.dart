import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/profile/profile_analytics.dart';
import 'package:mobile/features/status/data/status_models.dart';

import '../../support/fake_analytics.dart';
import '../../support/profile_harness.dart';

void main() {
  group('Profile v2 — identity block + section content', () {
    testWidgets('renders the pinned app bar with back + title',
        (tester) async {
      await pumpProfileScreenV2(tester);
      expect(find.byKey(const Key('profile-v2-appbar')), findsOneWidget);
      expect(find.byKey(const Key('profile-v2-back')), findsOneWidget);
      expect(find.byKey(const Key('profile-v2-title')), findsOneWidget);
      expect(find.text('Profile & Settings'), findsOneWidget);
    });

    testWidgets('renders name from statusProfile when personalDisplayName '
        'is set (Option A: shared record)', (tester) async {
      await pumpProfileScreenV2(
        tester,
        statusProfile: const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          personalDisplayName: 'Aditya Nath',
        ),
        me: meUserFixture(name: 'Should Not Show'),
      );
      expect(find.text('Aditya Nath'), findsOneWidget);
      expect(find.text('Should Not Show'), findsNothing);
    });

    testWidgets('falls back to MeUser.name when statusProfile has no name '
        '(first-time user)', (tester) async {
      await pumpProfileScreenV2(
        tester,
        statusProfile: StatusProfileData.empty,
        me: meUserFixture(name: 'From Onboarding'),
      );
      expect(find.text('From Onboarding'), findsOneWidget);
    });

    testWidgets('renders phone number from MeUser without country code',
        (tester) async {
      await pumpProfileScreenV2(
        tester,
        me: meUserFixture(
          phoneCountryCode: '91',
          phoneNumber: '9876543210',
        ),
      );
      expect(find.text('9876543210'), findsOneWidget);
      expect(find.textContaining('+91'), findsNothing);
    });

    testWidgets('Free user: renders "Upgrade to VIP" tile', (tester) async {
      await pumpProfileScreenV2(tester, isPro: false);
      expect(find.byKey(const Key('profile-v2-upgrade-to-vip')), findsOneWidget);
      expect(find.text('Upgrade to VIP'), findsOneWidget);
      expect(find.byKey(const Key('profile-v2-manage-subscription')),
          findsNothing);
      expect(find.byKey(const Key('profile-identity-vip-pill')), findsNothing);
    });

    testWidgets('VIP user: renders "Manage Subscription" tile + VIP pill',
        (tester) async {
      await pumpProfileScreenV2(tester, isPro: true);
      expect(find.byKey(const Key('profile-v2-manage-subscription')),
          findsOneWidget);
      expect(find.text('Manage Subscription'), findsOneWidget);
      expect(find.byKey(const Key('profile-v2-upgrade-to-vip')), findsNothing);
      expect(find.byKey(const Key('profile-identity-vip-pill')), findsOneWidget);
    });

    testWidgets('Support tile renders in the Help & Support section',
        (tester) async {
      await pumpProfileScreenV2(tester);
      expect(find.byKey(const Key('profile-v2-support')), findsOneWidget);
      expect(find.text('Support'), findsOneWidget);
    });

    testWidgets('Account & Legal section renders ALL six v1 rows in order',
        (tester) async {
      await pumpProfileScreenV2(tester);
      final tiles = <Key>[
        const Key('profile-v2-terms'),
        const Key('profile-v2-privacy'),
        const Key('profile-v2-pricing'),
        const Key('profile-v2-deletion'),
        const Key('profile-v2-language'),
        const Key('profile-v2-logout'),
      ];
      for (final k in tiles) {
        expect(find.byKey(k), findsOneWidget, reason: '${k.toString()} missing');
      }
      // Ensure the labels are present too (guards against a key rename that
      // silently loses copy).
      expect(find.text('Terms & Conditions'), findsOneWidget);
      expect(find.text('Privacy Policy'), findsOneWidget);
      expect(find.text('Pricing Policy'), findsOneWidget);
      expect(find.text('Data deletion'), findsOneWidget);
      expect(find.text('Select Language'), findsOneWidget);
      expect(find.text('Log out'), findsOneWidget);
    });
  });

  group('Profile v2 — navigation targets', () {
    testWidgets('Free user tapping Upgrade pushes /paywall', (tester) async {
      final spy = ProfileRouteSpy();
      await pumpProfileScreenV2(tester, isPro: false, routeSpy: spy);
      await tester.tap(find.byKey(const Key('profile-v2-upgrade-to-vip')));
      await tester.pumpAndSettle();
      expect(spy.last, '/paywall');
    });

    testWidgets(
        'VIP user tapping Manage Subscription pushes /profile/subscription '
        '(TAM-125)', (tester) async {
      final spy = ProfileRouteSpy();
      await pumpProfileScreenV2(tester, isPro: true, routeSpy: spy);
      await tester.tap(find.byKey(const Key('profile-v2-manage-subscription')));
      await tester.pumpAndSettle();
      expect(spy.last, '/profile/subscription');
    });

    testWidgets('Tapping Language pushes /language', (tester) async {
      final spy = ProfileRouteSpy();
      await pumpProfileScreenV2(tester, routeSpy: spy);
      await tester.ensureVisible(find.byKey(const Key('profile-v2-language')));
      await tester.tap(find.byKey(const Key('profile-v2-language')));
      await tester.pumpAndSettle();
      expect(spy.last, '/language');
    });

    testWidgets('Tapping identity card pushes /profile/edit', (tester) async {
      final spy = ProfileRouteSpy();
      await pumpProfileScreenV2(tester, routeSpy: spy);
      await tester.tap(find.byKey(const Key('profile-identity-edit')));
      await tester.pumpAndSettle();
      expect(spy.last, '/profile/edit');
    });

    testWidgets('Tapping Support pushes /support', (tester) async {
      final spy = ProfileRouteSpy();
      await pumpProfileScreenV2(tester, routeSpy: spy);
      await tester.tap(find.byKey(const Key('profile-v2-support')));
      await tester.pumpAndSettle();
      expect(spy.last, '/support');
    });
  });

  group('Profile v2 — logout dialog wiring', () {
    testWidgets('Tapping Log out opens the confirmation dialog + fires '
        'logout_clicked (intent) BEFORE the dialog opens', (tester) async {
      final analytics = RecordingAnalytics();
      await pumpProfileScreenV2(tester, analytics: analytics);
      await tester.ensureVisible(find.byKey(const Key('profile-v2-logout')));
      await tester.tap(find.byKey(const Key('profile-v2-logout')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('profile-logout-dialog')), findsOneWidget);
      expect(analytics.fired(ProfileEvents.logoutClicked), isTrue);
    });

    testWidgets('Cancel dismisses the dialog — no logout_result fires',
        (tester) async {
      final analytics = RecordingAnalytics();
      await pumpProfileScreenV2(tester, analytics: analytics);
      await tester.ensureVisible(find.byKey(const Key('profile-v2-logout')));
      await tester.tap(find.byKey(const Key('profile-v2-logout')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('profile-logout-dialog-cancel')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('profile-logout-dialog')), findsNothing);
      expect(analytics.fired(ProfileEvents.logoutResult), isFalse);
    });
  });

  group('Profile v2 — analytics', () {
    testWidgets('profile_page_viewed fires once on mount with '
        'previous_screen=home', (tester) async {
      final analytics = RecordingAnalytics();
      await pumpProfileScreenV2(tester, analytics: analytics);
      final page = analytics.allProps(ProfileEvents.pageViewed);
      expect(page, hasLength(1));
      expect(page.first[ProfileEventProps.previousScreen], 'home');
    });

    testWidgets('logout_clicked carries source_screen=profile_menu',
        (tester) async {
      final analytics = RecordingAnalytics();
      await pumpProfileScreenV2(tester, analytics: analytics);
      await tester.ensureVisible(find.byKey(const Key('profile-v2-logout')));
      await tester.tap(find.byKey(const Key('profile-v2-logout')));
      await tester.pumpAndSettle();
      final props = analytics.propsFor(ProfileEvents.logoutClicked);
      expect(props[ProfileEventProps.sourceScreen], 'profile_menu');
    });
  });
}
