import 'package:flutter/material.dart';

import '../../../../core/theme.dart';

/// What the user picked from the credit chip's kebab menu.
enum StatusReportKind {
  /// Report the account the status is attributed to.
  user,

  /// Report the status itself.
  content;

  /// The wire value for `POST /reports`'s `type`.
  String get wireValue => this == StatusReportKind.user ? 'user' : 'content';
}

/// The kebab menu (Figma `4116:15656`, "Recipient Actions") — a 115×84 white
/// popup with two rows, anchored to the chip.
///
/// Deliberately NOT a bottom sheet: the design anchors it to the chip, and the
/// two choices are a disambiguation step rather than a destination. Built on
/// `showMenu` rather than `PopupMenuButton` because the opener is the chip's
/// kebab, which lives inside an animated container and cannot host the button's
/// own gesture handling.
///
/// Returns `null` when dismissed without a choice.
Future<StatusReportKind?> showStatusReportMenu({
  required BuildContext context,
  required RenderBox anchor,
}) {
  final overlay = Overlay.of(context).context.findRenderObject();
  if (overlay is! RenderBox) return Future<StatusReportKind?>.value();

  final topLeft = anchor.localToGlobal(Offset.zero, ancestor: overlay);
  final bottomRight = anchor.localToGlobal(
    anchor.size.bottomRight(Offset.zero),
    ancestor: overlay,
  );
  final position = RelativeRect.fromRect(
    Rect.fromPoints(topLeft, bottomRight),
    Offset.zero & overlay.size,
  );

  return showMenu<StatusReportKind>(
    context: context,
    position: position,
    color: AppColors.white,
    elevation: 8,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(AppSpacing.xSmall),
    ),
    // The Figma popup is 8 dp padded around a 103×68 body; `showMenu`'s default
    // vertical padding is 8, so only the rows need their own insets.
    items: const [
      PopupMenuItem<StatusReportKind>(
        key: Key('status-report-menu-user'),
        value: StatusReportKind.user,
        height: 32,
        padding: EdgeInsets.symmetric(horizontal: AppSpacing.xSmall),
        child: _MenuLabel('Report User'),
      ),
      PopupMenuItem<StatusReportKind>(
        key: Key('status-report-menu-content'),
        value: StatusReportKind.content,
        height: 32,
        padding: EdgeInsets.symmetric(horizontal: AppSpacing.xSmall),
        child: _MenuLabel('Report Content'),
      ),
    ],
  );
}

/// `Body/body-xs` — Inter 400, 12/16, black.
class _MenuLabel extends StatelessWidget {
  const _MenuLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: const TextStyle(
          color: AppColors.black,
          fontSize: 12,
          height: 16 / 12,
          fontWeight: FontWeight.w400,
        ),
      );
}
