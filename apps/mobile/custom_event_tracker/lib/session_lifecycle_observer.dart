import 'dart:async';

import 'package:flutter/widgets.dart';

import 'analytics_transport_config.dart';
import 'http_network_service.dart';

/// SDK-owned lifecycle bridge for session transitions and background flush.
class SessionLifecycleObserver with WidgetsBindingObserver {
  final AnalyticsTransportConfig config;
  final HttpNetworkService networkService;
  final Future<void> Function() flush;

  bool _registered = false;
  bool _backgroundFlushScheduled = false;

  SessionLifecycleObserver({
    required this.config,
    required this.networkService,
    required this.flush,
  });

  bool get shouldRegister =>
      config.flushEventsOnClose || config.defaultTracking.sessions;

  void register() {
    if (_registered || !shouldRegister) {
      return;
    }
    WidgetsBinding.instance.addObserver(this);
    _registered = true;
  }

  void unregister() {
    if (!_registered) {
      return;
    }
    WidgetsBinding.instance.removeObserver(this);
    _registered = false;
    _backgroundFlushScheduled = false;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final now = DateTime.now().millisecondsSinceEpoch;

    switch (state) {
      case AppLifecycleState.resumed:
        _backgroundFlushScheduled = false;
        if (config.defaultTracking.sessions) {
          unawaited(networkService.onForegroundResumed(now));
        }
        break;
      case AppLifecycleState.paused:
      case AppLifecycleState.inactive:
      case AppLifecycleState.hidden:
        if (config.defaultTracking.sessions) {
          unawaited(networkService.onBackgroundEntered(now));
        }
        if (config.flushEventsOnClose && !_backgroundFlushScheduled) {
          _backgroundFlushScheduled = true;
          unawaited(flush());
        }
        break;
      case AppLifecycleState.detached:
        break;
    }
  }
}
