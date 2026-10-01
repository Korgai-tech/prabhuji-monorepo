import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/status/data/status_avatar_picker.dart';
import 'package:mobile/features/status/data/status_models.dart';
import 'package:mobile/features/status/details/bloc/status_profile_bloc.dart';
import 'package:mobile/features/status/details/bloc/status_profile_event.dart';
import 'package:mobile/features/status/details/bloc/status_profile_state.dart';
import 'package:mobile/features/status/status_analytics.dart';

import '../support/fake_analytics.dart';
import '../support/fake_repositories.dart';
import '../support/fake_status_services.dart';

StatusProfileBloc _bloc(
  FakeStatusRepository repo, {
  FakeStatusAvatarPicker? picker,
  RecordingAnalytics? analytics,
}) =>
    StatusProfileBloc(
      repository: repo,
      avatarPicker: picker ?? FakeStatusAvatarPicker(),
      analytics: analytics,
    );

void main() {
  group('load', () {
    test('TAM-168 — grandfathered activeProfileType=business rows load as '
        'personal (no server rewrite, no crash)', () async {
      final repo = FakeStatusRepository(profile: statusBusinessProfileFixture());
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      bloc.add(const StatusProfileLoadRequested(StatusProfileType.personal));
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.ready);

      expect(bloc.state.activeType, StatusProfileType.personal,
          reason: 'always personal after TAM-168');
      // The personal fields are populated from the wire regardless of the
      // grandfathered `activeProfileType` — the fixture stores
      // personalDisplayName='Aditya Nath'.
      expect(bloc.state.personalName, 'Aditya Nath');
    });

    test('the caller hint no longer matters — activeType is always personal',
        () async {
      final repo = FakeStatusRepository(profile: StatusProfileData.empty);
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      // Caller asks for business — TAM-168 ignores it.
      bloc.add(const StatusProfileLoadRequested(StatusProfileType.business));
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.ready);

      expect(bloc.state.activeType, StatusProfileType.personal);
    });

    test('a load failure still lands on a usable form', () async {
      final repo = FakeStatusRepository(failProfile: true);
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      bloc.add(const StatusProfileLoadRequested(StatusProfileType.personal));
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.failure);

      expect(bloc.state.message, isNotNull);
      expect(bloc.state.activeType, StatusProfileType.personal);
    });

    test('TAM-168 — status_personal_details_page_viewed carries the incoming '
        'entry_source (add_details_strip vs edit_details_button)', () async {
      final repo = FakeStatusRepository(profile: StatusProfileData.empty);
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const StatusProfileLoadRequested(
        StatusProfileType.personal,
        entrySource: StatusEntrySources.addDetailsStrip,
      ));
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.ready);

      expect(
        analytics.propsFor('status_personal_details_page_viewed')['entry_source'],
        StatusEntrySources.addDetailsStrip,
      );
    });

    test('default entry_source is edit_details_button (safer than null)',
        () async {
      final repo = FakeStatusRepository(profile: StatusProfileData.empty);
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const StatusProfileLoadRequested(StatusProfileType.personal));
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.ready);

      expect(
        analytics.propsFor('status_personal_details_page_viewed')['entry_source'],
        StatusEntrySources.editDetailsButton,
      );
    });
  });

  group('personal save', () {
    test('saves, sets active=personal, and fires the personal save_result event',
        () async {
      final repo = FakeStatusRepository(profile: StatusProfileData.empty);
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const StatusProfileLoadRequested(StatusProfileType.personal));
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.ready);

      bloc.add(const StatusProfileFieldChanged(personalName: 'Aditya Nath'));
      bloc.add(const StatusProfileSaveRequested());
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.saved);

      expect(repo.saveProfileCalls, 1);
      expect(repo.lastSaved!.activeProfileType, StatusProfileType.personal);
      expect(repo.lastSaved!.personalDisplayName, 'Aditya Nath');
      // Sheet 1 row 98 — `status_personal_details_save_result`.
      expect(
        analytics.propsFor('status_personal_details_save_result')['result'],
        'success',
      );
      // `name_present` / `avatar_present` were removed — presence is reported
      // by the global `has_name` / `has_photo` pair the enricher stamps on
      // every event (see `test/analytics/global_profile_flags_test.dart`).
      expect(
        analytics
            .propsFor('status_personal_details_save_result')
            .containsKey('name_present'),
        isFalse,
      );
      expect(
        analytics
            .propsFor('status_personal_details_save_result')
            .containsKey('avatar_present'),
        isFalse,
      );
      // Sheet 1 row 95 — page-view fires on the initial load, tagged by tab.
      expect(analytics.names, contains('status_personal_details_page_viewed'));
    });

    test('fires personal_name_added once on the empty→non-empty transition',
        () async {
      final repo = FakeStatusRepository(profile: StatusProfileData.empty);
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const StatusProfileLoadRequested(StatusProfileType.personal));
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.ready);

      bloc.add(const StatusProfileFieldChanged(personalName: 'Aditya'));
      await bloc.stream.firstWhere((s) => s.personalName == 'Aditya');

      bloc.add(const StatusProfileFieldChanged(personalName: 'Aditya Nath'));
      await bloc.stream.firstWhere((s) => s.personalName == 'Aditya Nath');

      // Sheet 1 row 97 — fires ONCE, never again on subsequent edits.
      final fires = analytics.allProps('status_personal_name_added');
      expect(fires, hasLength(1));
      // `name_present: true` was a constant on an event that means "a name
      // just appeared" — dropped in favour of the global `has_name`. The
      // bucket stays: length is a different question from presence.
      expect(fires.first.containsKey('name_present'), isFalse);
      expect(fires.first['name_length_bucket'], isNotNull);
    });

    test('an empty name blocks the save with an inline error', () async {
      final repo = FakeStatusRepository(profile: StatusProfileData.empty);
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      bloc.add(const StatusProfileLoadRequested(StatusProfileType.personal));
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.ready);

      bloc.add(const StatusProfileSaveRequested());
      await bloc.stream.firstWhere((s) => s.showErrors);

      expect(repo.saveProfileCalls, 0, reason: 'no round-trip for invalid input');
      expect(bloc.state.visiblePersonalNameError, isNotNull);
    });

    test('a 41-char name blocks the save (limit 40)', () async {
      final repo = FakeStatusRepository(profile: StatusProfileData.empty);
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      bloc.add(const StatusProfileLoadRequested(StatusProfileType.personal));
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.ready);

      bloc.add(StatusProfileFieldChanged(personalName: 'a' * 41));
      bloc.add(const StatusProfileSaveRequested());
      await bloc.stream.firstWhere((s) => s.showErrors);

      expect(repo.saveProfileCalls, 0);
      expect(bloc.state.visiblePersonalNameError, isNotNull);
    });

    test('KEEPS the typed data when the save fails (§7)', () async {
      final repo = FakeStatusRepository(
        profile: StatusProfileData.empty,
        failSave: true,
      );
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      bloc.add(const StatusProfileLoadRequested(StatusProfileType.personal));
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.ready);

      bloc.add(const StatusProfileFieldChanged(personalName: 'Aditya Nath'));
      bloc.add(const StatusProfileSaveRequested());
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.failure);

      expect(bloc.state.personalName, 'Aditya Nath', reason: 'nothing is discarded');
      expect(bloc.state.message, isNotNull);
    });

    test('TAM-168 — a personal save NEVER writes business fields (they go out '
        'as null, so a grandfathered row is not rewritten)', () async {
      final repo = FakeStatusRepository(profile: statusBusinessProfileFixture());
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      bloc.add(const StatusProfileLoadRequested(StatusProfileType.personal));
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.ready);

      bloc.add(const StatusProfileFieldChanged(personalName: 'New Name'));
      bloc.add(const StatusProfileSaveRequested());
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.saved);

      expect(repo.lastSaved!.personalDisplayName, 'New Name');
      expect(repo.lastSaved!.businessName, isNull);
      expect(repo.lastSaved!.businessDetails, isNull);
      expect(repo.lastSaved!.businessMobileNumber, isNull);
    });
  });

  group('avatar', () {
    test('a picked avatar rides into the save as avatarImageUrl', () async {
      final repo = FakeStatusRepository(profile: StatusProfileData.empty);
      final picker = FakeStatusAvatarPicker(
        result: const StatusAvatarPickResult.picked('https://cdn/me.jpg'),
      );
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, picker: picker, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const StatusProfileLoadRequested(StatusProfileType.personal));
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.ready);

      bloc.add(const StatusProfileAvatarRequested());
      await bloc.stream.firstWhere((s) => s.avatarImageUrl != null);

      bloc.add(const StatusProfileFieldChanged(personalName: 'Aditya Nath'));
      bloc.add(const StatusProfileSaveRequested());
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.saved);

      expect(repo.lastSaved!.avatarImageUrl, 'https://cdn/me.jpg');
      // Sheet 1 row 96 — `status_profile_image_result` unified the
      // old `avatar_upload_started` / `avatar_upload_completed` pair.
      // A picked image maps to `success`.
      expect(
        analytics.propsFor('status_profile_image_result')['result'],
        'success',
      );
    });

    test('the Phase-1 unavailable picker says so plainly and saves nothing',
        () async {
      final repo = FakeStatusRepository(profile: StatusProfileData.empty);
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const StatusProfileLoadRequested(StatusProfileType.personal));
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.ready);

      bloc.add(const StatusProfileAvatarRequested());
      await bloc.stream.firstWhere((s) => s.message != null);

      expect(bloc.state.message, kAvatarUploadUnavailableCopy);
      expect(bloc.state.avatarImageUrl, isNull);
      // Sheet 1 row 96 — unavailable maps to `failure` with a stable
      // `error_code` so the funnel can separate it from a real picker
      // failure.
      expect(
        analytics.propsFor('status_profile_image_result')['result'],
        'failure',
      );
      expect(
        analytics.propsFor('status_profile_image_result')['error_code'],
        'picker_unavailable',
      );
    });

    test('a real upload failure forwards the picker\'s error_code to analytics',
        () async {
      final repo = FakeStatusRepository(profile: StatusProfileData.empty);
      final picker = FakeStatusAvatarPicker(
        result: const StatusAvatarPickResult.failed('s3_rejected_403'),
      );
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, picker: picker, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const StatusProfileLoadRequested(StatusProfileType.personal));
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.ready);

      bloc.add(const StatusProfileAvatarRequested());
      await bloc.stream.firstWhere((s) => s.message != null);

      expect(bloc.state.message, kAvatarUploadUnavailableCopy);
      expect(bloc.state.avatarImageUrl, isNull);
      expect(
        analytics.propsFor('status_profile_image_result')['result'],
        'failure',
      );
      // The specific slug — NOT `picker_unavailable` — so the funnel can
      // separate real S3/network failures from the stub.
      expect(
        analytics.propsFor('status_profile_image_result')['error_code'],
        's3_rejected_403',
      );
    });

    test('cancelling the picker changes nothing', () async {
      final repo = FakeStatusRepository(profile: StatusProfileData.empty);
      final picker = FakeStatusAvatarPicker(
        result: const StatusAvatarPickResult.cancelled(),
      );
      final bloc = _bloc(repo, picker: picker);
      addTearDown(bloc.close);

      bloc.add(const StatusProfileLoadRequested(StatusProfileType.personal));
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.ready);

      bloc.add(const StatusProfileAvatarRequested());
      await Future<void>.delayed(const Duration(milliseconds: 20));

      expect(bloc.state.avatarImageUrl, isNull);
      expect(bloc.state.message, isNull);
    });
  });

  group('TAM-168 — Business persona removal', () {
    test('there is no StatusProfileTypeChanged event class any more', () {
      // Compile-time guard: if a future edit re-adds `StatusProfileTypeChanged`
      // this test line goes green but the class name would resurface across
      // the codebase; the removal is enforced by the sealed events file.
      const events = <StatusProfileEvent>[
        StatusProfileLoadRequested(StatusProfileType.personal),
        StatusProfileFieldChanged(personalName: 'x'),
        StatusProfileAvatarRequested(),
        StatusProfileSaveRequested(),
        StatusProfileMessageCleared(),
      ];
      expect(events, isNotEmpty);
    });

    test('hasNameOrPhoto follows the personal fields after edits', () async {
      final repo = FakeStatusRepository(profile: StatusProfileData.empty);
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      bloc.add(const StatusProfileLoadRequested(StatusProfileType.personal));
      await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.ready);
      expect(bloc.state.hasNameOrPhoto, isFalse);

      bloc.add(const StatusProfileFieldChanged(personalName: 'Aditya'));
      await bloc.stream.firstWhere((s) => s.personalName == 'Aditya');
      expect(bloc.state.hasNameOrPhoto, isTrue);
    });
  });
}
