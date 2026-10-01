import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/shared/widgets/app_network_image.dart';

void main() {
  group('AppNetworkImage', () {
    testWidgets('empty URL renders the branded fallback, NOT a broken glyph',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: AppNetworkImage(url: '', width: 120, height: 120),
        ),
      ));

      // Branded fallback present…
      expect(find.byKey(const Key('app-network-image-fallback')), findsOneWidget);
      // …and never Flutter's default broken-image glyph.
      expect(find.byIcon(Icons.broken_image), findsNothing);
      expect(find.byIcon(Icons.broken_image_outlined), findsNothing);
    });

    testWidgets('blank/whitespace URL is treated as empty → fallback',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(body: AppNetworkImage(url: '   ')),
      ));

      expect(find.byKey(const Key('app-network-image-fallback')), findsOneWidget);
    });

    testWidgets('a custom fallback is honored', (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: AppNetworkImage(
            url: '',
            fallback: Text('unavailable', key: Key('custom-fallback')),
          ),
        ),
      ));

      expect(find.byKey(const Key('custom-fallback')), findsOneWidget);
      expect(find.byKey(const Key('app-network-image-fallback')), findsNothing);
    });
  });
}
