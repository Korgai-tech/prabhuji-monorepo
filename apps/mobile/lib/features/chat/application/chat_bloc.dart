// Named ctor params kept explicit — matches the convention on other blocs.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../api/api_client.dart';
import '../../../api/generated/openapi.dart';
import '../../../core/analytics.dart';
import '../chat_analytics.dart';
import '../data/chat_counters.dart';
import '../data/chat_repository.dart';
import 'chat_event.dart';
import 'chat_state.dart';

/// State-holder for the chat surface (TAM-164 + TAM-166 Phase 1 analytics
/// wiring).
///
/// Owns:
///
///  * The cold-mount `GET /chat/history` fetch and the transitions to
///    `ChatReady` / `ChatReadOnly` / `ChatHistoryFailed`.
///  * The session-id lifecycle: `null` on a fresh caller, populated by the
///    server on the first successful `POST /chat/messages`, echoed on every
///    subsequent send, cleared on `404` / `400 UNKNOWN_AGENT` for the silent
///    retry.
///  * Optimistic user + typing bubbles on send.
///  * Silent single retry on `400 UNKNOWN_AGENT` (session pinned to a variant
///    the user was remapped away from — spec §Composing & sending).
///  * Silent auto-retry on `404 NOT_FOUND` when the cached session id is
///    stale — cleared and re-sent without a `sessionId`.
///  * `403 CHAT_DISABLED` transition into `ChatReadOnly`.
///  * The Phase-1 analytics fires (PRD §§18.1–18.5) — every event uses the
///    `ChatEvents.*` name constants and `ChatEventProps.*` property keys.
///  * Session-lifecycle telemetry: [_sessionStartedAt] stamped on the first
///    `ChatReady` emit, [_messageCount] / [_contentTapCount] / [_retryCount]
///    incremented per action, all consumed and cleared by [onSessionClose].
/// Default for [ChatBloc.new]'s `requiresPro`: assume the paywall is ARMED.
///
/// A top-level function rather than an inline `() => true` so it can be named
/// in the docs and so the "unwired bloc gates" choice is greppable. See the
/// docblock on [ChatBloc._requiresPro] for why this defaults the opposite way
/// to the wire parser.
bool _paywallOnByDefault() => true;

class ChatBloc extends Bloc<ChatEvent, ChatState> {
  ChatBloc({
    required ChatRepository repository,
    required ChatCounters counters,
    required bool Function() isPro,
    bool Function() requiresPro = _paywallOnByDefault,
    Analytics? analytics,
  }) : _repository = repository,
       _counters = counters,
       _isPro = isPro,
       _requiresPro = requiresPro,
       _analytics = analytics,
       super(const ChatInitial()) {
    on<ChatStarted>(_onStarted);
    on<ChatEntered>(_onEntered);
    on<ChatExited>(_onExited);
    on<ChatMessageSubmitted>(_onSubmitted);
    on<ChatRetryPressed>(_onRetryPressed);
    on<ChatOlderPageRequested>(_onOlderPage);
    on<ChatContentCardTapped>(_onCardTapped);
    // Register as the process-wide current bloc so the shell scaffold can
    // reach us from outside the BlocProvider subtree — see
    // [notifyEntered] / [notifyExited]. The shell is above the chat
    // branch's BlocProvider in the widget tree, so it cannot use
    // `context.read<ChatBloc>()`; a static ref is the smallest bridge.
    _current = this;
  }

  /// Process-wide reference to the currently-live [ChatBloc]. Set in the
  /// constructor, cleared in [close]. There is only ever one ChatBloc at
  /// a time in production (the shell's chat branch owns it); tests
  /// construct their own and never touch these statics.
  static ChatBloc? _current;

  /// Called by the shell scaffold when the user swaps INTO the chat
  /// branch. No-ops when no bloc exists yet — the bloc's constructor
  /// self-dispatches [ChatEntered] on first mount, so a first-entry
  /// signal that races the bloc's creation is safely ignored.
  static void notifyEntered() {
    _current?.add(const ChatEntered());
  }

  /// Called by the shell scaffold when the user swaps OUT of the chat
  /// branch (to another tab, back to Home, etc). [exitReason] rides on
  /// `chat_closed` — vocabulary in [ChatExitReason]. No-ops when the
  /// bloc has no active session (already exited, or history never
  /// resolved), which naturally guards against double-fire when two exit
  /// paths race (e.g. PopScope + shell-detect on the same back-tap).
  static void notifyExited(String exitReason) {
    _current?.add(ChatExited(exitReason: exitReason));
  }

  @override
  Future<void> close() {
    if (_current == this) _current = null;
    return super.close();
  }

  final ChatRepository _repository;
  final ChatCounters _counters;

  /// Live entitlement closure (spec §Composing & sending — "the bloc must
  /// NOT hold a stale bool captured at construction"). Mirrors the
  /// discipline enforced by `paywall_gate.dart:36-43` — a Function() so the
  /// bool is re-read on every send, not captured once at bloc construction.
  final bool Function() _isPro;

  /// Whether the chat paywall is armed at all, per the server
  /// (`chatConfig.requiresPro` — see `features/chat/chat_paywall.dart`).
  /// A closure for the same reason [_isPro] is: the flag can flip under a
  /// running session when `/users/me` is refetched, and a bool captured at
  /// construction would keep gating a chat product has already made free.
  ///
  /// Defaults to [_paywallOnByDefault] — gate ARMED — which is the opposite
  /// default to the wire parser's. That asymmetry is deliberate. An unwired
  /// bloc is a coding mistake, and the two ways to be wrong are not
  /// symmetric: defaulting off makes a re-armed paywall silently leak a paid
  /// product with nothing to notice it, while defaulting on surfaces as a
  /// paywall nobody expected — loud, immediate, and reported within minutes.
  /// Production wires this explicitly in `core/router.dart`; the default
  /// exists so the test harnesses that predate the flag keep asserting the
  /// gated behaviour they were written for.
  final bool Function() _requiresPro;

