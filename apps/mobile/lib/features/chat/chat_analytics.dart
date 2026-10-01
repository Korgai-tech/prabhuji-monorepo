/// Chat analytics — event names, property keys, and closed-vocabulary
/// value enums for every event in PRD §§18.1–18.5 (TAM-164 + TAM-166).
///
/// The 24 events split across five sections:
///
///  * §18.1 Entry and screen — chat_button_clicked, chat_page_viewed,
///    chat_closed (+ generic paywall_viewed with chat attribution).
///  * §18.2 Conversation — suggested_question_clicked, message_sent,
///    reply_received, reply_failed, no_match, out_of_scope.
///  * §18.3 Voice notes — voice_clicked, voice_permission_result,
///    voice_recorded, voice_cancelled, voice_upload_failed,
///    voice_transcribed, voice_transcription_failed.
///  * §18.4 Content suggestions and hand-off — content_suggested,
///    content_clicked, destination_reached, content_chat_button_clicked
///    (last one fires from the content module, not chat).
///  * §18.5 Feedback — feedback_prompt_viewed, feedback_submitted,
///    feedback_dismissed.
///
/// ## Discipline
///
///  * Events: `snake_case`, prefixed `chat_` (or `content_chat_` for
///    the one that fires from a content module), one verb-past-tense
///    per action (matches `docs/ANALYTICS-FLUTTER-GUIDE.md`).
///  * Properties: `snake_case`, action-scoped facts only. Facts about
///    the USER go on `identifyUser`, not on these events.
///  * PRD (2026-09-03) locks raw text on the wire — `message_text`,
///    `question_text`, `transcript_text`, `comment_text` ship as the
///    family / user typed them so the CMS conversation viewer and the
///    alias table have the raw signal. Empty string (never null) when
///    a field would otherwise be blank. **`reply_text` was stripped by
///    TAM-167 (2026-09-09)** — bot replies are no longer emitted on
///    event streams; the CMS conversation viewer reads them from the
///    stored transcript directly.
class ChatEvents {
  ChatEvents._();

  // ---- §18.1 Entry and screen ------------------------------------------

  /// User taps any chat entry affordance (bottom nav today; Home /
  /// content-page shortcuts if / when those surfaces ship). Fires BEFORE
  /// the paywall gate resolves, so a non-Pro-user's tap that opens the
  /// paywall still shows up in the funnel.
  static const String chatButtonClicked = 'chat_button_clicked';

  /// Chat screen becomes visible and interactive.
  static const String chatPageViewed = 'chat_page_viewed';

  /// User leaves the chat screen. Fires once per mount, on dispose.
  static const String chatClosed = 'chat_closed';

  // ---- §18.2 Conversation ---------------------------------------------

  /// User taps a suggested question chip instead of typing.
  static const String chatSuggestedQuestionClicked =
      'chat_suggested_question_clicked';

  /// User sends a message (typed, voice, or suggested). Fires
  /// optimistically — before the reply lands — so send-vs-reply drop-off
  /// is measurable.
  static const String chatMessageSent = 'chat_message_sent';

  /// A reply renders. Fires on 200 from `POST /chat/messages`.
  static const String chatReplyReceived = 'chat_reply_received';

  /// A reply could not be produced.
  static const String chatReplyFailed = 'chat_reply_failed';

  /// The reply that rendered was the CRISIS CARD, not the agent's answer.
  /// Fires from the same `POST /chat/messages` 200 as [chatReplyReceived],
  /// keyed off the server's `botMessage.distressDetected` (TAM-165).
  ///
  /// Fires IN ADDITION to [chatReplyReceived], not instead of it — a distress
  /// turn is still a reply, and suppressing the reply event would put a hole
  /// in the sent→received funnel exactly where the conversation mattered
  /// most. Product call, 2026-09-09.
  ///
  /// Works on ALL THREE arms. The crisis card is served by the API's own
  /// safety layer (`crisis-detection.service.ts`), not by an agent, and
  /// `distressDetected` is computed server-side from the stored reply text
  /// rather than parsed out of the content agent's JSON envelope — so unlike
  /// [ChatEventProps.matchedTags] and friends it is NOT null on the gita /
  /// kuldevta arms.
  ///
  /// `trigger_reason` is deliberately ABSENT for now. The server classifies
  /// every crisis turn as `sentinel` / `content_policy_self_harm` /
  /// `content_policy_unknown` (`CrisisReason`) but does not put it on the
  /// wire, and the only currently-exposed candidate — `decline_category` —
  /// is null on 100% of distress turns by construction (the agent's envelope
  /// is discarded and replaced by the canned crisis prose, which parses as
  /// prose-only). Add the property when the server exposes the reason;
  /// do NOT substitute a field that is structurally always empty.
  static const String chatDistressShown = 'chat_distress_shown';

