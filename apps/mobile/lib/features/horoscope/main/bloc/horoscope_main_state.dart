import 'package:equatable/equatable.dart';

import '../../data/horoscope_models.dart';

enum HoroscopeMainStatus { loading, ready, failure }

/// State of the FREE zodiac-grid screen (Figma 371:3796).
///
/// There is no Pro/entitlement flag here on purpose: the grid is FREE for
/// everyone and shows no lock badges (PRD §5). Gating happens on TAP.
class HoroscopeMainState extends Equatable {
  const HoroscopeMainState({
    this.status = HoroscopeMainStatus.loading,
    this.signs = const [],
    this.dateIst = '',
    this.errorMessage,
  });

  final HoroscopeMainStatus status;

  /// Server-ordered signs (by `sortOrder`).
  final List<HoroscopeZodiacSign> signs;

  /// IST civil date for the header (client-derived — see [istCivilDateNow]).
  final String dateIst;
  final String? errorMessage;

  /// The header's "15 June, 2026".
  String get formattedDate => dateIst.isEmpty ? '' : formatHoroscopeDate(dateIst);

  HoroscopeMainState copyWith({
    HoroscopeMainStatus? status,
    List<HoroscopeZodiacSign>? signs,
    String? dateIst,
    String? errorMessage,
    bool clearError = false,
  }) {
    return HoroscopeMainState(
      status: status ?? this.status,
      signs: signs ?? this.signs,
      dateIst: dateIst ?? this.dateIst,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }

  @override
  List<Object?> get props => [status, signs, dateIst, errorMessage];
}
