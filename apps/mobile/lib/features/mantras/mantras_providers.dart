import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/service_locator.dart';
import 'data/mantras_repository.dart';

/// The Mantras data seam (TAM-66). Defaults to the dio-backed impl over the
/// get_it-owned auth-injecting [Dio]; overridden with a
/// `FakeMantrasRepository` in widget/bloc tests so every surface runs offline.
final mantrasRepositoryProvider = Provider<MantrasRepository>(
  (ref) => DioMantrasRepository(serviceLocator<Dio>()),
);
