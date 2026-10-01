// Named ctor params kept explicit (public API) — see the equivalent note on
// OnboardingOrchestratorBloc.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../data/status_avatar_picker.dart';
import '../../data/status_models.dart';
import '../../data/status_repository.dart';
import '../../status_analytics.dart';
import 'status_profile_event.dart';
import 'status_profile_state.dart';

/// Drives the personal details form (TAM-72 §6.5, updated by TAM-168 which
/// retired the Business persona from the mobile UI).
///
/// Everything here is FREE — editing and saving the overlay profile never
/// gates (PRD §5); only Share does, and after TAM-168 the details editor is
/// no longer a prerequisite for opening the share sheet. Client-side
/// validation MIRRORS the TAM-71 Zod limit (personal name ≤ 40) for immediate
/// inline feedback; the server remains the source of truth.
///
/// TAM-168 #PATH_DECISION: a grandfathered profile whose server-side
/// `activeProfileType` is `'business'` is READ as personal here — the mobile
/// app narrows what it presents but never rewrites the server row.
class StatusProfileBloc extends Bloc<StatusProfileEvent, StatusProfileState> {
  StatusProfileBloc({
    required StatusRepository repository,
    required StatusAvatarPicker avatarPicker,
    Analytics? analytics,
  })  : _repository = repository,
        _avatarPicker = avatarPicker,
        _analytics = analytics,
        super(const StatusProfileState()) {
    on<StatusProfileLoadRequested>(_onLoad);
    on<StatusProfileFieldChanged>(_onFieldChanged);
    on<StatusProfileAvatarRequested>(_onAvatarRequested);
    on<StatusProfileSaveRequested>(_onSave);
    on<StatusProfileMessageCleared>(
      (_, emit) => emit(state.copyWith(clearMessage: true)),
    );
  }

  final StatusRepository _repository;
  final StatusAvatarPicker _avatarPicker;
  final Analytics? _analytics;

  /// Whether we've already fired `status_personal_name_added` this lifetime.
  /// The event marks the FIRST empty→non-empty transition (Sheet row 97:
  /// "A non-empty personal name is entered.") — a subsequent edit that empties
  /// and refills should not re-fire it, otherwise the funnel double-counts.
  bool _personalNameAddedFired = false;

  Future<void> _onLoad(
    StatusProfileLoadRequested event,
    Emitter<StatusProfileState> emit,
  ) async {
    emit(state.copyWith(status: StatusProfileStatus.loading));
    try {
      final profile = await _repository.fetchProfile();
      // TAM-168 — always personal, no matter what the server says. Reads of
      // `activeProfileType` are dead below.
      emit(StatusProfileState.fromProfile(
        profile,
        activeType: StatusProfileType.personal,
      ));
      _emitPageViewed(profile, entrySource: event.entrySource);
      // Reset the "first name added" flag now that we know the truth from
      // the server — if the loaded profile already has a name, the FIRST
      // edit event should NOT be treated as a new completion.
      _personalNameAddedFired =
          (profile.personalDisplayName ?? '').trim().isNotEmpty;
    } catch (_) {
      emit(state.copyWith(
        status: StatusProfileStatus.failure,
        activeType: StatusProfileType.personal,
        message: 'Could not load your details. Please try again.',
      ));
      // Even on load failure the editor is visible — fire the page-view
      // (analytics MUST reflect the mount, not the network outcome).
      _emitPageViewed(null, entrySource: event.entrySource);
    }
  }

  /// Sheet 1 row 95 — one `status_personal_details_page_viewed` per editor
  /// mount. TAM-168 adds `entry_source` so the funnel can separate the
  /// empty-state strip tap from the Edit Details pill.
  ///
  /// This used to also carry `existing_details_present`, which was computed
  /// from `personalDisplayName` ALONE — so a user with only a photo saved was
  /// reported as having no existing details, which is wrong and became more
  /// wrong after TAM-168 made photo-only a normal state. The global
  /// `has_name` / `has_photo` pair replaces it and reports both halves
  /// correctly, so the property was removed rather than fixed in place.
  void _emitPageViewed(StatusProfileData? profile, {required String entrySource}) {
    unawaited(_analytics?.trackEvent(
      StatusEvents.personalDetailsPageViewed,
      properties: {
        StatusEventProps.entrySource: entrySource,
      },
    ));
  }

