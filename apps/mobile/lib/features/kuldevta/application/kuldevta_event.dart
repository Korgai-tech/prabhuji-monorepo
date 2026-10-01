import 'package:equatable/equatable.dart';

/// Events for [KuldevtaBloc] (TAM-166).
///
/// Every event is a user-driven transition — there is no async event that
/// the bloc emits to itself (identify is fired inside the primary/pata-nahi
/// handler on step 6, retry is its own event).
sealed class KuldevtaEvent extends Equatable {
  const KuldevtaEvent();

  @override
  List<Object?> get props => const <Object?>[];
}

/// Cold-mount: the entry screen was rendered.
class KuldevtaFlowMounted extends KuldevtaEvent {
  const KuldevtaFlowMounted();
}

/// Entry screen's primary CTA — pushes the wizard onto step 0.
class KuldevtaStarted extends KuldevtaEvent {
  const KuldevtaStarted();
}

/// Wizard's primary "Aage Badhein" CTA — records the trimmed answer for
/// the current step. On steps 1..5 advances to the next step; on step 6
/// triggers `POST /kuldevta/identify` and navigates to the loading screen.
class KuldevtaAnswerSubmitted extends KuldevtaEvent {
  const KuldevtaAnswerSubmitted(this.text, {this.byVoice = false});

  final String text;

  /// Whether this answer arrived as a transcribed voice note rather than
  /// typed text (TAM-177).
  ///
  /// The khoj questions are now answered in the chat composer, which has a
  /// microphone — so `answer_method` needs a third value beyond `typed` and
  /// `pata_nahi`. Carried on the EVENT rather than inferred in the bloc
  /// because only the composer knows how the text was produced; by the time
  /// the string reaches `_recordAnswer` a transcript and a typed sentence are
  /// indistinguishable.
  final bool byVoice;

  @override
  List<Object?> get props => <Object?>[text, byVoice];
}

/// Wizard's secondary "Pata Nahi" CTA — records `""` for the current step.
/// Same transition rules as [KuldevtaAnswerSubmitted] (advance or fire).
class KuldevtaPataNahiTapped extends KuldevtaEvent {
  const KuldevtaPataNahiTapped();
}

/// Wizard's back arrow. On step 0 pops the whole wizard back to the entry
/// screen. On steps 1..5 pops one step (answers preserved).
class KuldevtaBackTapped extends KuldevtaEvent {
  const KuldevtaBackTapped();
}

/// Loading screen's back arrow — cancels the inflight identify and
/// returns to step 6 with all six answers preserved.
class KuldevtaLoadingCancelled extends KuldevtaEvent {
  const KuldevtaLoadingCancelled();
}

/// Error screen's "Retry" affordance — re-fires the same identify request
/// with the cached six-answer body.
class KuldevtaRetryTapped extends KuldevtaEvent {
  const KuldevtaRetryTapped();
}

/// Result screen's green share button — dispatched by the screen AFTER
/// `ShareService.share(...)` returns, so [destinationApp] can carry the
/// receiving Android package the OS reported (TAM-167). `null` when the
/// user dismissed the sheet or the platform didn't disclose the choice.
///
/// The bloc's handler is what fires `kuldevta_result_shared`; keeping
/// the fire in the bloc (not the screen) means a widget-side crash on
/// the share path doesn't drop the event silently — the event dispatch
/// happens before the screen can throw, and the bloc handler is
/// synchronous.
class KuldevtaShareTapped extends KuldevtaEvent {
  const KuldevtaShareTapped({this.destinationApp});

  final String? destinationApp;

  @override
  List<Object?> get props => <Object?>[destinationApp];
}

/// Result screen's primary chat CTA ("Mata Se Baat Karein" / "Baba Se
/// Baat Karein"). Analytics fire + `/users/me` refetch happen here; the
/// actual `router.push` is dispatched by the screen (it needs a
/// `BuildContext`).
class KuldevtaChatTapped extends KuldevtaEvent {
  const KuldevtaChatTapped();
}
