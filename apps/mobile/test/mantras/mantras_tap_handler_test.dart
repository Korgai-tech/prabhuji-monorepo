import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mantras/application/mantras_tap_handler.dart';
import 'package:mobile/features/mantras/data/mantras_models.dart';
import 'package:mobile/features/mantras/mantras_routes.dart';

import '../support/fake_analytics.dart';
import '../support/fake_repositories.dart';

class _Harness {
  _Harness({required this.pro, FakeMantrasRepository? repo})
      : repository = repo ?? FakeMantrasRepository();

  bool pro;
  final FakeMantrasRepository repository;
  final analytics = RecordingAnalytics();

  int paywallOpens = 0;
  int refreshCalls = 0;
  final List<MantrasPlayerArgs> opened = [];

  MantrasTapHandler build() => MantrasTapHandler(
        isPro: () => pro,
        refreshEntitlement: () async => refreshCalls++,
        openPaywall: () async => paywallOpens++,
        openPlayer: (args) async => opened.add(args),
        repository: repository,
        analytics: analytics,
      );
}

void main() {
  final audios = List.generate(3, (i) => mantraAudioFixture('a$i'));

  group('free user — the paywall is the ONLY gate', () {
    test('audio tap → paywall, player never opens, fires audio_selected',
        () async {
      final h = _Harness(pro: false);
      await h.build().handleAudioTap(
            item: audios[0],
            queue: audios,
            index: 0,
            sourceSection: 'newly_added',
          );
      expect(h.paywallOpens, 1);
      expect(h.opened, isEmpty);
      expect(h.analytics.fired('mantras_audio_selected'), isTrue);
      expect(
        h.analytics.last('mantras_audio_selected')!.properties['selection_source'],
        'newly_added',
      );
    });

    test('deity tap → paywall, player never opens', () async {
      final h = _Harness(pro: false);
      await h.build().handleDeityTap(
            deity: const MantraDeity(
                slug: 'hanuman', displayName: 'Hanuman ji', iconUrl: ''),
          );
      expect(h.paywallOpens, 1);
      expect(h.opened, isEmpty);
      expect(h.repository.fetchDeityPlaylistCalls, 0); // never resolved for free
      expect(h.analytics.fired('mantras_deity_clicked'), isTrue);
    });

    test('category tap → paywall, player never opens', () async {
      final h = _Harness(pro: false);
      await h.build().handleCategoryTap(
            category: const MantraCategory(
                id: 'c1', slug: 'peace', name: 'Peace', imageUrl: null),
          );
      expect(h.paywallOpens, 1);
      expect(h.opened, isEmpty);
    });
  });

  group('Pro user — resolve + open', () {
    test('audio tap opens the player on that item, queue = surface order',
        () async {
      final h = _Harness(pro: true);
      await h.build().handleAudioTap(
            item: audios[1],
            queue: audios,
            index: 1,
            sourceSection: 'newly_added',
          );
      expect(h.paywallOpens, 0);
      expect(h.opened.single.itemId, 'a1');
      expect(h.opened.single.index, 1);
      expect(h.opened.single.queue.length, 3);
    });

    // TAM-160 regression. A curated row's surface label reaches the player and
    // the API verbatim; the API is deliberately TOLERANT of surface names it
    // does not know (it falls back to the default playlist), so the client does
    // not special-case anything. The bug this guards against was the API
    // rejecting `curated` outright, which killed playback from curated rows.
    test('curated tap passes the surface label straight through', () async {
      final h = _Harness(pro: true);
      await h.build().handleAudioTap(
            item: audios[0],
            queue: audios,
            index: 0,
            sourceSection: 'curated',
          );
      expect(
        h.analytics.last('mantras_audio_selected')!.properties['selection_source'],
        'curated',
      );
      expect(h.opened.single.playlistSource, 'curated');
      expect(h.opened.single.queue.length, 3,
          reason: 'the section-ordered queue still reaches the player');
    });

    test('deity tap opens on the first group item; queue = the deity playlist',
        () async {
      final h = _Harness(pro: true);
      await h.build().handleDeityTap(
            deity: const MantraDeity(
                slug: 'hanuman', displayName: 'Hanuman ji', iconUrl: ''),
          );
      expect(h.repository.fetchDeityPlaylistCalls, 1);
      final args = h.opened.single;
      expect(args.itemId, 'm0'); // first item of the seeded deity playlist
      expect(args.index, 0);
      expect(args.queue.length, 3);
      expect(args.playlistSource, 'deity');
    });

    test('category tap opens on the first item of the category playlist',
        () async {
      final h = _Harness(pro: true);
      await h.build().handleCategoryTap(
            category: const MantraCategory(
                id: 'c1', slug: 'peace', name: 'Peace', imageUrl: null),
          );
      expect(h.repository.fetchCategoryPlaylistCalls, 1);
      final args = h.opened.single;
      expect(args.itemId, 'm1'); // seeded category playlist skips the first item
      expect(args.playlistSource, 'category');
    });
  });

  test('post-purchase: free → buy → resolves + opens the originally tapped item',
      () async {
    final h = _Harness(pro: false);
    // Simulate the paywall flipping entitlement on refresh (a real purchase).
    final handler = MantrasTapHandler(
      isPro: () => h.pro,
      refreshEntitlement: () async {
        h.refreshCalls++;
        h.pro = true; // purchased
      },
      openPaywall: () async => h.paywallOpens++,
      openPlayer: (args) async => h.opened.add(args),
      repository: h.repository,
      analytics: h.analytics,
    );
    await handler.handleAudioTap(
      item: audios[0],
      queue: audios,
      index: 0,
      sourceSection: 'newly_added',
    );
    expect(h.paywallOpens, 1);
    expect(h.opened.single.itemId, 'a0');
  });
}
