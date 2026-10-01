import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/paywall/data/payment_repository.dart';

/// `paymentReferenceId` is read straight off the raw envelope — it is not in
/// `openapi.public.json` yet, so the generated `MandateData` has no field for
/// it. These lock the two shapes that matter: a server that sends it, and one
/// that doesn't.
void main() {
  Map<String, dynamic> wire({String? paymentReferenceId}) => {
        'mandateId': '01a08a27-9e9e-75f0-b06f-c8a34c5e50e7',
        'provider': 'razorpay',
        'state': 'pending',
        'authUrl': null,
        'razorpay': {
          'keyId': 'rzp_test_key',
          'orderId': 'order_TaFMLxy5SMLnM5',
          'customerId': 'cust_TaFMLsU2embb5R',
          'recurring': '1',
        },
        'decentro': null,
        'authExpiresAt': '2026-09-11T07:10:47.608Z',
        'planId': 'month',
        'amountPaise': 29900,
        'currency': 'INR',
        'requiresReRegistration': false,
        'subscription': {
          'status': 'pending',
          'isEntitled': false,
          'entitledUntil': null,
          'activePlanId': 'month',
          'activeProductId': 'prabhuji_vip_month',
          'provider': 'razorpay',
          'expiresAt': null,
          'trialEndsAt': null,
          'startedAt': null,
        },
        'nextDebitDate': '2026-09-11',
        'startedAt': null,
        // ALWAYS present, even when null. `paymentReferenceId` is
        // `required: true, nullable: true` in the contract, so the server
        // emits the key on every response and the generated `MandateData`
        // asserts it is there. Omitting it (the null-aware `?` element this
        // used to use) modelled a response the API cannot produce, and only
        // passed because the generated client had never been regenerated
        // since TAM-151 added the field. TAM-177's codegen run surfaced it.
        'paymentReferenceId': paymentReferenceId,
      };

  test('parseMandate picks up paymentReferenceId from the raw envelope', () {
    final snapshot = PaymentRepository.parseMandate(
      wire(paymentReferenceId: 'pay-ref-123'),
    );
    expect(snapshot.paymentReferenceId, 'pay-ref-123');
    expect(snapshot.mandateId, '01a08a27-9e9e-75f0-b06f-c8a34c5e50e7');
  });

  test('parseMandate leaves paymentReferenceId null when absent or empty', () {
    expect(PaymentRepository.parseMandate(wire()).paymentReferenceId, isNull);
    // An empty string is not an id — treat it as absent so the analytics
    // path falls back to its own UUID rather than shipping ''.
    expect(
      PaymentRepository.parseMandate(wire(paymentReferenceId: ''))
          .paymentReferenceId,
      isNull,
    );
  });
}
