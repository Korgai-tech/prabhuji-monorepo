import 'package:dio/dio.dart';

import '../../../api/api_client.dart';
import '../../../api/generated/openapi.dart';
import '../../chat/data/chat_counters.dart';

/// Chat A/B config projected off `GET /users/me`'s `chatConfig` sub-object
/// (TAM-164). `enabled == true` implies `agentId != null` (backend invariant,
/// `chat.service.ts:99-113`). Consumers gate the visible nav row on
/// [MeChatConfig.enabled] and pass [MeChatConfig.agentId] verbatim as the
/// `agentId` field on `POST /chat/messages` — never a hard-coded provider id.
///
/// Kept a plain value type so the shell/bloc don't take a dependency on the
/// generated `UsersChatConfig` model.
///
/// TAM-166 — the `kuldevtaAssigned` flag is the launch-payload branch the
/// shell reads to decide between "open the persona chat directly" and "run
/// the six-question discovery flow first". Only meaningful when `agentId`
/// is the kuldevta persona agent (`chat.constants.ts:34`); outside that
/// A/B arm it is always `false` (server-side invariant at
/// `apps/api/src/core/chat/services/chat.service.ts:106-124`).
class MeChatConfig {
  const MeChatConfig({
    required this.enabled,
    required this.agentId,
    this.chatType,
    this.showKuldevtaChat = false,
    this.kuldevtaAssigned = false,
    this.kuldevtaName,
    this.requiresPro = false,
  });

  final bool enabled;
  final String? agentId;

  /// Opaque bucket label the server hands the client so analytics can group
  /// events by chat variant (kuldevta / bhagwat-gita / content / control /
  /// …). Read verbatim as a `String` — the mobile layer never enumerates the
  /// values; the warehouse groups on whatever the server emits. Persisted via
  /// [ChatCounters.saveChatType] so it rides on chat events even when the
  /// live `/users/me` cache hasn't resolved yet.
  ///
  /// Nullable and defaulted to null so a stage server whose `/users/me`
  /// predates the field rolls out cleanly — a missing key reads as "no
  /// bucket assigned" and consumers omit the property from event fires
  /// rather than sending an empty string that would look like a real value
  /// in the funnel.
  final String? chatType;

  /// TAM-166 — the assigned deity's roman name (e.g. "Nagnechi Mata"),
  /// published on `chatConfig` from `/users/me`. Only meaningful when
  /// `kuldevtaAssigned == true`; null in every other case. The chat
  /// screen's `_AppBar` uses this on the assigned-path cold launch
  /// (where the fresh-handoff `kuldevtaChatHandoffProvider` is empty)
  /// to render a name-only variant of the persona header instead of
  /// falling back to the generic "Prabhuji Chat" title.
  ///
  /// Auto-persisted via `ChatCounters.saveKuldevtaName` so the value
  /// survives a cold launch until the next successful `/users/me`
  /// fetch overwrites it — keeps the "fresh /users/me is the source
  /// of truth" invariant intact (memory:
  /// `feedback_users_me_source_of_truth.md`).
  final String? kuldevtaName;

  /// TAM-166 — the EXPLICIT server-side gate for the whole kuldevta-chat
  /// experience. `true` means "this user is qualified for the kuldevta
  /// discovery + persona chat surface" (whatever backend rule decides that
  /// — A/B arm, plan tier, allowlist, etc.). Consumers use this instead of
  /// checking `agentId == kKuldevtaPersonaAgentId`, so the client no
  /// longer needs to know the provider's persona-agent id.
  ///
  /// Defaults to `false` so a stage server whose `/users/me` predates the
  /// field rolls out cleanly — a missing key reads as "not qualified" and
  /// the discovery flow / persona header stay hidden.
  final bool showKuldevtaChat;

  /// TAM-166 — `true` when the user has completed kuldevta-khoj, so the
  /// shell can skip the discovery flow and open the chat surface directly.
  /// Defaults to `false` so a stage server whose `/users/me` predates the
  /// rollout resolves to "not yet assigned" (matches the backend's
  /// fail-soft intent — the discovery flow is what fills the gap for users
  /// in the `kuldevta_chat` arm).
  final bool kuldevtaAssigned;

