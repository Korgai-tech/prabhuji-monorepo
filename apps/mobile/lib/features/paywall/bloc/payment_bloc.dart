// ignore_for_file: prefer_initializing_formals
//
// Named constructor params cannot be private, so `_repo = repository` is the
// only way to keep these fields private. Same precedent as the bloc this
// replaces.

import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:flutter/foundation.dart' show debugPrint;

import '../../../api/generated/openapi.dart';
import '../../../core/analytics.dart';
import '../../../core/session_context.dart';
import '../data/payment_repository.dart';
import '../data/razorpay_payment_gateway.dart';
import '../data/upi_launcher.dart';
import '../paywall_analytics.dart';
import 'payment_event.dart';
import 'payment_state.dart';

/// Real UPI Autopay payment flow (replaces `PaymentPlaceholderBloc`).
///
/// The flow, and why it is shaped this way:
///
///   1. `POST /payment/mandate` — the server registers the mandate and returns
///      an approval URL. Only a `planId` goes up; the amount is resolved
///      server-side.
///   2. Launch the `upi://` intent. The user leaves the app entirely.
///   3. On return (or on a background cadence, since some flows resolve
///      without a foreground return), poll `GET /payment/mandate`.
///   4. The SERVER decides. It confirms state against the provider's own API
///      and reports `isEntitled`. This bloc never infers success from anything
///      it observed locally — not from the launch succeeding, not from the app
///      resuming, not from a callback. That is what keeps a forged callback or
///      a tampered client from granting a subscription.
///
/// The poll budget deliberately ends in [PaymentPending], not a failure: UPI
/// mandates can settle minutes after the user approves, and telling someone it
/// failed invites a second payment for a mandate that is about to succeed.
///
/// ## Analytics (Sheet 1 rows 18–22)
///
///  * Row 18 `pay_now_clicked` — fires on `PayNowTapped`.
///  * Row 19 `payment_started` — fires after the server accepts the mandate.
///  * Row 20 `payment_result` — fires on EVERY terminal state: `_succeed`
///    (result=success), `_fail` (failure with the closed `PaymentErrorCode`
///    name as `error_code`), `_onDismissed` (cancelled), and the pending-
///    emit branch in `_onPollRequested`. Mirrors `set_wallpaper_result`.
///  * Row 21 `trial_activated` vs row 22 `subscription_activated` — `_succeed`
///    branches on `MandateSnapshot.trialEndsAt`: non-null → trial started;
///    null → paid subscription active without trial. Exactly ONE of the two
///    fires per success. A re-enter of an already-entitled mandate is a
///    `subscription_activated` with `activation_source: 'restore'`.
class PaymentBloc extends Bloc<PaymentEvent, PaymentState> {
  PaymentBloc({
    required PaymentRepository repository,
    required UpiLauncher launcher,
    Analytics? analytics,
    SessionContext? sessionContext,
    Future<void> Function()? onEntitlementChanged,
    List<Duration> pollSchedule = defaultPollSchedule,
    RazorpayPaymentGateway? razorpayGateway,
  })  : _repo = repository,
        _launcher = launcher,
        _analytics = analytics,
        _sessionContext = sessionContext,
        _pollSchedule = pollSchedule,
        _razorpayGateway = razorpayGateway,
        onEntitlementChanged = onEntitlementChanged,
        super(const PaymentIdle()) {
    on<PayNowTapped>(_onPayNowTapped);
    on<AppResumedFromUpi>(_onAppResumed);
    on<PollRequested>(_onPollRequested);
    on<PaymentRetried>(_onRetried);
    on<PaymentDismissed>(_onDismissed);
  }

  final PaymentRepository _repo;
  final UpiLauncher _launcher;
  final Analytics? _analytics;

  /// TAM-160 — the shared per-session context that carries the paywall's
  /// identity (`paywallId`, `paywallConfigVersion`, `paywallLayout`)
  /// populated by [PaywallBloc._onConfigRequested] when the user actually
  /// sees a paywall. Every payment event fired by this bloc reads from
  /// here so the warehouse can join a payment back to the paywall variant
  /// it was initiated from. Null in unit tests / when the bloc is built
  /// without DI wiring — the three properties simply drop from the
  /// payload (via [_track]'s null filter) in that case.
  final SessionContext? _sessionContext;

  /// TAM-129 — Razorpay checkout SDK gateway. Fires when the mandate
  /// API returns `provider: "razorpay"` AND this is non-null. When
  /// null (either the gateway wasn't registered or the server picked a
  /// different provider), the existing intent-launch path runs.
  final RazorpayPaymentGateway? _razorpayGateway;

  /// Called once entitlement is granted so the app's live entitlement flag
  /// refreshes before we navigate — `PaywallGate` re-reads it to resume the
  /// action the user was originally blocked on.
  ///
  /// **Settable so the paywall route can wire it via Riverpod after the bloc
  /// is built by `service_locator`.** The DI container can't reach Riverpod
  /// (get_it and Riverpod are separate), and this callback needs to call
  /// `entitlementStateProvider.notifier.refresh()` which requires a `ref`.
  /// Settable-not-final also means unit tests can leave it null and just
  /// assert `PaymentSucceeded` was emitted.
  Future<void> Function()? onEntitlementChanged;

  /// TAM-129 — async read of the logged-in user's phone number, used to
  /// prefill Razorpay's checkout so the user doesn't re-enter what they
  /// already typed at OTP. Settable rather than a constructor param for
  /// the same reason as [onEntitlementChanged]: the paywall route wires
  /// it from Riverpod's `meProvider` after `service_locator` builds the
  /// bloc. Null → no prefill (checkout still works; user just types).
  ///
  /// **Async on purpose** — was `String? Function()?` originally, which
  /// read `meProvider.value` synchronously. That returned null on first
  /// paywall entry (Riverpod's `FutureProvider` hadn't resolved yet) →
  /// no prefill → Razorpay's phone screen showed. Second entry worked
  /// because the fetch had resolved by then. Awaiting `meProvider.future`
  /// resolves instantly when cached and waits for the /users/me fetch
  /// when not — so the first-tap case gets the phone too.
  Future<String?> Function()? getPrefillContact;

