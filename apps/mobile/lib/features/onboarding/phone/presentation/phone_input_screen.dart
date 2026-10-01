import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show debugPrint, kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:smart_auth/smart_auth.dart';

import '../../../../core/analytics.dart';
import '../../../../core/app_signature.dart';
import '../../../../core/service_locator.dart';
import '../../../../core/services/clarity_service.dart';
import '../../../../core/sms_retriever_service.dart';
import '../../../../core/theme.dart';
import '../../onboarding_analytics.dart';
import '../bloc/phone_otp_bloc.dart';
import '../bloc/phone_otp_event.dart';
import '../bloc/phone_otp_state.dart';
import 'terms_row.dart';

/// Phone-number entry (PRD §6.3).
///
/// Design source: Figma node `397:2763` ("Phone input") on a 360×800 canvas.
///
/// Layout mirrors [phone_choice_screen] — same cream top, same [BrandLogo] +
/// wordmark cluster, but the login card is 340px tall (vs. 236 on
/// phone-choice) to accommodate the phone number field + safety helper + the
/// gradient "Get OTP" CTA.
///
/// The phone field is a Figma-native floating-label pill:
///  - 56px tall, `rounded-[50px]` (full pill), 1.5px `Colors/Brand/300` border.
///  - Floating "Phone Number" label — Inter Medium 12/16 in brand300, sitting
///    on the border line with a small white bg inset so the border reads as
///    "broken" behind it.
///  - Input text — Inter Regular 16/24 in Neutral/Black, prefixed by "+91 ".
///
/// The "Get OTP" CTA is 44px tall with the `CTA Gradient` (brand400 → brand300)
/// left-to-right, rounded 8px, white label in `Label/label-lg`.
class PhoneInputScreen extends StatefulWidget {
  const PhoneInputScreen({super.key, this.resetToken});

  /// One-shot signal from the OTP screen's "Change No." tap, delivered as
  /// `/phone-input?reset=<n>`.
  ///
  /// go_router keys pages by GoRoute identity, so that hop REUSES this screen's
  /// State: `initState` (and the controller prefill in it) does not re-run and
  /// the number the user is trying to change would still be in the field. A
  /// changing token — rather than a bool — means the clear fires exactly once
  /// per tap, so an unrelated router rebuild (the auth `refreshListenable`)
  /// can't wipe a number the user has since typed.
  final String? resetToken;

  @override
  State<PhoneInputScreen> createState() => _PhoneInputScreenState();
}

class _PhoneInputScreenState extends State<PhoneInputScreen> {
  late final TextEditingController _phoneController;
  late final FocusNode _phoneFocus;

  /// Last [PhoneInputScreen.resetToken] acted on — see `didUpdateWidget`.
  String? _handledResetToken;

  /// One-shot guard: the Google phone-number chooser opens EXACTLY once per
  /// screen mount (TAM-123 §1). Rebuilds/state changes must not re-trigger it,
  /// and dismissing it must not re-prompt on focus/typing.
  bool _hintRequested = false;

