import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/service_locator.dart';
import 'data/modals_repository.dart';

/// The Modals data seam (TAM-174). Defaults to the dio-backed impl over the
/// get_it-owned auth-injecting [Dio]; overridden with a `FakeModalsRepository`
/// (`test/support/fake_modals_repository.dart`) in tests so every surface
/// runs offline. Matches `lib/features/status/status_providers.dart`.
final modalsRepositoryProvider = Provider<ModalsRepository>(
  (ref) => DioModalsRepository(serviceLocator<Dio>()),
);