  final List<Duration> _pollSchedule;

  /// ~45s across 8 attempts, front-loaded: approval usually completes within a
  /// few seconds of returning, and a user staring at a spinner notices the
  /// first gap most.
  static const List<Duration> defaultPollSchedule = [
    Duration.zero,
    Duration(seconds: 2),
    Duration(seconds: 3),
    Duration(seconds: 5),
    Duration(seconds: 8),
    Duration(seconds: 8),
    Duration(seconds: 8),
    Duration(seconds: 8),
  ];

  PayNowTapped? _lastTap;
  int _pollAttempts = 0;

  /// Sheet 1 row 8 / trial_failed / subscription_failed carry
  /// `attempt_number` = how many times the user has tapped Pay Now (or
  /// Retry) in the current checkout session. Starts at 1 on the first tap;
  /// `_onRetried` re-enters `_onPayNowTapped`, and the increment happens
  /// there so both the first attempt and every retry are counted.
  int _attemptNumber = 0;

  /// Remembers whether the mandate we're currently working with was granted
  /// as a trial (i.e. the last createMandate returned a `trialEndsAt`). Used
  /// on failure to pick `trial_failed` vs. the residual `payment_result`.
  bool _lastMandateWasTrial = false;

  /// Cached mandate metadata for use by `payment_id` / `mandate_id` /
  /// `next_billing_date` on failure/pending emits AFTER the mandate has been
  /// created but before a terminal state is emitted. `_lastMandate` is null
  /// until `createMandate` returns.
  MandateSnapshot? _lastMandate;

  /// Razorpay's `payment_id` (`pay_XXX`) as reported by
  /// `RazorpayPaymentApproved` — captured before dispatching `PollRequested`
  /// so the terminal `_succeed`/`_fail` events can stamp it. Null on the
  /// intent-launch (Decentro) path — that gateway does not surface an
  /// equivalent id to the client; the server-side webhook writes it.
  String? _lastRazorpayPaymentId;

  /// Razorpay's `order_id` (`order_XXX`). Available in TWO places:
  ///   * from `snapshot.razorpay.orderId` the moment `createMandate`
  ///     returns (used by `payment_started` / `trial_payment_initiated`),
  ///   * from `RazorpayPaymentApproved.orderId` on the SDK callback
  ///     (used to override the cached value on success).
  /// The SDK-callback value is authoritative — Razorpay may return the
  /// same order or a related one — so terminal events prefer it when set.
  String? _lastRazorpayOrderId;

  /// One-shot latches for `payment_gateway_opened` / `payment_gateway_closed`.
  /// Reset at the start of every `PayNowTapped` so a retry gets a fresh
  /// pair; guarded so the same event never fires twice within one attempt
  /// (Decentro's `AppResumedFromUpi` can fire multiple times if the user
  /// backgrounds again mid-flow — only the first return counts as "closed").
  bool _gatewayOpenedFired = false;
  bool _gatewayClosedFired = false;

  /// One-shot latch for the terminal success trio (`trial_success` /
  /// `subscription_started` / `payment(status=success)`). All three are
  /// emitted from `_succeed`, and without this guard a concurrent
  /// poll-loop race (bloc 9's default `concurrent()` transformer lets
  /// `_onAppResumed` dispatch a second `PollRequested` while the first
  /// `_onPollRequested`'s `while` is still awaiting a delay) could fire
  /// every terminal event twice for one purchase. Reset in
  /// `_onPayNowTapped` so a legitimate retry after a failure re-arms.
  bool _successFired = false;

  /// UPI apps installed on this device, for the "PAY USING" chooser.
  ///
  /// A plain method rather than an event+state pair on purpose: the app list
  /// is PRESENTATION data, not payment state. Routing it through the state
  /// machine would either churn states during an in-flight poll, or — as an
  /// un-emitted field — leave the UI reading a value that never triggers a
  /// rebuild. The screen awaits this and `setState`s on the result.
  ///
  /// Never throws: discovery failing degrades to the system chooser.
  Future<List<UpiApp>> loadUpiApps() => _launcher.listApps();

