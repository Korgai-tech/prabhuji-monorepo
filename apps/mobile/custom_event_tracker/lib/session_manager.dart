import 'package:shared_preferences/shared_preferences.dart';

import 'session_transition.dart';

enum AppForegroundState { foreground, background }

/// Amplitude-style mobile session FSM.
///
/// Sessions expire after [timeoutMillis] of background inactivity, not from
/// in-foreground event gaps. [session_end] is deferred until the next
/// [onForegroundResumed] or [onTrackEvent].
class SessionManager {
  static const String _keySessionIdPrefix = 'custom_analytics_session_id';
  static const String _keyLastActivityPrefix = 'custom_analytics_last_activity';
  static const String _keyBackgroundSincePrefix =
      'custom_analytics_background_since';
  static const String _keyPendingEndPrefix =
      'custom_analytics_pending_session_end';

  final int _timeoutMillis;
  final String instanceName;

  int? _currentSessionId;
  int? _backgroundSinceMs;
  int? _pendingEndSessionId;
  AppForegroundState _foregroundState = AppForegroundState.foreground;

  /// Lifecycle callbacks arrive unawaited and can interleave across the
  /// awaits inside each transition (e.g. inactive/hidden/paused firing
  /// back-to-back), so every state mutation runs through this queue.
  Future<void> _queue = Future<void>.value();

  SessionManager(this._timeoutMillis, {required this.instanceName});

  String get _keySessionId => '${_keySessionIdPrefix}_$instanceName';
  String get _keyLastActivity => '${_keyLastActivityPrefix}_$instanceName';
  String get _keyBackgroundSince =>
      '${_keyBackgroundSincePrefix}_$instanceName';
  String get _keyPendingEnd => '${_keyPendingEndPrefix}_$instanceName';

  int? get sessionId => _currentSessionId;

  AppForegroundState get foregroundState => _foregroundState;

  Future<T> _synchronized<T>(Future<T> Function() action) {
    final run = _queue.then((_) => action());
    _queue = run.then((_) {}, onError: (_) {});
    return run;
  }

  Future<void> initialize() => _synchronized(() async {
        final prefs = await SharedPreferences.getInstance();
        _currentSessionId = prefs.getInt(_keySessionId);
        _backgroundSinceMs = prefs.getInt(_keyBackgroundSince);
        _pendingEndSessionId = prefs.getInt(_keyPendingEnd);
      });

  /// Called when the app returns to foreground.
  Future<SessionTransition> onForegroundResumed(int timestamp) =>
      _synchronized(() => _handleForegroundResumed(timestamp));

  /// Called on background lifecycle transitions.
  Future<SessionTransition> onBackgroundEntered(int timestamp) =>
      _synchronized(() => _handleBackgroundEntered(timestamp));

  /// Called before each tracked event while in foreground.
  Future<SessionTransition> onTrackEvent(int timestamp) =>
      _synchronized(() => _handleTrackEvent(timestamp));

  Future<void> resetSession() => _synchronized(_resetSessionLocked);

  Future<SessionTransition> _handleForegroundResumed(int timestamp) async {
    _foregroundState = AppForegroundState.foreground;
    await _clearBackgroundSince();

    if (_pendingEndSessionId != null) {
      final ended = _pendingEndSessionId!;
      await _clearPendingEnd();
      await _startNewSession(timestamp);
      return SessionTransition(
        endPrevious: true,
        startNew: true,
        endedSessionId: ended,
      );
    }

    if (_currentSessionId == null) {
      await _startNewSession(timestamp);
      return const SessionTransition(startNew: true);
    }

    if (_backgroundSinceMs != null &&
        timestamp - _backgroundSinceMs! >= _timeoutMillis) {
      final ended = _currentSessionId!;
      await _startNewSession(timestamp);
      return SessionTransition(
        endPrevious: true,
        startNew: true,
        endedSessionId: ended,
      );
    }

    await _persistLastActivity(timestamp);
    return SessionTransition.none;
  }

  Future<SessionTransition> _handleBackgroundEntered(int timestamp) async {
    _foregroundState = AppForegroundState.background;
    await _persistBackgroundSince(timestamp);

    if (_currentSessionId == null) {
      return SessionTransition.none;
    }

    // Session end already recorded for this background stretch; repeated
    // background callbacks (inactive/hidden/paused) must not enqueue
    // duplicate session_end events.
    if (_pendingEndSessionId != null) {
      return SessionTransition.none;
    }

    if (_backgroundSinceMs != null &&
        timestamp - _backgroundSinceMs! >= _timeoutMillis) {
      final ended = _currentSessionId!;
      await _setPendingEnd(ended);
      return SessionTransition(endPrevious: true, endedSessionId: ended);
    }

    return SessionTransition.none;
  }

  Future<SessionTransition> _handleTrackEvent(int timestamp) async {
    if (_pendingEndSessionId != null) {
      final ended = _pendingEndSessionId!;
      await _clearPendingEnd();
      await _startNewSession(timestamp);
      return SessionTransition(
        endPrevious: true,
        startNew: true,
        endedSessionId: ended,
      );
    }

    if (_currentSessionId == null) {
      await _startNewSession(timestamp);
      return const SessionTransition(startNew: true);
    }

    await _persistLastActivity(timestamp);
    return SessionTransition.none;
  }

  Future<void> _resetSessionLocked() async {
    _currentSessionId = null;
    _backgroundSinceMs = null;
    _pendingEndSessionId = null;
    _foregroundState = AppForegroundState.foreground;

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keySessionId);
    await prefs.remove(_keyLastActivity);
    await prefs.remove(_keyBackgroundSince);
    await prefs.remove(_keyPendingEnd);
  }

  Future<void> _startNewSession(int timestamp) async {
    _currentSessionId = timestamp;
    _backgroundSinceMs = null;
    _pendingEndSessionId = null;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_keySessionId, timestamp);
    await prefs.setInt(_keyLastActivity, timestamp);
    await prefs.remove(_keyBackgroundSince);
    await prefs.remove(_keyPendingEnd);
  }

  Future<void> _persistLastActivity(int timestamp) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_keyLastActivity, timestamp);
  }

  Future<void> _persistBackgroundSince(int timestamp) async {
    // Capture locally: the field is mutable across the await below, so the
    // write must not re-read it.
    final since = _backgroundSinceMs ??= timestamp;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_keyBackgroundSince, since);
  }

  Future<void> _clearBackgroundSince() async {
    _backgroundSinceMs = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyBackgroundSince);
  }

  Future<void> _setPendingEnd(int sessionId) async {
    _pendingEndSessionId = sessionId;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_keyPendingEnd, sessionId);
  }

  Future<void> _clearPendingEnd() async {
    _pendingEndSessionId = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyPendingEnd);
  }
}
