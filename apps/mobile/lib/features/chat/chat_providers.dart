import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/service_locator.dart';
import 'data/chat_counters.dart';
import 'data/chat_repository.dart';
import 'data/chat_video_port.dart';

/// The Chat data seam (TAM-164). Backed by the shared auth-injecting [Dio]
/// singleton registered in `configureLocator` — no separate get_it seat, and
/// no manual header wiring: the auth interceptor, device-header interceptor
/// and locale interceptor all ride along.
///
/// Overridable in tests with a `FakeChatRepository`.
final chatRepositoryProvider = Provider<ChatRepository>(
  (ref) => ChatRepository(serviceLocator<Dio>()),
);

/// SharedPreferences-backed counters for the chat analytics schema
/// (TAM-166 Phase 1) — `open_count` on `chat_page_viewed`,
/// `free_chat_consumed` (§13), and `voice_permission_ask_count` on
/// `chat_voice_permission_result`. Reads the app-wide
/// [SharedPreferences] out of the service locator.
final chatCountersProvider = Provider<ChatCounters>(
  (ref) => ChatCounters(serviceLocator<SharedPreferences>()),
);

/// Factory for the in-thread intro video player (TAM-177), matching
/// `statusVideoPortFactoryProvider`. A FACTORY rather than a singleton because
/// the card owns one player for its own lifetime and disposes it — and because
/// tests override this with `FakeChatVideoPort.new` to keep `media_kit` out of
/// the widget tree (`MediaKit.ensureInitialized()` never runs under
/// `flutter test`, so a real `Player()` throws).
final chatVideoPortFactoryProvider = Provider<ChatVideoPortFactory>(
  (ref) => MediaKitChatVideoPort.new,
);
