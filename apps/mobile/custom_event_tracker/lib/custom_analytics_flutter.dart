/// Public API for the custom analytics tracker.
///
/// Exposes an Amplitude-shaped façade (`Amplitude`, `Identify`, `BaseEvent`,
/// `Revenue`, `EventOptions`, `IdentifyEvent`, `GroupIdentifyEvent`) backed by
/// an HTTP transport that speaks Amplitude's HTTP V2 wire contract — the
/// self-hosted collector on the other end (apps/events) parses that shape.
///
/// The transport, session manager, SQLite queue, retry logic and lifecycle
/// observer are deliberately not re-exported: nothing outside this package
/// should construct them directly. Configure via [CustomConfiguration].
library;

export 'amplitude.dart';
export 'analytics_transport_config.dart'
    show AnalyticsTransportConfig, LogLevel;
export 'constants.dart' show Constants;
export 'custom_configuration.dart';
export 'default_tracking.dart';
export 'direct_event_sender.dart';
export 'events/base_event.dart';
export 'events/event_options.dart';
export 'events/group_identify_event.dart';
export 'events/identify.dart';
export 'events/identify_event.dart';
export 'events/ingestion_metadata.dart';
export 'events/revenue.dart';
export 'events/revenue_event.dart';
