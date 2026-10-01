---
name: flutter-auth
description: Auth for apps/mobile — AuthStore (flutter_secure_storage-backed JWT with a hydrated in-memory cache, sync read() after AuthStore.hydrate() completes in main() before anything else touches the token), AuthStore.changes as the single event bus (router refreshListenable / analytics signIn+reset / FCM token sync / entitlement clear / deep-link pending-intent clear all subscribe — no polling, no mirrored state), JWT decode (never verify — signature is server-side; client only reads sub+email for analytics), the dio 401 handler's strict rule (clear ONLY on errorCode UNAUTHORIZED|INVALID_TOKEN AND only when a token was actually sent — a business-logic 401 must not wipe the session, and an unauthenticated request's 401 must not broadcast a phantom logout), and the strict logout order (analytics.reset → entitlement.clear → deep-link.clearPendingIntent → firebaseTokenSync.logout → THEN AuthStore.clear — every step that "needs Bearer" runs BEFORE clear). Use when wiring auth, changing the JWT payload, adding a new listener to the changes stream, or debugging "user got kicked to login on a random 401" / "a logged-out user's parked deep link vanished" / "logout leaked a server row" / "restored session doesn't pick up the token".
user-invocable: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Flutter Auth Skill

## Purpose

Give `apps/mobile` ONE source of truth for the JWT — `AuthStore` — and ONE event bus for auth transitions — `AuthStore.changes`. Everything that needs to react to login / logout / token restoration subscribes to the bus. No polling, no mirrored state, no separate callback plumbing. Every quirk here is tied to a specific bug this design was written to prevent.

## When This Skill Applies

- Wiring auth in `main()`
- Changing the JWT payload shape (adding claims, changing `sub` / `email`)
- Adding a new subscriber to `AuthStore.changes` (analytics, sync tasks, cache clears)
- Adjusting the dio 401 handler
- Changing the logout side-effect order
- Debugging "restored session isn't recognized" — token in secure storage but the app treats you as logged out
- Debugging "user got kicked to /phone-choice on a random 401 from a permission-check endpoint"
- Debugging "logout leaked a server row" — a `POST /firebase-tokens/…` succeeded but the corresponding `DELETE` failed
- Debugging "user A's cached data appears in user B's session on the same device"

## Composes With

- [flutter-networking](../flutter-networking/SKILL.md) — dio interceptor reads `AuthStore.read()` synchronously; 401 handler calls `AuthStore.clear()` on genuine auth reject
- [flutter-routing](../flutter-routing/SKILL.md) — the router's `refreshListenable` is fed by `AuthStore.changes`; auth redirect runs on every change
- [flutter-analytics](../flutter-analytics/SKILL.md) — `Analytics.signIn(token)` is called on every non-null transition; `Analytics.reset()` on every null transition
- [flutter-push-notifications](../flutter-push-notifications/SKILL.md) — `FirebaseTokenSync.syncIfAuthenticated()` on non-null; `FirebaseTokenSync.logout()` MUST run BEFORE `AuthStore.clear()` (DELETE needs Bearer)
- [flutter-deep-linking](../flutter-deep-linking/SKILL.md) — `DeepLinkService.clearPendingIntent()` runs on logout so user A's tapped share doesn't fire in user B's session
- [flutter-dependencies](../flutter-dependencies/SKILL.md) — `AuthStore` is constructed in `main()` (not in `configureLocator`) so `.hydrate()` awaits before anything else reads

## Package Baseline

```yaml
# apps/mobile/pubspec.yaml
dependencies:
  flutter_secure_storage: ^10.3.1   # encrypted key-value on iOS Keychain / Android EncryptedSharedPreferences
```

No JWT verification library. This app does NOT verify the JWT signature client-side — see the JWT decode section below.

## The Iron Rules

Every rule below has a specific past bug attached. Reading them out of context they look pedantic. In context they close a class of production incident.

