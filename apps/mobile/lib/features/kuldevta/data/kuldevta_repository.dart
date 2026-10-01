import 'package:dio/dio.dart';

import '../../../api/api_client.dart';
import '../../../api/generated/openapi.dart';
import '../domain/kuldevta_answers.dart';
import '../domain/kuldevta_result.dart';

/// Kuldevta data seam (TAM-166). One method: [identify].
///
/// Uses the existing [Dio] instance so the auth-header + device-header +
/// locale interceptors ride along automatically. Envelope-unwrap follows
/// the same `{success, message, data}` shape the app uses everywhere
/// (see `users_repository.dart` and `chat_repository.dart`).
///
/// The wire request body is fixed at six string keys — verified against
/// `apps/api/src/core/kuldevta/routes/kuldevta.schemas.ts:15-25`. Empty
/// answers are the server-blessed way to say "I don't know" ("Pata Nahi"
/// sends `""`), so the client sends `""` — NEVER `null` or omitted keys.
class KuldevtaRepository {
  KuldevtaRepository(this._dio);

  final Dio _dio;

  /// `POST /kuldevta/identify` — fire the six-question submission and
  /// unwrap the deity result.
  ///
  /// [cancelToken] is threaded so the loading screen's back arrow can
  /// abort a slow response (per §Acceptance Criteria › Loading screen —
  /// "cancel + return to Q6 with answers preserved").
  Future<KuldevtaResult> identify(
    KuldevtaAnswers answers, {
    CancelToken? cancelToken,
  }) async {
    // Hand-built body so the six keys always ship — the generated
    // `KuldevtaIdentifyPostRequest.toJson()` would do the same, but
    // wiring by hand keeps the six locked field names visible next to
    // the domain model and makes the "no null values, no omitted keys"
    // rule impossible to accidentally violate.
    final body = <String, dynamic>{
      'surname': answers.surname,
      'ancestralPlace': answers.ancestralPlace,
      'community': answers.community,
      'gotra': answers.gotra,
      'templeMentioned': answers.templeMentioned,
      'mandirPhoto': answers.mandirPhoto,
    };
    final res = await _dio.post<dynamic>(
      '/kuldevta/identify',
      data: body,
      cancelToken: cancelToken,
    );
    final envelope = _envelope(res);
    final data = KuldevtaIdentifyResponse.fromJson(envelope);
    if (data == null) {
      throw ApiException('Malformed response');
    }
    return KuldevtaResult.fromDto(data.data);
  }

  /// Unwrap the standard `{success, message, data}` envelope. Mirrors the
  /// pattern in `users_repository.dart` / `chat_repository.dart`.
  static Map<String, dynamic> _envelope(Response<dynamic> res) {
    final body = res.data;
    if (body is! Map<String, dynamic>) {
      throw ApiException('Malformed response');
    }
    if (body['success'] != true) {
      throw ApiException(body['message']?.toString() ?? 'Request failed');
    }
    return body;
  }
}