  /// Whether chat is Pro-gated for this user — the server's `requiresPro`,
  /// mirroring the `CHAT_REQUIRES_PRO` switch in
  /// `apps/api/src/core/chat/services/chat.constants.ts`.
  ///
  /// This is the ONLY input to the three chat paywall gates; see
  /// `features/chat/chat_paywall.dart`, which is the only place that should
  /// read it. `false` today: chat is free in every arm.
  ///
  /// Defaults to `false` — UNGATED — which is deliberately the opposite
  /// default to [showKuldevtaChat] and [kuldevtaAssigned]. Those hide a
  /// surface when the server is silent, so "unknown" costs a user nothing.
  /// This one would CHARGE a user when the server is silent, and a paywall
  /// shown on a stale/blank payload is a far worse failure than a free chat
  /// — so silence reads as "don't gate". A server that wants the gate must
  /// say so on every payload.
  final bool requiresPro;
}

/// TAM-258/259 — where the server says this app open should land.
///
/// The app OBEYS this: no buckets, no UTM reading, no one-shot bookkeeping.
/// All of it is server-side, which is what lets the codes, the bucket ranges,
/// the arms AND the destinations change without an app release.
///
/// [deeplink] is the only field that does anything. The other three are
/// analytics dimensions, forwarded VERBATIM on `app_route_decided` and never
/// branched on — [module] and [source] because the server owns their
/// vocabulary and may add values this build predates, [utmCode] because the
/// ad codes are placeholders that will be renamed and a client-side allowlist
/// would silently blank the new ones.
class MeLanding {
  const MeLanding({
    required this.deeplink,
    required this.module,
    required this.source,
    required this.utmCode,
  });

  /// An app deep link (`prabhuji://ringtone/<id>`), or `''` for "land where you
  /// normally would" — which is Home.
  ///
  /// Handed straight to `parseDeepLink`, so a slug this build does not know
  /// resolves to `UnknownDeepLink` → `/home`. That is what makes the contract
  /// forward-safe: a server serving a destination a release predates degrades
  /// to today's behaviour instead of breaking.
  final String deeplink;

  /// Analytics label for the destination (`status`, `ringtone`, `home`, …).
  /// Server-derived from [deeplink]; never recomputed here, or the two could
  /// disagree and the funnel would believe the client.
  final String module;

  /// Why the server picked it (`utm_matched`, `bucket_assigned`,
  /// `not_in_experiment`, …).
  final String source;

  /// The ad code the server read (`STS`, `RTG`), or `''`.
  final String utmCode;

  /// `true` when the server actually named a destination. `''` is the server's
  /// "no landing" and must not be handed to the deep-link path — parsing it
  /// would be an `UnknownDeepLink` and fire the Home fallback for what is
  /// simply the default case.
  bool get hasDestination => deeplink.isNotEmpty;
}

/// Domain-shaped user snapshot the orchestrator consumes. Fields kept close to
/// the generated `UsersPublicUser` DTO so future codegen swaps stay flat.
class MeUser {
  const MeUser({
    required this.id,
    required this.name,
    required this.selectedLanguage,
    required this.onboardingCompletedAt,
    required this.phoneCountryCode,
    required this.phoneNumber,
    this.chatConfig,
    this.landing,
  });

  final String id;
  final String? name;

  /// The raw ISO code as the SERVER stores it — deliberately a `String`, not the
  /// generated `LanguageCode` enum. The supported set is served at runtime
  /// (`GET /languages`), so it can legitimately contain a code this build's
  /// codegen predates; decoding through the enum would silently turn such a code
  /// into `null` and lose the user's choice.
  final String? selectedLanguage;
  final DateTime? onboardingCompletedAt;
  final String? phoneCountryCode;

  /// The user's real number. The server stores it in plaintext now (it was a
  /// one-way hash before), which is what makes payment notifications possible —
  /// and this is the app's only identity fact about its own user, since a phone
  /// account has no email.
  final String? phoneNumber;

  /// TAM-164 — chat A/B config off `GET /users/me`. Nullable at the domain
  /// layer to tolerate a stage server whose `/users/me` response predates
  /// this rollout (mirrors the "tolerate missing fields" pattern in
  /// [_parseMeUser]); a missing / null `chatConfig` matches the backend
  /// fail-soft intent — the shell hides the chat entry from the visible nav
  /// row.
  final MeChatConfig? chatConfig;

