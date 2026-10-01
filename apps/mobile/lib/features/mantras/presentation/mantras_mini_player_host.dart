import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../aarti/application/aarti_navigation.dart';
import '../../audio/application/audio_providers.dart';
import '../../audio/domain/audio_item.dart';
import '../../audio/presentation/mini_player.dart';
import '../application/mantras_navigation.dart';

/// Hosts the shared TAM-59 [MiniPlayer] on the Mantras module's own screens.
///
/// Dispatches the "reopen full player" tap to whichever module actually owns
/// the currently-active item — an aarti playing while the user is browsing
/// mantras screens must reopen the AARTI player, not push `/mantras/player`
/// with an aarti id (which the mantras bloc then 404s on and shows as an
/// error). Same dispatch rule as [ShellMiniPlayerHost]; both surfaces can host
/// the mini-player and both need to route by `AudioItem.module`.
class MantrasMiniPlayerHost extends ConsumerWidget {
  const MantrasMiniPlayerHost({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Watch so the host rebuilds as playback starts/stops.
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
            // No full-player screen for these; the mini player stays visible
            // for playback + close but tapping the surface is a no-op (same
            // contract as `ShellMiniPlayerHost`).
            return;
        }
      },
    );
  }
}
