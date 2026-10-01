import 'dart:math';

/// Minimal RFC 4122 §4.4 v4 UUID (128 random bits + two reserved nibbles).
/// Kept as a top-level function (not a class) so it stays a leaf utility
/// nobody has to construct; used from the analytics stack for `event_id`
/// (per-event, in [Analytics.trackEvent]) and for the persisted
/// `anonymous_id` + per-launch `session_id` in [AnalyticsEnricher].
///
/// `Random.secure()` is fine here — we don't need the extra deps `uuid`
/// pulls in for a single call site.
String newUuidV4() {
  final rand = Random.secure();
  final bytes = List<int>.generate(16, (_) => rand.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant RFC 4122
  final hex =
      bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-'
      '${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-'
      '${hex.substring(16, 20)}-'
      '${hex.substring(20, 32)}';
}
