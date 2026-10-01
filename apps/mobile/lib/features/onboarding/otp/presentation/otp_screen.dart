import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/analytics.dart';
import '../../../../core/router.dart' show pathForRouteTarget;
import '../../../../core/service_locator.dart';
import '../../../../core/sms_retriever_service.dart';
import '../../../../core/theme.dart';
import '../../bloc/onboarding_orchestrator_bloc.dart';
import '../../bloc/onboarding_orchestrator_state.dart';
import '../../onboarding_analytics.dart';
import '../../phone/presentation/terms_row.dart';
import '../../phone/bloc/phone_otp_bloc.dart';
import '../../phone/bloc/phone_otp_event.dart';
import '../../phone/bloc/phone_otp_state.dart';
import '../bloc/otp_bloc.dart';
import '../bloc/otp_event.dart';
import '../bloc/otp_state.dart';

/// PRD §6.4 — OTP screen (default + invalid + rate-limited states).
///
/// Design sources:
///  - Default: Figma node `397:2618` — 360×800 canvas, card at y=388 (412 tall).
///  - Invalid: Figma node `520:4914` — same shell with red-bordered OTP boxes
///    and a small "⚠ Invalid OTP" pill below.
///
/// Layout mirrors phone-choice / phone-input:
///  - Cream `Colors/Brand/100` top with the shared [BrandLogo] cluster.
///  - White bottom card, rounded top corners 20, `0 -2 10 rgba(0,0,0,0.05)`
///    shadow, 16h/24v padding, 24 gap between rows.
///
/// Card contents (default):
///  1. "Login to Prabhuji" — Inter SemiBold 24/32 black.
///  2. OTP info row — `OTP sent to {phone}` body-sm (14/20 grey500 with the
///     number bolded) at left; `Change No.` Inter Medium 14/20 brand300
///     underlined at right.
///  3. 4 OTP digit boxes — each 48×56 white, 1.5px `Colors/Brand/300` border
///     (or `Colors/Error/200` when invalid), radius 12, Inter Regular 16 black.
///  4. Orange-gradient "Submit" CTA — 44h, radius 8, `CTA Gradient`.
///  5. Outlined "Resent OTP (NN)" — same size CTA, 1px `Colors/Grey/300`
///     border, brand300 text, `opacity-30` when counting down.
///  6. `Colors/Grey/200` hairline divider.
///  7. Shared [TermsRow].
///
/// The invalid pill is a 24-radius `Colors/Error/100` background chip with a
/// 12px exclamation icon + "Invalid OTP" `Label/label-sm` in `Colors/Error/200`.
/// Monotonic counter behind the `?reset=` token the "Change No." tap ships to
/// `/phone-input` (see `onChangeNumber` below). Library-level rather than
/// per-State because each `/otp` visit mounts a fresh [OtpBloc]/State while the
/// phone-input State it signals is the SAME one across the whole flow — the
/// token has to keep increasing for that screen to see a change.
int _changeNumberSeq = 0;

