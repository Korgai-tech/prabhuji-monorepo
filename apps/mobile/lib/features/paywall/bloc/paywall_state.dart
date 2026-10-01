import 'package:equatable/equatable.dart';

import '../../../api/generated/openapi.dart';

sealed class PaywallState extends Equatable {
  const PaywallState();

  @override
  List<Object?> get props => const [];
}

/// Initial `/paywall/config` fetch is in flight.
class PaywallLoading extends PaywallState {
  const PaywallLoading();
}

/// Config loaded — everything the widget needs to render.
class PaywallReady extends PaywallState {
  const PaywallReady({
    required this.config,
    required this.selectedPlanId,
    required this.isPlaying,
    required this.impressionCount,
  });

  final PaywallConfigData config;
  final String selectedPlanId;
  final bool isPlaying;
  final int impressionCount;

  PaywallReady copyWith({
    PaywallConfigData? config,
    String? selectedPlanId,
    bool? isPlaying,
    int? impressionCount,
  }) =>
      PaywallReady(
        config: config ?? this.config,
        selectedPlanId: selectedPlanId ?? this.selectedPlanId,
        isPlaying: isPlaying ?? this.isPlaying,
        impressionCount: impressionCount ?? this.impressionCount,
      );

  @override
  List<Object?> get props => [config, selectedPlanId, isPlaying, impressionCount];
}

/// Config loaded but plans is empty (§6.8 `paywall_no_valid_plans`). The
/// widget uses this signal to `context.go('/home')` immediately.
class PaywallEmpty extends PaywallState {
  const PaywallEmpty();
}

/// Config fetch failed and no usable cache is available.
class PaywallError extends PaywallState {
  const PaywallError(this.message);
  final String message;

  @override
  List<Object?> get props => [message];
}

/// Offline + no cache — dedicated state so the widget can render a
/// "you're offline" affordance instead of a generic error.
class PaywallOffline extends PaywallState {
  const PaywallOffline();
}
