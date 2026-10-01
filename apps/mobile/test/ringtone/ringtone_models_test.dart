import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/ringtone/data/ringtone_models.dart';

/// Indian compact-count formatter (TAM-68 §DP / Figma "5.8L", "1.5k", "99").
void main() {
  group('formatIndianCompactCount', () {
    test('plain below 1000', () {
      expect(formatIndianCompactCount(0), '0');
      expect(formatIndianCompactCount(99), '99');
      expect(formatIndianCompactCount(999), '999');
    });

    test('thousands use k', () {
      expect(formatIndianCompactCount(1000), '1k');
      expect(formatIndianCompactCount(1500), '1.5k');
      expect(formatIndianCompactCount(8500), '8.5k');
      expect(formatIndianCompactCount(85400), '85.4k');
    });

    test('lakhs use L', () {
      expect(formatIndianCompactCount(100000), '1L');
      expect(formatIndianCompactCount(150000), '1.5L');
      expect(formatIndianCompactCount(580000), '5.8L');
      expect(formatIndianCompactCount(1020000), '10.2L');
    });

    test('trailing .0 trimmed, negatives floored', () {
      expect(formatIndianCompactCount(2000), '2k');
      expect(formatIndianCompactCount(-5), '0');
    });
  });

  group('RingtoneDetailData', () {
    test('isPlayableNow reflects the server URL gate', () {
      const gated = RingtoneDetailData(
        id: 'r1',
        title: 't',
        thumbnailImageUrl: '',
        audioUrl: null,
        playCount: 0,
        setCount: 0,
        likeCount: 0,
        shareCount: 0,
        likedByMe: false,
        deityId: 'd',
        deityName: 'D',
      );
      expect(gated.isPlayableNow, isFalse);
      expect(gated.toAudioItem().audioUrl, isEmpty);

      const pro = RingtoneDetailData(
        id: 'r1',
        title: 't',
        thumbnailImageUrl: 'thumb',
        audioUrl: 'https://s/r1.mp3',
        playCount: 0,
        setCount: 0,
        likeCount: 0,
        shareCount: 0,
        likedByMe: false,
        deityId: 'd',
        deityName: 'D',
      );
      expect(pro.isPlayableNow, isTrue);
      expect(pro.heroImageUrl, 'thumb');
    });
  });
}
