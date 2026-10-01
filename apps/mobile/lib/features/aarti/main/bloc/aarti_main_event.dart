import 'package:meta/meta.dart';

@immutable
sealed class AartiMainEvent {
  const AartiMainEvent();
}

/// Initial load of `GET /aarti/main` (fires `aarti_bhajans_opened`).
class AartiMainLoadRequested extends AartiMainEvent {
  const AartiMainLoadRequested();
}

/// Retry after a full-page failure (§7.6 — nav visible, no paywall).
class AartiMainRetryRequested extends AartiMainEvent {
  const AartiMainRetryRequested();
}
