// Ctor params are the public API while the fields stay private behind getters —
// same note as core/paywall_gate.dart.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:ffmpeg_kit_flutter_new/ffmpeg_kit.dart';
import 'package:ffmpeg_kit_flutter_new/ffprobe_kit.dart';
import 'package:ffmpeg_kit_flutter_new/return_code.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../feed/presentation/status_overlay.dart';
import 'offscreen_renderer.dart';
import 'status_models.dart';

/// Outcome of an overlay burn-in render (mirrors the wallpaper/ringtone native
/// tri-state convention):
///  * [success]     — a shareable file with the overlay burned in.
///  * [failed]      — recoverable (retry offered, stays on the card).
///  * [unsupported] — this device/build cannot produce the file at all (see the
///                    q2 video-feasibility note below). NEVER degrades to
///                    sharing un-burned media.
enum StatusRenderStatus { success, failed, unsupported }

/// The result of a render. [file] is non-null only for [StatusRenderStatus.success].
class StatusRenderResult {
  const StatusRenderResult.success(File this.file)
      : status = StatusRenderStatus.success,
        message = null;

  const StatusRenderResult.failed([this.message])
      : status = StatusRenderStatus.failed,
        file = null;

  const StatusRenderResult.unsupported([this.message])
      : status = StatusRenderStatus.unsupported,
        file = null;

  final StatusRenderStatus status;
  final File? file;
  final String? message;

  bool get isSuccess => status == StatusRenderStatus.success;
}

/// The overlay burn-in seam (TAM-72 §6.8, §8). Interface + real impl + a
/// `FakeStatusRenderService` (test support), per flutter-feed-screen.md
/// ("platform-channel boundaries get an interface + a fake"), so the share state
/// machine is unit-testable with no device and no real canvas.
///
/// HARD RULE (#EXPORT_CRITICAL): the overlay MUST be burned into the exported
/// file before the share sheet opens. There is deliberately NO API here that
/// returns the raw source media — sharing un-burned media is impossible through
/// this interface by construction.
abstract interface class StatusRenderService {
  /// Composite an IMAGE status.
  ///
  /// TAM-168 forked this into two branches, keyed off [StatusProfileData.hasNameOrPhoto]:
  ///  * **Filled profile** — captures the on-screen `RepaintBoundary` at
  ///    [boundaryKey] and rasterises it via `toImage`. Preview/export parity
  ///    is structural (same subtree, same tokens, same theme).
  ///  * **Empty profile** — skips the on-screen boundary entirely and
  ///    composes the media alone off-screen (mirroring the video path's
  ///    off-screen composition). The exported PNG is deity-only — no
  ///    overlay band burned in. The `_precacheOverlayAssets` warmup is
  ///    skipped since there is no overlay to draw.
  ///
  /// [profile] is the same snapshot the on-screen preview reads, threaded
  /// through so the branch decision matches what the user sees.
  Future<StatusRenderResult> renderImage({
    required GlobalKey boundaryKey,
    required StatusFeedItem item,
    required StatusProfileData profile,
    double pixelRatio,
  });

  /// Composite a VIDEO status into a 9:16 H.264 mp4 with the overlay muxed in
  /// (spec q3). Delegates to the native `prabhuji/status_render` channel.
  ///
  /// TAM-168 — when `profile.hasNameOrPhoto == false` this MUST skip the
  /// overlay rasterisation + FFmpeg overlay muxing entirely and just remux
  /// the source into the cache dir so the exported mp4 is deity-only. The
  /// output still lands under `getCacheDir()` so WhatsApp/IG hand-off via
  /// FileProvider keeps working.
  ///
  /// See [videoRenderSupported] — when false this returns
  /// [StatusRenderStatus.unsupported] and the share is blocked with a clear
  /// message rather than shipping an un-burned video.
  Future<StatusRenderResult> renderVideo({
    required StatusFeedItem item,
    required StatusProfileData profile,
  });

  /// The q2 feasibility flag. `false` in Phase 1 — see [ChannelStatusRenderService].
  bool get videoRenderSupported;
}

