/// Result of a session state change in [SessionManager].
class SessionTransition {
  final bool endPrevious;
  final bool startNew;
  final int? endedSessionId;

  const SessionTransition({
    this.endPrevious = false,
    this.startNew = false,
    this.endedSessionId,
  });

  static const none = SessionTransition();

  bool get isEmpty => !endPrevious && !startNew;
}
