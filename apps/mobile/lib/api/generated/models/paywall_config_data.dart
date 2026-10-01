//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PaywallConfigData {
  /// Returns a new [PaywallConfigData] instance.
  PaywallConfigData({
    required this.paywallId,
    required this.configVersion,
    required this.enabled,
    required this.localeRequested,
    required this.localeServed,
    required this.fallbackUsed,
    required this.fallbackFrom,
    this.missingFields = const [],
    required this.title,
    this.layout,
    this.heroMedia = const [],
    required this.videoUrl,
    required this.videoThumbnailUrl,
    required this.videoId,
    required this.defaultPlanId,
    this.plans = const [],
    this.benefits = const [],
    required this.legalLinks,
    required this.cancelAnytimeText,
    required this.refundPolicyText,
    required this.payNowCta,
    required this.shimmerEnabled,
  });

  String paywallId;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int configVersion;

  bool enabled;

  String localeRequested;

  String localeServed;

  bool fallbackUsed;

  String? fallbackFrom;

  List<String> missingFields;

  String title;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? layout;

  List<PaywallHeroMediaDisplay> heroMedia;

  String? videoUrl;

  String? videoThumbnailUrl;

  String? videoId;

  String? defaultPlanId;

  List<PaywallPlanDisplay> plans;

  List<PaywallBenefitDisplay> benefits;

  PaywallLegalLinks legalLinks;

  String cancelAnytimeText;

  String refundPolicyText;

  String payNowCta;

  bool shimmerEnabled;

  @override
  bool operator ==(Object other) => identical(this, other) || other is PaywallConfigData &&
    other.paywallId == paywallId &&
    other.configVersion == configVersion &&
    other.enabled == enabled &&
    other.localeRequested == localeRequested &&
    other.localeServed == localeServed &&
    other.fallbackUsed == fallbackUsed &&
    other.fallbackFrom == fallbackFrom &&
    _deepEquality.equals(other.missingFields, missingFields) &&
    other.title == title &&
    other.layout == layout &&
    _deepEquality.equals(other.heroMedia, heroMedia) &&
    other.videoUrl == videoUrl &&
    other.videoThumbnailUrl == videoThumbnailUrl &&
    other.videoId == videoId &&
    other.defaultPlanId == defaultPlanId &&
    _deepEquality.equals(other.plans, plans) &&
    _deepEquality.equals(other.benefits, benefits) &&
    other.legalLinks == legalLinks &&
    other.cancelAnytimeText == cancelAnytimeText &&
    other.refundPolicyText == refundPolicyText &&
    other.payNowCta == payNowCta &&
    other.shimmerEnabled == shimmerEnabled;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (paywallId.hashCode) +
    (configVersion.hashCode) +
    (enabled.hashCode) +
    (localeRequested.hashCode) +
    (localeServed.hashCode) +
    (fallbackUsed.hashCode) +
    (fallbackFrom == null ? 0 : fallbackFrom!.hashCode) +
    (missingFields.hashCode) +
    (title.hashCode) +
    (layout == null ? 0 : layout!.hashCode) +
    (heroMedia.hashCode) +
    (videoUrl == null ? 0 : videoUrl!.hashCode) +
    (videoThumbnailUrl == null ? 0 : videoThumbnailUrl!.hashCode) +
    (videoId == null ? 0 : videoId!.hashCode) +
    (defaultPlanId == null ? 0 : defaultPlanId!.hashCode) +
    (plans.hashCode) +
    (benefits.hashCode) +
    (legalLinks.hashCode) +
    (cancelAnytimeText.hashCode) +
    (refundPolicyText.hashCode) +
    (payNowCta.hashCode) +
    (shimmerEnabled.hashCode);

  @override
  String toString() => 'PaywallConfigData[paywallId=$paywallId, configVersion=$configVersion, enabled=$enabled, localeRequested=$localeRequested, localeServed=$localeServed, fallbackUsed=$fallbackUsed, fallbackFrom=$fallbackFrom, missingFields=$missingFields, title=$title, layout=$layout, heroMedia=$heroMedia, videoUrl=$videoUrl, videoThumbnailUrl=$videoThumbnailUrl, videoId=$videoId, defaultPlanId=$defaultPlanId, plans=$plans, benefits=$benefits, legalLinks=$legalLinks, cancelAnytimeText=$cancelAnytimeText, refundPolicyText=$refundPolicyText, payNowCta=$payNowCta, shimmerEnabled=$shimmerEnabled]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'paywallId'] = this.paywallId;
      json[r'configVersion'] = this.configVersion;
      json[r'enabled'] = this.enabled;
      json[r'localeRequested'] = this.localeRequested;
      json[r'localeServed'] = this.localeServed;
      json[r'fallbackUsed'] = this.fallbackUsed;
    if (this.fallbackFrom != null) {
      json[r'fallbackFrom'] = this.fallbackFrom;
    } else {
      json[r'fallbackFrom'] = null;
    }
      json[r'missingFields'] = this.missingFields;
      json[r'title'] = this.title;
    if (this.layout != null) {
      json[r'layout'] = this.layout;
    } else {
      json[r'layout'] = null;
    }
      json[r'heroMedia'] = this.heroMedia;
    if (this.videoUrl != null) {
      json[r'videoUrl'] = this.videoUrl;
    } else {
      json[r'videoUrl'] = null;
    }
    if (this.videoThumbnailUrl != null) {
      json[r'videoThumbnailUrl'] = this.videoThumbnailUrl;
    } else {
      json[r'videoThumbnailUrl'] = null;
    }
    if (this.videoId != null) {
      json[r'videoId'] = this.videoId;
    } else {
      json[r'videoId'] = null;
    }
    if (this.defaultPlanId != null) {
      json[r'defaultPlanId'] = this.defaultPlanId;
    } else {
      json[r'defaultPlanId'] = null;
    }
      json[r'plans'] = this.plans;
      json[r'benefits'] = this.benefits;
      json[r'legalLinks'] = this.legalLinks;
      json[r'cancelAnytimeText'] = this.cancelAnytimeText;
      json[r'refundPolicyText'] = this.refundPolicyText;
      json[r'payNowCta'] = this.payNowCta;
      json[r'shimmerEnabled'] = this.shimmerEnabled;
    return json;
  }

  /// Returns a new [PaywallConfigData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PaywallConfigData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'paywallId'), 'Required key "PaywallConfigData[paywallId]" is missing from JSON.');
        assert(json[r'paywallId'] != null, 'Required key "PaywallConfigData[paywallId]" has a null value in JSON.');
        assert(json.containsKey(r'configVersion'), 'Required key "PaywallConfigData[configVersion]" is missing from JSON.');
        assert(json[r'configVersion'] != null, 'Required key "PaywallConfigData[configVersion]" has a null value in JSON.');
        assert(json.containsKey(r'enabled'), 'Required key "PaywallConfigData[enabled]" is missing from JSON.');
        assert(json[r'enabled'] != null, 'Required key "PaywallConfigData[enabled]" has a null value in JSON.');
        assert(json.containsKey(r'localeRequested'), 'Required key "PaywallConfigData[localeRequested]" is missing from JSON.');
        assert(json[r'localeRequested'] != null, 'Required key "PaywallConfigData[localeRequested]" has a null value in JSON.');
        assert(json.containsKey(r'localeServed'), 'Required key "PaywallConfigData[localeServed]" is missing from JSON.');
        assert(json[r'localeServed'] != null, 'Required key "PaywallConfigData[localeServed]" has a null value in JSON.');
        assert(json.containsKey(r'fallbackUsed'), 'Required key "PaywallConfigData[fallbackUsed]" is missing from JSON.');
        assert(json[r'fallbackUsed'] != null, 'Required key "PaywallConfigData[fallbackUsed]" has a null value in JSON.');
        assert(json.containsKey(r'fallbackFrom'), 'Required key "PaywallConfigData[fallbackFrom]" is missing from JSON.');
        assert(json.containsKey(r'missingFields'), 'Required key "PaywallConfigData[missingFields]" is missing from JSON.');
        assert(json[r'missingFields'] != null, 'Required key "PaywallConfigData[missingFields]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "PaywallConfigData[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "PaywallConfigData[title]" has a null value in JSON.');
        assert(json.containsKey(r'videoUrl'), 'Required key "PaywallConfigData[videoUrl]" is missing from JSON.');
        assert(json.containsKey(r'videoThumbnailUrl'), 'Required key "PaywallConfigData[videoThumbnailUrl]" is missing from JSON.');
        assert(json.containsKey(r'videoId'), 'Required key "PaywallConfigData[videoId]" is missing from JSON.');
        assert(json.containsKey(r'defaultPlanId'), 'Required key "PaywallConfigData[defaultPlanId]" is missing from JSON.');
        assert(json.containsKey(r'plans'), 'Required key "PaywallConfigData[plans]" is missing from JSON.');
        assert(json[r'plans'] != null, 'Required key "PaywallConfigData[plans]" has a null value in JSON.');
        assert(json.containsKey(r'benefits'), 'Required key "PaywallConfigData[benefits]" is missing from JSON.');
        assert(json[r'benefits'] != null, 'Required key "PaywallConfigData[benefits]" has a null value in JSON.');
        assert(json.containsKey(r'legalLinks'), 'Required key "PaywallConfigData[legalLinks]" is missing from JSON.');
        assert(json[r'legalLinks'] != null, 'Required key "PaywallConfigData[legalLinks]" has a null value in JSON.');
        assert(json.containsKey(r'cancelAnytimeText'), 'Required key "PaywallConfigData[cancelAnytimeText]" is missing from JSON.');
        assert(json[r'cancelAnytimeText'] != null, 'Required key "PaywallConfigData[cancelAnytimeText]" has a null value in JSON.');
        assert(json.containsKey(r'refundPolicyText'), 'Required key "PaywallConfigData[refundPolicyText]" is missing from JSON.');
        assert(json[r'refundPolicyText'] != null, 'Required key "PaywallConfigData[refundPolicyText]" has a null value in JSON.');
        assert(json.containsKey(r'payNowCta'), 'Required key "PaywallConfigData[payNowCta]" is missing from JSON.');
        assert(json[r'payNowCta'] != null, 'Required key "PaywallConfigData[payNowCta]" has a null value in JSON.');
        assert(json.containsKey(r'shimmerEnabled'), 'Required key "PaywallConfigData[shimmerEnabled]" is missing from JSON.');
        assert(json[r'shimmerEnabled'] != null, 'Required key "PaywallConfigData[shimmerEnabled]" has a null value in JSON.');
        return true;
      }());

      return PaywallConfigData(
        paywallId: mapValueOfType<String>(json, r'paywallId')!,
        configVersion: mapValueOfType<int>(json, r'configVersion')!,
        enabled: mapValueOfType<bool>(json, r'enabled')!,
        localeRequested: mapValueOfType<String>(json, r'localeRequested')!,
        localeServed: mapValueOfType<String>(json, r'localeServed')!,
        fallbackUsed: mapValueOfType<bool>(json, r'fallbackUsed')!,
        fallbackFrom: mapValueOfType<String>(json, r'fallbackFrom'),
        missingFields: json[r'missingFields'] is Iterable
            ? (json[r'missingFields'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        title: mapValueOfType<String>(json, r'title')!,
        layout: mapValueOfType<String>(json, r'layout'),
        heroMedia: PaywallHeroMediaDisplay.listFromJson(json[r'heroMedia']),
        videoUrl: mapValueOfType<String>(json, r'videoUrl'),
        videoThumbnailUrl: mapValueOfType<String>(json, r'videoThumbnailUrl'),
        videoId: mapValueOfType<String>(json, r'videoId'),
        defaultPlanId: mapValueOfType<String>(json, r'defaultPlanId'),
        plans: PaywallPlanDisplay.listFromJson(json[r'plans']),
        benefits: PaywallBenefitDisplay.listFromJson(json[r'benefits']),
        legalLinks: PaywallLegalLinks.fromJson(json[r'legalLinks'])!,
        cancelAnytimeText: mapValueOfType<String>(json, r'cancelAnytimeText')!,
        refundPolicyText: mapValueOfType<String>(json, r'refundPolicyText')!,
        payNowCta: mapValueOfType<String>(json, r'payNowCta')!,
        shimmerEnabled: mapValueOfType<bool>(json, r'shimmerEnabled')!,
      );
    }
    return null;
  }

  static List<PaywallConfigData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <PaywallConfigData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PaywallConfigData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PaywallConfigData> mapFromJson(dynamic json) {
    final map = <String, PaywallConfigData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PaywallConfigData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PaywallConfigData-objects as value to a dart map
  static Map<String, List<PaywallConfigData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<PaywallConfigData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PaywallConfigData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'paywallId',
    'configVersion',
    'enabled',
    'localeRequested',
    'localeServed',
    'fallbackUsed',
    'fallbackFrom',
    'missingFields',
    'title',
    'videoUrl',
    'videoThumbnailUrl',
    'videoId',
    'defaultPlanId',
    'plans',
    'benefits',
    'legalLinks',
    'cancelAnytimeText',
    'refundPolicyText',
    'payNowCta',
    'shimmerEnabled',
  };
}