  Future<void> _onPayNowTapped(
    PayNowTapped event,
    Emitter<PaymentState> emit,
  ) async {
    // Fresh tap = attempt 1. `_onRetried` re-enters this method and would
    // reset to 1 too if we didn't guard — but retries route through a
    // separate `_onRetried` handler that pre-increments before delegating,
    // so the reset here fires only for genuine first taps in a session.
    if (event != _lastTap) {
      _attemptNumber = 1;
    }
    _lastTap = event;
    _pollAttempts = 0;
    // Fresh attempt = fresh gateway-lifecycle pair. A retry after a prior
    // attempt's gateway closed re-arms both latches so the new attempt
    // fires its own opened / closed cleanly.
    _gatewayOpenedFired = false;
    _gatewayClosedFired = false;
    // Same rationale for the terminal success trio — a retry after a
    // trial_failed must be able to fire trial_success on the new attempt.
    _successFired = false;

    // Sheet 1 row 18 — `pay_now_clicked`. Kept alongside the new
    // `trial_payment_initiated` because the new schema has no equivalent
    // "initiated" event for direct-paid subscriptions.
    _track(PaywallEvents.payNowClicked, {
      PaywallEventProps.planId: event.planId,
      PaywallEventProps.productId: event.selectedProductId,
      PaywallEventProps.amount: event.displayPrice,
      PaywallEventProps.currency: event.currency,
      PaywallEventProps.triggerModule: event.triggerModule,
      PaywallEventProps.triggerAction: event.triggerAction,
      PaywallEventProps.entrySource: event.entrySource,
    });

    emit(const PaymentCreatingMandate());

    MandateSnapshot snapshot;
    try {
      snapshot = await _repo.createMandate(planId: event.planId);
    } catch (err) {
      _fail(emit, _classify(err), 'Could not start the payment. Please try again.');
      return;
    }

    // Cache mandate metadata + trial-ness for downstream fires
    // (`trial_failed` vs. residual `payment_result(failure)`, `mandate_id` on
    // `payment(failed)`, etc.).
    _lastMandate = snapshot;
    _lastMandateWasTrial = snapshot.trialEndsAt != null;
    // Seed the order id from the mandate snapshot — Razorpay's `order_XXX`
    // is present the moment createMandate returns. On the intent-launch
    // (Decentro) path snapshot.razorpay is null and this stays null.
    // Reset the paymentId — a retry after a prior approval must not stamp
    // the old pay_XXX onto the new attempt's events.
    _lastRazorpayOrderId = snapshot.razorpay?.orderId;
    _lastRazorpayPaymentId = null;

    // Sheet 1 row 19 — `payment_started`. Fires once the provider flow has
    // been registered server-side; the intent launch that follows may or may
    // not succeed, but the payment itself has started.
    _track(PaywallEvents.paymentStarted, {
      PaywallEventProps.paymentProvider: _provider,
      PaywallEventProps.planId: event.planId,
      PaywallEventProps.productId: event.selectedProductId,
      PaywallEventProps.amount: event.displayPrice,
      PaywallEventProps.currency: event.currency,
      // Razorpay order_XXX — present the moment the mandate response
      // lands; null on the intent-launch (Decentro) path.
      PaywallEventProps.orderId: _lastRazorpayOrderId,
      PaywallEventProps.mandateId: snapshot.mandateId,
      PaywallEventProps.triggerModule: event.triggerModule,
      PaywallEventProps.triggerAction: event.triggerAction,
      PaywallEventProps.entrySource: event.entrySource,
    });

    // Frontend Payment Events — `trial_payment_initiated`. Fires ONLY when
    // the mandate the server just accepted is a trial-first mandate
    // (`trialEndsAt != null`). Direct-paid taps don't have an equivalent in
    // the new schema — `pay_now_clicked` above covers their intent moment.
    if (_lastMandateWasTrial) {
      _track(PaywallEvents.trialPaymentInitiated, {
        PaywallEventProps.type: PaywallEventProps.typeTrial,
        PaywallEventProps.index: 0,
        PaywallEventProps.planId: snapshot.planId,
        PaywallEventProps.amount: _amountRupees(event, snapshot),
        PaywallEventProps.currency: snapshot.currency,
        PaywallEventProps.paymentMethod:
            PaywallEventProps.paymentMethodUpiAutopay,
        // Razorpay pay_XXX only lands after checkout approval; still null
        // here by design.
        PaywallEventProps.paymentId: null,
        PaywallEventProps.orderId: _lastRazorpayOrderId,
        PaywallEventProps.mandateId: snapshot.mandateId,
        PaywallEventProps.upiType: _upiTypeFromPackage(event.upiPackageName),
        PaywallEventProps.triggerModule: event.triggerModule,
        PaywallEventProps.triggerAction: event.triggerAction,
        PaywallEventProps.entrySource: event.entrySource,
      });
    }

    // Already entitled: the user re-entered the paywall with a live
    // subscription, or a previous attempt settled while they were away.
    if (snapshot.isEntitled) {
      await _succeed(emit, snapshot, activationSource: PaywallEventProps.activationRestore);
      return;
    }

    // TAM-129 — Razorpay SDK path. Server picked Razorpay: the response
    // has `provider: "razorpay"` + a `razorpay` payload block. Open
    // Razorpay's own checkout in-app (no authUrl involved). Kept BEFORE
    // the `authUrl == null` failure branch so a Razorpay response
    // (which correctly has `authUrl: null`) doesn't misfire as "link
    // expired". Contract: `docs/PAYMENT-MANDATE-API-CONTRACT.md`.
    if (snapshot.provider == 'razorpay' &&
        snapshot.razorpay != null &&
        _razorpayGateway != null) {
      await _runRazorpayPath(emit, snapshot);
      return;
    }

    final authUrl = snapshot.authUrl;
    if (authUrl == null) {
      // No live approval link and not entitled — the mandate is in a terminal
      // state the user must recover from by consenting again.
      _fail(
        emit,
        PaymentErrorCode.mandateExpired,
        'This payment link has expired. Please try again.',
        requiresReRegistration: snapshot.requiresReRegistration,
      );
      return;
    }

    // Decentro's "shortened intent link" may be an https redirect; launching
    // that opens a browser instead of a UPI app.
    final resolved = await _repo.resolveIntentUrl(authUrl);
    final launched = await _launcher.launch(
      Uri.parse(resolved),
      packageName: event.upiPackageName,
    );
    if (!launched) {
      _fail(
        emit,
        PaymentErrorCode.upiAppUnavailable,
        'No UPI app found. Please install one and try again.',
      );
      return;
    }

    // Decentro path — the OS has handed control to a UPI app. Fire the
    // gateway-opened landmark AFTER launched==true so the "no UPI app"
    // branch above doesn't misfire it.
    _emitGatewayOpened();

    emit(PaymentAwaitingApproval(mandateId: snapshot.mandateId));

    // Poll even without a foreground return — some flows resolve while the
    // user is still in their UPI app, and waiting for a resume that may never
    // come would strand them on a spinner.
    add(const PollRequested());
  }

