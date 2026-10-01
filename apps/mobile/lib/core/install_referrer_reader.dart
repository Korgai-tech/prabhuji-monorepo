import 'dart:async';
import 'dart:io';

import 'package:android_play_install_referrer/android_play_install_referrer.dart';
import 'package:flutter/foundation.dart';

/// Parsed Android Play Install Referrer payload — the raw string as Play
/// returned it, plus the subset of query-style attribution keys we care
/// about.
///
/// The Play Install Referrer API returns a single string set by whoever
/// composed the Play Store URL that installed the app. Two shapes matter
/// here:
///
///  1. **Deep-link path** — our landing page appends `referrer=<pathname>`
///     (e.g. `/app/aarti/xyz`) so the deep-link consumer can replay the
///     shared target post-install. Consumed by `deep_link_service.dart`
///     via [raw].
///  2. **Attribution query** — ad-campaign installs (Google Ads, Meta
///     Ads, organic Play search) fill it with an `&`-joined query string
///     of `utm_*` and click-ID keys. Consumed by the referral-sync
///     service via [attribution].
///
/// Both consumers get the same cached parse — the reader is one-shot per
/// process, so each downstream can gate its own "already did my thing"
/// flag independently without racing to be the first read (an earlier
/// design flipped a SharedPref flag inside the reader, which meant
/// whichever consumer ran second got null).
class InstallReferrerData {
  const InstallReferrerData({required this.raw, required this.attribution});

  /// The referrer string verbatim, as Play handed it to us. Empty is
  /// coerced to null upstream (see [PlayInstallReferrerReader.read]) so
  /// this is always a non-empty payload the consumer decides how to
  /// interpret.
  final String raw;

  /// Parsed attribution keys — `utm_*` (source / medium / campaign /
  /// content / term) plus paid-media click IDs (`gclid`, `fbclid`,
  /// `gbraid`, `wbraid`, `dclid`, `msclkid`). Null when [raw] carries no
  /// recognised attribution key (organic install with no ad reference,
  /// our own deep-link `/app/*` path, etc.). Values are passed through
  /// verbatim including Google Play's `(not set)` sentinel — the backend
  /// / warehouse decides what to filter.
  final Map<String, String>? attribution;
}

/// Reads the Android Play Install Referrer once per process and caches the
/// parsed result in memory (TAM-124 — deferred deep linking; extended to
/// support the first-launch referral sync).
///
/// **How the read is used end-to-end:**
///
///   1. User taps `https://krutyug.ai/app/aarti/xyz` without the app, OR
///      installs from a Google Ads / Play Search entry that carries a
///      `utm_*` referrer.
///   2. On first launch, we read the referrer via the Play API.
///   3. The parsed result ([InstallReferrerData]) is cached for the
///      process lifetime. `deep_link_service.dart` reads [raw] to route
///      a `/app/*` share; the referral-sync service reads [utm] to POST
///      campaign attribution to the referral backend.
///
/// The reader itself no longer owns a "consumed" flag — each downstream
/// consumer owns its own SharedPreferences gate (`install_referrer_consumed_v1`
/// for the deep-link consume, `referral_synced_v1` for the referral POST).
/// That decoupling is deliberate: the previous "flag inside the reader"
/// design meant the second consumer to call [read] always got null.
///
/// Split behind an abstract [InstallReferrerReader] so tests can drive it
/// deterministically — the real impl talks to a platform channel that
/// only works on Android with Play Services.
abstract class InstallReferrerReader {
  /// Returns the parsed referrer payload if this device installed with one,
  /// else null. Idempotent within the process — the first call fetches
  /// from Play and caches; subsequent calls return the cache.
  ///
  /// Never throws — a plugin failure resolves to null. Consumers that need
  /// to distinguish "definitely no referrer" from "couldn't read this
  /// launch" (e.g. the referral-sync service, which shouldn't burn its
  /// once-per-install flag on a transient Play Services failure) can gate
  /// on [lastReadFailed] after the call returns.
  Future<InstallReferrerData?> read();

  /// `true` when the most recent [read] call returned null because of a
  /// plugin error (rather than legitimately having no referrer — iOS,
  /// organic install, empty response). Reset on the next successful
  /// [read]. Consumers that want to retry across cold-starts gate on this.
  bool get lastReadFailed;
}

/// Production reader — wraps `AndroidPlayInstallReferrer.installReferrer`,
/// parses `utm_*` keys, and caches for the process lifetime. Non-Android
/// platforms short-circuit to null.
class PlayInstallReferrerReader implements InstallReferrerReader {
  PlayInstallReferrerReader();

  InstallReferrerData? _cached;
  bool _resolved = false;
  bool _lastReadFailed = false;
  Future<InstallReferrerData?>? _inflight;

  @override
  bool get lastReadFailed => _lastReadFailed;

  @override
  Future<InstallReferrerData?> read() {
    if (_resolved) return Future.value(_cached);
    return _inflight ??= _resolve();
  }

