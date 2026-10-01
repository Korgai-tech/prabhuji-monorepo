import 'package:flutter/widgets.dart';

import '../../status/application/status_navigation.dart';
import '../../status/status_analytics.dart';

/// TAM-174 — resolves a server-supplied `ServableModalView.ctaDeeplink` to an
/// in-app action.
///
/// **Why this is an allowlist, and NOT a router.** `ctaDeeplink` arrives over
/// `POST /internal/modals/hooks`, a webhook whose only control is a shared
/// secret (`x-modal-hook-key`). Without an allowlist, whoever holds that
/// secret chooses what the app opens. Mapping to a fixed set of handlers
/// keeps that decision in the CLIENT, where it is reviewable — a new target
/// needs an app release, same as the campaign console needing a new handler
/// wired here before it can point at one.
///
/// This deliberately does NOT route through `DeepLinkService`
/// (`lib/core/deep_link_service.dart`). That service exists to gate
/// *external, untrusted* links (marketing URLs, install referrers) with auth
/// and paywall checks before they can navigate — a genuinely different
/// problem. Running an in-app CTA through it would apply the wrong gates: a
/// modal is already scoped to a logged-in user on Home, and its target is
/// chosen by a campaign operator, not a stranger's clicked link.
typedef ModalCtaHandler = Future<void> Function(BuildContext context);

/// Status personal-details editor — today's only modal, today's only target.
Future<void> _openStatusPersonalDetails(BuildContext context) =>
    pushStatusDetails(context, entrySource: StatusEntrySources.introModal);

/// The allowlist. Keys are the canonical `prabhuji://` deeplinks this app
/// knows how to serve; [resolveModalCta] compares against these on a
/// NORMALISED basis (see below), so a harmless formatting difference in
/// campaign config never breaks a CTA that is otherwise correctly targeted.
///
/// **These keys are a CONTRACT with campaign configuration, not an internal
/// detail.** The exact string here is what a campaign author must put in
/// `content.<locale>.ctaDeeplink` in the campaign console; the two are
/// documented together in `specs/TAM-174-generalized-modal-audience-trigger.md`.
/// A mismatch is silent — the modal still renders and `cta_clicked` still
/// fires, but the CTA navigates nowhere. If you rename a key here, update the
/// spec (and any live campaign config) in the same change.
///
/// A second modal type means one more entry here — nothing else in this
/// file changes.
const Map<String, ModalCtaHandler> _modalCtaHandlers =
    <String, ModalCtaHandler>{
  'prabhuji://status/personal-details': _openStatusPersonalDetails,
};

/// Returns the handler for [deeplink], or `null` when it is not on the
/// allowlist. Callers MUST treat `null` as "do not navigate" — never throw,
/// never surface an error; see `ModalHost`'s `onCta` for the caller-side
/// contract (still report `cta_clicked` either way).
ModalCtaHandler? resolveModalCta(String deeplink) {
  final target = _normalise(deeplink);
  if (target == null) return null;
  for (final MapEntry<String, ModalCtaHandler> entry
      in _modalCtaHandlers.entries) {
    if (_normalise(entry.key) == target) return entry.value;
  }
  return null;
}

/// Parses with [Uri.tryParse] and compares scheme + host + path only,
/// case-insensitively, ignoring a single trailing slash on the path — so
/// `Prabhuji://Status/Personal-Details/` still matches
/// `prabhuji://status/personal-details`.
/// Returns `null` when [deeplink] does not even parse as a URI.
String? _normalise(String deeplink) {
  final Uri? uri = Uri.tryParse(deeplink);
  if (uri == null) return null;
  String path = uri.path.toLowerCase();
  if (path.length > 1 && path.endsWith('/')) {
    path = path.substring(0, path.length - 1);
  }
  return '${uri.scheme.toLowerCase()}://${uri.host.toLowerCase()}$path';
}
