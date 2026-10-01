import 'dart:convert';

import 'package:collection/collection.dart';

/// Decision returned by [IdentifyDeduper.decide]: skip the SDK call entirely,
/// or send the given payload (which is the full accumulated snapshot on a
/// TTL re-assert, the incoming payload otherwise).
class IdentifyDecision {
  const IdentifyDecision.skip()
      : send = false,
        set = const {},
        setOnce = const {};
  const IdentifyDecision.send(this.set, this.setOnce) : send = true;

  final bool send;
  final Map<String, Object?> set;
  final Map<String, Object?> setOnce;
}

/// Pure dedupe policy for `$identify` events — imports neither Flutter nor
/// the Amplitude SDK (the `jwt.dart` rule: the concrete SDK class can't be
/// faked, so seam logic must be unit-testable without it).
///
/// Skips identifies whose payload would not change the last-sent snapshot:
/// `$set` values compared by deep equality (a type change IS a change),
/// `$setOnce` keys by presence (first-write-wins server-side, so repeats are
/// no-ops regardless of value). Once [reassertInterval] elapses without a
/// send — or the clock runs backwards — the next non-empty call re-sends the
/// FULL accumulated snapshot as a safety net against server-side state loss
/// (`$unset`/`$clearAll`, warehouse rebuilds, dropped batches).
///
/// Persisted state ([serialize]/[restore]) is bound to a signed-in user and
/// only activates when [bindUser] is called with the matching id. Anonymous
/// identifies dedupe within-process only: their events have no persons-store
/// fallback in the warehouse, so they must never skip based on another
/// launch's state (see the spec's #EXPORT_CRITICAL).
class IdentifyDeduper {
  IdentifyDeduper({
    this.reassertInterval = defaultReassertInterval,
    DateTime Function()? now,
  }) : _now = now ?? _utcNow;

  /// Bounds worst-case staleness after server-side state loss. A judgment
  /// call (TAM-20) — tune here, nowhere else.
  static const Duration defaultReassertInterval = Duration(hours: 24);

  static const int _version = 1;
  static const _eq = DeepCollectionEquality();

  static DateTime _utcNow() => DateTime.now().toUtc();

  final Duration reassertInterval;
  final DateTime Function() _now;

  String? _userId; // null = anonymous
  Map<String, Object?> _sentSet = {};
  Map<String, Object?> _sentOnce = {};
  DateTime? _lastSentAt;

  /// Restored-from-disk state parks here until [bindUser] proves the
  /// signed-in user matches; consumed (promoted or discarded) on first bind.
  _Snapshot? _pending;

  /// Read-only: decides without recording. Call [recordSent] only after the
  /// SDK call actually succeeded.
  IdentifyDecision decide({
    required Map<String, Object?> set,
    required Map<String, Object?> setOnce,
  }) {
    if (set.isEmpty && setOnce.isEmpty) return const IdentifyDecision.skip();
    final last = _lastSentAt;
    if (last == null) return IdentifyDecision.send(set, setOnce);
    final now = _now();
    if (now.isBefore(last) || now.difference(last) >= reassertInterval) {
      // Re-assert: full accumulated snapshot. Incoming $set wins over stored;
      // stored $setOnce first-values win over incoming (the server would
      // ignore an overwrite anyway).
      return IdentifyDecision.send(
        {..._sentSet, ...set},
        {...setOnce, ..._sentOnce},
      );
    }
    final changed = set.entries.any((e) =>
            !_sentSet.containsKey(e.key) ||
            !_eq.equals(_sentSet[e.key], e.value)) ||
        setOnce.keys.any((k) => !_sentOnce.containsKey(k));
    return changed
        ? IdentifyDecision.send(set, setOnce)
        : const IdentifyDecision.skip();
  }

  /// Merge a successfully-sent payload into the snapshot and stamp the clock.
  void recordSent(Map<String, Object?> set, Map<String, Object?> setOnce) {
    _sentSet.addAll(set);
    for (final entry in setOnce.entries) {
      _sentOnce.putIfAbsent(entry.key, () => entry.value); // first write wins
    }
    _lastSentAt = _now();
  }

  /// Bind the signed-in identity. Same id → state preserved (the per-launch
  /// path); different id (including anonymous → signed-in) → state discarded.
  /// The first bind consumes any restored snapshot: promoted on a matching
  /// id, silently dropped otherwise.
  void bindUser(String userId) {
    final pending = _pending;
    _pending = null;
    if (_userId == userId) return;
    _resetState();
    _userId = userId;
    if (pending != null && pending.userId == userId) {
      _sentSet = pending.set;
      _sentOnce = pending.setOnce;
      _lastSentAt = pending.lastSentAt;
    }
  }

  /// Logout: wipe bound identity, snapshot, and any un-consumed restore.
  void clear() {
    _pending = null;
    _resetState();
  }

  void _resetState() {
    _userId = null;
    _sentSet = {};
    _sentOnce = {};
    _lastSentAt = null;
  }

  /// Versioned JSON blob for persistence — null for anonymous state (never
  /// persisted) or when nothing was sent yet. Null on encoding failure too:
  /// the cost of not persisting is one redundant re-send next launch.
  String? serialize() {
    final userId = _userId;
    final last = _lastSentAt;
    if (userId == null || last == null) return null;
    try {
      return jsonEncode({
        'v': _version,
        'userId': userId,
        'lastSentAt': last.millisecondsSinceEpoch,
        'set': _sentSet,
        'setOnce': _sentOnce,
      });
    } on Object {
      return null;
    }
  }

  /// Rebuild from a persisted blob. Treats the input as untrusted: any parse,
  /// shape, or version anomaly → null (degrade to "send", never throw). The
  /// restored snapshot stays inert until [bindUser] matches its user id.
  static IdentifyDeduper? restore(
    String? json, {
    Duration reassertInterval = defaultReassertInterval,
    DateTime Function()? now,
  }) {
    if (json == null) return null;
    try {
      final decoded = jsonDecode(json);
      if (decoded is! Map<String, dynamic>) return null;
      final userId = decoded['userId'];
      final lastSentAt = decoded['lastSentAt'];
      final set = decoded['set'];
      final setOnce = decoded['setOnce'];
      if (decoded['v'] != _version ||
          userId is! String ||
          userId.isEmpty ||
          lastSentAt is! int ||
          set is! Map<String, dynamic> ||
          setOnce is! Map<String, dynamic>) {
        return null;
      }
      return IdentifyDeduper(reassertInterval: reassertInterval, now: now)
        .._pending = _Snapshot(
          userId: userId,
          set: Map<String, Object?>.of(set),
          setOnce: Map<String, Object?>.of(setOnce),
          lastSentAt:
              DateTime.fromMillisecondsSinceEpoch(lastSentAt, isUtc: true),
        );
    } on Object {
      return null;
    }
  }
}

class _Snapshot {
  const _Snapshot({
    required this.userId,
    required this.set,
    required this.setOnce,
    required this.lastSentAt,
  });

  final String userId;
  final Map<String, Object?> set;
  final Map<String, Object?> setOnce;
  final DateTime lastSentAt;
}
