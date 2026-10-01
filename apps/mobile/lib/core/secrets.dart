import 'dart:convert';

import 'package:flutter/foundation.dart' show debugPrint, kDebugMode;
import 'package:flutter/services.dart' show rootBundle;
import 'package:meta/meta.dart' show visibleForTesting;

/// App secrets loaded from the gitignored `env/prabhujiSecrets.json` at cold
/// start — the ONE place SDK API keys / tokens that shouldn't live in git
/// history are read from. Loaded once via [initialize]; every consumer reads
/// [instance] synchronously afterward.
///
/// Same load pattern as [AppConfig] but pointed at the gitignored sibling
/// file (see `.gitignore`: `env/prabhujiSecrets.json`). A committed template
/// with placeholder values (`env/prabhujiSecrets.example.json`) can document
/// the expected keys for a new dev; for now we ship the placeholder file
/// itself with `REPLACE_ME_*` values so a dev clone runs without crashing —
/// each consumer gates on [isRealSecret] before using the value.
///
/// **Not per-env.** One file for the whole app, regardless of
/// `--dart-define=ENV`. If prod/staging ever need different keys, split into
/// per-env files here and pick by [AppConfig.instance.environment].
///
/// **CI note.** Release builds need this file present on disk before
/// `flutter build appbundle --release` — otherwise `rootBundle.loadString`
/// throws and every consumer degrades to null (Amplitude-only for analytics,
/// no Meta events, etc.). Simplest: store the whole file as one CI secret,
/// write it out in the pre-build step.
class Secrets {
  Secrets._({
    required this.metaAppId,
    required this.metaClientToken,
    required this.supportWhatsAppNumber,
    required this.supportWhatsAppMessage,
    required this.clarityProjectId,
    required this.amplitudeApiKey,
    required this.analyticsTenantId,
    required this.tenantId,
    required this.referralAppId,
  });

  /// Meta / Facebook App Events — App ID from the Facebook Developer Console.
  /// Null when the secrets file is missing; placeholder string when the file
  /// still ships defaults — check via [metaEnabled] before using.
  final String? metaAppId;

  /// Meta / Facebook App Events — Client Token (paired with [metaAppId] to
  /// enable server-to-server event ingestion).
  final String? metaClientToken;

  /// Support WhatsApp deep-link — E.164 number **with** the `+` (e.g.
  /// `+911234567890`). Consumed by `wa.me/<digits-without-plus>` at the call
  /// site. Nullable + gated via [supportWhatsAppEnabled] so a dev clone
  /// without the secrets file (or a placeholder-only file) still boots.
  final String? supportWhatsAppNumber;

  /// Support WhatsApp deep-link — the pre-filled greeting text that lands in
  /// WhatsApp's input as soon as the OS handoff completes. `Uri.encodeComponent`d
  /// at the call site so `&`, `#`, `?` can't break the URL.
  final String? supportWhatsAppMessage;

  /// Microsoft Clarity project id (TAM-127) — public identifier from
  /// clarity.microsoft.com → Settings → Setup. Nullable + gated via
  /// [clarityEnabled] so a dev clone without the secrets file (or a
  /// placeholder-only file) still boots — [ClarityService.initialize]
  /// early-returns when the gate is false.
  final String? clarityProjectId;

  /// Original Amplitude Flutter SDK API key. The cloud sink runs alongside
  /// the in-repo tracker + Firebase + Meta — every `Analytics.trackEvent`
  /// also POSTs to api.amplitude.com when this holds a real value. Nullable
  /// + gated via [amplitudeCloudEnabled]; a dev clone / placeholder file
  /// simply skips the cloud sink.
  final String? amplitudeApiKey;

  /// Tenant identifier sent as the `x-tenant-id` HTTP header on every
  /// analytics batch POSTed by the in-repo tracker. Read by the collector
  /// (multi-tenant deployments) to route the events to the right warehouse.
  /// Sourced from Secrets rather than [AppConfig] because the value is per
  /// tenant, not per env, and shouldn't sit in git history. Nullable + gated
  /// via [analyticsTenantIdEnabled] — when absent, the header is simply
  /// omitted (single-tenant collectors ignore it either way).
  final String? analyticsTenantId;

  /// Tenant identifier sent as the `x-tenant-id` HTTP header on referral
  /// service requests (`POST /referral/v1/save`). Same tenant value across
  /// envs, so held here rather than per-env config. Nullable + gated via
  /// [tenantIdEnabled] — the referral sync service skips the POST when this
  /// isn't a real value.
  final String? tenantId;

  /// Referral vendor's app identifier — sent as the `x-app-id` HTTP header
  /// on `POST /referral/v1/save`. Vendor-issued alongside [tenantId] and
  /// invariant across envs, so held in secrets rather than per-env config.
  /// The referral sync already gates on [tenantIdEnabled]; a real tenantId
  /// with a placeholder appId will send `''` for the header — the backend
  /// treats that as "unknown app" but does not reject the request.
  final String? referralAppId;

  /// `true` when both Meta secrets are real values (not null, not placeholder).
  /// Consumers should short-circuit their init if this is false.
  bool get metaEnabled => isRealSecret(metaAppId) && isRealSecret(metaClientToken);

