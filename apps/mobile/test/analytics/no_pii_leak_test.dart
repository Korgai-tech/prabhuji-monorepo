// TAM-55 — the non-negotiable safety net.
//
// Walks the full onboarding + paywall funnel by driving every bloc directly
// (no widgets) with a `_RecordingAnalytics` fake in place of the real
// analytics seam. After every bloc close, the test walks every recorded
// event's payload and asserts that none of the prohibited PII patterns from
// `screen-spec.yaml.analytics_rules.do_not_track` and PRD §9 appear in ANY
// value — regardless of key.
//
// Sanitized replacements live at the dispatch site (per-screen blocs, wired
// in Waves 1–3): raw phone → `phone_number_length` + `country_code`, raw OTP
// → `otp_digit_count_entered` + `attempt_count`, raw name →
// `name_present` + `name_length_bucket`. This suite is the automated guard
// that regressions in those blocs are caught before shipping.
//
// See `docs/ANALYTICS-ONBOARDING-PAYWALL.md` for the full contract.

import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/features/paywall/bloc/payment_bloc.dart';
import 'package:mobile/features/paywall/bloc/payment_event.dart';
import 'package:mobile/features/paywall/bloc/payment_state.dart';

import '../support/fake_payment.dart';

import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/core/analytics.dart';
import 'package:mobile/core/app_config.dart';
import 'package:mobile/core/paywall_gate.dart';
import 'package:mobile/features/audio/domain/audio_item.dart';
import 'package:mobile/features/books/application/books_tap_handler.dart';
import 'package:mobile/features/horoscope/application/horoscope_tap_handler.dart';
import 'package:mobile/features/horoscope/data/horoscope_models.dart';
import 'package:mobile/features/onboarding/bloc/onboarding_orchestrator_bloc.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';
import 'package:mobile/features/onboarding/otp/bloc/otp_bloc.dart';
import 'package:mobile/features/onboarding/otp/bloc/otp_event.dart';
import 'package:mobile/features/onboarding/otp/bloc/otp_state.dart';
import 'package:mobile/features/onboarding/phone/bloc/phone_otp_bloc.dart';
import 'package:mobile/features/onboarding/phone/bloc/phone_otp_event.dart';
import 'package:mobile/features/onboarding/phone/bloc/phone_otp_state.dart';
import 'package:mobile/features/onboarding/profile/bloc/name_language_bloc.dart';
import 'package:mobile/features/onboarding/profile/bloc/name_language_event.dart';
import 'package:mobile/features/onboarding/profile/bloc/name_language_state.dart';
import 'package:mobile/features/paywall/bloc/paywall_bloc.dart';
import 'package:mobile/features/paywall/bloc/paywall_event.dart';
import 'package:mobile/features/paywall/bloc/paywall_state.dart';
import 'package:mobile/features/ringtone/preview/bloc/ringtone_preview_audio_port.dart';
import 'package:mobile/features/ringtone/preview/bloc/ringtone_preview_bloc.dart';
import 'package:mobile/features/ringtone/preview/bloc/ringtone_preview_event.dart';
import 'package:mobile/features/ringtone/preview/bloc/ringtone_preview_state.dart';
import 'package:mobile/features/ringtone/ringtone_routes.dart';
import 'package:mobile/features/status/data/status_models.dart';
import 'package:mobile/features/status/details/bloc/status_profile_bloc.dart';
import 'package:mobile/features/status/details/bloc/status_profile_event.dart';
import 'package:mobile/features/status/details/bloc/status_profile_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/fake_auth_store.dart';
import '../support/fake_books_services.dart';
import '../support/fake_repositories.dart';
import '../support/fake_share_service.dart';
import '../support/fake_status_services.dart';

// --- Fixtures — the "worst case" PII values ----------------------------------

/// A representative 10-digit Indian mobile — anything containing this
/// substring in an event payload is a PII leak.
const String kRawPhone = '9876543210';

/// The Phase-1 stub OTP (matches the `OTP_STUB` server behavior). An event
/// payload string that equals `1234` is a raw-OTP leak; substring is too
/// noisy (latencies coincidentally contain `1234` ms).
const String kRawOtp = '1234';

/// A representative user name — the smallest realistic name so `Ram`
/// substring hits stay narrow.
const String kRawName = 'Ram';

/// Card-number-ish pattern (Visa/MC-esque 16 digits, optional group
/// separators). Anything matching this regex in a payload is a sensitive
/// payment-details leak.
final RegExp kCardRegex =
    RegExp(r'\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}');

