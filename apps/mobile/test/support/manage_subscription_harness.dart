import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/api/api_client.dart';
// Hide the codegen-emitted CancellationRequestData so it doesn't clash with
// the placeholder type in features/profile/application — the placeholder is
// the domain shape we own; the generated type is what dio will hand us
// after the parallel BE PR lands and its `DioSubscriptionCancelApi` (post-
// TAM-125) maps generated → placeholder in the same file (see the TODO in
// subscription_cancel_providers.dart).
import 'package:mobile/api/generated/openapi.dart'
    hide CancellationRequestData, CancellationRequestStatusEnum;
import 'package:mobile/core/analytics.dart';
import 'package:mobile/core/entitlement.dart';
import 'package:mobile/features/paywall/data/payment_repository.dart';
import 'package:mobile/features/profile/application/fake_subscription_cancel_api.dart';
import 'package:mobile/features/profile/application/subscription_cancel_providers.dart';
import 'package:mobile/features/profile/application/subscription_cancel_types.dart';
import 'package:mobile/features/profile/presentation/manage_subscription_screen.dart';
import 'package:mobile/state/providers.dart';

import 'fake_auth_store.dart';

/// A tiny in-memory `PaymentRepository` — the manage-subscription screen
/// reads `getMandate()` and nothing else. Every other method throws to
/// surface accidental calls.
class StubPaymentRepository implements PaymentRepository {
  StubPaymentRepository({this.mandate});
  MandateSnapshot? mandate;
  bool getMandateThrows = false;

  int getMandateCallCount = 0;

  @override
  Future<MandateSnapshot?> getMandate() async {
    getMandateCallCount++;
    if (getMandateThrows) throw ApiException('mandate load failed');
    return mandate;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      super.noSuchMethod(invocation);
}

/// Convenience mandate fixture — the manage-subscription screen only reads
/// `planId` + `nextDebitDate` (+ the eventual §4 `startedAt`), so the rest
/// are populated with defensible defaults so tests don't have to think
/// about them.
MandateSnapshot mandateFixture({
  String planId = 'prabhuji-vip-monthly',
  String? nextDebitDate = '2026-07-30',
  bool isEntitled = true,
  String subscriptionStatus = 'active',
  String provider = 'razorpay',
}) {
  return MandateSnapshot(
    mandateId: 'mandate-1',
    provider: provider,
    state: MandateStateEnum.active,
    authUrl: null,
    planId: planId,
    amountPaise: 19900,
    currency: 'INR',
    requiresReRegistration: false,
    subscriptionStatus: subscriptionStatus,
    isEntitled: isEntitled,
    trialEndsAt: null,
    nextDebitDate: nextDebitDate,
  );
}

CancellationRequestData cancelRequestFixture({
  String id = 'req-1',
  CancellationRequestStatus status = CancellationRequestStatus.pending,
  String? reason,
  DateTime? requestedAt,
  DateTime? processedAt,
}) {
  return CancellationRequestData(
    id: id,
    status: status,
    reason: reason,
    requestedAt: requestedAt ?? DateTime.utc(2026, 7, 25),
    processedAt: processedAt,
  );
}

/// A minimal entitlement notifier the tests override so a VIP flag is
/// deterministic without spinning up the full storage stack.
class SeededEntitlementNotifier extends EntitlementNotifier {
  SeededEntitlementNotifier(this._seed);
  final bool _seed;

  @override
  Entitlement build() => Entitlement(granted: _seed, until: null);
}

/// Pump the ManageSubscriptionScreen with a router (so `context.push` in the
/// free-tier CTA has somewhere to land) + Riverpod overrides for both the
/// mandate provider and the cancel-request port.
///
/// Returns the [FakeSubscriptionCancelApi] used so tests can seed rows and
/// assert call counts without reaching into providerScope.
Future<FakeSubscriptionCancelApi> pumpManageSubscriptionScreen(
  WidgetTester tester, {
  MandateSnapshot? mandate,
  CancellationRequestData? latestRequest,
  bool isVip = true,
  bool paymentRepoThrows = false,
  bool simulateNetworkFailureOnCreate = false,
  bool simulatePendingExistsOnCreate = false,
  String? simulateServerErrorMessage,
  Duration cancelApiDelay = Duration.zero,
  Analytics? analytics,
  Size viewSize = const Size(360, 800),
}) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  tester.view.physicalSize = viewSize;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final stubRepo = StubPaymentRepository(
    mandate: mandate ?? mandateFixture(),
  )..getMandateThrows = paymentRepoThrows;
  final api = FakeSubscriptionCancelApi(
    seedLatest: latestRequest,
    simulateNetworkFailureOnCreate: simulateNetworkFailureOnCreate,
    simulatePendingExistsOnCreate: simulatePendingExistsOnCreate,
    simulateServerErrorMessage: simulateServerErrorMessage,
    responseDelay: cancelApiDelay,
  );

  final router = GoRouter(
    initialLocation: '/host',
    routes: <RouteBase>[
      GoRoute(
        path: '/host',
        builder: (context, state) => const ManageSubscriptionScreen(),
      ),
      GoRoute(
        path: '/paywall',
        builder: (context, state) => const Scaffold(
          key: Key('probe-paywall'),
          body: SizedBox(),
        ),
      ),
    ],
  );

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        entitlementStateProvider.overrideWith(
          () => SeededEntitlementNotifier(isVip),
        ),
        paymentRepositoryProvider.overrideWithValue(stubRepo),
        subscriptionCancelApiProvider.overrideWithValue(api),
        analyticsProvider.overrideWithValue(analytics),
        // The screen is only reachable when signed in, and both billing
        // providers now watch `authIdentityProvider` (so one user's mandate
        // can never be read by the next user on the device). The default
        // `AuthStore` in a test scope is never hydrated, which reads as
        // "logged out" and short-circuits both fetches — seed a signed-in
        // store so the harness models the state the screen actually runs in.
        authStoreProvider.overrideWithValue(
          FakeAuthStore(token: signedInJwt),
        ),
      ],
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
  return api;
}

/// A JWT whose payload is `{"sub": "user-under-test"}` — enough for
/// `authIdentityProvider` to report a signed-in user. The signature is never
/// verified client-side (see `lib/core/jwt.dart`).
final String signedInJwt = () {
  String enc(Object o) =>
      base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${enc({'alg': 'HS256'})}.${enc({'sub': 'user-under-test'})}.sig';
}();