  /// TAM-129 — the Razorpay-driven mandate flow.
  ///
  /// Contract vs the intent-launch path:
  ///   * Same server endpoint (`POST /payment/mandate`). Server picked
  ///     Razorpay; the response carries `provider: "razorpay"` +
  ///     `razorpay: {keyId, orderId, customerId?, recurring}`.
  ///   * No URL launch — Razorpay's own SDK renders the checkout sheet
  ///     in-app + handles the UPI intent handoff. The SDK's callback
  ///     is the terminal-state signal.
  ///   * Same poll-and-settle after approval. Entitlement stays
  ///     server-authoritative — a forged `EVENT_PAYMENT_SUCCESS`
  ///     cannot grant Pro; the poll reads the state the Razorpay
  ///     webhook settled server-side.
  Future<void> _runRazorpayPath(
    Emitter<PaymentState> emit,
    MandateSnapshot snapshot,
  ) async {
    final gateway = _razorpayGateway;
    final baseParams = snapshot.razorpay;
    if (gateway == null || baseParams == null) return; // guarded by caller

    // Prefill both contact + email so Razorpay's SDK skips its
    // user-info screen entirely (see `razorpay_sdk_gateway.dart` for the
    // full `prefill`+`readonly`+`hidden` combo). Prabhuji doesn't
    // collect email — fabricate a stable `no-reply` address from the
    // phone so BOTH fields are populated; Razorpay validates the
    // format but doesn't send mail. Sanitise the phone to digits-only
    // so `+91…@…` doesn't become an invalid email.
    //
    // Awaits `getPrefillContact` — cached-instant if `/users/me` has
    // already resolved (typical after user has visited home once), a
    // brief wait on the very first paywall entry from a cold session.
    // Fetch failures fall through to "no prefill" rather than block
    // the payment.
    String? rawPhone;
    try {
      rawPhone = await getPrefillContact?.call();
    } catch (_) {
      rawPhone = null;
    }
    final RazorpayCheckoutParams params;
    if (rawPhone == null || rawPhone.isEmpty) {
      params = baseParams;
    } else {
      
      final prefillEmail = 'void@razorpay.com';
      params = RazorpayCheckoutParams(
        keyId: baseParams.keyId,
        orderId: baseParams.orderId,
        customerId: baseParams.customerId,
        recurring: baseParams.recurring,
        merchantName: baseParams.merchantName,
        description: baseParams.description,
        prefillContact: rawPhone,
        prefillEmail: prefillEmail,
      );
    }

    emit(PaymentAwaitingApproval(mandateId: snapshot.mandateId));

    // Razorpay path — the SDK sheet is about to be presented. Fire the
    // gateway-opened landmark BEFORE awaiting startCheckout so a hang or
    // native crash inside the SDK still leaves a "we opened it" breadcrumb
    // in the funnel.
    _emitGatewayOpened();

    RazorpayPaymentEvent result;
    try {
      result = await gateway.startCheckout(params);
    } on RazorpaySdkUnavailable catch (e) {
      // Mandate row was persisted server-side by createMandate above;
      // treat as failure rather than silently falling back to the
      // intent-launch path (which would try to double-register).
      debugPrint('[PaymentBloc] Razorpay SDK unavailable: $e');
      _fail(
        emit,
        PaymentErrorCode.upiAppUnavailable,
        'Payment setup is temporarily unavailable. Please try again.',
      );
      return;
    }

    // Razorpay path — startCheckout returned, so the SDK sheet is
    // dismissed. Fire gateway-closed once with the SDK's outcome. The
    // terminal `_succeed`/`_fail` further down represent the SERVER
    // decision, which may happen minutes later after polling settles.
    _emitGatewayClosed(outcome: switch (result) {
      RazorpayPaymentApproved() => 'approved',
      RazorpayPaymentDeclined() => 'declined',
      RazorpayPaymentCancelled() => 'cancelled',
    });

    switch (result) {
      case RazorpayPaymentApproved(:final paymentId, :final orderId):
        // Cache the SDK-callback ids BEFORE dispatching PollRequested so
        // the terminal _succeed emit — which fires from _onPollRequested's
        // isEntitled branch — can stamp `payment_id` + `order_id` onto
        // trial_success / subscription_started / payment(success). Prefer
        // the callback's orderId over the snapshot's (see field dartdoc).
        _lastRazorpayPaymentId = paymentId;
        if (orderId != null && orderId.isNotEmpty) {
          _lastRazorpayOrderId = orderId;
        }
        // Same shape as the intent-launch success branch — kick the
        // poll and let the server confirm entitlement.
        add(const PollRequested());
      case RazorpayPaymentDeclined(:final errorMessage):
        _fail(
          emit,
          PaymentErrorCode.mandateRejected,
          errorMessage.isNotEmpty
              ? errorMessage
              : 'Payment failed. Please try again.',
        );
      case RazorpayPaymentCancelled():
        add(const PaymentDismissed());
    }
  }

  Future<void> _onAppResumed(
    AppResumedFromUpi event,
    Emitter<PaymentState> emit,
  ) async {
    if (state is! PaymentAwaitingApproval && state is! PaymentPolling) return;
    // Decentro path — first foreground resume after gateway_opened is the
    // "user came back from the UPI app" signal. Outcome is unknown here
    // (poll hasn't confirmed anything yet), so pass `returned` — the
    // subsequent `payment(status=...)` event carries the settled result.
    // Idempotent: a user backgrounding + returning again mid-poll won't
    // re-fire (_gatewayClosedFired latch inside the helper).
    _emitGatewayClosed(outcome: 'returned');
    // Restart the budget: the user just did something, so give the flow a
    // fresh set of attempts rather than resuming a nearly-exhausted one.
    _pollAttempts = 0;
    add(const PollRequested());
  }