  /// Fire-and-forget analytics — null in tests / when init failed (analytics
  /// must never break the app, per `apps/mobile/CLAUDE.md`).
  final Analytics? _analytics;

  /// Retained across the last send so [ChatRetryPressed] can re-fire the
  /// exact same body / prompt-source.
  ChatMessageSubmitted? _lastSubmission;

  /// The wall-clock at which the last `POST /chat/messages` fired — used to
  /// compute `response_time_ms` on the reply/failure events.
  DateTime? _lastSendStartedAt;

  // ---- Session-lifecycle telemetry (PRD §18.1 `chat_closed`) --------------

  /// Wall-clock stamped on the FIRST `ChatReady` emit of this mount. Read
  /// on [onSessionClose] to compute `session_duration_seconds`. `null` until
  /// the cold-mount history fetch settles into `ChatReady`.
  DateTime? _sessionStartedAt;

  /// One-based counter for messages the user has SENT this session. Bumped
  /// in `_onSubmitted` right before the fire, then rides on
  /// `message_number` / `is_followup` on every downstream event.
  int _messageCount = 0;

  /// Count of content-card taps this session. Reported as `content_tap_count`
  /// on `chat_closed`.
  int _contentTapCount = 0;

  /// Count of retry taps for the CURRENT in-flight send. Bumped in
  /// `_onRetryPressed`, reset to zero when a fresh `_onSubmitted` starts.
  /// Reported as `retry_count` on `chat_reply_failed`.
  int _retryCount = 0;

  /// A content-card tap opens a destination module; the screen dispose that
  /// follows should fire `chat_closed` with `exit_reason: content_opened`
  /// instead of the default `back`. `_onCardTapped` flips this flag and
  /// [onSessionClose] reads + clears it.
  String? _pendingExitReason;

  /// TODO(TAM-N-chat-content-context) — the shell tab-tap does not yet
  /// plumb an `entry_source` through the chat mount, so `chat_page_viewed`
  /// and the send events default to empty. Populate this from the launch
  /// payload once the shell wiring lands (content-page entry needs it too).
  static const String _kEntrySourceFallback = '';

  Future<void> _onStarted(ChatStarted event, Emitter<ChatState> emit) async {
    emit(const ChatLoadingHistory());
    try {
      final data = await _repository.getHistory();
      _emitReadyFromHistory(emit, data);
      // First-mount entry — the shell scaffold's `notifyEntered` was
      // dispatched BEFORE this bloc existed (static ref was null), so
      // dispatch it ourselves here. Subsequent tab-swaps-back-into-chat
      // are handled by the shell.
      add(const ChatEntered());
    } catch (_) {
      // Coarse error bucket only. The UI's retry affordance re-dispatches
      // `ChatStarted`; the bloc doesn't loop.
      emit(const ChatHistoryFailed('network'));
    }
  }

  /// Handler for [ChatEntered] — fires once per VISIT (not per bloc
  /// lifetime, contrast with the old `_firePageViewed`-in-`_onStarted`
  /// model that only fired on first mount). Resets the session-lifecycle
  /// counters so the paired [ChatExited] reports a duration/message-count
  /// scoped to THIS visit.
  ///
  /// Idempotent-ish: if the user tab-swaps INTO chat while already in a
  /// live session (e.g. duplicate entry signal, race), the state is
  /// cleared and a fresh session begins — the previous session's
  /// `chat_closed` is expected to have already fired via whichever exit
  /// path triggered.
  void _onEntered(ChatEntered event, Emitter<ChatState> emit) {
    // Clear any prior session's counters — a re-entry is a fresh visit,
    // NOT a continuation. `_pendingExitReason` from an aborted exit
    // sequence also clears here.
    _sessionStartedAt = DateTime.now();
    _messageCount = 0;
    _contentTapCount = 0;
    _retryCount = 0;
    _pendingExitReason = null;
    final openCount = _counters.incrementOpenCount();
    // TAM-167 — `chat_type` is stamped globally by [AnalyticsEnricher], which
    // reads the same [ChatCounters.savedChatType] store and falls back to
    // `'control'` when it's empty. The old conditional-per-event stamp here
    // is redundant and, worse, silently omitted the property for control
    // users (audit's "Missing" cause for `chat_closed`).
    unawaited(
      _analytics?.trackEvent(
        ChatEvents.chatPageViewed,
        properties: <String, Object?>{
          ChatEventProps.agentId: _currentAgentId(),
          // TODO(TAM-N-chat-content-context) — populate when the shell plumbs
          // the entry-source through the chat mount / launch payload.
          ChatEventProps.entrySource: _kEntrySourceFallback,
          ChatEventProps.openCount: openCount,
          // TODO(TAM-N-chat-content-context) — flip true and populate content
          // id when the content-page "Ask Prabhuji" entry lands.
          ChatEventProps.hasContentContext: false,
          ChatEventProps.contentId: '',
          // TAM-165 — the opener set the server actually served
          // (`general_v1` / `gita_v1`). Was a TODO blocked on the CMS
          // surface; `chatConfig.suggestionSetId` now carries it. Empty
          // string when history hasn't landed yet or the server omits it.
          ChatEventProps.suggestionSetId: _currentSuggestionSetId(),
        },
      ),
    );
  }

