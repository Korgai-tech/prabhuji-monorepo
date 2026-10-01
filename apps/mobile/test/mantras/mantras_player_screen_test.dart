import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mantras/data/mantras_models.dart';
import 'package:mobile/features/mantras/mantras_routes.dart';

import '../support/fake_repositories.dart';
import '../support/mantras_harness.dart';

MantraAudio _noSinger(String id) => MantraAudio(
      id: id,
      title: 'Shri Raam Dootam',
      artworkUrl: '',
      singerName: null,
      audioStreamUrl: null,
      likeCount: 10,
      shareCount: 2,
      likedByMe: false,
    );

void main() {
  testWidgets('renders artwork, title, Devanagari text, engagement + controls',
      (tester) async {
    await pumpMantrasPlayer(
      tester,
      repository: FakeMantrasRepository(),
      args: mantrasPlayerArgs(const ['m0', 'm1'], 0),
    );

    expect(find.byKey(const Key('mantras-player-cover')), findsOneWidget);
    expect(find.byKey(const Key('mantras-player-title')), findsOneWidget);
    expect(find.byKey(const Key('mantras-player-text')), findsOneWidget);
    expect(find.byKey(const Key('mantras-player-like')), findsOneWidget);
    expect(find.byKey(const Key('mantras-player-share')), findsOneWidget);
    expect(find.byKey(const Key('mantras-player-prev')), findsOneWidget);
    expect(find.byKey(const Key('mantras-player-playpause')), findsOneWidget);
    expect(find.byKey(const Key('mantras-player-next')), findsOneWidget);
    expect(find.byKey(const Key('mantras-player-counter-pill')), findsOneWidget);
  });

  testWidgets('the counter pill starts at 0/7 times (default 7, not Figma 21)',
      (tester) async {
    await pumpMantrasPlayer(
      tester,
      repository: FakeMantrasRepository(),
      args: mantrasPlayerArgs(const ['m0'], 0),
    );
    expect(find.text('0/7 times'), findsOneWidget);
  });

  testWidgets('Devanagari text preserves line breaks + scrolls (never truncated)',
      (tester) async {
    await pumpMantrasPlayer(
      tester,
      repository: FakeMantrasRepository(),
      args: mantrasPlayerArgs(const ['m0'], 0),
    );
    final textWidget =
        tester.widget<Text>(find.byKey(const Key('mantras-player-text')));
    expect(textWidget.data, contains('\n')); // multi-line sacred text
    expect(textWidget.overflow, isNot(TextOverflow.ellipsis)); // never truncated
    expect(find.byType(SingleChildScrollView), findsOneWidget); // scrolls
  });

  testWidgets('NO 10-second seek control exists in the tree', (tester) async {
    await pumpMantrasPlayer(
      tester,
      repository: FakeMantrasRepository(),
      args: mantrasPlayerArgs(const ['m0'], 0),
    );
    expect(find.byKey(const Key('mantras-player-rewind')), findsNothing);
    expect(find.byKey(const Key('mantras-player-forward')), findsNothing);
  });

  testWidgets('singer line is hidden when the singer is missing', (tester) async {
    await pumpMantrasPlayer(
      tester,
      repository: FakeMantrasRepository(listing: [_noSinger('m0')]),
      args: MantrasPlayerArgs(
        itemId: 'm0',
        queue: [_noSinger('m0')],
        index: 0,
        playlistSource: 'newly_added',
      ),
    );
    expect(find.byKey(const Key('mantras-player-singer')), findsNothing);
    expect(find.byKey(const Key('mantras-player-title')), findsOneWidget);
  });

  testWidgets('the Next-track card renders when a next item exists',
      (tester) async {
    await pumpMantrasPlayer(
      tester,
      repository: FakeMantrasRepository(),
      args: mantrasPlayerArgs(const ['m0', 'm1'], 0),
    );
    expect(find.byKey(const Key('mantras-player-next-card')), findsOneWidget);
    expect(find.byKey(const Key('mantras-player-next-card-play')), findsOneWidget);
  });
}
