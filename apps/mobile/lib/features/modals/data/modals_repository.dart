import 'dart:io';

import 'package:dio/dio.dart';

import '../../../api/generated/openapi.dart';
import 'modal_models.dart';

/// TAM-174 — wire vocabulary for `POST /modals/impressions`'s `action` field.
/// Kept separate from `ModalEvents`/`ModalEventProps` (modals_analytics.dart,
/// the CLIENT analytics contract) — this is the impression endpoint's OWN
/// vocabulary; the two happen to share the same three moments but are not
/// the same concern.
class ModalImpressionAction {
  ModalImpressionAction._();
  static const String viewed = 'viewed';
  static const String ctaClicked = 'cta_clicked';
  static const String dismissed = 'dismissed';
}

/// Why a modals call failed — the client branches on this, never a message.
enum ModalsErrorKind {
  /// No connectivity.
  offline,

  /// 401 — the caller has no/expired session. Kept distinct from [unknown]
  /// even though every call site (`ModalHost`) swallows it identically today
  /// — "every failure is swallowed" is a call-site policy, not a reason to
  /// collapse the wire vocabulary.
  unauthorized,

  /// 5xx / malformed / anything else.
  unknown,
}

/// Typed failure from the modals endpoints.
class ModalsException implements Exception {
  const ModalsException(this.kind, [this.message]);
  final ModalsErrorKind kind;
  final String? message;

  @override
  String toString() => 'ModalsException($kind, $message)';
}

/// Data seam for the generalized modal module (TAM-174). Mirrors
/// `lib/features/horoscope/data/horoscope_repository.dart`'s shape (typed
/// `ErrorKind` enum, an `Exception` class, an `abstract interface class`, a
/// `Dio*` impl); the deterministic `FakeModalsRepository` (test support)
/// lives at `test/support/fake_modals_repository.dart`, matching where this
/// repo's other fakes (`FakeHoroscopeRepository`, …) actually live.
///
/// `fetchNext` returning `null` is the ORDINARY answer — capped, halted, or
/// nothing armed all return 200 with `data.modal == null`; it is never
/// treated as an error. Callers (see `ModalHost`) additionally swallow every
/// THROWN failure too — a modal is the least important thing happening on a
/// Home open.
abstract interface class ModalsRepository {
  /// `GET /modals/next?surface=<surface>&locale=<locale>`. [locale] is
  /// normally left `null` — `lib/core/locale_interceptor.dart` stamps the
  /// user's selected content language on every GET automatically; pass it
  /// explicitly only to override that.
  Future<ServableModalView?> fetchNext({
    required String surface,
    String? locale,
  });

  /// `POST /modals/impressions`. [showNumber] MUST be the EXACT value
  /// [ServableModalView.showNumber] carried from the matching `fetchNext` —
  /// never recomputed/incremented client-side; it is the idempotency key the
  /// server compare-and-swaps on (`showNumber - 1`). [action] is one of
  /// [ModalImpressionAction]'s constants; [dismissMethod] rides only with
  /// [ModalImpressionAction.dismissed]. Returns the server's `data.counted`
  /// (whether this report was actually counted vs. refused as a duplicate).
  Future<bool> reportImpression({
    required String modalKey,
    required String triggerSource,
    required String action,
    required int showNumber,
    String? dismissMethod,
  });
}

/// Dio-backed implementation over the TAM-174 contract.
class DioModalsRepository implements ModalsRepository {
  DioModalsRepository(this._dio);
  final Dio _dio;

  @override
  Future<ServableModalView?> fetchNext({
    required String surface,
    String? locale,
  }) async {
    try {
      final res = await _dio.get<dynamic>(
        '/modals/next',
        queryParameters: {'surface': surface, 'locale': ?locale},
      );
      final response = ModalsNextResponse.fromJson(_envelope(res));
      if (response == null) {
        throw const ModalsException(
          ModalsErrorKind.unknown,
          'Malformed response',
        );
      }
      final modal = response.data.modal;
      if (modal == null) return null;
      return ServableModalView.fromWire(modal);
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  @override
  Future<bool> reportImpression({
    required String modalKey,
    required String triggerSource,
    required String action,
    required int showNumber,
    String? dismissMethod,
  }) async {
    final actionEnum = ModalImpressionBodyActionEnum.fromJson(action);
    if (actionEnum == null) {
      throw ModalsException(
        ModalsErrorKind.unknown,
        'Unknown modal action: $action',
      );
    }
    ModalImpressionBodyDismissMethodEnum? dismissEnum;
    if (dismissMethod != null) {
      dismissEnum = ModalImpressionBodyDismissMethodEnum.fromJson(
        dismissMethod,
      );
      if (dismissEnum == null) {
        throw ModalsException(
          ModalsErrorKind.unknown,
          'Unknown dismiss method: $dismissMethod',
        );
      }
    }
    final body = ModalImpressionBody(
      modalKey: modalKey,
      triggerSource: triggerSource,
      action: actionEnum,
      dismissMethod: dismissEnum,
      // Echoed verbatim — see the interface doc above. This method never
      // computes/adjusts showNumber; it only forwards what it was given.
      showNumber: showNumber,
    );
    try {
      final res = await _dio.post<dynamic>(
        '/modals/impressions',
        data: body.toJson(),
      );
      final response = ModalImpressionResponse.fromJson(_envelope(res));
      if (response == null) {
        throw const ModalsException(
          ModalsErrorKind.unknown,
          'Malformed response',
        );
      }
      return response.data.counted;
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  /// Maps transport/status failures onto the typed kinds the caller branches
  /// on (mirrors `HoroscopeRepository`'s `_mapDioError`).
  static ModalsException _mapDioError(DioException e) {
    if (e.error is SocketException ||
        e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return const ModalsException(ModalsErrorKind.offline);
    }
    final status = e.response?.statusCode;
    final body = e.response?.data;
    final message = body is Map && body['message'] is String
        ? body['message'] as String
        : null;
    if (status == 401) {
      return ModalsException(ModalsErrorKind.unauthorized, message);
    }
    return ModalsException(ModalsErrorKind.unknown, message);
  }

  static Map<String, dynamic> _envelope(Response<dynamic> res) {
    final body = res.data;
    if (body is! Map<String, dynamic>) {
      throw const ModalsException(
        ModalsErrorKind.unknown,
        'Malformed response',
      );
    }
    if (body['success'] != true) {
      throw ModalsException(
        ModalsErrorKind.unknown,
        body['message']?.toString() ?? 'Request failed',
      );
    }
    return body;
  }
}
