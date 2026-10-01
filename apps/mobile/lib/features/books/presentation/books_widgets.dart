import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/theme.dart';
import '../../../shared/widgets/app_network_image.dart';
import '../../../shared/widgets/blend_layer.dart';
import '../data/books_models.dart';

/// Asset paths for the module's Figma-exported glyphs. Every one is monochrome
/// and tinted at the call site — never rendered with its exported fill.
/// Provenance: `tools/figma-assets.manifest.json`.
class BooksAssets {
  BooksAssets._();

  static const String _dir = 'assets/books';

  static const String backArrow = '$_dir/back-arrow.svg';
  static const String fontSettings = '$_dir/font-settings.svg';
  static const String chaptersList = '$_dir/chapters-list.svg';
  static const String listenPlay = '$_dir/listen-play.svg';
  static const String listenPause = '$_dir/listen-pause.svg';
  static const String skipBackward = '$_dir/skip-backward.svg';
  static const String skipForward = '$_dir/skip-forward.svg';
  static const String textSize = '$_dir/text-size.svg';

  /// The book-cover paper texture (MULTIPLY layer — see [BookCard]).
  static const String coverTexture = '$_dir/cover-texture.png';

  /// Chapters-drawer header texture (OVERLAY @0.30).
  static const String drawerHeaderTexture = '$_dir/drawer-header-texture.png';

  /// Browse-Categories artwork, exported at the nodes' own 15° rotation.
  static String category(BookCategory c) => switch (c) {
        BookCategory.chalisa => '$_dir/category-chalisa.png',
        BookCategory.aarti => '$_dir/category-aarti.png',
        BookCategory.kavach => '$_dir/category-kavach.png',
        BookCategory.stotram => '$_dir/category-stotram.png',
      };
}

/// A Figma glyph, tinted with a theme token.
class BooksIcon extends StatelessWidget {
  const BooksIcon(
    this.asset, {
    super.key,
    this.size = AppBooks.navGlyph,
    this.color = AppColors.booksReaderNavIcon,
  });

  final String asset;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SvgPicture.asset(
      asset,
      width: size,
      height: size,
      colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
    );
  }
}

/// The book card — ONE widget for all three Figma variants (component set
/// 562:5675: `Book` 120 / `Book-lg` 159 / `sm` 100), which are the same design
/// scaled by `width / 120`. Everything below is derived from [width] via the
/// ratios in [AppBooks], reproducing all three to <0.5px.
///
/// The cover is three stacked layers, exactly as Figma paints them:
///   1. the CMS artwork ([AppNetworkImage]),
///   2. `Texture` — a paper image whose fill blends **MULTIPLY**, and
///   3. `Lights` — a spine gloss (**OVERLAY** @0.20) + a soft light
///      (**SOFT_LIGHT**).
/// Layers 2–3 go through [BlendLayer]; wiring them as plain images would hide
/// the cover completely (see features/books/TOKENS.md).
///
/// NO lock badge is rendered — discovery is free and inviting, and the gate
/// lives on tap (#EXPORT_CRITICAL).
class BookCard extends StatelessWidget {
  const BookCard({
    super.key,
    required this.book,
    required this.width,
    this.onTap,
    this.showTitle = true,
  });

  final BookCardView book;
  final double width;
  final VoidCallback? onTap;

  /// `sm` (drawer header) hides the title — its `Frame 34100` is `visible:false`
  /// (node I637:4420;637:4305).
  final bool showTitle;

  double get _scale => width / AppBooks.cardBaseWidth;

