import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/ringtone/application/ringtone_tap_handler.dart';
import 'package:mobile/features/ringtone/ringtone_analytics.dart';
import 'package:mobile/features/ringtone/ringtone_routes.dart';

import '../support/fake_analytics.dart';
import '../support/fake_repositories.dart';

/// The Pro gate at the card tap (TAM-68 §5): free → paywall (Preview never
/// opens); Pro → Preview + auto-play; post-purchase → Preview + auto-play.
/// Also asserts Sheet 1 row 115 (`ringtone_selected`) fires on EVERY tap
/// with the correct `selection_source`.
void main() {
  late RecordingAnalytics analytics;
  late List<RingtonePreviewArgs> opened;
  late int paywallOpens;

  RingtoneTapHandler build({
    required bool Function() isPro,
    Future<void> Function()? onRefresh,
  }) {
    return RingtoneTapHandler(
      isPro: isPro,
      refreshEntitlement: onRefresh ?? () async {},
      openPaywall: () async => paywallOpens++,
      openPreview: (args) async => opened.add(args),
      analytics: analytics,
    );
  }

  setUp(() {
    analytics = RecordingAnalytics();
    opened = [];
    paywallOpens = 0;
  });

  test('Pro tap opens the Preview + fires ringtone_selected, no paywall',
      () async {
    final handler = build(isPro: () => true);
    await handler.handleCardTap(
      item: ringtoneCardFixture('rt1'),
      index: 2,
      selectionSource: 'listing',
    );

    expect(paywallOpens, 0);
    expect(opened, hasLength(1));
    expect(opened.single.ringtoneId, 'rt1');
    expect(opened.single.entrySource, 'card');
    expect(opened.single.autoPlay, isTrue);

    // Row 115 — `ringtone_selected` on every tap.
    expect(analytics.names, contains(RingtoneEvents.selected));
    final props = analytics.propsFor(RingtoneEvents.selected);
    expect(props[RingtoneEventProps.ringtoneId], 'rt1');
    expect(props[RingtoneEventProps.selectionSource], 'listing');
    expect(props[RingtoneEventProps.positionIndex], 2);
  });

  test('free tap opens the paywall; Preview NOT opened', () async {
    final handler = build(isPro: () => false);
    await handler.handleCardTap(
      item: ringtoneCardFixture('rt1'),
      index: 0,
    );

    expect(paywallOpens, 1);
    expect(opened, isEmpty);
    // Row 115 still fires on a free tap (the intent is the same).
    expect(analytics.names, contains(RingtoneEvents.selected));
  });

  test('post-purchase: on purchase the ORIGINAL Preview opens + auto-plays',
      () async {
    var pro = false;
    final handler = build(
      isPro: () => pro,
      onRefresh: () async => pro = true, // purchase succeeds during the paywall
    );
    await handler.handleCardTap(
      item: ringtoneCardFixture('rt9'),
      index: 4,
    );

    expect(paywallOpens, 1);
    expect(opened, hasLength(1));
    expect(opened.single.ringtoneId, 'rt9');
    expect(opened.single.entrySource, 'post_purchase');
    expect(opened.single.autoPlay, isTrue);
  });

  test('cancelled paywall: no Preview', () async {
    final handler = build(isPro: () => false, onRefresh: () async {});
    await handler.handleCardTap(
      item: ringtoneCardFixture('rt2'),
      index: 1,
    );

    expect(opened, isEmpty);
  });

  test('search tap carries selection_source: search', () async {
    final handler = build(isPro: () => true);
    await handler.handleCardTap(
      item: ringtoneCardFixture('rt3'),
      index: 0,
      selectionSource: 'search',
    );

    expect(
      analytics.propsFor(RingtoneEvents.selected)[
          RingtoneEventProps.selectionSource],
      'search',
    );
  });
}
