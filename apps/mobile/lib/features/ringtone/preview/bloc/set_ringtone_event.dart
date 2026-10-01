import 'package:meta/meta.dart';

@immutable
sealed class SetRingtoneEvent {
  const SetRingtoneEvent();
}

/// The user tapped "Set Ringtone" — begin the WRITE_SETTINGS flow for
/// [ringtoneId] with the resolved [audioUrl] + [title].
class SetRingtoneStartRequested extends SetRingtoneEvent {
  const SetRingtoneStartRequested({
    required this.ringtoneId,
    required this.audioUrl,
    required this.title,
    this.deitySlug,
  });
  final String ringtoneId;
  final String audioUrl;
  final String title;

  /// The slug of the deity this ringtone belongs to (`deities.slug`), carried
  /// so `set_ringtone_result` can be grouped by deity. `null` when the entry
  /// point has no deity on hand (e.g. the Home feed row).
  final String? deitySlug;
}

/// The app returned to the foreground (e.g. back from the settings screen) — if
/// we were waiting on the WRITE_SETTINGS grant, re-check `canWrite()` and either
/// proceed to set or surface the denied copy.
class SetRingtoneAppResumed extends SetRingtoneEvent {
  const SetRingtoneAppResumed();
}
