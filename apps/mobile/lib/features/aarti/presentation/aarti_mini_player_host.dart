import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../state/providers.dart';
import '../../audio/application/audio_providers.dart';
import '../../audio/domain/audio_item.dart';
import '../../audio/presentation/mini_player.dart';
import '../../mantras/application/mantras_navigation.dart';
import '../aarti_analytics.dart';
import '../application/aarti_navigation.dart';

/// Hosts the shared TAM-59 [MiniPlayer] on the Aarti module's own screens.
/// Fires `aarti_bhajans_mini_player_shown` on the hidden→shown transition
/// (kept as-is — the aarti module's own instrumentation).
///
/// Dispatches the "reopen full player" tap to whichever module actually owns
/// the currently-active item — a mantra playing while the user is browsing
/// aarti screens must reopen the MANTRAS player, not push `/aarti-bhajans/
/// player` with a mantra id (which the aarti bloc then 404s on and shows as
/// an error). Same dispatch rule as [ShellMiniPlayerHost]; both surfaces can
/// host the mini-player and both need to route by `AudioItem.module`.
class AartiMiniPlayerHost extends ConsumerStatefulWidget {
  const AartiMiniPlayerHost({super.key});

  @override
  ConsumerState<AartiMiniPlayerHost> createState() => _AartiMiniPlayerHostState();
}

class _AartiMiniPlayerHostState extends ConsumerState<AartiMiniPlayerHost> {
  bool _wasShown = false;

  @override
  Widget build(BuildContext context) {
    final shown = ref.watch(
      audioControllerProvider.select((s) => s.showMiniPlayer),
    );
    if (shown && !_wasShown) {
      final id = ref.read(audioControllerProvider).currentItem?.id;
      // ignore: discarded_futures
      ref.read(analyticsProvider)?.trackEvent(
        AartiEvents.miniPlayerViewed,
        properties: {'audio_id': ?id},
      );
    }
    _wasShown = shown;

    return MiniPlayer(
      onTap: () {
        final item = ref.read(audioControllerProvider).currentItem;
        if (item == null) return;
        switch (item.module) {
          case AudioModule.aarti:
            reopenActivePlayer(context, ref);
          case AudioModule.mantras:
            reopenActiveMantrasPlayer(context, ref);
          case AudioModule.ringtone:
          case AudioModule.other:
            // No full-player screen for these; tap is a no-op (same contract
            // as `ShellMiniPlayerHost`).
            return;
        }
      },
    );
  }
}
