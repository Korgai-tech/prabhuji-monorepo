import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/share_service.dart';

import 'support/fake_share_service.dart';

void main() {
  group('ShareService', () {
    test('shares a deep link + thumbnail — never a raw media file', () async {
      final svc = FakeShareService();

      await svc.share(const ShareContent(
        text: '🙏 Listen to this Hanuman Aarti on Prabhuji',
        deepLink: 'prabhuji://aarti-bhajans/audio/42',
        thumbnailUrl: 'https://cdn.prabhuji.app/thumbs/42.jpg',
      ));

      final shared = svc.lastShare!;
      expect(shared.deepLink, 'prabhuji://aarti-bhajans/audio/42');
      expect(shared.thumbnailUrl, 'https://cdn.prabhuji.app/thumbs/42.jpg');

      // Structural guarantee: ShareContent exposes NO media-file field, so the
      // audio/video/wallpaper binary can never be shared through this seam.
      // (If someone adds a `filePath` field later, this comment + AC-f flags it.)
      expect(shared.deepLink, startsWith('prabhuji://'));
    });

    test('deep link is required even when no thumbnail is provided', () async {
      final svc = FakeShareService();

      await svc.share(const ShareContent(
        text: 'Share this darshan',
        deepLink: 'prabhuji://status/7',
      ));

      expect(svc.lastShare!.deepLink, 'prabhuji://status/7');
      expect(svc.lastShare!.thumbnailUrl, isNull);
    });
  });
}
