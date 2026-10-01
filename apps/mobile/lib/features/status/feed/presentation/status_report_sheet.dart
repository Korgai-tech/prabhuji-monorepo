import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme.dart';
import 'status_report_menu.dart';

/// What the sheet hands back to its caller.
@immutable
class StatusReportSubmission {
  const StatusReportSubmission({required this.email, required this.reason});

  final String email;
  final String reason;
}

/// The report bottom sheet (Figma `4118:16914` / `4118:17395` for the user
/// variant, `4118:17468` / `4118:17538` for content).
///
/// ONE widget, two configurations — only the icon, title and subtitle differ
/// between "Report this user" and "Report this content". They are otherwise the
/// same sheet, and splitting them into two widgets would guarantee they drift.
///
/// The caller owns the network call. This sheet collects input, validates it,
/// and returns a [StatusReportSubmission] on submit (or `null` if dismissed) —
/// it deliberately does not know about repositories, so it stays trivially
/// testable and the "Reported successfully" toast fires from the screen that
/// owns the `ScaffoldMessenger`.
Future<StatusReportSubmission?> showStatusReportSheet({
  required BuildContext context,
  required StatusReportKind kind,
  String? initialEmail,
}) {
  return showModalBottomSheet<StatusReportSubmission>(
    context: context,
    // The sheet holds two text fields; it MUST be able to grow past the default
    // half-screen and ride the keyboard inset.
    isScrollControlled: true,
    backgroundColor: AppColors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(
        top: Radius.circular(AppRadius.loginCardTop),
      ),
    ),
    builder: (context) => _StatusReportSheet(
      kind: kind,
      initialEmail: initialEmail,
    ),
  );
}

class _StatusReportSheet extends StatefulWidget {
  const _StatusReportSheet({required this.kind, this.initialEmail});

  final StatusReportKind kind;
  final String? initialEmail;

  @override
  State<_StatusReportSheet> createState() => _StatusReportSheetState();
}

class _StatusReportSheetState extends State<_StatusReportSheet> {
  late final TextEditingController _email;
  late final TextEditingController _reason;

  @override
  void initState() {
    super.initState();
    // Seeded from the account when it has an email. OTP-only accounts have
    // none, so blank is the common case — the field is required either way.
    _email = TextEditingController(text: widget.initialEmail ?? '');
    _reason = TextEditingController();
  }

  @override
  void dispose() {
    _email.dispose();
    _reason.dispose();
    super.dispose();
  }

  bool get _isUser => widget.kind == StatusReportKind.user;

  String get _title => _isUser ? 'Report this user' : 'Report this content';

  String get _subtitle => _isUser
      ? 'Why are you reporting this user?'
      : 'Why are you reporting this content?';