### Rule 1 — Hydrate BEFORE anything else reads

`AuthStore` has an in-memory cache. `read()` returns from the cache synchronously. **`hydrate()` MUST complete before any consumer calls `read()`.** In `main()`, `hydrate` is the FIRST thing after constructing the store, well before `configureLocator` or `runApp`:

```dart
final store = AuthStore();
await store.hydrate();               // <-- must complete first
final token = store.read();          // sync, safe

// Now anything else can happen — dio, analytics, router, all read `token`
final dio = buildDio(store);
```

**Why sync `read()`:** the dio interceptor reads the token on every request. An async `await storage.read()` in `onRequest` created a race on some Android builds where a just-completed `write()` was invisible to the very next request. Sync cache + write-then-cache eliminates it.

**Why `hydrate` and not just wait for the first `read`:** cold start races between the router redirect and any consumer that pre-fetches (analytics on splash, deep-link intake). If any of them read before hydrate landed, they'd think the user was logged out. Explicit `await store.hydrate()` in `main()` closes the window.

### Rule 2 — `AuthStore.changes` is THE bus

Every subscriber lives on ONE broadcast stream. No polling, no per-consumer callback plumbing.

```dart
class AuthStore {
  final StreamController<String?> _controller = StreamController<String?>.broadcast();
  Stream<String?> get changes => _controller.stream;

  Future<void> write(String token) async {
    _token = token;
    await _storage.write(key: _key, value: token);
    _controller.add(token);          // <-- broadcast
  }

  Future<void> clear() async {
    _token = null;
    await _storage.delete(key: _key);
    _controller.add(null);           // <-- broadcast
  }
}
```

**Every non-transient auth reaction subscribes here.** In `main()`:

| Subscriber | On non-null (login/restore) | On null (logout) |
|---|---|---|
| Router `refreshListenable` | Re-runs redirect → drops user into `/home` (or their intended path) | Re-runs redirect → login-gated routes send the user to `/phone-input` (the old `/phone-choice` screen was removed) |
| Analytics | `analytics.signIn(token)` | `analytics.reset()` |
| `FirebaseTokenSync` | `syncIfAuthenticated()` | — (logout side handled separately, see Rule 5) |
| Entitlement notifier | — | `entitlementStateProvider.notifier.clear()` |
| `DeepLinkService` | — | `clearPendingIntent()` |

**A `null` broadcast is a logout to every subscriber — including when the store was already empty.** `clear()` broadcasts unconditionally, so calling it while logged out fires every "on logout" reaction anyway: analytics reset, entitlement clear, and `clearPendingIntent()`, which erases a deep link a logged-out user just tapped. Never call `clear()` on a path a logged-out user can reach without a real session to end (Rule 4 is where this went wrong).

**A non-null broadcast means "a token exists", not "onboarding is done".** The token is written at OTP-verify — the *start* of onboarding (name entry and the paywall can still follow). Reactions that need a finished onboarding must not hang off this bus; the deep-link replay learned this the hard way and now fires when the router lands on `/home` (see [flutter-deep-linking](../flutter-deep-linking/SKILL.md)).

**Non-transient means the reaction should fire on EVERY login and EVERY logout for the process's lifetime.** Ad-hoc one-shot reactions (e.g., "on THIS login, do X once") belong at the call site that caused the login (`login_bloc.on(SubmitOtp)`), not on the bus.

### Rule 3 — JWT decode ≠ JWT verify

`lib/core/jwt.dart` is 18 lines. It ONLY decodes the payload (base64 URL decode + JSON parse). It DOES NOT verify the signature. This is deliberate:

- The token came from OUR own api over TLS
- The client uses the payload only for cosmetics: `signIn(email)` in analytics, cache-key namespacing
- **Auth decisions never trust client-side JWT claims.** The api validates every request server-side; the client's "am I logged in" is `AuthStore.read() != null` — nothing more.

