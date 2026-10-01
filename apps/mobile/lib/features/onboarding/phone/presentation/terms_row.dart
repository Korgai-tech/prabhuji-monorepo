import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/analytics.dart';
import '../../../../core/app_config.dart';
import '../../../../core/service_locator.dart';
import '../../../../core/theme.dart';
import '../../../../shared/widgets/in_app_webview_screen.dart';
import '../../onboarding_analytics.dart';

/// Shared terms row (Figma nodes 392:3192, 397:2833, 397:2620).
///
/// Layout (Dev Mode reference — matches phone-choice, phone-input, and OTP):
///  - Row: gap 12, `w-[328px]`
///  - Checkbox slot: 24×24. Contains a 20×20 orange-gradient rounded (2px)
///    square with a white check when accepted; a hollow grey200-bordered square
///    when not accepted.
///  - Body text: `Body/body-xs` (Inter Regular 12/20) in `Neutral/Grey/400`
///    `#767676`. Links are inline `Label/label-sm` (Inter Medium 12/20) in
///    `#0069DE` underlined; the closing "Prabhuji." token is Inter SemiBold.
///
/// Copy taken verbatim from Figma node 392:3196 to preserve the design's
/// legal boilerplate; the parent bloc still holds the accepted/rejected state.
class TermsRow extends StatelessWidget {
  const TermsRow({
    super.key,
    required this.accepted,
    required this.onChanged,
    required this.sourceScreen,
  });

  final bool accepted;
  final ValueChanged<bool> onChanged;

  /// Screen identifier for `onboarding_terms_toggled.screen_name` and
  /// `legal_link_tapped.source_screen` — `'phone_choice'` / `'phone_input'` /
  /// `'otp'`.
  final String sourceScreen;

  @override
  Widget build(BuildContext context) {
    final analytics = _analytics();
    // Capture the closest GoRouter up-front so the tap-recognizer closures can
    // navigate without holding a stale BuildContext. `maybeOf` (nullable) is
    // used so widget tests that pump TermsRow in isolation — no router in the
    // tree — don't crash at build; the tap is simply a no-op in that case
    // (matches the previous launchUrl behaviour of "never crash the app").
    final router = GoRouter.maybeOf(context);

    final TextStyle body = AppText.bodyXs(color: AppColors.grey400).copyWith(
      height: 20 / 12, // Figma body-xs on this text uses 20px line height.
    );
    final TextStyle link = AppText.labelSm(color: AppColors.linkBlue).copyWith(
      height: 20 / 12,
      decoration: TextDecoration.underline,
      decorationColor: AppColors.linkBlue,
      decorationThickness: 1,
    );
    final TextStyle strong = body.copyWith(
      fontWeight: FontWeight.w600,
      color: AppColors.grey400,
    );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // 24×24 slot; 20×20 checkbox glyph centered inside with a 2px inset.
        GestureDetector(
          key: Key('terms-checkbox-$sourceScreen'),
          behavior: HitTestBehavior.opaque,
          onTap: () {
            final next = !accepted;
            onChanged(next);
            // Sheet 1 row 6 — `terms_consent_changed`. `document_version`
            // is null client-side (the enricher would need a server flag);
            // rather than fabricate a placeholder, we send null so the
            // warehouse can distinguish "no version known" from a real
            // version once the config is wired.
            unawaited(analytics?.trackEvent(
              OnboardingEvents.termsConsentChanged,
              properties: <String, Object?>{
                OnboardingEventProps.consentState: next
                    ? OnboardingEventProps.consentChecked
                    : OnboardingEventProps.consentUnchecked,
                OnboardingEventProps.documentVersion: null,
              },
            ));
          },
          child: SizedBox(
            width: 24,
            height: 24,
            child: Padding(
              padding: const EdgeInsets.all(2),
              child: _CheckboxGlyph(accepted: accepted),
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.small),
        Expanded(
          child: RichText(
            key: Key('terms-copy-$sourceScreen'),
            text: TextSpan(
              style: body,
              children: <InlineSpan>[
                const TextSpan(text: 'By continuing, I hereby agree to the '),
                TextSpan(
                  text: 'privacy policy',
                  style: link,
                  recognizer: TapGestureRecognizer()
                    ..onTap = () => _openLegal(
                          router,
                          analytics,
                          title: 'Privacy Policy',
                          url: AppConfig.instance.privacyPolicyUrl,
                          linkType: 'privacy_policy',
                        ),
                ),
                const TextSpan(text: ' and '),
                TextSpan(
                  text: 'terms of service',
                  style: link,
                  recognizer: TapGestureRecognizer()
                    ..onTap = () => _openLegal(
                          router,
                          analytics,
                          title: 'Terms of Service',
                          url: AppConfig.instance.termsOfServiceUrl,
                          linkType: 'terms_of_service',
                        ),
                ),
                const TextSpan(text: ' of '),
                TextSpan(text: 'Prabhuji.', style: strong),
              ],
            ),
          ),
        ),
      ],
    );
  }

  void _openLegal(
    GoRouter? router,
    Analytics? analytics, {
    required String title,
    required String url,
    required String linkType,
  }) {
    // Legal-link taps from the onboarding terms row are NOT on Sheet 1
    // rows 4–16. The `legal_link_tapped` event was dropped as an orphan
    // here; the Profile & Settings module (rows 145–148) owns the
    // `terms_clicked` / `privacy_policy_clicked` events for the profile
    // menu entries.
    final uri = Uri.tryParse(url);
    final urlAvailable = uri != null && url.isNotEmpty;
    if (!urlAvailable || router == null) return;
    router.push(
      '/webview',
      extra: InAppWebViewArgs(title: title, url: url),
    );
  }

  static Analytics? _analytics() {
    if (!serviceLocator.isRegistered<Analytics>()) return null;
    return serviceLocator<Analytics>();
  }
}

/// 20×20 checkbox glyph — orange CTA gradient with a white check when
/// [accepted], otherwise a hollow `Colors/Grey/300` (#B8B8B8) bordered square
/// (matches the disabled-checkbox pattern used on other Figma screens).
///
/// Radius 2px per Figma `path d="M0 2C0 0.895431..."` (2px rounded corners).
class _CheckboxGlyph extends StatelessWidget {
  const _CheckboxGlyph({required this.accepted});

  final bool accepted;

  @override
  Widget build(BuildContext context) {
    if (!accepted) {
      return DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(AppRadius.pixel2),
          border: Border.all(color: AppColors.grey300, width: 1.5),
        ),
      );
    }
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: AppGradient.ctaLR,
        borderRadius: BorderRadius.circular(AppRadius.pixel2),
      ),
      child: CustomPaint(
        painter: _CheckPainter(),
      ),
    );
  }
}

/// Draws the 20-unit-space check path from Figma node 392:3195 —
/// `M5 11.1765 L7.85714 14 L15 6`, stroke white, 2px, rounded caps/joins.
class _CheckPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final double sx = size.width / 20;
    final double sy = size.height / 20;
    final Paint paint = Paint()
      ..color = AppColors.white
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    final Path path = Path()
      ..moveTo(5 * sx, 11.1765 * sy)
      ..lineTo(7.85714 * sx, 14 * sy)
      ..lineTo(15 * sx, 6 * sy);
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
