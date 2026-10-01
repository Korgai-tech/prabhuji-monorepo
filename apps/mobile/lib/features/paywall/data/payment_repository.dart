import 'package:dio/dio.dart';

import '../../../api/api_client.dart';
import '../../../api/generated/openapi.dart';
import 'razorpay_payment_gateway.dart';

/// Domain-shaped mandate snapshot.
///
/// Mirrors the server's `MandateData`. Note what the client does NOT decide:
/// entitlement. [isEntitled] is computed server-side against the server's
/// clock and is simply reported here — the device clock is not trustworthy for
/// a billing decision, and neither is the client.
class MandateSnapshot {
  const MandateSnapshot({
    required this.mandateId,
    required this.provider,
    required this.state,
    required this.authUrl,
    required this.planId,
    required this.amountPaise,
    required this.currency,
    required this.requiresReRegistration,
    required this.subscriptionStatus,
    required this.isEntitled,
    required this.trialEndsAt,
    required this.nextDebitDate,
    this.razorpay,
    this.paymentReferenceId,
  });

  final String mandateId;

  /// The payment gateway this mandate lives on, as the server reported it.
  ///
  /// Read from the wire rather than hardcoded: the server decides which gateway
  /// takes new registrations, and an existing subscriber stays on whichever one
  /// they signed with. A constant here was wrong for every user whose mandate
  /// predated the last switch, and analytics is the surface where that silently
  /// mislabels a whole cohort.
  final String provider;

  final MandateStateEnum state;

  /// Where to send the user to approve. NULL means there is nothing live to
  /// approve — already active, terminal, or the link expired. The client MUST
  /// treat null as "do not launch anything": an expired UPI intent drops the
  /// user into a dead page with no way back.
  final String? authUrl;

  final String planId;
  final int amountPaise;
  final String currency;

  /// The mandate died in a way re-consent fixes — notably an NPCI auto-revoke
  /// after a failed first debit, which is an expected path, not an edge case.
  final bool requiresReRegistration;

  final String subscriptionStatus;
  final bool isEntitled;
  final DateTime? trialEndsAt;
  final String? nextDebitDate;

  /// TAM-129 — Razorpay checkout params. Non-null iff [provider] is
  /// `"razorpay"`. Consumed by the Razorpay SDK gateway.
  final RazorpayCheckoutParams? razorpay;

  /// Server-minted id for THIS payment attempt, used as the analytics
  /// `event_id` on `trial_success` (both our collector and Meta) so the
  /// client event and the server's `bk_trial_success` describe the same
  /// payment and can be deduped/joined instead of counted twice.
  ///
  /// Nullable on purpose: it is not in the generated `MandateData` yet (the
  /// contract lands with the backend's next release), and it is absent on
  /// any older server. When null, `trackEvent` keeps its own fresh UUID —
  /// the event still fires, it just can't be joined.
  final String? paymentReferenceId;

  /// Terminal from the client's point of view — polling further is pointless.
  bool get isSettled =>
      isEntitled ||
      requiresReRegistration ||
      state == MandateStateEnum.active ||
      state == MandateStateEnum.completed;
}

class PaymentRepository {
  PaymentRepository(this._dio);
  final Dio _dio;

  /// Start (or resume) a mandate for [planId].
  ///
  /// Sends ONLY the plan id — never an amount. The server resolves the price
  /// from the paywall config, so a tampered client cannot choose what it pays.
  /// Safe to call twice: the server returns the in-flight mandate rather than
  /// minting a second one.
  Future<MandateSnapshot> createMandate({required String planId}) async {
    final res = await _dio.post<dynamic>(
      '/payment/mandate',
      data: {'planId': planId},
    );
    return parseMandate(_envelope(res)['data']);
  }

  /// Current mandate state. The poll target after returning from the UPI app.
  ///
  /// Returns null when the user has never started a mandate — a normal state
  /// the paywall renders plainly, not an error.
  Future<MandateSnapshot?> getMandate() async {
    final res = await _dio.get<dynamic>('/payment/mandate');
    final data = _envelope(res)['data'];
    if (data == null) return null;
    return parseMandate(data);
  }

