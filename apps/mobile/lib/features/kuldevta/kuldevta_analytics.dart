/// Kuldevta discovery analytics — event names, property keys, PRD-native
/// question tokens, and enum-value classes (TAM-166, spec §Analytics Events).
///
/// Follows the same discipline as `chat_analytics.dart`:
///
///  * Events: `snake_case`, prefixed `kuldevta_`, one verb-past-tense per
///    action.
///  * Properties: action-scoped facts only. Facts about the USER go on
///    `identifyUser`, not on these events (guide §Event vs. user scoping).
///
/// **Privacy note — raw wizard answers.** `kuldevta_question_answered`
/// deliberately carries the family's raw text (surname, ancestral place,
/// samaj, gotra, temple, home-mandir deity). Product signed off (2026-09-03):
/// the raw text is what improves the server-side alias table (misspellings,
/// alternate spellings, colloquial names). Do NOT strip / hash / redact this
/// field — that would break the load-bearing product need. Empty string is
/// sent when the user tapped "Pata Nahi", never a `null`.
class KuldevtaEvents {
  KuldevtaEvents._();

  /// Entry screen mounted (Chat-tab tap after paywall resolved,
  /// `chatConfig.kuldevtaAssigned == false`).
  static const String introViewed = 'kuldevta_intro_viewed';

  /// "Shuru Kijiye" tapped on the entry screen — user starts the wizard.
  /// The counterpart to `intro_viewed`: intro-viewed measures curiosity,
  /// khoj-started measures intent.
  static const String khojStarted = 'kuldevta_khoj_started';

  /// Any wizard step advanced — via primary CTA ("Aage Badhein") or the
  /// secondary "Pata Nahi" affordance.
  static const String questionAnswered = 'kuldevta_question_answered';

  /// `POST /kuldevta/identify` returned 200 and the result is ready.
  static const String assignmentCompleted = 'kuldevta_assignment_completed';

  /// `POST /kuldevta/identify` failed — 4xx / 5xx / dio timeout / network.
  static const String assignmentFailed = 'kuldevta_assignment_failed';

  /// Result FIRST reveal only. Never fires on a re-open — that is
  /// [resultReopened]. Keeping repeat views on their own event is what
  /// stops a returning user being counted as a new one.
  static const String resultViewed = 'kuldevta_result_viewed';

  /// User re-opened the result card after the first reveal (TAM-177).
  ///
  /// Properties: `deity_id`, `assignment_tier`, `is_fallback`, `source`
  /// ([KuldevtaResultReopenSource]). `is_fallback` is derived as
  /// `tier == 'fallback'` — it is not a field on the result model.
  static const String resultReopened = 'kuldevta_result_reopened';

  /// User tapped the share button — the OS share sheet was opened with the
  /// pre-filled caption.
  static const String resultShared = 'kuldevta_result_shared';

  // ------------------------------------------------------------------ //
  // Extras not in the primary analytics spec but retained for funnel /  //
  // QA visibility.                                                     //
  // ------------------------------------------------------------------ //

  /// User tapped back on the loading spinner while identify was in flight.
  /// Kept as a funnel event: cancellation is a distinct outcome from
  /// failure and the two must not be conflated.
  static const String identifyCancelled = 'kuldevta_identify_cancelled';

  /// User tapped the primary chat CTA ("Mata Se Baat Karein" /
  /// "Baba Se Baat Karein") on the result screen. Funnel completion
  /// signal — "result → chat" is what we ultimately care about.
  static const String resultChatTapped = 'kuldevta_result_chat_tapped';

  /// Chat `_AppBar` rendered the generic variant despite
  /// `showKuldevtaChat && kuldevtaAssigned` (assigned-path cold launch with
  /// no fresh-handoff identity in memory). Not a bug signal — this is the
  /// locked shipping behavior; the event exists purely for QA drift
  /// visibility.
  static const String personaHeaderFallback =
      'kuldevta_persona_header_fallback';
}

