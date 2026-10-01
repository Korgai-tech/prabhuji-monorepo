---
name: flutter-networking
description: Networking layer for apps/mobile — dio 5 client structure with auth / logging / retry interceptors (idempotent verbs only by default; opt-in for POST), single-flight 401 → refresh → retry via a TokenRefresher, contract-first OpenAPI-generated Dart models (never hand-edit), the {success, message, data} envelope, Result/AppError sealed unions for typed errors, thin repositories that Blocs depend on, cancellation, timeouts, and mocked HTTP tests. Use when adding a new endpoint, changing API contracts, or wiring auth / refresh / retry.
user-invocable: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Flutter Networking Skill

## Purpose

Give `apps/mobile` one predictable path from a UI intent to an HTTP call: `dio` for the wire, generated OpenAPI models for shapes, sealed `Result<T>` for typed errors, and thin repositories that Blocs (see [flutter-state-bloc](../flutter-state-bloc/SKILL.md)) depend on. The API is the source of truth — the mobile client never hand-writes shapes for endpoints that exist.

## When This Skill Applies

- Adding a new endpoint call from mobile
- Changing anything in `apps/api` that touches request/response shapes (triggers the codegen chain)
- Wiring auth, refresh, retry, or offline handling
- Reviewing a PR that adds `_dio.get/post/put/delete` calls or a new `try/catch` around an HTTP call
- Debugging a 401 loop, a "malformed response" from mobile, or a request timing out silently

## Package Baseline

Already in `apps/mobile/pubspec.yaml`:

```yaml
dependencies:
  dio: ^5.10.0
  flutter_secure_storage: ^10.3.1
  logging: ^1.2.0            # add if not present — used by the logging interceptor
```

Recommended dev deps for tests:

```yaml
dev_dependencies:
  http_mock_adapter: ^0.6.1  # dio-native mock adapter
  mocktail: ^1.0.4
```

Do NOT add: `chopper`, `retrofit`, `dio_smart_retry` (its default policy is too aggressive). The interceptors below cover the same ground with one file.

## Contract-First — the OpenAPI Codegen Chain

The API is the source of truth. Any route/schema change in `apps/api` regenerates downstream artifacts, in order (from repo root):

1. `pnpm nx run api:openapi` — re-emits `apps/api/openapi.json` (CI fails on drift via `pnpm check:openapi`).
2. `pnpm nx run api-client:generate` — TS types for admin.
3. `pnpm nx run mobile:generate` — Dart models under `apps/mobile/lib/api/generated/**` (needs JDK 17).

Rules:
- **NEVER hand-edit `apps/mobile/lib/api/generated/**`.** It's overwritten on next codegen.
- Commit regenerated files alongside the API change in the same PR.
- Missing a model on mobile? Regenerate; don't cast or hand-write.

## The Dio Client — What Lives Where

```text
apps/mobile/lib/
├── core/
│   ├── env.dart              # API_URL compile-time define
│   ├── auth_store.dart       # flutter_secure_storage wrapper (already exists)
│   ├── dio_client.dart       # buildDio(store, onUnauthorized: ...) — interceptor stack
│   └── result.dart           # sealed Result<T> + AppError (add this)
├── api/
│   ├── api_client.dart       # thin hand-written client wrapping dio
│   └── generated/**          # OpenAPI models — DO NOT HAND-EDIT
└── features/<feature>/
    ├── <feature>_repository.dart      # interface + impl; returns Result<T>
    └── <feature>_cubit.dart           # depends on repository interface
```

- `dio_client.dart` builds the singleton Dio with interceptors.
- `api_client.dart` is a hand-written thin adapter that unwraps `{success, message, data}` and converts DTOs to generated models.
- **Repositories are the Bloc-facing boundary.** They return `Result<T>` — no `throw` across this seam.

## Base Dio Setup — Interceptor Stack

Extend the current `buildDio` with logging + retry, keeping the existing auth + 401 handling. Order matters: **request-time interceptors run in add order; response-time interceptors run in reverse.**

