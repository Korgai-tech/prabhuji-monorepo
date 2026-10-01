import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme.dart';
import '../../domain/kuldevta_result.dart';
import 'kuldevta_dashed_divider.dart';
import 'kuldevta_deity_card.dart';
import 'kuldevta_reason_card.dart';
import 'kuldevta_share_button.dart';
import 'kuldevta_sun_ray_backdrop.dart';

/// The kuldevta result card, as an **overlay over the live chat thread**
/// (TAM-177, Figma `3975:24204`). Replaces the TAM-166 full-screen
/// `KuldevtaResultScreen` route.
///
/// Mount it as a `Stack` sibling ABOVE the chat screen's `Column`:
///
/// ```dart
/// Stack(
///   children: <Widget>[
///     Column(<the untouched app bar / transcript / composer zones>),
///     if (showResult)
///       KuldevtaResultCard(
///         result: result,
///         onChatPressed: …,
///         onSharePressed: …,
///         onDismiss: …,
///       ),
///   ],
/// )
/// ```
///
/// Deliberate non-responsibilities — this widget is presentation ONLY:
///
///  * no `Scaffold` — it is a layer, not a screen;
///  * no `Navigator` / `GoRouter` — every exit is a callback;
///  * no `PopScope` — system back is the caller's business (the chat
///    screen already owns one);
///  * no analytics — `kuldevta_result_viewed`, `…_reopened`,
///    `…_chat_tapped` and the share fire all belong to the caller/bloc
///    (spec §F2 + Frontend task 14: the first-reveal latch must NOT live
///    in a widget of an always-mounted thread).
///
/// Layout (spec §Layout intent → "Screen state: Result card overlay"):
///
///     Stack
///     ├─ scrim   (Key('kuldevta-result-scrim'), tap ⇒ onDismiss)
///     └─ card    (Key('kuldevta-result-card'), top-anchored, inset)
///         └─ Column
///             ├─ Expanded-equivalent scrollable content
///             │   ├─ deity artwork  (AspectRatio, clipped to the card)
///             │   ├─ KuldevtaDeityCard  (overlaps the artwork upward)
///             │   ├─ KuldevtaDashedDivider  (gender-branched copy)
///             │   └─ KuldevtaReasonCard × result.reasons.length
///             └─ action row (PINNED TO THE CARD, not to the screen)
///
/// The content scrolls INTERNALLY: at 600 dp the artwork + name + three
/// reason cards + CTA do not fit, and the CTA must stay reachable without
/// the card growing off-screen. `Flexible` + `SingleChildScrollView` gives
/// "as tall as the content, capped at the viewport" in one step.
class KuldevtaResultCard extends StatelessWidget {
  const KuldevtaResultCard({
    super.key,
    required this.result,
    required this.onChatPressed,
    required this.onSharePressed,
    required this.onDismiss,
  });

  final KuldevtaResult result;

  /// "Mata Se Baat Karein" / "Baba Se Baat Karein". The caller owns the
  /// paywall gate + handoff (spec §F5).
  final VoidCallback onChatPressed;

  /// Share sheet. The caller owns the share service call and the
  /// post-share `KuldevtaShareTapped` dispatch.
  final VoidCallback onSharePressed;

  /// Scrim tap (and, at the caller's discretion, system back).
  final VoidCallback onDismiss;

  /// The card's own fill. Passed to [KuldevtaDashedDivider.surface] —
  /// that widget occludes its dashed line by painting an opaque box
  /// behind the label, so a mismatched colour breaks the illusion into a
  /// visible patch. Figma samples the body as pure white at the divider's
  /// y-offset, which is exactly [AppKuldevta.resultCardFill].
  static const Color _cardFill = AppKuldevta.resultCardFill;