  /// Handler for [ChatExited] — fires once per VISIT and clears session
  /// state so the next [ChatEntered] starts fresh. Guarded on
  /// `_sessionStartedAt != null` (no active session = nothing to close)
  /// which is the ONLY guard against double-fire — replaces the old
  /// once-per-mount `_chatClosedFired` flag that blocked re-fires across
  /// tab-swap round-trips.
  ///
  /// The rules for which reason wins:
  ///  * `_pendingExitReason` (set by a content-card tap) beats the
  ///    caller's [ChatExited.exitReason]. So a card-tap sequence that
  ///    ends with the shell detecting `tab_switch` still reports
  ///    `content_opened`.
  void _onExited(ChatExited event, Emitter<ChatState> emit) {
    final startedAt = _sessionStartedAt;
    if (startedAt == null) return; // no active session — nothing to fire
    _sessionStartedAt = null; // gate against races on the same visit
    final resolvedExit = _pendingExitReason ?? event.exitReason;
    final durationSeconds = DateTime.now().difference(startedAt).inSeconds;
    // TAM-167 — `chat_type` stamped globally by [AnalyticsEnricher]. See the
    // note on the `chat_page_viewed` fire above for why the local conditional
    // stamp was removed.
    //
    // TAM-167 (2026-09-09) — `chat_session_id` was missing from this event
    // entirely (audit showed 0/16 non-null in the warehouse), which broke
    // every "join chat_closed back to the conversation it closed" query.
    // Reads from the live state at exit time via [_currentSessionId] —
    // `null` when the exit happens before `POST /chat/messages` has ever
    // succeeded on this visit (a fresh chat closed without a send has no
    // server-side session id yet).
    unawaited(
      _analytics?.trackEvent(
        ChatEvents.chatClosed,
        properties: <String, Object?>{
          ChatEventProps.agentId: _currentAgentId(),
          ChatEventProps.chatSessionId: _currentSessionId() ?? '',
          ChatEventProps.sessionDurationSeconds: durationSeconds,
          ChatEventProps.messageCount: _messageCount,
          ChatEventProps.contentTapCount: _contentTapCount,
          ChatEventProps.exitReason: resolvedExit,
          ChatEventProps.freeChatConsumed: _counters.isFreeChatConsumed(),
        },
      ),
    );
    // Clear derived counters too so a re-enter starts clean if
    // [ChatEntered] doesn't fire (defensive — normally the enter handler
    // clears these itself).
    _messageCount = 0;
    _contentTapCount = 0;
    _retryCount = 0;
    _pendingExitReason = null;
  }

  /// Resolve the currently-active agent id from state so every analytics
  /// fire can attribute the event to the RAGFlow agent this session is
  /// talking to (persona / gita / content, per user variant). Falls back
  /// to the persisted value in [ChatCounters] on pre-history states
  /// (ChatInitial / ChatLoadingHistory / failed) so drop-path fires (Bug 1)
  /// still carry attribution, and finally to `''` for a stage server /
  /// control-arm user that has never had an agent assigned.
  String _currentAgentId() {
    final s = state;
    if (s is ChatReady) return s.agentId;
    if (s is ChatReadOnly) return s.chatConfig.agentId ?? '';
    return _counters.savedAgentId() ?? '';
  }

  /// The opener set the server served for this session (TAM-165). Same
  /// state-first shape as [_currentAgentId]; `''` before `/chat/history`
  /// has landed, or when the server omits the field.
  String _currentSuggestionSetId() {
    final s = state;
    if (s is ChatReady) return s.chatConfig.suggestionSetId ?? '';
    if (s is ChatReadOnly) return s.chatConfig.suggestionSetId ?? '';
    return '';
  }

  /// Session id available at the current instant — used on drop-path
  /// `chat_message_sent` fires so the funnel can still group the intent
  /// with the (previous) conversation the user was inside when it dropped.
  /// Null for pre-history / failed-history states.
  String? _currentSessionId() {
    final s = state;
    if (s is ChatReady) return s.sessionId;
    if (s is ChatReadOnly) return s.sessionId;
    return null;
  }

  /// Buffered `chat_message_sent` props for the accepted send that is
  /// currently in flight. Built in `_onSubmitted` with `send_status`
  /// deliberately absent; emitted from `_applySendSuccess` (fills
  /// `chat_session_id` from the response + stamps `sent`) or
  /// `_applySendFailure` (stamps `failed`). Survives the UNKNOWN_AGENT /
  /// 404 silent retries because the retry re-enters `_postWithRecovery`
  /// but does NOT re-enter `_onSubmitted`. Cleared to null after emit so
  /// a follow-up retry can't double-fire.
  Map<String, Object?>? _pendingSendEventProps;

  /// Build the base `chat_message_sent` props for an intent to send. Kept
  /// here so drop-path fires (Bug 1) and the buffered accepted-send fire
  /// (Bug 4) share exactly the same shape — the only differences are
  /// [sendStatus] and (for accepted sends) the server-authoritative
  /// [chatSessionId] filled in by [_applySendSuccess].
  Map<String, Object?> _buildSendEventProps({
    required String trimmedBody,
    required String inputMethod,
    required String? voiceNoteId,
    required int messageNumber,
    required String sendStatus,
    String? chatSessionId,
  }) {
    // TAM-167 — `chat_type` stamped globally by [AnalyticsEnricher]. See the
    // note on the `chat_page_viewed` fire in [_onEntered] for why the local
    // conditional stamp was removed.
    return <String, Object?>{
      ChatEventProps.agentId: _currentAgentId(),
      // Raw text on the wire — product signed off 2026-09-03. Trimmed
      // matches what actually ships to the server.
      ChatEventProps.messageText: trimmedBody,
      ChatEventProps.messageNumber: messageNumber,
      ChatEventProps.inputMethod: inputMethod,
      // TAM-166 — voice sends carry the composer's client-minted UUID so
      // chat_voice_recorded / chat_voice_transcribed / chat_message_sent
      // group against one recording; typed / recommended / retry sends
      // pass no id and report `''`.
      ChatEventProps.voiceNoteId: voiceNoteId ?? '',
      ChatEventProps.isFollowup: messageNumber > 1,
      ChatEventProps.chatSessionId: chatSessionId ?? '',
      // TODO(TAM-N-chat-content-context) — flip true when the content-
      // page entry ships a content id through.
      ChatEventProps.hasContentContext: false,
      ChatEventProps.sendStatus: sendStatus,
    };
  }

