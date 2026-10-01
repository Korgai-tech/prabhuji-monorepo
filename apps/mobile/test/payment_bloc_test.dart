import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/core/analytics.dart';
import 'package:mobile/core/user_properties.dart';
import 'package:mobile/features/paywall/bloc/payment_bloc.dart';
import 'package:mobile/features/paywall/data/payment_repository.dart';
import 'package:mobile/features/paywall/bloc/payment_event.dart';
import 'package:mobile/features/paywall/bloc/payment_state.dart';
import 'package:mobile/features/paywall/paywall_analytics.dart';

import 'support/fake_payment.dart';

/// Structural fake for [Analytics]. Same shape as `paywall_bloc_test.dart`'s;
/// duplicated because the two suites are read/edited independently.
class _RecordingAnalytics implements Analytics {
  final List<_TrackedEvent> events = [];

  @override
  Future<void> trackEvent(
    String name, {
    Map<String, Object?> properties = const {},
    String? asUserId,
  }) async {
    events.add(_TrackedEvent(name, properties));
  }

  /// Meta's standard `StartTrial`, recorded rather than swallowed so the
  /// dedupe id shipped to Meta can be asserted. Needs a real override:
  /// `noSuchMethod` returns `null`, and the call site's `Future<void>`
  /// return type makes that a TypeError inside `_succeed`.
  final List<Map<String, Object?>> facebookStartTrials = [];

