import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/features/paywall/data/payment_repository.dart';
import 'package:mobile/features/paywall/data/upi_launcher.dart';

/// Test doubles for the payment flow.
///
/// `PaymentBloc` takes both of these as constructor dependencies precisely so
/// the state machine is testable without a platform channel (`url_launcher`
/// needs a real engine) or a live API — and the state machine is the part that
/// most needs coverage, since it decides what a user is told about their money.

/// Scriptable [PaymentRepository].
///
/// `implements` rather than `extends` so the real Dio field is never
/// constructed; private members are not part of the cross-library interface.
class FakePaymentRepository implements PaymentRepository {
  FakePaymentRepository({
    required this.onCreate,
    List<MandateSnapshot?>? pollResults,
  }) : _pollResults = pollResults ?? const [];

  final MandateSnapshot Function() onCreate;
  final List<MandateSnapshot?> _pollResults;

  int createCalls = 0;
  int pollCalls = 0;
  int cancelCalls = 0;

  /// Thrown from `createMandate` when set — the network/server failure path.
  Object? createError;

  @override
  Future<MandateSnapshot> createMandate({required String planId}) async {
    createCalls++;
    final err = createError;
    if (err != null) throw err;
    return onCreate();
  }

  @override
  Future<MandateSnapshot?> getMandate() async {
    // Past the end of the script, keep returning the last value — the bloc
    // polls on a schedule and a short script would otherwise throw mid-run.
    final index = pollCalls < _pollResults.length ? pollCalls : _pollResults.length - 1;
    pollCalls++;
    if (_pollResults.isEmpty) return null;
    return _pollResults[index];
  }

  @override
  Future<MandateSnapshot> cancelMandate() async {
    cancelCalls++;
    return onCreate();
  }

  @override
  Future<String> resolveIntentUrl(String url) async => url;
}

/// [UpiLauncher] that records what it was asked to open, and in which app.
class FakeUpiLauncher implements UpiLauncher {
  FakeUpiLauncher({this.succeeds = true, this.apps = const []});

  final bool succeeds;

  /// Installed apps to report from [listApps]. Empty models an emulator, an
  /// iOS device, or a discovery failure — all of which must degrade to the
  /// plain "let the system choose" flow rather than a broken paywall.
  final List<UpiApp> apps;

  final List<Uri> launched = [];

  /// Package the launch was targeted at, per call. Null = system chooser.
  final List<String?> launchedPackages = [];

  @override
  Future<List<UpiApp>> listApps() async => apps;

  @override
  Future<bool> launch(Uri uri, {String? packageName}) async {
    launched.add(uri);
    launchedPackages.add(packageName);
    return succeeds;
  }
}

/// A stand-in installed UPI app.
UpiApp upiApp({
  String packageName = 'com.example.upi',
  String appName = 'Example UPI',
}) =>
    UpiApp(packageName: packageName, appName: appName, iconPng: null);

/// Build a snapshot with sensible defaults. The amount is an arbitrary positive
/// fixture value, not the live plan price — that is remote config.
MandateSnapshot mandateSnapshot({
  String mandateId = 'mandate-1',
  MandateStateEnum state = MandateStateEnum.pending,
  String? authUrl = 'upi://mandate?pa=test@bank&am=299.00',
  bool isEntitled = false,
  bool requiresReRegistration = false,
  String subscriptionStatus = 'pending',
  DateTime? trialEndsAt,
  String provider = 'razorpay',
  String? paymentReferenceId,
}) {
  return MandateSnapshot(
    mandateId: mandateId,
    provider: provider,
    state: state,
    authUrl: authUrl,
    planId: 'month',
    amountPaise: 29900,
    currency: 'INR',
    requiresReRegistration: requiresReRegistration,
    subscriptionStatus: subscriptionStatus,
    isEntitled: isEntitled,
    trialEndsAt: trialEndsAt,
    nextDebitDate: null,
    paymentReferenceId: paymentReferenceId,
  );
}
