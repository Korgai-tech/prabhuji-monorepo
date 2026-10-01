import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/wallpaper/data/wallpaper_models.dart';

import '../support/fake_repositories.dart';

void main() {
  group('formatWallpaperCount', () {
    test('plain / k / L thresholds', () {
      expect(formatWallpaperCount(0), '0');
      expect(formatWallpaperCount(999), '999');
      expect(formatWallpaperCount(1000), '1k');
      expect(formatWallpaperCount(12500), '12.5k');
      expect(formatWallpaperCount(3200), '3.2k');
      expect(formatWallpaperCount(150000), '1.5L');
      expect(formatWallpaperCount(-5), '0');
    });
  });

  group('WallpaperMediaType.fromWire', () {
    test('maps wire strings', () {
      expect(WallpaperMediaType.fromWire('live'), WallpaperMediaType.live);
      expect(WallpaperMediaType.fromWire('static'), WallpaperMediaType.static_);
      expect(WallpaperMediaType.fromWire('unknown'), WallpaperMediaType.static_);
    });
  });

  group('WallpaperHomeData.visibleRows', () {
    test('drops empty rows, preserves order', () {
      final rows = wallpaperHomeRowsFixture(likedEmpty: true);
      final data = WallpaperHomeData(rows: rows);
      expect(data.visibleRows.map((r) => r.rowType),
          ['top_live', 'new', 'trending']);
    });
  });

  group('WallpaperDetailData asset resolution', () {
    test('static uses the merged preview image; live uses the fallback frame',
        () {
      final staticDetail = wallpaperDetailFixture(
        'wp1',
        previewImageUrl: 'https://cdn/preview/wp1.jpg',
      );
      expect(staticDetail.staticApplyUrl, 'https://cdn/preview/wp1.jpg');

      final liveDetail = wallpaperDetailFixture('live1', live: true);
      expect(liveDetail.liveFrameUrl, 'https://cdn/frame/live1.jpg');
      expect(liveDetail.isLive, isTrue);
    });
  });
}
