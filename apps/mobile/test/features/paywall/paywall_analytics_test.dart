import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/core/session_context.dart';
import 'package:mobile/features/paywall/bloc/payment_bloc.dart';
import 'package:mobile/features/paywall/bloc/payment_event.dart';
import 'package:mobile/features/paywall/bloc/payment_state.dart';
import 'package:mobile/features/paywall/bloc/paywall_bloc.dart';
import 'package:mobile/features/paywall/bloc/paywall_event.dart';
import 'package:mobile/features/paywall/bloc/paywall_state.dart';
import 'package:mobile/features/paywall/paywall_analytics.dart';

import '../../support/fake_analytics.dart';
import '../../support/fake_payment.dart';
import 'paywall_test_helpers.dart';

/// TAM-160 — analytics backfill test.
///
/// Assert every event listed in the spec's Analytics table carries the
/// three new / backfilled properties (`paywall_id`, `paywall_version`,
/// `paywall_layout`). The paywall bloc reads them from `config`/
/// `SessionContext` at emission; the payment bloc reads from
/// `SessionContext` (populated by the paywall bloc when `PaywallReady` is
/// emitted).
///
/// Bucket (last two digits of the phone number) is PII and is NOT emitted —
/// see `apps/api/src/core/paywall/services/paywall.buckets.ts` docblock.
void main() {
  const layout = 'video_bleed';
  const paywallId = 'vip-video-bleed-v1';
  const configVersion = 7;

  test(
      'paywall_viewed + paywall_video_started carry paywall_id + '
      'paywall_version + paywall_layout', () async {
    final analytics = RecordingAnalytics();
    final sc = SessionContext();
    final bloc = PaywallBloc(
      paywallRepository: StubPaywallRepository(
        buildConfig(
          layout: layout,
          paywallId: paywallId,
          configVersion: configVersion,
        ),
      ),
      preferences: await makePrefs(),
      analytics: analytics,
      sessionContext: sc,
    );
    bloc.add(const ConfigRequested('hi'));
    await bloc.stream.firstWhere((s) => s is PaywallReady);

    // SessionContext is populated the moment Ready is emitted.
    expect(sc.paywallId, paywallId);
    expect(sc.paywallConfigVersion, configVersion);
    expect(sc.paywallLayout, layout);

    void assertHas(String name) {
      final props = analytics.propsFor(name);
      expect(props[PaywallEventProps.paywallId], paywallId,
          reason: '$name must carry paywall_id');
      expect(props[PaywallEventProps.paywallVersion], configVersion,
          reason: '$name must carry paywall_version');
      expect(props[PaywallEventProps.paywallLayout], layout,
          reason: '$name must carry paywall_layout');
    }

    assertHas(PaywallEvents.paywallViewed);
    assertHas(PaywallEvents.paywallVideoStarted);

    await bloc.close();
  });

  test('paywall_closed carries all three (read from SessionContext)',
      () async {
    final analytics = RecordingAnalytics();
    final sc = SessionContext();
    final bloc = PaywallBloc(
      paywallRepository: StubPaywallRepository(
        buildConfig(
          layout: layout,
          paywallId: paywallId,
          configVersion: configVersion,
        ),
      ),
      preferences: await makePrefs(),
      analytics: analytics,
      sessionContext: sc,
    );
    bloc.add(const ConfigRequested('hi'));
    await bloc.stream.firstWhere((s) => s is PaywallReady);
    bloc.add(const CloseTapped(trigger: 'user_close'));
    // Give the close handler a microtask to run.
    await Future<void>.delayed(Duration.zero);

    final props = analytics.propsFor(PaywallEvents.paywallClosed);
    expect(props[PaywallEventProps.paywallId], paywallId);
    expect(props[PaywallEventProps.paywallVersion], configVersion);
    expect(props[PaywallEventProps.paywallLayout], layout);

    await bloc.close();
  });

  test(
      'paywall_video_watch_time + paywall_video_failed carry all three '
      '(SessionContext read, dispose-safe)', () async {
    final analytics = RecordingAnalytics();
    final sc = SessionContext();
    final bloc = PaywallBloc(
      paywallRepository: StubPaywallRepository(
        buildConfig(
          layout: layout,
          paywallId: paywallId,
          configVersion: configVersion,
        ),
      ),
      preferences: await makePrefs(),
      analytics: analytics,
      sessionContext: sc,
    );
    bloc.add(const ConfigRequested('hi'));
    await bloc.stream.firstWhere((s) => s is PaywallReady);

    bloc.trackVideoWatchTime(watchTimeMs: 4200, videoId: 'vip-hero');
    bloc.trackVideoFailed(videoId: 'vip-hero', errorCode: 'init_failed');
    await Future<void>.delayed(Duration.zero);

    for (final event in const [
      PaywallEvents.paywallVideoWatchTime,
      PaywallEvents.paywallVideoFailed,
    ]) {
      final props = analytics.propsFor(event);
      expect(props[PaywallEventProps.paywallId], paywallId,
          reason: '$event must carry paywall_id');
      expect(props[PaywallEventProps.paywallVersion], configVersion,
          reason: '$event must carry paywall_version');
      expect(props[PaywallEventProps.paywallLayout], layout,
          reason: '$event must carry paywall_layout');
    }

    await bloc.close();
  });

  test('every payment_bloc event carries all three from SessionContext',
      () async {
    final analytics = RecordingAnalytics();
    final sc = SessionContext()
      ..paywallId = paywallId
      ..paywallConfigVersion = configVersion
      ..paywallLayout = layout;

    // Successful trial path exercises: pay_now_clicked, payment_started,
    // trial_payment_initiated, trial_success, payment(success).
    final trialEndsAt = DateTime.now().add(const Duration(days: 3));
    final payment = PaymentBloc(
      repository: FakePaymentRepository(
        onCreate: () => mandateSnapshot(
          state: MandateStateEnum.pending,
          trialEndsAt: trialEndsAt,
        ),
        pollResults: [
          mandateSnapshot(
            state: MandateStateEnum.active,
            isEntitled: true,
            trialEndsAt: trialEndsAt,
          ),
        ],
      ),
      launcher: FakeUpiLauncher(),
      analytics: analytics,
      sessionContext: sc,
      pollSchedule: const [Duration.zero],
    );

    payment.add(const PayNowTapped(
      planId: 'plan-weekly',
      selectedPlanPeriod: 'week',
      selectedProductId: 'prod-weekly',
      displayPrice: '₹99',
      currency: 'INR',
      trialAvailable: true,
      trialDays: 3,
      paymentMethodDisplayed: 'UPI',
    ));

    // Wait for the state machine to settle at PaymentSucceeded.
    await payment.stream.firstWhere((s) => s is PaymentSucceeded);

    const requiredEvents = <String>[
      PaywallEvents.payNowClicked,
      PaywallEvents.paymentStarted,
      PaywallEvents.trialPaymentInitiated,
      PaywallEvents.trialSuccess,
      PaywallEvents.payment,
    ];
    for (final name in requiredEvents) {
      expect(analytics.fired(name), isTrue,
          reason: '$name should have fired on the trial success path');
      final props = analytics.propsFor(name);
      expect(props[PaywallEventProps.paywallId], paywallId,
          reason: '$name must carry paywall_id');
      expect(props[PaywallEventProps.paywallVersion], configVersion,
          reason: '$name must carry paywall_version');
      expect(props[PaywallEventProps.paywallLayout], layout,
          reason: '$name must carry paywall_layout');
    }

    await payment.close();
  });

  test(
      'payment_result (cancelled) + trial_failed / payment(failed) '
      'carry all three from SessionContext', () async {
    final analytics = RecordingAnalytics();
    final sc = SessionContext()
      ..paywallId = paywallId
      ..paywallConfigVersion = configVersion
      ..paywallLayout = layout;

    // Trial mandate that fails when the poll returns a rejected state.
    final payment = PaymentBloc(
      repository: FakePaymentRepository(
        onCreate: () => mandateSnapshot(
          state: MandateStateEnum.pending,
          trialEndsAt: DateTime.now().add(const Duration(days: 3)),
        ),
        pollResults: [
          mandateSnapshot(state: MandateStateEnum.rejected),
        ],
      ),
      launcher: FakeUpiLauncher(),
      analytics: analytics,
      sessionContext: sc,
      pollSchedule: const [Duration.zero],
    );

    payment.add(const PayNowTapped(
      planId: 'plan-weekly',
      selectedPlanPeriod: 'week',
      selectedProductId: 'prod-weekly',
      displayPrice: '₹99',
      currency: 'INR',
      trialAvailable: true,
      trialDays: 3,
      paymentMethodDisplayed: 'UPI',
    ));
    await payment.stream.firstWhere((s) => s is PaymentFailed);

    for (final name in const [
      PaywallEvents.trialFailed,
      PaywallEvents.payment,
    ]) {
      expect(analytics.fired(name), isTrue);
      final props = analytics.propsFor(name);
      expect(props[PaywallEventProps.paywallId], paywallId);
      expect(props[PaywallEventProps.paywallVersion], configVersion);
      expect(props[PaywallEventProps.paywallLayout], layout);
    }

    // Also exercise the cancelled + subscription_started terminal paths.
    final payment2 = PaymentBloc(
      repository: FakePaymentRepository(
        onCreate: () => mandateSnapshot(
          state: MandateStateEnum.pending,
        ),
      ),
      launcher: FakeUpiLauncher(),
      analytics: analytics,
      sessionContext: sc,
      pollSchedule: const [Duration.zero],
    );
    payment2.add(const PayNowTapped(
      planId: 'plan-weekly',
      selectedPlanPeriod: 'week',
      selectedProductId: 'prod-weekly',
      displayPrice: '₹99',
      currency: 'INR',
      trialAvailable: false,
      trialDays: 0,
      paymentMethodDisplayed: 'UPI',
    ));
    // Wait for the AwaitingApproval state, then dismiss.
    await payment2.stream.firstWhere((s) => s is PaymentAwaitingApproval);
    payment2.add(const PaymentDismissed());
    await payment2.stream.firstWhere((s) => s is PaymentCancelled);

    final cancelled = analytics.allProps(PaywallEvents.paymentResult).last;
    expect(cancelled[PaywallEventProps.paywallId], paywallId);
    expect(cancelled[PaywallEventProps.paywallVersion], configVersion);
    expect(cancelled[PaywallEventProps.paywallLayout], layout);

    await payment2.close();
  });
}
