import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:mobile/features/status/data/status_avatar_picker.dart';
import 'package:mobile/features/status/data/status_models.dart';
import 'package:mobile/features/status/data/status_render_service.dart';
import 'package:mobile/features/status/feed/status_video_port.dart';

/// Recording double for [StatusRenderService] (TAM-72).
///
/// The `renderImage`/`renderVideo` CALL COUNTS are the mechanism the paywall
/// tests use to prove `render_before_paywall: false`: a free user's Share must
/// leave [imageCalls] + [videoCalls] at zero.
class FakeStatusRenderService implements StatusRenderService {
  FakeStatusRenderService({
    this.imageResult,
    this.videoResult,
    bool videoRenderSupported = false,
    this.onRender,
    this.renderDelay = Duration.zero,
  }) : _videoSupported = videoRenderSupported;

  /// Makes a render take measurable time, so a test can land further taps WHILE
  /// it is in flight (the real duplicate-tap scenario — a real burn-in is not
  /// instantaneous).
  final Duration renderDelay;

  /// Seeded outcome for an image render; defaults to a real temp file so the
  /// share leg runs end-to-end.
  StatusRenderResult? imageResult;

  /// Seeded outcome for a video render; defaults to the Phase-1 `unsupported`.
  StatusRenderResult? videoResult;

  final bool _videoSupported;

  /// Optional hook — e.g. to assert entitlement at the moment of render.
  void Function()? onRender;

  int imageCalls = 0;
  int videoCalls = 0;

  /// TAM-168 — the profile the last `renderImage` / `renderVideo` was called
  /// with. Tests assert `lastImageProfile?.hasNameOrPhoto` to distinguish
  /// the on-screen boundary path from the off-screen deity-only path.
  StatusProfileData? lastImageProfile;
  StatusProfileData? lastVideoProfile;

  /// TAM-168 — the profile passed to the last `renderImage`. Tests use
  /// `lastImageProfile?.hasNameOrPhoto` to assert which render architecture
  /// branch the bloc took (filled ⇒ on-screen boundary; empty ⇒ off-screen
  /// composition without overlay).
  bool get emptyProfileRendered => lastImageProfile?.hasNameOrPhoto == false;

  /// Total renders — the free-user assertion is `renderCalls == 0`.
  int get renderCalls => imageCalls + videoCalls;

  @override
  bool get videoRenderSupported => _videoSupported;

  @override
  Future<StatusRenderResult> renderImage({
    required GlobalKey boundaryKey,
    required StatusFeedItem item,
    required StatusProfileData profile,
    double pixelRatio = 3,
  }) async {
    imageCalls++;
    lastImageProfile = profile;
    onRender?.call();
    if (renderDelay > Duration.zero) await Future<void>.delayed(renderDelay);
    return imageResult ?? StatusRenderResult.success(_tempFile('${item.slug}.png'));
  }

  @override
  Future<StatusRenderResult> renderVideo({
    required StatusFeedItem item,
    required StatusProfileData profile,
  }) async {
    videoCalls++;
    lastVideoProfile = profile;
    onRender?.call();
    if (renderDelay > Duration.zero) await Future<void>.delayed(renderDelay);
    return videoResult ??
        const StatusRenderResult.unsupported(kVideoShareUnsupportedCopy);
  }

  /// A stand-in mp4 for the "native channel landed" path.
  static File videoFixtureFile() => _tempFile('status.mp4');

  static File _tempFile(String name) {
    final dir = Directory.systemTemp.createTempSync('fake_status_render');
    return File('${dir.path}/$name')..writeAsBytesSync(const [0x89, 0x50, 0x4E, 0x47]);
  }
}

/// Avatar-picker double. Defaults to the Phase-1 `unavailable` (no upload
/// endpoint in the TAM-71 contract); seed [result] to exercise the picked path.
class FakeStatusAvatarPicker implements StatusAvatarPicker {
  FakeStatusAvatarPicker({this.result});

  StatusAvatarPickResult? result;
  int pickCalls = 0;

  @override
  Future<StatusAvatarPickResult> pickAvatar() async {
    pickCalls++;
    return result ?? const StatusAvatarPickResult.unavailable();
  }
}

/// Deterministic [StatusVideoPort] fake — no codec, no network. Records
/// play/pause so the "only the ACTIVE card plays, muted, one at a time" rule is
/// assertable.
class FakeStatusVideoPort implements StatusVideoPort {
  FakeStatusVideoPort({this.failInitialize = false});

  /// Simulates an unplayable source → the card falls back to its thumbnail.
  final bool failInitialize;

  /// Every port built during a test, so the "one video at a time" rule can be
  /// asserted across the whole feed.
  static final List<FakeStatusVideoPort> created = [];

  static int get instances => created.length;

  /// The ports that actually played — the real invariant is that exactly ONE
  /// card is ever playing, not that `play()` was invoked exactly once (a rebuild
  /// may idempotently re-issue `play()` on the already-playing port).
  static List<FakeStatusVideoPort> get played =>
      created.where((p) => p.playCalls > 0).toList();

  static void resetCounters() => created.clear();

  bool _initialized = false;
  bool _error = false;
  bool playing = false;
  bool muted = true;
  int playCalls = 0;
  int pauseCalls = 0;
  int setMutedCalls = 0;
  String? lastUrl;

  @override
  Future<void> initialize(String url) async {
    created.add(this);
    lastUrl = url;
    if (failInitialize) {
      _error = true;
      return;
    }
    _initialized = true;
  }

  @override
  Future<void> play() async {
    if (_error) return;
    playCalls++;
    playing = true;
  }

  @override
  Future<void> pause() async {
    pauseCalls++;
    playing = false;
  }

  @override
  Future<void> setMuted(bool value) async {
    setMutedCalls++;
    muted = value;
  }

  @override
  bool get isInitialized => _initialized;

  @override
  bool get hasError => _error;

  @override
  double get aspectRatio => 9 / 16;

  @override
  Size get intrinsicSize => const Size(1080, 1920);

  @override
  Widget buildView() => const SizedBox.shrink();

  @override
  Future<void> dispose() async {
    playing = false;
  }
}
