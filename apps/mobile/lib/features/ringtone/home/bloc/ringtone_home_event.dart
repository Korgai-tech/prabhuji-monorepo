import 'package:meta/meta.dart';

@immutable
sealed class RingtoneHomeEvent {
  const RingtoneHomeEvent();
}

/// Load the first grid page (All Gods, no filter). Fired on module entry.
class RingtoneHomeLoadRequested extends RingtoneHomeEvent {
  const RingtoneHomeLoadRequested();
}

/// A deity chip was tapped — filter the grid IN-PLACE (`deityId` query, or
/// `null` for All Gods). Never leaves the screen, never triggers the paywall.
class RingtoneHomeDeitySelected extends RingtoneHomeEvent {
  const RingtoneHomeDeitySelected({this.deityId, this.deityName});
  final String? deityId;
  final String? deityName;
}

/// Load the next grid page via `nextCursor` (lazy pagination).
class RingtoneHomeNextPageRequested extends RingtoneHomeEvent {
  const RingtoneHomeNextPageRequested();
}

/// Retry after a first-page CMS failure.
class RingtoneHomeRetryRequested extends RingtoneHomeEvent {
  const RingtoneHomeRetryRequested();
}
