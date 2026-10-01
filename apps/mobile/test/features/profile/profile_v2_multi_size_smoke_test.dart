import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/status/data/status_models.dart';

import '../../support/profile_harness.dart';

/// Multi-size smoke for the Profile v2 + Edit Profile screens. Pumps both
/// at 3 widths × 3 heights and asserts NO Flutter layout exception fires,
/// plus one text-scale=2.0 case to catch the class of bug where a fixed
/// height row wraps scalable text (figma-flutter trap:
/// "Literal `height:` translation around scalable Text").
void main() {
  const widths = <double>[320.0, 390.0, 428.0];
  const heights = <double>[600.0, 800.0, 1200.0];

  for (final w in widths) {
    for (final h in heights) {
      testWidgets(
          'Profile v2 renders without layout exceptions at '
          '${w.toInt()}x${h.toInt()}', (tester) async {
        final errors = <FlutterErrorDetails>[];
        final originalOnError = FlutterError.onError;
        FlutterError.onError = errors.add;
        addTearDown(() => FlutterError.onError = originalOnError);

        await pumpProfileScreenV2(
          tester,
          statusProfile: const StatusProfileData(
            activeProfileType: StatusProfileType.personal,
            personalDisplayName: 'Aditya Nath',
          ),
          viewSize: Size(w, h),
        );

        expect(errors, isEmpty,
            reason: 'layout exceptions at ${w.toInt()}x${h.toInt()}:\n'
                '${errors.map((e) => e.exceptionAsString()).join('\n---\n')}');
      });

      testWidgets(
          'Edit Profile renders without layout exceptions at '
          '${w.toInt()}x${h.toInt()}', (tester) async {
        final errors = <FlutterErrorDetails>[];
        final originalOnError = FlutterError.onError;
        FlutterError.onError = errors.add;
        addTearDown(() => FlutterError.onError = originalOnError);

        await pumpEditProfileScreen(
          tester,
          statusProfile: const StatusProfileData(
            activeProfileType: StatusProfileType.personal,
            personalDisplayName: 'Aditya Nath',
          ),
          viewSize: Size(w, h),
        );

        expect(errors, isEmpty,
            reason: 'layout exceptions at ${w.toInt()}x${h.toInt()}:\n'
                '${errors.map((e) => e.exceptionAsString()).join('\n---\n')}');
      });
    }
  }

  testWidgets('Profile v2 renders without layout exceptions at textScale 2.0',
      (tester) async {
    final errors = <FlutterErrorDetails>[];
    final originalOnError = FlutterError.onError;
    FlutterError.onError = errors.add;
    addTearDown(() => FlutterError.onError = originalOnError);

    await pumpProfileScreenV2(
      tester,
      statusProfile: const StatusProfileData(
        activeProfileType: StatusProfileType.personal,
        personalDisplayName: 'Aditya Nath',
      ),
      viewSize: const Size(390, 800),
      textScale: 2.0,
    );

    expect(errors, isEmpty,
        reason: 'layout exceptions at textScale 2.0:\n'
            '${errors.map((e) => e.exceptionAsString()).join('\n---\n')}');
  });

  testWidgets('Edit Profile renders without layout exceptions at textScale 2.0',
      (tester) async {
    final errors = <FlutterErrorDetails>[];
    final originalOnError = FlutterError.onError;
    FlutterError.onError = errors.add;
    addTearDown(() => FlutterError.onError = originalOnError);

    await pumpEditProfileScreen(
      tester,
      statusProfile: const StatusProfileData(
        activeProfileType: StatusProfileType.personal,
        personalDisplayName: 'Aditya Nath',
      ),
      viewSize: const Size(390, 800),
      textScale: 2.0,
    );

    expect(errors, isEmpty,
        reason: 'layout exceptions at textScale 2.0:\n'
            '${errors.map((e) => e.exceptionAsString()).join('\n---\n')}');
  });
}
