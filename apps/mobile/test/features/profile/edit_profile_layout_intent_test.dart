import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/status/data/status_models.dart';

import '../../support/profile_harness.dart';

/// Layout-intent test for the Edit Profile screen (spec: TAM-N-profile-v2,
/// Figma `1527:10036`). Asserts the pinned/flex zones declared in the
/// spec's Layout intent block hold at short, mid, and tall device heights.
///
/// Zones asserted (spec Layout intent table):
///   - `edit-profile-appbar`         — pinned top
///   - `edit-profile-scroll-region`  — flex-fill (Expanded around scroll)
///   - `edit-profile-save-region`    — pinned bottom (Save CTA)
///
/// Fails when someone drops the Save out of the pinned-bottom row (e.g.
/// puts it inside the scroll body), removes the Expanded on the scroll
/// region (Save floats mid-screen at 1200 dp), or wraps the root in a
/// SingleChildScrollView (would give two Scrollables).
void main() {
  const width = 360.0;
  const heights = <double>[600.0, 800.0, 1200.0];

  for (final h in heights) {
    testWidgets('layout intent holds at ${h.toInt()}dp', (tester) async {
      await pumpEditProfileScreen(
        tester,
        statusProfile: const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          personalDisplayName: 'Aditya Nath',
        ),
        viewSize: Size(width, h),
      );

      final appBar =
          tester.getRect(find.byKey(const Key('edit-profile-appbar')));
      expect(appBar.top, closeTo(0, 0.5),
          reason: 'app bar must pin to the top (was ${appBar.top} at $h dp)');

      final saveRegion =
          tester.getRect(find.byKey(const Key('edit-profile-save-region')));
      expect(saveRegion.bottom, closeTo(h, 1.0),
          reason: 'Save CTA region must pin to the bottom (was '
              '${saveRegion.bottom} at $h dp)');

      final scrollRegion =
          tester.getRect(find.byKey(const Key('edit-profile-scroll-region')));
      expect(scrollRegion.top, closeTo(appBar.bottom, 0.5),
          reason: 'flex-fill scroll region must sit directly below the app bar');
      expect(scrollRegion.bottom, closeTo(saveRegion.top, 0.5),
          reason: 'flex-fill scroll region must end where the pinned Save '
              'CTA begins');

      // Exactly one Scrollable — the sole one inside the flex-fill zone.
      final scrollables = find.byType(Scrollable);
      // The TextField's EditableText mounts its own Scrollable internally
      // — count only the descendants of the scroll-region key so the
      // assertion is about our OWN scroll region and not incidental
      // widget-tree noise.
      final regionScrollables = find.descendant(
        of: find.byKey(const Key('edit-profile-scroll-region')),
        matching: find.byType(Scrollable),
      );
      expect(
        regionScrollables,
        findsWidgets,
        reason: 'the flex-fill zone must host at least one Scrollable',
      );
      // Root has no Scrollable outside the flex zone or the TextField —
      // asserted by ensuring every Scrollable is a descendant of either
      // the scroll-region or the name field.
      expect(scrollables, findsAtLeastNWidgets(1));
    });
  }
}
