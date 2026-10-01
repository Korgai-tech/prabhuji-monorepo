// Explicit named params — see the equivalent note on other screens in this app.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/secrets.dart';
import '../../../core/theme.dart';
import '../../../state/providers.dart';
import '../support_analytics.dart';
import 'whatsapp_launcher.dart';

/// Toast copy for the two failure paths — kept as file-level constants so
/// widget tests grep them exactly.
///
/// [kSupportUnavailableSnackbar] — shown when the CTA is DISABLED
/// (secrets missing / placeholder). Tap does NOT fire analytics and does
/// NOT invoke `launchUrl`.
///
/// [kSupportLaunchFailedSnackbar] — shown when `launchUrl` returned `false`
/// in the enabled state (nothing on the device could handle the URL).
const String kSupportUnavailableSnackbar =
    'Support is currently unavailable. Please try again later.';
const String kSupportLaunchFailedSnackbar =
    "Couldn't open WhatsApp. Please try again.";

/// Support screen — Figma frame `1939:20185`. Pinned app bar + a single
/// "Help & Support" card at the top of the flex-fill body. Screen root does
/// NOT scroll; the body zone is `Expanded` so the card stays glued to the
/// top on tall devices and can scroll internally on short ones (see the
/// spec's Layout intent block).
///
/// The CTA has two visual states, gated by [Secrets.supportWhatsAppEnabled]:
///  * enabled → WhatsApp green (`#00965E`), tap launches the `wa.me` deep
///    link via [WhatsAppLauncher] AND fires `support_whatsapp_clicked`.
///  * disabled → grey with dimmed white label, tap shows the "Support is
///    currently unavailable" snackbar and does NOT fire analytics.
class SupportScreen extends ConsumerStatefulWidget {
  const SupportScreen({
    super.key,
    this.source,
    WhatsAppLauncher? launcher,
    Secrets? secretsOverride,
  })  : _launcher = launcher,
        _secretsOverride = secretsOverride;

  /// Where the user came from. Nullable so deep-link / hot-restart entry
  /// (no `go_router` extras) still boots cleanly — analytics fires the
  /// `unknown` bucket in that case.
  final SupportEntrySource? source;

  /// Test seam: inject a stub launcher. Defaults to the real
  /// [WhatsAppLauncher] in production; widget tests pass a fake so no OS
  /// intent leaves the test.
  final WhatsAppLauncher? _launcher;

  /// Test seam: override the [Secrets] read for the enabled/disabled decision.
  /// Defaults to `Secrets.instance` in production. Tests use this to exercise
  /// every truth-table state without touching the singleton.
  final Secrets? _secretsOverride;

