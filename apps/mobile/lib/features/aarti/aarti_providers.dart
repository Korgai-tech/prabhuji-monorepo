import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/service_locator.dart';
import 'data/aarti_repository.dart';

/// The Aarti data seam (TAM-64). Defaults to the dio-backed impl over the
/// get_it-owned auth-injecting [Dio]; overridden with a
/// `FakeAartiRepository` in widget/bloc tests so every surface runs offline.
final aartiRepositoryProvider = Provider<AartiRepository>(
  (ref) => DioAartiRepository(serviceLocator<Dio>()),
);
