import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:mobile/core/auth_store.dart';
import 'package:mobile/core/service_locator.dart';
import 'package:mobile/features/onboarding/bloc/onboarding_orchestrator_bloc.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';

import 'support/fake_auth_store.dart';
import 'support/fake_repositories.dart';

void main() {
  // The old MobileApp smoke test tried to boot the whole app to reach the
  // legacy admin login screen. With the /splash entry + orchestrator now
  // required, that flow is exercised by the orchestrator + router tests.
  // Keep a lightweight service-locator smoke test here so the locator itself
  // is covered.
  test('configureLocator wires the orchestrator + repositories', () async {
    if (GetIt.instance.isRegistered<AuthStore>()) {
      await GetIt.instance.reset();
    }
    await configureLocator(
      authStore: FakeAuthStore(token: null),
      dio: Dio(),
    );

    expect(GetIt.instance.isRegistered<AuthStore>(), isTrue);
    expect(GetIt.instance.isRegistered<OnboardingOrchestratorBloc>(), isTrue);

    // Swap in fakes so orchestrator instantiation doesn't require network.
    await GetIt.instance.unregister<OnboardingOrchestratorBloc>();
    GetIt.instance.registerLazySingleton<OnboardingOrchestratorBloc>(
      () => OnboardingOrchestratorBloc(
        authStore: FakeAuthStore(token: null),
        usersRepository: FakeUsersRepository(result: const MeResult()),
        subscriptionRepository: FakeSubscriptionRepository(),
      ),
    );
    final bloc = GetIt.instance<OnboardingOrchestratorBloc>();
    expect(bloc, isNotNull);

    await GetIt.instance.reset();
  });
}
