import 'subscription_cancel_types.dart';

/// Subscription-cancellation API port (TAM-125).
///
/// The FE half of TAM-125 is landing in parallel with the BE half. Until the
/// BE agent's codegen refreshes `apps/mobile/lib/api/generated/**` with the
/// generated `CancellationRequestData` model + endpoints, we route every
/// call through THIS port. After the swap, `DioSubscriptionCancelApi` (a
/// future dio-backed impl, NOT written today) replaces `FakeSubscriptionCancelApi`
/// at the DI seam — see the `TODO(TAM-125)` in
/// `subscription_cancel_providers.dart`.
///
/// The port shape is deliberately minimal: exactly the two endpoints §3
/// specifies. No admin/list methods — those live on a future ticket.
abstract class SubscriptionCancelApi {
  /// `POST /subscription/cancel-requests` (§3).
  ///
  /// Returns the created row (`status='pending'`) on 2xx.
  ///
  /// Throws [PendingRequestExistsException] on 409 `PENDING_REQUEST_EXISTS`
  /// so the UI cascade can treat it as SUCCESS (§6, PO ruling #1).
  ///
  /// Throws [SubscriptionCancelApiException] on any other non-2xx — its
  /// `message` MUST carry the envelope's `body['message']` verbatim per §6
  /// ("show the API's `message` field, not a generic error").
  Future<CancellationRequestData> createCancelRequest({String? reason});

  /// `GET /subscription/cancel-requests/me` (§3).
  ///
  /// Returns `null` when the user has never raised a request — matches the
  /// server's `data: null` convention for empty-state.
  ///
  /// Throws [SubscriptionCancelApiException] on any non-2xx (rare — a GET
  /// with an authenticated user should never 400/409).
  Future<CancellationRequestData?> getLatestCancelRequest();
}

/// The 409 branch of `POST /subscription/cancel-requests`. Kept separate
/// from the generic exception so the confirmation-dialog cascade can pattern-
/// match on it and fire `subscription_cancel_confirmed` with
/// `outcome: 'existing'` (§5).
///
/// Carries the response's `message` string so the caller can render it in
/// the SnackBar per §6 (the 409-existing branch has locked copy — but the
/// server message is still worth surfacing for QA / support debug).
class PendingRequestExistsException implements Exception {
  const PendingRequestExistsException({required this.message});

  final String message;

  @override
  String toString() => 'PendingRequestExistsException($message)';
}

/// Generic non-2xx failure. `message` MUST be the envelope's `body['message']`
/// verbatim when the response was parseable; the network / unparseable
/// branch falls back to the locked "Couldn't reach the server. Please try
/// again." copy at the CALL SITE, not here (§6 cascade step 7).
///
/// `reason` is the Dio-error bucket the analytics event `subscription_cancel_failed`
/// carries — one of `network` / `validation` / `server_5xx` / `unauthorized`
/// / `unknown` — derived from the HTTP status code / Dio error type.
class SubscriptionCancelApiException implements Exception {
  const SubscriptionCancelApiException({
    required this.message,
    required this.reason,
  });

  final String message;
  final String reason;

  @override
  String toString() =>
      'SubscriptionCancelApiException(reason=$reason, message=$message)';
}

/// Canonical `reason` values for the `subscription_cancel_failed` analytics
/// event (§5). Kept as `const String` literals for grep-safety.
class SubscriptionCancelFailedReason {
  SubscriptionCancelFailedReason._();

  static const String network = 'network';
  static const String validation = 'validation';
  static const String server5xx = 'server_5xx';
  static const String unauthorized = 'unauthorized';
  static const String unknown = 'unknown';
}