  Future<void> _onPollRequested(
    PollRequested event,
    Emitter<PaymentState> emit,
  ) async {
    final mandateId = _currentMandateId();
    if (mandateId == null) return;

    while (_pollAttempts < _pollSchedule.length) {
      final delay = _pollSchedule[_pollAttempts];
      _pollAttempts++;
      if (delay > Duration.zero) await Future<void>.delayed(delay);

      // The user navigated away or a concurrent path already settled it.
      if (isClosed) return;
      if (state is! PaymentAwaitingApproval && state is! PaymentPolling) return;

      emit(PaymentPolling(mandateId: mandateId, attempt: _pollAttempts));

      MandateSnapshot? snapshot;
      try {
        snapshot = await _repo.getMandate();
      } catch (_) {
        // A transient poll failure is not a payment failure — the mandate may
        // be perfectly fine. Keep trying within the budget.
        continue;
      }
      if (snapshot == null) continue;

      if (snapshot.isEntitled) {
        await _succeed(emit, snapshot);
        return;
      }
      final terminal = _terminalFailure(snapshot);
      if (terminal != null) {
        _fail(
          emit,
          terminal.$1,
          terminal.$2,
          requiresReRegistration: snapshot.requiresReRegistration,
        );
        return;
      }
    }

    // Budget exhausted with no verdict. Explicitly NOT a failure. Sheet 1
    // row 20 — `payment_result` with `result: pending`.
    _track(PaywallEvents.paymentResult, {
      PaywallEventProps.result: PaywallEventProps.resultPending,
      PaywallEventProps.paymentProvider: _provider,
      PaywallEventProps.planId: _lastTap?.planId,
      PaywallEventProps.amount: _lastTap?.displayPrice,
      PaywallEventProps.currency: _lastTap?.currency,
      PaywallEventProps.orderId: _lastRazorpayOrderId,
      PaywallEventProps.mandateId: mandateId,
      PaywallEventProps.triggerModule: _lastTap?.triggerModule,
      PaywallEventProps.triggerAction: _lastTap?.triggerAction,
      PaywallEventProps.entrySource: _lastTap?.entrySource,
    });
    emit(PaymentPending(mandateId: mandateId, pollAttempts: _pollAttempts));
  }

  Future<void> _onRetried(PaymentRetried event, Emitter<PaymentState> emit) async {
    final tap = _lastTap;
    if (tap == null) return;
    // Bump BEFORE re-entering so the retried attempt fires `trial_failed`
    // (if it fails again) with attempt_number = 2, not 1. The reset-to-1
    // guard in `_onPayNowTapped` sees the same `tap` instance and skips.
    _attemptNumber += 1;
    await _onPayNowTapped(tap, emit);
  }

  void _onDismissed(PaymentDismissed event, Emitter<PaymentState> emit) {
    final stage = switch (state) {
      PaymentAwaitingApproval() => 'awaiting_approval',
      PaymentPolling() => 'polling',
      _ => 'before_launch',
    };
    // Sheet 1 row 20 — `payment_result` with `result: cancelled`.
    _track(PaywallEvents.paymentResult, {
      PaywallEventProps.result: PaywallEventProps.resultCancelled,
      PaywallEventProps.paymentProvider: _provider,
      PaywallEventProps.planId: _lastTap?.planId,
      PaywallEventProps.amount: _lastTap?.displayPrice,
      PaywallEventProps.currency: _lastTap?.currency,
      PaywallEventProps.orderId: _lastRazorpayOrderId,
      PaywallEventProps.mandateId: _lastMandate?.mandateId,
      PaywallEventProps.triggerModule: _lastTap?.triggerModule,
      PaywallEventProps.triggerAction: _lastTap?.triggerAction,
      PaywallEventProps.entrySource: _lastTap?.entrySource,
    });
    emit(PaymentCancelled(stage: stage));
  }

  // ---- internals -----------------------------------------------------------

