import 'package:equatable/equatable.dart';

import '../../../api/generated/openapi.dart';

/// State surface for [ChatBloc] (TAM-164, spec §Frontend Tasks item 2).
///
/// One sealed hierarchy — each variant is a distinct render mode:
///
///  * [ChatInitial] — bloc constructed but `ChatStarted` not yet handled.
///  * [ChatLoadingHistory] — the cold-mount `GET /chat/history` is inflight.
///  * [ChatReady] — the transcript + composer are usable. Carries the
///    live [ChatScreenConfig] (title / subtitle / recommendedMessages),
///    the cached `sessionId` (may be `null` for a fresh caller), an
///    optional `sendingMessage` (typing-indicator hint), and an optional
///    `error` band (surfaces the last inline-error bubble's kind for the
///    Retry affordance).
///  * [ChatReadOnly] — `chatConfig.enabled == false` on the history
///    response (variant was demoted); the transcript is visible but the
///    composer is disabled.
///  * [ChatHistoryFailed] — the cold-mount fetch failed. Bloc surfaces
///    a retry affordance; nothing else renders.
sealed class ChatState extends Equatable {
  const ChatState();

  @override
  List<Object?> get props => const <Object?>[];
}

class ChatInitial extends ChatState {
  const ChatInitial();
}

class ChatLoadingHistory extends ChatState {
  const ChatLoadingHistory();
}

/// The chat surface is usable — transcript rendered, composer live.
///
/// [transcript] is stored NEWEST-LAST for widget-side simplicity: the
/// widget renders a `ListView.builder(reverse: true)` and walks the list
/// tail-to-head, so appending a new message is a simple `[...state,
/// newMessage]`. The server's `GET /chat/history` returns messages
/// NEWEST-FIRST (spec §API Contract) — the bloc reverses that order at
/// the boundary.
class ChatReady extends ChatState {
  const ChatReady({
    required this.transcript,
    required this.chatConfig,
    required this.agentId,
    this.sessionId,
    this.nextCursor,
    this.paginating = false,
    this.sendingMessage,
    this.error,
    this.paywallRequiredNonce,
  });

  final List<ChatMessage> transcript;
  final ChatScreenConfig chatConfig;

  /// Agent id used for every send in this session. Pinned at cold-mount
  /// from `chatConfig.agentId`; on `400 UNKNOWN_AGENT` recovery the bloc
  /// re-reads it fresh from the retry's `/chat/history` config.
  final String agentId;

  /// The currently-active session id. `null` on a fresh caller before
  /// the first send; the server assigns one on the first
  /// `POST /chat/messages` and it is echoed forever after.
  final String? sessionId;

  /// The keyset cursor for the NEXT older page, or `null` when the
  /// history head has been reached.
  final String? nextCursor;

  /// True while a `GET /chat/history?cursor=…` is inflight.
  final bool paginating;

  /// The user-authored body currently pending on the wire. Non-null while
  /// the request is inflight (renders the typing-indicator bubble).
  final String? sendingMessage;

  /// Last inline-error kind (from [ChatErrorKind]) — non-null when the
  /// send failed and the user sees a Retry affordance.
  final String? error;

  /// Non-null one-shot marker that flips every time the bloc's defensive
  /// Pro re-gate blocks a send (spec §Composing & sending). The screen's
  /// `BlocListener` watches this field and, on a change, calls
  /// `PaywallGate.run(entrySource: PaywallEntrySource.chat, …)`.
  ///
  /// The value itself is opaque (a microseconds-since-epoch marker) — the
  /// listener only cares that it CHANGED. Using a nonce (rather than a
  /// `bool paywallRequired`) means two consecutive blocked sends still
  /// re-trigger the listener without needing an ack event to reset the
  /// flag.
  final int? paywallRequiredNonce;

  ChatReady copyWith({
    List<ChatMessage>? transcript,
    ChatScreenConfig? chatConfig,
    String? agentId,
    String? sessionId,
    bool clearSessionId = false,
    String? nextCursor,
    bool clearNextCursor = false,
    bool? paginating,
    String? sendingMessage,
    bool clearSendingMessage = false,
    String? error,
    bool clearError = false,
    int? paywallRequiredNonce,
  }) {
    return ChatReady(
      transcript: transcript ?? this.transcript,
      chatConfig: chatConfig ?? this.chatConfig,
      agentId: agentId ?? this.agentId,
      sessionId: clearSessionId ? null : (sessionId ?? this.sessionId),
      nextCursor: clearNextCursor ? null : (nextCursor ?? this.nextCursor),
      paginating: paginating ?? this.paginating,
      sendingMessage: clearSendingMessage
          ? null
          : (sendingMessage ?? this.sendingMessage),
      error: clearError ? null : (error ?? this.error),
      paywallRequiredNonce: paywallRequiredNonce ?? this.paywallRequiredNonce,
    );
  }

  @override
  List<Object?> get props => <Object?>[
    transcript,
    chatConfig,
    agentId,
    sessionId,
    nextCursor,
    paginating,
    sendingMessage,
    error,
    paywallRequiredNonce,
  ];
}

/// The user's variant was demoted while they had a prior conversation —
/// `chatConfig.enabled == false` on the history response but
/// `previousChat` is non-empty. Transcript is visible, composer disabled.
/// See spec §Read-only mode.
class ChatReadOnly extends ChatState {
  const ChatReadOnly({
    required this.transcript,
    required this.chatConfig,
    this.sessionId,
  });

  final List<ChatMessage> transcript;
  final ChatScreenConfig chatConfig;
  final String? sessionId;

  @override
  List<Object?> get props => <Object?>[transcript, chatConfig, sessionId];
}

/// The cold-mount history fetch failed and the bloc has no transcript to
/// render. Surface a retry affordance from this state.
class ChatHistoryFailed extends ChatState {
  const ChatHistoryFailed(this.errorKind);

  final String errorKind;

  @override
  List<Object?> get props => <Object?>[errorKind];
}
