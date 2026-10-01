import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
// `StateProvider` moved to `legacy.dart` in Riverpod 3 — same class, kept
// available under this import for the small-atomic-bool cases that don't
// warrant a full `Notifier`.
import 'package:flutter_riverpod/legacy.dart';

import '../../../core/service_locator.dart';
import '../../../state/providers.dart';
import '../../paywall/data/payment_repository.dart';
import '../data/subscription_cancel_repository.dart';
import 'subscription_cancel_api.dart';
import 'subscription_cancel_types.dart';

/// TAM-125 Riverpod wiring for the subscription-cancellation flow.
///
/// The port lives behind a Provider so widget tests can override it with
/// the canned `FakeSubscriptionCancelApi` (co-located under this feature's
/// `application/` folder — kept in `lib/` deliberately so widget tests can
/// reach it via a plain package import). Production runs against
/// [DioSubscriptionCancelApi], which hits the real endpoints registered by
/// the parallel BE half of TAM-125.
final subscriptionCancelApiProvider = Provider<SubscriptionCancelApi>((ref) {
  return DioSubscriptionCancelApi(serviceLocator<Dio>());
});

/// The user's latest cancellation request row, or `null` if none.
///
/// Watched by the manage-subscription screen and by the profile-menu tile
/// so the pill/CTA rebuild "without a manual pull-to-refresh" after the
/// cascade lands (§6, PO ruling #1).
///
/// Invalidated:
///   * from the cancel-subscription cascade on 2xx / 409-existing
///   * from the pull-to-refresh gesture on the manage-subscription screen
///   * from the foreground-resume hook (last-fetched > 30 s)
///   * automatically whenever [authIdentityProvider] changes — see the note
///     on [mandateSnapshotProvider].
final latestCancelRequestProvider =
    FutureProvider<CancellationRequestData?>((ref) async {
  if (ref.watch(authIdentityProvider) == null) return null;
  final api = ref.watch(subscriptionCancelApiProvider);
  return api.getLatestCancelRequest();
});

/// `PaymentRepository` bridge — the repo lives in `serviceLocator` (see
/// `service_locator.dart:209`). Exposed as a Riverpod provider so tests can
/// override it with a fake repository without configuring `get_it`.
final paymentRepositoryProvider = Provider<PaymentRepository>((ref) {
  return serviceLocator<PaymentRepository>();
});

/// The user's current mandate snapshot (from `GET /payment/mandate`).
///
/// Returns `null` when the user has never started a mandate — matches the
/// server's `data: null` empty-state (see `PaymentRepository.getMandate`).
/// Free-tier users never hit this — the manage-subscription screen is only
/// reachable from the VIP-tile branch on profile v2.
///
/// Scoped to [authIdentityProvider]: this is billing data for ONE account,
/// and the provider is keepAlive while logout only navigates (it does not
/// tear down the `ProviderScope`), so without the watch a second user on the
/// same device could read the previous user's mandate. Watching identity
/// makes the cache expire with the session that produced it; `null` identity
/// short-circuits so the logged-out branch never fires a 401.
final mandateSnapshotProvider = FutureProvider<MandateSnapshot?>((ref) async {
  if (ref.watch(authIdentityProvider) == null) return null;
  final repo = ref.watch(paymentRepositoryProvider);
  return repo.getMandate();
});

/// Full-screen loading overlay flag. Set to `true` by the cancel-subscription
/// dialog's destructive-CTA cascade for the duration of the POST + response;
/// cleared in `finally`. Watched by the manage-subscription screen.
///
/// `StateProvider<bool>` — a bare atomic bool is enough; a `Notifier` would
/// only add ceremony.
final cancelRequestInFlightProvider = StateProvider<bool>((ref) => false);