  @override
  void initState() {
    super.initState();
    _phoneController = TextEditingController(
      text: context.read<PhoneOtpBloc>().state.phoneNumber,
    );
    _phoneFocus = FocusNode();
    // A token present on first mount has nothing to clear (a fresh bloc means
    // an empty field); latch it so it can't fire a spurious clear later.
    _handledResetToken = widget.resetToken;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // Sheet 1 row 4 — phone-input screen reach. `previous_screen` is
      // 'splash' when the user arrives from cold-start, but this screen is
      // also reachable from `/otp` via Change Number — the router doesn't
      // expose the prior route to widgets, so we send 'splash' as the most
      // common case and let downstream analysts join through session order
      // for the Change-Number-driven entries.
      unawaited(_analytics()?.trackEvent(
        OnboardingEvents.phoneInputScreenViewed,
        properties: const <String, Object?>{
          OnboardingEventProps.previousScreen: 'splash',
        },
      ));
      // Warm the app-signature cache in the background so the hash is ready by
      // the time the user taps Get OTP (SendOtpRequested below awaits it,
      // which normally is a cache hit).
      unawaited(ensureAppSignatureHash());
      unawaited(_requestPhoneHint());
    });
  }

  @override
  void didUpdateWidget(PhoneInputScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    final token = widget.resetToken;
    if (token == null || token == _handledResetToken) return;
    _handledResetToken = token;
    // Coming back from `/otp` via Change No. — drop the old number from BOTH
    // the field and the bloc (the bloc is still holding the send-success state
    // for the abandoned number), then re-open the keyboard so the user can type
    // straight away. The Google phone-hint picker is deliberately NOT re-shown:
    // the user just told us the number it would offer isn't the one they want.
    _phoneController.clear();
    context.read<PhoneOtpBloc>().add(const PhoneChanged(''));
    _phoneFocus.requestFocus();
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _phoneFocus.dispose();
    super.dispose();
  }

  Analytics? _analytics() {
    if (!serviceLocator.isRegistered<Analytics>()) return null;
    return serviceLocator<Analytics>();
  }

  /// TAM-123 §1 — Google Phone Number Hint API. Android-only; iOS falls
  /// through to the typed flow without any visible difference. Handles three
  /// terminal states: SUCCESS (E.164 that matches +91 and 10-digit local
  /// part), CANCEL (user dismissed), and DROP (non-+91 result rejected
  /// client-side so we never ship a wrong country prefix to a +91-only
  /// backend). Focus is deferred until after the hint resolves so the soft
  /// keyboard doesn't fight the system sheet.
  Future<void> _requestPhoneHint() async {
    if (_hintRequested) return;
    _hintRequested = true;

    if (kIsWeb || !Platform.isAndroid) {
      _phoneFocus.requestFocus();
      return;
    }

    // TAM-123 phone-hint wiring stays; the previous `onboarding_phone_hint_*`
    // analytics events are not on the Sheet 1 rows 4–16 contract and were
    // dropped as orphans. The picker itself (below) is what row 4 depends
    // on the user completing.
    SmartAuthResult<String>? hint;
    try {
      hint = await SmartAuth.instance.requestPhoneNumberHint();
    } catch (_) {
      // `smart_auth` catches its own PlatformExceptions and reflects them
      // through `SmartAuthResult.failure(...)`, so we normally don't reach
      // this branch — but if the plugin misbehaves, treat it as unavailable
      // instead of crashing.
      hint = null;
    }
    if (!mounted) return;

    // Three terminal outcomes, kept distinct in analytics so the funnel can
    // tell "user has no SIM / no eligible number" apart from "user cancelled
    // the picker":
    //
    //   * hasData        — a number was returned; parse below.
    //   * isCanceled     — user tapped away from the sheet (their choice).
    //   * else (failure) — Play services / no SIM / no numbers on device
    //                      (Google error code 16, "No phone number is found
    //                      on this device"). Nothing the user can fix from
    //                      here; degrade silently to the typed flow.
    //
    // All three paths focus the field so the keyboard opens and the user can
    // type. No snackbar in any case — the picker is an accelerator, not a
    // requirement, and surfacing an error would suggest the app is broken.
    if (hint == null || hint.hasError) {
      debugPrint(
        '[phone-hint] unavailable: '
        '${hint == null ? "plugin threw" : hint.error}',
      );
      _phoneFocus.requestFocus();
      return;
    }
    if (hint.isCanceled || !hint.hasData) {
      _phoneFocus.requestFocus();
      return;
    }

    // Google's SDK returns the phone number in whatever shape the SIM/carrier
    // recorded it — usually E.164 (`+919876543210`) but sometimes with a space
    // (`+91 9876543210`), a dash, or (on some SIMs) no country prefix at all.
    // Strip everything that isn't a digit or a leading `+`, then coerce to a
    // (countryPrefix, 10-digit-local) pair. A strict regex was too fragile:
    // if the format didn't match exactly, the field stayed empty and the user
    // saw the picker "do nothing", which is the bug we're fixing here.
    final rawHint = hint.data ?? '';
    debugPrint('[phone-hint] raw="$rawHint"');
    final parsed = _parsePhoneHint(rawHint);
    final country = parsed.$1;
    final local = parsed.$2;
    final accepted = country == '91' && _validRegex.hasMatch(local);
    debugPrint(
      '[phone-hint] country=$country local=$local accepted=$accepted',
    );

    if (accepted) {
      _phoneController.text = local;
      context.read<PhoneOtpBloc>().add(PhoneChanged(local));
    }
    _phoneFocus.requestFocus();
  }

  void _onGetOtpTapped(PhoneOtpBloc bloc, PhoneOtpState state) {
    final phone = _phoneController.text;
    // Sheet 1 row 7 — `get_otp_clicked`. `attempt_number` counts requests
    // in the CURRENT flow, starting at 1. The bloc owns the counter so the
    // number survives a rebuild.
    final nextAttempt = bloc.nextRequestAttempt();
    unawaited(_analytics()?.trackEvent(
      OnboardingEvents.getOtpClicked,
      properties: <String, Object?>{
        OnboardingEventProps.countryCode: bloc.phoneCountryCode,
        OnboardingEventProps.phoneNumberLength: phone.length,
        OnboardingEventProps.attemptNumber: nextAttempt,
      },
    ));
    // Arm the SMS Retriever session BEFORE dispatching the send. Play
    // Services only forwards SMS received AFTER `startSmsRetriever`; if we
    // arm on the OTP screen's initState instead, a fast MSG91 delivery can
    // land between the send round-trip and the screen mount and Play
    // Services drops it — the exact "SMS arrives, no auto-fill" symptom.
    // The OTP screen consumes the pending Future via `awaitCode()`.
    final sms = _tryReadSmsRetriever();
    if (sms != null) unawaited(sms.arm());
    // Ship the runtime-computed SMS Retriever hash (TAM-123 §3). Fire-and-
    // forget: if the cache isn't warm yet, we await the (usually cached)
    // computation and then dispatch. `null` on iOS / plugin failure.
    unawaited(() async {
      final hash = await ensureAppSignatureHash();
      if (!mounted) return;
      bloc.add(SendOtpRequested(phone, appSignatureHash: hash));
    }());
  }

  SmsRetrieverService? _tryReadSmsRetriever() {
    if (!serviceLocator.isRegistered<SmsRetrieverService>()) return null;
    return serviceLocator<SmsRetrieverService>();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.brand100,
      body: BlocConsumer<PhoneOtpBloc, PhoneOtpState>(
        listener: (context, state) {
          if (state is PhoneOtpSendSuccess) {
            // Boot Clarity BEFORE navigating so the current route's
            // MediaQuery ancestor is still mounted (Clarity's SDK asserts
            // on it in obfuscated release builds). Fire-and-forget: a
            // Clarity fault must never block onboarding. The seam is:
            //   * a no-op in debug/profile builds (`!kReleaseMode` gate)
            //   * a no-op when `Secrets.clarityEnabled` is false
            //   * idempotent per userId — a same-id re-mount early-returns
            //   * on a different userId it re-inits so the change-number
            //     path (OtpBloc._onChangeNumberTapped → ClarityService
            //     .reset()) is followed by a fresh session on the next
            //     send-otp.
            // `pendingUserId` is null on server builds that don't yet
            // return the field — in that case Clarity stays un-booted
            // until AppShellScaffold takes over post-login (existing
            // behaviour), rather than us fabricating an id.
            final pendingUserId = state.pendingUserId;
            if (pendingUserId != null && pendingUserId.isNotEmpty) {
              unawaited(
                ClarityService().initialize(context, userId: pendingUserId),
              );
            }
            context.push('/otp', extra: {
              'otpSessionId': state.otpSessionId,
              'phoneCountryCode': state.phoneCountryCode,
              'phoneNumber': state.phoneNumber,
              'resendAvailableAfterSeconds':
                  state.resendAvailableAfterSeconds,
              'otpLength': state.otpLength,
            });
          }
        },
        builder: (context, state) {
          final bloc = context.read<PhoneOtpBloc>();
          final phoneText = _phoneController.text;
          final isSending = state is PhoneOtpSending;
          final canSubmit = state.termsAccepted &&
              _validRegex.hasMatch(phoneText) &&
              !isSending;

          return Column(
            children: <Widget>[
              // Full-bleed brand background — the PNG already bakes in the logo,
              // wordmark, and tagline. `cover` + top-anchored alignment keeps
              // aspect ratio (no distortion) and just clips the temple
              // silhouettes at the bottom when the top area shrinks (keyboard
              // open, error text pushing the card taller).
              Expanded(
                child: ClipRect(
                  child: Image.asset(
                    'assets/onboarding/login-background.png',
                    key: const Key('phone-input-brand-cluster'),
                    fit: BoxFit.cover,
                    alignment: Alignment.topCenter,
                    width: double.infinity,
                  ),
                ),
              ),
              _LoginCard(
                phoneController: _phoneController,
                phoneFocus: _phoneFocus,
                onPhoneChanged: (v) => bloc.add(PhoneChanged(v)),
                sendFailure:
                    state is PhoneOtpSendFailure ? state.errorMessage : null,
                canSubmit: canSubmit,
                isSending: isSending,
                onGetOtp: () => _onGetOtpTapped(bloc, state),
                onTermsToggled: (v) => bloc.add(TermsToggled(v)),
                termsAccepted: state.termsAccepted,
              ),
            ],
          );
        },
      ),
    );
  }
}

