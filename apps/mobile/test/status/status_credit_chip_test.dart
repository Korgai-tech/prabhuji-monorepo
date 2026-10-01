import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/status/data/status_models.dart';
import 'package:mobile/features/status/feed/presentation/status_credit_chip.dart';
import 'package:mobile/features/status/feed/presentation/status_widgets.dart';

import '../support/fake_repositories.dart';
import '../support/status_harness.dart';

const _creator = StatusCreatorInfo(
  id: 'creator-1',
  name: 'Amit',
  avatarUrl: null,
);

Widget _chipHost({
  required bool active,
  VoidCallback? onMenuTap,
  StatusCreatorInfo? creator,
}) =>
    MaterialApp(
      home: Scaffold(
        body: Center(
          child: StatusCreditChip(
            // Keyed by creator so pumping a DIFFERENT creator remounts the
            // State and replays the auto-expand — without this the second pump
            // reuses the collapsed element and measures 30.
            key: ValueKey((creator ?? _creator).id),
            creator: creator ?? _creator,
            active: active,
            onMenuTap: onMenuTap ?? () {},
          ),
        ),
      ),
    );

/// Drain the hold timer so teardown does not trip `!timersPending`.
Future<void> _settleTimers(WidgetTester tester) async {
  await tester.pump(kCreditChipHoldDuration);
  await tester.pump(kCreditChipAnimationDuration);
}