  @override
  ConsumerState<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends ConsumerState<SupportScreen> {
  late final WhatsAppLauncher _launcher;

  @override
  void initState() {
    super.initState();
    _launcher = widget._launcher ?? const WhatsAppLauncher();

    // Row: support_opened fires ONCE from initState.
    // Payload carries {source: 'home_header' | 'profile_menu' | 'unknown'}
    // — the third bucket handles deep-link / hot-restart where extras were
    // stripped, so the property is never null and dashboards can filter it.
    unawaited(
      ref.read(analyticsProvider)?.trackEvent(
        SupportEvents.opened,
        properties: <String, Object?>{
          SupportEventProps.source:
              widget.source?.wire ?? kSupportSourceUnknown,
        },
      ),
    );
  }

  Secrets get _secrets => widget._secretsOverride ?? Secrets.instance;

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _onCtaTap() async {
    final secrets = _secrets;
    if (!secrets.supportWhatsAppEnabled) {
      // Degraded state — no analytics fire (would inflate the metric with
      // intent that can never succeed), no launchUrl, just the snackbar.
      _showSnack(kSupportUnavailableSnackbar);
      return;
    }

    // Fire analytics BEFORE the await — the spec is explicit that the click
    // event carries no properties beyond the enricher defaults (no raw
    // number, no message, no URL — PII / config-value hygiene).
    unawaited(
      ref.read(analyticsProvider)?.trackEvent(SupportEvents.whatsAppClicked),
    );

    final ok = await _launcher.launch(
      number: secrets.supportWhatsAppNumber!,
      message: secrets.supportWhatsAppMessage!,
    );
    if (!ok) {
      _showSnack(kSupportLaunchFailedSnackbar);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('support-screen'),
      // No explicit backgroundColor — the DecoratedBox below paints the
      // shared cream `homeScaffold` gradient (same as home/profile), which
      // Scaffold's own scaffoldBackgroundColor would flatten if set here.
      backgroundColor: Colors.transparent,
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: AppGradient.homeScaffold),
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              const _AppBar(key: Key('support-appbar')),
              // 24dp gap before the card, per Figma.
              const SizedBox(height: AppSpacing.large),
              // Flex-fill body: the card scrolls internally if it ever grows
              // past available height (spec layout-intent block). At the
              // default intrinsic card height it just sits at the top.
              Expanded(
                key: const Key('support-body'),
                child: SingleChildScrollView(
                  key: const Key('support-body-scroll'),
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.medium,
                  ),
                  child: _HelpSupportCard(
                    ctaEnabled: _secrets.supportWhatsAppEnabled,
                    onCtaTap: _onCtaTap,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Pinned app bar — 64 tall Basic Nav (Figma node `1939:20187`). Back arrow
/// (leading) + "Support" title. Trailing Gear/Phone/Pencil template icons
/// are NOT rendered (unused chrome carried over from the master; same
/// convention as every other v2 spec).
class _AppBar extends StatelessWidget {
  const _AppBar({super.key});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      // BoxConstraints(minHeight:) not required here — the row has no
      // scalable Text on it whose height would change with font scale (the
      // 24/32 title sits inside a fixed 36 back-arrow frame, both dwarfed
      // by the 64 nav height even at 2× scale).
      height: 64,
      child: Row(
        children: <Widget>[
          const SizedBox(width: AppSpacing.xSmall),
          _BackButton(),
          const SizedBox(width: AppSpacing.xSmall),
          Expanded(
            child: Text(
              'Support',
              key: const Key('support-appbar-title'),
              style: AppText.headingSm(color: AppColors.black),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

/// Back arrow — reuses the shared Figma-exported glyph (`assets/aarti/back-arrow.svg`)
/// tinted black. Same convention as the Profile menu top-bar back button.
class _BackButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: const Key('support-back'),
      behavior: HitTestBehavior.opaque,
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
    );
  }
}

/// Help & Support card — Figma node `1939:20190`. `layoutMode=VERTICAL`,
/// intrinsic height (spec-authorized deviation from the Figma render bug:
/// the availability row lands INSIDE the card, not clipped — see spec
/// #PLAN_UNCERTAINTY "Rendered PNG appears to CLIP…", RESOLVED).
class _HelpSupportCard extends StatelessWidget {
  const _HelpSupportCard({
    required this.ctaEnabled,
    required this.onCtaTap,
  });

  final bool ctaEnabled;
  final VoidCallback onCtaTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('support-card'),
      padding: const EdgeInsets.all(AppSpacing.medium),
      decoration: BoxDecoration(
        // Same cream gradient family as the screen root (spec: reuse; do NOT
        // hand-roll a third gradient). `homeShortcutCard` is the vertical
        // cream→amber that matches the card fill on 1939:20190.
        gradient: AppGradient.homeShortcutCard,
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const _IllustrationPlaceholder(),
          const SizedBox(height: AppSpacing.small),
          _Heading(),
          const SizedBox(height: AppSpacing.xSmall),
          _Body(),
          const SizedBox(height: AppSpacing.medium),
          _ChatCta(enabled: ctaEnabled, onTap: onCtaTap),
        ],
      ),
    );
  }
}

/// 160×56 illustration container placeholder (Figma node `1939:20191`). The
/// container is empty in the Figma frame — the designer hasn't dropped in
/// the WhatsApp/support artwork yet, and the skill forbids inventing art.
/// Ships as a fixed [SizedBox] slot; real illustration is a follow-up.
class _IllustrationPlaceholder extends StatelessWidget {
  const _IllustrationPlaceholder();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      key: Key('support-illustration'),
      width: 160,
      height: 56,
    );
  }
}

/// Card heading "Help & Support" (Figma node `1939:20194`) — 24/32 w600.
class _Heading extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      // minHeight around scalable text (figma-flutter skill trap): the row
      // grows past 32 dp when the user scales fonts up. Never `height:`.
      constraints: const BoxConstraints(minHeight: 32),
      child: Text(
        'Help & Support',
        key: const Key('support-heading'),
        style: AppText.headingSm(color: AppColors.black),
      ),
    );
  }
}

/// Card body copy (Figma node `1939:20196`) — 14/20 w400, grey500.
class _Body extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 40),
      child: Text(
        'Chat with our support team on WhatsApp for assistance.',
        key: const Key('support-body-text'),
        style: AppText.bodySm(color: AppColors.grey500),
      ),
    );
  }
}

/// Chat on WhatsApp CTA (Figma node `1939:20197`). Two visual states:
///  * enabled  — WhatsApp green (#00965E) fill, white icon + label.
///  * disabled — grey fill (#B8B8B8), dimmed white label. Icon + label
///               stay identical so the affordance remains legible.
class _ChatCta extends StatelessWidget {
  const _ChatCta({required this.enabled, required this.onTap});

  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fill = enabled
        ? AppColors.whatsAppGreen
        : AppColors.supportDisabledCtaFill;
    final labelColor = enabled
        ? AppColors.white
        : AppColors.supportDisabledCtaLabel;

    return GestureDetector(
      key: const Key('support-whatsapp-cta'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 48),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.medium,
          vertical: AppSpacing.small,
        ),
        decoration: BoxDecoration(
          color: fill,
          // Figma node 1939:20197 cornerRadius=12 — literal, not on the
          // shared AppRadius ramp (which jumps 8 → 16).
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: <Widget>[
            SvgPicture.asset(
              'assets/support/whatsapp.svg',
              width: 23,
              height: 24,
              colorFilter: ColorFilter.mode(labelColor, BlendMode.srcIn),
            ),
            const SizedBox(width: AppSpacing.xSmall),
            Text(
              'Chat on WhatsApp',
              key: const Key('support-whatsapp-cta-label'),
              style: AppText.labelLg(color: labelColor),
            ),
          ],
        ),
      ),
    );
  }
}

