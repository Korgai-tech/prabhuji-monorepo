import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme.dart';
import '../../../state/providers.dart';
import '../application/subscription_cancel_api.dart';
import '../application/subscription_cancel_providers.dart';
import '../subscription_cancel_analytics.dart';

/// TAM-125 confirm-cancel modal — Figma frame `1939:20314`.
///
/// Copy is LOCKED (spec §6, PO-ruled). The five `const String k…` fields
/// below are the only copy source — widget tests pin them so a copy change
/// fails a test.
///
/// Layout tokens (Figma):
///   * card 328×186, r=10, fill #FFFFFF, stroke #D5D6D9 1px
///   * padding 16 (content = 296)
///   * title Inter 16 w600 #414651
///   * body Inter 14 w400 #535861, `<expiresAt formatted>` in `AppColors.brand400`
///   * primary "No, Go Back" — 142×36 r=8 brand gradient (`AppGradient.ctaLR`),
///     white Inter 14 w500 label
///   * destructive "Cancel Subscription" — 142×36 r=8 solid #DA1F1F, white
///     Inter 14 w500 label
///   * X close 36×36, `#A3A7AE` icon
///
/// The destructive CTA is DISABLED the same frame the tap fires (PO ruling
/// #1) — a `_submitting` bool on the dialog's State. A second tap on the
/// same frame is a no-op → exactly ONE POST fires.

/// Locked-copy constants. Widget tests pin these strings; a copy change
/// here MUST be paired with a spec-owner sign-off (§6).
const String kCancelSubscriptionDialogTitle = 'Cancel your subscription?';
const String kCancelSubscriptionDialogBodyPrefix =
    "You'll continue to enjoy Prabhuji VIP benefits until ";
const String kCancelSubscriptionDialogBodySuffix =
    '. After that, your membership will not renew and you will not be charged again.';
const String kCancelSubscriptionDialogBodyTrialFallback =
    'Your Prabhuji VIP trial will end and your membership will not renew.';
const String kCancelSubscriptionDialogGoBackLabel = 'No, Go Back';
const String kCancelSubscriptionDialogDestructiveLabel = 'Cancel Subscription';

/// Post-submit SnackBar copy — LOCKED per §6. Public so widget tests can pin.
const String kCancelSubscriptionSnackSuccess =
    "Cancellation request raised — we'll update you once it's processed.";
const String kCancelSubscriptionSnackAlreadyExists =
    'You already have a pending cancellation request.';
const String kCancelSubscriptionSnackNetworkFallback =
    "Couldn't reach the server. Please try again.";

