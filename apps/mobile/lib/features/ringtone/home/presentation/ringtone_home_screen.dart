import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../api/generated/openapi.dart';
import '../../../../core/theme.dart';
import '../../../../shared/widgets/deity_filter_row.dart';
import '../../../../state/providers.dart';
import '../../application/ringtone_navigation.dart';
import '../../presentation/ringtone_widgets.dart';
import '../../ringtone_analytics.dart';
import '../bloc/ringtone_home_bloc.dart';
import '../bloc/ringtone_home_event.dart';
import '../bloc/ringtone_home_state.dart';

/// Ringtone Home (Figma 670:4481). Back button + search field (mic hidden) +
/// "All Gods"-default DeityFilterRow (TAM-58) + 3-column card grid from
/// `GET /ringtones`. Discovery/search/filter are FREE — module entry NEVER
/// shows a paywall; only a card tap gates (via the tap handler).
class RingtoneHomeScreen extends ConsumerStatefulWidget {
  const RingtoneHomeScreen({super.key});

  @override
  ConsumerState<RingtoneHomeScreen> createState() => _RingtoneHomeScreenState();
}

class _RingtoneHomeScreenState extends ConsumerState<RingtoneHomeScreen> {
  final TextEditingController _search = TextEditingController();
  final ScrollController _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    // Row 113 — `ringtone_page_viewed`. `previous_screen` is left null (no
    // router observer wired today); `entry_source: shortcut` reflects that
    // the module is only reachable from a home widget shortcut.
    // ignore: discarded_futures
    ref.read(analyticsProvider)?.trackEvent(
      RingtoneEvents.pageViewed,
      properties: {
        RingtoneEventProps.previousScreen: null,
        RingtoneEventProps.entrySource: 'shortcut',
      },
    );
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    _search.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scroll.position.pixels >=
        _scroll.position.maxScrollExtent - 400) {
      context.read<RingtoneHomeBloc>().add(const RingtoneHomeNextPageRequested());
    }
  }

  void _onSearchSubmitted(String value) {
    final q = value.trim();
    if (q.isEmpty) return; // empty query → stay on the unfiltered home list.
    // No `ringtone_search_submitted` event on Sheet 1 rows 113–126; the
    // search bar just navigates. Kept as a plain nav call.
    pushRingtoneSearch(context, q);
  }

  @override
  Widget build(BuildContext context) {
    final deities = ref.watch(deitiesProvider);
    return Scaffold(
      key: const Key('ringtone-home-screen'),
      backgroundColor: AppColors.cardSurface,
      body: Column(
        children: [
          RingtoneTopBar(
            controller: _search,
            onSubmitted: _onSearchSubmitted,
          ),
          _DeityFilter(deities: deities),
          Expanded(
            child: BlocBuilder<RingtoneHomeBloc, RingtoneHomeState>(
              builder: (context, state) => switch (state.status) {
                RingtoneHomeStatus.loading => const _GridSkeleton(),
                RingtoneHomeStatus.error => RingtoneMessageState(
                    stateKey: const Key('ringtone-home-error'),
                    message: "Couldn't load ringtones.",
                    retryKey: const Key('ringtone-home-retry'),
                    onRetry: () => context
                        .read<RingtoneHomeBloc>()
                        .add(const RingtoneHomeRetryRequested()),
                  ),
                RingtoneHomeStatus.empty => const RingtoneMessageState(
                    stateKey: Key('ringtone-home-empty'),
                    message: 'No ringtones found',
                  ),
                RingtoneHomeStatus.loaded => RingtoneGrid(
                    controller: _scroll,
                    items: state.items,
                    onCardTap: (item, index) =>
                        buildRingtoneTapHandler(context, ref).handleCardTap(
                      item: item,
                      index: index,
                      deityId: state.selectedDeityId,
                      sourceScreen: 'ringtone_home',
                      // Row 115 `selection_source: listing`.
                      selectionSource: 'listing',
                    ),
                  ),
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _DeityFilter extends ConsumerWidget {
  const _DeityFilter({required this.deities});
  final AsyncValue<List<DeityView>> deities;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return BlocBuilder<RingtoneHomeBloc, RingtoneHomeState>(
      buildWhen: (a, b) => a.selectedDeityId != b.selectedDeityId,
      builder: (context, state) => Padding(
        padding: const EdgeInsets.only(top: AppSpacing.xSmall),
        child: DeityFilterRow(
          deities: deities,
          selectedSlug: state.selectedDeityId,
          onSelected: (slug) {
            String? name;
            final list = deities.asData?.value ?? const <DeityView>[];
            for (final d in list) {
              if (d.slug == slug) {
                name = d.displayName;
                break;
              }
            }
            context.read<RingtoneHomeBloc>().add(
                  RingtoneHomeDeitySelected(deityId: slug, deityName: name),
                );
          },
        ),
      ),
    );
  }
}

/// Loading skeleton for the filters + grid (calm placeholder). The
/// DeityFilterRow renders its own shimmer above.
class _GridSkeleton extends StatelessWidget {
  const _GridSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Center(
      key: Key('ringtone-home-skeleton'),
      child: CircularProgressIndicator(),
    );
  }
}
