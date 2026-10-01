// Explicit named params — see the equivalent note on OnboardingOrchestratorBloc.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';
import 'dart:convert' show jsonEncode;

import 'package:amplitude_flutter/amplitude.dart' as realamp;
import 'package:amplitude_flutter/events/base_event.dart' as realamp;
import 'package:amplitude_flutter/events/identify.dart' as realamp;
import 'package:custom_analytics_flutter/custom_analytics_flutter.dart';
import 'package:facebook_app_events/facebook_app_events.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/foundation.dart' show debugPrint, kDebugMode;

import 'advertising_id_service.dart';
import 'analytics_enricher.dart';
import 'app_config.dart';
import 'identify_dedupe.dart';
import 'identify_snapshot_store.dart';
import 'jwt.dart';
import 'secrets.dart';
import 'uuid.dart';

/// Thin seam over BOTH analytics SDKs — the ONLY place SDK types appear.
/// Widgets depend on this class via `analyticsProvider` (null in tests / when
/// init fails: analytics never breaks the app; call sites use `?.` +
/// `unawaited`).
///
/// ## Three sinks (fan-out, not either/or)
///
/// Every `trackEvent`, `setUser`, `identifyUser`, `setWorkspace`, `reset` call
/// fires against **all three** sinks when they're wired: the custom tracker
/// AND Firebase (GA4) AND Meta (Facebook App Events). The custom tracker is
/// our primary funnel store (data ends up in ClickHouse via the `apps/events`
/// collector); Firebase gives us GA4 for marketing / retention dashboards;
/// Meta feeds attribution + audience-building on the Meta ads platform.
/// None of the sinks sees the others — a failure in any one path never
/// breaks the rest, because each forwarding call is guarded independently.
///
/// - **Custom tracker** (`custom_analytics_flutter`, in-repo at
///   `apps/mobile/custom_event_tracker/`) — Amplitude-shape façade, but the
///   transport is our own HTTP client that POSTs Amplitude V2 batches
///   straight at the collector (`apps/events`) through `serverUrl`.
///   SQLite-backed offline queue, 30-min inactivity sessions, lifecycle
///   flush on background. Every event is an explicit call (no autocapture).
/// - **Firebase Analytics SDK** — batches + retries via GMS. `_firebase` is
///   null when `Firebase.initializeApp()` hasn't run or when the platform
///   channel throws at boot (iOS without the plist, older test harnesses);
///   the whole class degrades gracefully.
/// - **Meta / Facebook App Events SDK** — buffers + flushes via the Facebook
///   native SDK. `_facebook` is null when `Secrets.instance.metaEnabled` is
///   false (placeholder keys, or no `env/prabhujiSecrets.json`). Main.dart
///   only constructs a [FacebookAppEvents] when the secret slots hold real
///   values, so a placeholder build produces zero Meta traffic.
///
/// ## Sink-normalisation
///
/// Both Firebase and Meta accept the same shape (`Map<String, Object>` with
/// nulls dropped, primitives passed through, complex values stringified +
/// clipped to 100 chars). One helper `_toSinkParams` normalises for both.
///
/// - Event names: pass through as-is (all our names fit the 40-char
///   `[A-Za-z][A-Za-z0-9_ -]*` rule shared by Firebase and Meta).
/// - Parameter values: nulls dropped, complex objects stringified, strings
///   clipped to 100 chars.
/// - User property values (Firebase only — Meta uses a fixed 6-field
///   [FacebookAppEvents.setUserData] surface): stringified + clipped to 36
///   chars (Firebase limit). Property NAMES longer than 24 chars would
///   silently drop on the Firebase side; we log a debug warning if we
///   encounter one.
///
/// Usage guide (when to call what, scoping rules, naming conventions):
/// docs/ANALYTICS-FLUTTER-GUIDE.md. Wire contract:
/// docs/ANALYTICS-EVENT-CONTRACT.md.
class Analytics {
  Analytics(
    this._amplitude, {
    IdentifyDeduper? deduper,
    this._snapshotStore,
    AnalyticsEnricher? enricher,
    FirebaseAnalytics? firebase,
    FacebookAppEvents? facebook,
    realamp.Amplitude? realAmplitude,
    String? firebaseAppInstanceId,
    AdvertisingIdService? advertisingIdService,
  })  : _deduper = deduper ?? IdentifyDeduper(),
        _enricher = enricher,
        _firebase = firebase,
        _facebook = facebook,
        _realAmplitude = realAmplitude,
        _firebaseAppInstanceId = firebaseAppInstanceId,
        _advertisingIdService = advertisingIdService;

  /// Sends ONE event straight to the collector without an [Analytics]
  /// instance — for the FCM background isolate, where the app never booted
  /// (`AppConfig` + `Secrets` must already be initialised there).
  ///
  /// Primary warehouse sink only: Firebase / Meta / Amplitude cloud need their
  /// SDKs up and are skipped. [properties] are sent as given (the caller
  /// supplies whatever enrichment it can compute). [time] becomes the
  /// top-level Amplitude `time`. Throws on failure so the caller can keep the
  /// event for a later retry.
  static Future<void> sendDirect(
    String name, {
    required Map<String, Object?> properties,
    required DateTime time,
  }) {
    final config = AppConfig.instance;
    final tenantId = Secrets.instance.analyticsTenantIdEnabled
        ? Secrets.instance.analyticsTenantId
        : null;
    final sender = DirectEventSender(CustomConfiguration(
      apiKey: config.eventsApiKey,
      tenantId: tenantId,
      serverUrl: '${config.eventsUrl}/2/httpapi',
      logLevel: kDebugMode ? LogLevel.info : LogLevel.warn,
    ));
    return sender.send(BaseEvent(
      name,
      eventProperties: properties,
      timestamp: time.millisecondsSinceEpoch,
    ));
  }

  final Amplitude _amplitude;
  final IdentifyDeduper _deduper;
  final IdentifySnapshotStore? _snapshotStore;
  final AnalyticsEnricher? _enricher;

