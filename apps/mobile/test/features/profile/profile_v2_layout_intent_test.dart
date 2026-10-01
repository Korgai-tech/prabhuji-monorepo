import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/status/data/status_models.dart';

import '../../support/profile_harness.dart';

/// Layout-intent test for Profile v2 (spec: TAM-N-profile-v2, Figma
/// `1923:17987` Free / `1932:19560` VIP). Asserts the pinned/flex zones
/// declared in the spec's Layout intent block hold at short, mid, and tall
/// device heights — the bug class that goldens (one-height, self-baselined)
/// cannot catch.
///
/// Zones asserted (spec Layout intent table):
///   - `profile-v2-appbar` — pinned top
///   - `profile-identity-card` — intrinsic (Auto-Layout, no flex)
///   - `profile-v2-scroll-region` — flex-fill (Expanded wrapping a scroll)
///
/// Fails when someone wraps the root in a SingleChildScrollView (both a
/// root Scrollable AND the flex-zone Scrollable would exist), removes the
/// Expanded around the scroll region (identity card floats mid-screen at
/// 1200 dp), or un-pins the app bar.
void main() {
  const width = 360.0;
  const heights = <double>[600.0, 800.0, 1200.0];

  for (final h in heights) {
    testWidgets('layout intent holds at ${h.toInt()}dp', (tester) async {
      await pumpProfileScreenV2(
        tester,
        statusProfile: const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          personalDisplayName: 'Aditya Nath',
        ),
        viewSize: Size(width, h),
      );

      // 1) Pinned-top app bar sits at y=0 (SafeArea inset ≤ 0 on the test
      //    view — the harness doesn't inject any padding).
      final appBar = tester.getRect(find.byKey(const Key('profile-v2-appbar')));
      expect(appBar.top, closeTo(0, 0.5),
          reason: 'app bar must pin to the top (was ${appBar.top} at $h dp)');

      // 2) Identity card immediately below the app bar.
      final identity =
          tester.getRect(find.byKey(const Key('profile-identity-card')));
      expect(identity.top, closeTo(appBar.bottom, 0.5),
          reason: 'identity card must sit flush below the app bar');

      // 3) Scroll region occupies the remaining height (Expanded).
      final scrollRegion =
          tester.getRect(find.byKey(const Key('profile-v2-scroll-region')));
      expect(scrollRegion.bottom, closeTo(h, 1.0),
          reason: 'flex-fill scroll region must reach the bottom edge');

      // 4) Exactly one Scrollable in the tree (the sole one inside the
      //    flex-fill zone). A root-level SingleChildScrollView would fail.
      final scrollables = find.byType(Scrollable);
      expect(scrollables, findsOneWidget,
          reason: 'exactly one Scrollable expected — the flex-fill zone');
      expect(
        find.descendant(
          of: find.byKey(const Key('profile-v2-scroll-region')),
          matching: find.byType(Scrollable),
        ),
        findsOneWidget,
        reason: 'the sole Scrollable must live inside the flex-fill zone',
      );
    });
  }
}
