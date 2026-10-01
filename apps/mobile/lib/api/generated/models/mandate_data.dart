//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MandateData {
  /// Returns a new [MandateData] instance.
  MandateData({
    required this.mandateId,
    required this.paymentReferenceId,
    required this.provider,
    required this.state,
    required this.authUrl,
    required this.razorpay,
    required this.decentro,
    required this.authExpiresAt,
    required this.planId,
    required this.amountPaise,
    required this.currency,
    required this.requiresReRegistration,
    required this.subscription,
    required this.nextDebitDate,
    required this.startedAt,
  });

  String mandateId;

  String? paymentReferenceId;

  String provider;

  MandateStateEnum state;

  String? authUrl;

  RazorpayCheckoutData? razorpay;

  DecentroCheckoutData? decentro;

  DateTime? authExpiresAt;

  String planId;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int amountPaise;

  String currency;

  bool requiresReRegistration;

  SubscriptionStatusData subscription;

  String? nextDebitDate;

  DateTime? startedAt;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MandateData &&
    other.mandateId == mandateId &&
    other.paymentReferenceId == paymentReferenceId &&
    other.provider == provider &&
    other.state == state &&
    other.authUrl == authUrl &&
    other.razorpay == razorpay &&
    other.decentro == decentro &&
    other.authExpiresAt == authExpiresAt &&
    other.planId == planId &&
    other.amountPaise == amountPaise &&
    other.currency == currency &&
    other.requiresReRegistration == requiresReRegistration &&
    other.subscription == subscription &&
    other.nextDebitDate == nextDebitDate &&
    other.startedAt == startedAt;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (mandateId.hashCode) +
    (paymentReferenceId == null ? 0 : paymentReferenceId!.hashCode) +
    (provider.hashCode) +
    (state.hashCode) +
    (authUrl == null ? 0 : authUrl!.hashCode) +
    (razorpay == null ? 0 : razorpay!.hashCode) +
    (decentro == null ? 0 : decentro!.hashCode) +
    (authExpiresAt == null ? 0 : authExpiresAt!.hashCode) +
    (planId.hashCode) +
    (amountPaise.hashCode) +
    (currency.hashCode) +
    (requiresReRegistration.hashCode) +
    (subscription.hashCode) +
    (nextDebitDate == null ? 0 : nextDebitDate!.hashCode) +
    (startedAt == null ? 0 : startedAt!.hashCode);

  @override
  String toString() => 'MandateData[mandateId=$mandateId, paymentReferenceId=$paymentReferenceId, provider=$provider, state=$state, authUrl=$authUrl, razorpay=$razorpay, decentro=$decentro, authExpiresAt=$authExpiresAt, planId=$planId, amountPaise=$amountPaise, currency=$currency, requiresReRegistration=$requiresReRegistration, subscription=$subscription, nextDebitDate=$nextDebitDate, startedAt=$startedAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'mandateId'] = this.mandateId;
    if (this.paymentReferenceId != null) {
      json[r'paymentReferenceId'] = this.paymentReferenceId;
    } else {
      json[r'paymentReferenceId'] = null;
    }
      json[r'provider'] = this.provider;
      json[r'state'] = this.state;
    if (this.authUrl != null) {
      json[r'authUrl'] = this.authUrl;
    } else {
      json[r'authUrl'] = null;
    }
    if (this.razorpay != null) {
      json[r'razorpay'] = this.razorpay;
    } else {
      json[r'razorpay'] = null;
    }
    if (this.decentro != null) {
      json[r'decentro'] = this.decentro;
    } else {
      json[r'decentro'] = null;
    }
    if (this.authExpiresAt != null) {
      json[r'authExpiresAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.authExpiresAt!.millisecondsSinceEpoch
        : this.authExpiresAt!.toUtc().toIso8601String();
    } else {
      json[r'authExpiresAt'] = null;
    }
      json[r'planId'] = this.planId;
      json[r'amountPaise'] = this.amountPaise;
      json[r'currency'] = this.currency;
      json[r'requiresReRegistration'] = this.requiresReRegistration;
      json[r'subscription'] = this.subscription;
    if (this.nextDebitDate != null) {
      json[r'nextDebitDate'] = this.nextDebitDate;
    } else {
      json[r'nextDebitDate'] = null;
    }
    if (this.startedAt != null) {
      json[r'startedAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.startedAt!.millisecondsSinceEpoch
        : this.startedAt!.toUtc().toIso8601String();
    } else {
      json[r'startedAt'] = null;
    }
    return json;
  }

  /// Returns a new [MandateData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MandateData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'mandateId'), 'Required key "MandateData[mandateId]" is missing from JSON.');
        assert(json[r'mandateId'] != null, 'Required key "MandateData[mandateId]" has a null value in JSON.');
        assert(json.containsKey(r'paymentReferenceId'), 'Required key "MandateData[paymentReferenceId]" is missing from JSON.');
        assert(json.containsKey(r'provider'), 'Required key "MandateData[provider]" is missing from JSON.');
        assert(json[r'provider'] != null, 'Required key "MandateData[provider]" has a null value in JSON.');
        assert(json.containsKey(r'state'), 'Required key "MandateData[state]" is missing from JSON.');
        assert(json[r'state'] != null, 'Required key "MandateData[state]" has a null value in JSON.');
        assert(json.containsKey(r'authUrl'), 'Required key "MandateData[authUrl]" is missing from JSON.');
        assert(json.containsKey(r'razorpay'), 'Required key "MandateData[razorpay]" is missing from JSON.');
        assert(json.containsKey(r'decentro'), 'Required key "MandateData[decentro]" is missing from JSON.');
        assert(json.containsKey(r'authExpiresAt'), 'Required key "MandateData[authExpiresAt]" is missing from JSON.');
        assert(json.containsKey(r'planId'), 'Required key "MandateData[planId]" is missing from JSON.');
        assert(json[r'planId'] != null, 'Required key "MandateData[planId]" has a null value in JSON.');
        assert(json.containsKey(r'amountPaise'), 'Required key "MandateData[amountPaise]" is missing from JSON.');
        assert(json[r'amountPaise'] != null, 'Required key "MandateData[amountPaise]" has a null value in JSON.');
        assert(json.containsKey(r'currency'), 'Required key "MandateData[currency]" is missing from JSON.');
        assert(json[r'currency'] != null, 'Required key "MandateData[currency]" has a null value in JSON.');
        assert(json.containsKey(r'requiresReRegistration'), 'Required key "MandateData[requiresReRegistration]" is missing from JSON.');
        assert(json[r'requiresReRegistration'] != null, 'Required key "MandateData[requiresReRegistration]" has a null value in JSON.');
        assert(json.containsKey(r'subscription'), 'Required key "MandateData[subscription]" is missing from JSON.');
        assert(json[r'subscription'] != null, 'Required key "MandateData[subscription]" has a null value in JSON.');
        assert(json.containsKey(r'nextDebitDate'), 'Required key "MandateData[nextDebitDate]" is missing from JSON.');
        assert(json.containsKey(r'startedAt'), 'Required key "MandateData[startedAt]" is missing from JSON.');
        return true;
      }());

      return MandateData(
        mandateId: mapValueOfType<String>(json, r'mandateId')!,
        paymentReferenceId: mapValueOfType<String>(json, r'paymentReferenceId'),
        provider: mapValueOfType<String>(json, r'provider')!,
        state: MandateStateEnum.fromJson(json[r'state'])!,
        authUrl: mapValueOfType<String>(json, r'authUrl'),
        razorpay: RazorpayCheckoutData.fromJson(json[r'razorpay']),
        decentro: DecentroCheckoutData.fromJson(json[r'decentro']),
        authExpiresAt: mapDateTime(json, r'authExpiresAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        planId: mapValueOfType<String>(json, r'planId')!,
        amountPaise: mapValueOfType<int>(json, r'amountPaise')!,
        currency: mapValueOfType<String>(json, r'currency')!,
        requiresReRegistration: mapValueOfType<bool>(json, r'requiresReRegistration')!,
        subscription: SubscriptionStatusData.fromJson(json[r'subscription'])!,
        nextDebitDate: mapValueOfType<String>(json, r'nextDebitDate'),
        startedAt: mapDateTime(json, r'startedAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
      );
    }
    return null;
  }

  static List<MandateData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MandateData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MandateData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MandateData> mapFromJson(dynamic json) {
    final map = <String, MandateData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MandateData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MandateData-objects as value to a dart map
  static Map<String, List<MandateData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MandateData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MandateData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'mandateId',
    'paymentReferenceId',
    'provider',
    'state',
    'authUrl',
    'razorpay',
    'decentro',
    'authExpiresAt',
    'planId',
    'amountPaise',
    'currency',
    'requiresReRegistration',
    'subscription',
    'nextDebitDate',
    'startedAt',
  };
}