  /// No usable tag match was found for the query. Fires on a reply whose
  /// `intentType == 'no_match'` (TAM-165 unblocked this — was "Blocked on
  /// Phase 2 backend").
  static const String chatNoMatch = 'chat_no_match';

  /// The chat declines because the question is outside what it supports.
  /// Fires on a reply whose `intentType == 'out_of_scope'` (TAM-165
  /// unblocked this — was "Blocked on Phase 2 backend").
  static const String chatOutOfScope = 'chat_out_of_scope';

  // ---- §18.3 Voice notes ----------------------------------------------

  /// User taps the microphone in the chat input bar.
  static const String chatVoiceClicked = 'chat_voice_clicked';

  /// User responds to the microphone permission prompt.
  static const String chatVoicePermissionResult =
      'chat_voice_permission_result';

  /// User finishes recording and sends the voice note. Blocked on the
  /// voice subsystem (Phase 3).
  static const String chatVoiceRecorded = 'chat_voice_recorded';

  /// User discards a recording instead of sending it. Blocked on the
  /// voice subsystem (Phase 3).
  static const String chatVoiceCancelled = 'chat_voice_cancelled';

  /// The audio could not be uploaded. Blocked on the voice subsystem
  /// (Phase 3).
  static const String chatVoiceUploadFailed = 'chat_voice_upload_failed';

  /// Transcription completes on our side. Blocked on the voice subsystem
  /// (Phase 3).
  static const String chatVoiceTranscribed = 'chat_voice_transcribed';

  /// Transcription produced nothing usable. Blocked on the voice
  /// subsystem (Phase 3).
  static const String chatVoiceTranscriptionFailed =
      'chat_voice_transcription_failed';

  // ---- In-thread intro video (TAM-177) --------------------------------

  /// The in-thread intro video begins playing — on autoplay when the chat
  /// opens, or when the user taps a paused card to resume.
  ///
  /// Properties: `agent_id`, `video_id`, `trigger`
  /// ([ChatVideoStartTrigger]), `position_ms`, `video_duration_ms`.
  ///
  /// NOTE: `chat_type` is what separates Content Chat, Gita Chat and
  /// Kuldevta on this event — and it is stamped GLOBALLY by
  /// `AnalyticsEnricher`. Do NOT pass it from the call site. See the
  /// #EXPORT_CRITICAL note on [ChatVideoStartTrigger].
  static const String chatVideoStarted = 'chat_video_started';

  /// The in-thread intro video stops playing, for any reason.
  ///
  /// Properties: `agent_id`, `video_id`, `trigger`
  /// ([ChatVideoPauseTrigger]), `watched_ms`, `video_duration_ms`.
  static const String chatVideoPaused = 'chat_video_paused';

  // ---- §18.4 Content suggestions and hand-off -------------------------

  /// A content item appears in a reply. Fires once per item — a reply
  /// with three cards fires three times.
  static const String chatContentSuggested = 'chat_content_suggested';

  /// User taps a suggested content item.
  static const String chatContentClicked = 'chat_content_clicked';

  /// The destination module screen becomes visible after a content tap.
  /// Cross-feature — each destination module signals visibility back to
  /// this analytics seam. Blocked on the hand-off timing wiring.
  static const String chatDestinationReached = 'chat_destination_reached';

  /// User taps the "Ask Prabhuji" button on a content page. Fires from
  /// the content module (aarti / mantras / etc.), NOT from chat.
  /// Blocked on the content-page chat entry UI.
  static const String contentChatButtonClicked = 'content_chat_button_clicked';

  // ---- §18.5 Feedback -------------------------------------------------

