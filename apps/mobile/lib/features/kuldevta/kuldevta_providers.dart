import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
// `StateProvider` moved to `legacy.dart` in Riverpod 3 — same class, kept
// available under this import for the small-atomic-value cases that don't
// warrant a full `Notifier`. Matches
// `subscription_cancel_providers.dart:6`.
import 'package:flutter_riverpod/legacy.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/entitlement.dart';
import '../../core/service_locator.dart';
import '../../state/providers.dart';
import 'application/kuldevta_bloc.dart';
import 'data/kuldevta_counters.dart';
import 'data/kuldevta_repository.dart';
import 'domain/kuldevta_result.dart';

/// The Kuldevta data seam (TAM-166). Backed by the shared auth-injecting
/// [Dio] singleton registered in `configureLocator` — the same wire the
/// chat repository uses, so no separate get_it seat and no manual header
/// wiring.
///
/// Overridable in tests with a fake repository.
final kuldevtaRepositoryProvider = Provider<KuldevtaRepository>(
  (ref) => KuldevtaRepository(serviceLocator<Dio>()),
);

/// SharedPreferences-backed counters for the analytics schema
/// (TAM-166) — `open_count` on `intro_viewed` / `khoj_started`, and
/// `is_repeat_share` on `result_shared`. Reads the app-wide
/// [SharedPreferences] out of the service locator.
final kuldevtaCountersProvider = Provider<KuldevtaCounters>(
  (ref) => KuldevtaCounters(serviceLocator<SharedPreferences>()),
);

/// The KuldevtaBloc for the currently-mounted discovery flow (TAM-166).
///
/// Sub-routes are separate `go_router` pages, so a plain `BlocProvider`
/// on one route's builder won't be visible in another route's builder.
/// A Riverpod-owned bloc solves the sharing problem — created once per
/// discovery flow, disposed when the last screen unmounts (`keepAlive:
/// false` by default). All four screens read it via `BlocProvider.value`
/// so their `context.read<KuldevtaBloc>()` calls resolve to the same
/// instance.
///
/// The bloc is torn down when no screen is watching — that is the
/// desired reset for tapping the Chat tab a second time (post-handoff):
/// a fresh flow starts with `KuldevtaEntry`.
final kuldevtaBlocProvider = Provider.autoDispose<KuldevtaBloc>((ref) {
  final bloc = KuldevtaBloc(
    repository: ref.watch(kuldevtaRepositoryProvider),
    analytics: ref.watch(analyticsProvider),
    counters: ref.watch(kuldevtaCountersProvider),
    // Read the current entitlement state on demand rather than stashing a
    // boolean at construction time — a Pro purchase mid-discovery must be
    // reflected in the `user_subscription_status` prop of the events that
    // fire AFTER the purchase.
    isPro: () => ref.read(entitlementProvider),
    refetchMe: () async {
      // Fire-and-forget refetch — the router already has meProvider
      // wired to `AuthStore.changes`; this pushes a manual invalidation
      // so `chatConfig.kuldevtaAssigned` flips to `true` for the next
      // Chat-tab tap.
      ref.invalidate(meProvider);
    },
  );
  ref.onDispose(bloc.close);
  return bloc;
});

/// Fresh-handoff persona identity for the chat screen's `_AppBar`
/// (TAM-166, spec §Critical Handoff Notes › #PATH_DECISION on
/// persona-header identity).
///
/// The result screen writes the deity's `nameRoman` / `gender` /
/// `imageUrl` here just before popping the discovery route stack and
/// pushing the chat surface. The chat screen reads it on mount to render
/// the persona-header variant.
///
/// The value is cleared on next read AND on shell teardown so the
/// "assigned-path cold launch" branch (a returning user whose session
/// starts fresh at the chat tab) does NOT see stale identity — that path
/// is deliberately the generic header per the locked shipping behavior.
///
/// Explicitly NOT persisted — this is in-memory only. `/users/me` at
/// next login is the source of truth for whether the user is assigned
/// (see `feedback_users_me_source_of_truth.md`).
///
/// The `ref.watch(authIdentityProvider)` is what makes "in-memory only"
/// true across a logout: the provider is keepAlive and logout merely
/// navigates to `/phone-input` (the `ProviderScope` survives), so a raw
/// `StateProvider` kept A's deity in memory and rendered A's persona
/// header for the next qualified user on the same device. Watching
/// identity disposes and rebuilds this provider on every user change,
/// which resets it to the `null` initial value.
final kuldevtaChatHandoffProvider = StateProvider<KuldevtaResult?>((ref) {
  ref.watch(authIdentityProvider);
  return null;
});
