import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';

import 'status_repository.dart';

/// Outcome of an avatar pick.
enum StatusAvatarPickStatus {
  /// The user chose an image and we resolved a URL the API will accept.
  picked,

  /// The user backed out of the picker.
  cancelled,

  /// The picker ran and attempted an upload but it failed — the presign call,
  /// the S3 PUT, or the response parse. `errorCode` on the result narrows the
  /// cause for the funnel; the toast copy is the same as `unavailable`.
  failed,

  /// No upload path exists in this build — see [UnavailableStatusAvatarPicker].
  unavailable,
}

class StatusAvatarPickResult {
  const StatusAvatarPickResult.picked(String this.imageUrl)
      : status = StatusAvatarPickStatus.picked,
        errorCode = null;

  const StatusAvatarPickResult.cancelled()
      : status = StatusAvatarPickStatus.cancelled,
        imageUrl = null,
        errorCode = null;

  /// Real upload attempted but failed. [errorCode] is one of the stable slugs
  /// documented on the picker's catch branches; the funnel keys on it to
  /// separate S3 rejections from network drops from parse errors.
  const StatusAvatarPickResult.failed(String this.errorCode)
      : status = StatusAvatarPickStatus.failed,
        imageUrl = null;

  const StatusAvatarPickResult.unavailable()
      : status = StatusAvatarPickStatus.unavailable,
        imageUrl = null,
        errorCode = null;

  final StatusAvatarPickStatus status;

  /// A PUBLIC URL for `StatusProfileBody.avatarImageUrl` — the ONLY avatar shape
  /// the TAM-71 contract accepts.
  final String? imageUrl;

  /// Stable slug for [StatusAvatarPickStatus.failed] — reported to analytics so
  /// dashboards can distinguish S3 rejections from network drops from parse
  /// errors. Null for every other status.
  final String? errorCode;
}

/// The avatar-source seam for the details form (Figma `371:3556` — the 128px
/// circle + camera badge).
///
/// Two impls:
///  * [ImagePickerStatusAvatarPicker] — production default. Opens the Android
///    photo picker, presigns via `POST /status/profile/avatar/presign`, PUTs to
///    S3, and returns the durable public URL.
///  * [UnavailableStatusAvatarPicker] — offline default for widget/bloc tests
///    that don't want to touch platform channels or the network. Resolves
///    [StatusAvatarPickStatus.unavailable] so the "try again" copy renders
///    without the picker actually running.
abstract interface class StatusAvatarPicker {
  Future<StatusAvatarPickResult> pickAvatar();
}

/// Phase-1 default: there is no upload path (see the class doc above).
class UnavailableStatusAvatarPicker implements StatusAvatarPicker {
  const UnavailableStatusAvatarPicker();

  @override
  Future<StatusAvatarPickResult> pickAvatar() async =>
      const StatusAvatarPickResult.unavailable();
}

/// Real avatar picker (TAM-71 finding #1 closer). Opens the Android photo
/// picker via `image_picker`, streams the bytes to the presigned S3 URL
/// minted by `POST /status/profile/avatar/presign`, and returns the durable
/// public URL. The following save via `PUT /status/profile` writes it into
/// `avatarImageUrl`.
///
/// Failures resolve to [StatusAvatarPickStatus.failed] with a specific
/// `errorCode` (see the catch branches). Cancellation (user backs out of the
/// picker) reports [StatusAvatarPickStatus.cancelled] — silent, no toast.
class ImagePickerStatusAvatarPicker implements StatusAvatarPicker {
  ImagePickerStatusAvatarPicker(this._repository, {ImagePicker? picker, Dio? uploadDio})
      : _picker = picker ?? ImagePicker(),
        _upload = uploadDio ?? Dio();

  final StatusRepository _repository;
  final ImagePicker _picker;
  final Dio _upload;

  @override
  Future<StatusAvatarPickResult> pickAvatar() async {
    final XFile? xfile;
    final Uint8List bytes;
    final String contentType;
    try {
      xfile = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 90,
      );
      if (xfile == null) return const StatusAvatarPickResult.cancelled();
      bytes = await xfile.readAsBytes();
      contentType = _guessContentType(xfile.name);
    } catch (e, st) {
      _debug('pick failed', e, st);
      return const StatusAvatarPickResult.failed('picker_error');
    }

    final AvatarPresignResult presign;
    try {
      presign = await _repository.presignAvatar(
        contentType: contentType,
        sizeBytes: bytes.length,
      );
    } on DioException catch (e, st) {
      _debug('presign network failed', e, st);
      return StatusAvatarPickResult.failed(_classifyDioError(e, 'presign'));
    } catch (e, st) {
      _debug('presign failed', e, st);
      return const StatusAvatarPickResult.failed('presign_failed');
    }

    try {
      // PUT the bytes to S3 with the signed headers verbatim. Pass the
      // Uint8List directly (NOT Stream.fromIterable) so Dio sets Content-Length
      // from the body length. A Stream body sends Transfer-Encoding: chunked,
      // which S3 rejects on a presigned PUT.
      await _upload.put<void>(
        presign.uploadUrl,
        data: bytes,
        options: Options(
          headers: presign.headers,
          contentType: contentType,
        ),
      );
    } on DioException catch (e, st) {
      _debug('s3 upload failed', e, st);
      return StatusAvatarPickResult.failed(_classifyDioError(e, 's3'));
    } catch (e, st) {
      _debug('s3 upload failed', e, st);
      return const StatusAvatarPickResult.failed('s3_unexpected');
    }

    return StatusAvatarPickResult.picked(presign.publicUrl);
  }

  /// Map a Dio failure to a stable analytics slug. Prefix separates the two
  /// call sites so `s3_rejected_403` and `presign_rejected_403` are distinct.
  String _classifyDioError(DioException e, String prefix) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return '${prefix}_timeout';
      case DioExceptionType.connectionError:
        return '${prefix}_offline';
      case DioExceptionType.cancel:
        return '${prefix}_cancelled';
      case DioExceptionType.badCertificate:
        return '${prefix}_bad_cert';
      case DioExceptionType.badResponse:
        final code = e.response?.statusCode;
        return code != null ? '${prefix}_rejected_$code' : '${prefix}_rejected';
      case DioExceptionType.unknown:
        return '${prefix}_unknown';
      default:
        return '${prefix}_unknown';
    }
  }

  void _debug(String label, Object e, StackTrace st) {
    if (kDebugMode) {
      debugPrint('[status:avatar-picker] $label: $e\n$st');
    }
  }

  String _guessContentType(String filename) {
    final ext = filename.contains('.')
        ? filename.split('.').last.toLowerCase()
        : '';
    switch (ext) {
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      default:
        // The picker returns compressed JPEG by default (imageQuality: 90),
        // so JPEG is the correct fallback for the common path.
        return 'image/jpeg';
    }
  }
}


/// Copy shown when the picker can't complete the upload. Kept generic so it
/// works both when the seam is the "unavailable" stub (tests / harnesses) and
/// when the real picker hits a network error or S3 rejection — the user's
/// action is the same in both cases: try again.
const String kAvatarUploadUnavailableCopy =
    'Couldn’t upload that photo. Please check your connection and try again.';