  /// The feedback popup appears as the user leaves the chat. Blocked on
  /// the feedback popup UI (Phase 3).
  static const String chatFeedbackPromptViewed = 'chat_feedback_prompt_viewed';

  /// User submits the feedback popup. Blocked on the feedback popup UI.
  static const String chatFeedbackSubmitted = 'chat_feedback_submitted';

  /// User closes the popup without submitting. Blocked on the feedback
  /// popup UI.
  static const String chatFeedbackDismissed = 'chat_feedback_dismissed';
}

/// Canonical property-key names.
class ChatEventProps {
  ChatEventProps._();

  // ---- Session / message identity -------------------------------------
  /// `chat_session_id` — groups all events in one conversation. Same
  /// value as the server's `sessionId` returned by `/chat/messages`.
  static const String chatSessionId = 'chat_session_id';

  /// `message_id` — server-assigned id for a stored message row.
  static const String messageId = 'message_id';

  /// `message_number` — one-based position of this message in the
  /// session. Client-computed counter.
  static const String messageNumber = 'message_number';

  /// `agent_id` — the RAGFlow agent this session is talking to. Sourced
  /// from `chatConfig.agentId` on `/users/me` (persona / gita / content
  /// agent, per user variant). Rides on every chat event so a warehouse
  /// slice can compare funnels across variants without joining back
  /// through `/users/me`.
  static const String agentId = 'agent_id';

  /// `chat_type` — opaque bucket label the server hands the client on
  /// `/users/me`'s `chatConfig.chatType`. Warehouse groups events by this
  /// value to compare control-vs-variant funnels without joining back
  /// through `/users/me`. Sent verbatim; the mobile layer never enumerates
  /// the values. Omitted (property not emitted) when the server hasn't
  /// bucketed the user yet — an empty string would look like a real
  /// bucket in the funnel.
  static const String chatType = 'chat_type';

  /// `send_status` — outcome of a `chat_message_sent` attempt. Fired at
  /// user intent (before the bloc's early-return gates), then re-emitted
  /// with the final status once the POST / drop-reason resolves. Lets the
  /// warehouse distinguish "user tried but we silently dropped it" from
  /// "server accepted and replied". Vocabulary in [ChatSendStatus].
  static const String sendStatus = 'send_status';

  // ---- Entry / screen context (§18.1) ---------------------------------
  static const String sourceScreen = 'source_screen';
  static const String entryPoint = 'entry_point';
  static const String entrySource = 'entry_source';
  static const String contentId = 'content_id';
  static const String contentType = 'content_type';
  static const String userSubscriptionStatus = 'user_subscription_status';
  static const String openCount = 'open_count';
  static const String hasContentContext = 'has_content_context';
  static const String suggestionSetId = 'suggestion_set_id';
  static const String sessionDurationSeconds = 'session_duration_seconds';
  static const String messageCount = 'message_count';
  static const String contentTapCount = 'content_tap_count';
  static const String exitReason = 'exit_reason';
  static const String freeChatConsumed = 'free_chat_consumed';

  // ---- Conversation (§18.2) -------------------------------------------
  static const String questionText = 'question_text';
  static const String category = 'category';
  static const String positionIndex = 'position_index';
  static const String messageText = 'message_text';
  static const String inputMethod = 'input_method';
  static const String voiceNoteId = 'voice_note_id';
  static const String isFollowup = 'is_followup';
  static const String matchedTags = 'matched_tags';
  static const String recommendedDeity = 'recommended_deity';
  static const String jaapCount = 'jaap_count';
  static const String contentCount = 'content_count';
  static const String modelId = 'model_id';
  static const String responseTimeMs = 'response_time_ms';
  static const String failureStage = 'failure_stage';
  static const String errorCode = 'error_code';
  static const String retryCount = 'retry_count';
  static const String nearestTag = 'nearest_tag';
  static const String fallbackShown = 'fallback_shown';
  static const String declineCategory = 'decline_category';

  /// `distress_detected` — rides on [ChatEvents.chatReplyReceived] so the
  /// reply stream itself is filterable, alongside the dedicated
  /// [ChatEvents.chatDistressShown] fire. `false`, never null, on an
  /// ordinary turn (see that event's doc for why).
  static const String distressDetected = 'distress_detected';

