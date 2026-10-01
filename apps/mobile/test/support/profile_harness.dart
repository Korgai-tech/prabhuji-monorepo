import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/core/analytics.dart';
import 'package:mobile/core/auth_store.dart';
import 'package:mobile/core/entitlement.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';
import 'package:mobile/features/profile/presentation/edit_profile_screen.dart';
import 'package:mobile/features/profile/presentation/profile_screen_v2.dart';
import 'package:mobile/features/status/data/status_avatar_picker.dart';
import 'package:mobile/features/status/data/status_models.dart';
import 'package:mobile/features/status/data/status_repository.dart';
import 'package:mobile/features/status/status_providers.dart';
import 'package:mobile/state/providers.dart';

import 'fake_repositories.dart';
import 'fake_status_services.dart';

/// Records every route the profile screen pushes, so navigation assertions
/// never need real destination screens. Mirrors the `RouteSpy` used by the
/// Home harness — kept here as a separate class so we don't couple the two
/// suites' visibility.
class ProfileRouteSpy {
  final List<String> pushed = [];
  String? get last => pushed.isEmpty ? null : pushed.last;
}

/// Wraps [child] in a ProviderScope with the common Profile v2 overrides:
///   - `meProvider` seeded with a canned `MeUser` (or null when the test
///     wants the missing-me fallback path)
///   - `statusProfileProvider` seeded with a canned `StatusProfileData`
///   - `statusRepositoryProvider` and `statusAvatarPickerProvider` swapped
///     for fakes
///   - `entitlementProvider` seeded from [isPro]
///   - `analyticsProvider` overridden with the passed handle (nullable)
///
/// The router is a minimal shim that stubs every route the profile screen
/// can push (`/paywall`, `/webview`, `/language`, `/support`, and
/// `/profile/edit`) so tests can assert WHICH route was pushed without
/// mounting real destination screens.
Widget profileTestApp({
  required Widget child,
  StatusRepository? repository,
  StatusAvatarPicker? avatarPicker,
  StatusProfileData? statusProfile,
  MeUser? me,
  ProfileRouteSpy? routeSpy,
  Analytics? analytics,
  bool isPro = false,
  bool statusProfileError = false,
  bool statusProfileLoading = false,
  AuthStore? authStore,
  bool liveStatusProfile = false,
}) {
  GoogleFonts.config.allowRuntimeFetching = false;
  final spy = routeSpy ?? ProfileRouteSpy();

  final router = GoRouter(
    initialLocation: '/host',
    routes: <RouteBase>[
      GoRoute(path: '/host', builder: (context, state) => child),
      for (final path in _stubRoutes)
        GoRoute(
          path: path,
          builder: (context, state) => _RouteProbe(
            path: path,
            location: state.uri.toString(),
            spy: spy,
          ),
        ),
    ],
  );

  return ProviderScope(
    overrides: [
      statusRepositoryProvider.overrideWithValue(
        repository ?? FakeStatusRepository(profile: StatusProfileData.empty),
      ),
      statusAvatarPickerProvider.overrideWithValue(
        avatarPicker ?? FakeStatusAvatarPicker(),
      ),
      // `liveStatusProfile: true` opts OUT of this canned override so a test
      // can exercise the REAL provider — including its
      // `ref.watch(authIdentityProvider)` scoping — against the fake
      // repository above. Every other test keeps the canned value.
      if (!liveStatusProfile)
        statusProfileProvider.overrideWith((ref) async {
          if (statusProfileLoading) {
            // Never resolves — leaves the screen in its loading state so
            // the loading-branch tests can assert against it.
            return Completer<StatusProfileData>().future;
          }
          if (statusProfileError) {
            throw Exception('status profile load failed');
          }
          return statusProfile ?? StatusProfileData.empty;
        }),
      if (authStore != null) authStoreProvider.overrideWithValue(authStore),
      meProvider.overrideWith((ref) async => me),
      analyticsProvider.overrideWithValue(analytics),
      entitlementStateProvider.overrideWith(() => _SeededEntitlement(isPro)),
    ],
    child: MaterialApp.router(
      theme: AppTheme.light(),
      routerConfig: router,
    ),
  );
}