void main() {
  group('StatusCreditChip', () {
    testWidgets('an inactive card starts collapsed and offers no menu',
        (tester) async {
      await tester.pumpWidget(_chipHost(active: false));

      expect(find.byKey(const Key('status-credit-chip')), findsOneWidget);
      expect(find.byKey(const Key('status-credit-chip-menu')), findsNothing);
    });

    testWidgets('expands when the card becomes active, then collapses back',
        (tester) async {
      await tester.pumpWidget(_chipHost(active: true));
      await tester.pump(kCreditChipAnimationDuration);

      expect(find.byKey(const Key('status-credit-chip-menu')), findsOneWidget);
      expect(find.text('Amit'), findsOneWidget);

      // Past the hold window: it collapses on its own.
      await tester.pump(kCreditChipHoldDuration);
      await tester.pump(kCreditChipAnimationDuration);

      expect(find.byKey(const Key('status-credit-chip-menu')), findsNothing);
    });

    testWidgets('tapping the avatar re-expands a collapsed chip',
        (tester) async {
      await tester.pumpWidget(_chipHost(active: true));
      await tester.pump(kCreditChipAnimationDuration);
      await tester.pump(kCreditChipHoldDuration);
      await tester.pump(kCreditChipAnimationDuration);
      expect(find.byKey(const Key('status-credit-chip-menu')), findsNothing);

      await tester.tap(find.byKey(const Key('status-credit-chip-avatar')));
      await tester.pump(kCreditChipAnimationDuration);

      expect(find.byKey(const Key('status-credit-chip-menu')), findsOneWidget);

      // Let the hold timer drain so the test ends with no pending timer.
      await tester.pump(kCreditChipHoldDuration);
      await tester.pump(kCreditChipAnimationDuration);
    });

    testWidgets('the kebab reports taps to its owner', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_chipHost(active: true, onMenuTap: () => taps++));
      await tester.pump(kCreditChipAnimationDuration);

      await tester.tap(find.byKey(const Key('status-credit-chip-menu')));
      await tester.pump();

      expect(taps, 1);

      await tester.pump(kCreditChipHoldDuration);
      await tester.pump(kCreditChipAnimationDuration);
    });
  });

  group('share parity', () {
    // ───────────────────────────────────────────────────────────────────────
    // THE regression test for this ticket.
    //
    // `StatusShareBloc` screenshots the `RepaintBoundary` that
    // `StatusHeroPreview` owns, and whatever is inside that subtree is burned
    // into every shared image and video. The chip renders identically on screen
    // whether it sits inside or outside that boundary, so nothing but this
    // assertion catches a regression — a visual review cannot, and neither can
    // a golden of the screen.
    // ───────────────────────────────────────────────────────────────────────
    testWidgets('the credit chip is NOT inside the shared RepaintBoundary',
        (tester) async {
      await pumpStatusHome(tester, repository: FakeStatusRepository());
      await tester.pump(kCreditChipAnimationDuration);

      final chip = find.byKey(const Key('status-credit-chip'));
      expect(chip, findsWidgets, reason: 'the chip should be on screen at all');

      // The boundary the share pipeline captures is the one StatusHeroPreview
      // wraps its Stack in. If the chip is a descendant of it, the chip ends up
      // in the exported creative.
      final chipInsideHero = find.descendant(
        of: find.byType(StatusHeroPreview),
        matching: find.byKey(const Key('status-credit-chip')),
      );
      expect(
        chipInsideHero,
        findsNothing,
        reason: 'the chip must be mounted OUTSIDE StatusHeroPreview, or it is '
            'burned into every shared image and video — see the comment block '
            'on StatusCreditChip',
      );

      // Drain the chip's hold timer so teardown does not trip
      // flutter_test's `!timersPending` invariant.
      await tester.pump(kCreditChipHoldDuration);
      await tester.pump(kCreditChipAnimationDuration);
    });
  });

  group('the chip hugs its content (no dead space after the kebab)', () {
    // The bug this group exists for: the expanded width was pinned to Figma's
    // 115, which is the hug width of ITS placeholder name ("user12345", 61 px
    // of text). Any shorter name left the pill running past its own kebab —
    // ~35 px of empty dark space for "Amit".
    double chipWidth(WidgetTester tester) =>
        tester.getSize(find.byKey(const Key('status-credit-chip'))).width;

    testWidgets('collapsed is exactly 8 + 14 + 8 = 30', (tester) async {
      await tester.pumpWidget(_chipHost(active: false));

      expect(chipWidth(tester), 30);
      expect(
        tester.getSize(find.byKey(const Key('status-credit-chip'))).height,
        26,
      );
    });

    testWidgets('expanded ends just past the kebab, not at a fixed 115',
        (tester) async {
      await tester.pumpWidget(_chipHost(active: true));
      await tester.pumpAndSettle();

      final kebabRight = tester
          .getRect(find.byKey(const Key('status-credit-chip-menu')))
          .right;
      final chipRight =
          tester.getRect(find.byKey(const Key('status-credit-chip'))).right;

      // Exactly the 8 dp trailing inset — no more.
      expect(chipRight - kebabRight, 8);

      await _settleTimers(tester);
    });

    testWidgets('a longer name makes a wider chip', (tester) async {
      await tester.pumpWidget(_chipHost(active: true));
      await tester.pumpAndSettle();
      final shortNameWidth = chipWidth(tester);
      await _settleTimers(tester);

      await tester.pumpWidget(_chipHost(
        active: true,
        creator: const StatusCreatorInfo(
          id: 'creator-2',
          name: 'A Much Longer Creator Name',
          avatarUrl: null,
        ),
      ));
      await tester.pumpAndSettle();

      expect(chipWidth(tester), greaterThan(shortNameWidth));

      await _settleTimers(tester);
    });

    testWidgets('an absurd name is capped, so the chip cannot cross the card',
        (tester) async {
      await tester.pumpWidget(_chipHost(
        active: true,
        creator: StatusCreatorInfo(
          id: 'creator-3',
          name: 'x' * 300,
          avatarUrl: null,
        ),
      ));
      await tester.pumpAndSettle();

      // 8 + 14 + 6 + maxNameWidth(120) + 6 + 12 + 8 = 174.
      expect(chipWidth(tester), lessThanOrEqualTo(174));

      await _settleTimers(tester);
    });
  });
}
