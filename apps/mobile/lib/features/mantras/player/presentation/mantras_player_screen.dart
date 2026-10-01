import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../core/analytics.dart';
import '../../../../core/theme.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../../../state/providers.dart';
import '../../../audio/application/audio_controller.dart';
import '../../../audio/application/audio_providers.dart';
import '../../../audio/domain/audio_item.dart';
import '../../../downloads/domain/content_type.dart';
import '../../../downloads/presentation/widgets/download_button.dart';
import '../../data/mantras_models.dart';
import '../../mantras_analytics.dart';
import '../../mantras_providers.dart';
import '../../mantras_routes.dart';
import '../../presentation/mantras_bottom_sheets.dart';
import '../bloc/mantras_player_audio_port.dart';
import '../bloc/mantras_player_bloc.dart';
import '../bloc/mantras_player_event.dart';
import '../bloc/mantras_player_state.dart';

/// Full Mantra player (Figma 438:3074). Pro-only — reached only from a tap by a
/// Pro user or a genuine post-purchase; autoplays on entry, never on module
/// entry. Artwork card / title / singer / scrollable Devanagari mantra text
/// (line breaks preserved, never truncated) / like+count / share+count /
/// prev-play/pause-next (NO 10s seek) / repeat-counter pill / Next-track card.
/// Transport reads the shared TAM-59 engine; the [MantrasPlayerBloc] owns the
/// queue + detail + engagement + repeat counter.
class MantrasPlayerScreen extends ConsumerStatefulWidget {
  const MantrasPlayerScreen({super.key, required this.args});
  final MantrasPlayerArgs args;

  @override
  ConsumerState<MantrasPlayerScreen> createState() =>
      _MantrasPlayerScreenState();
}

