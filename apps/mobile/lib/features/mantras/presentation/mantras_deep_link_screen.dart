import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/entitlement.dart';
import '../../../core/theme.dart';
import '../mantras_routes.dart';

/// Resolves `/mantras/audio/{itemId}` — the mantras counterpart to
/// [AartiDeepLinkScreen]. A Pro recipient lands in the full player + auto-
/// plays; a free recipient lands on the module home (must subscribe before
/// playback). Entitlement is refreshed live first so a fresh purchase
/// completes without a stale-flag stall.
///
/// The screen is stateless UX-wise (a loading spinner while `_resolve`
/// runs), and always `pushReplacement`s itself out of the stack so the
/// back button never returns here.
class MantrasDeepLinkScreen extends ConsumerStatefulWidget {
  const MantrasDeepLinkScreen({super.key, required this.itemId});
  final String itemId;

  @override
  ConsumerState<MantrasDeepLinkScreen> createState() =>
      _MantrasDeepLinkScreenState();
}

class _MantrasDeepLinkScreenState extends ConsumerState<MantrasDeepLinkScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _resolve());
  }

  Future<void> _resolve() async {
    // `entitlementProvider` is now a Provider<bool> derived from
    // `entitlementStateProvider` — call refresh on the underlying notifier.
    await ref.read(entitlementStateProvider.notifier).refresh();
    if (!mounted) return;
    final isPro = ref.read(entitlementProvider);
    if (isPro && widget.itemId.isNotEmpty) {
      context.pushReplacement(
        MantrasRoutes.player,
        extra: MantrasPlayerArgs(
          itemId: widget.itemId,
          // Empty queue → the player bloc seeds the queue from the fetched
          // detail (single-item playback until the user hits next/prev,
          // matching the aarti deep-link semantics).
          queue: const [],
          index: 0,
          // Empty by design — see [reopenActiveMantrasPlayer]. The player
          // bloc threads `playlistSource` into the API `source` query, and
          // the backend rejects anything outside its allowlisted playlist
          // sources (deity / category / recently_played / newly_added /
          // listing). Passing 'deep_link' here previously produced a 400
          // VALIDATION_ERROR on `GET /mantras/items/:id` and dropped the
          // user on the error screen.
          playlistSource: '',
        ),
      );
    } else {
      // Free recipient → the module; they subscribe before any playback.
      context.pushReplacement(MantrasRoutes.main);
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      key: Key('mantras-deep-link'),
      backgroundColor: AppColors.cardSurface,
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
