import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile/core/router.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('login then see the users list', (tester) async {
    // Boot the app the same way `main.dart` does: a `ProviderScope` whose
    // child watches `routerProvider` and hands the result to
    // `MaterialApp.router`. With no token override the router starts on
    // `/login`.
    await tester.pumpWidget(
      ProviderScope(
        child: Consumer(
          builder: (context, ref, _) {
            final router = ref.watch(routerProvider);
            return MaterialApp.router(routerConfig: router);
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    // The app should start on the login screen (2 TextFields + a 'Sign in'
    // button) since no auth token is present.
    final fields = find.byType(TextField);
    expect(fields, findsNWidgets(2));

    await tester.enterText(fields.at(0), 'mobile@e.com');
    await tester.enterText(fields.at(1), 'password1');
    await tester.tap(find.text('Sign in'));

    // Give the login request + redirect time to complete.
    await tester.pumpAndSettle(const Duration(seconds: 5));

    // NOTE: this requires the API to already have a user registered with
    // email `mobile@e.com` / password `password1`. The Users AppBar only
    // appears after a successful authed navigation to `/users`.
    expect(find.text('Users'), findsOneWidget);
  });
}
