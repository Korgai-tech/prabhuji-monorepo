//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PaywallConfigDataInput {
  /// Returns a new [PaywallConfigDataInput] instance.
  PaywallConfigDataInput({
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

  List<PaywallHeroMediaDisplayInput> heroMedia;

  String? videoUrl;

  String? videoThumbnailUrl;

  String? videoId;

  String? defaultPlanId;

  List<PaywallPlanDisplayInput> plans;

  List<PaywallBenefitDisplayInput> benefits;

  PaywallLegalLinksInput legalLinks;

  String cancelAnytimeText;

  String refundPolicyText;

  String payNowCta;

  bool shimmerEnabled;

  @override
  bool operator ==(Object other) => identical(this, other) || other is PaywallConfigDataInput &&
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
  String toString() => 'PaywallConfigDataInput[paywallId=$paywallId, configVersion=$configVersion, enabled=$enabled, localeRequested=$localeRequested, localeServed=$localeServed, fallbackUsed=$fallbackUsed, fallbackFrom=$fallbackFrom, missingFields=$missingFields, title=$title, layout=$layout, heroMedia=$heroMedia, videoUrl=$videoUrl, videoThumbnailUrl=$videoThumbnailUrl, videoId=$videoId, defaultPlanId=$defaultPlanId, plans=$plans, benefits=$benefits, legalLinks=$legalLinks, cancelAnytimeText=$cancelAnytimeText, refundPolicyText=$refundPolicyText, payNowCta=$payNowCta, shimmerEnabled=$shimmerEnabled]';

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

  /// Returns a new [PaywallConfigDataInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PaywallConfigDataInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'paywallId'), 'Required key "PaywallConfigDataInput[paywallId]" is missing from JSON.');
        assert(json[r'paywallId'] != null, 'Required key "PaywallConfigDataInput[paywallId]" has a null value in JSON.');
        assert(json.containsKey(r'configVersion'), 'Required key "PaywallConfigDataInput[configVersion]" is missing from JSON.');
        assert(json[r'configVersion'] != null, 'Required key "PaywallConfigDataInput[configVersion]" has a null value in JSON.');
        assert(json.containsKey(r'enabled'), 'Required key "PaywallConfigDataInput[enabled]" is missing from JSON.');
        assert(json[r'enabled'] != null, 'Required key "PaywallConfigDataInput[enabled]" has a null value in JSON.');
        assert(json.containsKey(r'localeRequested'), 'Required key "PaywallConfigDataInput[localeRequested]" is missing from JSON.');
        assert(json[r'localeRequested'] != null, 'Required key "PaywallConfigDataInput[localeRequested]" has a null value in JSON.');
        assert(json.containsKey(r'localeServed'), 'Required key "PaywallConfigDataInput[localeServed]" is missing from JSON.');
        assert(json[r'localeServed'] != null, 'Required key "PaywallConfigDataInput[localeServed]" has a null value in JSON.');
        assert(json.containsKey(r'fallbackUsed'), 'Required key "PaywallConfigDataInput[fallbackUsed]" is missing from JSON.');
        assert(json[r'fallbackUsed'] != null, 'Required key "PaywallConfigDataInput[fallbackUsed]" has a null value in JSON.');
        assert(json.containsKey(r'fallbackFrom'), 'Required key "PaywallConfigDataInput[fallbackFrom]" is missing from JSON.');
        assert(json.containsKey(r'missingFields'), 'Required key "PaywallConfigDataInput[missingFields]" is missing from JSON.');
        assert(json[r'missingFields'] != null, 'Required key "PaywallConfigDataInput[missingFields]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "PaywallConfigDataInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "PaywallConfigDataInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'videoUrl'), 'Required key "PaywallConfigDataInput[videoUrl]" is missing from JSON.');
        assert(json.containsKey(r'videoThumbnailUrl'), 'Required key "PaywallConfigDataInput[videoThumbnailUrl]" is missing from JSON.');
        assert(json.containsKey(r'videoId'), 'Required key "PaywallConfigDataInput[videoId]" is missing from JSON.');
        assert(json.containsKey(r'defaultPlanId'), 'Required key "PaywallConfigDataInput[defaultPlanId]" is missing from JSON.');
        assert(json.containsKey(r'plans'), 'Required key "PaywallConfigDataInput[plans]" is missing from JSON.');
        assert(json[r'plans'] != null, 'Required key "PaywallConfigDataInput[plans]" has a null value in JSON.');
        assert(json.containsKey(r'benefits'), 'Required key "PaywallConfigDataInput[benefits]" is missing from JSON.');
        assert(json[r'benefits'] != null, 'Required key "PaywallConfigDataInput[benefits]" has a null value in JSON.');
        assert(json.containsKey(r'legalLinks'), 'Required key "PaywallConfigDataInput[legalLinks]" is missing from JSON.');
        assert(json[r'legalLinks'] != null, 'Required key "PaywallConfigDataInput[legalLinks]" has a null value in JSON.');
        assert(json.containsKey(r'cancelAnytimeText'), 'Required key "PaywallConfigDataInput[cancelAnytimeText]" is missing from JSON.');
        assert(json[r'cancelAnytimeText'] != null, 'Required key "PaywallConfigDataInput[cancelAnytimeText]" has a null value in JSON.');
        assert(json.containsKey(r'refundPolicyText'), 'Required key "PaywallConfigDataInput[refundPolicyText]" is missing from JSON.');
        assert(json[r'refundPolicyText'] != null, 'Required key "PaywallConfigDataInput[refundPolicyText]" has a null value in JSON.');
        assert(json.containsKey(r'payNowCta'), 'Required key "PaywallConfigDataInput[payNowCta]" is missing from JSON.');
        assert(json[r'payNowCta'] != null, 'Required key "PaywallConfigDataInput[payNowCta]" has a null value in JSON.');
        assert(json.containsKey(r'shimmerEnabled'), 'Required key "PaywallConfigDataInput[shimmerEnabled]" is missing from JSON.');
        assert(json[r'shimmerEnabled'] != null, 'Required key "PaywallConfigDataInput[shimmerEnabled]" has a null value in JSON.');
        return true;
      }());

      return PaywallConfigDataInput(
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
        heroMedia: PaywallHeroMediaDisplayInput.listFromJson(json[r'heroMedia']),
        videoUrl: mapValueOfType<String>(json, r'videoUrl'),
        videoThumbnailUrl: mapValueOfType<String>(json, r'videoThumbnailUrl'),
        videoId: mapValueOfType<String>(json, r'videoId'),
        defaultPlanId: mapValueOfType<String>(json, r'defaultPlanId'),
        plans: PaywallPlanDisplayInput.listFromJson(json[r'plans']),
        benefits: PaywallBenefitDisplayInput.listFromJson(json[r'benefits']),
        legalLinks: PaywallLegalLinksInput.fromJson(json[r'legalLinks'])!,
        cancelAnytimeText: mapValueOfType<String>(json, r'cancelAnytimeText')!,
        refundPolicyText: mapValueOfType<String>(json, r'refundPolicyText')!,
        payNowCta: mapValueOfType<String>(json, r'payNowCta')!,
        shimmerEnabled: mapValueOfType<bool>(json, r'shimmerEnabled')!,
      );
    }
    return null;
  }

  static List<PaywallConfigDataInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <PaywallConfigDataInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PaywallConfigDataInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PaywallConfigDataInput> mapFromJson(dynamic json) {
    final map = <String, PaywallConfigDataInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PaywallConfigDataInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PaywallConfigDataInput-objects as value to a dart map
  static Map<String, List<PaywallConfigDataInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<PaywallConfigDataInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PaywallConfigDataInput.listFromJson(entry.value, growable: growable,);
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

