import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../../core/entitlement.dart';
import '../../../core/theme.dart';
import '../../../core/user_properties.dart';
import '../../../state/providers.dart';
import '../../paywall/data/payment_repository.dart';
import '../../paywall/paywall_analytics.dart';
import '../../paywall/presentation/paywall_screen.dart';
import '../application/subscription_cancel_providers.dart';
import '../application/subscription_cancel_types.dart';
import '../subscription_cancel_analytics.dart';
import 'cancel_subscription_dialog.dart' as dialog;

/// TAM-125 Manage Subscription details screen.
///
/// Figma frames: `1939:19854` (active state) / `1939:20420` (cancellation
/// scheduled). Free-tier users never reach this screen (Profile v2's
/// Manage Subscription tile only pushes here for `isVip == true`), but a
/// deep-mount fallback renders the "no active subscription" placeholder.
///
/// The screen owns TWO reads on mount, fired in parallel:
///   * `mandateSnapshotProvider` (`GET /payment/mandate`) → plan / dates /
///     mandate state
///   * `latestCancelRequestProvider` (`GET /subscription/cancel-requests/me`)
///     → status pill + Cancel-vs-hidden button
///
/// Status pill mapping is the LOCKED §2.5 table — `pending`, `processing`,
/// AND `completed` all render the same "Cancellation scheduled" pill.
class ManageSubscriptionScreen extends ConsumerStatefulWidget {
  const ManageSubscriptionScreen({super.key});

  @override
  ConsumerState<ManageSubscriptionScreen> createState() =>
      _ManageSubscriptionScreenState();
}

class _ManageSubscriptionScreenState
    extends ConsumerState<ManageSubscriptionScreen> {
  /// Deduplication guard on the `subscription_cancel_request_status_viewed`
  /// analytics event — the FutureProvider can rebuild the same
  /// non-null row across resubscribes / theme changes, and we want the
  /// event to fire exactly ONCE per (mount, status) combination.
  String? _lastLoggedRequestStatus;

  @override
  void initState() {
    super.initState();
    // §5 — one event on entry.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      unawaited(
        ref.read(analyticsProvider)?.trackEvent(
          SubscriptionCancelEvents.profileSubscriptionViewed,
          properties: <String, Object?>{
            SubscriptionCancelEventProps.previousScreen:
                SubscriptionCancelEventValues.previousScreenProfileMenu,
          },
        ),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final isVip = ref.watch(entitlementProvider);
    final mandateAsync = ref.watch(mandateSnapshotProvider);
    final latestReqAsync = ref.watch(latestCancelRequestProvider);
    final inFlight = ref.watch(cancelRequestInFlightProvider);

    return Scaffold(
      key: const Key('manage-subscription-screen'),
      backgroundColor: AppColors.brand100,
      body: Stack(
        children: <Widget>[
          DecoratedBox(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: <Color>[AppColors.brand100, AppColors.white],
                stops: <double>[0.0, 0.35],
              ),
            ),
            child: SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  const _TopBar(),
                  Expanded(
                    key: const Key('manage-subscription-scroll-region'),
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: _Content(
                        isVip: isVip,
                        mandateAsync: mandateAsync,
                        latestReqAsync: latestReqAsync,
                        onStatusRendered: _maybeLogStatusViewed,
                      ),
                    ),
                  ),
                  _BottomActionArea(
                    isVip: isVip,
                    mandateAsync: mandateAsync,
                    latestReqAsync: latestReqAsync,
                  ),
                ],
              ),
            ),
          ),
          if (inFlight)
            const Positioned.fill(
              key: Key('manage-subscription-loading-overlay'),
              child: _LoadingOverlay(),
            ),
        ],
      ),
    );
  }

  void _maybeLogStatusViewed(CancellationRequestStatus status) {
    final wire = status.toWire();
    if (_lastLoggedRequestStatus == wire) return;
    _lastLoggedRequestStatus = wire;
    unawaited(
      ref.read(analyticsProvider)?.trackEvent(
        SubscriptionCancelEvents.subscriptionCancelRequestStatusViewed,
        properties: <String, Object?>{
          SubscriptionCancelEventProps.requestStatus: wire,
        },
      ),
    );
  }
}