  /// `true` when BOTH support secrets hold real values (not null, not empty,
  /// not `REPLACE_ME_*`). The Support screen's Chat on WhatsApp CTA gates on
  /// this: enabled → real launch + `support_whatsapp_clicked` analytics;
  /// disabled → grey/dimmed button + "Support is currently unavailable" toast
  /// and NO analytics fire. See TAM-N-support-screen AC.
  bool get supportWhatsAppEnabled =>
      isRealSecret(supportWhatsAppNumber) &&
      isRealSecret(supportWhatsAppMessage);

  /// `true` when [clarityProjectId] holds a real value (not null / empty /
  /// `REPLACE_ME_*`). [ClarityService.initialize] short-circuits when
  /// this is false — the app boots and every seam call is a silent no-op.
  bool get clarityEnabled => isRealSecret(clarityProjectId);

  /// `true` when [amplitudeApiKey] holds a real value (not null / empty /
  /// `REPLACE_ME_*`). `main.dart` only constructs the cloud Amplitude
  /// instance when this is true; the fan-out in `Analytics` guards on the
  /// null field regardless, so a placeholder build produces zero cloud
  /// traffic.
  bool get amplitudeCloudEnabled => isRealSecret(amplitudeApiKey);

  /// `true` when [analyticsTenantId] holds a real value. The tracker attaches
  /// the `x-tenant-id` header only when this is true; a placeholder file
  /// simply omits the header (single-tenant collectors ignore it).
  bool get analyticsTenantIdEnabled => isRealSecret(analyticsTenantId);

  /// `true` when [tenantId] holds a real value. The referral sync service
  /// no-ops when this is false — the `x-tenant-id` header cannot be omitted
  /// (the referral backend requires it), so a placeholder skips the whole POST.
  bool get tenantIdEnabled => isRealSecret(tenantId);

  /// Whether a secret slot holds a real value or a checked-in placeholder.
  /// Placeholder convention: `REPLACE_ME_*`. Empty / null → also not real.
  static bool isRealSecret(String? value) {
    if (value == null || value.isEmpty) return false;
    return !value.startsWith('REPLACE_ME_');
  }

  static Secrets? _instance;

  /// The loaded secrets. Throws until [initialize] has completed — call
  /// [initialize] at the top of `main()`, alongside `AppConfig.initialize()`.
  static Secrets get instance {
    final loaded = _instance;
    if (loaded == null) {
      throw StateError(
        'Secrets.instance read before Secrets.initialize() completed. '
        'Ensure `await Secrets.initialize()` runs at the top of main() '
        'before any consumer (Analytics.init, etc.).',
      );
    }
    return loaded;
  }

  /// Read `env/prabhujiSecrets.json` (bundled asset) and populate the
  /// singleton. Missing / malformed file → an empty Secrets object (every
  /// field null), so consumers degrade cleanly. This is expected in tests
  /// and in any dev clone that hasn't populated the file yet.
  static Future<void> initialize() async {
    const path = 'env/prabhujiSecrets.json';
    try {
      final raw = await rootBundle.loadString(path);
      final Map<String, dynamic> json = jsonDecode(raw) as Map<String, dynamic>;
      _instance = Secrets._(
        metaAppId: _nullable(json, 'metaAppId'),
        metaClientToken: _nullable(json, 'metaClientToken'),
        supportWhatsAppNumber: _nullable(json, 'supportWhatsAppNumber'),
        supportWhatsAppMessage: _nullable(json, 'supportWhatsAppMessage'),
        clarityProjectId: _nullable(json, 'clarityProjectId'),
        amplitudeApiKey: _nullable(json, 'amplitudeApiKey'),
        analyticsTenantId: _nullable(json, 'analyticsTenantId'),
        tenantId: _nullable(json, 'tenantId'),
        referralAppId: _nullable(json, 'referralAppId'),
      );
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[secrets] $path not loaded ($e) — all secrets are null.');
      }
      _instance = Secrets._(
        metaAppId: null,
        metaClientToken: null,
        supportWhatsAppNumber: null,
        supportWhatsAppMessage: null,
        clarityProjectId: null,
        amplitudeApiKey: null,
        analyticsTenantId: null,
        tenantId: null,
        referralAppId: null,
      );
    }
  }

  /// Test seam — construct a Secrets with arbitrary field values without
  /// touching `rootBundle`. Widget tests use this via [debugSetInstance] to
  /// exercise every truth-table state (both real / both null / placeholders /
  /// mixed) without a per-test asset file.
  @visibleForTesting
  static Secrets forTest({
    String? metaAppId,
    String? metaClientToken,
    String? supportWhatsAppNumber,
    String? supportWhatsAppMessage,
    String? clarityProjectId,
    String? amplitudeApiKey,
    String? analyticsTenantId,
    String? tenantId,
    String? referralAppId,
  }) {
    return Secrets._(
      metaAppId: metaAppId,
      metaClientToken: metaClientToken,
      supportWhatsAppNumber: supportWhatsAppNumber,
      supportWhatsAppMessage: supportWhatsAppMessage,
      clarityProjectId: clarityProjectId,
      amplitudeApiKey: amplitudeApiKey,
      analyticsTenantId: analyticsTenantId,
      tenantId: tenantId,
      referralAppId: referralAppId,
    );
  }

  /// Test seam: swap in a stub Secrets so widget tests / integration tests
  /// don't need to bundle the real asset. Reset with [debugSetInstance(null)].
  static void debugSetInstance(Secrets? secrets) {
    _instance = secrets;
  }

  static String? _nullable(Map<String, dynamic> json, String key) {
    final value = json[key];
    if (value is String) return value;
    return null;
  }
}
