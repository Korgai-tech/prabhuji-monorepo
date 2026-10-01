/// Microsoft Clarity session-replay seam (TAM-127).
///
/// The ONE file allowed to import `package:clarity_flutter/...`. Every other
/// consumer (feature widgets, blocs, the navigator observer below, the
/// AppShellScaffold init call, main.dart's logout hook) MUST go through the
/// [ClarityService] singleton.
///
/// Grep invariant (enforced by convention + PR review):
///
///     grep -R "package:clarity_flutter" apps/mobile/lib \
///       --exclude=lib/core/services/clarity_service.dart
///
/// should return zero results.
///
/// Design decisions locked in the spec:
///
///   1. **Release builds ONLY.** The FIRST check inside [initialize] is
///      `if (!kReleaseMode) return;`. Debug / profile builds — every
///      developer's `flutter run`, every widget test — never touch the SDK.
///   2. **Placeholder-safe.** If `Secrets.clarityEnabled` is false (null /
///      empty / `REPLACE_ME_*`), [initialize] bails cleanly and every other
///      verb short-circuits.
///   3. **Idempotent per `userId`.** A second [initialize] call with the same
///      user is a no-op; a call with a different user re-initializes so the
///      new session is tied to the new person.
///   4. **`isPro` — not `userType`.** The spec's Pro / free split replaces the
///      skill's host / user split (`setSubscription({isPro})`).
///   5. **No PII.** The JWT `sub` id rides on `ClarityConfig.userId` (a
///      non-filterable surface); tags never carry phone / email / name.
library;

import 'package:clarity_flutter/clarity_flutter.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../app_config.dart';
import '../secrets.dart';

/// Idempotent singleton wrapping the Microsoft Clarity Flutter SDK.
///
/// Feature code calls the seam through `ClarityService()`; the actual
/// `Clarity.*` static entry points are only touched from this file. Every
/// verb is safe to call at any time — pre-init calls, empty-key builds,
/// debug/profile builds all silently no-op.
class ClarityService {
  ClarityService._();

  static ClarityService _instance = ClarityService._();

  /// The process-wide seam. Same instance for every caller.
  factory ClarityService() => _instance;

  /// Test-only reset — swaps the singleton for a fresh instance so a test
  /// group's [initialize] state doesn't bleed into the next group. Prod
  /// callers should never touch this.
  @visibleForTesting
  static void debugResetInstance() {
    _instance = ClarityService._();
  }

  bool _isInitialized = false;
  String? _initializedUserId;
  bool _autoTagsApplied = false;

  /// Whether the SDK has been booted for the current session. Read by tests.
  @visibleForTesting
  bool get isInitialized => _isInitialized;

  /// The user id the SDK was last booted for (null before init or after
  /// [reset]). Read by tests to assert idempotency + re-init on user change.
  @visibleForTesting
  String? get initializedUserId => _initializedUserId;

