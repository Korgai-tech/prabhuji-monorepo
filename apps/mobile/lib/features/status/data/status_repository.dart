import 'package:dio/dio.dart';

import '../../../api/api_client.dart';
import '../../../api/generated/openapi.dart';
import 'status_models.dart';
import 'status_profile_flags_store.dart';

/// Data seam for the Status module (TAM-72). The concrete impl maps the TAM-71
/// contract through the generated api-client types (no `dynamic`); a
/// deterministic `FakeStatusRepository` (test support) swaps in so every UI
/// surface + bloc test runs offline.
abstract interface class StatusRepository {
  /// `GET /status/feed` → one cursor-paginated page, optionally filtered by
  /// [deityId] (`null` == All Gods, no filter). [pinnedId], when set on the
  /// FIRST page request only, asks the backend to prepend that status card to
  /// the top of the returned list and dedupe it from the tail (fail-soft: a
  /// missing/filtered pin is ignored, feed still renders). Ignored on cursor
  /// pages by the backend; defense-in-depth: callers should still omit it
  /// after the first call.
  Future<StatusFeedPage> fetchFeed({
    String? deityId,
    String? cursor,
    int limit,
    String? pinnedId,
  });

  /// `GET /status/{id}` → one status card by id. Used by the chat
  /// recommendation → status player deep link (mirrors the wallpaper
  /// detail fetch pattern). Same wire shape as a feed item, so callers
  /// can build a single-item [StatusFeedItem] via [StatusFeedItem.fromCard].
  Future<StatusFeedItem> fetchDetail(String id);

  /// `GET /status/profile` → the user's overlay profile (the API returns an
  /// empty personal profile when nothing is saved).
  Future<StatusProfileData> fetchProfile();

  /// `PUT /status/profile` → saves + flips the active profile type. Only the
  /// fields for [profile]'s active face are sent.
  Future<StatusProfileData> saveProfile(StatusProfileData profile);

  /// `POST /status/{id}/like` → toggles + returns the new like state.
  Future<StatusLikeOutcome> toggleLike(String id);

  /// `POST /status/{id}/view` → records a view (fired after the 2s threshold)
  /// and returns the new count.
  Future<int> recordView(String id);

  /// `POST /status/profile/avatar/presign` → mint a scoped presigned S3 PUT
  /// URL for the caller's avatar. The client uploads bytes to [uploadUrl] with
  /// the returned signed [headers], then saves [publicUrl] as `avatarImageUrl`
  /// on the next `PUT /status/profile`.
  Future<AvatarPresignResult> presignAvatar({
    required String contentType,
    required int sizeBytes,
  });

  /// `POST /reports` → files a report against a status or the account it is
  /// attributed to (TAM-N).
  ///
  /// Note what is NOT sent: the reported account. The server resolves it from
  /// [statusId], so a client cannot name a victim. Adding it here would be
  /// silently ignored by the contract — do not "fix" that.
  Future<void> submitReport({
    required String statusId,
    required String type,
    required String reporterEmail,
    required String reason,
  });
}

/// Fields the mobile picker cares about from the presign response.
class AvatarPresignResult {
  const AvatarPresignResult({
    required this.uploadUrl,
    required this.publicUrl,
    required this.headers,
  });
  final String uploadUrl;
  final String publicUrl;
  final Map<String, String> headers;
}

/// Dio-backed implementation over the TAM-71 contract.
class DioStatusRepository implements StatusRepository {
  // `prefer_initializing_formals` can't apply: a named parameter may not start
  // with an underscore, so `this._flagsStore` is not expressible here.
  DioStatusRepository(this._dio, {StatusProfileFlagsStore? flagsStore})
      // ignore: prefer_initializing_formals
      : _flagsStore = flagsStore;
  final Dio _dio;

  /// Write-through mirror for the global `has_name` / `has_photo` analytics
  /// properties. Every [StatusProfileData] the app obtains comes out of
  /// [fetchProfile] or [saveProfile], so mirroring HERE — rather than at each
  /// of the five call sites that load a profile — is what makes the two
  /// global properties impossible to forget.
  ///
  /// Null when SharedPreferences wasn't resolved (widget tests, degraded
  /// boot): the flags simply stay at their last-known value and the enricher
  /// keeps reporting `false`. Analytics must never break a data call.
  final StatusProfileFlagsStore? _flagsStore;

  static const int defaultLimit = 20;

  @override
  Future<StatusFeedPage> fetchFeed({
    String? deityId,
    String? cursor,
    int limit = defaultLimit,
    String? pinnedId,
  }) async {
    final res = await _dio.get<dynamic>(
      '/status/feed',
      queryParameters: {
        'deityId': ?deityId,
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
        'limit': limit,
        if (pinnedId != null && pinnedId.isNotEmpty) 'pinnedId': pinnedId,
      },
    );
    final response = StatusFeedResponse.fromJson(_envelope(res));
    if (response == null) throw ApiException('Malformed response');
    return StatusFeedPage(
      items:
          response.data.items.map(StatusFeedItem.fromCard).toList(growable: false),
      nextCursor: response.data.nextCursor,
    );
  }