class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key});

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  late final List<TextEditingController> _controllers;
  late final List<FocusNode> _focusNodes;
  bool _initialized = false;

  /// TAM-123 §2 — SMS Retriever guards. `_autoSubmitted` prevents a second
  /// dispatch if a slow SMS arrives after the user has already typed + tapped
  /// Submit; `_smsListenerActive` prevents double-registration when Resend
  /// re-fires the listener.
  bool _autoSubmitted = false;
  bool _smsListenerActive = false;

  /// The full code we last auto-verified on, so an IME that re-emits
  /// `onChanged` for an unchanged box can't queue a second verify. Cleared the
  /// moment the boxes stop being full (backspace, or the bloc wiping them after
  /// an invalid attempt), which re-arms auto-verify for the next attempt.
  String? _autoSubmittedDigits;

  @override
  void initState() {
    super.initState();
    final bloc = context.read<OtpBloc>();
    _controllers =
        List.generate(bloc.otpLength, (_) => TextEditingController());
    _focusNodes = List.generate(bloc.otpLength, (_) => FocusNode());

    WidgetsBinding.instance.addPostFrameCallback((_) {
      // Sheet 1 row 9 — `otp_screen_viewed`. `attempt_number` is 1 on
      // first mount; a returning user (Change Number → back → same OTP
      // session) mounts a fresh bloc so the counter restarts.
      unawaited(_analytics()?.trackEvent(
        OnboardingEvents.otpScreenViewed,
        properties: <String, Object?>{
          OnboardingEventProps.attemptNumber: bloc.state.attemptCount + 1,
        },
      ));
      _focusNodes.first.requestFocus();
      _initialized = true;
      unawaited(_startSmsListener());
    });
  }

  @override
  void dispose() {
    // Cancel any in-flight retriever listener so a late SMS doesn't fire into
    // a disposed tree.
    if (_smsListenerActive) {
      unawaited(_smsRetriever()?.reset());
    }
    for (final c in _controllers) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  /// TAM-123 §2 — await the Google Play services SMS Retriever result.
  ///
  /// The retriever is normally armed on the PREVIOUS screen (phone-input),
  /// right before `SendOtpRequested`, because Play Services only forwards
  /// SMS received AFTER `startSmsRetriever` — arming here (in initState)
  /// races against a fast MSG91 delivery. We prefer the pre-armed pending
  /// Future from [SmsRetrieverService.awaitCode]; if none is armed (deep
  /// link / test / iOS), we arm one here as a fallback. iOS no-op.
  Future<void> _startSmsListener() async {
    if (kIsWeb || !Platform.isAndroid) return;
    if (_smsListenerActive) return;
    _smsListenerActive = true;

    final bloc = context.read<OtpBloc>();
    final otpLength = bloc.otpLength;
    final sms = _smsRetriever();

    Future<String?>? pending = sms?.awaitCode();
    // No pre-armed session (deep link, test, or the phone screen never got
    // to arm). Arm one now — still worth trying; the SMS may not have
    // arrived yet.
    pending ??= sms?.arm();

    final code = await (pending ?? Future<String?>.value(null));
    _smsListenerActive = false;
    if (!mounted) return;

    if (code == null || code.length < otpLength) return;
    // The service extracts a broad 4–8 digit run; truncate to our known
    // length in case the SMS embeds a longer number.
    final trimmed = code.substring(0, otpLength);
    if (_autoSubmitted) return; // idempotent — user already tapped Submit
    _autoSubmitted = true;

    // TAM-123 SMS retriever wiring stays; the previous
    // `onboarding_otp_autofill_*` analytics events are not on the
    // Sheet 1 rows 4–16 contract and were dropped as orphans. Auto-fill
    // still dispatches `DigitEntered` + `SubmitTapped` on the bloc, which
    // fires the canonical row 11 `otp_entered` + row 12 `otp_submitted`
    // events from the OtpBloc.
    _syncControllers(trimmed);
    bloc
      ..add(DigitEntered(trimmed))
      ..add(const SubmitTapped());
    unawaited(sms?.reset());
  }

  SmsRetrieverService? _smsRetriever() {
    if (!serviceLocator.isRegistered<SmsRetrieverService>()) return null;
    return serviceLocator<SmsRetrieverService>();
  }

  /// Resend tap: reset + re-arm the retriever BEFORE dispatching so Play
  /// Services is listening by the time the fresh SMS arrives. Symmetric to
  /// the arm-before-send treatment on `phone_input_screen`.
  void _onResendTapped() {
    final sms = _smsRetriever();
    if (sms != null) {
      unawaited(() async {
        await sms.reset();
        await sms.arm();
      }());
    }
    context.read<OtpBloc>().add(const ResendTapped());
  }

  Analytics? _analytics() {
    if (!serviceLocator.isRegistered<Analytics>()) return null;
    return serviceLocator<Analytics>();
  }

  /// Syncs the controllers with a bloc-owned string. Used when the bloc
  /// clears the boxes (e.g. after an invalid submit / a resend).
  void _syncControllers(String digits) {
    if (!_initialized) return;
    for (var i = 0; i < _controllers.length; i++) {
      final char = i < digits.length ? digits[i] : '';
      if (_controllers[i].text != char) {
        _controllers[i].text = char;
      }
    }
    if (digits.isEmpty) {
      _focusNodes.first.requestFocus();
    }
  }

  String _joinDigits() => _controllers.map((c) => c.text).join();

  /// A digit box changed. Filling the LAST box verifies immediately — the user
  /// shouldn't have to reach for Submit once the code is complete. The CTA stays
  /// for the manual path (a re-submit after an invalid attempt, and a11y).
  ///
  /// Every gate that matters lives in the bloc's `SubmitTapped` handler (length,
  /// verify already in flight, rate-limited), so this only has to avoid firing
  /// twice for the SAME code.
  void _onDigitChanged(OtpBloc bloc) {
    final digits = _joinDigits();
    bloc.add(DigitEntered(digits));

    if (digits.length < bloc.otpLength) {
      _autoSubmittedDigits = null;
      return;
    }
    if (digits == _autoSubmittedDigits) return;
    _autoSubmittedDigits = digits;
    // Drop the keyboard so the CTA's spinner is visible while we verify. On an
    // invalid code the bloc clears the boxes and `_syncControllers` re-focuses
    // box 0, which brings the keyboard straight back.
    FocusScope.of(context).unfocus();
    bloc.add(const SubmitTapped());
  }

  @override
  Widget build(BuildContext context) {
    // The terms row is a shared widget; it wants a PhoneOtpBloc from the tree.
    // If the OTP screen is entered directly (deep link / test), synthesize a
    // stub bloc so the row still paints without a listener; the checkbox is
    // read-only on this screen anyway (terms were accepted before OTP).
    final PhoneOtpBloc? existing = _tryReadPhoneOtpBloc(context);

    return Scaffold(
      // The soft keyboard for OTP entry is up almost immediately; without this,
      // the cream top area shrinks below the 162px BrandLogo+wordmark cluster
      // and Flutter reports "BOTTOM OVERFLOWED". We instead let the keyboard
      // overlay the screen and lift the card above it via viewInsets padding
      // in the Column below.
      resizeToAvoidBottomInset: false,
      backgroundColor: AppColors.brand100,
      body: MultiBlocListener(
        listeners: [
          BlocListener<OtpBloc, OtpState>(
            listener: (context, state) {
              _syncControllers(state.otpDigits);
              // The bloc wipes the boxes after an invalid attempt / a resend.
              // That's a programmatic clear (no `onChanged`), so re-arm
              // auto-verify here rather than waiting for the next keystroke.
              if (state.otpDigits.isEmpty) _autoSubmittedDigits = null;
              // Do NOT navigate on OtpVerified — the orchestrator (nudged
              // by SessionRefreshed from otp_bloc) drives the post-verify
              // hop via the orchestrator listener below. Force-navigating
              // to /name-language here bypasses the orchestrator's
              // /users/me check and re-shows the profile screen to
              // returning users whose profile is already complete.
              if (state is OtpResendSuccess) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('OTP resent'),
                    duration: Duration(seconds: 2),
                  ),
                );
                // Reset the one-shot guard and start awaiting the next SMS.
                // The retriever session was already re-armed on the Resend
                // tap (BEFORE dispatch) — see `_onResendTapped` — so Play
                // Services is listening by the time this success arrives.
                _autoSubmitted = false;
                unawaited(_startSmsListener());
              }
              if (state is OtpResendFailure) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(state.message),
                    duration: const Duration(seconds: 2),
                  ),
                );
              }
            },
          ),
          // Orchestrator's post-verify decision: fire only after the user
          // has verified their OTP (not on stale decisions from an earlier
          // cold-start pass). Screens further downstream — name-language for
          // profile-incomplete users, home/paywall for returning users — are
          // selected by the orchestrator based on `/users/me`.
          if (_tryReadOrchestrator(context) != null)
            BlocListener<OnboardingOrchestratorBloc, OrchestratorState>(
              bloc: _tryReadOrchestrator(context),
              listener: (context, orchState) {
                if (context.read<OtpBloc>().state is! OtpVerified) return;
                if (orchState is OrchestratorRouteDecided) {
                  context.go(pathForRouteTarget(orchState.target));
                }
              },
            ),
        ],
        child: BlocBuilder<OtpBloc, OtpState>(
          builder: (context, state) {
            final bloc = context.read<OtpBloc>();
            final isInvalid = state is OtpInvalid;
            final isRateLimited = state is OtpRateLimited;
            // Keep the CTA in its loading state through BOTH the verify
            // network call AND the post-verify orchestrator decision — the
            // user sees one continuous "signing you in…" phase instead of a
            // flicker back to the enabled CTA between the two.
            final isVerifying = state is OtpVerifying || state is OtpVerified;

          final double keyboardInset =
              MediaQuery.of(context).viewInsets.bottom;
          return Column(
            children: <Widget>[
              // Full-bleed brand background — same PNG as phone-input, baking
              // in logo + wordmark + tagline. `cover` + top-anchored alignment
              // keeps aspect ratio when the top area shrinks (the OTP card
              // grows taller on invalid/rate-limited states) so the image
              // clips rather than distorts.
              Expanded(
                child: ClipRect(
                  child: Image.asset(
                    'assets/onboarding/login-background.png',
                    key: const Key('otp-brand-cluster'),
                    fit: BoxFit.cover,
                    alignment: Alignment.topCenter,
                    width: double.infinity,
                  ),
                ),
              ),
              Padding(
                // Lifts the login card above the keyboard while the cream area
                // (which has resizeToAvoidBottomInset: false) stays uncompressed.
                padding: EdgeInsets.only(bottom: keyboardInset),
                child: _OtpCard(
                controllers: _controllers,
                focusNodes: _focusNodes,
                otpLength: bloc.otpLength,
                digitsSoFar: state.otpDigits,
                countdownRemainingSeconds: state.countdownRemainingSeconds,
                phoneDisplay:
                    '${bloc.phoneCountryCode} ${bloc.phoneNumber}',
                isInvalid: isInvalid,
                invalidMessage: isInvalid ? state.errorMessage : null,
                isRateLimited: isRateLimited,
                rateLimitMessage: isRateLimited ? state.message : null,
                isVerifying: isVerifying,
                isResending: state is OtpResending,
                onDigitChanged: () => _onDigitChanged(bloc),
                onSubmit: () => bloc.add(const SubmitTapped()),
                onResend: _onResendTapped,
                onChangeNumber: () {
                  bloc.add(const ChangeNumberTapped());
                  unawaited(_smsRetriever()?.reset());
                  // go_router keys pages by GoRoute identity
                  // (`pageKey: ValueKey(route.hashCode)`), so hopping back to
                  // `/phone-input` REUSES the page that's still sitting under
                  // `/otp`: its State — and therefore its
                  // TextEditingController — survives, `initState` does not
                  // re-run, and the old number is still in the field. The
                  // `reset` token tells that live screen to clear it. It's a
                  // token rather than a flag so the clear fires exactly once
                  // per tap and a later router rebuild (the auth
                  // `refreshListenable`) can't wipe a number the user has
                  // since typed.
                  _changeNumberSeq++;
                  context.go('/phone-input?reset=$_changeNumberSeq');
                },
                termsBloc: existing,
                ),
              ),
            ],
          );
          },
        ),
      ),
    );
  }

  PhoneOtpBloc? _tryReadPhoneOtpBloc(BuildContext context) {
    try {
      return BlocProvider.of<PhoneOtpBloc>(context);
    } catch (_) {
      return null;
    }
  }

  OnboardingOrchestratorBloc? _tryReadOrchestrator(BuildContext context) {
    try {
      return BlocProvider.of<OnboardingOrchestratorBloc>(context);
    } catch (_) {
      return null;
    }
  }
}