  Future<void> _succeed(
    Emitter<PaymentState> emit,
    MandateSnapshot s, {
    String? activationSource,
  }) async {
    // Idempotency gate — see the `_successFired` field dartdoc for the
    // concurrent poll-loop race this closes. Must be the FIRST statement so
    // a second call short-circuits BEFORE any analytics fire, before
    // onEntitlementChanged runs (a Riverpod refresh — the first call has
    // already done it), and before the redundant `emit(PaymentSucceeded)`.
    if (_successFired) return;
    _successFired = true;

    // Cache in case _lastMandate is stale (e.g. re-enter-already-entitled path
    // where createMandate returned the entitled snapshot directly).
    _lastMandate = s;
    _lastMandateWasTrial = s.trialEndsAt != null;

    final trialEndsAt = s.trialEndsAt;
    final nowIso = DateTime.now().toUtc().toIso8601String();
    final tap = _lastTap;
    final amountRupees = tap == null ? s.amountPaise ~/ 100 : _amountRupees(tap, s);
    final upiType = _upiTypeFromPackage(tap?.upiPackageName);
    final triggerModule = tap?.triggerModule;
    final triggerAction = tap?.triggerAction;
    final entrySource = tap?.entrySource;
    final billingCycle = _billingCycleFromPlanId(s.planId);
    final nextBillingIso = _parseIso(s.nextDebitDate);

    if (trialEndsAt != null) {
      // Frontend Payment Events — `trial_success`. Retires the old
      // `trial_activated` (Sheet 1 row 21); this event carries the full
      // property set (payment_method / upi_type / trigger_module).
      _track(PaywallEvents.trialSuccess, {
        // Server-minted id for this payment attempt, overriding the UUID
        // `trackEvent` would otherwise stamp, so this event and the
        // backend's `bk_trial_success` share one `event_id`. Null on an
        // older server — `_track` drops nulls, so the UUID stands.
        PaywallEventProps.eventId: s.paymentReferenceId,
        PaywallEventProps.type: PaywallEventProps.typeTrial,
        PaywallEventProps.index: 0,
        PaywallEventProps.upiType: upiType,
        PaywallEventProps.planId: s.planId,
        PaywallEventProps.amount: amountRupees,
        PaywallEventProps.currency: s.currency,
        PaywallEventProps.paymentMethod:
            PaywallEventProps.paymentMethodUpiAutopay,
        // Razorpay pay_XXX / order_XXX from the SDK approval callback
        // cached in _runRazorpayPath. Null on the Decentro / restore path.
        PaywallEventProps.paymentId: _lastRazorpayPaymentId,
        PaywallEventProps.orderId: _lastRazorpayOrderId,
        PaywallEventProps.mandateId: s.mandateId,
        PaywallEventProps.trialStartDate: nowIso,
        PaywallEventProps.trialEndDate: trialEndsAt.toUtc().toIso8601String(),
        PaywallEventProps.triggerModule: triggerModule,
        PaywallEventProps.triggerAction: triggerAction,
        PaywallEventProps.entrySource: entrySource,
      });
      // Meta / Facebook standard `StartTrial` event. Fires alongside the
      // custom `trial_success` above so Meta Events Manager + Ads
      // optimisation see the standard signal. No-op when the Meta sink is
      // disabled (placeholder secrets); analytics is null in tests.
      unawaited(_analytics?.logFacebookStartTrial(
        orderId: s.mandateId,
        price: amountRupees?.toDouble(),
        currency: s.currency,
        eventId: s.paymentReferenceId,
      ));
    } else {
      // Frontend Payment Events — `subscription_started`. Retires the old
      // `subscription_activated` (Sheet 1 row 22). `activation_source`
      // defaults to `direct_payment` on a fresh-payment path; the paywall
      // gate-resume path passes `restore` explicitly. Server-driven day-3
      // trial-to-paid conversion fires this with `trial_conversion` from
      // its webhook, not from here.
      _track(PaywallEvents.subscriptionStarted, {
        // Same server-minted dedupe id as the trial branch. Note the restore
        // path reaches here too (`activation_source: restore`), where no new
        // charge happened — the id then describes the mandate's original
        // payment, or is absent. Null is dropped by `_track`.
        PaywallEventProps.eventId: s.paymentReferenceId,
        PaywallEventProps.type: PaywallEventProps.typeSubscription,
        PaywallEventProps.index: null, // backend TODO (lifecycle position)
        PaywallEventProps.planId: s.planId,
        PaywallEventProps.amount: amountRupees,
        PaywallEventProps.currency: s.currency,
        PaywallEventProps.paymentMethod:
            PaywallEventProps.paymentMethodUpiAutopay,
        PaywallEventProps.paymentId: _lastRazorpayPaymentId,
        PaywallEventProps.orderId: _lastRazorpayOrderId,
        PaywallEventProps.mandateId: s.mandateId,
        PaywallEventProps.activationSource:
            activationSource ?? PaywallEventProps.activationDirectPayment,
        PaywallEventProps.subscriptionStartDate: nowIso,
        PaywallEventProps.nextBillingDate: nextBillingIso,
        PaywallEventProps.billingCycle: billingCycle,
        PaywallEventProps.triggerModule: triggerModule,
        PaywallEventProps.triggerAction: triggerAction,
        PaywallEventProps.entrySource: entrySource,
      });
    }

    // Consolidated revenue record. Fires alongside every success terminal
    // state so the warehouse gets one clean row per captured payment. Does
    // NOT fire for cancelled/pending — those stay on residual
    // `payment_result` (kept-old).
    _track(PaywallEvents.payment, {
      // Shares the id with the `trial_success` / `subscription_started` row
      // fired just above, so one captured payment is one id across all three.
      PaywallEventProps.eventId: s.paymentReferenceId,
      PaywallEventProps.type: trialEndsAt != null
          ? PaywallEventProps.typeTrial
          : PaywallEventProps.typeSubscription,
      PaywallEventProps.index: trialEndsAt != null ? 0 : null,
      PaywallEventProps.amount: amountRupees,
      PaywallEventProps.currency: s.currency,
      PaywallEventProps.planId: s.planId,
      PaywallEventProps.paymentStatus:
          PaywallEventProps.paymentStatusSuccess,
      PaywallEventProps.paymentMethod:
          PaywallEventProps.paymentMethodUpiAutopay,
      PaywallEventProps.paymentId: _lastRazorpayPaymentId,
      PaywallEventProps.orderId: _lastRazorpayOrderId,
      PaywallEventProps.mandateId: s.mandateId,
      PaywallEventProps.paymentDate: nowIso,
      PaywallEventProps.isFirstPayment: null, // backend TODO
      PaywallEventProps.triggerModule: triggerModule,
      PaywallEventProps.triggerAction: triggerAction,
      PaywallEventProps.entrySource: entrySource,
    });

    // Refresh live entitlement BEFORE emitting, so the screen's listener can
    // navigate immediately and `PaywallGate` sees the new value when the route
    // pops and resumes the user's original action.
    await onEntitlementChanged?.call();
    emit(PaymentSucceeded(
      subscriptionStatus: s.subscriptionStatus,
      trialEndsAt: s.trialEndsAt,
    ));
  }