  @override
  Widget build(BuildContext context) {
    final coverHeight = width * AppBooks.cardCoverRatio;
    final radius = width * AppBooks.cardRadiusRatio;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: width,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Cover(
              url: book.coverImageUrl,
              width: width,
              height: coverHeight,
              radius: radius,
              scale: _scale,
            ),
            if (showTitle) ...[
              SizedBox(height: width * AppBooks.cardGapRatio),
              Text(
                book.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.booksCardTitle(
                  fontSize: width * AppBooks.cardTitleSizeRatio,
                  lineHeight: width * AppBooks.cardTitleLineRatio,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Cover extends StatelessWidget {
  const _Cover({
    required this.url,
    required this.width,
    required this.height,
    required this.radius,
    required this.scale,
  });

  final String url;
  final double width;
  final double height;
  final double radius;
  final double scale;

  @override
  Widget build(BuildContext context) {
    final borderRadius = BorderRadius.circular(radius);
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppColors.booksCardSurface,
        borderRadius: borderRadius,
        boxShadow: [
          // Node I534:5505;534:5223 effect, scaled from the 120 base.
          BoxShadow(
            color: AppColors.booksCardShadow,
            offset: Offset(
              AppBooks.cardShadowDxRatio * width,
              AppBooks.cardShadowDyRatio * width,
            ),
            blurRadius: AppBooks.cardShadowBlurRatio * width,
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: borderRadius,
        // Figma paints children in listed order — later = on top. Same order here.
        child: Stack(
          fit: StackFit.expand,
          children: [
            AppNetworkImage(url: url, width: width, height: height),
            // 2. Texture — IMAGE fill, blendMode MULTIPLY.
            BlendLayer(
              blendMode: BlendMode.multiply,
              child: Image.asset(
                BooksAssets.coverTexture,
                width: width,
                height: height,
                fit: BoxFit.cover,
              ),
            ),
            // 3a. Lights, fill 1 — linear spine gloss, OVERLAY @0.20.
            const BlendLayer(
              blendMode: BlendMode.overlay,
              opacity: 0.20,
              child: DecoratedBox(
                decoration: BoxDecoration(gradient: AppGradient.bookCoverSpine),
                child: SizedBox.expand(),
              ),
            ),
            // 3b. Lights, fill 2 — radial soft light.
            const BlendLayer(
              blendMode: BlendMode.softLight,
              child: DecoratedBox(
                decoration: BoxDecoration(gradient: AppGradient.bookCoverLight),
                child: SizedBox.expand(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Section header row (node 534:5064) — title + optional "Show all".
class BooksSectionHeader extends StatelessWidget {
  const BooksSectionHeader({
    super.key,
    required this.title,
    this.onShowAll,
    this.showAllKey,
  });

  final String title;

  /// `null` hides the link — Browse Categories + Newly Added both mark their
  /// `Heading 2` frame `visible:false` (nodes 534:5109 / 534:5139).
  final VoidCallback? onShowAll;
  final Key? showAllKey;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: AppBooks.sectionHeaderHeight,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.headingXs(color: AppColors.booksSectionTitle),
            ),
          ),
          if (onShowAll != null)
            GestureDetector(
              key: showAllKey,
              onTap: onShowAll,
              behavior: HitTestBehavior.opaque,
              child: Text(
                'Show all',
                style: AppText.labelMd(color: AppColors.booksShowAll),
              ),
            ),
        ],
      ),
    );
  }
}

/// The module's `Basic Nav` (component 302:4900) — back arrow + title + optional
/// trailing actions. Books reuses the design-system nav rather than Material's
/// AppBar so the 36/44 frames and 20px glyphs stay exact.
class BooksNav extends StatelessWidget {
  const BooksNav({
    super.key,
    this.title = '',
    this.onBack,
    this.actions = const <Widget>[],
  });

  final String title;

  /// `null` renders no leading icon.
  final VoidCallback? onBack;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: AppBooks.navHeight,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppBooks.navPaddingH),
        child: Row(
          children: [
            if (onBack != null)
              GestureDetector(
                key: const ValueKey('books-nav-back'),
                onTap: onBack,
                behavior: HitTestBehavior.opaque,
                child: const SizedBox(
                  width: AppBooks.navLeadingFrame,
                  height: AppBooks.navLeadingFrame,
                  child: Center(
                    child: BooksIcon(
                      BooksAssets.backArrow,
                      color: AppColors.booksReaderNavIcon,
                    ),
                  ),
                ),
              ),
            if (onBack != null) const SizedBox(width: AppSpacing.xSmall),
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.headingXs(color: AppColors.booksReaderNavTitle),
              ),
            ),
            ...actions,
          ],
        ),
      ),
    );
  }
}

/// A 44×44 nav action frame (node I620:3917;5186:10379) — ≥44 tap target (§12).
class BooksNavAction extends StatelessWidget {
  const BooksNavAction({
    super.key,
    required this.asset,
    required this.onTap,
    this.color = AppColors.booksReaderNavIcon,
  });

  final String asset;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: AppBooks.navActionFrame,
        height: AppBooks.navActionFrame,
        child: Center(child: BooksIcon(asset, color: color)),
      ),
    );
  }
}

