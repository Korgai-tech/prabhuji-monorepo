import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../core/theme.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../../../state/providers.dart';
import '../../../audio/application/audio_controller.dart';
import '../../../audio/application/audio_providers.dart';
import '../../ringtone_analytics.dart';
import '../../ringtone_providers.dart';
import '../../ringtone_routes.dart';
import '../bloc/ringtone_preview_audio_port.dart';
import '../bloc/ringtone_preview_bloc.dart';
import '../bloc/ringtone_preview_event.dart';
import '../bloc/ringtone_preview_state.dart';
import '../bloc/set_ringtone_bloc.dart';
import '../bloc/set_ringtone_event.dart';
import '../bloc/set_ringtone_state.dart';

/// Ringtone Preview (Figma 683:4775). Pro-only; auto-plays on entry (preview
/// mode — no mini-player, no background). Hero image / title / set-count /
/// like·play·share metrics / play-pause / Set Ringtone CTA. Audio stops on
/// back/exit and pauses on app background + share-open (§6).
class RingtonePreviewScreen extends ConsumerStatefulWidget {
  const RingtonePreviewScreen({super.key, required this.args});
  final RingtonePreviewArgs args;

  @override
  ConsumerState<RingtonePreviewScreen> createState() =>
      _RingtonePreviewScreenState();
}

class _RingtonePreviewScreenState extends ConsumerState<RingtonePreviewScreen>
    with WidgetsBindingObserver {
  late final RingtonePreviewBloc _bloc;
  late final SetRingtoneBloc _setBloc;
  late final AudioController _audioController;
  bool _thresholdSent = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Capture the controller now — `ref` is unsafe in dispose().
    _audioController = ref.read(audioControllerProvider.notifier);
    _bloc = RingtonePreviewBloc(
      repository: ref.read(ringtoneRepositoryProvider),
      audioPort: ControllerRingtonePreviewAudioPort(_audioController),
      shareService: ref.read(shareServiceProvider),
      analytics: ref.read(analyticsProvider),
    )..add(RingtonePreviewOpened(widget.args));
    _setBloc = SetRingtoneBloc(
      service: ref.read(setRingtoneServiceProvider),
      repository: ref.read(ringtoneRepositoryProvider),
      analytics: ref.read(analyticsProvider),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    // Stop playback on exit — no lingering ringtone audio (§6, one at a time).
    // Guarded: at full-tree teardown the AudioController provider may already be
    // disposed, so a late state write would throw — swallow it.
    // ignore: discarded_futures
    _safeStop();
    _bloc.close();
    _setBloc.close();
    super.dispose();
  }

  Future<void> _safeStop() async {
    try {
      await _audioController.stop();
    } catch (_) {
      // provider already torn down — nothing to stop.
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      // No background playback — pause when the app leaves the foreground.
      // ignore: discarded_futures
      _audioController.pause();
    } else if (state == AppLifecycleState.resumed) {
      // Re-check the WRITE_SETTINGS grant after a settings-screen round-trip.
      _setBloc.add(const SetRingtoneAppResumed());
    }
  }

  @override
  Widget build(BuildContext context) {
    // Bridge the shared engine → bloc: play-count threshold, completion, error.
    ref.listen<AudioPlaybackState>(audioControllerProvider, (prev, next) {
      final positionS = next.position.inMilliseconds / 1000.0;
      // Play-count rule (TAM-67): a play counts at ≥3s (server-authoritative).
      const threshold = 3.0;
      if (!_thresholdSent && positionS >= threshold && positionS > 0) {
        _thresholdSent = true;
        _bloc.add(RingtonePreviewPlayThresholdReached(positionS));
      }
      final completed =
          (prev?.playing ?? false) &&
          !next.playing &&
          next.duration > Duration.zero &&
          next.position >= next.duration;
      if (completed) _bloc.add(const RingtonePreviewPlayCompleted());
      if (next.hasError && !(prev?.hasError ?? false)) {
        _bloc.add(const RingtonePreviewAudioErrored());
      }
    });

    return MultiBlocProvider(
      providers: [
        BlocProvider<RingtonePreviewBloc>.value(value: _bloc),
        BlocProvider<SetRingtoneBloc>.value(value: _setBloc),
      ],
      child: Scaffold(
        key: const Key('ringtone-preview-screen'),
        backgroundColor: AppColors.cardSurface,
        body: SafeArea(
          child: BlocListener<SetRingtoneBloc, SetRingtoneState>(
            listener: _onSetRingtoneState,
            child: BlocBuilder<RingtonePreviewBloc, RingtonePreviewState>(
              builder: (context, state) => switch (state) {
                RingtonePreviewLoading() => const Center(
                  child: CircularProgressIndicator(),
                ),
                RingtonePreviewGatedRestore() => _RestorePrompt(
                  onBack: () => Navigator.of(context).maybePop(),
                ),
                RingtonePreviewErrorState(:final message) => _PreviewError(
                  message: message,
                  onRetry: () =>
                      _bloc.add(const RingtonePreviewRetryRequested()),
                ),
                RingtonePreviewReady() => _PreviewBody(state: state),
              },
            ),
          ),
        ),
      ),
    );
  }

  void _onSetRingtoneState(BuildContext context, SetRingtoneState state) {
    final messenger = ScaffoldMessenger.of(context);
    switch (state.status) {
      case SetRingtoneStatus.success:
        messenger.showSnackBar(const SnackBar(content: Text('Ringtone set')));
        final count = state.setCount;
        if (count != null) {
          _bloc.add(RingtonePreviewSetCountUpdated(count));
        }
      case SetRingtoneStatus.permissionDenied:
      case SetRingtoneStatus.failed:
        messenger.showSnackBar(
          SnackBar(content: Text(state.message ?? SetRingtoneState.failedCopy)),
        );
      case SetRingtoneStatus.idle:
      case SetRingtoneStatus.permissionRequired:
      case SetRingtoneStatus.setting:
        break;
    }
  }
}

