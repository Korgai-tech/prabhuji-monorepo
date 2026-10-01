import 'package:mobile/core/analytics.dart';

/// Structural [Analytics] double — the code under test only calls `trackEvent`;
/// everything else is absorbed by `noSuchMethod`. Records every event so tests
/// can assert the `aarti_bhajans_*` funnel.
class RecordingAnalytics implements Analytics {
  final List<TrackedEvent> events = [];

  List<String> get names => events.map((e) => e.name).toList();
  bool fired(String name) => events.any((e) => e.name == name);
  TrackedEvent? last(String name) =>
      events.where((e) => e.name == name).fold<TrackedEvent?>(null, (_, e) => e);

  /// Properties of the LAST [name] event (empty when it never fired) — the
  /// common "assert this event carried X" shape.
  Map<String, Object?> propsFor(String name) => last(name)?.properties ?? const {};

  /// Every [name] event's properties, in order — for "fired exactly once" and
  /// per-card assertions (e.g. the 2s view threshold).
  List<Map<String, Object?>> allProps(String name) =>
      events.where((e) => e.name == name).map((e) => e.properties).toList();

  @override
  Future<void> trackEvent(
    String name, {
    Map<String, Object?> properties = const {},
    String? asUserId,
  }) async {
    events.add(TrackedEvent(name, properties));
  }

  /// Meta's standard `StartTrial`, recorded rather than absorbed. Needs a
  /// real override: `noSuchMethod` returns `null`, and the `Future<void>`
  /// return type at the call site (`PaymentBloc._succeed`) makes that a
  /// TypeError that aborts the success path mid-flight.
  final List<Map<String, Object?>> facebookStartTrials = [];

  @override
  Future<void> logFacebookStartTrial({
    required String orderId,
    double? price,
    String? currency,
    String? eventId,
  }) async {
    facebookStartTrials.add({
      'orderId': orderId,
      'price': price,
      'currency': currency,
      'eventId': eventId,
    });
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class TrackedEvent {
  TrackedEvent(this.name, this.properties);
  final String name;
  final Map<String, Object?> properties;
}
