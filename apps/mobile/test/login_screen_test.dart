import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/api/api_client.dart';
import 'package:mobile/features/auth/login_screen.dart';
import 'package:mobile/state/providers.dart';

/// A fake that overrides only the client boundary. The injected [Dio] is never
/// exercised because every method is overridden, so `Dio()` is a safe stub.
class _FakeApiClient extends ApiClient {
  _FakeApiClient(this._onLogin) : super(Dio());
  final Future<String> Function(String email, String password) _onLogin;

  @override
  Future<String> login(String email, String password) => _onLogin(email, password);
}

Future<void> _pumpLogin(WidgetTester tester, _FakeApiClient fake) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(fake)],
      child: const MaterialApp(home: LoginScreen()),
    ),
  );
}

void main() {
  testWidgets('LoginScreen renders email + password fields and a sign-in button', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: MaterialApp(home: LoginScreen())));
    expect(find.byType(TextField), findsNWidgets(2));
    expect(find.text('Sign in'), findsOneWidget);
  });

  testWidgets('a 401 auth failure shows "Invalid credentials"', (tester) async {
    final fake = _FakeApiClient((_, _) async {
      throw DioException(
        requestOptions: RequestOptions(path: '/auth/login'),
        response: Response<dynamic>(
          requestOptions: RequestOptions(path: '/auth/login'),
          statusCode: 401,
        ),
        type: DioExceptionType.badResponse,
      );
    });
    await _pumpLogin(tester, fake);

    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

    expect(find.text('Invalid credentials'), findsOneWidget);
    expect(find.text('Unable to reach the server. Please try again.'), findsNothing);
  });

  testWidgets('a connection/timeout failure shows a distinct network message', (tester) async {
    final fake = _FakeApiClient((_, _) async {
      throw DioException(
        requestOptions: RequestOptions(path: '/auth/login'),
        type: DioExceptionType.connectionTimeout,
      );
    });
    await _pumpLogin(tester, fake);

    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

    expect(find.text('Unable to reach the server. Please try again.'), findsOneWidget);
    expect(find.text('Invalid credentials'), findsNothing);
  });
}
