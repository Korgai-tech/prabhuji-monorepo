/// Static seam wiring route-scoped payment-flow callbacks into the
/// long-lived services that need to reach them (TAM-124 Part A).
///
/// Two seams, both same shape:
///
///   * [onPaymentReturn] — invoked by `DeepLinkService` when a
///     `PaymentReturnDeepLink` arrives. The paywall route registers a
///     callback that fires `AppResumedFromUpi` on its `PaymentBloc` so
///     polling restarts immediately (instead of waiting on Android's
///     lifecycle-resume, which is flaky when the flow hopped through a
///     browser tab).
///
///   * [onNeedsWebView] — invoked by `PlatformUpiLauncher` when the URI
///     it's asked to launch has scheme `https` (a Cashfree hosted
///     checkout page, a Decentro shortener that hasn't resolved to
///     `upi://`). The paywall route registers a callback that pushes
///     the in-app `/paywall/return-webview` route with the URL as
///     extra. Without this callback the launcher falls through to
///     `url_launcher(externalApplication)` — Chrome opens the URL,
///     the user gets stuck there with no way back, which is the
///     exact bug this ticket fixes.
///
/// Why static: `DeepLinkService` is built during `main()`'s DI phase,
/// well BEFORE the paywall route or its `PaymentBloc` exist. Passing
/// a bloc reference into the service at DI time would freeze it to
/// whatever bloc happens to be around (usually none). The service
/// holds no route state; the paywall route registers itself here on
/// `initState` and clears on `dispose` — mirroring how the router's
/// `_PaywallDeepLinkHook` (TAM-124) already scopes its callback.
///
/// Kept in `features/paywall/application/` rather than `core/`
/// because both seams are payment-flow-specific — no other feature
/// needs them.
class PaymentReturnRegistrar {
  PaymentReturnRegistrar._();

  static void Function(Map<String, String> attribution)? _onPaymentReturn;
  static Future<bool> Function(String httpsUrl)? _onNeedsWebView;

  /// Register the payment-return callback. Call from `initState` of the
  /// widget that owns the mounted `PaymentBloc` (i.e. the paywall
  /// route's builder). Pair with [clearOnPaymentReturn] in `dispose`.
  static void setOnPaymentReturn(
    void Function(Map<String, String> attribution) cb,
  ) {
    _onPaymentReturn = cb;
  }

  static void clearOnPaymentReturn() {
    _onPaymentReturn = null;
  }

  /// Invoked by `DeepLinkService.handleUri` on a `PaymentReturnDeepLink`.
  /// No-op when nothing is registered (typical during onboarding, or
  /// when a return URL fires after the user backed out of the paywall).
  static void firePaymentReturn(Map<String, String> attribution) {
    _onPaymentReturn?.call(attribution);
  }

  /// Register the WebView-fallback callback. Same lifecycle as above:
  /// paywall `initState` sets, `dispose` clears.
  static void setOnNeedsWebView(Future<bool> Function(String httpsUrl) cb) {
    _onNeedsWebView = cb;
  }

  static void clearOnNeedsWebView() {
    _onNeedsWebView = null;
  }

  /// Invoked by `PlatformUpiLauncher.launch` when the URI is `https://`.
  /// Returns `null` (not `false`) when no callback is registered — that
  /// signals "no WebView available; fall back to `url_launcher`" rather
  /// than "WebView reported failure." The launcher branches on the
  /// difference.
  static Future<bool>? fireNeedsWebView(String httpsUrl) {
    final cb = _onNeedsWebView;
    if (cb == null) return null;
    return cb(httpsUrl);
  }
}
