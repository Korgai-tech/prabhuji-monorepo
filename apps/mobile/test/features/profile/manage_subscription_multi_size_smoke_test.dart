import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/manage_subscription_harness.dart';

/// Multi-size smoke test for the TAM-125 Manage Subscription screen (Figma
/// `1939:19854`). Per
/// `patterns_library/testing/flutter-multi-size-smoke.md`: pump the screen
/// at nine (width × height) combinations, assert no `RenderFlex` overflow.
///
/// Text-scale bump at the tallest × widest cell catches the `height:` trap
/// (see figma-flutter skill "Literal `height:` translation around scalable
/// Text").
void main() {
  const widths = <double>[360.0, 400.0, 480.0];
  const heights = <double>[600.0, 800.0, 1200.0];

  for (final w in widths) {
    for (final h in heights) {
      testWidgets('${w.toInt()} × ${h.toInt()}dp renders without overflow',
          (tester) async {
        // Manually record any RenderFlex overflow — the test framework
        // otherwise routes them to the FlutterError handler and the test
        // passes silently.
        final overflowErrors = <FlutterErrorDetails>[];
        final originalOnError = FlutterError.onError;
        FlutterError.onError = (details) {
          if (details.exception.toString().contains('overflowed')) {
            overflowErrors.add(details);
          }
          originalOnError?.call(details);
        };
        addTearDown(() => FlutterError.onError = originalOnError);

        await pumpManageSubscriptionScreen(
          tester,
          viewSize: Size(w, h),
        );

        expect(
          overflowErrors,
          isEmpty,
          reason: 'RenderFlex overflow at ${w.toInt()} × ${h.toInt()}dp: '
              '${overflowErrors.map((e) => e.exception).join('; ')}',
        );
      });
    }
  }
}
