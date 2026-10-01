import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/features/paywall/bloc/payment_bloc.dart';

import 'support/fake_payment.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/features/paywall/bloc/paywall_bloc.dart';
import 'package:mobile/features/paywall/bloc/paywall_event.dart';
import 'package:mobile/features/paywall/bloc/paywall_state.dart';
import 'package:mobile/features/paywall/data/paywall_repository.dart';
import 'package:mobile/features/paywall/presentation/paywall_close.dart';
import 'package:mobile/features/paywall/presentation/paywall_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The paywall widget tests intentionally do NOT exercise the `media_kit`
/// initialization path — that requires a platform channel. Every other UI
/// element on the paywall (plan tabs, plan card, benefits list,
/// secure-and-safe pill, cancel/refund row, Pay Now button, close CTA) is
/// verified here. The `_config()` helper leaves `videoUrl == null` so the
/// widget's fallback backdrop renders and the `_ensureVideoController` code
/// path is a no-op.
///
/// The in-app UPI-app chooser was removed with the Paywall-2 redesign — the
/// payment repository returns a UPI intent URI and the OS surfaces its own
/// chooser on launch, so there is no `PAY USING` badge to exercise from the
/// widget layer. The `PaymentBloc.loadUpiApps` seam is still covered by
/// `payment_bloc_test.dart` for callers that want it.

class _StubPaywallRepository implements PaywallRepository {
  _StubPaywallRepository(this._config);
  final PaywallConfigData _config;

  @override
  Future<PaywallConfigData> getConfig({required String locale}) async =>
      _config;
}


/// The shipped SHAPE: a single plan with a trial. The price and trial length
/// are arbitrary fixture values, not the live ones — those are remote config.
PaywallConfigData _singlePlanConfig() => _config(
      plans: [
        PaywallPlanDisplay(
          planId: 'month',
          productId: 'prabhuji_vip_month',
          period: 'month',
          localizedLabel: 'Monthly',
          trialLabel: '3-day free trial',
          trialDays: 3,
          displayPriceText: '₹299 / month',
          subscriptionDetailText:
              'Free for 3 days, then ₹299/month. Auto-renews monthly.',
          sortOrder: 0,
        ),
      ],
    );

PaywallConfigData _config({List<PaywallPlanDisplay>? plans}) => PaywallConfigData(
      paywallId: 'paywall-1',
      configVersion: 3,
      enabled: true,
      localeRequested: 'hi',
      localeServed: 'hi',
      fallbackUsed: false,
      fallbackFrom: null,
      missingFields: const [],
      title: 'Prabhuji VIP Membership',
      videoUrl: null,
      videoThumbnailUrl: null,
      videoId: 'vip-hero',
      defaultPlanId: 'plan-weekly',
      plans: plans ??
          [
            PaywallPlanDisplay(
              planId: 'plan-weekly',
              productId: 'prod-weekly',
              period: 'week',
              localizedLabel: 'Per Week',
              trialLabel: '7-day free trial',
              trialDays: 7,
              displayPriceText: '₹99/week',
              subscriptionDetailText: 'Auto-renews weekly',
              sortOrder: 1,
            ),
            PaywallPlanDisplay(
              planId: 'plan-monthly',
              productId: 'prod-monthly',
              period: 'month',
              localizedLabel: 'Per Month',
              trialLabel: '',
              trialDays: 0,
              displayPriceText: '₹299/month',
              subscriptionDetailText: 'Auto-renews monthly',
              sortOrder: 2,
            ),
          ],
      benefits: [
        PaywallBenefitDisplay(
          benefitId: 'b-1',
          localizedName: 'Daily Mandir',
          icon: 'benefit-mandir.png',
          sortOrder: 1,
        ),
        PaywallBenefitDisplay(
          benefitId: 'b-2',
          localizedName: 'Custom Wallpapers',
          icon: 'benefit-wallpaper.png',
          sortOrder: 2,
        ),
      ],
      legalLinks: PaywallLegalLinks(
        privacyPolicyUrl: 'https://prabhuji.example.com/privacy',
        termsServiceUrl: 'https://prabhuji.example.com/terms',
        refundPolicyUrl: 'https://prabhuji.example.com/refund',
      ),
      cancelAnytimeText: 'Cancel Anytime',
      refundPolicyText: 'Refund Policy',
      payNowCta: 'Pay Now',
      shimmerEnabled: true,
    );

