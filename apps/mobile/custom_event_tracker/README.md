# Custom Analytics Flutter SDK

This package is the Tamasha custom tracker used by the app instead of the upstream `amplitude_flutter` backend flow.

## What This Package Does

- stores events, identify calls, and group calls locally in SQLite
- persists user ID, device ID, and opt-out state locally
- flushes queued analytics data over gRPC
- owns session lifecycle (`session_start` / `session_end`) and background flush via `SessionLifecycleObserver`
- supports track, identify, group, revenue, flush, reset, and opt-out at the tracker level

The app normally does not call this package directly. Most app code goes through:

- `lib/core/analytics/analytics_tracker.dart`
- `lib/core/analytics/analytics_service.dart`

## Runtime Configuration (`AnalyticsTransportConfig`)

Only these fields are read by the Dart SDK:

| Field | Purpose |
|-------|---------|
| `serverUrl` | Parsed by the app for gRPC host/port |
| `apiKey` | gRPC `x-api-key` header |
| `flushQueueSize` | Max rows per flush batch |
| `flushIntervalMillis` | Periodic flush timer |
| `instanceName` | SQLite + SharedPreferences namespace |
| `optOut` | Suppresses track + flush |
| `logLevel` | Debug logging threshold |
| `flushMaxRetries` | Drop rows after N failed sends |
| `minTimeBetweenSessionsMillis` | Background session timeout (default 30 min) |
| `defaultTracking.sessions` | Enable session FSM + lifecycle observer |
| `flushEventsOnClose` | Flush once per background episode |
| `deviceId` / `userId` | Identity seeds (persisted by `LocalStateStore`) |
| `customHeaders` | App metadata on gRPC requests |
| `grpcHost` / `grpcPort` / `grpcSecure` | gRPC transport |

`CustomConfiguration` is a typedef alias for backward compatibility.

## Example

```dart
final config = CustomConfiguration(
  serverUrl: 'https://analytics.example.com:443',
  apiKey: 'analytics_api_key',
  instanceName: 'krutyug_app',
  flushQueueSize: 50,
  flushIntervalMillis: 30000,
  minTimeBetweenSessionsMillis: 30 * 60 * 1000,
  flushEventsOnClose: true,
  defaultTracking: const DefaultTrackingOptions(sessions: true),
  customHeaders: {
    'X-App-Version': '123',
    'X-App-ID': 'com.example.app',
    'X-Workspace-ID': 'workspace_1',
  },
  grpcHost: 'analytics.example.com',
  grpcPort: 443,
  grpcSecure: true,
);

final tracker = Amplitude(config);
await tracker.isBuilt;
```

## Transport Model

- protobuf contract: `protos/analytics.proto`
- generated Dart files: `lib/generated/`
- runtime sender: `lib/grpc_network_service.dart`

Each flushed event JSON includes `time` (event timestamp) and `client_upload_time` (flush time).

## Local Behavior

- queue storage: `lib/event_storage.dart`
- session FSM: `lib/session_manager.dart`
- lifecycle bridge: `lib/session_lifecycle_observer.dart`
- local user/device/opt-out state: `lib/local_state_store.dart`

## Architecture

See [../../docs/adr/0001-analytics-transport-ownership.md](../../docs/adr/0001-analytics-transport-ownership.md).

## Related Docs

- [../GRPC_SETUP_GUIDE.md](../GRPC_SETUP_GUIDE.md)
- [../ANALYTICS_USAGE_GUIDE.md](../ANALYTICS_USAGE_GUIDE.md)