class _OtpCard extends StatelessWidget {
  const _OtpCard({
    required this.controllers,
    required this.focusNodes,
    required this.otpLength,
    required this.digitsSoFar,
    required this.countdownRemainingSeconds,
    required this.phoneDisplay,
    required this.isInvalid,
    required this.invalidMessage,
    required this.isRateLimited,
    required this.rateLimitMessage,
    required this.isVerifying,
    required this.isResending,
    required this.onDigitChanged,
    required this.onSubmit,
    required this.onResend,
    required this.onChangeNumber,
    required this.termsBloc,
  });

  final List<TextEditingController> controllers;
  final List<FocusNode> focusNodes;
  final int otpLength;
  final String digitsSoFar;
  final int countdownRemainingSeconds;
  final String phoneDisplay;
  final bool isInvalid;
  final String? invalidMessage;
  final bool isRateLimited;
  final String? rateLimitMessage;
  final bool isVerifying;
  final bool isResending;
  final VoidCallback onDigitChanged;
  final VoidCallback onSubmit;
  final VoidCallback onResend;
  final VoidCallback onChangeNumber;
  final PhoneOtpBloc? termsBloc;

  @override
  Widget build(BuildContext context) {
    final double bottomInset = MediaQuery.of(context).padding.bottom;
    final bool canSubmit =
        digitsSoFar.length == otpLength && !isVerifying && !isRateLimited;

    return DecoratedBox(
      decoration: const BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(AppRadius.loginCardTop),
          topRight: Radius.circular(AppRadius.loginCardTop),
        ),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: AppColors.onboardingSheetShadow,
            blurRadius: 10,
            offset: Offset(0, -2),
          ),
        ],
      ),
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.medium,
          AppSpacing.large,
          AppSpacing.medium,
          AppSpacing.large + bottomInset,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Center(
              child: Text(
                'Login to Prabhuji',
                key: const Key('otp-title'),
                style: AppText.headingSm(color: AppColors.black),
              ),
            ),
            const SizedBox(height: AppSpacing.large),
            _OtpInfoRow(
              phoneDisplay: phoneDisplay,
              onChangeNumber: onChangeNumber,
            ),
            const SizedBox(height: AppSpacing.large),
            _DigitBoxes(
              otpLength: otpLength,
              controllers: controllers,
              focusNodes: focusNodes,
              isInvalid: isInvalid,
              disabled: isVerifying || isRateLimited,
              onChanged: onDigitChanged,
            ),
            if (isInvalid) ...<Widget>[
              const SizedBox(height: AppSpacing.small),
              Center(
                child: _InvalidOtpPill(
                  message: (invalidMessage == null || invalidMessage!.isEmpty)
                      ? 'Invalid OTP'
                      : invalidMessage!,
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.large),
            if (isRateLimited)
              Padding(
                key: const Key('otp-rate-limited'),
                padding: const EdgeInsets.only(bottom: AppSpacing.small),
                child: Text(
                  rateLimitMessage ?? '',
                  style: AppText.bodySm(color: AppColors.error200),
                  textAlign: TextAlign.center,
                ),
              )
            else
              _SubmitCta(
                enabled: canSubmit,
                loading: isVerifying,
                onPressed: onSubmit,
              ),
            const SizedBox(height: AppSpacing.small),
            _ResendCta(
              countdownRemainingSeconds: countdownRemainingSeconds,
              isResending: isResending,
              disabled: isRateLimited,
              onTap: onResend,
            ),
            const SizedBox(height: AppSpacing.large),
            const Divider(
              key: Key('otp-divider'),
              height: 1,
              thickness: 1,
              color: AppColors.grey200,
            ),
            const SizedBox(height: AppSpacing.large),
            _TermsRowScoped(termsBloc: termsBloc),
          ],
        ),
      ),
    );
  }
}