```dart
// apps/mobile/lib/core/dio_client.dart
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:logging/logging.dart';

import 'auth_store.dart';
import 'env.dart';

final _log = Logger('api');

Dio buildDio(
  AuthStore store,
  TokenRefresher refresh, {
  void Function()? onUnauthorized,
}) {
  final dio = Dio(BaseOptions(
    baseUrl: Env.apiUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 20),
    sendTimeout: const Duration(seconds: 15),
    // Never throw on non-2xx — we handle envelopes in api_client.dart.
    validateStatus: (_) => true,
  ));

  dio.interceptors.addAll([
    _AuthInterceptor(store, refresh, onUnauthorized),
    _RetryInterceptor(maxRetries: 2),
    _LoggingInterceptor(),
  ]);

  return dio;
}

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this._store, this._refresh, this._onUnauthorized);
  final AuthStore _store;
  final TokenRefresher _refresh;                 // see "Token Refresh" below
  final void Function()? _onUnauthorized;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    // Skip the refresh call itself — attaching a stale access token would 401
    // and re-enter refresh forever.
    if (options.extra['skip_auth'] == true) return handler.next(options);
    final token = await _store.readAccess();
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }

  @override
  Future<void> onResponse(Response response, ResponseInterceptorHandler handler) async {
    // We rely on the envelope path to interpret non-2xx bodies. 401 handling
    // lives in onError (Dio turns 401 into a DioException when
    // validateStatus rejects it — but we pass everything through, so 401
    // arrives here). We re-issue via the refresh path.
    if (response.statusCode == 401 &&
        response.requestOptions.extra['retried_after_refresh'] != true) {
      final retried = await _refresh.attemptAndRetry(response.requestOptions);
      if (retried != null) return handler.resolve(retried);
      _onUnauthorized?.call();
    }
    handler.next(response);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401 &&
        err.requestOptions.extra['retried_after_refresh'] != true) {
      final retried = await _refresh.attemptAndRetry(err.requestOptions);
      if (retried != null) return handler.resolve(retried);
      _onUnauthorized?.call();
    }
    handler.next(err);
  }
}

class _RetryInterceptor extends Interceptor {
  _RetryInterceptor({required this.maxRetries});
  final int maxRetries;

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final attempt = (err.requestOptions.extra['retry'] as int?) ?? 0;
    if (attempt >= maxRetries) return handler.next(err);
    if (!_isRetryable(err)) return handler.next(err);

    final backoff = Duration(milliseconds: 250 * (1 << attempt)); // 250, 500, 1000
    await Future.delayed(backoff);

    final opts = err.requestOptions..extra['retry'] = attempt + 1;
    try {
      final response = await Dio(BaseOptions(baseUrl: opts.baseUrl)).fetch<dynamic>(opts);
      return handler.resolve(response);
    } on DioException catch (e) {
      return handler.next(e);
    }
  }

  bool _isRetryable(DioException err) {
    // Retry on transient network / server errors ONLY.
    // Do NOT retry on 4xx (auth / validation) — they will keep failing.
    // Do NOT retry non-idempotent verbs (POST, PATCH) unless the caller
    // opts in with `options.extra['retry_post'] = true` — replaying a POST
    // over a flaky network is how you get duplicate charges / duplicate
    // creates.
    final method = err.requestOptions.method.toUpperCase();
    const idempotent = {'GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'};
    final optedIn = err.requestOptions.extra['retry_post'] == true;
    if (!idempotent.contains(method) && !optedIn) return false;

    if (err.type == DioExceptionType.connectionError) return true;
    if (err.type == DioExceptionType.connectionTimeout) return true;
    if (err.type == DioExceptionType.receiveTimeout) return true;
    final code = err.response?.statusCode ?? 0;
    return code >= 500 && code < 600;
  }
}

class _LoggingInterceptor extends Interceptor {
  static const _startKey = '_ts';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.extra[_startKey] = DateTime.now().microsecondsSinceEpoch;
    _log.info('→ ${options.method} ${options.uri.path}');
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    _log.info(
      '← ${response.statusCode} ${response.requestOptions.method} '
      '${response.requestOptions.uri.path} '
      '(${_elapsedMs(response.requestOptions)} ms)',
    );
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    _log.warning(
      '× ${err.type.name} ${err.requestOptions.method} '
      '${err.requestOptions.uri.path} '
      '(${_elapsedMs(err.requestOptions)} ms) — ${err.message}',
    );
    handler.next(err);
  }

  int _elapsedMs(RequestOptions options) {
    final start = options.extra[_startKey];
    if (start is! int) return -1;
    return (DateTime.now().microsecondsSinceEpoch - start) ~/ 1000;
  }
}
```