  void _fail(
    Emitter<PaymentState> emit,
    PaymentErrorCode code,
    String message, {
    bool requiresReRegistration = false,
  }) {
    // `error_code` is always the closed `PaymentErrorCode` enum name — never
    // a raw provider message, which is unbounded and can carry payer detail.
    final tap = _lastTap;
    final snapshot = _lastMandate;
    final nowIso = DateTime.now().toUtc().toIso8601String();
    final amountRupees = tap == null
        ? snapshot?.amountPaise != null
            ? snapshot!.amountPaise ~/ 100
            : null
        : (snapshot == null ? null : _amountRupees(tap, snapshot));
    final upiType = _upiTypeFromPackage(tap?.upiPackageName);
    final triggerModule = tap?.triggerModule;
    final triggerAction = tap?.triggerAction;
    final entrySource = tap?.entrySource;

    if (_lastMandateWasTrial) {
      // Frontend Payment Events — `trial_failed`. Fires only when the
      // failing intent was against a trial mandate. Direct-paid failures
      // have no new-schema equivalent and stay on `payment_result` below.
      _track(PaywallEvents.trialFailed, {
        PaywallEventProps.type: PaywallEventProps.typeTrial,
        PaywallEventProps.index: 0,
        PaywallEventProps.planId: snapshot?.planId ?? tap?.planId,
        PaywallEventProps.amount: amountRupees,
        PaywallEventProps.currency: snapshot?.currency ?? tap?.currency,
        PaywallEventProps.paymentMethod:
            PaywallEventProps.paymentMethodUpiAutopay,
        PaywallEventProps.upiType: upiType,
        // paymentId is set only when the failure came AFTER a Razorpay
        // approval callback (rare — usually failures happen before). orderId
        // was seeded from the snapshot at createMandate time and stays set
        // for the whole attempt.
        PaywallEventProps.paymentId: _lastRazorpayPaymentId,
        PaywallEventProps.orderId: _lastRazorpayOrderId,
        PaywallEventProps.mandateId: snapshot?.mandateId,
        PaywallEventProps.failureCode: code.name,
        PaywallEventProps.failureReason: null, // omit user-facing copy
        PaywallEventProps.attemptNumber: _attemptNumber,
        PaywallEventProps.triggerModule: triggerModule,
        PaywallEventProps.triggerAction: triggerAction,
        PaywallEventProps.entrySource: entrySource,
      });
    } else {
      // Residual `payment_result(failure)` — direct-paid failures have no
      // equivalent in the new schema, so the kept-old event carries this
      // signal. Same shape it had pre-migration + `trigger_module`.
      _track(PaywallEvents.paymentResult, {
        PaywallEventProps.result: PaywallEventProps.resultFailure,
        PaywallEventProps.paymentProvider: _provider,
        PaywallEventProps.planId: tap?.planId,
        PaywallEventProps.amount: tap?.displayPrice,
        PaywallEventProps.currency: tap?.currency,
        PaywallEventProps.orderId: _lastRazorpayOrderId,
        PaywallEventProps.mandateId: snapshot?.mandateId,
        PaywallEventProps.errorCode: code.name,
        PaywallEventProps.triggerModule: triggerModule,
        PaywallEventProps.triggerAction: triggerAction,
        PaywallEventProps.entrySource: entrySource,
      });
    }

    // Consolidated `payment(failed)` — one row per terminal state, both
    // trial and subscription failures land here.
    _track(PaywallEvents.payment, {
      PaywallEventProps.type: _lastMandateWasTrial
          ? PaywallEventProps.typeTrial
          : PaywallEventProps.typeSubscription,
      PaywallEventProps.index: _lastMandateWasTrial ? 0 : null,
      PaywallEventProps.amount: amountRupees,
      PaywallEventProps.currency: snapshot?.currency ?? tap?.currency,
      PaywallEventProps.planId: snapshot?.planId ?? tap?.planId,
      PaywallEventProps.paymentStatus: PaywallEventProps.paymentStatusFailed,
      PaywallEventProps.paymentMethod:
          PaywallEventProps.paymentMethodUpiAutopay,
      PaywallEventProps.paymentId: _lastRazorpayPaymentId,
      PaywallEventProps.orderId: _lastRazorpayOrderId,
      PaywallEventProps.mandateId: snapshot?.mandateId,
      PaywallEventProps.paymentDate: nowIso,
      PaywallEventProps.isFirstPayment: null, // backend TODO
      PaywallEventProps.triggerModule: triggerModule,
      PaywallEventProps.triggerAction: triggerAction,
      PaywallEventProps.entrySource: entrySource,
    });

    emit(PaymentFailed(
      code: code,
      message: message,
      canRetry: true,
      requiresReRegistration: requiresReRegistration,
    ));
  }

  /// Map a settled-but-unentitled snapshot onto a user-facing failure.
  (PaymentErrorCode, String)? _terminalFailure(MandateSnapshot s) {
    return switch (s.state) {
      MandateStateEnum.rejected => (
          PaymentErrorCode.mandateRejected,
          'The payment was declined in your UPI app.',
        ),
      MandateStateEnum.expired => (
          PaymentErrorCode.mandateExpired,
          'This payment link has expired. Please try again.',
        ),
      MandateStateEnum.revoked || MandateStateEnum.failed => (
          PaymentErrorCode.mandateRevoked,
          "Your bank couldn't complete the payment. Please set up autopay again.",
        ),
      // `pending`, `initiated`, `paused`, `active`, `completed` are all
      // non-terminal here: active/completed without entitlement means the
      // server has not finished applying it, and polling should continue.
      _ => null,
    };
  }

  String? _currentMandateId() => switch (state) {
        PaymentAwaitingApproval(:final mandateId) => mandateId,
        PaymentPolling(:final mandateId) => mandateId,
        PaymentPending(:final mandateId) => mandateId,
        _ => null,
      };

  PaymentErrorCode _classify(Object err) {
    final text = err.toString().toLowerCase();
    if (text.contains('socket') ||
        text.contains('timeout') ||
        text.contains('connection')) {
      return PaymentErrorCode.network;
    }
    return PaymentErrorCode.server;
  }

  /// Provider name for analytics, read from the mandate the server returned.
  ///
  /// This was a hardcoded `'decentro'` on the reasoning that it labels which
  /// integration the build talks to. That stopped being true once the server
  /// could run more than one gateway: which gateway a payment used is a
  /// per-user, per-mandate fact the server owns, and an existing subscriber
  /// stays on the gateway they signed with even after new registrations move
  /// elsewhere. A constant therefore mislabels every pre-switch cohort — in
  /// the one place (the funnel) where that is hardest to notice and most
  /// expensive to have wrong.
  ///
  /// Null before the first mandate comes back, which is correct: no mandate
  /// means no gateway was involved yet.
  String? get _provider => _lastMandate?.provider;

