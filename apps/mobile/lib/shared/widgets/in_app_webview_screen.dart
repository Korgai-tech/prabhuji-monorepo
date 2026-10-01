import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/theme.dart';

/// Arguments passed via `context.push('/webview', extra: InAppWebViewArgs(...))`.
///
/// [title] is what renders in the AppBar; keep it short (e.g. "Terms &
/// Conditions", "Privacy Policy") — the URL itself is not shown to the user.
///
/// [onLoaded] — optional; invoked ONCE the first time the WebView reports
/// `onPageFinished`, with the elapsed load time in ms. Used by the Profile &
/// Settings screen to fire `terms_viewed` / `privacy_policy_viewed` with a
/// real `load_time_ms`. See [InAppWebViewScreen.onLoaded].
@immutable
class InAppWebViewArgs {
  const InAppWebViewArgs({
    required this.title,
    required this.url,
    this.onLoaded,
  });

  final String title;
  final String url;
  final void Function(int loadTimeMs)? onLoaded;
}

/// Simple in-app browser used for the legal pages (Terms & Conditions,
/// Privacy Policy). AppBar with a back button pops the route so the user
/// returns to whichever screen pushed the webview.
///
/// Intentionally minimal: no JS bridge, no download hooks, no cookies API —
/// per PRD the page just needs to render the URL.
///
/// Optional [onLoaded] — invoked exactly ONCE the first time the underlying
/// WebView's `onPageFinished` fires, with the elapsed load time. Callers use
/// this to emit "document viewed" analytics (e.g. `terms_viewed`) with a
/// real `load_time_ms` measurement. Subsequent in-page navigations do not
/// re-invoke it.
class InAppWebViewScreen extends StatefulWidget {
  const InAppWebViewScreen({
    super.key,
    required this.args,
    this.onLoaded,
  });

  final InAppWebViewArgs args;

  /// See class doc. `loadTimeMs` is measured from `initState` to the first
  /// `onPageFinished`. Fire-and-forget from the caller's perspective.
  final void Function(int loadTimeMs)? onLoaded;

  @override
  State<InAppWebViewScreen> createState() => _InAppWebViewScreenState();
}

class _InAppWebViewScreenState extends State<InAppWebViewScreen> {
  late final WebViewController _controller;
  bool _loading = true;
  final Stopwatch _loadStopwatch = Stopwatch();
  bool _loadedReported = false;

  @override
  void initState() {
    super.initState();
    _loadStopwatch.start();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (mounted) setState(() => _loading = true);
          },
          onPageFinished: (_) {
            if (mounted) setState(() => _loading = false);
            if (!_loadedReported) {
              _loadedReported = true;
              _loadStopwatch.stop();
              widget.onLoaded?.call(_loadStopwatch.elapsedMilliseconds);
            }
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.args.url));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('in-app-webview-screen'),
      backgroundColor: AppColors.white,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        surfaceTintColor: AppColors.white,
        leading: IconButton(
          key: const Key('in-app-webview-back'),
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
          widget.args.title,
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
