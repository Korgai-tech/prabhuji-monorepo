import 'package:equatable/equatable.dart';

/// Events consumed by [ChatBloc] (TAM-164, spec §Frontend Tasks item 2).
///
/// Slice 1 wires the data + application layer only — presentation-driven
/// events like [ChatContentCardTapped] are declared here so the bloc's event
/// surface is complete, but the fires from widgets land alongside the UI in
/// Slice 2.
sealed class ChatEvent extends Equatable {
  const ChatEvent();

  @override
  List<Object?> get props => const <Object?>[];
}

/// Bloc mounted — fetch the current session's history and settle into
/// either the empty state (fresh caller) or a `ChatReady` with the newest
/// page rendered.
class ChatStarted extends ChatEvent {
  const ChatStarted();
}

/// User entered the chat surface (first mount, tab-swap-back-to-chat,
/// return-from-pushed-route, etc.). Fires `chat_page_viewed` and resets
/// the session-lifecycle counters so the next `chat_closed` reports a
/// duration/message-count scoped to THIS visit — not the bloc's lifetime.
///
/// The shell scaffold dispatches this on every branch-swap INTO chat via
/// [ChatBloc.notifyEntered]. The bloc's constructor dispatches it once
/// on first mount so the initial visit still fires.
class ChatEntered extends ChatEvent {
  const ChatEntered();
}

/// User left the chat surface. Fires `chat_closed` with the given exit
/// reason and clears the session counters so the next [ChatEntered] can
/// start fresh. Symmetric with [ChatEntered] — pair fires per visit, not
/// per bloc lifetime.
///
/// Callers pass the specific reason: `back` (system/app-bar back),
/// `tab_switch` (bottom-nav swap to another tab), `app_backgrounded`
/// (lifecycle observer), or `content_opened` (card tap). The bloc's
/// pending-exit-reason honour rule still overrides `back` with a
/// `content_opened` set earlier in the tap flow.
class ChatExited extends ChatEvent {
  const ChatExited({required this.exitReason});
  final String exitReason;

  @override
  List<Object?> get props => <Object?>[exitReason];
}

/// User tapped send (or a recommended chip, or a voice recording completed).
/// [promptSource] threads the analytics origin (`typed` / `recommended` /
/// `retry` / `voice`); [promptId] rides on the analytics event when the
/// source is `recommended`.
///
/// [voiceNoteId] + [audioDurationMs] are non-null ONLY when [promptSource]
/// is `voice` — the composer mints a client-side UUID for every voice send
/// so the §18.3 voice-event group (chat_voice_recorded, chat_voice_transcribed,
/// chat_message_sent) links against the same key. Typed / recommended / retry
/// sends leave both null so `chat_message_sent` reports `voice_note_id: ''`.
class ChatMessageSubmitted extends ChatEvent {
  const ChatMessageSubmitted({
    required this.message,
    required this.promptSource,
    this.promptId,
    this.voiceNoteId,
    this.audioDurationMs,
  });

  final String message;
  final String promptSource;
  final String? promptId;

  /// Client-minted UUID that groups this send with the §18.3 voice events
  /// fired by the composer for the same recording. `null` for non-voice
  /// sends (the bloc maps null → `''` on the wire).
  final String? voiceNoteId;

  /// Length of the recording that produced [message], in milliseconds.
  /// `null` for non-voice sends. Reserved for future §18.3 correlation on
  /// the send event; not currently consumed by `chat_message_sent`.
  final int? audioDurationMs;

  @override
  List<Object?> get props => <Object?>[
    message,
    promptSource,
    promptId,
    voiceNoteId,
    audioDurationMs,
  ];
}

/// User tapped Retry on an inline error bubble. Re-fires the last user
/// message with the SAME cached `sessionId` (no duplicate user bubble).
class ChatRetryPressed extends ChatEvent {
  const ChatRetryPressed();
}

/// Transcript scrolled to top — load an older page via
/// `GET /chat/history?sessionId={…}&cursor={nextCursor}`.
class ChatOlderPageRequested extends ChatEvent {
  const ChatOlderPageRequested();
}

/// User tapped a content card in a bot reply. Carries the tap facts so the
/// bloc can fire the analytics event and navigate to the module's play/
/// preview route.
///
/// [positionIndex] is the 0-based order of the card within the flattened
/// reply-items list (surname order: aarti → bhajan → mantra → ringtone →
/// status → wallpaper). Defaults to 0 for widget call sites that don't yet
/// thread it through — TODO(TAM-N-chat-position-index).
class ChatContentCardTapped extends ChatEvent {
  const ChatContentCardTapped({
    required this.contentType,
    required this.contentId,
    required this.messageId,
    this.isProLocked = false,
    this.positionIndex = 0,
  });

  final String contentType;
  final String contentId;
  final String messageId;
  final bool isProLocked;
  final int positionIndex;

  @override
  List<Object?> get props => <Object?>[
    contentType,
    contentId,
    messageId,
    isProLocked,
    positionIndex,
  ];
}
