import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../api/generated/openapi.dart';
import '../../../../core/analytics.dart';
import '../../../../core/theme.dart';
import '../../../../shared/widgets/deity_filter_row.dart';
import '../../../../state/providers.dart';
import '../../application/mantras_navigation.dart';
import '../../data/mantras_models.dart';
import '../../mantras_analytics.dart';
import '../../presentation/mantras_mini_player_host.dart';
import '../../presentation/mantras_widgets.dart';
import '../bloc/mantras_main_bloc.dart';
import '../bloc/mantras_main_event.dart';
import '../bloc/mantras_main_state.dart';

/// Mantras & Stutis main page (Figma 425:4944). Vertically-scrollable
/// [CustomScrollView] with sections in server order: Recently Played (hidden
/// when the API returns no history), Mantras of Deities (DeityFilterRow chips),
/// Browse Categories (2-col grid), Newly Added. Discovery is FREE — no lock/Pro
/// badges anywhere (§5, §10); module entry NEVER shows a paywall. Only a card
/// tap gates (broadly: audio, deity AND category — §5).
class MantrasMainScreen extends ConsumerWidget {
  const MantrasMainScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      key: const Key('mantras-main-screen'),
      backgroundColor: AppColors.cardSurface,
      body: Column(
        children: [
          const MantrasTopNav(title: 'Mantras & Stutis'),
          Expanded(
            child: BlocBuilder<MantrasMainBloc, MantrasMainState>(
              builder: (context, state) => switch (state) {
                MantrasMainLoading() => const _MainSkeleton(),
                MantrasMainError() => _MainError(
                    onRetry: () => context
                        .read<MantrasMainBloc>()
                        .add(const MantrasMainRetryRequested()),
                  ),
                MantrasMainLoaded(:final visibleSections, :final isAllEmpty) =>
                  isAllEmpty
                      ? _MainEmpty(
                          onRetry: () => context
                              .read<MantrasMainBloc>()
                              .add(const MantrasMainRetryRequested()),
                        )
                      : _MainContent(sections: visibleSections),
              },
            ),
          ),
        ],
      ),
      // `SafeArea(top: false)` clears the Android gesture-nav / on-screen
      // system-bar inset. Without it the mini-player's 64px chrome would sit
      // flush against the physical bottom of the screen and disappear under
      // the OS nav bar on edge-to-edge displays (Android 15+). The shell
      // doesn't need this because its bottom-nav already wraps in SafeArea
      // and the mini-player sits on top of it in the shell's Column.
      bottomNavigationBar: const SafeArea(
        top: false,
        child: MantrasMiniPlayerHost(),
      ),
    );
  }
}

class _MainContent extends ConsumerWidget {
  const _MainContent({required this.sections});
  final List<MantraSectionData> sections;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return CustomScrollView(
      key: const Key('mantras-main-scroll'),
      slivers: [
        for (final section in sections)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.only(
                left: AppMantras.screenPadding,
                right: AppMantras.screenPadding,
                top: AppMantras.sectionGap,
              ),
              child: _Section(section: section),
            ),
          ),
        const SliverToBoxAdapter(child: SizedBox(height: AppMantras.sectionGap)),
      ],
    );
  }
}

class _Section extends ConsumerWidget {
  const _Section({required this.section});
  final MantraSectionData section;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      key: Key('mantras-section-$_keySuffix'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        MantrasSectionHeader(
          title: section.title,
          showAllKey:
              _showAll == null ? null : Key('mantras-showall-$_keySuffix'),
          onShowAll: _showAll == null ? null : () => _onShowAll(context, ref),
        ),
        const SizedBox(height: AppMantras.sectionHeaderGap),
        _content(context, ref),
      ],
    );
  }

  /// Widget-key suffix. Built-in types key on the type (one row each, and the
  /// Figma cross-check maps those names); a curated section keys on its id
  /// because a page can carry many of them (TAM-160).
  String get _keySuffix => section.type == MantraSectionType.curated
      ? 'curated-${section.sectionId}'
      : section.type.name;

  /// Show-all listing query per section (null → no Show all: deities/categories,
  /// or an audio section whose `showAllEnabled` is false).
  MantraListQuery? get _showAll {
    if (!section.showAllEnabled) return null;
    switch (section.type) {
      case MantraSectionType.recentlyPlayed:
        return MantraListQuery(
          title: section.title,
          sourceListType: 'recently_played',
          section: MantraListSection.recentlyPlayed,
        );
      case MantraSectionType.newlyAdded:
        return MantraListQuery(
          title: section.title,
          sourceListType: 'newly_added',
          section: MantraListSection.newlyAdded,
        );
      // Curated pages by its OWN id, not by `sectionType` — many curated
      // sections exist, so the type alone would be ambiguous (TAM-160).
      case MantraSectionType.curated:
        return MantraListQuery(
          title: section.title,
          sourceListType: _curatedSource,
          sectionId: section.sectionId,
        );
      case MantraSectionType.deities:
      case MantraSectionType.categories:
        return null;
    }
  }

  void _onShowAll(BuildContext context, WidgetRef ref) {
    // Sheet 1 row 65 — `mantras_recently_played_show_all_clicked` is the only
    // Show-all event the contract defines for this module (there is no
    // sheet-level Newly Added Show-all event; that CTA still navigates, it
    // just doesn't emit an event of its own).
    if (section.type == MantraSectionType.recentlyPlayed) {
      _track(ref, MantrasEvents.recentlyPlayedShowAllClicked, const {});
    }
    pushMantrasListing(context, _showAll!);
  }

  Widget _content(BuildContext context, WidgetRef ref) {
    switch (section.type) {
      case MantraSectionType.deities:
        return _DeitiesRow(deities: section.deities);
      case MantraSectionType.categories:
        return _CategoriesGrid(categories: section.categories);
      // A curated section is just another horizontal audio row — the LAYOUT is
      // chosen by `sectionType`, never by the (editor-rewritable) title.
      case MantraSectionType.recentlyPlayed:
      case MantraSectionType.newlyAdded:
      case MantraSectionType.curated:
        return _AudioRow(
          audios: section.audios,
          sourceSection: switch (section.type) {
            MantraSectionType.recentlyPlayed => 'recently_played',
            MantraSectionType.curated => _curatedSource,
            _ => 'newly_added',
          },
        );
    }
  }
}