class _LoginCard extends StatelessWidget {
  const _LoginCard({
    required this.phoneController,
    required this.phoneFocus,
    required this.onPhoneChanged,
    required this.sendFailure,
    required this.canSubmit,
    required this.isSending,
    required this.onGetOtp,
    required this.onTermsToggled,
    required this.termsAccepted,
  });

  final TextEditingController phoneController;
  final FocusNode phoneFocus;
  final ValueChanged<String> onPhoneChanged;
  final String? sendFailure;
  final bool canSubmit;
  final bool isSending;
  final VoidCallback onGetOtp;
  final ValueChanged<bool> onTermsToggled;
  final bool termsAccepted;

  @override
  Widget build(BuildContext context) {
    final double bottomInset = MediaQuery.of(context).padding.bottom;
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
                key: const Key('phone-input-title'),
                style: AppText.headingSm(color: AppColors.black),
              ),
            ),
            const SizedBox(height: AppSpacing.large),
            _PhoneNumberField(
              controller: phoneController,
              focusNode: phoneFocus,
              onChanged: onPhoneChanged,
            ),
            const SizedBox(height: AppSpacing.xSmall),
            Padding(
              padding: const EdgeInsets.only(left: 4),
              child: Text(
                'Your number is safe with us.',
                key: const Key('phone-input-safety'),
                style: AppText.bodyXs(color: AppColors.grey400),
              ),
            ),
            const SizedBox(height: AppSpacing.large),
            if (sendFailure != null) ...<Widget>[
              Padding(
                key: const Key('phone-input-send-error'),
                padding: const EdgeInsets.only(bottom: AppSpacing.small),
                child: Text(
                  sendFailure!,
                  style: AppText.bodySm(color: AppColors.error200),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
            _GetOtpCta(
              enabled: canSubmit,
              loading: isSending,
              onPressed: onGetOtp,
            ),
            const SizedBox(height: AppSpacing.large),
            const Divider(
              key: Key('phone-input-divider'),
              height: 1,
              thickness: 1,
              color: AppColors.grey200,
            ),
            const SizedBox(height: AppSpacing.large),
            TermsRow(
              accepted: termsAccepted,
              onChanged: onTermsToggled,
              sourceScreen: 'phone_input',
            ),
          ],
        ),
      ),
    );
  }
}

