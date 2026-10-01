import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/status/data/status_avatar_picker.dart';
import 'package:mobile/features/status/data/status_models.dart';

import '../support/fake_repositories.dart';
import '../support/fake_status_services.dart';
import '../support/status_harness.dart';

void main() {
  group('details chrome (Figma 371:2185)', () {
    testWidgets(
        'renders the nav, personal-only fields, and Save (TAM-168 — no tab group)',
        (tester) async {
      await pumpStatusDetailsScreen(
        tester,
        repository: FakeStatusRepository(profile: StatusProfileData.empty),
      );

      expect(find.byKey(const Key('status-details-back')), findsOneWidget);
      expect(find.byKey(const Key('status-details-title')), findsOneWidget);
      expect(find.byKey(const Key('status-avatar-picker')), findsOneWidget);
      expect(find.byKey(const Key('status-field-personal-name')), findsOneWidget);
      expect(find.text('Your name'), findsOneWidget);
      expect(find.byKey(const Key('status-save')), findsOneWidget);

      // TAM-168 — Personal / Business tab group is removed.
      expect(find.byKey(const Key('status-tab-group')), findsNothing);
      expect(find.byKey(const Key('status-tab-personal')), findsNothing);
      expect(find.byKey(const Key('status-tab-business')), findsNothing);

      // Business form is gone entirely.
      expect(find.byKey(const Key('status-field-business-name')), findsNothing);
      expect(find.byKey(const Key('status-field-business-details')), findsNothing);
      expect(find.byKey(const Key('status-field-business-mobile')), findsNothing);
      expect(find.byKey(const Key('status-business-info-label')), findsNothing);
    });

    testWidgets(
        'TAM-168 — grandfathered activeProfileType=business loads the personal '
        'form (no server rewrite, no crash)', (tester) async {
      await pumpStatusDetailsScreen(
        tester,
        repository: FakeStatusRepository(profile: statusBusinessProfileFixture()),
        // A stale caller can still pass StatusProfileType.business — the bloc
        // ignores it and lands on the personal form regardless.
        initialType: StatusProfileType.business,
      );

      // Personal name from the fixture ('Aditya Nath') prefills the form.
      expect(find.text('Aditya Nath'), findsOneWidget);
      // Business fields are not rendered anywhere on this screen.
      expect(find.text('Srinath Builders'), findsNothing);
      expect(find.text('Own your Dream Home'), findsNothing);
      expect(find.text('9876543210'), findsNothing);
    });

    testWidgets(
        'TAM-168 — title reads "अपना नाम और फोटो डालें" when nothing saved',
        (tester) async {
      await pumpStatusDetailsScreen(
        tester,
        repository: FakeStatusRepository(profile: StatusProfileData.empty),
      );

      expect(find.text('अपना नाम और फोटो डालें'), findsOneWidget);
    });

    testWidgets(
        'TAM-168 — title reads "अपना नाम और फोटो बदलें" when a name is saved',
        (tester) async {
      await pumpStatusDetailsScreen(
        tester,
        repository: FakeStatusRepository(profile: statusPersonalProfileFixture()),
      );

      expect(find.text('अपना नाम और फोटो बदलें'), findsOneWidget);
    });
  });

  group('validation surfaces inline (mirrors the TAM-71 Zod personal limit)', () {
    testWidgets('an empty name blocks Save and shows the error', (tester) async {
      final repo = FakeStatusRepository(profile: StatusProfileData.empty);
      await pumpStatusDetailsScreen(tester, repository: repo);

      await tester.tap(find.byKey(const Key('status-save')));
      await tester.pumpAndSettle();

      expect(repo.saveProfileCalls, 0);
      expect(
        find.byKey(const Key('status-field-personal-name-error')),
        findsOneWidget,
      );
    });

    testWidgets('the name field hard-caps at 40 chars (the user cannot exceed it)',
        (tester) async {
      await pumpStatusDetailsScreen(
        tester,
        repository: FakeStatusRepository(profile: StatusProfileData.empty),
      );

      await tester.enterText(
        find.byKey(const Key('status-field-personal-name')),
        'a' * 60,
      );
      await tester.pumpAndSettle();

      final field = tester.widget<TextField>(
        find.byKey(const Key('status-field-personal-name')),
      );
      expect(field.controller!.text.length, 40);
    });
  });

  group('save', () {
    testWidgets('a valid personal save reaches the repo', (tester) async {
      final repo = FakeStatusRepository(profile: StatusProfileData.empty);
      await pumpStatusDetailsScreen(tester, repository: repo);

      await tester.enterText(
        find.byKey(const Key('status-field-personal-name')),
        'Aditya Nath',
      );
      await tester.tap(find.byKey(const Key('status-save')));
      await tester.pumpAndSettle();

      expect(repo.saveProfileCalls, 1);
      expect(repo.lastSaved!.personalDisplayName, 'Aditya Nath');
      expect(repo.lastSaved!.activeProfileType, StatusProfileType.personal);
      // TAM-168 — business fields must go out as null so a legacy row is not
      // rewritten.
      expect(repo.lastSaved!.businessName, isNull);
      expect(repo.lastSaved!.businessDetails, isNull);
      expect(repo.lastSaved!.businessMobileNumber, isNull);
    });

    testWidgets('a failed save KEEPS what was typed (§7)', (tester) async {
      final repo = FakeStatusRepository(
        profile: StatusProfileData.empty,
        failSave: true,
      );
      await pumpStatusDetailsScreen(tester, repository: repo);

      await tester.enterText(
        find.byKey(const Key('status-field-personal-name')),
        'Aditya Nath',
      );
      await tester.tap(find.byKey(const Key('status-save')));
      await tester.pumpAndSettle();

      expect(find.text('Aditya Nath'), findsOneWidget, reason: 'not discarded');
    });
  });

  group('avatar picker', () {
    testWidgets('tapping it runs the picker seam', (tester) async {
      // `cancelled` keeps the avatar URL empty — a picked https:// URL would put
      // an AppNetworkImage on screen, whose shimmer never settles in a widget
      // test. The bloc test covers the picked→save path.
      final picker = FakeStatusAvatarPicker(
        result: const StatusAvatarPickResult.cancelled(),
      );
      await pumpStatusDetailsScreen(
        tester,
        repository: FakeStatusRepository(profile: StatusProfileData.empty),
        avatarPicker: picker,
      );

      await tester.tap(find.byKey(const Key('status-avatar-picker')));
      await tester.pumpAndSettle();

      expect(picker.pickCalls, 1);
    });

    testWidgets('the Phase-1 unavailable picker shows the honest message',
        (tester) async {
      await pumpStatusDetailsScreen(
        tester,
        repository: FakeStatusRepository(profile: StatusProfileData.empty),
        avatarPicker: FakeStatusAvatarPicker(), // defaults to unavailable
      );

      await tester.tap(find.byKey(const Key('status-avatar-picker')));
      await tester.pumpAndSettle();

      expect(find.text(kAvatarUploadUnavailableCopy), findsOneWidget);
    });
  });
}
