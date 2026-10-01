import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../core/theme.dart';
import '../../data/status_models.dart';

/// How long the chip stays expanded after the card becomes active before it
/// animates back down to the avatar. Figma has no timing spec; this is long
/// enough to read a username without sitting on the artwork.
const Duration kCreditChipHoldDuration = Duration(seconds: 3);

/// Expand/collapse animation duration.
const Duration kCreditChipAnimationDuration = Duration(milliseconds: 220);

/// The credit chip over a status card's media (Figma `4149:22544`).
///
/// Two states, both 26 dp tall, each HUGGING its content:
///  * **collapsed** — 30 wide, the avatar glyph alone (`4149:22542`);
///  * **expanded** — avatar + creator name + kebab (`4149:22543`). Figma's
///    frame reads 115, but that is the hug width of its placeholder name
///    "user12345"; the real width tracks the real name.
///
/// It expands on its own when the card becomes active, holds for
/// [kCreditChipHoldDuration], then collapses. Tapping the avatar expands it
/// again. The kebab is only reachable while expanded — a collapsed chip has no
/// menu affordance to mis-tap.
///
/// ─────────────────────────────────────────────────────────────────────────
/// THIS WIDGET MUST STAY OUTSIDE THE SHARE `RepaintBoundary`.
///
/// `StatusHeroPreview` wraps its `Stack` in a `RepaintBoundary(key: boundaryKey)`
/// and `StatusShareBloc` screenshots exactly that subtree to build the shared
/// image/video. Anything inside it is burned into every creative the user
/// sends. The chip is therefore mounted by `_StatusCard`, which wraps
/// `StatusHeroPreview` from the OUTSIDE — see `status_home_screen.dart`, and
/// the regression test in `test/features/status/status_credit_chip_test.dart`
/// that asserts it.
///
/// The failure mode is invisible on screen: the chip renders identically either
/// way, and only the exported artwork is wrong. Do not "tidy" this into
/// `StatusHeroPreview`.
/// ─────────────────────────────────────────────────────────────────────────
class StatusCreditChip extends StatefulWidget {
  const StatusCreditChip({
    super.key,
    required this.creator,
    required this.active,
    required this.onMenuTap,
  });

  final StatusCreatorInfo creator;

  /// Whether this chip's card is the one on screen. A card becoming active is
  /// what triggers the auto-expand; an inactive card's chip stays collapsed so
  /// off-screen cards don't run timers.
  final bool active;

  /// Invoked when the kebab is tapped. The caller owns presenting the menu.
  final VoidCallback onMenuTap;

  @override
  State<StatusCreditChip> createState() => _StatusCreditChipState();
}

class _StatusCreditChipState extends State<StatusCreditChip> {
  static const double _height = 26;
  static const double _glyph = 14;
  static const double _kebab = 12;

  /// Outer inset, both ends (Figma: avatar starts at x=8; kebab ends 8 from the
  /// right edge).
  static const double _padding = 8;

  /// Gap either side of the name (Figma: avatar ends 22 → text starts 28; text
  /// ends 89 → kebab starts 95).
  static const double _gap = 6;

  // THE CHIP HUGS ITS CONTENT — it is not a fixed 115 wide.
  //
  // Figma's expanded frame measures 115, but that is the hug width for its
  // placeholder name "user12345" (61 px of text):
  // `8 + 14 + 6 + 61 + 6 + 12 + 8` = 115. Pinning 115 left dead space to the
  // right of the kebab for any shorter name — "Amit" renders ~18 px, so the
  // pill ran ~35 px past its own content. Collapsed hugs to `8 + 14 + 8` = 30.
  // Both widths are asserted in `status_credit_chip_test.dart`.

  /// Ceiling on the name so a long creator name cannot push the chip across the
  /// card. Past this the name ellipsizes.
  static const double _maxNameWidth = 120;

  bool _expanded = false;
  Timer? _collapseTimer;

  @override
  void initState() {
    super.initState();
    if (widget.active) _expandThenCollapse();
  }

