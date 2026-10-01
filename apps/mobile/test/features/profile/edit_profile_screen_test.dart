import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/profile/profile_analytics.dart';
import 'package:mobile/features/status/data/status_avatar_picker.dart';
import 'package:mobile/features/status/data/status_models.dart';

import '../../support/fake_analytics.dart';
import '../../support/fake_repositories.dart';
import '../../support/fake_status_services.dart';
import '../../support/profile_harness.dart';

void main() {
  group('Edit Profile chrome', () {
    testWidgets('renders app bar, avatar picker, name field, phone display, '
        'save CTA', (tester) async {
      await pumpEditProfileScreen(tester);
      expect(find.byKey(const Key('edit-profile-appbar')), findsOneWidget);
      expect(find.byKey(const Key('edit-profile-back')), findsOneWidget);
      expect(find.text('Edit Profile'), findsOneWidget);
      expect(find.byKey(const Key('edit-profile-avatar-picker')),
          findsOneWidget);
      expect(find.byKey(const Key('edit-profile-camera-badge')),
          findsOneWidget);
      expect(find.byKey(const Key('edit-profile-name-field')), findsOneWidget);
      expect(find.byKey(const Key('edit-profile-phone-display')),
          findsOneWidget);
      expect(find.byKey(const Key('edit-profile-save')), findsOneWidget);
    });

    testWidgets('seeds name from statusProfile.personalDisplayName',
        (tester) async {
      await pumpEditProfileScreen(
        tester,
        statusProfile: const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          personalDisplayName: 'Aditya Nath',
        ),
      );
      expect(find.text('Aditya Nath'), findsOneWidget);
    });

    testWidgets('seeds name from MeUser.name when statusProfile is empty',
        (tester) async {
      await pumpEditProfileScreen(
        tester,
        statusProfile: StatusProfileData.empty,
        me: meUserFixture(name: 'From MeUser'),
      );
      expect(find.text('From MeUser'), findsOneWidget);
    });

    testWidgets('phone display shows number without country code from MeUser',
        (tester) async {
      await pumpEditProfileScreen(
        tester,
        me: meUserFixture(
          phoneCountryCode: '91',
          phoneNumber: '9876543210',
        ),
      );
      expect(find.text('9876543210'), findsOneWidget);
      expect(find.textContaining('+91'), findsNothing);
    });
  });

  group('Edit Profile — save enable/disable', () {
    testWidgets('Save is disabled when nothing has changed', (tester) async {
      await pumpEditProfileScreen(
        tester,
        statusProfile: const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          personalDisplayName: 'Aditya Nath',
        ),
      );
      final save = tester.widget<GestureDetector>(
        find.byKey(const Key('edit-profile-save')),
      );
      expect(save.onTap, isNull);
    });

    testWidgets('Save enables when the name changes', (tester) async {
      await pumpEditProfileScreen(
        tester,
        statusProfile: const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          personalDisplayName: 'Aditya Nath',
        ),
      );
      await tester.enterText(
        find.byKey(const Key('edit-profile-name-field')),
        'Aditya Nath Kumar',
      );
      await tester.pump();
      final save = tester.widget<GestureDetector>(
        find.byKey(const Key('edit-profile-save')),
      );
      expect(save.onTap, isNotNull);
    });

    testWidgets('Save stays disabled when the name is trimmed to empty',
        (tester) async {
      await pumpEditProfileScreen(
        tester,
        statusProfile: const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          personalDisplayName: 'Aditya Nath',
        ),
      );
      await tester.enterText(
        find.byKey(const Key('edit-profile-name-field')),
        '   ',
      );
      await tester.pump();
      final save = tester.widget<GestureDetector>(
        find.byKey(const Key('edit-profile-save')),
      );
      expect(save.onTap, isNull);
    });
  });

  group('Edit Profile — save flow', () {
    testWidgets(
        'Save sends ONE PUT with the FULL record — business fields are '
        'passthrough (spec critical note #1)', (tester) async {
      const seeded = StatusProfileData(
        activeProfileType: StatusProfileType.personal,
        personalDisplayName: 'Aditya Nath',
        businessName: 'Srinath Builders',
        businessDetails: 'Own your Dream Home',
        businessMobileNumber: '9998887777',
      );
      final repo = FakeStatusRepository(profile: seeded);
      // Both `statusProfileProvider` (drives UI state) AND the repo are
      // seeded — the provider gives the screen its initial state, the
      // repo receives the outgoing PUT.
      await pumpEditProfileScreen(
        tester,
        repository: repo,
        statusProfile: seeded,
      );
      await tester.enterText(
        find.byKey(const Key('edit-profile-name-field')),
        'Aditya Kumar',
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('edit-profile-save')));
      await tester.pumpAndSettle();

      expect(repo.saveProfileCalls, 1);
      final saved = repo.lastSaved!;
      expect(saved.activeProfileType, StatusProfileType.personal);
      expect(saved.personalDisplayName, 'Aditya Kumar');
      // Business fields pass through UNCHANGED — this is the whole point of
      // Option A: a Profile-v2 save must never null out Status details.
      expect(saved.businessName, 'Srinath Builders');
      expect(saved.businessDetails, 'Own your Dream Home');
      expect(saved.businessMobileNumber, '9998887777');
    });

    testWidgets('Save fires profile_name_edit_result on success — with '
        'name_length_bucket + name_present + result=success', (tester) async {
      final analytics = RecordingAnalytics();
      final repo = FakeStatusRepository(
        profile: const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          personalDisplayName: 'A',
        ),
      );
      await pumpEditProfileScreen(
        tester,
        repository: repo,
        analytics: analytics,
      );
      await tester.enterText(
        find.byKey(const Key('edit-profile-name-field')),
        'Aditya Nath Kumar',
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('edit-profile-save')));
      await tester.pumpAndSettle();

      final props = analytics.propsFor(ProfileEvents.nameEditResult);
      expect(props[ProfileEventProps.result], 'success');
      // `name_present` was removed — name/photo presence is reported by the
      // global `has_name` / `has_photo` properties the enricher stamps on
      // every event, not per-call here.
      expect(props.containsKey('name_present'), isFalse);
      expect(props[ProfileEventProps.nameLengthBucket], 'medium');
      expect(props[ProfileEventProps.errorCode], isNull);
      // NEVER the raw name.
      expect(props.values.any((v) => v.toString().contains('Aditya')), isFalse);
    });

    testWidgets('Save fires profile_name_edit_result on failure with '
        'error_code', (tester) async {
      final analytics = RecordingAnalytics();
      final repo = FakeStatusRepository(
        profile: const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          personalDisplayName: 'Aditya',
        ),
      )..failSave = true;
      await pumpEditProfileScreen(
        tester,
        repository: repo,
        analytics: analytics,
      );
      await tester.enterText(
        find.byKey(const Key('edit-profile-name-field')),
        'Aditya Kumar',
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('edit-profile-save')));
      await tester.pumpAndSettle();

      final props = analytics.propsFor(ProfileEvents.nameEditResult);
      expect(props[ProfileEventProps.result], 'failure');
      expect(props[ProfileEventProps.errorCode], isNotNull);
      // Snackbar with a retry-cue is shown; the screen stays open.
      expect(find.byKey(const Key('edit-profile-screen')), findsOneWidget);
    });
  });

  group('Edit Profile — avatar picker', () {
    testWidgets('picked outcome stages the URL and fires '
        'profile_avatar_edit_result{picked}', (tester) async {
      final analytics = RecordingAnalytics();
      final picker = FakeStatusAvatarPicker(
        result:
            const StatusAvatarPickResult.picked('https://cdn.example/pic.jpg'),
      );
      final repo = FakeStatusRepository(
        profile: const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          personalDisplayName: 'Aditya',
        ),
      );
      await pumpEditProfileScreen(
        tester,
        repository: repo,
        avatarPicker: picker,
        analytics: analytics,
      );
      await tester.tap(find.byKey(const Key('edit-profile-camera-badge')));
      // Bounded pumps — the CachedNetworkImage shimmer under the picked
      // URL never settles, so pumpAndSettle would time out.
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      final props = analytics.propsFor(ProfileEvents.avatarEditResult);
      expect(props[ProfileEventProps.avatarStatus], 'picked');
      // Never the URL.
      expect(props.values.any((v) => v.toString().contains('cdn.example')),
          isFalse);
      // Save should now be enabled (avatar changed even if name didn't).
      final save = tester.widget<GestureDetector>(
        find.byKey(const Key('edit-profile-save')),
      );
      expect(save.onTap, isNotNull);
    });

    testWidgets('cancelled outcome fires {cancelled}, no snackbar, no state '
        'change', (tester) async {
      final analytics = RecordingAnalytics();
      final picker = FakeStatusAvatarPicker(
        result: const StatusAvatarPickResult.cancelled(),
      );
      await pumpEditProfileScreen(
        tester,
        avatarPicker: picker,
        analytics: analytics,
      );
      await tester.tap(find.byKey(const Key('edit-profile-camera-badge')));
      await tester.pumpAndSettle();
      final props = analytics.propsFor(ProfileEvents.avatarEditResult);
      expect(props[ProfileEventProps.avatarStatus], 'cancelled');
      expect(find.byType(SnackBar), findsNothing);
    });

    testWidgets('unavailable outcome fires {unavailable} + shows the picker '
        'copy', (tester) async {
      final analytics = RecordingAnalytics();
      final picker = FakeStatusAvatarPicker(
        result: const StatusAvatarPickResult.unavailable(),
      );
      await pumpEditProfileScreen(
        tester,
        avatarPicker: picker,
        analytics: analytics,
      );
      await tester.tap(find.byKey(const Key('edit-profile-camera-badge')));
      await tester.pump();
      final props = analytics.propsFor(ProfileEvents.avatarEditResult);
      expect(props[ProfileEventProps.avatarStatus], 'unavailable');
      expect(find.text(kAvatarUploadUnavailableCopy), findsOneWidget);
    });

    testWidgets('failed outcome fires {failed} with the picker\'s error_code '
        '+ shows the picker copy', (tester) async {
      final analytics = RecordingAnalytics();
      final picker = FakeStatusAvatarPicker(
        result: const StatusAvatarPickResult.failed('s3_offline'),
      );
      await pumpEditProfileScreen(
        tester,
        avatarPicker: picker,
        analytics: analytics,
      );
      await tester.tap(find.byKey(const Key('edit-profile-camera-badge')));
      await tester.pump();
      final props = analytics.propsFor(ProfileEvents.avatarEditResult);
      expect(props[ProfileEventProps.avatarStatus], 'failed');
      expect(props[ProfileEventProps.errorCode], 's3_offline');
      expect(find.text(kAvatarUploadUnavailableCopy), findsOneWidget);
    });
  });

  group('Edit Profile — async load states', () {
    testWidgets('loading state shows spinner', (tester) async {
      await pumpEditProfileScreen(tester, statusProfileLoading: true);
      expect(find.byKey(const Key('edit-profile-loading')), findsOneWidget);
    });

    testWidgets('error state shows retry affordance', (tester) async {
      await pumpEditProfileScreen(tester, statusProfileError: true);
      expect(find.byKey(const Key('edit-profile-error')), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}
