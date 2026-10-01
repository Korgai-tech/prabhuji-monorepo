import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:smart_auth/smart_auth.dart';

/// Arms Google Play Services' SMS Retriever session BEFORE the send-OTP
/// round-trip, then hands the pending Future to the OTP screen.
///
/// **Why a service and not a per-screen call.** `SmsRetrieverClient` only
/// forwards SMS received AFTER `startSmsRetriever()` is invoked — Play
/// Services does not buffer earlier deliveries. If the OTP screen arms the
/// listener in its `initState` post-frame callback, a fast MSG91 delivery
/// can land between the Get-OTP tap and the screen mount, and the app never
/// sees the retrieval broadcast (this was the observed "SMS arrives, no
/// auto-fill" bug). The fix is to arm the listener on the PREVIOUS screen —
/// right before dispatching `SendOtpRequested` — and let the OTP screen
/// consume the already-in-flight Future.
///
/// Contract:
///  * [arm] starts a retriever session if none is active, memoising the
///    resulting Future. Multiple `arm` calls while a session is live are a
///    no-op and return the same Future. iOS / web / any non-Android platform
///    is a no-op — returns a completed `null`.
///  * [awaitCode] returns the pending code Future, or `null` if nothing is
///    armed. Callers must tolerate `null` (deep-link / iOS / plugin failure)
///    and must validate the returned code's length themselves — this service
///    extracts any 4–8 digit run from the SMS body because the phone-input
///    screen doesn't yet know the server's OTP length when it arms.
///  * [reset] discards the memoised Future. Call after the code has been
///    consumed (or the OTP flow abandoned) so the next Get-OTP / Resend
///    starts a fresh session.
class SmsRetrieverService {
  SmsRetrieverService({SmartAuth? smartAuth})
      : _smartAuth = smartAuth ?? SmartAuth.instance;

  final SmartAuth _smartAuth;

  Future<String?>? _pending;

  /// Extract any 4–8 digit run from the SMS body. Broader than the actual OTP
  /// length because we arm BEFORE the server tells us what length it minted;
  /// the OTP screen truncates / validates to its known length.
  static const String _digitsMatcher = r'\d{4,8}';

  /// True when a retriever session is currently in flight.
  bool get isArmed => _pending != null;

  /// Start the retriever if not already running. Cheap to call — subsequent
  /// calls during the same session return the existing Future.
  Future<String?> arm() {
    if (kIsWeb || !Platform.isAndroid) {
      return Future<String?>.value(null);
    }
    final pending = _pending;
    if (pending != null) return pending;
    final fresh = _run();
    _pending = fresh;
    return fresh;
  }

  /// Returns the currently-armed pending code, or `null` if nothing is armed.
  /// Does NOT arm — the OTP screen calls this after the phone screen has
  /// already armed on the user's Get-OTP tap.
  Future<String?>? awaitCode() => _pending;

  /// Drop the memoised Future so the next [arm] starts a fresh session.
  /// Call after the code has been read (success) OR when the OTP flow is
  /// abandoned (Change Number, dispose).
  Future<void> reset() async {
    if (_pending == null) return;
    _pending = null;
    try {
      await _smartAuth.removeSmsRetrieverApiListener();
    } catch (_) {
      // Best-effort — the native listener may already be gone.
    }
  }

  Future<String?> _run() async {
    try {
      final result = await _smartAuth.getSmsWithRetrieverApi(
        matcher: _digitsMatcher,
      );
      if (result.hasError || result.isCanceled) return null;
      return result.data?.code;
    } catch (_) {
      return null;
    }
  }
}
