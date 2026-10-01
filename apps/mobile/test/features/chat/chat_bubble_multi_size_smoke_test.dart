import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/presentation/widgets/chat_bubble.dart';

/// Multi-size smoke test for [ChatBubble] (spec §Standard mobile-spec gates
/// + spec Task 14). Asserts NO Flutter layout exception fires across
/// 320/390/428 dp widths × 600/800/1200 dp heights AND with
/// `textScaleFactor = 2.0`.
///
/// The bubble uses `BoxConstraints(minHeight:)` around scalable [Text], NOT
/// a rigid `height:`, so a11y scaling grows the pill vertically without a
/// `RenderFlex` overflow. This test is the guardrail that catches a
/// regression if someone tightens the layout with a fixed `height:`.
void main() {
  const widths = <double>[320, 390, 428];
  const heights = <double>[600, 800, 1200];
  const scales = <double>[1.0, 2.0];

  const longText =
      'This is a deliberately long bubble that must wrap across '
      'multiple lines when the container is narrow. Multi-line handling '
      'is the whole point of the constrained-max-width bubble pill and '
      'why we use minHeight instead of a rigid height around the Text.';

  for (final w in widths) {
    for (final h in heights) {
      for (final s in scales) {
        testWidgets('bubble smoke @${w}x$h textScale=$s', (tester) async {
          final errors = <FlutterErrorDetails>[];
          final originalOnError = FlutterError.onError;
          FlutterError.onError = errors.add;
          addTearDown(() => FlutterError.onError = originalOnError);

          tester.view.physicalSize = Size(w, h);
          tester.view.devicePixelRatio = 1.0;
          tester.platformDispatcher.textScaleFactorTestValue = s;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

          await tester.pumpWidget(
            MaterialApp(
              home: Scaffold(
                body: Padding(
                  padding: const EdgeInsets.all(16),
                  child: ListView(
                    children: const <Widget>[
                      ChatBubble(
                        variant: ChatBubbleVariant.user,
                        message: longText,
                      ),
                      SizedBox(height: 12),
                      ChatBubble(
                        variant: ChatBubbleVariant.bot,
                        message: longText,
                      ),
                      SizedBox(height: 12),
                      ChatBubble(variant: ChatBubbleVariant.typing),
                    ],
                  ),
                ),
              ),
            ),
          );
          // Pump a few frames so the typing dots' animation controller
          // ticks at least once. Do NOT `pumpAndSettle` — the dots repeat
          // indefinitely.
          for (var i = 0; i < 4; i++) {
            await tester.pump(const Duration(milliseconds: 20));
          }

          expect(
            errors,
            isEmpty,
            reason:
                'layout exceptions at ${w.toInt()}x${h.toInt()} textScale=$s:\n'
                '${errors.map((e) => e.exceptionAsString()).join('\n---\n')}',
          );
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}
