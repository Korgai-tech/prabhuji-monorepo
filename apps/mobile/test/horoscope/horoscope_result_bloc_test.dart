import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/horoscope/data/horoscope_models.dart';
import 'package:mobile/features/horoscope/result/bloc/horoscope_result_bloc.dart';
import 'package:mobile/features/horoscope/result/bloc/horoscope_result_event.dart';
import 'package:mobile/features/horoscope/result/bloc/horoscope_result_state.dart';

import '../support/fake_analytics.dart';
import '../support/fake_horoscope_services.dart';

HoroscopeResultBloc _bloc(
  FakeHoroscopeRepository repo, {
  FakeTtsPort? tts,
  RecordingAnalytics? analytics,
  String zodiacId = 'taurus',
  String locale = 'hi',
}) =>
    HoroscopeResultBloc(
      repository: repo,
      tts: tts ?? FakeTtsPort(),
      zodiacId: zodiacId,
      locale: locale,
      analytics: analytics,
    );

Future<HoroscopeResultBloc> _loaded(
  FakeHoroscopeRepository repo, {
  FakeTtsPort? tts,
  RecordingAnalytics? analytics,
  String zodiacId = 'taurus',
  String locale = 'hi',
}) async {
  final bloc = _bloc(repo, tts: tts, analytics: analytics, zodiacId: zodiacId, locale: locale);
  bloc.add(const HoroscopeResultRequested());
  await bloc.stream.firstWhere((s) => s.status != HoroscopeResultStatus.loading);
  return bloc;
}