  /// Fold a `GET /chat/history` response into either `ChatReady` (chat is
  /// live) or `ChatReadOnly` (variant was demoted but the user has an
  /// existing transcript). See spec §Read-only mode.
  void _emitReadyFromHistory(
    Emitter<ChatState> emit,
    ChatHistoryResponseData data,
  ) {
    // Server returns `previousChat` newest-FIRST; the bloc/widget layer
    // is easier to reason about with newest-LAST, so reverse here.
    final transcript = data.previousChat.reversed.toList(growable: false);
    final config = data.chatConfig;
    final agentId = config.agentId;
    if (!config.enabled || agentId == null || agentId.isEmpty) {
      // Read-only: transcript still visible, composer disabled.
      emit(
        ChatReadOnly(
          transcript: transcript,
          chatConfig: config,
          sessionId: data.sessionId,
        ),
      );
      return;
    }
    emit(
      ChatReady(
        transcript: transcript,
        chatConfig: config,
        agentId: agentId,
        sessionId: data.sessionId,
        nextCursor: data.nextCursor,
      ),
    );
  }

  Future<void> _onSubmitted(
    ChatMessageSubmitted event,
    Emitter<ChatState> emit,
  ) async {
    final current = state;
    final trimmed = event.message.trim();
    final inputMethod = _inputMethodFor(event.promptSource);
    final voiceNoteId = event.voiceNoteId;

    // Bug 1 — silent-drop visibility. Every early-return path below used
    // to swallow the send with no analytics; a voice attempt that landed
    // in ChatReadOnly (server 403 CHAT_DISABLED mid-session, or the
    // history hadn't hydrated yet) simply never fired chat_message_sent,
    // and the whole voice conversation disappeared from the funnel. We
    // now fire chat_message_sent on every intent — with `send_status`
    // encoding the outcome — so drops become measurable.
    void fireDrop(String reason) {
      unawaited(
        _analytics?.trackEvent(
          ChatEvents.chatMessageSent,
          properties: _buildSendEventProps(
            trimmedBody: trimmed,
            inputMethod: inputMethod,
            voiceNoteId: voiceNoteId,
            // Drop-path fires do NOT bump `_messageCount` — the counter
            // tracks accepted sends, so a dropped attempt should not
            // shift the numbering the next accepted send reports.
            messageNumber: _messageCount + 1,
            sendStatus: reason,
            chatSessionId: _currentSessionId(),
          ),
        ),
      );
    }

    if (current is! ChatReady) {
      fireDrop(ChatSendStatus.droppedNotReady);
      return;
    }
    if (trimmed.isEmpty) {
      fireDrop(ChatSendStatus.droppedEmpty);
      return;
    }
    if (trimmed.length > _kMessageMaxChars) {
      fireDrop(ChatSendStatus.droppedTooLong);
      return;
    }

    // TAM-164 — defensive Pro re-gate on send, now armed only when the server
    // asks for it (see [_requiresPro]). The bloc reads BOTH flags live, via
    // injected closures; a non-Pro user's send is rejected BEFORE any
    // optimistic bubble is enqueued and BEFORE `POST /chat/messages` fires.
    // Fire chat_message_sent with droppedPaywall so the funnel captures the
    // attempt separately from a "user tapped mic, changed their mind" no-op.
    //
    // Order matters for analytics as much as for logic: with the paywall off
    // nothing is dropped, so `droppedPaywall` stops appearing entirely rather
    // than firing against a paywall the user was never shown.
    if (_requiresPro() && !_isPro()) {
      fireDrop(ChatSendStatus.droppedPaywall);
      emit(
        current.copyWith(
          paywallRequiredNonce: DateTime.now().microsecondsSinceEpoch,
          clearError: true,
        ),
      );
      return;
    }

    _lastSubmission = ChatMessageSubmitted(
      message: trimmed,
      promptSource: event.promptSource,
      promptId: event.promptId,
      voiceNoteId: voiceNoteId,
      audioDurationMs: event.audioDurationMs,
    );
    // A fresh send resets the per-send retry counter.
    _retryCount = 0;

    // Optimistic user bubble + typing-indicator hint.
    final optimisticUser = _optimisticUserMessage(
      body: trimmed,
      sessionId: current.sessionId,
    );
    final optimisticTranscript = List<ChatMessage>.from(current.transcript)
      ..add(optimisticUser);
    emit(
      current.copyWith(
        transcript: optimisticTranscript,
        sendingMessage: trimmed,
        clearError: true,
      ),
    );

    // Bug 4 — buffer the chat_message_sent props here; fire them from
    // `_applySendSuccess` (with the server-authoritative `chat_session_id`
    // and `send_status: sent`) or from `_applySendFailure` (with
    // `send_status: failed`). Firing before the POST landed used to
    // stamp `chat_session_id: ''` on the very first message of every
    // conversation, breaking the "messages per conversation" and
    // "follow-up rate" measures. The buffer survives the UNKNOWN_AGENT /
    // 404 silent retries — those re-enter `_postWithRecovery` but not
    // this handler, so the buffered props stay intact until the eventual
    // response resolves.
    _messageCount += 1;
    _pendingSendEventProps = _buildSendEventProps(
      trimmedBody: trimmed,
      inputMethod: inputMethod,
      voiceNoteId: voiceNoteId,
      messageNumber: _messageCount,
      // Placeholder — `_applySendSuccess` / `_applySendFailure` overwrite
      // `send_status` before emit.
      sendStatus: ChatSendStatus.sent,
      chatSessionId: null,
    );

    _lastSendStartedAt = DateTime.now();
    await _postWithRecovery(
      emit,
      body: trimmed,
      optimisticIndex: optimisticTranscript.length - 1,
    );
  }

