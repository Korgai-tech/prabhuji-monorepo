import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../core/analytics.dart';
import '../../../../core/theme.dart';
import '../../../../state/providers.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../../audio/application/audio_controller.dart';
import '../../../audio/application/audio_providers.dart';
import '../../../audio/domain/audio_item.dart';
import '../../../downloads/domain/content_type.dart';
import '../../../downloads/presentation/widgets/download_button.dart';
import '../../aarti_analytics.dart';
import '../../aarti_routes.dart';
import '../../aarti_providers.dart';
import '../bloc/aarti_player_audio_port.dart';
import '../bloc/aarti_player_bloc.dart';
import '../bloc/aarti_player_event.dart';
import '../bloc/aarti_player_state.dart';

/// Full audio player (Figma 423:4387 + controls 423:4384). Pro-only — reached
/// only from an audio-item tap by a Pro user or a genuine post-purchase. Cover /
/// title / singer / composer / like+count / share+count / elapsed+total /
/// progress / rewind-10 / prev / play-pause / next / forward-10 (§6.10). Transport
/// + progress read the shared TAM-59 engine (real-time); the [AartiPlayerBloc]
/// owns the queue + detail + engagement.
class AartiPlayerScreen extends ConsumerStatefulWidget {
  const AartiPlayerScreen({super.key, required this.args});
  final AartiPlayerArgs args;

  @override
  ConsumerState<AartiPlayerScreen> createState() => _AartiPlayerScreenState();
}

