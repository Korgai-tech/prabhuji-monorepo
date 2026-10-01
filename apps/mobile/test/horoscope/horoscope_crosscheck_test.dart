import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_horoscope_services.dart';
import '../support/figma_crosscheck.dart';
import '../support/golden_harness.dart';
import '../support/horoscope_harness.dart';

/// Render-tree ↔ Figma node-tree cross-check (TAM-60) for the Horoscope module.
/// Pumps each coverage-set screen, sweeps its stable keys, diffs them against the
/// Figma frame's children, and writes the combined `cross-check.md` + per-screen
/// `render-tree/*.md` evidence. Asserts nothing the design requires is missing.
void main() {
  testWidgets('cross-check: horoscope main + result vs Figma', (tester) async {
    Directory(
      '${Directory.current.path}/../../specs/evidence/TAM-74/fidelity/render-tree',
    ).createSync(recursive: true);
    final buffer = StringBuffer();

    // --- Horoscope Main (371:3796) ------------------------------------------
    await pumpHoroscopeMain(tester, repository: FakeHoroscopeRepository());
    final mainKeys = renderedKeys(tester, 'horoscope-');
    const mainRequired = [
      'horoscope-title',
      'horoscope-date',
      'horoscope-zodiac-grid',
      'horoscope-zodiac-aries',
      'horoscope-zodiac-taurus',
      'horoscope-zodiac-gemini',
      'horoscope-zodiac-cancer',
      'horoscope-zodiac-leo',
      'horoscope-zodiac-virgo',
      'horoscope-zodiac-libra',
      'horoscope-zodiac-scorpio',
      'horoscope-zodiac-sagittarius',
      'horoscope-zodiac-capricorn',
      'horoscope-zodiac-aquarius',
      'horoscope-zodiac-pisces',
    ];
    final mainMd = renderCrossCheckMarkdown(
      ticket: 'TAM-74',
      figmaNode: '371:3796',
      screen: 'Horoscope Main (zodiac grid)',
      renderedComponents: mainKeys,
      intentional: const [
        'status-bar',
        'basic-nav-avatar',
        'basic-nav-trailing',
        'bottom-nav',
        'zodiac-lock-badge',
      ],
      rows: const [
        CrossCheckRow(figmaNode: 'Basic Nav → Title "Today\'s Horoscope" (I371:3798;5186:10465)', component: 'horoscope-title'),
        CrossCheckRow(figmaNode: 'Frame 1000001774 → date "15 June, 2026" (379:2578)', component: 'horoscope-date'),
        CrossCheckRow(figmaNode: 'Frame 2147227404 → 3-col GRID (375:2270)', component: 'horoscope-zodiac-grid'),
        CrossCheckRow(figmaNode: 'Grid → Horoscope card "Aries" (379:2333)', component: 'horoscope-zodiac-aries'),
        CrossCheckRow(figmaNode: 'Grid → Horoscope card "Taurus" (379:2425)', component: 'horoscope-zodiac-taurus'),
        CrossCheckRow(figmaNode: 'Grid → Horoscope card "Gemini" (379:2431)', component: 'horoscope-zodiac-gemini'),
        CrossCheckRow(figmaNode: 'Grid → Horoscope card "Cancer" (379:2437)', component: 'horoscope-zodiac-cancer'),
        CrossCheckRow(figmaNode: 'Grid → Horoscope card "Leo" (379:2443)', component: 'horoscope-zodiac-leo'),
        CrossCheckRow(figmaNode: 'Grid → Horoscope card "Virgo" (379:2449)', component: 'horoscope-zodiac-virgo'),
        CrossCheckRow(figmaNode: 'Grid → Horoscope card "Libra" (379:2455)', component: 'horoscope-zodiac-libra'),
        CrossCheckRow(figmaNode: 'Grid → Horoscope card "Scorpio" (379:2461)', component: 'horoscope-zodiac-scorpio'),
        CrossCheckRow(
          figmaNode: 'Grid → Horoscope card "Sagittarius" (379:2467)',
          component: 'horoscope-zodiac-sagittarius',
          notes: 'Figma label renders "Sagittarius"; the icon LAYER is misnamed. '
              'API supplies the label — no typo can reach the UI.',
        ),
        CrossCheckRow(
          figmaNode: 'Grid → Horoscope card "Capricorn" (379:2473)',
          component: 'horoscope-zodiac-capricorn',
          notes: 'Icon layer is named "capricon"; the rendered label is correct. '
              'API supplies the label.',
        ),
        CrossCheckRow(figmaNode: 'Grid → Horoscope card "Aquarius" (379:2479)', component: 'horoscope-zodiac-aquarius'),
        CrossCheckRow(figmaNode: 'Grid → Horoscope card "Pisces" (379:2485)', component: 'horoscope-zodiac-pisces'),
        CrossCheckRow(
          figmaNode: 'Status bar (371:3797)',
          component: 'status-bar',
          notes: 'Intentional: OS status bar, not app UI.',
        ),
        CrossCheckRow(
          figmaNode: 'Basic Nav → Avatar (I371:3798;5186:10464)',
          component: 'basic-nav-avatar',
          notes: 'Intentional: `visible:false` in the frame — not rendered by the design.',
        ),
        CrossCheckRow(
          figmaNode: 'Basic Nav → Trailing Icon 1/2/3 pencil+phone+gear (I371:3798;5186:10467/10468/10469)',
          component: 'basic-nav-trailing',
          notes: 'Intentional: all three `visible:false` in the frame — the '
              'Horoscope header is title-only.',
        ),
        CrossCheckRow(
          figmaNode: 'Component 26 → bottom nav (371:3818)',
          component: 'bottom-nav',
          notes: 'Intentional: provided by the TAM-58 shell (StatefulShellRoute), '
              'which hosts this screen as its Horoscope branch — not re-implemented here.',
        ),
        CrossCheckRow(
          figmaNode: 'Zodiac card lock/Pro badge',
          component: 'zodiac-lock-badge',
          notes: 'Intentional: PRD §5 FORBIDS lock badges / Pro labels on zodiac '
              'cards (spec Design References). Gating happens on tap via PaywallGate.',
        ),
      ],
    );
    expect(
      crossCheck(figmaComponents: mainRequired, renderedComponents: mainKeys).ok,
      isTrue,
      reason: 'a required Horoscope Main component is missing from the render tree',
    );
    writeEvidence('TAM-74', 'render-tree/horoscope-main.md', mainMd);
    buffer..writeln(mainMd)..writeln('\n---\n');

    // --- Horoscope Result (387:2571 / 387:2491) -----------------------------
    await tester.pumpWidget(const SizedBox());
    await pumpHoroscopeResult(
      tester,
      repository: FakeHoroscopeRepository(),
    );
    final resultKeys = renderedKeys(tester, 'horoscope-');
    const resultRequired = [
      'horoscope-result-background',
      'horoscope-result-video',
      'horoscope-result-back',
      'horoscope-result-tts',
      'horoscope-result-zodiac',
      'horoscope-result-date',
      'horoscope-card-art',
      'horoscope-step-card',
      'horoscope-step-title',
      'horoscope-step-text',
      'horoscope-next',
    ];
    final resultMd = renderCrossCheckMarkdown(
      ticket: 'TAM-74',
      figmaNode: '387:2571 (+ nav 387:2491)',
      screen: 'Horoscope Result (daily reading)',
      renderedComponents: resultKeys,
      intentional: const [
        'status-bar',
        'basic-nav-title',
        'basic-nav-trailing',
        'bottom-nav',
        'horoscope-finish',
        'horoscope-result-fallback',
        'stale-frame-dupes',
      ],
      rows: const [
        CrossCheckRow(figmaNode: 'Video/still backdrop 450×800 cover (387:2572) + 50% scrim (387:2573)', component: 'horoscope-result-background'),
        CrossCheckRow(figmaNode: 'Backdrop → looping silent video (387:2572)', component: 'horoscope-result-video'),
        CrossCheckRow(figmaNode: 'Basic Nav → Leading Icon back (I1173:4536;5186:10373)', component: 'horoscope-result-back'),
        CrossCheckRow(figmaNode: 'Basic Nav → Trailing Icon 2 TTS mute/unmute (I1173:4536;5186:10379)', component: 'horoscope-result-tts'),
        CrossCheckRow(figmaNode: 'Zodiac header → pill icon+name (387:2611)', component: 'horoscope-result-zodiac'),
        CrossCheckRow(figmaNode: 'Zodiac header → date row (387:2614/387:2616)', component: 'horoscope-result-date'),
        CrossCheckRow(figmaNode: 'Frame 2147227404 → step card region (387:2576)', component: 'horoscope-step-card'),
        CrossCheckRow(figmaNode: 'Vector [Vectorized] card border + flourish (1162:4407)', component: 'horoscope-card-art'),
        CrossCheckRow(figmaNode: 'Step title pill (1162:4437/1162:4438)', component: 'horoscope-step-title'),
        CrossCheckRow(figmaNode: 'Step body text (1162:4436)', component: 'horoscope-step-text'),
        CrossCheckRow(figmaNode: 'Main Buttons → Next (1162:4461)', component: 'horoscope-next'),
        CrossCheckRow(
          figmaNode: 'Main Buttons → Finish (I1162:4485;5178:7620, frame 392:2628)',
          component: 'horoscope-finish',
          notes: 'Intentional: the SAME CTA in its final-step state — rendered '
              'instead of `horoscope-next` on the last enabled step (asserted in '
              'horoscope_result_screen_test.dart).',
        ),
        CrossCheckRow(
          figmaNode: 'Backdrop → static fallback still',
          component: 'horoscope-result-fallback',
          notes: 'Intentional: the failure-path sibling of `horoscope-result-video` '
              '— only one renders at a time (asserted in the video-failure test).',
        ),
        CrossCheckRow(
          figmaNode: 'Status bar (387:2574)',
          component: 'status-bar',
          notes: 'Intentional: OS status bar, not app UI.',
        ),
        CrossCheckRow(
          figmaNode: 'Basic Nav → Title (I1173:4536;5186:10376)',
          component: 'basic-nav-title',
          notes: 'Intentional: the frame ships this text EMPTY ("") — the result '
              'header shows the zodiac pill instead of a nav title.',
        ),
        CrossCheckRow(
          figmaNode: 'Basic Nav → Avatar + Trailing 1/3 (I1173:4536;5186:10375/10378/10380)',
          component: 'basic-nav-trailing',
          notes: 'Intentional: `visible:false` in the frame.',
        ),
        CrossCheckRow(
          figmaNode: 'Component 26 → bottom nav (387:2543)',
          component: 'bottom-nav',
          notes: 'Intentional: `visible:false` in the frame — the result flow '
              'pushes OVER the shell with its own back arrow, no bottom tabs.',
        ),
        CrossCheckRow(
          figmaNode: 'Hidden duplicate card art + zodiac cards (392:3112, 387:2523-2540, 387:2541)',
          component: 'stale-frame-dupes',
          notes: 'Intentional: `visible:false` leftovers copied from the main '
              'frame — the RENDERED frame shows none of them.',
        ),
      ],
    );
    expect(
      crossCheck(
        figmaComponents: resultRequired,
        renderedComponents: resultKeys,
      ).ok,
      isTrue,
      reason: 'a required Horoscope Result component is missing from the render tree',
    );
    writeEvidence('TAM-74', 'render-tree/horoscope-result.md', resultMd);
    buffer.writeln(resultMd);

    writeEvidence('TAM-74', 'cross-check.md', buffer.toString());
  });
}
