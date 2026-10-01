import 'package:cached_network_image/cached_network_image.dart';
import 'package:coverflow_carousel/coverflow_carousel.dart' as pkg;
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../api/generated/openapi.dart';
import '../../../../core/theme.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../bloc/paywall_state.dart';
import '../../bloc/payment_bloc.dart';
import '../../bloc/payment_event.dart';
import '../widgets/compact_plan_trial_section.dart';
import '../widgets/pay_now_shimmer_button.dart';
import '../widgets/top_nav.dart';
import '../widgets/vip_benefits_heading.dart';

/// `carousel` variant body — Figma node `2743:25026`.
///
/// **No video anywhere in this variant** — `heroMedia[]` for
/// `vip-carousel-v1` is images-only per the seed.
///
/// Layout intent (paint order back → front):
///   * Full-height `v4-bg.png` (orange gradient) as `Positioned.fill`
///   * `PaywallTopNav` — white icons, transparent bg (pinned top, intrinsic)
///   * `CoverflowCarousel` — flex-6 slot wrapped in a `FittedBox(contain)`
///     over a logical 360×300 box so the coverflow scales uniformly at
///     shorter device heights (no fixed 300dp SizedBox — removed for the
///     "no scroll" refactor). Package-internal `PageView.builder` +
///     `Matrix4` still drives the 5-tile fan + peek scaling.
///   * Nav row: LEFT CHEVRON + RIGHT CHEVRON — no dots per Figma v4 (part
///     of `CoverflowCarousel`'s own Column, sits below the coverflow)
///   * 2×3 named-feature check-list ("VIP Benefits" title + 6 items) —
///     flex 4, `FittedBox(scaleDown)` for short-slot scaling
///   * `PaywallCompactPlanTrialSection` — flex 3, `FittedBox(scaleDown)`
///   * `PaywallPayNowShimmerButton` — pinned bottom (intrinsic)
///
/// **No `SingleChildScrollView` anywhere.** The middle band flexes; when
/// intrinsic content exceeds the allocated slot the FittedBoxes scale
/// content uniformly rather than scrolling.
///
/// **Interaction**: autoplay every 5s, loop to page 0 on last image
/// (spec Q12). Press-and-hold pauses via a `Listener`; release resumes.
/// Arrow taps advance discretely and do NOT pause autoplay.
///
/// Coverflow content: if the CMS's `heroMedia` has ≥1 image, use those URLs;
/// otherwise fall back to the bundled `assets/paywall/v4-coverflow-N.png`
/// (N=1..5), which ARE the source of truth for the v4 layout per Figma.
class CarouselPaywallBody extends StatefulWidget {
  const CarouselPaywallBody({
    super.key,
    required this.state,
    required this.triggerModule,
    required this.triggerAction,
    required this.entrySource,
  });

  final PaywallReady state;
  final String? triggerModule;
  final String? triggerAction;
  final String? entrySource;

  @override
  State<CarouselPaywallBody> createState() => _CarouselPaywallBodyState();
}

/// The Figma v4 coverflow's five bundled app-promo screens (portrait phone
/// screenshots), in left-to-right z-order. Used ONLY as a fallback when the
/// CMS has not seeded `heroMedia` for `vip-carousel-v1`. Order matches Figma
/// nodes 2743:25027..25031.
const _v4LocalCoverflowSources = <String>[
  'assets/paywall/v4-coverflow-1.png',
  'assets/paywall/v4-coverflow-2.png',
  'assets/paywall/v4-coverflow-3.png',
  'assets/paywall/v4-coverflow-4.png',
  'assets/paywall/v4-coverflow-5.png',
];

