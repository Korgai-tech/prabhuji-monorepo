import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/horoscope/data/horoscope_models.dart';
import 'package:mobile/features/horoscope/main/bloc/horoscope_main_bloc.dart';
import 'package:mobile/features/horoscope/main/bloc/horoscope_main_event.dart';
import 'package:mobile/features/horoscope/main/bloc/horoscope_main_state.dart';

import '../support/fake_analytics.dart';
import '../support/fake_horoscope_services.dart';

HoroscopeMainBloc _bloc(
  FakeHoroscopeRepository repo, {
  RecordingAnalytics? analytics,
  String locale = 'hi',
  DateTime? now,
}) =>
    HoroscopeMainBloc(
      repository: repo,
      locale: locale,
      analytics: analytics,
      clock: () => now ?? DateTime.utc(2026, 6, 15, 4),
    );

void main() {
  group('HoroscopeMainBloc', () {
    test('MainRequested → ready with the 12 server-ordered signs', () async {
      final repo = FakeHoroscopeRepository();
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      bloc.add(const HoroscopeMainRequested());
      await bloc.stream.firstWhere((s) => s.status == HoroscopeMainStatus.ready);

      expect(bloc.state.signs, hasLength(12));
      expect(bloc.state.signs.first.zodiacId, 'aries');
      expect(bloc.state.signs.last.zodiacId, 'pisces');
      expect(repo.fetchSignsCalls, 1);
    });

    test('labels are typo-free — Sagittarius/Capricorn, never the Figma spellings',
        () async {
      final repo = FakeHoroscopeRepository();
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      bloc.add(const HoroscopeMainRequested());
      await bloc.stream.firstWhere((s) => s.status == HoroscopeMainStatus.ready);

      final labels = bloc.state.signs.map((s) => s.displayName).toList();
      expect(labels, contains('Sagittarius'));
      expect(labels, contains('Capricorn'));
      expect(labels, isNot(contains('Saittarius')));
      expect(labels, isNot(contains('Capricon')));
    });

    test('sends the app locale and fires horoscope_page_viewed (Sheet row 102)',
        () async {
      final repo = FakeHoroscopeRepository();
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics, locale: 'mr');
      addTearDown(bloc.close);

      bloc.add(const HoroscopeMainRequested());
      await bloc.stream.firstWhere((s) => s.status == HoroscopeMainStatus.ready);

      expect(repo.lastLocale, 'mr');
      expect(analytics.names, contains('horoscope_page_viewed'));
    });

    test('header date is the IST civil date (grid gets no date from the API)',
        () async {
      final repo = FakeHoroscopeRepository();
      // 23:30 UTC on 14 June is already 05:00 IST on 15 June.
      final bloc = _bloc(repo, now: DateTime.utc(2026, 6, 14, 23, 30));
      addTearDown(bloc.close);

      bloc.add(const HoroscopeMainRequested());
      await bloc.stream.firstWhere((s) => s.status == HoroscopeMainStatus.ready);

      expect(bloc.state.dateIst, '2026-06-15');
      expect(bloc.state.formattedDate, '15 June, 2026');
    });

    test('failure → friendly error; Retry re-fetches and recovers', () async {
      final repo = FakeHoroscopeRepository(
        signsError: const HoroscopeException(HoroscopeErrorKind.unknown),
      );
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      bloc.add(const HoroscopeMainRequested());
      await bloc.stream.firstWhere((s) => s.status == HoroscopeMainStatus.failure);
      expect(bloc.state.errorMessage, isNotNull);

      repo.signsError = null;
      bloc.add(const HoroscopeMainRetried());
      await bloc.stream.firstWhere((s) => s.status == HoroscopeMainStatus.ready);

      expect(bloc.state.signs, hasLength(12));
    });

    test('offline → its own message', () async {
      final repo = FakeHoroscopeRepository(
        signsError: const HoroscopeException(HoroscopeErrorKind.offline),
      );
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      bloc.add(const HoroscopeMainRequested());
      await bloc.stream.firstWhere((s) => s.status == HoroscopeMainStatus.failure);

      expect(bloc.state.errorMessage, contains('offline'));
    });
  });

  group('istCivilDateNow', () {
    test('crosses to the next IST day at 18:30 UTC', () {
      expect(istCivilDateNow(now: DateTime.utc(2026, 6, 14, 18, 29)), '2026-06-14');
      expect(istCivilDateNow(now: DateTime.utc(2026, 6, 14, 18, 30)), '2026-06-15');
    });

    test('zero-pads month and day to the contract format', () {
      expect(istCivilDateNow(now: DateTime.utc(2026, 1, 2, 0, 0)), '2026-01-02');
    });
  });

  group('formatHoroscopeDate', () {
    test('renders the design string', () {
      expect(formatHoroscopeDate('2026-06-15'), '15 June, 2026');
    });

    test('passes an unparseable value through rather than throwing', () {
      expect(formatHoroscopeDate('not-a-date'), 'not-a-date');
    });
  });
}
