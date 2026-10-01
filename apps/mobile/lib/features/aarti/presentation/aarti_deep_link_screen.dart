import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/entitlement.dart';
import '../../../core/theme.dart';
import '../aarti_routes.dart';

/// Resolves the deep link `prabhuji://aarti-bhajans/audio/{audio_id}` (q4). A Pro
/// recipient lands in the player + auto-plays; a free recipient lands on the
/// module (must subscribe before playback). Entitlement is refreshed live first.
class AartiDeepLinkScreen extends ConsumerStatefulWidget {
  const AartiDeepLinkScreen({super.key, required this.audioId});
  final String audioId;

  @override
  ConsumerState<AartiDeepLinkScreen> createState() => _AartiDeepLinkScreenState();
}

class _AartiDeepLinkScreenState extends ConsumerState<AartiDeepLinkScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _resolve());
  }

  Future<void> _resolve() async {
    await ref.read(entitlementStateProvider.notifier).refresh();
    if (!mounted) return;
    final isPro = ref.read(entitlementProvider);
    if (isPro && widget.audioId.isNotEmpty) {
      context.pushReplacement(
        AartiRoutes.player,
        extra: AartiPlayerArgs(
          audioId: widget.audioId,
          queue: const [],
          index: 0,
          sourceListType: 'deep_link',
        ),
      );
    } else {
      // Free recipient → the module; they subscribe before any playback.
      context.pushReplacement(AartiRoutes.main);
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      key: Key('aarti-deep-link'),
      backgroundColor: AppColors.cardSurface,
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
