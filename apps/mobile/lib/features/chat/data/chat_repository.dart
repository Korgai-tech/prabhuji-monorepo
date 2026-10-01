import 'package:dio/dio.dart';

import '../../../api/api_client.dart';
import '../../../api/generated/openapi.dart';

/// Chat data seam (TAM-164). Two methods only in Slice 1:
///
///  * [getHistory] — `GET /chat/history` (open the screen, and paginate
///    older messages via `cursor` + `sessionId`).
///  * [sendMessage] — `POST /chat/messages` (send a user turn, receive the
///    bot's reply plus recommended content grouped by kind).
///
/// Uses the existing [Dio] instance so the auth-header + device-header +
/// locale interceptors ride along automatically. Envelope-unwrap follows
/// the same `{success, message, data}` shape the app uses everywhere
/// (see `users_repository.dart`).
///
/// Every wire-shape (`ChatHistoryResponse`, `SendMessageResponse`,
/// `ChatHistoryResponseData`, `SendMessageResult`, `ChatMessage`, …) is
/// the auto-generated Dart model under `apps/mobile/lib/api/generated/`. We
/// don't hand-roll DTOs — the API is the source of truth.
class ChatRepository {
  ChatRepository(this._dio);

  final Dio _dio;

  /// `GET /chat/history` — open the chat screen (no query params on cold
  /// mount), or paginate the current session's older messages via
  /// [cursor] + [sessionId]. `limit` defaults to the server default (30).
  ///
  /// On a fresh caller who has never sent a message the server returns
  /// `data.sessionId == null` and `data.previousChat == []`. Do NOT rely on
  /// the [ChatScreenConfig] shape from `/users/me` — the one on this
  /// response's `chatConfig` is the SUPERSET (`title`, `subtitle`,
  /// `recommendedMessages`) and is the source of truth for the empty state.
  Future<ChatHistoryResponseData> getHistory({
    String? sessionId,
    String? cursor,
    int? limit,
  }) async {
    final query = <String, dynamic>{
      // Omit any null values so we don't send `?sessionId=null` on cold
      // mount — the schema is `.optional()`, not `.nullable()`.
      if (sessionId != null && sessionId.isNotEmpty) 'sessionId': sessionId,
      if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
      'limit': ?limit,
    };
    final res = await _dio.get<dynamic>(
      '/chat/history',
      queryParameters: query.isEmpty ? null : query,
    );
    final envelope = _envelope(res);
    final data = ChatHistoryResponse.fromJson(envelope);
    if (data == null) {
      throw ApiException('Malformed response');
    }
    return data.data;
  }

  /// `POST /chat/messages` — send a user turn. Omit [sessionId] on the very
  /// first send of a new conversation: the server creates one and returns
  /// its uuid in `data.sessionId`. Echo THAT id on every follow-up in the
  /// same conversation. NEVER send `sessionId: null` — the schema is
  /// `.uuid().optional()` (not nullable), so an explicit null 400s.
  ///
  /// [agentId] MUST be `chatConfig.agentId` from `/users/me` or
  /// `/chat/history` — a mismatch is `400 UNKNOWN_AGENT`. Never a
  /// hard-coded provider id.
  Future<SendMessageResult> sendMessage({
    required String message,
    required String agentId,
    String? sessionId,
  }) async {
    final body = <String, dynamic>{
      'message': message,
      'agentId': agentId,
      // Omit `sessionId` entirely on the first send of a new conversation.
      if (sessionId != null && sessionId.isNotEmpty) 'sessionId': sessionId,
    };
    final res = await _dio.post<dynamic>('/chat/messages', data: body);
    final envelope = _envelope(res);
    final data = SendMessageResponse.fromJson(envelope);
    if (data == null) {
      throw ApiException('Malformed response');
    }
    return data.data;
  }

  /// Unwrap the standard `{success, message, data}` envelope. Mirrors the
  /// pattern in `users_repository.dart` / `api_client.dart`.
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
