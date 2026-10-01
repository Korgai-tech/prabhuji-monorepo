import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Small persistence-backed store for the two counters the kuldevta
/// analytics schema needs (TAM-166):
///
///  * `open_count` — lifetime count of `kuldevta_intro_viewed` fires (and
///    of `kuldevta_khoj_started` — the two events read the SAME counter
///    so the "curiosity vs intent" split is legible against the same
///    denominator).
///  * shared-deities set — used to compute `is_repeat_share` on the
///    share event without mutating any server state.
///
/// Production wire uses [SharedPreferences]; widget tests use the
/// [KuldevtaCounters.inMemory] factory so they can construct the bloc
/// synchronously without SharedPreferences mocking + async getInstance.
class KuldevtaCounters {
  /// Production constructor — persists via [SharedPreferences].
  KuldevtaCounters(SharedPreferences prefs)
      : _store = _SharedPrefsStore(prefs);

  /// Test-only constructor — persists in an in-memory Map. State does NOT
  /// survive across instances, so each test group gets fresh counters.
  @visibleForTesting
  KuldevtaCounters.inMemory() : _store = _InMemoryStore();

  final _CountersStore _store;

  static const String _kOpenCount = 'kuldevta.open_count';
  static const String _kSharedDeities = 'kuldevta.shared_deities';

  /// Increment and return the new value. Caller uses the return as the
  /// event's `open_count` property so the fire and the persistence are
  /// atomic (no race with a concurrent read).
  int incrementOpenCount() {
    final next = (_store.getInt(_kOpenCount) ?? 0) + 1;
    _store.setInt(_kOpenCount, next);
    return next;
  }

  /// Read without incrementing. Used by `khoj_started` — same
  /// denominator as the most recent `intro_viewed`.
  int openCount() => _store.getInt(_kOpenCount) ?? 0;

  /// `true` if [deityId] has been shared before at any point in this
  /// install's history.
  bool hasSharedBefore(String deityId) {
    final list = _store.getStringList(_kSharedDeities) ?? const <String>[];
    return list.contains(deityId);
  }

  /// Idempotent: recording the same deity twice is a no-op. Return `true`
  /// if this is the FIRST time we've recorded the share (i.e.
  /// `is_repeat_share` would be `false`); `false` if the deity was
  /// already in the set.
  bool recordShare(String deityId) {
    final list = List<String>.from(
      _store.getStringList(_kSharedDeities) ?? const <String>[],
    );
    if (list.contains(deityId)) return false;
    list.add(deityId);
    _store.setStringList(_kSharedDeities, list);
    return true;
  }
}

/// Storage seam so [KuldevtaCounters] can wrap either [SharedPreferences]
/// (production) or a plain Map (tests) without exposing the choice.
abstract interface class _CountersStore {
  int? getInt(String key);
  void setInt(String key, int value);
  List<String>? getStringList(String key);
  void setStringList(String key, List<String> value);
}

class _SharedPrefsStore implements _CountersStore {
  _SharedPrefsStore(this._prefs);
  final SharedPreferences _prefs;

  @override
  int? getInt(String key) => _prefs.getInt(key);

  @override
  void setInt(String key, int value) {
    _prefs.setInt(key, value);
  }

  @override
  List<String>? getStringList(String key) => _prefs.getStringList(key);

  @override
  void setStringList(String key, List<String> value) {
    _prefs.setStringList(key, value);
  }
}

class _InMemoryStore implements _CountersStore {
  final Map<String, Object> _values = <String, Object>{};

  @override
  int? getInt(String key) => _values[key] as int?;

  @override
  void setInt(String key, int value) {
    _values[key] = value;
  }

  @override
  List<String>? getStringList(String key) => _values[key] as List<String>?;

  @override
  void setStringList(String key, List<String> value) {
    _values[key] = List<String>.of(value);
  }
}