/// The gradient CTA shared by Listen Audio / Previous / Next / Start Reading
/// (component 315:2813). It HUGS its label, exactly like the Figma instances
/// (Listen 127, Pause 88, Previous 104, Next 79, Start Reading 95).
class BooksGradientButton extends StatelessWidget {
  const BooksGradientButton({
    super.key,
    required this.label,
    required this.onTap,
    this.iconAsset,
    this.iconLeading = true,
    this.enabled = true,
    this.compact = false,
  });

  final String label;

  /// `null` disables the button — used for the Prev/Next end states (q5), which
  /// stay VISIBLE but inert.
  final VoidCallback? onTap;
  final String? iconAsset;
  final bool iconLeading;
  final bool enabled;

  /// `true` → the contents screen's smaller placement (12/16 label, 29 tall).
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final isEnabled = enabled && onTap != null;
    final icon = iconAsset;

    final content = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null && iconLeading) ...[
          BooksIcon(icon, size: AppBooks.buttonGlyph, color: AppColors.booksButtonGlyph),
          const SizedBox(width: AppBooks.buttonGap),
        ],
        Text(
          label,
          style: compact ? AppText.booksCtaSmall() : AppText.booksButtonLabel(),
        ),
        if (icon != null && !iconLeading) ...[
          const SizedBox(width: AppBooks.buttonGap),
          BooksIcon(icon, size: AppBooks.buttonGlyph, color: AppColors.booksButtonGlyph),
        ],
      ],
    );

    return Opacity(
      // Figma pins no disabled variant for this component; the end states are a
      // product rule (q5), so a standard 40% inert treatment is used and logged
      // in the sweep table.
      opacity: isEnabled ? 1.0 : 0.4,
      child: GestureDetector(
        onTap: isEnabled ? onTap : null,
        behavior: HitTestBehavior.opaque,
        child: Container(
          height: compact ? AppBooks.contentsCtaHeight : AppBooks.buttonHeight,
          padding: EdgeInsets.symmetric(
            horizontal: compact ? AppBooks.contentsCtaPaddingH : AppBooks.buttonPaddingH,
            vertical: compact ? AppBooks.contentsCtaPaddingV : AppBooks.buttonPaddingV,
          ),
          decoration: BoxDecoration(
            gradient: AppGradient.ctaLR,
            borderRadius: BorderRadius.circular(AppBooks.buttonRadius),
          ),
          child: Center(widthFactor: 1, child: content),
        ),
      ),
    );
  }
}

/// Calm, branded empty/error/offline block — the module never renders a raw
/// error string or a status code (PRD §9).
class BooksMessage extends StatelessWidget {
  const BooksMessage({
    super.key,
    required this.message,
    this.onRetry,
    this.retryKey,
  });

  final String message;
  final VoidCallback? onRetry;
  final Key? retryKey;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppBooks.screenPadding),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            message,
            textAlign: TextAlign.center,
            style: AppText.bodyMd(color: AppColors.textSecondary),
          ),
          if (onRetry != null) ...[
            const SizedBox(height: AppSpacing.medium),
            BooksGradientButton(
              key: retryKey,
              label: 'Retry',
              onTap: onRetry,
            ),
          ],
        ],
      ),
    );
  }
}
