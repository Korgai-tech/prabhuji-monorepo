import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/core/session_context.dart';
import 'package:mobile/features/paywall/bloc/payment_bloc.dart';
import 'package:mobile/features/paywall/bloc/paywall_bloc.dart';
import 'package:mobile/features/paywall/bloc/paywall_event.dart';
import 'package:mobile/features/paywall/bloc/paywall_state.dart';
import 'package:mobile/features/paywall/data/paywall_repository.dart';
import 'package:mobile/features/paywall/presentation/paywall_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../support/fake_payment.dart';

/// Fixtures + harness helpers for the four-variant paywall tests. Kept in
/// one place so the dispatcher, layout-intent, multi-size and analytics
/// tests all share the same base config shape.

class StubPaywallRepository implements PaywallRepository {
  StubPaywallRepository(this._config);

  final PaywallConfigData _config;

  @override
  Future<PaywallConfigData> getConfig({required String locale}) async =>
      _config;
}

Future<SharedPreferences> makePrefs() async {
  SharedPreferences.setMockInitialValues({});
  return SharedPreferences.getInstance();
}

/// Build a PaywallConfigData with sensible fixture defaults + a nullable
/// `layout` (TAM-160 dispatch key). `heroMedia` defaults to empty; the
/// carousel-specific tests pass images explicitly.
PaywallConfigData buildConfig({
  String? layout,
  String paywallId = 'paywall-1',
  int configVersion = 3,
  List<PaywallHeroMediaDisplay>? heroMedia,
  List<PaywallPlanDisplay>? plans,
  List<PaywallBenefitDisplay>? benefits,
}) {
  return PaywallConfigData(
    paywallId: paywallId,
    configVersion: configVersion,
    enabled: true,
    localeRequested: 'hi',
    localeServed: 'hi',
    fallbackUsed: false,
    fallbackFrom: null,
    missingFields: const [],
    title: 'Prabhuji VIP Membership',
    layout: layout,
    heroMedia: heroMedia ?? const [],
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
            trialLabel: '3-day free trial',
            trialDays: 3,
            displayPriceText: '₹99/week',
            subscriptionDetailText: 'Auto-renews weekly',
            sortOrder: 1,
          ),
        ],
    benefits: benefits ??
        [
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
          PaywallBenefitDisplay(
            benefitId: 'b-3',
            localizedName: 'Ringtones',
            icon: 'benefit-ringtone.png',
            sortOrder: 3,
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
}

/// A repository that returns [config] and a pre-built paywall bloc, ready
/// with a [PaywallReady] state.
Future<PaywallBloc> buildReadyBloc({
  required PaywallConfigData config,
  SessionContext? sessionContext,
}) async {
  final bloc = PaywallBloc(
    paywallRepository: StubPaywallRepository(config),
    preferences: await makePrefs(),
    sessionContext: sessionContext,
  );
  bloc.add(const ConfigRequested('hi'));
  await bloc.stream
      .firstWhere((s) => s is PaywallReady || s is PaywallEmpty);
  return bloc;
}

Widget paywallHarness({
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

PaymentBloc newPaymentBloc({SessionContext? sessionContext}) {
  return PaymentBloc(
    repository: FakePaymentRepository(onCreate: mandateSnapshot),
    launcher: FakeUpiLauncher(),
    sessionContext: sessionContext,
  );
}

/// Convenience factory for `PaywallHeroMediaDisplay` fixtures. `url` is
/// non-network-hitting when we're building a widget tree in a test — every
/// `Image.network(...)` errorBuilder falls through to a placeholder, so
/// we can use any string.
class PaywallHeroMediaDisplayFake {
  const PaywallHeroMediaDisplayFake._();

  static PaywallHeroMediaDisplay image(
    String id, {
    int sortOrder = 0,
    String url = 'about:blank',
    String? thumbnailUrl,
  }) {
    return PaywallHeroMediaDisplay(
      mediaType: 'image',
      url: url,
      thumbnailUrl: thumbnailUrl,
      mediaId: id,
      sortOrder: sortOrder,
    );
  }

  /// Video-only hero row. Used by the dispatcher tests that exercise the
  /// spec §363 fallback (`layout: carousel` + heroMedia containing only
  /// videos → render `card_hero`).
  static PaywallHeroMediaDisplay video(
    String id, {
    int sortOrder = 0,
    String url = 'about:blank',
    String? thumbnailUrl,
  }) {
    return PaywallHeroMediaDisplay(
      mediaType: 'video',
      url: url,
      thumbnailUrl: thumbnailUrl,
      mediaId: id,
      sortOrder: sortOrder,
    );
  }
}