  /// Map `ChatMessageSubmitted.promptSource` — the bloc's internal source
  /// tag threaded through the widget layer — to the PRD's `input_method`
  /// closed vocabulary. `recommended` → `suggested_question`; `voice` →
  /// `voice` (TAM-166); `typed` and `retry` both surface as `typed` (a
  /// retry re-fires the exact prior body, which was itself typed).
  static String _inputMethodFor(String promptSource) {
    switch (promptSource) {
      case 'recommended':
        return ChatInputMethod.suggestedQuestion;
      case 'voice':
        return ChatInputMethod.voice;
      case 'typed':
      case 'retry':
      default:
        return ChatInputMethod.typed;
    }
  }

  /// One-based position that the NEXT `ChatMessageSubmitted` will occupy
  /// in this session. Read by the composer BEFORE dispatching a voice send
  /// so `chat_voice_recorded` / `chat_voice_transcribed` can report a
  /// `message_number` that matches the send's downstream `chat_message_sent`.
  ///
  /// Not a counter mutation — pure read.
  int get messageNumberForNextSend => _messageCount + 1;

  /// Do a `POST /chat/messages`, handle the well-known error codes, and
  /// (on success) splice the server-authoritative user + bot messages
  /// into the transcript replacing the optimistic user entry.
  Future<void> _postWithRecovery(
    Emitter<ChatState> emit, {
    required String body,
    required int optimisticIndex,
    bool suppressAgentRetry = false,
  }) async {
    final current = state;
    if (current is! ChatReady) return;
    try {
      final result = await _repository.sendMessage(
        message: body,
        agentId: current.agentId,
        sessionId: current.sessionId,
      );
      _applySendSuccess(emit, result, optimisticIndex: optimisticIndex);
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      final code = _extractErrorCode(e.response?.data);

      // Silent single retry on UNKNOWN_AGENT — clear the cached session id
      // (the server pinned it to an agent this user no longer has) and
      // re-send once without a sessionId. Second failure falls through to
      // the generic error path.
      if (!suppressAgentRetry &&
          status == 400 &&
          code == 'UNKNOWN_AGENT' &&
          current.sessionId != null) {
        emit(current.copyWith(clearSessionId: true));
        await _postWithRecovery(
          emit,
          body: body,
          optimisticIndex: optimisticIndex,
          suppressAgentRetry: true,
        );
        return;
      }

      // 404 → stale session id. Clear + retry ONCE without a sessionId.
      if (!suppressAgentRetry && status == 404 && current.sessionId != null) {
        emit(current.copyWith(clearSessionId: true));
        await _postWithRecovery(
          emit,
          body: body,
          optimisticIndex: optimisticIndex,
          suppressAgentRetry: true,
        );
        return;
      }

      // 403 CHAT_DISABLED — variant demoted mid-conversation. Refresh
      // the screen into read-only mode. The send itself never landed, so
      // flush the buffered chat_message_sent with `failed` before the
      // state transition wipes the ability to attribute it.
      if (status == 403 && code == 'CHAT_DISABLED') {
        _flushPendingSendEvent(sendStatus: ChatSendStatus.failed);
        await _refreshIntoReadOnly(emit);
        return;
      }

      _applySendFailure(
        emit,
        errorKind: _errorKindForStatus(status),
        httpStatus: status,
        errorCode: code,
      );
    } catch (_) {
      _applySendFailure(emit, errorKind: 'network');
    }
  }

  /// Emit the buffered `chat_message_sent` event (Bug 4). Called from
  /// `_applySendSuccess` on POST success and `_applySendFailure` on POST
  /// failure. Idempotent — clears the buffer after emit so a follow-up
  /// retry cannot double-fire. When [chatSessionId] is provided it
  /// overrides the (usually null) placeholder stored at buffer time; the
  /// success path passes the server-authoritative id, failures leave it
  /// blank (matching the "we never got a session back" reality).
  void _flushPendingSendEvent({
    required String sendStatus,
    String? chatSessionId,
  }) {
    final buffered = _pendingSendEventProps;
    if (buffered == null) return;
    _pendingSendEventProps = null;
    final props = Map<String, Object?>.from(buffered);
    props[ChatEventProps.sendStatus] = sendStatus;
    if (chatSessionId != null) {
      props[ChatEventProps.chatSessionId] = chatSessionId;
    }
    unawaited(
      _analytics?.trackEvent(ChatEvents.chatMessageSent, properties: props),
    );
  }

  void _applySendSuccess(
    Emitter<ChatState> emit,
    SendMessageResult result, {
    required int optimisticIndex,
  }) {
    final current = state;
    if (current is! ChatReady) return;
    final transcript = List<ChatMessage>.from(current.transcript);
    // Replace the optimistic user entry with the server-authoritative
    // user message + append the bot reply. Defensive: if the transcript
    // has been re-emitted underneath us (pagination, error clears) fall
    // back to a plain append so we never crash on an out-of-range index.
    if (optimisticIndex >= 0 && optimisticIndex < transcript.length) {
      transcript[optimisticIndex] = result.userMessage;
    } else {
      transcript.add(result.userMessage);
    }
    transcript.add(result.botMessage);
    emit(
      current.copyWith(
        transcript: transcript,
        sessionId: result.sessionId,
        clearSendingMessage: true,
        clearError: true,
      ),
    );
    // Bug 4 — flush the buffered chat_message_sent with the server-
    // authoritative session id (was null / '' on the first message of a
    // conversation before this rework). Ordered BEFORE the reply fire so
    // the funnel sees `sent` → `reply_received` in wall-clock order.
    _flushPendingSendEvent(
      sendStatus: ChatSendStatus.sent,
      chatSessionId: result.sessionId,
    );
    _fireReplyReceived(result);
    _fireDistressShownIfFlagged(result);
    _fireIntentOutcomeForReply(result);
    _fireContentSuggestedForReply(result);
  }

