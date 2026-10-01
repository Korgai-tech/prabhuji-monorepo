import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme.dart';
import '../../domain/kuldevta_questions.dart';

/// The wizard input widget (TAM-166) — dispatches between a single-line
/// rounded pill (Q1 — surname) and a multi-line rounded rectangle
/// (Q2..Q6). Both variants enforce the client-side soft cap of 200 chars
/// matching the server's `.trim().max(200)` at
/// `apps/api/src/core/kuldevta/routes/kuldevta.schemas.ts:15`.
class KuldevtaQuestionInput extends StatelessWidget {
  const KuldevtaQuestionInput({
    super.key,
    required this.controller,
    required this.kind,
    required this.maxChars,
    this.hint = 'Yaha pe likhiye',
  });

  final TextEditingController controller;
  final KuldevtaInputKind kind;
  final int maxChars;
  final String hint;

  @override
  Widget build(BuildContext context) {
    final isSingleLine = kind == KuldevtaInputKind.singleLine;
    final radius = isSingleLine
        ? AppKuldevta.inputRadius
        : AppKuldevta.inputMultiLineRadius;
    final decoration = InputDecoration(
      hintText: hint,
      hintStyle: AppText.bodyMd(color: AppKuldevta.inputPlaceholder),
      isDense: false,
      filled: true,
      fillColor: AppColors.white,
      contentPadding: EdgeInsets.symmetric(
        horizontal: AppKuldevta.inputPaddingH,
        vertical: AppKuldevta.inputPaddingV,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radius),
        borderSide: const BorderSide(color: AppKuldevta.inputBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radius),
        borderSide: const BorderSide(color: AppKuldevta.inputBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radius),
        borderSide: const BorderSide(color: AppColors.brand400, width: 1.5),
      ),
    );
    return ConstrainedBox(
      constraints: isSingleLine
          ? const BoxConstraints()
          : const BoxConstraints(
              minHeight: AppKuldevta.inputMultiLineMinHeight,
            ),
      child: TextField(
        key: const Key('kuldevta-wizard-input'),
        controller: controller,
        maxLines: isSingleLine ? 1 : null,
        minLines: isSingleLine ? 1 : 3,
        textAlignVertical: TextAlignVertical.top,
        keyboardType:
            isSingleLine ? TextInputType.text : TextInputType.multiline,
        textInputAction: isSingleLine
            ? TextInputAction.done
            : TextInputAction.newline,
        style: AppText.bodyMd(color: AppColors.grey500),
        inputFormatters: <TextInputFormatter>[
          LengthLimitingTextInputFormatter(maxChars),
        ],
        decoration: decoration,
      ),
    );
  }
}
