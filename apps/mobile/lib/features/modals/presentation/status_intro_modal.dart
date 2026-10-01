import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/theme.dart';
import '../data/modal_models.dart';
import '../modals_analytics.dart';

/// The status-intro modal's presentational card (TAM-174) — a centred white
/// rounded card over a dimmed scrim: a circular close cross overlapping the
/// TOP-LEFT corner, a bold centred title, an optional body, a bordered
/// cream-tinted preview panel with the server's sample image and a static
/// dashed "add your name and photo" hint row, and a full-width orange CTA.
///
/// Deliberately holds NO server call / analytics / navigation logic — that
/// is `ModalHost`'s job (the orchestrator that opens this via `showDialog`).
/// This widget only:
///  - renders [content] verbatim (title/body/image/CTA copy is ALL server
///    content; the dashed hint row is the only static chrome),
///  - fires [onViewed] exactly once, on its own first frame (not from
///    `build`, which can re-run for the same shown instance without that
///    counting as a second "view"),
///  - reports HOW it was closed via [onDismiss] — genuinely distinguishing
///    the three paths (never "cross" for all three):
///      * the close cross — explicit `onTap`, pops itself,
///      * the system back button — caught by `PopScope(canPop: false, ...)`;
///        `Navigator.pop()` (an unconditional, PROGRAMMATIC pop, used by the
///        other two paths) bypasses `canPop`, so `onPopInvokedWithResult`
///        only ever fires here for a genuine SYSTEM-initiated back attempt —
///        see the Flutter `PopScope` doc's "Programmatically attempting pop
///        navigation" note,
///      * anywhere else in the dimmed scrim — a full-screen tap-catcher
///        BEHIND the card. `showDialog` is opened with
///        `barrierDismissible: false` (see `ModalHost`) because the
///        framework's native barrier dismissal gives no hook to attribute
///        which method fired it; this widget builds its own so
///        `outside_tap` can be reported distinctly.
///  - reports [onCta] on the button tap. Navigation is the caller's job —
///    this widget does not pop itself on CTA (the host needs to pop THEN
///    push, in that order, using its own long-lived context).
///
/// The card has a DEFINITE height (`maxCardHeight`, capped at 85% of the
/// viewport). The title and CTA are pinned top/bottom and the preview panel
/// is `Expanded` and absorbs whatever space is left, so on a small device
/// with a large `textScaler` it is the image that shrinks toward zero first,
/// never the title/CTA that overflow (`flutter-responsive-layout`) — see the
/// `Expanded` below for the degradation tradeoff this costs. Only once the
/// image has shrunk to nothing and the fixed (non-image) content STILL can't
/// fit the frame — a small device at extreme accessibility textScaling —
/// does a scroll safety net engage; see the `LayoutBuilder` inside the card
/// `Container` below for why that never changes the layout in any normal
/// case.
class StatusIntroModal extends StatefulWidget {
  const StatusIntroModal({
    super.key,
    required this.content,
    required this.onViewed,
    required this.onCta,
    required this.onDismiss,
  });

  final ServableModalView content;
  final VoidCallback onViewed;
  final VoidCallback onCta;

  /// Called with one of [ModalDismissMethods]'s values.
  final ValueChanged<String> onDismiss;

  @override
  State<StatusIntroModal> createState() => _StatusIntroModalState();
}