```dart
Map<String, dynamic>? decodeJwtClaims(String token) {
  final parts = token.split('.');
  if (parts.length != 3) return null;
  try {
    final normalized = base64Url.normalize(parts[1]);
    final decoded = jsonDecode(utf8.decode(base64Url.decode(normalized)));
    return decoded is Map<String, dynamic> ? decoded : null;
  } on FormatException {
    return null;
  }
}
```

**Returns null for anything malformed. NEVER throws.** Analytics must never break the app; the JWT decode being a possible source of throw would violate that.

**If a decision needs to trust JWT claims** (e.g., admin vs user, tenant, entitlement), the api answers it via a dedicated endpoint (`/users/me`, `/subscription/status`). The client never introspects the JWT for authorization.

### Rule 4 — dio 401 handler: `errorCode` gates the clear

The bug this rule closes: a permission-check endpoint returned 401 (business-logic reject, e.g. "this action needs the user to be Pro"). The old handler cleared the token on ANY 401. Result: user got kicked to `/phone-choice` on next navigation. The token was still perfectly valid — the server just said "not authorized for THIS action."

The fix: **only clear when the server EXPLICITLY says the token itself is bad.**

```dart
onError: (e, handler) async {
  final code = e.response?.statusCode;
  final serverCode = _extractErrorCode(e.response?.data);
  final isAuthReject = code == 401 &&
      (serverCode == 'UNAUTHORIZED' || serverCode == 'INVALID_TOKEN');
  final sentToken = e.requestOptions.headers.containsKey('Authorization');
  if (isAuthReject && !sentToken) {
    // Nothing to clear — there was no token for the server to reject.
  } else if (isAuthReject) {
    await store.clear();     // token is genuinely bad
  } else if (code == 401) {
    // Business-logic 401 — token PRESERVED
    debugPrint('[Dio✗] non-auth 401 … — token preserved');
  }
  handler.next(e);
},
```

**Rules:**

- The api's auth middleware emits `errorCode: 'UNAUTHORIZED'` (missing OR invalid); the token-verify path uses `'INVALID_TOKEN'`. Anything else at 401 is a caller-side business error, not an auth wipe.
- **Only clear if this request carried a token.** Because `UNAUTHORIZED` also means *missing*, a logged-out user's unauthenticated request used to "clear" an already-empty store — and `clear()` still broadcasts `null` (Rule 2). On device (2026-09) that erased a logged-out user's parked deep link half a second after it was written. The request's own `Authorization` header is the check; the real expired-token path still clears. Pinned by `test/deep_link_root_cause_test.dart`.
- **Never widen the check.** Adding new codes (e.g. `'FORBIDDEN'`, `'EXPIRED'`) requires the api to have those exact strings; guessing is the same class of bug.
- The api envelope shape is `{success:false, message, data:null, errorCode}`. `_extractErrorCode` defensively handles all three variants a network layer might hand you (Map / raw string / null).

### Rule 5 — Logout order: everything that needs Bearer runs BEFORE clear

**The single most bug-prone side of auth.** Multiple things fire on logout, and every one of them needs a specific relationship to `AuthStore.clear()`.

**The correct order** (top to bottom):

```dart
// 1. Analytics reset — needs no token, but must run BEFORE the changes stream
//    fires the auto-reset (this is the manual one; the stream also fires).
//    Order matters here only for the identify-snapshot wipe.
await analytics.reset();

// 2. Entitlement clear — Riverpod notifier, no network. Order not critical
//    but conventional to run before network calls.
await ref.read(entitlementStateProvider.notifier).clear();

// 3. Deep-link pending intent clear — one storage delete, no network.
await deepLinkService.clearPendingIntent();

// 4. FirebaseTokenSync.logout — DELETE /firebase-tokens NEEDS Bearer.
//    If this runs after AuthStore.clear, the DELETE 401s and the row
//    leaks on the server forever. This is why the ordering matters.
await firebaseTokenSync.logout();

// 5. FINALLY — clear the store, which broadcasts on `changes` and
//    triggers the router redirect + the auto-reactions above.
await authStore.clear();
```

