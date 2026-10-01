import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/theme.dart';
import '../../../shared/widgets/app_network_image.dart';
import '../application/audio_providers.dart';
import '../domain/audio_item.dart';

/// Compact sticky mini-player — visual redesign per
/// [TAM-N mini-player v2](../../../../../specs/TAM-N-mini-player-v2.md).
///
/// **Figma reference**: node `1950:20911` ("Frame 276", 360×74) on the Design
/// page, "Version 2" section. The v2 bar is a vertical cream→peach gradient
/// with four in-flow children in this exact order:
///   1. 50×50 artwork thumb (radius 4)         — node 1950:20912
///   2. 24×24 play/pause glyph, dark grey      — node 1950:20951 (frame; the
///      inner vector 1950:20955 carries the SOLID #3F3F3F fill)
///   3. Title + subtitle column, `Expanded`    — node 1950:20914 (`layoutGrow:1`)
///   4. 20×20 close glyph, dark grey           — node 1950:20972 (x-close instance)
///
/// Wire tokens/gradient/text-styles from [AppColors]/[AppGradient]/[AppText] —
/// no hex literals here; the theme is the ONLY place raw hex is allowed.
///
/// **Functional surface unchanged from TAM-59** — this is a purely visual
/// refresh:
///   - Same public API (`MiniPlayer({super.key, this.onTap})`).
///   - Same widget keys (`mini-player-surface|title|play-pause|close`) — Maestro
///     flows + widget tests hit-detect by these keys.
///   - Same state wiring (`audioControllerProvider` — pause/resume/stop only).
///   - Same `SizedBox.shrink()` early return when `!state.showMiniPlayer`.
///   - Same mount point (`ShellMiniPlayerHost` inside `AppShellScaffold`'s
///     bottom-nav `Column`); no floating overlay, no `Positioned`.
///   - No new tap targets: no skip-prev/next, no scrubber, no dismiss-swipe,
///     no expand-to-full.
///   - No new analytics event: `aarti_mini_player_clicked` still fires from
///     `reopenActivePlayer`; mantras still emits none.
///
/// **Font-scale trap avoidance**: the outer bar uses
/// `constraints: BoxConstraints(minHeight: 74)` — NOT `height: 74` — so the bar
/// grows instead of clipping when the user has Android font scale > 1.0. See
/// the figma-flutter skill Traps table row "Literal `height:` translation
/// around scalable Text" (same defect class as `home_feed_card.dart`'s
/// `_CardHeader` at font scale 1.075+).
///
/// Driven ONLY by [audioControllerProvider] — it holds no audio state of its
/// own, so it can never diverge from the full player (#EXPORT_CRITICAL).
/// Rendered only for active FULL-mode playback (never a preview, never for free
/// users — playback is Pro-gated upstream in TAM-64/66).
class MiniPlayer extends ConsumerWidget {
  const MiniPlayer({super.key, this.onTap});

  /// Tapping the surface reopens the full player for the active item.
  /// [ShellMiniPlayerHost] binds this to the module-appropriate
  /// `reopenActive*Player` (aarti → aarti player, mantras → mantras player;
  /// ringtone/other are no-op).
  final VoidCallback? onTap;

  // Figma node 1950:20911: `constraints: BoxConstraints(minHeight: 74)`, padding
  // 12/12/12/12, itemSpacing 14. `_minHeight` (not `_height`) because it MUST
  // grow with font scale — see the class docstring's font-scale trap note.
  static const double _minHeight = 74;
  static const double _padding = 12;
  static const double _itemSpacing = 14;

  // Figma node 1950:20912: 50×50 artwork frame, cornerRadius 4.
  static const double _artwork = 50;
  static const double _artworkRadius = 4;

  // Figma node 1950:20951: 24×24 play/pause glyph.
  static const double _playGlyph = 24;

  // Figma node 1950:20972: 20×20 close glyph.
  static const double _closeGlyph = 20;

  // WCAG minimum touch target — same 44px used by every player button on the
  // full players and by the TAM-59 mini-player. The glyph sits at its native
  // size inside a 44px hit box.
  static const double _tapTarget = 44;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(audioControllerProvider);
    if (!state.showMiniPlayer) return const SizedBox.shrink();

    final item = state.currentItem!;
    final controller = ref.read(audioControllerProvider.notifier);