/// Canonical property-key names.
class KuldevtaEventProps {
  KuldevtaEventProps._();

  // Intro / khoj lifetime state.
  static const String openCount = 'open_count';
  static const String userSubscriptionStatus = 'user_subscription_status';

  // Question step.
  static const String questionNumber = 'question_number';
  static const String questionKey = 'question_key';
  static const String answerText = 'answer_text';
  static const String answerMethod = 'answer_method';
  static const String timeOnQuestionMs = 'time_on_question_ms';

  // Assignment completed.
  static const String deityId = 'deity_id';
  static const String deityName = 'deity_name';
  static const String assignmentTier = 'assignment_tier';
  static const String isFallback = 'is_fallback';
  static const String matchedOn = 'matched_on';
  static const String questionsAnswered = 'questions_answered';
  static const String timeToAssignMs = 'time_to_assign_ms';

  // Assignment failed.
  static const String failureStage = 'failure_stage';
  static const String errorCode = 'error_code';
  static const String retryCount = 'retry_count';

  // Result viewed.
  static const String source = 'source';

  // Result shared.
  static const String channel = 'channel';
  static const String isRepeatShare = 'is_repeat_share';

  /// `destination_app` — the receiving Android package the OS share sheet
  /// reported back (e.g. `com.whatsapp/com.whatsapp.ContactPicker`), or
  /// `null` when the user dismissed the sheet or the platform didn't
  /// disclose the choice. TAM-167: mirrors `status_share_result` — this
  /// is where the WhatsApp-share loop the khoj was built around becomes
  /// visible.
  static const String destinationApp = 'destination_app';

  // identify_cancelled — kept from the previous schema.
  static const String latencyMs = 'latency_ms';

  // result_chat_tapped — kept from the previous schema.
  static const String gender = 'gender';

  // persona_header_fallback — kept from the previous schema.
  static const String agentId = 'agent_id';
  static const String hasKuldevtaAssigned = 'has_kuldevta_assigned';
}

/// Wire-field-name → analytics `question_key` token.
///
/// The wire (`apps/api/src/core/kuldevta/routes/kuldevta.schemas.ts:17-24`)
/// uses camelCase; the analytics warehouse uses PRD-native tokens so a
/// human reading the funnel sees `samaj` (recognisable) rather than
/// `community` (backend-arbitrary). This is a translation layer, not a
/// rename — do NOT change the wire names to match; the wire and the
/// warehouse are separate concerns.
class KuldevtaFieldKeys {
  KuldevtaFieldKeys._();

  static const Map<String, String> _wireToPrd = <String, String>{
    'surname': 'surname',
    'ancestralPlace': 'ancestral_place',
    'community': 'samaj',
    'gotra': 'gotra',
    'templeMentioned': 'temple_memory',
    'mandirPhoto': 'mandir_photo',
  };

  /// Returns the PRD token for [wireFieldName], or the wire name itself if
  /// no mapping exists (defensive default — a future added field's raw
  /// name is better than an empty analytics value).
  static String prdKey(String wireFieldName) =>
      _wireToPrd[wireFieldName] ?? wireFieldName;
}

/// `answer_method` value enum.
class KuldevtaAnswerMethod {
  KuldevtaAnswerMethod._();

  /// User typed something into the field before advancing.
  static const String typed = 'typed';

  /// User tapped "Pata Nahi" — `answer_text` is the empty string in this
  /// case (never a `null`), matching the server's `.default("")`.
  static const String pataNahi = 'pata_nahi';

  /// User answered by voice note (TAM-177). The khoj questions are now
  /// answered in the chat composer, which has a microphone — so an answer
  /// can arrive by speech, transcribed on-device.
  ///
  /// A voice answer fires `kuldevta_question_answered` with this value AND
  /// the existing `chat_voice_*` events; the two describe different things
  /// (what was answered vs how the recorder behaved) and both are wanted.
  static const String voice = 'voice';
}