/// UPI VPA — a plausible identifier is `name@bank`. Anything matching
/// `\w+@\w+` in a payload is treated as PII EXCEPT the placeholder
/// `otp-…@prabhuji.internal` we hand out to phone-only stub sessions (see
/// the auth service's stub email path — that's not a real payment VPA).
final RegExp kUpiRegex = RegExp(r'^[\w.+-]+@[\w.+-]+$');
const String kStubEmailPrefix = 'otp-';
const String kStubEmailDomain = '@prabhuji.internal';

// --- Recording analytics fake ------------------------------------------------

/// Captures every `trackEvent` for later assertion. Every other Analytics
/// method is caught by `noSuchMethod` so the blocs never blow up on calls
/// we don't care about (`signIn`, `identifyUser`, `reset`, …).
class _RecordingAnalytics implements Analytics {
  final List<_Tracked> events = [];

  @override
  Future<void> trackEvent(
    String name, {
    Map<String, Object?> properties = const {},
    String? asUserId,
  }) async {
    events.add(_Tracked(name, Map<String, Object?>.from(properties)));
  }

  // Explicit Future-returning overrides — `noSuchMethod` returns `null` and
  // `await null` blows up on `Future<void>` returns (see setPendingUser /
  // clearPendingUser wired into PhoneOtpBloc + OtpBloc for TAM-154).
  @override
  Future<void> setPendingUser(String userId) async {}

