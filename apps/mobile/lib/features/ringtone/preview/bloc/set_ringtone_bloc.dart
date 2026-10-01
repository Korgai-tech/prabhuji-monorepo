// Explicit named params (some are functions) — see PaywallBloc note.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';
import 'dart:io' show Platform;

import 'package:bloc/bloc.dart';
import 'package:device_info_plus/device_info_plus.dart';

import '../../../../core/analytics.dart';
import '../../data/ringtone_repository.dart';
import '../../data/set_ringtone_service.dart';
import '../../ringtone_analytics.dart';
import 'set_ringtone_event.dart';
import 'set_ringtone_state.dart';

/// Drives the native set-as-phone-ringtone flow over the [SetRingtoneService]
/// platform channel (TAM-68 Native tasks). Pure Dart state machine — fully
/// unit-testable with a fake channel (no Android device):
///
///   start → hasWriteSettingsPermission()?
///     true  → setting → setPhoneRingtone() → success | failed
///     false → permission_required → openWriteSettings() (settings opened) …
///             … on app resume: hasWriteSettingsPermission()?
///                true  → permission_result(success) → setting → set | fail
///                false → permission_result(failure) (denied copy)
///
/// On success it increments `POST /ringtones/{id}/set-count` (best-effort) and
/// surfaces the new count.
///
/// ## Analytics wire (Sheet 1 rows 123–125)
///
///  * Row 123 `set_ringtone_clicked` — fires on `_onStart` with the pre-tap
///    permission status.
///  * Row 124 `ringtone_permission_result` — fires from `_onResumed` when the
///    settings-screen re-check runs, tri-state (`success`/`granted` or
///    `failure`/`not_granted`) plus `android_version`.
///  * Row 125 `set_ringtone_result` — fires on EACH terminal state (`success`
///    from `_performSet`; `failure` from `_emitFailed`; `permission_denied`
///    from the deny branch of `_onResumed`) with `result` + `error_code` +
///    `device_model` + `android_version` so the funnel resolves for every
///    attempt (not just the happy path).
class SetRingtoneBloc extends Bloc<SetRingtoneEvent, SetRingtoneState> {
  SetRingtoneBloc({
    required SetRingtoneService service,
    required RingtoneRepository repository,
    Analytics? analytics,
  })  : _service = service,
        _repository = repository,
        _analytics = analytics,
        super(const SetRingtoneState()) {
    on<SetRingtoneStartRequested>(_onStart);
    on<SetRingtoneAppResumed>(_onResumed);
  }

  final SetRingtoneService _service;
  final RingtoneRepository _repository;
  final Analytics? _analytics;

  SetRingtoneStartRequested? _pending;

  Future<void> _onStart(
    SetRingtoneStartRequested event,
    Emitter<SetRingtoneState> emit,
  ) async {
    _pending = event;

    bool granted;
    try {
      granted = await _service.hasWriteSettingsPermission();
    } catch (_) {
      granted = false;
    }

    unawaited(_analytics?.trackEvent(
      RingtoneEvents.setRingtoneClicked,
      properties: {
        RingtoneEventProps.ringtoneId: event.ringtoneId,
        RingtoneEventProps.permissionStatusBeforeClick: granted
            ? RingtoneEventProps.permissionGranted
            : RingtoneEventProps.permissionNotGranted,
      },
    ));

    if (granted) {
      await _performSet(emit, event);
      return;
    }

    // WRITE_SETTINGS is a settings-screen grant, not a runtime dialog — deep-link
    // to ACTION_MANAGE_WRITE_SETTINGS and wait for the resume re-check.
    emit(const SetRingtoneState(status: SetRingtoneStatus.permissionRequired));
    try {
      await _service.openWriteSettings();
    } catch (_) {
      // Couldn't open settings — treat as a failed set.
      await _emitFailed(
        emit,
        event.ringtoneId,
        deitySlug: event.deitySlug,
        errorCode: 'open_settings_failed',
      );
    }
  }

  Future<void> _onResumed(
    SetRingtoneAppResumed event,
    Emitter<SetRingtoneState> emit,
  ) async {
    // Only relevant while waiting on the settings-screen grant.
    if (state.status != SetRingtoneStatus.permissionRequired) return;
    final pending = _pending;
    if (pending == null) return;

    bool granted;
    try {
      granted = await _service.hasWriteSettingsPermission();
    } catch (_) {
      granted = false;
    }

    // Row 124 `ringtone_permission_result` — tri-state outcome of the
    // settings-screen round-trip. Includes `android_version` per the sheet.
    final androidVersion = await _cachedAndroidVersion();
    unawaited(_analytics?.trackEvent(
      RingtoneEvents.permissionResult,
      properties: {
        RingtoneEventProps.ringtoneId: pending.ringtoneId,
        RingtoneEventProps.result: granted
            ? RingtoneEventProps.resultSuccess
            : RingtoneEventProps.resultFailure,
        RingtoneEventProps.permissionStatus: granted
            ? RingtoneEventProps.permissionGranted
            : RingtoneEventProps.permissionNotGranted,
        RingtoneEventProps.androidVersion: androidVersion,
      },
    ));

    if (!granted) {
      // Row 125 `set_ringtone_result` with `result: permission_denied` — the
      // set funnel resolves even when the user backs out at the OS grant.
      await _emitSetResult(
        emit,
        ringtoneId: pending.ringtoneId,
        deitySlug: pending.deitySlug,
        result: RingtoneEventProps.resultPermissionDenied,
        errorCode: 'permission_denied',
        emitState: () => emit(const SetRingtoneState(
          status: SetRingtoneStatus.permissionDenied,
          message: SetRingtoneState.deniedCopy,
        )),
      );
      return;
    }

    await _performSet(emit, pending);
  }

