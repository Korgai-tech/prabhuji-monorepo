@Tags(['golden'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/books/data/books_models.dart';
import 'package:mobile/features/books/home/presentation/books_home_screen.dart';
import 'package:mobile/features/books/presentation/books_widgets.dart';
import 'package:mobile/features/books/reader/presentation/font_size_overlay.dart';


/// figma-flutter **Phase 6 crop sweep** for TAM-76.
///
/// The skill's "one-pass sign-off" trap: a full-screen side-by-side at
/// fit-to-screen zoom hides 2px drifts, near-miss greys and wrong weights —
/// which is exactly what this module is full of (a 15°-rotated bleed artwork, a
/// hugging gradient CTA, a blended cover). This box has no image-diff tooling
/// (no PIL/ImageMagick), so the CROPS are produced as component goldens rendered
/// at each node's EXACT Figma size, and diffed against the same node exported at
/// `--scale 4` under
/// `specs/evidence/TAM-76/fidelity/figma-refs/components/`.
///
/// Each golden below is 1:1 with a Figma node, so a reviewer compares two images
/// of the same subject at the same scale rather than squinting at a screen.
/// Verdicts: `specs/evidence/TAM-76/fidelity/sweep-table.md`.
///
/// Refresh: `flutter test --update-goldens test/goldens/books_component_sweep_test.dart`.

/// Matches the `--scale 4` used for the Figma node exports under
/// `figma-refs/components/`.
const double _sweepScale = 4.0;

/// The scaled root every sweep golden captures. Capturing the component itself
/// would grab the widget INSIDE the FittedBox — i.e. its unscaled 1x layer —
/// and defeat the whole point of the blow-up.
const Key sweepRoot = ValueKey('sweep-root');

Future<void> _pumpSized(
  WidgetTester tester,
  Widget child, {
  required Size size,
  Color background = AppColors.white,
}) async {
  // `matchesGoldenFile` rasterizes a widget at 1:1 with its LOGICAL size, so a
  // 159×100 card would emit a 159×100 png — too small to eyeball against a
  // 636×400 Figma export, which is precisely the "fit-to-screen zoom hides the
  // defect" trap. The component is therefore laid out at its exact Figma size
  // and then blown up ×[_sweepScale] through a FittedBox, so the golden lands at
  // the SAME pixel dimensions as the `--scale 4` node export. Vectors and text
  // re-raster at the larger size (no interpolation blur), so the crop is a fair
  // like-for-like.
  tester.view.physicalSize = size * _sweepScale;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: Scaffold(
        backgroundColor: background,
        body: Center(
          child: SizedBox(
            key: sweepRoot,
            width: size.width * _sweepScale,
            height: size.height * _sweepScale,
            child: FittedBox(
              fit: BoxFit.fill,
              child: SizedBox(
                width: size.width,
                height: size.height,
                child: child,
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.runAsync(() async {
    for (final el in find.byType(Image).evaluate()) {
      await precacheImage((el.widget as Image).image, el);
    }
  });
  await tester.pumpAndSettle();
}

void main() {
  // Node 534:5112 — 159×100 r8, fill #302722, label at +10/+10, artwork
  // (534:5114) rotated 15° and bleeding off the right edge.
  testWidgets('sweep: category card / Chalisa (534:5112)', (tester) async {
    await _pumpSized(
      tester,
      BooksCategoryCard(
        category: const BookCategoryView(
          category: BookCategory.chalisa,
          title: 'Chalisa',
          itemCount: 5,
        ),
        onTap: () {},
      ),
      size: const Size(
        AppBooks.categoryCardWidth,
        AppBooks.categoryCardHeight,
      ),
    );

    await expectLater(
      find.byKey(sweepRoot),
      matchesGoldenFile('sweep/category_card_chalisa.png'),
    );
  });

  // Node 663:4296 — 127×37, gradient #FC7304→#FE8A02, r8.04, play glyph 16 +
  // 8.04 gap + "Listen Audio" 14/20 w500 #FFFFFF.
  testWidgets('sweep: Listen Audio button (663:4296)', (tester) async {
    await _pumpSized(
      tester,
      Align(
        alignment: Alignment.centerLeft,
        child: BooksGradientButton(
          label: 'Listen Audio',
          iconAsset: BooksAssets.listenPlay,
          onTap: () {},
        ),
      ),
      size: const Size(127, AppBooks.buttonHeight),
      background: AppColors.booksReaderSurface,
    );

    await expectLater(
      find.byKey(sweepRoot),
      matchesGoldenFile('sweep/listen_button.png'),
    );
  });

  // Node 663:4295 — 88×37, the Pause variant.
  testWidgets('sweep: Pause button (663:4295)', (tester) async {
    await _pumpSized(
      tester,
      Align(
        alignment: Alignment.centerLeft,
        child: BooksGradientButton(
          label: 'Pause',
          iconAsset: BooksAssets.listenPause,
          onTap: () {},
        ),
      ),
      size: const Size(88, AppBooks.buttonHeight),
      background: AppColors.booksReaderSurface,
    );

    await expectLater(
      find.byKey(sweepRoot),
      matchesGoldenFile('sweep/pause_button.png'),
    );
  });

  // Node 663:4248 — 104×37, skip-backward glyph LEADING + "Previous".
  testWidgets('sweep: Previous button (663:4248)', (tester) async {
    await _pumpSized(
      tester,
      Align(
        alignment: Alignment.centerLeft,
        child: BooksGradientButton(
          label: 'Previous',
          iconAsset: BooksAssets.skipBackward,
          onTap: () {},
        ),
      ),
      size: const Size(104, AppBooks.buttonHeight),
      background: AppColors.booksReaderSurface,
    );

    await expectLater(
      find.byKey(sweepRoot),
      matchesGoldenFile('sweep/previous_button.png'),
    );
  });

  // Node 663:4298 — 79×37, "Next" + skip-forward glyph TRAILING.
  testWidgets('sweep: Next button (663:4298)', (tester) async {
    await _pumpSized(
      tester,
      Align(
        alignment: Alignment.centerLeft,
        child: BooksGradientButton(
          label: 'Next',
          iconAsset: BooksAssets.skipForward,
          iconLeading: false,
          onTap: () {},
        ),
      ),
      size: const Size(79, AppBooks.buttonHeight),
      background: AppColors.booksReaderSurface,
    );

    await expectLater(
      find.byKey(sweepRoot),
      matchesGoldenFile('sweep/next_button.png'),
    );
  });

  // Node 639:4105 — 95×29, the compact placement, 12/16 label.
  testWidgets('sweep: Start Reading button (639:4105)', (tester) async {
    await _pumpSized(
      tester,
      Align(
        alignment: Alignment.centerLeft,
        child: BooksGradientButton(
          label: 'Start Reading',
          compact: true,
          onTap: () {},
        ),
      ),
      size: const Size(95, AppBooks.contentsCtaHeight),
      background: AppColors.white,
    );

    await expectLater(
      find.byKey(sweepRoot),
      matchesGoldenFile('sweep/start_reading_button.png'),
    );
  });

  // Node 620:3844 — 359×64 panel, bottom corners r16; text-size glyph, slider
  // (track 212×4), value box 51×32 r4. Figma pins the "18px" state.
  testWidgets('sweep: font panel (620:3844)', (tester) async {
    await _pumpSized(
      tester,
      FontSizeOverlay(fontSize: 18, onChanged: (_) {}),
      size: const Size(359, AppBooks.fontPanelHeight),
      background: AppColors.booksReaderSurface,
    );

    await expectLater(
      find.byKey(sweepRoot),
      matchesGoldenFile('sweep/font_panel.png'),
    );
  });

  // The book card's three cover layers (CMS art + MULTIPLY texture + the
  // OVERLAY/SOFT_LIGHT gloss) at the 120 base — node 534:5505. The cover slot is
  // the branded fallback (no network in tests), so this crop verifies the CHROME
  // around it: shadow, radius, texture, gloss, title ramp.
  testWidgets('sweep: book card 120 variant (534:5505)', (tester) async {
    await _pumpSized(
      tester,
      BookCard(
        book: BookCardView(
          contentId: 'major-1',
          contentType: BookContentType.majorBook,
          category: null,
          title: 'Valmiki Ramayan',
          coverImageUrl: '',
          author: 'Valmiki',
          languages: const ['hi'],
          offlineCacheEligible: true,
        ),
        width: AppBooks.cardWidth,
      ),
      size: const Size(AppBooks.cardWidth, 206),
      background: AppColors.brand100,
    );

    await expectLater(
      find.byKey(sweepRoot),
      matchesGoldenFile('sweep/book_card_120.png'),
    );
  });
}
