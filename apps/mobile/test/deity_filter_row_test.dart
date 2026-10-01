import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/shared/widgets/deity_filter_row.dart';

import 'support/fake_repositories.dart';

Widget _host({
  required AsyncValue<List<DeityView>> deities,
  required String? selected,
  required ValueChanged<String?> onSelected,
}) {
  return MaterialApp(
    home: Scaffold(
      body: DeityFilterRow(
        deities: deities,
        selectedSlug: selected,
        onSelected: onSelected,
      ),
    ),
  );
}

void main() {
  final list = [
    fakeDeity('hanuman', name: 'Hanuman ji', order: 0),
    fakeDeity('ram', name: 'Ram ji', order: 1),
  ];

  group('DeityFilterRow', () {
    testWidgets('defaults to "All Gods" (null slug) selected', (tester) async {
      var emitted = 'sentinel';
      await tester.pumpWidget(_host(
        deities: AsyncData(list),
        selected: null,
        onSelected: (s) => emitted = s ?? 'null',
      ));

      expect(find.byKey(const Key('deity-chip-all')), findsOneWidget);
      expect(find.text('All Gods'), findsOneWidget);
      expect(find.text('Hanuman ji'), findsOneWidget);
      // No selection callback fires just from rendering the default.
      expect(emitted, 'sentinel');
    });

    testWidgets('tapping a deity emits its slug', (tester) async {
      String? emitted;
      await tester.pumpWidget(_host(
        deities: AsyncData(list),
        selected: null,
        onSelected: (s) => emitted = s,
      ));

      await tester.tap(find.byKey(const Key('deity-chip-ram')));
      expect(emitted, 'ram');
    });

    testWidgets('tapping "All Gods" emits null', (tester) async {
      String? emitted = 'ram';
      await tester.pumpWidget(_host(
        deities: AsyncData(list),
        selected: 'ram',
        onSelected: (s) => emitted = s,
      ));

      await tester.tap(find.byKey(const Key('deity-chip-all')));
      expect(emitted, isNull);
    });

    testWidgets(
        'active chip matches Figma `state=active` (brand300 label + CTA gradient ring)',
        (tester) async {
      await tester.pumpWidget(_host(
        deities: AsyncData(list),
        selected: 'ram',
        onSelected: (_) {},
      ));

      // Active caption colour == Figma active label #FE8A02 (brand300).
      final activeLabel = tester.widget<Text>(find.text('Ram ji'));
      expect(activeLabel.style!.color, AppColors.deityLabelActive);
      expect(AppColors.deityLabelActive, AppColors.brand300);

      // Default caption stays grey500 (#3F3F3F).
      final defaultLabel = tester.widget<Text>(find.text('Hanuman ji'));
      expect(defaultLabel.style!.color, AppColors.deityLabel);

      // Active chip shows the OUTSIDE gradient selection ring (AppGradient.ctaLR),
      // and no unselected chip does.
      final gradientRings = find.byWidgetPredicate((w) =>
          w is Container &&
          w.decoration is BoxDecoration &&
          (w.decoration as BoxDecoration).gradient == AppGradient.ctaLR);
      expect(gradientRings, findsOneWidget);
    });

    testWidgets('error state falls back to "All Gods" only', (tester) async {
      await tester.pumpWidget(_host(
        deities: AsyncError(Exception('boom'), StackTrace.empty),
        selected: null,
        onSelected: (_) {},
      ));

      expect(find.byKey(const Key('deity-chip-all')), findsOneWidget);
      expect(find.byKey(const Key('deity-chip-ram')), findsNothing);
    });

    testWidgets('loading state shows shimmer avatars', (tester) async {
      await tester.pumpWidget(_host(
        deities: const AsyncLoading(),
        selected: null,
        onSelected: (_) {},
      ));

      expect(find.byKey(const Key('deity-shimmer-0')), findsOneWidget);
      expect(find.byKey(const Key('deity-chip-all')), findsNothing);
    });
  });
}
