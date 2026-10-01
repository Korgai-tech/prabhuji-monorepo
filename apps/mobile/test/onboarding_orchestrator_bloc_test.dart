import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/features/onboarding/bloc/onboarding_orchestrator_bloc.dart';
import 'package:mobile/features/onboarding/bloc/onboarding_orchestrator_event.dart';
import 'package:mobile/features/onboarding/bloc/onboarding_orchestrator_state.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';
import 'package:mobile/features/paywall/data/subscription_repository.dart';

import 'support/fake_analytics.dart';
import 'support/fake_auth_store.dart';
import 'support/fake_repositories.dart';

/// Fixture builders — trimmed down to the fields the orchestrator's decision
/// tree actually reads so a change to unrelated user fields doesn't break
/// every routing rule.

MeUser _user({
  String? phone = '+91',
  String? name,
  String? lang,
  DateTime? onboardingCompletedAt,
  MeLanding? landing,
}) =>
    MeUser(
      id: 'user-1',
      name: name,
      selectedLanguage: lang,
      onboardingCompletedAt: onboardingCompletedAt,
      phoneCountryCode: phone,
      phoneNumber: phone == null ? null : '9876543210',
      landing: landing,
    );

/// A server landing, shaped like `/users/me` sends one.
MeLanding _landing({
  String deeplink = 'prabhuji://ringtone',
  String module = 'ringtone',
  String source = 'utm_matched',
  String utmCode = 'RTG',
}) =>
    MeLanding(
      deeplink: deeplink,
      module: module,
      source: source,
      utmCode: utmCode,
    );

SubscriptionSnapshot _sub({required bool pro}) => SubscriptionSnapshot(
      status: pro ? SubscriptionStatusEnum.active : SubscriptionStatusEnum.free,
      isPro: pro,
      activePlanId: null,
      activeProductId: null,
      provider: null,
      expiresAt: null,
      trialEndsAt: null,
      entitledUntil: null,
    );

OnboardingOrchestratorBloc _bloc({
  required FakeAuthStore auth,
  required UsersRepository users,
  required SubscriptionRepository subs,
  RecordingAnalytics? analytics,
}) =>
    OnboardingOrchestratorBloc(
      authStore: auth,
      usersRepository: users,
      subscriptionRepository: subs,
      analytics: analytics,
    );

Future<OrchestratorState> _waitForDecision(OnboardingOrchestratorBloc bloc) {
  return bloc.stream.firstWhere(
    (s) => s is OrchestratorRouteDecided || s is OrchestratorError,
  );
}

