import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/core/analytics.dart';
import 'package:mobile/core/entitlement.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/status/data/status_avatar_picker.dart';
import 'package:mobile/features/status/data/status_models.dart';
import 'package:mobile/features/status/data/status_render_service.dart';
import 'package:mobile/features/status/data/status_repository.dart';
import 'package:mobile/features/status/details/bloc/status_profile_bloc.dart';
import 'package:mobile/features/status/details/bloc/status_profile_event.dart';
import 'package:mobile/features/status/details/presentation/status_details_screen.dart';
import 'package:mobile/features/status/feed/bloc/status_feed_bloc.dart';
import 'package:mobile/features/status/feed/presentation/status_home_screen.dart';
import 'package:mobile/features/status/feed/status_video_port.dart';
import 'package:mobile/features/status/status_providers.dart';
import 'package:mobile/state/providers.dart';
import 'package:visibility_detector/visibility_detector.dart';

import 'fake_repositories.dart';
import 'fake_share_service.dart';
import 'fake_status_services.dart';

/// Wraps [child] in a ProviderScope with the common Status test overrides (fake
/// repo, fake render service, fake video port, fake share, fake avatar picker,
/// fake deities, seeded entitlement, no analytics) + the real theme.
Widget statusTestApp({
  required StatusRepository repository,
  required Widget child,
  StatusRenderService? renderService,
  StatusVideoPortFactory? videoPortFactory,
  StatusAvatarPicker? avatarPicker,
  ShareServiceHolder? shareHolder,
  Analytics? analytics,
  bool isPro = true,
  List<DeityView>? deities,
}) {
  GoogleFonts.config.allowRuntimeFetching = false;
  // StatusMedia mounts a VisibilityDetector for the muted-loop video
  // pause-when-hidden rule; the real 500 ms debounce leaves a pending
  // Timer at teardown once the widget owns the initial dispatch (TAM-166),
  // so match the wallpaper/home harnesses' zero-interval convention.
  VisibilityDetectorController.instance.updateInterval = Duration.zero;
  return ProviderScope(
    overrides: [
      statusRepositoryProvider.overrideWithValue(repository),
      statusRenderServiceProvider
          .overrideWithValue(renderService ?? FakeStatusRenderService()),
      statusVideoPortFactoryProvider.overrideWithValue(
        videoPortFactory ?? FakeStatusVideoPort.new,
      ),
      statusAvatarPickerProvider
          .overrideWithValue(avatarPicker ?? FakeStatusAvatarPicker()),
      analyticsProvider.overrideWithValue(analytics),
      shareServiceProvider
          .overrideWithValue(shareHolder?.service ?? FakeShareService()),
      deityRepositoryProvider.overrideWithValue(
        FakeDeityRepository(
          deities: deities ??
              [
                fakeDeity('hanuman', name: 'Hanuman ji'),
                fakeDeity('ram', name: 'Ram ji'),
              ],
        ),
      ),
      entitlementStateProvider.overrideWith(() => _SeededEntitlement(isPro)),
    ],
    child: MaterialApp(theme: AppTheme.light(), home: child),
  );
}

class _SeededEntitlement extends EntitlementNotifier {
  _SeededEntitlement(this._seed);
  final bool _seed;
  @override
  Entitlement build() => Entitlement(granted: _seed, until: null);
}

/// Pumps Status Home with a loaded [StatusFeedBloc].
Future<StatusFeedBloc> pumpStatusHome(
  WidgetTester tester, {
  required StatusRepository repository,
  StatusRenderService? renderService,
  StatusVideoPortFactory? videoPortFactory,
  ShareServiceHolder? shareHolder,
  Analytics? analytics,
  bool isPro = true,
  List<DeityView>? deities,
  // The real threshold is 2s (q5). Widget tests use a short one and pump past
  // it, so the bloc's dwell Timer resolves inside the test body — a pending
  // timer at teardown trips flutter_test's `!timersPending` invariant.
  Duration viewThreshold = const Duration(milliseconds: 10),
  double viewportHeight = 1600,
}) async {
  _viewport(tester, height: viewportHeight);
  // TAM-166 — StatusHomeScreen now owns the initial `StatusFeedStarted`
  // dispatch (from `initState`), matching the production router (the
  // `/status` shell branch, with or without `?pinnedId=`, just wraps the
  // screen in a fresh `StatusFeedBloc` and lets the screen fire).
  // The harness no longer pre-dispatches — double-firing would double every
  // fetch and every `status_page_viewed` analytics event.
  final bloc = StatusFeedBloc(
    repository: repository,
    analytics: analytics,
    viewThreshold: viewThreshold,
  );
  await tester.pumpWidget(statusTestApp(
    repository: repository,
    renderService: renderService,
    videoPortFactory: videoPortFactory,
    shareHolder: shareHolder,
    analytics: analytics,
    isPro: isPro,
    deities: deities,
    child: BlocProvider<StatusFeedBloc>.value(
      value: bloc,
      child: const StatusHomeScreen(),
    ),
  ));
  await tester.pumpAndSettle();
  // Let the dwell timer elapse + its view POST settle.
  await tester.pump(viewThreshold + const Duration(milliseconds: 5));
  await tester.pumpAndSettle();
  addTearDown(bloc.close);
  return bloc;
}

/// Pumps the details flow with a loaded [StatusProfileBloc].
Future<StatusProfileBloc> pumpStatusDetailsScreen(
  WidgetTester tester, {
  required StatusRepository repository,
  StatusAvatarPicker? avatarPicker,
  Analytics? analytics,
  StatusProfileType initialType = StatusProfileType.personal,
  double viewportHeight = 1600,
}) async {
  _viewport(tester, height: viewportHeight);
  final bloc = StatusProfileBloc(
    repository: repository,
    avatarPicker: avatarPicker ?? FakeStatusAvatarPicker(),
    analytics: analytics,
  )..add(StatusProfileLoadRequested(initialType));
  await tester.pumpWidget(statusTestApp(
    repository: repository,
    avatarPicker: avatarPicker,
    analytics: analytics,
    child: BlocProvider<StatusProfileBloc>.value(
      value: bloc,
      child: const StatusDetailsScreen(),
    ),
  ));
  await tester.pumpAndSettle();
  addTearDown(bloc.close);
  return bloc;
}

void _viewport(WidgetTester tester, {double height = 1600}) {
  tester.view.physicalSize = Size(400, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}
