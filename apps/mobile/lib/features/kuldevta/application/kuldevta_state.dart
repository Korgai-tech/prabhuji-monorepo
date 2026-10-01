import 'package:equatable/equatable.dart';

import '../domain/kuldevta_answers.dart';
import '../domain/kuldevta_result.dart';

/// State surface for [KuldevtaBloc] (TAM-166).
///
/// One sealed hierarchy — each variant is a distinct render mode. The
/// [answers] value is carried on every stateful variant so back-arrow
/// navigation between steps preserves everything the user typed (spec
/// §Acceptance Criteria › Wizard behaviour — "answers on prior steps stay
/// preserved in bloc state").
sealed class KuldevtaState extends Equatable {
  const KuldevtaState();

  /// The answers accumulated so far — every variant carries this so a
  /// back-nav from any point can rebuild the wizard's input state.
  KuldevtaAnswers get answers;

  @override
  List<Object?> get props => <Object?>[answers];
}

/// The entry frame ("Apne kuldevta janiye"). No wizard mounted yet;
/// [answers] is whatever the last wizard cycle left in memory (fresh:
/// [KuldevtaAnswers.empty]).
class KuldevtaEntry extends KuldevtaState {
  const KuldevtaEntry({this.answers = KuldevtaAnswers.empty});

  @override
  final KuldevtaAnswers answers;
}

/// The wizard is showing one of the six steps.
class KuldevtaAnsweringQuestion extends KuldevtaState {
  const KuldevtaAnsweringQuestion({
    required this.stepIndex,
    required this.answers,
    this.botTyping = false,
  });

  /// 0..5.
  final int stepIndex;

  @override
  final KuldevtaAnswers answers;

  /// The beat between the user's answer and the next question appearing.
  ///
  /// True means "the question at [stepIndex] has NOT been shown yet" — the
  /// thread renders a typing bubble in its place. Without it the next question
  /// lands in the same frame as the answer, which reads as a form validating
  /// rather than someone replying, and undoes the point of moving the wizard
  /// into a chat thread.
  ///
  /// A flag rather than a separate state because every consumer already
  /// switches on [KuldevtaAnsweringQuestion] and reads [stepIndex] to decide
  /// what is answered; a new class would force each of them to handle a case
  /// that carries exactly the same data.
  final bool botTyping;

  @override
  List<Object?> get props => <Object?>[stepIndex, answers, botTyping];
}

/// The identify request is inflight — the loading screen is mounted.
class KuldevtaIdentifying extends KuldevtaState {
  const KuldevtaIdentifying({required this.answers});

  @override
  final KuldevtaAnswers answers;
}

/// The identify request failed. Preserves the six answers so retry can
/// re-fire the same body without asking the user to re-type.
class KuldevtaFailed extends KuldevtaState {
  const KuldevtaFailed({
    required this.answers,
    required this.errorKind,
    this.httpStatus,
    this.errorCode,
  });

  @override
  final KuldevtaAnswers answers;

  /// Coarse error bucket — matches [KuldevtaEventProps.isRetryable] logic
  /// downstream. Values: `network` | `server_5xx` | `validation` |
  /// `cancelled` | `unknown`.
  final String errorKind;

  final int? httpStatus;
  final String? errorCode;

  @override
  List<Object?> get props =>
      <Object?>[answers, errorKind, httpStatus, errorCode];
}

/// 200 response arrived — the result screen renders from this variant's
/// [kuldevta] payload.
class KuldevtaResultReady extends KuldevtaState {
  const KuldevtaResultReady({
    required this.answers,
    required this.kuldevta,
  });

  @override
  final KuldevtaAnswers answers;

  final KuldevtaResult kuldevta;

  @override
  List<Object?> get props => <Object?>[answers, kuldevta];
}
