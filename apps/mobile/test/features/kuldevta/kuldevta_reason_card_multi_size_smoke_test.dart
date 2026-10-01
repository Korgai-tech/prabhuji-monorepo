import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/kuldevta/presentation/widgets/kuldevta_reason_card.dart';

/// Multi-size smoke for the reason card (TAM-166).
///
/// Ensures a very long reason string (mimicking a temple-village-district
/// -state joined line) wraps without RenderFlex overflow at textScale
/// 2.0 across three phone widths.
void main() {
  const longReason =
      'Aap Barmer ke Charan samaj se he — Karni Mata Nagana ki adhishthatri '
      'devi he, Deshnoke Bikaner ke Karni Mata mandir se apka parivar sadiyon '
      'se juda hua he, aur aapka gotra Kiniya bhi Karni Mata ke bhaktvargon '
      'mein ata he.';

  const widths = <double>[320, 360, 428];

  for (final w in widths) {
    testWidgets('reason card — no overflow @ ${w.toInt()}dp × textScale=2.0',
        (tester) async {
      tester.view.physicalSize = Size(w, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        MediaQuery(
          data: MediaQueryData(
            size: Size(w, 800),
            textScaler: const TextScaler.linear(2.0),
          ),
          child: const Directionality(
            textDirection: TextDirection.ltr,
            child: Material(
              child: Center(
                child: KuldevtaReasonCard(reason: longReason),
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(tester.takeException(), isNull,
          reason:
              'long reason must wrap without overflow at ${w.toInt()}dp × 2.0');
    });
  }
}