**Rules:**

- **Every step that "needs Bearer" runs BEFORE `authStore.clear()`.** That's the DELETE-tokens call and any other authenticated-only cleanup you might add.
- **The `changes` stream ALSO fires auto-reactions** — analytics reset, entitlement clear, deep-link clear are all bus subscribers. The EXPLICIT calls above are belt-and-suspenders + ordering control; the stream ensures nothing is skipped even if the logout call site forgot one.
- **DO NOT** collapse this into "just call `authStore.clear()` and let the bus handle everything." The bus fires AFTER the clear returns; the DELETE at that point 401s.
- Sequencing lives at the logout call site (currently the profile menu's "Log out" action). The bus subscribers are the safety net.

## `AuthStore` — Reference Implementation

`lib/core/auth_store.dart` — 62 lines. Every rule above is baked in.

```dart
class AuthStore {
  AuthStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _key = 'auth_token';
  final StreamController<String?> _controller = StreamController<String?>.broadcast();

  String? _token;
  bool _hydrated = false;

  Stream<String?> get changes => _controller.stream;

  Future<void> hydrate() async {
    if (_hydrated) return;                           // idempotent
    _token = await _storage.read(key: _key);
    _hydrated = true;
  }

  String? read() => _token;                          // sync, hydrated

  Future<void> write(String token) async {
    _token = token;                                  // cache first
    await _storage.write(key: _key, value: token);   // then disk
    _controller.add(token);                          // then broadcast
  }

  Future<void> clear() async {
    _token = null;
    await _storage.delete(key: _key);
    _controller.add(null);
  }
}
```

**Cache-first / disk-second / broadcast-third** — the ordering makes `read()` after `write()` return the new value synchronously, closes the interceptor race, and only broadcasts once both the cache and disk are in sync.

## `main.dart` — the Auth Wire

```dart
// 1. Construct + hydrate BEFORE anything else
final store = AuthStore();
await store.hydrate();
final token = store.read();

// 2. Downstream that reads the token synchronously
final dio = buildDio(store);
final analytics = await Analytics.init(...);
if (token != null) unawaited(analytics.signIn(token));   // restored-session identity

// 3. Wire everything into the locator
await configureLocator(authStore: store, dio: dio, analytics: analytics, ...);

// 4. Non-transient reactions on the changes stream
final capturedAnalytics = analytics;
if (capturedAnalytics != null) {
  store.changes.listen((next) {
    if (next != null) {
      unawaited(capturedAnalytics.signIn(next));      // login
    } else {
      unawaited(capturedAnalytics.reset());           // logout
    }
  });
}

// FCM token sync on fresh logins
if (firebaseTokenSync != null) {
  store.changes.listen((next) {
    if (next != null) unawaited(firebaseTokenSync!.syncIfAuthenticated());
  });
  if (token != null) unawaited(firebaseTokenSync.syncIfAuthenticated());   // restored session
}

// Deep-link pending-intent clear on logout
store.changes.listen((next) {
  if (next != null) return;
  if (serviceLocator.isRegistered<DeepLinkService>()) {
    unawaited(serviceLocator<DeepLinkService>().clearPendingIntent());
  }
});
```

Every subscriber is `unawaited` + null-safe + gated on `isRegistered` where the collaborator is optional. Auth reactions must never block or break the app.

## Testing

`AuthStore` accepts a `FlutterSecureStorage` in the constructor — inject a fake in unit tests:

```dart
class _FakeSecureStorage extends Fake implements FlutterSecureStorage {
  final _data = <String, String?>{};
  @override Future<String?> read({required String key, ...}) async => _data[key];
  @override Future<void> write({required String key, required String? value, ...}) async {
    _data[key] = value;
  }
  @override Future<void> delete({required String key, ...}) async => _data.remove(key);
}

test('hydrate loads persisted token', () async {
  final storage = _FakeSecureStorage();
  await storage.write(key: 'auth_token', value: 'stored-jwt');
  final store = AuthStore(storage);
  expect(store.read(), isNull);        // before hydrate
  await store.hydrate();
  expect(store.read(), 'stored-jwt');  // after hydrate
});

test('changes stream fires on write and clear', () async {
  final store = AuthStore(_FakeSecureStorage());
  await store.hydrate();
  final events = <String?>[];
  final sub = store.changes.listen(events.add);
  await store.write('new-jwt');
  await store.clear();
  await Future<void>.delayed(Duration.zero);
  expect(events, ['new-jwt', null]);
  await sub.cancel();
});
```

For widget tests that need an authenticated state, construct `AuthStore(fakeStorage)`, `await store.hydrate()`, then hand it into `configureLocator(authStore: store, ...)`. See [flutter-testing](../flutter-testing/SKILL.md) and [flutter-dependencies](../flutter-dependencies/SKILL.md).

## Anti-Patterns

- **Reading `AuthStore.read()` before `hydrate()`.** Returns null, feature thinks the user is logged out, redirect fires, restored session bug.
- **Mirroring the token into a Riverpod provider that you manually keep in lockstep.** The whole point of `changes` is that there's ONE source; mirroring re-creates the "post-OTP tap-Status bounces to /phone-choice" bug the current design fixed.
- **`await storage.read(key: 'auth_token')` inside the dio interceptor's `onRequest`.** Reintroduces the race the sync cache was built to close.
- **Clearing the token on any 401.** A business-logic 401 wipes the session. Guard on `errorCode: UNAUTHORIZED | INVALID_TOKEN`.
- **Widening the auth-reject codes without an api change.** Guessing at codes creates false positives; only add a code when the api ships it.
- **Verifying the JWT signature client-side.** Not needed (TLS from our own api); adds a crypto dep for zero value. If you find yourself needing this, you're using the client for an authorization decision that belongs on the server.
- **Trusting JWT claims for authorization** (`if (claims['role'] == 'admin')`). Anyone with a decoder can forge these client-side. The server is the source of truth.
- **Calling `AuthStore.clear()` before running the "needs Bearer" cleanup.** DELETE 401s, server-side row leaks forever.
- **Only calling `AuthStore.clear()` on logout without the explicit reset sequence.** The bus fires AFTER the clear, so bearer-dependent steps miss their window.
- **Adding a per-consumer "on login" callback plumbing instead of subscribing to `changes`.** Two sources of truth for auth reactions; one of them gets forgotten.
- **`unawaited(...)` on a `changes` subscriber that MUST complete before proceeding.** The stream is broadcast; if the reaction is critical to the next state, it belongs at the call site, not the bus.
- **Firing a "one-shot on next login" reaction on the `changes` stream.** The bus is for non-transient reactions. One-shots belong at the login call site.

## Common Mistakes

- **"Restored session bounces me to /phone-choice"** — `hydrate()` didn't complete before something read `AuthStore.read()`. Trace the order in `main()`; the `await store.hydrate()` must be BEFORE `configureLocator` and any consumer.
- **"Random 401 kicks me to /phone-choice"** — the dio 401 handler is clearing without the `errorCode` gate. Check that `_extractErrorCode` runs and the `isAuthReject` bool is computed correctly.
- **"Logout leaked a server row"** — `FirebaseTokenSync.logout()` ran AFTER `AuthStore.clear()`. Fix the ordering at the logout call site.
- **"User A's cached data appears in user B's session"** — some subscriber to `changes` isn't firing its clear. Common culprits: entitlement notifier not registered, `DeepLinkService.clearPendingIntent` not wired.
- **"Widget test throws `AuthStore hasn't been hydrated`"** — the test skipped `await store.hydrate()`. Even in tests, hydrate is required.
- **"Analytics identity leaks across users"** — `analytics.reset()` isn't fired on the `changes` stream, OR the identify dedupe snapshot isn't cleared. See [flutter-analytics](../flutter-analytics/SKILL.md).
- **"401 loop after a fresh install"** — you're calling an authenticated endpoint before checking `AuthStore.read() != null`. Guard the call OR opt out with `options.extra['skipAuth'] = true` (see [flutter-networking](../flutter-networking/SKILL.md)).
- **"Authenticated calls go out with `token=NONE` while logged out"** — something reachable before login calls the api. Guard at the source, not per call site: e.g. `EntitlementNotifier.refresh()` returns early with no session, which covers app resume (`refreshIfStale`), the paywall and the deep-link screens at once. A logged-out user never reaches `/home` (the `/app/*` redirect checks auth first), so its feed calls don't fire either. Check with `adb logcat -s flutter | grep 'token=NONE'` — only intentionally unauthenticated calls (`/auth/otp/*`, `/languages`, `skipAuth` requests) should appear.
- **"A logged-out user's tapped share link is forgotten"** — look for `clearing AuthStore` in the log after the link was parked: an unauthenticated 401 broadcast a phantom logout. See Rule 4.

## Checklist — Adding a New Auth Reaction

- [ ] Decide: transient (one-shot at a specific login/logout) or non-transient (every transition)
- [ ] Transient → wire at the call site (login_bloc, logout button), NOT on the changes stream
- [ ] Non-transient → subscribe to `store.changes.listen(...)` in `main()`
- [ ] If it reacts to `null`: it will also run on a `clear()` of an already-empty store — make sure that is harmless
- [ ] If it reacts to non-null: it runs at OTP-verify, before onboarding finishes — if it needs onboarding done, it doesn't belong on this bus
- [ ] `unawaited(...)` at the call site — analytics/reactions must never block or break auth
- [ ] Null-safe: `if (next != null)` for login, `if (next == null)` for logout — or handle both
- [ ] If the reaction "needs Bearer" (a network call to your api), it belongs in the EXPLICIT logout sequence BEFORE `AuthStore.clear()` — NOT only on the bus (the bus fires post-clear)
- [ ] If the reaction depends on a `serviceLocator`-registered service that's optional (Firebase, DeepLinkService), guard with `isRegistered<T>()`

## Checklist — Modifying the Logout Sequence

- [ ] Every "needs Bearer" step runs BEFORE `authStore.clear()`
- [ ] Non-bearer clears (analytics reset, entitlement clear, pending intent clear) can be either before or after — but conventionally match the code that's already there
- [ ] Bus subscribers cover the same clears as safety net
- [ ] Test: log in, log out, log in as a DIFFERENT user on the same device — no state from user A appears in user B's session

## Authoritative References

- Real implementations:
  - `apps/mobile/lib/core/auth_store.dart` (62 lines) — the store + bus
  - `apps/mobile/lib/core/jwt.dart` (18 lines) — decode only, never verify
  - `apps/mobile/lib/core/dio_client.dart` — 401 handler with `errorCode` gate and the sent-token check
  - `apps/mobile/lib/core/entitlement.dart` — `refresh()` skipped with no session
  - `apps/mobile/lib/main.dart` — hydrate + subscribers
- Related skills: [flutter-networking](../flutter-networking/SKILL.md), [flutter-routing](../flutter-routing/SKILL.md), [flutter-analytics](../flutter-analytics/SKILL.md), [flutter-push-notifications](../flutter-push-notifications/SKILL.md), [flutter-deep-linking](../flutter-deep-linking/SKILL.md), [flutter-dependencies](../flutter-dependencies/SKILL.md), [flutter-testing](../flutter-testing/SKILL.md), [flutter-async-safety](../flutter-async-safety/SKILL.md), [frontend-patterns](../frontend-patterns/SKILL.md)