  bool get _isDevi => result.gender == KuldevtaGender.devi;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: <Widget>[
        // Paint order matches Figma: scrim first (below), card on top.
        Positioned.fill(
          child: GestureDetector(
            key: const Key('kuldevta-result-scrim'),
            behavior: HitTestBehavior.opaque,
            onTap: onDismiss,
            child: const ColoredBox(color: AppKuldevta.resultOverlayScrim),
          ),
        ),
        Positioned.fill(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppKuldevta.screenPadding,
              AppKuldevta.resultOverlayPaddingTop,
              AppKuldevta.screenPadding,
              AppKuldevta.resultOverlayPaddingBottom,
            ),
            // Align loosens the incoming tight constraints so the card can
            // shrink-wrap its content; without it `Positioned.fill` forces
            // full height and the CTA would pin to the SCREEN bottom.
            child: Align(
              alignment: Alignment.topCenter,
              child: _Card(
                result: result,
                isDevi: _isDevi,
                onChatPressed: onChatPressed,
                onSharePressed: onSharePressed,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({
    required this.result,
    required this.isDevi,
    required this.onChatPressed,
    required this.onSharePressed,
  });

  final KuldevtaResult result;
  final bool isDevi;
  final VoidCallback onChatPressed;
  final VoidCallback onSharePressed;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      // Swallow taps that land on the card so they do not fall through the
      // Stack to the scrim's dismiss handler. Children (the CTA, the share
      // button) still win the gesture arena, so this costs nothing.
      behavior: HitTestBehavior.opaque,
      onTap: () {},
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: KuldevtaResultCard._cardFill,
          borderRadius: BorderRadius.circular(AppKuldevta.resultOverlayRadius),
          boxShadow: <BoxShadow>[
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.16),
              blurRadius: 24,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: ClipRRect(
          key: const Key('kuldevta-result-card'),
          borderRadius: BorderRadius.circular(AppKuldevta.resultOverlayRadius),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              // Flexible (loose fit) — the scrollable takes its intrinsic
              // height when the content fits and is capped at the
              // remaining space when it does not. THIS is what keeps the
              // action row pinned to the CARD's bottom edge rather than
              // pushing it off-screen at 600 dp / textScale 2.0.
              Flexible(
                child: SingleChildScrollView(
                  key: const Key('kuldevta-result-scroll'),
                  child: _CardBody(result: result, isDevi: isDevi),
                ),
              ),
              _ActionRow(
                isDevi: isDevi,
                onChatPressed: onChatPressed,
                onSharePressed: onSharePressed,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CardBody extends StatelessWidget {
  const _CardBody({required this.result, required this.isDevi});

  final KuldevtaResult result;
  final bool isDevi;

  @override
  Widget build(BuildContext context) {
    final reasons = result.reasons;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        _Artwork(result: result),
        // Self-lifts by AppKuldevta.resultCardOverlap (paint-only), which
        // both produces the overlap onto the artwork AND supplies the gap
        // down to the dashed divider — hence no top padding below.
        KuldevtaDeityCard(result: result),
        Padding(
          key: const Key('kuldevta-result-dashed'),
          padding: const EdgeInsets.fromLTRB(
            AppKuldevta.screenPadding,
            0,
            AppKuldevta.screenPadding,
            AppKuldevta.resultOverlayDashedGap,
          ),
          child: KuldevtaDashedDivider(
            text: isDevi
                ? 'Ye aapki kuldevi kyu he?'
                : 'Ye aapke kuldevta kyu he?',
            // #EXPORT_CRITICAL — the divider occludes its own dashed line
            // with an opaque box behind the label. It MUST be the card's
            // fill or the label renders on a visible colour patch.
            surface: KuldevtaResultCard._cardFill,
          ),
        ),
        for (int i = 0; i < reasons.length; i++)
          Padding(
            padding: EdgeInsets.fromLTRB(
              AppKuldevta.screenPadding,
              0,
              AppKuldevta.screenPadding,
              i == reasons.length - 1
                  ? AppSpacing.medium
                  : AppKuldevta.resultOverlayReasonGap,
            ),
            child: KuldevtaReasonCard(
              key: Key('kuldevta-result-reason-$i'),
              reason: reasons[i],
            ),
          ),
      ],
    );
  }
}

/// Deity artwork, clipped to the card's top corners by the parent
/// `ClipRRect`.
///
/// `hasImage == false` ⇒ [KuldevtaSunRayBackdrop], which is ALSO the
/// placeholder and the errorWidget for the network case — a slow or dead
/// image never leaves a hole, exactly as the TAM-166 screen did.
class _Artwork extends StatelessWidget {
  const _Artwork({required this.result});

  final KuldevtaResult result;

  @override
  Widget build(BuildContext context) {
    final imageUrl = result.imageUrl;
    if (imageUrl == null || imageUrl.isEmpty) {
      return const AspectRatio(
        aspectRatio: AppKuldevta.resultOverlaySunRayAspect,
        child: _ClippedSunRay(),
      );
    }
    return AspectRatio(
      aspectRatio: AppKuldevta.resultOverlayArtworkAspect,
      child: CachedNetworkImage(
        imageUrl: imageUrl,
        fit: BoxFit.cover,
        placeholder: (_, _) => const _ClippedSunRay(),
        errorWidget: (_, _, _) => const _ClippedSunRay(),
      ),
    );
  }
}

/// [KuldevtaSunRayBackdrop] inside a `ClipRect`.
///
/// The backdrop is a `CustomPaint` whose painter draws rays radiating past the
/// box it is given, and **`CustomPaint` does not clip its painter** — so on the
/// no-image path the rays spilled down the whole card and rendered behind the
/// dashed divider, the reason cards and the action row.
///
/// Invisible until it is seen: the old full-screen result SCREEN gave the
/// backdrop 50–60% of the viewport, so the spill landed on empty space. Inside
/// an inset card with content stacked beneath it, the same painter paints over
/// that content. Caught on-device; a golden of the devta fixture would catch it
/// next time.
class _ClippedSunRay extends StatelessWidget {
  const _ClippedSunRay();

  @override
  Widget build(BuildContext context) =>
      const ClipRect(child: KuldevtaSunRayBackdrop());
}

/// Share button + primary CTA, pinned to the bottom of the CARD.
class _ActionRow extends StatelessWidget {
  const _ActionRow({
    required this.isDevi,
    required this.onChatPressed,
    required this.onSharePressed,
  });

  final bool isDevi;
  final VoidCallback onChatPressed;
  final VoidCallback onSharePressed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppKuldevta.screenPadding,
        0,
        AppKuldevta.screenPadding,
        AppSpacing.medium,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: <Widget>[
          KuldevtaShareButton(
            key: const Key('kuldevta-result-share'),
            onTap: onSharePressed,
          ),
          const SizedBox(width: AppKuldevta.tightGap),
          Expanded(
            child: _ChatCta(isDevi: isDevi, onPressed: onChatPressed),
          ),
        ],
      ),
    );
  }
}

class _ChatCta extends StatelessWidget {
  const _ChatCta({required this.isDevi, required this.onPressed});

  final bool isDevi;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(AppKuldevta.resultOverlayCtaRadius);
    return DecoratedBox(
      decoration: BoxDecoration(
        // Figma `3975:24572`: linear #FC7304 → #FE8A02 (brand400 →
        // brand300), left to right.
        gradient: const LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: <Color>[AppColors.brand400, AppColors.brand300],
        ),
        borderRadius: radius,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          key: const Key('kuldevta-result-chat-cta'),
          onTap: onPressed,
          borderRadius: radius,
          child: ConstrainedBox(
            // NEVER a rigid `height:` around scalable Text — the label
            // grows past 56 dp the moment a user raises their font size,
            // and a fixed box would clip/overflow. minHeight keeps the
            // Figma metric at scale 1.0 and lets the button grow.
            constraints: const BoxConstraints(
              minHeight: AppKuldevta.primaryCtaHeight,
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.medium,
                vertical: AppSpacing.xSmall,
              ),
              child: Center(
                child: Text(
                  isDevi ? 'Mata Se Baat Karein' : 'Baba Se Baat Karein',
                  textAlign: TextAlign.center,
                  style: AppText.labelLg(
                    color: AppColors.white,
                  ).copyWith(fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
