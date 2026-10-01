import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme.dart';
import '../application/logout_action.dart';

/// The locked copy — do NOT edit without the spec's copy owner. Kept as
/// public constants so tests can pin them (a copy change here would fail
/// the widget test).
const String kLogoutDialogTitle = 'Are you sure you want to log out?';
const String kLogoutDialogBody =
    "You'll need to sign in again to access your account and content.";
const String kLogoutDialogConfirmLabel = 'Log out';
const String kLogoutDialogCancelLabel = 'Cancel';

/// Opens the two-step log-out confirmation dialog. Cancel dismisses; the
/// destructive CTA runs the 8-step `handleLogout` cascade.
///
/// The scrim tap dismisses (`barrierDismissible: true`) — matches the
/// spec's AC that scrim taps are equivalent to Cancel and never invoke
/// the cascade.
///
/// Returns `true` iff the destructive CTA was tapped and the cascade
/// completed (or attempted — cascade success/failure is captured in the
/// `logout_result` analytics event, not here). Callers typically ignore
/// the return value — the cascade already navigates to `/phone-input` on
/// success.
Future<bool?> showLogoutConfirmationDialog(
  BuildContext context,
  WidgetRef ref,
) {
  return showDialog<bool>(
    context: context,
    barrierDismissible: true,
    builder: (dialogContext) => LogoutConfirmationDialog(ref: ref),
  );
}

/// The dialog widget. Exposed separately so widget tests can pump it
/// directly without also mounting a whole Scaffold with a launcher tap.
class LogoutConfirmationDialog extends StatelessWidget {
  const LogoutConfirmationDialog({super.key, required this.ref});

  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      key: const Key('profile-logout-dialog'),
      backgroundColor: AppColors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
      title: Text(
        kLogoutDialogTitle,
        key: const Key('profile-logout-dialog-title'),
        style: AppText.headingXs(color: AppColors.black),
      ),
      content: Text(
        kLogoutDialogBody,
        key: const Key('profile-logout-dialog-body'),
        style: AppText.bodyMd(color: AppColors.grey400),
      ),
      actionsPadding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.small,
        vertical: AppSpacing.small,
      ),
      actions: <Widget>[
        TextButton(
          key: const Key('profile-logout-dialog-cancel'),
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(
            kLogoutDialogCancelLabel,
            style: AppText.labelLg(color: AppColors.textPrimary),
          ),
        ),
        TextButton(
          key: const Key('profile-logout-dialog-confirm'),
          onPressed: () async {
            // Pop the dialog FIRST so the cascade's `context.go`
            // navigation targets the underlying route, not the modal
            // route the dialog is layered on.
            Navigator.of(context).pop(true);
            await handleLogout(context, ref);
          },
          child: Text(
            kLogoutDialogConfirmLabel,
            style: AppText.labelLg(color: AppColors.error200),
          ),
        ),
      ],
    );
  }
}
