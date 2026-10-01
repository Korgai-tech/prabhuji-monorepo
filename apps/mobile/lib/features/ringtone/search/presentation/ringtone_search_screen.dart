import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme.dart';
import '../../application/ringtone_navigation.dart';
import '../../presentation/ringtone_widgets.dart';
import '../bloc/ringtone_search_bloc.dart';
import '../bloc/ringtone_search_event.dart';
import '../bloc/ringtone_search_state.dart';

/// Ringtone Search Results (Figma 1073:3472). Same top bar (query echoed in the
/// field), a "Search Results" heading, and the same 3-column grid + access
/// rules as Home. Zero results → "No results found". Search never paywalls and
/// never auto-plays; a card tap gates via the shared tap handler.
class RingtoneSearchScreen extends ConsumerStatefulWidget {
  const RingtoneSearchScreen({super.key, required this.query});
  final String query;

  @override
  ConsumerState<RingtoneSearchScreen> createState() =>
      _RingtoneSearchScreenState();
}

class _RingtoneSearchScreenState extends ConsumerState<RingtoneSearchScreen> {
  late final TextEditingController _search =
      TextEditingController(text: widget.query);
  final ScrollController _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
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
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 400) {
      context
          .read<RingtoneSearchBloc>()
          .add(const RingtoneSearchNextPageRequested());
    }
  }

  void _onSubmitted(String value) {
    context.read<RingtoneSearchBloc>().add(RingtoneSearchSubmitted(value.trim()));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('ringtone-search-screen'),
      backgroundColor: AppColors.cardSurface,
      body: Column(
        children: [
          RingtoneTopBar(
            controller: _search,
            onSubmitted: _onSubmitted,
          ),
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppRingtone.screenPadding,
              vertical: AppSpacing.xSmall,
            ),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Search Results',
                key: const Key('ringtone-search-heading'),
                style: AppText.bodyMd(color: AppColors.ringtoneSearchHeading),
              ),
            ),
          ),
          Expanded(
            child: BlocBuilder<RingtoneSearchBloc, RingtoneSearchState>(
              builder: (context, state) => switch (state.status) {
                RingtoneSearchStatus.idle ||
                RingtoneSearchStatus.loading =>
                  const Center(
                    key: Key('ringtone-search-skeleton'),
                    child: CircularProgressIndicator(),
                  ),
                RingtoneSearchStatus.error => RingtoneMessageState(
                    stateKey: const Key('ringtone-search-error'),
                    message: "Couldn't load ringtones.",
                    retryKey: const Key('ringtone-search-retry'),
                    onRetry: () => context
                        .read<RingtoneSearchBloc>()
                        .add(const RingtoneSearchRetryRequested()),
                  ),
                RingtoneSearchStatus.empty => const RingtoneMessageState(
                    stateKey: Key('ringtone-search-empty'),
                    message: 'No results found',
                  ),
                RingtoneSearchStatus.loaded => RingtoneGrid(
                    controller: _scroll,
                    items: state.items,
                    onCardTap: (item, index) =>
                        buildRingtoneTapHandler(context, ref).handleCardTap(
                      item: item,
                      index: index,
                      sourceScreen: 'ringtone_search',
                      // Row 115 `selection_source: search` — distinguishes
                      // search taps from the home listing grid.
                      selectionSource: 'search',
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
