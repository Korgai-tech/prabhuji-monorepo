import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme.dart';
import '../../../core/user_properties.dart';
import '../../../state/providers.dart';
import '../../paywall/paywall_analytics.dart';
import '../../paywall/presentation/paywall_screen.dart';
import '../data/home_models.dart';
import '../destinations.dart';
import '../home_analytics.dart';

/// 2×2 feature shortcut grid (Figma nodes 285:3508 → 300:4338).
///
/// The four tiles used to be a hardcoded `kHomeShortcuts` const — labels AND
/// order baked into the app. They are CMS content (`GET /home/shortcuts`), so
/// this widget is now DATA-DRIVEN: it renders whatever the server sent, in the
/// server's `sortOrder`, and the screen hides the section when there is nothing
/// to show (the grid is no longer "static chrome that always renders").
///
/// The grid geometry stays 2-column by design (node 300:4338), which is layout,
/// not content.
///
/// Tapping a card opens the module's library page directly — **no paywall on
/// entry** (AC; the module runs its own gate on a premium action). The one
/// exception is a server-authored `pro_paywall` tile, which opens the unified
/// paywall exactly like a `pro_paywall` banner.
class HomeShortcutGrid extends ConsumerWidget {
  const HomeShortcutGrid({super.key, required this.shortcuts});

  final List<HomeShortcutView> shortcuts;

  /// Whether this render is the TAM-174 gradient arm.
  ///
  /// Derived from the DATA, not from a variant flag: the server publishes a
  /// palette to the treatment arm and `null` to everyone else, so "has a theme"
  /// IS the arm. The app holds no cohort logic of its own (#EXPORT_CRITICAL —
  /// the experiment is a server decision the client must not reproduce).
  ///
  /// `any`, not `every`: ops can legitimately be part-way through theming the
  /// catalogue, and one unthemed row must not drag the whole grid back to the
  /// old geometry — that row just renders the control card inside the new grid.
  bool get _gradientArm => shortcuts.any((s) => s.theme != null);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      key: const Key('home-shortcut-grid'),
      padding: const EdgeInsets.only(
        left: AppHome.screenPadding,
        right: AppHome.screenPadding,
        bottom: AppHome.shortcutGridPaddingBottom,
      ),
      child: GridView.count(
        crossAxisCount: AppHome.shortcutColumns,
        // `GridView.count` derives each card's WIDTH from the available space
        // and its HEIGHT from `childAspectRatio` — the card is already fluid,
        // and these constants are a RATIO, never a device-pixel size.
        //
        // The arms lay out DIFFERENTLY, on purpose: each renders its own Figma
        // frame (control 103×117 @ gap 10, gradient 104×94 @ gap 8), so the
        // gradient grid block is ~47 dp shorter at 360 dp. The shorter tile is
        // part of the redesign under test.
        mainAxisSpacing: _gradientArm ? AppHome.shortcutGapGradient : AppHome.shortcutGap,
        crossAxisSpacing: _gradientArm ? AppHome.shortcutGapGradient : AppHome.shortcutGap,
        childAspectRatio: _gradientArm
            ? AppHome.shortcutCardAspect
            : AppHome.shortcutCardWidth / AppHome.shortcutCardHeight,
        shrinkWrap: true,
        padding: EdgeInsets.zero,
        physics: const NeverScrollableScrollPhysics(),
        children: [
          for (final (i, s) in shortcuts.indexed)
            _ShortcutCard(shortcut: s, positionIndex: i),
        ],
      ),
    );
  }
}

class _ShortcutCard extends ConsumerWidget {
  const _ShortcutCard({required this.shortcut, required this.positionIndex});

  final HomeShortcutView shortcut;
  final int positionIndex;

