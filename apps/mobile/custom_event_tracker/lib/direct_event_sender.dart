import 'package:http/http.dart' as http;

import 'custom_configuration.dart';
import 'events/base_event.dart';
import 'http_network_service.dart';
import 'local_state_store.dart';

/// Fire-once sender for contexts where a full [Amplitude] instance must not
/// run — chiefly the FCM background isolate, where opening the SQLite queue
/// or registering lifecycle observers would compete with a main isolate in
/// the same process.
///
/// Identity comes from the same persisted store [Amplitude] writes, so an
/// event sent here carries the `user_id` / `device_id` the app last used.
/// Nothing is queued: [send] throws on failure and the caller decides whether
/// to keep the event for later.
class DirectEventSender {
  DirectEventSender(this.configuration);

  final CustomConfiguration configuration;

  Future<void> send(BaseEvent event) async {
    final store = LocalStateStore(configuration.instanceName);
    event.userId ??= await store.getUserId();
    event.deviceId ??= await store.getOrCreateDeviceId();
    final client = http.Client();
    try {
      await HttpNetworkService(configuration, httpClient: client)
          .sendNow([event]);
    } finally {
      client.close();
    }
  }
}