void main() {
  group('steps are DATA, not the hardcoded Figma 8', () {
    test('renders whatever ordered steps the API returns', () async {
      // A 3-step config that looks nothing like the 8 Figma sections.
      final repo = FakeHoroscopeRepository(
        daily: horoscopeDailyFixture(steps: [
          horoscopeStepFixture(stepId: 'alpha', order: 0),
          horoscopeStepFixture(stepId: 'beta', order: 1),
          horoscopeStepFixture(stepId: 'gamma', order: 2),
        ]),
      );
      final bloc = await _loaded(repo);
      addTearDown(bloc.close);

      expect(bloc.state.steps.map((s) => s.stepId), ['alpha', 'beta', 'gamma']);
      expect(bloc.state.currentStep!.stepId, 'alpha');
    });

    test('a REORDERED config is walked in the server order, not array order',
        () async {
      // The array arrives scrambled; `order` is the authority.
      final repo = FakeHoroscopeRepository(
        daily: horoscopeDailyFixture(steps: [
          horoscopeStepFixture(stepId: 'third', order: 2),
          horoscopeStepFixture(stepId: 'first', order: 0),
          horoscopeStepFixture(stepId: 'second', order: 1),
        ]),
      );
      final bloc = await _loaded(repo);
      addTearDown(bloc.close);

      expect(bloc.state.steps.map((s) => s.stepId), ['first', 'second', 'third']);

      bloc.add(const HoroscopeNextTapped());
      await bloc.stream.firstWhere((s) => s.index == 1);
      expect(bloc.state.currentStep!.stepId, 'second');
    });

    test('an EXTRA step added server-side just appears — no app change', () async {
      final steps = [
        for (var i = 0; i < 9; i++) horoscopeStepFixture(stepId: 'step_$i', order: i),
      ];
      final repo = FakeHoroscopeRepository(
        daily: horoscopeDailyFixture(steps: steps),
      );
      final bloc = await _loaded(repo);
      addTearDown(bloc.close);

      expect(bloc.state.steps, hasLength(9));

      // Walk all 9 — Finish only on the last one.
      for (var i = 0; i < 8; i++) {
        expect(bloc.state.showFinish, isFalse, reason: 'step $i is not final');
        bloc.add(const HoroscopeNextTapped());
        await bloc.stream.firstWhere((s) => s.index == i + 1);
      }
      expect(bloc.state.currentStep!.stepId, 'step_8');
      expect(bloc.state.showFinish, isTrue);
    });

    test('empty steps → emptyConfig (friendly error + Retry)', () async {
      final repo = FakeHoroscopeRepository(
        daily: horoscopeDailyFixture(steps: const []),
      );
      final bloc = await _loaded(repo);
      addTearDown(bloc.close);

      expect(bloc.state.status, HoroscopeResultStatus.emptyConfig);
    });

    test('409 from the API → emptyConfig', () async {
      final repo = FakeHoroscopeRepository(
        dailyError: const HoroscopeException(HoroscopeErrorKind.emptyConfig),
      );
      final bloc = await _loaded(repo);
      addTearDown(bloc.close);

      expect(bloc.state.status, HoroscopeResultStatus.emptyConfig);
      expect(bloc.state.errorMessage, isNotNull);
    });
  });

  group('TTS narration', () {
    test('auto-starts on the first step, reading heading + ttsText', () async {
      final tts = FakeTtsPort();
      final repo = FakeHoroscopeRepository(
        daily: horoscopeDailyFixture(steps: [
          horoscopeStepFixture(
              stepId: 'a', order: 0, title: 'A good time today',
              ttsText: 'Progress at work today.'),
        ]),
      );
      final bloc = await _loaded(repo, tts: tts);
      addTearDown(bloc.close);

      expect(tts.spoken, ['A good time today. Progress at work today.']);
    });

    test('falls back to displayText when ttsText is blank', () async {
      final tts = FakeTtsPort();
      final repo = FakeHoroscopeRepository(
        daily: horoscopeDailyFixture(steps: [
          horoscopeStepFixture(
              stepId: 'a', order: 0, title: 'Lucky colour',
              displayText: 'Sky Blue', ttsText: ''),
        ]),
      );
      final bloc = await _loaded(repo, tts: tts);
      addTearDown(bloc.close);

      expect(tts.spoken, ['Lucky colour. Sky Blue']);
    });

    test('narrates in the SERVED locale, not the requested one', () async {
      final tts = FakeTtsPort();
      // Requested ta → server fell back and served hi.
      final repo = FakeHoroscopeRepository(
        daily: horoscopeDailyFixture(
          localeRequested: 'ta',
          localeServed: 'hi',
          fallbackUsed: true,
        ),
      );
      final bloc = await _loaded(repo, tts: tts, locale: 'ta');
      addTearDown(bloc.close);

      expect(tts.spokenLocales.first, 'hi');
      expect(tts.languageChecks, contains('hi'));
    });

    test('completion while unmuted → auto-advance + event (row 110)', () async {
      final tts = FakeTtsPort();
      final analytics = RecordingAnalytics();
      final repo = FakeHoroscopeRepository();
      final bloc = await _loaded(repo, tts: tts, analytics: analytics);
      addTearDown(bloc.close);

      expect(bloc.state.index, 0);
      tts.completeSpeech();
      await bloc.stream.firstWhere((s) => s.index == 1);

      expect(bloc.state.index, 1);
      expect(analytics.names, contains('horoscope_auto_advanced'));
      // The new step narrates too.
      expect(tts.spoken, hasLength(2));
    });

    test('muted → no speech and NO auto-advance; Next still works', () async {
      final tts = FakeTtsPort();
      final repo = FakeHoroscopeRepository();
      final bloc = await _loaded(repo, tts: tts);
      addTearDown(bloc.close);

      bloc.add(const HoroscopeMuteToggled());
      await bloc.stream.firstWhere((s) => s.muted);
      final spokenWhenMuted = tts.spoken.length;

      // A stale completion must not advance a muted session.
      tts.completeSpeech();
      await Future<void>.delayed(Duration.zero);
      expect(bloc.state.index, 0);
      expect(tts.spoken, hasLength(spokenWhenMuted));

      bloc.add(const HoroscopeNextTapped());
      await bloc.stream.firstWhere((s) => s.index == 1);
      expect(bloc.state.index, 1);
      // Still silent on the new step.
      expect(tts.spoken, hasLength(spokenWhenMuted));
    });

    test('unmute resumes narration from the CURRENT step (never jumps ahead)',
        () async {
      final tts = FakeTtsPort();
      final repo = FakeHoroscopeRepository();
      final bloc = await _loaded(repo, tts: tts);
      addTearDown(bloc.close);

      bloc.add(const HoroscopeMuteToggled());
      await bloc.stream.firstWhere((s) => s.muted);
      bloc.add(const HoroscopeNextTapped());
      await bloc.stream.firstWhere((s) => s.index == 1);

      tts.spoken.clear();
      bloc.add(const HoroscopeMuteToggled());
      await bloc.stream.firstWhere((s) => !s.muted);

      expect(bloc.state.index, 1);
      expect(tts.spoken.single, contains(bloc.state.currentStep!.title));
    });

    test(
        'mute/unmute fire horoscope_audio_clicked with action=mute_or_unmute '
        '(row 108) and mute is NOT persisted (session-only)', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeHoroscopeRepository();
      final bloc = await _loaded(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const HoroscopeMuteToggled());
      await bloc.stream.firstWhere((s) => s.muted);
      bloc.add(const HoroscopeMuteToggled());
      await bloc.stream.firstWhere((s) => !s.muted);

      final audioClicks =
          analytics.names.where((n) => n == 'horoscope_audio_clicked').toList();
      expect(audioClicks, hasLength(2));
      expect(analytics.propsFor('horoscope_audio_clicked')['action'],
          'mute_or_unmute');

      // A brand-new session starts unmuted — nothing was written anywhere.
      final fresh = await _loaded(repo);
      addTearDown(fresh.close);
      expect(fresh.state.muted, isFalse);
    });

    test('Next while speaking stops speech, advances, restarts narration',
        () async {
      final tts = FakeTtsPort();
      final repo = FakeHoroscopeRepository();
      final bloc = await _loaded(repo, tts: tts);
      addTearDown(bloc.close);

      expect(tts.isSpeaking, isTrue);
      bloc.add(const HoroscopeNextTapped());
      await bloc.stream.firstWhere((s) => s.index == 1);

      expect(tts.stopCalls, greaterThanOrEqualTo(1));
      expect(tts.spoken, hasLength(2));
      expect(tts.spoken.last, contains(bloc.state.currentStep!.title));
    });

    test(
        'tts_started (row 109) fires with voice_locale = served locale, not '
        'the requested one', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeHoroscopeRepository(
        daily: horoscopeDailyFixture(
          localeRequested: 'ta',
          localeServed: 'hi',
          fallbackUsed: true,
        ),
      );
      final bloc = await _loaded(repo, analytics: analytics, locale: 'ta');
      addTearDown(bloc.close);

      final props = analytics.propsFor('horoscope_tts_started');
      expect(props['voice_locale'], 'hi');
      expect(props['zodiac_sign'], 'taurus');
      expect(props['step_id'], 'namaste');
    });

    test('an unsupported language never blocks text — text-only, no tts_started',
        () async {
      final tts = FakeTtsPort(languageAvailable: false);
      final analytics = RecordingAnalytics();
      final repo = FakeHoroscopeRepository();
      final bloc = await _loaded(repo, tts: tts, analytics: analytics);
      addTearDown(bloc.close);

      // The reading is fully usable...
      expect(bloc.state.status, HoroscopeResultStatus.ready);
      expect(bloc.state.currentStep, isNotNull);
      expect(bloc.state.ttsUnavailable, isTrue);
      // ...it just never speaks.
      expect(tts.spoken, isEmpty);
      expect(analytics.names, isNot(contains('horoscope_tts_started')));

      // Next still walks the flow.
      bloc.add(const HoroscopeNextTapped());
      await bloc.stream.firstWhere((s) => s.index == 1);
      expect(bloc.state.index, 1);
    });

    test('a step with ttsEnabled:false renders but is not narrated', () async {
      final tts = FakeTtsPort();
      final repo = FakeHoroscopeRepository(
        daily: horoscopeDailyFixture(steps: [
          horoscopeStepFixture(stepId: 'silent', order: 0, ttsEnabled: false),
        ]),
      );
      final bloc = await _loaded(repo, tts: tts);
      addTearDown(bloc.close);

      expect(bloc.state.currentStep!.stepId, 'silent');
      expect(tts.spoken, isEmpty);
    });

    test('backgrounding stops speech so it never continues after exit', () async {
      final tts = FakeTtsPort();
      final repo = FakeHoroscopeRepository();
      final bloc = await _loaded(repo, tts: tts);
      addTearDown(bloc.close);

      bloc.add(const HoroscopeAppBackgrounded());
      await Future<void>.delayed(Duration.zero);
      expect(tts.stopCalls, greaterThanOrEqualTo(1));
      expect(tts.isSpeaking, isFalse);
    });

    test('closing the bloc (Back) stops speech', () async {
      final tts = FakeTtsPort();
      final repo = FakeHoroscopeRepository();
      final bloc = await _loaded(repo, tts: tts);

      await bloc.close();
      expect(tts.stopCalls, greaterThanOrEqualTo(1));
    });
  });

  group('Next / Finish / Back / Completed', () {
    test('final step shows Finish; Finish stops speech and fires completed',
        () async {
      final tts = FakeTtsPort();
      final repo = FakeHoroscopeRepository(
        daily: horoscopeDailyFixture(steps: [
          horoscopeStepFixture(stepId: 'only', order: 0),
        ]),
      );
      final analytics = RecordingAnalytics();
      final bloc = await _loaded(repo, tts: tts, analytics: analytics);
      addTearDown(bloc.close);

      expect(bloc.state.showFinish, isTrue);
      bloc.add(const HoroscopeFinishTapped());
      await bloc.stream.firstWhere((s) => s.finished);

      expect(tts.stopCalls, greaterThanOrEqualTo(1));
      // Sheet row 111 — `horoscope_completed`.
      expect(analytics.names, contains('horoscope_completed'));
    });

    test('the final step never auto-advances past itself but DOES fire completed',
        () async {
      final tts = FakeTtsPort();
      final analytics = RecordingAnalytics();
      final repo = FakeHoroscopeRepository(
        daily: horoscopeDailyFixture(steps: [
          horoscopeStepFixture(stepId: 'only', order: 0),
        ]),
      );
      final bloc = await _loaded(repo, tts: tts, analytics: analytics);
      addTearDown(bloc.close);

      tts.completeSpeech();
      await Future<void>.delayed(Duration.zero);

      expect(bloc.state.index, 0);
      expect(bloc.state.finished, isFalse);
      // Sheet row 111 — finishing the FINAL step's narration counts as
      // completion even if Finish is never tapped.
      expect(analytics.names, contains('horoscope_completed'));
    });

    test('horoscope_completed fires exactly once per session', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeHoroscopeRepository(
        daily: horoscopeDailyFixture(steps: [
          horoscopeStepFixture(stepId: 'only', order: 0),
        ]),
      );
      final tts = FakeTtsPort();
      final bloc = await _loaded(repo, tts: tts, analytics: analytics);
      addTearDown(bloc.close);

      // Both paths that could emit it happen in the same session.
      tts.completeSpeech();
      await Future<void>.delayed(Duration.zero);
      bloc.add(const HoroscopeFinishTapped());
      await bloc.stream.firstWhere((s) => s.finished);

      expect(
        analytics.names.where((n) => n == 'horoscope_completed'),
        hasLength(1),
      );
    });

    test('next_clicked + section_viewed carry step ids and step_name/order',
        () async {
      final analytics = RecordingAnalytics();
      final repo = FakeHoroscopeRepository();
      final bloc = await _loaded(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const HoroscopeNextTapped());
      await bloc.stream.firstWhere((s) => s.index == 1);

      // Sheet row 106 — from/to step ids.
      final nextProps = analytics.propsFor('horoscope_next_clicked');
      expect(nextProps['from_step_id'], 'namaste');
      expect(nextProps['to_step_id'], 'good_time');
      expect(nextProps['zodiac_sign'], 'taurus');

      // Sheet row 105 — step_id + step_name + step_order.
      final viewedProps =
          analytics.propsFor('horoscope_section_viewed');
      expect(viewedProps['step_id'], 'good_time');
      expect(viewedProps['step_name'], 'A good time today');
      expect(viewedProps['step_order'], 1);
    });

    test('back_clicked (row 107) fires with from_step_id and null to_step_id',
        () async {
      final analytics = RecordingAnalytics();
      final repo = FakeHoroscopeRepository();
      final bloc = await _loaded(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const HoroscopeBackTapped());
      await Future<void>.delayed(Duration.zero);

      final props = analytics.propsFor('horoscope_back_clicked');
      expect(props['zodiac_sign'], 'taurus');
      expect(props['from_step_id'], 'namaste');
      expect(props['to_step_id'], isNull);
    });
  });

  group('load + resilience', () {
    test(
        'today_horoscope_page_viewed (row 104) carries zodiac, date, step_count,'
        ' load_time_ms and video_fallback_used', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeHoroscopeRepository();
      final bloc = await _loaded(repo, analytics: analytics);
      addTearDown(bloc.close);

      final props =
          analytics.propsFor('today_horoscope_page_viewed');
      expect(props['zodiac_sign'], 'taurus');
      expect(props['horoscope_date'], '2026-06-15');
      expect(props['step_count'], 4);
      expect(props['load_time_ms'], isA<int>());
      expect(props['video_fallback_used'], isFalse);
    });

    test('video failure → fallback flag + result_failed(render); text keeps working',
        () async {
      final analytics = RecordingAnalytics();
      final repo = FakeHoroscopeRepository();
      final bloc = await _loaded(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const HoroscopeVideoFailed());
      await bloc.stream.firstWhere((s) => s.videoFallback);

      // Sheet row 112 — with failure_stage=render for a video-init failure.
      final failed = analytics.propsFor('horoscope_result_failed');
      expect(failed['failure_stage'], 'render');
      expect(failed['zodiac_sign'], 'taurus');
      expect(bloc.state.currentStep, isNotNull);
      expect(bloc.state.status, HoroscopeResultStatus.ready);

      // Logged once per session.
      bloc.add(const HoroscopeVideoFailed());
      await Future<void>.delayed(Duration.zero);
      final renderFailures = analytics.events
          .where((e) =>
              e.name == 'horoscope_result_failed' &&
              e.properties['failure_stage'] == 'render')
          .toList();
      expect(renderFailures, hasLength(1));
    });

    test('offline → offline state + result_failed(load) with error_code=offline',
        () async {
      final analytics = RecordingAnalytics();
      final repo = FakeHoroscopeRepository(
        dailyError: const HoroscopeException(HoroscopeErrorKind.offline),
      );
      final bloc = await _loaded(repo, analytics: analytics);
      addTearDown(bloc.close);

      expect(bloc.state.status, HoroscopeResultStatus.offline);
      // The header keeps its zodiac context in the error state.
      expect(bloc.state.zodiacId, 'taurus');

      final failed = analytics.propsFor('horoscope_result_failed');
      expect(failed['failure_stage'], 'load');
      expect(failed['error_code'], 'offline');
      expect(failed['retry_count'], 0);

      repo.dailyError = null;
      bloc.add(const HoroscopeResultRetried());
      await bloc.stream.firstWhere((s) => s.status == HoroscopeResultStatus.ready);
      expect(bloc.state.steps, isNotEmpty);
    });

    test('retry_count increments across retries on result_failed', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeHoroscopeRepository(
        dailyError: const HoroscopeException(HoroscopeErrorKind.unknown),
      );
      final bloc = await _loaded(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const HoroscopeResultRetried());
      await bloc.stream
          .firstWhere((s) => s.status == HoroscopeResultStatus.failure);
      bloc.add(const HoroscopeResultRetried());
      await bloc.stream
          .firstWhere((s) => s.status == HoroscopeResultStatus.failure);

      final failures = analytics.events
          .where((e) => e.name == 'horoscope_result_failed')
          .map((e) => e.properties['retry_count'])
          .toList();
      // Initial load + two retries → counts should climb 0,1,2.
      expect(failures, [0, 1, 2]);
    });

    test('403 (free user) → failure, and NO step text is ever rendered', () async {
      final repo = FakeHoroscopeRepository(
        dailyError: const HoroscopeException(HoroscopeErrorKind.proRequired),
      );
      final bloc = await _loaded(repo);
      addTearDown(bloc.close);

      expect(bloc.state.status, HoroscopeResultStatus.failure);
      expect(bloc.state.steps, isEmpty);
      expect(bloc.state.currentStep, isNull);
    });

    test('no TTS is attempted before the content is ready', () async {
      final tts = FakeTtsPort();
      final repo = FakeHoroscopeRepository(
        dailyError: const HoroscopeException(HoroscopeErrorKind.unknown),
      );
      final bloc = await _loaded(repo, tts: tts);
      addTearDown(bloc.close);

      expect(tts.spoken, isEmpty);
    });
  });
}