  /// #EXPORT_CRITICAL — the CMS string NEVER becomes a route here. It is handed
  /// to [HomeDestinations.shortcut], which resolves it through the hardcoded
  /// module allowlist; an unresolvable key is a silent no-op (the tile is inert,
  /// not a deep link into somewhere unvetted, and never a crash).
  Future<void> _onTap(BuildContext context, WidgetRef ref) async {
    // Sheet 1 row 32 — `home_widget_clicked`. `widget_id` = CMS shortcut
    // key, `widget_name` = display label. `destination_module` comes from
    // the allowlist resolution below (nullable — an unknown key means the
    // tile is inert but the tap still gets counted).
    final destination = HomeDestinations.shortcut(shortcut);
    unawaited(ref.read(analyticsProvider)?.trackEvent(
          HomeEvents.widgetClicked,
          properties: {
            HomeEventProps.widgetId: shortcut.key,
            HomeEventProps.widgetName: shortcut.label,
            HomeEventProps.destinationModule: destination?.path,
            HomeEventProps.positionIndex: positionIndex,
            // TAM-174 — derived from the DATA, which is the same thing that
            // decided what the user actually saw. There is no variant flag on
            // the wire to read instead (see `HomeShortcutView.theme`).
            HomeEventProps.gridVariant:
                shortcut.theme == null ? 'control' : 'gradient_v1',
          },
        ));
    if (destination == null) return; // unknown/informational → no-op

    // A `pro_paywall` tile IS the paywall (the contract allows one; Phase-1 ships
    // none). Mirrors the pro_paywall BANNER branch: open it directly — there is
    // no other destination to gate on.
    if (!context.mounted) return;
    if (destination.opensPaywall) {
      await context.push(
        '/paywall',
        extra: const PaywallArgs(
          triggerModule: UserPropertyModule.home,
          triggerAction: PaywallTriggerAction.upgradeCta,
          entrySource: PaywallEntrySource.home,
        ),
      );
    } else {
      // Shell-branch destinations (`/status`, `/horoscope`) go via `context.go`
      // so the bottom nav switches tabs; module-full-screens push over shell.
      openHomeDestinationPath(context, destination.path!);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = shortcut.theme;
    return GestureDetector(
      key: Key('home-shortcut-${shortcut.key}'),
      behavior: HitTestBehavior.opaque,
      onTap: () => unawaited(_onTap(context, ref)),
      child: theme == null
          ? _ControlCardSurface(shortcut: shortcut)
          : _ThemedCardSurface(shortcut: shortcut, theme: theme),
    );
  }
}

/// TAM-174 gradient arm — Figma node 3760:28483 ("Colored Feature Cards").
///
/// EVERY dimension is derived from the card's MEASURED width via the
/// `AppHome.shortcut*Ratio` constants; nothing here is a device-pixel literal.
/// That is the point: `GridView` sizes the card from the available space, so a
/// tile hard-coded at the 104 dp design width would be right on a 360 dp frame
/// and wrong on every other device.
///
/// The interior is a `Column`, not a `Stack`. Figma gives the label band
/// `shrink-0` (natural height) and the art band `flex-[1_0_0]`, and reproducing
/// that is what lets the tile survive a two-line label or a large `textScaler`:
/// the label takes what it needs and the artwork absorbs the rest, instead of
/// overflowing. The control card overlays its label on the art; this one does
/// not overlay at all.
class _ThemedCardSurface extends StatelessWidget {
  const _ThemedCardSurface({required this.shortcut, required this.theme});

  final HomeShortcutView shortcut;
  final HomeShortcutThemeView theme;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final w = constraints.maxWidth;
        // Type is the one thing not left to scale freely — see
        // `AppHome.shortcutLabelScaleMin/Max`.
        final typeScale = (w / AppHome.shortcutBaseWidth)
            .clamp(AppHome.shortcutLabelScaleMin, AppHome.shortcutLabelScaleMax);

        return Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(w * AppHome.shortcutRadiusRatio),
            // Stops ride in as ALIGNMENTS — `set_wallpaper` is authored with a
            // stop at 1.4734, which `LinearGradient.stops` asserts against.
            gradient: theme.gradient,
            // ONE shadow (node 3760:28483). The control card also paints the
            // heavier grid-block shadow AND a 1 px gradient stroke; this design
            // has neither.
            boxShadow: const [
              BoxShadow(
                color: AppColors.homeShortcutShadow,
                offset: Offset(0, 1),
                blurRadius: AppHome.shortcutGradientShadowBlur,
              ),
            ],
          ),
          child: Column(
            children: [
              Padding(
                padding: EdgeInsets.only(
                  top: w * AppHome.shortcutLabelPadTopRatio,
                  left: w * AppHome.shortcutLabelPadXRatio,
                  right: w * AppHome.shortcutLabelPadXRatio,
                ),
                child: Text(
                  shortcut.label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.homeShortcutLabelThemed(
                    fontSize:
                        AppHome.shortcutBaseWidth * AppHome.shortcutLabelSizeRatio * typeScale,
                    lineHeight:
                        AppHome.shortcutBaseWidth * AppHome.shortcutLabelLineRatio * typeScale,
                    color: theme.labelColor,
                  ),
                ),
              ),
              // `Expanded` mirrors Figma's `flex-1`: the artwork absorbs
              // whatever the label leaves, so a taller label eats into the art
              // rather than overflowing the card.
              // No padding here: the CMS asset is an export of Figma's whole
              // 104×68 art band, so the icon's inset inside that band — and the
              // band's own 4 dp top padding — are already baked into the image's
              // transparent margins. Adding them again would inset twice.
              Expanded(child: _ThemedArt(shortcut: shortcut)),
            ],
          ),
        );
      },
    );
  }
}

