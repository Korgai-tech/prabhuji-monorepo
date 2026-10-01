/// Body payload for `POST /referral/v1/save` — the first-launch install
/// attribution sync. Fires exactly once per install once we have a logged-in
/// user AND the install referrer has been read (or determined to be absent).
///
/// Wire keys are snake_case (matches the referral backend's contract; see
/// [toJson]).
class SessionInfoRequest {
  const SessionInfoRequest({
    required this.userId,
    required this.referralInfo,
    required this.countryCode,
    required this.locale,
    required this.isVpnActive,
    required this.gaAdid,
    required this.deviceInfo,
    required this.pseudoId,
  });

  /// The logged-in player. Unlike our main api — which derives the player
  /// from the bearer token — the referral host expects it in the body.
  final String userId;

  /// Parsed install-referrer `utm_*` keys (utm_source / utm_medium /
  /// utm_campaign / utm_content). Null when no attribution data exists
  /// (organic install, iOS, deep-link `/app/*` path without utm keys).
  /// We still POST for organic installs — the field is transmitted as
  /// JSON null so the server records the session either way.
  final Map<String, dynamic>? referralInfo;

  final String countryCode;
  final String locale;
  final bool isVpnActive;
  final String gaAdid;
  final Map<String, dynamic> deviceInfo;
  final String? pseudoId;

  Map<String, dynamic> toJson() => {
        'user_id': userId,
        'referral_info': referralInfo,
        'country_code': countryCode,
        'locale': locale,
        'is_vpn_active': isVpnActive,
        'ga_adid': gaAdid,
        'device_info': deviceInfo,
        'pseudo_id': pseudoId,
      };
}
