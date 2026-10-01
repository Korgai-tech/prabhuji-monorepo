// Named constructor parameters are kept explicit (not `this._field` initializing
// formals) so the public API reads `sessionContext:`, `appVersion:` etc. — the
// private field names would leak as parameter labels otherwise.
// ignore_for_file: prefer_initializing_formals

import 'dart:io' show Platform;

import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'session_context.dart';
import 'uuid.dart';

/// Builds the shared "common attributes" bag that rides on every analytics
/// event (Sheet 2 of the analytics contract).
///
/// Owned by `Analytics` — every `trackEvent(...)` call folds `[enrich]` into
/// the caller's map. Caller-supplied keys always win; the enricher is the
/// default surface, never a clobber.
///
/// **Scope — device/session/app + `user_id` only.** Per the "we don't send
/// user properties in each event" directive, this enricher no longer emits
/// mutable user-state fields on every event. Specifically:
///
///  * `user_id` — INCLUDED. Stamped on every event so warehouse queries can
///    filter/group without joining to the identify stream. Read from
///    [SessionContext] so a login mid-session propagates on the next event.
///  * `selected_language`, `subscription_status` — DROPPED from event props.
///    Live on the identify stream ([UserPropertiesTracker]); the warehouse
///    joins events to the user snapshot for these.
///  * `entry_source` — DROPPED. Sheet 2 says "Flow entry events" only, so
///    it's a per-call property at flow-entry sites (e.g. `home_page_viewed`),
///    not a common one.
///
/// What DOES ride on every event:
///
///  * Per-event stamps (in [Analytics.trackEvent], not here):
///    `event_id`, `event_timestamp`.
///  * Static facts (resolved once in [init] and cached):
///    `app_version`, `build_number`, `platform`, `os_version`, `device_model`,
///    `device_locale`, `session_id`, `anonymous_id`.
///  * `user_id` — read live from [SessionContext] on every call.
///  * `chat_type` — read live from [_chatTypeReader] on every call
///    (TAM-167). Experiment-arm dimension sourced from
///    `/users/me → chatConfig.chatType`, mirrored to `ChatCounters` by
///    `UsersRepository.getMe` on every successful fetch, so any surface can
///    be split by arm from its first event — NOT only after the user has
///    opened the chat screen, which is where the mirror used to live and
///    which a disabled-chat arm can never reach.
///
///    ALWAYS PRESENT, but EMPTY (`''`) until the store has a value. Two
///    rules, and the empty string is the only value that satisfies both:
///    the key must ride on every event so a consumer can rely on it being
///    there, and an unknown arm must never be reported as a real one. It
///    used to fall back to `'control'` — a REAL cohort — which silently
///    filed every pre-`/users/me` event under an arm the user may not be
///    in, indistinguishable from genuine control users. `''` says "we
///    haven't been told yet" and is trivially excluded from an arm split
///    (`WHERE chat_type != ''`).
///  * `has_name` / `has_photo` — read live from [_hasNameReader] /
///    [_hasPhotoReader] on every call. Whether the user has a display name
///    and an avatar saved on their `/status/profile` record, mirrored to
///    `StatusProfileFlagsStore` by the status repository on every fetch and
///    save. These are GLOBAL by deliberate choice: the pair used to be
///    passed by hand on a handful of Status events, which made the share
///    funnel segmentable but left every other surface blind to whether the
///    user had set their profile up. Always a real boolean — never null,
///    never absent — with `false` as the "nothing we know of is saved"
///    default (see [StatusProfileFlagsStore.hasName]).
///
///    These two are the ONLY name/photo-presence properties in the app's
///    Status + Profile surface. The per-call `name_present` /
///    `avatar_present` / `existing_details_present` / `has_existing_details`
///    properties they replaced were removed outright, so there is exactly
///    one key per fact. (Onboarding's `name_present` survives because it
///    reports a DIFFERENT record — the account name on `PATCH /users/me`,
///    not the `/status/profile` display name these read.)
///
/// The other `SessionContext` fields (`selectedLanguage`, `subscriptionStatus`,
/// `entrySource`) are still live in the app (paywall gate, locale
/// interceptor, deep-link tracking read them), just not folded here.
class AnalyticsEnricher {
  AnalyticsEnricher({
    required SessionContext sessionContext,
    required String anonymousId,
    required String appVersion,
    required String buildNumber,
    required String platform,
    required String osVersion,
    required String deviceModel,
    required String deviceLocale,
    String? sessionId,
    String? Function()? chatTypeReader,
    bool Function()? hasNameReader,
    bool Function()? hasPhotoReader,
  })  : _sessionContext = sessionContext,
        _hasNameReader = hasNameReader,
        _hasPhotoReader = hasPhotoReader,
        _anonymousId = anonymousId,
        _appVersion = appVersion,
        _buildNumber = buildNumber,
        _platform = platform,
        _osVersion = osVersion,
        _deviceModel = deviceModel,
        _deviceLocale = deviceLocale,
        _sessionId = sessionId ?? newUuidV4(),
        _chatTypeReader = chatTypeReader;