/// Production implementation (TAM-71 finding #2 closer).
///
/// **Image** — composited fully on-device with no native code: the on-screen
/// `RepaintBoundary` (media + overlay band) is rasterized via
/// `RenderRepaintBoundary.toImage()` at [pixelRatio] and written as a PNG into
/// app-scoped cache. share_plus hands that file to the native sheet through
/// its own FileProvider content URI (nothing lands in public storage).
///
/// **Video** — same widget subtree as the image path, only in a different
/// composition target. Source mp4 is downloaded; `FFprobeKit` reports its
/// exact pixel dimensions; the on-screen `StatusOverlayBand` widget is
/// rasterized OFF-SCREEN at those dimensions via [rasterizeToPng] into a
/// transparent PNG; then a single `FFmpeg overlay=0:0` composites the PNG on
/// every frame. Audio is passed through (`-c:a copy`). Output is H.264
/// yuv420p mp4 at source dimensions. Because the overlay PNG comes from the
/// SAME widget tree as the on-screen preview, preview/export parity is
/// structural — the circle avatar renders as a circle, text metrics match
/// Flutter's `TextPainter`, and the band decoration is identical.
class FfmpegStatusRenderService implements StatusRenderService {
  const FfmpegStatusRenderService({bool videoRenderSupported = true})
      : _videoSupported = videoRenderSupported;

  final bool _videoSupported;

  /// Export scale for image render. 3× the logical card (~295×449) ≈ 885×1347
  /// — comfortably WhatsApp-sized without blowing up render time on low-end
  /// devices.
  static const double defaultPixelRatio = 3;

  @override
  bool get videoRenderSupported => _videoSupported;

