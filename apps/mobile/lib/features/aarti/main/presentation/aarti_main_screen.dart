import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../api/generated/openapi.dart';
import '../../../../core/analytics.dart';
import '../../../../core/theme.dart';
import '../../../../state/providers.dart';
import '../../../../shared/widgets/deity_filter_row.dart';
import '../../aarti_analytics.dart';
import '../../application/aarti_navigation.dart';
import '../../data/aarti_models.dart';
import '../../presentation/aarti_mini_player_host.dart';
import '../../presentation/aarti_widgets.dart';
import '../bloc/aarti_main_bloc.dart';
import '../bloc/aarti_main_event.dart';
import '../bloc/aarti_main_state.dart';

/// Aarti & Bhajans main page (Figma 412:2656). Vertically-scrollable
/// [CustomScrollView] with sections in order: Recently Played, Deities, Browse
/// Categories, Newly Added, Most Played. Discovery is FREE — no lock/Pro badges
/// anywhere (§5, §10). Only an audio-item tap gates.
class AartiMainScreen extends ConsumerWidget {
  const AartiMainScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      key: const Key('aarti-main-screen'),
      backgroundColor: AppColors.cardSurface,
      body: Column(
        children: [
          const AartiTopNav(title: 'Aarti & Bhajans'),
          Expanded(
            child: BlocBuilder<AartiMainBloc, AartiMainState>(
              builder: (context, state) => switch (state) {
                AartiMainLoading() => const _MainSkeleton(),
                AartiMainError() => _MainError(
                    onRetry: () => context
                        .read<AartiMainBloc>()
                        .add(const AartiMainRetryRequested()),
                  ),
                AartiMainLoaded(:final visibleSections) =>
                  _MainContent(sections: visibleSections),
              },
            ),
          ),
        ],
      ),
      // Mini-player persists in-app so Pro playback stays visible while browsing
      // (module is full-screen over the shell). Renders itself only when active.
      // `SafeArea(top: false)` clears the Android gesture-nav / on-screen
      // system-bar inset. Without it the mini-player's 64px chrome would sit
      // flush against the physical bottom of the screen and disappear under
      // the OS nav bar on edge-to-edge displays (Android 15+). The shell
      // doesn't need this because its bottom-nav already wraps in SafeArea
      // and the mini-player sits on top of it in the shell's Column.
      bottomNavigationBar: const SafeArea(
        top: false,
        child: AartiMiniPlayerHost(),
      ),
    );
  }
}

class _MainContent extends ConsumerWidget {
  const _MainContent({required this.sections});
  final List<AartiSectionData> sections;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return CustomScrollView(
      key: const Key('aarti-main-scroll'),
      slivers: [
        for (final section in sections)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.only(
                left: AppAarti.screenPadding,
                right: AppAarti.screenPadding,
                top: AppAarti.sectionGap,
              ),
              child: _Section(section: section),
            ),
          ),
        const SliverToBoxAdapter(child: SizedBox(height: AppAarti.sectionGap)),
      ],
    );
  }
}

class _Section extends ConsumerWidget {
  const _Section({required this.section});
  final AartiSectionData section;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      key: Key('aarti-section-$_keySuffix'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AartiSectionHeader(
          title: section.title,
          showAllKey:
              _showAll == null ? null : Key('aarti-showall-$_keySuffix'),
          onShowAll: _showAll == null ? null : () => _onShowAll(context, ref),
        ),
        const SizedBox(height: AppAarti.sectionHeaderGap),
        _content(context, ref),
      ],
    );
  }

  /// Widget-key suffix. Built-in types key on the type (one row each, and the
  /// Figma cross-check maps those names); a curated section keys on its id
  /// because a page can carry many of them (TAM-160).
  String get _keySuffix => section.type == AartiSectionType.curated
      ? 'curated-${section.sectionId}'
      : section.type.name;

  /// Show-all listing query per section (null → no Show all, e.g. deities/categories).
  ///
  /// The listing's TITLE is the server's `section.title` — the same string the
  /// header above already renders — so the listing can never disagree with the
  /// section that opened it. `sourceListType`/`section` stay client-side: those are
  /// the QUERY (analytics + which endpoint to page), not content. There is no
  /// `sort`: the flat listing is a server-side stable shuffle, so Newly Added /
  /// Most Played Show-all load that flat list; only Recently Played still reads
  /// the caller's history (via the `recentlyPlayed` section filter).
  AartiListQuery? get _showAll {
    switch (section.type) {
      case AartiSectionType.recentlyPlayed:
        return AartiListQuery(
          title: section.title,
          sourceListType: 'recently_played',
          section: AartiListSection.recentlyPlayed,
        );
      case AartiSectionType.newlyAdded:
        return AartiListQuery(
          title: section.title,
          sourceListType: 'newly_added',
          section: AartiListSection.newlyAdded,
        );
      case AartiSectionType.mostPlayed:
        return AartiListQuery(
          title: section.title,
          sourceListType: 'most_played',
          section: AartiListSection.mostPlayed,
        );
      // Curated pages by its OWN id, not by `sectionType` — many curated
      // sections exist, so the type alone would be ambiguous (TAM-160).
      case AartiSectionType.curated:
        return AartiListQuery(
          title: section.title,
          sourceListType: _curatedSource,
          sectionId: section.sectionId,
          filterLabel: section.sectionId,
        );
      case AartiSectionType.deities:
      case AartiSectionType.browseCategories:
        return null;
    }
  }

  void _onShowAll(BuildContext context, WidgetRef ref) {
    unawaitedTrack(ref, AartiEvents.recentlyPlayedShowAllClicked, {
      'source_list_type': _showAll!.sourceListType,
      'source_filter': ?_showAll!.filterLabel,
    });
    pushAartiListing(context, _showAll!);
  }

  Widget _content(BuildContext context, WidgetRef ref) {
    switch (section.type) {
      case AartiSectionType.deities:
        return _DeitiesRow(deities: section.deities);
      case AartiSectionType.browseCategories:
        return _CategoriesGrid(categories: section.categories);
      // A curated section is just another horizontal audio row — the LAYOUT is
      // chosen by `sectionType`, never by the (editor-rewritable) title.
      case AartiSectionType.recentlyPlayed:
      case AartiSectionType.newlyAdded:
      case AartiSectionType.mostPlayed:
      case AartiSectionType.curated:
        return _AudioRow(
          audios: section.audios,
          sourceListType: switch (section.type) {
            AartiSectionType.recentlyPlayed => 'recently_played',
            AartiSectionType.newlyAdded => 'newly_added',
            AartiSectionType.curated => _curatedSource,
            _ => 'most_played',
          },
          sourceFilter: section.type == AartiSectionType.curated
              ? section.sectionId
              : null,
        );
    }
  }
}