  /// `intent_type` — the agent's own classification of the turn
  /// (`direct_request`, `out_of_scope`, `no_match`, `horoscope`, …).
  /// Open vocabulary: the agent owns it, so a new value is a new thing to
  /// count, never a client-side error. Null on the prose arms.
  static const String intentType = 'intent_type';

  /// `reason` — why the chat declined (`chat_out_of_scope`). Carries the
  /// agent's `decline_category` (`financial` / `theology` / `politics` /
  /// `other`), which is the event this field actually describes.
  static const String reason = 'reason';
  static const String contentOffered = 'content_offered';

  // ---- Voice (§18.3) --------------------------------------------------
  static const String permissionStatus = 'permission_status';
  static const String result = 'result';
  static const String askCount = 'ask_count';
  static const String durationMs = 'duration_ms';
  static const String failureReason = 'failure_reason';
  static const String transcriptText = 'transcript_text';
  static const String transcriptLanguage = 'transcript_language';
  static const String transcriptConfidence = 'transcript_confidence';
  static const String audioDurationMs = 'audio_duration_ms';
  static const String transcriptionTimeMs = 'transcription_time_ms';

  // ---- Content hand-off (§18.4) ---------------------------------------
  static const String destinationModule = 'destination_module';
  static const String timeToDestinationMs = 'time_to_destination_ms';
  static const String sourceModule = 'source_module';

  // ---- Feedback (§18.5) -----------------------------------------------
  static const String rating = 'rating';
  static const String commentText = 'comment_text';
  static const String dismissMethod = 'dismiss_method';

  // ---- In-thread intro video (TAM-177) --------------------------------
  /// Stable id of the video asset, independent of its URL — so a re-encode
  /// or a bucket move does not split the funnel.
  static const String videoId = 'video_id';

  /// What caused the start / pause. [ChatVideoStartTrigger] /
  /// [ChatVideoPauseTrigger].
  static const String trigger = 'trigger';

  /// Playback position when the video STARTED, in ms. Non-zero on a
  /// tap-resume — which is exactly how a resume is told apart from a
  /// first play in the warehouse.
  static const String positionMs = 'position_ms';

  /// How long the user actually watched before this pause, in ms.
  static const String watchedMs = 'watched_ms';

  /// Total asset length in ms, served by the API (never read off the
  /// player), so `watched_ms / video_duration_ms` is a completion rate.
  static const String videoDurationMs = 'video_duration_ms';
}

/// `trigger` values on [ChatEvents.chatVideoStarted] (TAM-177).
///
/// #EXPORT_CRITICAL — neither video event may carry a call-site
/// `chat_type`. `AnalyticsEnricher` stamps that key on EVERY event from
/// `ChatCounters.savedChatType()`, and caller properties OVERRIDE the
/// enricher, so passing it here creates two sources of truth that drift.
/// The ticket's requirement that `chat_type` separate the three chats on
/// these events is satisfied for free. (TAM-167 rule —
/// `docs/ANALYTICS-FLUTTER-GUIDE.md`.)
class ChatVideoStartTrigger {
  ChatVideoStartTrigger._();

  /// Playback began by itself when the chat opened.
  static const String autoplay = 'autoplay';

  /// The user tapped a paused card to resume.
  static const String userTap = 'user_tap';
}

/// `trigger` values on [ChatEvents.chatVideoPaused] (TAM-177).
class ChatVideoPauseTrigger {
  ChatVideoPauseTrigger._();

  /// The user tapped the playing card.
  static const String userTap = 'user_tap';

  /// The user began answering — typing, recording, tapping a suggestion
  /// chip, or tapping "Pata Nahi". The video yields to the answer.
  static const String answerStarted = 'answer_started';

  /// The card scrolled out of view (`visibility_detector`).
  static const String scrolledAway = 'scrolled_away';

  /// The user left the chat — a route pushed over it, a bottom-nav tab
  /// switch, or the app going to background. VisibilityDetector covers
  /// none of those three, which is why each is wired explicitly.
  static const String screenExit = 'screen_exit';
}

/// `entry_point` values (§18.1 `chat_button_clicked`).
class ChatEntryPoint {
  ChatEntryPoint._();

  /// Tap on the Chat tab in the bottom navigation.
  static const String bottomNav = 'bottom_nav';

