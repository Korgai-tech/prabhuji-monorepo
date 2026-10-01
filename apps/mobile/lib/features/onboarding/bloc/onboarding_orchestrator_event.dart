import 'package:equatable/equatable.dart';

/// Which onboarding step the caller just finished — the orchestrator uses this
/// to short-circuit the "re-fetch /users/me" spin and jump to the next step.
enum OnboardingStep { phoneVerified, nameLanguageSaved, paywallDismissed }

sealed class OnboardingOrchestratorEvent extends Equatable {
  const OnboardingOrchestratorEvent();

  @override
  List<Object?> get props => const [];
}

/// Cold-start signal fired by the splash screen. Runs the full session +
/// onboarding + subscription check chain per PRD §6.1.
class AppStarted extends OnboardingOrchestratorEvent {
  const AppStarted();
}

/// The auth surface changed (login success, logout, 401) — re-evaluate.
class SessionRefreshed extends OnboardingOrchestratorEvent {
  const SessionRefreshed();
}

/// The subscription surface changed (successful purchase, cancellation, etc.).
/// Skips the /users/me check and re-runs only the subscription branch.
class SubscriptionRefreshed extends OnboardingOrchestratorEvent {
  const SubscriptionRefreshed();
}

/// The user just finished [step] — the orchestrator advances without a full
/// re-check when the next transition is deterministic.
class OnboardingStepCompleted extends OnboardingOrchestratorEvent {
  const OnboardingStepCompleted(this.step);
  final OnboardingStep step;

  @override
  List<Object?> get props => [step];
}
