import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/paywall_gate.dart';

void main() {
  group('PaywallGate.run', () {
    test('Pro user runs the action immediately, never opens the paywall',
        () async {
      var opened = 0;
      var ran = 0;
      final gate = PaywallGate(
        isPro: () => true,
        refreshEntitlement: () async {},
      );

      final result = await gate.run<String>(
        pending: PendingAction(action: () async {
          ran++;
          return 'played';
        }),
        openPaywall: () async => opened++,
      );

      expect(result, 'played');
      expect(ran, 1);
      expect(opened, 0, reason: 'a Pro user must not see the paywall');
    });

    test('free user → paywall → successful purchase resumes the ORIGINAL action',
        () async {
      var pro = false;
      var ran = 0;
      final gate = PaywallGate(
        isPro: () => pro,
        refreshEntitlement: () async {}, // entitlement already flipped below
      );

      final result = await gate.run<int>(
        pending: PendingAction(
          label: 'open_player',
          action: () async {
            ran++;
            return 42; // the originally-tapped item's id
          },
        ),
        // Simulate a successful purchase inside the paywall flow.
        openPaywall: () async => pro = true,
      );

      expect(result, 42, reason: 'must resume + return the original action');
      expect(ran, 1);
    });

    test('purchase detected via the LIVE entitlement refresh (not a stale flag)',
        () async {
      var pro = false;
      var refreshed = 0;
      final gate = PaywallGate(
        isPro: () => pro,
        // The purchase only becomes visible after re-reading live entitlement.
        refreshEntitlement: () async {
          refreshed++;
          pro = true;
        },
      );

      var ran = 0;
      final result = await gate.run<int>(
        pending: PendingAction(action: () async {
          ran++;
          return 7;
        }),
        openPaywall: () async {}, // paywall closes; refresh reveals Pro
      );

      expect(refreshed, 1);
      expect(result, 7);
      expect(ran, 1);
    });

    test('free user cancels → returns null and the action never runs', () async {
      var ran = 0;
      final gate = PaywallGate(
        isPro: () => false,
        refreshEntitlement: () async {}, // still free after close
      );

      final result = await gate.run<int>(
        pending: PendingAction(action: () async {
          ran++;
          return 1;
        }),
        openPaywall: () async {}, // no purchase
      );

      expect(result, isNull);
      expect(ran, 0, reason: 'cancelled gate must not run the pending action');
    });
  });
}
