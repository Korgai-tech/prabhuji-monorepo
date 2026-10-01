import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/core/analytics.dart';
import 'package:mobile/core/user_properties.dart';
import 'package:mobile/features/paywall/bloc/paywall_bloc.dart';
import 'package:mobile/features/paywall/bloc/paywall_event.dart';
import 'package:mobile/features/paywall/bloc/paywall_state.dart';
import 'package:mobile/features/paywall/data/paywall_repository.dart';
import 'package:mobile/features/paywall/paywall_analytics.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Structural fake for [Analytics] — the bloc only touches `trackEvent`;
/// every other Analytics method is caught by `noSuchMethod` so we don't
/// need to hand-implement the full surface.
class _RecordingAnalytics implements Analytics {
  final List<_TrackedEvent> events = [];

  @override
  Future<void> trackEvent(
    String name, {
    Map<String, Object?> properties = const {},
    String? asUserId,
  }) async {
    events.add(_TrackedEvent(name, properties));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _TrackedEvent {
  _TrackedEvent(this.name, this.properties);
  final String name;
  final Map<String, Object?> properties;
}

class _ScriptedPaywallRepository implements PaywallRepository {
  _ScriptedPaywallRepository({
    Iterable<Future<PaywallConfigData> Function()> configs = const [],
  }) : _configs = List.of(configs);

  final List<Future<PaywallConfigData> Function()> _configs;

  int getConfigCalls = 0;
  String? lastLocale;

  @override
  Future<PaywallConfigData> getConfig({required String locale}) async {
    getConfigCalls++;
    lastLocale = locale;
    if (_configs.isEmpty) {
      throw StateError('getConfig called with no scripted response');
    }
    return _configs.removeAt(0)();
  }
}

PaywallConfigData _buildConfig({
  List<PaywallPlanDisplay>? plans,
  List<PaywallBenefitDisplay>? benefits,
  bool fallbackUsed = false,
  String? defaultPlanId,
}) {
  return PaywallConfigData(
    paywallId: 'paywall-1',
    configVersion: 3,
    enabled: true,
    localeRequested: 'hi',
    localeServed: fallbackUsed ? 'en' : 'hi',
    fallbackUsed: fallbackUsed,
    fallbackFrom: fallbackUsed ? 'hi' : null,
    missingFields: fallbackUsed ? const ['plan.trialLabel'] : const [],
    title: 'Prabhuji VIP Membership',
    videoUrl: 'https://cdn.prabhuji.example.com/vip.mp4',
    videoThumbnailUrl: 'https://cdn.prabhuji.example.com/vip.jpg',
    videoId: 'vip-hero',
    defaultPlanId: defaultPlanId ?? 'plan-weekly',
    plans: plans ??
        [
          PaywallPlanDisplay(
            planId: 'plan-weekly',
            productId: 'prod-weekly',
            period: 'week',
            localizedLabel: 'Per Week',
            trialLabel: '7-day free trial',
            trialDays: 7,
            displayPriceText: '₹99/week',
            subscriptionDetailText: 'Auto-renews weekly',
            sortOrder: 1,
          ),
          PaywallPlanDisplay(
            planId: 'plan-monthly',
            productId: 'prod-monthly',
            period: 'month',
            localizedLabel: 'Per Month',
            trialLabel: '',
            trialDays: 0,
            displayPriceText: '₹299/month',
            subscriptionDetailText: 'Auto-renews monthly',
            sortOrder: 2,
          ),
        ],
    benefits: benefits ??
        [
          PaywallBenefitDisplay(
            benefitId: 'b-1',
            localizedName: 'Daily Mandir',
            icon: 'benefit-mandir.png',
            sortOrder: 1,
          ),
        ],
    legalLinks: PaywallLegalLinks(
      privacyPolicyUrl: 'https://prabhuji.example.com/privacy',
      termsServiceUrl: 'https://prabhuji.example.com/terms',
      refundPolicyUrl: 'https://prabhuji.example.com/refund',
    ),
    cancelAnytimeText: 'Cancel Anytime',
    refundPolicyText: 'Refund Policy',
    payNowCta: 'Pay Now',
    shimmerEnabled: true,
  );
}

Future<T> _waitFor<T extends PaywallState>(PaywallBloc bloc) =>
    bloc.stream.firstWhere((s) => s is T).then((s) => s as T);

Future<SharedPreferences> _prefs() async {
  SharedPreferences.setMockInitialValues({});
  return SharedPreferences.getInstance();
}

void main() {
  group('PaywallBloc', () {
    test('happy path — PaywallReady with defaultPlanId', () async {
      final repo = _ScriptedPaywallRepository(
        configs: [() async => _buildConfig()],
      );
      final bloc = PaywallBloc(
        paywallRepository: repo,
        preferences: await _prefs(),
      );
      bloc.add(const ConfigRequested('hi'));
      final ready = await _waitFor<PaywallReady>(bloc);
      expect(ready.selectedPlanId, 'plan-weekly');
      expect(ready.config.plans, hasLength(2));
      expect(ready.isPlaying, isTrue);
      expect(ready.impressionCount, 1);
      expect(repo.lastLocale, 'hi');
      await bloc.close();
    });

    test('empty plans → PaywallEmpty', () async {
      final repo = _ScriptedPaywallRepository(
        configs: [() async => _buildConfig(plans: const [])],
      );
      final bloc = PaywallBloc(
        paywallRepository: repo,
        preferences: await _prefs(),
      );
      bloc.add(const ConfigRequested('hi'));
      await _waitFor<PaywallEmpty>(bloc);
      await bloc.close();
    });

    test('config failure → PaywallError', () async {
      final repo = _ScriptedPaywallRepository(
        configs: [() async => throw Exception('network down')],
      );
      final bloc = PaywallBloc(
        paywallRepository: repo,
        preferences: await _prefs(),
      );
      bloc.add(const ConfigRequested('hi'));
      final err = await _waitFor<PaywallError>(bloc);
      expect(err.message, contains('network down'));
      await bloc.close();
    });

    test('PlanSelected updates selectedPlanId', () async {
      final repo = _ScriptedPaywallRepository(
        configs: [() async => _buildConfig()],
      );
      final bloc = PaywallBloc(
        paywallRepository: repo,
        preferences: await _prefs(),
      );
      bloc.add(const ConfigRequested('hi'));
      await _waitFor<PaywallReady>(bloc);
      bloc.add(const PlanSelected('plan-monthly'));
      final ready = await bloc.stream.firstWhere((s) =>
              s is PaywallReady && s.selectedPlanId == 'plan-monthly')
          as PaywallReady;
      expect(ready.selectedPlanId, 'plan-monthly');
      await bloc.close();
    });

    test('VideoTapped toggles isPlaying', () async {
      final repo = _ScriptedPaywallRepository(
        configs: [() async => _buildConfig()],
      );
      final bloc = PaywallBloc(
        paywallRepository: repo,
        preferences: await _prefs(),
      );
      bloc.add(const ConfigRequested('hi'));
      final initial = await _waitFor<PaywallReady>(bloc);
      expect(initial.isPlaying, isTrue);
      bloc.add(const VideoTapped());
      final paused = await bloc.stream
              .firstWhere((s) => s is PaywallReady && !s.isPlaying)
          as PaywallReady;
      expect(paused.isPlaying, isFalse);
      await bloc.close();
    });

    test('fallback config still emits Ready', () async {
      final repo = _ScriptedPaywallRepository(
        configs: [() async => _buildConfig(fallbackUsed: true)],
      );
      final bloc = PaywallBloc(
        paywallRepository: repo,
        preferences: await _prefs(),
      );
      bloc.add(const ConfigRequested('hi'));
      final ready = await _waitFor<PaywallReady>(bloc);
      expect(ready.config.fallbackUsed, isTrue);
      await bloc.close();
    });

    test('AppBackgrounded pauses the video', () async {
      final repo = _ScriptedPaywallRepository(
        configs: [() async => _buildConfig()],
      );
      final bloc = PaywallBloc(
        paywallRepository: repo,
        preferences: await _prefs(),
      );
      bloc.add(const ConfigRequested('hi'));
      await _waitFor<PaywallReady>(bloc);
      bloc.add(const AppBackgrounded());
      final paused = await bloc.stream
              .firstWhere((s) => s is PaywallReady && !s.isPlaying)
          as PaywallReady;
      expect(paused.isPlaying, isFalse);
      await bloc.close();
    });

    test(
        'Sheet 1 row 17 — Ready fires paywall_viewed with paywall_id + '
        'impression_number; attribution keys are present-but-null when '
        'the ConfigRequested carried no PaywallArgs', () async {
      final analytics = _RecordingAnalytics();
      final repo = _ScriptedPaywallRepository(
        configs: [() async => _buildConfig()],
      );
      final bloc = PaywallBloc(
        paywallRepository: repo,
        preferences: await _prefs(),
        analytics: analytics,
      );
      bloc.add(const ConfigRequested('hi'));
      await _waitFor<PaywallReady>(bloc);
      await Future<void>.delayed(Duration.zero);

      final viewed = analytics.events
          .where((e) => e.name == PaywallEvents.paywallViewed)
          .toList();
      expect(viewed, hasLength(1));
      final props = viewed.single.properties;
      expect(props[PaywallEventProps.paywallId], 'paywall-1');
      expect(props[PaywallEventProps.paywallVersion], 3);
      expect(props[PaywallEventProps.impressionNumber], 1);
      // Attribution keys are always emitted (even as null) so downstream
      // schemas don't have to guess which properties an event carries.
      expect(props.containsKey(PaywallEventProps.entrySource), isTrue);
      expect(props.containsKey(PaywallEventProps.triggerModule), isTrue);
      expect(props.containsKey(PaywallEventProps.triggerAction), isTrue);
      expect(props[PaywallEventProps.entrySource], isNull);
      expect(props[PaywallEventProps.triggerModule], isNull);
      expect(props[PaywallEventProps.triggerAction], isNull);
      await bloc.close();
    });

    test(
        'paywall_viewed rides entry_source / trigger_module / trigger_action '
        'when ConfigRequested is built from a PaywallArgs', () async {
      final analytics = _RecordingAnalytics();
      final repo = _ScriptedPaywallRepository(
        configs: [() async => _buildConfig()],
      );
      final bloc = PaywallBloc(
        paywallRepository: repo,
        preferences: await _prefs(),
        analytics: analytics,
      );
      bloc.add(const ConfigRequested(
        'hi',
        entrySource: PaywallEntrySource.feature,
        triggerModule: UserPropertyModule.ringtone,
        triggerAction: PaywallTriggerAction.playRingtone,
      ));
      await _waitFor<PaywallReady>(bloc);
      await Future<void>.delayed(Duration.zero);

      final props = analytics.events
          .firstWhere((e) => e.name == PaywallEvents.paywallViewed)
          .properties;
      expect(props[PaywallEventProps.entrySource],
          PaywallEntrySource.feature);
      expect(props[PaywallEventProps.triggerModule],
          UserPropertyModule.ringtone);
      expect(props[PaywallEventProps.triggerAction],
          PaywallTriggerAction.playRingtone);
      await bloc.close();
    });

    test(
        'paywall_closed carries the same attribution captured on mount — a '
        'close is still the same reach from the same source', () async {
      final analytics = _RecordingAnalytics();
      final repo = _ScriptedPaywallRepository(
        configs: [() async => _buildConfig()],
      );
      final bloc = PaywallBloc(
        paywallRepository: repo,
        preferences: await _prefs(),
        analytics: analytics,
      );
      bloc.add(const ConfigRequested(
        'hi',
        entrySource: PaywallEntrySource.profile,
        triggerAction: PaywallTriggerAction.upgradeCta,
      ));
      await _waitFor<PaywallReady>(bloc);

      bloc.add(const CloseTapped(trigger: 'user_close'));
      await Future<void>.delayed(Duration.zero);

      final closedProps = analytics.events
          .firstWhere((e) => e.name == PaywallEvents.paywallClosed)
          .properties;
      expect(closedProps[PaywallEventProps.entrySource],
          PaywallEntrySource.profile);
      expect(closedProps[PaywallEventProps.triggerAction],
          PaywallTriggerAction.upgradeCta);
      // No triggerModule was supplied for a Profile Upgrade open — null is
      // correct (there is no feature module behind an Upgrade CTA).
      expect(closedProps[PaywallEventProps.triggerModule], isNull);
      await bloc.close();
    });

    test(
        'Sheet 1 row 24 — Ready fires paywall_video_started(auto_play) '
        'and user tap fires user_play', () async {
      final analytics = _RecordingAnalytics();
      final repo = _ScriptedPaywallRepository(
        configs: [() async => _buildConfig()],
      );
      final bloc = PaywallBloc(
        paywallRepository: repo,
        preferences: await _prefs(),
        analytics: analytics,
      );
      bloc.add(const ConfigRequested('hi'));
      await _waitFor<PaywallReady>(bloc);
      await Future<void>.delayed(Duration.zero);

      final autoPlay = analytics.events
          .where((e) => e.name == PaywallEvents.paywallVideoStarted)
          .toList();
      expect(autoPlay, hasLength(1));
      expect(autoPlay.single.properties[PaywallEventProps.startType],
          PaywallEventProps.startTypeAutoPlay);
      expect(
          autoPlay.single.properties[PaywallEventProps.videoId], 'vip-hero');

      // User taps pause, then taps again to resume — the resume fires a
      // second start event with start_type: user_play.
      bloc.add(const VideoTapped()); // → pause (no event)
      await bloc.stream
          .firstWhere((s) => s is PaywallReady && !s.isPlaying);
      bloc.add(const VideoTapped()); // → play (user_play)
      await bloc.stream.firstWhere((s) => s is PaywallReady && s.isPlaying);
      await Future<void>.delayed(Duration.zero);

      final starts = analytics.events
          .where((e) => e.name == PaywallEvents.paywallVideoStarted)
          .toList();
      expect(starts, hasLength(2));
      expect(starts.last.properties[PaywallEventProps.startType],
          PaywallEventProps.startTypeUserPlay);
      await bloc.close();
    });

    test(
        'Sheet 1 row 23 — CloseTapped on PaywallReady fires paywall_closed '
        'with close_icon + time_spent_seconds + impression_number', () async {
      final analytics = _RecordingAnalytics();
      final repo = _ScriptedPaywallRepository(
        configs: [() async => _buildConfig()],
      );
      final bloc = PaywallBloc(
        paywallRepository: repo,
        preferences: await _prefs(),
        analytics: analytics,
      );
      bloc.add(const ConfigRequested('hi'));
      await _waitFor<PaywallReady>(bloc);

      bloc.add(const CloseTapped(trigger: 'user_close'));
      // Wait for the bloc to drain the CloseTapped event (no state change,
      // so we can't await via `bloc.stream`; a microtask hop is enough for
      // the synchronous handler to enqueue its unawaited trackEvent call).
      await Future<void>.delayed(Duration.zero);

      final closed = analytics.events
          .where((e) => e.name == PaywallEvents.paywallClosed)
          .toList();
      expect(closed, hasLength(1));
      final props = closed.single.properties;
      expect(props[PaywallEventProps.closeMethod],
          PaywallEventProps.closeMethodCloseIcon);
      expect(props[PaywallEventProps.impressionNumber], 1);
      expect(props.containsKey(PaywallEventProps.timeSpentSeconds), isTrue);
      expect(props[PaywallEventProps.timeSpentSeconds], isA<int>());
      expect((props[PaywallEventProps.timeSpentSeconds] as int) >= 0, isTrue);
      await bloc.close();
    });

    test(
        'Empty-plans redirect does NOT fire paywall_closed '
        '(paywall never actually became visible)', () async {
      final analytics = _RecordingAnalytics();
      final repo = _ScriptedPaywallRepository(
        configs: [() async => _buildConfig(plans: const [])],
      );
      final bloc = PaywallBloc(
        paywallRepository: repo,
        preferences: await _prefs(),
        analytics: analytics,
      );
      bloc.add(const ConfigRequested('hi'));
      await _waitFor<PaywallEmpty>(bloc);

      bloc.add(const CloseTapped(trigger: 'no_valid_plans'));
      await Future<void>.delayed(Duration.zero);

      final closed = analytics.events
          .where((e) => e.name == PaywallEvents.paywallClosed)
          .toList();
      expect(closed, isEmpty,
          reason:
              'paywall_closed is Sheet 1 row 23 — a user close of a viewed '
              'paywall. An empty-plans redirect never shows a paywall to '
              'close.');
      await bloc.close();
    });

    test(
        'trackVideoWatchTime fires paywall_video_watch_time '
        'with the accumulated ms and the videoId', () async {
      final analytics = _RecordingAnalytics();
      final repo = _ScriptedPaywallRepository(
        configs: [() async => _buildConfig()],
      );
      final bloc = PaywallBloc(
        paywallRepository: repo,
        preferences: await _prefs(),
        analytics: analytics,
      );
      bloc.add(const ConfigRequested('hi'));
      await _waitFor<PaywallReady>(bloc);
      await Future<void>.delayed(Duration.zero);

      bloc.trackVideoWatchTime(watchTimeMs: 4231, videoId: 'vip-hero');
      await Future<void>.delayed(Duration.zero);

      final watch = analytics.events
          .where((e) => e.name == PaywallEvents.paywallVideoWatchTime)
          .toList();
      expect(watch, hasLength(1));
      expect(watch.single.properties[PaywallEventProps.watchTimeMs], 4231);
      expect(watch.single.properties[PaywallEventProps.videoId], 'vip-hero');

      // Zero ms is noise — must not emit.
      bloc.trackVideoWatchTime(watchTimeMs: 0, videoId: 'vip-hero');
      await Future<void>.delayed(Duration.zero);
      expect(
          analytics.events
              .where((e) => e.name == PaywallEvents.paywallVideoWatchTime),
          hasLength(1));

      await bloc.close();
    });

    test(
        'trackVideoFailed fires paywall_video_failed with videoId + error_code',
        () async {
      final analytics = _RecordingAnalytics();
      final repo = _ScriptedPaywallRepository(
        configs: [() async => _buildConfig()],
      );
      final bloc = PaywallBloc(
        paywallRepository: repo,
        preferences: await _prefs(),
        analytics: analytics,
      );
      bloc.add(const ConfigRequested('hi'));
      await _waitFor<PaywallReady>(bloc);
      await Future<void>.delayed(Duration.zero);

      bloc.trackVideoFailed(videoId: 'vip-hero', errorCode: 'init_failed');
      await Future<void>.delayed(Duration.zero);

      final failed = analytics.events
          .where((e) => e.name == PaywallEvents.paywallVideoFailed)
          .toList();
      expect(failed, hasLength(1));
      expect(failed.single.properties[PaywallEventProps.videoId], 'vip-hero');
      expect(failed.single.properties[PaywallEventProps.errorCode],
          'init_failed');
      await bloc.close();
    });

    test('impression count persists across mounts', () async {
      final prefs = await _prefs();
      final repo1 = _ScriptedPaywallRepository(
        configs: [() async => _buildConfig()],
      );
      final bloc1 =
          PaywallBloc(paywallRepository: repo1, preferences: prefs);
      bloc1.add(const ConfigRequested('hi'));
      final ready1 = await _waitFor<PaywallReady>(bloc1);
      expect(ready1.impressionCount, 1);
      await bloc1.close();

      final repo2 = _ScriptedPaywallRepository(
        configs: [() async => _buildConfig()],
      );
      final bloc2 =
          PaywallBloc(paywallRepository: repo2, preferences: prefs);
      bloc2.add(const ConfigRequested('hi'));
      final ready2 = await _waitFor<PaywallReady>(bloc2);
      expect(ready2.impressionCount, 2);
      await bloc2.close();
    });
  });
}