  @override
  Future<StatusRenderResult> renderImage({
    required GlobalKey boundaryKey,
    required StatusFeedItem item,
    required StatusProfileData profile,
    double pixelRatio = defaultPixelRatio,
  }) async {
    // TAM-168 #PATH_DECISION — the empty-profile branch composes OFF-SCREEN
    // (mirroring the video path) so the exported image is deity-only, while
    // the on-screen strip continues to render its tappable "add details"
    // prompt. Filled profiles stay on the on-screen `RepaintBoundary` fast
    // path so the majority case has no perf regression.
    if (!profile.hasNameOrPhoto) {
      return _renderImageOffscreen(item: item, pixelRatio: pixelRatio);
    }
    try {
      final object = boundaryKey.currentContext?.findRenderObject();
      if (object is! RenderRepaintBoundary) {
        return const StatusRenderResult.failed();
      }
      final ui.Image image = await object.toImage(pixelRatio: pixelRatio);
      final ByteData? bytes =
          await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      if (bytes == null) return const StatusRenderResult.failed();

      final file = await _writeCacheFile(
        '${_safeName(item.slug)}.png',
        bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes),
      );
      return StatusRenderResult.success(file);
    } catch (_) {
      return const StatusRenderResult.failed();
    }
  }

  /// TAM-168 empty-profile image path. Downloads the source still (or
  /// thumbnail for a video card, though the video path handles video shares),
  /// decodes it through Flutter's graphics pipeline, and re-encodes it as a
  /// PNG in the app's FileProvider-covered cache. The re-encode means the
  /// share sheet always sees an artefact THIS app produced — never raw source
  /// bytes handed to the OS chooser (see the #EXPORT_CRITICAL invariant in
  /// `status_render_service.dart`'s interface docs).
  Future<StatusRenderResult> _renderImageOffscreen({
    required StatusFeedItem item,
    required double pixelRatio,
  }) async {
    // pixelRatio is retained on the signature for API parity with the
    // on-screen branch. The source image is already at CDN resolution and
    // rasterised at native pixels here — Flutter's `instantiateImageCodec`
    // does not upscale on our behalf.
    final url = item.stillUrl.trim();
    if (url.isEmpty) return const StatusRenderResult.failed();

    Uint8List sourceBytes;
    try {
      sourceBytes = await _downloadBytes(url);
    } catch (_) {
      return const StatusRenderResult.failed();
    }
    if (sourceBytes.isEmpty) return const StatusRenderResult.failed();

    ui.Image? decoded;
    try {
      final codec = await ui.instantiateImageCodec(sourceBytes);
      final frame = await codec.getNextFrame();
      decoded = frame.image;
      final pngBytes = await decoded.toByteData(format: ui.ImageByteFormat.png);
      if (pngBytes == null) return const StatusRenderResult.failed();

      final file = await _writeCacheFile(
        '${_safeName(item.slug)}.png',
        pngBytes.buffer
            .asUint8List(pngBytes.offsetInBytes, pngBytes.lengthInBytes),
      );
      return StatusRenderResult.success(file);
    } catch (_) {
      return const StatusRenderResult.failed();
    } finally {
      decoded?.dispose();
    }
  }

  Future<Uint8List> _downloadBytes(String url) async {
    final client = http.Client();
    try {
      final res = await client.get(Uri.parse(url));
      if (res.statusCode != 200) {
        throw StateError('download failed ${res.statusCode} for $url');
      }
      return res.bodyBytes;
    } finally {
      client.close();
    }
  }

  @override
  Future<StatusRenderResult> renderVideo({
    required StatusFeedItem item,
    required StatusProfileData profile,
  }) async {
    if (!_videoSupported) {
      return const StatusRenderResult.unsupported(kVideoShareUnsupportedCopy);
    }
    final videoUrl = item.playableVideoUrl;
    if (videoUrl == null || videoUrl.isEmpty) {
      return const StatusRenderResult.failed();
    }

    // TAM-168 — empty profile ships a deity-only creative. Skip the overlay
    // rasterisation + FFmpeg overlay filter entirely; just remux the source
    // into cache so it still lands on a FileProvider-covered path and the
    // share sheet gets an artefact THIS app produced (never raw source
    // handed to the OS chooser — see #EXPORT_CRITICAL). Also cheap on CPU
    // and battery, and the "Preparing your status…" wait shrinks by
    // 1–2 seconds on typical Android devices.
    if (!profile.hasNameOrPhoto) {
      return _renderVideoWithoutOverlay(item: item, videoUrl: videoUrl);
    }

    Directory? work;
    try {
      // Same rationale as `_writeCacheFile` above: use path_provider so the
      // output mp4 lands under `getCacheDir()` (covered by our FileProvider),
      // not `getCodeCacheDir()` (not covered — WhatsApp/IG hand-off fails).
      final tempRoot = await getTemporaryDirectory();
      work = await tempRoot.createTemp('prabhuji_status_video_');
      final srcVideo = File('${work.path}/src.mp4');
      final outVideo = File('${work.path}/${_safeName(item.slug)}.mp4');
      final overlayPng = File('${work.path}/overlay.png');

      await _download(videoUrl, srcVideo);

      // 1) Probe video pixel dimensions — the OUTPUT canvas the overlay ends
      // up on. Used only to compute the design-canvas aspect ratio (below)
      // and the FFmpeg `scale` target.
      final dims = await _probeDimensions(srcVideo);

      // 2) Rasterize the on-screen overlay widget OFF-SCREEN at DESIGN
      // CANVAS dimensions (295 dp wide — the same as the on-screen
      // `_StatusCard` container), with the height computed from the video's
      // aspect ratio so the PNG scales into the video with no letter-boxing.
      // Rendering at design dp means the widget's absolute Figma tokens
      // (avatar 67 dp, band radii, labelLg text sizes) sit at the SAME
      // relative proportions they do on-screen.
      //
      // pixelRatio matches the video's pixel width so the PNG is rendered
      // at (or slightly above) video resolution — this eliminates FFmpeg's
      // default bicubic upscale which was mushing text + rounded corners.
      // Integer ratio avoids subpixel filter artifacts. Clamped to [3, 4]:
      //  - MIN 3 keeps parity with the image path's `defaultPixelRatio = 3`
      //    (so image and video shares render identically).
      //  - MAX 4 caps peak RGBA memory (~40 MB on 9:16 4×) and dodges a
      //    known driver-bug range where `toImage(pixelRatio >= 4)` +
      //    `ClipOval` (avatar circle) has silently emitted a solid black
      //    square on some Android GPUs.
      //  - 4× is only granted when the video is ≥1440 wide (real 2K+
      //    content); on 720p/1080p sources 3× already exceeds pixel size.
      const designCanvasWidth = 294.96;
      final designCanvasHeight =
          designCanvasWidth * dims.height / dims.width;
      final designCanvasSize =
          Size(designCanvasWidth, designCanvasHeight);
      final rawRatio = (dims.width / designCanvasWidth).ceil();
      final maxRatio = dims.width >= 1440 ? 4 : 3;
      final targetPixelRatio = rawRatio.clamp(3, maxRatio).toDouble();

      // Precache every async asset the overlay draws BEFORE rasterization.
      // `rasterizeToPng` runs one synchronous `flushPaint()` and immediately
      // captures the layer, so any ImageProvider that hasn't already resolved
      // (AssetImage for the mandala band background, NetworkImage for the
      // saved avatar photo, flutter_svg's PictureProvider for the fallback
      // person + plus-circle SVGs) paints as transparent in the exported PNG.
      // With the video path composited by FFmpeg on top of the source video,
      // a transparent band background reads as "band chrome missing" on the
      // recipient's screen — the case reported for WhatsApp Status shares.
      await _precacheOverlayAssets(
        profile: profile,
        pixelRatio: targetPixelRatio,
      );

      final overlayBytes = await rasterizeToPng(
        child: _StatusVideoOverlayComposition(
          profile: profile,
          safeArea: item.overlaySafeArea.orFigmaDefault,
          size: designCanvasSize,
        ),
        logicalSize: designCanvasSize,
        pixelRatio: targetPixelRatio,
      );
      await overlayPng.writeAsBytes(overlayBytes, flush: true);

      // 3) Resize the PNG to the video's pixel dimensions (usually a
      // downscale now — see the pixelRatio bump above), then composite.
      // `flags=lanczos` keeps text/rounded edges sharp on downscale and is
      // a no-op when dims match exactly (kept for defence against off-by-
      // one rounding upstream). `format=yuv420p` on the ENCODER only; the
      // overlay input stays RGBA so alpha composites correctly. `-c:a copy`
      // preserves audio bit-for-bit.
      //
      // Encoder tuning (perf):
      //   * `-preset ultrafast` — 2–3× faster than the previous `veryfast`
      //     on typical Android CPUs. Videos ≤ 30 s take a few seconds
      //     instead of tens, materially cutting the "Preparing your
      //     status…" wait. The compression penalty is real but immaterial
      //     for short status clips.
      //   * `-crf 26` — slightly higher CRF (was 23) to keep file size in
      //     check now that `ultrafast` compresses less efficiently at the
      //     same quality target. Still WhatsApp/IG-friendly and visually
      //     indistinguishable from `crf 23` at status playback resolution.
      //   * `-movflags +faststart` — moves the moov atom to the front so
      //     WhatsApp/IG can start playing before the whole file loads.
      final vw = dims.width.toInt();
      final vh = dims.height.toInt();
      final command = '-i "${srcVideo.path}" -i "${overlayPng.path}" -y '
          '-filter_complex "'
          '[1:v]scale=$vw:$vh:flags=lanczos[ol];'
          '[0:v][ol]overlay=0:0[v]'
          '" '
          '-map "[v]" -map 0:a? '
          '-c:v libx264 -preset ultrafast -crf 26 -pix_fmt yuv420p '
          '-c:a copy '
          '-movflags +faststart '
          '"${outVideo.path}"';

      final session = await FFmpegKit.execute(command);
      final code = await session.getReturnCode();
      if (!ReturnCode.isSuccess(code)) {
        if (kDebugMode) {
          final logs = await session.getAllLogsAsString();
          debugPrint('[status:video] ffmpeg failed rc=$code\n$logs');
        }
        return const StatusRenderResult.failed();
      }
      if (!await outVideo.exists()) return const StatusRenderResult.failed();
      return StatusRenderResult.success(outVideo);
    } catch (e, st) {
      if (kDebugMode) debugPrint('[status:video] render error: $e\n$st');
      return const StatusRenderResult.failed();
    }
  }

  /// TAM-168 empty-profile video path — download the source and remux it
  /// (`-c copy -movflags +faststart`) into the FileProvider-covered cache
  /// dir. No FFmpeg overlay filter, no re-encode; a fast cache-local pass
  /// that still lands as an artefact THIS app produced, never raw source
  /// bytes handed to the OS chooser (see #EXPORT_CRITICAL).
  Future<StatusRenderResult> _renderVideoWithoutOverlay({
    required StatusFeedItem item,
    required String videoUrl,
  }) async {
    Directory? work;
    try {
      final tempRoot = await getTemporaryDirectory();
      work = await tempRoot.createTemp('prabhuji_status_video_');
      final srcVideo = File('${work.path}/src.mp4');
      final outVideo = File('${work.path}/${_safeName(item.slug)}.mp4');

      await _download(videoUrl, srcVideo);

      // `-c copy` avoids re-encoding (fast + zero quality loss);
      // `+faststart` moves the moov atom to the front so recipients can
      // start playback before the whole file downloads.
      final command = '-i "${srcVideo.path}" -y '
          '-c copy -movflags +faststart '
          '"${outVideo.path}"';

      final session = await FFmpegKit.execute(command);
      final code = await session.getReturnCode();
      if (!ReturnCode.isSuccess(code)) {
        if (kDebugMode) {
          final logs = await session.getAllLogsAsString();
          debugPrint('[status:video] empty-profile remux failed rc=$code\n$logs');
        }
        return const StatusRenderResult.failed();
      }
      if (!await outVideo.exists()) return const StatusRenderResult.failed();
      return StatusRenderResult.success(outVideo);
    } catch (e, st) {
      if (kDebugMode) debugPrint('[status:video] remux error: $e\n$st');
      return const StatusRenderResult.failed();
    }
  }

  /// FFprobe the source and return `(width, height)` in pixels. Falls back to
  /// a standard 720×1280 portrait size on any probe failure so a broken
  /// probe never fails the whole share.
  Future<Size> _probeDimensions(File src) async {
    const fallback = Size(720, 1280);
    try {
      final session = await FFprobeKit.getMediaInformation(src.path);
      final info = session.getMediaInformation();
      final streams = info?.getStreams() ?? const [];
      for (final s in streams) {
        final w = s.getWidth();
        final h = s.getHeight();
        if (w != null && w > 0 && h != null && h > 0) {
          // libx264 needs even dimensions — round down to nearest even.
          return Size((w & ~1).toDouble(), (h & ~1).toDouble());
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[status:video] probe failed: $e');
    }
    return fallback;
  }

  /// Fully resolve every async ImageProvider / SVG loader the overlay uses
  /// so the following headless `rasterizeToPng` paints them synchronously
  /// from cache. Best-effort: any load that fails (network avatar 404, missing
  /// asset variant, timeout) resolves silently — the band will still render
  /// with whatever DID load, and a missing avatar is a smaller regression
  /// than a transparent band strip.
  Future<void> _precacheOverlayAssets({
    required StatusProfileData profile,
    required double pixelRatio,
  }) async {
    // AssetImage / NetworkImage cache keys are configuration-sensitive
    // (devicePixelRatio in particular). Match the config `rasterizeToPng`
    // will use so paint hits the cache we just warmed.
    final config = ImageConfiguration(devicePixelRatio: pixelRatio);

    // 1. The mandala band background — the reported bug's root cause.
    final imageProviders = <ImageProvider>[
      const AssetImage('assets/status/overlay_template_bg.png'),
    ];
    // 2. The saved avatar photo, if any (renders via AppNetworkImage).
    final avatarUrl = profile.avatarImageUrl?.trim();
    if (avatarUrl != null && avatarUrl.isNotEmpty) {
      imageProviders.add(NetworkImage(avatarUrl));
    }

    await Future.wait([
      for (final p in imageProviders) _resolveImageProvider(p, config),
      // 3. flutter_svg's PictureProvider is separately cached. Precache the
      //    two SVGs the empty-avatar fallback + badge draw so a
      //    business-with-no-photo (or fresh personal profile) doesn't come
      //    out with a blank avatar spot.
      _precacheSvgAsset('assets/status/avatar_person.svg'),
      _precacheSvgAsset('assets/status/plus_circle.svg'),
    ]);
  }

  static Future<void> _resolveImageProvider(
    ImageProvider provider,
    ImageConfiguration config,
  ) async {
    final completer = Completer<void>();
    final stream = provider.resolve(config);
    late ImageStreamListener listener;
    listener = ImageStreamListener(
      (info, _) {
        if (!completer.isCompleted) completer.complete();
      },
      onError: (_, _) {
        if (!completer.isCompleted) completer.complete();
      },
    );
    stream.addListener(listener);
    try {
      await completer.future.timeout(const Duration(seconds: 10));
    } catch (_) {
      // Timeout — proceed anyway; the overlay renders without this image.
    } finally {
      stream.removeListener(listener);
    }
  }

  static Future<void> _precacheSvgAsset(String assetName) async {
    try {
      final loader = SvgAssetLoader(assetName);
      await svg.cache.putIfAbsent(
        loader.cacheKey(null),
        () => loader.loadBytes(null),
      );
    } catch (_) {
      // Non-fatal.
    }
  }

  Future<void> _download(String url, File dest) async {
    final client = http.Client();
    try {
      final res = await client.get(Uri.parse(url));
      if (res.statusCode != 200) {
        throw StateError('download failed ${res.statusCode} for $url');
      }
      await dest.writeAsBytes(res.bodyBytes, flush: true);
    } finally {
      client.close();
    }
  }

  static Future<File> _writeCacheFile(String name, Uint8List bytes) async {
    // path_provider.getTemporaryDirectory() → `context.getCacheDir()` on
    // Android (`/data/data/<pkg>/cache/`), which is what the app's
    // FileProvider `<cache-path>` exposes. `Directory.systemTemp` resolves
    // to `getCodeCacheDir()` (`code_cache/`) — NOT covered by any built-in
    // FileProvider `<paths>` element, so a share hand-off from there fails
    // with `IllegalArgumentException: Failed to find configured root`.
    final tempRoot = await getTemporaryDirectory();
    final dir = await tempRoot.createTemp('prabhuji_status');
    final file = File('${dir.path}/$name');
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  static String _safeName(String slug) {
    final cleaned = slug.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
    return cleaned.isEmpty ? 'status' : cleaned;
  }
}

/// Deprecated alias — pre-FFmpeg name. Kept as a typedef so any external
/// import site (there are none inside this repo) still resolves. Callers use
/// [FfmpegStatusRenderService] directly.
typedef ChannelStatusRenderService = FfmpegStatusRenderService;

/// Off-screen composition target for [rasterizeToPng] — a fixed-size Stack
/// with `StatusOverlayBand` bottom-anchored on a fully transparent
/// background. FFmpeg's `overlay=0:0` composites the resulting PNG onto
/// every frame of the source video, so the burned-in overlay is byte-for-
/// byte identical to what `StatusHeroPreview` renders on screen (same
/// widget, same tokens, same theme).
class _StatusVideoOverlayComposition extends StatelessWidget {
  const _StatusVideoOverlayComposition({
    required this.profile,
    required this.safeArea,
    required this.size,
  });

  final StatusProfileData profile;
  final StatusSafeArea safeArea;
  final Size size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size.width,
      height: size.height,
      // Transparent Stack — no media, no card frame; only the overlay band
      // sits at the bottom, exactly as it does over the on-screen media.
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          StatusOverlayBand(
            profile: profile,
            safeArea: safeArea,
            mediaSize: size,
          ),
        ],
      ),
    );
  }
}

/// The exact copy shown when a video status can't be burned in (q2 fallback).
/// Calm, non-blaming, and honest that it's the app's limit, not the user's.
const String kVideoShareUnsupportedCopy =
    'Video status sharing isn’t available yet. Please share an image status for now.';