  /// Tap on a Home-surface chat entry (when it ships).
  static const String home = 'home';

  /// Tap on a per-content-page "Ask Prabhuji" button. Blocked on
  /// content-page chat entry.
  static const String contentPage = 'content_page';
}

/// `input_method` values (§18.2 `chat_message_sent`).
class ChatInputMethod {
  ChatInputMethod._();

  /// User typed the message and tapped send.
  static const String typed = 'typed';

  /// User recorded a voice note and sent it. Blocked on Phase 3.
  static const String voice = 'voice';

  /// User tapped a suggested-question chip.
  static const String suggestedQuestion = 'suggested_question';
}

/// `send_status` closed vocabulary for `chat_message_sent`. The bloc
/// fires with `sent` on server success, `failed` on POST failure, and one
/// of the `dropped*` reasons when an early-return in `_onSubmitted`
/// silently discards the send (state not ready / empty / over char cap /
/// paywall re-gate). Without this the whole class of silent-drop bugs
/// (Bug 1 — voice notes never reaching the funnel) is invisible.
class ChatSendStatus {
  ChatSendStatus._();

  /// Server accepted the message and returned a reply. Terminal.
  static const String sent = 'sent';

  /// `POST /chat/messages` failed (network / 5xx). Terminal.
  static const String failed = 'failed';

  /// Bloc state was not `ChatReady` when the send arrived — chat had
  /// been demoted to read-only (e.g. server 403 CHAT_DISABLED) or the
  /// mount was still loading history. Send was silently discarded.
  static const String droppedNotReady = 'dropped_not_ready';

  /// Trimmed message body was empty. Composer already guards this, so
  /// this reason usually indicates a whitespace-only voice transcript
  /// that slipped past the composer trim.
  static const String droppedEmpty = 'dropped_empty';

  /// Message length exceeded the client-side max (4000 chars). Rare on
  /// typed input; can happen on a very long voice transcript.
  static const String droppedTooLong = 'dropped_too_long';

  /// Live entitlement re-gate failed (`_isPro()` returned false). The
  /// bloc emits `paywallRequiredNonce` on this path so the screen
  /// pushes the paywall; the send itself is not attempted.
  static const String droppedPaywall = 'dropped_paywall';
}

/// `exit_reason` values (§18.1 `chat_closed`).
class ChatExitReason {
  ChatExitReason._();

  /// Explicit back navigation (system back or app-bar back arrow).
  static const String back = 'back';

  /// User tapped a suggested content item — the chat is left because
  /// the destination module is opening.
  static const String contentOpened = 'content_opened';

  /// App went to background (Home button, task switcher). Fires from
  /// the app-lifecycle observer, not the screen dispose.
  static const String appBackgrounded = 'app_backgrounded';

  /// User swapped away from the chat tab in the bottom navigation shell
  /// (or navigated to another branch via `router.go`). Detected in
  /// `AppShellScaffold` by watching `navigationShell.currentIndex`.
  static const String tabSwitch = 'tab_switch';

  /// User's send hit the Pro re-gate (or another chat-surface entry
  /// tripped it) and the paywall was pushed on top of chat. Fires from
  /// `_handlePaywallRequired` BEFORE the push so the funnel captures the
  /// visit boundary — the shell can't detect this transition itself
  /// because pushing a route over chat doesn't change
  /// `navigationShell.currentIndex`.
  static const String paywallOpened = 'paywall_opened';
}

/// `failure_stage` values (§18.2 `chat_reply_failed`).
///
/// PRD-locked vocabulary: `tag_match | generation | network`. Client
/// currently only observes coarse dio/HTTP outcomes, so the mapping is:
///
///  * dio transport failure / no response → `network`
///  * server 4xx (typically 400 validation, 403 chat_disabled) →
///    `tag_match` (the call couldn't be interpreted before generation
///    started)
///  * server 5xx / 502 RAGFlow non-2xx / malformed response →
///    `generation` (the generator itself failed)
class ChatFailureStage {
  ChatFailureStage._();

  static const String tagMatch = 'tag_match';
  static const String generation = 'generation';
  static const String network = 'network';