/// The themed tile's artwork.
///
/// The CMS asset is an export of Figma's ART BAND (node `3760:28487` and
/// siblings — 104×68, the full card width), NOT the 70×70 illustration inside
/// it. That distinction decides this whole widget: the band export already
/// carries the illustration's horizontal inset, its 4 dp top offset, and the
/// bottom clip, all as transparent margin. So the right thing to do is let it
/// FILL the band and change nothing else — any padding or square-sizing added
/// here would apply those offsets a second time and shrink the art.
///
/// `BoxFit.contain` rather than `fill`: the asset and the band share an aspect
/// ratio at the design size, so `contain` is a no-op there — but when a
/// two-line label or a large `textScaler` eats into the band, `contain` shrinks
/// the art proportionally instead of squashing it.
class _ThemedArt extends StatelessWidget {
  const _ThemedArt({required this.shortcut});

  final HomeShortcutView shortcut;

  @override
  Widget build(BuildContext context) {
    final url = shortcut.iconUrl?.trim() ?? '';
    if (url.isEmpty) return const SizedBox.shrink();

    return Image.network(
      url,
      fit: BoxFit.contain,
      // BOTTOM-anchored, matching the control card's own `bottomCenter` — the
      // artwork's baseline sits on the card's bottom edge in both arms.
      //
      // This works because of how the asset is cut: the band export carries a
      // 12 px (4 dp @3x) transparent margin at the TOP and exactly ZERO at the
      // bottom — Figma clips the illustration flush there — so aligning the
      // file's bottom edge aligns the visible art with it. Measured on all six
      // tiles; an asset re-exported with bottom padding would float instead,
      // and that is the thing to check if it ever looks wrong.
      //
      // At this card aspect the band and the asset match exactly (104×68), so
      // there is normally no slack to place and the alignment is a no-op. It
      // earns its keep in the two states that DO produce slack: a two-line
      // label, and a large `textScaler` — in both the art shrinks and stays
      // planted on the bottom edge instead of drifting up the card.
      alignment: Alignment.bottomCenter,
      width: double.infinity,
      loadingBuilder: (context, child, progress) =>
          progress == null ? child : const SizedBox.expand(),
      // Same degrade-to-labelled-tile contract as the control card.
      errorBuilder: (_, _, _) => const SizedBox.shrink(),
    );
  }
}

/// The CONTROL arm — byte-identical to what shipped before TAM-174.
///
/// Left untouched on purpose. A control arm that drifted, even cosmetically,
/// would make the experiment measure the drift alongside the treatment.
class _ControlCardSurface extends StatelessWidget {
  const _ControlCardSurface({required this.shortcut});

  final HomeShortcutView shortcut;

