import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme.dart';

// TAM-168 — the Personal/Business `StatusTabGroup` widget was removed alongside
// the Business persona. See `StatusDetailsScreen` (`_DetailsNav` renders the
// personal form directly) and the TAM-168 spec's #PATH_DECISION for the
// rationale.

/// A details form field (Figma nodes `371:3448` focused / `371:3713` default) —
/// a 56px r50 pill with the label straddling the top border.
///
/// Two states, both from Figma:
///  * **default** — `#EAEBEE` 1px border, `#767676` label (node 371:3713);
///  * **focused** — `#FE8A02` 1.5px border, `#FE8A02` label (node 371:3448).
///
/// An [errorText] flips both to the error ramp and prints the message below
/// (spec §7 — Figma ships no error state).
class StatusTextField extends StatefulWidget {
  const StatusTextField({
    super.key,
    required this.fieldKey,
    required this.label,
    required this.controller,
    required this.onChanged,
    this.maxLength,
    this.keyboardType,
    this.inputFormatters,
    this.errorText,
  });

  final Key fieldKey;
  final String label;
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  /// Hard cap, mirroring the server's `maxLength` — the user physically cannot
  /// exceed it (q6), and the inline error covers the paste/edge cases.
  final int? maxLength;

  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final String? errorText;

  @override
  State<StatusTextField> createState() => _StatusTextFieldState();
}

class _StatusTextFieldState extends State<StatusTextField> {
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
    final hasError = widget.errorText != null;
    // Orange == FOCUSED, not "has content". Figma's Business frame (371:3567)
    // settles this: "Businees name" is orange while "Business details" and
    // "Business mobile number" are grey — even though both hold content. The
    // Personal frame's orange "Your name" is simply the focused field.
    final highlighted = _focus.hasFocus;
    final borderColor = hasError
        ? AppColors.statusFieldError
        : highlighted
            ? AppColors.statusFieldBorderFocused
            : AppColors.statusFieldBorder;
    final labelColor = hasError
        ? AppColors.statusFieldError
        : highlighted
            ? AppColors.statusFieldLabelFocused
            : AppColors.statusFieldLabel;
    final borderWidth = highlighted || hasError
        ? AppStatus.fieldBorderFocused
        : AppStatus.fieldBorder;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: AppStatus.fieldHeight,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                height: AppStatus.fieldHeight,
                padding: const EdgeInsets.symmetric(
                  horizontal: AppStatus.fieldPaddingH,
                ),
                decoration: BoxDecoration(
                  color: AppColors.statusFieldFill,
                  borderRadius: BorderRadius.circular(AppStatus.fieldRadius),
                  border: Border.all(color: borderColor, width: borderWidth),
                ),
                alignment: Alignment.center,
                child: TextField(
                  key: widget.fieldKey,
                  controller: widget.controller,
                  focusNode: _focus,
                  onChanged: widget.onChanged,
                  keyboardType: widget.keyboardType,
                  // ORDER MATTERS: sanitize first, cap second. The reverse
                  // truncates the RAW input before stripping junk, so pasting
                  // "+91 98765 43210" would cap to 10 characters and then strip
                  // down to only 8 digits.
                  inputFormatters: [
                    ...?widget.inputFormatters,
                    if (widget.maxLength != null)
                      LengthLimitingTextInputFormatter(widget.maxLength),
                  ],
                  style: AppText.bodyMd(color: AppColors.statusFieldText)
                      .copyWith(fontSize: AppStatus.fieldTextSize),
                  decoration: const InputDecoration(
                    isDense: true,
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.zero,
                    counterText: '',
                  ),
                ),
              ),
              // The floating label knocks a gap out of the border (Figma gives
              // the label frame a white fill for exactly this).
              Positioned(
                left: AppStatus.fieldPaddingH,
                top: -AppStatus.fieldLabelSize / 2,
                child: ColoredBox(
                  color: AppColors.statusFieldFill,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.xxxSmall,
                    ),
                    child: Text(
                      widget.label,
                      style: AppText.labelSm(color: labelColor),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        if (hasError)
          Padding(
            padding: const EdgeInsets.only(
              left: AppStatus.fieldPaddingH,
              top: AppSpacing.xxxSmall,
            ),
            child: Text(
              widget.errorText!,
              key: Key('${(widget.fieldKey as ValueKey).value}-error'),
              style: AppText.bodyXs(color: AppColors.statusFieldError),
            ),
          ),
      ],
    );
  }
}

/// The Save CTA (Figma nodes `371:3724` / `371:3738`) — 328×44, r8, ctaLR.
class StatusSaveButton extends StatelessWidget {
  const StatusSaveButton({super.key, required this.busy, required this.onTap});

  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: const Key('status-save'),
      behavior: HitTestBehavior.opaque,
      onTap: busy ? null : onTap,
      child: Container(
        height: AppStatus.saveBtnHeight,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          gradient: AppGradient.ctaLR,
          borderRadius: BorderRadius.circular(AppStatus.saveBtnRadius),
        ),
        child: busy
            ? const SizedBox(
                key: Key('status-save-progress'),
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation(AppColors.statusSaveLabel),
                ),
              )
            : Text(
                'Save',
                style: AppText.labelLg(color: AppColors.statusSaveLabel),
              ),
      ),
    );
  }
}