  /// Second sink for every event / identity call. Null when Firebase isn't
  /// initialized or the platform channel is unavailable (widget tests, iOS
  /// without GoogleService-Info.plist). Every forwarding call guards on this.
  final FirebaseAnalytics? _firebase;

  /// Third sink — Meta / Facebook App Events. Null when
  /// `Secrets.instance.metaEnabled` is false (placeholder keys, missing
  /// secrets file). Main.dart only constructs a [FacebookAppEvents] when
  /// the App ID + Client Token slots hold real values, so a placeholder
  /// build produces zero Meta traffic. Every forwarding call guards on this.
  final FacebookAppEvents? _facebook;

  /// Fourth sink — the ORIGINAL Amplitude Flutter SDK (cloud). Null when
  /// `Secrets.instance.amplitudeCloudEnabled` is false (placeholder /
  /// missing `amplitudeApiKey`) or when the SDK construction throws at
  /// boot. Main.dart only constructs a [realamp.Amplitude] when the key
  /// is real, so a placeholder build produces zero cloud traffic. Every
  /// forwarding call guards on this.
  ///
  /// Prefixed as `realamp` because `custom_analytics_flutter` (the primary
  /// sink) is a fork and exports the exact same class names — `Amplitude`,
  /// `Identify`, `BaseEvent`, `EventOptions`. The prefix keeps the two
  /// namespaces disjoint at every call site.
  final realamp.Amplitude? _realAmplitude;

  /// Firebase's install-scoped pseudonymous id (`app_instance_id`, GA4's
  /// "pseudo user id"). Fetched once in [init] and re-fetched after
  /// [reset]/`resetAnalyticsData` since Firebase rotates it on reset. Sent
  /// as `pseudo_id` at the top of every custom-tracker payload via
  /// `EventOptions(pseudoUserId: …)`, so warehouse rows in ClickHouse can be
  /// joined back to GA4's user identity. Null when Firebase isn't wired or
  /// the platform channel throws.
  ///
  /// Kept out of the "final" block deliberately: [reset] rotates it, and
  /// [_ensureFirebaseAppInstanceId] self-heals a null cache on the next event
  /// (see rationale there).
  String? _firebaseAppInstanceId;

  /// Coalesces concurrent lazy fetches so N in-flight [trackEvent] /
  /// [identifyUser] / [setWorkspace] calls issue exactly ONE Firebase
  /// platform call when the cache is null. Cleared once the fetch settles —
  /// a subsequent event finding the cache still null will start a new
  /// attempt (self-healing).
  Future<String?>? _appInstanceIdFetch;

  /// Google Advertising ID (Android) / IDFA (iOS) source. Resolved once in
  /// [init] and cached in [AdvertisingIdService]; every [trackEvent] reads
  /// [AdvertisingIdService.current] synchronously and stamps the value on
  /// `BaseEvent.adid` (top-level Amplitude `adid` field on the wire). Null
  /// when the platform doesn't expose one (limit-ad-tracking on, ATT
  /// denied on iOS, no Play Services, tests / when init failed) — the
  /// wire field is simply omitted in that case.
  final AdvertisingIdService? _advertisingIdService;

  /// Flips to true the moment [signIn] successfully attaches a JWT-derived
  /// identity. Used by [clearPendingUser] to distinguish a real logged-in
  /// user (do NOT clear) from a "pending" identity attached by [setPendingUser]
  /// between `POST /auth/otp/send` and OTP verify (safe to clear if the user
  /// abandons the flow). Reset to false in [reset].
  ///
  /// Deliberately in-memory — a killed app starts fresh, so a pending id that
  /// was persisted by the underlying SDK from a previous unverified attempt
  /// looks "unverified" to this instance on the next cold start, which is
  /// exactly what lets `main.dart`'s cold-start [clearPendingUser] wipe it.
  bool _userVerified = false;

  static Future<Analytics> init({
    AnalyticsEnricher? enricher,
    FirebaseAnalytics? firebase,
    FacebookAppEvents? facebook,
    realamp.Amplitude? realAmplitude,
    AdvertisingIdService? advertisingIdService,
  }) async {
    final config = AppConfig.instance;
    // Our in-repo tracker: same Amplitude façade, but the transport is an
    // HTTP client that POSTs Amplitude V2 batches straight at the collector.
    // There's no autocapture in this SDK — every event is an explicit call —
    // so no `AutocaptureDisabled()` toggle is needed. Sessions default on
    // (matches the krutyug behaviour we copied); LogLevel.info keeps the
    // flush lifecycle visible in debug builds.
    // Tenant id rides on every batch as the `x-tenant-id` header so multi-
    // tenant collectors can route to the right warehouse. Sourced from
    // Secrets (per-tenant value, not per-env, must not sit in git) — a
    // placeholder / missing file leaves it null and the tracker omits the
    // header (single-tenant collectors ignore it either way).
    final tenantId = Secrets.instance.analyticsTenantIdEnabled
        ? Secrets.instance.analyticsTenantId
        : null;
    final amplitude = Amplitude(CustomConfiguration(
      apiKey: config.eventsApiKey,
      tenantId: tenantId,
      serverUrl: '${config.eventsUrl}/2/httpapi',
      logLevel: kDebugMode ? LogLevel.info : LogLevel.warn,
    ));
    await amplitude.isBuilt;
    final store = IdentifySnapshotStore();
    IdentifyDeduper? restored;
    try {
      restored = IdentifyDeduper.restore(await store.read());
    } catch (_) {
      restored = null; // storage failure → un-deduped sends, never a broken init
    }
    // Firebase's install-scoped pseudo id (GA4 `app_instance_id`). Fetched
    // once here and threaded onto every custom-tracker event as `pseudo_id`.
    // The platform channel can throw before Firebase's native side is fully
    // up (older Android GMS, test harnesses without a plist); a failure just
    // means the field is absent on the wire — never a broken init.
    String? firebaseAppInstanceId;
    if (firebase != null) {
      try {
        firebaseAppInstanceId = await firebase.appInstanceId;
      } catch (e) {
        if (kDebugMode) {
          debugPrint('[analytics] firebase.appInstanceId failed: $e');
        }
      }
    }
    // Warm the advertising-id cache once here so every subsequent trackEvent
    // reads it synchronously via `AdvertisingIdService.current`. On iOS the
    // resolve() call may show the ATT prompt on first launch (guarded to
    // once per install by the service itself). Failures fall through to
    // null; the wire field is simply omitted.
    if (advertisingIdService != null) {
      try {
        await advertisingIdService.resolve();
      } catch (e) {
        if (kDebugMode) {
          debugPrint('[analytics] advertisingId.resolve failed: $e');
        }
      }
    }
    // The ORIGINAL Amplitude cloud SDK is fully constructed by main.dart
    // (so a placeholder build never even instantiates it) — we just take
    // the handle here. Wait for `.isBuilt` if one was passed so the first
    // trackEvent lands on a ready pipeline; failure is swallowed to null
    // so a broken Amplitude init never breaks the whole analytics seam.
    realamp.Amplitude? readyRealAmplitude = realAmplitude;
    if (realAmplitude != null) {
      try {
        await realAmplitude.isBuilt;
      } catch (e) {
        if (kDebugMode) {
          debugPrint('[analytics] realAmplitude.isBuilt failed: $e');
        }
        readyRealAmplitude = null;
      }
    }
    return Analytics(
      amplitude,
      deduper: restored,
      snapshotStore: store,
      enricher: enricher,
      firebase: firebase,
      facebook: facebook,
      realAmplitude: readyRealAmplitude,
      firebaseAppInstanceId: firebaseAppInstanceId,
      advertisingIdService: advertisingIdService,
    );
  }