class _PreviewBody extends StatelessWidget {
  const _PreviewBody({required this.state});
  final RingtonePreviewReady state;

  @override
  Widget build(BuildContext context) {
    final detail = state.detail;
    // Layout: play button + Set Ringtone CTA are ANCHORED to the bottom edge;
    // cover / title / set-count / metrics fill the space above and scroll only
    // if the viewport is too short to fit them.
    return Column(
      children: [
        _PreviewTopBar(onBack: () => Navigator.of(context).maybePop()),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(
              horizontal: AppRingtone.screenPadding,
            ),
            child: Column(
              children: [
                const SizedBox(height: AppSpacing.medium),
                ClipRRect(
                  borderRadius: BorderRadius.circular(
                    AppRingtone.previewHeroRadius,
                  ),
                  child: AppNetworkImage(
                    key: const Key('ringtone-preview-image'),
                    url: detail.heroImageUrl,
                    width: AppRingtone.previewHeroSize,
                    height: AppRingtone.previewHeroSize,
                  ),
                ),
                const SizedBox(height: AppSpacing.medium),
                Text(
                  detail.title,
                  key: const Key('ringtone-preview-title'),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.headingSm(
                    color: AppColors.ringtonePreviewTitle,
                  ),
                ),
                const SizedBox(height: AppSpacing.xSmall),
                _SetCountLine(setCount: state.setCount),
                const SizedBox(height: AppSpacing.large),
                _MetricsRow(state: state),
                const SizedBox(height: AppSpacing.medium),
              ],
            ),
          ),
        ),
        // Fixed bottom block — play button + Set Ringtone CTA never scroll.
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppRingtone.screenPadding,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: const [
              _PlayPauseControl(),
              SizedBox(height: AppSpacing.medium),
              _SetRingtoneCta(),
              SizedBox(height: AppSpacing.medium),
            ],
          ),
        ),
      ],
    );
  }
}

class _PreviewTopBar extends StatelessWidget {
  const _PreviewTopBar({required this.onBack});
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: AppRingtone.navHeight,
      child: Row(
        children: [
          const SizedBox(width: AppSpacing.xSmall),
          InkResponse(
            key: const Key('ringtone-preview-back'),
            radius: 24,
            onTap: onBack,
            child: SizedBox(
              width: AppRingtone.backArrowFrame,
              height: AppRingtone.backArrowFrame,
              child: Center(
                child: SvgPicture.asset(
                  'assets/ringtone/back.svg',
                  width: AppRingtone.backArrowGlyph,
                  height: AppRingtone.backArrowGlyph,
                  colorFilter: const ColorFilter.mode(
                    AppColors.black,
                    BlendMode.srcIn,
                  ),
                ),
              ),
            ),
          ),
          const Spacer(),
        ],
      ),
    );
  }
}