void main() {
  _landingGroup();

  group('OnboardingOrchestratorBloc — PRD §6.1', () {
    test('Rule 1: no JWT → phoneInput (logged out)', () async {
      final bloc = _bloc(
        auth: FakeAuthStore(token: null),
        users: FakeUsersRepository(result: const MeResult()),
        subs: FakeSubscriptionRepository(),
      );
      bloc.add(const AppStarted());
      final decided = await _waitForDecision(bloc) as OrchestratorRouteDecided;
      expect(decided.target, RouteTarget.phoneInput);
      expect(decided.reason, RouteReason.loggedOut);
      await bloc.close();
    });

    test('Rule 2: JWT + 401 → clear JWT + phoneInput (auth_failed)', () async {
      final auth = FakeAuthStore(token: 'stale-jwt');
      final bloc = _bloc(
        auth: auth,
        users: FakeUsersRepository(result: const MeResult(authFailed: true)),
        subs: FakeSubscriptionRepository(),
      );
      bloc.add(const AppStarted());
      final decided = await _waitForDecision(bloc) as OrchestratorRouteDecided;
      expect(decided.target, RouteTarget.phoneInput);
      expect(decided.reason, RouteReason.authFailed);
      expect(auth.clears, 1);
      await bloc.close();
    });

    test('Rule 3: JWT + user without phoneCountryCode → phoneInput', () async {
      final bloc = _bloc(
        auth: FakeAuthStore(token: 'tok'),
        users: FakeUsersRepository(
          result: MeResult(user: _user(phone: null)),
        ),
        subs: FakeSubscriptionRepository(),
      );
      bloc.add(const AppStarted());
      final decided = await _waitForDecision(bloc) as OrchestratorRouteDecided;
      expect(decided.target, RouteTarget.phoneInput);
      expect(decided.reason, RouteReason.partialPhone);
      await bloc.close();
    });

    test(
      'Rule 4 (retired): an incomplete profile no longer diverts to nameLanguage',
      () async {
        // This asserted `nameLanguage` until onboarding stopped collecting a
        // name and a language (see the "Rule 4 … is intentionally removed"
        // comment in the bloc). A phone-verified user now goes straight to the
        // subscription fork whether or not `onboardingCompletedAt` is set, and a
        // null name/language is simply a null column.
        //
        // Kept rather than deleted, because the INPUT still matters: it is the
        // regression test for the rule coming back by accident. It went stale
        // unnoticed only because duplicate `part` declarations in the generated
        // openapi.dart stopped this whole file from compiling.
        final bloc = _bloc(
          auth: FakeAuthStore(token: 'tok'),
          users: FakeUsersRepository(
            result: MeResult(
              user: _user(
                phone: '+91',
                name: null,
                lang: null,
                onboardingCompletedAt: null,
              ),
            ),
          ),
          subs: FakeSubscriptionRepository(snapshot: _sub(pro: false)),
        );
        bloc.add(const AppStarted());
        final decided =
            await _waitForDecision(bloc) as OrchestratorRouteDecided;
        expect(decided.target, RouteTarget.paywall);
        expect(decided.target, isNot(RouteTarget.nameLanguage));
        await bloc.close();
      },
    );

    test(
      'Rule 5: onboarding complete + Pro → home',
      () async {
        final bloc = _bloc(
          auth: FakeAuthStore(token: 'tok'),
          users: FakeUsersRepository(
            result: MeResult(
              user: _user(
                phone: '+91',
                name: 'Alice',
                lang: 'hi',
                onboardingCompletedAt: DateTime.utc(2026, 1, 1),
              ),
            ),
          ),
          subs: FakeSubscriptionRepository(snapshot: _sub(pro: true)),
        );
        bloc.add(const AppStarted());
        final decided =
            await _waitForDecision(bloc) as OrchestratorRouteDecided;
        expect(decided.target, RouteTarget.home);
        expect(decided.reason, RouteReason.onboardingCompletePro);
        expect(decided.subscriptionStatus, 'active');
        expect(decided.hasCompletedOnboarding, isTrue);
        await bloc.close();
      },
    );

    test(
      'Rule 6: onboarding complete + free → paywall',
      () async {
        final bloc = _bloc(
          auth: FakeAuthStore(token: 'tok'),
          users: FakeUsersRepository(
            result: MeResult(
              user: _user(
                phone: '+91',
                name: 'Alice',
                lang: 'hi',
                onboardingCompletedAt: DateTime.utc(2026, 1, 1),
              ),
            ),
          ),
          subs: FakeSubscriptionRepository(snapshot: _sub(pro: false)),
        );
        bloc.add(const AppStarted());
        final decided =
            await _waitForDecision(bloc) as OrchestratorRouteDecided;
        expect(decided.target, RouteTarget.paywall);
        expect(decided.reason, RouteReason.onboardingCompleteFree);
        expect(decided.subscriptionStatus, 'free');
        expect(decided.hasCompletedOnboarding, isTrue);
        await bloc.close();
      },
    );

    test(
      'Rule 7: users/me fails after a prior success → cached_fallback',
      () async {
        var callCount = 0;
        final users = FakeUsersRepository(onGetMe: () async {
          callCount++;
          if (callCount == 1) {
            return MeResult(
              user: _user(
                phone: '+91',
                name: 'Alice',
                lang: 'hi',
                onboardingCompletedAt: DateTime.utc(2026, 1, 1),
              ),
            );
          }
          throw fakeServerError();
        });
        final bloc = _bloc(
          auth: FakeAuthStore(token: 'tok'),
          users: users,
          subs: FakeSubscriptionRepository(snapshot: _sub(pro: false)),
        );

        // First AppStarted: seeds the cache with paywall.
        bloc.add(const AppStarted());
        final first = await _waitForDecision(bloc) as OrchestratorRouteDecided;
        expect(first.target, RouteTarget.paywall);

        // Second SessionRefreshed: /users/me throws → orchestrator falls back
        // to the cached last-known target.
        bloc.add(const SessionRefreshed());
        final second = await bloc.stream.firstWhere(
          (s) => s is OrchestratorRouteDecided &&
              s.reason == RouteReason.cachedFallback,
        ) as OrchestratorRouteDecided;
        expect(second.target, RouteTarget.paywall);
        expect(second.reason, RouteReason.cachedFallback);
        await bloc.close();
      },
    );

    test(
      'Rule 8: network failure without cache → OrchestratorError',
      () async {
        final bloc = _bloc(
          auth: FakeAuthStore(token: 'tok'),
          users: FakeUsersRepository(onGetMe: () async {
            throw fakeServerError();
          }),
          subs: FakeSubscriptionRepository(),
        );
        bloc.add(const AppStarted());
        final result = await _waitForDecision(bloc);
        expect(result, isA<OrchestratorError>());
        await bloc.close();
      },
    );

    test(
      'SubscriptionRefreshed re-evaluates without going through partial paths',
      () async {
        var subCall = 0;
        final subs = FakeSubscriptionRepository(onGetStatus: () async {
          subCall++;
          return subCall == 1 ? _sub(pro: false) : _sub(pro: true);
        });
        final users = FakeUsersRepository(
          result: MeResult(
            user: _user(
              phone: '+91',
              name: 'Alice',
              lang: 'hi',
              onboardingCompletedAt: DateTime.utc(2026, 1, 1),
            ),
          ),
        );
        final bloc = _bloc(
          auth: FakeAuthStore(token: 'tok'),
          users: users,
          subs: subs,
        );

        bloc.add(const AppStarted());
        final first = await _waitForDecision(bloc) as OrchestratorRouteDecided;
        expect(first.target, RouteTarget.paywall);

        bloc.add(const SubscriptionRefreshed());
        final second = await bloc.stream.firstWhere(
          (s) => s is OrchestratorRouteDecided && s.target == RouteTarget.home,
        ) as OrchestratorRouteDecided;
        expect(second.target, RouteTarget.home);
        expect(second.reason, RouteReason.onboardingCompletePro);
        await bloc.close();
      },
    );

    test('OnboardingStepCompleted(phoneVerified) → nameLanguage (fast path)',
        () async {
      final bloc = _bloc(
        auth: FakeAuthStore(token: 'tok'),
        users: FakeUsersRepository(result: const MeResult()),
        subs: FakeSubscriptionRepository(),
      );
      bloc.add(const OnboardingStepCompleted(OnboardingStep.phoneVerified));
      final decided = await _waitForDecision(bloc) as OrchestratorRouteDecided;
      expect(decided.target, RouteTarget.nameLanguage);
      expect(decided.reason, RouteReason.stepAdvance);
      await bloc.close();
    });
  });
}


