import 'package:mobile/features/modals/data/modal_models.dart';
import 'package:mobile/features/modals/data/modals_repository.dart';

/// Deterministic in-memory [ModalsRepository] (TAM-174) so every
/// host/widget test runs offline. Mirrors `fake_horoscope_services.dart`.
class FakeModalsRepository implements ModalsRepository {
  FakeModalsRepository({this.nextModal, this.fetchError, this.reportError});

  /// What `fetchNext` returns — `null` is the ordinary "no modal" answer.
  ServableModalView? nextModal;

  /// When set, `fetchNext` throws this instead of returning [nextModal].
  ModalsException? fetchError;

  /// When set, `reportImpression` throws this instead of recording/returning.
  ModalsException? reportError;

  int fetchCalls = 0;
  String? lastSurface;
  String? lastLocale;

  /// Every impression call this fake received, in order — tests assert on
  /// `action` / `dismissMethod` / `showNumber` here.
  final List<RecordedModalImpression> impressions = <RecordedModalImpression>[];

  @override
  Future<ServableModalView?> fetchNext({
    required String surface,
    String? locale,
  }) async {
    fetchCalls++;
    lastSurface = surface;
    lastLocale = locale;
    final error = fetchError;
    if (error != null) throw error;
    return nextModal;
  }

  @override
  Future<bool> reportImpression({
    required String modalKey,
    required String triggerSource,
    required String action,
    required int showNumber,
    String? dismissMethod,
  }) async {
    final error = reportError;
    if (error != null) throw error;
    impressions.add(
      RecordedModalImpression(
        modalKey: modalKey,
        triggerSource: triggerSource,
        action: action,
        showNumber: showNumber,
        dismissMethod: dismissMethod,
      ),
    );
    return true;
  }
}

class RecordedModalImpression {
  const RecordedModalImpression({
    required this.modalKey,
    required this.triggerSource,
    required this.action,
    required this.showNumber,
    this.dismissMethod,
  });

  final String modalKey;
  final String triggerSource;
  final String action;
  final int showNumber;
  final String? dismissMethod;
}

/// A representative armed modal, mirroring the status-intro-modal seed
/// (`GET /modals/next` → `data.modal`).
ServableModalView statusIntroModalFixture({
  String key = 'modal-1',
  String triggerSource = 'first_time',
  int showNumber = 1,
  String? lastOutcomeModule,
  String title = 'अपनी फोटो और नाम जोड़ें',
  String? body,
  String? imageUrl = 'https://cdn.example.com/status-sample.png',
  String ctaText = 'फोटो जोड़ें',
  String ctaDeeplink = 'prabhuji://status/personal-details',
}) {
  return ServableModalView(
    key: key,
    triggerSource: triggerSource,
    showNumber: showNumber,
    localeServed: 'hi',
    title: title,
    body: body,
    imageUrl: imageUrl,
    ctaText: ctaText,
    ctaDeeplink: ctaDeeplink,
    lastOutcomeModule: lastOutcomeModule,
  );
}