/// "N ringtone set" line (Figma 683:4885) — ringtone bell glyph + raw count.
class _SetCountLine extends StatelessWidget {
  const _SetCountLine({required this.setCount});
  final int setCount;

  @override
  Widget build(BuildContext context) {
    return Row(
      key: const Key('ringtone-preview-setcount'),
      mainAxisSize: MainAxisSize.min,
      children: [
        SvgPicture.asset(
          'assets/ringtone/ringtone.svg',
          width: AppRingtone.previewSetCountIcon,
          height: AppRingtone.previewSetCountIcon,
          colorFilter: const ColorFilter.mode(
            AppColors.ringtoneSetCountIcon,
            BlendMode.srcIn,
          ),
        ),
        const SizedBox(width: AppSpacing.xSmall),
        Text(
          '$setCount ringtone set',
          style: AppText.labelMd(color: AppColors.ringtonePreviewMetric),
        ),
      ],
    );
  }
}

class _MetricsRow extends StatelessWidget {
  const _MetricsRow({required this.state});
  final RingtonePreviewReady state;

  @override
  Widget build(BuildContext context) {
    final bloc = context.read<RingtonePreviewBloc>();
    // Icon-above-label triplet, evenly spaced. Prior layout put the glyph
    // beside the text inside a `FittedBox(scaleDown)`, which meant long
    // counts shrank the whole row uniformly and the three chunks read as
    // different-width blocks. Column layout + spaceEvenly keeps them
    // symmetric regardless of digit widths.
    // Three equal thirds so long raw counts can't push the row past the
    // viewport width (each `_Metric` scales its label down inside its cell
    // when necessary).
    return Row(
      children: [
        Expanded(
          child: _Metric(
            metricKey: const Key('ringtone-preview-like'),
            asset: 'assets/ringtone/like.svg',
            tint: state.liked
                ? AppColors.ringtoneLikeActive
                : AppColors.ringtonePreviewMetric,
            label: '${state.likeCount} likes',
            onTap: () => bloc.add(const RingtonePreviewLikeToggled()),
          ),
        ),
        Expanded(
          child: _Metric(
            metricKey: const Key('ringtone-preview-play'),
            asset: 'assets/ringtone/headphones.svg',
            tint: AppColors.ringtonePreviewMetric,
            label: '${state.playCount} plays',
          ),
        ),
        Expanded(
          child: _Metric(
            metricKey: const Key('ringtone-preview-share'),
            asset: 'assets/ringtone/share.svg',
            tint: AppColors.ringtonePreviewMetric,
            label: '${state.shareCount} shares',
            onTap: () => bloc.add(const RingtonePreviewShareRequested()),
          ),
        ),
      ],
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({
    required this.metricKey,
    required this.asset,
    required this.tint,
    required this.label,
    this.onTap,
  });

  final Key metricKey;
  final String asset;
  final Color tint;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: metricKey,
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SvgPicture.asset(
            asset,
            width: AppRingtone.previewMetricIcon,
            height: AppRingtone.previewMetricIcon,
            colorFilter: ColorFilter.mode(tint, BlendMode.srcIn),
          ),
          const SizedBox(height: AppSpacing.xxxSmall),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: AppText.labelMd(color: AppColors.ringtonePreviewMetric),
          ),
        ],
      ),
    );
  }
}