    return Material(
      // The gradient is on the Container below, not the Material — the Material
      // stays transparent so the ripple from InkWell renders over the gradient
      // rather than clipping it.
      color: Colors.transparent,
      child: InkWell(
        key: const Key('mini-player-surface'),
        onTap: onTap,
        child: Container(
          // MIN height, never fixed — the bar grows with font scale rather than
          // clipping. Figma frame is 74 high; that becomes the FLOOR.
          constraints: const BoxConstraints(minHeight: _minHeight),
          padding: const EdgeInsets.all(_padding),
          decoration: const BoxDecoration(gradient: AppGradient.miniPlayerV2),
          child: Row(
            mainAxisSize: MainAxisSize.max,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // 1. Artwork thumb (Figma 1950:20912) — 50×50, r=4.
              AppNetworkImage(
                url: item.artworkUrl ?? '',
                width: _artwork,
                height: _artwork,
                borderRadius: BorderRadius.circular(_artworkRadius),
              ),
              const SizedBox(width: _itemSpacing),
              // 2. Play/pause glyph (Figma 1950:20951) — 24dp glyph in a 44dp
              // tap target, tinted dark grey. NO circular background in v2 —
              // the Figma frame's white fill is `visible: false`, so the glyph
              // sits directly on the gradient.
              _GlyphButton(
                key: const Key('mini-player-play-pause'),
                asset: state.playing
                    ? 'assets/audio/pause.svg'
                    : 'assets/audio/play.svg',
                tint: AppColors.miniPlayerV2Glyph,
                tooltip: state.playing ? 'Pause' : 'Play',
                glyphSize: _playGlyph,
                onTap: () =>
                    state.playing ? controller.pause() : controller.resume(),
              ),
              const SizedBox(width: _itemSpacing),
              // 3. Title + subtitle column (Figma 1950:20914, `layoutGrow: 1`).
              // Expanded MUST wrap this — the play + close buttons take their
              // intrinsic width; this column absorbs the rest so long titles
              // ellipsize instead of pushing the close button off-screen.
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      key: const Key('mini-player-title'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.miniPlayerTitle(),
                    ),
                    if (item.subtitle != null && item.subtitle!.isNotEmpty) ...[
                      const SizedBox(height: 2), // Figma itemSpacing (node 1950:20914)
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          Flexible(
                            child: Text(
                              item.subtitle!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppText.miniPlayerSubtitle(),
                            ),
                          ),
                          if (item.source == AudioSource.downloaded) ...[
                            const SizedBox(width: 6),
                            const _MiniPlayerOfflinePill(),
                          ],
                        ],
                      ),
                    ] else if (item.source == AudioSource.downloaded) ...[
                      const SizedBox(height: 2),
                      const _MiniPlayerOfflinePill(),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: _itemSpacing),
              // 4. Close button (Figma 1950:20972) — 20dp glyph in a 44dp tap
              // target, tinted the same dark grey. `close_v2.svg` is the v2
              // stroked X (M15 5L5 15 M5 5L15 15) — visually distinct from the
              // TAM-59 filled `close.svg`, which stays untouched (still used by
              // any consumer that references it).
              _GlyphButton(
                key: const Key('mini-player-close'),
                asset: 'assets/audio/close_v2.svg',
                tint: AppColors.miniPlayerV2Glyph,
                tooltip: 'Close',
                glyphSize: _closeGlyph,
                onTap: controller.stop,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// OFFLINE pill rendered next to the subtitle on downloaded items
/// (Figma `2641:22798` — brand400 pill with a small white download-arrow
/// glyph + "OFFLINE" label in white). Kept private so its geometry doesn't
/// drift from the mini-player's design.
class _MiniPlayerOfflinePill extends StatelessWidget {
  const _MiniPlayerOfflinePill();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Offline',
      child: Container(
        key: const Key('mini-player-offline-pill'),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: AppColors.brand400,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            SvgPicture.asset(
              'assets/downloads/download-avatar.svg',
              width: 12,
              height: 12,
              colorFilter:
                  const ColorFilter.mode(AppColors.white, BlendMode.srcIn),
            ),
            const SizedBox(width: 4),
            Text(
              'OFFLINE',
              style: AppText.labelSm(color: AppColors.white),
            ),
          ],
        ),
      ),
    );
  }
}

/// A [_tapTarget]-square hit box rendering a Figma-exported SVG glyph. Kept
/// private to this file so its geometry (44dp hit box, tinted at the call site)
/// can't drift from the mini-player's design.
class _GlyphButton extends StatelessWidget {
  const _GlyphButton({
    super.key,
    required this.asset,
    required this.tint,
    required this.tooltip,
    required this.onTap,
    required this.glyphSize,
  });

  final String asset;
  final Color tint;
  final String tooltip;
  final VoidCallback onTap;
  final double glyphSize;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkResponse(
        onTap: onTap,
        radius: MiniPlayer._tapTarget / 2,
        child: SizedBox(
          width: MiniPlayer._tapTarget,
          height: MiniPlayer._tapTarget,
          child: Center(
            child: SvgPicture.asset(
              asset,
              width: glyphSize,
              height: glyphSize,
              // srcIn tints monochrome glyphs to the mini-player v2 dark grey
              // regardless of the SVG's exported fill/stroke colour.
              colorFilter: ColorFilter.mode(tint, BlendMode.srcIn),
            ),
          ),
        ),
      ),
    );
  }
}