class _StatusIntroModalState extends State<StatusIntroModal> {
  @override
  void initState() {
    super.initState();
    // Fire ONCE, on first paint — not from `build`, which can re-run many
    // times for the same shown dialog (a Theme/MediaQuery change, a parent
    // rebuild) and would otherwise double-count the impression.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      widget.onViewed();
    });
  }

  @override
  Widget build(BuildContext context) {
    final screenSize = MediaQuery.sizeOf(context);
    final maxCardWidth = math.min(340.0, screenSize.width - 32);
    final maxCardHeight = screenSize.height * 0.85;

    return PopScope(
      // System back is blocked here so it can be attributed as its OWN
      // dismissMethod ("back") — see the class doc. Cross/outside-tap below
      // call `Navigator.pop()` directly, which is unconditional and bypasses
      // this gate entirely, so this callback fires ONLY for a genuine
      // system-initiated back attempt.
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        widget.onDismiss(ModalDismissMethods.back);
        Navigator.of(context).pop();
      },
      // `showDialog`'s builder gets no `Material` ancestor for free (unlike
      // the default `Dialog` widget it normally wraps) — the CTA
      // `ElevatedButton` and the close `InkWell` both need one.
      child: Material(
        type: MaterialType.transparency,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Full-screen outside-tap catcher, BEHIND the card. The dimmed
            // scrim itself is painted by `showDialog`'s `barrierColor`.
            Positioned.fill(
              child: GestureDetector(
                key: const Key('status-intro-modal-scrim'),
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  widget.onDismiss(ModalDismissMethods.outsideTap);
                  Navigator.of(context).pop();
                },
              ),
            ),
            Center(
              child: Stack(
                // The close button intentionally paints OUTSIDE the card's own
                // bounds (negative offsets below) to overlap its corner — do
                // not clip it away.
                clipBehavior: Clip.none,
                children: [
                  GestureDetector(
                    // Absorb taps on the card itself so they never reach the
                    // scrim catcher behind it.
                    behavior: HitTestBehavior.opaque,
                    onTap: () {},
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        maxWidth: maxCardWidth,
                        // A DEFINITE height (min == max), not just a cap —
                        // `Expanded` below needs a real height to divide; a
                        // loose `maxHeight` alone leaves the column's height
                        // indeterminate. `maxCardHeight` is already capped at
                        // the safe viewport (85% of screen height) above.
                        minHeight: maxCardHeight,
                        maxHeight: maxCardHeight,
                      ),
                      child: Container(
                        key: const Key('status-intro-modal-card'),
                        padding: const EdgeInsets.fromLTRB(20, 28, 20, 20),
                        decoration: BoxDecoration(
                          color: AppColors.white,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        // Fixed frame is the product requirement (TAM-174):
                        // title pinned top, CTA pinned bottom, the preview
                        // panel fills whatever is left. `LayoutBuilder` +
                        // `SingleChildScrollView` below is a SAFETY NET, not
                        // the design — `ConstrainedBox(minHeight: ...)`
                        // forces the column to fill the card's height
                        // exactly whenever the content fits (every normal
                        // case: `Expanded` still hands the surplus to the
                        // image, and the scroll view never actually
                        // scrolls — the layout is identical to a plain,
                        // non-scrollable `Column`). It only engages once the
                        // content genuinely cannot fit — a small device at
                        // extreme accessibility textScaling, after the image
                        // has already shrunk to nothing — growing the column
                        // past the frame and letting the user scroll to
                        // reach the CTA instead of hitting a RenderFlex
                        // overflow with an unreachable button.
                        // `IntrinsicHeight` is required for `Expanded`
                        // (the preview panel below) to work inside a scroll
                        // view; it costs an extra layout pass, which is
                        // acceptable for a single small card and is why this
                        // pattern is scoped to this one widget rather than
                        // used generally (`flutter-responsive-layout`).
                        child: LayoutBuilder(
                          builder: (context, constraints) =>
                              SingleChildScrollView(
                                child: ConstrainedBox(
                                  constraints: BoxConstraints(
                                    minHeight: constraints.maxHeight,
                                  ),
                                  child: IntrinsicHeight(
                                    child: Column(
                                      mainAxisSize: MainAxisSize.max,
                                      children: [
                                        Text(
                                          widget.content.title,
                                          key: const Key(
                                            'status-intro-modal-title',
                                          ),
                                          textAlign: TextAlign.center,
                                          style: AppText.headingXs(
                                            color: AppColors.grey500,
                                          ),
                                        ),
                                        if ((widget.content.body ?? '')
                                            .trim()
                                            .isNotEmpty) ...[
                                          const SizedBox(
                                            height: AppSpacing.small,
                                          ),
                                          Text(
                                            widget.content.body!.trim(),
                                            key: const Key(
                                              'status-intro-modal-body',
                                            ),
                                            textAlign: TextAlign.center,
                                            style: AppText.bodySm(
                                              color: AppColors.grey400,
                                            ),
                                          ),
                                        ],
                                        const SizedBox(
                                          height: AppSpacing.medium,
                                        ),
                                        Expanded(
                                          // DEGRADATION TRADEOFF: the preview
                                          // panel (not the title/CTA) is what
                                          // gives first — on a small device with
                                          // a large accessibility textScaler,
                                          // when the title wraps to more lines /
                                          // the CTA grows, this leftover
                                          // shrinks. The image squeezes toward
                                          // zero before the scroll safety net
                                          // above ever engages, so the title
                                          // stays fully visible and the CTA
                                          // stays tappable for as long as
                                          // possible.
                                          child: _PreviewPanel(
                                            imageUrl: widget.content.imageUrl,
                                          ),
                                        ),
                                        const SizedBox(
                                          height: AppSpacing.large,
                                        ),
                                        SizedBox(
                                          width: double.infinity,
                                          child: ElevatedButton(
                                            key: const Key(
                                              'status-intro-modal-cta',
                                            ),
                                            onPressed: widget.onCta,
                                            style: ElevatedButton.styleFrom(
                                              backgroundColor:
                                                  AppColors.brand300,
                                              foregroundColor: AppColors.white,
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                    vertical: 14,
                                                  ),
                                              shape: RoundedRectangleBorder(
                                                borderRadius:
                                                    BorderRadius.circular(
                                                      AppRadius.input,
                                                    ),
                                              ),
                                            ),
                                            child: Text(
                                              widget.content.ctaText,
                                              key: const Key(
                                                'status-intro-modal-cta-label',
                                              ),
                                              style: AppText.labelLg(
                                                color: AppColors.white,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                        ),
                      ),
                    ),
                  ),
                  // Close cross — TOP-LEFT, overlapping the card corner
                  // (negative offsets against the inner Stack, which is sized
                  // to the card via the non-positioned child above).
                  Positioned(
                    left: -10,
                    top: -10,
                    child: Semantics(
                      button: true,
                      label: 'Close',
                      child: InkWell(
                        key: const Key('status-intro-modal-close'),
                        customBorder: const CircleBorder(),
                        onTap: () {
                          widget.onDismiss(ModalDismissMethods.cross);
                          Navigator.of(context).pop();
                        },
                        child: Container(
                          // Minimum 44×44 tap target.
                          width: 44,
                          height: 44,
                          alignment: Alignment.center,
                          decoration: const BoxDecoration(
                            color: AppColors.white,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: Color(0x1F000000),
                                blurRadius: 8,
                              ),
                            ],
                          ),
                          child: const Icon(
                            Icons.close,
                            size: 20,
                            color: AppColors.grey500,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Bordered, cream-tinted preview panel — the server's sample status image
/// plus the static dashed hint row at its base.
///
/// A blank/null [imageUrl] just skips the image (the panel + hint row still
/// render — there's nothing to load, not a failure). A load FAILURE hides
/// the WHOLE panel (image + hint row): a missing/broken image must not block
/// the modal — the title and CTA are the payload, per the brief.
class _PreviewPanel extends StatefulWidget {
  const _PreviewPanel({required this.imageUrl});
  final String? imageUrl;

  @override
  State<_PreviewPanel> createState() => _PreviewPanelState();
}

class _PreviewPanelState extends State<_PreviewPanel> {
  bool _failed = false;

  @override
  Widget build(BuildContext context) {
    if (_failed) return const SizedBox.shrink();

    final url = (widget.imageUrl ?? '').trim();
    return Container(
      key: const Key('status-intro-modal-preview'),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppColors.brand100,
        border: Border.all(color: AppColors.brand200),
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.max,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        // When there's no image, the hint row is the Column's only child —
        // `.end` pins it to the panel's base rather than leaving it stranded
        // at the top of the panel's now-full-height box.
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          if (url.isNotEmpty)
            Expanded(
              // A fixed aspect ratio and "fill whatever space is left" are
              // mutually exclusive — `Expanded` (fill the panel's
              // remainder) is what the product's no-scroll requirement
              // replaced the 3:4 ratio with. `BoxFit.cover` still keeps it
              // full-bleed like the design at whatever size it lands on.
              child: Image.network(
                url,
                fit: BoxFit.cover,
                // Decoded at a sensible display size, not source resolution
                // — repo convention (`flutter-ui`).
                cacheWidth: 600,
                loadingBuilder: (context, child, progress) {
                  // Reserve the same box while loading so the card never
                  // jumps once the image lands.
                  if (progress == null) return child;
                  return const ColoredBox(color: AppColors.brand100);
                },
                errorBuilder: (context, error, stackTrace) {
                  // Deferred: `errorBuilder` runs DURING build, so `setState`
                  // here directly would throw. Schedule it for the next
                  // frame instead, and mount-check before touching state.
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (!mounted) return;
                    setState(() => _failed = true);
                  });
                  return const SizedBox.shrink();
                },
              ),
            ),
          const _HintRow(),
        ],
      ),
    );
  }
}

/// Static decorative chrome — NOT server content. A dashed-outline row with
/// a circular avatar placeholder and the (locked, Hindi) hint copy.
class _HintRow extends StatelessWidget {
  const _HintRow();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(10),
      child: CustomPaint(
        painter: const _DashedRectPainter(color: AppColors.brand300),
        child: Container(
          key: const Key('status-intro-modal-hint-row'),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          child: Row(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: const BoxDecoration(
                  color: AppColors.brand200,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.person,
                  size: 16,
                  color: AppColors.brand300,
                ),
              ),
              const SizedBox(width: AppSpacing.xSmall),
              const Flexible(
                child: Text(
                  'अपना नाम और फोटो ऐड करें',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: AppColors.grey500,
                  ),
                  overflow: TextOverflow.ellipsis,
                  maxLines: 2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Hand-rolled dashed rounded-rect border (mirrors the dashed-LINE painter
/// in `lib/features/kuldevta/presentation/widgets/kuldevta_dashed_divider.dart`
/// — this repo has no dashed-border package dependency).
class _DashedRectPainter extends CustomPainter {
  const _DashedRectPainter({required this.color});

  final Color color;

  static const double _radius = 10;
  static const double _strokeWidth = 1.2;
  static const double _dashWidth = 4;
  static const double _gapWidth = 3;

  @override
  void paint(Canvas canvas, Size size) {
    final rrect = RRect.fromRectAndRadius(
      Offset.zero & size,
      const Radius.circular(_radius),
    );
    final path = Path()..addRRect(rrect);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = _strokeWidth;
    for (final metric in path.computeMetrics()) {
      double distance = 0;
      while (distance < metric.length) {
        final next = (distance + _dashWidth).clamp(0.0, metric.length);
        canvas.drawPath(metric.extractPath(distance, next), paint);
        distance += _dashWidth + _gapWidth;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedRectPainter oldDelegate) =>
      oldDelegate.color != color;
}