  Future<InstallReferrerData?> _resolve() async {
    try {
      // Non-Android platforms have no Install Referrer at all — cheap short
      // circuit; the plugin no-ops but returns garbage on iOS / desktop.
      // NOT an error — iOS is a legitimate "no referrer" outcome.
      if (!Platform.isAndroid) return _finish(null, failed: false);

      final details = await AndroidPlayInstallReferrer.installReferrer;
      final referrer = details.installReferrer;
      // Empty referrer = organic install. Legitimate "no data", not error.
      if (referrer == null || referrer.isEmpty) {
        return _finish(null, failed: false);
      }

      return _finish(
        InstallReferrerData(
          raw: referrer,
          attribution: parseAttribution(referrer),
        ),
        failed: false,
      );
    } catch (e, st) {
      debugPrint('[PlayInstallReferrerReader] read failed: $e\n$st');
      // Plugin error — do NOT cache as "resolved". A subsequent call
      // retries the platform channel; the referral-sync service also
      // checks [lastReadFailed] so it doesn't burn its once-per-install
      // flag on a transient failure.
      _lastReadFailed = true;
      _resolved = false;
      return null;
    } finally {
      _inflight = null;
    }
  }

  InstallReferrerData? _finish(InstallReferrerData? value, {required bool failed}) {
    _cached = value;
    _resolved = true;
    _lastReadFailed = failed;
    return value;
  }

  /// Standalone attribution keys we keep alongside anything prefixed
  /// `utm_*`. These are the paid-media click IDs — one per ad platform —
  /// used by their respective attribution APIs to reconcile installs
  /// with the click that produced them. Without these keys reaching the
  /// referral backend, Google Ads / Meta Ads / MS Ads spend can't be
  /// tied back to installs on their side.
  ///
  ///   * `gclid`   — Google Ads click ID
  ///   * `gbraid`  — Google's iOS-14+ privacy-safe click ID (web → app)
  ///   * `wbraid`  — Google's iOS-14+ privacy-safe click ID (app → app)
  ///   * `dclid`   — Google Display & Video 360 (DoubleClick)
  ///   * `fbclid`  — Meta / Facebook Ads click ID
  ///   * `msclkid` — Microsoft Ads click ID
  static const _attributionSingletons = <String>{
    'gclid',
    'gbraid',
    'wbraid',
    'dclid',
    'fbclid',
    'msclkid',
  };

  /// Extract attribution keys from a Play referrer string.
  ///
  /// Google Play hands the string as a query — either `k=v&k=v` or the
  /// percent-encoded form. We parse with [Uri.splitQueryString] (the Dart
  /// analogue of Android's `Uri.getQueryParameter` — the parser the prior
  /// krutyug_app referrer flow used, matched here so the extraction stays
  /// consistent across both apps' data). That gives us **per-value
  /// URL-decoding**, which matters when a real value contains an encoded
  /// delimiter — e.g. `utm_content=abc%26def` decodes to `abc&def` cleanly
  /// instead of being truncated at the first `&` (which a naive whole-
  /// string decode + split would do).
  ///
  /// Keys kept:
  ///   * anything starting with `utm_` (source / medium / campaign /
  ///     content / term, plus any future `utm_id`-style key without a
  ///     code change).
  ///   * the paid-media click-ID singletons in [_attributionSingletons]
  ///     (widens krutyug_app's utm-only capture so Google Ads, Meta Ads
  ///     and MS Ads spend can be reconciled with installs on their side).
  ///
  /// Values are passed through verbatim including empty strings and
  /// Google Play's `(not set)` sentinel — the backend / warehouse decides
  /// what to filter. Returns null when the raw string carries no
  /// recognised attribution key (deep-link path, organic install with no
  /// ad reference, etc.).
  @visibleForTesting
  static Map<String, String>? parseAttribution(String raw) {
    Map<String, String> parsed;
    try {
      parsed = Uri.splitQueryString(raw);
    } catch (_) {
      // Malformed encoding (e.g. bare `%` not part of a valid escape).
      // Nothing to salvage — surface as "no attribution" so the sync
      // falls through to organic-install treatment.
      return null;
    }
    final out = <String, String>{};
    for (final entry in parsed.entries) {
      final key = entry.key;
      if (key.startsWith('utm_') || _attributionSingletons.contains(key)) {
        out[key] = entry.value;
      }
    }
    return out.isEmpty ? null : out;
  }
}

/// Silent no-op reader — used by widget tests that instantiate DeepLinkService
/// bare, and by the referral-sync fallback when Play services isn't wired.
class NoOpInstallReferrerReader implements InstallReferrerReader {
  const NoOpInstallReferrerReader();
  @override
  Future<InstallReferrerData?> read() async => null;
  // No plugin call happens, so failure is meaningless here — always false.
  @override
  bool get lastReadFailed => false;
}
