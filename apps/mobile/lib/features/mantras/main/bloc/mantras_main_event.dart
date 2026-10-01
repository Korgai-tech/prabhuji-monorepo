import 'package:meta/meta.dart';

@immutable
sealed class MantrasMainEvent {
  const MantrasMainEvent();
}

/// Initial load of `GET /mantras/sections` (fires
/// `mantras_stutis_page_viewed`). The optional [previousScreen] +
/// [entrySource] ride on the analytics event when the caller can supply them
/// (deep link, home widget, notification); both omitted otherwise.
class MantrasMainLoadRequested extends MantrasMainEvent {
  const MantrasMainLoadRequested({this.previousScreen, this.entrySource});

  final String? previousScreen;
  final String? entrySource;
}

/// Retry after a full-page failure (nav visible, NO paywall).
class MantrasMainRetryRequested extends MantrasMainEvent {
  const MantrasMainRetryRequested();
}
