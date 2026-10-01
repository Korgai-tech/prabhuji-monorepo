import 'package:equatable/equatable.dart';

import '../../data/status_models.dart';
import '../../status_analytics.dart';

sealed class StatusProfileEvent extends Equatable {
  const StatusProfileEvent();

  @override
  List<Object?> get props => const [];
}

/// Load the saved profile. After TAM-168 the mobile app only ever presents
/// the personal face — [initialType] is retained on the event for legacy
/// callers, but the bloc always resolves the active type to
/// [StatusProfileType.personal] regardless (grandfathered
/// `activeProfileType='business'` rows read as personal without a server
/// rewrite; see the TAM-168 spec's #PATH_DECISION).
///
/// [entrySource] tags which surface pushed the editor so
/// `status_personal_details_page_viewed` attributes the funnel entry
/// (`add_details_strip` from the overlay strip tap, `edit_details_button`
/// from the top-right pill). Defaults to `edit_details_button` — safer than
/// a `null` metric bucket.
class StatusProfileLoadRequested extends StatusProfileEvent {
  const StatusProfileLoadRequested(
    this.initialType, {
    this.entrySource = StatusEntrySources.editDetailsButton,
  });

  final StatusProfileType initialType;
  final String entrySource;

  @override
  List<Object?> get props => [initialType, entrySource];
}

/// A field was edited — revalidates live so the inline error clears as the user
/// fixes it. After TAM-168 only [personalName] is meaningful (Business tab is
/// removed); the other fields remain on the API for legacy call sites and are
/// ignored by the bloc.
class StatusProfileFieldChanged extends StatusProfileEvent {
  const StatusProfileFieldChanged({
    this.personalName,
    this.businessName,
    this.businessDetails,
    this.businessMobile,
  });

  final String? personalName;
  final String? businessName;
  final String? businessDetails;
  final String? businessMobile;

  @override
  List<Object?> get props =>
      [personalName, businessName, businessDetails, businessMobile];
}

/// Avatar tapped — runs the `StatusAvatarPicker` seam.
class StatusProfileAvatarRequested extends StatusProfileEvent {
  const StatusProfileAvatarRequested();
}

/// Save tapped — validates the ACTIVE face, then `PUT /status/profile`.
class StatusProfileSaveRequested extends StatusProfileEvent {
  const StatusProfileSaveRequested();
}

/// Dismiss a transient message.
class StatusProfileMessageCleared extends StatusProfileEvent {
  const StatusProfileMessageCleared();
}
