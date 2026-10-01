import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;

/// Runtime app configuration, loaded once from `env/<ENV>.json` at cold start.
///
/// The environment is selected by `--dart-define=ENV=staging|preprod|prod`
/// (default: `staging`). The matching JSON in `apps/mobile/env/` is bundled as
/// a Flutter asset and read via `rootBundle.loadString` inside [initialize].
///
/// Callers read fields as `AppConfig.instance.apiUrl` — a drop-in replacement
/// for the previous compile-time `Env` class. Field names are preserved so the
/// call sites (`buildDio`, `Analytics.init`, `TermsRow`, `PaywallScreen`)
/// changed only the accessor prefix.
///
/// Local-dev workflow (per team decision): to point the app at
/// `pnpm nx serve api` on your laptop, edit `env/staging.json` locally. Do NOT
/// commit that edit. There is deliberately no `--dart-define=API_URL=` escape
/// hatch — the JSON is the single source of truth for URL/key values.
class AppConfig {
  AppConfig._({
    required this.environment,
    required this.apiUrl,
    required this.eventsUrl,
    required this.eventsApiKey,
    required this.privacyPolicyUrl,
    required this.termsOfServiceUrl,
    required this.refundPolicyUrl,
    required this.pricingPolicyUrl,
    required this.dataDeletionUrl,
    required this.shareHost,
    required this.playStoreUrl,
    required this.referralBaseUrl,
    required this.referralTenantKey,
  });

  /// Which JSON was loaded — `staging` / `preprod` / `prod`. Handy for debug
  /// overlays and log lines that need to state the env without threading the
  /// build flag through separately.
  final String environment;

  /// Base URL for `apps/api`. Consumed by `buildDio`.
  final String apiUrl;

  /// Base URL for `apps/events` (the Amplitude-V2 collector). Analytics.init
  /// appends `/2/httpapi` before handing it to the Amplitude SDK.
  final String eventsUrl;

  /// Shared secret the events collector validates. Ships inside the APK —
  /// treated as a per-env credential, not a true server-side secret.
  final String eventsApiKey;

  final String privacyPolicyUrl;
  final String termsOfServiceUrl;
  final String refundPolicyUrl;
  final String pricingPolicyUrl;
  final String dataDeletionUrl;

  /// Origin (scheme+host, no path, no trailing slash) that share URLs are
  /// built under — the deep-link ShareButton composes `<shareHost>/app/<type>/<id>`.
  /// Matches the domain in the Android App Links intent-filter + the
  /// `assetlinks.json` on that host.
  ///
  /// Same value across envs today (`https://krutyug.ai`); kept per-env so
  /// staging can point to a scratch domain later without a code change.
  final String shareHost;

  /// Full Play Store listing URL for `com.prabhuji.ai`. Never envelope-varies —
  /// staging/preprod builds side-load, only release ships via Play — but held
  /// per-env for symmetry with `shareHost` and so a test track can be swapped
  /// in later (e.g. `?id=com.prabhuji.ai&hl=en-IN`).
  final String playStoreUrl;

  /// Base URL for the referral service — a separate host from [apiUrl] that
  /// receives the first-launch install-referrer sync (`POST /referral/v1/save`).
  /// Placeholder (`REPLACE_ME_*`) leaves the sync as a no-op via
  /// [isRealReferralConfig] so a dev clone / un-provisioned env still boots.
  final String referralBaseUrl;

  /// Tenant-scoping value sent as the `x-tenant-key` HTTP header on referral
  /// requests. Paired with [referralBaseUrl]; both must be real for the sync
  /// to fire. Per-env because different envs may target different tenants.
  final String referralTenantKey;

  /// `true` when [referralBaseUrl] AND [referralTenantKey] hold real values
  /// (not the checked-in `REPLACE_ME_*` placeholder). The sync service gates
  /// on this — placeholder builds skip the POST silently.
  bool get isRealReferralConfig =>
      !referralBaseUrl.startsWith('REPLACE_ME_') &&
      !referralTenantKey.startsWith('REPLACE_ME_');

  static AppConfig? _instance;

