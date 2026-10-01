/// Support analytics — event names + property keys + entry-point enum
/// (TAM-N-support-screen).
///
/// Sourced 1:1 from the analytics contract's Sheet 1 (repo rule per
/// `apps/mobile/CLAUDE.md`: constants track the sheet, not the other way
/// round). Two events:
///
///  * `support_opened` — fired ONCE from `initState` of [SupportScreen]. The
///    `source` property tags whichever entry point pushed the route (home
///    header, profile menu, or `unknown` for a deep-link / hot-restart
///    fallback where the `go_router` `extra` was lost).
///  * `support_whatsapp_clicked` — fired on tap of the enabled Chat on
///    WhatsApp CTA, BEFORE the `launchUrl` await. Carries NO extra properties
///    (no raw number, no message, no URL — PII / config-value hygiene).
///
/// Callers use these constants, never string literals, so a rename is a
/// grep-safe atomic change.
class SupportEvents {
  SupportEvents._();

  /// Row for Support screen entry — fires once from `initState`.
  static const String opened = 'support_opened';

  /// Row for the WhatsApp CTA tap — fires only in the enabled state, BEFORE
  /// `launchUrl` is awaited. The degraded (grey/disabled) state does NOT fire
  /// this event (would inflate the metric with intent that can never succeed).
  static const String whatsAppClicked = 'support_whatsapp_clicked';
}

/// Canonical property-key names for Support events. Reused across call sites
/// so a value name like `source` lives in one place.
class SupportEventProps {
  SupportEventProps._();

  /// Where the user came from when landing on the Support screen.
  /// Values: `home_header | profile_menu | unknown`.
  static const String source = 'source';
}

/// The two locked entry points that push `/support` (spec §"Context"). A
/// third `unknown` bucket exists in analytics for deep-link / hot-restart
/// paths where the `go_router` `extra` was lost — represented in the
/// widget/router by passing `null`, not by an enum value here (so a caller
/// can never accidentally send `'unknown'` as a first-class entry point).
///
/// `wire` is the exact string the analytics contract expects (never
/// re-emit — the sheet locks these strings).
enum SupportEntrySource {
  homeHeader('home_header'),
  profileMenu('profile_menu');

  const SupportEntrySource(this.wire);

  /// The analytics-contract wire value for this entry point.
  final String wire;
}

/// Bucket value fired when the Support screen is entered without a known
/// `SupportEntrySource` (deep-link, hot-restart, extras stripped by the
/// router). Kept as a public constant so tests can assert against it and
/// the analytics dashboard can filter on it.
const String kSupportSourceUnknown = 'unknown';