  @override
  Future<StatusFeedItem> fetchDetail(String id) async {
    final res = await _dio.get<dynamic>('/status/$id');
    final response = StatusCardResponse.fromJson(_envelope(res));
    if (response == null) throw ApiException('Malformed response');
    return StatusFeedItem.fromCard(response.data);
  }

  @override
  Future<StatusProfileData> fetchProfile() async {
    final res = await _dio.get<dynamic>('/status/profile');
    final response = StatusProfileResponse.fromJson(_envelope(res));
    if (response == null) throw ApiException('Malformed response');
    return _mirrorFlags(StatusProfileData.fromWire(response.data));
  }

  @override
  Future<StatusProfileData> saveProfile(StatusProfileData profile) async {
    // Send only the ACTIVE face's fields — the contract requires
    // `activeProfileType` and treats the rest as optional partials, so a
    // personal save never clobbers stored business copy (and vice versa).
    final body = StatusProfileBody(
      activeProfileType: profile.activeProfileType.body,
      personalDisplayName: profile.activeProfileType == StatusProfileType.personal
          ? profile.personalDisplayName?.trim()
          : null,
      businessName: profile.activeProfileType == StatusProfileType.business
          ? profile.businessName?.trim()
          : null,
      businessDetails: profile.activeProfileType == StatusProfileType.business
          ? _blankToNull(profile.businessDetails)
          : null,
      businessMobileNumber: profile.activeProfileType == StatusProfileType.business
          ? _blankToNull(profile.businessMobileNumber)
          : null,
      avatarImageUrl: _blankToNull(profile.avatarImageUrl),
    );
    final res = await _dio.put<dynamic>(
      '/status/profile',
      data: body.toJson(),
    );
    final response = StatusProfileResponse.fromJson(_envelope(res));
    if (response == null) throw ApiException('Malformed response');
    return _mirrorFlags(StatusProfileData.fromWire(response.data));
  }

  /// Mirror the profile's presence flags into the analytics store, then hand
  /// the profile straight back so call sites read as before. Deliberately
  /// mirrors the SERVER's echo of the record, never the optimistic local one —
  /// a save that silently drops a field must not leave the flags claiming it
  /// landed.
  StatusProfileData _mirrorFlags(StatusProfileData profile) {
    _flagsStore?.mirror(profile);
    return profile;
  }

  @override
  Future<StatusLikeOutcome> toggleLike(String id) async {
    final res = await _dio.post<dynamic>('/status/$id/like');
    final response = StatusLikeResponse.fromJson(_envelope(res));
    if (response == null) throw ApiException('Malformed response');
    return StatusLikeOutcome(
      liked: response.data.liked,
      likeCount: response.data.likeCount,
    );
  }

  @override
  Future<int> recordView(String id) async {
    final res = await _dio.post<dynamic>('/status/$id/view');
    final response = StatusViewResponse.fromJson(_envelope(res));
    if (response == null) throw ApiException('Malformed response');
    return response.data.viewCount;
  }

  @override
  Future<AvatarPresignResult> presignAvatar({
    required String contentType,
    required int sizeBytes,
  }) async {
    final body = StatusAvatarPresignBody(
      contentType: contentType,
      sizeBytes: sizeBytes,
    );
    final res = await _dio.post<dynamic>(
      '/status/profile/avatar/presign',
      data: body.toJson(),
    );
    final response = StatusAvatarPresignResponse.fromJson(_envelope(res));
    if (response == null) throw ApiException('Malformed response');
    return AvatarPresignResult(
      uploadUrl: response.data.uploadUrl,
      publicUrl: response.data.publicUrl,
      headers: Map<String, String>.from(response.data.headers),
    );
  }

  @override
  Future<void> submitReport({
    required String statusId,
    required String type,
    required String reporterEmail,
    required String reason,
  }) async {
    final body = CreateReportBody(
      type: ReportType.fromJson(type)!,
      statusId: statusId,
      reporterEmail: reporterEmail,
      reason: reason,
    );
    final res = await _dio.post<dynamic>('/reports', data: body.toJson());
    // `_envelope` throws on `success != true`, which is what surfaces the
    // server's message to the sheet. The returned report id is of no use to the
    // app — nothing reads reports back — so it is deliberately dropped.
    _envelope(res);
  }

  static String? _blankToNull(String? v) {
    final t = (v ?? '').trim();
    return t.isEmpty ? null : t;
  }

  static Map<String, dynamic> _envelope(Response<dynamic> res) {
    final body = res.data;
    if (body is! Map<String, dynamic>) throw ApiException('Malformed response');
    if (body['success'] != true) {
      throw ApiException(body['message']?.toString() ?? 'Request failed');
    }
    return body;
  }
}
