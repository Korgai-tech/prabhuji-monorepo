import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/wallpaper/home/bloc/wallpaper_home_bloc.dart';
import 'package:mobile/features/wallpaper/home/bloc/wallpaper_home_event.dart';
import 'package:mobile/features/wallpaper/home/bloc/wallpaper_home_state.dart';

import '../support/fake_repositories.dart';

void main() {
  group('WallpaperHomeBloc', () {
    test('loads rows; hides the Liked row when the user has no likes', () async {
      final repo = FakeWallpaperRepository(likedEmpty: true);
      final bloc = WallpaperHomeBloc(repository: repo)
        ..add(const WallpaperHomeLoadRequested());

      final loaded = await bloc.stream
          .firstWhere((s) => s.status == WallpaperHomeStatus.loaded);

      final titles = loaded.rows.map((r) => r.title).toList();
      expect(titles, contains('Top Live Wallpapers'));
      expect(titles, isNot(contains('Liked Wallpaper')));
      await bloc.close();
    });

    test('keeps the Liked row when it has items', () async {
      final repo = FakeWallpaperRepository();
      final bloc = WallpaperHomeBloc(repository: repo)
        ..add(const WallpaperHomeLoadRequested());

      final loaded = await bloc.stream
          .firstWhere((s) => s.status == WallpaperHomeStatus.loaded);

      expect(loaded.rows.map((r) => r.title), contains('Liked Wallpaper'));
      await bloc.close();
    });

    test('empty when no visible rows', () async {
      final repo = FakeWallpaperRepository(rows: const []);
      final bloc = WallpaperHomeBloc(repository: repo)
        ..add(const WallpaperHomeLoadRequested());

      final s = await bloc.stream
          .firstWhere((s) => s.status == WallpaperHomeStatus.empty);
      expect(s.status, WallpaperHomeStatus.empty);
      await bloc.close();
    });

    test('deity filter re-fetches home with the deityId', () async {
      final repo = FakeWallpaperRepository();
      final bloc = WallpaperHomeBloc(repository: repo)
        ..add(const WallpaperHomeLoadRequested());
      await bloc.stream.firstWhere((s) => s.status == WallpaperHomeStatus.loaded);

      bloc.add(const WallpaperHomeDeitySelected(
        deityId: 'durga',
        deityName: 'Durga Ma',
      ));
      final filtered = await bloc.stream.firstWhere(
        (s) => s.selectedDeityId == 'durga' &&
            s.status == WallpaperHomeStatus.loaded,
      );

      expect(repo.lastHomeDeityId, 'durga');
      expect(filtered.selectedDeityName, 'Durga Ma');
      await bloc.close();
    });

    test('total failure → error, retry reloads', () async {
      final repo = FakeWallpaperRepository(failHome: true);
      final bloc = WallpaperHomeBloc(repository: repo)
        ..add(const WallpaperHomeLoadRequested());
      await bloc.stream.firstWhere((s) => s.status == WallpaperHomeStatus.error);

      repo.failHome = false;
      bloc.add(const WallpaperHomeRetryRequested());
      final s = await bloc.stream
          .firstWhere((s) => s.status == WallpaperHomeStatus.loaded);
      expect(s.rows, isNotEmpty);
      await bloc.close();
    });
  });
}