  final SessionContext _sessionContext;
  final String _anonymousId;
  final String _appVersion;
  final String _buildNumber;
  final String _platform;
  final String _osVersion;
  final String _deviceModel;
  final String _deviceLocale;
  final String _sessionId;

  /// Synchronous reader for `chat_type` — invoked on every [enrich] call
  /// so a `/users/me` that lands mid-session (or flips the cohort)
  /// propagates on the next event without needing to rebuild the enricher.
  /// A `null` / missing / empty return becomes [kChatTypeUnknown] rather
  /// than a cohort label (see the class dartdoc). Null when the enricher was
  /// constructed without a reader (tests, or a boot path where
  /// `ChatCounters` isn't wired yet) — same outcome.
  final String? Function()? _chatTypeReader;

  /// Wire key for the experiment-arm dimension, and the sentinel it carries
  /// before `/users/me` has named an arm. Named constants because both halves
  /// are contract: the key is on EVERY event, and [kChatTypeUnknown] is the
  /// one value that is never a real cohort.
  static const String kChatTypeKey = 'chat_type';
  static const String kChatTypeUnknown = '';

  /// Synchronous readers for the two global profile-presence flags, backed by
  /// `StatusProfileFlagsStore`. Invoked on every [enrich] call so a profile
  /// saved mid-session propagates on the very next event without rebuilding
  /// the enricher — the same live-read contract [_chatTypeReader] has.
  ///
  /// Null when the enricher was constructed without them (widget tests, or a
  /// boot path where SharedPreferences wasn't resolved). A missing reader —
  /// or one that throws — collapses to `false` rather than dropping the key,
  /// so the property is present on every event unconditionally.
  final bool Function()? _hasNameReader;
  final bool Function()? _hasPhotoReader;

  /// Wire keys for the global profile-presence pair. Named constants because
  /// these are now referenced from outside this file (the no-PII test asserts
  /// the pair rides on every event) — the older inline literals below predate
  /// that need.
  static const String kHasNameKey = 'has_name';
  static const String kHasPhotoKey = 'has_photo';

  /// SharedPreferences key for the persisted anonymous id — reused across
  /// launches on the same install (uninstall wipes it).
  static const String kAnonymousIdKey = 'anonymous_id';

  /// Async constructor — resolves PackageInfo + DeviceInfo + persistent
  /// anonymous id + platform + locale. `preferences` is passed in so we don't
  /// hit the platform channel again from init (main.dart already awaits it).
  static Future<AnalyticsEnricher> init({
    required SessionContext sessionContext,
    required SharedPreferences preferences,
    String? Function()? chatTypeReader,
    bool Function()? hasNameReader,
    bool Function()? hasPhotoReader,
  }) async {
    final anonymousId = await _resolveAnonymousId(preferences);
    // PackageInfo / DeviceInfoPlugin throw `MissingPluginException` under
    // `flutter test` when the platform channel is stubbed — the enricher must
    // never break the app, so every failure degrades to empty strings.
    String appVersion = '';
    String buildNumber = '';
    try {
      final info = await PackageInfo.fromPlatform();
      appVersion = info.version;
      buildNumber = info.buildNumber;
    } catch (_) {/* left empty */}
    final (osVersion, deviceModel) = await _resolveDeviceInfo();
    return AnalyticsEnricher(
      sessionContext: sessionContext,
      anonymousId: anonymousId,
      appVersion: appVersion,
      buildNumber: buildNumber,
      platform: _detectPlatform(),
      osVersion: osVersion,
      deviceModel: deviceModel,
      deviceLocale: _detectDeviceLocale(),
      chatTypeReader: chatTypeReader,
      hasNameReader: hasNameReader,
      hasPhotoReader: hasPhotoReader,
    );
  }