/// Renders the shared [TermsRow]. If a [PhoneOtpBloc] is available in the tree
/// we read from it; otherwise (deep-link / test), fall back to a static
/// checked row — the user necessarily accepted terms on the previous screen.
class _TermsRowScoped extends StatelessWidget {
  const _TermsRowScoped({required this.termsBloc});

  final PhoneOtpBloc? termsBloc;

  @override
  Widget build(BuildContext context) {
    if (termsBloc == null) {
      return TermsRow(
        accepted: true,
        onChanged: (_) {}, // read-only fallback
        sourceScreen: 'otp',
      );
    }
    return BlocBuilder<PhoneOtpBloc, PhoneOtpState>(
      bloc: termsBloc,
      builder: (context, state) => TermsRow(
        accepted: state.termsAccepted,
        onChanged: (v) => termsBloc!.add(TermsToggled(v)),
        sourceScreen: 'otp',
      ),
    );
  }
}

class _OtpInfoRow extends StatelessWidget {
  const _OtpInfoRow({
    required this.phoneDisplay,
    required this.onChangeNumber,
  });

  final String phoneDisplay;
  final VoidCallback onChangeNumber;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        Expanded(
          child: RichText(
            key: const Key('otp-masked-phone'),
            text: TextSpan(
              style: AppText.bodySm(color: AppColors.grey500),
              children: <InlineSpan>[
                const TextSpan(text: 'OTP sent to '),
                TextSpan(
                  text: phoneDisplay,
                  style: AppText.bodySm(color: AppColors.grey500).copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
        GestureDetector(
          key: const Key('otp-change-number'),
          onTap: onChangeNumber,
          child: Text(
            'Change No.',
            style: AppText.labelMd(color: AppColors.brand300).copyWith(
              decoration: TextDecoration.underline,
              decorationColor: AppColors.brand300,
              decorationThickness: 1,
            ),
          ),
        ),
      ],
    );
  }
}

class _InvalidOtpPill extends StatelessWidget {
  const _InvalidOtpPill({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('otp-invalid-pill'),
      decoration: BoxDecoration(
        color: AppColors.error100,
        borderRadius: BorderRadius.circular(24),
      ),
      padding:
          const EdgeInsets.symmetric(horizontal: AppSpacing.xSmall, vertical: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: <Widget>[
          SvgPicture.asset(
            'assets/onboarding/exclamation.svg',
            width: 12,
            height: 12,
            colorFilter: const ColorFilter.mode(
              AppColors.error200,
              BlendMode.srcIn,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            message,
            key: const Key('otp-invalid-text'),
            style: AppText.labelSm(color: AppColors.error200),
          ),
        ],
      ),
    );
  }
}

class _DigitBoxes extends StatelessWidget {
  const _DigitBoxes({
    required this.otpLength,
    required this.controllers,
    required this.focusNodes,
    required this.isInvalid,
    required this.disabled,
    required this.onChanged,
  });

  final int otpLength;
  final List<TextEditingController> controllers;
  final List<FocusNode> focusNodes;
  final bool isInvalid;
  final bool disabled;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      key: const Key('otp-digit-boxes'),
      mainAxisAlignment: MainAxisAlignment.center,
      children: List<Widget>.generate(otpLength, (index) {
        return Padding(
          padding: EdgeInsets.only(left: index == 0 ? 0 : 12),
          child: _DigitBox(
            key: Key('otp-digit-box-$index'),
            controller: controllers[index],
            focusNode: focusNodes[index],
            isInvalid: isInvalid,
            disabled: disabled,
            onChanged: (value) {
              if (value.isNotEmpty && index < otpLength - 1) {
                focusNodes[index + 1].requestFocus();
              }
              onChanged();
            },
            onBackspace: () {
              if (index > 0) {
                focusNodes[index - 1].requestFocus();
                final prev = controllers[index - 1];
                if (prev.text.isNotEmpty) {
                  prev.clear();
                  onChanged();
                }
              }
            },
          ),
        );
      }),
    );
  }
}

class _DigitBox extends StatelessWidget {
  const _DigitBox({
    super.key,
    required this.controller,
    required this.focusNode,
    required this.isInvalid,
    required this.disabled,
    required this.onChanged,
    required this.onBackspace,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool isInvalid;
  final bool disabled;
  final ValueChanged<String> onChanged;
  final VoidCallback onBackspace;

  @override
  Widget build(BuildContext context) {
    final Color borderColor =
        isInvalid ? AppColors.error200 : AppColors.brand300;
    return SizedBox(
      width: 48,
      height: 56,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: borderColor, width: 1.5),
        ),
        child: Center(
          child: KeyboardListener(
            focusNode: FocusNode(skipTraversal: true),
            onKeyEvent: (event) {
              if (event is KeyDownEvent &&
                  event.logicalKey == LogicalKeyboardKey.backspace &&
                  controller.text.isEmpty) {
                onBackspace();
              }
            },
            child: TextField(
              controller: controller,
              focusNode: focusNode,
              enabled: !disabled,
              maxLength: 1,
              textAlign: TextAlign.center,
              keyboardType: TextInputType.number,
              inputFormatters: <TextInputFormatter>[
                FilteringTextInputFormatter.digitsOnly,
              ],
              style: AppText.bodyMd(color: AppColors.black),
              cursorColor: AppColors.brand300,
              decoration: const InputDecoration(
                counterText: '',
                border: InputBorder.none,
                isCollapsed: true,
                contentPadding: EdgeInsets.zero,
              ),
              onChanged: onChanged,
            ),
          ),
        ),
      ),
    );
  }
}

