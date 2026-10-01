import 'package:equatable/equatable.dart';

sealed class HoroscopeMainEvent extends Equatable {
  const HoroscopeMainEvent();
  @override
  List<Object?> get props => [];
}

/// Screen mounted — load the 12 FREE zodiac cards. Fires `horoscope_tab_opened`.
class HoroscopeMainRequested extends HoroscopeMainEvent {
  const HoroscopeMainRequested();
}

/// Retry after a load failure. Fires `horoscope_retry_tapped`.
class HoroscopeMainRetried extends HoroscopeMainEvent {
  const HoroscopeMainRetried();
}
