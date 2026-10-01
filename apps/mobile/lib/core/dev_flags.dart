import 'package:flutter/foundation.dart' show kDebugMode;

/// Master switch for the Chucker HTTP inspector (network log viewer).
///
/// **Default**: on in debug builds AND in staging release builds; off in
/// preprod / prod release builds. To force it on/off explicitly for a
/// specific build, pass the compile-time flag:
///
/// ```
/// flutter build apk --release \
///   --dart-define=ENV=prod \
///   --dart-define=ENABLE_CHUCKER=true      # force ON (prod diagnostic build)
///
/// flutter build apk --release \
///   --dart-define=ENV=staging \
///   --dart-define=ENABLE_CHUCKER=false     # force OFF (clean staging build)
/// ```
///
/// Both flags are compile-time (`bool.fromEnvironment` / `String.fromEnvironment`)
/// so when off every branch guarded on `kEnableChucker` becomes dead code the
/// compiler tree-shakes out — zero runtime cost, zero binary bloat.
///
/// Consumed by three sites, all reading this ONE constant:
///   * `main.dart` — Chucker global config + floating-action-button overlay
///   * `main.dart` — `_ChuckerFab` render gate (skip when off)
///   * `dio_client.dart` — attaches `ChuckerDioInterceptor` when on
///
/// **Never gate other debug tools on this flag** — it is specifically the
/// Chucker/network-log switch. Debug-only Bloc observer, dev-only logs
/// etc. should stay on `kDebugMode` (they cost nothing in release and
/// have no user-facing UI). Enabling Chucker in release exposes every
/// request + response body inside the app; a staging release build is a
/// diagnostic build by intent, but a prod release with Chucker on should
/// NEVER go out for public distribution.

/// Selected environment (mirrors `AppConfig`'s selection but at compile
/// time — `AppConfig.instance.environment` is the runtime read). Kept
/// private: consumers should read [kEnableChucker], not the raw env.
const String _kEnv = String.fromEnvironment('ENV', defaultValue: 'staging');

const bool kEnableChucker = bool.fromEnvironment(
  'ENABLE_CHUCKER',
  defaultValue: kDebugMode || _kEnv == 'staging',
);
