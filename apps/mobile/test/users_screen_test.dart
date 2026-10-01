import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/api/api_client.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/features/users/users_screen.dart';
import 'package:mobile/state/providers.dart';

/// A fake that overrides only the client boundary. The injected [Dio] is never
/// exercised because every method used here is overridden.
class _FakeApiClient extends ApiClient {
  _FakeApiClient() : super(Dio());

  final List<List<String>> registerCalls = [];
  Object? registerError;

  @override
  Future<void> register(String email, String name, String password) async {
    registerCalls.add([email, name, password]);
    if (registerError != null) throw registerError!;
  }

  @override
  Future<List<PublicUser>> listUsers() async =>
      [PublicUser(id: '1', email: 'a@e.com')];
}

Future<void> _pump(WidgetTester tester, _FakeApiClient fake) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(fake)],
      child: const MaterialApp(home: UsersScreen()),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('renders the Users AppBar and the (fake) list', (tester) async {
    await _pump(tester, _FakeApiClient());
    expect(find.text('Users'), findsOneWidget);
    expect(find.text('a@e.com'), findsOneWidget);
  });

  testWidgets('Create wires register(email,name,password) through', (tester) async {
    final fake = _FakeApiClient();
    await _pump(tester, fake);

    // 3 create-form fields: Email / Name / Password.
    final fields = find.byType(TextField);
    expect(fields, findsNWidgets(3));

    await tester.enterText(fields.at(0), 'new@e.com');
    await tester.enterText(fields.at(1), 'New Person');
    await tester.enterText(fields.at(2), 'secret123');

    await tester.tap(find.widgetWithText(ElevatedButton, 'Create'));
    await tester.pumpAndSettle();

    expect(fake.registerCalls, [
      ['new@e.com', 'New Person', 'secret123'],
    ]);
    // Fields are cleared on success.
    expect(
      (tester.widget(fields.at(0)) as TextField).controller!.text,
      isEmpty,
    );
  });

  testWidgets('a create failure surfaces an error to the user', (tester) async {
    final fake = _FakeApiClient()..registerError = ApiException('boom');
    await _pump(tester, fake);

    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'x@e.com');
    await tester.enterText(fields.at(1), 'X');
    await tester.enterText(fields.at(2), 'pw');
    await tester.tap(find.widgetWithText(ElevatedButton, 'Create'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Failed to create user'), findsOneWidget);
  });
}