  void _onFieldChanged(
    StatusProfileFieldChanged event,
    Emitter<StatusProfileState> emit,
  ) {
    final prevPersonal = state.personalName;

    // TAM-168 — the Business tab is gone; business fields on the event are
    // ignored so a stale caller can't silently mutate them into state.
    emit(state.copyWith(
      personalName: event.personalName,
      status: StatusProfileStatus.ready,
      clearMessage: true,
    ));

    // Sheet 1 row 97 — `status_personal_name_added`. Fires once on the
    // empty→non-empty transition. The bucket lets us learn "long vs short
    // names" without ever shipping the raw string (PII rule).
    //
    // `name_present: true` was dropped: it was a constant on an event whose
    // whole meaning is "a name just appeared", and the global `has_name`
    // now reports the persisted truth. Note the two legitimately disagree
    // on THIS event — the name is typed but not yet saved, so `has_name`
    // still reads the pre-edit value until the save lands. That is the
    // correct reading of a store that mirrors the server.
    if (!_personalNameAddedFired &&
        prevPersonal.trim().isEmpty &&
        state.personalName.trim().isNotEmpty) {
      _personalNameAddedFired = true;
      unawaited(_analytics?.trackEvent(
        StatusEvents.personalNameAdded,
        properties: {
          StatusEventProps.nameLengthBucket:
              statusNameLengthBucket(state.personalName.trim().length),
        },
      ));
    }
  }

  Future<void> _onAvatarRequested(
    StatusProfileAvatarRequested event,
    Emitter<StatusProfileState> emit,
  ) async {
    final result = await _avatarPicker.pickAvatar();
    // Sheet 1 row 96 — `status_profile_image_result`. `result` maps the
    // picker's status to the sheet's canonical wire values:
    //   picked      → success
    //   cancelled   → cancelled
    //   failed      → failure (error_code = picker's specific slug,
    //                          e.g. `s3_rejected_403`, `s3_offline`)
    //   unavailable → failure (error_code = `picker_unavailable` — the stub)
    switch (result.status) {
      case StatusAvatarPickStatus.picked:
        unawaited(_analytics?.trackEvent(
          StatusEvents.profileImageResult,
          properties: {
            StatusEventProps.result: 'success',
            StatusEventProps.fileSizeBucket: 'unknown',
            StatusEventProps.errorCode: null,
          },
        ));
        emit(state.copyWith(avatarImageUrl: result.imageUrl));
      case StatusAvatarPickStatus.cancelled:
        unawaited(_analytics?.trackEvent(
          StatusEvents.profileImageResult,
          properties: {
            StatusEventProps.result: 'cancelled',
            StatusEventProps.fileSizeBucket: null,
            StatusEventProps.errorCode: null,
          },
        ));
      case StatusAvatarPickStatus.failed:
        unawaited(_analytics?.trackEvent(
          StatusEvents.profileImageResult,
          properties: {
            StatusEventProps.result: 'failure',
            StatusEventProps.fileSizeBucket: null,
            StatusEventProps.errorCode: result.errorCode,
          },
        ));
        emit(state.copyWith(message: kAvatarUploadUnavailableCopy));
      case StatusAvatarPickStatus.unavailable:
        unawaited(_analytics?.trackEvent(
          StatusEvents.profileImageResult,
          properties: {
            StatusEventProps.result: 'failure',
            StatusEventProps.fileSizeBucket: null,
            StatusEventProps.errorCode: 'picker_unavailable',
          },
        ));
        emit(state.copyWith(message: kAvatarUploadUnavailableCopy));
    }
  }

  Future<void> _onSave(
    StatusProfileSaveRequested event,
    Emitter<StatusProfileState> emit,
  ) async {
    if (state.isSaving) return;

    if (!state.isActiveValid) {
      // Surface the inline errors; block the round-trip (§6.6).
      emit(state.copyWith(showErrors: true, status: StatusProfileStatus.ready));
      return;
    }

    emit(state.copyWith(
      status: StatusProfileStatus.saving,
      showErrors: true,
      clearMessage: true,
    ));
    try {
      // TAM-168 — always a personal save. Business fields are never sent
      // (see `StatusProfileState.toProfile`).
      final saved = await _repository.saveProfile(state.toProfile());
      // Sheet 1 row 98 — `status_personal_details_save_result`.
      _emitPersonalSaveResult(result: 'success', errorCode: null);
      emit(StatusProfileState.fromProfile(
        saved,
        activeType: StatusProfileType.personal,
        status: StatusProfileStatus.saved,
      ));
    } catch (_) {
      _emitPersonalSaveResult(result: 'failure', errorCode: 'save_threw');
      // KEEP everything typed (§7) — only the status/message change.
      emit(state.copyWith(
        status: StatusProfileStatus.failure,
        message: 'Could not save your details. Please try again.',
      ));
    }
  }

  /// Sheet 1 row 98 — `status_personal_details_save_result`.
  ///
  /// `name_present` / `avatar_present` were removed: the global `has_name` /
  /// `has_photo` pair reports the same two facts on this event, and on the
  /// SUCCESS path they are strictly better sourced — the repository mirrors
  /// the server's echo of the saved record into the store before this fires,
  /// so the globals reflect what actually persisted rather than what the
  /// client believed it sent.
  void _emitPersonalSaveResult({
    required String result,
    required String? errorCode,
  }) {
    unawaited(_analytics?.trackEvent(
      StatusEvents.personalDetailsSaveResult,
      properties: {
        StatusEventProps.result: result,
        StatusEventProps.errorCode: errorCode,
      },
    ));
  }
}