/// Orange-gradient "Submit" CTA. Same visual family as the phone-input Get OTP
/// button — kept a separate widget so its loading/disable semantics are local.
class _SubmitCta extends StatelessWidget {
  const _SubmitCta({
    required this.enabled,
    required this.loading,
    required this.onPressed,
  });

  final bool enabled;
  final bool loading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: SizedBox(
        height: 44,
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: AppGradient.ctaLR,
            borderRadius: BorderRadius.circular(AppRadius.button),
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              key: const Key('otp-submit'),
              onTap: enabled ? onPressed : null,
              borderRadius: BorderRadius.circular(AppRadius.button),
              splashColor: Colors.white.withValues(alpha: 0.15),
              child: Center(
                child: loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.4,
                          valueColor:
                              AlwaysStoppedAnimation<Color>(AppColors.white),
                        ),
                      )
                    : Text(
                        'Submit',
                        style: AppText.labelLg(color: AppColors.white),
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Outlined "Resent OTP (NN)" — 1px `Colors/Grey/300` border, brand300 label.
/// `opacity-30` when the countdown is still running (Figma 397:2701).
class _ResendCta extends StatelessWidget {
  const _ResendCta({
    required this.countdownRemainingSeconds,
    required this.isResending,
    required this.disabled,
    required this.onTap,
  });

  final int countdownRemainingSeconds;
  final bool isResending;
  final bool disabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bool countingDown = countdownRemainingSeconds > 0;
    final bool tappable = !disabled && !isResending && !countingDown;

    // Figma copy is "Resent OTP (NN)" — a typo for "Resend OTP" but preserved
    // literally per design source of truth. When the countdown is done we
    // drop the parenthetical.
    final String label = isResending
        ? 'Resending…'
        : countingDown
            ? 'Resent OTP ($countdownRemainingSeconds)'
            : 'Resend OTP';

    return Opacity(
      opacity: tappable ? 1 : 0.3,
      child: SizedBox(
        height: 44,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(AppRadius.button),
            border: Border.all(color: AppColors.grey300, width: 1),
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              key: const Key('otp-resend'),
              onTap: tappable ? onTap : null,
              borderRadius: BorderRadius.circular(AppRadius.button),
              child: Center(
                child: Text(
                  label,
                  style: AppText.labelLg(color: AppColors.brand300),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
