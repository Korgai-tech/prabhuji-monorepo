import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:smart_auth/smart_auth.dart';

/// TAM-123 — cached Google SMS Retriever app-signature hash.
///
/// The 11-char hash is derived from `applicationId + signing-cert public key`.
/// It differs between debug and release, between local sideload and Play Store
/// (Play App Signing re-signs our upload key), and between our stage/prod
/// signing keystores — so it MUST be computed at runtime from the actually-
/// installed APK and shipped with `POST /auth/otp/send` so MSG91's template
/// interpolates it into the SMS suffix.
///
/// Hardcoding one hash server-side would silently break OTP auto-fill for
/// three of the four legitimate variants and would need a full app release to
/// fix. See `specs/TAM-123-onboarding-auto-fill.md` §3.
///
/// Contract of this helper:
///  * Android — returns the 11-char hash on first call, memoises for the rest
///    of the process lifetime (native call is cheap but not free).
///  * iOS / web / any non-Android platform — returns `null`. The SMS Retriever
///    API doesn't exist there; sending a hash the backend can't use would be
///    dead weight on the wire.
///  * Any failure inside `smart_auth` returns `null` — the caller degrades to
///    "no auto-fill", never crashes. This function must never throw.

String? _cachedHash;
Future<String?>? _inflight;

/// The exact shape Google's on-device SMS Retriever matcher expects — 11 chars
/// from the standard base64 alphabet (`A–Z`, `a–z`, `0–9`, `+`, `/`), no
/// padding. Server-side Zod uses the same regex.
final RegExp _validHashRegex = RegExp(r'^[A-Za-z0-9+/]{11}$');

/// Idempotent: many callers can await the same in-flight computation and get
/// the same value; subsequent calls return the cache synchronously (via a
/// completed Future).
Future<String?> ensureAppSignatureHash() {
  if (_cachedHash != null) return Future<String?>.value(_cachedHash);
  return _inflight ??= _compute();
}

/// Synchronous read for callers that already know they've waited (e.g. after
/// `ensureAppSignatureHash()` completed once at app start). Returns `null` if
/// the compute hasn't run yet — callers must tolerate that.
String? get cachedAppSignatureHash => _cachedHash;

Future<String?> _compute() async {
  if (kIsWeb || !Platform.isAndroid) return null;
  try {
    final result = await SmartAuth.instance.getAppSignature();
    if (!result.hasData) {
      debugPrint('[app-signature] getAppSignature returned no data');
      return null;
    }
    // `smart_auth`'s Kotlin side uses `Base64.NO_PADDING | Base64.NO_WRAP`,
    // so a well-behaved return has no whitespace. Trim anyway — some OEM
    // ROMs / plugin versions have been observed appending a stray `\n`, and
    // one invisible byte at the tail is enough to make Play Services'
    // on-device hash match fail and drop the SMS silently.
    final raw = result.data ?? '';
    final trimmed = raw.trim();
    if (!_validHashRegex.hasMatch(trimmed)) {
      // Fail closed: sending a malformed hash means the server rejects the
      // whole POST /auth/otp/send (400) and NO OTP goes out. Better to omit
      // the field, which the backend treats as "no auto-fill this install".
      debugPrint(
        '[app-signature] rejecting non-standard hash '
        '(len=${trimmed.length}, raw-len=${raw.length}): '
        '"${_maskForLog(trimmed)}"',
      );
      return null;
    }
    _cachedHash = trimmed;
    // Log the exact bytes we'll ship so you can diff against what appears
    // in the received SMS on the device. `+` and `/` are the two chars
    // MSG91's template pipeline is most likely to mangle.
    debugPrint(
      '[app-signature] hash="$trimmed" '
      '(has_plus=${trimmed.contains('+')}, has_slash=${trimmed.contains('/')})',
    );
    return _cachedHash;
  } catch (e) {
    // The hash is best-effort. A native failure just means auto-fill won't
    // work on this device this run; there's no user-recoverable action.
    debugPrint('[app-signature] compute threw: $e');
    return null;
  }
}

String _maskForLog(String s) {
  if (s.length <= 4) return s;
  return '${s.substring(0, 2)}…${s.substring(s.length - 2)}';
}