  /// PRD §18.2 `chat_reply_received`. Computes response_time_ms from the
  /// wall-clock stamped at the send that produced this reply.
  void _fireReplyReceived(SendMessageResult result) {
    final latencyMs = _computeAndClearLatencyMs();
    final bot = result.botMessage;
    final content = bot.content;
    final contentCount =
        content.aarti.length +
        content.bhajan.length +
        content.mantra.length +
        content.ringtone.length +
        content.status.length +
        content.wallpaper.length;
    unawaited(
      _analytics?.trackEvent(
        ChatEvents.chatReplyReceived,
        properties: <String, Object?>{
          ChatEventProps.agentId: _currentAgentId(),
          // TAM-167 — the full reply body is no longer emitted on the wire
          // (was `ChatEventProps.replyText: bot.message`). The 2026-09-03
          // sign-off that put it here has been superseded: the reply text
          // sits alongside privacy-sensitive user context on RAG replies
          // and does not belong in Amplitude/Firebase/Meta event streams.
          // The bot response is still readable from the CMS conversation
          // viewer (which reads the stored transcript directly, not
          // event props) so no downstream tooling loses signal.
          ChatEventProps.messageNumber: _messageCount,
          // TAM-165 — the API now publishes the content agent's own envelope
          // instead of discarding it. Empty-string rather than null on the
          // absent path, matching the rest of this map.
          //
          // These four are NULL on the gita / kuldevta arms and that is
          // correct, not a gap to chase: those agents reply in prose and have
          // no envelope to report. `matched_tags` is deliberately NOT the
          // resolved `content` list — a tag the agent matched but our id map
          // cannot place survives only here, so tag-present-but-content-absent
          // is a catalogue gap worth counting.
          ChatEventProps.matchedTags: bot.matchedTags,
          ChatEventProps.recommendedDeity: bot.recommendedDeity ?? '',
          ChatEventProps.jaapCount: bot.jaapCount ?? '',
          ChatEventProps.intentType: bot.intentType ?? '',
          // Unlike the four above this is server-computed and arm-independent
          // — `false`, never null, on an ordinary turn.
          ChatEventProps.distressDetected: bot.distressDetected ?? false,
          ChatEventProps.contentCount: contentCount,
          // TODO(TAM-N-phase2-backend) — `model_id` stays empty: the agent's
          // envelope carries no model identifier, so there is nothing to read
          // yet (TAM-165).
          ChatEventProps.modelId: '',
          ChatEventProps.responseTimeMs: latencyMs,
          ChatEventProps.chatSessionId: result.sessionId,
        },
      ),
    );
  }

  /// `chat_distress_shown` (TAM-167 row 3.6, unblocked by TAM-165) — the
  /// reply that rendered was the API's crisis card, not the agent's answer.
  ///
  /// Fires ALONGSIDE `chat_reply_received`, never instead of it: a distress
  /// turn is still a reply, and suppressing it would leave a hole in the
  /// sent→received funnel precisely where the conversation mattered most.
  /// Both events carry `distress_detected` / the dedicated name, so either
  /// can be filtered on.
  ///
  /// No `trigger_reason` yet — see [ChatEvents.chatDistressShown].
  ///
  /// `chat_type` rides in free from [AnalyticsEnricher].
  void _fireDistressShownIfFlagged(SendMessageResult result) {
    if (result.botMessage.distressDetected != true) return;
    unawaited(
      _analytics?.trackEvent(
        ChatEvents.chatDistressShown,
        properties: <String, Object?>{
          ChatEventProps.agentId: _currentAgentId(),
          ChatEventProps.chatSessionId: result.sessionId,
          ChatEventProps.messageNumber: _messageCount,
        },
      ),
    );
  }

  /// `chat_no_match` / `chat_out_of_scope` (TAM-167 rows 3.5, §18.2) — both
  /// were "blocked on Phase 2 backend" until TAM-165 published the agent's
  /// `intent_type`. At most ONE fires per reply, and only on the content
  /// arm: the prose agents report no intent at all, so `intentType` is null
  /// for them and neither event fires. That is a property of those agents,
  /// not a gap.
  ///
  /// A distress turn never reaches here — the crisis card replaces the
  /// agent's reply, so its `intentType` is null.
  void _fireIntentOutcomeForReply(SendMessageResult result) {
    final bot = result.botMessage;
    final intent = bot.intentType;
    if (intent == null || intent.isEmpty) return;
    final questionText = result.userMessage.message;
    if (intent == ChatIntentType.noMatch) {
      unawaited(
        _analytics?.trackEvent(
          ChatEvents.chatNoMatch,
          properties: <String, Object?>{
            ChatEventProps.agentId: _currentAgentId(),
            ChatEventProps.chatSessionId: result.sessionId,
            ChatEventProps.questionText: questionText,
          },
        ),
      );
      return;
    }
    if (intent == ChatIntentType.outOfScope) {
      unawaited(
        _analytics?.trackEvent(
          ChatEvents.chatOutOfScope,
          properties: <String, Object?>{
            ChatEventProps.agentId: _currentAgentId(),
            ChatEventProps.chatSessionId: result.sessionId,
            ChatEventProps.questionText: questionText,
            // `decline_category` IS the reason a decline happened — this is
            // the event it actually describes (unlike `chat_distress_shown`,
            // where it is null by construction).
            ChatEventProps.reason: bot.declineCategory ?? '',
          },
        ),
      );
    }
  }

