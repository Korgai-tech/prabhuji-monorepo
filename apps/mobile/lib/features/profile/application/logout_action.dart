import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/auth_store.dart';
import '../../../core/entitlement.dart';
import '../../../core/firebase_token_sync.dart';
import '../../../core/session_context.dart';
import '../../../core/service_locator.dart';
import '../../../core/shared_analytics.dart';
import '../../../state/providers.dart';
import '../../chat/data/chat_counters.dart';
import '../../paywall/bloc/paywall_bloc.dart';
import '../profile_analytics.dart';

/// The 8-step logout cascade — extracted verbatim from the v1
/// `profile_menu_screen.dart:265-362` and wired to run from the destructive
/// CTA of `LogoutConfirmationDialog` in Profile v2.
///
/// **Do NOT reorder any step.** The ordering was audited (see the original
/// dartdoc below) so a logged-out user can't inherit any predecessor's
/// identity — every user-scoped surface the app writes locally is wiped in
/// the right sequence, and the JWT clear is deliberately LAST-but-one so the
/// Firebase-token DELETE still ships a valid Bearer.
///
/// The v1 doc:
///
/// > The logout path clears EVERY user-scoped surface the app writes locally
/// > so a subsequent login can't inherit stale identity:
/// >  - [SessionContext] fields (userId, selectedLanguage, subscriptionStatus,
/// >    paywallConfigVersion, hasCompletedOnboarding, entrySource)
/// >  - [EntitlementNotifier] (Riverpod live-Pro flag — reset to `false`)
/// >  - Riverpod caches of the locale ([selectedLocaleProvider])
/// >  - [SharedPreferences] paywall impression counter
/// >    ([PaywallBloc.kImpressionCountKey])
/// >  - [ChatCounters.clearIdentity] — the per-account mirrors of
/// >    `/users/me → chatConfig` (`chat_type`, `agent_id`, `kuldevta_name`)
/// >  - [AuthStore] JWT (secure storage). Clearing this cascades — the auth
/// >    stream listener in `main.dart` also fires `Analytics.reset()`, which
/// >    regenerates the Amplitude device id and wipes the identify snapshot.
///
/// Fires the Sheet-1 `logout_result` event and the legacy `user_logged_out`
/// event on completion (success OR failure). `logout_clicked` is fired at
/// the CALL SITE (the tile tap, before the confirmation dialog opens) — NOT
/// here — because it captures INTENT, not outcome.
Future<void> handleLogout(BuildContext context, WidgetRef ref) async {
  // Cache the router BEFORE any await. `context` here is typically the
  // logout-confirmation dialog's build context, which the caller pops
  // SYNCHRONOUSLY before invoking us — the pop animation then unmounts the
  // element over the next frames, so by the time our awaits below finish
  // `context.mounted` is false and any late `context.go(...)` is silently
  // dropped. That was the "first-tap Log out did nothing" bug: cascade ran
  // (JWT cleared server-side), but navigation to /phone-input never fired,
  // leaving the user on a stale profile screen. Grabbing GoRouter here —
  // while the dialog element is still mounted — decouples the navigation
  // from context lifetime.
  final router = GoRouter.of(context);
  // Snapshot the analytics handle BEFORE the AuthStore.clear() cascade so
  // `ref` reads after the widget unmounts (we navigate away below) can't
  // return null. Also snapshot the outgoing user id NOW, while identity is
  // still intact — we hand it to `trackEvent(..., asUserId: …)` when we
  // emit `logout_result` further down, so that event attributes to the
  // user who logged out even though it fires ~5 s after the identity was
  // cleared by the auth-stream listener's `reset()`.
  final analytics = ref.read(analyticsProvider);
  final outgoingUserId = analytics?.currentUserIdSync;
  // Snapshot every serviceLocator handle we need in the background chain
  // NOW, because after navigation the profile screen (and its `ref`) can
  // unmount at any moment. serviceLocator itself is a process-wide
  // singleton so its lookups are still safe post-unmount, but reading them
  // here keeps the background block Riverpod- and context-free.
  final firebaseTokenSync = serviceLocator.isRegistered<FirebaseTokenSync>()
      ? serviceLocator<FirebaseTokenSync>()
      : null;
  final authStore = serviceLocator.isRegistered<AuthStore>()
      ? serviceLocator<AuthStore>()
      : null;
  final sharedPrefs = serviceLocator.isRegistered<SharedPreferences>()
      ? serviceLocator<SharedPreferences>()
      : null;

  // 1) Wipe in-memory user identity BEFORE clearing the token so any
  // listener that observes the auth-cleared broadcast sees an already-
  // empty session.
  if (serviceLocator.isRegistered<SessionContext>()) {
    final s = serviceLocator<SessionContext>();
    s.userId = null;
    s.selectedLanguage = null;
    s.subscriptionStatus = null;
    s.paywallConfigVersion = null;
    s.hasCompletedOnboarding = false;
    s.entrySource = 'cold_start';
  }

  // 2) Reset live entitlement to `false` so the PaywallGate treats the
  // next (logged-out or freshly-logged-in) user as free until the
  // subscription status check on their session succeeds.
  ref.read(entitlementStateProvider.notifier).clear();

  // 3) Invalidate the cached Riverpod locale so any subsequent read
  // defaults to the fallback rather than the previous user's saved
  // language.
  ref.invalidate(selectedLocaleProvider);

  // 4) Legacy `user_logged_out` event — fires now while the outgoing
  // identity is still recorded. This call is `unawaited`, and
  // `trackEvent` suspends on its first `await`
  // (`_ensureFirebaseAppInstanceId`) BEFORE `_applyPersistentIdentity`
  // stamps `event.userId`. Meanwhile step 5 below sync-nulls `_userId`,
  // so when the suspended trackEvent resumes, `_applyPersistentIdentity`
  // would stamp null and the event would retro-attribute to the next
  // signed-in user. `asUserId: outgoingUserId` pre-stamps `event.userId`
  // at BaseEvent construction so the primary sink ships this attributed
  // to the user who logged out, regardless of when the suspended future
  // resumes.
  unawaited(
    analytics?.trackEvent(
      SharedAnalyticsEvents.userLoggedOut,
      asUserId: outgoingUserId,
    ),
  );

  // 5) Clear the tracker's in-memory user identity SYNCHRONOUSLY, before we
  // navigate. The auth-stream listener's `reset()` — which owns the full
  // identity clear + pre_logout drain — doesn't fire until AuthStore.clear
  // runs in the background chain below, which can be up to 5 s away
  // (FirebaseTokenSync.logout timeout). Without this pre-nav clear,
  // `phone_input_screen_viewed` fired by the phone screen mounting on the
  // next line's `router.go` would stamp `event.userId = outgoing user`
  // via `_applyPersistentIdentity`, and the pre_logout flush later ships
  // it attributed to them. With this call, `_userId` is null the moment
  // the phone screen fires its post-frame event → queues with null →
  // parks on disk via the pre_logout drain's stamped-only filter →
  // retro-attributes to the next signed-in user on their `identity_change`
  // flush. `reset()` on the auth stream is still the source of truth for
  // dedupe wipes, `_userVerified` reset, and the final flush; this call
  // only closes the pre-nav timing gap.
  analytics?.clearIdentityForNavigation();

  // 6) Navigate IMMEDIATELY. Previously we awaited the FirebaseTokenSync
  // DELETE (up to 30 s on a slow / no-network path) BEFORE navigating,
  // which left the user staring at the profile screen for 5–10 s after
  // tapping Log out. The remaining cleanup (SharedPreferences,
  // FirebaseTokenSync, AuthStore) runs in the background chain below —
  // ordering is preserved so the DELETE /firebase-tokens still ships a
  // valid Bearer.
  router.go('/phone-input');

  // 6) Background cascade. Order preserved end-to-end:
  //   a. SharedPreferences remove (best-effort, ignored on failure).
  //   b. FirebaseTokenSync.logout — MUST run BEFORE AuthStore.clear so
  //      the DELETE /firebase-tokens is Bearer-authenticated. Bounded
  //      with a 5 s timeout so a hung DELETE cannot delay AuthStore.clear
  //      long enough for a fast returning user to complete phone → OTP
  //      → new-token-write before the old token is wiped.
  //   c. AuthStore.clear — the auth-truth flip. The auth stream listener
  //      wired in `main.dart` picks up the null and fires
  //      `Analytics.reset()` (Amplitude device id regenerated + identify
  //      snapshot wiped).
  //   d. Sheet-1 `logout_result` event — fires whether the flow succeeded
  //      or failed so the funnel can see attempted-but-failed logouts.
  //      `error_code` is null on success per the sheet.
  unawaited(() async {
    String? failureCode;
    try {
      if (sharedPrefs != null) {
        try {
          await sharedPrefs.remove(PaywallBloc.kImpressionCountKey);
        } catch (_) {
          // ignore — background cleanup continues.
        }
        try {
          // The per-account mirrors of `/users/me → chatConfig`
          // (`chat_type`, `agent_id`, `kuldevta_name`). `chat_type` rides on
          // EVERY event via `AnalyticsEnricher`, so leaving it behind would
          // bucket the NEXT user on this device into the outgoing user's
          // experiment arm until their own `/users/me` lands. The lifetime
          // chat counters deliberately survive — see
          // [ChatCounters.clearIdentity].
          ChatCounters(sharedPrefs).clearIdentity();
        } catch (_) {
          // ignore — background cleanup continues.
        }
      }
      if (firebaseTokenSync != null) {
        try {
          await firebaseTokenSync.logout().timeout(
                const Duration(seconds: 5),
              );
        } on TimeoutException {
          // Server-side row may linger, but the local token is about to
          // be wiped and FCM will drop notifications on next app open.
          // Do NOT let a hung DELETE block the JWT clear below.
        }
      }
      if (authStore != null) {
        await authStore.clear();
      }
    } catch (_) {
      // Only AuthStore.clear() can meaningfully reach here (FirebaseToken-
      // Sync.logout swallows its own errors and the timeout is caught).
      // Failing to clear the JWT is the observable "logout failed" case —
      // the auth stream never flips and the app still thinks it's logged
      // in, even though the user is now on /phone-input. The next
      // successful OTP verify will overwrite the stale token.
      failureCode = 'AUTH_STORE_CLEAR_FAILED';
    }

    unawaited(
      analytics?.trackEvent(
        ProfileEvents.logoutResult,
        properties: <String, Object?>{
          ProfileEventProps.result:
              failureCode == null ? 'success' : 'failure',
          ProfileEventProps.errorCode: failureCode,
        },
        // Attribute to the user who was logged in when the tap happened.
        // By the time we get here, `clearIdentityForNavigation` above and
        // the auth-stream `reset()` have both nulled the tracker's active
        // user_id, so without this override the event would ship anonymous
        // (or retro-attribute to whoever logs in next via the null-userId
        // fallback in the identity_change flush). `asUserId` pre-stamps
        // `event.userId` on the primary sink so the event ships to the
        // outgoing user regardless. Null-safe: if we couldn't snapshot an
        // outgoing id (analytics wasn't ready), the event falls back to the
        // tracker's current userId (null here) and behaves like before.
        asUserId: outgoingUserId,
      ),
    );
  }());
}