  @override
  Widget build(BuildContext context) {
    return Container(
        // `clipsContent: true` on node 767:6580 — load-bearing, not cosmetic:
        // the artwork deliberately overflows the padding box (see below).
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppHome.shortcutCardRadius),
          gradient: AppGradient.homeShortcutCard,
          // TWO shadows, because the design has two. The card (node 767:6580)
          // carries its own #000000 @0.05 (0,+1) blur 2, and the GRID BLOCK that
          // holds all four (node 285:3508) carries a second, heavier #000000
          // @0.25 (0,+3) blur 4. That block frame has NO fill, so Figma derives
          // its shadow from the children's alpha — i.e. it renders around each
          // card's silhouette, which is exactly what painting it per-card does.
          // `showShadowBehindNode: false` is a no-op here: the cards are opaque,
          // so nothing shows through them anyway.
          boxShadow: const [
            BoxShadow(
              color: AppColors.homeShortcutShadow,
              offset: Offset(0, 1),
              blurRadius: 2,
            ),
            BoxShadow(
              color: AppColors.homeShortcutGridShadow,
              offset: Offset(0, 3),
              blurRadius: 4,
            ),
          ],
        ),
        // The card's 1px border is itself a GRADIENT (node 767:6580 stroke), and
        // Flutter's Border takes a flat Color — so it is painted as a gradient
        // layer with the fill inset by the stroke width, which is exactly how
        // Figma composites a gradient stroke.
        child: CustomPaint(
          painter: const _GradientBorderPainter(),
          // New (Figma frame 2813:8663) card layout: image is bottom-anchored and
          // FILLS the whole card via BoxFit.contain + alignment.bottomCenter; the
          // label sits at the top over the transparent upper portion of the icon.
          // A label of 1 or 2 lines is drawn at its NATURAL height — the card's
          // outer height stays 117 dp regardless, so no shift when copy changes.
          // Two lines are the observed maximum ("Set Status" / "Set Ringtone");
          // `maxLines: 2 + ellipsis` is a defensive cap for a longer CMS label.
          // Assets are authored with a transparent top so the card gradient still
          // shows through behind the label — the multiply-blend workaround from
          // the previous design is intentionally gone.
          child: Stack(
            clipBehavior: Clip.antiAlias,
            children: [
              Positioned.fill(child: _ShortcutArt(shortcut: shortcut)),
              Positioned(
                top: AppHome.shortcutCardPadding,
                left: AppHome.shortcutCardPadding,
                right: AppHome.shortcutCardPadding,
                child: Text(
                  shortcut.label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.homeShortcutLabel(),
                ),
              ),
            ],
          ),
        ),
    );
  }
}

/// TAM-132 — CMS-only icon rendering. Two rungs:
///   1. `iconUrl` (CMS-served) via [Image.network].
///   2. On error / null / empty URL, [SizedBox.shrink] — the tile still
///      renders (label + tappable) rather than crashing (#EXPORT_CRITICAL).
///
/// The bundled-fallback rung was removed once ops committed to keeping every
/// row's `iconUrl` populated via the CMS. Dropping the bundled PNGs shaves
/// ~500 KB from the APK and gives the CMS a single source of truth — the
/// trade-off is that any row with `iconUrl = null` (or an unreachable URL)
/// renders as a labelled tappable tile with no icon art, which is still safe
/// but visibly incomplete. Ops is responsible for keeping the six rows
/// URL-populated per environment.
///
/// Layout contract (Figma frame 2813:8663): image FILLS the parent card and is
/// bottom-anchored via `BoxFit.contain` + `Alignment.bottomCenter`. Assets are
/// authored with transparent top padding, so the icon lands at the tile's
/// bottom edge while the card gradient shows through behind the label at the
/// top.
class _ShortcutArt extends StatelessWidget {
  const _ShortcutArt({required this.shortcut});

  final HomeShortcutView shortcut;

  @override
  Widget build(BuildContext context) {
    final url = shortcut.iconUrl?.trim() ?? '';
    if (url.isEmpty) return const SizedBox.shrink();

    return Image.network(
      url,
      fit: BoxFit.contain,
      alignment: Alignment.bottomCenter,
      // Deliberately no Shimmer — the label is already painted so an empty box
      // is a fine placeholder, and the diff stays small.
      loadingBuilder: (context, child, progress) {
        if (progress == null) return child;
        return const SizedBox.expand();
      },
      // On network failure, degrade to a labelled tappable tile — no fallback
      // asset shipped anymore.
      errorBuilder: (_, _, _) => const SizedBox.shrink(),
    );
  }
}

/// Paints the card's 1px gradient stroke (node 767:6580 stroke: #FC7304→#964402
/// @0.6, bottom-right→top-left).
class _GradientBorderPainter extends CustomPainter {
  const _GradientBorderPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final rrect = RRect.fromRectAndRadius(
      rect.deflate(AppHome.shortcutCardBorder / 2),
      const Radius.circular(AppHome.shortcutCardRadius),
    );
    canvas.drawRRect(
      rrect,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = AppHome.shortcutCardBorder
        ..shader = AppGradient.homeShortcutCardBorder.createShader(rect),
    );
  }

  @override
  bool shouldRepaint(covariant _GradientBorderPainter oldDelegate) => false;
}
