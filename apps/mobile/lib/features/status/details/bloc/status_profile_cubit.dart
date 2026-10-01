import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../data/status_models.dart';
import '../../data/status_repository.dart';

/// App-scoped read source for [StatusProfileData].
///
/// Distinct from [StatusProfileBloc] (which drives the edit form). This cubit
/// is the shared view of the user's persisted overlay profile, subscribed by
/// surfaces OUTSIDE the details editor — currently the Home feed's status
/// cards (for the overlay band + Share gate). Kept intentionally small: fetch
/// once on first [load], refresh on demand, expose the resolved profile.
///
/// Hoisted at the app-shell layer (`main.dart`'s outer `MultiBlocProvider`)
/// so every surface reads from one instance, and refreshes triggered from
/// [StatusDetailsScreen] on save propagate everywhere.
class StatusProfileCubit extends Cubit<StatusProfileCubitState> {
  StatusProfileCubit({required StatusRepository repository})
      : this._(repository);

  StatusProfileCubit._(this._repository)
      : super(const StatusProfileCubitState());

  final StatusRepository _repository;
  Future<void>? _inFlight;

  /// Fetch the profile if we haven't yet — idempotent. Concurrent callers
  /// coalesce onto the same in-flight future, so mounting Home + the Status
  /// tab together fires only ONE `GET /status/profile`.
  Future<void> load() {
    if (state.status == StatusProfileCubitStatus.ready) {
      return Future<void>.value();
    }
    return _fetch();
  }

  /// Force a re-fetch (e.g. after the user saves in [StatusDetailsScreen]).
  /// Bypasses the `ready`-short-circuit in [load].
  Future<void> refresh() => _fetch();

  Future<void> _fetch() {
    final existing = _inFlight;
    if (existing != null) return existing;
    final future = _run();
    _inFlight = future;
    return future.whenComplete(() => _inFlight = null);
  }

  Future<void> _run() async {
    emit(state.copyWith(status: StatusProfileCubitStatus.loading));
    try {
      final profile = await _repository.fetchProfile();
      emit(StatusProfileCubitState(
        status: StatusProfileCubitStatus.ready,
        profile: profile,
      ));
    } catch (_) {
      // Best-effort: surfaces that need the profile can still render a
      // placeholder ("add your details"). A share gate treats null profile as
      // empty → prompts the details editor.
      emit(state.copyWith(status: StatusProfileCubitStatus.failure));
    }
  }
}

enum StatusProfileCubitStatus { initial, loading, ready, failure }

class StatusProfileCubitState extends Equatable {
  const StatusProfileCubitState({
    this.status = StatusProfileCubitStatus.initial,
    this.profile,
  });

  final StatusProfileCubitStatus status;
  final StatusProfileData? profile;

  StatusProfileCubitState copyWith({
    StatusProfileCubitStatus? status,
    StatusProfileData? profile,
  }) =>
      StatusProfileCubitState(
        status: status ?? this.status,
        profile: profile ?? this.profile,
      );

  @override
  List<Object?> get props => [status, profile];
}