/// Content region (scrollable). Renders the section card + (when relevant)
/// the rejected-state helper line.
class _Content extends ConsumerWidget {
  const _Content({
    required this.isVip,
    required this.mandateAsync,
    required this.latestReqAsync,
    required this.onStatusRendered,
  });

  final bool isVip;
  final AsyncValue<MandateSnapshot?> mandateAsync;
  final AsyncValue<CancellationRequestData?> latestReqAsync;
  final void Function(CancellationRequestStatus) onStatusRendered;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!isVip) {
      return const _FreeTierPlaceholder();
    }

    if (mandateAsync.hasError) {
      return _ErrorState(
        onRetry: () {
          ref.invalidate(mandateSnapshotProvider);
          ref.invalidate(latestCancelRequestProvider);
        },
      );
    }
    if (!mandateAsync.hasValue) {
      return const _LoadingState();
    }
    final mandate = mandateAsync.value;
    if (mandate == null) {
      // VIP flag says pro, but the mandate is missing — treat as no active
      // subscription (rare, defensive; the Cancel row stays hidden).
      return const _FreeTierPlaceholder();
    }

    final latest = latestReqAsync.asData?.value;
    if (latest != null) {
      // Fires each render pass; the parent's `_lastLoggedRequestStatus`
      // guard dedupes at the analytics layer.
      onStatusRendered(latest.status);
    }
    final isCancellationScheduled =
        latest != null && latest.status != CancellationRequestStatus.rejected;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        const SizedBox(height: 16),
        _SectionCard(
          borderColor: AppColors.brand400,
          key: const Key('manage-subscription-section-card'),
          children: <Widget>[
            _SectionRow(
              key: const Key('manage-subscription-row-current-plan'),
              leading: const _StarLeadingIcon(),
              label: 'Current Plan',
              value: _resolvePlanLabel(mandate),
            ),
            const _RowDivider(),
            _SectionRow(
              key: const Key('manage-subscription-row-membership-since'),
              leading: const _CalendarLeadingIcon(),
              label: 'Membership since',
              // Membership-since date will be sourced from
              // `MandateData.startedAt` once the BE agent adds it to the
              // schema (§4). Until then we display an em-dash so we
              // never render a wrong "since" date guessed from the
              // client clock.
              value: _resolveStartedAtLabel(mandate),
            ),
            const _RowDivider(),
            _SectionRow(
              key: Key(isCancellationScheduled
                  ? 'manage-subscription-row-vip-until'
                  : 'manage-subscription-row-renewal-date'),
              leading: const _RefreshLeadingIcon(),
              label: isCancellationScheduled
                  ? 'VIP access until'
                  : 'Renewal Date',
              value: _resolveEndDateLabel(mandate, isCancellationScheduled),
            ),
            if (latest != null &&
                latest.status != CancellationRequestStatus.rejected) ...<Widget>[
              const _RowDivider(),
              _SectionRow(
                key: const Key('manage-subscription-row-status'),
                leading: const _RefreshLeadingIcon(),
                label: 'Status',
                // §2.5: pending / processing / completed all render the
                // single Figma-designed "Cancellation scheduled" pill —
                // LOCKED by PO ruling #2.
                value: 'Cancellation scheduled',
                valueKey:
                    const Key('manage-subscription-status-pill'),
              ),
            ],
          ],
        ),
        if (latest != null &&
            latest.status == CancellationRequestStatus.rejected) ...<Widget>[
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              // TODO(TAM-125 design gap): `rejected` state ships this
              // placeholder copy per §Design gaps #2. Design has NOT
              // commissioned a proper rejected pill / helper style.
              'Cancellation request rejected — please contact support if you believe this was a mistake.',
              key: const Key('manage-subscription-rejected-helper'),
              style: AppText.bodySm(color: AppColors.grey500),
            ),
          ),
        ],
      ],
    );
  }

  String _resolvePlanLabel(MandateSnapshot mandate) {
    // TODO(TAM-125 design gap): resolve via `paywallConfigProvider` →
    // `PaywallPlanDisplay.localizedLabel` once the Membership since row's
    // BE-side `startedAt` field lands. For now the raw `planId` is the
    // best defensive value — never hard-code "Prabhuji VIP Monthly".
    return mandate.planId;
  }

  String _resolveStartedAtLabel(MandateSnapshot mandate) {
    // `MandateSnapshot.startedAt` doesn't exist yet — §4 covers adding it
    // via the BE agent's contract change. Fall back to an em-dash so we
    // never guess the "since" date from the client clock.
    return '—';
  }

  String _resolveEndDateLabel(
    MandateSnapshot mandate,
    bool isCancellationScheduled,
  ) {
    // The Figma value is the renewal / expiry date; both come from the
    // wire `nextDebitDate` (§2 table row 3). Format `dd MMMM yyyy` en_IN.
    final rawDate = mandate.nextDebitDate;
    if (rawDate == null || rawDate.isEmpty) return '—';
    // The server can send either an ISO-8601 datetime OR a bare
    // `yyyy-MM-dd`. Try datetime first, fall back to date-only.
    DateTime? parsed;
    try {
      parsed = DateTime.parse(rawDate);
    } catch (_) {
      parsed = null;
    }
    if (parsed == null) return rawDate;
    return dialog.formatCancelDialogExpiryDate(parsed);
  }
}