Notes:
- `validateStatus: (_) => true` means non-2xx doesn't throw. All error mapping happens in `api_client.dart`/repositories, in one place. This is intentional — it makes the envelope pattern the single source of truth for "did the call succeed".
- The retry interceptor uses `err.requestOptions.extra['retry']` as a counter so we don't loop forever if `fetch` re-enters the pipeline.
- The logging interceptor writes to `package:logging`. Wire the root handler in `main.dart` (see below).

### Token Refresh — Single-Flight 401 → Refresh → Retry

`_AuthInterceptor` above hands 401s to a `TokenRefresher`. The refresher's job is to:

1. Coalesce concurrent 401s into **one** refresh call (single-flight — otherwise every in-flight request hits the refresh endpoint independently).
2. On refresh success: persist the new access token, replay the original request with the new header.
3. On refresh failure: propagate the 401 so `_AuthInterceptor` calls `onUnauthorized` and the router redirects to login.

```dart
// apps/mobile/lib/core/token_refresher.dart
class TokenRefresher {
  TokenRefresher(this._store, this._auth);
  final AuthStore _store;
  final AuthApi _auth;                  // thin dio-less wrapper — see below
  Future<String?>? _inFlight;           // the single-flight lock

  /// Attempts to refresh once, then replays [original] with the new token.
  /// Returns null if refresh failed or was cancelled — the interceptor then
  /// treats the original 401 as a real sign-out.
  Future<Response<dynamic>?> attemptAndRetry(RequestOptions original) async {
    final newToken = await (_inFlight ??= _refresh()..whenComplete(() => _inFlight = null));
    if (newToken == null) return null;

    final retried = await Dio(BaseOptions(baseUrl: original.baseUrl)).fetch(
      original
        ..headers['Authorization'] = 'Bearer $newToken'
        ..extra['retried_after_refresh'] = true,
    );
    return retried;
  }

  Future<String?> _refresh() async {
    final refresh = await _store.readRefresh();
    if (refresh == null) return null;
    try {
      final tokens = await _auth.refresh(refresh);   // POST /auth/refresh
      await _store.write(access: tokens.access, refresh: tokens.refresh);
      return tokens.access;
    } catch (_) {
      await _store.clear();
      return null;
    }
  }
}
```

`AuthApi` here is a **separate Dio instance** — never the main one. The refresh call must not go through `_AuthInterceptor` (that's why the interceptor also gates on `extra['skip_auth'] == true`, and the refresh dio just doesn't install auth). Otherwise a stale access token gets attached to the refresh call, that 401s, and you recurse. Two clients — one authed, one not — is the simplest correct shape.

Rules:

- **Single-flight is non-negotiable.** Any two 401s that arrive together must resolve against the same refresh Future — otherwise you burn refresh tokens and race the store writes.
- **`extra['retried_after_refresh']`** marks the replayed request so a *second* 401 doesn't loop into refresh again. One retry per original request. If the replay 401s, the user is signed out.
- **On any failure inside `_refresh()`, clear all tokens.** A partial state (access cleared but refresh kept) is how you get an app stuck in a loop.
- **`AuthStore` needs both `access` and `refresh` slots.** Update `flutter_secure_storage` keys accordingly (`ui_access_token`, `ui_refresh_token`) and give it typed methods (`readAccess()`, `readRefresh()`, `write({required access, required refresh})`).
- **Do not put refresh logic in a repository.** The interceptor is the only correct home — repositories don't know their calls will be replayed.

Testing (add to `test/core/dio_client_test.dart`):