class _CarouselPaywallBodyState extends State<CarouselPaywallBody> {
  /// Track which CMS URLs we've already asked Flutter to precache in this
  /// widget's lifetime, so we don't re-issue provider resolves on every
  /// rebuild (the bloc's `isPlaying`/tab-swap emissions trigger `build`
  /// frequently). Cache-manager itself already dedupes on the download
  /// side, but avoiding the provider-resolve churn keeps the render loop
  /// clean.
  final Set<String> _precachedUrls = <String>{};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _precacheCmsHeroMedia();
  }

  /// Warm the disk + memory cache for every CMS-provided coverflow image up
  /// front, so tiles 2-5 don't wait for the user to swipe before starting
  /// their download. The `coverflow_carousel` package builds each tile
  /// lazily via `PageView.builder`, so without a precache pass every swipe
  /// used to trigger a fresh network round-trip on cold-boot.
  ///
  /// Bundled `assets/paywall/v4-coverflow-N.png` don't need this — they're
  /// in the app package and decode from disk. CMS URLs are the target.
  void _precacheCmsHeroMedia() {
    final config = widget.state.config;
    final cmsImageUrls = config.heroMedia
        .where((m) => m.mediaType == 'image')
        .map((m) => m.url)
        .where((u) => u.trim().isNotEmpty && !u.startsWith('assets/'));
    for (final url in cmsImageUrls) {
      if (_precachedUrls.add(url)) {
        // Bounded memory decode — see AppNetworkImage.memCacheWidth.
        // 360 × 720 raw px comfortably covers 120 × 240 dp on 3× DPR.
        precacheImage(
          CachedNetworkImageProvider(url, maxWidth: 360, maxHeight: 720),
          context,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = widget.state.config;
    final orderedPlans = List<PaywallPlanDisplay>.of(config.plans)
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    final selected = orderedPlans.isEmpty
        ? null
        : orderedPlans.firstWhere(
            (p) => p.planId == widget.state.selectedPlanId,
            orElse: () => orderedPlans.first,
          );
    // Prefer CMS-provided hero images (URLs from the paywall config's
    // `heroMedia` list, filtered to `mediaType == 'image'` and ordered by
    // `sortOrder`). When the CMS has no images seeded for this paywall,
    // fall back to the bundled Figma-exported promo screens so the coverflow
    // never renders empty. `_coverflowImage` handles both cases (asset path
    // vs http URL) transparently.
    final cmsImages = config.heroMedia
        .where((m) => m.mediaType == 'image')
        .toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    final coverflowSources = cmsImages.isNotEmpty
        ? cmsImages.map((m) => m.url).toList(growable: false)
        : _v4LocalCoverflowSources;

    return ColoredBox(
      key: const Key('paywall-carousel-scaffold'),
      color: AppColors.brand100,
      child: Stack(
        fit: StackFit.expand,
        children: <Widget>[
          // Layer 1: warm orange radial gradient — Figma v4 background.
          // Built from `AppColors.brand{300,200,100}` (existing brand tokens)
          // instead of a bundled PNG so the gradient scales perfectly at any
          // device size and stays in-sync if the brand palette ever shifts.
          const Positioned.fill(
            key: Key('paywall-carousel-bg'),
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment(0.6, -0.6),
                  radius: 1.3,
                  colors: <Color>[
                    AppColors.brand300, // #FE8A02 — hot spot upper-right
                    AppColors.brand200, // #FFE4C5 — mid warm peach
                    AppColors.brand100, // #FFF1E2 — cool peach edge
                  ],
                  stops: <double>[0.0, 0.55, 1.0],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: <Widget>[
                const PaywallTopNav(
                  key: Key('paywall-carousel-nav'),
                  iconColor: AppColors.black,
                  titleColor: AppColors.black,
                  transparentBackground: true,
                ),
                Expanded(
                  key: const Key('paywall-carousel-body'),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.medium),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: <Widget>[
                        const SizedBox(height: AppSpacing.medium),
                        // Coverflow — flex 6. Rendered into a logical
                        // 360-wide box; height comes from
                        // `CoverflowCarousel.totalHeight` (card + gap +
                        // arrow row), so arrows automatically shift with
                        // any card-size change. FittedBox(contain) scales
                        // the whole thing uniformly into the flex-6 slot.
                        Flexible(
                          key: const Key('paywall-carousel-coverflow'),
                          flex: 6,
                          fit: FlexFit.tight,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: AppSpacing.medium,
                            ),
                            child: FittedBox(
                              fit: BoxFit.contain,
                              alignment: Alignment.topCenter,
                              child: SizedBox(
                                width: 360,
                                height: CoverflowCarousel.totalHeight,
                                child: CoverflowCarousel(
                                    images: coverflowSources),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xSmall),
                        // 2×3 named-feature check-list (Wallpaper /
                        // Ringtone / Aarti & Bhajans / Mantras & Stutis /
                        // Whatsapp Status / Rashifal) — flex 4.
                        Flexible(
                          flex: 4,
                          fit: FlexFit.tight,
                          child: LayoutBuilder(
                            builder: (context, constraints) => FittedBox(
                              fit: BoxFit.scaleDown,
                              alignment: Alignment.topCenter,
                              child: SizedBox(
                                width: constraints.maxWidth,
                                child: _NamedFeatureGrid(
                                  key: const Key(
                                      'paywall-carousel-features'),
                                  benefits: config.benefits,
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xSmall),
                        if (selected != null)
                          // Trial section — flex 3.
                          Flexible(
                            flex: 3,
                            fit: FlexFit.tight,
                            child: LayoutBuilder(
                              builder: (context, constraints) => FittedBox(
                                fit: BoxFit.scaleDown,
                                alignment: Alignment.topCenter,
                                child: SizedBox(
                                  width: constraints.maxWidth,
                                  child: PaywallCompactPlanTrialSection(
                                    key: const Key(
                                        'paywall-carousel-trial-section'),
                                    plan: selected,
                                    contentAlignment:
                                        CrossAxisAlignment.center,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        const SizedBox(height: AppSpacing.xSmall),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.medium,
                    AppSpacing.xSmall,
                    AppSpacing.medium,
                    AppSpacing.medium,
                  ),
                  child: PaywallPayNowShimmerButton(
                    label: config.payNowCta,
                    enabled: selected != null,
                    onTap: selected == null
                        ? null
                        : () {
                            context.read<PaymentBloc>().add(
                                  PayNowTapped(
                                    planId: selected.planId,
                                    selectedPlanPeriod: selected.period,
                                    selectedProductId: selected.productId,
                                    displayPrice: selected.displayPriceText,
                                    currency: 'INR',
                                    trialAvailable: selected.trialDays > 0,
                                    trialDays: selected.trialDays,
                                    paymentMethodDisplayed: 'UPI',
                                    triggerModule: widget.triggerModule,
                                    triggerAction: widget.triggerAction,
                                    entrySource: widget.entrySource,
                                  ),
                                );
                          },
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Coverflow — v4 (Figma node `2743:25026`).
///
/// Uses the dedicated `coverflow_carousel` package (`pkg.CoverflowCarousel`)
/// because a hand-rolled PageView + Matrix4 approach could not simultaneously
/// hit all of Figma's requirements: 5 tiles visible, strong 3D perspective,
/// asymmetric skew (left cards face right, right cards face left), proper
/// stacking with center card in front. The package is purpose-built for this
/// exact effect — zero external deps, BSD-3.
///
/// Autoplay: 5s interval, loops (`isInfinite: true`, spec Q12). Press-and-hold
/// pause via an outer `Listener` that toggles a state flag the widget rebuilds
/// on. Arrow taps drive the package's controller.
class CoverflowCarousel extends StatefulWidget {
  const CoverflowCarousel({
    super.key,
    required this.images,
  });

  final List<String> images;

  /// Card width — Figma node `2743:25026` is 113.586dp, rounded to 114.
  static const double cardWidth = 114;

  /// Card height — Figma node `2743:25026` is 155.054dp. Kept as a static so
  /// the parent slot (`totalHeight`) recomputes when this changes.
  static const double cardHeight = 190;

  /// Nav row height — [IconButton] enforces a 44dp min tap target and the
  /// icons themselves fit inside that, so this is fixed for the layout.
  static const double navRowHeight = 44;

  /// Gap between the card's bottom edge and the arrow row.
  static const double cardToNavGap = AppSpacing.xSmall;

  /// Total intrinsic height of the coverflow (card + gap + arrows). Use this
  /// for the parent `SizedBox` that wraps the coverflow inside its
  /// `FittedBox` — that way the arrows stay glued to the card and any tweak
  /// to [cardHeight] shifts everything together.
  static const double totalHeight = cardHeight + cardToNavGap + navRowHeight;

  @override
  State<CoverflowCarousel> createState() => CoverflowCarouselState();
}

class CoverflowCarouselState extends State<CoverflowCarousel> {
  final pkg.CoverflowCarouselController _controller =
      pkg.CoverflowCarouselController();
  int _currentPage = 0;
  bool _pausedByPress = false;

  /// Interval between auto-advances. Exposed so tests can inject a shorter
  /// tick with `FakeAsync`.
  @visibleForTesting
  static const Duration autoplayInterval = Duration(seconds: 5);

  /// Current page index, exposed to tests.
  @visibleForTesting
  int get currentPageForTests => _currentPage;

  /// Whether autoplay is currently active. False while a press is being held.
  @visibleForTesting
  bool get isAutoplayActiveForTests => !_pausedByPress;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.images.isEmpty) {
      return const SizedBox.shrink();
    }
    return Listener(
      key: const Key('paywall-carousel-hold-listener'),
      onPointerDown: (_) {
        if (!_pausedByPress) setState(() => _pausedByPress = true);
      },
      onPointerUp: (_) {
        if (_pausedByPress) setState(() => _pausedByPress = false);
      },
      onPointerCancel: (_) {
        if (_pausedByPress) setState(() => _pausedByPress = false);
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          SizedBox(
            height: CoverflowCarousel.cardHeight,
            child: pkg.CoverflowCarousel.builder(
              key: const Key('paywall-carousel-page-view'),
              itemCount: widget.images.length,
              // Portrait phone-shape tiles — Figma v4 shows 5 promo screens
              // fanned across the frame. Card size lives on
              // `CoverflowCarousel.cardWidth`/`cardHeight` so any tweak
              // stays in sync with the parent slot's `totalHeight`.
              itemWidth: CoverflowCarousel.cardWidth,
              itemHeight: CoverflowCarousel.cardHeight,
              scrollDirection: Axis.horizontal,
              visibleItems: 2, // 2 on each side + centre = 5 tiles visible
              skewAngle: -0.35, // subtle tilt so side tiles remain legible
              perspective: 0.002,
              // Spacing spreads the 5-tile fan so adjacent cards overlap
              // ~25-30% (Figma v4). Center-to-near offset > half-width so
              // near cards aren't stacked directly behind centre.
              nearCardSpacing: 85,
              farCardSpacing: 70,
              isInfinite: true,
              autoplay: !_pausedByPress,
              autoplayInterval: autoplayInterval,
              // MouseRegion-based hover pause blocks the autoplay timer on
              // real touch devices — `_isHovering` gets stuck true after a
              // spurious `onEnter` and `_startAutoplay` early-returns. We
              // implement press-and-hold pause via our outer `Listener`
              // instead, so hover-pause is redundant AND harmful here.
              autoplayPauseOnHover: false,
              controller: _controller,
              // Shadow disabled: images render with BoxFit.contain and may
              // letterbox against the transparent card, so a shadow cast
              // around the full card bounds would frame empty space.
              enableShadow: false,
              cardBorderRadius: BorderRadius.circular(AppRadius.card),
              onPageChanged: (i) {
                if (!mounted) return;
                setState(() => _currentPage = i);
              },
              itemBuilder: (context, index) => ClipRRect(
                borderRadius: BorderRadius.circular(AppRadius.card),
                child: _coverflowImage(widget.images[index]),
              ),
            ),
          ),
          const SizedBox(height: CoverflowCarousel.cardToNavGap),
          SizedBox(
            height: CoverflowCarousel.navRowHeight,
            child: _CarouselNavRow(
              key: const Key('paywall-carousel-nav-row'),
              onLeft: _controller.previous,
              onRight: _controller.next,
            ),
          ),
        ],
      ),
    );
  }
}

/// Picks the right ImageProvider variant for a coverflow source: bundled
/// assets (paths under `assets/`) render via `Image.asset`, anything else
/// goes through [AppNetworkImage] so CMS URLs hit `cached_network_image`'s
/// disk cache + a shimmer placeholder instead of loading raw every time.
///
/// `memCacheWidth/Height` bound the decoded bitmap to ~360×720 raw px —
/// enough to look sharp at 114×155 dp on a 3× DPR device, but a fraction of
/// the RAM (and decode time) a full-res CMS JPEG would consume.
///
/// `BoxFit.fitWidth` + `Alignment.topCenter` scales the image so its width
/// fills the card, keeping the top edge anchored. When the image is taller
/// than the card the overflow spills below and gets clipped by the parent
/// `ClipRRect` (in the coverflow `itemBuilder`) — i.e. it crops from the
/// bottom, not the centre. When the image is shorter than the card the
/// bottom strip stays transparent so the paywall gradient shows through.
Widget _coverflowImage(String source) {
  if (source.startsWith('assets/')) {
    final placeholder = ColoredBox(
      color: AppColors.grey200,
      child: const Center(
        child: Icon(Icons.image, color: AppColors.grey400),
      ),
    );
    return Image.asset(
      source,
      fit: BoxFit.fitWidth,
      alignment: Alignment.topCenter,
      errorBuilder: (context, error, stack) => placeholder,
    );
  }
  return AppNetworkImage(
    url: source,
    fit: BoxFit.fitWidth,
    alignment: Alignment.topCenter,
    memCacheWidth: 360,
    memCacheHeight: 720,
  );
}

/// Coverflow nav row — LEFT chevron + RIGHT chevron only. The pre-TAM-160
/// dot indicator strip was removed to match Figma v4 (node `2743:25026` shows
/// two arrows, no dots).
class _CarouselNavRow extends StatelessWidget {
  const _CarouselNavRow({
    super.key,
    required this.onLeft,
    required this.onRight,
  });

  final VoidCallback onLeft;
  final VoidCallback onRight;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: <Widget>[
        IconButton(
          key: const Key('paywall-carousel-arrow-left'),
          onPressed: onLeft,
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
          icon: const Icon(
            Icons.arrow_back,
            color: AppColors.black,
            size: 22,
          ),
        ),
        const SizedBox(width: 24),
        IconButton(
          key: const Key('paywall-carousel-arrow-right'),
          onPressed: onRight,
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
          icon: const Icon(
            Icons.arrow_forward,
            color: AppColors.black,
            size: 22,
          ),
        ),
      ],
    );
  }
}

/// 2 × 3 named-feature check-list (Figma node inside `2743:25026`). Six named
/// tiles — Wallpaper, Ringtone, Aarti & Bhajans, Mantras & Stutis, Whatsapp
/// Status, Rashifal — derived from `config.benefits` (first six by
/// sortOrder). Falls back to a defaulted list when the CMS returns fewer
/// than 6 benefits (never render a broken grid).
class _NamedFeatureGrid extends StatelessWidget {
  const _NamedFeatureGrid({
    super.key,
    required this.benefits,
  });

  final List<PaywallBenefitDisplay> benefits;

  @override
  Widget build(BuildContext context) {
    final ordered = List<PaywallBenefitDisplay>.of(benefits)
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    final cells = ordered.take(6).toList();
    // Split into rows of 2 columns (Figma v4 shows two columns).
    final rows = <List<PaywallBenefitDisplay>>[];
    const columnsPerRow = 2;
    for (var i = 0; i < cells.length; i += columnsPerRow) {
      rows.add(cells.sublist(
        i,
        (i + columnsPerRow).clamp(0, cells.length),
      ));
    }
    if (rows.isEmpty) return const SizedBox.shrink();

    // Figma inset the whole benefits block from screen edges so the two
    // columns read as a centred group, not an edge-to-edge grid. Combined
    // with the parent's AppSpacing.medium (16) horizontal padding, the
    // grid sits ~40 dp from each screen edge.
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.large,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Padding(
            // Figma has clear breathing room between the "VIP BENEFITS"
            // heading and the first row (~20 dp). 12 was too tight.
            padding: EdgeInsets.only(bottom: 20),
            child: PaywallVipBenefitsHeading(
              textColor: AppColors.black,
            ),
          ),
          for (int r = 0; r < rows.length; r++) ...<Widget>[
            // Row-to-row rhythm — Figma shows ~16-20 dp between rows,
            // the shipped 8 dp read as cramped.
            if (r > 0) const SizedBox(height: 16),
            Row(
              children: <Widget>[
                for (var i = 0; i < columnsPerRow; i++) ...[
                  // Explicit gutter between the two columns. Without this
                  // the shorter labels rely on Expanded's leftover space
                  // to fake a gap, but long labels ("Aarti & Bhajans",
                  // "Mantras & Stutis") end up touching across the seam.
                  if (i > 0) const SizedBox(width: 16),
                  Expanded(
                    child: i < rows[r].length
                        ? _NamedFeatureCell(benefit: rows[r][i])
                        : const SizedBox.shrink(),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _NamedFeatureCell extends StatelessWidget {
  const _NamedFeatureCell({required this.benefit});

  final PaywallBenefitDisplay benefit;

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: Key('paywall-carousel-feature-${benefit.benefitId}'),
      // Horizontal cell padding removed — the grid now owns the inter-column
      // gutter (see _NamedFeatureGrid), so cells shouldn't add their own.
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          // Figma v4 benefit bullet: lighter outlined check (not filled).
          // 22 dp matches Figma's proportion vs the ~15 sp label; the
          // shipped 20 dp read as a touch small.
          Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              color: AppColors.green.withValues(alpha: 0.15),
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.green, width: 1.5),
            ),
            alignment: Alignment.center,
            child: const Icon(
              Icons.check,
              size: 13,
              color: AppColors.green,
            ),
          ),
          const SizedBox(width: 8),
          // Flexible + ellipsis, NOT FittedBox(scaleDown). The old impl
          // silently shrank long labels ("Mantras & Stutis") while short
          // ones ("Ringtone") stayed at their natural size — producing
          // row-to-row size inconsistency that read as broken alignment.
          // Ellipsis keeps every label at the same font size; at extreme
          // accessibility text scales one or two labels may truncate,
          // which is preferable to inconsistent sizing.
          Flexible(
            child: Text(
              benefit.localizedName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontFamily: 'Inter',
                fontSize: 15,
                fontWeight: FontWeight.w500,
                color: AppColors.black,
                letterSpacing: -0.3,
                height: 20 / 15,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
