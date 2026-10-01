import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Chat-scoped persistence for analytics counters (TAM-166 Phase 1,
/// mirrors the `KuldevtaCounters` pattern):
///
///  * `open_count` — lifetime count of `chat_page_viewed` fires, so the
///    "repeat-usage builds" question in PRD §18.1 has a denominator.
///  * `free_chat_consumed` — locked PRD §13 model: one free chat per
///    user, consumed when they actually send a message in it. Set once
///    on the free session's first send; read on `chat_closed` to
///    populate `free_chat_consumed`, and on future chat entries to
///    decide whether the paywall should fire. Phase 1 wires the READ
///    so `chat_closed` reports the right value; the WRITE-on-send +
///    entry-time paywall gate move to Phase 3 (TAM-N-free-chat).
///  * `voice_permission_ask_count` — lifetime count of mic permission
///    prompts served, so §18.3 `chat_voice_permission_result` can
///    report `ask_count`.
///
/// Production wire uses [SharedPreferences]; widget tests use the
/// [ChatCounters.inMemory] factory so they can construct the bloc
/// synchronously without SharedPreferences mocking + async
/// `getInstance`. All keys are namespaced (`chat.*`).
class ChatCounters {
  /// Production constructor — persists via [SharedPreferences].
  ChatCounters(SharedPreferences prefs) : _store = _SharedPrefsStore(prefs);

  /// Test-only constructor — persists in an in-memory Map. State does NOT
  /// survive across instances, so each test group gets fresh counters.
  @visibleForTesting
  ChatCounters.inMemory() : _store = _InMemoryStore();

  final _CountersStore _store;

  static const String _kOpenCount = 'chat.open_count';
  static const String _kFreeChatConsumed = 'chat.free_chat_consumed';
  static const String _kVoicePermissionAskCount =
      'chat.voice_permission_ask_count';
  static const String _kKuldevtaName = 'chat.kuldevta_name';
  static const String _kAgentId = 'chat.agent_id';
  static const String _kChatType = 'chat.chat_type';

  /// Increment and return the new value. Caller uses the return as
  /// `open_count` on `chat_page_viewed` so the fire and persistence are
  /// atomic (no race with a concurrent read).
  int incrementOpenCount() {
    final next = (_store.getInt(_kOpenCount) ?? 0) + 1;
    _store.setInt(_kOpenCount, next);
    return next;
  }

  /// Read without incrementing.
  int openCount() => _store.getInt(_kOpenCount) ?? 0;

  /// Whether this install has already consumed its one free chat (PRD
  /// §13). Read from `chat_closed` and from the future entry-time
  /// paywall gate.
  bool isFreeChatConsumed() => _store.getBool(_kFreeChatConsumed) ?? false;

  /// Mark the free chat as consumed. Idempotent — safe to call
  /// repeatedly. Phase 3 (TAM-N-free-chat) wires this call on the
  /// user's first send inside the free session.
  void markFreeChatConsumed() {
    _store.setBool(_kFreeChatConsumed, true);
  }

  /// Increment and return the mic-permission-prompt count. Caller uses
  /// the return as `ask_count` on `chat_voice_permission_result`.
  int incrementVoicePermissionAskCount() {
    final next = (_store.getInt(_kVoicePermissionAskCount) ?? 0) + 1;
    _store.setInt(_kVoicePermissionAskCount, next);
    return next;
  }

  /// Persist the assigned deity's name from `/users/me`
  /// `chatConfig.kuldeveta_name` so the chat header can render a
  /// name-only persona variant on the assigned-path cold launch (when
  /// the fresh-handoff `kuldevtaChatHandoffProvider` is empty).
  ///
  /// Passing null or an empty string CLEARS the stored value — matches
  /// the "server is source of truth" invariant so a user whose
  /// assignment is revoked server-side stops seeing a stale name.
  void saveKuldevtaName(String? name) {
    if (name == null || name.isEmpty) {
      _store.remove(_kKuldevtaName);
    } else {
      _store.setString(_kKuldevtaName, name);
    }
  }

  /// Read the last-persisted deity name. `null` if we've never received
  /// a name from the server — chat header falls back to
  /// "Prabhuji Chat" in that case.
  String? savedKuldevtaName() => _store.getString(_kKuldevtaName);

  /// Persist the active RAGFlow agent id from `/users/me`
  /// `chatConfig.agentId`. Written by `UsersRepository.getMe` on every
  /// successful fetch. Analytics events that fire outside the chat
  /// bloc's live state (e.g. `chat_button_clicked` in the shell,
  /// `paywall_viewed` when opened from chat) read this cached value so
  /// they can attribute the event to a bot even before `chat/history`
  /// has resolved.
  ///
  /// Passing null or an empty string CLEARS the stored value — matches
  /// the "server is source of truth" invariant so an A/B remap or a
  /// disabled variant stops attributing events to a stale agent.
  void saveAgentId(String? agentId) {
    if (agentId == null || agentId.isEmpty) {
      _store.remove(_kAgentId);
    } else {
      _store.setString(_kAgentId, agentId);
    }
  }

  /// Read the last-persisted agent id. `null` when the user has no
  /// active chat assignment (control arm, or a pre-rollout stage server).
  String? savedAgentId() => _store.getString(_kAgentId);

  /// Persist the opaque `chat_type` bucket label the server hands back
  /// on `/users/me`. Written by `UsersRepository.getMe` on every successful
  /// fetch, and read by [AnalyticsEnricher] on EVERY event — so this value,
  /// not the call site, is what buckets the whole funnel.
  ///
  /// Passing null or an empty string CLEARS the stored value: a successful
  /// `/users/me` with no bucket is the server retiring the user's arm. Only
  /// call it from a path that actually has a server answer — a speculative
  /// null write (a widget building before `/users/me` resolves) would wipe a
  /// correct arm and silently drop every subsequent event back to
  /// `'control'`.
  void saveChatType(String? chatType) {
    if (chatType == null || chatType.isEmpty) {
      _store.remove(_kChatType);
    } else {
      _store.setString(_kChatType, chatType);
    }
  }

  /// Read the last-persisted chat_type. `null` when the server hasn't
  /// bucketed this user yet — consumers OMIT the analytics property
  /// rather than emit an empty string that would look like a real bucket
  /// in the funnel.
  String? savedChatType() => _store.getString(_kChatType);

  /// Wipe the three USER-scoped mirrors of `/users/me → chatConfig`
  /// (`chat_type`, `agent_id`, `kuldevta_name`). Wired into the logout
  /// cascade: these are per-account facts written by
  /// [UsersRepository.getMe], and without this a second user on the same
  /// device inherits the first user's experiment arm — `chat_type` rides
  /// on EVERY event via [AnalyticsEnricher], so the leak would mis-bucket
  /// their whole funnel until their own `/users/me` lands.
  ///
  /// The remaining keys are INSTALL-scoped by design and deliberately
  /// survive: `free_chat_consumed` is the one-free-chat anti-abuse flag
  /// (clearing it would make logout a way to mint another free chat), and
  /// `open_count` / `voice_permission_ask_count` are lifetime device
  /// counters the funnel reads as such.
  void clearIdentity() {
    _store.remove(_kChatType);
    _store.remove(_kAgentId);
    _store.remove(_kKuldevtaName);
  }
}

/// Storage seam so [ChatCounters] can wrap either [SharedPreferences]
/// (production) or a plain Map (tests) without exposing the choice.
abstract interface class _CountersStore {
  int? getInt(String key);
  void setInt(String key, int value);
  bool? getBool(String key);
  void setBool(String key, bool value);
  String? getString(String key);
  void setString(String key, String value);
  void remove(String key);
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
  bool? getBool(String key) => _prefs.getBool(key);

  @override
  void setBool(String key, bool value) {
    _prefs.setBool(key, value);
  }

  @override
  String? getString(String key) => _prefs.getString(key);

  @override
  void setString(String key, String value) {
    _prefs.setString(key, value);
  }

  @override
  void remove(String key) {
    _prefs.remove(key);
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
  bool? getBool(String key) => _values[key] as bool?;

  @override
  void setBool(String key, bool value) {
    _values[key] = value;
  }

  @override
  String? getString(String key) => _values[key] as String?;

  @override
  void setString(String key, String value) {
    _values[key] = value;
  }

  @override
  void remove(String key) {
    _values.remove(key);
  }
}
