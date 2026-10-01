import 'package:dio/dio.dart';

import 'generated/openapi.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.errorCode, this.statusCode});
  final String message;

  /// The envelope's `errorCode` when the failure came back inside a well-shaped
  /// `{success:false, message, errorCode}` body (e.g. OTP_INVALID,
  /// OTP_SESSION_EXHAUSTED, OTP_RATE_LIMITED). Null for transport errors and
  /// for pre-envelope malformed responses.
  final String? errorCode;

  /// HTTP status code when known (dio bad-response path). Null for transport
  /// errors and non-HTTP failures.
  final int? statusCode;

  @override
  String toString() =>
      'ApiException: $message${errorCode != null ? ' [$errorCode]' : ''}';
}

class ApiClient {
  ApiClient(this._dio);
  final Dio _dio;

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

  static List<PublicUser> parseUsers(Map<String, dynamic> json) {
    // `_envelope` already validates `success` before `listUsers` calls this,
    // so re-checking it here would be redundant. Parse the payload directly.
    final data = json['data'];
    if (data is! List<dynamic>) {
      throw ApiException('Malformed response');
    }
    return data.map((e) {
      final user = PublicUser.fromJson(e);
      if (user == null) {
        throw ApiException('Malformed user in response');
      }
      return user;
    }).toList();
  }

  Future<String> login(String email, String password) async {
    final res = await _dio.post<dynamic>(
      '/auth/login',
      data: {'email': email, 'password': password},
    );
    final body = _envelope(res);
    final data = body['data'];
    if (data is! Map<String, dynamic>) {
      throw ApiException('Malformed response');
    }
    final token = data['token'];
    if (token is! String) {
      throw ApiException('Malformed response');
    }
    return token;
  }

  Future<void> register(String email, String name, String password) async {
    final res = await _dio.post<dynamic>(
      '/auth/register',
      data: {'email': email, 'name': name, 'password': password},
    );
    _envelope(res);
  }

  Future<List<PublicUser>> listUsers() async {
    final res = await _dio.get<dynamic>('/auth/users');
    return parseUsers(_envelope(res));
  }
}