/// Pill phone-number field with a floating "Phone Number" label sitting on
/// the border (Figma node 397:2825).
class _PhoneNumberField extends StatelessWidget {
  const _PhoneNumberField({
    required this.controller,
    required this.focusNode,
    required this.onChanged,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: <Widget>[
        // Pill container with orange border.
        Container(
          height: 56,
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(AppRadius.pill),
            border: Border.all(color: AppColors.brand300, width: 1.5),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 22.5),
          child: Row(
            children: <Widget>[
              // Prefix "+91 " part of the input for the placeholder look;
              // real value gets appended without the prefix so the bloc can
              // process a bare 10-digit string.
              Text(
                '+91 ',
                style: AppText.bodyMd(color: AppColors.black),
              ),
              Expanded(
                child: TextField(
                  key: const Key('phone-input-field'),
                  controller: controller,
                  focusNode: focusNode,
                  keyboardType: TextInputType.number,
                  inputFormatters: <TextInputFormatter>[
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(10),
                  ],
                  onChanged: onChanged,
                  style: AppText.bodyMd(color: AppColors.black),
                  cursorColor: AppColors.brand300,
                  decoration: InputDecoration(
                    isCollapsed: true,
                    border: InputBorder.none,
                    hintText: '9876543219',
                    hintStyle:
                        AppText.bodyMd(color: AppColors.grey300),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ),
            ],
          ),
        ),
        // Floating label — a white-bg chip sitting on the top border line.
        // Figma puts it at (left 18.5, top -8.5) with px-1 (padding 4h).
        Positioned(
          left: 18.5,
          top: -8.5,
          child: Container(
            color: AppColors.white,
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              'Phone Number',
              key: const Key('phone-input-floating-label'),
              style: AppText.labelSm(color: AppColors.brand300),
            ),
          ),
        ),
      ],
    );
  }
}

