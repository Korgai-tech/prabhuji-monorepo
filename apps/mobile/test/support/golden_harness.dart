/// Golden-render + render-tree harness (TAM-60).
///
/// The headless half of the fidelity gate. Literal per-pixel identity vs a Figma
/// raster is NOT achievable headlessly (font anti-aliasing/hinting differs from
/// Figma's renderer), so a golden here is the *component regression lock* +
/// review artifact: a reviewer diffs it against the Figma frame PNG (exported
/// with `tools/figma-export.ts`). The gate is: exact tokens + exact Figma assets
/// + geometry + render-tree match + this golden reviewed vs the Figma frame.
///
/// Regenerate goldens: `flutter test --update-goldens test/goldens/`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/core/theme.dart';

/// Pump [child] under the REAL app theme at a pinned phone size, then decode
/// every asset image so goldens don't render blank art (image decode is real
/// async I/O — fake-async pumps never finish it).
Future<void> pumpForGolden(
  WidgetTester tester,
  Widget child, {
  Size size = const Size(360, 120),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: Scaffold(backgroundColor: AppColors.white, body: child),
    ),
  );
  await tester.pumpAndSettle();

  await tester.runAsync(() async {
    for (final el in find.byType(Image).evaluate()) {
      final image = (el.widget as Image).image;
      await precacheImage(image, el);
    }
  });
  await tester.pumpAndSettle();
}

/// Collect the stable `Key('...')` values present in the current render tree
/// whose string starts with [prefix] — the normalized render-tree component
/// list the cross-check diffs against the Figma node children.
List<String> renderedKeys(WidgetTester tester, String prefix) {
  final keys = <String>{};
  for (final widget in tester.allWidgets) {
    final key = widget.key;
    if (key is ValueKey && key.value is String) {
      final v = key.value as String;
      if (v.startsWith(prefix)) keys.add(v);
    }
  }
  final list = keys.toList()..sort();
  return list;
}
