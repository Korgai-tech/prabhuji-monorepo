import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/service_locator.dart';
import 'data/set_wallpaper_service.dart';
import 'data/wallpaper_repository.dart';
import 'preview/wallpaper_video_port.dart';

/// The Wallpaper data seam (TAM-70). Defaults to the dio-backed impl over the
/// get_it-owned auth-injecting [Dio];
/// overridden with a `FakeWallpaperRepository` in tests so surfaces run offline.
final wallpaperRepositoryProvider = Provider<WallpaperRepository>(
  (ref) => DioWallpaperRepository(serviceLocator<Dio>()),
);

/// The native set-as-wallpaper seam (TAM-70). Defaults to the `prabhuji/wallpaper`
/// platform-channel impl; overridden with a `FakeSetWallpaperService` in tests so
/// the set state machine runs with no Android device.
final setWallpaperServiceProvider = Provider<SetWallpaperService>(
  (ref) => const ChannelSetWallpaperService(),
);

/// Per-live-page video port factory (TAM-70). Defaults to the real
/// `media_kit` impl (libmpv + FFmpeg, software decode — the same swap the
/// status feed did in TAM-72 for broken Xiaomi/MIUI hardware decoders); a
/// fake factory is injected in tests.
final wallpaperVideoPortFactoryProvider = Provider<WallpaperVideoPortFactory>(
  (ref) => MediaKitWallpaperVideoPort.new,
);