  // --- events -----------------------------------------------------------------

  /// The primary tracking API. `name` is the funnel dimension
  /// (`chat_room_entered`, `game_started` — snake_case, past-tense action);
  /// `properties` carries facts about THIS action only — user state belongs in
  /// [identifyUser], workspace in [setWorkspace] (see the guide).
  ///
  /// **Per-event stamps (Sheet 2 common props)** — every call gets:
  ///  * `event_id`        — fresh UUID v4, for warehouse-side dedupe. A
  ///    caller may override it via [properties] when a server-side id is
  ///    the better dedupe key (see `trial_success`).
  ///  * `event_timestamp` — ISO-8601 UTC at the moment of the call.
  /// Both stamped here (never in the enricher) because they MUST change per
  /// call — an enricher's output is cacheable-shaped and would drift.
  ///
  /// When an [AnalyticsEnricher] is wired (production), its common attributes
  /// (`user_id`, `anonymous_id`, `session_id`, `app_version`, `build_number`,
  /// `platform`, `os_version`, `device_model`, `device_locale`,
  /// `selected_language`, `subscription_status`, `entry_source`) are merged
  /// into every payload. Caller-supplied keys always win — the enricher is
  /// the default surface, never a clobber. Any exception from the enricher
  /// is swallowed so a broken enricher can never break tracking.
  ///
  /// `screen_name` / `previous_screen` (Sheet 2) are NOT enriched — pass
  /// them per call via [properties] since screen context is call-site
  /// specific, not session-wide.
  ///
  /// **`asUserId`** — optional per-event `user_id` override. When set, the
  /// event's top-level `user_id` on the primary sink is stamped with this
  /// value (bypassing `_applyPersistentIdentity`'s lookup of the tracker's
  /// current `_userId`), so a caller can attribute the event to a specific
  /// user regardless of who the tracker thinks is active. Intended narrowly
  /// for logout-tail events like `logout_result`: fired ~5 s after
  /// `handleLogout` cleared the identity (so the natural stamp would be
  /// null), but the record belongs to the user who logged out. Only affects
  /// the primary warehouse sink — Firebase / Meta / Amplitude-cloud have no
  /// per-event user override and will attribute to whoever their SDK
  /// currently thinks is set (usually null post-logout, which is fine for
  /// those surfaces). Do NOT use this to fabricate identity for regular
  /// events — [setUser] / [signIn] are the correct surface for that.
  Future<void> trackEvent(
    String name, {
    Map<String, Object?> properties = const {},
    String? asUserId,
  }) async {
    final perEvent = <String, Object?>{
      'event_id': newUuidV4(),
      'event_timestamp': DateTime.now().toUtc().toIso8601String(),
    };
    Map<String, Object?> merged = <String, Object?>{...perEvent, ...properties};
    final enricher = _enricher;
    if (enricher != null) {
      try {
        // Precedence (weakest → strongest): enricher defaults < per-event
        // stamps < caller properties. So a caller can override an enriched
        // key, and can also override a per-event stamp — `trial_success`
        // deliberately does, replacing `event_id` with the server's
        // `paymentReferenceId` so client and backend agree on one id for
        // the payment. Callers that pass neither get the UUID stamped here.
        merged = <String, Object?>{
          ...enricher.enrich(),
          ...perEvent,
          ...properties,
        };
      } catch (_) {
        merged = <String, Object?>{...perEvent, ...properties};
      }
    }
    // Local verification aid — echoes every tracked event to the debug
    // console so `flutter run --debug` shows what the SDK will attach on
    // the wire. We log the SDK's TOP-LEVEL identity (user_id/device_id)
    // because that's what the collector reads to decide ingestibility
    // (see apps/events/src/core/events/handlers/click-events.handler.ts:
    // an event with no user_id AND no device_id AND no pseudo_id is
    // silently dropped, batch still returns 200). Enricher-stamped
    // `user_id` inside event_properties does NOT count — the collector
    // only reads the top-level Amplitude field, populated by setUserId.
    // A "⚠ NO IDENTITY" line means this event WILL drop server-side.
    // No-op in release: gated on `kDebugMode` and `debugPrint` itself is
    // a no-op when the app is built with `--release`. Greppable prefix:
    // `[analytics] track`.
    final pseudoId = await _ensureFirebaseAppInstanceId();
    final adid = _advertisingIdService?.current;
    if (kDebugMode) {
      final sdkUserId = await _amplitude.getUserId();
      final sdkDeviceId = await _amplitude.getDeviceId();
      final identityWarn =
          ((sdkUserId == null || sdkUserId.isEmpty) &&
                  (sdkDeviceId == null || sdkDeviceId.isEmpty))
              ? ' ⚠ NO IDENTITY — collector will drop this event'
              : '';
      debugPrint(
        '[analytics] track "$name" '
        'sdkUserId=$sdkUserId sdkDeviceId=$sdkDeviceId '
        'pseudoId=$pseudoId adid=$adid'
        '$identityWarn props=$merged',
      );
      // Machine-parseable single-line JSON dump for the local verification
      // pass (TAM-166 bug sweep 2026-09-08). Emitted only in debug builds;
      // release strips both this and the human-readable line above. Grep
      // `adb logcat | grep EVENT_TRAP` to extract a clean event stream and
      // parse each line as JSON. Any non-JSON-encodable value (Uint8List,
      // random objects) collapses to `.toString()` via `_jsonSafe` so the
      // trap never crashes the fire itself.
      try {
        debugPrint(
          '[EVENT_TRAP] ${jsonEncode(<String, Object?>{
            'name': name,
            'props': _jsonSafe(merged),
          })}',
        );
      } catch (e) {
        debugPrint('[EVENT_TRAP] {"name":"$name","props_dump_error":"$e"}');
      }
    }
    // When [asUserId] is provided, we pre-stamp `event.userId` on the
    // BaseEvent so `_applyPersistentIdentity`'s `event.userId ??= _userId`
    // becomes a no-op (the ??= only fills when the field is null). That
    // guarantees the event ships to the warehouse attributed to the caller's
    // choice, not the tracker's current `_userId` — the exact contract we
    // need for `logout_result` (fires after identity clear, but belongs to
    // the outgoing user).
    await _amplitude.track(
      BaseEvent(name,
          eventProperties: merged, adid: adid, userId: asUserId),
      EventOptions(pseudoUserId: pseudoId),
    );
    // Firebase + Meta fan-out — each sink guarded independently so a
    // failure in one never breaks the others. Amplitude ran above; if it
    // threw, the whole trackEvent throws (analytics call sites use `?.` +
    // `unawaited` so even that never breaks the app).
    final sinkParams = _toSinkParams(merged);
    final firebase = _firebase;
    if (firebase != null) {
      try {
        await firebase.logEvent(name: name, parameters: sinkParams);
      } catch (e) {
        if (kDebugMode) debugPrint('[analytics] firebase.logEvent failed: $e');
      }
    }
    final facebook = _facebook;
    if (facebook != null) {
      try {
        await facebook.logEvent(name: name, parameters: sinkParams);
        // ignore: avoid_print
        print('[analytics] facebook.logEvent OK: name=$name params=$sinkParams');
      } catch (e) {
        // ignore: avoid_print
        print('[analytics] facebook.logEvent FAILED: name=$name error=$e');
      }
    } else {
      // ignore: avoid_print
      print('[analytics] facebook.logEvent SKIPPED (sink disabled): name=$name');
    }
    // Original Amplitude cloud SDK — forwarded independently. Uses the
    // same enriched `merged` payload the in-repo tracker got, so the
    // cloud dashboards see the same event_id / event_timestamp / common
    // props. Prefixed types keep the two Amplitude namespaces disjoint
    // (custom_analytics_flutter's classes shadow amplitude_flutter's
    // otherwise). Guarded independently; a failure here never breaks
    // the other three sinks.
    final realAmplitude = _realAmplitude;
    if (realAmplitude != null) {
      try {
        await realAmplitude.track(
          realamp.BaseEvent(name, eventProperties: merged),
        );
      } catch (e) {
        if (kDebugMode) {
          debugPrint('[analytics] realAmplitude.track failed: $e');
        }
      }
    }
  }

  /// Meta / Facebook **standard** `StartTrial` event. Fires ALONGSIDE the
  /// custom `trial_success` fan-out in [trackEvent] — the fan-out ships a
  /// custom-named Meta event, this ships Meta's standard one so Events
  /// Manager + Ads optimisation pick it up. `orderId` is required by the
  /// SDK; `price` maps to `_valueToSum` (Meta uses it for revenue rollups).
  /// No-op when the Meta sink is disabled.
  ///
  /// `currency` must be a valid ISO 4217 3-letter code — Meta silently drops
  /// events where `fb_currency` is a symbol / empty / mis-cased, so we
  /// normalise to uppercase and fall back to `INR` if it doesn't fit the
  /// pattern (the app is INR-only today; every mandate ships `"INR"` from
  /// the server).
  ///
  /// `eventId` — the server's `paymentReferenceId`, shipped as an `event_id`
  /// parameter so this standard event carries the same dedupe id as the
  /// custom `trial_success` fan-out and the backend's `bk_trial_success`.
  /// Sent via [FacebookAppEvents.logEvent] rather than `logStartTrial`,
  /// which builds its own fixed parameter map and takes no extras; the name
  /// / `_valueToSum` / `fb_currency` / `fb_order_id` shape is identical.
  /// Omitted when null, leaving the event exactly as it was before.
  Future<void> logFacebookStartTrial({
    required String orderId,
    double? price,
    String? currency,
    String? eventId,
  }) async {
    final facebook = _facebook;
    if (facebook == null) return;
    final safeCurrency = _normaliseIsoCurrency(currency);
    try {
      await facebook.logEvent(
        name: FacebookAppEvents.eventNameStartTrial,
        valueToSum: price,
        parameters: <String, dynamic>{
          FacebookAppEvents.paramNameCurrency: safeCurrency,
          FacebookAppEvents.paramNameOrderId: orderId,
          'event_id': ?eventId,
        },
      );
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[analytics] facebook StartTrial failed: $e');
      }
    }
  }

  static final RegExp _iso4217Re = RegExp(r'^[A-Z]{3}$');

  static String _normaliseIsoCurrency(String? raw) {
    final upper = raw?.trim().toUpperCase() ?? '';
    if (_iso4217Re.hasMatch(upper)) return upper;
    if (kDebugMode) {
      debugPrint(
        '[analytics] facebook StartTrial invalid currency '
        '"${raw ?? ''}" — falling back to INR',
      );
    }
    return 'INR';
  }

  /// Legacy click helper — a `trackEvent('click', …)` with `screen`/`element`
  /// as first-class dimensions. Prefer named events for anything funnel-worthy.
  Future<void> trackClick(
    String screen,
    String element, {
    Map<String, Object?> properties = const {},
  }) =>
      trackEvent('click', properties: clickProperties(screen, element, properties));

  /// Pure property builder: extra properties must not shadow screen/element.
  static Map<String, Object?> clickProperties(
    String screen,
    String element, [
    Map<String, Object?> properties = const {},
  ]) =>
      {...properties, 'screen': screen, 'element': element};

  // --- identity & user state ---------------------------------------------------

  /// Synchronous read of the tracker's current user id — the value that
  /// [_applyPersistentIdentity] would stamp on an event fired right now.
  /// Used by the logout path to snapshot the outgoing user id BEFORE
  /// [clearIdentityForNavigation] nulls it, so a follow-up
  /// [trackEvent] can pin `logout_result` to that user via `asUserId`.
  String? get currentUserIdSync => _amplitude.currentUserIdSync;

  /// Pre-navigation identity clear for `handleLogout`. Nulls the tracker's
  /// in-memory `_userId` synchronously so an event queued during the
  /// `router.go('/phone-input')` window — most importantly
  /// `phone_input_screen_viewed` fired by the phone screen's post-frame
  /// callback — stamps `event.userId=null` at
  /// [_applyPersistentIdentity] time. Those null-stamped rows then park
  /// on disk via the pre_logout drain and retro-attribute to the next
  /// signed-in user when their `identity_change` flush fires.
  ///
  /// Fire-and-forgets the secondary sinks' async `setUserId(null)` so
  /// Firebase / Meta / Amplitude-cloud stop attributing subsequent events
  /// to the outgoing user too. Failures are swallowed — this is called
  /// from a fire-and-forget logout path where a broken sink must not
  /// stall or crash the UI.
  ///
  /// Callers MUST still let the full [reset] fire on the auth-stream
  /// listener (in `main.dart`) — this method only handles the pre-nav
  /// identity gap; [reset] owns the pre_logout drain + dedupe snapshot
  /// wipe + `_userVerified` reset.
  void clearIdentityForNavigation() {
    _amplitude.clearUserIdSync();
    // Secondary sinks — best-effort, fire-and-forget. Their setUserId is
    // async by design; we don't wait for them because the caller is about
    // to navigate and must not stall.
    final firebase = _firebase;
    if (firebase != null) {
      unawaited(() async {
        try {
          await firebase.setUserId(id: null);
        } catch (e) {
          if (kDebugMode) {
            debugPrint('[analytics] firebase.setUserId(null) pre-nav failed: $e');
          }
        }
      }());
    }
    final facebook = _facebook;
    if (facebook != null) {
      unawaited(() async {
        try {
          await facebook.clearUserID();
        } catch (e) {
          if (kDebugMode) {
            debugPrint('[analytics] facebook.clearUserID pre-nav failed: $e');
          }
        }
      }());
    }
    final realAmplitude = _realAmplitude;
    if (realAmplitude != null) {
      unawaited(() async {
        try {
          await realAmplitude.setUserId(null);
        } catch (e) {
          if (kDebugMode) {
            debugPrint(
                '[analytics] realAmplitude.setUserId(null) pre-nav failed: $e');
          }
        }
      }());
    }
  }

  /// One-call identity attach for our auth flow: decodes the api JWT
  /// (`{sub: user.id, email}`) and does [setUser] + [identifyUser]($set email).
  /// Call after login AND on app start with a restored token. No-ops on a
  /// malformed token — never throws.
  Future<void> signIn(String token) async {
    final claims = decodeJwtClaims(token);
    final userId = claims?['sub'];
    if (userId is! String || userId.isEmpty) return;
    await setUser(userId);
    // A JWT-derived id is by definition verified — flip the pending flag so
    // any subsequent [clearPendingUser] (e.g. a stray change-number tap on a
    // route the user shouldn't be on) becomes a no-op instead of stripping a
    // real logged-in identity.
    _userVerified = true;
    final email = claims?['email'];
    if (email is String && email.isNotEmpty) {
      await identifyUser(set: {'email': email});
    }
  }

  /// Attach the userId returned by `POST /auth/otp/send` — a real User row
  /// exists (TAM-154 mints one on every accepted send) but the user hasn't
  /// yet proven ownership by verifying the OTP.
  ///
  /// Same fan-out as [setUser] (Amplitude + Firebase + Meta) so every event
  /// between send and verify — `otp_request_result`, `otp_screen_viewed`,
  /// `otp_entered`, `otp_submitted`, `otp_verification_result` — rides the
  /// userId at the SDK's top-level (which the collector reads to decide
  /// ingestibility; see the "⚠ NO IDENTITY" note in [trackEvent]).
  ///
  /// Stays "unverified" ([_userVerified] false) so [clearPendingUser] can
  /// wipe it if the user abandons the flow. A successful [signIn] flips the
  /// flag so the same id becomes non-clearable once the JWT lands.
  Future<void> setPendingUser(String userId) async {
    if (userId.isEmpty) return;
    await setUser(userId);
    // Intentionally do NOT set _userVerified — that only happens after signIn.
  }

  /// Undo a [setPendingUser] when the flow is abandoned: OTP screen's
  /// change-number tap, cold start with no restored JWT.
  ///
  /// No-op once [_userVerified] is true — a real logged-in identity is
  /// non-clearable through this path (use [reset] for logout).
  ///
  /// Clears user id across all three sinks but does NOT touch device id,
  /// dedupe snapshot, or Firebase installation-scoped data. A [reset] is
  /// too aggressive here — the user isn't logging out, they never logged in.
  Future<void> clearPendingUser() async {
    if (_userVerified) return;
    // Same ordering as reset(): null the pending id FIRST — and specifically
    // do the tracker's in-memory clear SYNC (before any await below) so an
    // event racing with the change-number tap can't queue with the old
    // pending id via `_applyPersistentIdentity`. Rows already stamped with
    // the outgoing pending id ship via pre_clear_pending; racing events
    // stamp null and stay parked for the next `identity_change` to
    // retro-attribute.
    _amplitude.clearUserIdSync();
    _deduper.clear();
    try {
      await _snapshotStore?.clear();
    } catch (_) {/* dedupe snapshot on disk is best-effort */}
    try {
      await _amplitude.setUserId(null);
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[analytics] amplitude.setUserId(null) failed: $e');
      }
    }
    final firebase = _firebase;
    if (firebase != null) {
      try {
        await firebase.setUserId(id: null);
      } catch (e) {
        if (kDebugMode) {
          debugPrint('[analytics] firebase.setUserId(null) failed: $e');
        }
      }
    }
    final facebook = _facebook;
    if (facebook != null) {
      try {
        await facebook.clearUserID();
      } catch (e) {
        if (kDebugMode) {
          debugPrint('[analytics] facebook.clearUserID failed: $e');
        }
      }
    }
    final realAmplitude = _realAmplitude;
    if (realAmplitude != null) {
      try {
        await realAmplitude.setUserId(null);
      } catch (e) {
        if (kDebugMode) {
          debugPrint(
            '[analytics] realAmplitude.setUserId(null) on clearPending failed: $e',
          );
        }
      }
    }
    // Drain rows already stamped with the outgoing pending user_id
    // (otp_request_result, otp_screen_viewed, otp_entered, etc.) so they
    // ship attributed to that pending id. Rows queued during this window
    // stay on disk for the next identity_change flush. 3s cap; failure
    // is an accepted risk.
    try {
      await _amplitude
          .flush(reason: 'pre_clear_pending')
          .timeout(const Duration(seconds: 3));
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[analytics] pre_clear_pending flush skipped: $e');
      }
    }
  }

  /// Attach the logged-in user's id to every subsequent event (and to the
  /// `$identify` stream keying the warehouse's persons store). Must be ≥5
  /// chars (the collector's min-id rule) — shorter ids leave events anonymous.
  Future<void> setUser(String userId) async {
    _deduper.bindUser(userId);
    await _amplitude.setUserId(userId);
    final firebase = _firebase;
    if (firebase != null) {
      try {
        await firebase.setUserId(id: userId);
      } catch (e) {
        if (kDebugMode) debugPrint('[analytics] firebase.setUserId failed: $e');
      }
    }
    final facebook = _facebook;
    if (facebook != null) {
      try {
        await facebook.setUserID(userId);
        // ignore: avoid_print
        print('[analytics] facebook.setUserID OK: userId=$userId');
      } catch (e) {
        // ignore: avoid_print
        print('[analytics] facebook.setUserID FAILED: userId=$userId error=$e');
      }
    } else {
      // ignore: avoid_print
      print('[analytics] facebook.setUserID SKIPPED (sink disabled): userId=$userId');
    }
    final realAmplitude = _realAmplitude;
    if (realAmplitude != null) {
      try {
        await realAmplitude.setUserId(userId);
      } catch (e) {
        if (kDebugMode) {
          debugPrint('[analytics] realAmplitude.setUserId failed: $e');
        }
      }
    }
  }

  /// Update the user-state snapshot ("who the user IS", not what they did):
  /// [set] = last-write-wins ($set); [setOnce] = first-write-wins ($setOnce —
  /// install attribution like source/medium). Emits a `$identify` event AND
  /// stamps the local snapshot onto subsequent events. Only $set/$setOnce
  /// (and server-side $unset/$clearAll) are resolved by the warehouse.
  ///
  /// Payloads identical to the last-sent snapshot are deduped client-side —
  /// no `$identify` is emitted (the per-launch [signIn] no-op case); the full
  /// accumulated snapshot is re-asserted after
  /// [IdentifyDeduper.defaultReassertInterval] as a safety net. Dedupe state
  /// is persisted per signed-in user and wiped by [reset].
  Future<void> identifyUser({
    Map<String, Object?> set = const {},
    Map<String, Object?> setOnce = const {},
  }) async {
    if (set.isEmpty && setOnce.isEmpty) return;
    final decision = _deduper.decide(set: set, setOnce: setOnce);
    if (!decision.send) return;
    final identify = Identify();
    decision.set.forEach(identify.set);
    decision.setOnce.forEach(identify.setOnce);
    await _amplitude.identify(
      identify,
      EventOptions(pseudoUserId: await _ensureFirebaseAppInstanceId()),
    );
    // Firebase has no set-vs-setOnce distinction — it's last-write-wins on
    // every setUserProperty call. Both maps flow through the same forward,
    // so a $setOnce that Amplitude honours as first-write-wins becomes an
    // idempotent set on Firebase (identical values → no state change on
    // its side). Because the deduper already filtered redundant sends
    // above, we don't re-echo unchanged values here either.
    final firebase = _firebase;
    if (firebase != null) {
      final forward = <String, Object?>{...decision.set, ...decision.setOnce};
      for (final entry in forward.entries) {
        if (entry.key.length > 24) {
          // Firebase silently drops property names > 24 chars. Surface it
          // in debug so a rename hides in analytics is easy to spot.
          if (kDebugMode) {
            debugPrint(
              '[analytics] firebase user property "${entry.key}" '
              'exceeds 24-char limit; will be dropped by Firebase.',
            );
          }
          continue;
        }
        try {
          await firebase.setUserProperty(
            name: entry.key,
            value: _toFirebaseUserPropertyValue(entry.value),
          );
        } catch (e) {
          if (kDebugMode) {
            debugPrint('[analytics] firebase.setUserProperty(${entry.key}) '
                'failed: $e');
          }
        }
      }
    }
    // Original Amplitude cloud SDK — same set/setOnce semantics as the
    // in-repo tracker (both are Amplitude-shape identifies). Deduper has
    // already stripped redundant keys, so this is the minimum wire payload.
    final realAmplitude = _realAmplitude;
    if (realAmplitude != null) {
      try {
        final realIdentify = realamp.Identify();
        decision.set.forEach(realIdentify.set);
        decision.setOnce.forEach(realIdentify.setOnce);
        await realAmplitude.identify(realIdentify);
      } catch (e) {
        if (kDebugMode) {
          debugPrint('[analytics] realAmplitude.identify failed: $e');
        }
      }
    }
    _deduper.recordSent(decision.set, decision.setOnce);
    _persistDedupeState();
  }

  /// Returns the cached Firebase `app_instance_id`, lazily fetching if the
  /// cache is null and Firebase is wired. Guarantees:
  ///
  ///   * Populated cache → returns immediately (zero platform overhead on
  ///     the hot path once the fetch has succeeded once).
  ///   * Firebase not wired → returns null immediately, no attempt.
  ///   * Cache null AND Firebase wired → coalesced fetch: concurrent callers
  ///     share one in-flight future via [_appInstanceIdFetch]. On success the
  ///     cache is populated and every waiter returns the new id. On failure
  ///     the cache stays null; the NEXT call will attempt a fresh fetch —
  ///     the self-healing property that closes the "null-at-init and never
  ///     recovers" gap (Firebase Installations service not ready on a
  ///     super-fresh install boot, Firebase init failure at boot).
  ///
  /// Never throws: any platform exception is swallowed and logged in debug.
  /// Analytics must never break the caller.
  Future<String?> _ensureFirebaseAppInstanceId() {
    final cached = _firebaseAppInstanceId;
    if (cached != null) return Future.value(cached);
    final firebase = _firebase;
    if (firebase == null) return Future.value(null);
    return _appInstanceIdFetch ??= () async {
      try {
        final id = await firebase.appInstanceId;
        if (id != null) _firebaseAppInstanceId = id;
        return _firebaseAppInstanceId;
      } catch (e) {
        if (kDebugMode) {
          debugPrint(
            '[analytics] firebase.appInstanceId lazy fetch failed: $e',
          );
        }
        return null;
      } finally {
        // Clear AFTER the body settles so concurrent waiters share this
        // attempt; the next event after settlement starts a fresh attempt
        // if the cache is still null.
        _appInstanceIdFetch = null;
      }
    }();
  }

  /// Fire-and-forget: a failed write only costs one redundant re-send next
  /// launch — storage problems never surface to the app.
  void _persistDedupeState() {
    final store = _snapshotStore;
    final snapshot = _deduper.serialize();
    if (store == null || snapshot == null) return;
    unawaited(() async {
      try {
        await store.write(snapshot);
      } catch (_) {/* degrade to re-send */}
    }());
  }

  /// Account scope (B2B): the workspace rides on every event as a group —
  /// never put workspace_id in event properties.
  ///
  /// Firebase has no group concept, so we mirror the workspace onto a user
  /// property (`workspace_id`) so GA4 dashboards can segment by it. Amplitude
  /// still owns the canonical grouping semantics.
  Future<void> setWorkspace(String workspaceId) async {
    await _amplitude.setGroup(
      'workspace',
      workspaceId,
      EventOptions(pseudoUserId: await _ensureFirebaseAppInstanceId()),
    );
    final firebase = _firebase;
    if (firebase != null) {
      try {
        await firebase.setUserProperty(
          name: 'workspace_id',
          value: _toFirebaseUserPropertyValue(workspaceId),
        );
      } catch (e) {
        if (kDebugMode) {
          debugPrint('[analytics] firebase.setUserProperty(workspace_id) '
              'failed: $e');
        }
      }
    }
    final realAmplitude = _realAmplitude;
    if (realAmplitude != null) {
      try {
        await realAmplitude.setGroup('workspace', workspaceId);
      } catch (e) {
        if (kDebugMode) {
          debugPrint('[analytics] realAmplitude.setGroup failed: $e');
        }
      }
    }
  }

  /// Logout: drops user id across all three sinks. **Keeps install-scoped
  /// identifiers stable** — Amplitude `device_id` and Firebase
  /// `app_instance_id` (pseudo_id) DO NOT rotate on logout, matching
  /// krutyug_flutter_app and GA4's intended usage of `app_instance_id` as
  /// the install-scoped pseudo-user identity. Rotating them here would make
  /// the same physical device count as N different anonymous users in GA4 /
  /// Amplitude after N logouts, breaking retention / cohort / attribution
  /// dashboards. Also wipes the dedupe snapshot (memory + disk) — no
  /// user-state residue for the next account.
  Future<void> reset() async {
    // Order matters. We null the tracker's active user_id FIRST, then run the
    // pre_logout flush. Any trackEvent that races with this reset — most
    // commonly `phone_input_screen_viewed` fired by the phone screen mounting
    // as the router redirects on the same auth-changes tick — hits
    // `_applyPersistentIdentity` AFTER _userId is already null, so those
    // rows are queued with `event.userId=null` and the pre_logout flush's
    // stamped-only drain leaves them on disk for the next `identity_change`
    // flush (fired when the new user's signIn/setPendingUser lands) to
    // retro-attribute to the incoming user. Rows queued BEFORE this call
    // were stamped at their queue time with the outgoing user_id and still
    // get shipped attributed to them.
    //
    // A logout must let the next unverified pending id (a fresh phone entry
    // on the same install) be clearable again — otherwise the previous
    // account's verified flag would carry over and neuter clearPendingUser.
    _userVerified = false;
    // CRITICAL: null the tracker's in-memory _userId SYNCHRONOUSLY, before
    // any await below. reset() is fire-and-forget from the auth-changes
    // listener, and the router's refresh listener runs on the same tick →
    // the phone screen mounts and its post-frame callback fires
    // `phone_input_screen_viewed` well before the async `setUserId(null)`
    // below completes. Without the sync clear, `_applyPersistentIdentity`
    // would stamp that event with the outgoing user_id, and pre_logout
    // flush would ship it attributed to them. The sync clear closes that
    // race: subsequent events queue with `event.userId=null` and get
    // parked for retro-attribution to the next user.
    _amplitude.clearUserIdSync();
    _deduper.clear();
    try {
      await _snapshotStore?.clear();
    } catch (_) {
      // Storage failure must not break logout; a stale blob is discarded on
      // a mismatching bindUser anyway.
    }
    // Amplitude: persist the null identity to the on-disk state store (the
    // in-memory null was already applied above via clearUserIdSync). Preserve
    // device_id — `_amplitude.reset()` would regenerate it via
    // `LocalStateStore.reset()` and we want install-scoped analytics identity
    // to stay stable across account switches.
    try {
      await _amplitude.setUserId(null);
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[analytics] amplitude.setUserId(null) on reset failed: $e');
      }
    }
    // Firebase: null the user id only. `resetAnalyticsData()` would rotate
    // `app_instance_id` (GA4 pseudo_id) — we skip it for the same reason as
    // Amplitude's device_id: install-scoped identity should not rotate on
    // account switches. `_firebaseAppInstanceId` stays valid.
    final firebase = _firebase;
    if (firebase != null) {
      try {
        await firebase.setUserId(id: null);
      } catch (e) {
        if (kDebugMode) debugPrint('[analytics] firebase.setUserId(null) failed: $e');
      }
    }
    // Meta: clear user id + user data (email/phone/name PII fields that
    // `setUserData` populates). Facebook's App Events SDK doesn't expose an
    // installation-scoped analytics-data reset, so device id continuity here
    // is inherent to the SDK; clearing user id + user data is the strongest
    // logout we can perform.
    final facebook = _facebook;
    if (facebook != null) {
      try {
        await facebook.clearUserID();
        // ignore: avoid_print
        print('[analytics] facebook.clearUserID OK');
      } catch (e) {
        // ignore: avoid_print
        print('[analytics] facebook.clearUserID FAILED: $e');
      }
      try {
        await facebook.clearUserData();
        // ignore: avoid_print
        print('[analytics] facebook.clearUserData OK');
      } catch (e) {
        // ignore: avoid_print
        print('[analytics] facebook.clearUserData FAILED: $e');
      }
    } else {
      // ignore: avoid_print
      print('[analytics] facebook.reset SKIPPED (sink disabled)');
    }
    // Cloud Amplitude: null the user id only. Same rationale as the
    // in-repo tracker + Firebase branches above — install-scoped
    // `device_id` should NOT rotate on account switches, so we skip
    // `_realAmplitude.reset()` (which would regenerate it).
    final realAmplitude = _realAmplitude;
    if (realAmplitude != null) {
      try {
        await realAmplitude.setUserId(null);
      } catch (e) {
        if (kDebugMode) {
          debugPrint(
            '[analytics] realAmplitude.setUserId(null) on reset failed: $e',
          );
        }
      }
    }
    // Drain rows already stamped with the outgoing user_id so they ship
    // attributed to them. Rows queued during the reset window (event.userId
    // stamped as null because _userId is already null by now) stay on disk
    // for the next `identity_change` flush to retro-attribute. 3s cap so a
    // hung network never stalls the logout UX; failure is an accepted risk.
    try {
      await _amplitude
          .flush(reason: 'pre_logout')
          .timeout(const Duration(seconds: 3));
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[analytics] pre_logout flush skipped: $e');
      }
    }
  }

  // --- Sink normalisation (Firebase + Meta) -----------------------------------

  /// Convert Amplitude-shaped event props to the stricter shape both Firebase
  /// and Meta (Facebook App Events) expect:
  ///   * `Map<String, Object?>` → `Map<String, Object>` (nulls dropped).
  ///   * Complex values stringified via `toString()`.
  ///   * String values clipped to 100 chars (per-parameter limit both SDKs
  ///     share).
  ///   * Numeric + bool values passed through as-is (both accept them).
  ///
  /// Returns `null` when the resulting map is empty — matches both SDKs'
  /// optional-parameters contract and avoids an extra empty-payload send.
  static Map<String, Object>? _toSinkParams(Map<String, Object?> props) {
    if (props.isEmpty) return null;
    final out = <String, Object>{};
    for (final entry in props.entries) {
      final value = entry.value;
      if (value == null) continue;
      if (value is String) {
        out[entry.key] = value.length > 100 ? value.substring(0, 100) : value;
      } else if (value is num) {
        out[entry.key] = value;
      } else if (value is bool) {
        // Firebase asserts every parameter is a String or a num and throws
        // on a bool — which aborted logEvent for EVERY event, since the
        // enricher stamps `has_name` / `has_photo` globally. 'true'/'false'
        // reads correctly in both the GA4 and Meta consoles. Only the
        // Firebase/Meta sinks are affected: the warehouse sink ships
        // `merged`, so ClickHouse still receives a real boolean.
        out[entry.key] = value.toString();
      } else {
        // Lists / maps / DateTimes / enums — stringify and clip.
        final s = value.toString();
        out[entry.key] = s.length > 100 ? s.substring(0, 100) : s;
      }
    }
    return out.isEmpty ? null : out;
  }

  /// Firebase user-property values are strings, max 36 chars. Convert anything
  /// to a string and clip.
  static String _toFirebaseUserPropertyValue(Object? value) {
    final s = value?.toString() ?? '';
    return s.length > 36 ? s.substring(0, 36) : s;
  }
}

/// Best-effort JSON-safe rewrite used ONLY by the debug `[EVENT_TRAP]`
/// line. Any value `jsonEncode` can't handle collapses to its
/// `.toString()`, so the trap always emits a single well-formed JSON
/// object per event and never throws.
Object? _jsonSafe(Object? v) {
  if (v == null || v is String || v is num || v is bool) return v;
  if (v is Map) {
    return v.map<String, Object?>(
      (k, val) => MapEntry(k.toString(), _jsonSafe(val)),
    );
  }
  if (v is Iterable) return v.map(_jsonSafe).toList();
  return v.toString();
}
