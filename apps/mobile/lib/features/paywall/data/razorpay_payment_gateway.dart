/// Razorpay UPI Autopay checkout seam (TAM-129).
///
/// Wraps the official `razorpay_flutter` package so `PaymentBloc` can
/// drive the SDK without knowing about method channels, native event
/// constants, or Razorpay's option-key spelling. The bloc reads
/// [RazorpayCheckoutParams] straight off the mandate API's response
/// (see `docs/PAYMENT-MANDATE-API-CONTRACT.md`) and hands them here.
///
/// Backend chose Razorpay's ORDERS API with `recurring: 1` (not the
/// Subscriptions API), so the payload carries `orderId` + `customerId`
/// rather than a `subscriptionId`. The gateway maps directly onto
/// Razorpay's checkout option keys.
library;

import 'package:meta/meta.dart' show immutable;

/// The exact fields the mandate API returns under `data.razorpay`.
/// Consumed by [RazorpayPaymentGateway.startCheckout] as-is; the
/// gateway does no interpretation beyond passing them to
/// `Razorpay.open()`.
@immutable
class RazorpayCheckoutParams {
  const RazorpayCheckoutParams({
    required this.keyId,
    required this.orderId,
    this.customerId,
    this.recurring = true,
    this.merchantName = 'Prabhuji',
    this.description = 'Prabhuji VIP',
    this.prefillContact,
    this.prefillEmail,
  });

  /// Razorpay's public API key (`rzp_test_XXX` / `rzp_live_XXX`).
  /// Comes from the server response's `razorpay.keyId`.
  final String keyId;

  /// Razorpay's order id (`order_XXX`), minted server-side by
  /// `POST /v1/orders` with `payment_capture: 1`. Passed to the SDK
  /// as `order_id`.
  final String orderId;

  /// Razorpay's customer id (`cust_XXX`), optional. When present the
  /// SDK offers saved-instrument reuse + is required for the recurring
  /// flow. Passed to the SDK as `customer_id`.
  final String? customerId;

  /// Whether this order is a recurring autopay mandate. Passed to the
  /// SDK as `recurring: true` — required for the UPI Autopay flow to
  /// register a mandate rather than take a one-time charge.
  final bool recurring;

  /// Header labels rendered inside Razorpay's checkout sheet. Kept as
  /// constructor defaults; the server does not need to send them.
  final String merchantName;
  final String description;

  /// Optional prefill so the checkout shows phone/email pre-populated.
  /// Not required by the SDK.
  final String? prefillContact;
  final String? prefillEmail;

  /// Parses the raw `razorpay` block from the mandate API response.
  /// Returns null when required fields are missing — the bloc treats
  /// that as "not a Razorpay flow" and falls through.
  static RazorpayCheckoutParams? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final keyId = raw['keyId'];
    final orderId = raw['orderId'];
    if (keyId is! String || keyId.isEmpty) return null;
    if (orderId is! String || orderId.isEmpty) return null;
    final customerId = raw['customerId'];
    // Backend sends `recurring` as the string "1" today — tolerate both
    // string and boolean shapes so a wire change to a real bool doesn't
    // require a mobile release.
    final recurringRaw = raw['recurring'];
    final recurring = recurringRaw == true ||
        recurringRaw == 1 ||
        recurringRaw == '1' ||
        recurringRaw == 'true';
    return RazorpayCheckoutParams(
      keyId: keyId,
      orderId: orderId,
      customerId: customerId is String && customerId.isNotEmpty
          ? customerId
          : null,
      recurring: recurring,
    );
  }
}

/// Terminal outcome of one [RazorpayPaymentGateway.startCheckout] call.
/// Mirrors Razorpay Flutter's three event constants
/// (`EVENT_PAYMENT_SUCCESS`, `EVENT_PAYMENT_ERROR`,
/// `EVENT_EXTERNAL_WALLET`). Sealed so the bloc's `switch` is
/// exhaustive.
sealed class RazorpayPaymentEvent {
  const RazorpayPaymentEvent();
}

/// User approved the payment / mandate in their UPI app. IDs come
/// straight from Razorpay; the bloc still polls the SERVER
/// (`getMandate()`) before granting entitlement — this event is a
/// "start polling now" hint, not a settlement signal. A forged
/// callback would otherwise be worth a free subscription.
final class RazorpayPaymentApproved extends RazorpayPaymentEvent {
  const RazorpayPaymentApproved({
    required this.paymentId,
    this.orderId,
    this.signature,
  });

  final String paymentId;
  final String? orderId;
  final String? signature;
}

/// Payment failed at the bank / NPCI / Razorpay. `errorCode` is
/// Razorpay's numeric code (see their docs).
final class RazorpayPaymentDeclined extends RazorpayPaymentEvent {
  const RazorpayPaymentDeclined({
    required this.errorMessage,
    this.errorCode,
  });

  final String errorMessage;
  final int? errorCode;
}

/// User dismissed the sheet. Razorpay signals this as
/// `EVENT_PAYMENT_ERROR` with `code == PAYMENT_CANCELLED`; the gateway
/// splits it into its own variant so the bloc stays silent (the user
/// knows they cancelled).
final class RazorpayPaymentCancelled extends RazorpayPaymentEvent {
  const RazorpayPaymentCancelled();
}

/// Public interface the [PaymentBloc] depends on. Two methods, no
/// state — a fake in tests is a few lines.
abstract class RazorpayPaymentGateway {
  /// Launch Razorpay's own checkout sheet with the supplied
  /// [params] and await the one terminal event. Concurrent calls are
  /// not allowed — the bloc's CTA disable enforces that upstream.
  ///
  /// Throws [RazorpaySdkUnavailable] on non-Android platforms today
  /// (Razorpay does support iOS but we ship Android-first; a future
  /// iOS ticket drops the guard).
  Future<RazorpayPaymentEvent> startCheckout(RazorpayCheckoutParams params);

  /// Free the SDK's native resources. Called on bloc close.
  void dispose();
}

/// Thrown when the Razorpay SDK cannot be driven — non-Android
/// platform, plugin missing, native init failure. The bloc surfaces
/// this as a clean payment failure.
class RazorpaySdkUnavailable implements Exception {
  const RazorpaySdkUnavailable(this.reason);
  final String reason;

  @override
  String toString() => 'RazorpaySdkUnavailable: $reason';
}
