import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../state/providers.dart';
import '../data/modal_models.dart';
import '../data/modals_repository.dart';
import '../modals_analytics.dart';
import '../modals_providers.dart';
import 'modal_cta_resolver.dart';
import 'status_intro_modal.dart';

/// TAM-174 — wraps Home's body and arms the ONE generalized-modal check for
/// this cold start (`GET /modals/next?surface=home`), then wires whatever it
/// shows to `POST /modals/impressions` + analytics. See the spec:
/// `.superpowers/sdd/2026-09-11-generalized-modal-audience-trigger/frontend-brief.md`.
///
/// **Deliberate limitation**: [_checkedThisLaunch] is a PROCESS-lifetime
/// latch, not a widget-lifetime one — the check runs exactly once per app
/// PROCESS, the first time a `ModalHost` builds, regardless of how many
/// times this widget itself is recreated (Home rebuilds, bottom-nav tab
/// returns, pull-to-refresh, …). An app resumed from background into a
/// fresh analytics session will NOT re-check until the process actually
/// restarts. This is the accepted product gap the brief calls out — the
/// modal is a cold-start surface, not a resume surface.
///
/// **A second, related gap from the SAME latch**: it is set the instant
/// `initState` runs, before `GET /modals/next` is even sent (see the "Set
/// the latch NOW" comment below) — deliberately, so a fast rebuild mounting
/// a second `ModalHost` in the same process can't double-fire the fetch. The
/// cost is that if the user navigates away from Home before that request
/// resolves, `_checkForModal`'s `!mounted` guard bails on the response and
/// the check is silently dropped — not merely delayed, but never retried for
/// the rest of the process, since the latch is already spent. Accepted for
/// the same reason as the resume gap above: a modal is the least important
/// thing happening on a Home open, so losing one check to a fast navigation
/// is preferable to either blocking Home or double-fetching.
class ModalHost extends ConsumerStatefulWidget {
  const ModalHost({super.key, required this.child});

  final Widget child;

  /// Process-lifetime latch — private to this LIBRARY (file), not this
  /// class, so `_ModalHostState` reads/writes it directly below. Declared on
  /// the public widget (rather than the private State) purely so
  /// [debugResetLatch] has a public host to hang off for tests.
  static bool _checkedThisLaunch = false;

  /// Test-only: resets the process latch so each test file/case gets a
  /// clean slate. Production code never calls this.
  @visibleForTesting
  static void debugResetLatch() => _checkedThisLaunch = false;

  @override
  ConsumerState<ModalHost> createState() => _ModalHostState();
}

class _ModalHostState extends ConsumerState<ModalHost> {
  @override
  void initState() {
    super.initState();
    if (ModalHost._checkedThisLaunch) return;
    // Set the latch NOW, before the async check even starts, so a second
    // `ModalHost` mounting in the same process (e.g. a fast rebuild) can't
    // double-fire the check. The tradeoff this buys — a navigation away from
    // Home before the fetch resolves permanently drops the check for the
    // rest of the process — is documented on the class above.
    ModalHost._checkedThisLaunch = true;
    // Home paints first; the network round-trip happens after the first
    // frame, never blocking Home's own first paint.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_checkForModal());
    });
  }

  // A modal is the least important thing happening on a Home open. Every
  // failure mode — offline, 401, malformed envelope, a server that is
  // simply down — resolves to "no modal", never to an error surface and
  // never to a retry. Home must render identically whether this call
  // succeeds or not.
  Future<void> _checkForModal() async {
    try {
      final repo = ref.read(modalsRepositoryProvider);
      final modal = await repo.fetchNext(surface: 'home');
      // A navigation away from Home before this resolves lands here with
      // the latch already spent — see the class-level "second gap" doc.
      if (!mounted) return;
      // `modal == null` is the ORDINARY answer — capped, halted, or nothing
      // armed all return 200 with a null modal. Nothing to show; nothing to
      // report.
      if (modal == null) return;
      await _presentModal(modal);
    } catch (_) {
      // Swallowed by design — see the header comment above.
    }
  }

  Future<void> _presentModal(ServableModalView modal) async {
    final repo = ref.read(modalsRepositoryProvider);
    final analytics = ref.read(analyticsProvider);

    Map<String, Object?> baseProps() => <String, Object?>{
      // Sourced from the fetched modal, never hardcoded — see
      // `ModalEventProps.modalKey`'s doc.
      ModalEventProps.modalKey: modal.key,
      ModalEventProps.triggerSource: modal.triggerSource,
      ModalEventProps.showNumber: modal.showNumber,
      ModalEventProps.lastOutcomeModule: modal.lastOutcomeModule,
    };

    // Fire-and-forget with its own swallow, per the brief: a failed report
    // must never block the dialog or navigation.
    Future<void> report(String action, {String? dismissMethod}) async {
      try {
        await repo.reportImpression(
          modalKey: modal.key,
          triggerSource: modal.triggerSource,
          action: action,
          // Echoed EXACTLY as `fetchNext` returned it — never recomputed.
          showNumber: modal.showNumber,
          dismissMethod: dismissMethod,
        );
      } catch (_) {
        // Swallowed — see [report]'s doc.
      }
    }

    await showDialog<void>(
      context: context,
      // Native `barrierDismissible` gives no hook to attribute WHICH of the
      // three dismiss methods fired — `StatusIntroModal` implements its own
      // full-screen tap-catcher instead, so `outside_tap` is reported
      // distinctly from `cross`/`back`. The scrim still paints via
      // `barrierColor` below.
      barrierDismissible: false,
      barrierColor: const Color(0x99000000),
      builder: (dialogContext) => StatusIntroModal(
        content: modal,
        onViewed: () {
          unawaited(report(ModalImpressionAction.viewed));
          unawaited(
            analytics?.trackEvent(ModalEvents.viewed, properties: baseProps()),
          );
        },
        onCta: () {
          unawaited(report(ModalImpressionAction.ctaClicked));
          unawaited(
            analytics?.trackEvent(
              ModalEvents.ctaClicked,
              properties: baseProps(),
            ),
          );
          // Pop the dialog FIRST (using ITS OWN context), then navigate on
          // the host's long-lived context — mirrors
          // `LogoutConfirmationDialog`'s "pop first" note.
          Navigator.of(dialogContext).pop();
          if (!mounted) return;
          // Server-driven destination — resolved through the allowlist, not
          // hardcoded, so a second modal's `ctaDeeplink` is a campaign row,
          // not a deploy. See `modal_cta_resolver.dart` for why this is an
          // allowlist and not `DeepLinkService`.
          final handler = resolveModalCta(modal.ctaDeeplink);
          if (handler == null) {
            // Unresolvable target: `cta_clicked` has already fired above —
            // the tap genuinely happened and the funnel must record it, so a
            // misconfigured campaign link is visible in analytics instead of
            // silently dropped. But never navigate and never throw: a modal
            // is the least important thing happening on a Home open.
            debugPrint(
              '[ModalHost] no allowlisted handler for ctaDeeplink '
              '"${modal.ctaDeeplink}" (modal ${modal.key}) — not navigating.',
            );
            return;
          }
          unawaited(handler(context));
        },
        onDismiss: (method) {
          unawaited(
            report(ModalImpressionAction.dismissed, dismissMethod: method),
          );
          unawaited(
            analytics?.trackEvent(
              ModalEvents.dismissed,
              properties: {
                ...baseProps(),
                ModalEventProps.dismissMethod: method,
              },
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