  /// The loaded config. Throws [StateError] if [initialize] hasn't completed —
  /// production `main()` awaits initialize before any consumer runs.
  static AppConfig get instance {
    final loaded = _instance;
    if (loaded == null) {
      throw StateError(
        'AppConfig.instance read before AppConfig.initialize() completed. '
        'Ensure `await AppConfig.initialize()` runs before any code that '
        'reads config (buildDio, Analytics.init, TermsRow, PaywallScreen). '
        'In tests, seed a stub via AppConfig.debugSetInstance(...).',
      );
    }
    return loaded;
  }

  /// Load the JSON matching `--dart-define=ENV=<name>` and populate the
  /// singleton. Defaults to `staging` when ENV is not set, matching the
  /// prior implicit behavior of the deleted `Env` class.
  static Future<void> initialize() async {
    const envName = String.fromEnvironment('ENV', defaultValue: 'staging');
    final path = 'env/$envName.json';
    final raw = await rootBundle.loadString(path);
    final Map<String, dynamic> json = jsonDecode(raw) as Map<String, dynamic>;
    _instance = AppConfig._(
      environment: _string(json, 'environment', path),
      apiUrl: _string(json, 'apiUrl', path),
      eventsUrl: _string(json, 'eventsUrl', path),
      eventsApiKey: _string(json, 'eventsApiKey', path),
      privacyPolicyUrl: _string(json, 'privacyPolicyUrl', path),
      termsOfServiceUrl: _string(json, 'termsOfServiceUrl', path),
      refundPolicyUrl: _string(json, 'refundPolicyUrl', path),
      pricingPolicyUrl: _string(json, 'pricingPolicyUrl', path),
      dataDeletionUrl: _string(json, 'dataDeletionUrl', path),
      shareHost: _string(json, 'shareHost', path),
      playStoreUrl: _string(json, 'playStoreUrl', path),
      referralBaseUrl: _string(json, 'referralBaseUrl', path),
      referralTenantKey: _string(json, 'referralTenantKey', path),
    );
  }

  /// Test-only seam: substitute a hand-built [AppConfig] before running code
  /// that reads [instance]. Not called anywhere in production.
  @visibleForTesting
  static void debugSetInstance(AppConfig config) {
    _instance = config;
  }

  /// Test-only seam: build a config with in-line values instead of loading a
  /// bundled JSON. Every field defaults to a recognizably-fake value so a
  /// leaked URL in a test payload stands out.
  @visibleForTesting
  factory AppConfig.forTest({
    String environment = 'test',
    String apiUrl = 'https://api.test.invalid',
    String eventsUrl = 'https://events.test.invalid',
    String eventsApiKey = 'test-events-api-key',
    String privacyPolicyUrl = 'https://legal.test.invalid/privacy',
    String termsOfServiceUrl = 'https://legal.test.invalid/terms',
    String refundPolicyUrl = 'https://legal.test.invalid/refund',
    String pricingPolicyUrl = 'https://legal.test.invalid/pricing',
    String dataDeletionUrl = 'https://legal.test.invalid/data-deletion',
    String shareHost = 'https://share.test.invalid',
    String playStoreUrl = 'https://play.test.invalid/store/apps/details?id=test',
    String referralBaseUrl = 'https://referral.test.invalid',
    String referralTenantKey = 'test-referral-tenant-key',
  }) =>
      AppConfig._(
        environment: environment,
        apiUrl: apiUrl,
        eventsUrl: eventsUrl,
        eventsApiKey: eventsApiKey,
        privacyPolicyUrl: privacyPolicyUrl,
        termsOfServiceUrl: termsOfServiceUrl,
        refundPolicyUrl: refundPolicyUrl,
        pricingPolicyUrl: pricingPolicyUrl,
        dataDeletionUrl: dataDeletionUrl,
        shareHost: shareHost,
        playStoreUrl: playStoreUrl,
        referralBaseUrl: referralBaseUrl,
        referralTenantKey: referralTenantKey,
      );

  static String _string(Map<String, dynamic> json, String key, String path) {
    final value = json[key];
    if (value is! String || value.isEmpty) {
      throw StateError(
        'AppConfig: missing or non-string field "$key" in $path.',
      );
    }
    return value;
  }
}
