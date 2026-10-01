import 'package:dio/dio.dart';

import '../domain/content_type.dart';
import '../domain/download_manifest.dart';

/// Data seam for the downloads manifest endpoint (TAM-125). Kept as a pure
/// abstract interface so a `FakeDownloadsRepository` runs every widget/bloc
/// test offline without a live API.
///
/// **Wire contract** — `GET /content/:type/:id/download` → envelope
/// `{ success, message, data: DownloadManifest }`. See the spec's Backend
/// endpoint contract for status-code semantics (200/400/401/403/404/500).
abstract interface class DownloadsRepository {
  /// Fetches a signed URL + integrity metadata for the given content id.
  ///
  /// Throws [DownloadsRepositoryPaywallException] on 403 (free / lapsed
  /// caller — client should re-open `PaywallGate` with the lapsed-play
  /// trigger); [DownloadsRepositoryNotFoundException] on 404; a bare
  /// `Exception` on other failures (mapped to `failure_reason: server_error`
  /// by the caller).
  Future<DownloadManifest> fetchManifest({
    required DownloadContentType type,
    required String contentId,
  });
}

class DownloadsRepositoryPaywallException implements Exception {
  const DownloadsRepositoryPaywallException(this.message);
  final String message;
  @override
  String toString() => 'DownloadsRepositoryPaywallException($message)';
}

class DownloadsRepositoryNotFoundException implements Exception {
  const DownloadsRepositoryNotFoundException(this.message);
  final String message;
  @override
  String toString() => 'DownloadsRepositoryNotFoundException($message)';
}

/// Production Dio-backed impl. Uses the app-wide dio (auth-header +
/// locale interceptor; GET auto-adds `locale`), not a hand-written client.
class DioDownloadsRepository implements DownloadsRepository {
  DioDownloadsRepository(this._dio);
  final Dio _dio;

  @override
  Future<DownloadManifest> fetchManifest({
    required DownloadContentType type,
    required String contentId,
  }) async {
    try {
      final res = await _dio.get<dynamic>(
        '/content/${type.wire}/$contentId/download',
      );
      final body = res.data;
      if (body is! Map) {
        throw Exception('Malformed downloads envelope');
      }
      final data = body['data'];
      if (data is! Map) {
        throw Exception('Missing downloads.data');
      }
      return DownloadManifest.fromJson(data.cast<String, dynamic>());
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 403) {
        throw const DownloadsRepositoryPaywallException(
          'Downloads are a Pro benefit',
        );
      }
      if (status == 404) {
        throw const DownloadsRepositoryNotFoundException('Content not found');
      }
      rethrow;
    }
  }
}
