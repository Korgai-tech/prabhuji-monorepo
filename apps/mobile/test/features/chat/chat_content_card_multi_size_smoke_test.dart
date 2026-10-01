import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/features/chat/presentation/widgets/chat_content_card.dart';

/// Multi-size smoke test for [ChatContentCard] (spec §Standard mobile-spec
/// gates + spec Task 14). Sweeps every one of the six content types
/// (`aarti`, `bhajan`, `mantra`, `ringtone`, `status`, `wallpaper`) across
/// 320/390/428 dp widths × 600/800/1200 dp heights AND with
/// `textScaleFactor = 2.0`.
///
/// The card's header + CTA rows use `BoxConstraints(minHeight:)` — the
/// trap the row spec calls out (Figma `height: 84` → `minHeight: 84`, not
/// a rigid `height:`) — so a11y scaling grows those rows without a
/// `RenderFlex overflow`.
void main() {
  const widths = <double>[320, 390, 428];
  const heights = <double>[600, 800, 1200];
  const scales = <double>[1.0, 2.0];

  final item = ChatContentItem(
    id: 'content-id-that-is-quite-long-a-uuidish-slug-here',
    title: 'Hanuman Chalisa',
    playUrl: 'https://example.com/play',
    icon: '', // empty URL → AppNetworkImage's branded fallback
  );
  const longTitle =
      'A Very Long Content Title That Would Break A Fixed-Height Header';
  const subtitle = 'Mantra · 108 baar';

  for (final type in kChatContentTypes) {
    for (final w in widths) {
      for (final h in heights) {
        for (final s in scales) {
          testWidgets(
            'card($type) smoke @${w.toInt()}x${h.toInt()} textScale=$s',
            (tester) async {
              final errors = <FlutterErrorDetails>[];
              final originalOnError = FlutterError.onError;
              FlutterError.onError = errors.add;
              addTearDown(() => FlutterError.onError = originalOnError);

              GoogleFonts.config.allowRuntimeFetching = false;
              tester.view.physicalSize = Size(w, h);
              tester.view.devicePixelRatio = 1.0;
              tester.platformDispatcher.textScaleFactorTestValue = s;
              addTearDown(tester.view.resetPhysicalSize);
              addTearDown(tester.view.resetDevicePixelRatio);
              addTearDown(
                tester.platformDispatcher.clearTextScaleFactorTestValue,
              );

              await tester.pumpWidget(
                MaterialApp(
                  home: Scaffold(
                    body: SingleChildScrollView(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: <Widget>[
                            // Default variant.
                            ChatContentCard(
                              contentType: type,
                              item: item,
                              title: longTitle,
                              subtitle: subtitle,
                              onTap: () {},
                            ),
                            const SizedBox(height: 12),
                            // Active variant (orange 2 dp border).
                            ChatContentCard(
                              contentType: type,
                              item: item,
                              title: longTitle,
                              subtitle: subtitle,
                              active: true,
                              onTap: () {},
                            ),
                            const SizedBox(height: 12),
                            // Pro-locked (`playUrl: null`) variant — lock badge
                            // + greyed CTA. Tappable in production (the tap
                            // opens the paywall); no onTap here because this
                            // asserts layout only.
                            ChatContentCard(
                              contentType: type,
                              item: ChatContentItem(
                                id: item.id,
                                title: item.title,
                                playUrl: null,
                                icon: item.icon,
                              ),
                              title: longTitle,
                              subtitle: subtitle,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              );
              await tester.pump(const Duration(milliseconds: 50));

              expect(
                errors,
                isEmpty,
                reason:
                    'layout exceptions on $type '
                    '@${w.toInt()}x${h.toInt()} textScale=$s:\n'
                    '${errors.map((e) => e.exceptionAsString()).join('\n---\n')}',
              );
              expect(tester.takeException(), isNull);
            },
          );
        }
      }
    }
  }

  test('per-content-type CTA copy is locked to the 6 spec strings', () {
    // TAM-164 Slice-3 correction: the spec's copy strings included a
    // trailing " →" but Figma renders the arrow as a SEPARATE SVG chevron
    // (`assets/chat/chevron_right.svg`), not as part of the text. Keeping
    // both shipped a double-arrow. The strings below drop the trailing
    // arrow; the SVG chevron in `_CardCta` supplies the visual. Spec
    // amendment tracked in
    // `specs/evidence/TAM-164/fidelity/token-diff.md` § Follow-ups F-2.
    expect(chatContentCtaCopy['mantra'], 'Jaap shuru karein');
    expect(chatContentCtaCopy['aarti'], 'Sunna shuru karein');
    expect(chatContentCtaCopy['bhajan'], 'Sunna shuru karein');
    expect(chatContentCtaCopy['wallpaper'], 'Wallpaper lagayein');
    expect(chatContentCtaCopy['ringtone'], 'Ringtone lagayein');
    expect(chatContentCtaCopy['status'], 'Status dekhein');
    // Aarti + bhajan MUST share the same literal (not two separate copies).
    expect(
      identical(chatContentCtaCopy['aarti'], chatContentCtaCopy['bhajan']),
      isTrue,
      reason:
          'aarti + bhajan must share the same string literal, not two '
          'duplicate declarations — spec §Content-card tap behaviour',
    );
    // Every content-type key covered.
    for (final t in kChatContentTypes) {
      expect(
        chatContentCtaCopy.containsKey(t),
        isTrue,
        reason: 'missing CTA copy for content-type "$t"',
      );
    }
  });
}