  Future<void> _performSet(
    Emitter<SetRingtoneState> emit,
    SetRingtoneStartRequested event,
  ) async {
    emit(const SetRingtoneState(status: SetRingtoneStatus.setting));
    bool ok;
    try {
      ok = await _service.setPhoneRingtone(
        audioUrl: event.audioUrl,
        title: event.title,
      );
    } catch (_) {
      ok = false;
    }

    if (!ok) {
      await _emitFailed(
        emit,
        event.ringtoneId,
        deitySlug: event.deitySlug,
        errorCode: 'set_failed',
      );
      return;
    }

    // Success → increment the server set-count (best-effort; the set already
    // succeeded on-device regardless).
    int? setCount;
    try {
      setCount = await _repository.incrementSetCount(event.ringtoneId);
    } catch (_) {
      setCount = null;
    }
    await _emitSetResult(
      emit,
      ringtoneId: event.ringtoneId,
      deitySlug: event.deitySlug,
      result: RingtoneEventProps.resultSuccess,
      errorCode: null,
      emitState: () => emit(SetRingtoneState(
        status: SetRingtoneStatus.success,
        setCount: setCount,
      )),
    );
  }

  Future<void> _emitFailed(
    Emitter<SetRingtoneState> emit,
    String ringtoneId, {
    required String? deitySlug,
    required String errorCode,
  }) async {
    await _emitSetResult(
      emit,
      ringtoneId: ringtoneId,
      deitySlug: deitySlug,
      result: RingtoneEventProps.resultFailure,
      errorCode: errorCode,
      emitState: () => emit(const SetRingtoneState(
        status: SetRingtoneStatus.failed,
        message: SetRingtoneState.failedCopy,
      )),
    );
  }

  /// Fires row 125 `set_ringtone_result` with `device_model` + `android_version`
  /// (per the sheet), then transitions state via [emitState]. Emitting the
  /// state AFTER the event so a listener that closes the bloc on a terminal
  /// state can't race the analytics call.
  Future<void> _emitSetResult(
    Emitter<SetRingtoneState> emit, {
    required String ringtoneId,
    required String? deitySlug,
    required String result,
    required String? errorCode,
    required void Function() emitState,
  }) async {
    final info = await _cachedDeviceInfo();
    unawaited(_analytics?.trackEvent(
      RingtoneEvents.setRingtoneResult,
      properties: {
        RingtoneEventProps.ringtoneId: ringtoneId,
        RingtoneEventProps.deitySlug: deitySlug,
        RingtoneEventProps.result: result,
        RingtoneEventProps.errorCode: errorCode,
        RingtoneEventProps.deviceModel: info.deviceModel,
        RingtoneEventProps.androidVersion: info.androidVersion,
      },
    ));
    emitState();
  }

  Future<String> _cachedAndroidVersion() async =>
      (await _cachedDeviceInfo()).androidVersion;

  Future<_RingtoneDeviceInfo> _cachedDeviceInfo() =>
      _deviceInfoCache ??= _readDeviceInfo();
}

/// Static cache — both preview-screen and home-feed-card entry points share
/// the same bloc class, and re-instantiate a new bloc per attempt; caching
/// device info at the module scope means we call `device_info_plus` once per
/// process, not once per set attempt.
Future<_RingtoneDeviceInfo>? _deviceInfoCache;

Future<_RingtoneDeviceInfo> _readDeviceInfo() async {
  try {
    final plugin = DeviceInfoPlugin();
    if (Platform.isAndroid) {
      final info = await plugin.androidInfo;
      return _RingtoneDeviceInfo(
        deviceModel: info.model,
        androidVersion: info.version.release,
      );
    }
    if (Platform.isIOS) {
      final info = await plugin.iosInfo;
      // iOS is not a target here (WRITE_SETTINGS is Android-only), but a
      // resilient fallback keeps the analytics call safe under `flutter test`.
      return _RingtoneDeviceInfo(
        deviceModel: info.utsname.machine,
        androidVersion: info.systemVersion,
      );
    }
  } catch (_) {
    // Platform channel unavailable (e.g. `flutter test`) — empty strings are
    // the same graceful degradation the enricher uses.
  }
  return const _RingtoneDeviceInfo(deviceModel: '', androidVersion: '');
}

class _RingtoneDeviceInfo {
  const _RingtoneDeviceInfo({
    required this.deviceModel,
    required this.androidVersion,
  });
  final String deviceModel;
  final String androidVersion;
}