class _AartiPlayerScreenState extends ConsumerState<AartiPlayerScreen>
    with WidgetsBindingObserver {
  late final AartiPlayerBloc _bloc;
  StreamSubscription<AudioTrackCompletion>? _completionSub;

  @override
  void initState() {
    super.initState();
    final controller = ref.read(audioControllerProvider.notifier);
    _bloc = AartiPlayerBloc(
      repository: ref.read(aartiRepositoryProvider),
      audioPort: ControllerAartiPlayerAudioPort(controller),
      shareService: ref.read(shareServiceProvider),
      analytics: ref.read(analyticsProvider),
    )..add(AartiPlayerOpened(widget.args));
    // Scoped app-lifecycle observer for Sheet 1 row 62
    // (`aarti_audio_app_state_changed`). The observer is registered ONLY
    // while the full player screen is mounted, so background/foreground
    // toggles on Home or other screens don't fire an aarti-scoped event.
    WidgetsBinding.instance.addObserver(this);
    // TAM-130: subscribe to the shared engine's completion stream instead
    // of deriving completion from Riverpod state deltas — the old check
    // raced against just_audio's playing/position emit order and could
    // silently drop the auto-next signal at queue boundaries. Filter to
    // aarti-owned completions so a mantras completion arriving while an
    // aarti route sits pushed under a mantras player doesn't flip THIS
    // bloc (target=1 on aarti, so every completion is a "next item" cue).
    _completionSub = controller.completionStream.listen((c) {
      if (c.item.module != AudioModule.aarti) return;
      _bloc.add(const AartiPlayerTrackCompleted());
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
    // Map Flutter's lifecycle enum onto Sheet 1 row 62's `app_state` enum:
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
    _bloc.add(AartiPlayerAppStateChanged(wire));
  }

  @override
  Widget build(BuildContext context) {
    // Bridge the engine → bloc for audio-error only. Track completion goes
    // through `controller.completionStream` in initState — see the note
    // there for why the derived-state check was removed (TAM-130).
    ref.listen<AudioPlaybackState>(audioControllerProvider, (prev, next) {
      if (next.hasError && !(prev?.hasError ?? false)) {
        _bloc.add(const AartiPlayerAudioErrored());
      }
    });

    return BlocProvider<AartiPlayerBloc>.value(
      value: _bloc,
      child: Scaffold(
        key: const Key('aarti-player-screen'),
        backgroundColor: AppColors.cardSurface,
        body: SafeArea(
          child: BlocBuilder<AartiPlayerBloc, AartiPlayerState>(
            builder: (context, state) => switch (state) {
              AartiPlayerLoading() =>
                const Center(child: CircularProgressIndicator()),
              AartiPlayerGatedRestore() => _RestorePrompt(
                  onBack: () => Navigator.of(context).maybePop(),
                ),
              AartiPlayerErrorState(:final message) => _PlayerError(
                  message: message,
                  onRetry: () => _bloc.add(const AartiPlayerRetryRequested()),
                ),
              AartiPlayerReady() => _PlayerBody(state: state),
            },
          ),
        ),
      ),
    );
  }
}

class _PlayerBody extends ConsumerWidget {
  const _PlayerBody({required this.state});
  final AartiPlayerReady state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final audio = state.detail.audio;
    return Column(
      children: [
        _TopBar(),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: AppAarti.screenPadding),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Center(
                  child: AppNetworkImage(
                    key: const Key('aarti-player-cover'),
                    url: audio.coverImageUrl,
                    width: AppAarti.playerCover,
                    height: AppAarti.playerCover,
                    borderRadius:
                        BorderRadius.circular(AppAarti.playerCoverRadius),
                  ),
                ),
                const SizedBox(height: AppAarti.playerBlockGap),
                Text(
                  audio.title,
                  key: const Key('aarti-player-title'),
                  textAlign: TextAlign.center,
                  style: AppText.headingSm(color: AppColors.aartiPlayerText),
                ),
                const SizedBox(height: AppSpacing.xxxSmall),
                _MetadataRow(
                  key: const Key('aarti-player-singer'),
                  label: 'Singer',
                  value: audio.singerName,
                ),
                _MetadataRow(
                  key: const Key('aarti-player-composer'),
                  label: 'Composer',
                  value: audio.composerNames,
                ),
                const SizedBox(height: AppSpacing.medium),
                // Icon-above-label pairs, evenly spaced. Prior layout put the
                // glyph beside the text, which made the two buttons render as
                // different-width chunks (5-digit "24987 likes" pushed the like
                // block wider than the share block) — the pair looked visibly
                // off-centre. Column layout with `spaceEvenly` guarantees the
                // pair reads symmetric regardless of the count widths.
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    Flexible(
                      child: _EngagementButton(
                        buttonKey: const Key('aarti-player-like'),
                        asset: 'assets/aarti/like.svg',
                        tint: state.liked
                            ? AppColors.aartiLikeActive
                            : AppColors.aartiEngagementIcon,
                        label: '${state.likeCount} likes',
                        onTap: () => context
                            .read<AartiPlayerBloc>()
                            .add(const AartiPlayerLikeToggled()),
                      ),
                    ),
                    // TAM-125 — Download control in the play-page engagement
                    // row (Figma `2632:21211` shows Heart · Download · Share).
                    Flexible(
                      child: DownloadButton(
                        key: Key(
                            'aarti-player-download-${state.detail.audio.id}'),
                        contentId: state.detail.audio.id,
                        contentType: DownloadContentType.aarti,
                        title: state.detail.audio.title,
                        subtitle: state.detail.audio.singerName,
                        artworkUrl: state.detail.audio.coverImageUrl,
                        // The Pro-gated URL the play flow already streams —
                        // hand it to the manager directly so the download
                        // bypasses `/content/:type/:id/download` (stage
                        // presign-key bug workaround).
                        sourceUrl: state.detail.audio.audioStreamUrl,
                        sourceScreen: 'aarti_player',
                        variant: DownloadButtonVariant.iconWithLabel,
                        labelStyle: AppText.labelMd(
                            color: AppColors.aartiEngagementCount),
                        glyphSize: 22,
                      ),
                    ),
                    Flexible(
                      child: _EngagementButton(
                        buttonKey: const Key('aarti-player-share'),
                        asset: 'assets/aarti/share.svg',
                        tint: AppColors.aartiEngagementIcon,
                        label: '${state.shareCount} shares',
                        onTap: () => context
                            .read<AartiPlayerBloc>()
                            .add(const AartiPlayerShareRequested()),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppAarti.playerSectionGap),
                const _ProgressSection(),
                const SizedBox(height: AppAarti.playerBlockGap),
                _Controls(state: state),
                const SizedBox(height: AppAarti.playerSectionGap),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _TopBar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: AppNav.height,
      child: Row(
        children: [
          const SizedBox(width: AppSpacing.xSmall),
          InkResponse(
            key: const Key('aarti-player-back'),
            radius: 24,
            onTap: () => Navigator.of(context).maybePop(),
            child: SizedBox(
              width: AppAarti.backArrowFrame,
              height: AppAarti.backArrowFrame,
              child: Center(
                child: SvgPicture.asset(
                  'assets/aarti/back-arrow.svg',
                  width: AppAarti.backArrowGlyph,
                  height: AppAarti.backArrowGlyph,
                  colorFilter: const ColorFilter.mode(
                    AppColors.aartiBackArrow,
                    BlendMode.srcIn,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MetadataRow extends StatelessWidget {
  const _MetadataRow({super.key, required this.label, required this.value});
  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    if ((value ?? '').isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xxxSmall),
      child: Text.rich(
        TextSpan(children: [
          TextSpan(
            text: '$label  ',
            style: AppText.bodySm(color: AppColors.aartiPlayerText),
          ),
          TextSpan(
            text: value,
            style: AppText.labelMd(color: AppColors.aartiPlayerText),
          ),
        ]),
        textAlign: TextAlign.center,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
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
            width: AppAarti.engagementGlyph,
            height: AppAarti.engagementGlyph,
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

/// Progress bar + elapsed/total, driven by the shared engine (real-time). Seek
/// via drag; fires `aarti_bhajans_seek_used`.
class _ProgressSection extends ConsumerWidget {
  const _ProgressSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(audioControllerProvider);
    final duration = s.duration;
    final position = s.position > duration ? duration : s.position;
    return Column(
      children: [
        _ProgressBar(
          position: position,
          duration: duration,
          onSeek: (p) {
            // Sheet 1 has no `aarti_bhajans_seek_used` event — arbitrary scrub
            // is covered by the forward_10 / rewind_10 events. Actual seek
            // still runs; only the tracking call is dropped.
            ref.read(audioControllerProvider.notifier).seek(p);
          },
        ),
        const SizedBox(height: AppSpacing.xSmall),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(_fmt(position),
                key: const Key('aarti-player-elapsed'), style: AppText.aartiTime()),
            Text(_fmt(duration),
                key: const Key('aarti-player-total'), style: AppText.aartiTime()),
          ],
        ),
      ],
    );
  }
}

class _ProgressBar extends StatelessWidget {
  const _ProgressBar({
    required this.position,
    required this.duration,
    required this.onSeek,
  });

  final Duration position;
  final Duration duration;
  final ValueChanged<Duration> onSeek;

  @override
  Widget build(BuildContext context) {
    final total = duration.inMilliseconds;
    final fraction =
        total <= 0 ? 0.0 : (position.inMilliseconds / total).clamp(0.0, 1.0);
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        void seekTo(double dx) {
          if (total <= 0) return;
          final f = (dx / width).clamp(0.0, 1.0);
          onSeek(Duration(milliseconds: (f * total).round()));
        }

        return GestureDetector(
          key: const Key('aarti-player-progress'),
          behavior: HitTestBehavior.opaque,
          onTapDown: (d) => seekTo(d.localPosition.dx),
          onHorizontalDragUpdate: (d) => seekTo(d.localPosition.dx),
          child: SizedBox(
            height: AppAarti.progressThumb,
            child: Stack(
              alignment: Alignment.centerLeft,
              children: [
                Container(
                  height: AppAarti.progressTrackHeight,
                  decoration: BoxDecoration(
                    color: AppColors.aartiProgressTrack,
                    borderRadius:
                        BorderRadius.circular(AppAarti.progressTrackHeight),
                  ),
                ),
                FractionallySizedBox(
                  widthFactor: fraction,
                  child: Container(
                    height: AppAarti.progressTrackHeight,
                    decoration: BoxDecoration(
                      color: AppColors.aartiProgressFill,
                      borderRadius:
                          BorderRadius.circular(AppAarti.progressTrackHeight),
                    ),
                  ),
                ),
                Align(
                  alignment: Alignment(fraction * 2 - 1, 0),
                  child: Container(
                    width: AppAarti.progressThumb,
                    height: AppAarti.progressThumb,
                    decoration: const BoxDecoration(
                      color: AppColors.aartiProgressThumb,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _Controls extends ConsumerWidget {
  const _Controls({required this.state});
  final AartiPlayerReady state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final playing = ref.watch(audioControllerProvider.select((s) => s.playing));
    final controller = ref.read(audioControllerProvider.notifier);
    final bloc = context.read<AartiPlayerBloc>();

    // Controls sit on a dark rounded pill (Figma node 425:4876, fill #3F3F3F).
    return Container(
      decoration: BoxDecoration(
        color: AppColors.aartiControlBar,
        borderRadius: BorderRadius.circular(AppAarti.controlBarRadius),
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: AppAarti.controlBarPaddingH,
        vertical: AppAarti.controlBarPaddingV,
      ),
      child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        _ControlIcon(
          buttonKey: const Key('aarti-player-rewind'),
          asset: 'assets/aarti/rewind-10.svg',
          onTap: () {
            _seekBy(ref, const Duration(seconds: -10));
            _track(ref, AartiEvents.rewind10SecondsClicked, const {});
          },
        ),
        _ControlIcon(
          buttonKey: const Key('aarti-player-prev'),
          asset: 'assets/aarti/skip-prev.svg',
          enabled: state.hasPrevious,
          onTap: () => bloc.add(const AartiPlayerPreviousRequested()),
        ),
        _PlayPauseButton(
          playing: playing,
          onTap: () {
            if (playing) {
              controller.pause();
              _track(ref, AartiEvents.audioPaused,
                  {'audio_id': state.detail.audio.id});
            } else {
              controller.resume();
              // Explicit tap-to-play after pause → `user_play`. Position is
              // read from the audio controller so it reflects where the user
              // resumed from, not zero.
              final positionSeconds =
                  ref.read(audioControllerProvider).position.inSeconds;
              _track(ref, AartiEvents.audioStarted, {
                AartiEventProps.audioId: state.detail.audio.id,
                AartiEventProps.audioType: AartiAudioType.aarti,
                AartiEventProps.playbackPositionSeconds: positionSeconds,
                AartiEventProps.startReason: AartiStartReason.userPlay,
              });
            }
          },
        ),
        _ControlIcon(
          buttonKey: const Key('aarti-player-next'),
          asset: 'assets/aarti/skip-next.svg',
          enabled: state.hasNext,
          onTap: () => bloc.add(const AartiPlayerNextRequested()),
        ),
        _ControlIcon(
          buttonKey: const Key('aarti-player-forward'),
          asset: 'assets/aarti/forward-10.svg',
          onTap: () {
            _seekBy(ref, const Duration(seconds: 10));
            _track(ref, AartiEvents.forward10SecondsClicked, const {});
          },
        ),
      ],
      ),
    );
  }

  void _seekBy(WidgetRef ref, Duration delta) {
    final s = ref.read(audioControllerProvider);
    final target = s.position + delta;
    final clamped = target < Duration.zero
        ? Duration.zero
        : (target > s.duration ? s.duration : target);
    ref.read(audioControllerProvider.notifier).seek(clamped);
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
          width: AppAarti.controlTap,
          height: AppAarti.controlTap,
          child: Center(
            child: SvgPicture.asset(
              asset,
              width: AppAarti.controlGlyph,
              height: AppAarti.controlGlyph,
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
      key: const Key('aarti-player-playpause'),
      radius: AppAarti.playCircle / 2,
      onTap: onTap,
      child: Container(
        width: AppAarti.playCircle,
        height: AppAarti.playCircle,
        decoration: BoxDecoration(
          // Prominent orange "play" circle when paused; muted peach while playing.
          color: playing
              ? AppColors.aartiPlayCirclePlaying
              : AppColors.aartiPlayCirclePaused,
          shape: BoxShape.circle,
        ),
        child: Center(
          child: SvgPicture.asset(
            playing ? 'assets/aarti/pause.svg' : 'assets/aarti/play.svg',
            width: AppAarti.controlGlyph,
            height: AppAarti.controlGlyph,
            // Playing state: peach circle + orange pause bars (same brand400
            // used for the paused-state circle) so the pill's warm palette
            // stays consistent across both states.
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

class _RestorePrompt extends StatelessWidget {
  const _RestorePrompt({required this.onBack});
  final VoidCallback onBack;
  @override
  Widget build(BuildContext context) {
    return Center(
      key: const Key('aarti-player-restore'),
      child: Padding(
        padding: const EdgeInsets.all(AppAarti.screenPadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Please restore your membership to play this audio.',
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
      key: const Key('aarti-player-error'),
      child: Padding(
        padding: const EdgeInsets.all(AppAarti.screenPadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message,
                textAlign: TextAlign.center,
                style: AppText.bodyMd(color: AppColors.textSecondary)),
            const SizedBox(height: AppSpacing.medium),
            TextButton(
              key: const Key('aarti-player-retry'),
              onPressed: onRetry,
              child: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }
}

String _fmt(Duration d) {
  final m = d.inMinutes;
  final s = d.inSeconds % 60;
  return '$m:${s.toString().padLeft(2, '0')}';
}

void _track(WidgetRef ref, String name, Map<String, Object?> props) {
  final Analytics? a = ref.read(analyticsProvider);
  if (a == null) return;
  // ignore: discarded_futures
  a.trackEvent(name, properties: props);
}