  /// Deliberately permissive: something before an `@`, something after it, and
  /// a dot in the domain. The server's Zod `z.email()` is authoritative — this
  /// only exists so the CTA does not light up for obvious nonsense.
  bool get _emailLooksValid {
    final value = _email.text.trim();
    if (value.isEmpty) return false;
    return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value);
  }

  bool get _canSubmit => _emailLooksValid && _reason.text.trim().isNotEmpty;

  void _submit() {
    if (!_canSubmit) return;
    Navigator.of(context).pop(
      StatusReportSubmission(
        email: _email.text.trim(),
        reason: _reason.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final viewInsets = MediaQuery.viewInsetsOf(context).bottom;
    final maxHeight = MediaQuery.sizeOf(context).height * 0.9;

    return SafeArea(
      top: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Padding(
          // Ride the keyboard: the CTA stays reachable with the reason field
          // focused, which is the whole point of `isScrollControlled`.
          padding: EdgeInsets.only(bottom: viewInsets),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: AppStatusReport.handleTopGap),
              const _DragHandle(),
              // Everything between the handle and the CTA scrolls INTERNALLY.
              // At 600 dp with textScale 2.0 the CTA must stay reachable by
              // scrolling inside the sheet, not by the sheet overflowing.
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppStatusReport.sheetPadding,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox(height: AppStatusReport.handleToIcon),
                      _ReportIcon(isUser: _isUser),
                      const SizedBox(height: AppStatusReport.iconToTitle),
                      Text(
                        _title,
                        key: const Key('status-report-sheet-title'),
                        textAlign: TextAlign.center,
                        style: AppText.headingXs(color: AppColors.black),
                      ),
                      const SizedBox(height: AppStatusReport.titleToSubtitle),
                      Text(
                        _subtitle,
                        key: const Key('status-report-sheet-subtitle'),
                        textAlign: TextAlign.center,
                        style: AppText.bodyMd(color: AppColors.black),
                      ),
                      const SizedBox(height: AppStatusReport.subtitleToField),
                      _ReportField(
                        fieldKey: const Key('status-report-email'),
                        label: 'Enter your email here',
                        controller: _email,
                        onChanged: (_) => setState(() {}),
                        height: AppStatusReport.emailFieldHeight,
                        radius: AppStatusReport.emailFieldRadius,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: AppStatusReport.fieldToField),
                      _ReportField(
                        fieldKey: const Key('status-report-reason'),
                        label: 'Add your reason here',
                        controller: _reason,
                        onChanged: (_) => setState(() {}),
                        height: AppStatusReport.reasonFieldHeight,
                        radius: AppStatusReport.reasonFieldRadius,
                        maxLines: null,
                        expands: true,
                        // Mirrors the server's Zod `max(1000)` so the user
                        // physically cannot submit something the API rejects.
                        maxLength: AppStatusReport.reasonMaxLength,
                        textInputAction: TextInputAction.newline,
                      ),
                      const SizedBox(height: AppStatusReport.fieldToCta),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppStatusReport.sheetPadding,
                  0,
                  AppStatusReport.sheetPadding,
                  AppStatusReport.sheetPadding,
                ),
                child: Column(
                  children: [
                    _ReportCta(enabled: _canSubmit, onTap: _submit),
                    const SizedBox(height: AppStatusReport.ctaToFooter),
                    Text(
                      "Your reason is private. The user won't be notified.",
                      key: const Key('status-report-footer'),
                      textAlign: TextAlign.center,
                      style: AppText.bodyXs(
                        color: AppColors.reportFooterText,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DragHandle extends StatelessWidget {
  const _DragHandle();

  @override
  Widget build(BuildContext context) => Container(
        width: AppStatusReport.handleWidth,
        height: AppStatusReport.handleHeight,
        decoration: BoxDecoration(
          color: AppColors.brand300,
          borderRadius: BorderRadius.circular(AppStatusReport.handleHeight / 2),
        ),
      );
}

/// The 48×48 header glyph. Figma ships two distinct illustrations
/// (`4118:16920` user-with-alert, `4121:18339` content-with-alert); until those
/// assets are exported this renders the closest Material pair in the brand
/// ramp, which keeps the sheet honest rather than leaving a blank slot.
class _ReportIcon extends StatelessWidget {
  const _ReportIcon({required this.isUser});

  final bool isUser;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: AppStatusReport.iconSize,
        child: Icon(
          isUser ? Icons.person_rounded : Icons.report_gmailerrorred_rounded,
          key: Key(isUser ? 'status-report-icon-user' : 'status-report-icon-content'),
          size: AppStatusReport.iconSize,
          color: AppColors.brand300,
        ),
      );
}

/// A report-sheet field: the same floating-label treatment as the details form,
/// but with the newer `#B8B8B8` unfocused border and a caller-supplied height
/// and radius, so the 56 dp email pill and the 112 dp reason box share one
/// implementation instead of drifting apart.
class _ReportField extends StatefulWidget {
  const _ReportField({
    required this.fieldKey,
    required this.label,
    required this.controller,
    required this.onChanged,
    required this.height,
    required this.radius,
    this.keyboardType,
    this.textInputAction,
    this.maxLines = 1,
    this.expands = false,
    this.maxLength,
  });

  final Key fieldKey;
  final String label;
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final double height;
  final double radius;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final int? maxLines;
  final bool expands;
  final int? maxLength;

  @override
  State<_ReportField> createState() => _ReportFieldState();
}

class _ReportFieldState extends State<_ReportField> {
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // The label floats only once the field is focused or holds text — an empty
    // unfocused field shows its label as a placeholder inside the box, which is
    // what the Figma "empty" frames render.
    final floating = _focus.hasFocus || widget.controller.text.isNotEmpty;
    final borderColor = _focus.hasFocus
        ? AppColors.reportFieldBorderFocused
        : AppColors.reportFieldBorder;
    final borderWidth = _focus.hasFocus
        ? AppStatusReport.fieldBorderFocused
        : AppStatusReport.fieldBorder;

    return SizedBox(
      height: widget.height,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            height: widget.height,
            padding: const EdgeInsets.symmetric(
              horizontal: AppStatusReport.fieldTextPaddingH,
              vertical: AppSpacing.medium,
            ),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(widget.radius),
              border: Border.all(color: borderColor, width: borderWidth),
            ),
            child: TextField(
              key: widget.fieldKey,
              controller: widget.controller,
              focusNode: _focus,
              onChanged: widget.onChanged,
              keyboardType: widget.keyboardType,
              textInputAction: widget.textInputAction,
              maxLines: widget.maxLines,
              expands: widget.expands,
              textAlignVertical: TextAlignVertical.top,
              inputFormatters: [
                if (widget.maxLength != null)
                  LengthLimitingTextInputFormatter(widget.maxLength),
              ],
              style: AppText.bodyMd(color: AppColors.black)
                  .copyWith(fontSize: AppStatusReport.fieldTextSize),
              decoration: InputDecoration(
                isDense: true,
                border: InputBorder.none,
                contentPadding: EdgeInsets.zero,
                counterText: '',
                hintText: floating ? null : widget.label,
                hintStyle: AppText.bodyMd(color: AppColors.grey400)
                    .copyWith(fontSize: AppStatusReport.fieldTextSize),
              ),
            ),
          ),
          // The floating label knocks a gap out of the border — the Figma label
          // frame carries a white fill for exactly this.
          if (floating)
            Positioned(
              left: AppStatusReport.fieldPaddingH,
              top: -AppStatusReport.fieldLabelSize / 2,
              child: ColoredBox(
                color: AppColors.white,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.xxxSmall,
                  ),
                  child: Text(
                    widget.label,
                    style: AppText.labelSm(color: AppColors.reportFieldLabel),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// The Report CTA — grey and untappable until both fields are filled, then red.
class _ReportCta extends StatelessWidget {
  const _ReportCta({required this.enabled, required this.onTap});

  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: enabled,
      child: GestureDetector(
        key: const Key('status-report-submit'),
        // `null` rather than a guarded callback: a disabled CTA must not absorb
        // the tap either, or it reads as a broken button rather than an
        // unfinished form.
        onTap: enabled ? onTap : null,
        child: Container(
          height: AppStatusReport.ctaHeight,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: enabled
                ? AppColors.reportCtaEnabled
                : AppColors.reportCtaDisabled,
            borderRadius: BorderRadius.circular(AppStatusReport.ctaRadius),
          ),
          child: Text(
            'Report',
            style: AppText.bodyMd(
              color: enabled
                  ? AppColors.white
                  : AppColors.reportCtaDisabledLabel,
            ).copyWith(fontWeight: FontWeight.w600),
          ),
        ),
      ),
    );
  }
}