  /// TAM-258/259 — the server's landing decision for this app open.
  ///
  /// Nullable for the same reason [chatConfig] is: a stage server whose
  /// `/users/me` predates the rollout sends no such key, and that must read as
  /// "no landing" (Home, as today) rather than as a malformed response.
  final MeLanding? landing;

  bool get hasPhone => phoneCountryCode != null;
  bool get hasName => name != null && name!.isNotEmpty;
  bool get hasLanguage =>
      selectedLanguage != null && selectedLanguage!.isNotEmpty;
  bool get onboardingCompleted => onboardingCompletedAt != null;
}

/// Result of `GET /users/me`. `authFailed = true` signals the JWT was rejected
/// (401 or an empty payload) — the orchestrator treats this as logged-out.
class MeResult {
  const MeResult({this.user, this.authFailed = false});
  final MeUser? user;
  final bool authFailed;
}

class UsersRepository {
  // `prefer_initializing_formals` can't apply: a named parameter may not start
  // with an underscore, so `this._chatCounters` is not expressible here.
  UsersRepository(this._dio, {ChatCounters? chatCounters})
      // ignore: prefer_initializing_formals
      : _chatCounters = chatCounters;
  final Dio _dio;

  /// Write-through mirror for the global `chat_type` analytics property (and
  /// the `agent_id` the shell / paywall fires read). `AnalyticsEnricher`
  /// stamps `chat_type` on EVERY event by reading
  /// [ChatCounters.savedChatType] synchronously, so the value has to be in
  /// the store before the user's first event — not after they happen to open
  /// the chat screen.
  ///
  /// Mirroring HERE is what makes that true: every `chatConfig` the app ever
  /// holds comes out of this one call, and [meProvider] re-runs it on every
  /// token change, so a login refreshes the arm. It used to be written from
  /// the chat screen's app-bar `build`, which meant an install that never
  /// opened the Chat tab — including every user whose arm has chat DISABLED,
  /// who cannot reach that screen at all — never stamped an arm at all.
  ///
  /// Null when SharedPreferences wasn't resolved (widget tests, degraded
  /// boot): the mirror is skipped and the enricher stamps an empty
  /// `chat_type`. Analytics must never break a data call — and this one is
  /// the call the app boots on.
  final ChatCounters? _chatCounters;

  Future<MeResult> getMe() async {
    try {
      final res = await _dio.get<dynamic>('/users/me');
      final envelope = _envelope(res);
      final data = envelope['data'];
      if (data is! Map) throw ApiException('Malformed response');
      final userJson = data['user'];
      if (userJson is! Map) throw ApiException('Malformed response');
      // Hand-parse rather than delegate to the generated
      // `UsersPublicUser.fromJson` — the current generator marks
      // `pushNotificationsEnabled` and `profileType` as required + force-
      // unwraps them, so a stage server that hasn't rolled TAM-127 yet (its
      // /users/me response predates those three fields) makes the parse throw
      // a null-check error, the orchestrator catches it, and the splash shows
      // "No internet connection". The orchestrator only needs the fields
      // below, so read them directly and tolerate missing/older payloads.
      //
      // TAM-164 — `chatConfig` lives OUTSIDE the `user` object on the
      // envelope's `data`, so plumb it in as a sibling read.
      final user = _parseMeUser(
        userJson.cast<String, dynamic>(),
        chatConfigJson: data['chatConfig'],
        landingJson: data['landing'],
      );
      _mirrorChatConfig(user.chatConfig);
      return MeResult(user: user);
    } on DioException catch (e) {
      // A genuine auth-rejection (401) — bubbles up so the orchestrator can
      // clear the JWT and route to phone choice. Other errors surface as-is so
      // the caller can distinguish "network flake" from "server rejection".
      if (e.response?.statusCode == 401) {
        return const MeResult(authFailed: true);
      }
      rethrow;
    }
  }

  /// Persist the analytics-facing slice of `chatConfig`. Reached ONLY from
  /// the success path above — never on a 401, a network failure, or a
  /// still-in-flight request. That distinction is the point: a null [config]
  /// here means "the server told us this user has no bucket", which must
  /// clear a stale arm, whereas "we haven't asked yet" must leave the last
  /// known value alone. Writing from a widget `build` couldn't tell those
  /// apart and wiped a correct value every time it rendered ahead of
  /// `/users/me`.
  ///
  /// Never throws: a SharedPreferences failure must not turn a successful
  /// profile read into a boot error.
  void _mirrorChatConfig(MeChatConfig? config) {
    final counters = _chatCounters;
    if (counters == null) return;
    try {
      counters.saveChatType(config?.chatType);
      counters.saveAgentId(config?.agentId);
    } catch (_) {/* analytics mirror is best-effort */}
  }