- Given a 401 on the first call, refresh succeeds, and the original request replays with the new token — assert the second header is `Bearer NEW`.
- Given N concurrent 401s (fire five requests in parallel), assert `AuthApi.refresh` is called **once**.
- Given refresh returns 401, assert `onUnauthorized` fires and the original request is not replayed.

### Logging setup (once, at app startup)

Wire once, in `main.dart`, before `runApp`. Uses `debugPrint` so output routes through the Flutter engine and is visible in `adb logcat` under the `flutter` tag on Android and in the Console app on iOS — no matter whether you're running `flutter run`, a raw debug APK on a device connected via ADB, or a profile build.

```dart
// apps/mobile/lib/main.dart, before runApp
import 'package:flutter/foundation.dart';
import 'package:logging/logging.dart';

void _initLogging() {
  // Level.ALL in debug/profile so requests are visible over ADB.
  // Level.WARNING in release so INFO chatter stays out of prod devices.
  Logger.root.level = kReleaseMode ? Level.WARNING : Level.ALL;

  Logger.root.onRecord.listen((rec) {
    final line = '${rec.time.toIso8601String()} '
        '${rec.level.name.padRight(7)} '
        '${rec.loggerName}: ${rec.message}';
    // debugPrint (from foundation.dart) is throttled to avoid Android
    // dropping lines on high volume, and it routes to logcat via the
    // engine — the plain `print` from dart:core is fine too, but on
    // Android chatty prints can be truncated by logcat's ring buffer.
    debugPrint(line);
    if (rec.error != null) debugPrint('  ERROR: ${rec.error}');
    if (rec.stackTrace != null) debugPrint('${rec.stackTrace}');
  });
}
```

Call it before anything that logs:

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  _initLogging();
  // configureDependencies(...); runApp(...);
}
```

Log rules:
- Never log PII (email, phone, full name, tokens). IDs are fine.
- Never log response bodies at INFO. If you need them for debugging, use `Level.FINE` and enable the specific logger locally: `Logger('api').level = Level.FINE;` inside a debug-only branch.
- One line per request; don't dump headers by default.

### Viewing API logs over ADB

Once `_initLogging()` is wired, every request/response written by `_LoggingInterceptor` shows up in the Flutter log stream. From your host, pick whichever surface is convenient:

```bash
# Simplest — Flutter's own stream. Attaches to the running app on the device.
# Filters to Flutter tag and shows Dart print/debugPrint output.
flutter logs -d <device-id>          # e.g. flutter logs -d emulator-5554

# Raw logcat with tag filter — works on any Android device connected via ADB,
# whether you launched via `flutter run` or side-loaded the APK.
adb logcat -v time flutter:V '*:S'

# Grep to just API lines (the interceptor logs under the "api" logger name):
adb logcat -v time flutter:V '*:S' | grep -E 'api:|→|←|×'

# Follow only a specific device when multiple are attached:
adb -s <device-id> logcat -v time flutter:V '*:S'

# Clear the ring buffer before reproducing the bug:
adb logcat -c && adb logcat -v time flutter:V '*:S'
```

Handy `flutter devices` snippet to grab the device id: `flutter devices --machine | jq -r '.[0].id'`.

Tips:
- Nothing showing up? Confirm the app was built in debug or profile mode. Release builds default to `WARNING+` per the setup above — bump `Logger.root.level` temporarily if you need INFO in release.
- Android emulator can't reach your dev machine on `localhost` — edit `apps/mobile/env/staging.json`'s `apiUrl` to `http://10.0.2.2:3000` (do NOT commit that edit). This repo does not use `--dart-define=API_URL=…` — see [flutter-env-config](../flutter-env-config/SKILL.md) for the full local-dev workflow. Requests to the wrong host emit as `connectionError` in the log — that's the fingerprint.
- On iOS device / simulator: `xcrun simctl spawn booted log stream --predicate 'process == "Runner"' --style compact` or just use `flutter logs` — same idea.
- If you want dio to also print request/response bodies during a targeted debugging session, `dio.interceptors.add(LogInterceptor(requestBody: true, responseBody: true))` temporarily. Do NOT commit this — the built-in `_LoggingInterceptor` is the committed default.

