import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../api/generated/openapi.dart';
import '../core/analytics.dart';
import '../core/auth_store.dart';
import '../core/device_context.dart';
import '../core/dio_client.dart';
import '../core/jwt.dart';
import '../core/service_locator.dart';
import '../core/session_context.dart';
import '../core/share_service.dart';
import '../core/user_properties.dart';
import '../features/deities/data/deity_repository.dart';
import '../features/onboarding/data/users_repository.dart';
import '../features/status/share/data/story_share_launcher.dart';

/// Overridden in main() with the app-wide singleton. The default here is only
/// used in tests / harnesses that skip the main() bootstrap.
final authStoreProvider = Provider<AuthStore>((ref) => AuthStore());

/// WHO is signed in, as a value providers can `watch`.
///
/// [AuthStore.changes] is an imperative side-channel: you can only react to
/// it by subscribing. That made "this cache belongs to one user" something
/// each provider had to remember to hand-roll (see the TAM-164 note on
/// [meProvider]), and every provider that forgot silently became an
/// app-lifetime cache of the PREVIOUS user's data — user A logs out, user B
/// logs in without an app restart, and B reads A's row. This provider turns
/// the stream into a plain watchable value so the dependency is declared
/// (`ref.watch(authIdentityProvider)`) and the recompute is Riverpod's job.
///
/// The value is the JWT's `sub` claim (our api's payload is `{sub, email}`),
/// NOT the raw token: a future silent refresh mints a new token for the SAME
/// user and must not evict every user-scoped cache, while a token for a
/// DIFFERENT user must. A token we cannot decode falls back to the token
/// string itself — "unparseable" is not a reason to let B read A's cache.
///
/// `null` ⇔ logged out.
final authIdentityProvider =
    NotifierProvider<AuthIdentityNotifier, String?>(AuthIdentityNotifier.new);

/// Backing notifier for [authIdentityProvider]. Holds the app's ONE
/// subscription to [AuthStore.changes] for identity purposes — everything
/// else watches this provider instead of opening its own.
class AuthIdentityNotifier extends Notifier<String?> {
  @override
  String? build() {
    final store = ref.watch(authStoreProvider);
    final sub = store.changes.listen((token) => state = identityOf(token));
    ref.onDispose(sub.cancel);
    // `AuthStore.read()` is synchronous against the cache hydrated in
    // `main()`, so there is no loading state to model here: by the time any
    // widget can read this, the boot token (if any) is already known.
    return identityOf(store.read());
  }

  /// The stable per-user identity carried by [token]. Exposed for tests.
  @visibleForTesting
  static String? identityOf(String? token) {
    if (token == null) return null;
    final sub = decodeJwtClaims(token)?['sub'];
    return (sub is String && sub.isNotEmpty) ? sub : token;
  }
}

/// Overridden in main() once the Amplitude SDK is initialized; null in tests
/// and when init fails (analytics must never break the app).
final analyticsProvider = Provider<Analytics?>((ref) => null);

/// The Riverpod-owned Dio, wired through the same [AuthStore] as the GetIt
/// singleton. There is no `onUnauthorized` callback: the interceptor calls
/// `AuthStore.clear()` on a genuine token rejection, which broadcasts on
/// [AuthStore.changes]; router + analytics both subscribe there, so the
/// logout side-effects fan out from ONE emission.
final apiClientProvider = Provider<ApiClient>((ref) {
  final store = ref.watch(authStoreProvider);
  // Pull the same device metadata bag `main()` registered so this dio
  // stamps identical headers to the GetIt-owned one. Falls back to empty
  // in test harnesses that skip `configureLocator`.
  final device = serviceLocator.isRegistered<DeviceContext>()
      ? serviceLocator<DeviceContext>()
      : DeviceContext.empty;
  return ApiClient(buildDio(store, deviceContext: device));
});

/// The app-level selected language (ISO code — `hi`, `mr`, …), sourced from
/// [SessionContext.selectedLanguage] (written by the onboarding orchestrator
/// on cold start and by the name+language bloc on save). Used as the `locale`
/// query param on every localized endpoint. Defaults to `hi` — the onboarding
/// default and the same fallback `/paywall` uses.
///
/// Promoted here from `horoscope_providers.dart` now that Deities is the
/// second consumer; [horoscopeLocaleProvider] delegates to this one.
final selectedLocaleProvider = Provider<String>((ref) {
  final context = serviceLocator.isRegistered<SessionContext>()
      ? serviceLocator<SessionContext>()
      : null;
  final selected = context?.selectedLanguage;
  return (selected == null || selected.isEmpty) ? 'hi' : selected;
});

