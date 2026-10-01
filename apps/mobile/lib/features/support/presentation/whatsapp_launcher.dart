import 'package:url_launcher/url_launcher.dart';

/// Signature of [launchUrl] we depend on — narrowed to a `bool` result so
/// widget tests can inject a stub without pulling in the whole `url_launcher`
/// surface. Matches the (canUri, mode) subset [WhatsAppLauncher] needs.
typedef WhatsAppLaunchFn = Future<bool> Function(
  Uri uri, {
  LaunchMode mode,
});

/// Builds the canonical `https://wa.me/<number>?text=<url-encoded>` URI and
/// hands it to the OS via `url_launcher`.
///
/// #EXPORT_CRITICAL (spec):
///  * Strip any leading `+` from the number — `wa.me/+91123…` is invalid,
///    `wa.me/91123…?text=…` is correct.
///  * Use [LaunchMode.externalApplication]. Do NOT use `platformDefault`; on
///    Android it sometimes opens the URL in a Custom Tab that then fails to
///    redirect into WhatsApp.
///  * `Uri.encodeComponent` the message so `&`, `#`, `?` can't break the URL.
class WhatsAppLauncher {
  const WhatsAppLauncher({WhatsAppLaunchFn? launcher})
      : _launcher = launcher ?? launchUrl;

  final WhatsAppLaunchFn _launcher;

  /// Assemble the `wa.me` URI from an E.164 number (may include `+`) and a
  /// pre-filled greeting.
  static Uri buildUri({
    required String number,
    required String message,
  }) {
    final digits = number.startsWith('+') ? number.substring(1) : number;
    return Uri.parse(
      'https://wa.me/$digits?text=${Uri.encodeComponent(message)}',
    );
  }

  /// Fires the OS handoff. Returns whatever [launchUrl] returned — `false`
  /// means nothing on the device can handle the URL; callers surface a
  /// snackbar (spec AC) rather than crashing.
  Future<bool> launch({
    required String number,
    required String message,
  }) {
    final uri = buildUri(number: number, message: message);
    return _launcher(uri, mode: LaunchMode.externalApplication);
  }
}