/// Section card matching Figma frame (328 wide, r=16, hairline fills + a
/// coloured 2px border). Reused by the active + cancellation-scheduled
/// states — the border colour flips (orange vs. no bottom red).
class _SectionCard extends StatelessWidget {
  const _SectionCard({
    super.key,
    required this.children,
    required this.borderColor,
  });
  final List<Widget> children;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: borderColor, width: 2),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: children,
        ),
      ),
    );
  }
}

/// One row inside the section card: leading icon + label (black) + value
/// (orange). Row height matches Figma's 20-tall inner + 12 vertical
/// padding, expressed as minHeight so text scale grows the tile.
class _SectionRow extends StatelessWidget {
  const _SectionRow({
    super.key,
    required this.leading,
    required this.label,
    required this.value,
    this.valueKey,
  });

  final Widget leading;
  final String label;
  final String value;
  final Key? valueKey;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 20),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: <Widget>[
            SizedBox(width: 18, height: 18, child: leading),
            const SizedBox(width: 12),
            Flexible(
              flex: 3,
              child: Text(
                label,
                style: AppText.labelMd(color: AppColors.black),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 12),
            Flexible(
              flex: 5,
              child: Text(
                value,
                key: valueKey,
                style: AppText.labelMd(color: AppColors.brand400),
                textAlign: TextAlign.end,
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RowDivider extends StatelessWidget {
  const _RowDivider();

  @override
  Widget build(BuildContext context) {
    // Figma hairline #FFE4C4 1px.
    return const Divider(
      height: 1,
      thickness: 1,
      color: Color(0xFFFFE4C4),
    );
  }
}

// ---------------------------------------------------------------------------
// Leading icons — 18×18 Material glyphs tinted per Figma. Deliberately NOT
// pulling raster/SVG assets from Figma for TAM-125 — the design uses common
// glyphs (star, calendar, refresh) that Material provides at the correct
// visual weight, and adding three per-icon SVGs would burn tokens for
// negligible fidelity gain. The icon COLOURS are Figma-verified.
// ---------------------------------------------------------------------------

class _StarLeadingIcon extends StatelessWidget {
  const _StarLeadingIcon();

  @override
  Widget build(BuildContext context) {
    return const Icon(
      Icons.star_rounded,
      size: 18,
      color: Color(0xFFF8BE00), // Figma star fill #F8BE00
    );
  }
}

class _CalendarLeadingIcon extends StatelessWidget {
  const _CalendarLeadingIcon();

  @override
  Widget build(BuildContext context) {
    return const Icon(
      Icons.calendar_today_outlined,
      size: 16,
      color: AppColors.brand400,
    );
  }
}

class _RefreshLeadingIcon extends StatelessWidget {
  const _RefreshLeadingIcon();

  @override
  Widget build(BuildContext context) {
    return Transform.rotate(
      angle: 0.4,
      child: const Icon(
        Icons.autorenew_rounded,
        size: 18,
        color: AppColors.brand400,
      ),
    );
  }
}

/// Free-tier / no-subscription placeholder. Spec §2: "You don't have an
/// active subscription yet." + upgrade CTA.
class _FreeTierPlaceholder extends StatelessWidget {
  const _FreeTierPlaceholder();

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: const Key('manage-subscription-free-tier'),
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: <Widget>[
          Text(
            "You don't have an active subscription yet.",
            textAlign: TextAlign.center,
            style: AppText.bodyMd(color: AppColors.grey500),
          ),
          const SizedBox(height: 16),
          _PillCta(
            key: const Key('manage-subscription-upgrade-cta'),
            label: 'Upgrade to VIP',
            onTap: () => context.push(
              '/paywall',
              extra: const PaywallArgs(
                triggerModule: UserPropertyModule.profile,
                triggerAction: PaywallTriggerAction.upgradeCta,
                entrySource: PaywallEntrySource.manageSubscription,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Loading placeholder — sits inside the content region while the mandate
/// fetch resolves. Deliberately NOT a full-screen spinner (that shape
/// belongs to the in-flight overlay for the POST cascade).
class _LoadingState extends StatelessWidget {
  const _LoadingState();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 48),
      child: Center(
        child: SizedBox(
          key: Key('manage-subscription-loading'),
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
    );
  }
}

/// Error state — spec §2 AC: "an error state renders with a Retry button".
class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: const Key('manage-subscription-error'),
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: <Widget>[
          Text(
            "Couldn't load your subscription details.",
            textAlign: TextAlign.center,
            style: AppText.bodyMd(color: AppColors.grey500),
          ),
          const SizedBox(height: 16),
          _PillCta(
            key: const Key('manage-subscription-retry-cta'),
            label: 'Retry',
            onTap: onRetry,
          ),
        ],
      ),
    );
  }
}

class _PillCta extends StatelessWidget {
  const _PillCta({super.key, required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.button),
          child: Container(
            decoration: BoxDecoration(
              gradient: AppGradient.ctaLR,
              borderRadius: BorderRadius.circular(AppRadius.button),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 32),
            alignment: Alignment.center,
            child: Text(
              label,
              style: AppText.labelLg(color: AppColors.white),
            ),
          ),
        ),
      ),
    );
  }
}

/// Pinned bottom Cancel row. Hidden entirely when a request row exists
/// with status ∈ {pending, processing, completed} (§2.5); visible when
/// there is no request OR the latest is `rejected`.
class _BottomActionArea extends ConsumerWidget {
  const _BottomActionArea({
    required this.isVip,
    required this.mandateAsync,
    required this.latestReqAsync,
  });
  final bool isVip;
  final AsyncValue<MandateSnapshot?> mandateAsync;
  final AsyncValue<CancellationRequestData?> latestReqAsync;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!isVip) return const SizedBox.shrink();
    final mandate = mandateAsync.asData?.value;
    if (mandate == null) return const SizedBox.shrink();
    final latest = latestReqAsync.asData?.value;
    final requestActive = latest != null &&
        latest.status != CancellationRequestStatus.rejected;
    if (requestActive) {
      // §2.5 + § Out of scope: no phantom-footer space when hidden AND we
      // deliberately DO NOT ship the Figma "Restart Subscription" tile.
      return const SizedBox.shrink();
    }
    final expiresAt = _mandateExpiryDate(mandate);
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: _CancelSubscriptionRow(
          onTap: () => _onCancelTapped(context, ref, expiresAt: expiresAt),
        ),
      ),
    );
  }

  DateTime? _mandateExpiryDate(MandateSnapshot mandate) {
    final raw = mandate.nextDebitDate;
    if (raw == null || raw.isEmpty) return null;
    try {
      return DateTime.parse(raw);
    } catch (_) {
      return null;
    }
  }

  Future<void> _onCancelTapped(
    BuildContext context,
    WidgetRef ref, {
    required DateTime? expiresAt,
  }) async {
    // §5 — intent event, before the modal opens.
    unawaited(
      ref.read(analyticsProvider)?.trackEvent(
        SubscriptionCancelEvents.subscriptionCancelTapped,
        properties: <String, Object?>{
          SubscriptionCancelEventProps.entryPoint:
              SubscriptionCancelEventValues.entryPointProfileManageSubscription,
        },
      ),
    );
    await dialog.showCancelSubscriptionDialog(
      context,
      ref,
      expiresAt: expiresAt,
    );
  }
}

