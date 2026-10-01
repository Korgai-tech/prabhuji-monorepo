import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/aarti/aarti_analytics.dart';
import 'package:mobile/features/aarti/aarti_routes.dart';
import 'package:mobile/features/aarti/application/aarti_tap_handler.dart';

import '../support/fake_analytics.dart';
import '../support/fake_repositories.dart';

void main() {
  group('AartiTapHandler (intent moment + post-purchase continuation)', () {
    late RecordingAnalytics analytics;
    late List<AartiPlayerArgs> openedPlayers;
    late int paywallOpens;
    late int refreshes;

    setUp(() {
      analytics = RecordingAnalytics();
      openedPlayers = [];
      paywallOpens = 0;
      refreshes = 0;
    });

    AartiTapHandler build({
      required bool Function() isPro,
      Future<void> Function()? onPaywall,
    }) {
      return AartiTapHandler(
        isPro: isPro,
        refreshEntitlement: () async => refreshes++,
        openPaywall: () async {
          paywallOpens++;
          if (onPaywall != null) await onPaywall();
        },
        openPlayer: (args) async => openedPlayers.add(args),
        analytics: analytics,
      );
    }

    final audio = aartiAudioFixture('a1');
    final queue = [aartiAudioFixture('a0'), audio, aartiAudioFixture('a2')];

    test('Pro user → opens player immediately, no paywall', () async {
      final handler = build(isPro: () => true);
      await handler.handleTap(
        audio: audio,
        queue: queue,
        index: 1,
        sourceListType: 'newly_added',
      );

      expect(paywallOpens, 0);
      expect(openedPlayers.single.audioId, 'a1');
      expect(openedPlayers.single.index, 1);
      expect(openedPlayers.single.queue.length, 3);
      expect(analytics.fired(AartiEvents.audioSelected), isTrue);
    });

    test('Free user → paywall shown; cancel → no player, context preserved',
        () async {
      var pro = false; // never purchases
      final handler = build(isPro: () => pro);
      await handler.handleTap(
        audio: audio,
        queue: queue,
        index: 1,
        sourceListType: 'newly_added',
      );

      expect(paywallOpens, 1);
      expect(refreshes, 1);
      expect(openedPlayers, isEmpty); // no playback on cancel
    });

    test('Free user → purchase → auto-opens the ORIGINAL item + queue restored',
        () async {
      var pro = false;
      final handler = build(
        isPro: () => pro,
        onPaywall: () async => pro = true, // purchase completes in the paywall
      );

      await handler.handleTap(
        audio: audio,
        queue: queue,
        index: 1,
        sourceListType: 'newly_added',
        sourceFilter: 'ganesh',
      );

      expect(openedPlayers.single.audioId, 'a1'); // the originally-tapped item
      expect(openedPlayers.single.index, 1); // queue order restored
      expect(openedPlayers.single.queue.map((a) => a.id), ['a0', 'a1', 'a2']);
    });

    // Old `aarti_bhajans_paywall_shown` / `aarti_bhajans_purchase_success_from_audio`
    // analytics assertions were dropped when those events left the analytics
    // contract (Sheet 1 has no paywall-shown / purchase-from-audio events).
    // Paywall behaviour is asserted via `paywallOpens` above.
  });
}
