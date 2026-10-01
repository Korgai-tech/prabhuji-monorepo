import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/kuldevta/application/kuldevta_bloc.dart';
import 'package:mobile/features/kuldevta/application/kuldevta_event.dart';
import 'package:mobile/features/kuldevta/application/kuldevta_state.dart';
import 'package:mobile/features/kuldevta/data/kuldevta_counters.dart';
import 'package:mobile/features/kuldevta/data/kuldevta_repository.dart';
import 'package:mobile/features/kuldevta/domain/kuldevta_answers.dart';
import 'package:mobile/features/kuldevta/domain/kuldevta_result.dart';

/// Deterministic fake repository — per the flutter-testing skill (no
/// mockito). Callers write:
///
///   fake.nextResult = <a KuldevtaResult>  (200 path)
///   fake.nextError  = DioException(...)   (any error path)
///
/// A CancelToken is threaded through so the cancellation test can
/// invoke `.cancel()` mid-request; the fake awaits an internal
/// completer so tests control when the response resolves.
class _FakeKuldevtaRepository implements KuldevtaRepository {
  KuldevtaResult? nextResult;
  Object? nextError;
  KuldevtaAnswers? lastSubmitted;
  int callCount = 0;
  Completer<KuldevtaResult>? _gate;

  void openGate() => _gate = Completer<KuldevtaResult>();

  @override
  Future<KuldevtaResult> identify(
    KuldevtaAnswers answers, {
    CancelToken? cancelToken,
  }) async {
    lastSubmitted = answers;
    callCount += 1;
    if (_gate != null) {
      final done = Completer<KuldevtaResult>();
      cancelToken?.whenCancel.then((_) {
        if (!done.isCompleted) {
          done.completeError(
            DioException.requestCancelled(
              requestOptions: RequestOptions(path: '/kuldevta/identify'),
              reason: 'cancelled',
            ),
          );
        }
      });
      _gate!.future.then((r) {
        if (!done.isCompleted) done.complete(r);
      }, onError: (Object e) {
        if (!done.isCompleted) done.completeError(e);
      });
      return done.future;
    }
    final err = nextError;
    if (err != null) throw err;
    final r = nextResult;
    if (r != null) return r;
    throw StateError('Fake not primed');
  }
}

KuldevtaResult _sampleResult({KuldevtaGender gender = KuldevtaGender.devi}) {
  return KuldevtaResult(
    slug: 'karni-mata',
    nameRoman: 'Karni Mata',
    nameDevanagari: 'करणी माता',
    gender: gender,
    imageUrl: 'https://cdn.test/karni.jpg',
    location: 'Deshnoke, Bikaner, Rajasthan',
    reasons: const <String>['Charan community', 'Nagana ancestral place'],
    tier: 'confirmed',
    matchedOn: const <String>['community', 'place'],
  );
}

Future<void> _settle() async {
  // The bloc emits synchronously inside handlers but the identify path
  // awaits Future.value(...). Two microtasks are enough to drain the
  // reducer's async gaps.
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
}