/// Deity catalogue repository (TAM-58). Defaults to the get_it singleton;
/// overridable in tests/widget harnesses with a `FakeDeityRepository`.
final deityRepositoryProvider = Provider<DeityRepository>(
  (ref) => serviceLocator<DeityRepository>(),
);

/// Deity list for the shared `DeityFilterRow` (TAM-58 AC-d). One fetch, shared
/// across every consuming module screen (Aarti/Mantras/Ringtone/Wallpaper/
/// Status); the widget owns presentation only, this provider owns the fetch.
///
/// The server requires `locale` on `GET /deities` — without it the request
/// 400s, breaking the filter row on every consuming screen.
final deitiesProvider = FutureProvider<List<DeityView>>(
  (ref) => ref
      .watch(deityRepositoryProvider)
      .list(locale: ref.watch(selectedLocaleProvider)),
);

/// Native-share seam (TAM-58). Riverpod → get_it; override with a
/// `FakeShareService` in tests.
final shareServiceProvider = Provider<ShareService>(
  (ref) => serviceLocator<ShareService>(),
);

/// Story/status direct-share launcher — powers the "Share to WhatsApp Status /
/// Instagram Story / …" sheet on the status card. Riverpod → get_it; override
/// with `NoopStoryShareLauncher` in tests / iOS.
final storyShareLauncherProvider = Provider<StoryShareLauncher>(
  (ref) => serviceLocator.isRegistered<StoryShareLauncher>()
      ? serviceLocator<StoryShareLauncher>()
      : const NoopStoryShareLauncher(),
);

/// User-property tracker (Sheet 3). The ONLY seam for `Analytics.identifyUser`
/// — feature widgets/blocs call `ref.read(userPropertiesTrackerProvider)
/// .onXxx(...)` at lifecycle moments and the tracker owns the setOnce-vs-set
/// split. Falls back to a tracker wrapping a null `Analytics` in tests, which
/// makes every call a safe no-op.
final userPropertiesTrackerProvider = Provider<UserPropertiesTracker>(
  (ref) => serviceLocator.isRegistered<UserPropertiesTracker>()
      ? serviceLocator<UserPropertiesTracker>()
      : UserPropertiesTracker(null),
);

/// The signed-in user's own profile (`GET /users/me`), fetched once and shared.
///
/// Reuses the existing [UsersRepository] the onboarding orchestrator already
/// calls — this adds a cache and a rebuild signal, not a second way to fetch.
///
/// Returns null rather than throwing when there is no session or the request
/// fails: consumers are cosmetic (the home avatar initial), and a spinner or an
/// error box in a header would be worse than the fallback they already render.
///
/// TAM-164 — the provider RE-EVALUATES whenever the signed-in user changes
/// (login mints a token, logout clears it). Before this, a cold-start read
/// that ran before login cached `null` forever, and the shell's chat-tab
/// visibility (which watches [MeUser.chatConfig]) never updated after the
/// user logged in. That was originally a hand-rolled
/// `AuthStore.changes.listen(...) → invalidateSelf()` inside the body; it is
/// now a plain `ref.watch(authIdentityProvider)`, which does the same job
/// declaratively and is the pattern every other user-scoped provider follows.
final meProvider = FutureProvider<MeUser?>((ref) async {
  // Identity is a DEPENDENCY, not a side-effect: a new `sub` rebuilds this
  // provider, so the cached row can never outlive the user it describes.
  final identity = ref.watch(authIdentityProvider);
  // A missing JWT is a normal pre-login state — skip the request rather than
  // fire a 401. The watch above re-runs the whole provider the moment a
  // token arrives.
  if (identity == null) return null;
  if (!serviceLocator.isRegistered<UsersRepository>()) return null;
  try {
    return (await serviceLocator<UsersRepository>().getMe()).user;
  } catch (_) {
    return null;
  }
});

final usersProvider = FutureProvider<List<PublicUser>>((ref) async {
  return ref.watch(apiClientProvider).listUsers();
});

/// Mirrors the admin's `useCreateUser`: POST /auth/register, then invalidate the
/// users list so it refetches. Throws on failure so the caller can surface it.
Future<void> createUser(
  WidgetRef ref, {
  required String email,
  required String name,
  required String password,
}) async {
  await ref.read(apiClientProvider).register(email, name, password);
  ref.invalidate(usersProvider);
}
