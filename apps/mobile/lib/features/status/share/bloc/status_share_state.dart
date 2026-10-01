import 'package:equatable/equatable.dart';

import '../../data/status_models.dart';

enum StatusShareStatus {
  idle,

  /// Free user — the unified paywall is open. NO render has run.
  awaitingPaywall,

  /// Pro user — the overlay is being burned into the export.
  rendering,

  /// The native share sheet was handed the burned-in file.
  shared,

  /// The paywall was dismissed without a purchase; the card + CTA stay put.
  cancelled,

  /// Recoverable render/share failure — retry offered, stays on the card.
  failed,

  /// This media can't be burned in on this build (q2 video feasibility).
  unsupported,
}

class StatusShareState extends Equatable {
  const StatusShareState({
    this.status = StatusShareStatus.idle,
    this.statusId,
    this.mediaType,
    this.message,
  });

  final StatusShareStatus status;
  final String? statusId;

  /// The media type of the status currently being rendered/shared. Used by
  /// the UI to decide whether to show a blocking "Preparing your video…"
  /// modal (only for video — image renders finish too fast for a modal to
  /// be useful and would just flash on screen).
  final StatusMediaType? mediaType;

  final String? message;

  /// Duplicate Share taps are ignored while the gate or the render is in flight
  /// (PRD §6.8).
  bool get isBusy =>
      status == StatusShareStatus.awaitingPaywall ||
      status == StatusShareStatus.rendering;

  /// Drives the in-CTA progress indicator.
  bool get isRendering => status == StatusShareStatus.rendering;

  /// True when a VIDEO render is in flight — video encoding on-device can
  /// take several seconds. The UI shows a blocking modal for these so the
  /// user doesn't scroll away mid-render and lose the export.
  bool get isRenderingVideo =>
      status == StatusShareStatus.rendering && mediaType == StatusMediaType.video;

  static const String failedCopy =
      'Could not prepare your status. Please try again.';

  /// Shown as a snackbar on the shared card after we clipboarded the caption
  /// because the target's Story intent doesn't accept text (Instagram Story,
  /// Facebook Story, Snapchat). See `losesCaption` on `StoryShareTarget`.
  static const String clipboardHintCopy =
      'Caption copied — long-press in the story composer to paste it.';

  StatusShareState copyWith({
    StatusShareStatus? status,
    String? statusId,
    StatusMediaType? mediaType,
    String? message,
    bool clearMessage = false,
  }) =>
      StatusShareState(
        status: status ?? this.status,
        statusId: statusId ?? this.statusId,
        mediaType: mediaType ?? this.mediaType,
        message: clearMessage ? null : (message ?? this.message),
      );

  @override
  List<Object?> get props => [status, statusId, mediaType, message];
}