  @override
  Future<void> clearPendingUser() async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _Tracked {
  _Tracked(this.name, this.properties);
  final String name;
  final Map<String, Object?> properties;
}

// --- Assertion helper — the sweep -------------------------------------------

/// Walks every event's `properties` (recursively, including nested maps and
/// lists) and asserts NONE of the prohibited PII patterns appear in ANY
/// value. `context` labels the failing event so a red test points straight
/// at the bloc that regressed.
void _assertNoPii(Iterable<_Tracked> events) {
  for (final ev in events) {
    _walk(ev.properties, (String value, List<Object> path) {
      final where = '${ev.name}: ${path.join(' > ')} = "$value"';

      // Raw phone (10 digits) — substring check is safe (very unique).
      expect(
        value.contains(kRawPhone),
        isFalse,
        reason: 'Raw phone number leaked in $where',
      );

      // Raw OTP — exact match (4 digits is too short for substring).
      expect(
        value == kRawOtp,
        isFalse,
        reason: 'Raw OTP leaked in $where',
      );

      // Raw name — exact match on the trimmed value AND substring match at
      // word boundaries. The name we use ('Ram') is short enough that
      // arbitrary substring would false-positive on words like 'framework';
      // we only flag when the entire value IS the name.
      expect(
        value == kRawName,
        isFalse,
        reason: 'Raw name leaked in $where',
      );

      // Card-number pattern (payment PII).
      expect(
        kCardRegex.hasMatch(value),
        isFalse,
        reason: 'Card-number-like pattern in $where',
      );

      // UPI VPA — allow the phone-only stub email; block everything else.
      if (kUpiRegex.hasMatch(value)) {
        final isStubEmail = value.startsWith(kStubEmailPrefix) &&
            value.endsWith(kStubEmailDomain);
        expect(
          isStubEmail,
          isTrue,
          reason: 'Non-stub UPI/email VPA leaked in $where',
        );
      }
    });
  }
}

/// Walks a JSON-ish structure and calls [onString] for every string value
/// with a breadcrumb path (`['properties', 'phone_number', 0]`, …).
void _walk(
  Object? node,
  void Function(String value, List<Object> path) onString, [
  List<Object> path = const [],
]) {
  if (node is String) {
    onString(node, path);
  } else if (node is Map) {
    node.forEach((k, v) {
      _walk(v, onString, [...path, k.toString()]);
    });
  } else if (node is Iterable) {
    var i = 0;
    for (final v in node) {
      _walk(v, onString, [...path, i]);
      i++;
    }
  } else if (node != null) {
    // Numbers / bools / other primitives — stringify to catch things like
    // an `int` field carrying the phone number in disguise.
    final s = node.toString();
    onString(s, path);
  }
}

// --- Setup helpers -----------------------------------------------------------

Future<SharedPreferences> _prefs() async {
  SharedPreferences.setMockInitialValues({});
  return SharedPreferences.getInstance();
}

PaywallConfigData _buildConfig() => PaywallConfigData(
      paywallId: 'paywall-1',
      configVersion: 3,
      enabled: true,
      localeRequested: 'hi',
      localeServed: 'hi',
      fallbackUsed: false,
      fallbackFrom: null,
      missingFields: const [],
      title: 'Prabhuji VIP Membership',
      videoUrl: 'https://cdn.prabhuji.example.com/vip.mp4',
      videoThumbnailUrl: 'https://cdn.prabhuji.example.com/vip.jpg',
      videoId: 'vip-hero',
      defaultPlanId: 'plan-weekly',
      plans: [
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
      ],
      benefits: [
        PaywallBenefitDisplay(
          benefitId: 'b-1',
          localizedName: 'Daily Mandir',
          icon: 'benefit-mandir.png',
          sortOrder: 1,
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

/// Drives PhoneOtpBloc through terms + phone entry + send-OTP.
Future<void> _drivePhone(_RecordingAnalytics rec) async {
  final bloc = PhoneOtpBloc(
    authRepository: FakeAuthRepository(),
    analytics: rec,
  );
  bloc.add(const TermsToggled(true));
  bloc.add(const PhoneChanged(kRawPhone));
  bloc.add(const SendOtpRequested(kRawPhone));
  await bloc.stream.firstWhere((s) => s is PhoneOtpSendSuccess);
  await bloc.close();
}

/// Drives OtpBloc through digit entry + submit.
Future<void> _driveOtp(_RecordingAnalytics rec) async {
  final orch = OnboardingOrchestratorBloc(
    authStore: FakeAuthStore(token: null),
    usersRepository: FakeUsersRepository(result: const MeResult()),
    subscriptionRepository: FakeSubscriptionRepository(),
  );
  final bloc = OtpBloc(
    authRepository: FakeAuthRepository(),
    authStore: FakeAuthStore(),
    orchestrator: orch,
    otpSessionId: 'session-fake',
    phoneCountryCode: '+91',
    phoneNumber: kRawPhone,
    initialResendSeconds: 30,
    otpLength: 4,
    analytics: rec,
  );
  bloc.add(const DigitEntered(kRawOtp));
  bloc.add(const SubmitTapped());
  await bloc.stream.firstWhere((s) => s is OtpVerified);
  // Also exercise the change-number path so its event is captured.
  bloc.add(const ChangeNumberTapped());
  await Future<void>.delayed(Duration.zero);
  await bloc.close();
  await orch.close();
}

/// Drives NameLanguageBloc through screen-viewed + name entry + save.
Future<void> _driveNameLanguage(_RecordingAnalytics rec) async {
  final orch = OnboardingOrchestratorBloc(
    authStore: FakeAuthStore(token: null),
    usersRepository: FakeUsersRepository(result: const MeResult()),
    subscriptionRepository: FakeSubscriptionRepository(),
  );
  final users = FakeUsersRepository(
    updatedUser: MeUser(
      id: 'user-1',
      name: kRawName,
      selectedLanguage: 'hi',
      onboardingCompletedAt: DateTime.utc(2026, 7, 12),
      phoneCountryCode: '+91',
      phoneNumber: kRawPhone,
    ),
  );
  final bloc = NameLanguageBloc(
    usersRepository: users,
    languagesRepository: FakeLanguagesRepository(),
    orchestrator: orch,
    analytics: rec,
  );
  bloc.add(const ScreenViewed());
  bloc.add(const NameChanged(kRawName));
  bloc.add(const LanguageSelected('mr'));
  bloc.add(const ContinueTapped());
  await bloc.stream.firstWhere((s) => s is NameLanguageSaved);
  await bloc.close();
  await orch.close();
}

/// Drives PaywallBloc through fetch + view + plan-select + close.
Future<void> _drivePaywall(_RecordingAnalytics rec) async {
  final repo = FakePaywallRepository(config: _buildConfig());
  final bloc = PaywallBloc(
    paywallRepository: repo,
    preferences: await _prefs(),
    analytics: rec,
  );
  bloc.add(const ConfigRequested('hi'));
  await bloc.stream.firstWhere((s) => s is PaywallReady);
  bloc.add(const VideoTapped());
  bloc.add(const CloseTapped(trigger: 'user_close'));
  await Future<void>.delayed(Duration.zero);
  await bloc.close();
}

/// Drives PaymentBloc through Pay Now — includes payment-shape props
/// (currency, product id, plan id) and, critically, `order_id`, which must be
/// our mandate uuid and never a payer VPA.
Future<void> _drivePayNow(_RecordingAnalytics rec) async {
  final bloc = PaymentBloc(
    repository: FakePaymentRepository(
      onCreate: () => mandateSnapshot(isEntitled: true),
    ),
    launcher: FakeUpiLauncher(),
    analytics: rec,
  );
  bloc.add(const PayNowTapped(
    planId: 'plan-monthly',
    selectedPlanPeriod: 'month',
    selectedProductId: 'prabhuji_vip_month',
    displayPrice: '₹299/month',
    currency: 'INR',
    trialAvailable: true,
    trialDays: 3,
    paymentMethodDisplayed: 'UPI',
  ));
  await bloc.stream.firstWhere((s) => s is PaymentSucceeded);
  await bloc.close();
}

// --- TAM-77 module drivers (AC6) ---------------------------------------------
//
// The four representative module surfaces the spec names: ringtone share,
// status details-saved, books paywall, horoscope purchase. Each is driven
// through its real bloc/handler — the same code the app runs — so a regression
// at the dispatch site is what turns this red.

/// No-op audio port: the ringtone preview bloc needs one, this suite doesn't
/// care what it does.
class _SilentPort implements RingtonePreviewAudioPort {
  @override
  Future<void> play(AudioItem item) async {}
  @override
  Future<void> pause() async {}
  @override
  Future<void> resume() async {}
  @override
  Future<void> stop() async {}
}

/// Ringtone share — the whole share funnel including
/// `ringtone_share_destination_selected`, whose `share_destination` comes back
/// from the OS chooser. A chooser component name must never carry contact data.
Future<void> _driveRingtoneShare(Analytics rec) async {
  final bloc = RingtonePreviewBloc(
    repository: FakeRingtoneRepository(pro: true),
    audioPort: _SilentPort(),
    // The Android chooser reports the picked component — the realistic worst
    // case for this event's only non-id property.
    shareService: FakeShareService(),
    analytics: rec,
  )..add(const RingtonePreviewOpened(RingtonePreviewArgs(ringtoneId: 'rt1')));
  await bloc.stream.firstWhere((s) => s is RingtonePreviewReady);

  bloc.add(const RingtonePreviewShareRequested());
  await Future<void>.delayed(Duration.zero);
  await bloc.close();
}

/// Status details-saved — the sharpest PII surface in the whole app: the form
/// literally holds the user's name. TAM-168 removed the Business persona from
/// the mobile app, so only the personal save event fires; it must carry the
/// profile TYPE and flags, never the raw name.
Future<void> _driveStatusDetailsSaved(Analytics rec) async {
  final repo = FakeStatusRepository(profile: StatusProfileData.empty);
  final bloc = StatusProfileBloc(
    repository: repo,
    avatarPicker: FakeStatusAvatarPicker(),
    analytics: rec,
  )..add(const StatusProfileLoadRequested(StatusProfileType.personal));
  await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.ready);

  // Type the raw PII fixture straight into the form, then save.
  bloc.add(const StatusProfileFieldChanged(personalName: kRawName));
  bloc.add(const StatusProfileSaveRequested());
  await bloc.stream.firstWhere((s) => s.status == StatusProfileStatus.saved);
  await bloc.close();
}

/// Books paywall — `books_paywall_triggered` / `books_paywall_viewed` plus the
/// post-purchase continuation.
Future<void> _driveBooksPaywall(Analytics rec) async {
  var pro = false;
  final handler = BooksTapHandler(
    isPro: () => pro,
    refreshEntitlement: () async => pro = true, // the purchase goes through
    openPaywall: () async {},
    openContents: (_) async {},
    openScripture: (_) async {},
    analytics: rec,
  );
  await handler.handleTap(
    book: fakeBookCard('major-1', title: 'Valmiki Ramayan'),
    sourceListType: 'carousel',
  );
}

/// Horoscope sign selection — the sole horoscope-owned event on the tap path
/// (`horoscope_sign_selected`, Sheet 1 row 103). The paywall + purchase funnel
/// belongs to the Paywall module (rows 17–26), NOT this handler, so this
/// driver just exercises the intent moment and ensures no PII rides along.
Future<void> _driveHoroscopePurchase(Analytics rec) async {
  var pro = false;
  final handler = HoroscopeTapHandler(
    gate: PaywallGate(isPro: () => pro, refreshEntitlement: () async {}),
    locale: 'hi',
    analytics: rec,
    openPaywall: () async => pro = true, // the purchase completes
    openResult: (_) async {},
  );
  await handler.handleTap(const HoroscopeZodiacSign(
    zodiacId: 'taurus',
    displayName: 'Taurus',
    sortOrder: 1,
  ));
}

// --- The suite ---------------------------------------------------------------

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    // TAM-124: the ringtone share flow builds a URL via `buildShareUrl`,
    // which requires `AppConfig.instance` to be initialized. Seed a fake so
    // the share_plus path in `_driveRingtoneShare` doesn't blow up before
    // it reaches the analytics assertions.
    AppConfig.debugSetInstance(
      AppConfig.forTest(shareHost: 'https://share.test.invalid'),
    );
  });

