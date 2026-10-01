import 'dart:async';

import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform;
import 'package:razorpay_flutter/razorpay_flutter.dart';

import 'razorpay_payment_gateway.dart';

/// Concrete [RazorpayPaymentGateway] backed by the official
/// `razorpay_flutter` package.
///
/// **Invariant: this is the ONLY Dart file that imports
/// `package:razorpay_flutter/razorpay_flutter.dart`.** Any other
/// importer breaks the seam that keeps the SDK dependency swappable
/// and lets tests use a fake gateway without a native binding.
///
/// The SDK exposes three event listeners; this gateway registers all
/// three in the constructor (idempotent per `Razorpay` instance) and
/// completes a pending `Completer` when any fires:
///
/// ```
/// EVENT_PAYMENT_SUCCESS   → Approved(paymentId, orderId, signature)
/// EVENT_PAYMENT_ERROR (0) → Cancelled          (user dismissed sheet)
/// EVENT_PAYMENT_ERROR (n) → Declined(msg, code)
/// EVENT_EXTERNAL_WALLET   → Declined("wallet not supported for autopay")
/// ```
class RazorpaySdkGateway implements RazorpayPaymentGateway {
  RazorpaySdkGateway({Razorpay? razorpay}) : _razorpay = razorpay ?? Razorpay() {
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _onError);
    _razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, _onExternalWallet);
  }

  final Razorpay _razorpay;

  /// In-flight checkout Completer. Non-null between [startCheckout]
  /// returning its Future and one of the three event listeners firing.
  /// Bloc-level invariant prevents concurrent calls (CTA disable); the
  /// assertion here catches a regression that removes it.
  Completer<RazorpayPaymentEvent>? _pending;

  @override
  Future<RazorpayPaymentEvent> startCheckout(
    RazorpayCheckoutParams params,
  ) {
    if (defaultTargetPlatform != TargetPlatform.android) {
      throw const RazorpaySdkUnavailable('non-Android platform');
    }
    assert(
      _pending == null,
      'startCheckout re-entered while an earlier call is still pending',
    );

    final completer = Completer<RazorpayPaymentEvent>();
    _pending = completer;

    // Option keys mirror Razorpay's Flutter SDK docs exactly. `order_id`
    // + `recurring: true` + `customer_id` is the UPI Autopay orders
    // path (as opposed to `subscription_id` for the Subscriptions API
    // path). `method: {upi: true}` restricts to UPI so the checkout
    // doesn't offer card/netbanking on an autopay order.
    //
    // Contact + email skip strategy: Razorpay shows a "user info"
    // screen at the start of checkout unless BOTH contact + email are
    // prefilled AND marked readonly (or hidden). Prefill alone does
    // NOT skip the screen — the SDK still renders it with the field
    // populated. We combine:
    //   * `prefill.{contact,email}` — populate values.
    //   * `readonly.{contact,email}` — mark non-editable (Razorpay
    //     honors this by short-circuiting the user-info screen when
    //     both are also prefilled).
    //   * `hidden.{contact,email}` — belt-and-braces for SDK versions
    //     that respect `hidden` but not `readonly`.
    final hasPrefill =
        params.prefillContact != null || params.prefillEmail != null;
    final options = <String, dynamic>{
      'key': params.keyId,
      'order_id': params.orderId,
      if (params.customerId != null) 'customer_id': params.customerId,
      if (params.recurring) 'recurring': true,
      'name': params.merchantName,
      'description': params.description,
      'method': {'upi': true},
      if (hasPrefill)
        'prefill': <String, String>{
          if (params.prefillContact != null) 'contact': params.prefillContact!,
          if (params.prefillEmail != null) 'email': params.prefillEmail!,
        },
      if (hasPrefill)
        'readonly': <String, bool>{
          if (params.prefillContact != null) 'contact': true,
          if (params.prefillEmail != null) 'email': true,
        },
      if (hasPrefill)
        'hidden': <String, bool>{
          if (params.prefillContact != null) 'contact': true,
          if (params.prefillEmail != null) 'email': true,
        },
    };

    try {
      _razorpay.open(options);
    } catch (e) {
      _pending = null;
      throw RazorpaySdkUnavailable('Razorpay.open failed: $e');
    }

    return completer.future;
  }

  @override
  void dispose() {
    _razorpay.clear();
  }

  void _onSuccess(PaymentSuccessResponse response) {
    _resolve(
      RazorpayPaymentApproved(
        paymentId: response.paymentId ?? '',
        orderId: response.orderId,
        signature: response.signature,
      ),
    );
  }

  void _onError(PaymentFailureResponse response) {
    if (response.code == Razorpay.PAYMENT_CANCELLED) {
      _resolve(const RazorpayPaymentCancelled());
      return;
    }
    _resolve(
      RazorpayPaymentDeclined(
        errorMessage: response.message ?? 'Payment failed',
        errorCode: response.code,
      ),
    );
  }

  void _onExternalWallet(ExternalWalletResponse response) {
    // External wallets are surfaced as a distinct event because the
    // sheet offered them but our autopay flow doesn't accept them.
    // Treat as a declined event so analytics can distinguish "user
    // picked an unsupported instrument" from "the bank said no".
    _resolve(
      const RazorpayPaymentDeclined(
        errorMessage: 'External wallet not supported for autopay',
      ),
    );
  }

  void _resolve(RazorpayPaymentEvent event) {
    final completer = _pending;
    _pending = null;
    if (completer == null || completer.isCompleted) return;
    completer.complete(event);
  }
}
