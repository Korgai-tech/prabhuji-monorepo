import 'package:equatable/equatable.dart';

/// The six-answer value class for the kuldevta discovery wizard (TAM-166).
///
/// One field per wizard step, all `String` (matches
/// `apps/api/src/core/kuldevta/routes/kuldevta.schemas.ts:15-25`, which
/// defaults every unspecified field to `""`). Every field defaults to `""`
/// so a fresh wizard state has a stable shape without special-cases.
///
/// The list order is FIXED — it drives the wizard's step order AND is the
/// list of fields the identify request body carries. Do NOT reorder.
class KuldevtaAnswers extends Equatable {
  const KuldevtaAnswers({
    this.surname = '',
    this.ancestralPlace = '',
    this.community = '',
    this.gotra = '',
    this.templeMentioned = '',
    this.mandirPhoto = '',
  });

  static const KuldevtaAnswers empty = KuldevtaAnswers();

  final String surname;
  final String ancestralPlace;
  final String community;
  final String gotra;
  final String templeMentioned;
  final String mandirPhoto;

  /// The six field names in wizard order — used to write the correct
  /// slot on `KuldevtaAnswers.copyWithField` and for analytics
  /// `field_name` on `kuldevta_question_answered`.
  static const List<String> fields = <String>[
    'surname',
    'ancestralPlace',
    'community',
    'gotra',
    'templeMentioned',
    'mandirPhoto',
  ];

  /// Immutable set-by-index helper. The wizard bloc walks `stepIndex` 0..5
  /// and calls this to write the current step's answer without needing a
  /// switch statement in the reducer.
  KuldevtaAnswers copyWithField(int stepIndex, String value) {
    switch (stepIndex) {
      case 0:
        return copyWith(surname: value);
      case 1:
        return copyWith(ancestralPlace: value);
      case 2:
        return copyWith(community: value);
      case 3:
        return copyWith(gotra: value);
      case 4:
        return copyWith(templeMentioned: value);
      case 5:
        return copyWith(mandirPhoto: value);
      default:
        return this;
    }
  }

  /// Read-by-index helper — matches [copyWithField]'s slot order. Used by
  /// the wizard shell to prefill the input when the user steps back.
  String fieldAt(int stepIndex) {
    switch (stepIndex) {
      case 0:
        return surname;
      case 1:
        return ancestralPlace;
      case 2:
        return community;
      case 3:
        return gotra;
      case 4:
        return templeMentioned;
      case 5:
        return mandirPhoto;
      default:
        return '';
    }
  }

  KuldevtaAnswers copyWith({
    String? surname,
    String? ancestralPlace,
    String? community,
    String? gotra,
    String? templeMentioned,
    String? mandirPhoto,
  }) {
    return KuldevtaAnswers(
      surname: surname ?? this.surname,
      ancestralPlace: ancestralPlace ?? this.ancestralPlace,
      community: community ?? this.community,
      gotra: gotra ?? this.gotra,
      templeMentioned: templeMentioned ?? this.templeMentioned,
      mandirPhoto: mandirPhoto ?? this.mandirPhoto,
    );
  }

  /// Convenience for analytics — the count of non-empty answers. Used on
  /// `kuldevta_identify_requested` as `answered_count`.
  int get answeredCount {
    int n = 0;
    for (final f in <String>[
      surname,
      ancestralPlace,
      community,
      gotra,
      templeMentioned,
      mandirPhoto,
    ]) {
      if (f.trim().isNotEmpty) n += 1;
    }
    return n;
  }

  /// Convenience for analytics — the count of empty answers. Used on
  /// `kuldevta_identify_requested` as `pata_nahi_count`. NOTE: this is
  /// `6 - answeredCount`; kept as its own getter so the caller reads
  /// intent, not arithmetic.
  int get pataNahiCount => 6 - answeredCount;

  @override
  List<Object?> get props => <Object?>[
        surname,
        ancestralPlace,
        community,
        gotra,
        templeMentioned,
        mandirPhoto,
      ];
}
