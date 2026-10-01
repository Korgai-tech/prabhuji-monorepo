import 'package:dio/dio.dart';

import '../../../api/api_client.dart';
import '../../../api/generated/openapi.dart';

/// Domain-shaped subscription snapshot for orchestrator + paywall consumption.
class SubscriptionSnapshot {
  const SubscriptionSnapshot({
    required this.status,
    required this.isPro,
    required this.activePlanId,
    required this.activeProductId,
    required this.provider,
    required this.expiresAt,
    required this.trialEndsAt,
    required this.entitledUntil,
  });

  final SubscriptionStatusEnum status;
  final bool isPro;
  final String? activePlanId;
  final String? activeProductId;
  final String? provider;
  final DateTime? expiresAt;

  /// End of the free trial. Non-null only while [status] is `trialing` —
  /// drives the "N days left in your trial" copy.
  final DateTime? trialEndsAt;

  /// When [isPro] stops being true, or null for no deadline.
  ///
  /// Server-computed. It lets the cached entitlement expire itself without the
  /// client knowing the rule — see `EntitlementNotifier`. Null means "nothing to
  /// expire" (a lifetime grant, or already not Pro), never "expired now".
  final DateTime? entitledUntil;
}

class SubscriptionRepository {
  SubscriptionRepository(this._dio);
  final Dio _dio;

  Future<SubscriptionSnapshot> getStatus() async {
    final res = await _dio.get<dynamic>('/subscription/status');
    return parseStatus(_envelope(res));
  }

  /// Parse `GET /subscription/status`. Public and static so it is testable
  /// without a Dio double — the repo's convention (`ApiClient.parseUsers`).
  ///
  /// This USED TO hand-parse, and re-derive entitlement as
  /// `status == active || status == trialing` whenever the server omitted
  /// `isEntitled`. That fallback was a second, WRONG copy of the rule: it missed
  /// `past_due`-within-grace and `cancelled`-but-paid-through, so it locked out
  /// paying users in exactly the states where being locked out hurts most.
  ///
  /// It existed for a real reason — the generated DTO force-unwraps
  /// `isEntitled`, and a server predating that field made the `!` throw — but
  /// the answer to a parse failure is a typed error, never a guess about
  /// entitlement. Every server we deploy sends the field; if one does not, this
  /// throws [ApiException] and the caller shows an error, which is honest.
  static SubscriptionSnapshot parseStatus(Map<String, dynamic> body) {
    if (body['success'] != true) {
      throw ApiException(body['message']?.toString() ?? 'Request failed');
    }
    final raw = body['data'];
    if (raw is! Map) throw ApiException('Malformed subscription status');

    // Normalise an UNRECOGNISED status to `free` before the DTO sees it. The
    // generated `fromJson` force-unwraps the enum, so a server that adds an
    // eighth status would otherwise hard-fail every older app. This is safe
    // because the label is cosmetic — `isEntitled` still carries the decision,
    // and it is left untouched. Forward compatibility on the label; no guessing
    // on the entitlement.
    final json = raw.cast<String, dynamic>();
    if (SubscriptionStatusEnum.fromJson(json['status']) == null) {
      json['status'] = SubscriptionStatusEnum.free.value;
    }

    final SubscriptionStatusData data;
    try {
      final parsed = SubscriptionStatusData.fromJson(json);
      if (parsed == null) throw ApiException('Malformed subscription status');
      data = parsed;
    } on ApiException {
      rethrow;
    } catch (_) {
      // The generated DTO's `!` on a missing key surfaces as a TypeError.
      // Convert it: a malformed payload is an error, not a free account.
      throw ApiException('Malformed subscription status');
    }

    return SubscriptionSnapshot(
      status: data.status,
      isPro: data.isEntitled,
      activePlanId: data.activePlanId,
      activeProductId: data.activeProductId,
      provider: data.provider,
      expiresAt: data.expiresAt,
      trialEndsAt: data.trialEndsAt,
      entitledUntil: data.entitledUntil,
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
