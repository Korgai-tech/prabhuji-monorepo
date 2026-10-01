import 'package:equatable/equatable.dart';

import '../../data/status_models.dart';

enum StatusProfileStatus { initial, loading, ready, saving, saved, failure }

/// State for the personal details form.
///
/// TAM-168 retired the Business persona from the mobile app: `activeType` is
/// always [StatusProfileType.personal], and only `personalName` +
/// `avatarImageUrl` are meaningful. The business fields remain on the state
/// class for wire back-compat (a legacy caller may still hand them through
/// [copyWith]) but are never rendered, validated, or saved.
///
/// The draft fields live HERE (not only in the TextEditingControllers) so a
/// failed save keeps everything the user typed (PRD §7 "keep entered data on
/// save failure").
class StatusProfileState extends Equatable {
  const StatusProfileState({
    this.status = StatusProfileStatus.initial,
    this.activeType = StatusProfileType.personal,
    this.personalName = '',
    this.businessName = '',
    this.businessDetails = '',
    this.businessMobile = '',
    this.avatarImageUrl,
    this.showErrors = false,
    this.message,
  });

  final StatusProfileStatus status;

  /// TAM-168 — the bloc always forces this to [StatusProfileType.personal];
  /// retained on the state for equality symmetry with pre-TAM-168 callers.
  final StatusProfileType activeType;
  final String personalName;

  /// TAM-168 — no longer rendered/edited/saved. Kept only so a legacy
  /// [copyWith] compiles.
  final String businessName;
  final String businessDetails;
  final String businessMobile;
  final String? avatarImageUrl;

  /// Errors surface only after the first Save attempt, then live-update — so a
  /// pristine form isn't shouting at the user.
  final bool showErrors;

  final String? message;

  bool get isSaving => status == StatusProfileStatus.saving;

  /// TAM-168 — matches [StatusProfileData.hasNameOrPhoto]. Drives the details
  /// screen title (`अपना नाम और फोटो डालें` vs `बदलें`).
  bool get hasNameOrPhoto =>
      personalName.trim().isNotEmpty ||
      (avatarImageUrl ?? '').trim().isNotEmpty;

  // ---- Validation, mirroring the TAM-71 Zod limits (q6) --------------------

  String? get personalNameError => validatePersonalName(personalName);

  /// Only the personal form is validated after TAM-168.
  bool get isActiveValid => personalNameError == null;

  /// Personal name error surfaces post–Save-attempt only.
  String? get visiblePersonalNameError =>
      showErrors ? personalNameError : null;

  /// The payload a save sends. TAM-168 — always personal; business fields go
  /// out as `null` so a legacy row is never rewritten by a personal save.
  StatusProfileData toProfile() => StatusProfileData(
        activeProfileType: StatusProfileType.personal,
        personalDisplayName: personalName.trim(),
        avatarImageUrl: avatarImageUrl,
      );

  static StatusProfileState fromProfile(
    StatusProfileData p, {
    StatusProfileType activeType = StatusProfileType.personal,
    StatusProfileStatus status = StatusProfileStatus.ready,
  }) =>
      StatusProfileState(
        status: status,
        // TAM-168 — always personal, ignore what the server says (the API
        // still stores whatever a pre-TAM-168 build wrote there).
        activeType: StatusProfileType.personal,
        personalName: p.personalDisplayName ?? '',
        businessName: p.businessName ?? '',
        businessDetails: p.businessDetails ?? '',
        businessMobile: p.businessMobileNumber ?? '',
        avatarImageUrl: p.avatarImageUrl,
      );

  StatusProfileState copyWith({
    StatusProfileStatus? status,
    StatusProfileType? activeType,
    String? personalName,
    String? businessName,
    String? businessDetails,
    String? businessMobile,
    String? avatarImageUrl,
    bool? showErrors,
    String? message,
    bool clearMessage = false,
  }) =>
      StatusProfileState(
        status: status ?? this.status,
        activeType: activeType ?? this.activeType,
        personalName: personalName ?? this.personalName,
        businessName: businessName ?? this.businessName,
        businessDetails: businessDetails ?? this.businessDetails,
        businessMobile: businessMobile ?? this.businessMobile,
        avatarImageUrl: avatarImageUrl ?? this.avatarImageUrl,
        showErrors: showErrors ?? this.showErrors,
        message: clearMessage ? null : (message ?? this.message),
      );

  @override
  List<Object?> get props => [
        status,
        activeType,
        personalName,
        businessName,
        businessDetails,
        businessMobile,
        avatarImageUrl,
        showErrors,
        message,
      ];
}