Future<SharedPreferences> _prefs() async {
  SharedPreferences.setMockInitialValues({});
  return SharedPreferences.getInstance();
}

Future<PaywallBloc> _buildReadyBloc({PaywallConfigData? config}) async {
  final bloc = PaywallBloc(
    paywallRepository: _StubPaywallRepository(config ?? _config()),
    preferences: await _prefs(),
  );
  bloc.add(const ConfigRequested('hi'));
  await bloc.stream
      .firstWhere((s) => s is PaywallReady || s is PaywallEmpty);
  return bloc;
}

Widget _harness({
  required PaywallBloc paywall,
  required PaymentBloc payment,
}) {
  return MaterialApp(
    home: MultiBlocProvider(
      providers: [
        BlocProvider<PaywallBloc>.value(value: paywall),
        BlocProvider<PaymentBloc>.value(value: payment),
      ],
      child: const PaywallScreen(),
    ),
  );
}

/// Router harness for the dismissal tests: `/origin` (a stand-in for any of
/// the gated surfaces that push the paywall), `/paywall`, and `/home` (where
/// a root-level dismissal lands).
GoRouter _paywallRouter({
  required PaywallBloc paywall,
  required PaymentBloc payment,
  required String initialLocation,
  PaywallDismissMode dismissMode = PaywallDismissMode.goHome,
}) {
  return GoRouter(
    initialLocation: initialLocation,
    routes: [
      GoRoute(
        path: '/origin',
        builder: (context, state) => const Scaffold(
          body: Center(child: Text('ORIGIN ROUTE')),
        ),
      ),
      GoRoute(
        path: '/paywall',
        builder: (context, state) => MultiBlocProvider(
          providers: [
            BlocProvider<PaywallBloc>.value(value: paywall),
            BlocProvider<PaymentBloc>.value(value: payment),
          ],
          child: PaywallScreen(dismissMode: dismissMode),
        ),
      ),
      GoRoute(
        path: '/home',
        builder: (context, state) => const Scaffold(
          body: Center(child: Text('HOME ROUTE')),
        ),
      ),
    ],
  );
}

Future<void> _dispose(
  WidgetTester tester,
  PaywallBloc paywall,
  PaymentBloc payment,
) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump();
  await tester.runAsync(paywall.close);
  await tester.runAsync(payment.close);
}

