import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:uuid/uuid.dart';

import '../../../../core/theme.dart';
import '../../../../state/providers.dart';
import '../../application/chat_bloc.dart';
import '../../application/chat_event.dart';
import '../../application/chat_state.dart';
import '../../chat_analytics.dart';
import '../../chat_providers.dart';
import 'chat_khoj_rows.dart';
import 'voice_input_controller.dart';

/// Composer (Figma `2612:18010`). Input pill on the left, a single 40×40
/// action circle on the right that flips between:
///
///  * mic glyph (idle / empty input) — TAM-166 wires the recorder: tap to
///    start, tap again to stop. While recording the field is replaced with
///    a live-transcript strip + slide-left-to-cancel gesture.
///  * send glyph (typed input, trimmed length in `[1, 4000]`) — Tapping
///    invokes [onSend] with the trimmed text and clears the field.
///
/// A parent screen owns the [TextEditingController] so the composer text
/// survives orientation changes / rebuilds (matches spec §Persistence
/// across app lifecycle).
///
/// Read-only mode (chat variant was demoted server-side) sets [enabled] to
/// false — the field renders greyed, the action button is disabled, and
/// [onSend] is never called even if the caller passes one.
class ChatComposer extends ConsumerStatefulWidget {
  const ChatComposer({
    super.key,
    required this.controller,
    required this.onSend,
    this.enabled = true,
    this.pending = false,
    this.hintText = KhojCopy.composerHint,
    this.onVoiceSubmit,
    this.onAnswerStarted,
    this.voiceControllerFactory,
    this.uuidFactory,
  });

  final TextEditingController controller;

  /// Fired with the TRIMMED text when the user taps send (or presses
  /// enter). The composer does NOT clear the field on send — the parent
  /// decides (typical: clear on optimistic bubble enqueue).
  final ValueChanged<String> onSend;

  /// False → the field + action button render disabled (spec §Read-only
  /// mode).
  final bool enabled;

  /// True while a send is in flight — the send button is greyed and
  /// tap is a no-op (defensive; the parent should also disable via
  /// `enabled: false` if it wants the whole composer locked while sending).
  final bool pending;

  /// Placeholder text. Defaults to "Yaha pe likhiye..." — every new Figma
  /// chat frame shows it (`3934:14677` khoj, `3964:14628` deity chat,
  /// `3975:24000` content chat), so TAM-177 makes it the global default
  /// rather than a khoj-only override. Supersedes "Likhiye..."
  /// (`2612:18010`).
  final String hintText;

  /// Where a transcribed voice note goes, INSTEAD of the ambient
  /// `ChatBloc.add(ChatMessageSubmitted(...))` (TAM-177).
  ///
  /// #EXPORT_CRITICAL. The khoj questions are answered in this composer, and
  /// a khoj answer must fire `kuldevta_question_answered` and NEVER
  /// `chat_message_sent`, and must never inflate `chat_closed.message_count`.
  /// The composer reads `ChatBloc` ambiently via `_tryReadChatBloc()`, and in
  /// khoj mode that bloc still exists (the route builds it) — so "just don't
  /// provide one" is not available. An explicit override is the only way to
  /// guarantee the khoj path never reaches `ChatBloc._onSubmitted`.
  ///
  /// Args: `(transcript, voiceNoteId, audioDurationMs)`. The `chat_voice_*`
  /// events still fire either way — they describe how the recorder behaved,
  /// which is wanted in both modes.
  final void Function(
    String transcript,
    String voiceNoteId,
    int audioDurationMs,
  )?
  onVoiceSubmit;

  /// Fired the moment the user starts producing an answer — first keystroke
  /// or start of a recording. The chat screen uses it to pause the intro
  /// video with `chat_video_paused.trigger = answer_started`.
  final VoidCallback? onAnswerStarted;

  /// Test seam (TAM-166). Injected in widget tests so no real
  /// `speech_to_text` recognizer is ever constructed. Production callers
  /// leave this null and the composer builds the default controller
  /// against the real SDK.
  @visibleForTesting
  final VoiceInputController Function()? voiceControllerFactory;

  /// Test seam (TAM-166). Overridable UUID minter so widget tests can
  /// assert against a deterministic `voice_note_id`. Production callers
  /// leave this null; the default is `Uuid().v4()`.
  @visibleForTesting
  final String Function()? uuidFactory;

  @override
  ConsumerState<ChatComposer> createState() => _ChatComposerState();
}

class _ChatComposerState extends ConsumerState<ChatComposer> {
  // ---- Text-field / send flow (TAM-164) -------------------------------

