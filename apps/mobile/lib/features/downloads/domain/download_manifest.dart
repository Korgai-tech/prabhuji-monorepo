import 'package:meta/meta.dart';

/// TAM-125 temporary hand-typed model mirroring the backend Zod schema in
/// `apps/api/src/core/downloads/routes/downloads.schemas.ts` (spec §Backend
/// endpoint contract, Registered as `DownloadManifest` OpenAPI component).
///
/// Swap for the generated `DownloadManifest` under
/// `apps/mobile/lib/api/generated/…` after the backend module lands and
/// `pnpm nx run mobile:generate` (JDK 17) has run. **Do not** hand-edit the
/// generated model — this one exists purely to unblock frontend work while
/// the API side is in flight.
///
/// The wire shape:
///
/// ```json
/// {
///   "signedUrl": "https://<bucket>/<key>?X-Amz-…",
///   "sizeBytes": 6291456,
///   "durationMs": 352000,
///   "checksum": "3f2a…",
///   "expiresAt": "2026-08-13T09:00:00.000Z"
/// }
/// ```
@immutable
class DownloadManifest {
  const DownloadManifest({
    required this.signedUrl,
    required this.sizeBytes,
    required this.expiresAt,
    this.durationMs,
    this.checksum,
  });

  /// Short-TTL (5 min per `PRESIGN_TTL_SECONDS`) presigned GET URL. The
  /// download loop uses a fresh `Dio` instance to fetch this so it doesn't
  /// ride the auth interceptor (bearer-in-URL, not header).
  final String signedUrl;

  /// Ciphertext-side sizing NOT applied — this is the plaintext content-
  /// length reported by the S3 head. Used for row subtitle + `file_size_bytes`
  /// event property.
  final int sizeBytes;

  /// Total media duration in milliseconds. Nullable until the backfill
  /// script populates every AudioItem/MantraAudioItem row (spec §Database
  /// Tasks §4 — the mobile client falls back to just_audio's own local
  /// probe if this arrives null).
  final int? durationMs;

  /// SHA-256 hex (64 chars lowercase). Verified after write; a mismatch
  /// surfaces as `failure_reason: server_error` with a retry.
  final String? checksum;

  /// ISO-8601 UTC deadline. Once the signed URL expires the caller must
  /// re-fetch the manifest.
  final DateTime expiresAt;

  factory DownloadManifest.fromJson(Map<String, dynamic> json) {
    final rawExpires = json['expiresAt'];
    final expiresAt = rawExpires is String
        ? DateTime.tryParse(rawExpires)?.toUtc() ?? DateTime.now().toUtc()
        : DateTime.now().toUtc();
    final rawSize = json['sizeBytes'];
    final rawDuration = json['durationMs'];
    return DownloadManifest(
      signedUrl: (json['signedUrl'] ?? '').toString(),
      sizeBytes: rawSize is num ? rawSize.toInt() : 0,
      durationMs: rawDuration is num ? rawDuration.toInt() : null,
      checksum: json['checksum']?.toString(),
      expiresAt: expiresAt,
    );
  }

  Map<String, Object?> toJson() => <String, Object?>{
        'signedUrl': signedUrl,
        'sizeBytes': sizeBytes,
        'durationMs': durationMs,
        'checksum': checksum,
        'expiresAt': expiresAt.toIso8601String(),
      };
}
