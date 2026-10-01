import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../aarti/application/aarti_navigation.dart';
import '../../mantras/application/mantras_navigation.dart';
import '../application/audio_providers.dart';
import '../domain/audio_item.dart';
import 'mini_player.dart';

/// The single mini-player instance mounted in [AppShellScaffold]'s bottom
/// bar (TAM-59 AC-c). Delegates the "reopen full player" tap to whichever
/// module owns the currently-active item — aarti tap ⇒ aarti player;
/// mantras tap ⇒ mantras player. Before this existed, the shell hard-wired
/// only `AartiMiniPlayerHost`, so a user playing a mantra who tapped the
/// mini player would get bounced into the aarti player which failed to
/// fetch the mantra ID as an aarti.
///
/// Analytics for aarti/mantras mini-player-tapped events fire from the
/// per-module `reopenActive*Player` helpers; this host only picks which
/// helper to call.
class ShellMiniPlayerHost extends ConsumerWidget {
  const ShellMiniPlayerHost({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Watch so we rebuild when playback starts/stops (MiniPlayer collapses
    // to a `SizedBox.shrink()` when inactive, so no-op state changes are
    // effectively free).
    ref.watch(audioControllerProvider.select((s) => s.showMiniPlayer));

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
            // No full player screen for these — mini player still shows
            // playback + close, but tapping the surface is a no-op.
            return;
        }
      },
    );
  }
}
