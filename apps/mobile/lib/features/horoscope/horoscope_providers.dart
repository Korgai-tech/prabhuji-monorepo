import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/service_locator.dart';
import '../../state/providers.dart';
import 'data/horoscope_repository.dart';
import 'data/horoscope_video_port.dart';
import 'data/tts_port.dart';

/// The Horoscope data seam (TAM-74). Defaults to the dio-backed impl over the
/// get_it-owned auth-injecting [Dio]; overridden with a `FakeHoroscopeRepository`
/// in widget/bloc tests so every surface runs offline.
final horoscopeRepositoryProvider = Provider<HoroscopeRepository>(
  (ref) => DioHoroscopeRepository(serviceLocator<Dio>()),
);

/// The system-TTS seam (TAM-74). Defaults to the real `flutter_tts` impl; a
/// `FakeTtsPort` is injected in tests (the narration state machine is fully
/// unit-tested; the real engine needs a device — see tts_port.dart).
final ttsPortProvider = Provider<TtsPort>((ref) {
  final port = FlutterTtsPort();
  ref.onDispose(port.dispose);
  return port;
});

/// Result-background video port factory (TAM-74). Defaults to the real
/// `media_kit` impl (libmpv + FFmpeg, software decode — the same swap the
/// status feed did in TAM-72 for broken Xiaomi/MIUI hardware decoders); a
/// fake factory is injected in tests.
final horoscopeVideoPortFactoryProvider = Provider<HoroscopeVideoPortFactory>(
  (ref) => MediaKitHoroscopeVideoPort.new,
);

/// The app-level selected language for horoscope endpoints — the `locale`
/// query param on both, and (via the server's `localeServed` echo) the TTS
/// voice. Kept as a horoscope-scoped alias so existing test overrides
/// (`horoscopeLocaleProvider.overrideWithValue(...)`) keep working; the fact
/// itself now lives in the shared [selectedLocaleProvider].
final horoscopeLocaleProvider = Provider<String>(
  (ref) => ref.watch(selectedLocaleProvider),
);
