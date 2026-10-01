import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/audio/application/audio_providers.dart';
import 'package:mobile/features/audio/domain/audio_item.dart';
import 'package:mobile/features/home/data/home_models.dart';
import 'package:mobile/features/home/presentation/home_screen.dart';

import '../support/fake_analytics.dart';
import '../support/fake_audio_engine.dart';
import '../support/fake_home_services.dart';
import '../support/home_harness.dart';

/// Inline audio preview (TAM-62 AC / PRD §13), on the ONE shared TAM-59 engine
/// in preview mode.
///
/// Single-active-playback is asserted STRUCTURALLY: [FakeAudioEngine.loadedUrl]
/// holds one value, so "a new play stops the previous" is provable from the
/// engine's own call log rather than from widget state.
void main() {
  /// Reads the live playback state out of the running widget tree.
  ProviderContainer containerOf(WidgetTester tester) => ProviderScope.containerOf(
        tester.element(find.byType(HomeScreen)),
      );

  testWidgets('an audio card entering the viewport autoplays in PREVIEW mode',
      (tester) async {
    final engine = FakeAudioEngine();
    final analytics = RecordingAnalytics();

    await pumpHome(
      tester,
      repository: FakeHomeRepository(items: [
        homeFeedItem(
          id: 'f-aarti',
          contentType: HomeContentType.aarti,
          module: 'aarti',
          audioPreviewUrl: 'https://cdn.example.com/aarti.mp3',
        ),
      ]),
      engine: engine,
      analytics: analytics,
    );

    expect(engine.loadedUrl, 'https://cdn.example.com/aarti.mp3');
    expect(engine.calls, contains('play'));
    // Removed: home_feed_audio_autoplay_started dropped from analytics contract.

    // A preview must NEVER promote the mini-player (TAM-59 AC-d).
    final playback = containerOf(tester).read(audioControllerProvider);
    expect(playback.mode, PlaybackMode.preview);
    expect(playback.showMiniPlayer, isFalse);
    expect(playback.currentItem?.id, 'f-aarti');
  });

  testWidgets('a card with NO audioPreviewUrl never touches the player',
      (tester) async {
    final engine = FakeAudioEngine();

    await pumpHome(
      tester,
      repository: FakeHomeRepository(items: [
        homeFeedItem(
          id: 'f-wallpaper',
          contentType: HomeContentType.wallpaper,
          module: 'wallpaper',
        ),
      ]),
      engine: engine,
    );

    expect(engine.calls, isEmpty);
    expect(engine.loadedUrl, isNull);
  });

  testWidgets(
      'an audio card with a BLANK preview url never touches the player',
      (tester) async {
    final engine = FakeAudioEngine();

    await pumpHome(
      tester,
      repository: FakeHomeRepository(items: [
        homeFeedItem(
          id: 'f-aarti',
          contentType: HomeContentType.aarti,
          module: 'aarti',
          audioPreviewUrl: '',
        ),
      ]),
      engine: engine,
    );

    expect(engine.calls, isEmpty);
  });

  testWidgets(
      'SINGLE-ACTIVE: a newly-visible audio card stops the previous one',
      (tester) async {
    final engine = FakeAudioEngine();
    final analytics = RecordingAnalytics();

    // Two audio cards, both tall enough that scrolling swaps which is ≥60%.
    // No banners: the carousel + shortcut grid are ~430px of chrome, which would
    // push the first card below the 0.6 play threshold on a 700px viewport.
    await pumpHome(
      tester,
      repository: FakeHomeRepository(banners: const [], items: [
        homeFeedItem(
          id: 'f-aarti',
          contentType: HomeContentType.aarti,
          module: 'aarti',
          audioPreviewUrl: 'https://cdn.example.com/aarti.mp3',
        ),
        homeFeedItem(
          id: 'f-mantra',
          contentType: HomeContentType.mantra,
          module: 'mantras',
          audioPreviewUrl: 'https://cdn.example.com/mantra.mp3',
        ),
      ]),
      engine: engine,
      analytics: analytics,
      // Only ~one card fits, so the second must be scrolled into view.
      viewportHeight: 700,
    );

    expect(engine.loadedUrl, 'https://cdn.example.com/aarti.mp3');

    // Scroll the second audio card into view.
    await tester.drag(find.byKey(const Key('home-scroll')), const Offset(0, -900));
    await homeSettle(tester);

    // ONE engine, source replaced ⇒ the first preview is structurally over.
    expect(engine.loadedUrl, 'https://cdn.example.com/mantra.mp3');

    final playback = containerOf(tester).read(audioControllerProvider);
    expect(playback.currentItem?.id, 'f-mantra');
    expect(playback.mode, PlaybackMode.preview);

    // The engine only ever held one source at a time — assert the whole log
    // never interleaves two setUrls without the swap.
    final setUrls =
        engine.calls.where((c) => c.startsWith('setUrl:')).toList();
    expect(setUrls, [
      'setUrl:https://cdn.example.com/aarti.mp3',
      'setUrl:https://cdn.example.com/mantra.mp3',
    ]);
    // Removed: home_feed_audio_autoplay_started dropped from analytics contract.
  });

  testWidgets('scrolling an audio card OUT of the viewport pauses it',
      (tester) async {
    final engine = FakeAudioEngine();
    final analytics = RecordingAnalytics();

    await pumpHome(
      tester,
      repository: FakeHomeRepository(banners: const [], items: [
        homeFeedItem(
          id: 'f-aarti',
          contentType: HomeContentType.aarti,
          module: 'aarti',
          audioPreviewUrl: 'https://cdn.example.com/aarti.mp3',
        ),
        // A non-audio card to scroll to, so nothing else starts playing.
        homeFeedItem(
          id: 'f-wallpaper',
          contentType: HomeContentType.wallpaper,
          module: 'wallpaper',
        ),
      ]),
      engine: engine,
      analytics: analytics,
      viewportHeight: 700,
    );

    expect(engine.playing, isTrue);

    await tester.drag(find.byKey(const Key('home-scroll')), const Offset(0, -900));
    await homeSettle(tester);

    expect(engine.calls, contains('pause'));
    expect(engine.playing, isFalse);
    // Removed: home_feed_audio_paused_on_scroll dropped from analytics contract.
  });

  testWidgets('switching to another shell tab pauses the preview', (
    tester,
  ) async {
    // The reported bug: "when we go from home to chat the media keeps playing
    // on the feed". A branch swap does not unmount Home — go_router's
    // IndexedStack just goes Offstage — so nothing re-lays-out,
    // VisibilityDetector (which reports on PAINT) stays silent, and no route is
    // pushed, so the router's preview-pause observer never fires either. All
    // three of this widget's other stop conditions miss it, and the audio keeps
    // playing audibly over whatever tab the user moved to. `TickerMode` is the
    // one signal that does flip.
    final engine = FakeAudioEngine();
    final repository = FakeHomeRepository(banners: const [], items: [
      homeFeedItem(
        id: 'f-aarti',
        contentType: HomeContentType.aarti,
        module: 'aarti',
        audioPreviewUrl: 'https://cdn.example.com/aarti.mp3',
      ),
    ]);

    final tick = ValueNotifier<bool>(true);
    addTearDown(tick.dispose);
    await pumpHome(
      tester,
      repository: repository,
      engine: engine,
      analytics: RecordingAnalytics(),
      viewportHeight: 700,
      tickerSwitch: tick,
    );
    expect(engine.playing, isTrue, reason: 'precondition: the preview started');

    // The tab switch — flipped IN PLACE, so nothing is disposed. That matters:
    // re-pumping the app would tear the tree down and `dispose` would stop the
    // audio all by itself, and this would pass without the gate existing.
    tick.value = false;
    await homeSettle(tester);

    expect(
      engine.playing,
      isFalse,
      reason: 'audio must not keep playing over the tab the user moved to',
    );
    expect(
      engine.calls,
      contains('pause'),
      reason: 'paused, not stopped — stop would mean the widget was disposed',
    );
  });

  testWidgets('backgrounding the app pauses the preview', (tester) async {
    // A separate signal from the tab switch: backgrounding does NOT flip
    // `TickerMode` (Home is still the active branch) and does not repaint, so
    // neither the ticker gate nor VisibilityDetector can see it. Without a
    // lifecycle observer the preview played on out of a backgrounded app.
    final engine = FakeAudioEngine();
    await pumpHome(
      tester,
      repository: FakeHomeRepository(banners: const [], items: [
        homeFeedItem(
          id: 'f-aarti',
          contentType: HomeContentType.aarti,
          module: 'aarti',
          audioPreviewUrl: 'https://cdn.example.com/aarti.mp3',
        ),
      ]),
      engine: engine,
      analytics: RecordingAnalytics(),
      viewportHeight: 700,
    );
    expect(engine.playing, isTrue, reason: 'precondition: the preview started');

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await homeSettle(tester);

    expect(engine.playing, isFalse);
    expect(
      engine.calls,
      contains('pause'),
      reason: 'paused, not stopped — stop would mean the widget was disposed',
    );
  });

  // `inactive` and `hidden` are real states on the way to `paused` — an iOS
  // call banner, the app switcher — and all of them mean the user is not
  // looking at the feed. One test each (rather than a loop inside one test) so
  // no lifecycle or engine state carries between them, and so a failure names
  // the exact state that regressed.
  for (final state in const <AppLifecycleState>[
    AppLifecycleState.inactive,
    AppLifecycleState.hidden,
  ]) {
    testWidgets('$state also pauses the preview', (tester) async {
      final engine = FakeAudioEngine();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: const [], items: [
          homeFeedItem(
            id: 'f-aarti',
            contentType: HomeContentType.aarti,
            module: 'aarti',
            audioPreviewUrl: 'https://cdn.example.com/aarti.mp3',
          ),
        ]),
        engine: engine,
        analytics: RecordingAnalytics(),
        viewportHeight: 700,
      );
      expect(engine.playing, isTrue, reason: 'precondition for $state');

      tester.binding.handleAppLifecycleStateChanged(state);
      await homeSettle(tester);

      expect(engine.playing, isFalse, reason: '$state must pause the preview');
    });
  }

  testWidgets('returning to Home does NOT restart the preview', (tester) async {
    // Pausing on exit must not turn into autoplay on every tab return: the user
    // walked away from that audio. Scrolling the card out and back in is what
    // starts it again, through the ordinary visibility path.
    final engine = FakeAudioEngine();
    final repository = FakeHomeRepository(banners: const [], items: [
      homeFeedItem(
        id: 'f-aarti',
        contentType: HomeContentType.aarti,
        module: 'aarti',
        audioPreviewUrl: 'https://cdn.example.com/aarti.mp3',
      ),
    ]);

    final tick = ValueNotifier<bool>(true);
    addTearDown(tick.dispose);
    await pumpHome(
      tester,
      repository: repository,
      engine: engine,
      analytics: RecordingAnalytics(),
      viewportHeight: 700,
      tickerSwitch: tick,
    );

    for (final enabled in <bool>[false, true]) {
      tick.value = enabled;
      await homeSettle(tester);
    }

    expect(engine.playing, isFalse);
  });

  testWidgets('tapping play/pause toggles the preview', (tester) async {
    final engine = FakeAudioEngine();

    await pumpHome(
      tester,
      repository: FakeHomeRepository(items: [
        homeFeedItem(
          id: 'f-aarti',
          contentType: HomeContentType.aarti,
          module: 'aarti',
          audioPreviewUrl: 'https://cdn.example.com/aarti.mp3',
        ),
      ]),
      engine: engine,
    );

    expect(engine.playing, isTrue);

    await tester.tap(find.byKey(const Key('home-feed-audio-toggle-f-aarti')));
    await homeSettle(tester);
    expect(engine.playing, isFalse);

    await tester.tap(find.byKey(const Key('home-feed-audio-toggle-f-aarti')));
    await homeSettle(tester);
    expect(engine.playing, isTrue);
  });

  testWidgets(
      'a Home preview does NOT preempt an in-flight full-player playback',
      (tester) async {
    // Regression guard: earlier this test asserted the opposite ("preview
    // stops full") — that matched the TAM-59 "one engine" design intent but
    // meant scrolling past a home-feed audio card KILLED the aarti/mantra
    // you were listening to (user report). Fix: `_AudioHero._onVisibility`
    // now checks for an active full-mode playback and skips its preview
    // start when one exists. Full mode always wins over autoplay-preview.
    final engine = FakeAudioEngine();

    await pumpHome(
      tester,
      repository: FakeHomeRepository(items: [
        homeFeedItem(
          id: 'f-wallpaper',
          contentType: HomeContentType.wallpaper,
          module: 'wallpaper',
        ),
      ]),
      engine: engine,
      viewportHeight: 700,
    );

    // Simulate an Aarti/Mantras FULL playback already running.
    final container = containerOf(tester);
    await container.read(audioControllerProvider.notifier).play(
          const AudioItem(
            id: 'full-track',
            title: 'Aarti',
            audioUrl: 'https://cdn.example.com/full.mp3',
          ),
        );
    await homeSettle(tester);
    expect(container.read(audioControllerProvider).showMiniPlayer, isTrue);
    expect(engine.loadedUrl, 'https://cdn.example.com/full.mp3');

    // Now the Home feed reloads with an audio card that WOULD autoplay
    // — but since a full-mode playback is active, `_AudioHero` skips.
    await pumpHome(
      tester,
      repository: FakeHomeRepository(items: [
        homeFeedItem(
          id: 'f-aarti',
          contentType: HomeContentType.aarti,
          module: 'aarti',
          audioPreviewUrl: 'https://cdn.example.com/preview.mp3',
        ),
      ]),
      engine: engine,
    );

    // The full-player source is still loaded — the preview did NOT swap
    // it out, so the user's aarti/mantra keeps playing.
    expect(engine.loadedUrl, 'https://cdn.example.com/full.mp3');
    expect(container.read(audioControllerProvider).currentItem?.id,
        'full-track');
  });

  // --- Scrubbing (the seekbar is a CONTROL, not a readout) -------------------
  //
  // The Home mini-player bar shipped as a read-only indicator, so aarti /
  // mantra / ringtone cards — all three render this same `_MiniPlayer` — had a
  // playhead you could not move. These lock the gesture layer in.

  /// Pumps an autoplaying aarti card whose source has reported a duration, so
  /// the bar is live and a fraction can be converted to a position.
  Future<FakeAudioEngine> pumpScrubbableCard(
    WidgetTester tester, {
    Duration duration = const Duration(seconds: 100),
  }) async {
    final engine = FakeAudioEngine();
    await pumpHome(
      tester,
      repository: FakeHomeRepository(items: [
        homeFeedItem(
          id: 'f-aarti',
          contentType: HomeContentType.aarti,
          module: 'aarti',
          audioPreviewUrl: 'https://cdn.example.com/aarti.mp3',
        ),
      ]),
      engine: engine,
    );
    engine.emitDuration(duration);
    await homeSettle(tester);
    return engine;
  }

  Finder scrubBar() => find.byKey(const Key('home-feed-audio-scrub-f-aarti'));

  testWidgets('tapping the scrub bar seeks the engine to that fraction',
      (tester) async {
    final engine = await pumpScrubbableCard(tester);

    final rect = tester.getRect(scrubBar());
    // 25% along a 100s track.
    await tester.tapAt(Offset(rect.left + rect.width * 0.25, rect.center.dy));
    await homeSettle(tester);

    expect(engine.lastSeek.inMilliseconds, closeTo(25000, 1500));
  });

  testWidgets('dragging the scrub bar commits ONE seek, at the drop point',
      (tester) async {
    final engine = await pumpScrubbableCard(tester);
    final seeksBefore = engine.calls.where((c) => c.startsWith('seek:')).length;

    final rect = tester.getRect(scrubBar());
    final gesture =
        await tester.startGesture(Offset(rect.left + 2, rect.center.dy));
    // Drag across in steps — each one must move the thumb WITHOUT seeking.
    for (final f in [0.3, 0.5, 0.8]) {
      await gesture
          .moveTo(Offset(rect.left + rect.width * f, rect.center.dy));
      await tester.pump();
      expect(
        engine.calls.where((c) => c.startsWith('seek:')).length,
        seeksBefore,
        reason: 'a drag must not seek per pixel — only on release',
      );
    }
    await gesture.up();
    await homeSettle(tester);

    expect(engine.calls.where((c) => c.startsWith('seek:')).length,
        seeksBefore + 1);
    expect(engine.lastSeek.inMilliseconds, closeTo(80000, 1500));
  });

  testWidgets('position ticks do NOT drag the thumb back mid-scrub',
      (tester) async {
    // The regression this whole design exists to prevent: while the finger is
    // down the engine keeps reporting the PRE-seek playhead ~5x/s. If the bar
    // rendered that, the thumb would snap backwards under the finger.
    final engine = await pumpScrubbableCard(tester);

    final rect = tester.getRect(scrubBar());
    final gesture =
        await tester.startGesture(Offset(rect.left + 2, rect.center.dy));
    await gesture.moveTo(Offset(rect.left + rect.width * 0.75, rect.center.dy));
    await tester.pump();

    // The engine insists we are still at 1s. The elapsed clock must follow the
    // FINGER (~01:15), not the stream.
    engine.emitPosition(const Duration(seconds: 1));
    await tester.pump();
    expect(find.text('01:15'), findsOneWidget);
    expect(find.text('00:01'), findsNothing);

    await gesture.up();
    await homeSettle(tester);
  });

  testWidgets('a seek moves the elapsed clock on the same frame',
      (tester) async {
    // AudioController.seek writes the position optimistically, so the UI does
    // not wait on the engine's next positionStream tick to acknowledge input.
    final engine = await pumpScrubbableCard(tester);
    engine.emitPosition(const Duration(seconds: 2));
    await homeSettle(tester);
    expect(find.text('00:02'), findsOneWidget);

    final rect = tester.getRect(scrubBar());
    await tester.tapAt(Offset(rect.left + rect.width * 0.5, rect.center.dy));
    await tester.pump(); // ONE frame — no engine round-trip.

    expect(find.text('00:02'), findsNothing);
    expect(find.text('00:50'), findsOneWidget);
  });

  testWidgets('the bar is inert until the source reports a duration',
      (tester) async {
    // No duration => no fraction-to-Duration mapping is possible. The bar must
    // refuse the gesture rather than seek to a garbage position.
    final engine = FakeAudioEngine();
    await pumpHome(
      tester,
      repository: FakeHomeRepository(items: [
        homeFeedItem(
          id: 'f-aarti',
          contentType: HomeContentType.aarti,
          module: 'aarti',
          audioPreviewUrl: 'https://cdn.example.com/aarti.mp3',
        ),
      ]),
      engine: engine,
    );

    expect(scrubBar(), findsNothing);
    expect(engine.calls.where((c) => c.startsWith('seek:')), isEmpty);

    // Once the duration lands, the control appears.
    engine.emitDuration(const Duration(seconds: 100));
    await homeSettle(tester);
    expect(scrubBar(), findsOneWidget);
  });

  testWidgets('a card that is not the active item exposes no scrub gesture',
      (tester) async {
    // Two audio cards, one engine. Only the card that owns playback may scrub;
    // the other has neither a position nor a duration to scrub against.
    final engine = FakeAudioEngine();
    await pumpHome(
      tester,
      repository: FakeHomeRepository(items: [
        homeFeedItem(
          id: 'f-aarti',
          contentType: HomeContentType.aarti,
          module: 'aarti',
          audioPreviewUrl: 'https://cdn.example.com/aarti.mp3',
        ),
        homeFeedItem(
          id: 'f-mantra',
          contentType: HomeContentType.mantra,
          module: 'mantra',
          audioPreviewUrl: 'https://cdn.example.com/mantra.mp3',
        ),
      ]),
      engine: engine,
      viewportHeight: 2000,
    );
    engine.emitDuration(const Duration(seconds: 100));
    await homeSettle(tester);

    final active = containerOf(tester).read(audioControllerProvider).currentItem?.id;
    final idle = active == 'f-aarti' ? 'f-mantra' : 'f-aarti';
    expect(find.byKey(Key('home-feed-audio-scrub-$active')), findsOneWidget);
    expect(find.byKey(Key('home-feed-audio-scrub-$idle')), findsNothing);
  });
}
