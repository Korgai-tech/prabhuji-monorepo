import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'status_models.dart';

/// Persisted mirror of the two `/status/profile` presence facts that ride on
/// EVERY analytics event as global properties: `has_name` and `has_photo`.
///
/// ## Why a persisted store and not a live read
///
/// [AnalyticsEnricher.enrich] runs synchronously on every `trackEvent`, so it
/// cannot await `GET /status/profile`. The profile is also a network resource
/// that most surfaces (chat, books, paywall) never fetch at all — an event
/// fired there would otherwise have no value to report.
///
/// So the flags are mirrored here every time a [StatusProfileData] is
/// obtained ([StatusRepository.fetchProfile] / [StatusRepository.saveProfile]
/// both write through), and the enricher reads the last-known value
/// synchronously. Persisting in [SharedPreferences] means a cold start reports
/// the value from the previous session rather than a false `false` until the
/// Status tab is first opened.
///
/// ## Staleness contract
///
/// These are LAST-KNOWN values, not live ones. They can lag reality in exactly
/// one direction: a profile edited on ANOTHER device won't be reflected until
/// this device next fetches or saves the profile. That is the same bargain
/// `chat_type` makes via [ChatCounters], and it is the right one here — the
/// alternative (omitting the property) loses the segmentation on every event
/// outside the Status tab, which is most of them.
///
/// ## Identity scoping
///
/// The flags describe the LOGGED-IN user's profile, so [clear] runs on the
/// logout branch in `main.dart` alongside `Analytics.reset()`. Without it the
/// next user on the same device would inherit user A's flags until their first
/// profile fetch.
///
/// Production wires [SharedPreferences]; tests use [StatusProfileFlagsStore
/// .inMemory] so they can construct one synchronously without mocking the
/// platform channel. All keys are namespaced (`status_profile.*`).
class StatusProfileFlagsStore {
  /// Production constructor — persists via [SharedPreferences].
  StatusProfileFlagsStore(SharedPreferences prefs)
      : _store = _SharedPrefsFlagsStore(prefs);

  /// Test-only constructor — persists in an in-memory Map. State does NOT
  /// survive across instances, so each test group gets fresh flags.
  @visibleForTesting
  StatusProfileFlagsStore.inMemory() : _store = _InMemoryFlagsStore();

  final _FlagsStore _store;

  static const String _kHasName = 'status_profile.has_name';
  static const String _kHasPhoto = 'status_profile.has_photo';

  /// Mirror the presence flags off a freshly-fetched or freshly-saved
  /// profile. Called from the repository so EVERY path that produces a
  /// [StatusProfileData] updates the store — no call site has to remember.
  void mirror(StatusProfileData profile) {
    _store.setBool(_kHasName, profile.hasName);
    _store.setBool(_kHasPhoto, profile.hasPhoto);
  }

  /// Last-known "a personal display name is saved". Defaults to `false` when
  /// nothing has been mirrored yet (fresh install, or a user who has never
  /// opened a surface that fetches the profile) — a boolean that is absent
  /// cannot be filtered in the warehouse, and `false` is the honest reading
  /// of "nothing we know of is saved".
  bool hasName() => _store.getBool(_kHasName) ?? false;

  /// Last-known "an avatar is saved". See [hasName] for the default.
  bool hasPhoto() => _store.getBool(_kHasPhoto) ?? false;

  /// Wipe both flags. Runs on logout so the next user on this device does
  /// not inherit the previous user's profile state.
  void clear() {
    _store.remove(_kHasName);
    _store.remove(_kHasPhoto);
  }
}

/// Storage seam so [StatusProfileFlagsStore] can wrap either
/// [SharedPreferences] (production) or a plain Map (tests) without exposing
/// the choice.
abstract interface class _FlagsStore {
  bool? getBool(String key);
  void setBool(String key, bool value);
  void remove(String key);
}

class _SharedPrefsFlagsStore implements _FlagsStore {
  _SharedPrefsFlagsStore(this._prefs);
  final SharedPreferences _prefs;

  @override
  bool? getBool(String key) => _prefs.getBool(key);

  @override
  void setBool(String key, bool value) {
    _prefs.setBool(key, value);
  }

  @override
  void remove(String key) {
    _prefs.remove(key);
  }
}

class _InMemoryFlagsStore implements _FlagsStore {
  final Map<String, bool> _values = <String, bool>{};

  @override
  bool? getBool(String key) => _values[key];

  @override
  void setBool(String key, bool value) {
    _values[key] = value;
  }

  @override
  void remove(String key) {
    _values.remove(key);
  }
}
