import 'package:meta/meta.dart';

import '../../data/ringtone_models.dart';

enum RingtoneHomeStatus { loading, loaded, empty, error }

/// Single-class Home state (keyset pagination + in-place deity filter).
/// [items] accumulate across pages within the current [selectedDeityId] filter;
/// changing the filter reloads from scratch. [empty] copy differs by filter
/// (whole grid vs a deity with no ringtones) but both read "No ringtones found".
@immutable
class RingtoneHomeState {
  const RingtoneHomeState({
    this.status = RingtoneHomeStatus.loading,
    this.items = const [],
    this.nextCursor,
    this.loadingMore = false,
    this.selectedDeityId,
    this.selectedDeityName,
    this.message,
  });

  final RingtoneHomeStatus status;
  final List<RingtoneCardItem> items;
  final String? nextCursor;
  final bool loadingMore;

  /// `null` == "All Gods" (the default, no filter).
  final String? selectedDeityId;
  final String? selectedDeityName;
  final String? message;

  bool get hasMore => (nextCursor ?? '').isNotEmpty;

  RingtoneHomeState copyWith({
    RingtoneHomeStatus? status,
    List<RingtoneCardItem>? items,
    String? nextCursor,
    bool clearCursor = false,
    bool? loadingMore,
    String? selectedDeityId,
    String? selectedDeityName,
    bool clearDeity = false,
    String? message,
  }) =>
      RingtoneHomeState(
        status: status ?? this.status,
        items: items ?? this.items,
        nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
        loadingMore: loadingMore ?? this.loadingMore,
        selectedDeityId: clearDeity ? null : (selectedDeityId ?? this.selectedDeityId),
        selectedDeityName:
            clearDeity ? null : (selectedDeityName ?? this.selectedDeityName),
        message: message ?? this.message,
      );
}