  void _track(String name, Map<String, Object?> properties) {
    // Fire-and-forget and null-safe — analytics must never block or break a
    // payment flow, and the provider is null in tests.
    //
    // TAM-160 — every payment event carries the paywall's identity
    // (`paywall_id` / `paywall_version` / `paywall_layout`) so the
    // warehouse can join a payment back to the variant that displayed the
    // plan. Read from SessionContext at emission time; caller-supplied
    // properties WIN so a call site that already set them (currently none)
    // is not overridden.
    final props = <String, Object?>{
      PaywallEventProps.paywallId: _sessionContext?.paywallId,
      PaywallEventProps.paywallVersion: _sessionContext?.paywallConfigVersion,
      PaywallEventProps.paywallLayout: _sessionContext?.paywallLayout,
      ...properties,
    };
    unawaited(_analytics?.trackEvent(
      name,
      properties: {
        for (final e in props.entries)
          if (e.value != null) e.key: e.value!,
      },
    ));
  }

  /// Standard prop set for `payment_gateway_opened` / `payment_gateway_closed`.
  /// Same identity fields as the terminal payment events so a warehouse row
  /// can be joined back to its plan / mandate / order / attribution without
  /// touching the payment(status=...) row.
  Map<String, Object?> _gatewayEventProps() {
    final tap = _lastTap;
    final snapshot = _lastMandate;
    final amountRupees = tap == null
        ? snapshot?.amountPaise != null
            ? snapshot!.amountPaise ~/ 100
            : null
        : (snapshot == null ? null : _amountRupees(tap, snapshot));
    return <String, Object?>{
      PaywallEventProps.paymentProvider: _provider,
      PaywallEventProps.paymentMethod: PaywallEventProps.paymentMethodUpiAutopay,
      PaywallEventProps.planId: snapshot?.planId ?? tap?.planId,
      PaywallEventProps.productId: tap?.selectedProductId,
      PaywallEventProps.amount: amountRupees,
      PaywallEventProps.currency: snapshot?.currency ?? tap?.currency,
      PaywallEventProps.orderId: _lastRazorpayOrderId,
      PaywallEventProps.mandateId: snapshot?.mandateId,
      PaywallEventProps.upiType: _upiTypeFromPackage(tap?.upiPackageName),
      PaywallEventProps.attemptNumber: _attemptNumber,
      PaywallEventProps.triggerModule: tap?.triggerModule,
      PaywallEventProps.triggerAction: tap?.triggerAction,
      PaywallEventProps.entrySource: tap?.entrySource,
    };
  }

  /// Fire `payment_gateway_opened` at most once per checkout attempt. Callers
  /// invoke it at the point control is handed to the gateway UI: right
  /// before `startCheckout` (Razorpay SDK) or right after `launched == true`
  /// (Decentro intent-launch). Latch resets at the top of `_onPayNowTapped`.
  void _emitGatewayOpened() {
    if (_gatewayOpenedFired) return;
    _gatewayOpenedFired = true;
    _track(PaywallEvents.paymentGatewayOpened, _gatewayEventProps());
  }

  /// Fire `payment_gateway_closed` at most once per checkout attempt, and
  /// only after a matching `_emitGatewayOpened`. Skipping the "never opened"
  /// case matters for the `authUrl == null` / `RazorpaySdkUnavailable` /
  /// mandate-API-failed branches, which fail BEFORE the gateway UI was ever
  /// presented — they should not carry a phantom close.
  void _emitGatewayClosed({required String outcome}) {
    if (_gatewayClosedFired) return;
    if (!_gatewayOpenedFired) return;
    _gatewayClosedFired = true;
    _track(PaywallEvents.paymentGatewayClosed, {
      ..._gatewayEventProps(),
      PaywallEventProps.result: outcome,
    });
  }

  /// Rupee amount for analytics. `PayNowTapped.displayPrice` is the copy
  /// the user saw on the paywall (e.g. `"₹99"`); when set, we prefer it as
  /// the numeric int. Otherwise fall back to `snapshot.amountPaise / 100`
  /// (server-authoritative). Returns null if neither is available.
  static int? _amountRupees(PayNowTapped tap, MandateSnapshot snapshot) {
    final display = tap.displayPrice;
    if (display != null) {
      final digitsOnly = display.replaceAll(RegExp(r'[^0-9]'), '');
      if (digitsOnly.isNotEmpty) return int.tryParse(digitsOnly);
    }
    return snapshot.amountPaise ~/ 100;
  }

  /// Package-id → readable UPI app name mapping. The four apps that carry
  /// >95% of the UPI installed base in India — everything else falls into
  /// `Other` so analysts can filter out long-tail noise cheaply. Null-safe:
  /// no package (system chooser) → null (dropped from the event by
  /// [_track]).
  static String? _upiTypeFromPackage(String? pkg) {
    if (pkg == null || pkg.isEmpty) return null;
    switch (pkg) {
      case 'com.phonepe.app':
        return 'PhonePe';
      case 'com.google.android.apps.nbu.paisa.user':
        return 'GPay';
      case 'net.one97.paytm':
        return 'Paytm';
      case 'in.org.npci.upiapp':
        return 'BHIM';
      default:
        return 'Other';
    }
  }

  /// Derive `billing_cycle` from the plan id string. Plans are named on the
  /// pattern `prem_monthly_99` / `prem_quarterly_299` / `prem_annual_999`
  /// today; if the pattern doesn't match, return null and let the server
  /// contract fill it in later (see the payment-events section of the
  /// user-properties backend doc).
  static String? _billingCycleFromPlanId(String planId) {
    final lower = planId.toLowerCase();
    if (lower.contains('monthly')) return 'monthly';
    if (lower.contains('quarterly')) return 'quarterly';
    if (lower.contains('annual') || lower.contains('yearly')) return 'annual';
    return null;
  }

  /// Coerce `MandateSnapshot.nextDebitDate` (currently a raw String from the
  /// server, format not guaranteed to be ISO-8601) into a canonical ISO
  /// string for analytics. Empty/malformed → null.
  static String? _parseIso(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    final parsed = DateTime.tryParse(raw);
    return parsed?.toUtc().toIso8601String();
  }
}