  @override
  Future<void> logFacebookStartTrial({
    required String orderId,
    double? price,
    String? currency,
    String? eventId,
  }) async {
    facebookStartTrials.add({
      'orderId': orderId,
      'price': price,
      'currency': currency,
      'eventId': eventId,
    });
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _TrackedEvent {
  _TrackedEvent(this.name, this.properties);
  final String name;
  final Map<String, Object?> properties;
}

/// Unit coverage for the real UPI Autopay flow.
///
/// The property that matters most across all of these: **the client never
/// decides**. Success comes only from the server reporting `isEntitled`, never
/// from the launch succeeding, the app resuming, or a mandate state that looks
/// encouraging. Everything else is presentation.
void main() {
  /// A fast schedule so tests don't sit through the real ~45s backoff.
  const fastPoll = [Duration.zero, Duration.zero, Duration.zero];

  PaymentBloc build({
    required FakePaymentRepository repo,
    FakeUpiLauncher? launcher,
    List<Duration> schedule = fastPoll,
    Analytics? analytics,
  }) {
    return PaymentBloc(
      repository: repo,
      launcher: launcher ?? FakeUpiLauncher(),
      pollSchedule: schedule,
      analytics: analytics,
    );
  }

  const tap = PayNowTapped(
    planId: 'month',
    selectedPlanPeriod: 'month',
    selectedProductId: 'prabhuji_vip_month',
    displayPrice: '₹299 / month',
    currency: 'INR',
    trialAvailable: true,
    trialDays: 3,
    paymentMethodDisplayed: 'UPI',
  );

  test('starts idle', () {
    final bloc = build(repo: FakePaymentRepository(onCreate: mandateSnapshot));
    expect(bloc.state, isA<PaymentIdle>());
  });

  test('happy path: create → launch → poll → entitled', () async {
    final launcher = FakeUpiLauncher();
    final repo = FakePaymentRepository(
      onCreate: mandateSnapshot,
      pollResults: [
        mandateSnapshot(), // still pending
        mandateSnapshot(
          state: MandateStateEnum.active,
          isEntitled: true,
          subscriptionStatus: 'trialing',
          trialEndsAt: DateTime.utc(2026, 7, 24),
        ),
      ],
    );
    final bloc = build(repo: repo, launcher: launcher);

    bloc.add(tap);
    final done = await bloc.stream.firstWhere((s) => s is PaymentSucceeded)
        as PaymentSucceeded;

    expect(done.subscriptionStatus, 'trialing');
    expect(done.trialEndsAt, DateTime.utc(2026, 7, 24));
    // The UPI intent was actually launched, with the URL the server gave us.
    expect(launcher.launched.single.scheme, 'upi');
    await bloc.close();
  });

  test('a trial grants entitlement even though nothing has been paid', () async {
    // The regression the whole entitlement seam exists for: `trialing` is not
    // `active`, and a client gating on status would deny the user here.
    final repo = FakePaymentRepository(
      onCreate: () => mandateSnapshot(
        state: MandateStateEnum.active,
        isEntitled: true,
        subscriptionStatus: 'trialing',
        trialEndsAt: DateTime.utc(2026, 7, 24),
      ),
    );
    final bloc = build(repo: repo);

    bloc.add(tap);
    final done = await bloc.stream.firstWhere((s) => s is PaymentSucceeded)
        as PaymentSucceeded;

    expect(done.subscriptionStatus, 'trialing');
    // Never launched a UPI app: the server already said we're entitled.
    expect(repo.createCalls, 1);
    await bloc.close();
  });

  test('no UPI app → PaymentAppUnavailable, not a generic error', () async {
    // The emulator case, and any device missing the AndroidManifest <queries>
    // entry. Worth its own error code because the fix is user-actionable.
    final repo = FakePaymentRepository(onCreate: mandateSnapshot);
    final bloc = build(repo: repo, launcher: FakeUpiLauncher(succeeds: false));

    bloc.add(tap);
    final failed =
        await bloc.stream.firstWhere((s) => s is PaymentFailed) as PaymentFailed;

    expect(failed.code, PaymentErrorCode.upiAppUnavailable);
    expect(failed.canRetry, isTrue);
    await bloc.close();
  });

  test('rejected in the UPI app → mandateRejected', () async {
    final repo = FakePaymentRepository(
      onCreate: mandateSnapshot,
      pollResults: [mandateSnapshot(state: MandateStateEnum.rejected)],
    );
    final bloc = build(repo: repo);

    bloc.add(tap);
    final failed =
        await bloc.stream.firstWhere((s) => s is PaymentFailed) as PaymentFailed;

    expect(failed.code, PaymentErrorCode.mandateRejected);
    expect(failed.requiresReRegistration, isFalse);
    await bloc.close();
  });

  test('revoked mandate asks the user to set up autopay AGAIN', () async {
    // NPCI auto-revokes when a first debit fails — an expected path with a
    // day-3 trial debit. The UX must be "set up autopay again", not "retry",
    // because there is no longer a mandate to retry against.
    final repo = FakePaymentRepository(
      onCreate: mandateSnapshot,
      pollResults: [
        mandateSnapshot(
          state: MandateStateEnum.revoked,
          requiresReRegistration: true,
        ),
      ],
    );
    final bloc = build(repo: repo);

    bloc.add(tap);
    final failed =
        await bloc.stream.firstWhere((s) => s is PaymentFailed) as PaymentFailed;

    expect(failed.code, PaymentErrorCode.mandateRevoked);
    expect(failed.requiresReRegistration, isTrue);
    expect(failed.message, contains('set up autopay again'));
    await bloc.close();
  });

  test('poll budget exhausted → PENDING, never a failure', () async {
    // Telling a user their payment failed when the mandate is merely slow
    // invites a SECOND payment for one that is about to succeed.
    final repo = FakePaymentRepository(
      onCreate: mandateSnapshot,
      pollResults: [mandateSnapshot()], // pending forever
    );
    final bloc = build(repo: repo);

    bloc.add(tap);
    final pending = await bloc.stream.firstWhere((s) => s is PaymentPending)
        as PaymentPending;

    expect(pending.pollAttempts, fastPoll.length);
    expect(bloc.state, isNot(isA<PaymentFailed>()));
    await bloc.close();
  });

  test('a transient poll error does not fail the payment', () async {
    // A dropped connection mid-poll says nothing about the mandate.
    final repo = _FlakyRepository(
      failuresBeforeSuccess: 2,
      success: mandateSnapshot(
        state: MandateStateEnum.active,
        isEntitled: true,
        subscriptionStatus: 'trialing',
      ),
    );
    final bloc = build(repo: repo, schedule: const [
      Duration.zero,
      Duration.zero,
      Duration.zero,
      Duration.zero,
    ]);

    bloc.add(tap);
    final done = await bloc.stream.firstWhere((s) => s is PaymentSucceeded);

    expect(done, isA<PaymentSucceeded>());
    await bloc.close();
  });

  test('createMandate failure is classified as a server error', () async {
    final repo = FakePaymentRepository(onCreate: mandateSnapshot)
      ..createError = Exception('500 boom');
    final bloc = build(repo: repo);

    bloc.add(tap);
    final failed =
        await bloc.stream.firstWhere((s) => s is PaymentFailed) as PaymentFailed;

    expect(failed.code, PaymentErrorCode.server);
    await bloc.close();
  });

  test('a null authUrl is treated as expired, not launched', () async {
    // Launching a null/expired link drops the user on a dead provider page
    // with no way back — worse than an honest error.
    final launcher = FakeUpiLauncher();
    final repo = FakePaymentRepository(
      onCreate: () => mandateSnapshot(authUrl: null),
    );
    final bloc = build(repo: repo, launcher: launcher);

    bloc.add(tap);
    final failed =
        await bloc.stream.firstWhere((s) => s is PaymentFailed) as PaymentFailed;

    expect(failed.code, PaymentErrorCode.mandateExpired);
    expect(launcher.launched, isEmpty);
    await bloc.close();
  });

  test('the chosen UPI app is the one actually launched', () async {
    // The whole point of the picker: without `setPackage` Android shows its
    // own chooser again, silently discarding the choice the user just made.
    final launcher = FakeUpiLauncher(
      apps: [upiApp(packageName: 'com.phonepe.app', appName: 'PhonePe')],
    );
    final repo = FakePaymentRepository(
      onCreate: () => mandateSnapshot(isEntitled: true),
    );
    final bloc = build(repo: repo, launcher: launcher);

    expect((await bloc.loadUpiApps()).single.appName, 'PhonePe');

    bloc.add(const PayNowTapped(planId: 'month', upiPackageName: 'com.phonepe.app'));
    await bloc.stream.firstWhere((s) => s is PaymentSucceeded);
    await bloc.close();
  });

  test('no installed apps degrades to the system chooser, not an error', () async {
    final launcher = FakeUpiLauncher(apps: const []);
    final repo = FakePaymentRepository(onCreate: mandateSnapshot);
    final bloc = build(repo: repo, launcher: launcher);

    expect(await bloc.loadUpiApps(), isEmpty);

    bloc.add(tap);
    await bloc.stream.firstWhere((s) => s is PaymentAwaitingApproval);
    // Launched with no package -> Android decides.
    expect(launcher.launchedPackages.single, isNull);
    await bloc.close();
  });

  test('dismissing while awaiting approval records the stage', () async {
    final repo = FakePaymentRepository(
      onCreate: mandateSnapshot,
      pollResults: [mandateSnapshot()],
    );
    final bloc = build(repo: repo, schedule: const [Duration(seconds: 30)]);

    bloc.add(tap);
    await bloc.stream.firstWhere((s) => s is PaymentAwaitingApproval);
    bloc.add(const PaymentDismissed());

    final cancelled = await bloc.stream.firstWhere((s) => s is PaymentCancelled)
        as PaymentCancelled;
    expect(cancelled.stage, 'awaiting_approval');
    await bloc.close();
  });

  // --- Sheet 1 rows 18–22 analytics ------------------------------------------

  group('Sheet 1 analytics', () {
    test(
        'row 18 + 19 — pay_now_clicked then payment_started fire in order '
        'with provider=decentro on start', () async {
      final analytics = _RecordingAnalytics();
      final repo = FakePaymentRepository(
        onCreate: () => mandateSnapshot(isEntitled: true),
      );
      final bloc = build(repo: repo, analytics: analytics);

      bloc.add(tap);
      await bloc.stream.firstWhere((s) => s is PaymentSucceeded);

      final names = analytics.events.map((e) => e.name).toList();
      final payIdx = names.indexOf(PaywallEvents.payNowClicked);
      final startIdx = names.indexOf(PaywallEvents.paymentStarted);
      expect(payIdx, isNonNegative);
      expect(startIdx, greaterThan(payIdx),
          reason:
              'Sheet-1 orders pay_now_clicked (18) → payment_started (19)');

      final payProps = analytics.events[payIdx].properties;
      expect(payProps[PaywallEventProps.planId], 'month');
      expect(payProps[PaywallEventProps.productId], 'prabhuji_vip_month');
      expect(payProps[PaywallEventProps.currency], 'INR');

      final startProps = analytics.events[startIdx].properties;
      expect(startProps[PaywallEventProps.paymentProvider], 'decentro');
      expect(startProps[PaywallEventProps.planId], 'month');
      await bloc.close();
    });

    test(
        'attribution (entry_source / trigger_module / trigger_action) rides '
        'on every payment event when PayNowTapped supplies it', () async {
      final analytics = _RecordingAnalytics();
      final repo = FakePaymentRepository(
        onCreate: () => mandateSnapshot(
          isEntitled: true,
          subscriptionStatus: 'active',
        ),
      );
      final bloc = build(repo: repo, analytics: analytics);

      bloc.add(const PayNowTapped(
        planId: 'month',
        selectedProductId: 'prabhuji_vip_month',
        displayPrice: '₹299 / month',
        currency: 'INR',
        paymentMethodDisplayed: 'UPI',
        triggerModule: UserPropertyModule.ringtone,
        triggerAction: PaywallTriggerAction.playRingtone,
        entrySource: PaywallEntrySource.feature,
      ));
      await bloc.stream.firstWhere((s) => s is PaymentSucceeded);

      // Every downstream event (pay_now_clicked, payment_started,
      // subscription_started, payment(success)) must carry the same trio —
      // the paywall_viewed / paywall_closed / payment schemas are aligned.
      final expectedNames = {
        PaywallEvents.payNowClicked,
        PaywallEvents.paymentStarted,
        PaywallEvents.subscriptionStarted,
        PaywallEvents.payment,
      };
      final seen = analytics.events
          .where((e) => expectedNames.contains(e.name))
          .toList();
      expect(seen.map((e) => e.name).toSet(), expectedNames);

      for (final e in seen) {
        expect(e.properties[PaywallEventProps.entrySource],
            PaywallEntrySource.feature,
            reason: '${e.name} missing entry_source');
        expect(e.properties[PaywallEventProps.triggerModule],
            UserPropertyModule.ringtone,
            reason: '${e.name} missing trigger_module');
        expect(e.properties[PaywallEventProps.triggerAction],
            PaywallTriggerAction.playRingtone,
            reason: '${e.name} missing trigger_action');
      }
      await bloc.close();
    });

    test(
        'attribution keys are DROPPED (not present-null) on payment events '
        'when PayNowTapped carried no PaywallArgs — matches `_track`\'s '
        'null-stripping convention (same as upi_type / mandate_id / etc.)',
        () async {
      final analytics = _RecordingAnalytics();
      final repo = FakePaymentRepository(
        onCreate: () => mandateSnapshot(isEntitled: true),
      );
      final bloc = build(repo: repo, analytics: analytics);

      bloc.add(tap); // no triggerModule/triggerAction/entrySource supplied
      await bloc.stream.firstWhere((s) => s is PaymentSucceeded);

      final payProps = analytics.events
          .firstWhere((e) => e.name == PaywallEvents.payNowClicked)
          .properties;
      // NB: `PaymentBloc._track` strips null values — a standalone paywall
      // open (Profile Upgrade / deep link / onboarding) will emit
      // `pay_now_clicked` WITHOUT the attribution keys, not with them=null.
      // Diverges from PaywallBloc's `paywall_viewed`, which keeps
      // present-but-null; the divergence is deliberate — `PaymentBloc` has
      // stripped nulls on every property since the file was written.
      expect(payProps.containsKey(PaywallEventProps.entrySource), isFalse);
      expect(payProps.containsKey(PaywallEventProps.triggerModule), isFalse);
      expect(payProps.containsKey(PaywallEventProps.triggerAction), isFalse);
      await bloc.close();
    });

    test(
        'row 20 + 21 — success WITH trial fires payment_result(success) and '
        'trial_activated (NOT subscription_activated)', () async {
      final analytics = _RecordingAnalytics();
      final repo = FakePaymentRepository(
        onCreate: () => mandateSnapshot(
          state: MandateStateEnum.active,
          isEntitled: true,
          subscriptionStatus: 'trialing',
          trialEndsAt: DateTime.utc(2026, 8, 3),
        ),
      );
      final bloc = build(repo: repo, analytics: analytics);

      bloc.add(tap);
      await bloc.stream.firstWhere((s) => s is PaymentSucceeded);

      // `payment_result(success)` retired — replaced by the consolidated
      // `payment(payment_status=success)` event which fires alongside
      // `trial_success` / `subscription_started`.
      final payment = analytics.events
          .where((e) => e.name == PaywallEvents.payment)
          .toList();
      expect(payment, hasLength(1));
      expect(payment.single.properties[PaywallEventProps.paymentStatus],
          PaywallEventProps.paymentStatusSuccess);

      final trial = analytics.events
          .where((e) => e.name == PaywallEvents.trialSuccess)
          .toList();
      expect(trial, hasLength(1),
          reason: 'trialEndsAt non-null → row 21 trial_activated');
      expect(trial.single.properties[PaywallEventProps.mandateId],
          'mandate-1');
      expect(trial.single.properties[PaywallEventProps.planId], 'month');
      expect(trial.single.properties[PaywallEventProps.trialEndDate],
          contains('2026-08-03'));

      // subscription_activated MUST NOT also fire on the trial branch.
      final sub = analytics.events
          .where((e) => e.name == PaywallEvents.subscriptionStarted)
          .toList();
      expect(sub, isEmpty,
          reason:
              'trial branch fires ONLY trial_activated; the day-3 conversion '
              'to a paid sub is a server-side webhook, not this bloc.');
      await bloc.close();
    });

    test(
        'trial_success + payment event_id is the server paymentReferenceId '
        '(not a client UUID), and rides to Meta too', () async {
      final analytics = _RecordingAnalytics();
      final repo = FakePaymentRepository(
        onCreate: () => mandateSnapshot(
          state: MandateStateEnum.active,
          isEntitled: true,
          subscriptionStatus: 'trialing',
          trialEndsAt: DateTime.utc(2026, 8, 3),
          paymentReferenceId: 'pay-ref-123',
        ),
      );
      final bloc = build(repo: repo, analytics: analytics);

      bloc.add(tap);
      await bloc.stream.firstWhere((s) => s is PaymentSucceeded);

      final trial = analytics.events
          .firstWhere((e) => e.name == PaywallEvents.trialSuccess);
      // Overrides the UUID `Analytics.trackEvent` would stamp, so this row
      // and the backend's `bk_trial_success` for the same payment carry one
      // id and can be deduped instead of double-counted.
      expect(trial.properties[PaywallEventProps.eventId], 'pay-ref-123');

      // The consolidated `payment` row shares the id, so the pair describes
      // one captured payment rather than two.
      final payment =
          analytics.events.firstWhere((e) => e.name == PaywallEvents.payment);
      expect(payment.properties[PaywallEventProps.eventId], 'pay-ref-123');

      // Meta's standard `StartTrial` carries the same id, so Events Manager
      // can dedupe it against the server-side copy of the same conversion.
      expect(analytics.facebookStartTrials.single['eventId'], 'pay-ref-123');
      await bloc.close();
    });

    test(
        'subscription_started + payment carry the server paymentReferenceId '
        'as event_id on the no-trial path', () async {
      final analytics = _RecordingAnalytics();
      final repo = FakePaymentRepository(
        onCreate: () => mandateSnapshot(
          state: MandateStateEnum.active,
          isEntitled: true,
          subscriptionStatus: 'active',
          paymentReferenceId: 'pay-ref-456',
        ),
      );
      final bloc = build(repo: repo, analytics: analytics);

      bloc.add(tap);
      await bloc.stream.firstWhere((s) => s is PaymentSucceeded);

      final sub = analytics.events
          .firstWhere((e) => e.name == PaywallEvents.subscriptionStarted);
      expect(sub.properties[PaywallEventProps.eventId], 'pay-ref-456');
      final payment =
          analytics.events.firstWhere((e) => e.name == PaywallEvents.payment);
      expect(payment.properties[PaywallEventProps.eventId], 'pay-ref-456');
      // No trial → Meta's StartTrial must not fire at all.
      expect(analytics.facebookStartTrials, isEmpty);
      await bloc.close();
    });

    test(
        'trial_success omits event_id when the server sends no '
        'paymentReferenceId (older build → trackEvent UUID stands)', () async {
      final analytics = _RecordingAnalytics();
      final repo = FakePaymentRepository(
        onCreate: () => mandateSnapshot(
          state: MandateStateEnum.active,
          isEntitled: true,
          subscriptionStatus: 'trialing',
          trialEndsAt: DateTime.utc(2026, 8, 3),
        ),
      );
      final bloc = build(repo: repo, analytics: analytics);

      bloc.add(tap);
      await bloc.stream.firstWhere((s) => s is PaymentSucceeded);

      final trial = analytics.events
          .firstWhere((e) => e.name == PaywallEvents.trialSuccess);
      // `_track` strips nulls, so the key is absent rather than null —
      // `trackEvent` then keeps the fresh UUID it stamps for every event.
      expect(trial.properties.containsKey(PaywallEventProps.eventId), isFalse);
      final payment =
          analytics.events.firstWhere((e) => e.name == PaywallEvents.payment);
      expect(payment.properties.containsKey(PaywallEventProps.eventId), isFalse);
      // Meta's StartTrial still fires, just without the dedupe parameter.
      expect(analytics.facebookStartTrials.single['eventId'], isNull);
      await bloc.close();
    });

    test(
        'row 20 + 22 — success WITHOUT trial fires payment_result(success) '
        'and subscription_activated(activation_source=direct_payment)',
        () async {
      final launcher = FakeUpiLauncher();
      final analytics = _RecordingAnalytics();
      final repo = FakePaymentRepository(
        onCreate: mandateSnapshot,
        pollResults: [
          mandateSnapshot(
            state: MandateStateEnum.active,
            isEntitled: true,
            subscriptionStatus: 'active',
            // trialEndsAt intentionally NULL — paid sub without trial.
          ),
        ],
      );
      final bloc = build(repo: repo, launcher: launcher, analytics: analytics);

      bloc.add(tap);
      await bloc.stream.firstWhere((s) => s is PaymentSucceeded);

      final sub = analytics.events
          .where((e) => e.name == PaywallEvents.subscriptionStarted)
          .toList();
      expect(sub, hasLength(1));
      expect(sub.single.properties[PaywallEventProps.activationSource],
          PaywallEventProps.activationDirectPayment);
      expect(sub.single.properties[PaywallEventProps.mandateId],
          'mandate-1');

      // trial_activated MUST NOT fire when trialEndsAt is null.
      final trial = analytics.events
          .where((e) => e.name == PaywallEvents.trialSuccess)
          .toList();
      expect(trial, isEmpty);
      await bloc.close();
    });

    test(
        'row 22 — an already-entitled create returns via the restore path '
        'with activation_source=restore', () async {
      final analytics = _RecordingAnalytics();
      final repo = FakePaymentRepository(
        onCreate: () => mandateSnapshot(
          isEntitled: true,
          subscriptionStatus: 'active',
        ),
      );
      final bloc = build(repo: repo, analytics: analytics);

      bloc.add(tap);
      await bloc.stream.firstWhere((s) => s is PaymentSucceeded);

      final sub = analytics.events
          .where((e) => e.name == PaywallEvents.subscriptionStarted)
          .toList();
      expect(sub, hasLength(1));
      expect(sub.single.properties[PaywallEventProps.activationSource],
          PaywallEventProps.activationRestore);
      await bloc.close();
    });

    test(
        'row 20 — failure fires payment_result(failure) with the closed '
        'PaymentErrorCode enum name as error_code', () async {
      final analytics = _RecordingAnalytics();
      final repo = FakePaymentRepository(
        onCreate: mandateSnapshot,
        pollResults: [mandateSnapshot(state: MandateStateEnum.rejected)],
      );
      final bloc = build(repo: repo, analytics: analytics);

      bloc.add(tap);
      await bloc.stream.firstWhere((s) => s is PaymentFailed);

      final result = analytics.events
          .where((e) => e.name == PaywallEvents.paymentResult)
          .toList();
      expect(result, hasLength(1));
      expect(result.single.properties[PaywallEventProps.result],
          PaywallEventProps.resultFailure);
      expect(result.single.properties[PaywallEventProps.errorCode],
          PaymentErrorCode.mandateRejected.name);
      expect(result.single.properties[PaywallEventProps.paymentProvider],
          'decentro');
      await bloc.close();
    });

    test(
        'row 20 — pending fires payment_result(pending) once the poll budget '
        'is exhausted', () async {
      final analytics = _RecordingAnalytics();
      final repo = FakePaymentRepository(
        onCreate: mandateSnapshot,
        pollResults: [mandateSnapshot()], // pending forever
      );
      final bloc = build(repo: repo, analytics: analytics);

      bloc.add(tap);
      await bloc.stream.firstWhere((s) => s is PaymentPending);

      final result = analytics.events
          .where((e) => e.name == PaywallEvents.paymentResult)
          .toList();
      expect(result, hasLength(1));
      expect(result.single.properties[PaywallEventProps.result],
          PaywallEventProps.resultPending);
      await bloc.close();
    });

    test(
        'row 20 — dismissed fires payment_result(cancelled)',
        () async {
      final analytics = _RecordingAnalytics();
      final repo = FakePaymentRepository(
        onCreate: mandateSnapshot,
        pollResults: [mandateSnapshot()],
      );
      final bloc = build(
        repo: repo,
        schedule: const [Duration(seconds: 30)],
        analytics: analytics,
      );

      bloc.add(tap);
      await bloc.stream.firstWhere((s) => s is PaymentAwaitingApproval);
      bloc.add(const PaymentDismissed());
      await bloc.stream.firstWhere((s) => s is PaymentCancelled);

      final result = analytics.events
          .where((e) => e.name == PaywallEvents.paymentResult)
          .toList();
      expect(result, hasLength(1));
      expect(result.single.properties[PaywallEventProps.result],
          PaywallEventProps.resultCancelled);
      expect(result.single.properties[PaywallEventProps.paymentProvider],
          'decentro');
      await bloc.close();
    });
  });
}

/// Fails `getMandate` a few times before succeeding.
class _FlakyRepository extends FakePaymentRepository {
  _FlakyRepository({required this.failuresBeforeSuccess, required this.success})
      : super(onCreate: mandateSnapshot);

  final int failuresBeforeSuccess;
  final MandateSnapshot success;
  int _calls = 0;

  @override
  Future<MandateSnapshot?> getMandate() async {
    _calls++;
    if (_calls <= failuresBeforeSuccess) throw Exception('connection reset');
    return success;
  }
}
