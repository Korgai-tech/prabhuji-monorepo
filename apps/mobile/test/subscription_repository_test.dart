import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/api_client.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/features/paywall/data/subscription_repository.dart';

/// Parsing `GET /subscription/status`.
///
/// This file exists because the code it covers used to contain a SECOND,
/// simplified copy of the entitlement rule: when the server omitted
/// `isEntitled`, the client derived it as `status == active || trialing`. That
/// missed `past_due`-within-grace and `cancelled`-but-paid-through — so it
/// locked out paying users in exactly the two states where being locked out is
/// least defensible, and no test ever exercised the branch.
///
/// The rule now lives only on the server. What is asserted here is that the
/// client HONOURS it and never substitutes its own — including in the failure
/// case, where the honest answer is an error rather than a guess.
Map<String, dynamic> _body(Map<String, dynamic> data) => {
      'success': true,
      'message': 'OK',
      'data': data,
    };

Map<String, dynamic> _data({
  required String status,
  required bool isEntitled,
  String? entitledUntil,
  String? trialEndsAt,
  String? expiresAt,
}) =>
    {
      'status': status,
      'isEntitled': isEntitled,
      'entitledUntil': entitledUntil,
      'activePlanId': null,
      'activeProductId': null,
      'provider': null,
      'expiresAt': expiresAt,
      'trialEndsAt': trialEndsAt,
    };

void main() {
  group('SubscriptionRepository.parseStatus', () {
    test('maps every field from a full payload', () {
      final snap = SubscriptionRepository.parseStatus(_body(_data(
        status: 'trialing',
        isEntitled: true,
        entitledUntil: '2026-07-30T00:00:00.000Z',
        trialEndsAt: '2026-07-30T00:00:00.000Z',
      )));

      expect(snap.status, SubscriptionStatusEnum.trialing);
      expect(snap.isPro, isTrue);
      expect(snap.entitledUntil, DateTime.utc(2026, 7, 30));
      expect(snap.trialEndsAt, DateTime.utc(2026, 7, 30));
    });

    /// THE case the deleted fallback got wrong. A dunning user inside their
    /// grace window has already paid; `status` alone says `past_due`, which the
    /// old client-side rule read as "not Pro".
    test('past_due within grace is Pro, because the server says so', () {
      final snap = SubscriptionRepository.parseStatus(
        _body(_data(status: 'past_due', isEntitled: true)),
      );
      expect(snap.isPro, isTrue);
    });

    /// The other one it got wrong: cancelled but paid through the period end.
    test('cancelled but paid-through is Pro', () {
      final snap = SubscriptionRepository.parseStatus(
        _body(_data(status: 'cancelled', isEntitled: true)),
      );
      expect(snap.isPro, isTrue);
    });

    /// And the inverse — an `active` row past its expiry. A client comparing
    /// `status == active` would grant access to someone who has lapsed.
    test('active but lapsed is NOT Pro', () {
      final snap = SubscriptionRepository.parseStatus(
        _body(_data(status: 'active', isEntitled: false)),
      );
      expect(snap.isPro, isFalse);
    });

    test('a missing isEntitled throws instead of guessing', () {
      final data = _data(status: 'active', isEntitled: true)
        ..remove('isEntitled');
      // The important half is what it does NOT do: infer Pro-ness from
      // `status: active`. An error the caller surfaces beats a wrong grant.
      expect(
        () => SubscriptionRepository.parseStatus(_body(data)),
        throwsA(isA<ApiException>()),
      );
    });

    test('an unsuccessful envelope throws with the server message', () {
      expect(
        () => SubscriptionRepository.parseStatus(
          {'success': false, 'message': 'nope', 'data': null},
        ),
        throwsA(
          isA<ApiException>().having((e) => e.toString(), 'message',
              contains('nope')),
        ),
      );
    });

    test('a non-map data throws', () {
      expect(
        () => SubscriptionRepository.parseStatus(
          {'success': true, 'message': 'OK', 'data': 'nonsense'},
        ),
        throwsA(isA<ApiException>()),
      );
    });

    test('an unknown status degrades to free rather than throwing', () {
      // Forward compatibility: a server that adds an eighth status must not
      // hard-fail an older app. `isEntitled` still carries the decision.
      final snap = SubscriptionRepository.parseStatus(
        _body(_data(status: 'some_future_status', isEntitled: false)),
      );
      expect(snap.status, SubscriptionStatusEnum.free);
      expect(snap.isPro, isFalse);
    });
  });
}