class _MantrasPlayerScreenState extends ConsumerState<MantrasPlayerScreen>
    with WidgetsBindingObserver {
  late final MantrasPlayerBloc _bloc;
  StreamSubscription<AudioTrackCompletion>? _completionSub;

  @override
  void initState() {
    super.initState();
    // Scoped app-lifecycle observer for Sheet 1 row 84
    // (`mantras_audio_app_state_changed`). The observer is registered ONLY
    // while the full player screen is mounted, so background/foreground
    // toggles on other screens don't fire a mantras-scoped event.
    WidgetsBinding.instance.addObserver(this);
    final controller = ref.read(audioControllerProvider.notifier);
    _bloc = MantrasPlayerBloc(
      repository: ref.read(mantrasRepositoryProvider),
      audioPort: ControllerMantrasPlayerAudioPort(controller),
      shareService: ref.read(shareServiceProvider),
      analytics: ref.read(analyticsProvider),
    )..add(MantrasPlayerOpened(widget.args));
    // TAM-130: subscribe to the shared engine's completion stream instead
    // of deriving completion from Riverpod state deltas — the old check
    // (prev.playing && !next.playing && position >= duration) raced against
    // just_audio's emit order and silently dropped repetitions, so the jaap
    // loop stopped after one play. Filter to the mantras module so an aarti
    // completion arriving while a mantras route is still mounted underneath
    // a pushed aarti player doesn't flip THIS bloc.
    _completionSub = controller.completionStream.listen((c) {
      if (c.item.module != AudioModule.mantras) return;
      _bloc.add(MantrasPlayerTrackCompleted(
        itemId: c.item.id,
        repetitionNumber: c.repetitionNumber,
        repeatTarget: c.repeatTarget,
        targetReached: c.targetReached,
        playheadPosition: c.playheadPosition,
      ));
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_completionSub?.cancel());
    _completionSub = null;
    _bloc.close();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Map Flutter's lifecycle enum onto Sheet 1 row 84's `app_state` enum:
    // `foreground` | `background` | `terminated`. `inactive` (transient
    // transition on iOS / OEM overlays) is coalesced into `background` —
    // the funnel doesn't need a distinct signal for it.
    final wire = switch (state) {
      AppLifecycleState.resumed => 'foreground',
      AppLifecycleState.paused ||
      AppLifecycleState.inactive ||
      AppLifecycleState.hidden =>
        'background',
      AppLifecycleState.detached => 'terminated',
    };
    _bloc.add(MantrasPlayerAppStateChanged(wire));
  }

  @override
  Widget build(BuildContext context) {
    // Bridge the engine → bloc for audio-error only. Track completion goes
    // through `controller.completionStream` in initState — see the note there
    // for why the derived-state check was removed (TAM-130).
    ref.listen<AudioPlaybackState>(audioControllerProvider, (prev, next) {
      if (next.hasError && !(prev?.hasError ?? false)) {
        _bloc.add(const MantrasPlayerAudioErrored());
      }
    });

    return BlocProvider<MantrasPlayerBloc>.value(
      value: _bloc,
      child: Scaffold(
        key: const Key('mantras-player-screen'),
        backgroundColor: AppColors.cardSurface,
        body: SafeArea(
          child: BlocBuilder<MantrasPlayerBloc, MantrasPlayerState>(
            builder: (context, state) => switch (state) {
              MantrasPlayerLoading() =>
                const Center(child: CircularProgressIndicator()),
              MantrasPlayerGatedRestore() => _RestorePrompt(
                  onBack: () => Navigator.of(context).maybePop(),
                ),
              MantrasPlayerErrorState(:final message) => _PlayerError(
                  message: message,
                  onRetry: () => _bloc.add(const MantrasPlayerRetryRequested()),
                ),
              MantrasPlayerReady() => _PlayerBody(state: state),
            },
          ),
        ),
      ),
    );
  }
}

class _PlayerBody extends ConsumerWidget {
  const _PlayerBody({required this.state});
  final MantrasPlayerReady state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = state.detail;
    final audio = detail.audio;
    // Layout goal: player + next-card ANCHORED to the bottom, artwork fixed at
    // the top, and the mantra text takes ALL the space between. Short text →
    // vertically centered in the flex area; long text → scrolls inside the
    // flex area WITHOUT the artwork/player/next-card scrolling off screen.
    return Column(
      children: [
        _TopBar(
          repeatCompleted: state.repeatCompleted,
          repeatTarget: state.repeatTarget,
          onCounter: () => _openCounter(context, ref),
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppMantras.screenPadding,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _ArtworkBlock(audio: audio),
                const SizedBox(height: AppMantras.mantraTextGap),
                // Sacred Devanagari text — line breaks preserved, NEVER
                // truncated (§6.8 / DP02/DP04). Centered when it fits the flex
                // area; scrolls internally when it doesn't. Only THIS block
                // scrolls — the player pill + next card below stay pinned.
                Expanded(
                  child: LayoutBuilder(
                    builder: (context, constraints) => SingleChildScrollView(
                      physics: const BouncingScrollPhysics(),
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          minHeight: constraints.maxHeight,
                        ),
                        child: Center(
                          child: Text(
                            detail.mantraText,
                            key: const Key('mantras-player-text'),
                            textAlign: TextAlign.center,
                            style:
                                AppText.bodyMd(color: AppColors.mantraText)
                                    .copyWith(
                              // Tightest we can go without Devanagari
                              // top-diacritics (matra marks) clipping.
                              height: 1.1,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: AppMantras.sectionGap),
                _EngagementRow(state: state),
                const SizedBox(height: AppSpacing.large),
                _Controls(state: state),
                if (state.nextItem != null) ...[
                  const SizedBox(height: AppSpacing.large),
                  _NextCard(
                    next: state.nextItem!,
                    onCardTap: () => _openPlaylist(context, ref),
                    onPlayNext: () {
                      // Sheet 1 row 83 — `mantras_playlist_play_clicked`.
                      // The Next-track card's play circle IS the "play from
                      // playlist" affordance surfaced on the player (the
                      // playlist sheet itself is select-on-tap with no
                      // play button, so this is the only user tap that
                      // matches row 83's trigger).
                      unawaited(ref.read(analyticsProvider)?.trackEvent(
                            MantrasEvents.playlistPlayClicked,
                            properties: {
                              MantrasEventProps.audioId: state.nextItem!.id,
                              MantrasEventProps.sourceAudioId:
                                  state.detail.audio.id,
                            },
                          ));
                      context
                          .read<MantrasPlayerBloc>()
                          .add(const MantrasPlayerNextRequested());
                    },
                  ),
                ],
                const SizedBox(height: AppSpacing.large),
              ],
            ),
          ),
        ),
      ],
    );
  }

  /// Sheet 1 rows 76, 77, 80 — the counter journey fires as a triplet:
  ///  * `counter_clicked` when the pill is tapped;
  ///  * `counter_sheet_viewed` once the sheet is on screen;
  ///  * `counter_sheet_closed` on dismiss with `close_method` = `select`
  ///    when the user chose a target, `swipe` on a drag/back-tap dismiss.
  /// Row 78 (`repeat_count_selected`) still fires from the bloc when a
  /// target is picked.
  Future<void> _openCounter(BuildContext context, WidgetRef ref) async {
    final bloc = context.read<MantrasPlayerBloc>();
    final audioId = state.detail.audio.id;
    final analytics = ref.read(analyticsProvider);
    unawaited(analytics?.trackEvent(
      MantrasEvents.counterClicked,
      properties: {
        MantrasEventProps.audioId: audioId,
        MantrasEventProps.currentRepeatTarget: state.repeatTarget,
      },
    ));
    unawaited(analytics?.trackEvent(
      MantrasEvents.counterSheetViewed,
      properties: {
        MantrasEventProps.audioId: audioId,
        MantrasEventProps.currentRepeatTarget: state.repeatTarget,
      },
    ));
    final target = await showMantrasCounterSheet(
      context,
      currentTarget: state.repeatTarget,
      // Server-owned option list — never a client constant.
      targets: state.availableTargets,
    );
    unawaited(analytics?.trackEvent(
      MantrasEvents.counterSheetClosed,
      properties: {
        MantrasEventProps.audioId: audioId,
        MantrasEventProps.repeatTarget: target ?? state.repeatTarget,
        MantrasEventProps.closeMethod: target == null ? 'swipe' : 'select',
      },
    ));
    if (target != null) {
      bloc.add(MantrasPlayerCounterTargetSelected(target));
    }
  }

  /// Sheet 1 row 81 — `mantras_playlist_opened`. Carries the anchor audio +
  /// the queue size.
  Future<void> _openPlaylist(BuildContext context, WidgetRef ref) async {
    final bloc = context.read<MantrasPlayerBloc>();
    final audioId = state.detail.audio.id;
    unawaited(ref.read(analyticsProvider)?.trackEvent(
      MantrasEvents.playlistOpened,
      properties: {
        MantrasEventProps.sourceAudioId: audioId,
        MantrasEventProps.playlistSize: state.queue.length,
      },
    ));
    final index = await showMantrasPlaylistSheet(
      context,
      items: state.queue,
      currentIndex: state.index,
    );
    if (index != null && index != state.index) {
      bloc.add(MantrasPlayerPlaylistItemSelected(index));
    }
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.repeatCompleted,
    required this.repeatTarget,
    required this.onCounter,
  });

  final int repeatCompleted;
  final int repeatTarget;
  final VoidCallback onCounter;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: AppNav.height,
      child: Row(
        children: [
          const SizedBox(width: AppSpacing.xSmall),
          InkResponse(
            key: const Key('mantras-player-back'),
            radius: 24,
            onTap: () => Navigator.of(context).maybePop(),
            child: SizedBox(
              width: AppMantras.backArrowFrame,
              height: AppMantras.backArrowFrame,
              child: Center(
                child: SvgPicture.asset(
                  'assets/mantras/back-arrow.svg',
                  width: AppMantras.backArrowGlyph,
                  height: AppMantras.backArrowGlyph,
                  colorFilter: const ColorFilter.mode(
                    AppColors.aartiBackArrow,
                    BlendMode.srcIn,
                  ),
                ),
              ),
            ),
          ),
          const Spacer(),
          _CounterPill(
            completed: repeatCompleted,
            target: repeatTarget,
            onTap: onCounter,
          ),
          const SizedBox(width: AppMantras.screenPadding),
        ],
      ),
    );
  }
}