/// Orange gradient "Get OTP" CTA — Figma node 397:2831.
class _GetOtpCta extends StatelessWidget {
  const _GetOtpCta({
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
              key: const Key('phone-input-cta'),
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
                        'Get OTP',
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

final RegExp _validRegex = RegExp(r'^[6-9]\d{9}$');

/// Parse whatever the Phone Number Hint API returned into
/// `(countryPrefix, localDigits)`. Tolerates formatting variants observed in
/// the wild:
///
///   * `+919876543210`     — clean E.164, the documented shape.
///   * `+91 9876543210`    — space between prefix and local (Google's
///     internal formatter re-injects one for some carriers).
///   * `+91-98765-43210`   — hyphens, some MVNOs.
///   * `919876543210`      — bare 12-digit international, no leading `+`.
///   * `9876543210`        — bare 10-digit local (no country code at all —
///     seen on some Jio SIMs). Assumed `+91` since our backend is +91-only.
///
/// Anything that doesn't yield a `91` + 10-digit split is returned with a
/// null country so the caller treats it as an unaccepted hint and leaves the
/// field empty for the user to type.
(String?, String) _parsePhoneHint(String raw) {
  // Strip everything that isn't a digit; keep a boolean for the leading `+`.
  final trimmed = raw.trim();
  final hasPlus = trimmed.startsWith('+');
  final digits = trimmed.replaceAll(RegExp(r'\D'), '');

  if (digits.length == 10 && _validRegex.hasMatch(digits)) {
    // Bare 10-digit Indian mobile — the SIM didn't include a country prefix.
    return ('91', digits);
  }
  if (digits.length == 12 && digits.startsWith('91')) {
    final local = digits.substring(2);
    if (_validRegex.hasMatch(local)) return ('91', local);
  }
  if (hasPlus && digits.length > 10) {
    // Some other country — extract prefix (1-3 digits), rest is the local.
    for (final prefixLen in [3, 2, 1]) {
      if (digits.length > prefixLen) {
        final prefix = digits.substring(0, prefixLen);
        final local = digits.substring(prefixLen);
        if (prefix == '91' && _validRegex.hasMatch(local)) {
          return ('91', local);
        }
      }
    }
    // Non-+91 international — return prefix so analytics can size the drop,
    // but the caller rejects it against the +91-only backend gate.
    return (digits.substring(0, digits.length - 10), digits.substring(digits.length - 10));
  }
  return (null, digits);
}
