import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/secrets.dart';
import 'package:mobile/features/support/support_analytics.dart';

import 'support_screen_harness.dart';

/// Layout-intent test for the Support screen (spec: TAM-N-support-screen,
/// Figma node 1939:20185). Asserts the pinned/flex zones declared in the
/// spec's Layout intent block hold at short, mid, and tall device heights
/// — the bug class that goldens (one-height, self-baselined) cannot catch.
///
/// Spec Layout intent block:
///   * App bar (back + "Support")     — pinned-top      — clip
///   * Body (Help & Support card + …) — flex-fill       — scroll internally
///
/// This test fails when someone:
///   * wraps the screen root in a SingleChildScrollView (breaks the "only
///     the flex-fill body zone scrolls" rule)
///   * removes the Expanded from the body zone (the card floats mid-screen
///     on tall devices)
///   * un-pins the app bar (it drifts down as the body grows)
void main() {
  const width = 360.0;
  const heights = [600.0, 800.0, 1200.0];

  final realSecrets = Secrets.forTest(
    supportWhatsAppNumber: '+911234567890',
    supportWhatsAppMessage: 'Hi Prabhuji team,',
  );

  for (final h in heights) {
    testWidgets('layout intent holds at ${h.toInt()}dp', (tester) async {
      await pumpSupportScreen(
        tester,
        source: SupportEntrySource.homeHeader,
        secrets: realSecrets,
        viewport: Size(width, h),
      );

      // 1. Pinned-top app bar sits at y = 0 (SafeArea inset = 0 in tests).
      final appBar = tester.getRect(find.byKey(const Key('support-appbar')));
      expect(appBar.top, 0,
          reason: 'app bar must be pinned to the top (was ${appBar.top})');

      // 2. Body zone starts directly below the app bar + a 24 dp gap
      //    (AppSpacing.large), and expands to consume all remaining space.
      final body = tester.getRect(find.byKey(const Key('support-body')));
      expect(body.top, closeTo(appBar.height + 24, 0.5),
          reason: 'body zone must sit ${24} dp below the app bar');
      expect(body.bottom, closeTo(h, 0.5),
          reason: 'body zone must fill to the bottom edge (was ${body.bottom}, '
              'expected $h)');

      // 3. The ONLY scrollable in the tree is inside the flex-fill body zone.
      //    A whole-screen scroll (SingleChildScrollView at root) fails here.
      final scrollables = find.byType(Scrollable);
      expect(scrollables, findsOneWidget,
          reason: 'exactly one Scrollable expected — the flex-fill body zone');
      expect(
        find.descendant(
          of: find.byKey(const Key('support-body')),
          matching: find.byKey(const Key('support-body-scroll')),
        ),
        findsOneWidget,
        reason: 'the sole Scrollable must live inside the body zone',
      );

      // 4. The card sits at the top of the body (no push-down / floating).
      final card = tester.getRect(find.byKey(const Key('support-card')));
      expect(card.top, closeTo(body.top, 1.0),
          reason: 'card must be glued to the top of the body zone');
    });
  }
}