  /// The merged common-attributes map — device/session/app + `user_id`.
  /// See the class dartdoc for what deliberately is NOT here (mutable user
  /// state flows through the identify stream, per-call flags flow through
  /// call sites).
  Map<String, Object?> enrich() {
    return <String, Object?>{
      'user_id': _sessionContext.userId,
      'anonymous_id': _anonymousId,
      'session_id': _sessionId,
      'app_version': _appVersion,
      'build_number': _buildNumber,
      'platform': _platform,
      'os_version': _osVersion,
      'device_model': _deviceModel,
      'device_locale': _deviceLocale,
      kChatTypeKey: _resolveChatType(),
      kHasNameKey: _resolveFlag(_hasNameReader),
      kHasPhotoKey: _resolveFlag(_hasPhotoReader),
    };
  }

  /// Read one profile-presence flag defensively. A missing reader, or one
  /// that throws, reports `false` — tracking must never break on a store
  /// read, and an absent boolean is worse than a conservative one (it cannot
  /// be filtered in the warehouse and reads as "we forgot to stamp this").
  bool _resolveFlag(bool Function()? reader) {
    if (reader == null) return false;
    try {
      return reader();
    } catch (_) {
      return false;
    }
  }

  /// The stored arm, or [kChatTypeUnknown] when we don't have one. Never
  /// throws and never returns null: a broken reader must not break tracking,
  /// and "we couldn't read it" is the same statement as "we haven't been told
  /// yet" — both report empty rather than guess at a cohort.
  String _resolveChatType() {
    final reader = _chatTypeReader;
    if (reader == null) return kChatTypeUnknown;
    try {
      final value = reader();
      if (value == null || value.isEmpty) return kChatTypeUnknown;
      return value;
    } catch (_) {
      return kChatTypeUnknown;
    }
  }

  // Testing surface — the PII grep test peeks at the session id to assert
  // it doesn't collide with the raw phone / raw OTP fixtures.
  String get debugSessionId => _sessionId;
  String get debugAnonymousId => _anonymousId;

  // --- helpers ---------------------------------------------------------------

  static Future<String> _resolveAnonymousId(SharedPreferences prefs) async {
    final existing = prefs.getString(kAnonymousIdKey);
    if (existing != null && existing.isNotEmpty) return existing;
    final id = newUuidV4();
    try {
      await prefs.setString(kAnonymousIdKey, id);
    } catch (_) {
      // Persistence failure returns a per-session anonymous id — worst case,
      // the same install shows up as multiple anonymous users. Never fatal.
    }
    return id;
  }

  /// (osVersion, deviceModel) pair from `device_info_plus`. Both fields
  /// degrade to empty strings under `flutter test` (no platform channel) or
  /// on unsupported platforms — the collector accepts empty values.
  static Future<(String, String)> _resolveDeviceInfo() async {
    try {
      final plugin = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final info = await plugin.androidInfo;
        return (info.version.release, info.model);
      }
      if (Platform.isIOS) {
        final info = await plugin.iosInfo;
        return (info.systemVersion, info.utsname.machine);
      }
      return ('', '');
    } catch (_) {
      return ('', '');
    }
  }

  static String _detectPlatform() {
    try {
      if (Platform.isAndroid) return 'android';
      if (Platform.isIOS) return 'ios';
      return Platform.operatingSystem;
    } catch (_) {
      return '';
    }
  }

  static String _detectDeviceLocale() {
    try {
      return Platform.localeName;
    } catch (_) {
      return '';
    }
  }
}