/// Repeat-counter pill (Figma 457:3419) — repeat glyph + "N/target times".
class _CounterPill extends StatelessWidget {
  const _CounterPill({
    required this.completed,
    required this.target,
    required this.onTap,
  });

  final int completed;
  final int target;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: const Key('mantras-player-counter-pill'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        height: AppMantras.counterPillHeight,
        padding: const EdgeInsets.symmetric(
          horizontal: AppMantras.counterPillPaddingH,
        ),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppMantras.counterPillRadius),
          border: Border.all(
            color: AppColors.mantraCounterPillBorder,
            width: AppMantras.counterPillBorder,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SvgPicture.asset(
              'assets/mantras/counter-repeat.svg',
              width: AppMantras.counterPillIcon,
              height: AppMantras.counterPillIcon,
            ),
            const SizedBox(width: AppMantras.counterPillGap),
            Text(
              '$completed/$target times',
              style: AppText.labelSm(color: AppColors.mantraCounterPillText),
            ),
          ],
        ),
      ),
    );
  }
}

/// Peach artwork block (Figma 438:3076) — 150 square cover + title/singer.
class _ArtworkBlock extends StatelessWidget {
  const _ArtworkBlock({required this.audio});
  final MantraAudio audio;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: AppMantras.artworkBlockHeight,
      decoration: BoxDecoration(
        color: AppColors.mantraArtworkBlock,
        borderRadius: BorderRadius.circular(AppMantras.artworkBlockRadius),
      ),
      clipBehavior: Clip.antiAlias,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          AppNetworkImage(
            key: const Key('mantras-player-cover'),
            url: audio.artworkUrl,
            width: AppMantras.artworkCover,
            height: AppMantras.artworkCover,
          ),
          const SizedBox(width: AppMantras.artworkGap),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  audio.title,
                  key: const Key('mantras-player-title'),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.headingXs(color: AppColors.aartiPlayerText),
                ),
                if ((audio.singerName ?? '').isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.xxxSmall),
                    child: Text.rich(
                      key: const Key('mantras-player-singer'),
                      TextSpan(children: [
                        TextSpan(
                          text: 'Singer  ',
                          style: AppText.bodySm(color: AppColors.aartiPlayerText),
                        ),
                        TextSpan(
                          text: audio.singerName,
                          style:
                              AppText.labelMd(color: AppColors.aartiPlayerText),
                        ),
                      ]),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.medium),
        ],
      ),
    );
  }
}

