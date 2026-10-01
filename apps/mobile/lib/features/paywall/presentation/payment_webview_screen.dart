import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../core/theme.dart';

/// In-app WebView that hosts a payment gateway's hosted checkout page
/// (Cashfree's `/api/pay/authorize/…`, Decentro's shortener when it
/// terminates on an https page rather than resolving to a raw
/// `upi://` intent) and intercepts the return-URL bounce back to
/// Prabhuji so the user never lands in an external browser tab
/// they can't get out of. Part of the TAM-124 Part-A fix for the
/// "app doesn't reopen after payment" bug.
///
/// The intercept fires on any navigation whose path is
/// `/app/payment/return`, regardless of host — that pattern is the
/// contract every provider's `redirect_url` composes against (see
/// `apps/api/src/shared/config/env.ts`'s `CASHFREE_RETURN_URL`
/// docstring). Attribution query params (`provider`, `mandateId`)
/// ride through the intercept but are not read here; the paywall's
/// existing `AppResumedFromUpi → poll` flow owns the entitlement
/// refresh.
class PaymentWebViewScreen extends StatefulWidget {
  const PaymentWebViewScreen({
    super.key,
    required this.url,
  });

  /// The hosted-page URL to load. Must be `https://`. Trusting the
  /// caller here — the launcher only routes `https://` URIs to this
  /// screen and the URL comes from the backend's mandate response.
  final String url;

  /// Path prefix that signals "we're done, pop back". Kept as a
  /// static so tests can reference the same string and so a future
  /// contract change lands in one spot. Matches the mobile parser's
  /// `payment/return` case in `deep_link_parser.dart`.
  static const String returnPathPrefix = '/app/payment/return';

  @override
  State<PaymentWebViewScreen> createState() => _PaymentWebViewScreenState();
}

class _PaymentWebViewScreenState extends State<PaymentWebViewScreen> {
  late final WebViewController _controller;
  bool _loading = true;
  bool _popped = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (mounted) setState(() => _loading = true);
            // Rewrite `window.open(url, "_blank")` to same-window
            // navigation. Decentro's hosted checkout page uses
            // `_blank` popups to hop to the per-UPI-app stage
            // (`?app=phonepe`, `?app=gpay`, …). `webview_flutter`'s
            // default WebChromeClient BLOCKS popups on Android — the
            // request is silently dropped and the user stares at the
            // pre-tap page. Rewriting to `location.href = url` keeps
            // the whole flow in this one WebView and gives
            // [_onNavigationRequest] a chance to see every URL,
            // including the eventual `upi://` intent the next page
            // issues.
            unawaited(_controller.runJavaScript(
              'window.open = function(u) { window.location.href = u; return null; };',
            ));
          },
          onPageFinished: (_) {
            if (mounted) setState(() => _loading = false);
          },
          onNavigationRequest: _onNavigationRequest,
        ),
      )
      ..loadRequest(Uri.parse(widget.url));
  }

  /// Called for every navigation the WebView is about to perform,
  /// including form POSTs and 302 redirects. Returning
  /// `NavigationDecision.prevent` tells the controller to drop the
  /// navigation on the floor.
  ///
  /// Three cases handled:
  ///
  ///   * **`upi://` scheme** — WebViews cannot load non-http schemes;
  ///     letting the navigation proceed would fail silently. Instead,
  ///     hand the intent to the OS via `url_launcher` (chooser sheet
  ///     → user picks their UPI app) and pop this WebView so the
  ///     paywall's `AppResumedFromUpi → poll` path takes over when
  ///     they come back. This is Decentro's actual handoff — after
  ///     `window.open` above rewrites to same-window navigation, the
  ///     Decentro page navigates in-place to a URL that redirects to
  ///     `upi://…`, which lands here.
  ///
  ///   * **`/app/payment/return` bounce** — the provider's post-
  ///     approval redirect. Swallow so the OS App-Link filter
  ///     doesn't open Prabhuji in a fresh Activity on top of the one
  ///     still hosting THIS WebView; pop back to the paywall instead.
  ///
  ///   * **Everything else** — allow, so the WebView loads the
  ///     gateway's own pages normally.
  ///
  /// The `_popped` latch prevents a repeat pop if multiple redirects
  /// fire before the pop takes effect (some gateways do this).
  NavigationDecision _onNavigationRequest(NavigationRequest request) {
    final uri = Uri.tryParse(request.url);
    if (uri == null) return NavigationDecision.navigate;

    if (uri.scheme == 'upi') {
      unawaited(_launchUpi(uri));
      _popToPaywall();
      return NavigationDecision.prevent;
    }

    if (uri.path.startsWith(PaymentWebViewScreen.returnPathPrefix)) {
      _popToPaywall();
      return NavigationDecision.prevent;
    }

    return NavigationDecision.navigate;
  }

  /// Hand a `upi://` intent to the OS. `LaunchMode.externalApplication`
  /// bypasses the browser and goes straight to Android's app chooser
  /// (PhonePe / GPay / Paytm / BHIM …). Failure logs but does not
  /// throw — the pop still runs so the user isn't wedged in the
  /// WebView on a device with no UPI app.
  Future<void> _launchUpi(Uri uri) async {
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (e) {
      debugPrint('[PaymentWebView] upi launch failed: $e');
    }
  }

  /// Pop back to the paywall from the WebView. Deferred to the next
  /// frame so we don't mutate navigation state mid-delegate-callback
  /// (the delegate runs during the WebView's layout pass on some
  /// platforms). The `_popped` latch collapses a burst of redirect
  /// pops into one.
  void _popToPaywall() {
    if (_popped) return;
    _popped = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (context.canPop()) {
        context.pop();
      } else {
        context.go('/paywall');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('payment-webview-screen'),
      backgroundColor: AppColors.white,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        surfaceTintColor: AppColors.white,
        leading: IconButton(
          key: const Key('payment-webview-back'),
          icon: SvgPicture.asset(
            'assets/aarti/back-arrow.svg',
            width: 24,
            height: 24,
            colorFilter: const ColorFilter.mode(
              AppColors.black,
              BlendMode.srcIn,
            ),
          ),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(
          'Complete Payment',
          style: AppText.headingSm(color: AppColors.black),
        ),
      ),
      body: Stack(
        children: <Widget>[
          WebViewWidget(controller: _controller),
          if (_loading)
            const Center(
              child: CircularProgressIndicator(color: AppColors.brand300),
            ),
        ],
      ),
    );
  }
}
