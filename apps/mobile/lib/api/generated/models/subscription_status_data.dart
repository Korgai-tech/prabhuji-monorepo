//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class SubscriptionStatusData {
  /// Returns a new [SubscriptionStatusData] instance.
  SubscriptionStatusData({
    required this.status,
    required this.isEntitled,
    required this.entitledUntil,
    required this.activePlanId,
    required this.activeProductId,
    required this.provider,
    required this.expiresAt,
    required this.trialEndsAt,
    required this.startedAt,
  });

  SubscriptionStatusEnum status;

  bool isEntitled;

  DateTime? entitledUntil;

  String? activePlanId;

  String? activeProductId;

  String? provider;

  DateTime? expiresAt;

  DateTime? trialEndsAt;

  DateTime? startedAt;

  @override
  bool operator ==(Object other) => identical(this, other) || other is SubscriptionStatusData &&
    other.status == status &&
    other.isEntitled == isEntitled &&
    other.entitledUntil == entitledUntil &&
    other.activePlanId == activePlanId &&
    other.activeProductId == activeProductId &&
    other.provider == provider &&
    other.expiresAt == expiresAt &&
    other.trialEndsAt == trialEndsAt &&
    other.startedAt == startedAt;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (status.hashCode) +
    (isEntitled.hashCode) +
    (entitledUntil == null ? 0 : entitledUntil!.hashCode) +
    (activePlanId == null ? 0 : activePlanId!.hashCode) +
    (activeProductId == null ? 0 : activeProductId!.hashCode) +
    (provider == null ? 0 : provider!.hashCode) +
    (expiresAt == null ? 0 : expiresAt!.hashCode) +
    (trialEndsAt == null ? 0 : trialEndsAt!.hashCode) +
    (startedAt == null ? 0 : startedAt!.hashCode);

  @override
  String toString() => 'SubscriptionStatusData[status=$status, isEntitled=$isEntitled, entitledUntil=$entitledUntil, activePlanId=$activePlanId, activeProductId=$activeProductId, provider=$provider, expiresAt=$expiresAt, trialEndsAt=$trialEndsAt, startedAt=$startedAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'status'] = this.status;
      json[r'isEntitled'] = this.isEntitled;
    if (this.entitledUntil != null) {
      json[r'entitledUntil'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.entitledUntil!.millisecondsSinceEpoch
        : this.entitledUntil!.toUtc().toIso8601String();
    } else {
      json[r'entitledUntil'] = null;
    }
    if (this.activePlanId != null) {
      json[r'activePlanId'] = this.activePlanId;
    } else {
      json[r'activePlanId'] = null;
    }
    if (this.activeProductId != null) {
      json[r'activeProductId'] = this.activeProductId;
    } else {
      json[r'activeProductId'] = null;
    }
    if (this.provider != null) {
      json[r'provider'] = this.provider;
    } else {
      json[r'provider'] = null;
    }
    if (this.expiresAt != null) {
      json[r'expiresAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.expiresAt!.millisecondsSinceEpoch
        : this.expiresAt!.toUtc().toIso8601String();
    } else {
      json[r'expiresAt'] = null;
    }
    if (this.trialEndsAt != null) {
      json[r'trialEndsAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.trialEndsAt!.millisecondsSinceEpoch
        : this.trialEndsAt!.toUtc().toIso8601String();
    } else {
      json[r'trialEndsAt'] = null;
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

  /// Returns a new [SubscriptionStatusData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static SubscriptionStatusData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'status'), 'Required key "SubscriptionStatusData[status]" is missing from JSON.');
        assert(json[r'status'] != null, 'Required key "SubscriptionStatusData[status]" has a null value in JSON.');
        assert(json.containsKey(r'isEntitled'), 'Required key "SubscriptionStatusData[isEntitled]" is missing from JSON.');
        assert(json[r'isEntitled'] != null, 'Required key "SubscriptionStatusData[isEntitled]" has a null value in JSON.');
        assert(json.containsKey(r'entitledUntil'), 'Required key "SubscriptionStatusData[entitledUntil]" is missing from JSON.');
        assert(json.containsKey(r'activePlanId'), 'Required key "SubscriptionStatusData[activePlanId]" is missing from JSON.');
        assert(json.containsKey(r'activeProductId'), 'Required key "SubscriptionStatusData[activeProductId]" is missing from JSON.');
        assert(json.containsKey(r'provider'), 'Required key "SubscriptionStatusData[provider]" is missing from JSON.');
        assert(json.containsKey(r'expiresAt'), 'Required key "SubscriptionStatusData[expiresAt]" is missing from JSON.');
        assert(json.containsKey(r'trialEndsAt'), 'Required key "SubscriptionStatusData[trialEndsAt]" is missing from JSON.');
        assert(json.containsKey(r'startedAt'), 'Required key "SubscriptionStatusData[startedAt]" is missing from JSON.');
        return true;
      }());

      return SubscriptionStatusData(
        status: SubscriptionStatusEnum.fromJson(json[r'status'])!,
        isEntitled: mapValueOfType<bool>(json, r'isEntitled')!,
        entitledUntil: mapDateTime(json, r'entitledUntil', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        activePlanId: mapValueOfType<String>(json, r'activePlanId'),
        activeProductId: mapValueOfType<String>(json, r'activeProductId'),
        provider: mapValueOfType<String>(json, r'provider'),
        expiresAt: mapDateTime(json, r'expiresAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        trialEndsAt: mapDateTime(json, r'trialEndsAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        startedAt: mapDateTime(json, r'startedAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
      );
    }
    return null;
  }

  static List<SubscriptionStatusData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <SubscriptionStatusData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = SubscriptionStatusData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, SubscriptionStatusData> mapFromJson(dynamic json) {
    final map = <String, SubscriptionStatusData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = SubscriptionStatusData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of SubscriptionStatusData-objects as value to a dart map
  static Map<String, List<SubscriptionStatusData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<SubscriptionStatusData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = SubscriptionStatusData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'status',
    'isEntitled',
    'entitledUntil',
    'activePlanId',
    'activeProductId',
    'provider',
    'expiresAt',
    'trialEndsAt',
    'startedAt',
  };
}

