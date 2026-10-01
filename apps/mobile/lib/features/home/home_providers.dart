import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/service_locator.dart';
import 'data/home_repository.dart';
import 'home_banner_video_port.dart';

/// The Home data seam (TAM-62). Defaults to the dio-backed impl over the
/// get_it-owned auth-injecting [Dio]; overridden with a `FakeHomeRepository` in
/// widget/bloc tests so every surface runs offline.
final homeRepositoryProvider = Provider<HomeRepository>(
  (ref) => DioHomeRepository(serviceLocator<Dio>()),
);

/// The Home banner video seam. Defaults to the real `media_kit` port;
/// widget tests override it with a deterministic fake so the "only the banner
/// on screen plays" rule is assertable without a codec.
final homeBannerVideoPortFactoryProvider =
    Provider<HomeBannerVideoPortFactory>(
  (ref) => MediaKitHomeBannerVideoPort.new,
);