class _PlayPauseControl extends ConsumerWidget {
  const _PlayPauseControl();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final playing = ref.watch(audioControllerProvider.select((s) => s.playing));
    final controller = ref.read(audioControllerProvider.notifier);
    final analytics = ref.read(analyticsProvider);
    return InkResponse(
      key: const Key('ringtone-preview-playpause'),
      radius: AppRingtone.playCircle / 2,
      onTap: () {
        if (playing) {
          final snapshot = ref.read(audioControllerProvider);
          final id = snapshot.currentItem?.id;
          // ignore: discarded_futures
          controller.pause();
          // Row 118 — `ringtone_play_paused` with `playback_position_seconds`
          // captured at the moment of the tap.
          // ignore: discarded_futures
          analytics?.trackEvent(
            RingtoneEvents.playPaused,
            properties: {
              RingtoneEventProps.ringtoneId: id,
              RingtoneEventProps.playbackPositionSeconds:
                  snapshot.position.inMilliseconds / 1000.0,
            },
          );
        } else {
          // ignore: discarded_futures
          controller.resume();
        }
      },
      child: Container(
        width: AppRingtone.playCircle,
        height: AppRingtone.playCircle,
        decoration: const BoxDecoration(
          color: AppColors.ringtonePlayCircle,
          shape: BoxShape.circle,
        ),
        child: Center(
          child: SvgPicture.asset(
            playing ? 'assets/ringtone/pause.svg' : 'assets/ringtone/play.svg',
            width: AppRingtone.playGlyph,
            height: AppRingtone.playGlyph,
            colorFilter: const ColorFilter.mode(
              AppColors.ringtonePlayCircleGlyph,
              BlendMode.srcIn,
            ),
          ),
        ),
      ),
    );
  }
}

class _SetRingtoneCta extends StatelessWidget {
  const _SetRingtoneCta();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<SetRingtoneBloc, SetRingtoneState>(
      builder: (context, setState) {
        return BlocBuilder<RingtonePreviewBloc, RingtonePreviewState>(
          builder: (context, previewState) {
            final ready = previewState is RingtonePreviewReady;
            final busy = setState.isBusy;
            return SizedBox(
              width: double.infinity,
              height: AppRingtone.setCtaHeight,
              child: Material(
                color: AppColors.ringtoneSetCtaFill,
                borderRadius: BorderRadius.circular(AppRingtone.setCtaRadius),
                child: InkWell(
                  key: const Key('ringtone-preview-set-cta'),
                  borderRadius: BorderRadius.circular(AppRingtone.setCtaRadius),
                  onTap: (!ready || busy)
                      ? null
                      : () {
                          final detail = (previewState).detail;
                          context.read<SetRingtoneBloc>().add(
                            SetRingtoneStartRequested(
                              ringtoneId: detail.id,
                              audioUrl: detail.audioUrl ?? '',
                              title: detail.title,
                              // `deityId` on the ringtone wire IS the deity
                              // slug (the only deity identifier clients ever
                              // see — TAM-57).
                              deitySlug: detail.deityId,
                            ),
                          );
                        },
                  child: Center(
                    child: busy
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation(
                                AppColors.ringtoneSetCtaLabel,
                              ),
                            ),
                          )
                        : Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              SvgPicture.asset(
                                'assets/ringtone/set-ringtone.svg',
                                width: AppRingtone.setCtaIcon,
                                height: AppRingtone.setCtaIcon,
                                colorFilter: const ColorFilter.mode(
                                  AppColors.ringtoneSetCtaLabel,
                                  BlendMode.srcIn,
                                ),
                              ),
                              const SizedBox(width: AppRingtone.setCtaGap),
                              Text(
                                'Set Ringtone',
                                style: AppText.labelLg(
                                  color: AppColors.ringtoneSetCtaLabel,
                                ),
                              ),
                            ],
                          ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }
}

class _RestorePrompt extends StatelessWidget {
  const _RestorePrompt({required this.onBack});
  final VoidCallback onBack;
  @override
  Widget build(BuildContext context) {
    return Center(
      key: const Key('ringtone-preview-restore'),
      child: Padding(
        padding: const EdgeInsets.all(AppRingtone.screenPadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Please restore your membership to preview this ringtone.',
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

class _PreviewError extends StatelessWidget {
  const _PreviewError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) {
    return Center(
      key: const Key('ringtone-preview-error'),
      child: Padding(
        padding: const EdgeInsets.all(AppRingtone.screenPadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              message,
              textAlign: TextAlign.center,
              style: AppText.bodyMd(color: AppColors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.medium),
            TextButton(
              key: const Key('ringtone-preview-retry'),
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
