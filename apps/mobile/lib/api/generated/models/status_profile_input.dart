//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class StatusProfileInput {
  /// Returns a new [StatusProfileInput] instance.
  StatusProfileInput({
    required this.activeProfileType,
    required this.personalDisplayName,
    required this.businessName,
    required this.businessDetails,
    required this.businessMobileNumber,
    required this.avatarImageUrl,
    required this.updatedAt,
  });

  StatusProfileInputActiveProfileTypeEnum activeProfileType;

  String? personalDisplayName;

  String? businessName;

  String? businessDetails;

  String? businessMobileNumber;

  String? avatarImageUrl;

  String? updatedAt;

  @override
  bool operator ==(Object other) => identical(this, other) || other is StatusProfileInput &&
    other.activeProfileType == activeProfileType &&
    other.personalDisplayName == personalDisplayName &&
    other.businessName == businessName &&
    other.businessDetails == businessDetails &&
    other.businessMobileNumber == businessMobileNumber &&
    other.avatarImageUrl == avatarImageUrl &&
    other.updatedAt == updatedAt;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (activeProfileType.hashCode) +
    (personalDisplayName == null ? 0 : personalDisplayName!.hashCode) +
    (businessName == null ? 0 : businessName!.hashCode) +
    (businessDetails == null ? 0 : businessDetails!.hashCode) +
    (businessMobileNumber == null ? 0 : businessMobileNumber!.hashCode) +
    (avatarImageUrl == null ? 0 : avatarImageUrl!.hashCode) +
    (updatedAt == null ? 0 : updatedAt!.hashCode);

  @override
  String toString() => 'StatusProfileInput[activeProfileType=$activeProfileType, personalDisplayName=$personalDisplayName, businessName=$businessName, businessDetails=$businessDetails, businessMobileNumber=$businessMobileNumber, avatarImageUrl=$avatarImageUrl, updatedAt=$updatedAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'activeProfileType'] = this.activeProfileType;
    if (this.personalDisplayName != null) {
      json[r'personalDisplayName'] = this.personalDisplayName;
    } else {
      json[r'personalDisplayName'] = null;
    }
    if (this.businessName != null) {
      json[r'businessName'] = this.businessName;
    } else {
      json[r'businessName'] = null;
    }
    if (this.businessDetails != null) {
      json[r'businessDetails'] = this.businessDetails;
    } else {
      json[r'businessDetails'] = null;
    }
    if (this.businessMobileNumber != null) {
      json[r'businessMobileNumber'] = this.businessMobileNumber;
    } else {
      json[r'businessMobileNumber'] = null;
    }
    if (this.avatarImageUrl != null) {
      json[r'avatarImageUrl'] = this.avatarImageUrl;
    } else {
      json[r'avatarImageUrl'] = null;
    }
    if (this.updatedAt != null) {
      json[r'updatedAt'] = this.updatedAt;
    } else {
      json[r'updatedAt'] = null;
    }
    return json;
  }

  /// Returns a new [StatusProfileInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static StatusProfileInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'activeProfileType'), 'Required key "StatusProfileInput[activeProfileType]" is missing from JSON.');
        assert(json[r'activeProfileType'] != null, 'Required key "StatusProfileInput[activeProfileType]" has a null value in JSON.');
        assert(json.containsKey(r'personalDisplayName'), 'Required key "StatusProfileInput[personalDisplayName]" is missing from JSON.');
        assert(json.containsKey(r'businessName'), 'Required key "StatusProfileInput[businessName]" is missing from JSON.');
        assert(json.containsKey(r'businessDetails'), 'Required key "StatusProfileInput[businessDetails]" is missing from JSON.');
        assert(json.containsKey(r'businessMobileNumber'), 'Required key "StatusProfileInput[businessMobileNumber]" is missing from JSON.');
        assert(json.containsKey(r'avatarImageUrl'), 'Required key "StatusProfileInput[avatarImageUrl]" is missing from JSON.');
        assert(json.containsKey(r'updatedAt'), 'Required key "StatusProfileInput[updatedAt]" is missing from JSON.');
        return true;
      }());

      return StatusProfileInput(
        activeProfileType: StatusProfileInputActiveProfileTypeEnum.fromJson(json[r'activeProfileType'])!,
        personalDisplayName: mapValueOfType<String>(json, r'personalDisplayName'),
        businessName: mapValueOfType<String>(json, r'businessName'),
        businessDetails: mapValueOfType<String>(json, r'businessDetails'),
        businessMobileNumber: mapValueOfType<String>(json, r'businessMobileNumber'),
        avatarImageUrl: mapValueOfType<String>(json, r'avatarImageUrl'),
        updatedAt: mapValueOfType<String>(json, r'updatedAt'),
      );
    }
    return null;
  }

  static List<StatusProfileInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusProfileInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusProfileInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, StatusProfileInput> mapFromJson(dynamic json) {
    final map = <String, StatusProfileInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = StatusProfileInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of StatusProfileInput-objects as value to a dart map
  static Map<String, List<StatusProfileInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<StatusProfileInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = StatusProfileInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'activeProfileType',
    'personalDisplayName',
    'businessName',
    'businessDetails',
    'businessMobileNumber',
    'avatarImageUrl',
    'updatedAt',
  };
}


class StatusProfileInputActiveProfileTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const StatusProfileInputActiveProfileTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const personal = StatusProfileInputActiveProfileTypeEnum._(r'personal');
  static const business = StatusProfileInputActiveProfileTypeEnum._(r'business');

  /// List of all possible values in this [enum][StatusProfileInputActiveProfileTypeEnum].
  static const values = <StatusProfileInputActiveProfileTypeEnum>[
    personal,
    business,
  ];

  static StatusProfileInputActiveProfileTypeEnum? fromJson(dynamic value) => StatusProfileInputActiveProfileTypeEnumTypeTransformer().decode(value);

  static List<StatusProfileInputActiveProfileTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusProfileInputActiveProfileTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusProfileInputActiveProfileTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [StatusProfileInputActiveProfileTypeEnum] to String,
/// and [decode] dynamic data back to [StatusProfileInputActiveProfileTypeEnum].
class StatusProfileInputActiveProfileTypeEnumTypeTransformer {
  factory StatusProfileInputActiveProfileTypeEnumTypeTransformer() => _instance ??= const StatusProfileInputActiveProfileTypeEnumTypeTransformer._();

  const StatusProfileInputActiveProfileTypeEnumTypeTransformer._();

  String encode(StatusProfileInputActiveProfileTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a StatusProfileInputActiveProfileTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  StatusProfileInputActiveProfileTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'personal': return StatusProfileInputActiveProfileTypeEnum.personal;
        case r'business': return StatusProfileInputActiveProfileTypeEnum.business;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [StatusProfileInputActiveProfileTypeEnumTypeTransformer] instance.
  static StatusProfileInputActiveProfileTypeEnumTypeTransformer? _instance;
}


