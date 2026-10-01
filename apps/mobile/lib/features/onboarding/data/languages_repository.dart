import 'package:dio/dio.dart';

import '../../../api/api_client.dart';
import '../profile/bloc/name_language_state.dart';

/// The supported content languages, fetched from the server.
///
/// The app deliberately holds NO copy of this list. It used to ship a
/// compile-time `kSupportedLanguages` const, which meant the app had zero
/// runtime knowledge of what the API actually accepts: a language added
/// server-side stayed invisible until the next store release, and a language
/// added app-side was rejected by `PATCH /users/me`. `GET /languages` serves
/// the same constant `LanguageCodeSchema` is derived from, so the two can no
/// longer disagree.
abstract interface class LanguagesRepository {
  /// `GET /languages` → the selectable languages + the code to pre-select.
  Future<LanguageCatalog> fetchLanguages();
}

/// The languages the picker offers, plus the server's default selection.
class LanguageCatalog {
  const LanguageCatalog({required this.languages, required this.defaultCode});

  final List<LanguageOption> languages;

  /// Pre-select this when the user has not chosen a language yet. Server-owned
  /// so the app stops hardcoding `hi`.
  final String defaultCode;
}

class DioLanguagesRepository implements LanguagesRepository {
  DioLanguagesRepository(this._dio);
  final Dio _dio;

  @override
  Future<LanguageCatalog> fetchLanguages() async {
    // Unauthenticated on the server — no bearer needed, so this works before the
    // user has a token.
    final res = await _dio.get<dynamic>('/languages');
    final body = res.data;
    if (body is! Map<String, dynamic>) throw ApiException('Malformed response');
    if (body['success'] != true) {
      throw ApiException(body['message']?.toString() ?? 'Request failed');
    }
    final data = body['data'];
    if (data is! Map<String, dynamic>) throw ApiException('Malformed response');

    final raw = data['languages'];
    if (raw is! List) throw ApiException('Malformed response');

    final languages = <LanguageOption>[];
    for (final entry in raw) {
      if (entry is! Map) continue;
      final map = entry.cast<String, dynamic>();
      final code = map['code']?.toString();
      final nativeLabel = map['nativeLabel']?.toString();
      final englishLabel = map['englishLabel']?.toString();
      if (code == null || code.isEmpty) continue;
      languages.add(LanguageOption(
        code: code,
        // Fall back to the code rather than dropping the option: an unlabelled
        // language is still selectable, whereas a missing one is not.
        nativeLabel: (nativeLabel == null || nativeLabel.isEmpty) ? code : nativeLabel,
        englishLabel: (englishLabel == null || englishLabel.isEmpty) ? code : englishLabel,
      ));
    }
    if (languages.isEmpty) throw ApiException('No languages available');

    final defaultCode = data['defaultCode']?.toString();
    return LanguageCatalog(
      languages: List<LanguageOption>.unmodifiable(languages),
      defaultCode: (defaultCode == null || defaultCode.isEmpty)
          ? languages.first.code
          : defaultCode,
    );
  }
}