## The Envelope — `{success, message, data}`

Every backend response follows the envelope pattern.

- Success: `{success: true, message?: string, data: T}`
- Failure: `{success: false, message: string, data?: null}` or a Fastify error with the same shape.

`api_client.dart` centralizes the unwrap:

```dart
static Map<String, dynamic> _envelope(Response<dynamic> res) {
  final body = res.data;
  if (body is! Map<String, dynamic>) {
    throw ApiException('Malformed response');
  }
  if (body['success'] != true) {
    throw ApiException(body['message']?.toString() ?? 'Request failed');
  }
  return body;
}
```

Rule: every hand-written call in `api_client.dart` runs its response through `_envelope`. Never inspect `body['success']` in a repository or Cubit.

## Result / AppError — Typed Errors, No `throw` Across Feature Boundaries

Add a small Dart-3 sealed pair. This is what repositories return and Blocs consume — never `throw`.

```dart
// apps/mobile/lib/core/result.dart

sealed class Result<T> {
  const Result();
}

final class Ok<T> extends Result<T> {
  const Ok(this.value);
  final T value;
}

final class Err<T> extends Result<T> {
  const Err(this.error);
  final AppError error;
}

sealed class AppError {
  const AppError();

  String get userMessage => switch (this) {
    NetworkError(:final message) => message,
    UnauthorizedError() => 'Please sign in again.',
    NotFoundError(:final resource) => '$resource not found.',
    ValidationError(:final message) => message,
    ServerError(:final status) => 'Server error ($status). Please try again.',
    UnknownError() => 'Something went wrong. Please try again.',
  };
}

final class NetworkError extends AppError {
  const NetworkError(this.message);
  final String message;
}
final class UnauthorizedError extends AppError {
  const UnauthorizedError();
}
final class NotFoundError extends AppError {
  const NotFoundError(this.resource);
  final String resource;
}
final class ValidationError extends AppError {
  const ValidationError(this.message, {this.fields = const {}});
  final String message;
  final Map<String, String> fields;
}
final class ServerError extends AppError {
  const ServerError(this.status);
  final int status;
}
final class UnknownError extends AppError {
  const UnknownError(this.cause, this.stack);
  final Object cause;
  final StackTrace stack;
}
```

Consumers switch exhaustively — the compiler enforces every branch:

```dart
final result = await repo.listUsers();
switch (result) {
  case Ok<List<PublicUser>>(:final value): emit(UsersLoaded(value));
  case Err<List<PublicUser>>(:final error): emit(UsersError(error.userMessage));
}
```

## Mapping `DioException` → `AppError`

Every repository call funnels errors through one mapper.

```dart
// apps/mobile/lib/core/result.dart (or a sibling)
AppError mapError(Object e, StackTrace stack) {
  if (e is ApiException) {
    // Envelope said success=false; treat as validation-ish surface text.
    return ValidationError(e.message);
  }
  if (e is DioException) {
    switch (e.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return NetworkError(e.message ?? 'Network unreachable');
      case DioExceptionType.cancel:
        return NetworkError('Request cancelled');
      case DioExceptionType.badResponse:
      case DioExceptionType.badCertificate:
      case DioExceptionType.unknown:
        final code = e.response?.statusCode ?? 0;
        if (code == 401) return const UnauthorizedError();
        if (code == 404) {
          return NotFoundError(e.requestOptions.uri.pathSegments.lastOrNull ?? 'resource');
        }
        if (code >= 500) return ServerError(code);
        return ValidationError(_extractMessage(e) ?? 'Request failed');
    }
  }
  return UnknownError(e, stack);
}

String? _extractMessage(DioException e) {
  final body = e.response?.data;
  if (body is Map<String, dynamic>) {
    final message = body['message'];
    if (message is String) return message;
  }
  return null;
}
```

## Repositories — the Bloc-Facing Boundary

Thin. Interface in the feature folder; impl uses `ApiClient`. Always returns `Result<T>`.

