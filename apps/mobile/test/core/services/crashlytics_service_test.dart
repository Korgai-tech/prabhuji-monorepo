import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/services/crashlytics_service.dart';

/// Unit tests for [CrashlyticsService]: the fatal-escalation classifier, and
/// the "Firebase absent ⇒ inert" contract (tests never initialise Firebase).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('CrashlyticsService.isFatalDartError', () {
    test('null-check operator failure is fatal', () {
      Object? caught;
      try {
        final String? value = null;
        // ignore: unnecessary_non_null_assertion
        value!.length;
      } catch (e) {
        caught = e;
      }
      expect(CrashlyticsService.isFatalDartError(caught!), isTrue);
    });

    test('late init failure is fatal', () {
      final holder = _LateHolder();
      Object? caught;
      try {
        holder.value.length;
      } catch (e) {
        caught = e;
      }
      expect(CrashlyticsService.isFatalDartError(caught!), isTrue);
    });

    test('ordinary exceptions and errors stay non-fatal', () {
      expect(
        CrashlyticsService.isFatalDartError(Exception('network down')),
        isFalse,
      );
      expect(CrashlyticsService.isFatalDartError(StateError('bad')), isFalse);
      expect(
        CrashlyticsService.isFatalDartError(RangeError.index(3, [1])),
        isFalse,
      );
    });
  });

  group('CrashlyticsService without Firebase', () {
    test(
      'initialize is a no-op and leaves the error hooks untouched',
      () async {
        final before = FlutterError.onError;

        await CrashlyticsService.instance.initialize();

        expect(CrashlyticsService.instance.isInitialized, isFalse);
        expect(FlutterError.onError, same(before));
      },
    );

    test('every verb short-circuits without throwing', () async {
      final service = CrashlyticsService.instance;
      await service.setUserFromToken('not.a.jwt');
      await service.setUserFromToken(null);
      await service.setUserIdentifier('user-1');
      await service.clearUserIdentifier();
      await service.recordError(Exception('x'), StackTrace.current);
      await service.setCustomKey('k', 'v');
      await service.log('breadcrumb');
      expect(service.isInitialized, isFalse);
    });
  });
}

class _LateHolder {
  late String value;
}