void main() {
  testWidgets('renders plan tabs + plan card + benefits + Pay Now',
      (tester) async {
    final paywall = await _buildReadyBloc();
    final payment = PaymentBloc(
      repository: FakePaymentRepository(onCreate: mandateSnapshot),
      launcher: FakeUpiLauncher(),
    );

    await tester.pumpWidget(_harness(paywall: paywall, payment: payment));
    await tester.pump();

    expect(find.byKey(const Key('paywall-plan-tabs')), findsOneWidget);
    expect(find.byKey(const Key('paywall-plan-tab-plan-weekly')), findsOneWidget);
    expect(find.byKey(const Key('paywall-plan-tab-plan-monthly')), findsOneWidget);
    expect(find.byKey(const Key('paywall-plan-card-plan-weekly')), findsOneWidget);
    expect(find.byKey(const Key('paywall-benefits-list')), findsOneWidget);
    expect(find.byKey(const Key('paywall-benefit-b-1')), findsOneWidget);
    expect(find.byKey(const Key('paywall-benefit-b-2')), findsOneWidget);
    expect(find.byKey(const Key('paywall-pay-now-cta')), findsOneWidget);
    expect(find.byKey(const Key('paywall-close-cta')), findsOneWidget);

    await _dispose(tester, paywall, payment);
  });

  testWidgets('only mocked price strings render — no hardcoded literals',
      (tester) async {
    final paywall = await _buildReadyBloc();
    final payment = PaymentBloc(
      repository: FakePaymentRepository(onCreate: mandateSnapshot),
      launcher: FakeUpiLauncher(),
    );

    await tester.pumpWidget(_harness(paywall: paywall, payment: payment));
    await tester.pump();

    // Exactly one ₹ price shows — the selected plan card. The monthly
    // subscription copy isn't in the card until it's selected.
    final rupees = find.textContaining(RegExp(r'₹'));
    expect(rupees, findsOneWidget,
        reason:
            'exactly one ₹ price shows — the currently selected plan card');
    // Shape only — a ₹ price with a non-zero amount. The value comes from
    // remote config, so the test must not pin it.
    expect(find.textContaining(RegExp(r'₹\s*[1-9]\d*')), findsOneWidget);
    expect(find.text('₹2'), findsNothing,
        reason: 'Figma stub value ₹2 must never leak into the widget');

    await _dispose(tester, paywall, payment);
  });

  testWidgets(
      'Sheet 1 row 25 — screen dispose does not crash when the accumulator '
      'is zero (video never played in this test env, videoUrl is null)',
      (tester) async {
    // The test config sets `videoUrl: null` so `_ensureVideoController` is a
    // no-op and no watch interval is ever recorded. Dispose must still be
    // safe — `trackVideoWatchTime` skips a zero total, so no analytics
    // event fires either. This locks the guard against a regression that
    // would fire watch_time_ms=0 on every close.
    final paywall = await _buildReadyBloc();
    final payment = PaymentBloc(
      repository: FakePaymentRepository(onCreate: mandateSnapshot),
      launcher: FakeUpiLauncher(),
    );

    await tester.pumpWidget(_harness(paywall: paywall, payment: payment));
    await tester.pump();

    // Unmount the widget without a route pop — the classic dispose path.
    await tester.pumpWidget(const SizedBox());
    await tester.pump();

    await tester.runAsync(paywall.close);
    await tester.runAsync(payment.close);
  });

  testWidgets('Close CTA routes to /home via go_router', (tester) async {
    final paywall = await _buildReadyBloc();
    final payment = PaymentBloc(
      repository: FakePaymentRepository(onCreate: mandateSnapshot),
      launcher: FakeUpiLauncher(),
    );

    final router = GoRouter(
      initialLocation: '/paywall',
      routes: [
        GoRoute(
          path: '/paywall',
          builder: (context, state) => MultiBlocProvider(
            providers: [
              BlocProvider<PaywallBloc>.value(value: paywall),
              BlocProvider<PaymentBloc>.value(value: payment),
            ],
            child: const PaywallScreen(),
          ),
        ),
        GoRoute(
          path: '/home',
          builder: (context, state) => const Scaffold(
            body: Center(child: Text('HOME ROUTE')),
          ),
        ),
      ],
    );

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pump();

    await tester.tap(find.byKey(const Key('paywall-close-cta')));
    await tester.pumpAndSettle();

    expect(find.text('HOME ROUTE'), findsOneWidget);
    expect(router.routeInformationProvider.value.uri.path, '/home');

    await tester.runAsync(paywall.close);
    await tester.runAsync(payment.close);
  });

  // Device-back parity. The paywall is the ROOT route on cold start (the
  // orchestrator redirects `/splash → /paywall`), so before PopScope a back
  // press popped the last page and Android closed the app.
  testWidgets('system back on the root paywall closes it instead of the app',
      (tester) async {
    final paywall = await _buildReadyBloc();
    final payment = PaymentBloc(
      repository: FakePaymentRepository(onCreate: mandateSnapshot),
      launcher: FakeUpiLauncher(),
    );

    final router = _paywallRouter(
      paywall: paywall,
      payment: payment,
      initialLocation: '/paywall',
    );

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pump();

    await tester.binding.handlePopRoute();
    // Explicit pumps, not `pumpAndSettle` — the Pay Now shimmer is an
    // infinite animation, so the tree never goes quiet while the paywall is
    // still on screen.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('HOME ROUTE'), findsOneWidget);
    expect(router.routeInformationProvider.value.uri.path, '/home');

    await tester.runAsync(paywall.close);
    await tester.runAsync(payment.close);
  });

  // The gated surfaces (mantras, aarti, ringtone, wallpaper, horoscope, …)
  // `push` the paywall over a live screen. Back must do there exactly what the
  // X does — route to /home — so the two never diverge by entry point.
  testWidgets('system back on a pushed paywall matches the X: /home',
      (tester) async {
    final paywall = await _buildReadyBloc();
    final payment = PaymentBloc(
      repository: FakePaymentRepository(onCreate: mandateSnapshot),
      launcher: FakeUpiLauncher(),
    );

    final router = _paywallRouter(
      paywall: paywall,
      payment: payment,
      initialLocation: '/origin',
    );

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pump();

    unawaited(router.push<void>('/paywall'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byKey(const Key('paywall-close-cta')), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('HOME ROUTE'), findsOneWidget);
    expect(find.text('ORIGIN ROUTE'), findsNothing);
    expect(router.routeInformationProvider.value.uri.path, '/home');

    await tester.runAsync(paywall.close);
    await tester.runAsync(payment.close);
  });

  // `returnToCaller` — the opt-in mode chat's content cards use. The paywall
  // interrupts a conversation there, so every exit has to hand the user back
  // to it. Nothing else passes the mode, which is why the three tests above
  // still assert /home.
  testWidgets('returnToCaller: the X pops back to the pushing surface',
      (tester) async {
    final paywall = await _buildReadyBloc();
    final payment = PaymentBloc(
      repository: FakePaymentRepository(onCreate: mandateSnapshot),
      launcher: FakeUpiLauncher(),
    );

    final router = _paywallRouter(
      paywall: paywall,
      payment: payment,
      initialLocation: '/origin',
      dismissMode: PaywallDismissMode.returnToCaller,
    );

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pump();

    unawaited(router.push<void>('/paywall'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    await tester.tap(find.byKey(const Key('paywall-close-cta')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('ORIGIN ROUTE'), findsOneWidget);
    expect(find.text('HOME ROUTE'), findsNothing);
    expect(router.routeInformationProvider.value.uri.path, '/origin');

    await tester.runAsync(paywall.close);
    await tester.runAsync(payment.close);
  });

  testWidgets('returnToCaller: system back pops back to the pushing surface',
      (tester) async {
    final paywall = await _buildReadyBloc();
    final payment = PaymentBloc(
      repository: FakePaymentRepository(onCreate: mandateSnapshot),
      launcher: FakeUpiLauncher(),
    );

    final router = _paywallRouter(
      paywall: paywall,
      payment: payment,
      initialLocation: '/origin',
      dismissMode: PaywallDismissMode.returnToCaller,
    );

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pump();

    unawaited(router.push<void>('/paywall'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    await tester.binding.handlePopRoute();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('ORIGIN ROUTE'), findsOneWidget);
    expect(router.routeInformationProvider.value.uri.path, '/origin');

    await tester.runAsync(paywall.close);
    await tester.runAsync(payment.close);
  });

  // The guard that makes the mode safe to hand to a call site that is WRONG
  // about its own stack: with nothing underneath, `returnToCaller` must still
  // go /home. A pop here would pop the last page, which Android reads as
  // "leave the app" — the exact bug `dismissPaywall` was written to fix.
  testWidgets('returnToCaller on a root paywall still lands on /home',
      (tester) async {
    final paywall = await _buildReadyBloc();
    final payment = PaymentBloc(
      repository: FakePaymentRepository(onCreate: mandateSnapshot),
      launcher: FakeUpiLauncher(),
    );

    final router = _paywallRouter(
      paywall: paywall,
      payment: payment,
      initialLocation: '/paywall',
      dismissMode: PaywallDismissMode.returnToCaller,
    );

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    await tester.binding.handlePopRoute();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('HOME ROUTE'), findsOneWidget);
    expect(router.routeInformationProvider.value.uri.path, '/home');

    await tester.runAsync(paywall.close);
    await tester.runAsync(payment.close);
  });

  testWidgets('single plan hides the tab strip', (tester) async {
    // A tab strip with one tab is a control that cannot do anything — it
    // reads as broken. The multi-plan rendering stays intact for later.
    final paywall = await _buildReadyBloc(config: _singlePlanConfig());
    final payment = PaymentBloc(
      repository: FakePaymentRepository(onCreate: mandateSnapshot),
      launcher: FakeUpiLauncher(),
    );

    await tester.pumpWidget(_harness(paywall: paywall, payment: payment));
    await tester.pump();

    expect(find.byKey(const Key('paywall-plan-tabs')), findsNothing);
    expect(find.byKey(const Key('paywall-pay-now-cta')), findsOneWidget);

    await _dispose(tester, paywall, payment);
  });

  testWidgets(
    'plan card renders the Secure & Safe pill above the cancel/refund row',
    (tester) async {
      final paywall = await _buildReadyBloc(config: _singlePlanConfig());
      final payment = PaymentBloc(
        repository: FakePaymentRepository(onCreate: mandateSnapshot),
        launcher: FakeUpiLauncher(),
      );

      await tester.pumpWidget(_harness(paywall: paywall, payment: payment));
      await tester.pump();

      expect(
        find.byKey(const Key('paywall-secure-safe-pill')),
        findsOneWidget,
      );
      expect(find.text('Secure & Safe'), findsOneWidget);
      expect(find.text('100% trusted payments'), findsOneWidget);
      expect(find.byKey(const Key('paywall-cancel-anytime')), findsOneWidget);
      expect(
        find.byKey(const Key('paywall-refund-policy-link')),
        findsOneWidget,
      );

      await _dispose(tester, paywall, payment);
    },
  );

  testWidgets(
    'the in-app UPI-app chooser is no longer rendered',
    (tester) async {
      // The Paywall-2 redesign delegates UPI-app selection to the OS chooser.
      // The old "PAY USING" badge + bottom sheet are gone.
      final paywall = await _buildReadyBloc(config: _singlePlanConfig());
      final payment = PaymentBloc(
        repository: FakePaymentRepository(onCreate: mandateSnapshot),
        launcher: FakeUpiLauncher(apps: [
          upiApp(packageName: 'com.phonepe.app', appName: 'PhonePe'),
        ]),
      );

      await tester.pumpWidget(_harness(paywall: paywall, payment: payment));
      await tester.pump();
      await tester.pump();

      expect(find.byKey(const Key('paywall-payment-method')), findsNothing);
      expect(find.byKey(const Key('paywall-upi-app-sheet')), findsNothing);
      expect(find.text('GPay UPI'), findsNothing);

    await _dispose(tester, paywall, payment);
  });

  // The trial length is remote config (`paywall_plans.trial_days`) and reaches
  // the app only as `trialEndsAt` — the mandate's first-debit date. These lock
  // the derivation so nobody re-hardcodes a day count into the copy.
  group('trial success message', () {
    // 21:00 IST on 28 Jul 2026 == 15:30 UTC. Deliberately late in the IST day:
    // that is where a naive `trialEndsAt.difference(now).inDays` truncates to
    // zero and reports a 1-day trial as none.
    final eveningIst = DateTime.utc(2026, 7, 28, 15, 30);

    /// `trialEndsAt` as the server sends it: UTC midnight of the IST date on
    /// which the first debit falls.
    DateTime firstDebit(int year, int month, int day) =>
        DateTime.utc(year, month, day);

    test('reports the granted days for a range of trial lengths', () {
      expect(
        trialSuccessMessage(firstDebit(2026, 7, 29), now: eveningIst),
        'Your 1-day free trial has started.',
      );
      expect(
        trialSuccessMessage(firstDebit(2026, 7, 30), now: eveningIst),
        'Your 2-day free trial has started.',
      );
      expect(
        trialSuccessMessage(firstDebit(2026, 7, 31), now: eveningIst),
        'Your 3-day free trial has started.',
      );
      expect(
        trialSuccessMessage(firstDebit(2026, 8, 7), now: eveningIst),
        'Your 10-day free trial has started.',
      );
    });

    test('a 1-day trial started late in the IST day still reads 1 day', () {
      // The guard against truncation: only 8.5 hours separate these two
      // instants, but they are different IST calendar dates.
      expect(trialDaysFrom(firstDebit(2026, 7, 29), now: eveningIst), 1);
    });

    test('now is reduced to an IST date too, not a UTC one', () {
      // 19:00 UTC is already 00:30 IST the NEXT day, so "today" is the 29th.
      final afterIstMidnight = DateTime.utc(2026, 7, 28, 19);
      expect(trialDaysFrom(firstDebit(2026, 7, 30), now: afterIstMidnight), 1);
    });

    test('no trial granted — plain welcome, no day count', () {
      expect(trialSuccessMessage(null), 'Welcome to Prabhuji VIP.');
    });

    test('a same-day first debit degrades to the count-less sentence', () {
      expect(
        trialSuccessMessage(firstDebit(2026, 7, 28), now: eveningIst),
        'Your free trial has started.',
      );
    });
  });
}