/// Format the `until <expiresAt>` date the dialog body carries.
///
/// Matches the Figma token `dd MMMM yyyy` (e.g. `DateTime.utc(2026, 7, 30)`
/// → `"30 July 2026"`). Written by hand — not through `intl.DateFormat` —
/// so widget tests don't need to call `initializeDateFormatting()` for the
/// `en_IN` locale. The English month names are the same in en_IN and en_US;
/// the "IN" locale hint only affected weekday/short-name rendering that
/// this template doesn't use.
String formatCancelDialogExpiryDate(DateTime expiresAt) {
  const monthNames = <String>[
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  final day = expiresAt.day.toString().padLeft(2, '0');
  final month = monthNames[expiresAt.month - 1];
  return '$day $month ${expiresAt.year}';
}

/// Opens the confirm-cancel modal. Scrim tap dismisses (per §6, `barrier-
/// Dismissible: true`).
///
/// [expiresAt] fills the body's date placeholder. `null` triggers the
/// trial-fallback body copy (never render the string "until null").
///
/// Returns `true` iff the destructive CTA was tapped and the cascade
/// started (the cascade fires its own SnackBar + analytics; the returned
/// bool is a courtesy signal for callers that want to react to "user
/// confirmed vs dismissed" — usually the caller ignores it).
Future<bool?> showCancelSubscriptionDialog(
  BuildContext context,
  WidgetRef ref, {
  required DateTime? expiresAt,
}) {
  return showDialog<bool>(
    context: context,
    barrierDismissible: true,
    builder: (dialogContext) => CancelSubscriptionDialog(
      ref: ref,
      expiresAt: expiresAt,
    ),
  );
}

class CancelSubscriptionDialog extends StatefulWidget {
  const CancelSubscriptionDialog({
    super.key,
    required this.ref,
    required this.expiresAt,
  });

  final WidgetRef ref;
  final DateTime? expiresAt;

  @override
  State<CancelSubscriptionDialog> createState() =>
      _CancelSubscriptionDialogState();
}

class _CancelSubscriptionDialogState extends State<CancelSubscriptionDialog> {
  /// PO ruling #1: "the destructive CTA becomes disabled the same frame the
  /// tap fires (before the network call — a second tap in the same frame
  /// is a no-op)". Guarded by this bool; set synchronously at the top of
  /// the on-tap handler BEFORE any await.
  bool _submitting = false;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      key: const Key('cancel-subscription-dialog'),
      backgroundColor: AppColors.white,
      surfaceTintColor: AppColors.white,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16),
      // Figma card radius = 10 (NOT AppRadius.card = 16 — this dialog uses
      // a tighter corner than the section cards on the screen behind it).
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(
          color: Color(0xFFD5D6D9),
          width: 1,
        ),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 328, maxHeight: 400),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              // Title row: text + X close aligned to the top.
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Expanded(
                    child: Text(
                      kCancelSubscriptionDialogTitle,
                      key: const Key('cancel-subscription-dialog-title'),
                      style: AppText.labelLg(
                        color: const Color(0xFF414651),
                      ).copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                  _CloseButton(
                    onTap: _submitting
                        ? null
                        : () => Navigator.of(context).pop(false),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              // Body copy — either the "until <expiresAt>" template or the
              // trial fallback when expiresAt is null.
              _BodyText(
                key: const Key('cancel-subscription-dialog-body'),
                expiresAt: widget.expiresAt,
              ),
              const SizedBox(height: 16),
              // Action row: brand-gradient primary "No, Go Back" +
              // destructive solid "Cancel Subscription".
              Row(
                children: <Widget>[
                  Expanded(
                    child: _PrimaryGoBackButton(
                      onTap: _submitting
                          ? null
                          : () => Navigator.of(context).pop(false),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _DestructiveCancelButton(
                      enabled: !_submitting,
                      onTap: _onDestructiveTapped,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// The cascade per §6 (locked). Runs BEFORE the dialog dismisses so:
  ///   1. `_submitting = true` disables the CTA the same frame the tap fires
  ///      (PO ruling #1 — pin in `disable-on-tap` widget test).
  ///   2. `Navigator.pop(true)` fires next so the modal route can't steal
  ///      `context` from the SnackBar that follows (mirrors the logout-
  ///      dialog "pop-first-then-cascade" pattern).
  ///   3. The POST + SnackBar + analytics cascade runs against a
  ///      pre-captured `ScaffoldMessengerState` so it's safe post-pop.
  Future<void> _onDestructiveTapped() async {
    // Guard: second tap in the same frame is a no-op. Set BEFORE any await
    // so the destructive button rebuilds disabled on the same frame.
    if (_submitting) return;
    setState(() {
      _submitting = true;
    });

    // Snapshot every seam we need after the dialog pops. The dialog's
    // build context unmounts the moment `Navigator.pop` runs, so we can't
    // use it for the SnackBar — grab the messenger + analytics + reader
    // NOW while the dialog is still mounted.
    final messenger = ScaffoldMessenger.of(context);
    final ref = widget.ref;
    final analytics = ref.read(analyticsProvider);
    final api = ref.read(subscriptionCancelApiProvider);

    // Flip the overlay flag so the manage-subscription screen renders a
    // full-screen CircularProgressIndicator behind the popping modal.
    ref.read(cancelRequestInFlightProvider.notifier).state = true;

    // Pop the dialog with `true` so the caller can chain (returned value
    // is a courtesy — the analytics/SnackBar cascade owns the observable
    // side-effects).
    Navigator.of(context).pop(true);

    try {
      await api.createCancelRequest();
      // 2xx — success branch (§6 step 5).
      _showSnack(messenger, kCancelSubscriptionSnackSuccess);
      // Trigger a re-fetch of the latest cancel request so any watcher
      // (screen pill, profile tile) rebuilds against the fresh state.
      ref.invalidate(latestCancelRequestProvider);
      unawaited(
        analytics?.trackEvent(
          SubscriptionCancelEvents.subscriptionCancelConfirmed,
          properties: <String, Object?>{
            SubscriptionCancelEventProps.entryPoint:
                SubscriptionCancelEventValues.entryPointProfileManageSubscription,
            SubscriptionCancelEventProps.outcome:
                SubscriptionCancelEventValues.outcomeCreated,
          },
        ),
      );
    } on PendingRequestExistsException catch (_) {
      // 409 PENDING_REQUEST_EXISTS — treated as SUCCESS per PO ruling #1
      // (§6 step 6). Silent refresh + existing-copy SnackBar.
      _showSnack(messenger, kCancelSubscriptionSnackAlreadyExists);
      ref.invalidate(latestCancelRequestProvider);
      unawaited(
        analytics?.trackEvent(
          SubscriptionCancelEvents.subscriptionCancelConfirmed,
          properties: <String, Object?>{
            SubscriptionCancelEventProps.entryPoint:
                SubscriptionCancelEventValues.entryPointProfileManageSubscription,
            SubscriptionCancelEventProps.outcome:
                SubscriptionCancelEventValues.outcomeExisting,
          },
        ),
      );
    } on SubscriptionCancelApiException catch (e) {
      // §6 step 7: any other non-2xx — render envelope's `message` verbatim.
      // The port's message field IS the envelope's `message` (or the locked
      // network fallback when the response was unparseable).
      _showSnack(messenger, e.message);
      unawaited(
        analytics?.trackEvent(
          SubscriptionCancelEvents.subscriptionCancelFailed,
          properties: <String, Object?>{
            SubscriptionCancelEventProps.entryPoint:
                SubscriptionCancelEventValues.entryPointProfileManageSubscription,
            SubscriptionCancelEventProps.reason: e.reason,
          },
        ),
      );
    } catch (_) {
      // Belt-and-braces: an unexpected throw is treated as network / unknown
      // — same fallback copy the port would emit for an unparseable body.
      _showSnack(messenger, kCancelSubscriptionSnackNetworkFallback);
      unawaited(
        analytics?.trackEvent(
          SubscriptionCancelEvents.subscriptionCancelFailed,
          properties: <String, Object?>{
            SubscriptionCancelEventProps.entryPoint:
                SubscriptionCancelEventValues.entryPointProfileManageSubscription,
            SubscriptionCancelEventProps.reason:
                SubscriptionCancelFailedReason.unknown,
          },
        ),
      );
    } finally {
      // Clear the overlay regardless of outcome (§6 steps 5/6/7 all pass
      // through here).
      ref.read(cancelRequestInFlightProvider.notifier).state = false;
    }
  }

  /// Common SnackBar shape (§6). Mirrors
  /// `otp_screen.dart:229-234` for consistency: 2s duration, bare
  /// `Text(content)`, no action button.
  void _showSnack(ScaffoldMessengerState messenger, String content) {
    messenger.showSnackBar(
      SnackBar(
        content: Text(content),
        duration: const Duration(seconds: 2),
      ),
    );
  }
}

class _BodyText extends StatelessWidget {
  const _BodyText({super.key, required this.expiresAt});
  final DateTime? expiresAt;

  @override
  Widget build(BuildContext context) {
    final baseStyle = AppText.bodySm(color: const Color(0xFF535861));

    if (expiresAt == null) {
      // Trial fallback — never render "until null" (§6).
      return Text(
        kCancelSubscriptionDialogBodyTrialFallback,
        style: baseStyle,
      );
    }
    final dateStr = formatCancelDialogExpiryDate(expiresAt!);
    return Text.rich(
      TextSpan(
        style: baseStyle,
        children: <TextSpan>[
          const TextSpan(text: kCancelSubscriptionDialogBodyPrefix),
          TextSpan(
            text: dateStr,
            style: baseStyle.copyWith(
              color: AppColors.brand400,
              fontWeight: FontWeight.w600,
            ),
          ),
          const TextSpan(text: kCancelSubscriptionDialogBodySuffix),
        ],
      ),
    );
  }
}

class _CloseButton extends StatelessWidget {
  const _CloseButton({required this.onTap});
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    // Figma: 36×36 hit target, 20×20 icon with #A3A7AE stroke. Material's
    // `Icons.close` is monochrome — tint at the call site.
    return SizedBox(
      width: 36,
      height: 36,
      child: Material(
        color: Colors.transparent,
        child: InkResponse(
          key: const Key('cancel-subscription-dialog-close'),
          radius: 22,
          onTap: onTap,
          child: const Center(
            child: Icon(
              Icons.close,
              size: 20,
              color: Color(0xFFA3A7AE),
            ),
          ),
        ),
      ),
    );
  }
}

class _PrimaryGoBackButton extends StatelessWidget {
  const _PrimaryGoBackButton({required this.onTap});
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    // Brand-gradient primary — the SAFE path per §6. This is intentionally
    // styled as the primary/default CTA (matches the paywall Continue CTA).
    return _GradientButton(
      key: const Key('cancel-subscription-dialog-go-back'),
      label: kCancelSubscriptionDialogGoBackLabel,
      onTap: onTap,
    );
  }
}

class _DestructiveCancelButton extends StatelessWidget {
  const _DestructiveCancelButton({
    required this.enabled,
    required this.onTap,
  });
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _SolidButton(
      key: const Key('cancel-subscription-dialog-destructive'),
      label: kCancelSubscriptionDialogDestructiveLabel,
      color: AppColors.error200,
      onTap: enabled ? onTap : null,
    );
  }
}

/// 142×36 r=8 brand-gradient button, white Inter 14 w500 label. Figma-
/// verified geometry (frame `1939:20314` — action row buttons).
class _GradientButton extends StatelessWidget {
  const _GradientButton({
    super.key,
    required this.label,
    required this.onTap,
  });
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 36,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: AppGradient.ctaLR,
          borderRadius: BorderRadius.circular(AppRadius.button),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppRadius.button),
            child: Center(
              child: Text(
                label,
                style: AppText.labelMd(color: AppColors.white),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// 142×36 r=8 solid-fill button. Used for the destructive CTA (#DA1F1F).
class _SolidButton extends StatelessWidget {
  const _SolidButton({
    super.key,
    required this.label,
    required this.color,
    required this.onTap,
  });
  final String label;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    // When disabled (`onTap == null`), fade the fill so a double-tap
    // reads as "you already tapped" instead of "the button is still
    // primary-styled and someone forgot to disable it".
    final isDisabled = onTap == null;
    final effectiveColor =
        isDisabled ? color.withValues(alpha: 0.5) : color;
    return SizedBox(
      height: 36,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: effectiveColor,
          borderRadius: BorderRadius.circular(AppRadius.button),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppRadius.button),
            child: Center(
              child: Text(
                label,
                style: AppText.labelMd(color: AppColors.white),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
