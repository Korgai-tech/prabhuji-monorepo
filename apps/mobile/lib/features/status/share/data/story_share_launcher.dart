import 'package:flutter/services.dart';

/// The four story/status destinations the app can hand a rendered share to,
/// plus a [moreApps] escape hatch that opens the OS share sheet (the existing
/// share_plus flow, unchanged).
///
/// Only used inside the Status feature — kept alongside the launcher so
/// consumers import one thing.
enum StoryShareTarget {
  whatsapp,
  instagram,
  facebook,
  snapchat,

  /// Fall back to the OS share sheet — the existing native chooser handled by
  /// `ShareService.shareRenderedFile`. Not sent to the platform channel.
  moreApps;

  /// The Android package id the plugin resolves this target to. `null` for
  /// [moreApps] because that path bypasses the plugin entirely.
  String? get androidPackage => switch (this) {
        StoryShareTarget.whatsapp => 'com.whatsapp',
        StoryShareTarget.instagram => 'com.instagram.android',
        StoryShareTarget.facebook => 'com.facebook.katana',
        StoryShareTarget.snapchat => 'com.snapchat.android',
        StoryShareTarget.moreApps => null,
      };

  /// Whether the target's Story intent silently drops the caption we pass.
  ///
  /// Meta's `ADD_TO_STORY` intents (Instagram, Facebook) do NOT accept a text
  /// extra — the intent surface documents only sticker/background asset URIs
  /// and background colors, no free-text caption. Snapchat's `ACTION_SEND`
  /// ignores `EXTRA_TEXT` too.
  ///
  /// WhatsApp Status DOES surface `EXTRA_TEXT` as a pre-filled caption in the
  /// send-to picker (reliable on WhatsApp ≥ 2020 when the MIME is a specific
  /// image/* subtype — we send `image/png`, ✓). [moreApps] delegates to the
  /// OS share sheet, which forwards `EXTRA_TEXT` verbatim.
  ///
  /// The bloc copies the caption to the system clipboard before firing the
  /// intent for any target where this is true, so the user can paste it as a
  /// text sticker in the receiving app's Story composer.
  bool get losesCaption => switch (this) {
        StoryShareTarget.instagram ||
        StoryShareTarget.facebook ||
        StoryShareTarget.snapchat =>
          true,
        StoryShareTarget.whatsapp || StoryShareTarget.moreApps => false,
      };
}

/// Platform-channel seam for launching a rendered status file directly into a
/// third-party story/status composer (TAM-72 story-share sheet).
///
/// Interface + real impl + a [NoopStoryShareLauncher] for tests, per
/// `flutter-feed-screen.md` ("platform-channel boundaries get an interface + a
/// fake"). The `StatusShareBloc` depends on this abstraction, so its unit tests
/// keep running with no device.
///
/// Android-only by design (see `apps/mobile/android/.../StorySharePlugin.kt`);
/// on iOS the channel returns an empty [installedTargets] set and every
/// [shareTo] resolves `false`, so the UI naturally falls back to
/// [StoryShareTarget.moreApps].
abstract interface class StoryShareLauncher {
  /// Which of the four supported targets are actually installed on this device.
  /// Callers filter their sheet UI to this set so we never show an icon for an
  /// app the user doesn't have.
  Future<Set<StoryShareTarget>> installedTargets();

  /// Hand [file] to the [target]'s app for posting as a status/story. Returns
  /// `true` if the intent resolved and the third-party UI opened; `false` if
  /// the app is missing or the intent failed. Never throws.
  ///
  /// [facebookAppId] unlocks the direct `com.facebook.stories.ADD_TO_STORY`
  /// composer for [StoryShareTarget.facebook] — the intent is rejected by
  /// Facebook without it. When null we fall back to a plain `ACTION_SEND`
  /// targeted at the Facebook app (user picks Story from FB's own sheet).
  /// Ignored for every other target.
  Future<bool> shareTo({
    required StoryShareTarget target,
    required String filePath,
    required String mimeType,
    String? caption,
    String? facebookAppId,
  });
}

/// Real implementation over the `prabhuji/story_share` `MethodChannel`. The
/// Kotlin handler (`StorySharePlugin.kt`) owns the package-visibility checks,
/// the FileProvider URI hand-off, and the per-target `Intent` shape.
class ChannelStoryShareLauncher implements StoryShareLauncher {
  const ChannelStoryShareLauncher([this._channel = _defaultChannel]);

  static const MethodChannel _defaultChannel =
      MethodChannel('prabhuji/story_share');
  final MethodChannel _channel;

  @override
  Future<Set<StoryShareTarget>> installedTargets() async {
    try {
      final reply =
          await _channel.invokeListMethod<String>('installedTargets') ??
              const <String>[];
      return reply
          .map(_targetFromWire)
          .whereType<StoryShareTarget>()
          .toSet();
    } on PlatformException {
      return const <StoryShareTarget>{};
    } on MissingPluginException {
      // iOS or a build without the plugin — the UI treats an empty set as
      // "only 'More apps' is available", which is the correct fallback.
      return const <StoryShareTarget>{};
    }
  }

  @override
  Future<bool> shareTo({
    required StoryShareTarget target,
    required String filePath,
    required String mimeType,
    String? caption,
    String? facebookAppId,
  }) async {
    if (target == StoryShareTarget.moreApps) {
      // The bloc never routes moreApps through this method (it uses the
      // existing ShareService), but guard defensively so a future caller
      // can't accidentally silently no-op through the plugin.
      return false;
    }
    try {
      final ok = await _channel.invokeMethod<bool>('shareTo', {
        'target': _wireFromTarget(target),
        'filePath': filePath,
        'mimeType': mimeType,
        'caption': ?caption,
        'facebookAppId': ?facebookAppId,
      });
      return ok ?? false;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  static String _wireFromTarget(StoryShareTarget target) => switch (target) {
        StoryShareTarget.whatsapp => 'whatsapp',
        StoryShareTarget.instagram => 'instagram',
        StoryShareTarget.facebook => 'facebook',
        StoryShareTarget.snapchat => 'snapchat',
        StoryShareTarget.moreApps => 'moreApps',
      };

  static StoryShareTarget? _targetFromWire(String value) => switch (value) {
        'whatsapp' => StoryShareTarget.whatsapp,
        'instagram' => StoryShareTarget.instagram,
        'facebook' => StoryShareTarget.facebook,
        'snapchat' => StoryShareTarget.snapchat,
        _ => null,
      };
}

/// Test/iOS fallback — every target is "not installed" and every share fails,
/// so the UI + bloc naturally take the [StoryShareTarget.moreApps] path.
class NoopStoryShareLauncher implements StoryShareLauncher {
  const NoopStoryShareLauncher();

  @override
  Future<Set<StoryShareTarget>> installedTargets() async =>
      const <StoryShareTarget>{};

  @override
  Future<bool> shareTo({
    required StoryShareTarget target,
    required String filePath,
    required String mimeType,
    String? caption,
    String? facebookAppId,
  }) async =>
      false;
}