/// TAM-258/259 — the landing rides the orchestrator's decision.
///
/// What the bloc owns is narrow and worth pinning exactly: carry the server's
/// deep link on the `home` decision, never on a decision the user still has to
/// finish, and report the three analytics dimensions verbatim. Where the link
/// actually navigates is `DeepLinkService.openLanding`'s job, covered in
/// `deep_link_service_test.dart`.
void _landingGroup() {
  group('OnboardingOrchestratorBloc — landing (TAM-259)', () {
    test('a Pro user carries the server landing on the home decision', () async {
      final analytics = RecordingAnalytics();
      final bloc = _bloc(
        auth: FakeAuthStore(token: 'jwt'),
        users: FakeUsersRepository(
          result: MeResult(user: _user(landing: _landing())),
        ),
        subs: FakeSubscriptionRepository(snapshot: _sub(pro: true)),
        analytics: analytics,
      );
      bloc.add(const AppStarted());
      final state = await bloc.stream.firstWhere((s) => s is OrchestratorRouteDecided)
          as OrchestratorRouteDecided;

      expect(state.target, RouteTarget.home);
      expect(state.landing, 'prabhuji://ringtone');

      final props = analytics.propsFor('app_route_decided');
      expect(props['landing_module'], 'ringtone');
      expect(props['landing_source'], 'utm_matched');
      expect(props['utm_code'], 'RTG');
      await bloc.close();
    });

    test('no landing from the server leaves the decision untouched', () async {
      final analytics = RecordingAnalytics();
      final bloc = _bloc(
        auth: FakeAuthStore(token: 'jwt'),
        users: FakeUsersRepository(result: MeResult(user: _user())),
        subs: FakeSubscriptionRepository(snapshot: _sub(pro: true)),
        analytics: analytics,
      );
      bloc.add(const AppStarted());
      final state = await bloc.stream.firstWhere((s) => s is OrchestratorRouteDecided)
          as OrchestratorRouteDecided;

      expect(state.landing, '');
      // A server that predates the rollout must add no empty columns — an
      // always-present blank would be indistinguishable from a real landing
      // whose module the server failed to derive.
      final props = analytics.propsFor('app_route_decided');
      expect(props.containsKey('landing_module'), isFalse);
      expect(props.containsKey('utm_code'), isFalse);
      await bloc.close();
    });

    test('a non-Pro user lands on the paywall, and the landing does NOT ride it',
        () async {
      final bloc = _bloc(
        auth: FakeAuthStore(token: 'jwt'),
        users: FakeUsersRepository(
          result: MeResult(user: _user(landing: _landing())),
        ),
        subs: FakeSubscriptionRepository(snapshot: _sub(pro: false)),
      );
      bloc.add(const AppStarted());
      final state = await bloc.stream.firstWhere((s) => s is OrchestratorRouteDecided)
          as OrchestratorRouteDecided;

      // Handing a landing alongside `paywall` would have the router's
      // post-frame hook navigate away from a screen the user has to finish.
      expect(state.target, RouteTarget.paywall);
      expect(state.landing, '');
      await bloc.close();
    });

    test('dismissing the paywall replays the landing cached at that decision',
        () async {
      final bloc = _bloc(
        auth: FakeAuthStore(token: 'jwt'),
        users: FakeUsersRepository(
          result: MeResult(user: _user(landing: _landing())),
        ),
        subs: FakeSubscriptionRepository(snapshot: _sub(pro: false)),
      );
      bloc.add(const AppStarted());
      await bloc.stream.firstWhere((s) => s is OrchestratorRouteDecided);

      // The hop is deterministic and fetches no `/users/me`, so the landing has
      // to come from the cache the paywall decision filled. This IS the first
      // app open after the paywall for a fresh install — the moment the ad
      // arrival is actually for.
      bloc.add(const OnboardingStepCompleted(OnboardingStep.paywallDismissed));
      final after = await bloc.stream.firstWhere(
        (s) => s is OrchestratorRouteDecided && s.target == RouteTarget.home,
      ) as OrchestratorRouteDecided;

      expect(after.landing, 'prabhuji://ringtone');
      await bloc.close();
    });

    /// THE bug this shipped with. A free user's decision is `paywall`, so the
    /// landing was never carried anywhere the app would act on — and the hop
    /// that was supposed to deliver it, `OnboardingStep.paywallDismissed`, is
    /// dead code (`paywall_close.dart` calls `context.go('/home')` directly).
    /// So most users — the free ones — silently got Home.
    ///
    /// The landing is now owed from the moment the SERVER names it, whatever
    /// target this particular decision carried, and applied when home is
    /// reached.
    test('a NON-PRO user is still owed the landing, though it rides the paywall decision',
        () async {
      final bloc = _bloc(
        auth: FakeAuthStore(token: 'jwt'),
        users: FakeUsersRepository(
          result: MeResult(user: _user(landing: _landing())),
        ),
        subs: FakeSubscriptionRepository(snapshot: _sub(pro: false)),
      );
      bloc.add(const AppStarted());
      final state = await bloc.stream.firstWhere((s) => s is OrchestratorRouteDecided)
          as OrchestratorRouteDecided;

      expect(state.target, RouteTarget.paywall);
      expect(state.landing, '', reason: 'must not navigate off the paywall');
      // …but it is still owed, and that is what reaches the user after close.
      expect(bloc.takePendingLanding(), 'prabhuji://ringtone');
      await bloc.close();
    });

    /// The trigger that applies this fires whenever /home becomes the top of
    /// the stack — the user tapping the Home tab included. Without take-once,
    /// an arm would drag them back to Status every time they pressed Home.
    test('the landing is taken ONCE; pressing Home again does not re-fire it',
        () async {
      final bloc = _bloc(
        auth: FakeAuthStore(token: 'jwt'),
        users: FakeUsersRepository(
          result: MeResult(user: _user(landing: _landing())),
        ),
        subs: FakeSubscriptionRepository(snapshot: _sub(pro: true)),
      );
      bloc.add(const AppStarted());
      await bloc.stream.firstWhere((s) => s is OrchestratorRouteDecided);

      expect(bloc.takePendingLanding(), 'prabhuji://ringtone');
      expect(bloc.takePendingLanding(), '');
      expect(bloc.takePendingLanding(), '');
      await bloc.close();
    });

    test('no landing from the server owes nothing', () async {
      final bloc = _bloc(
        auth: FakeAuthStore(token: 'jwt'),
        users: FakeUsersRepository(result: MeResult(user: _user())),
        subs: FakeSubscriptionRepository(snapshot: _sub(pro: true)),
      );
      bloc.add(const AppStarted());
      await bloc.stream.firstWhere((s) => s is OrchestratorRouteDecided);
      expect(bloc.takePendingLanding(), '');
      await bloc.close();
    });

    test('a cached fallback keeps the deep link but drops the analytics half',
        () async {
      var calls = 0;
      final analytics = RecordingAnalytics();
      final bloc = _bloc(
        auth: FakeAuthStore(token: 'jwt'),
        users: FakeUsersRepository(onGetMe: () async {
          calls++;
          if (calls == 1) return MeResult(user: _user(landing: _landing()));
          throw Exception('network down');
        }),
        subs: FakeSubscriptionRepository(snapshot: _sub(pro: true)),
        analytics: analytics,
      );
      bloc.add(const AppStarted());
      await bloc.stream.firstWhere((s) => s is OrchestratorRouteDecided);

      bloc.add(const SessionRefreshed());
      final fallback = await bloc.stream.firstWhere(
        (s) => s is OrchestratorRouteDecided && s.reason == RouteReason.cachedFallback,
      ) as OrchestratorRouteDecided;

      // The link is still true; the attribution is not. Re-reporting
      // `utm_matched` here would inflate the funnel with opens the server never
      // attributed.
      expect(fallback.landing, 'prabhuji://ringtone');
      final props = analytics.propsFor('app_route_decided');
      expect(props['landing_source'], '');
      await bloc.close();
    });
  });
}