```dart
// apps/mobile/lib/features/users/users_repository.dart
abstract interface class UsersRepository {
  Future<Result<List<PublicUser>>> listUsers();
  Future<Result<void>> register({required String email, required String name, required String password});
}

class HttpUsersRepository implements UsersRepository {
  HttpUsersRepository(this._api);
  final ApiClient _api;

  @override
  Future<Result<List<PublicUser>>> listUsers() async {
    try {
      final users = await _api.listUsers();
      return Ok(users);
    } catch (e, s) {
      return Err(mapError(e, s));
    }
  }

  @override
  Future<Result<void>> register({required String email, required String name, required String password}) async {
    try {
      await _api.register(email, name, password);
      return const Ok(null);
    } catch (e, s) {
      return Err(mapError(e, s));
    }
  }
}
```

Rules:
- One `try/catch` per method — never leak `DioException` past the repository.
- Interface lives in the same folder as the impl for now (add a `domain/` split only if the app grows past ~10 features).
- Blocs depend on the interface (`UsersRepository`), never on `ApiClient` or `Dio` directly. This is what makes them testable with a `_MockRepo`.

## Cancellation — for List Search + Screen Dispose

Add a `CancelToken` for any request that a fast-typing user could re-issue, and for any request tied to a screen's lifetime.

```dart
class UsersRepository {
  CancelToken? _searchToken;

  Future<Result<List<PublicUser>>> search(String query) async {
    _searchToken?.cancel('superseded');
    final token = _searchToken = CancelToken();
    try {
      final users = await _api.searchUsers(query, cancelToken: token);
      return Ok(users);
    } catch (e, s) {
      return Err(mapError(e, s));
    }
  }
}
```

Dispose from a Cubit's `close`:

```dart
@override
Future<void> close() {
  _cancel?.cancel('cubit closed');
  return super.close();
}
```

## Timeouts

Configured on `BaseOptions` above. Rules:
- `connectTimeout` short (5–10 s) — a stalled TCP connect will never recover in practice.
- `receiveTimeout` longer (15–30 s) — long polls / large payloads exist.
- Override per call when you know an endpoint is slow: `options: Options(receiveTimeout: const Duration(minutes: 2))`.

## Emulator Quirks — `API_URL`

`Env.apiUrl` defaults to `http://localhost:3000`. On the Android emulator, `localhost` is the emulator itself, not your host.

```bash
# Point the app at a laptop-hosted API by EDITING env/staging.json locally
# (do NOT commit that edit). This repo has no --dart-define=API_URL= escape hatch.
# Full workflow: see the flutter-env-config skill.

# Physical iOS device: your Mac's LAN IP
#   apps/mobile/env/staging.json  →  "apiUrl": "http://192.168.1.42:3000"

# Android emulator: 10.0.2.2 → host's localhost
#   apps/mobile/env/staging.json  →  "apiUrl": "http://10.0.2.2:3000"

# Then just:
flutter run                                         # loads staging.json by default
flutter test integration_test/app_test.dart -d <device>
```

## Testing — Mock the Wire, Not the Client

Use `http_mock_adapter` to install responses on the real Dio, so interceptors run.

```dart
// apps/mobile/test/core/dio_client_test.dart
import 'package:dio/dio.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:test/test.dart';

void main() {
  test('injects Bearer token from AuthStore', () async {
    final store = _FakeAuthStore('the-token');
    final dio = buildDio(store);
    final adapter = DioAdapter(dio: dio);
    adapter.onGet('/auth/users', (server) {
      expect(server.headers['Authorization'], 'Bearer the-token');
      server.reply(200, {'success': true, 'data': []});
    });
    await dio.get('/auth/users');
  });

  test('retries on 500, then succeeds', () async {
    final dio = buildDio(_FakeAuthStore(null));
    final adapter = DioAdapter(dio: dio);
    adapter
      ..onGet('/auth/users', (s) => s.reply(500, {'success': false, 'message': 'boom'}))
      ..onGet('/auth/users', (s) => s.reply(200, {'success': true, 'data': []}));
    final res = await dio.get('/auth/users');
    expect(res.statusCode, 200);
  });
}
```