  /// Read only the fields the orchestrator consumes from `/users/me`. Never
  /// throws on unknown / missing / null fields beyond the required `id` —
  /// keeps the mobile client tolerant of server schema drift ahead of a
  /// coordinated deploy.
  ///
  /// [chatConfigJson] is the raw envelope `data.chatConfig` value; passed in
  /// because it lives OUTSIDE the `user` sub-object.
  static MeUser _parseMeUser(
    Map<String, dynamic> json, {
    Object? chatConfigJson,
    Object? landingJson,
  }) {
    final id = json['id'];
    if (id is! String || id.isEmpty) {
      throw ApiException('Malformed response');
    }
    final rawName = json['name'];
    final rawPhone = json['phoneCountryCode'];
    final rawPhoneNumber = json['phoneNumber'];
    final rawOnboarding = json['onboardingCompletedAt'];
    return MeUser(
      id: id,
      name: rawName is String ? rawName : null,
      // Read the code verbatim rather than through `LanguageCode.fromJson`,
      // which returns `null` for any code this build's codegen predates.
      selectedLanguage: json['selectedLanguage'] is String
          ? json['selectedLanguage'] as String
          : null,
      onboardingCompletedAt:
          rawOnboarding is String ? DateTime.tryParse(rawOnboarding) : null,
      phoneCountryCode: rawPhone is String ? rawPhone : null,
      phoneNumber: rawPhoneNumber is String ? rawPhoneNumber : null,
      chatConfig: _parseChatConfig(chatConfigJson),
      landing: _parseLanding(landingJson),
    );
  }

  /// TAM-258/259 — tolerate a server whose `/users/me` predates the landing
  /// rollout: missing key, null, or a non-map all resolve to `null`, which
  /// consumers read as "land on Home, as today".
  ///
  /// Never throws, and deliberately validates NOTHING beyond the types. The
  /// destination vocabulary is the server's — a `module` or `source` this build
  /// has never heard of must reach the funnel verbatim, and an unknown
  /// `deeplink` slug is already handled downstream by `parseDeepLink` returning
  /// `UnknownDeepLink`. Rejecting unfamiliar values here would turn "the server
  /// shipped a new landing" into "the client silently dropped it".
  ///
  /// A non-string field reads as `''` rather than failing the whole object: a
  /// landing whose analytics label is malformed should still NAVIGATE.
  static MeLanding? _parseLanding(Object? raw) {
    if (raw is! Map) return null;
    final map = raw.cast<String, dynamic>();
    String str(String key) {
      final value = map[key];
      return value is String ? value : '';
    }

    return MeLanding(
      deeplink: str('deeplink'),
      module: str('module'),
      source: str('source'),
      utmCode: str('utmCode'),
    );
  }

