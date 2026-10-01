/// Horoscope analytics — event names + property keys.
///
/// Sourced 1:1 from the analytics contract's Sheet 1 (User Flow Events), rows
/// 102–112 (module: "Horoscope"). Every string here has a matching row in that
/// sheet — do NOT add locally-invented events; if the funnel needs a new one,
/// add the row to the sheet first and then land it here.
///
/// Callers use these constants, never string literals, so a rename is a
/// grep-safe atomic change.
///
/// ## Wiring notes (all 11 events fire)
///
/// Most events fire from the obvious call site (main-bloc load, tap handler,
/// result-bloc step transitions). Four needed a small amount of extra plumbing
/// worth calling out so future edits know where to look:
///
///  * `todayHoroscopePageViewed` — the result bloc wraps its `/horoscope/daily`
///    fetch in a `Stopwatch` and fires this event AFTER the ready emit with the
///    measured `load_time_ms`. `video_fallback_used` is the state's live flag
///    at emit time (false unless the video failed before the fetch completed —
///    the property is re-stamped when the fallback later flips true, via
///    subsequent `sectionViewed` events).
///  * `horoscopeSectionViewed` — fires from `_enterStep` when the bloc pushes a
///    new step into `state.currentStep`. There is only ever ONE step on screen
///    at a time (the card renders `state.currentStep`), so bloc-driven emit is
///    the observation moment; no `VisibilityDetector` needed.
///  * `horoscopeTtsStarted` — fires from the SAME `_enterStep` path but only
///    when `state.shouldSpeak` (unmuted + engine has the voice + step
///    ttsEnabled). Carries `voice_locale` = the SERVED locale (what the engine
///    actually speaks in), not the requested locale.
///  * `horoscopeCompleted` — fires ONCE per session on `HoroscopeFinishTapped`
///    (final step's CTA) OR when TTS-completion lands the user on the final
///    step. `total_time_seconds` is measured from `HoroscopeResultRequested`
///    (result-screen mount); `tts_used` is true if TTS spoke for ANY step in
///    the session.
///  * `horoscopeResultFailed` — fires from every catch-block in the result
///    bloc's `_load` and the video-init failure path. `failure_stage` is
///    `load` / `render` / `payment` / `playback` per Sheet 1 conventions
///    (horoscope only uses `load` and `render`); `retry_count` is incremented
///    across retries within the same session.
class HoroscopeEvents {
  HoroscopeEvents._();

  // Entry + selection (rows 102–103) -----------------------------------------
  static const String pageViewed = 'horoscope_page_viewed';
  static const String signSelected = 'horoscope_sign_selected';

  // Today result flow (rows 104–111) -----------------------------------------
  static const String todayHoroscopePageViewed = 'today_horoscope_page_viewed';
  static const String sectionViewed = 'horoscope_section_viewed';
  static const String nextClicked = 'horoscope_next_clicked';
  static const String backClicked = 'horoscope_back_clicked';
  static const String audioClicked = 'horoscope_audio_clicked';
  static const String ttsStarted = 'horoscope_tts_started';
  static const String autoAdvanced = 'horoscope_auto_advanced';
  static const String completed = 'horoscope_completed';

  // Reliability (row 112) -----------------------------------------------------
  static const String resultFailed = 'horoscope_result_failed';
}

/// Canonical property-key names used across Horoscope events. Kept here so a
/// value name like `zodiac_sign` lives in one place — call sites reference the
/// constant, not the string literal.
class HoroscopeProps {
  HoroscopeProps._();

  // Screen context / navigation
  static const String previousScreen = 'previous_screen';
  static const String entrySource = 'entry_source';

  // Zodiac identity + date
  static const String zodiacSign = 'zodiac_sign';
  static const String horoscopeDate = 'horoscope_date';
  static const String positionIndex = 'position_index';

  // Result page metrics
  static const String stepCount = 'step_count';
  static const String loadTimeMs = 'load_time_ms';
  static const String videoFallbackUsed = 'video_fallback_used';

  // Step identity
  static const String stepId = 'step_id';
  static const String stepName = 'step_name';
  static const String stepOrder = 'step_order';
  static const String fromStepId = 'from_step_id';
  static const String toStepId = 'to_step_id';

  // Audio / TTS
  static const String action = 'action';
  static const String voiceLocale = 'voice_locale';

  // Completion
  static const String stepsCompleted = 'steps_completed';
  static const String totalTimeSeconds = 'total_time_seconds';
  static const String ttsUsed = 'tts_used';

  // Failure diagnostics
  static const String failureStage = 'failure_stage';
  static const String errorCode = 'error_code';
  static const String retryCount = 'retry_count';
}

/// Fixed value for `horoscope_audio_clicked.action` (Sheet 1 row 108).
class HoroscopeAudioAction {
  HoroscopeAudioAction._();
  static const String muteOrUnmute = 'mute_or_unmute';
}

/// Fixed values for `horoscope_result_failed.failure_stage` (Sheet 1 row 112).
/// Horoscope only uses `load` (fetch/config) and `render` (video/media).
class HoroscopeFailureStage {
  HoroscopeFailureStage._();
  static const String load = 'load';
  static const String render = 'render';
}
