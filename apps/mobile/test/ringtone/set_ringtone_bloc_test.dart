import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/ringtone/preview/bloc/set_ringtone_bloc.dart';
import 'package:mobile/features/ringtone/preview/bloc/set_ringtone_event.dart';
import 'package:mobile/features/ringtone/preview/bloc/set_ringtone_state.dart';
import 'package:mobile/features/ringtone/ringtone_analytics.dart';

import '../support/fake_analytics.dart';
import '../support/fake_repositories.dart';
import '../support/fake_set_ringtone_service.dart';

/// The WRITE_SETTINGS set-ringtone Dart state machine (TAM-68), fully exercised
/// with a fake platform channel — no Android device. Covers the granted-first,
/// permission-required→granted→success, permission-required→denied, and
/// set-failed paths, and asserts the tri-state Sheet-1 rows 123–125 events.
void main() {
  const start = SetRingtoneStartRequested(
    ringtoneId: 'rt1',
    audioUrl: 'https://s/rt1.mp3',
    title: 'Gurur Brahma Mantra',
    deitySlug: 'hanuman',
  );

  SetRingtoneBloc build(
    FakeSetRingtoneService service, {
    FakeRingtoneRepository? repo,
    RecordingAnalytics? analytics,
  }) =>
      SetRingtoneBloc(
        service: service,
        repository: repo ?? FakeRingtoneRepository(),
        analytics: analytics,
      );

  test('permission already granted → sets immediately (success)', () async {
    final analytics = RecordingAnalytics();
    final service = FakeSetRingtoneService(granted: true, setResult: true);
    final repo = FakeRingtoneRepository(setCount: 1500);
    final bloc = build(service, repo: repo, analytics: analytics)..add(start);
    await Future<void>.delayed(Duration.zero);

    expect(bloc.state.status, SetRingtoneStatus.success);
    expect(bloc.state.setCount, 1501); // set-count incremented on success
    expect(service.openSettingsCalls, 0);
    expect(service.setCalls, 1);

    // Row 123 — `set_ringtone_clicked` with `permission_status_before_click`.
    expect(analytics.fired(RingtoneEvents.setRingtoneClicked), isTrue);
    expect(
      analytics.propsFor(RingtoneEvents.setRingtoneClicked)[
          RingtoneEventProps.permissionStatusBeforeClick],
      RingtoneEventProps.permissionGranted,
    );

    // Row 125 — `set_ringtone_result` with `result: success` + device fields.
    expect(analytics.fired(RingtoneEvents.setRingtoneResult), isTrue);
    final resultProps = analytics.propsFor(RingtoneEvents.setRingtoneResult);
    expect(resultProps[RingtoneEventProps.result],
        RingtoneEventProps.resultSuccess);
    expect(resultProps.containsKey(RingtoneEventProps.deviceModel), isTrue);
    expect(resultProps.containsKey(RingtoneEventProps.androidVersion), isTrue);
    expect(resultProps[RingtoneEventProps.errorCode], isNull);
    // `deity_slug` — the deity the SET ringtone belongs to, so the set funnel
    // can be grouped by deity.
    expect(resultProps[RingtoneEventProps.deitySlug], 'hanuman');
    await bloc.close();
  });

  test('permission required → settings opened; resume-with-grant → success',
      () async {
    final analytics = RecordingAnalytics();
    final service = FakeSetRingtoneService(granted: false, setResult: true);
    final bloc = build(service, analytics: analytics)..add(start);
    await Future<void>.delayed(Duration.zero);

    expect(bloc.state.status, SetRingtoneStatus.permissionRequired);
    expect(service.openSettingsCalls, 1);

    // Row 123 — `set_ringtone_clicked` with `not_granted`.
    expect(analytics.fired(RingtoneEvents.setRingtoneClicked), isTrue);
    expect(
      analytics.propsFor(RingtoneEvents.setRingtoneClicked)[
          RingtoneEventProps.permissionStatusBeforeClick],
      RingtoneEventProps.permissionNotGranted,
    );

    // User grants on the settings screen, then returns to the app.
    service.granted = true;
    bloc.add(const SetRingtoneAppResumed());
    await Future<void>.delayed(Duration.zero);

    expect(bloc.state.status, SetRingtoneStatus.success);

    // Row 124 — `ringtone_permission_result` with `result: success`.
    expect(analytics.fired(RingtoneEvents.permissionResult), isTrue);
    final permProps = analytics.propsFor(RingtoneEvents.permissionResult);
    expect(
        permProps[RingtoneEventProps.result], RingtoneEventProps.resultSuccess);
    expect(permProps[RingtoneEventProps.permissionStatus],
        RingtoneEventProps.permissionGranted);
    expect(permProps.containsKey(RingtoneEventProps.androidVersion), isTrue);

    // Row 125 — `set_ringtone_result` with `result: success`.
    expect(analytics.fired(RingtoneEvents.setRingtoneResult), isTrue);
    expect(
      analytics.propsFor(RingtoneEvents.setRingtoneResult)[
          RingtoneEventProps.result],
      RingtoneEventProps.resultSuccess,
    );
    expect(
      analytics.propsFor(RingtoneEvents.setRingtoneResult)[
          RingtoneEventProps.deitySlug],
      'hanuman',
    );
    await bloc.close();
  });

  test('permission required → resume-still-denied → denied copy', () async {
    final analytics = RecordingAnalytics();
    final service = FakeSetRingtoneService(granted: false);
    final bloc = build(service, analytics: analytics)..add(start);
    await Future<void>.delayed(Duration.zero);

    // User returns WITHOUT granting.
    bloc.add(const SetRingtoneAppResumed());
    await Future<void>.delayed(Duration.zero);

    expect(bloc.state.status, SetRingtoneStatus.permissionDenied);
    expect(bloc.state.message, SetRingtoneState.deniedCopy);
    expect(service.setCalls, 0);

    // Row 124 — `ringtone_permission_result` with `result: failure`.
    expect(analytics.fired(RingtoneEvents.permissionResult), isTrue);
    final permProps = analytics.propsFor(RingtoneEvents.permissionResult);
    expect(
        permProps[RingtoneEventProps.result], RingtoneEventProps.resultFailure);
    expect(permProps[RingtoneEventProps.permissionStatus],
        RingtoneEventProps.permissionNotGranted);

    // Row 125 — `set_ringtone_result` with `result: permission_denied` so the
    // set funnel resolves even for permission-denial (tri-state).
    expect(analytics.fired(RingtoneEvents.setRingtoneResult), isTrue);
    final setProps = analytics.propsFor(RingtoneEvents.setRingtoneResult);
    expect(setProps[RingtoneEventProps.result],
        RingtoneEventProps.resultPermissionDenied);
    expect(setProps[RingtoneEventProps.errorCode], 'permission_denied');
    expect(setProps[RingtoneEventProps.deitySlug], 'hanuman');
    expect(setProps.containsKey(RingtoneEventProps.deviceModel), isTrue);
    expect(setProps.containsKey(RingtoneEventProps.androidVersion), isTrue);
    await bloc.close();
  });

  test('granted but the native set fails → failed copy + result: failure',
      () async {
    final analytics = RecordingAnalytics();
    final service = FakeSetRingtoneService(granted: true, setResult: false);
    final bloc = build(service, analytics: analytics)..add(start);
    await Future<void>.delayed(Duration.zero);

    expect(bloc.state.status, SetRingtoneStatus.failed);
    expect(bloc.state.message, SetRingtoneState.failedCopy);

    // Row 125 — `set_ringtone_result` with `result: failure` + `error_code`.
    expect(analytics.fired(RingtoneEvents.setRingtoneResult), isTrue);
    final setProps = analytics.propsFor(RingtoneEvents.setRingtoneResult);
    expect(
        setProps[RingtoneEventProps.result], RingtoneEventProps.resultFailure);
    expect(setProps[RingtoneEventProps.errorCode], 'set_failed');
    expect(setProps[RingtoneEventProps.deitySlug], 'hanuman');
    await bloc.close();
  });

  test('native set throws → treated as a failed set', () async {
    final service = FakeSetRingtoneService(granted: true, throwOnSet: true);
    final bloc = build(service)..add(start);
    await Future<void>.delayed(Duration.zero);
    expect(bloc.state.status, SetRingtoneStatus.failed);
    await bloc.close();
  });

  test('resume without a pending request is a no-op', () async {
    final service = FakeSetRingtoneService(granted: true);
    final bloc = build(service)..add(const SetRingtoneAppResumed());
    await Future<void>.delayed(Duration.zero);
    expect(bloc.state.status, SetRingtoneStatus.idle);
    expect(service.setCalls, 0);
    await bloc.close();
  });
}
