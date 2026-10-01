import 'package:mobile/features/wallpaper/data/set_wallpaper_service.dart';
import 'package:mobile/features/wallpaper/data/wallpaper_models.dart';

/// Controllable [SetWallpaperService] fake (TAM-70) — drives the native set
/// state machine with no Android device. [staticResult]/[liveResult] pick the
/// tri-state each path returns; [throwOnStatic]/[throwOnLive] exercise the
/// thrown-exception → failed branch. Records an ordered call log for assertions.
class FakeSetWallpaperService implements SetWallpaperService {
  FakeSetWallpaperService({
    this.staticResult = WallpaperSetResult.success,
    this.liveResult = WallpaperSetResult.success,
    this.throwOnStatic = false,
    this.throwOnLive = false,
  });

  WallpaperSetResult staticResult;
  WallpaperSetResult liveResult;
  bool throwOnStatic;
  bool throwOnLive;

  final List<String> calls = <String>[];
  int staticCalls = 0;
  int liveCalls = 0;
  WallpaperTarget? lastTarget;
  String? lastImageUrl;
  String? lastFrameUrl;

  @override
  Future<WallpaperSetResult> setStaticWallpaper({
    required String imageUrl,
    required WallpaperTarget target,
  }) async {
    staticCalls++;
    lastTarget = target;
    lastImageUrl = imageUrl;
    calls.add('static:${target.name}:$imageUrl');
    if (throwOnStatic) throw Exception('static set threw');
    return staticResult;
  }

  @override
  Future<WallpaperSetResult> setLiveWallpaper({
    required String frameImageUrl,
    String? packageName,
  }) async {
    liveCalls++;
    lastFrameUrl = frameImageUrl;
    calls.add('live:$frameImageUrl');
    if (throwOnLive) throw Exception('live set threw');
    return liveResult;
  }
}