  /// Coarse categorization from a dio-observed status. `null` = network /
  /// no response.
  static String fromHttpStatus(int? status) {
    if (status == null) return network;
    if (status >= 400 && status < 500) return tagMatch;
    if (status >= 500) return generation;
    return network;
  }
}

/// `decline_category` values (§18.2 `chat_out_of_scope`). Closed
/// vocabulary per PRD §14. Blocked on Phase 2 backend signal.
class ChatDeclineCategory {
  ChatDeclineCategory._();

  static const String ritual = 'ritual';
  static const String theology = 'theology';
  static const String medical = 'medical';
  static const String legal = 'legal';
  static const String financial = 'financial';
  static const String other = 'other';
}

/// `content_type` and `destination_module` values (§18.4). Devotional
/// content types plus `horoscope` for the hand-off.
class ChatContentType {
  ChatContentType._();

  static const String aarti = 'aarti';
  static const String bhajan = 'bhajan';
  static const String mantra = 'mantra';
  static const String ringtone = 'ringtone';
  static const String status = 'status';
  static const String wallpaper = 'wallpaper';
  static const String horoscope = 'horoscope';
}

/// `permission_status` values (§18.3 `chat_voice_clicked`).
class ChatVoicePermissionStatus {
  ChatVoicePermissionStatus._();

  static const String granted = 'granted';
  static const String denied = 'denied';
  static const String notYetAsked = 'not_yet_asked';
}

/// `result` values on §18.3 `chat_voice_permission_result` and on
/// §18.3 `chat_voice_transcribed`. Two separate enums because the
/// semantics differ:
///
///  * permission-prompt outcome — `granted | denied`
///  * transcription outcome — `success | empty`
class ChatVoicePermissionResult {
  ChatVoicePermissionResult._();

  static const String granted = 'granted';
  static const String denied = 'denied';
}

class ChatVoiceTranscribeResult {
  ChatVoiceTranscribeResult._();

  static const String success = 'success';
  static const String empty = 'empty';
}

/// `failure_reason` values on §18.3 `chat_voice_upload_failed`.
class ChatVoiceUploadFailureReason {
  ChatVoiceUploadFailureReason._();

  static const String network = 'network';
  static const String timeout = 'timeout';
  static const String fileTooLarge = 'file_too_large';
  static const String serverError = 'server_error';
}

/// `failure_reason` values on §18.3 `chat_voice_transcription_failed`.
class ChatVoiceTranscriptionFailureReason {
  ChatVoiceTranscriptionFailureReason._();

  static const String noSpeechDetected = 'no_speech_detected';
  static const String unintelligible = 'unintelligible';
  static const String unsupportedLanguage = 'unsupported_language';
  static const String serviceError = 'service_error';
}

/// `result` values on §18.4 `chat_destination_reached`.
class ChatDestinationResult {
  ChatDestinationResult._();

  static const String success = 'success';
  static const String failure = 'failure';
}

/// `dismiss_method` values on §18.5 `chat_feedback_dismissed`.
class ChatFeedbackDismissMethod {
  ChatFeedbackDismissMethod._();

  /// User tapped the explicit "Abhi nahi" affordance on the popup.
  static const String abhiNahi = 'abhi_nahi';

  /// User navigated away via back button / gesture.
  static const String back = 'back';
}

/// `user_subscription_status` values — mirrors the kuldevta enum so the
/// chat surface has its own local constants and doesn't reach across
/// features.
class ChatUserSubscriptionStatus {
  ChatUserSubscriptionStatus._();

  static const String pro = 'pro';
  static const String free = 'free';

  static String fromIsPro(bool isPro) => isPro ? pro : free;
}

/// The agent's own `intent_type` vocabulary (TAM-165). OPEN, not a Dart enum:
/// the agent owns these strings, so a value we don't know about is a new thing
/// to count, never a client-side error. Only the two the client branches on
/// are named here; every other value flows through to `chat_reply_received`'s
/// `intent_type` property untouched.
///
/// Null on the gita / kuldevta arms — those agents reply in prose and report
/// no intent.
class ChatIntentType {
  ChatIntentType._();

  /// No usable tag match for the query → [ChatEvents.chatNoMatch].
  static const String noMatch = 'no_match';

  /// Question is outside what the chat supports → [ChatEvents.chatOutOfScope].
  static const String outOfScope = 'out_of_scope';
}
