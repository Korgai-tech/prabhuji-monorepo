import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/wallpaper/listing/bloc/wallpaper_list_bloc.dart';
import 'package:mobile/features/wallpaper/listing/bloc/wallpaper_list_event.dart';
import 'package:mobile/features/wallpaper/listing/bloc/wallpaper_list_state.dart';
import 'package:mobile/features/wallpaper/wallpaper_routes.dart';

import '../support/fake_repositories.dart';

void main() {
  group('WallpaperListBloc', () {
    const query = WallpaperListQuery(title: 'Durga Ma Wallpapers', deityId: 'durga');

    test('loads the first page', () async {
      final repo = FakeWallpaperRepository(pageSize: 8);
      final bloc = WallpaperListBloc(repository: repo, query: query)
        ..add(const WallpaperListLoadRequested());

      final s = await bloc.stream
          .firstWhere((s) => s.status == WallpaperListStatus.loaded);
      expect(s.items.length, 8);
      expect(s.hasMore, isTrue);
      expect(repo.lastListDeityId, 'durga');
      await bloc.close();
    });

    test('paginates via cursor', () async {
      final repo = FakeWallpaperRepository(pageSize: 8);
      final bloc = WallpaperListBloc(repository: repo, query: query)
        ..add(const WallpaperListLoadRequested());
      await bloc.stream.firstWhere((s) => s.status == WallpaperListStatus.loaded);

      bloc.add(const WallpaperListNextPageRequested());
      final s = await bloc.stream.firstWhere((s) => s.items.length > 8);
      expect(s.items.length, 15);
      expect(s.hasMore, isFalse);
      await bloc.close();
    });

    test('empty listing → empty state', () async {
      final repo = FakeWallpaperRepository(
        emptyDeityId: 'durga',
        rows: const [],
      );
      final bloc = WallpaperListBloc(repository: repo, query: query)
        ..add(const WallpaperListLoadRequested());
      final s = await bloc.stream
          .firstWhere((s) => s.status == WallpaperListStatus.empty);
      expect(s.status, WallpaperListStatus.empty);
      await bloc.close();
    });

    test('row query passes rowId', () async {
      final repo = FakeWallpaperRepository();
      const rowQuery =
          WallpaperListQuery(title: 'Trending Wallpaper', rowId: 'row-trending');
      final bloc = WallpaperListBloc(repository: repo, query: rowQuery)
        ..add(const WallpaperListLoadRequested());
      await bloc.stream.firstWhere((s) => s.status == WallpaperListStatus.loaded);
      expect(repo.lastListRowId, 'row-trending');
      await bloc.close();
    });

    test('failure → error, retry reloads', () async {
      final repo = FakeWallpaperRepository(failList: true);
      final bloc = WallpaperListBloc(repository: repo, query: query)
        ..add(const WallpaperListLoadRequested());
      await bloc.stream.firstWhere((s) => s.status == WallpaperListStatus.error);

      repo.failList = false;
      bloc.add(const WallpaperListRetryRequested());
      final s = await bloc.stream
          .firstWhere((s) => s.status == WallpaperListStatus.loaded);
      expect(s.items, isNotEmpty);
      await bloc.close();
    });
  });
}