  /// Boot Clarity for the currently-logged-in user.
  ///
  /// Call from `AppShellScaffold.initState` inside a post-frame callback —
  /// the shell is only mounted for authenticated users, so [userId] is
  /// always the JWT `sub` of the person whose session is about to be
  /// recorded. Idempotent per [userId]; a subsequent call with the same
  /// user is a no-op, a call with a different user re-initializes.
  ///
  /// The order of the gates is deliberate:
  ///
  ///   1. `kReleaseMode` — the FIRST check. Debug / profile builds never
  ///      touch the SDK regardless of what's in `prabhujiSecrets.json`.
  ///   2. `Secrets.clarityEnabled` — placeholder / missing → disabled.
  ///   3. Idempotency — skip re-boot for the same user.
  Future<void> initialize(BuildContext context, {String? userId}) async {
    // 1. Release-mode gate. FIRST check by design — a developer's local
    //    `flutter run` (debug) and every widget test (also debug) must
    //    never see a Clarity session, even when a real project id is on
    //    the machine. Staging / preprod / prod release APKs all record.
    if (!kReleaseMode) {
      if (kDebugMode) {
        debugPrint('[Clarity] Skipped — not release mode');
      }
      return;
    }

    // 2. Secret gate. Empty / null / `REPLACE_ME_*` → Clarity disabled for
    //    this build. Not a crash: consumers keep calling into the seam and
    //    every method silently returns.
    if (!Secrets.instance.clarityEnabled) {
      debugPrint('[Clarity] Skipped — clarityProjectId is empty or placeholder');
      return;
    }

    // 3. Idempotency. Same user twice → no-op; different user → re-init
    //    (new session tagged with the new user id).
    if (_isInitialized && _initializedUserId == userId) {
      return;
    }
    if (_isInitialized && _initializedUserId != userId) {
      debugPrint(
        '[Clarity] userId changed — re-initialising for new session',
      );
      _isInitialized = false;
      _autoTagsApplied = false;
    }

    final projectId = Secrets.instance.clarityProjectId!;
    // The spec explicitly threads the JWT `sub` through
    // `ClarityConfig.userId` (see TAM-127 AC). Clarity's SDK still honours
    // it: invalid values (uppercase / long ids) are handed to
    // `setCustomUserId` internally by the SDK.
    final config = ClarityConfig(
      projectId: projectId,
      // ignore: deprecated_member_use
      userId: userId,
    );

    try {
      // Register the session-started callback BEFORE `initialize` so we
      // never miss the first fire (the SDK invokes registered callbacks
      // immediately if a session has already started, but registering
      // first is the least surprising order).
      Clarity.setOnSessionStartedCallback((sessionId) {
        debugPrint('[Clarity] Session started — id: $sessionId');
        final url = Clarity.getCurrentSessionUrl();
        if (url != null) debugPrint('[Clarity] Session URL: $url');
      });

      final started = Clarity.initialize(context, config);
      if (!started) {
        debugPrint('[Clarity] initialize returned false');
        return;
      }
      _isInitialized = true;
      _initializedUserId = userId;
      await _applyAutoTags();
    } catch (e, st) {
      // Analytics must NEVER break the app — a Clarity fault is a silent
      // downgrade, not a startup crash.
      debugPrint('[Clarity] initialize failed: $e\n$st');
    }
  }

  /// Set a session-scoped filterable dimension. Silent no-op before init /
  /// with empty inputs.
  ///
  /// Never pass PII — see the class dartdoc. Both key and value are trimmed
  /// to non-empty; the SDK enforces ≤255 chars.
  void setTag(String key, String value) {
    if (!_isInitialized) return;
    if (key.trim().isEmpty || value.trim().isEmpty) return;
    try {
      Clarity.setCustomTag(key, value);
    } catch (e) {
      debugPrint('[Clarity] setTag failed for "$key": $e');
    }
  }

  /// Prabhu Ji's analogue of the skill's `setUserType({isHost})` — the only
  /// filterable user-segment tag we care about is Pro vs free. Wired to
  /// `entitlementStateProvider` transitions from `_MobileAppState`.
  void setSubscription({required bool isPro}) {
    setTag('isPro', isPro ? 'true' : 'false');
  }

  /// Emit a named event on the Clarity timeline. Used by:
  ///
  ///   * the [ClarityNavigatorObserver] for `modal` / `bottomSheet`
  ///   * `AppShellScaffold`'s tab-switch handler for `Tab: <name>` (tabs
  ///     don't push routes, so the observer never fires on tab change)
  ///
  /// Reserved for events that make sense as timeline markers or Smart
  /// Events — not every analytics call. The `sendToClarity` fan-out on
  /// `Analytics.trackEvent` is deliberately deferred (see TAM-127 spec).
  void event(String name) {
    if (!_isInitialized) return;
    if (name.trim().isEmpty) return;
    try {
      Clarity.sendCustomEvent(name);
    } catch (e) {
      debugPrint('[Clarity] event failed for "$name": $e');
    }
  }

  /// Override the current screen name. Owned by [ClarityNavigatorObserver] —
  /// don't call from feature code (fix the `GoRoute.name:` instead).
  ///
  /// The one legitimate direct call site is [AppShellScaffold]'s tab-switch
  /// handler: tab swaps inside a `StatefulShellRoute` don't push routes, so
  /// the observer never sees them.
  void setCurrentScreen(String name) {
    if (!_isInitialized) return;
    if (name.trim().isEmpty) return;
    try {
      Clarity.setCurrentScreenName(name);
    } catch (e) {
      debugPrint('[Clarity] setCurrentScreen failed for "$name": $e');
    }
  }