/// Analytics `source_list_type` for a CMS-curated section (TAM-160); its
/// `source_filter` is the section id.
const String _curatedSource = 'curated';

class _AudioRow extends ConsumerWidget {
  const _AudioRow({
    required this.audios,
    required this.sourceListType,
    this.sourceFilter,
  });
  final List<AartiAudio> audios;
  final String sourceListType;
  final String? sourceFilter;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SizedBox(
      height: 127,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: audios.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppAarti.hCardGap),
        itemBuilder: (context, i) => AartiAudioCard(
          audio: audios[i],
          onTap: () => buildAartiTapHandler(context, ref).handleTap(
            audio: audios[i],
            queue: audios,
            index: i,
            sourceListType: sourceListType,
            sourceFilter: sourceFilter,
          ),
        ),
      ),
    );
  }
}

class _DeitiesRow extends ConsumerWidget {
  const _DeitiesRow({required this.deities});
  final List<AartiDeity> deities;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // The section's deity cards drive the shared TAM-58 DeityFilterRow. Tapping a
    // deity opens the filtered listing (NOT the paywall — discovery is free).
    final views = <DeityView>[
      for (var i = 0; i < deities.length; i++) deities[i].toDeityView(i),
    ];
    return DeityFilterRow(
      deities: AsyncValue.data(views),
      selectedSlug: null,
      onSelected: (slug) {
        if (slug == null) return;
        final positionIndex = deities.indexWhere((d) => d.slug == slug);
        final deity = deities[positionIndex];
        unawaitedTrack(ref, AartiEvents.deityClicked, {
          'deity_slug': slug,
          AartiEventProps.positionIndex: positionIndex,
        });
        pushAartiListing(
          context,
          AartiListQuery(
            title: deity.displayName,
            sourceListType: 'deity',
            deityId: slug,
            filterLabel: slug,
          ),
        );
      },
    );
  }
}

class _CategoriesGrid extends ConsumerWidget {
  const _CategoriesGrid({required this.categories});
  final List<AartiCategory> categories;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      itemCount: categories.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: AppAarti.gridGap,
        crossAxisSpacing: AppAarti.gridGap,
        mainAxisExtent: AppAarti.categoryCardHeight,
      ),
      itemBuilder: (context, i) => AartiCategoryTile(
        category: categories[i],
        onTap: () {
          unawaitedTrack(ref, AartiEvents.categoryClicked, {
            'category_id': categories[i].id,
            'category_slug': categories[i].slug,
            AartiEventProps.positionIndex: i,
          });
          pushAartiListing(
            context,
            AartiListQuery(
              title: categories[i].name,
              sourceListType: 'category',
              categoryId: categories[i].id,
              filterLabel: categories[i].slug,
            ),
          );
        },
      ),
    );
  }
}

class _MainSkeleton extends StatelessWidget {
  const _MainSkeleton();
  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator());
}

class _MainError extends StatelessWidget {
  const _MainError({required this.onRetry});
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) {
    return Center(
      key: const Key('aarti-main-error'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Could not load Aarti & Bhajans.',
            style: AppText.bodyMd(color: AppColors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.medium),
          TextButton(
            key: const Key('aarti-main-retry'),
            onPressed: onRetry,
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

/// Fire-and-forget analytics helper for tap surfaces on this screen.
void unawaitedTrack(WidgetRef ref, String name, Map<String, Object?> props) {
  final Analytics? a = ref.read(analyticsProvider);
  if (a == null) return;
  // ignore: discarded_futures
  a.trackEvent(name, properties: props);
}