  group('TAM-55 — no PII leak in analytics payloads', () {
    late _RecordingAnalytics rec;

    setUp(() {
      rec = _RecordingAnalytics();
    });

    test('phone flow — raw phone never appears in any tracked event',
        () async {
      await _drivePhone(rec);
      expect(rec.events, isNotEmpty,
          reason: 'phone flow should have fired at least one event');
      _assertNoPii(rec.events);
    });

    test('OTP flow — raw OTP never appears in any tracked event', () async {
      await _driveOtp(rec);
      expect(rec.events, isNotEmpty,
          reason: 'OTP flow should have fired at least one event');
      // Independent guard on top of the sweep: the OTP flow's payload
      // must carry `otp_digit_count_entered` INSTEAD of the raw value.
      // Post-analytics-contract row 12: event name is now `otp_submitted`.
      final submitted =
          rec.events.firstWhere((e) => e.name == 'otp_submitted');
      expect(submitted.properties['otp_digit_count_entered'], kRawOtp.length);
      expect(submitted.properties.containsKey('otp_value'), isFalse);
      _assertNoPii(rec.events);
    });

    test('name+language flow — raw name never appears in any tracked event',
        () async {
      await _driveNameLanguage(rec);
      expect(rec.events, isNotEmpty,
          reason: 'name+language flow should have fired events');
      // Bucketed replacements are what we expect to see instead of the raw
      // name. Post-analytics-contract row 16: the save-result event is
      // `onboarding_profile_save_result` and it carries `name_present` +
      // `language_code`.
      final saved = rec.events
          .firstWhere((e) => e.name == 'onboarding_profile_save_result');
      expect(saved.properties['name_present'], isTrue);
      expect(saved.properties.containsKey('raw_user_name'), isFalse);
      expect(saved.properties.containsKey('name'), isFalse);
      _assertNoPii(rec.events);
    });

    test('paywall + payment flow — no card/UPI/plaintext PII', () async {
      await _drivePaywall(rec);
      await _drivePayNow(rec);
      expect(rec.events, isNotEmpty);
      // Payment events must carry `payment_provider` and never a raw
      // instrument (card number, UPI VPA of the user, etc). The provider
      // rides `payment_started` (Sheet 1 row 19) — `pay_now_clicked` (row 18)
      // deliberately doesn't carry it (the provider is only committed to
      // once the mandate is registered server-side).
      final payStarted =
          rec.events.firstWhere((e) => e.name == 'payment_started');
      expect(payStarted.properties['payment_provider'], isNotNull);
      _assertNoPii(rec.events);
    });

    test('full funnel end-to-end sweep — every dispatch site is clean',
        () async {
      await _drivePhone(rec);
      await _driveOtp(rec);
      await _driveNameLanguage(rec);
      await _drivePaywall(rec);
      await _drivePayNow(rec);

      // Sanity: we expect roughly the full contract to have fired. Not
      // exhaustive — the funnel goes through every §9 required event that
      // has a per-screen dispatch site. This asserts a floor, not a shape.
      // Floor lowered from 15 → 10 after the analytics-contract rollout
      // deleted the orphan events that used to bulk this count up; the
      // funnel now emits ~14 events (Sheet-1 canonical only).
      expect(rec.events.length, greaterThan(10),
          reason: 'full funnel should emit >10 events');

      _assertNoPii(rec.events);

      // Broad sweep: assert no property key is one of the explicit
      // `do_not_track` names from `screen-spec.yaml.analytics_rules`.
      const banned = {
        'raw_phone_number',
        'otp_value',
        'raw_user_name',
        'sensitive_payment_details',
        // Common footguns that could sneak in from a copy-paste:
        'phone_number',
        'otp',
        'name',
        'card_number',
      };
      for (final ev in rec.events) {
        for (final key in ev.properties.keys) {
          expect(
            banned.contains(key),
            isFalse,
            reason: 'Banned property key "$key" in event ${ev.name}',
          );
        }
      }
    });
  });