class _EngagementRow extends StatelessWidget {
  const _EngagementRow({required this.state});
  final MantrasPlayerReady state;

  @override
  Widget build(BuildContext context) {
    final bloc = context.read<MantrasPlayerBloc>();
    // Icon-above-label pairs, evenly spaced. Prior layout put the glyph beside
    // the text and wrapped each button in `Flexible`, which made the two blocks
    // render off-centre when the counts had different digit widths.
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        Flexible(
          child: _EngagementButton(
            buttonKey: const Key('mantras-player-like'),
            asset: 'assets/mantras/like.svg',
            tint: state.liked
                ? AppColors.aartiLikeActive
                : AppColors.aartiEngagementIcon,
            label: '${state.likeCount} likes',
            onTap: () => bloc.add(const MantrasPlayerLikeToggled()),
          ),
        ),
        // TAM-125 — Download control in the mantra player's engagement row
        // (Figma `2632:21299` shows Heart · Download · Share).
        Flexible(
          child: DownloadButton(
            key: Key('mantras-player-download-${state.detail.audio.id}'),
            contentId: state.detail.audio.id,
            contentType: DownloadContentType.mantra,
            title: state.detail.audio.title,
            subtitle: state.detail.audio.singerName,
            artworkUrl: state.detail.audio.artworkUrl,
            // The Pro-gated URL the play flow already streams — hand it to
            // the manager directly so the download bypasses
            // `/content/:type/:id/download` (stage presign-key bug workaround).
            sourceUrl: state.detail.audio.audioStreamUrl,
            sourceScreen: 'mantra_player',
            variant: DownloadButtonVariant.iconWithLabel,
            labelStyle: AppText.labelMd(color: AppColors.aartiEngagementCount),
            glyphSize: 22,
          ),
        ),
        Flexible(
          child: _EngagementButton(
            buttonKey: const Key('mantras-player-share'),
            asset: 'assets/mantras/share.svg',
            tint: AppColors.aartiEngagementIcon,
            label: '${state.shareCount} shares',
            onTap: () => bloc.add(const MantrasPlayerShareRequested()),
          ),
        ),
      ],
    );
  }
}