  /// PRD §18.4 `chat_content_suggested` — one fire per content item in a
  /// reply. Iterates the six content buckets in the same surname order the
  /// transcript widget renders them (aarti → bhajan → mantra → ringtone →
  /// status → wallpaper) so `position_index` matches on-screen order.
  void _fireContentSuggestedForReply(SendMessageResult result) {
    final analytics = _analytics;
    if (analytics == null) return;
    final agentId = _currentAgentId();
    final content = result.botMessage.content;
    final buckets = <String, List<ChatContentItem>>{
      ChatContentType.aarti: content.aarti,
      ChatContentType.bhajan: content.bhajan,
      ChatContentType.mantra: content.mantra,
      ChatContentType.ringtone: content.ringtone,
      ChatContentType.status: content.status,
      ChatContentType.wallpaper: content.wallpaper,
      ChatContentType.horoscope: content.horoscope,
    };
    var position = 0;
    buckets.forEach((type, items) {
      for (final item in items) {
        unawaited(
          analytics.trackEvent(
            ChatEvents.chatContentSuggested,
            properties: <String, Object?>{
              ChatEventProps.agentId: agentId,
              ChatEventProps.contentId: item.id,
              ChatEventProps.contentType: type,
              // 1:1 with content_type today — destination module is the same
              // as the content type.
              ChatEventProps.destinationModule: type,
              ChatEventProps.positionIndex: position,
              // TODO(TAM-N-phase2-backend) — server-side matched tag list.
              ChatEventProps.matchedTags: const <String>[],
              ChatEventProps.messageNumber: _messageCount,
            },
          ),
        );
        position += 1;
      }
    });
  }

  void _applySendFailure(
    Emitter<ChatState> emit, {
    required String errorKind,
    int? httpStatus,
    String? errorCode,
  }) {
    final current = state;
    if (current is! ChatReady) return;
    emit(current.copyWith(clearSendingMessage: true, error: errorKind));
    // Bug 4 — the buffered chat_message_sent goes out with `failed` so
    // the funnel sees "user tried, server didn't accept" instead of a
    // ghost intent that never resolves. Ordered BEFORE reply_failed for
    // the same reason success is ordered before reply_received: wall-
    // clock order at the funnel matches user experience.
    _flushPendingSendEvent(sendStatus: ChatSendStatus.failed);
    _fireReplyFailed(httpStatus: httpStatus, errorCode: errorCode);
  }

  /// PRD §18.2 `chat_reply_failed`.
  void _fireReplyFailed({
    required int? httpStatus,
    required String? errorCode,
  }) {
    final latencyMs = _computeAndClearLatencyMs();
    unawaited(
      _analytics?.trackEvent(
        ChatEvents.chatReplyFailed,
        properties: <String, Object?>{
          ChatEventProps.agentId: _currentAgentId(),
          ChatEventProps.failureStage: ChatFailureStage.fromHttpStatus(
            httpStatus,
          ),
          ChatEventProps.errorCode: errorCode ?? '',
          ChatEventProps.responseTimeMs: latencyMs,
          ChatEventProps.retryCount: _retryCount,
        },
      ),
    );
  }

  int? _computeAndClearLatencyMs() {
    final startedAt = _lastSendStartedAt;
    _lastSendStartedAt = null;
    if (startedAt == null) return null;
    return DateTime.now().difference(startedAt).inMilliseconds;
  }

  /// Refresh `/chat/history` and settle into `ChatReadOnly` (or `ChatReady`
  /// if the variant is somehow re-enabled between the failing send and
  /// this refresh).
  Future<void> _refreshIntoReadOnly(Emitter<ChatState> emit) async {
    final current = state;
    final sessionId = current is ChatReady ? current.sessionId : null;
    try {
      final data = await _repository.getHistory(sessionId: sessionId);
      _emitReadyFromHistory(emit, data);
    } catch (_) {
      if (current is ChatReady) {
        emit(
          ChatReadOnly(
            transcript: current.transcript,
            chatConfig: current.chatConfig,
            sessionId: current.sessionId,
          ),
        );
      } else {
        emit(const ChatHistoryFailed('chat_disabled'));
      }
    }
  }

  Future<void> _onRetryPressed(
    ChatRetryPressed event,
    Emitter<ChatState> emit,
  ) async {
    final current = state;
    final last = _lastSubmission;
    if (current is! ChatReady || last == null) return;
    _retryCount += 1;
    // Clear the previous error band before re-firing so the UI updates
    // its affordance state.
    emit(current.copyWith(clearError: true));
    // The optimistic user bubble from the failed send is still in the
    // transcript — don't re-enqueue it. Re-post with the current session
    // + agent, targeting the tail of the transcript as the "optimistic"
    // slot (the last user bubble the failed send left behind).
    final optimisticIndex = current.transcript.length - 1;
    emit(current.copyWith(sendingMessage: last.message, clearError: true));
    _lastSendStartedAt = DateTime.now();
    await _postWithRecovery(
      emit,
      body: last.message,
      optimisticIndex: optimisticIndex,
    );
  }