  Future<MandateSnapshot> cancelMandate() async {
    final res = await _dio.post<dynamic>('/payment/mandate/cancel');
    return parseMandate(_envelope(res)['data']);
  }

  /// Resolve an `https://` shortener to the `upi://` intent behind it.
  ///
  /// Decentro returns a "shortened intent link", and whether that is a direct
  /// `upi://` URI or an https redirect is not settled in their docs. Launching
  /// an https URL opens a BROWSER rather than the user's UPI app, which is a
  /// dead end — so if we get one, follow the redirect ourselves and pull the
  /// `upi://` target out of the Location header.
  ///
  /// Best-effort: on any failure the original URL is returned unchanged, so a
  /// direct `upi://` link (the expected case) costs nothing and a surprise
  /// still gets attempted rather than silently dropped.
  Future<String> resolveIntentUrl(String url) async {
    if (url.startsWith('upi://')) return url;
    if (!url.startsWith('http')) return url;
    try {
      final res = await _dio.get<dynamic>(
        url,
        options: Options(
          followRedirects: false,
          validateStatus: (_) => true,
          // A shortener is not our API: no bearer token, no auth interceptor.
          extra: {'skipAuth': true},
        ),
      );
      final location = res.headers.value('location');
      if (location != null && location.startsWith('upi://')) return location;
    } catch (_) {
      // Fall through to the original URL.
    }
    return url;
  }

  /// Public and static so the parse is testable without a Dio double — the
  /// repo's convention (`ApiClient.parseUsers`). `MandateData.fromJson`
  /// force-unwraps required fields, so a malformed payload surfaces as a
  /// TypeError; it is converted here rather than allowed to escape as one.
  static MandateSnapshot parseMandate(dynamic raw) {
    final MandateData? data;
    try {
      data = MandateData.fromJson(raw);
    } catch (_) {
      throw ApiException('Malformed response');
    }
    if (data == null) throw ApiException('Malformed response');
    // MandateSnapshot deliberately keeps these FLAT, even though the wire shape
    // nests them under `subscription` now. The bloc and paywall screen read
    // `snapshot.isEntitled`, and re-shaping the domain type to mirror the wire
    // would have rippled into both plus their tests for no benefit — the
    // indirection exists precisely so a contract change stops here.

    // TAM-129 — parse the `razorpay` block from the raw envelope via the
    // gateway's own `fromJson`. The generated `MandateData.razorpay` is a
    // separate `RazorpayCheckoutData` type, and the gateway consumes the
    // domain-shaped `RazorpayCheckoutParams` directly.
    RazorpayCheckoutParams? razorpay;
    // Read straight off the raw envelope rather than the generated model —
    // `paymentReferenceId` is not in `openapi.public.json` yet, so
    // `MandateData` has no field for it. Same escape hatch `razorpay` uses;
    // fold it into the generated model on the next `mobile:generate`.
    String? paymentReferenceId;
    if (raw is Map) {
      razorpay = RazorpayCheckoutParams.fromJson(raw['razorpay']);
      final ref = raw['paymentReferenceId'];
      if (ref is String && ref.isNotEmpty) paymentReferenceId = ref;
    }

    return MandateSnapshot(
      mandateId: data.mandateId,
      provider: data.provider,
      state: data.state,
      authUrl: data.authUrl,
      planId: data.planId,
      amountPaise: data.amountPaise,
      currency: data.currency,
      requiresReRegistration: data.requiresReRegistration,
      subscriptionStatus: data.subscription.status.value,
      isEntitled: data.subscription.isEntitled,
      trialEndsAt: data.subscription.trialEndsAt,
      nextDebitDate: data.nextDebitDate,
      razorpay: razorpay,
      paymentReferenceId: paymentReferenceId,
    );
  }

  static Map<String, dynamic> _envelope(Response<dynamic> res) {
    final body = res.data;
    if (body is! Map<String, dynamic>) {
      throw ApiException('Malformed response');
    }
    if (body['success'] != true) {
      throw ApiException(body['message']?.toString() ?? 'Request failed');
    }
    return body;
  }
}
