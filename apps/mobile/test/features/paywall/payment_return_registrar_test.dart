import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/paywall/application/payment_return_registrar.dart';

/// TAM-124 Part A — verifies the static registrar seams that wire the
/// long-lived services (DeepLinkService, PlatformUpiLauncher) into the
/// route-scoped paywall. Two seams, same lifecycle: paywall route
/// registers on initState, clears on dispose.

void main() {
  // Static state — tearDown after every test so cross-test pollution
  // can't wedge a later suite into "seam still wired from the last test".
  tearDown(() {
    PaymentReturnRegistrar.clearOnPaymentReturn();
    PaymentReturnRegistrar.clearOnNeedsWebView();
  });

  group('PaymentReturnRegistrar.onPaymentReturn', () {
    test('firePaymentReturn is a no-op when nothing is registered', () {
      // Typical during onboarding — a return URL that somehow fires
      // before the paywall route is even mounted must not throw.
      expect(
        () => PaymentReturnRegistrar.firePaymentReturn(const {}),
        returnsNormally,
      );
    });

    test('firePaymentReturn invokes the registered callback with attribution',
        () {
      final captured = <Map<String, String>>[];
      PaymentReturnRegistrar.setOnPaymentReturn(captured.add);

      PaymentReturnRegistrar.firePaymentReturn({
        'provider': 'cashfree',
        'mandateId': 'mnd_42',
      });

      expect(captured, hasLength(1));
      expect(captured.single, {
        'provider': 'cashfree',
        'mandateId': 'mnd_42',
      });
    });

    test('clearOnPaymentReturn drops the callback', () {
      final captured = <Map<String, String>>[];
      PaymentReturnRegistrar.setOnPaymentReturn(captured.add);
      PaymentReturnRegistrar.clearOnPaymentReturn();

      PaymentReturnRegistrar.firePaymentReturn(const {'provider': 'cashfree'});

      expect(captured, isEmpty);
    });

    test('setOnPaymentReturn replaces any previously registered callback', () {
      // Paywall re-mount (e.g. after a hot restart) must not stack a
      // second listener that fires the OLD bloc — the previous one is
      // gone; only the latest binder wins.
      final firstBlocFires = <Map<String, String>>[];
      final secondBlocFires = <Map<String, String>>[];
      PaymentReturnRegistrar.setOnPaymentReturn(firstBlocFires.add);
      PaymentReturnRegistrar.setOnPaymentReturn(secondBlocFires.add);

      PaymentReturnRegistrar.firePaymentReturn(const {'provider': 'cashfree'});

      expect(firstBlocFires, isEmpty,
          reason: 'the stale listener from the previous mount must not fire');
      expect(secondBlocFires, hasLength(1));
    });
  });

  group('PaymentReturnRegistrar.onNeedsWebView', () {
    test('fireNeedsWebView returns null when nothing is registered', () async {
      // The launcher branches on this: null → fall through to
      // url_launcher (external browser). Not a "failure" — just the
      // paywall isn't up so there is no in-app WebView to push into.
      final result = PaymentReturnRegistrar.fireNeedsWebView('https://x/y');
      expect(result, isNull);
    });

    test('fireNeedsWebView invokes the registered callback with the URL',
        () async {
      final captured = <String>[];
      PaymentReturnRegistrar.setOnNeedsWebView((url) async {
        captured.add(url);
        return true;
      });

      final result = PaymentReturnRegistrar.fireNeedsWebView(
        'https://payments.cashfree.com/pay/authorize/abc',
      );

      expect(result, isNotNull);
      expect(await result, isTrue);
      expect(captured, ['https://payments.cashfree.com/pay/authorize/abc']);
    });

    test('clearOnNeedsWebView drops the callback', () async {
      PaymentReturnRegistrar.setOnNeedsWebView((_) async => true);
      PaymentReturnRegistrar.clearOnNeedsWebView();

      final result = PaymentReturnRegistrar.fireNeedsWebView('https://x/y');
      expect(result, isNull);
    });
  });
}
