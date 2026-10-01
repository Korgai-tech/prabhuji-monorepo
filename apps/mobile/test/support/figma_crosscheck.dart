/// Render-tree ↔ Figma node-tree cross-check (TAM-60).
///
/// This is the ADDITIVE half of the fidelity gate: the figma-flutter Phase-6
/// sweep catches pixel/token drift, this catches a whole component going MISSING
/// (a card/section/tab absent from the build). Every module UI ticket
/// (TAM-62/64/66/68/70/72/74/76) runs it and commits the emitted `cross-check.md`
/// under `specs/evidence/TAM-{N}/fidelity/`.
///
/// It is deliberately pure Dart (no Flutter import) so the diff logic is unit
/// tested directly; the widget-side collectors live in `golden_harness.dart`.
library;

import 'dart:io';

/// The verdict of comparing a Figma node-child list to a rendered component list.
class CrossCheckResult {
  const CrossCheckResult({
    required this.matched,
    required this.missing,
    required this.stray,
    required this.intentional,
  });

  /// Present in BOTH the Figma node-tree and the render-tree.
  final List<String> matched;

  /// In the Figma node-tree but ABSENT from the render-tree and NOT on the
  /// `intentional` allowlist — the failure mode this check exists to catch.
  final List<String> missing;

  /// In the render-tree but NOT in the Figma node-tree (an added element).
  final List<String> stray;

  /// Figma components intentionally dropped in this phase (spec-authorized).
  /// Listed for the record; never counted as [missing].
  final List<String> intentional;

  /// The gate passes only when nothing the design requires is missing.
  bool get ok => missing.isEmpty;
}

/// Diff a Figma child-component list against a rendered-component list.
///
/// [intentional] entries are spec-authorized divergences (e.g. the Home search
/// bar excluded from Phase 1, or an added "All Gods" chip with no Figma node) —
/// they are recorded but never flagged as [CrossCheckResult.missing].
CrossCheckResult crossCheck({
  required List<String> figmaComponents,
  required List<String> renderedComponents,
  List<String> intentional = const <String>[],
}) {
  final rendered = renderedComponents.toSet();
  final figma = figmaComponents.toSet();
  final allow = intentional.toSet();

  final matched = <String>[];
  final missing = <String>[];
  for (final c in figmaComponents) {
    if (rendered.contains(c)) {
      matched.add(c);
    } else if (!allow.contains(c)) {
      missing.add(c);
    }
  }

  final stray = <String>[];
  for (final c in renderedComponents) {
    if (!figma.contains(c) && !allow.contains(c)) stray.add(c);
  }

  return CrossCheckResult(
    matched: matched,
    missing: missing,
    stray: stray,
    intentional: intentional.toList(),
  );
}

/// One expected mapping from a Figma node/child to the Flutter component that
/// should render it. `notes` documents an `intentional` divergence.
class CrossCheckRow {
  const CrossCheckRow({
    required this.figmaNode,
    required this.component,
    this.notes = '',
  });

  final String figmaNode; // e.g. 'I750:6252;750:5521 "Status"'
  final String component; // e.g. 'nav-tab-status'
  final String notes;
}

/// Render a `cross-check.md` table + verdict for the evidence folder. Returns the
/// markdown so the caller can also assert on it.
String renderCrossCheckMarkdown({
  required String ticket,
  required String figmaNode,
  required String screen,
  required List<CrossCheckRow> rows,
  required List<String> renderedComponents,
  List<String> intentional = const <String>[],
}) {
  final result = crossCheck(
    figmaComponents: rows.map((r) => r.component).toList(),
    renderedComponents: renderedComponents,
    intentional: intentional,
  );

  final b = StringBuffer()
    ..writeln('# $ticket — Render-tree ↔ Figma node-tree cross-check')
    ..writeln()
    ..writeln('- **Screen**: $screen')
    ..writeln('- **Figma node**: `$figmaNode`')
    ..writeln('- **Method**: `WidgetTester` key sweep vs the Figma node children '
        '(TAM-60 harness, `test/support/figma_crosscheck.dart`).')
    ..writeln()
    ..writeln('| Figma node → child | Expected component | Present? | Notes |')
    ..writeln('|---|---|:--:|---|');
  for (final r in rows) {
    final present = renderedComponents.contains(r.component);
    final isIntentional = intentional.contains(r.component);
    final mark = present
        ? '✅ yes'
        : isIntentional
            ? '➖ intentional'
            : '❌ MISSING';
    b.writeln('| ${r.figmaNode} | `${r.component}` | $mark | ${r.notes} |');
  }
  b
    ..writeln()
    ..writeln('**Verdict**: ${result.ok ? 'PASS' : 'FAIL'} — '
        'matched ${result.matched.length}, '
        'missing ${result.missing.length}, '
        'stray ${result.stray.length}, '
        'intentional ${result.intentional.length}.');
  if (result.missing.isNotEmpty) {
    b.writeln();
    b.writeln('> MISSING (design components absent from the build): '
        '${result.missing.join(', ')}');
  }
  return b.toString();
}

/// Write [content] to `specs/evidence/TAM-{N}/fidelity/<name>` relative to the
/// repo root (tests run from `apps/mobile`, hence the `../../`).
///
/// [name] may contain a subdirectory (e.g. `render-tree/cross-check-home.md` —
/// the layout TAM-72/74 adopted); its parents are created too.
File writeEvidence(String ticket, String name, String content) {
  Directory(
    '${Directory.current.path}/../../specs/evidence/$ticket/fidelity',
  ).createSync(recursive: true);
  final file = File(
    '${Directory.current.path}/../../specs/evidence/$ticket/fidelity/$name',
  );
  file.parent.createSync(recursive: true);
  file.writeAsStringSync(content);
  return file;
}
