import 'package:equatable/equatable.dart';

sealed class HoroscopeResultEvent extends Equatable {
  const HoroscopeResultEvent();
  @override
  List<Object?> get props => [];
}

/// Screen mounted — fetch the Pro-gated daily result and start narration.
class HoroscopeResultRequested extends HoroscopeResultEvent {
  const HoroscopeResultRequested();
}

/// Retry after an error/empty-config/offline state.
class HoroscopeResultRetried extends HoroscopeResultEvent {
  const HoroscopeResultRetried();
}

/// "Next" tapped — stops any speech, advances, restarts narration if unmuted.
/// Stays available even while auto-advance is armed (PRD §6.7).
class HoroscopeNextTapped extends HoroscopeResultEvent {
  const HoroscopeNextTapped();
}

/// "Finish" tapped on the final step.
class HoroscopeFinishTapped extends HoroscopeResultEvent {
  const HoroscopeFinishTapped();
}

/// Back arrow tapped in the result nav — fires Sheet 1 row 107
/// (`horoscope_back_clicked`). Navigation itself is owned by the screen; this
/// exists so the bloc can capture from/to step context before pop.
class HoroscopeBackTapped extends HoroscopeResultEvent {
  const HoroscopeBackTapped();
}

/// The TTS engine finished the current utterance on its own.
/// Unmuted → auto-advance; muted → never fires (we don't speak).
class HoroscopeTtsCompleted extends HoroscopeResultEvent {
  const HoroscopeTtsCompleted();
}

/// The mute/unmute control was tapped. Session-scoped only (q3).
class HoroscopeMuteToggled extends HoroscopeResultEvent {
  const HoroscopeMuteToggled();
}

/// App went to background — stop speech so narration never continues after the
/// user leaves the flow (AC).
class HoroscopeAppBackgrounded extends HoroscopeResultEvent {
  const HoroscopeAppBackgrounded();
}

/// The video background failed to initialize → swap to the static fallback.
class HoroscopeVideoFailed extends HoroscopeResultEvent {
  const HoroscopeVideoFailed();
}
