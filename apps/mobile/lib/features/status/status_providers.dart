import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/service_locator.dart';
import '../../state/providers.dart';
import 'data/status_avatar_picker.dart';
import 'data/status_models.dart';
import 'data/status_profile_flags_store.dart';
import 'data/status_render_service.dart';
import 'data/status_repository.dart';
import 'feed/status_video_port.dart';

/// The Status data seam (TAM-72). Defaults to the dio-backed impl over the
/// get_it-owned auth-injecting [Dio]; overridden with a
/// `FakeStatusRepository` in widget/bloc tests so every surface runs offline.
final statusRepositoryProvider = Provider<StatusRepository>(
  (ref) => DioStatusRepository(
    serviceLocator<Dio>(),
    // Write-through for the global `has_name` / `has_photo` analytics
    // properties. Guarded on registration because SharedPreferences is only
    // put in the locator when `configureLocator` was handed a pre-resolved
    // instance — widget tests that skip it get a repository with no mirror
    // rather than a locator throw.
    flagsStore: serviceLocator.isRegistered<StatusProfileFlagsStore>()
        ? serviceLocator<StatusProfileFlagsStore>()
        : null,
  ),
);

/// Shared `GET /status/profile` cache used by BOTH the Status details screen
/// and Profile v2 (TAM-N-profile-v2). One record of truth for
/// `personalDisplayName` + `avatarImageUrl` — either entry point mutates it,
/// the other reads it back on next build.
///
/// The Status details screen keeps ownership of its own edit state (its bloc
/// is populated via [StatusRepository.fetchProfile] directly today); Profile
/// v2 reads THIS provider and calls [Ref.invalidate] after a successful save
/// so any subsequent Status details mount picks up the fresh row.
///
/// Scoped to [authIdentityProvider]. This provider is keepAlive (the legacy
/// `FutureProvider` constructor defaults to `isAutoDispose: false`), and
/// logout does NOT tear down the `ProviderScope` — it just navigates to
/// `/phone-input`. Without the identity watch the cached row outlived the
/// session that produced it: user A logs out, user B logs in on the same
/// device without an app restart, and Profile v2 renders A's
/// `personalDisplayName` + avatar (the phone number next to it updated,
/// because [meProvider] was already identity-scoped) while Edit Profile
/// seeds its name field from A's row — so B could save A's name onto B's
/// own `/status/profile` record.
final statusProfileProvider = FutureProvider<StatusProfileData>((ref) async {
  final identity = ref.watch(authIdentityProvider);
  // Logged out: report the same empty row the API returns when nothing is
  // saved, rather than firing an unauthenticated fetch that would 401.
  if (identity == null) return StatusProfileData.empty;
  final repo = ref.watch(statusRepositoryProvider);
  return repo.fetchProfile();
});

/// The overlay burn-in seam (TAM-72). Defaults to the on-device
/// RepaintBoundary compositor for images and FFmpeg (`ffmpeg_kit_flutter_new`)
/// for video overlay muxing — see [FfmpegStatusRenderService]. Overridden with
/// a `FakeStatusRenderService` in tests so the share state machine runs with
/// no canvas and no device.
final statusRenderServiceProvider = Provider<StatusRenderService>(
  (ref) => const FfmpegStatusRenderService(),
);

/// Per-card video port factory (TAM-72). Defaults to the real `media_kit`
/// impl (software decode via libmpv + FFmpeg — bypasses broken hardware
/// decoders that corrupted user-generated status videos on Xiaomi/MIUI and
/// similar devices). A fake factory is injected in tests.
final statusVideoPortFactoryProvider = Provider<StatusVideoPortFactory>(
  (ref) => MediaKitStatusVideoPort.new,
);

/// Sticky per-session mute preference for status videos (Instagram-style):
/// default MUTED, the user opts into sound via the speaker toggle in the
/// top-right of the active card. All cards in the feed share the same
/// preference, so muting on one card mutes every subsequent card too. Not
/// persisted across app restarts.
class StatusMutedNotifier extends Notifier<bool> {
  @override
  bool build() => true;

  void toggle() => state = !state;
  void set(bool muted) => state = muted;
}

final statusMutedProvider =
    NotifierProvider<StatusMutedNotifier, bool>(StatusMutedNotifier.new);

/// The avatar-source seam (TAM-72). Defaults to the real `image_picker`-backed
/// impl now that `POST /status/profile/avatar/presign` ships. Widget/bloc
/// tests override with `UnavailableStatusAvatarPicker` (offline default) or a
/// deterministic fake.
final statusAvatarPickerProvider = Provider<StatusAvatarPicker>(
  (ref) => ImagePickerStatusAvatarPicker(ref.watch(statusRepositoryProvider)),
);
