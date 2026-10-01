import 'package:mobile/features/ringtone/data/set_ringtone_service.dart';

/// Controllable [SetRingtoneService] fake (TAM-68) — drives the WRITE_SETTINGS
/// Dart state machine with no Android device. [granted] can be flipped between a
/// `start` and an `onResume` to simulate the user enabling the permission on the
/// settings screen; [setResult]/[throwOnSet] exercise the set success/failure
/// branches. Records an ordered call log for assertions.
class FakeSetRingtoneService implements SetRingtoneService {
  FakeSetRingtoneService({
    this.granted = false,
    this.setResult = true,
    this.throwOnSet = false,
    this.throwOnOpen = false,
  });

  /// `Settings.System.canWrite(context)` result — mutable to model the grant.
  bool granted;

  /// What `setPhoneRingtone` returns when it does not throw.
  bool setResult;
  bool throwOnSet;
  bool throwOnOpen;

  final List<String> calls = <String>[];
  int hasPermissionCalls = 0;
  int openSettingsCalls = 0;
  int setCalls = 0;

  @override
  Future<bool> hasWriteSettingsPermission() async {
    hasPermissionCalls++;
    calls.add('has:$granted');
    return granted;
  }

  @override
  Future<void> openWriteSettings() async {
    openSettingsCalls++;
    calls.add('open');
    if (throwOnOpen) throw Exception('cannot open settings');
  }

  @override
  Future<bool> setPhoneRingtone({
    required String audioUrl,
    required String title,
  }) async {
    setCalls++;
    calls.add('set:$audioUrl');
    if (throwOnSet) throw Exception('set threw');
    return setResult;
  }
}