/// Every route Profile v2 can push, stubbed. The MATCHED path is recorded
/// by the probe.
const List<String> _stubRoutes = <String>[
  '/paywall',
  '/webview',
  '/language',
  '/support',
  '/profile/edit',
  '/profile/subscription',
  '/phone-input',
];

class _RouteProbe extends StatefulWidget {
  const _RouteProbe({
    required this.path,
    required this.location,
    required this.spy,
  });
  final String path;
  final String location;
  final ProfileRouteSpy spy;

  @override
  State<_RouteProbe> createState() => _RouteProbeState();
}

class _RouteProbeState extends State<_RouteProbe> {
  @override
  void initState() {
    super.initState();
    widget.spy.pushed.add(widget.location);
  }

  @override
  Widget build(BuildContext context) =>
      Scaffold(key: Key('probe-${widget.path}'), body: const SizedBox());
}

class _SeededEntitlement extends EntitlementNotifier {
  _SeededEntitlement(this._seed);
  final bool _seed;
  @override
  Entitlement build() => Entitlement(granted: _seed, until: null);
}

/// Convenience `MeUser` fixture — mimics the phone-account shape.
MeUser meUserFixture({
  String id = 'user-1',
  String? name = 'Aditya Nath',
  String? phoneCountryCode = '91',
  String? phoneNumber = '9876543210',
  String? selectedLanguage = 'hi',
}) =>
    MeUser(
      id: id,
      name: name,
      selectedLanguage: selectedLanguage,
      onboardingCompletedAt: DateTime.utc(2026, 7, 27),
      phoneCountryCode: phoneCountryCode,
      phoneNumber: phoneNumber,
    );

/// Pump the main Profile v2 screen at the given viewport.
Future<void> pumpProfileScreenV2(
  WidgetTester tester, {
  StatusRepository? repository,
  StatusAvatarPicker? avatarPicker,
  StatusProfileData? statusProfile,
  MeUser? me,
  ProfileRouteSpy? routeSpy,
  Analytics? analytics,
  bool isPro = false,
  AuthStore? authStore,
  bool liveStatusProfile = false,
  Size viewSize = const Size(360, 800),
  double textScale = 1.0,
}) async {
  tester.view.physicalSize = viewSize;
  tester.view.devicePixelRatio = 1.0;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

  await tester.pumpWidget(profileTestApp(
    repository: repository,
    avatarPicker: avatarPicker,
    statusProfile: statusProfile,
    me: me ?? meUserFixture(),
    routeSpy: routeSpy,
    analytics: analytics,
    isPro: isPro,
    authStore: authStore,
    liveStatusProfile: liveStatusProfile,
    child: const ProfileScreenV2(),
  ));
  await tester.pumpAndSettle();
}

/// Pump the Edit Profile screen at the given viewport.
Future<void> pumpEditProfileScreen(
  WidgetTester tester, {
  StatusRepository? repository,
  StatusAvatarPicker? avatarPicker,
  StatusProfileData? statusProfile,
  MeUser? me,
  ProfileRouteSpy? routeSpy,
  Analytics? analytics,
  bool statusProfileError = false,
  bool statusProfileLoading = false,
  Size viewSize = const Size(360, 800),
  double textScale = 1.0,
}) async {
  tester.view.physicalSize = viewSize;
  tester.view.devicePixelRatio = 1.0;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

  await tester.pumpWidget(profileTestApp(
    repository: repository,
    avatarPicker: avatarPicker,
    statusProfile: statusProfile,
    me: me ?? meUserFixture(),
    routeSpy: routeSpy,
    analytics: analytics,
    statusProfileError: statusProfileError,
    statusProfileLoading: statusProfileLoading,
    child: const EditProfileScreen(),
  ));
  if (statusProfileLoading) {
    // The FutureProvider never resolves in this branch — pumpAndSettle
    // would time out. A single frame is enough for the loading state to
    // render.
    await tester.pump();
  } else {
    await tester.pumpAndSettle();
  }
}
