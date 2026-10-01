import 'dart:async';

import 'subscription_cancel_api.dart';
import 'subscription_cancel_types.dart';

/// A hand-written stub for the TAM-125 subscription-cancel port.
///
/// Wired at DI (see `subscription_cancel_providers.dart`) so the UI renders
/// end-to-end today — before the parallel BE agent lands the real endpoints
/// + regenerates the Dart models. Once the codegen refresh ships, replace
/// this with a dio-backed impl and the app is real (see the TODO(TAM-125)
/// marker at the provider registration site).
///
/// Widget tests instantiate this directly (or a subclass) so the UI is
/// testable across all five §2.5 cases without a Dio double.
class FakeSubscriptionCancelApi implements SubscriptionCancelApi {
  FakeSubscriptionCancelApi({
    CancellationRequestData? seedLatest,
    this.simulateNetworkFailureOnCreate = false,
    this.simulatePendingExistsOnCreate = false,
    this.simulateServerErrorMessage,
    // ignore: unused_element_parameter
    this.responseDelay = Duration.zero,
  }) : _latest = seedLatest;

  /// The row `getLatestCancelRequest()` returns. `null` means "never raised".
  /// A successful `createCancelRequest` overwrites this so subsequent GETs
  /// see the fresh row (matches the real backend's read-your-writes shape).
  CancellationRequestData? _latest;

  /// When true, `createCancelRequest` throws a network-shaped
  /// [SubscriptionCancelApiException]. Used by the failure-path widget test.
  final bool simulateNetworkFailureOnCreate;

  /// When true, `createCancelRequest` throws [PendingRequestExistsException]
  /// on the first call. Used by the 409-existing widget test.
  final bool simulatePendingExistsOnCreate;

  /// When non-null, `createCancelRequest` throws a server-shaped
  /// [SubscriptionCancelApiException] with this as `message`. Used by the
  /// envelope-message pinning test.
  final String? simulateServerErrorMessage;

  /// Test-only knob: pauses each response by this duration so widget tests
  /// can assert the in-flight overlay renders before the future resolves.
  final Duration responseDelay;

  /// Recorded call log for widget tests — asserts "the repo was hit exactly
  /// once" without a Dio double.
  int createCallCount = 0;
  int getLatestCallCount = 0;

  @override
  Future<CancellationRequestData> createCancelRequest({String? reason}) async {
    createCallCount++;
    if (responseDelay > Duration.zero) {
      await Future<void>.delayed(responseDelay);
    }
    if (simulateNetworkFailureOnCreate) {
      throw const SubscriptionCancelApiException(
        message: "Couldn't reach the server. Please try again.",
        reason: SubscriptionCancelFailedReason.network,
      );
    }
    if (simulateServerErrorMessage != null) {
      throw SubscriptionCancelApiException(
        message: simulateServerErrorMessage!,
        reason: SubscriptionCancelFailedReason.server5xx,
      );
    }
    if (simulatePendingExistsOnCreate) {
      throw const PendingRequestExistsException(
        message: 'A pending cancellation request already exists.',
      );
    }
    final created = CancellationRequestData(
      id: 'fake-cancel-req-${DateTime.now().millisecondsSinceEpoch}',
      status: CancellationRequestStatus.pending,
      reason: reason,
      requestedAt: DateTime.now().toUtc(),
      processedAt: null,
    );
    _latest = created;
    return created;
  }

  @override
  Future<CancellationRequestData?> getLatestCancelRequest() async {
    getLatestCallCount++;
    if (responseDelay > Duration.zero) {
      await Future<void>.delayed(responseDelay);
    }
    return _latest;
  }

  /// Test-only hook: overwrite the "latest" row without going through
  /// `create`, so the manage-subscription status matrix can pump each of
  /// the five §2.5 cases directly.
  // ignore: use_setters_to_change_properties
  void seed(CancellationRequestData? row) {
    _latest = row;
  }
}