/// Analytics `selection_source` for a CMS-curated section (TAM-160). This module
/// has no `source_filter` property in the analytics contract, so the section id
/// is NOT emitted here — see `mantras_analytics.dart` (no invented properties).
const String _curatedSource = 'curated';

class _AudioRow extends ConsumerWidget {
  const _AudioRow({required this.audios, required this.sourceSection});
  final List<MantraAudio> audios;
  final String sourceSection;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SizedBox(
      height: 145,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: audios.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppMantras.hCardGap),
        itemBuilder: (context, i) => MantrasAudioCard(
          audio: audios[i],
          onTap: () => buildMantrasTapHandler(context, ref).handleAudioTap(
            item: audios[i],
            queue: audios,
            index: i,
            sourceSection: sourceSection,
          ),
        ),
      ),
    );
  }
}

class _DeitiesRow extends ConsumerWidget {
  const _DeitiesRow({required this.deities});
  final List<MantraDeity> deities;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Broad gate (§5): tapping a deity chip runs through PaywallGate — free →
    // paywall; Pro → open the player on the deity playlist's first item.
    final views = <DeityView>[
      for (var i = 0; i < deities.length; i++) deities[i].toDeityView(i),
    ];
    return DeityFilterRow(
      deities: AsyncValue.data(views),
      selectedSlug: null,
      onSelected: (slug) {
        if (slug == null) return;
        final index = deities.indexWhere((d) => d.slug == slug);
        final deity = deities[index];
        buildMantrasTapHandler(context, ref)
            .handleDeityTap(deity: deity, positionIndex: index);
      },
    );
  }
}

class _CategoriesGrid extends ConsumerWidget {
  const _CategoriesGrid({required this.categories});
  final List<MantraCategory> categories;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      itemCount: categories.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: AppMantras.gridGap,
        crossAxisSpacing: AppMantras.gridGap,
        mainAxisExtent: AppMantras.categoryCardHeight,
      ),
      itemBuilder: (context, i) => MantrasCategoryTile(
        category: categories[i],
        onTap: () {
          // Category card = navigate to the listing filtered by this category
          // (mirrors the Aarti module's category behaviour). The listing rows
          // themselves are what run through the broad Pro gate on a subsequent
          // tap — not the category card itself. Sheet 1 rows 64–85 have no
          // `mantras_category_clicked` event, so no analytics fires here; the
          // Browse Listing page-view (row 66) that follows carries the
          // category id via `browse_id`/`browse_type` instead.
          pushMantrasListing(
            context,
            MantraListQuery(
              title: categories[i].name,
              sourceListType: 'category',
              categoryId: categories[i].id,
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
      key: const Key('mantras-main-error'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Mantras abhi uplabdh nahi hain. Kripya thodi der baad phir dekhein.',
            textAlign: TextAlign.center,
            style: AppText.bodyMd(color: AppColors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.medium),
          TextButton(
            key: const Key('mantras-main-retry'),
            onPressed: onRetry,
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

class _MainEmpty extends StatelessWidget {
  const _MainEmpty({required this.onRetry});
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) {
    return Center(
      key: const Key('mantras-main-empty'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Mantras abhi uplabdh nahi hain. Kripya thodi der baad phir dekhein.',
            textAlign: TextAlign.center,
            style: AppText.bodyMd(color: AppColors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.medium),
          TextButton(
            key: const Key('mantras-empty-retry'),
            onPressed: onRetry,
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

/// Fire-and-forget analytics helper for tap surfaces on this screen.
void _track(WidgetRef ref, String name, Map<String, Object?> props) {
  final Analytics? a = ref.read(analyticsProvider);
  if (a == null) return;
  // ignore: discarded_futures
  a.trackEvent(name, properties: props);
}