class _EngagementButton extends StatelessWidget {
  const _EngagementButton({
    required this.buttonKey,
    required this.asset,
    required this.tint,
    required this.label,
    required this.onTap,
  });

  final Key buttonKey;
  final String asset;
  final Color tint;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: buttonKey,
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SvgPicture.asset(
            asset,
            width: AppMantras.engagementGlyph,
            height: AppMantras.engagementGlyph,
            colorFilter: ColorFilter.mode(tint, BlendMode.srcIn),
          ),
          const SizedBox(height: AppSpacing.xxxSmall),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppText.labelMd(color: AppColors.aartiEngagementCount),
          ),
        ],
      ),
    );
  }
}

class _Controls extends ConsumerWidget {
  const _Controls({required this.state});
  final MantrasPlayerReady state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final playing = ref.watch(audioControllerProvider.select((s) => s.playing));
    final controller = ref.read(audioControllerProvider.notifier);
    final bloc = context.read<MantrasPlayerBloc>();

    // Controls on the dark rounded pill — prev / play-pause / next ONLY (NO 10s
    // seek, even though Figma node names say "backward/forward 10 seconds").
    return Container(
      decoration: BoxDecoration(
        color: AppColors.aartiControlBar,
        borderRadius: BorderRadius.circular(AppMantras.controlBarRadius),
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: AppMantras.controlBarPaddingH,
        vertical: AppMantras.controlBarPaddingV,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _ControlIcon(
            buttonKey: const Key('mantras-player-prev'),
            asset: 'assets/mantras/skip-prev.svg',
            enabled: state.hasPrevious,
            onTap: () => bloc.add(const MantrasPlayerPreviousRequested()),
          ),
          _PlayPauseButton(
            playing: playing,
            onTap: () {
              if (playing) {
                controller.pause();
                // Sheet 1 row 71 — `mantras_audio_paused`. `pause_reason` is
                // always `user` here (the button is the only tap path);
                // background pauses ride on row 84 instead.
                _track(ref, MantrasEvents.audioPaused, {
                  MantrasEventProps.audioId: state.detail.audio.id,
                  MantrasEventProps.playbackPositionSeconds:
                      ref.read(audioControllerProvider).position.inSeconds,
                  MantrasEventProps.pauseReason: 'user',
                });
              } else {
                controller.resume();
              }
            },
          ),
          _ControlIcon(
            buttonKey: const Key('mantras-player-next'),
            asset: 'assets/mantras/skip-next.svg',
            enabled: state.hasNext,
            onTap: () => bloc.add(const MantrasPlayerNextRequested()),
          ),
        ],
      ),
    );
  }
}

class _ControlIcon extends StatelessWidget {
  const _ControlIcon({
    required this.buttonKey,
    required this.asset,
    required this.onTap,
    this.enabled = true,
  });

