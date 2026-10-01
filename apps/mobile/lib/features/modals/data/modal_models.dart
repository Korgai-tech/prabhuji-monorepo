import 'package:meta/meta.dart';

import '../../../api/generated/openapi.dart';

/// Domain view model for the generalized modal (TAM-174), mapped from the
/// generated `ServableModal` — presentation never touches `lib/api/generated`
/// directly. Mirrors `lib/features/home/data/home_models.dart`'s
/// register/`fromWire` naming.
@immutable
class ServableModalView {
  const ServableModalView({
    required this.key,
    required this.triggerSource,
    required this.showNumber,
    required this.localeServed,
    required this.title,
    required this.ctaText,
    required this.ctaDeeplink,
    this.body,
    this.imageUrl,
    this.lastOutcomeModule,
  });

  /// Stable identity for THIS armed modal instance — echoed back on every
  /// `POST /modals/impressions` call for it.
  final String key;

  /// Server-supplied, e.g. `"first_time" | "post_outcome"`. The CLIENT never
  /// decides this — it only passes it through to analytics/impressions
  /// verbatim.
  final String triggerSource;

  /// The idempotency key. MUST be echoed back UNCHANGED on every impression
  /// report for this modal instance — never recomputed/incremented
  /// client-side (the server does a `showNumber - 1` compare-and-swap; a
  /// wrong value here burns a user's lifetime show quota).
  final int showNumber;

  final String localeServed;

  final String title;

  /// Optional body copy — renders between the title and the preview panel
  /// when present; the widget omits the slot entirely when null/blank.
  final String? body;

  /// Sample status image for the preview panel. Null/blank ⇒ no image (the
  /// hint row still renders); a load FAILURE hides the whole panel — see
  /// `StatusIntroModal`.
  final String? imageUrl;

  final String ctaText;

  /// Resolved through the client allowlist in
  /// `presentation/modal_cta_resolver.dart` — see that file for why an
  /// allowlist and not a full router. An unrecognised value resolves to "do
  /// nothing" (`ModalHost` logs a warning and does not navigate), never a
  /// crash or an error surface.
  final String ctaDeeplink;

  /// The analytics event that earned this prompt (e.g. a status share
  /// outcome); null when the arm carried none.
  final String? lastOutcomeModule;

  factory ServableModalView.fromWire(ServableModal w) {
    return ServableModalView(
      key: w.key,
      triggerSource: w.triggerSource,
      showNumber: w.showNumber,
      localeServed: w.localeServed,
      title: w.content.title,
      body: w.content.body,
      imageUrl: w.content.imageUrl,
      ctaText: w.content.ctaText,
      ctaDeeplink: w.content.ctaDeeplink,
      lastOutcomeModule: w.lastOutcomeModule,
    );
  }
}