For repository tests, mock the `ApiClient` (not Dio) with `mocktail` — see [flutter-state-bloc](../flutter-state-bloc/SKILL.md). The pyramid is:

- Unit: Bloc <- MockRepository (fast)
- Unit: Repository <- MockApiClient (fast)
- Integration: ApiClient <- real Dio + mock adapter (fast; catches interceptor bugs)
- E2E: `flutter test integration_test/` against a real API + emulator (slow; runs in `pnpm e2e:android`)

## Common Mistakes

- **Hand-editing `lib/api/generated/**`.** Overwritten on next `pnpm nx run mobile:generate`. If a model is missing, regenerate.
- **`throw`ing past the repository.** UI ends up scattered with `try/catch`. Return `Result<T>` and let the Bloc branch.
- **Skipping the envelope check.** `body['data']` before verifying `success` gives cryptic null crashes on 4xx.
- **Aggressive retry on 4xx.** Auth/validation errors will keep failing — you're just spamming. Retry only on transient network / 5xx.
- **Retrying a POST that has no idempotency guarantee.** The interceptor now skips non-idempotent verbs by default; opting in (`options.extra['retry_post'] = true`) means you've verified the endpoint is idempotent (dedupes by client key, is a natural upsert, etc.). Turning it on to silence a flake without that check causes duplicate creates / duplicate charges.
- **Refreshing per-request.** Every 401 firing its own refresh burns refresh tokens and races the token store. Route through a single-flight `TokenRefresher` — the pattern is above.
- **Reading `_dio` from a widget.** Access the wire only through `ApiClient` / a repository. Widgets don't know about Dio.
- **No timeouts.** A stalled request holds the loading spinner forever. Set `BaseOptions` defaults, override per call when needed.
- **Logging PII.** `_log.info('login attempt for ${email}')` in prod is a compliance bug. Log user IDs, not identifiers.
- **New Dio per feature.** One long-lived Dio; interceptors and connection pooling are per-Dio. Multiple Dios multiply overhead.
- **Missing `10.0.2.2` on Android emulator.** Requests silently `connectionError`. See the emulator quirks section.

## Checklist for a New Endpoint

- [ ] Added to `apps/api` (route + Zod schema + tests)
- [ ] Regenerated: `pnpm nx run api:openapi` → `api-client:generate` → `mobile:generate`
- [ ] Committed generated files in the same PR
- [ ] `ApiClient` has a method wrapping the call (envelope-checked)
- [ ] Repository interface + impl return `Result<T>`; `mapError` handles errors
- [ ] Bloc / Cubit consumes the repository via constructor injection
- [ ] Unit test: repository happy path + one error path with a mocked `ApiClient`
- [ ] Integration test: `buildDio` + `http_mock_adapter` verifies interceptor behavior for any new auth / retry rule
- [ ] If the endpoint is a POST/PATCH that must retry on flakes, either endpoint is idempotent AND request sets `options.extra['retry_post'] = true`, or leave retry off
- [ ] `flutter analyze` clean

## Authoritative References

- **`dio`**: https://pub.dev/packages/dio
- **`http_mock_adapter`**: https://pub.dev/packages/http_mock_adapter
- **`flutter_secure_storage`**: https://pub.dev/packages/flutter_secure_storage
- **`logging`**: https://pub.dev/packages/logging
- **Codegen chain**: root `CLAUDE.md` — "Contract-first codegen"
- **API envelope + Fastify conventions**: `apps/api/CLAUDE.md`
- Related skills: [flutter-modular-architecture](../flutter-modular-architecture/SKILL.md) (`get_it` owns repository registration), [flutter-state-bloc](../flutter-state-bloc/SKILL.md) (repositories are what Blocs depend on), [flutter-ui](../flutter-ui/SKILL.md) (cancellation on dispose), [api-patterns](../api-patterns/SKILL.md) (backend envelope + error shape), [frontend-patterns](../frontend-patterns/SKILL.md) (Admin + Mobile index)
- Mobile conventions: `apps/mobile/CLAUDE.md`
