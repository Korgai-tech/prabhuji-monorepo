import 'package:meta/meta.dart';

import '../../data/wallpaper_models.dart';

enum WallpaperHomeStatus { loading, loaded, empty, error }

/// Single-class Home state. [rows] are the VISIBLE rows (non-empty; empty rows
/// and the Liked row when the user has no likes are already dropped). Changing
/// the deity filter reloads from scratch.
@immutable
class WallpaperHomeState {
  const WallpaperHomeState({
    this.status = WallpaperHomeStatus.loading,
    this.rows = const [],
    this.selectedDeityId,
    this.selectedDeityName,
    this.message,
  });

  final WallpaperHomeStatus status;
  final List<WallpaperHomeRowData> rows;

  /// `null` == "All Gods" (the default, no filter).
  final String? selectedDeityId;
  final String? selectedDeityName;
  final String? message;
}
