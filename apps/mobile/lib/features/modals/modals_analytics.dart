/// Generalized modal analytics (TAM-174) — event names + property keys, the
/// module's own contract in one place. Follows
/// `lib/features/status/status_analytics.dart`'s register: callers use these
/// constants, never string literals.
///
/// Event names are GENERIC — `modal_viewed`, not `status_intro_modal_viewed`
/// — with WHICH modal carried as a property ([ModalEventProps.modalKey]),
/// not baked into the event name. This module is server-driven: a second
/// modal is a campaign row, not a deploy, so a per-modal event name would
/// fragment the funnel on every new campaign — a fresh dashboard per modal,
/// and "how are modals performing" stops being answerable in one query. With
/// `modal_key` as a dimension, one modal is a filter and all modals are a
/// group-by.
///
/// All three events carry [ModalEventProps.modalKey], [ModalEventProps.triggerSource],
/// [ModalEventProps.showNumber] and [ModalEventProps.lastOutcomeModule] —
/// ALL taken from the server's `GET /modals/next` response for the modal
/// being shown, never recomputed/guessed client-side, so the funnel can
/// never disagree with the impressions ledger. [ModalEventProps.dismissMethod]
/// rides only on [ModalEvents.dismissed].
class ModalEvents {
  ModalEvents._();

  /// Fires exactly once, on the dialog's first paint (not from `build`,
  /// which can re-run for the same shown instance).
  static const String viewed = 'modal_viewed';

  /// Fires when the CTA is tapped, before the dialog closes / navigation
  /// starts.
  static const String ctaClicked = 'modal_cta_clicked';

  /// Fires on any of the three dismiss paths — see [ModalDismissMethods].
  static const String dismissed = 'modal_dismissed';
}

/// Canonical property-key names used across [ModalEvents].
class ModalEventProps {
  ModalEventProps._();

  /// Which modal this event is about — `ServableModal.key`, server-supplied.
  /// Never a constant: a second modal must carry ITS OWN key, not this
  /// module's first modal's.
  static const String modalKey = 'modal_key';

  /// Server-supplied. `"first_time" | "post_outcome"` — the client NEVER
  /// decides it.
  static const String triggerSource = 'trigger_source';

  /// Server-supplied, 1-based. The number THIS show is, not a client count.
  static const String showNumber = 'show_number';

  /// Server-supplied. The analytics event that earned this prompt; null when
  /// the arm carried none.
  static const String lastOutcomeModule = 'last_outcome_module';

  /// Client-only knowledge: one of [ModalDismissMethods]'s values.
  static const String dismissMethod = 'dismiss_method';
}

/// Canonical `dismiss_method` values — genuinely distinguished at the three
/// call sites (`StatusIntroModal`'s close cross, its `PopScope` system-back
/// handler, and its outside-tap catcher). Reporting `cross` for all three
/// would make the funnel lie.
class ModalDismissMethods {
  ModalDismissMethods._();

  static const String cross = 'cross';
  static const String back = 'back';
  static const String outsideTap = 'outside_tap';
}
