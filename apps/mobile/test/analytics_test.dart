import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/analytics.dart';

void main() {
  group('Analytics.clickProperties', () {
    test('sets screen and element as first-class dimensions', () {
      expect(Analytics.clickProperties('login', 'sign-in-button'), {
        'screen': 'login',
        'element': 'sign-in-button',
      });
    });

    test('merges extra properties without shadowing screen/element', () {
      final props = Analytics.clickProperties('home', 'buy-button', {
        'source': 'banner',
        'screen': 'not-allowed-to-override',
      });
      expect(props['screen'], 'home');
      expect(props['element'], 'buy-button');
      expect(props['source'], 'banner');
    });
  });
}
