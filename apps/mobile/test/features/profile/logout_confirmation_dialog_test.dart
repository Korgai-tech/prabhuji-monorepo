import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/features/profile/presentation/logout_confirmation_dialog.dart';

/// Widget test for the log-out confirmation dialog. Cascade wiring is
/// exercised indirectly through the destructive-CTA path — the cascade
/// itself is `handleLogout(...)` which depends on the app's `serviceLocator`
/// (get_it) NOT being configured in a plain test, so tapping Log out here
/// exercises the "no service registered" branch: every step is a no-op
/// and only the final `context.go('/phone-input')` runs. That target route
/// is registered in the test router (bare Scaffold — visible confirmation
/// that the cascade completed).
void main() {
  setUp(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  Future<void> pumpDialog(WidgetTester tester) async {
    late Widget host;
    host = Consumer(
      builder: (context, ref, _) => Scaffold(
        body: Builder(
          builder: (ctx) => TextButton(
            key: const Key('open'),
            onPressed: () => showLogoutConfirmationDialog(ctx, ref),
            child: const Text('open'),
          ),
        ),
      ),
    );
    final router = GoRouter(
      initialLocation: '/host',
      routes: <RouteBase>[
        GoRoute(path: '/host', builder: (context, state) => host),
        GoRoute(
          path: '/phone-input',
          builder: (context, state) => const Scaffold(
            key: Key('probe-phone-input'),
            body: SizedBox(),
          ),
        ),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.tap(find.byKey(const Key('open')));
    await tester.pumpAndSettle();
  }

  testWidgets('renders the LOCKED copy verbatim', (tester) async {
    await pumpDialog(tester);
    expect(find.byKey(const Key('profile-logout-dialog')), findsOneWidget);
    expect(find.text('Are you sure you want to log out?'), findsOneWidget);
    expect(
      find.text(
        "You'll need to sign in again to access your account and content.",
      ),
      findsOneWidget,
    );
    expect(find.text('Log out'), findsOneWidget);
    expect(find.text('Cancel'), findsOneWidget);
  });

  testWidgets('Cancel dismisses the dialog', (tester) async {
    await pumpDialog(tester);
    await tester.tap(find.byKey(const Key('profile-logout-dialog-cancel')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('profile-logout-dialog')), findsNothing);
  });

  testWidgets('scrim tap dismisses the dialog', (tester) async {
    await pumpDialog(tester);
    // The scrim is a ModalBarrier that fills the space outside the dialog
    // — tapping the top-left corner (well outside the AlertDialog) hits
    // the scrim.
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('profile-logout-dialog')), findsNothing);
  });

  testWidgets('destructive CTA closes the dialog', (tester) async {
    // The cascade side-effects (AuthStore.clear, Analytics.reset, etc.)
    // are guarded by `serviceLocator.isRegistered<X>()` — every branch
    // no-ops when the locator isn't configured (widget tests). This test
    // just asserts the dialog closes after the tap.
    await pumpDialog(tester);
    await tester.tap(find.byKey(const Key('profile-logout-dialog-confirm')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('profile-logout-dialog')), findsNothing);
  });

  testWidgets(
    'destructive CTA navigates to /phone-input on first tap '
    '(regression: dialog context unmounted before context.go)',
    (tester) async {
      // Previously `handleLogout` guarded its final `context.go('/phone-input')`
      // with `if (!context.mounted) return;` and was handed the DIALOG's
      // context. The caller pops the dialog synchronously BEFORE awaiting
      // the cascade, so by the time the awaits resolved the element was
      // unmounted, the guard tripped, and navigation was silently skipped
      // — user stayed on the profile screen even though auth was cleared.
      // Fix caches `GoRouter.of(context)` at the top of `handleLogout` and
      // navigates through the cached router. This test asserts the phone-
      // input probe appears on the FIRST tap.
      await pumpDialog(tester);
      await tester.tap(find.byKey(const Key('profile-logout-dialog-confirm')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('profile-logout-dialog')), findsNothing);
      expect(find.byKey(const Key('probe-phone-input')), findsOneWidget);
    },
  );
}