  /// One-shot so `onAnswerStarted` fires on the first keystroke of an answer,
  /// not on every character. Reset when the field is cleared after a send.
  bool _answerStartedFired = false;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChanged);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onChanged);
    _elapsedTimer?.cancel();
    _partialSubscription?.cancel();
    unawaited(_voiceController?.dispose());
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant ChatComposer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_onChanged);
      widget.controller.addListener(_onChanged);
    }
  }

  void _onChanged() {
    // TAM-177 — the first keystroke is "the user started answering", which
    // pauses the intro video. Fired only on the transition from empty to
    // non-empty so a long answer does not spam the signal.
    final hasText = widget.controller.text.trim().isNotEmpty;
    if (!_answerStartedFired && hasText) {
      _answerStartedFired = true;
      widget.onAnswerStarted?.call();
    } else if (_answerStartedFired && !hasText) {
      // The parent cleared the field after a send — re-arm for the next
      // answer.
      _answerStartedFired = false;
    }
    // Rebuild so the action button flips mic ↔ send.
    if (mounted) setState(() {});
  }

  bool get _canSend {
    if (!widget.enabled || widget.pending) return false;
    final trimmed = widget.controller.text.trim();
    return trimmed.isNotEmpty && trimmed.length <= AppChat.messageMaxChars;
  }

  bool get _showSend {
    final trimmed = widget.controller.text.trim();
    return trimmed.isNotEmpty;
  }

  // ---- Voice-input state (TAM-166) ------------------------------------

  /// The lazily-constructed controller. Built on the FIRST mic tap so a
  /// composer that is never voice-recorded pays no SDK-init cost.
  VoiceInputController? _voiceController;

  /// True while the recognizer is listening and the recording strip is
  /// visible in place of the text field.
  bool _isRecording = false;

  /// Latest partial transcript. Rendered live in the recording strip.
  String _liveTranscript = '';

  /// Millisecond wall-clock offset since recording started. Bumped every
  /// 100ms by [_elapsedTimer] so the mm:ss counter re-renders smoothly.
  int _elapsedMs = 0;
  Timer? _elapsedTimer;
  DateTime? _recordingStartedAt;

  /// Client-minted UUID for the CURRENT recording. Rides on
  /// `chat_voice_recorded` / `chat_voice_transcribed` / (on send)
  /// `chat_message_sent` so the events group. Nulled after every send /
  /// cancel / failure so a stale id can't leak into a subsequent send.
  String? _pendingVoiceNoteId;

  /// Horizontal drag offset from the recording strip's origin. When it
  /// crosses -80px the current recording is cancelled.
  double _cancelDragOffset = 0.0;
  static const double _kCancelSlideThreshold = 80.0;

  StreamSubscription<String>? _partialSubscription;

  /// Guards against re-entering the permission flow while an OS prompt or
  /// dialog from a previous tap is still on screen. Without this the first
  /// tap opens the rationale dialog AND the OS prompt at the same time on
  /// slow devices; a rapid double-tap can also double-`showDialog` and leave
  /// the second one dangling.
  bool _micFlowInFlight = false;

  /// Bug 9 — re-entry guard for [_stopRecording]. `_handleMicTap` short-
  /// circuits to `_stopRecording` while `_isRecording == true`; a rapid
  /// double-tap on the stop button (or a stop-tap that races the
  /// `_partialSubscription` last update) can re-enter the stop path
  /// mid-await, causing `_fireVoiceRecorded` + `_fireVoiceTranscribed` /
  /// `_fireVoiceTranscriptionFailed` to double-fire in the same
  /// millisecond. That inflates the voice funnel counts and the "50%
  /// transcription failure rate" figure. This flag flips at the top of
  /// `_stopRecording` and back to false only when the finally-block runs,
  /// so a concurrent entry bails immediately.
  bool _stopInFlight = false;

  /// Mic tap handler. Two responsibilities:
  ///
  ///  1. **Tap-to-toggle-end** — if a recording is already in progress the
  ///     tap ends it via [_stopRecording]. This branch runs BEFORE the
  ///     permission flow so a stop doesn't re-prompt.
  ///  2. **Start** — otherwise, run the platform permission playbook and
  ///     start recording on grant.
  ///
  /// Playbook (unchanged from TAM-164):
  ///   1. Read current status (no prompt).
  ///   2. `granted` / `limited` → start recording.
  ///   3. `denied` → in-app rationale dialog explaining why we need it,
  ///      then only on "Allow" invoke the OS prompt.
  ///   4. `permanentlyDenied` → in-app dialog with "Open settings" that
  ///      routes to the app's permission screen via `openAppSettings()`.
  ///   5. `restricted` (iOS parental / MDM) → surface a short, actionable
  ///      snackbar. There is no user-recoverable path.
  Future<void> _handleMicTap() async {
    if (_isRecording) {
      // Tap-to-toggle-end. Never re-prompt for permission on a stop.
      await _stopRecording();
      return;
    }
    if (_micFlowInFlight) return;
    _micFlowInFlight = true;
    try {
      final status = await Permission.microphone.status;
      if (!mounted) return;
      // PRD §18.3 `chat_voice_clicked` — fires BEFORE we look at the
      // permission outcome so we measure intent even if the user never
      // grants the OS prompt. Permission status here mirrors the platform
      // permission cache at tap-time (not yet asked → `not_yet_asked`).
      _fireVoiceClicked(_mapCurrentPermissionStatus(status));
      switch (status) {
        case PermissionStatus.granted:
        case PermissionStatus.limited:
        case PermissionStatus.provisional:
          await _startRecording();
        case PermissionStatus.denied:
          final allow = await _showMicRationaleDialog();
          if (!mounted || allow != true) return;
          final result = await Permission.microphone.request();
          if (!mounted) return;
          // PRD §18.3 `chat_voice_permission_result` — fires once the OS
          // prompt resolves. Only the granted/denied branches count here;
          // a `permanentlyDenied` OS return is reported as `denied` since
          // that is what the user chose.
          _fireVoicePermissionResult(
            result.isGranted
                ? ChatVoicePermissionResult.granted
                : ChatVoicePermissionResult.denied,
          );
          if (result.isGranted) {
            await _startRecording();
          } else if (result.isPermanentlyDenied) {
            await _showMicPermanentlyDeniedDialog();
          }
        // A "denied" after the OS prompt (user tapped Deny once) leaves the
        // status at denied and we simply don't show the recorder — no third
        // dialog. The user can tap the mic again to re-run this flow.
        case PermissionStatus.permanentlyDenied:
          await _showMicPermanentlyDeniedDialog();
        case PermissionStatus.restricted:
          _showRestrictedSnackbar();
      }
    } finally {
      _micFlowInFlight = false;
    }
  }

  /// Kick off a listen session. Constructs the [VoiceInputController]
  /// lazily on the first call and reuses it for the composer's lifetime.
  Future<void> _startRecording() async {
    // TAM-177 — starting to speak is "the user started answering" just as much
    // as the first keystroke is; the intro video yields to both.
    widget.onAnswerStarted?.call();
    _voiceController ??=
        (widget.voiceControllerFactory ?? VoiceInputController.new)();
    final voice = _voiceController!;
    try {
      final ready = await voice.initialize();
      if (!mounted) return;
      if (!ready) {
        // The user (or the OS) has declined speech recognition itself —
        // distinct from a mic-permission decline. Fall back to the
        // service-error path so telemetry still records the attempt.
        _fireVoiceTranscriptionFailed(
          failureReason: ChatVoiceTranscriptionFailureReason.serviceError,
          audioDurationMs: 0,
        );
        _showTranscribeFailureSnackbar();
        return;
      }
      _pendingVoiceNoteId = (widget.uuidFactory ?? _defaultUuid)();
      _liveTranscript = '';
      _cancelDragOffset = 0.0;
      _elapsedMs = 0;
      _recordingStartedAt = DateTime.now();
      _partialSubscription?.cancel();
      _partialSubscription = voice.partialResults.listen((partial) {
        if (!mounted) return;
        setState(() => _liveTranscript = partial);
      });
      await voice.start();
      if (!mounted) return;
      _elapsedTimer?.cancel();
      _elapsedTimer = Timer.periodic(const Duration(milliseconds: 100), (_) {
        if (!mounted) return;
        final startedAt = _recordingStartedAt;
        if (startedAt == null) return;
        setState(() {
          _elapsedMs = DateTime.now().difference(startedAt).inMilliseconds;
        });
      });
      setState(() => _isRecording = true);
    } catch (_) {
      // Failed to start — treat as a service-level transcription failure
      // so the funnel captures it. `_pendingVoiceNoteId` may or may not
      // have been minted yet — reset so nothing stale rides forward.
      _fireVoiceTranscriptionFailed(
        failureReason: ChatVoiceTranscriptionFailureReason.serviceError,
        audioDurationMs: _recordingStartedAt == null
            ? 0
            : DateTime.now().difference(_recordingStartedAt!).inMilliseconds,
      );
      _resetRecordingState();
      if (mounted) {
        _showTranscribeFailureSnackbar();
      }
    }
  }

  /// Finalise the recording, fire the §18.3 telemetry, and (on success)
  /// dispatch a `ChatMessageSubmitted` with `promptSource: 'voice'`.
  Future<void> _stopRecording() async {
    // Bug 9 — a rapid double-tap on the stop button used to run the
    // whole finalize+fire sequence twice, producing duplicate
    // `chat_voice_recorded` / `chat_voice_transcription_failed` events
    // in the same millisecond. Bail on any re-entry; the first call
    // owns the fires and the transcript dispatch.
    if (_stopInFlight) return;
    final voice = _voiceController;
    if (voice == null) return;
    _stopInFlight = true;
    _elapsedTimer?.cancel();
    _elapsedTimer = null;
    final voiceNoteId = _pendingVoiceNoteId ?? '';
    try {
      final outcome = await voice.stop();
      if (!mounted) return;
      final durationMs = outcome.durationMs;
      final transcript = outcome.transcript.trim();
      _fireVoiceRecorded(durationMs: durationMs);
      if (transcript.isEmpty) {
        _fireVoiceTranscribed(
          transcript: '',
          confidence: outcome.confidence,
          audioDurationMs: durationMs,
          result: ChatVoiceTranscribeResult.empty,
        );
        _resetRecordingState();
        _showEmptyTranscriptSnackbar();
        return;
      }
      _fireVoiceTranscribed(
        transcript: transcript,
        confidence: outcome.confidence,
        audioDurationMs: durationMs,
        result: ChatVoiceTranscribeResult.success,
      );
      // TAM-177: an explicit override wins over the ambient ChatBloc. In khoj
      // mode the ChatBloc still exists, so only an explicit seam can keep a
      // khoj answer out of `chat_message_sent` / `chat_closed.message_count`.
      final voiceSubmit = widget.onVoiceSubmit;
      if (voiceSubmit != null) {
        voiceSubmit(transcript, voiceNoteId, durationMs);
      } else {
        // Dispatch the send through the same bloc event typed sends use so
        // the optimistic bubble + retry / paywall / silent-recovery paths
        // all apply identically. `input_method: voice` is set by the bloc
        // from `promptSource: 'voice'`; `voice_note_id` rides on the event.
        final chatBloc = _tryReadChatBloc();
        chatBloc?.add(
          ChatMessageSubmitted(
            message: transcript,
            promptSource: 'voice',
            voiceNoteId: voiceNoteId,
            audioDurationMs: durationMs,
          ),
        );
      }
      _resetRecordingState();
    } on VoiceTranscribeException catch (e) {
      if (!mounted) return;
      _fireVoiceRecorded(durationMs: e.durationMs);
      _fireVoiceTranscriptionFailed(
        failureReason: e.failureReason,
        audioDurationMs: e.durationMs,
      );
      _resetRecordingState();
      // `noSpeechDetected` (SDK's `error_no_match` / `error_speech_timeout`)
      // is the COMMON case — user tapped, didn't speak (or spoke too
      // softly), and the recognizer heard nothing. Treating it as a hard
      // "voice input is broken" error confuses the user; treat it as
      // "empty transcript" so they see the friendlier "didn't hear
      // anything, try again" copy. The analytics event above still
      // records the true reason (`no_speech_detected`) so the funnel
      // can distinguish silence from a real service outage.
      if (e.failureReason ==
          ChatVoiceTranscriptionFailureReason.noSpeechDetected) {
        _showEmptyTranscriptSnackbar();
      } else {
        _showTranscribeFailureSnackbar();
      }
    } catch (_) {
      if (!mounted) return;
      final durationMs = _recordingStartedAt == null
          ? 0
          : DateTime.now().difference(_recordingStartedAt!).inMilliseconds;
      _fireVoiceRecorded(durationMs: durationMs);
      _fireVoiceTranscriptionFailed(
        failureReason: ChatVoiceTranscriptionFailureReason.serviceError,
        audioDurationMs: durationMs,
      );
      _resetRecordingState();
      _showTranscribeFailureSnackbar();
    } finally {
      _stopInFlight = false;
    }
  }

  /// Slide-left-to-cancel handler. Discards the recording without
  /// dispatching a send; fires `chat_voice_cancelled` with the elapsed
  /// duration.
  Future<void> _cancelRecording() async {
    final voice = _voiceController;
    if (voice == null) return;
    _elapsedTimer?.cancel();
    _elapsedTimer = null;
    final durationMs = await voice.cancel();
    if (!mounted) return;
    _fireVoiceCancelled(durationMs: durationMs);
    _resetRecordingState();
  }

  void _resetRecordingState() {
    _partialSubscription?.cancel();
    _partialSubscription = null;
    _elapsedTimer?.cancel();
    _elapsedTimer = null;
    _recordingStartedAt = null;
    _pendingVoiceNoteId = null;
    if (mounted) {
      setState(() {
        _isRecording = false;
        _liveTranscript = '';
        _cancelDragOffset = 0.0;
        _elapsedMs = 0;
      });
    } else {
      _isRecording = false;
      _liveTranscript = '';
      _cancelDragOffset = 0.0;
      _elapsedMs = 0;
    }
  }

  ChatBloc? _tryReadChatBloc() {
    try {
      return context.read<ChatBloc>();
    } catch (_) {
      return null;
    }
  }

  int _readMessageNumberForNextSend() {
    final bloc = _tryReadChatBloc();
    if (bloc == null) return 1;
    return bloc.messageNumberForNextSend;
  }

  String? _readSessionId() {
    final state = _tryReadChatBloc()?.state;
    if (state is ChatReady) return state.sessionId;
    if (state is ChatReadOnly) return state.sessionId;
    return null;
  }

  /// Active RAGFlow agent for this session — mirrors [_readSessionId] so
  /// every voice event carries the same attribution the bloc's fires do.
  String _readAgentId() {
    final state = _tryReadChatBloc()?.state;
    if (state is ChatReady) return state.agentId;
    if (state is ChatReadOnly) return state.chatConfig.agentId ?? '';
    return '';
  }

  // ---- Analytics fires (all §18.3) ------------------------------------

  /// PRD §18.3 `chat_voice_clicked`.
  void _fireVoiceClicked(String permissionStatus) {
    unawaited(
      ref
          .read(analyticsProvider)
          ?.trackEvent(
            ChatEvents.chatVoiceClicked,
            properties: <String, Object?>{
              ChatEventProps.agentId: _readAgentId(),
              // TODO(TAM-N-chat-content-context) — plumb from launch payload.
              ChatEventProps.entrySource: '',
              ChatEventProps.messageNumber: _readMessageNumberForNextSend(),
              ChatEventProps.permissionStatus: permissionStatus,
              ChatEventProps.hasContentContext: false,
            },
          ),
    );
  }

  /// PRD §18.3 `chat_voice_permission_result`.
  void _fireVoicePermissionResult(String result) {
    final askCount = ref
        .read(chatCountersProvider)
        .incrementVoicePermissionAskCount();
    unawaited(
      ref
          .read(analyticsProvider)
          ?.trackEvent(
            ChatEvents.chatVoicePermissionResult,
            properties: <String, Object?>{
              ChatEventProps.agentId: _readAgentId(),
              ChatEventProps.result: result,
              ChatEventProps.askCount: askCount,
            },
          ),
    );
  }

  /// PRD §18.3 `chat_voice_recorded`. Fires on ANY successful recording
  /// end (empty transcript included), just before the transcribe /
  /// transcribed-empty branching.
  void _fireVoiceRecorded({required int durationMs}) {
    unawaited(
      ref
          .read(analyticsProvider)
          ?.trackEvent(
            ChatEvents.chatVoiceRecorded,
            properties: <String, Object?>{
              ChatEventProps.agentId: _readAgentId(),
              ChatEventProps.durationMs: durationMs,
              ChatEventProps.voiceNoteId: _pendingVoiceNoteId ?? '',
              ChatEventProps.chatSessionId: _readSessionId() ?? '',
              ChatEventProps.messageNumber: _readMessageNumberForNextSend(),
            },
          ),
    );
  }

  /// PRD §18.3 `chat_voice_cancelled`.
  void _fireVoiceCancelled({required int durationMs}) {
    unawaited(
      ref
          .read(analyticsProvider)
          ?.trackEvent(
            ChatEvents.chatVoiceCancelled,
            properties: <String, Object?>{
              ChatEventProps.agentId: _readAgentId(),
              ChatEventProps.durationMs: durationMs,
              ChatEventProps.voiceNoteId: _pendingVoiceNoteId ?? '',
              ChatEventProps.chatSessionId: _readSessionId() ?? '',
              ChatEventProps.messageNumber: _readMessageNumberForNextSend(),
            },
          ),
    );
  }

  /// PRD §18.3 `chat_voice_transcribed`.
  ///
  /// `transcription_time_ms` shares its value with `audio_duration_ms`:
  /// the device streams partials as it hears them, so there is no
  /// separate transcription window to measure.
  void _fireVoiceTranscribed({
    required String transcript,
    required double? confidence,
    required int audioDurationMs,
    required String result,
  }) {
    unawaited(
      ref
          .read(analyticsProvider)
          ?.trackEvent(
            ChatEvents.chatVoiceTranscribed,
            properties: <String, Object?>{
              ChatEventProps.agentId: _readAgentId(),
              ChatEventProps.transcriptText: transcript,
              ChatEventProps.transcriptLanguage: 'hi-IN',
              ChatEventProps.transcriptConfidence: confidence,
              ChatEventProps.audioDurationMs: audioDurationMs,
              ChatEventProps.transcriptionTimeMs: audioDurationMs,
              ChatEventProps.result: result,
              ChatEventProps.voiceNoteId: _pendingVoiceNoteId ?? '',
              // Bug 8 — was missing; warehouse defaulted the absent
              // property to 0 and the funnel couldn't distinguish "voice
              // for opening message" from "voice for follow-up".
              ChatEventProps.messageNumber: _readMessageNumberForNextSend(),
            },
          ),
    );
  }

  /// PRD §18.3 `chat_voice_transcription_failed`.
  void _fireVoiceTranscriptionFailed({
    required String failureReason,
    required int audioDurationMs,
  }) {
    unawaited(
      ref
          .read(analyticsProvider)
          ?.trackEvent(
            ChatEvents.chatVoiceTranscriptionFailed,
            properties: <String, Object?>{
              ChatEventProps.agentId: _readAgentId(),
              ChatEventProps.failureReason: failureReason,
              ChatEventProps.audioDurationMs: audioDurationMs,
              ChatEventProps.voiceNoteId: _pendingVoiceNoteId ?? '',
              // Bug 8 — same fix as transcribed above.
              ChatEventProps.messageNumber: _readMessageNumberForNextSend(),
            },
          ),
    );
  }

  // ---- Permission mapping (unchanged from TAM-164) --------------------

  static String _mapCurrentPermissionStatus(PermissionStatus s) {
    switch (s) {
      case PermissionStatus.granted:
      case PermissionStatus.limited:
      case PermissionStatus.provisional:
        return ChatVoicePermissionStatus.granted;
      case PermissionStatus.denied:
        return ChatVoicePermissionStatus.notYetAsked;
      case PermissionStatus.permanentlyDenied:
      case PermissionStatus.restricted:
        return ChatVoicePermissionStatus.denied;
    }
  }

  /// The pre-prompt rationale. Users who tap "Not now" stay denied — no OS
  /// prompt fires and their next mic tap re-shows this dialog. Users who
  /// tap "Allow" fall through to `Permission.microphone.request()`.
  Future<bool?> _showMicRationaleDialog() {
    return showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        key: const Key('chat-mic-rationale-dialog'),
        title: const Text('Allow microphone?'),
        content: const Text(
          'To dictate messages instead of typing, Prabhu Ji needs access to '
          'your microphone. Recording only happens while you hold the mic '
          'button — nothing is captured otherwise.',
        ),
        actions: <Widget>[
          TextButton(
            key: const Key('chat-mic-rationale-cancel'),
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Not now'),
          ),
          TextButton(
            key: const Key('chat-mic-rationale-allow'),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Allow'),
          ),
        ],
      ),
    );
  }

  /// The "permanently denied" recovery. The OS won't show its own prompt
  /// again once the user has ticked "Don't ask again" (Android) or denied
  /// twice (iOS), so the only way back is Settings.
  Future<void> _showMicPermanentlyDeniedDialog() {
    return showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        key: const Key('chat-mic-settings-dialog'),
        title: const Text('Microphone access is off'),
        content: const Text(
          'You have blocked microphone access for Prabhu Ji. Enable it from '
          'the app settings to dictate messages.',
        ),
        actions: <Widget>[
          TextButton(
            key: const Key('chat-mic-settings-cancel'),
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Not now'),
          ),
          TextButton(
            key: const Key('chat-mic-settings-open'),
            onPressed: () async {
              Navigator.of(dialogContext).pop();
              await openAppSettings();
            },
            child: const Text('Open settings'),
          ),
        ],
      ),
    );
  }

  void _showRestrictedSnackbar() {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(
          content: Text(
            'Microphone access is restricted on this device by parental controls or MDM.',
          ),
        ),
      );
  }

  void _showEmptyTranscriptSnackbar() {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(
          key: Key('chat-voice-empty-snackbar'),
          content: Text('Awaaz sunai nahi di, dobara try kijiye.'),
        ),
      );
  }

  void _showTranscribeFailureSnackbar() {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(
          key: Key('chat-voice-failure-snackbar'),
          content: Text(
            'Voice input abhi kaam nahi kar raha, dobara try kijiye.',
          ),
        ),
      );
  }

  void _handleSend() {
    if (!_canSend) return;
    widget.onSend(widget.controller.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    // Bottom system-nav inset is owned by the shell's bottomNavigationBar
    // slot (SafeArea(top: false) around the mini-player/nav Column in
    // AppShellScaffold), matching how home/status work. The composer sits
    // above that inset, so it needs no manual viewPaddingOf compensation.
    return Container(
      key: const Key('chat-composer'),
      decoration: const BoxDecoration(
        color: AppColors.white,
        border: Border(
          top: BorderSide(color: AppColors.chatComposerDivider, width: 1),
        ),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: AppChat.composerMinHeight),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppChat.composerPaddingH,
            AppChat.composerPaddingV,
            AppChat.composerPaddingH,
            AppChat.composerPaddingV,
          ),
          child: _pill(),
        ),
      ),
    );
  }

  /// The 328×50 field pill (Figma 2612:18010 `Background+Border+Shadow`)
  /// encloses BOTH the text field and the action circle. Inner pad is
  /// `4/4/4/4` (per Figma) — the TextField gets an additional
  /// [AppChat.composerFieldTextLeadPad] on its own contentPadding so the
  /// caret doesn't sit against the pill's rounded end.
  Widget _pill() {
    return ConstrainedBox(
      constraints: const BoxConstraints(
        minHeight: AppChat.composerFieldMinHeight,
      ),
      child: Container(
        padding: const EdgeInsets.all(AppChat.composerFieldPaddingH),
        decoration: BoxDecoration(
          color: AppColors.chatComposerSurface,
          borderRadius: BorderRadius.circular(AppChat.composerFieldRadius),
          border: Border.all(color: AppColors.chatComposerBorder, width: 1),
          // Figma `2612:18010 Background+Border+Shadow` — drop shadow
          // `#000 @0.05 offset(0,1) radius=2`. Confirmed via Figma REST
          // 2026-09-02.
          boxShadow: AppChat.surfaceShadow,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: <Widget>[
            Expanded(child: _isRecording ? _recordingStrip() : _field()),
            const SizedBox(width: AppChat.composerFieldActionGap),
            _actionButton(),
          ],
        ),
      ),
    );
  }

  Widget _field() {
    return TextField(
      key: const Key('chat-composer-field'),
      controller: widget.controller,
      enabled: widget.enabled && !widget.pending,
      maxLines: 4,
      minLines: 1,
      maxLength: AppChat.messageMaxChars,
      textInputAction: TextInputAction.send,
      onSubmitted: (_) => _handleSend(),
      keyboardType: TextInputType.multiline,
      inputFormatters: <TextInputFormatter>[
        LengthLimitingTextInputFormatter(AppChat.messageMaxChars),
      ],
      style: AppText.chatComposerText(),
      decoration: InputDecoration(
        hintText: widget.hintText,
        hintStyle: AppText.chatComposerText(color: AppColors.chatComposerHint),
        border: InputBorder.none,
        enabledBorder: InputBorder.none,
        focusedBorder: InputBorder.none,
        disabledBorder: InputBorder.none,
        isCollapsed: true,
        counterText: '',
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppChat.composerFieldTextLeadPad,
          vertical: 8,
        ),
      ),
    );
  }

  /// The recording strip that replaces the [_field] while [_isRecording]
  /// is true. Layout, left-to-right:
  ///
  ///   * pulsing mic dot + mm:ss counter
  ///   * live transcript (ellipsised — one line)
  ///   * "← swipe to cancel" hint
  ///
  /// Wrapped in a horizontal-drag detector: dragging left past
  /// [_kCancelSlideThreshold] pixels cancels the recording. Given the
  /// keyboard style choice locks tap-to-toggle (not hold-to-record), the
  /// slide-to-cancel target is the STRIP itself (the mic button stays a
  /// clean toggle target).
  Widget _recordingStrip() {
    final elapsed = _formatElapsed(_elapsedMs);
    return GestureDetector(
      key: const Key('chat-composer-recording'),
      behavior: HitTestBehavior.opaque,
      onHorizontalDragStart: (_) => _cancelDragOffset = 0.0,
      onHorizontalDragUpdate: (details) {
        _cancelDragOffset += details.delta.dx;
        if (_cancelDragOffset <= -_kCancelSlideThreshold) {
          unawaited(_cancelRecording());
        }
      },
      onHorizontalDragEnd: (_) {
        _cancelDragOffset = 0.0;
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppChat.composerFieldTextLeadPad,
          vertical: 6,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: <Widget>[
            _RecordingPulseDot(),
            const SizedBox(width: 8),
            Text(
              elapsed,
              key: const Key('chat-composer-recording-elapsed'),
              style: AppText.chatComposerText(),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                _liveTranscript.isEmpty ? 'Sun rahe hain...' : _liveTranscript,
                key: const Key('chat-composer-recording-transcript'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: _liveTranscript.isEmpty
                    ? AppText.chatComposerText(
                        color: AppColors.chatComposerHint,
                      )
                    : AppText.chatComposerText(),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              '← Slide to cancel',
              style: AppText.chatComposerText(
                color: AppColors.chatComposerHint,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _actionButton() {
    // Three variants:
    //  * recording → SEND glyph (the tap will finalize + send the
    //    dictated transcript, so the icon should read "send", not "mic
    //    that also happens to send"). Tap routes through
    //    `_handleMicTap` → `_stopRecording` → transcribe → dispatch.
    //  * typed (idle + text present) → SEND glyph. Tap → `_handleSend`.
    //  * idle (empty text) → MIC glyph. Tap → `_handleMicTap` →
    //    permission playbook → start recording.
    //
    // Icon selection is separate from tap behavior so the icon reflects
    // user intent (send the voice note vs. type-and-send vs. start
    // recording) while the tap routing still dispatches correctly. Key
    // follows icon so widget tests + accessibility (Semantics) agree on
    // which button is on screen.
    //
    // Bug 1 Layer B — HIDE the mic entirely (not just disable) when the
    // composer is gated. `widget.enabled` reflects the bloc's ChatReady
    // state (see `_ChatScreen._buildComposer`): ChatReadOnly / Initial /
    // LoadingHistory / HistoryFailed all pass `enabled: false`. Showing a
    // greyed mic in those states used to invite a tap that silently
    // dropped the recording (Bug 1). Nothing to send + nothing to record
    // = no action button at all.
    if (!_isRecording && !_showSend && !widget.enabled) {
      return const SizedBox.shrink(key: Key('chat-composer-action-hidden'));
    }
    final showSend = _isRecording || _showSend;
    final glyphAsset = showSend
        ? 'assets/chat/send.svg'
        : 'assets/chat/mic.svg';
    final fill = showSend
        ? AppColors.chatComposerSendFill
        : AppColors.chatComposerMicFill;
    final glyphTint = showSend
        ? AppColors.chatComposerSendGlyph
        : AppColors.chatComposerMicGlyph;
    // The mic tap is enabled when the composer itself is enabled and no
    // send is in flight — sending must not be interrupted by an OS prompt.
    // While recording the button is always tappable (it acts as the stop
    // control even under the send icon) even if `pending` flipped mid-
    // recording.
    final canTapMic = _isRecording || (widget.enabled && !widget.pending);
    final VoidCallback? onTap;
    if (_isRecording) {
      onTap = _handleMicTap; // routes to _stopRecording via the toggle
    } else if (_showSend) {
      onTap = _canSend ? _handleSend : null;
    } else {
      onTap = canTapMic ? _handleMicTap : null;
    }
    final semantics = _isRecording
        ? 'Send voice message'
        : (_showSend
              ? 'Send message'
              : (canTapMic ? 'Voice input' : 'Voice input (disabled)'));
    return Opacity(
      // Full opacity when the mic is interactive; slight dim when it isn't
      // (read-only mode / mid-send).
      opacity: (showSend || canTapMic) ? 1.0 : 0.85,
      child: Semantics(
        button: onTap != null,
        enabled: onTap != null,
        label: semantics,
        // Figma `2612:18010` `Button:shadow` — 40×40 circle with a stacked
        // elevation shadow (2 layers, #000 @0.10). Painted on the outer
        // `DecoratedBox` so Material can keep owning the ink surface.
        child: DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: AppChat.composerButtonShadow,
          ),
          child: Material(
            key: showSend
                ? const Key('chat-composer-send')
                : const Key('chat-composer-mic'),
            color: fill,
            shape: const CircleBorder(),
            child: InkWell(
              onTap: onTap,
              customBorder: const CircleBorder(),
              child: SizedBox(
                width: AppChat.composerActionButton,
                height: AppChat.composerActionButton,
                child: Center(
                  child: SvgPicture.asset(
                    glyphAsset,
                    width: AppChat.composerActionIcon,
                    height: AppChat.composerActionIcon,
                    colorFilter: ColorFilter.mode(glyphTint, BlendMode.srcIn),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  static String _defaultUuid() => const Uuid().v4();

  static String _formatElapsed(int ms) {
    final totalSeconds = ms ~/ 1000;
    final minutes = (totalSeconds ~/ 60).toString().padLeft(2, '0');
    final seconds = (totalSeconds % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }
}

/// A subtly pulsing red dot rendered next to the elapsed-time counter.
/// Pure decorative — no analytics, no accessibility label (the strip's
/// content already reads `Recording…` via the transcript text).
class _RecordingPulseDot extends StatefulWidget {
  @override
  State<_RecordingPulseDot> createState() => _RecordingPulseDotState();
}

class _RecordingPulseDotState extends State<_RecordingPulseDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.4, end: 1.0).animate(_pulse),
      child: Container(
        width: 10,
        height: 10,
        decoration: const BoxDecoration(
          color: Color(0xFFE53935),
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}