/// `source` value enum for `result_viewed`.
///
/// Still ONLY `first_reveal`, and deliberately so. TAM-177 makes the result
/// card re-openable from the chat header, but a re-open fires its own event
/// ([KuldevtaEvents.resultReopened], source
/// [KuldevtaResultReopenSource.headerAvatar]) rather than widening this one —
/// so a returning user can never be counted as a new reveal.
///
/// (Supersedes the 2026-09-03 note that said the result screen is not
/// re-openable: it is, as of TAM-177.)
class KuldevtaResultViewedSource {
  KuldevtaResultViewedSource._();

  static const String firstReveal = 'first_reveal';
}

/// `source` value enum for [KuldevtaEvents.resultReopened] (TAM-177).
class KuldevtaResultReopenSource {
  KuldevtaResultReopenSource._();

  /// The user tapped the deity avatar + name block in the chat app bar.
  /// Locked decision D2 — that block IS the assignment, so it is the
  /// obvious target and needs no extra chrome.
  static const String headerAvatar = 'header_avatar';
}

/// `channel` value enum for `result_shared`.
///
/// v1 shipped with `os_share_sheet` only, because the OS share sheet
/// hides which downstream app the user picked. **TAM-167 (2026-09-09)**
/// keeps the channel semantically as `os_share_sheet` (that IS the sheet
/// the user is looking at today — kuldevta does not yet have a custom
/// pre-share picker like status stories does), but the event now also
/// carries `destination_app` from `ShareOutcome.destination`, which the
/// platform DOES return post-share on Android. So Amplitude can slice
/// shares by destination even though `channel` doesn't split yet.
///
/// When a custom pre-share sheet lands for kuldevta (mirroring
/// `status_story_share_sheet.dart`), widen this enum with per-app
/// channels (`whatsapp`, `instagram`, `moreApps` → `os_share_sheet`) and
/// switch the fire site to emit the tapped tile.
class KuldevtaShareChannel {
  KuldevtaShareChannel._();

  static const String osShareSheet = 'os_share_sheet';
}

/// `user_subscription_status` value enum.
class KuldevtaUserSubscriptionStatus {
  KuldevtaUserSubscriptionStatus._();

  static const String pro = 'pro';
  static const String free = 'free';

  static String fromIsPro(bool isPro) => isPro ? pro : free;
}

/// `failure_stage` value enum for `assignment_failed`.
///
/// Closed vocabulary per the PRD schema (2026-09-03): `parse |
/// retrieve | pick | validation` — no other values are emitted so the
/// warehouse doesn't have to canonicalise loose strings. Client-side
/// bucketing over dio errors + HTTP statuses (the API does not
/// currently emit a categorical stage). Warehouse can still join on
/// `error_code` for finer breakdown.
class KuldevtaFailureStage {
  KuldevtaFailureStage._();

  /// Server received the payload but the parser agent / matcher couldn't
  /// interpret it (Zod validation fail, or a server 400 for other input
  /// reasons).
  static const String validation = 'validation';

  /// The identify call couldn't reach the parser at all — network
  /// unreachable, dio timeout, or 502 from the upstream RAGFlow agent.
  static const String retrieve = 'retrieve';

  /// Server-side matcher / picker crashed — 5xx (other than the gateway
  /// codes that map to `retrieve`), or unexpected shape on a 2xx.
  static const String pick = 'pick';

  /// Client-side decode failure or an HTTP status the mapper couldn't
  /// classify — response arrived but we couldn't make sense of it.
  static const String parse = 'parse';

  /// Coarse categorization from a dio-observed status. `null` = network /
  /// no response.
  static String fromHttpStatus(int? status) {
    if (status == null) return retrieve;
    if (status >= 400 && status < 500) return validation;
    if (status == 502 || status == 503 || status == 504) return retrieve;
    if (status >= 500) return pick;
    return parse;
  }
}