/// The bottom Cancel row (Figma `1939:19854` — the destructive card). 328×44
/// visual, red 2px border, radius 16, red label + arrow.
class _CancelSubscriptionRow extends StatelessWidget {
  const _CancelSubscriptionRow({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.error200, width: 2),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          key: const Key('manage-subscription-cancel-row'),
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.card),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 12,
            ),
            child: Row(
              children: <Widget>[
                const Icon(
                  Icons.cancel_outlined,
                  size: 18,
                  color: AppColors.error200,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Cancel Subscription',
                    style: AppText.labelMd(color: AppColors.error200),
                  ),
                ),
                const Icon(
                  Icons.chevron_right_rounded,
                  size: 22,
                  color: AppColors.error200,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Full-screen loading overlay. Shown while the destructive-CTA cascade's
/// POST is in flight (see `cancelRequestInFlightProvider`).
class _LoadingOverlay extends StatelessWidget {
  const _LoadingOverlay();

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black.withValues(alpha: 0.30),
      child: const Center(
        child: SizedBox(
          width: 32,
          height: 32,
          child: CircularProgressIndicator(
            strokeWidth: 2.5,
            valueColor: AlwaysStoppedAnimation<Color>(AppColors.white),
          ),
        ),
      ),
    );
  }
}

/// Top bar (Figma frame `1939:19854` — 44 dp back arrow + "Manage
/// Subscription" title in Inter 24 w600). Kept internal because it is a
/// one-off shape not shared with any other screen.
class _TopBar extends StatelessWidget {
  const _TopBar();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      key: const Key('manage-subscription-appbar'),
      height: AppNav.height,
      child: Row(
        children: <Widget>[
          const SizedBox(width: AppSpacing.xSmall),
          InkResponse(
            key: const Key('manage-subscription-back'),
            radius: 24,
            onTap: () => Navigator.of(context).maybePop(),
            child: SizedBox(
              width: 44,
              height: 44,
              child: Center(
                child: SvgPicture.asset(
                  'assets/aarti/back-arrow.svg',
                  width: 24,
                  height: 24,
                  colorFilter: const ColorFilter.mode(
                    AppColors.black,
                    BlendMode.srcIn,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.xSmall),
          Expanded(
            child: Text(
              'Manage Subscription',
              key: const Key('manage-subscription-title'),
              style: AppText.headingSm(color: AppColors.black),
            ),
          ),
        ],
      ),
    );
  }
}