  /// Wipe local state so the NEXT [initialize] call boots a fresh session
  /// for the new user. Wired to the auth-store logout branch in `main.dart`
  /// next to the existing `Analytics.reset()` call.
  ///
  /// Does NOT tear down the running SDK — that's not a supported operation
  /// on Clarity's Flutter surface, and the next login will re-boot with a
  /// fresh user id anyway.
  void reset() {
    _isInitialized = false;
    _initializedUserId = null;
    _autoTagsApplied = false;
  }

  /// Auto-tags applied inside [initialize] once per session:
  ///
  ///   * `environment` — staging / preprod / prod, from `AppConfig`.
  ///   * `appVersion`  — from `PackageInfo`.
  ///   * `platform`    — android / ios.
  ///
  /// PII-safe by construction — none of these carry user identity.
  Future<void> _applyAutoTags() async {
    if (_autoTagsApplied) return;
    _autoTagsApplied = true;

    try {
      setTag('environment', AppConfig.instance.environment);
    } catch (e) {
      debugPrint('[Clarity] environment tag skipped: $e');
    }

    try {
      final info = await PackageInfo.fromPlatform();
      if (info.version.isNotEmpty) {
        setTag('appVersion', info.version);
      }
    } catch (e) {
      debugPrint('[Clarity] appVersion tag skipped: $e');
    }

    try {
      final platform = defaultTargetPlatform == TargetPlatform.iOS
          ? 'ios'
          : (defaultTargetPlatform == TargetPlatform.android
              ? 'android'
              : defaultTargetPlatform.name.toLowerCase());
      setTag('platform', platform);
    } catch (e) {
      debugPrint('[Clarity] platform tag skipped: $e');
    }
  }
}

/// [NavigatorObserver] that pushes route names into Clarity so the session
/// replay timeline shows readable screen labels instead of
/// `MaterialPage<dynamic>`.
///
/// Mount inside the SINGLE `GoRouter.observers` list in
/// `lib/core/router.dart` alongside the existing preview-audio observer.
/// Every observer call becomes a silent no-op in debug/profile builds
/// (the seam short-circuits), so wiring the observer is free — the cost
/// only lands on release users whose session is actually being recorded.
///
/// Behaviour:
///
///   * `PageRoute` — emits `setCurrentScreenName(route.settings.name ??
///     route.runtimeType.toString())` on push / replace / pop / remove.
///     `GoRouter` sets `settings.name` from a route's `name:` attribute;
///     every `GoRoute` in `router.dart` has one so the fallback should
///     never fire.
///   * `ModalBottomSheetRoute` — emits `event('bottomSheet')`. Checked
///     BEFORE `PopupRoute` because `ModalBottomSheetRoute` extends
///     `PopupRoute` in Flutter's tree.
///   * `PopupRoute` (dialog, cupertino dialog, raw dialog) — emits
///     `event('modal')`.
class ClarityNavigatorObserver extends NavigatorObserver {
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _handle(route);
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    if (newRoute != null) _handle(newRoute);
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    // On pop, the ACTIVE screen becomes the previous route — re-tag it so
    // the timeline reflects "we're back on X" rather than "we left X".
    if (previousRoute != null) _handle(previousRoute);
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (previousRoute != null) _handle(previousRoute);
  }

  void _handle(Route<dynamic> route) {
    // ModalBottomSheetRoute IS a PopupRoute — check the more-specific type
    // first so bottom sheets get their own event label.
    if (route is ModalBottomSheetRoute) {
      ClarityService().event('bottomSheet');
      return;
    }
    if (route is PopupRoute) {
      ClarityService().event('modal');
      return;
    }
    if (route is PageRoute) {
      final name = route.settings.name ?? route.runtimeType.toString();
      ClarityService().setCurrentScreen(name);
    }
  }
}