  @override
  void didUpdateWidget(StatusCreditChip oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !oldWidget.active) {
      _expandThenCollapse();
    } else if (!widget.active && oldWidget.active) {
      // Swiped away: drop the timer and reset, so returning to this card
      // replays the introduction rather than showing a half-finished state.
      _collapseTimer?.cancel();
      if (_expanded) setState(() => _expanded = false);
    }
  }

  @override
  void dispose() {
    _collapseTimer?.cancel();
    super.dispose();
  }

  void _expandThenCollapse() {
    _collapseTimer?.cancel();
    setState(() => _expanded = true);
    _collapseTimer = Timer(kCreditChipHoldDuration, () {
      if (!mounted) return;
      setState(() => _expanded = false);
    });
  }

  void _onAvatarTap() {
    // Tapping the avatar re-expands and restarts the hold. Tapping it while
    // already expanded is a no-op beyond restarting the timer, which is the
    // forgiving behaviour: it never collapses the chip out from under a user
    // who is reaching for the kebab.
    _expandThenCollapse();
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      key: const Key('status-credit-chip'),
      borderRadius: BorderRadius.circular(_height / 2),
      child: ColoredBox(
        // Same translucent-black treatment as `StatusMuteToggle`, so the two
        // over-media controls read as one family — one shared token.
        color: AppColors.statusOverMediaControl,
        // AnimatedSize, not AnimatedContainer: the expanded width is the Row's
        // INTRINSIC width, so the pill ends exactly where the kebab's trailing
        // padding ends regardless of how long the creator's name is.
        child: AnimatedSize(
          duration: kCreditChipAnimationDuration,
          curve: Curves.easeOutCubic,
          // Grow rightwards from the avatar, which is pinned to the card's
          // top-left corner.
          alignment: Alignment.centerLeft,
          child: SizedBox(
            height: _height,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _Avatar(
                  avatarUrl: widget.creator.avatarUrl,
                  size: _glyph,
                  leftPadding: _padding,
                  // Collapsed, the avatar's own trailing inset closes the pill
                  // at 30 wide; expanded, the 6 dp gap to the name takes over.
                  rightPadding: _expanded ? _gap : _padding,
                  onTap: _onAvatarTap,
                ),
                if (_expanded) ...[
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: _maxNameWidth),
                    child: Text(
                      widget.creator.name,
                      key: const Key('status-credit-chip-name'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      // Fixed size: the chip is a 26 dp pill over artwork and
                      // cannot grow with the system text scale without covering
                      // the deity's face. The name is decorative credit, not
                      // content the user must read.
                      textScaler: TextScaler.noScaling,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        height: 1.2,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                  ),
                  const SizedBox(width: _gap),
                  Semantics(
                    button: true,
                    label: 'Report options',
                    child: InkResponse(
                      key: const Key('status-credit-chip-menu'),
                      // The glyph is only 12 dp; the InkResponse radius gives
                      // the tap a usable target without widening the pill.
                      radius: 16,
                      onTap: widget.onMenuTap,
                      child: const SizedBox(
                        width: _kebab,
                        height: _height,
                        child: Icon(
                          Icons.more_vert_rounded,
                          size: _kebab,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: _padding),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The creator avatar.
///
/// Falls back to `assets/status/avatar_person.svg` — Figma's own `user-01`
/// export, the same glyph `StatusOverlayAvatar` uses for a profile with no
/// photo — whenever the server sends no `avatarUrl` or the image fails to load.
/// That asset is already committed and already in the Figma manifest, so the
/// placeholder costs no new art, no network call and no manifest entry.
///
/// This is the DUMMY AVATAR the house creator ships with. When a real asset is
/// uploaded and `HOUSE_CREATOR_AVATAR_KEY` is set server-side, `avatarUrl`
/// arrives non-null and wins — nothing here changes.
class _Avatar extends StatelessWidget {
  const _Avatar({
    required this.avatarUrl,
    required this.size,
    required this.leftPadding,
    required this.rightPadding,
    required this.onTap,
  });

  final String? avatarUrl;
  final double size;
  final double leftPadding;

  /// Asymmetric on purpose: collapsed, this is the pill's own trailing inset
  /// (8); expanded, it becomes the 6 dp gap to the name.
  final double rightPadding;

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final url = avatarUrl;
    return InkResponse(
      key: const Key('status-credit-chip-avatar'),
      radius: 16,
      onTap: onTap,
      child: Padding(
        padding: EdgeInsets.only(left: leftPadding, right: rightPadding),
        child: SizedBox(
          width: size,
          height: size,
          child: ClipOval(
            child: url == null
                ? _PersonGlyph(size: size)
                : Image.network(
                    url,
                    width: size,
                    height: size,
                    fit: BoxFit.cover,
                    // Decode at the rendered size — a full-resolution avatar
                    // decoded per card is pure waste on a scrolling feed.
                    cacheWidth: (size * MediaQuery.devicePixelRatioOf(context))
                        .round(),
                    // A broken or slow avatar must never break the chip.
                    errorBuilder: (_, _, _) => _PersonGlyph(size: size),
                  ),
          ),
        ),
      ),
    );
  }
}

/// The shared placeholder glyph. Figma's `user-01` export; its `#B8B8B8` stroke
/// is `Colors/Grey/300`, which is exactly the colour the chip's own Figma
/// variables specify for the collapsed avatar — so it renders untinted, the
/// same way `StatusOverlayAvatar` uses it.
class _PersonGlyph extends StatelessWidget {
  const _PersonGlyph({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
        'assets/status/avatar_person.svg',
        width: size,
        height: size,
      );
}
