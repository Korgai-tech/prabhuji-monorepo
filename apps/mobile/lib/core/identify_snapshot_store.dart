import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists the identify-dedupe snapshot across launches (see
/// `identify_dedupe.dart`). Secure storage because the snapshot carries user
/// PII (email) — the same at-rest posture as the JWT in `AuthStore`.
class IdentifySnapshotStore {
  IdentifySnapshotStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _storage;
  static const _key = 'analytics_identify_snapshot';

  Future<String?> read() => _storage.read(key: _key);
  Future<void> write(String snapshot) =>
      _storage.write(key: _key, value: snapshot);
  Future<void> clear() => _storage.delete(key: _key);
}
