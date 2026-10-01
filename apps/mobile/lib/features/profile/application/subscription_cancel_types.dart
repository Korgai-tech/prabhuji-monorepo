/// Placeholder domain types for the TAM-125 subscription-cancellation flow.
///
/// The BE agent lands a Zod schema `CancellationRequestData` in
/// `apps/api/src/core/subscription/routes/subscription-cancel-request.schemas.ts`
/// and regenerates `apps/mobile/lib/api/generated/models/cancellation_request_data.dart`.
/// Field names + shapes here mirror that schema **verbatim** so the swap to
/// the generated model is a mechanical import/rename after the parallel BE
/// PR lands.
///
/// Kept OUT of `apps/mobile/lib/api/generated/**` on purpose — that path is
/// owned by the codegen agent. This file lives under `features/profile/
/// application/` and will be deleted once the generated model exists (see
/// TAM-125 §Handling the "generated types don't exist yet" problem).
library;

/// `CancellationRequestData.status` — mirrors §3's
/// `CancellationRequestStatusEnum`:
///   pending | processing | completed | rejected
///
/// The UI treats an unknown wire value defensively as `pending` at the
/// parser (never in this enum) — same rule the BE service uses.
enum CancellationRequestStatus {
  pending,
  processing,
  completed,
  rejected;

  /// Parse a wire string; unknown values default to `pending`, per the
  /// service's "defensive narrowing" rule (§3, "The service defensively
  /// narrows unknown values before rendering; the app treats an unknown as
  /// `pending`").
  static CancellationRequestStatus fromWire(String? raw) {
    switch (raw) {
      case 'pending':
        return CancellationRequestStatus.pending;
      case 'processing':
        return CancellationRequestStatus.processing;
      case 'completed':
        return CancellationRequestStatus.completed;
      case 'rejected':
        return CancellationRequestStatus.rejected;
      default:
        return CancellationRequestStatus.pending;
    }
  }

  /// Wire value; matches the Zod enum verbatim. Kept alongside `fromWire`
  /// so a round-trip is a no-op.
  String toWire() {
    switch (this) {
      case CancellationRequestStatus.pending:
        return 'pending';
      case CancellationRequestStatus.processing:
        return 'processing';
      case CancellationRequestStatus.completed:
        return 'completed';
      case CancellationRequestStatus.rejected:
        return 'rejected';
    }
  }
}

/// One cancellation-request row, mirroring the §3 Zod
/// `CancellationRequestData`.
///
/// Fields deliberately in the wire shape's exact order + names, so the
/// mechanical swap to the generated model is a search-and-replace.
///
/// Fields on the wire but NOT exposed here (per spec §3 "Deliberately absent
/// from the wire shape"): `subscriptionId`, `notes`, `processedBy`,
/// `createdAt`, `updatedAt`. Adding any of them here would mislead the FE
/// dev that they're consumable — they are internal audit fields.
class CancellationRequestData {
  const CancellationRequestData({
    required this.id,
    required this.status,
    required this.reason,
    required this.requestedAt,
    required this.processedAt,
  });

  /// `subscription_cancellation_requests.id` — UUID.
  final String id;

  /// Current status. Drives the pill-mapping table in §2.5.
  final CancellationRequestStatus status;

  /// User-supplied reason. Optional on the wire (v1 UI never surfaces a
  /// "why?" step, but the column exists so a future step can write to it).
  final String? reason;

  /// When the row was inserted. Server clock.
  final DateTime requestedAt;

  /// Populated only after ops fulfills or rejects. `null` while `pending`.
  final DateTime? processedAt;
}
