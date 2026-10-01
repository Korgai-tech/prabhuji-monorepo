import 'package:chucker_flutter/chucker_flutter.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import 'app_config.dart';
import 'auth_store.dart';
import 'content_language.dart';
import 'dev_flags.dart';
import 'device_context.dart';
import 'locale_interceptor.dart';

/// Builds the app-wide Dio.
///
/// Auth model — single source of truth is [AuthStore]:
///  - Interceptor reads the token SYNCHRONOUSLY from the hydrated cache in
///    `onRequest`, then injects `Authorization: Bearer <token>`. No async
///    read means no race with a just-completed `write()`.
///  - Set `options.extra['skipAuth'] = true` on a request to opt out (e.g.
///    the OTP endpoints, which are pre-login).
///  - On a 401 that the server flags as a genuine token problem
///    (`errorCode: UNAUTHORIZED | INVALID_TOKEN`), we call
///    `authStore.clear()`. That fires `AuthStore.changes`, which the router
///    is already subscribed to → it re-runs its redirect and hops the user
///    to `/phone-choice`. There is no separate callback plumbing to keep
///    in sync — the store is the bus.
Dio buildDio(AuthStore store, {DeviceContext? deviceContext}) {
  final dio = Dio(BaseOptions(baseUrl: AppConfig.instance.apiUrl));
  // Device / app metadata headers — stamped FIRST so every downstream
  // interceptor (auth, locale, Chucker logger) sees the mutated request.
  // Optional so test harnesses / bare `buildDio(store)` calls still work;
  // production `main()` always resolves and passes a real context.
  dio.interceptors.add(deviceHeaderInterceptor(deviceContext ?? DeviceContext.empty));
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      if (options.extra['skipAuth'] == true) {
        handler.next(options);
        return;
      }
      final token = store.read();
      if (token != null) options.headers['Authorization'] = 'Bearer $token';
      if (kDebugMode) {
        debugPrint('[Dio→] ${options.method} ${options.path} '
            'token=${token == null ? "NONE" : "present(${token.length}c)"}');
      }
      handler.next(options);
    },
    onError: (e, handler) async {
      // Only clear the stored token when the server EXPLICITLY says the
      // token itself is bad. A random 401 from a permission/business-logic
      // check must NOT nuke the session (prior implementation did — one
      // stray 401 kicked the user to /phone-choice on next navigation).
      // The auth middleware emits `errorCode: "UNAUTHORIZED"` (missing OR
      // invalid); the verify path also uses `"INVALID_TOKEN"`. Anything
      // else at 401 is a caller-side business error, not an auth wipe.
      final code = e.response?.statusCode;
      final serverCode = _extractErrorCode(e.response?.data);
      final isAuthReject = code == 401 &&
          (serverCode == 'UNAUTHORIZED' || serverCode == 'INVALID_TOKEN');
      // A rejection only says something about OUR token if we sent one.
      // The auth middleware answers `UNAUTHORIZED` for a *missing* Bearer
      // too, so without this a logged-out user's unauthenticated request
      // "clears" a store that is already empty — and `clear()` still
      // broadcasts `null` on `store.changes`, which every listener reads as
      // a logout. One such listener wipes the pending deep-link intent: a
      // logged-out user who tapped a share link had it parked and then
      // erased half a second later by the 401s from the screen behind the
      // login flow (observed on device, TAM-124).
      final sentToken =
          e.requestOptions.headers.containsKey('Authorization');
      if (isAuthReject && !sentToken) {
        if (kDebugMode) {
          debugPrint('[Dio✗] 401 ($serverCode) on '
              '${e.requestOptions.method} ${e.requestOptions.path} with no '
              'token sent — nothing to clear');
        }
      } else if (isAuthReject) {
        if (kDebugMode) {
          debugPrint('[Dio✗] auth-reject ($serverCode) on '
              '${e.requestOptions.method} ${e.requestOptions.path} '
              '— clearing AuthStore');
        }
        // `clear()` broadcasts on `store.changes` — the router refresh
        // listener will pick it up and redirect any /status/* etc. away.
        await store.clear();
      } else if (kDebugMode && code == 401) {
        debugPrint('[Dio✗] non-auth 401 on ${e.requestOptions.method} '
            '${e.requestOptions.path} (errorCode=$serverCode) — '
            'token preserved');
      }
      handler.next(e);
    },
  ));
  // Content-language model — single source of truth is [SessionContext], read
  // through `selectedContentLanguage` on every request (never a cached value, so
  // a language change is visible to the very next call). Repositories used to
  // thread this into each `queryParameters` map by hand and six call sites
  // silently omitted it; here it cannot be forgotten. Opt out per request with
  // `options.extra[kSkipLocale] = true`.
  dio.interceptors.add(localeInterceptor(selectedContentLanguage));
  // HTTP inspector — added LAST so it sees the fully-mutated request
  // (Bearer token already injected). Gated by [kEnableChucker], the
  // single project-wide switch in `dev_flags.dart`. Debug builds default
  // ON; release builds default OFF, opt-in via
  // `--dart-define=ENABLE_CHUCKER=true`. Branch is compile-time dead
  // code + tree-shaken when the flag is false.
  if (kEnableChucker) {
    dio.interceptors.add(ChuckerDioInterceptor());
  }
  return dio;
}

/// Stamps device + app metadata as HTTP headers on every request. Reads
/// from the [DeviceContext] resolved once at cold start (see
/// `device_context.dart`). Empty fields are still sent so the backend can
/// distinguish "missing/unknown" from "client forgot to attach".
///
/// Header names are lowercase snake_case to match the analytics event
/// property vocabulary the same values ride on. Never overwrites a header
/// the caller has already set — a request that wants to fake a version for
/// a test wins.
Interceptor deviceHeaderInterceptor(DeviceContext ctx) {
  return InterceptorsWrapper(
    onRequest: (options, handler) {
      final fields = <String, String>{
        'app_version': ctx.appVersion,
        'device_model': ctx.deviceModel,
        'device_brand': ctx.deviceBrand,
        'android_version': ctx.androidVersion,
        'network_operator': ctx.networkOperator,
        'device_language': ctx.deviceLanguage,
      };
      for (final entry in fields.entries) {
        if (options.headers.containsKey(entry.key)) continue;
        options.headers[entry.key] = entry.value;
      }
      handler.next(options);
    },
  );
}

/// Pulls the API envelope's `errorCode` from a Dio error body. The API always
/// wraps errors as `{success:false, message, data:null, errorCode}` — but a
/// network layer might hand us a raw string, a JSON-decoded map, or `null`.
/// We defensively handle all three so a malformed body never crashes the
/// interceptor.
String? _extractErrorCode(Object? body) {
  if (body is Map) {
    final code = body['errorCode'];
    return code is String ? code : null;
  }
  return null;
}
