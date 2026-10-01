import 'package:flutter_test/flutter_test.dart';

import 'support/figma_crosscheck.dart';

/// Unit tests for the render-tree ↔ Figma node-tree diff util (TAM-60 Testing
/// Strategy). Proves the missing/stray/matched/intentional classification the
/// whole fidelity gate leans on.
void main() {
  group('crossCheck diff util', () {
    test('all Figma children rendered → matched, nothing missing', () {
      final r = crossCheck(
        figmaComponents: ['nav-tab-home', 'nav-tab-status', 'nav-tab-books'],
        renderedComponents: ['nav-tab-home', 'nav-tab-status', 'nav-tab-books'],
      );
      expect(r.matched, hasLength(3));
      expect(r.missing, isEmpty);
      expect(r.stray, isEmpty);
      expect(r.ok, isTrue);
    });

    test('a Figma child absent from the build is flagged MISSING', () {
      final r = crossCheck(
        figmaComponents: ['nav-tab-home', 'nav-tab-status', 'nav-tab-books'],
        renderedComponents: ['nav-tab-home', 'nav-tab-status'],
      );
      expect(r.missing, ['nav-tab-books']);
      expect(r.ok, isFalse);
    });

    test('a spec-authorized intentional drop is NOT flagged missing', () {
      // Home search bar (285:3499) is excluded from Phase 1 by spec.
      final r = crossCheck(
        figmaComponents: ['home-header', 'home-search', 'home-feed'],
        renderedComponents: ['home-header', 'home-feed'],
        intentional: ['home-search'],
      );
      expect(r.missing, isEmpty);
      expect(r.intentional, ['home-search']);
      expect(r.ok, isTrue);
    });

    test('an added component with no Figma node is reported as stray', () {
      // "All Gods" chip is a product addition absent from the Figma deity frame.
      final r = crossCheck(
        figmaComponents: ['deity-chip-hanuman'],
        renderedComponents: ['deity-chip-hanuman', 'deity-chip-all'],
        intentional: ['deity-chip-all'],
      );
      expect(r.missing, isEmpty);
      expect(r.stray, isEmpty, reason: 'intentional additions are not stray');
      expect(r.ok, isTrue);
    });

    test('markdown renders a PASS verdict + one row per Figma child', () {
      final md = renderCrossCheckMarkdown(
        ticket: 'TAM-99',
        figmaNode: '750:6252',
        screen: 'sample',
        rows: const [
          CrossCheckRow(figmaNode: 'a', component: 'nav-tab-home'),
          CrossCheckRow(figmaNode: 'b', component: 'nav-tab-status'),
        ],
        renderedComponents: const ['nav-tab-home', 'nav-tab-status'],
      );
      expect(md, contains('Verdict**: PASS'));
      expect(md, contains('`nav-tab-home`'));
      expect(md, contains('`nav-tab-status`'));
    });
  });
}
