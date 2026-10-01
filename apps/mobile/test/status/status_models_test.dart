import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/features/status/data/status_models.dart';

import '../support/fake_repositories.dart';

/// Validation mirrors the TAM-71 Zod schema (apps/api/openapi.json →
/// `StatusProfileBody`): personalDisplayName ≤ 40, businessName ≤ 50,
/// businessDetails ≤ 80, businessMobileNumber `^[6-9]\d{9}$`. Every limit is
/// asserted at its BOUNDARY (n and n+1), because an off-by-one here means the
/// server rejects a save the client said was fine.
void main() {
  group('personal name (limit 40)', () {
    test('accepts exactly 40 chars, rejects 41', () {
      expect(validatePersonalName('a' * 40), isNull);
      expect(validatePersonalName('a' * 41), isNotNull);
    });

    test('is required — empty/blank is an error', () {
      expect(validatePersonalName(''), isNotNull);
      expect(validatePersonalName('   '), isNotNull);
      expect(validatePersonalName(null), isNotNull);
    });

    test('trims before measuring', () {
      expect(validatePersonalName('  ${'a' * 40}  '), isNull);
    });
  });

  group('business name (limit 50)', () {
    test('accepts exactly 50 chars, rejects 51', () {
      expect(validateBusinessName('b' * 50), isNull);
      expect(validateBusinessName('b' * 51), isNotNull);
    });

    test('is REQUIRED for a business save (PRD §6.6)', () {
      expect(validateBusinessName(''), isNotNull);
      expect(validateBusinessName(null), isNotNull);
    });
  });

  group('business details (limit 80)', () {
    test('accepts exactly 80 chars, rejects 81', () {
      expect(validateBusinessDetails('c' * 80), isNull);
      expect(validateBusinessDetails('c' * 81), isNotNull);
    });

    test('is optional', () {
      expect(validateBusinessDetails(''), isNull);
      expect(validateBusinessDetails(null), isNull);
    });
  });

  group('business mobile (Indian 10-digit ^[6-9]\\d{9}\$)', () {
    test('accepts a valid 10-digit number starting 6-9', () {
      for (final n in ['9876543210', '6000000000', '7123456789', '8999999999']) {
        expect(validateBusinessMobile(n), isNull, reason: n);
      }
    });

    test('rejects invalid numbers', () {
      final invalid = {
        '5876543210': 'starts below 6',
        '0876543210': 'starts with 0',
        '987654321': '9 digits',
        '98765432101': '11 digits',
        '98765 43210': 'contains a space',
        '+919876543210': 'country code',
        'abcdefghij': 'letters',
      };
      invalid.forEach((value, why) {
        expect(validateBusinessMobile(value), isNotNull, reason: why);
      });
    });

    test('is optional — blank is valid (no OTP, PRD §6.6)', () {
      expect(validateBusinessMobile(''), isNull);
      expect(validateBusinessMobile(null), isNull);
    });
  });

  group('overlay copy (TAM-168 — personal-only render)', () {
    test('personal profile renders the personal name as the overlay title', () {
      final p = statusPersonalProfileFixture();
      expect(p.overlayTitle, 'Aditya Nath');
      expect(p.hasNameOrPhoto, isTrue);
    });

    test('a grandfathered business profile is READ as personal — overlayTitle '
        'always comes from personalDisplayName, business fields are ignored',
        () {
      // The fixture ships personalDisplayName='Aditya Nath' plus business
      // fields — TAM-168 mobile always renders the personal face, so the
      // business copy is dead here.
      final p = statusBusinessProfileFixture();
      expect(p.overlayTitle, 'Aditya Nath');
    });

    test('a profile with only businessName saved (no personal name, no photo) '
        'has NO overlay content on mobile after TAM-168', () {
      const p = StatusProfileData(
        activeProfileType: StatusProfileType.business,
        businessName: 'Srinath Builders',
      );
      expect(p.overlayTitle, isNull);
      expect(p.hasNameOrPhoto, isFalse,
          reason: 'business fields no longer count — spec §PATH_DECISION');
    });

    test('an empty profile has no name/photo → prompt overlay', () {
      expect(StatusProfileData.empty.hasNameOrPhoto, isFalse);
      expect(StatusProfileData.empty.overlayTitle, isNull);
    });
  });

  group('hasNameOrPhoto (TAM-168)', () {
    test('neither name nor photo → false', () {
      const p =
          StatusProfileData(activeProfileType: StatusProfileType.personal);
      expect(p.hasNameOrPhoto, isFalse);
    });

    test('name only → true', () {
      const p = StatusProfileData(
        activeProfileType: StatusProfileType.personal,
        personalDisplayName: 'Aditya Nath',
      );
      expect(p.hasNameOrPhoto, isTrue);
    });

    test('photo only → true', () {
      const p = StatusProfileData(
        activeProfileType: StatusProfileType.personal,
        avatarImageUrl: 'https://cdn/me.jpg',
      );
      expect(p.hasNameOrPhoto, isTrue);
    });

    test('both → true', () {
      const p = StatusProfileData(
        activeProfileType: StatusProfileType.personal,
        personalDisplayName: 'Aditya Nath',
        avatarImageUrl: 'https://cdn/me.jpg',
      );
      expect(p.hasNameOrPhoto, isTrue);
    });

    test('whitespace-only name AND whitespace-only avatar → false', () {
      const p = StatusProfileData(
        activeProfileType: StatusProfileType.personal,
        personalDisplayName: '   ',
        avatarImageUrl: '   ',
      );
      expect(p.hasNameOrPhoto, isFalse);
    });

    test('grandfathered business row with a personal name saved → true', () {
      // TAM-168 #PATH_DECISION — a business row is not silently rewritten;
      // it is still read as "has details" iff personalDisplayName is set.
      const p = StatusProfileData(
        activeProfileType: StatusProfileType.business,
        personalDisplayName: 'Aditya Nath',
      );
      expect(p.hasNameOrPhoto, isTrue);
    });
  });

  group('safe area', () {
    test('the seeded fractions are usable', () {
      expect(kSeedSafeArea.isUsable, isTrue);
      expect(kSeedSafeArea.orFigmaDefault, kSeedSafeArea);
    });

    test('a zeroed safe area falls back to the Figma band', () {
      const zero = StatusSafeArea(top: 0, bottom: 0, left: 0, right: 0);
      expect(zero.isUsable, isFalse);
      expect(zero.orFigmaDefault, StatusSafeArea.figmaDefault);
    });

    test('a degenerate band too small for the overlay falls back', () {
      const sliver = StatusSafeArea(top: 0.1, bottom: 0.01, left: 0.05, right: 0.05);
      expect(sliver.isUsable, isFalse);
      expect(sliver.orFigmaDefault, StatusSafeArea.figmaDefault);
    });

    test('a usable band is honoured VERBATIM (the contract is the authority)', () {
      const band = StatusSafeArea(top: 0.1, bottom: 0.2, left: 0.05, right: 0.05);
      expect(band.isUsable, isTrue);
      expect(band.orFigmaDefault.bottom, 0.2);
    });

    test('an out-of-range band falls back', () {
      const bad = StatusSafeArea(top: 0.1, bottom: 1.4, left: 0.05, right: 0.05);
      expect(bad.isUsable, isFalse);
    });

    test('the Figma band matches the design (63.83 / 448.69 = 0.1423)', () {
      expect(StatusSafeArea.figmaDefault.bottom, closeTo(63.83 / 448.69, 0.001));
    });

    test('a usable item safe area is used as-is', () {
      const item = StatusSafeArea(top: 0.2, bottom: 0.3, left: 0.1, right: 0.1);
      expect(item.orFigmaDefault, item);
    });

    test('an unusable item safe area falls back to the Figma band', () {
      const zero = StatusSafeArea(top: 0, bottom: 0, left: 0, right: 0);
      expect(zero.orFigmaDefault, StatusSafeArea.figmaDefault);
    });
  });


  group('count formatting (Figma "24K" / "1.4L")', () {
    test('formats per the Indian ramp', () {
      expect(formatStatusCount(0), '0');
      expect(formatStatusCount(99), '99');
      expect(formatStatusCount(999), '999');
      expect(formatStatusCount(1000), '1K');
      expect(formatStatusCount(24000), '24K'); // Figma node 322:1728
      expect(formatStatusCount(12500), '12.5K');
      expect(formatStatusCount(99999), '100K');
      expect(formatStatusCount(140000), '1.4L'); // Figma node 322:1735
      expect(formatStatusCount(100000), '1L');
    });

    test('never renders a negative count', () {
      expect(formatStatusCount(-5), '0');
    });
  });

  group('feed item media resolution', () {
    test('an image card resolves its imageUrl as the still', () {
      final item = statusItemFixture('s1', withUrls: true);
      expect(item.stillUrl, 'https://cdn/s1.jpg');
      expect(item.playableVideoUrl, isNull);
      expect(item.isVideo, isFalse);
    });

    test('a video card resolves the video + a thumbnail poster', () {
      final item =
          statusItemFixture('v1', mediaType: StatusMediaType.video, withUrls: true);
      expect(item.playableVideoUrl, 'https://cdn/v1.mp4');
      expect(item.stillUrl, 'https://cdn/v1-thumb.jpg');
      expect(item.isVideo, isTrue);
    });

    test('a video card with a blank url has nothing playable', () {
      final item = StatusFeedItem(
        id: 'x',
        slug: 'x',
        title: 'x',
        mediaType: StatusMediaType.video,
        imageUrl: null,
        videoUrl: '  ',
        thumbnailUrl: 'https://cdn/x.jpg',
        overlaySafeArea: kSeedSafeArea,
        deitySlug: null,
        deityName: null,
        languages: const [],
        shareCaption: null,
        creator: null,
        likeCount: 0,
        viewCount: 0,
        likedByMe: false,
      );
      expect(item.playableVideoUrl, isNull);
    });

    test('caption falls back to the title when the server sends none', () {
      final item = StatusFeedItem(
        id: 'x',
        slug: 'x',
        title: 'Hanuman Chalisa',
        mediaType: StatusMediaType.image,
        imageUrl: 'https://cdn/x.jpg',
        videoUrl: null,
        thumbnailUrl: 'https://cdn/x.jpg',
        overlaySafeArea: kSeedSafeArea,
        deitySlug: null,
        deityName: null,
        languages: const [],
        shareCaption: null,
        creator: null,
        likeCount: 0,
        viewCount: 0,
        likedByMe: false,
      );
      expect(item.caption, 'Hanuman Chalisa');
      expect(statusItemFixture('s1').caption, 'Share the blessings 🙏');
    });
  });

  group('StatusCreatorInfo — TAM-N credit chip attribution', () {
    StatusCard wireCard({required String? avatarUrl}) => StatusCard(
          id: 's1',
          slug: 'status-s1',
          title: 'Status',
          mediaType: StatusCardMediaTypeEnum.image,
          imageUrl: 'https://cdn/s1.jpg',
          videoUrl: null,
          thumbnailUrl: 'https://cdn/s1-thumb.jpg',
          overlaySafeArea: StatusOverlaySafeArea(
            top: 0.1,
            bottom: 0.14,
            left: 0.05,
            right: 0.05,
          ),
          deitySlug: 'hanuman',
          deityName: 'Hanuman',
          languages: const ['hi'],
          shareCaption: 'caption',
          creator: StatusCreator(
            id: 'creator-1',
            name: 'Amit',
            avatarUrl: avatarUrl,
          ),
          likeCount: 0,
          viewCount: 0,
          likedByMe: false,
        );

    test('fromCard carries the server-supplied creator onto the domain model',
        () {
      final item = StatusFeedItem.fromCard(
        wireCard(avatarUrl: 'https://cdn/amit.jpg'),
      );

      expect(item.creator, isNotNull);
      expect(item.creator!.id, 'creator-1');
      expect(item.creator!.name, 'Amit');
      expect(item.creator!.avatarUrl, 'https://cdn/amit.jpg');
    });

    test('a null avatarUrl stays null, so the chip falls back to its glyph',
        () {
      final item = StatusFeedItem.fromCard(wireCard(avatarUrl: null));

      expect(item.creator!.avatarUrl, isNull);
    });

    test('a blank avatarUrl is normalized to null, not rendered as an empty URL',
        () {
      // An empty string would send Image.network at `''` and paint a broken
      // slot on every card; null routes to the person glyph instead.
      expect(
        StatusFeedItem.fromCard(wireCard(avatarUrl: '   ')).creator!.avatarUrl,
        isNull,
      );
      expect(
        StatusFeedItem.fromCard(wireCard(avatarUrl: '')).creator!.avatarUrl,
        isNull,
      );
    });

    test('copyWith preserves the creator across optimistic like/view updates',
        () {
      final item = StatusFeedItem.fromCard(wireCard(avatarUrl: null));

      final liked = item.copyWith(likedByMe: true, likeCount: 1);

      expect(liked.creator, same(item.creator));
    });
  });
}