void main() {
  group('KuldevtaBloc — wizard cursor', () {
    late _FakeKuldevtaRepository fake;
    late KuldevtaBloc bloc;

    setUp(() async {
      fake = _FakeKuldevtaRepository();
      bloc = KuldevtaBloc(
        repository: fake,
        counters: KuldevtaCounters.inMemory(),
        isPro: () => false,
        typingDelay: Duration.zero,
      );
    });

    tearDown(() => bloc.close());

    test('starts at KuldevtaEntry with empty answers', () {
      expect(bloc.state, isA<KuldevtaEntry>());
      expect(bloc.state.answers, KuldevtaAnswers.empty);
    });

    test('KuldevtaStarted -> AnsweringQuestion(0, empty)', () async {
      bloc.add(const KuldevtaStarted());
      await _settle();
      expect(bloc.state, isA<KuldevtaAnsweringQuestion>());
      final s = bloc.state as KuldevtaAnsweringQuestion;
      expect(s.stepIndex, 0);
      expect(s.answers.surname, '');
    });

    test('AnswerSubmitted on step 0 writes surname + advances to step 1',
        () async {
      bloc.add(const KuldevtaStarted());
      await _settle();
      bloc.add(const KuldevtaAnswerSubmitted('Sharma'));
      await _settle();
      final s = bloc.state as KuldevtaAnsweringQuestion;
      expect(s.stepIndex, 1);
      expect(s.answers.surname, 'Sharma');
    });

    test('PataNahiTapped on step 0 writes "" and advances', () async {
      bloc.add(const KuldevtaStarted());
      await _settle();
      bloc.add(const KuldevtaPataNahiTapped());
      await _settle();
      final s = bloc.state as KuldevtaAnsweringQuestion;
      expect(s.stepIndex, 1);
      expect(s.answers.surname, '');
    });

    for (int i = 0; i < 5; i++) {
      test(
          'AnswerSubmitted at step $i writes field ${KuldevtaAnswers.fields[i]}',
          () async {
        bloc.add(const KuldevtaStarted());
        await _settle();
        for (int j = 0; j < i; j++) {
          bloc.add(const KuldevtaPataNahiTapped());
          await _settle();
        }
        bloc.add(KuldevtaAnswerSubmitted('answer-$i'));
        await _settle();
        final s = bloc.state as KuldevtaAnsweringQuestion;
        expect(s.stepIndex, i + 1);
        expect(
          s.answers.fieldAt(i),
          'answer-$i',
          reason: 'step $i must write ${KuldevtaAnswers.fields[i]}',
        );
      });
    }

    test('BackTapped from step 2 -> step 1 with answers preserved', () async {
      bloc.add(const KuldevtaStarted());
      await _settle();
      bloc.add(const KuldevtaAnswerSubmitted('Sharma'));
      await _settle();
      bloc.add(const KuldevtaAnswerSubmitted('Nagana'));
      await _settle();
      // Now on step 2.
      bloc.add(const KuldevtaBackTapped());
      await _settle();
      final s = bloc.state as KuldevtaAnsweringQuestion;
      expect(s.stepIndex, 1);
      expect(s.answers.surname, 'Sharma');
      expect(s.answers.ancestralPlace, 'Nagana');
    });

    test('BackTapped from step 0 -> KuldevtaEntry (answers preserved)',
        () async {
      bloc.add(const KuldevtaStarted());
      await _settle();
      bloc.add(const KuldevtaAnswerSubmitted('Sharma'));
      await _settle();
      bloc.add(const KuldevtaBackTapped());
      await _settle();
      bloc.add(const KuldevtaBackTapped());
      await _settle();
      expect(bloc.state, isA<KuldevtaEntry>());
      expect(bloc.state.answers.surname, 'Sharma');
    });
  });

  group('KuldevtaBloc — identify request', () {
    test('AnswerSubmitted on step 5 fires identify with all six fields',
        () async {
      final fake = _FakeKuldevtaRepository()..nextResult = _sampleResult();
      final bloc = KuldevtaBloc(
        repository: fake,
        counters: KuldevtaCounters.inMemory(),
        isPro: () => false,
        typingDelay: Duration.zero,
      );
      addTearDown(bloc.close);

      bloc.add(const KuldevtaStarted());
      await _settle();
      for (int i = 0; i < 5; i++) {
        bloc.add(KuldevtaAnswerSubmitted('a-$i'));
        await _settle();
      }
      bloc.add(const KuldevtaAnswerSubmitted('a-5'));
      await _settle();

      expect(fake.callCount, 1);
      expect(fake.lastSubmitted?.surname, 'a-0');
      expect(fake.lastSubmitted?.ancestralPlace, 'a-1');
      expect(fake.lastSubmitted?.community, 'a-2');
      expect(fake.lastSubmitted?.gotra, 'a-3');
      expect(fake.lastSubmitted?.templeMentioned, 'a-4');
      expect(fake.lastSubmitted?.mandirPhoto, 'a-5');
      expect(bloc.state, isA<KuldevtaResultReady>());
    });

    test('PataNahiTapped on step 5 fires identify with mandirPhoto = ""',
        () async {
      final fake = _FakeKuldevtaRepository()..nextResult = _sampleResult();
      final bloc = KuldevtaBloc(
        repository: fake,
        counters: KuldevtaCounters.inMemory(),
        isPro: () => false,
        typingDelay: Duration.zero,
      );
      addTearDown(bloc.close);

      bloc.add(const KuldevtaStarted());
      await _settle();
      for (int i = 0; i < 5; i++) {
        bloc.add(const KuldevtaPataNahiTapped());
        await _settle();
      }
      bloc.add(const KuldevtaPataNahiTapped());
      await _settle();

      expect(fake.lastSubmitted?.mandirPhoto, '');
      expect(fake.lastSubmitted?.surname, '');
    });

    test('500 error -> KuldevtaFailed with the six answers preserved',
        () async {
      final fake = _FakeKuldevtaRepository()
        ..nextError = DioException(
          requestOptions: RequestOptions(path: '/kuldevta/identify'),
          response: Response(
            requestOptions: RequestOptions(path: '/kuldevta/identify'),
            statusCode: 500,
            data: {'errorCode': 'INTERNAL_ERROR'},
          ),
        );
      final bloc = KuldevtaBloc(
        repository: fake,
        counters: KuldevtaCounters.inMemory(),
        isPro: () => false,
        typingDelay: Duration.zero,
      );
      addTearDown(bloc.close);

      bloc.add(const KuldevtaStarted());
      await _settle();
      for (int i = 0; i < 5; i++) {
        bloc.add(KuldevtaAnswerSubmitted('a-$i'));
        await _settle();
      }
      bloc.add(const KuldevtaAnswerSubmitted('a-5'));
      await _settle();

      expect(bloc.state, isA<KuldevtaFailed>());
      final s = bloc.state as KuldevtaFailed;
      expect(s.errorKind, 'server_5xx');
      expect(s.httpStatus, 500);
      expect(s.errorCode, 'INTERNAL_ERROR');
      expect(s.answers.surname, 'a-0');
      expect(s.answers.mandirPhoto, 'a-5');
    });

    test('RetryTapped from KuldevtaFailed re-fires identify', () async {
      final fake = _FakeKuldevtaRepository()
        ..nextError = DioException(
          requestOptions: RequestOptions(path: '/kuldevta/identify'),
          response: Response(
            requestOptions: RequestOptions(path: '/kuldevta/identify'),
            statusCode: 500,
          ),
        );
      final bloc = KuldevtaBloc(
        repository: fake,
        counters: KuldevtaCounters.inMemory(),
        isPro: () => false,
        typingDelay: Duration.zero,
      );
      addTearDown(bloc.close);

      bloc.add(const KuldevtaStarted());
      await _settle();
      for (int i = 0; i < 6; i++) {
        bloc.add(KuldevtaAnswerSubmitted('a-$i'));
        await _settle();
      }
      expect(bloc.state, isA<KuldevtaFailed>());
      expect(fake.callCount, 1);

      // Prime a successful result for retry.
      fake.nextError = null;
      fake.nextResult = _sampleResult();
      bloc.add(const KuldevtaRetryTapped());
      await _settle();

      expect(fake.callCount, 2);
      expect(bloc.state, isA<KuldevtaResultReady>());
    });

    test('LoadingCancelled from Identifying returns to Q6 preserving answers',
        () async {
      final fake = _FakeKuldevtaRepository()..openGate();
      final bloc = KuldevtaBloc(
        repository: fake,
        counters: KuldevtaCounters.inMemory(),
        isPro: () => false,
        typingDelay: Duration.zero,
      );
      addTearDown(bloc.close);

      bloc.add(const KuldevtaStarted());
      await _settle();
      for (int i = 0; i < 5; i++) {
        bloc.add(KuldevtaAnswerSubmitted('a-$i'));
        await _settle();
      }
      bloc.add(const KuldevtaAnswerSubmitted('a-5'));
      await _settle();
      expect(bloc.state, isA<KuldevtaIdentifying>());

      bloc.add(const KuldevtaLoadingCancelled());
      // Give the cancel token time to propagate + the try/catch to run.
      await Future<void>.delayed(const Duration(milliseconds: 20));

      expect(bloc.state, isA<KuldevtaAnsweringQuestion>());
      final s = bloc.state as KuldevtaAnsweringQuestion;
      expect(s.stepIndex, 5);
      expect(s.answers.mandirPhoto, 'a-5');
    });
  });

  group('KuldevtaBloc — chat handoff', () {
    test('assignment success refetches /users/me WITHOUT any tap — a non-Pro '
        'user who never reaches the CTA must still learn they have a '
        'kuldevta', () async {
      var refetched = 0;
      final fake = _FakeKuldevtaRepository()..nextResult = _sampleResult();
      final bloc = KuldevtaBloc(
        repository: fake,
        counters: KuldevtaCounters.inMemory(),
        // NOT Pro — this is the whole point. "Mata Se Baat Karein" runs inside
        // the paywall gate's `pending` action, which a free user never reaches;
        // they get the paywall. When the refetch lived only there, a free user
        // who dismissed the paywall kept `kuldevtaAssigned == false`: chat
        // stayed in khoj mode, the header never named the deity, and
        // re-entering replayed a khoj they had already finished. Entitlement
        // gates whether they can TALK to their kuldevta, not whether they have
        // one.
        isPro: () => false,
        typingDelay: Duration.zero,
        refetchMe: () async {
          refetched += 1;
        },
      );
      addTearDown(bloc.close);

      bloc.add(const KuldevtaStarted());
      await _settle();
      for (int i = 0; i < 6; i++) {
        bloc.add(KuldevtaAnswerSubmitted('a-$i'));
        await _settle();
      }

      expect(bloc.state, isA<KuldevtaResultReady>());
      expect(
        refetched,
        greaterThanOrEqualTo(1),
        reason: 'the refetch must fire on assignment, not on the paywalled CTA',
      );
    });

    test('ChatTapped also refetches, as a backstop', () async {
      var refetched = 0;
      final fake = _FakeKuldevtaRepository()..nextResult = _sampleResult();
      final bloc = KuldevtaBloc(
        repository: fake,
        counters: KuldevtaCounters.inMemory(),
        isPro: () => false,
        typingDelay: Duration.zero,
        refetchMe: () async {
          refetched += 1;
        },
      );
      addTearDown(bloc.close);

      bloc.add(const KuldevtaStarted());
      await _settle();
      for (int i = 0; i < 6; i++) {
        bloc.add(KuldevtaAnswerSubmitted('a-$i'));
        await _settle();
      }
      expect(bloc.state, isA<KuldevtaResultReady>());

      final afterAssignment = refetched;
      bloc.add(const KuldevtaChatTapped());
      await _settle();
      expect(
        refetched,
        greaterThan(afterAssignment),
        reason: 'the CTA still refetches, covering a lost first attempt',
      );
    });
  });

  group('KuldevtaBloc — the typing beat between questions', () {
    /// A real (short) delay, unlike every other test here, because the point
    /// is the gap itself.
    KuldevtaBloc blocWithBeat() => KuldevtaBloc(
      repository: _FakeKuldevtaRepository()..nextResult = _sampleResult(),
      counters: KuldevtaCounters.inMemory(),
      isPro: () => false,
      typingDelay: const Duration(milliseconds: 60),
    );

    test('an answer parks on botTyping BEFORE the next question appears',
        () async {
      final bloc = blocWithBeat();
      addTearDown(bloc.close);

      bloc.add(const KuldevtaStarted());
      await _settle();
      bloc.add(const KuldevtaAnswerSubmitted('Sharma'));
      await _settle();

      // Mid-beat: the cursor has advanced, but the question is still "being
      // typed" — the transcript renders a typing bubble in its place.
      final typing = bloc.state as KuldevtaAnsweringQuestion;
      expect(typing.botTyping, isTrue);
      expect(typing.stepIndex, 1);
      expect(
        typing.answers.surname,
        'Sharma',
        reason: 'the answer is recorded immediately; only its reply is delayed',
      );

      await Future<void>.delayed(const Duration(milliseconds: 120));
      final shown = bloc.state as KuldevtaAnsweringQuestion;
      expect(shown.botTyping, isFalse);
      expect(shown.stepIndex, 1);
    });

    test('the beat does not fire on the LAST answer — identify does', () async {
      final bloc = blocWithBeat();
      addTearDown(bloc.close);

      bloc.add(const KuldevtaStarted());
      await _settle();
      for (int i = 0; i < 5; i++) {
        bloc.add(KuldevtaAnswerSubmitted('a-$i'));
        await Future<void>.delayed(const Duration(milliseconds: 120));
      }
      bloc.add(const KuldevtaAnswerSubmitted('a-5'));
      await _settle();

      // Step 6 goes straight to identify; its own spinner is the wait, and a
      // typing bubble first would be two loading affordances in a row. The
      // fake resolves immediately, so the observable end state is the result —
      // what matters is that it is NOT parked on a typing beat.
      expect(bloc.state, isA<KuldevtaResultReady>());
      expect(
        bloc.state,
        isNot(isA<KuldevtaAnsweringQuestion>()),
        reason: 'the last answer must not insert a typing beat before identify',
      );
    });

    test('closing the bloc mid-beat does not throw', () async {
      final bloc = blocWithBeat();
      bloc.add(const KuldevtaStarted());
      await _settle();
      bloc.add(const KuldevtaAnswerSubmitted('Sharma'));
      await _settle();

      // The user backs out of the khoj while the reply is pending. Emitting
      // after close throws, so the handler has to check `emit.isDone`.
      await bloc.close();
      await Future<void>.delayed(const Duration(milliseconds: 120));
    });
  });
}
