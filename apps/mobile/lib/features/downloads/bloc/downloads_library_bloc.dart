// Named ctor kept explicit — see the equivalent note on the top-level
// analytics.dart file.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../data/download_manager.dart';
import '../domain/content_type.dart';
import '../domain/download_state.dart';
import '../domain/downloads_filter.dart';
import 'downloads_library_event.dart';
import 'downloads_library_state.dart';

/// State-holder for the Downloads library screen (TAM-125). Subscribes to
/// the [DownloadManager]'s snapshot stream and folds each snapshot into a
/// [DownloadsLibraryState] the UI renders from. Also carries the current
/// offline flag so the offline banner and hidden-streaming rules live in
/// one place.
class DownloadsLibraryBloc
    extends Bloc<DownloadsLibraryEvent, DownloadsLibraryState> {
  DownloadsLibraryBloc({required DownloadManager manager})
      : _manager = manager,
        super(const DownloadsLibraryState.empty()) {
    on<DownloadsLibraryStarted>(_onStarted);
    on<DownloadsLibraryFilterChanged>(_onFilterChanged);
    on<DownloadsLibrarySnapshotObserved>(_onSnapshotObserved);
    on<DownloadsLibraryOfflineChanged>(_onOfflineChanged);
  }

  final DownloadManager _manager;
  StreamSubscription<DownloadManagerSnapshot>? _sub;

  Future<void> _onStarted(
    DownloadsLibraryStarted event,
    Emitter<DownloadsLibraryState> emit,
  ) async {
    // Seed with the manager's current snapshot so the first frame doesn't
    // render "empty" for an already-populated library.
    _apply(emit, _manager.snapshot);
    _sub ??= _manager.snapshots.listen((snapshot) {
      // Re-dispatch through the bloc so a snapshot arriving while we're
      // in the middle of another handler is folded via the normal
      // event pipeline.
      add(const DownloadsLibrarySnapshotObserved());
    });
  }

  void _onSnapshotObserved(
    DownloadsLibrarySnapshotObserved event,
    Emitter<DownloadsLibraryState> emit,
  ) {
    _apply(emit, _manager.snapshot);
  }

  void _onFilterChanged(
    DownloadsLibraryFilterChanged event,
    Emitter<DownloadsLibraryState> emit,
  ) {
    emit(state.copyWith(filter: event.filter));
  }

  void _onOfflineChanged(
    DownloadsLibraryOfflineChanged event,
    Emitter<DownloadsLibraryState> emit,
  ) {
    if (state.isOffline == event.isOffline) return;
    emit(state.copyWith(isOffline: event.isOffline));
  }

  void _apply(
    Emitter<DownloadsLibraryState> emit,
    DownloadManagerSnapshot snapshot,
  ) {
    // Include every "known" contentId in the library rendering — completed
    // AND in-flight (queued / downloading / failed). The library row's own
    // trailing widget renders the state variant.
    final byId = <String, DownloadItem>{...snapshot.items};
    for (final entry in snapshot.states.entries) {
      final id = entry.key;
      final s = entry.value;
      final existing = byId[id];
      if (existing != null) {
        byId[id] = existing.copyWith(state: s);
      }
    }
    final items = byId.values.toList(growable: false);
    var aarti = 0;
    var bhajan = 0;
    var mantra = 0;
    for (final it in items) {
      switch (it.contentType) {
        case DownloadContentType.aarti:
          aarti += 1;
        case DownloadContentType.bhajan:
          bhajan += 1;
        case DownloadContentType.mantra:
          mantra += 1;
      }
    }
    emit(state.copyWith(
      items: items,
      counts: DownloadsFilterCounts(
        all: items.length,
        aarti: aarti,
        bhajan: bhajan,
        mantra: mantra,
      ),
    ));
  }

  @override
  Future<void> close() async {
    await _sub?.cancel();
    return super.close();
  }
}
