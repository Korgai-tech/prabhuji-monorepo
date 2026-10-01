import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/service_locator.dart';
import 'data/ringtone_repository.dart';
import 'data/set_ringtone_service.dart';

/// The Ringtone data seam (TAM-68). Defaults to the dio-backed impl over the
/// get_it-owned auth-injecting [Dio]; overridden with a
/// `FakeRingtoneRepository` in widget/bloc tests so every surface runs offline.
final ringtoneRepositoryProvider = Provider<RingtoneRepository>(
  (ref) => DioRingtoneRepository(serviceLocator<Dio>()),
);

/// The native set-as-phone-ringtone seam (TAM-68). Defaults to the
/// `prabhuji/ringtone` platform-channel impl; overridden with a
/// `FakeSetRingtoneService` in tests so the WRITE_SETTINGS state machine runs
/// with no Android device.
final setRingtoneServiceProvider = Provider<SetRingtoneService>(
  (ref) => const ChannelSetRingtoneService(),
);
