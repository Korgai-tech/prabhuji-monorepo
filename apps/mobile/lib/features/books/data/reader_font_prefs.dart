import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/theme.dart';

/// Reader body font-size preference (TAM-76 q4/r10).
///
/// #PATH_DECISION — the value is **global and local**: ONE size across the whole
/// reader (not per book, not per chapter) persisted on the device via
/// `shared_preferences` and never synced to the account. Restored on relaunch.
abstract interface class ReaderFontPrefs {
  /// The persisted size, or [AppBooks.readerFontDefault] when never set.
  Future<double> load();

  /// Persist [size], clamped to the design's range.
  Future<void> save(double size);
}

/// `shared_preferences`-backed implementation.
class PrefsReaderFontPrefs implements ReaderFontPrefs {
  PrefsReaderFontPrefs({SharedPreferences? prefs}) : _injected = prefs;

  final SharedPreferences? _injected;

  /// Single global key — the "not per book" half of r10 is enforced structurally
  /// by there being nowhere to put a book id.
  static const String key = 'books.reader.fontSize.v1';

  Future<SharedPreferences> get _prefs async =>
      _injected ?? await SharedPreferences.getInstance();

  @override
  Future<double> load() async {
    final prefs = await _prefs;
    final stored = prefs.getDouble(key);
    if (stored == null) return AppBooks.readerFontDefault;
    return clampFontSize(stored);
  }

  @override
  Future<void> save(double size) async {
    final prefs = await _prefs;
    await prefs.setDouble(key, clampFontSize(size));
  }
}

/// In-memory prefs — the deterministic seam for tests.
class InMemoryReaderFontPrefs implements ReaderFontPrefs {
  InMemoryReaderFontPrefs([double? seed]) : _value = seed;

  double? _value;

  @override
  Future<double> load() async => _value ?? AppBooks.readerFontDefault;

  @override
  Future<void> save(double size) async => _value = clampFontSize(size);
}

/// Keep any stored/incoming size inside the design's slider range (node
/// 620:3854) — a value from an older build or a corrupt pref can never render
/// unreadable text.
double clampFontSize(double size) =>
    size.clamp(AppBooks.readerFontMin, AppBooks.readerFontMax).toDouble();
