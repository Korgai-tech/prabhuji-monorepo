import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Offline TEXT cache for opened Books content (TAM-76 r12 / q2).
///
/// Scope is deliberately narrow and matches the spec's
/// `recommended_mvp_scope: cache_opened_text_content_only`:
///  * **write** on every successful chapter/scripture read, and only when the
///    server marked the content `offlineCacheEligible`;
///  * **read** only when the network said `offline`;
///  * **never audio** (Phase 2 — `phase_2_scope: [manual_download,
///    audio_offline_cache]`), and never a manual "download" affordance.
///
/// Storage is `shared_preferences` (already a dependency, no new package): the
/// payloads are short devotional texts, and nothing here is PII — only public
/// content the user already fetched. One key per chapter/scripture keeps a write
/// from rewriting the whole cache.
abstract interface class OfflineTextCache {
  /// Cache a chapter body. No-op when [eligible] is false.
  Future<void> putChapter({
    required String contentId,
    required String chapterId,
    required String title,
    required String bodyText,
    required bool eligible,
  });

  /// Read a cached chapter, or `null` on a miss.
  Future<CachedText?> getChapter(String contentId, String chapterId);

  /// Cache a scripture body. No-op when [eligible] is false.
  Future<void> putScripture({
    required String contentId,
    required String title,
    required String contentBody,
    required bool eligible,
  });

  /// Read a cached scripture, or `null` on a miss.
  Future<CachedText?> getScripture(String contentId);
}

/// A cached body + the title it was stored with, so an offline reader can render
/// its full chrome (title + text) without a network round-trip.
class CachedText {
  const CachedText({required this.title, required this.body});

  final String title;
  final String body;
}

/// `shared_preferences`-backed implementation.
class PrefsOfflineTextCache implements OfflineTextCache {
  PrefsOfflineTextCache({SharedPreferences? prefs}) : _injected = prefs;

  final SharedPreferences? _injected;

  static const String _prefix = 'books.offline.v1.';

  Future<SharedPreferences> get _prefs async =>
      _injected ?? await SharedPreferences.getInstance();

  static String _chapterKey(String contentId, String chapterId) =>
      '${_prefix}chapter.$contentId.$chapterId';

  static String _scriptureKey(String contentId) =>
      '${_prefix}scripture.$contentId';

  @override
  Future<void> putChapter({
    required String contentId,
    required String chapterId,
    required String title,
    required String bodyText,
    required bool eligible,
  }) async {
    // The server owns the caching decision — honour it verbatim.
    if (!eligible) return;
    await _write(_chapterKey(contentId, chapterId), title, bodyText);
  }

  @override
  Future<CachedText?> getChapter(String contentId, String chapterId) =>
      _read(_chapterKey(contentId, chapterId));

  @override
  Future<void> putScripture({
    required String contentId,
    required String title,
    required String contentBody,
    required bool eligible,
  }) async {
    if (!eligible) return;
    await _write(_scriptureKey(contentId), title, contentBody);
  }

  @override
  Future<CachedText?> getScripture(String contentId) =>
      _read(_scriptureKey(contentId));

  Future<void> _write(String key, String title, String body) async {
    final prefs = await _prefs;
    await prefs.setString(key, jsonEncode({'title': title, 'body': body}));
  }

  Future<CachedText?> _read(String key) async {
    final prefs = await _prefs;
    final raw = prefs.getString(key);
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;
      final title = decoded['title'];
      final body = decoded['body'];
      if (title is! String || body is! String) return null;
      return CachedText(title: title, body: body);
    } on FormatException {
      // A corrupt entry is a cache MISS, never a crash.
      return null;
    }
  }
}

/// In-memory cache — the deterministic seam for tests + a safe default when no
/// platform channel exists.
class InMemoryOfflineTextCache implements OfflineTextCache {
  final Map<String, CachedText> _store = <String, CachedText>{};

  /// Entries currently cached — lets a test assert what was written.
  int get length => _store.length;

  @override
  Future<void> putChapter({
    required String contentId,
    required String chapterId,
    required String title,
    required String bodyText,
    required bool eligible,
  }) async {
    if (!eligible) return;
    _store['chapter.$contentId.$chapterId'] =
        CachedText(title: title, body: bodyText);
  }

  @override
  Future<CachedText?> getChapter(String contentId, String chapterId) async =>
      _store['chapter.$contentId.$chapterId'];

  @override
  Future<void> putScripture({
    required String contentId,
    required String title,
    required String contentBody,
    required bool eligible,
  }) async {
    if (!eligible) return;
    _store['scripture.$contentId'] = CachedText(title: title, body: contentBody);
  }

  @override
  Future<CachedText?> getScripture(String contentId) async =>
      _store['scripture.$contentId'];
}
