import 'package:equatable/equatable.dart';

import '../../data/status_models.dart';

enum StatusFeedStatus { initial, loading, ready, failure }

/// State for the Status feed (TAM-72).
class StatusFeedState extends Equatable {
  const StatusFeedState({
    this.status = StatusFeedStatus.initial,
    this.items = const [],
    this.activeIndex = 0,
    this.deitySlug,
    this.nextCursor,
    this.loadingMore = false,
    this.profile = StatusProfileData.empty,
    this.viewedIds = const {},
    this.errorMessage,
    this.pinnedStatusId,
  });

  final StatusFeedStatus status;
  final List<StatusFeedItem> items;
  final int activeIndex;

  /// `null` == All Gods (no filter).
  final String? deitySlug;
  final String? nextCursor;
  final bool loadingMore;

  /// The ONE profile driving the overlay across every card.
  final StatusProfileData profile;


  /// Cards that already fired `status_card_viewed` — the 2s threshold counts
  /// once per card, not once per swipe back (q5).
  final Set<String> viewedIds;

  final String? errorMessage;

  /// The status id the caller (e.g. chat status-card tap) asked us to pin at
  /// the top of the feed (TAM-166). Passed as `pinnedId` on the FIRST
  /// `fetchFeed` call only; retained here across the state's lifetime for
  /// audit/debug + so a `StatusFeedRefreshRequested` (future) can decide
  /// whether to keep or drop it. Cursor pages never re-send it (defense in
  /// depth — the backend also ignores it on cursor pages).
  final String? pinnedStatusId;

  bool get isLoading => status == StatusFeedStatus.loading;
  bool get isEmpty => status == StatusFeedStatus.ready && items.isEmpty;
  bool get hasMore => (nextCursor ?? '').isNotEmpty;

  /// The card currently in view (drives the overlay preview + engagement + share).
  StatusFeedItem? get activeItem {
    if (activeIndex < 0 || activeIndex >= items.length) return null;
    return items[activeIndex];
  }

  /// The band the active card composites its overlay within — the item's live
  /// safe area, falling back to Figma's.
  StatusSafeArea get activeSafeArea {
    final item = activeItem;
    if (item == null) return StatusSafeArea.figmaDefault;
    return item.overlaySafeArea.orFigmaDefault;
  }

  StatusFeedState copyWith({
    StatusFeedStatus? status,
    List<StatusFeedItem>? items,
    int? activeIndex,
    String? deitySlug,
    bool clearDeity = false,
    String? nextCursor,
    bool clearCursor = false,
    bool? loadingMore,
    StatusProfileData? profile,
    Set<String>? viewedIds,
    String? errorMessage,
    bool clearError = false,
    String? pinnedStatusId,
  }) =>
      StatusFeedState(
        status: status ?? this.status,
        items: items ?? this.items,
        activeIndex: activeIndex ?? this.activeIndex,
        deitySlug: clearDeity ? null : (deitySlug ?? this.deitySlug),
        nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
        loadingMore: loadingMore ?? this.loadingMore,
        profile: profile ?? this.profile,
        viewedIds: viewedIds ?? this.viewedIds,
        errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
        pinnedStatusId: pinnedStatusId ?? this.pinnedStatusId,
      );

  @override
  List<Object?> get props => [
        status,
        items,
        activeIndex,
        deitySlug,
        nextCursor,
        loadingMore,
        profile,
        viewedIds,
        errorMessage,
        pinnedStatusId,
      ];
}
