import '../domain/kuldevta_answers.dart';

/// The six wizard questions, in order (TAM-166). Locked strings — the
/// prompts / helper subtitles / field names are all product-signed-off in
/// the design references at `specs/evidence/kuldevta-discovery/`.
///
/// One list drives EVERY wizard step — do NOT build six duplicate screens
/// (spec §Layout intent — "All six wizard steps share ONE screen shell
/// reading from a `_kQuestions` list"). The wizard shell reads the current
/// step's descriptor and renders the shared frame.
class KuldevtaQuestion {
  const KuldevtaQuestion({
    required this.field,
    required this.title,
    required this.inputKind,
    this.helperSubtitle,
    this.maxChars = 200,
  });

  /// One of the six locked field names (matches
  /// [KuldevtaAnswers.fields]). Used to write the answer via
  /// [KuldevtaAnswers.copyWithField] AND as the analytics `field_name`.
  final String field;

  /// The Hinglish prompt shown as the step's title.
  final String title;

  /// Optional Hinglish helper subtitle. Only Q2 (`ancestralPlace`) has
  /// one, per the design reference.
  final String? helperSubtitle;

  /// Single-line rounded oval (Q1 — surname) vs multi-line rounded
  /// rectangle (Q2..Q6 — the fuller-context fields).
  final KuldevtaInputKind inputKind;

  /// Client-side soft cap matching the server's `.trim().max(200)` at
  /// `apps/api/src/core/kuldevta/routes/kuldevta.schemas.ts:15`. The
  /// server's Zod check is authoritative; the client gate is a UX
  /// affordance.
  final int maxChars;
}

enum KuldevtaInputKind {
  singleLine,
  multiLine,
}

/// The six-item list the wizard shell reads. Order matches
/// [KuldevtaAnswers.fields] verbatim; do NOT reorder.
const List<KuldevtaQuestion> kKuldevtaQuestions = <KuldevtaQuestion>[
  KuldevtaQuestion(
    field: 'surname',
    title: 'Apka surname kya he?',
    inputKind: KuldevtaInputKind.singleLine,
  ),
  KuldevtaQuestion(
    field: 'ancestralPlace',
    title: 'Apka parivar kaha se he?',
    helperSubtitle:
        'Jaha abhi rehte he vo nahi. Dada pardada ji jaha se the vo bataiye.',
    inputKind: KuldevtaInputKind.multiLine,
  ),
  KuldevtaQuestion(
    field: 'community',
    title: 'Aap kis samaj se he?',
    inputKind: KuldevtaInputKind.multiLine,
  ),
  KuldevtaQuestion(
    field: 'gotra',
    title: 'Apka gotra kya he?',
    inputKind: KuldevtaInputKind.multiLine,
  ),
  KuldevtaQuestion(
    field: 'templeMentioned',
    title: 'Apke dada dadi konse mandir jaate the?',
    inputKind: KuldevtaInputKind.multiLine,
  ),
  KuldevtaQuestion(
    field: 'mandirPhoto',
    title: 'Apke ghar ke mandir mein kis devta devi ki photo lagi he?',
    inputKind: KuldevtaInputKind.multiLine,
  ),
];
