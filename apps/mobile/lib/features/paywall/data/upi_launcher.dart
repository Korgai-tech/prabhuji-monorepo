import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

/// A UPI app installed on this device.
class UpiApp {
  const UpiApp({
    required this.packageName,
    required this.appName,
    required this.iconPng,
  });

  final String packageName;
  final String appName;

  /// Decoded app icon. Null when the icon could not be rasterised — the row
  /// still renders, with a fallback glyph.
  final Uint8List? iconPng;
}

/// Seam over UPI app discovery and launching.
///
/// Exists so [PaymentBloc] is unit-testable without a platform channel —
/// `url_launcher` and MethodChannel both need a real engine, and the payment
/// state machine is exactly what most needs coverage. Mirrors the `TtsPort`
/// seam the horoscope module already uses.
abstract class UpiLauncher {
  /// UPI apps installed on this device, sorted by name. Empty on iOS, on a
  /// device with none installed, or if discovery fails.
  Future<List<UpiApp>> listApps();

  /// Open [uri] in a UPI app.
  ///
  /// [packageName] targets a specific app — what makes the user's choice from
  /// the picker actually stick. Null lets the system show its own chooser.
  /// Returns false when nothing can handle it.
  Future<bool> launch(Uri uri, {String? packageName});
}

class PlatformUpiLauncher implements UpiLauncher {
  /// [onNeedsWebView] — optional callback the launcher invokes when it is
  /// asked to launch an `https://` URI (e.g. a Cashfree hosted checkout
  /// page or an unresolved Decentro shortener). When set, the callback
  /// pushes an in-app WebView that owns the return-URL intercept —
  /// preventing the "stuck in Chrome" bug where a browser tab would
  /// otherwise strand the user after payment approval. When null, the
  /// launcher falls through to `url_launcher(externalApplication)` — the
  /// pre-fix behaviour. Wired in `service_locator.dart` to
  /// `PaymentReturnRegistrar.fireNeedsWebView`.
  const PlatformUpiLauncher({this.onNeedsWebView});

  final Future<bool>? Function(String httpsUrl)? onNeedsWebView;

  static const MethodChannel _channel = MethodChannel('prabhuji/upi');

  @override
  Future<List<UpiApp>> listApps() async {
    // Android-only: the channel is registered in MainActivity, and iOS UPI
    // support is materially weaker (see the Info.plist note). Returning empty
    // makes the picker hide itself rather than error.
    if (defaultTargetPlatform != TargetPlatform.android) return const [];
    try {
      final raw = await _channel.invokeListMethod<Map<Object?, Object?>>(
        'listUpiApps',
      );
      if (raw == null) return const [];
      return raw.map(_toApp).toList();
    } on PlatformException {
      // Discovery is an enhancement — a failure degrades to the plain
      // "let the system choose" flow, never to a broken paywall.
      return const [];
    } on MissingPluginException {
      return const [];
    }
  }

  @override
  Future<bool> launch(Uri uri, {String? packageName}) async {
    // `https://` URIs land here when `resolveIntentUrl` couldn't follow the
    // provider's shortener down to a raw `upi://` intent — usually because
    // the shortener terminates on a hosted checkout page that only mints
    // the intent after the user taps a UPI app on THAT page. Opening such
    // a URL in Chrome (the pre-fix `url_launcher` fallback) leaves the
    // user with no way back to Prabhuji after they approve in their UPI
    // app; the browser tab has no App Link filter to fire on the return.
    //
    // Route these through the in-app WebView owned by the paywall route,
    // whose `NavigationDelegate.onNavigationRequest` intercepts the
    // `/app/payment/return` bounce back to Prabhuji, pops itself, and
    // lets the paywall's poll pick up from there. Fall back to
    // `url_launcher` only when no WebView pusher is registered — the
    // paywall isn't mounted, so a browser tab is the best we can do.
    if (uri.scheme == 'https') {
      final pushed = onNeedsWebView?.call(uri.toString());
      if (pushed != null) return pushed;
    }

    if (defaultTargetPlatform == TargetPlatform.android) {
      try {
        final ok = await _channel.invokeMethod<bool>('launchUpiApp', {
          'uri': uri.toString(),
          'packageName': packageName,
        });
        if (ok == true) return true;
      } on PlatformException {
        // Fall through to url_launcher.
      } on MissingPluginException {
        // Fall through to url_launcher.
      }
    }
    return _launchViaUrlLauncher(uri);
  }

  Future<bool> _launchViaUrlLauncher(Uri uri) async {
    try {
      return await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      // `launchUrl` THROWS rather than returning false when no activity can
      // handle the scheme — the common case on an emulator with no UPI app,
      // and on any build missing the AndroidManifest `<queries>` entry. The
      // caller renders "no UPI app found" either way.
      return false;
    }
  }

  static UpiApp _toApp(Map<Object?, Object?> m) {
    final b64 = m['iconPngBase64'] as String?;
    return UpiApp(
      packageName: (m['packageName'] as String?) ?? '',
      appName: (m['appName'] as String?) ?? '',
      iconPng: b64 == null ? null : base64Decode(b64),
    );
  }
}
