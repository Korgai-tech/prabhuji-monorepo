import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Debounced network-connectivity port for the Downloads feature (TAM-125).
///
/// Emits `true` when the device has NO usable connection (`ConnectivityResult
/// .none`), `false` otherwise. Transitions are debounced at 300 ms so a wifi/
/// cellular handoff never flickers the offline banner or double-fires the
/// `app_offline_mode_entered` analytics event.
///
/// The provider is a `StreamProvider<bool>` seeded synchronously with the
/// current status so widgets don't render "assumed online" for the first frame.
final connectivityPluginProvider = Provider<Connectivity>(
  (ref) => Connectivity(),
);

final isOfflineProvider = StreamProvider<bool>((ref) async* {
  final connectivity = ref.watch(connectivityPluginProvider);
  // Seed the stream with the current state — otherwise the first frame
  // reads `AsyncLoading` and the banner flickers online → offline on cold
  // start when the user is actually offline.
  final initial = await connectivity.checkConnectivity();
  yield _isOffline(initial);
  yield* connectivity.onConnectivityChanged
      .map(_isOffline)
      .distinct()
      // Debounce a transition against wifi/cellular handoff flapping so
      // one physical "you're offline" transition fires the banner and
      // analytics event exactly once.
      .transform(_debounce(const Duration(milliseconds: 300)));
});

/// Truth table (biased toward ONLINE — a false-positive offline hides the
/// whole app UX except Downloads, so we only report offline when the
/// connectivity plugin is UNAMBIGUOUSLY telling us there is no connection):
///
/// | plugin result                       | verdict  |
/// |-------------------------------------|----------|
/// | `[]`                                | ONLINE   | ← plugin init glitch, treat as online
/// | `[none]`                            | OFFLINE  |
/// | `[none, none]`                      | OFFLINE  |
/// | `[wifi]` / `[mobile]` / `[ethernet]`/ `[vpn]` / `[bluetooth]` / `[other]` | ONLINE |
/// | `[wifi, none]` (any non-none)       | ONLINE   |
///
/// Bluetooth / VPN / partial-connectivity is deliberately treated as ONLINE:
/// real network calls will fail with their own error handling — the offline
/// placeholder is reserved for "unambiguous physical disconnection" only.
bool _isOffline(List<ConnectivityResult> results) {
  if (results.isEmpty) return false;
  return results.every((r) => r == ConnectivityResult.none);
}

/// Simple debounce transformer — pauses [duration] before letting the value
/// through; a newer event within the window replaces the pending one. Kept
/// local to this file so we don't pull `rxdart` for one call site.
StreamTransformer<T, T> _debounce<T>(Duration duration) {
  Timer? timer;
  T? pending;
  return StreamTransformer<T, T>.fromHandlers(
    handleData: (data, sink) {
      pending = data;
      timer?.cancel();
      timer = Timer(duration, () {
        final p = pending;
        if (p != null) sink.add(p);
      });
    },
    handleDone: (sink) {
      timer?.cancel();
      sink.close();
    },
  );
}
