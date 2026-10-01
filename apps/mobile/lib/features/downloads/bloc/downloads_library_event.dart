import 'package:equatable/equatable.dart';

import '../domain/downloads_filter.dart';

sealed class DownloadsLibraryEvent extends Equatable {
  const DownloadsLibraryEvent();
  @override
  List<Object?> get props => const <Object?>[];
}

class DownloadsLibraryStarted extends DownloadsLibraryEvent {
  const DownloadsLibraryStarted();
}

class DownloadsLibraryFilterChanged extends DownloadsLibraryEvent {
  const DownloadsLibraryFilterChanged(this.filter);
  final DownloadsFilter filter;
  @override
  List<Object?> get props => <Object?>[filter];
}

class DownloadsLibrarySnapshotObserved extends DownloadsLibraryEvent {
  const DownloadsLibrarySnapshotObserved();
}

class DownloadsLibraryOfflineChanged extends DownloadsLibraryEvent {
  const DownloadsLibraryOfflineChanged(this.isOffline);
  final bool isOffline;
  @override
  List<Object?> get props => <Object?>[isOffline];
}