  final Key buttonKey;
  final String asset;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return InkResponse(
      key: buttonKey,
      radius: 24,
      onTap: enabled ? onTap : null,
      child: Opacity(
        opacity: enabled ? 1 : 0.3,
        child: SizedBox(
          width: AppMantras.controlTap,
          height: AppMantras.controlTap,
          child: Center(
            child: SvgPicture.asset(
              asset,
              width: AppMantras.controlGlyph,
              height: AppMantras.controlGlyph,
              colorFilter: const ColorFilter.mode(
                AppColors.aartiControlGlyph,
                BlendMode.srcIn,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PlayPauseButton extends StatelessWidget {
  const _PlayPauseButton({required this.playing, required this.onTap});
  final bool playing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkResponse(
      key: const Key('mantras-player-playpause'),
      radius: AppMantras.playCircle / 2,
      onTap: onTap,
      child: Container(
        width: AppMantras.playCircle,
        height: AppMantras.playCircle,
        decoration: BoxDecoration(
          color: playing
              ? AppColors.aartiPlayCirclePlaying
              : AppColors.aartiPlayCirclePaused,
          shape: BoxShape.circle,
        ),
        child: Center(
          child: SvgPicture.asset(
            playing ? 'assets/mantras/pause.svg' : 'assets/mantras/play.svg',
            width: AppMantras.controlGlyph,
            height: AppMantras.controlGlyph,
            // Playing state: peach circle + orange pause bars (same brand400
            // used for the paused-state circle) so the pill's warm palette
            // stays consistent across both states — mirrors the aarti player.
            colorFilter: ColorFilter.mode(
              playing ? AppColors.brand400 : AppColors.white,
              BlendMode.srcIn,
            ),
          ),
        ),
      ),
    );
  }
}

/// Next-track card (Figma 457:3481) — thumbnail + title + "Next" + play circle.
/// Card tap → playlist sheet; play-icon → next item directly (§6.10).
class _NextCard extends StatelessWidget {
  const _NextCard({
    required this.next,
    required this.onCardTap,
    required this.onPlayNext,
  });

  final MantraAudio next;
  final VoidCallback onCardTap;
  final VoidCallback onPlayNext;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: const Key('mantras-player-next-card'),
      behavior: HitTestBehavior.opaque,
      onTap: onCardTap,
      child: Container(
        height: AppMantras.nextCardHeight,
        padding: const EdgeInsets.symmetric(
          horizontal: AppMantras.nextCardPaddingH,
        ),
        decoration: BoxDecoration(
          color: AppColors.mantraNextCardFill,
          borderRadius: BorderRadius.circular(AppMantras.nextCardRadius),
        ),
        child: Row(
          children: [
            AppNetworkImage(
              url: next.artworkUrl,
              width: AppMantras.nextThumb,
              height: AppMantras.nextThumb,
              borderRadius: BorderRadius.circular(AppMantras.nextThumbRadius),
            ),
            const SizedBox(width: AppMantras.nextInnerGap),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    next.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.labelLg(color: AppColors.mantraNextTitle),
                  ),
                  Text(
                    'Next',
                    style: AppText.labelSm(color: AppColors.mantraNextTitle),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppMantras.nextInnerGap),
            InkResponse(
              key: const Key('mantras-player-next-card-play'),
              radius: AppMantras.nextCircle / 2,
              onTap: onPlayNext,
              child: Container(
                width: AppMantras.nextCircle,
                height: AppMantras.nextCircle,
                decoration: const BoxDecoration(
                  color: AppColors.mantraNextCircle,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: SvgPicture.asset(
                    'assets/mantras/play.svg',
                    width: AppMantras.nextCircleGlyph,
                    height: AppMantras.nextCircleGlyph,
                    colorFilter: const ColorFilter.mode(
                      AppColors.white,
                      BlendMode.srcIn,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RestorePrompt extends StatelessWidget {
  const _RestorePrompt({required this.onBack});
  final VoidCallback onBack;
  @override
  Widget build(BuildContext context) {
    return Center(
      key: const Key('mantras-player-restore'),
      child: Padding(
        padding: const EdgeInsets.all(AppMantras.screenPadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Please restore your membership to play this mantra.',
              textAlign: TextAlign.center,
              style: AppText.bodyMd(color: AppColors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.medium),
            TextButton(onPressed: onBack, child: const Text('Go back')),
          ],
        ),
      ),
    );
  }
}

class _PlayerError extends StatelessWidget {
  const _PlayerError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) {
    return Center(
      key: const Key('mantras-player-error'),
      child: Padding(
        padding: const EdgeInsets.all(AppMantras.screenPadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message,
                textAlign: TextAlign.center,
                style: AppText.bodyMd(color: AppColors.textSecondary)),
            const SizedBox(height: AppSpacing.medium),
            TextButton(
              key: const Key('mantras-player-retry'),
              onPressed: onRetry,
              child: const Text('Kripya phir try karein'),
            ),
          ],
        ),
      ),
    );
  }
}

void _track(WidgetRef ref, String name, Map<String, Object?> props) {
  final Analytics? a = ref.read(analyticsProvider);
  if (a == null) return;
  // ignore: discarded_futures
  a.trackEvent(name, properties: props);
}