  Future<void> _onOlderPage(
    ChatOlderPageRequested event,
    Emitter<ChatState> emit,
  ) async {
    final current = state;
    if (current is! ChatReady) return;
    if (current.paginating) return;
    final cursor = current.nextCursor;
    final sessionId = current.sessionId;
    if (cursor == null || sessionId == null) return;
    emit(current.copyWith(paginating: true));
    try {
      final page = await _repository.getHistory(
        sessionId: sessionId,
        cursor: cursor,
      );
      // Older messages come newest-FIRST — reverse and PREPEND so the
      // widget's reverse: true list treats them as older than what is
      // already rendered.
      final older = page.previousChat.reversed.toList(growable: false);
      final newTranscript = <ChatMessage>[...older, ...current.transcript];
      emit(
        current.copyWith(
          transcript: newTranscript,
          nextCursor: page.nextCursor,
          clearNextCursor: page.nextCursor == null,
          paginating: false,
        ),
      );
      // PRD §18 removed the `chat_pagination_loaded` event — pagination is
      // now silent (the reply-received / suggested fires already give us
      // the visibility we need for the conversation funnel).
    } catch (_) {
      // Pagination failure is silent — the already-loaded head keeps
      // rendering, and the user can pull-to-top again.
      emit(current.copyWith(paginating: false));
    }
  }

  Future<void> _onCardTapped(
    ChatContentCardTapped event,
    Emitter<ChatState> emit,
  ) async {
    // The `router.push` to the module's play/preview route happens at the
    // card widget's tap handler (it needs a `BuildContext`, not something
    // the bloc can hold). This handler owns the analytics fire so it lands
    // regardless of which surface the widget navigates into.
    _contentTapCount += 1;
    // The tap will pop the chat screen — flag so the follow-up dispose
    // fires `chat_closed` with the right exit reason.
    //
    // ONLY for a Pro user, because only a Pro user's tap opens content. A
    // free user's tap opens the PAYWALL, and the screen dispatches
    // `ChatExited(paywall_opened)` for it — which this field would silently
    // override, since `_onExited` gives `_pendingExitReason` precedence over
    // the event's own reason. Setting it unconditionally would file every
    // gated tap in the funnel as `content_opened`, i.e. as the one thing
    // that did not happen.
    if (_isPro()) _pendingExitReason = ChatExitReason.contentOpened;
    unawaited(
      _analytics?.trackEvent(
        ChatEvents.chatContentClicked,
        properties: <String, Object?>{
          ChatEventProps.agentId: _currentAgentId(),
          ChatEventProps.contentId: event.contentId,
          ChatEventProps.contentType: event.contentType,
          // 1:1 with content_type — destination module is the same as the
          // content type.
          ChatEventProps.destinationModule: event.contentType,
          // TODO(TAM-N-chat-position-index) — thread the card's within-reply
          // position through `ChatContentCardTapped`; the widget currently
          // doesn't pass it, so this rides as 0.
          ChatEventProps.positionIndex: event.positionIndex,
          // TODO(TAM-N-phase2-backend) — matched tags ride on Phase 2.
          ChatEventProps.matchedTags: const <String>[],
          // TODO(TAM-N-phase2-backend) — jaap_count is a Phase 2 field.
          ChatEventProps.jaapCount: '',
        },
      ),
    );
  }

  /// Back-compat shim — screens still call `bloc.onSessionClose(...)` from
  /// dispose / PopScope / app-bar back / lifecycle observer; this now
  /// funnels into the event handler so every path goes through the same
  /// [ChatExited] gate. The `_sessionStartedAt != null` guard in
  /// [_onExited] is what prevents double-fire (was `_chatClosedFired`).
  void onSessionClose({required String exitReason}) {
    add(ChatExited(exitReason: exitReason));
  }

  ChatMessage _optimisticUserMessage({
    required String body,
    required String? sessionId,
  }) {
    return ChatMessage(
      id:
          _kOptimisticIdPrefix +
          DateTime.now().microsecondsSinceEpoch.toString(),
      sessionId: sessionId ?? _kOptimisticSessionSentinel,
      role: ChatMessageRoleEnum.user,
      message: body,
      confidence: null,
      content: ChatContentGroups(
        aarti: const <ChatContentItem>[],
        bhajan: const <ChatContentItem>[],
        mantra: const <ChatContentItem>[],
        ringtone: const <ChatContentItem>[],
        status: const <ChatContentItem>[],
        wallpaper: const <ChatContentItem>[],
      ),
      createdAt: DateTime.now().toUtc(),
    );
  }

  /// Map a HTTP status to a coarse client-side error-kind bucket (kept for
  /// state-band routing — `network` / `server_5xx` are the retryable bands
  /// the UI's inline error surfaces). The analytics fire uses
  /// [ChatFailureStage.fromHttpStatus] instead (the PRD vocabulary is
  /// different from the client error-kind).
  static String _errorKindForStatus(int? status) {
    if (status == null) return 'network';
    if (status >= 500 && status <= 599) return 'server_5xx';
    if (status == 400) return 'validation';
    if (status == 403) return 'chat_disabled';
    return 'network';
  }

  static String? _extractErrorCode(Object? body) {
    if (body is Map) {
      final code = body['errorCode'];
      return code is String ? code : null;
    }
    return null;
  }

  /// Server-side length ceiling (`chat.schemas.ts:73`). Client mirrors it
  /// as a UX affordance; the Zod check is the authoritative fence.
  static const int _kMessageMaxChars = 4000;

  /// Prefix so optimistic ids are visually distinguishable in traces
  /// before the server-authoritative id lands on 200. Never leaves the
  /// device.
  static const String _kOptimisticIdPrefix = 'optimistic-';

  /// Placeholder for the optimistic entry's `sessionId` field before the
  /// server has created a real session. Never leaves the device — the
  /// entry is replaced with the server-authoritative message on 200.
  static const String _kOptimisticSessionSentinel = 'pending-session';
}

/// Convenience for callers that need to differentiate an
/// `ApiException`-shaped repository throw from a raw dio throw.
bool isChatApiException(Object err) => err is ApiException;
