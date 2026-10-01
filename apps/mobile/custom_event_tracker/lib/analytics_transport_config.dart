import 'default_tracking.dart';

/// Log level for the HTTP transport's debug output.
enum LogLevel {
  verbose,
  debug,
  info,
  warn,
  error,
}

/// Runtime-honored configuration for the custom analytics HTTP transport.
///
/// Speaks Amplitude's HTTP V2 wire contract (`POST <serverUrl>` with a body of
/// `{api_key, client_upload_time, events: [...]}`) — the collector on the
/// other end parses that shape. The gRPC-only fields the krutyug fork used
/// (grpcHost / grpcPort / grpcSecure) are gone; [serverUrl] is the single
/// endpoint the transport POSTs to.
class AnalyticsTransportConfig {
  /// Full URL the batched events POST to (e.g.
  /// `https://events.example.com/2/httpapi`).
  String serverUrl;

  String apiKey;

  /// Tenant identifier sent as the `x-tenant-id` HTTP header on every batch
  /// POST. Multi-tenant collectors use this to route events to the correct
  /// warehouse. Null → header is omitted (single-tenant collectors ignore it).
  String? tenantId;

  /// Max events per single flush batch read from SQLite.
  int flushQueueSize;

  /// Periodic flush interval in milliseconds.
  int flushIntervalMillis;

  late String instanceName;

  bool optOut;

  LogLevel logLevel;

  int flushMaxRetries;

  /// Background inactivity before a session expires (Amplitude mobile rule).
  int minTimeBetweenSessionsMillis;

  /// When true, registers a lifecycle observer for session transitions.
  DefaultTrackingOptions defaultTracking;

  /// When true, flushes queued events on the first background transition per episode.
  bool flushEventsOnClose;

  /// Optional identity seeds; [LocalStateStore] owns persisted values.
  String? deviceId;
  String? userId;

  /// Extra HTTP headers merged onto every POST (e.g. `x-app-version`).
  Map<String, String> customHeaders;

  /// HTTP request timeout in milliseconds.
  int requestTimeoutMillis;

  AnalyticsTransportConfig({
    required this.serverUrl,
    required this.apiKey,
    this.tenantId,
    this.flushQueueSize = 30,
    this.flushIntervalMillis = 30000,
    String instanceName = '',
    this.optOut = false,
    this.logLevel = LogLevel.warn,
    this.flushMaxRetries = 5,
    this.minTimeBetweenSessionsMillis =
        AnalyticsTransportConfig.defaultSessionTimeoutMillis,
    this.defaultTracking = const DefaultTrackingOptions(sessions: true),
    this.flushEventsOnClose = true,
    this.deviceId,
    this.userId,
    this.customHeaders = const {},
    this.requestTimeoutMillis = 30000,
  }) {
    this.instanceName =
        instanceName.isEmpty ? 'default_instance' : instanceName;
  }

  static const int defaultSessionTimeoutMillis = 30 * 60 * 1000;

  bool get trackSessions => defaultTracking.sessions;

  Map<String, dynamic> toMap() {
    return {
      'serverUrl': serverUrl,
      'apiKey': apiKey,
      'tenantId': tenantId,
      'flushQueueSize': flushQueueSize,
      'flushIntervalMillis': flushIntervalMillis,
      'instanceName': instanceName,
      'optOut': optOut,
      'logLevel': logLevel.name,
      'flushMaxRetries': flushMaxRetries,
      'minTimeBetweenSessionsMillis': minTimeBetweenSessionsMillis,
      'defaultTracking': defaultTracking.toMap(),
      'flushEventsOnClose': flushEventsOnClose,
      'deviceId': deviceId,
      'userId': userId,
      'customHeaders': customHeaders,
      'requestTimeoutMillis': requestTimeoutMillis,
      'library': 'custom-analytics-flutter/1.0.0',
    };
  }
}

/// Backward-compatible alias used by the app and package exports.
typedef CustomConfiguration = AnalyticsTransportConfig;