  // --- TAM-77 AC6 — the same policy across the 8 feature modules -------------

  group('TAM-77 — no PII leak in module analytics payloads', () {
    late _RecordingAnalytics rec;

    setUp(() {
      rec = _RecordingAnalytics();
    });

    test('ringtone share — destination is an app id, never contact data',
        () async {
      await _driveRingtoneShare(rec);
      expect(rec.events, isNotEmpty);

      // The share funnel must have reached the outcome event; if the
      // ShareService seam ever stops reporting an outcome this goes red.
      // Post-analytics-contract row 122: the outcome event is
      // `ringtone_share_result` (the old `..._destination_selected` was
      // an orphan and deleted). `destination_app` carries the picked
      // component id (an installed app, not a person).
      final dest = rec.events
          .firstWhere((e) => e.name == 'ringtone_share_result');
      // An installed-app id, never contact data.
      expect(dest.properties.containsKey('recipient'), isFalse);
      expect(dest.properties.containsKey('contact'), isFalse);
      _assertNoPii(rec.events);
    });

    test('status details-saved — the personal name value never rides along',
        () async {
      await _driveStatusDetailsSaved(rec);
      expect(rec.events, isNotEmpty);

      // TAM-168 — the mobile Business persona is retired; only
      // `status_personal_details_save_result` fires now.
      final saved = rec.events.firstWhere(
          (e) => e.name == 'status_personal_details_save_result');
      // The PRD-safe shape: never the typed-in value. Presence itself moved
      // to the global `has_name` / `has_photo` pair, so the per-event
      // `*_present` flags must be gone from this payload.
      expect(saved.properties.containsKey('name_present'), isFalse);
      expect(saved.properties.containsKey('avatar_present'), isFalse);
      expect(saved.properties.containsKey('personal_name'), isFalse);
      expect(saved.properties.containsKey('name'), isFalse);
      // The strongest statement: the raw fixture was typed INTO this form,
      // so if it reaches a payload the sweep below catches it.
      _assertNoPii(rec.events);
    });

    // NOTE: the `books paywall — premium events carry ids only` test used to
    // live here. Books analytics was deleted entirely (rollout Setup #3 —
    // Sheet 1 has zero Books events), so `books_paywall_triggered` no longer
    // fires and the assertion was an orphan. Kept as a comment so a future
    // Books tracking re-add knows exactly where the PII-sweep row goes.

    test('horoscope sign selected — no payment instrument, no user identity',
        () async {
      await _driveHoroscopePurchase(rec);
      expect(rec.events, isNotEmpty);

      // Sheet row 103 — `horoscope_sign_selected` carries the zodiac id +
      // grid position + IST date. The paywall/purchase events belong to the
      // Paywall module (rows 17–26); the horoscope handler never emits them.
      final selected =
          rec.events.firstWhere((e) => e.name == 'horoscope_sign_selected');
      expect(selected.properties['zodiac_sign'], isNotNull);
      expect(selected.properties.containsKey('sensitive_payment_details'),
          isFalse);
      expect(selected.properties.containsKey('card_number'), isFalse);
      _assertNoPii(rec.events);
    });

    test('module sweep — every module dispatch site is clean', () async {
      await _driveRingtoneShare(rec);
      await _driveStatusDetailsSaved(rec);
      await _driveBooksPaywall(rec); // no-op after Books analytics deletion
      await _driveHoroscopePurchase(rec);

      // Floor lowered from 10 → 5 after the analytics-contract rollout
      // deleted Books analytics entirely (Setup #3) and collapsed the
      // status/ringtone share funnels — the four module flows now emit
      // ~8 events between them.
      expect(rec.events.length, greaterThan(5),
          reason: 'the module flows should emit >5 events between them');
      _assertNoPii(rec.events);

      // Same banned-key list as the TAM-55 sweep — the policy is one policy,
      // not a per-module reinvention.
      const banned = {
        'raw_phone_number',
        'otp_value',
        'raw_user_name',
        'sensitive_payment_details',
        'phone_number',
        'otp',
        'name',
        'card_number',
        // Module-specific footguns: the Status overlay's whole purpose is the
        // user's own name/business, so these are the plausible copy-paste slip.
        'business_name',
        'personal_name',
        'business_mobile',
        'avatar_url',
      };
      for (final ev in rec.events) {
        for (final key in ev.properties.keys) {
          expect(
            banned.contains(key),
            isFalse,
            reason: 'Banned property key "$key" in event ${ev.name}',
          );
        }
      }
    });
  });
}