  /// TAM-164 — tolerate a stage server whose `/users/me` predates the
  /// chatConfig rollout: missing key, null value, or malformed shape all
  /// resolve to `null` (matches the backend's fail-soft intent). Never
  /// throws — chat is a soft-gated surface, not a required contract.
  static MeChatConfig? _parseChatConfig(Object? raw) {
    if (raw is! Map) return null;
    final map = raw.cast<String, dynamic>();
    final enabled = map['enabled'];
    if (enabled is! bool) return null;
    final agentId = map['agentId'];
    // TAM-166 — tolerate a stage server whose `/users/me` predates the
    // kuldevta-khoj rollout: missing key / non-bool value defaults to
    // `false` (matches the backend's fail-soft intent — a not-yet-rolled
    // env reads as "not assigned", the same way the outside-the-arm
    // invariant does).
    final kuldevtaAssigned = map['kuldevtaAssigned'];
    // Same tolerance for the newer show-kuldevta-chat gate — a server
    // that hasn't shipped the field yet reads as "not qualified" and the
    // discovery flow + persona header stay hidden.
    //
    // The server sends `show_kuldeveta_chat` (snake_case, with the extra
    // "e" in "kuldeveta" — inconsistent with the other chatConfig fields
    // which are camelCase + "kuldevta"). We accept the server's actual
    // wire key first, then fall back to the camelCase variant if the
    // server ever normalises. Defensive against schema drift in either
    // direction.
    final showKuldevtaChat =
        map['show_kuldeveta_chat'] ?? map['showKuldevtaChat'];
    // The server ships the field as `kuldeveta_name` (snake_case +
    // extra "e" — matches the `show_kuldeveta_chat` spelling quirk).
    // Accept the wire truth first, then fall back to the camelCase
    // variants in case the server ever normalises. Non-string / empty
    // values collapse to null so the chat header treats "no name" and
    // "unknown name" identically.
    final rawKuldevtaName = map['kuldeveta_name'] ??
        map['kuldevta_name'] ??
        map['kuldevtaName'];
    final kuldevtaName = rawKuldevtaName is String && rawKuldevtaName.isNotEmpty
        ? rawKuldevtaName
        : null;
    // Accept snake_case first (the wire truth for the newer chatConfig
    // fields) then the camelCase variant. Empty strings collapse to null
    // so the analytics fires skip the property rather than emit an empty
    // bucket label.
    final rawChatType = map['chat_type'] ?? map['chatType'];
    final chatType = rawChatType is String && rawChatType.isNotEmpty
        ? rawChatType
        : null;
    // The chat paywall switch. CamelCase on the wire (it is new, so it did not
    // inherit the snake_case quirk the three kuldevta keys carry); the
    // snake_case spelling is accepted too, purely so a future normalisation in
    // either direction cannot silently re-arm a paywall product turned off.
    // Anything that is not a literal `true` — missing key, null, a string
    // "true", a server that predates the field — reads as UNGATED.
    final requiresPro = map['requiresPro'] ?? map['chat_requires_pro'];
    return MeChatConfig(
      enabled: enabled,
      agentId: agentId is String ? agentId : null,
      chatType: chatType,
      showKuldevtaChat:
          showKuldevtaChat is bool ? showKuldevtaChat : false,
      kuldevtaAssigned: kuldevtaAssigned is bool ? kuldevtaAssigned : false,
      kuldevtaName: kuldevtaName,
      requiresPro: requiresPro is bool && requiresPro,
    );
  }

  /// [selectedLanguage] is the raw ISO code. It is NOT narrowed to the generated
  /// enum: the picker is populated from `GET /languages`, so a valid code may
  /// postdate this build's codegen — narrowing would drop it to `null`, produce
  /// an EMPTY PATCH body, and make Save a silent no-op. The server validates the
  /// code strictly, so a bad one comes back as a real 400 the user can see.
  Future<MeUser> updateMe({String? name, String? selectedLanguage}) async {
    // Build the body manually rather than via the generated `UpdateMeRequest`.
    // Its `toJson()` writes explicit `null`s for absent fields, and the server
    // schema treats `.optional()` as "undefined allowed, null rejected" — so a
    // language-only PATCH built from the generated DTO 400s. Omitting null keys
    // matches the "at least one of name/selectedLanguage" contract cleanly.
    final body = <String, dynamic>{
      'name': ?name,
      'selectedLanguage': ?selectedLanguage,
    };
    final res = await _dio.patch<dynamic>('/users/me', data: body);
    final envelope = _envelope(res);
    final data = UsersMeResponse.fromJson(envelope['data']);
    if (data == null) throw ApiException('Malformed response');
    return _toDomain(data.user, data.chatConfig);
  }

  static MeUser _toDomain(
    UsersPublicUser user,
    UsersChatConfig? chatConfig,
  ) =>
      MeUser(
        id: user.id,
        name: user.name,
        selectedLanguage: user.selectedLanguage?.value,
        onboardingCompletedAt: user.onboardingCompletedAt,
        phoneCountryCode: user.phoneCountryCode,
        phoneNumber: user.phoneNumber,
        chatConfig: chatConfig == null
            ? null
            : MeChatConfig(
                enabled: chatConfig.enabled,
                agentId: chatConfig.agentId,
                kuldevtaAssigned: chatConfig.kuldevtaAssigned,
              ),
      );

  static Map<String, dynamic> _envelope(Response<dynamic> res) {
    final body = res.data;
    if (body is! Map<String, dynamic>) {
      throw ApiException('Malformed response');
    }
    if (body['success'] != true) {
      throw ApiException(body['message']?.toString() ?? 'Request failed');
    }
    return body;
  }
}
