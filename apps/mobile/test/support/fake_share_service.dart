import 'package:mobile/core/share_service.dart';

/// Recording double for [ShareService] (flutter-feed-screen.md: platform-channel
/// boundaries get an interface + fake). Captures the last [ShareContent] so
/// tests can assert the share carried a deep link + thumbnail and — by the
/// interface's shape — never a raw media file.
class FakeShareService implements ShareService {
  FakeShareService({
    this.failRenderedShare = false,
    this.shareOutcome = const ShareOutcome(
      status: ShareOutcomeStatus.success,
      destination: 'com.whatsapp/com.whatsapp.ContactPicker',
    ),
  });

  final List<ShareContent> shares = [];

  /// What [share] reports back. Defaults to a WhatsApp success — the primary
  /// target — so destination-reporting call sites are exercised by default;
  /// override with [ShareOutcome.dismissed] / [ShareOutcome.unavailable] to
  /// drive the platform-can't-tell-us paths.
  ShareOutcome shareOutcome;

  /// Rendered-file shares (TAM-72 status overlay exports). Recorded separately
  /// so a test can assert the burned-in FILE — not a link — reached the sheet.
  final List<RenderedShareContent> renderedShares = [];

  /// Simulates "no share target" / a sheet failure (TAM-72 PRD §6.8).
  bool failRenderedShare;

  ShareContent? get lastShare => shares.isEmpty ? null : shares.last;

  RenderedShareContent? get lastRenderedShare =>
      renderedShares.isEmpty ? null : renderedShares.last;

  @override
  Future<ShareOutcome> share(ShareContent content) async {
    shares.add(content);
    return shareOutcome;
  }

  @override
  Future<void> shareRenderedFile(RenderedShareContent content) async {
    if (failRenderedShare) throw Exception('no share target');
    renderedShares.add(content);
  }
}

/// Lets a test hold onto the EXACT [FakeShareService] instance the widget tree
/// uses, so it can assert what reached the sheet after the tree built it.
///
/// Lives here (not in a per-module harness) because every module's harness needs
/// the same handle — Status/TAM-72 first, Home/TAM-62 next.
class ShareServiceHolder {
  ShareServiceHolder([FakeShareService? service])
      : service = service ?? FakeShareService();
  final FakeShareService service;
}
