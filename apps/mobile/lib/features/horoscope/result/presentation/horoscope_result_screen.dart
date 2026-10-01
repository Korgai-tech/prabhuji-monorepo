import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme.dart';
import '../../data/horoscope_models.dart';
import '../../horoscope_providers.dart';
import '../../presentation/horoscope_widgets.dart';
import '../bloc/horoscope_result_bloc.dart';
import '../bloc/horoscope_result_event.dart';
import '../bloc/horoscope_result_state.dart';
import 'horoscope_background.dart';

/// Horoscope Result — the Pro-gated daily reading (Figma `387:2571` + `387:2491`).
///
/// Pushed OVER the TAM-58 shell: the frame's nav component is `visible:false`
/// and the screen carries its own back arrow, so there are no bottom tabs here.
///
/// The step list is DATA. This screen renders `state.currentStep` out of the
/// server's ordered list — it never names a step, counts to 8, or branches on a
/// step id. A step added/reordered server-side just appears.
class HoroscopeResultScreen extends ConsumerStatefulWidget {
  const HoroscopeResultScreen({super.key});

  @override
  ConsumerState<HoroscopeResultScreen> createState() =>
      _HoroscopeResultScreenState();
}

class _HoroscopeResultScreenState extends ConsumerState<HoroscopeResultScreen>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Backgrounding stops speech so narration never continues after the user
    // leaves the flow (AC). The bloc owns the stop; this is just the signal.
    if (state != AppLifecycleState.resumed) {
      context.read<HoroscopeResultBloc>().add(const HoroscopeAppBackgrounded());
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<HoroscopeResultBloc, HoroscopeResultState>(
      listenWhen: (prev, curr) => !prev.finished && curr.finished,
      // Finish → back to the grid (the bloc already stopped speech).
      listener: (context, state) {
        if (context.canPop()) context.pop();
      },
      builder: (context, state) {
        return Scaffold(
          backgroundColor: AppColors.horoscopeVideoBackdrop,
          body: Stack(
            children: [
              _background(context, state),
              SafeArea(
                child: Column(
                  children: [
                    _ResultNav(state: state),
                    Expanded(child: _Body(state: state)),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  /// The video only mounts once we have media (i.e. after a successful fetch) —
  /// an error state keeps the plain dark backdrop rather than a half-loaded one.
  Widget _background(BuildContext context, HoroscopeResultState state) {
    final media = state.result?.media;
    if (media == null) return const SizedBox.shrink();
    return HoroscopeBackground(
      videoUrl: media.backgroundVideoUrl,
      fallbackUrl: media.backgroundStaticFallbackUrl,
      portFactory: ref.read(horoscopeVideoPortFactoryProvider),
      onVideoFailed: () =>
          context.read<HoroscopeResultBloc>().add(const HoroscopeVideoFailed()),
    );
  }
}

/// Back arrow + TTS mute/unmute (node 387:2491). The nav's title, avatar and
/// other trailing icons are `visible:false` in the frame.
class _ResultNav extends StatelessWidget {
  const _ResultNav({required this.state});
  final HoroscopeResultState state;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: AppHoroscope.resultNavHeight,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppHoroscope.navPaddingLeftResult,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _NavIconButton(
              // Back stops TTS (the bloc's close()) and returns to the grid.
              // The bloc emits `horoscope_back_clicked` (Sheet row 107) with
              // the current step context BEFORE the pop.
              itemKey: const ValueKey('horoscope-result-back'),
              asset: 'assets/horoscope/back_arrow.svg',
              tint: AppColors.horoscopeBackArrow,
              semanticLabel: 'Back',
              onTap: () {
                context.read<HoroscopeResultBloc>().add(const HoroscopeBackTapped());
                if (context.canPop()) context.pop();
              },
            ),
            if (state.status == HoroscopeResultStatus.ready) _TtsButton(state: state),
          ],
        ),
      ),
    );
  }
}

/// The mute/unmute control (Figma COMPONENT_SET `TTS` 1173:4508 — `volume`
/// 1173:4507 / `muted` 1173:4506). Both variants shipped, so the icon reflects
/// the real state; no accessible-indicator stand-in was needed.
///
/// When the served locale has no voice the control is still shown but disabled —
/// muting something that can't speak would be a lie.
class _TtsButton extends StatelessWidget {
  const _TtsButton({required this.state});
  final HoroscopeResultState state;

  @override
  Widget build(BuildContext context) {
    final unavailable = state.ttsUnavailable;
    final muted = state.muted || unavailable;
    return Opacity(
      opacity: unavailable ? 0.4 : 1,
      child: _NavIconButton(
        itemKey: const ValueKey('horoscope-result-tts'),
        asset: muted
            ? 'assets/horoscope/tts_muted.svg'
            : 'assets/horoscope/tts_volume.svg',
        tint: AppColors.horoscopeTtsIcon,
        semanticLabel: unavailable
            ? 'Narration unavailable for this language'
            : (state.muted ? 'Unmute narration' : 'Mute narration'),
        onTap: unavailable
            ? null
            : () => context
                .read<HoroscopeResultBloc>()
                .add(const HoroscopeMuteToggled()),
      ),
    );
  }
}

class _NavIconButton extends StatelessWidget {
  const _NavIconButton({
    required this.itemKey,
    required this.asset,
    required this.tint,
    required this.semanticLabel,
    required this.onTap,
  });

  final Key itemKey;
  final String asset;
  final Color tint;
  final String semanticLabel;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticLabel,
      child: InkWell(
        key: itemKey,
        onTap: onTap,
        // The nav icon frames are r=8 (nodes I1173:4536;5186:10373 / 10379).
        borderRadius: BorderRadius.circular(AppRadius.button),
        child: SizedBox(
          width: AppHoroscope.backArrowFrame,
          height: AppHoroscope.backArrowFrame,
          child: Center(
            child: SvgPicture.asset(
              asset,
              width: AppHoroscope.backArrowGlyph,
              height: AppHoroscope.backArrowGlyph,
              colorFilter: ColorFilter.mode(tint, BlendMode.srcIn),
            ),
          ),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.state});
  final HoroscopeResultState state;

  @override
  Widget build(BuildContext context) {
    switch (state.status) {
      case HoroscopeResultStatus.loading:
        return const Center(
          key: ValueKey('horoscope-result-loading'),
          child: CircularProgressIndicator(color: AppColors.brand200),
        );
      case HoroscopeResultStatus.emptyConfig:
      case HoroscopeResultStatus.offline:
      case HoroscopeResultStatus.failure:
        // Keeps the zodiac + date context above the error (AC).
        return Column(
          children: [
            _ZodiacHeader(state: state),
            Expanded(
              child: HoroscopeErrorView(
                onDark: true,
                message: state.errorMessage ?? 'Could not load your horoscope.',
                onRetry: () => context
                    .read<HoroscopeResultBloc>()
                    .add(const HoroscopeResultRetried()),
              ),
            ),
          ],
        );
      case HoroscopeResultStatus.ready:
        return _Ready(state: state);
    }
  }
}

class _Ready extends StatelessWidget {
  const _Ready({required this.state});
  final HoroscopeResultState state;

  @override
  Widget build(BuildContext context) {
    // The design's vertical rhythm, in Figma's own numbers. On the 360×800
    // design device the Expanded resolves to exactly the art's 482 (see
    // AppHoroscope.headerToCardGap); taller phones grow the art region only.
    return Column(
      children: [
        _ZodiacHeader(state: state),
        const SizedBox(height: AppHoroscope.headerToCardGap),
        Expanded(child: _StepCard(state: state)),
        const SizedBox(height: AppHoroscope.cardToCtaGap),
        _ResultCta(state: state),
        const SizedBox(height: AppHoroscope.nextBtnBottom),
      ],
    );
  }
}

/// Zodiac pill (icon + name) over the date (node 387:2610 = pill 32 + gap 10 +
/// date row 32 = 74). Both the pill's fill and its 2px stroke are
/// `visible:false` in the frame — it renders borderless.
class _ZodiacHeader extends StatelessWidget {
  const _ZodiacHeader({required this.state});
  final HoroscopeResultState state;

  @override
  Widget build(BuildContext context) {
    // Prefer the SERVER's date once loaded; the header still renders during
    // loading/error, when we only know the tapped sign.
    final date = state.dateIst.isEmpty ? '' : formatHoroscopeDate(state.dateIst);
    return SizedBox(
      height: AppHoroscope.headerHeight,
      child: Column(
        children: [
          SizedBox(
            height: AppHoroscope.pillHeight,
            child: Row(
              key: const ValueKey('horoscope-result-zodiac'),
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // The SAME monochrome glyph as the grid — tinted cream here.
                ZodiacGlyph(
                  zodiacId: state.zodiacId,
                  size: AppHoroscope.pillIcon,
                  color: AppColors.horoscopeResultZodiacGlyph,
                ),
                const SizedBox(width: AppHoroscope.pillGap),
                Text(
                  _displayName(state),
                  style: AppText.labelLg(
                    color: AppColors.horoscopeResultZodiacName,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppHoroscope.headerGap),
          SizedBox(
            height: AppHoroscope.dateRowHeight,
            child: Center(
              child: Text(
                date,
                key: const ValueKey('horoscope-result-date'),
                style: AppText.bodyMd(color: AppColors.horoscopeResultDate),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// The result payload carries no display name, so derive it from the id we
  /// routed with (capitalized) — the API's typo-free ids make this safe
  /// ("sagittarius" → "Sagittarius", never "Saittarius").
  static String _displayName(HoroscopeResultState state) {
    final id = state.zodiacId;
    if (id.isEmpty) return '';
    return id[0].toUpperCase() + id.substring(1);
  }
}

/// The decorative card art with the step's title pill and body text.
///
/// Layout (node 1162:4407 + 1162:4437 + 1162:4436): the art is full-bleed from
/// y=222; the title pill sits ON its top border (same y, centred); the body is
/// 262 wide, centred, and vertically centred on the art.
class _StepCard extends StatelessWidget {
  const _StepCard({required this.state});
  final HoroscopeResultState state;

  @override
  Widget build(BuildContext context) {
    final step = state.currentStep;
    if (step == null) return const SizedBox.shrink();

    return Stack(
      // A STABLE structural key (the cross-check keys on these). The step id is
      // data, not structure — it must not leak into the render-tree contract.
      key: const ValueKey('horoscope-step-card'),
      alignment: Alignment.topCenter,
      children: [
        Positioned.fill(
          child: SvgPicture.asset(
            // Untinted: the export's own 27 paths are #B8B8B8 — the design colour.
            'assets/horoscope/result_card_frame.svg',
            key: const ValueKey('horoscope-card-art'),
            fit: BoxFit.fill,
          ),
        ),
        Center(
          child: SizedBox(
            width: AppHoroscope.cardTextWidth,
            child: Text(
              step.displayText,
              key: const ValueKey('horoscope-step-text'),
              textAlign: TextAlign.center,
              // contentType drives the scale: a `number` step's value renders at
              // 32px (node 1162:4276 "7"), text/color at 16 (node 1162:4244).
              style: step.contentType == HoroscopeContentType.number
                  ? AppText.horoscopeResultNumber()
                  : AppText.horoscopeResultBody(),
            ),
          ),
        ),
        _StepTitlePill(title: step.title),
      ],
    );
  }
}

class _StepTitlePill extends StatelessWidget {
  const _StepTitlePill({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const ValueKey('horoscope-step-title'),
      height: AppHoroscope.stepPillHeight,
      padding: const EdgeInsets.symmetric(
        horizontal: AppHoroscope.stepPillPaddingH,
      ),
      decoration: BoxDecoration(
        color: AppColors.horoscopeStepPillFill,
        borderRadius: BorderRadius.circular(AppHoroscope.stepPillRadius),
      ),
      // The pill HUGS its label (Figma: 158 for "A good time today" = 134 text +
      // 2×12 padding). `Center(widthFactor: 1)` shrink-wraps horizontally while
      // still centring in the 40px height — a Container `alignment` would make
      // it expand to the full width instead.
      child: Center(
        widthFactor: 1,
        child: Text(title, style: AppText.horoscopeStepTitle()),
      ),
    );
  }
}

/// Next / Finish (node 1162:4461). Next stays visible even with auto-advance
/// armed (PRD §6.7); the final enabled step shows Finish (node 392:2628).
class _ResultCta extends StatelessWidget {
  const _ResultCta({required this.state});
  final HoroscopeResultState state;

  @override
  Widget build(BuildContext context) {
    final finish = state.showFinish;
    return Center(
      child: InkWell(
        key: ValueKey(finish ? 'horoscope-finish' : 'horoscope-next'),
        borderRadius: BorderRadius.circular(AppHoroscope.nextBtnRadius),
        onTap: () => context.read<HoroscopeResultBloc>().add(
              finish ? const HoroscopeFinishTapped() : const HoroscopeNextTapped(),
            ),
        child: Container(
          height: AppHoroscope.nextBtnHeight,
          padding: const EdgeInsets.symmetric(
            horizontal: AppHoroscope.nextBtnPaddingH,
          ),
          decoration: BoxDecoration(
            color: AppColors.horoscopeNextBtnFill,
            borderRadius: BorderRadius.circular(AppHoroscope.nextBtnRadius),
            border: Border.all(
              color: AppColors.horoscopeNextBtnBorder,
              width: AppHoroscope.nextBtnBorder,
            ),
          ),
          // The button HUGS its label: Figma is 55 wide for "Next" (31 text +
          // 2×12 padding) and 62 for "Finish" (38 + 24) — exactly what
          // shrink-wrapping reproduces.
          child: Center(
            widthFactor: 1,
            child: Text(
              finish ? 'Finish' : 'Next',
              style: AppText.horoscopeNextLabel(),
            ),
          ),
        ),
      ),
    );
  }
}
