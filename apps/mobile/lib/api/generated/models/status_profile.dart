//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class StatusProfile {
  /// Returns a new [StatusProfile] instance.
  StatusProfile({
    required this.activeProfileType,
    required this.personalDisplayName,
    required this.businessName,
    required this.businessDetails,
    required this.businessMobileNumber,
    required this.avatarImageUrl,
    required this.updatedAt,
  });

  StatusProfileActiveProfileTypeEnum activeProfileType;

  String? personalDisplayName;

  String? businessName;

  String? businessDetails;

  String? businessMobileNumber;

  String? avatarImageUrl;

  String? updatedAt;

  @override
  bool operator ==(Object other) => identical(this, other) || other is StatusProfile &&
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
  String toString() => 'StatusProfile[activeProfileType=$activeProfileType, personalDisplayName=$personalDisplayName, businessName=$businessName, businessDetails=$businessDetails, businessMobileNumber=$businessMobileNumber, avatarImageUrl=$avatarImageUrl, updatedAt=$updatedAt]';

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

  /// Returns a new [StatusProfile] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static StatusProfile? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'activeProfileType'), 'Required key "StatusProfile[activeProfileType]" is missing from JSON.');
        assert(json[r'activeProfileType'] != null, 'Required key "StatusProfile[activeProfileType]" has a null value in JSON.');
        assert(json.containsKey(r'personalDisplayName'), 'Required key "StatusProfile[personalDisplayName]" is missing from JSON.');
        assert(json.containsKey(r'businessName'), 'Required key "StatusProfile[businessName]" is missing from JSON.');
        assert(json.containsKey(r'businessDetails'), 'Required key "StatusProfile[businessDetails]" is missing from JSON.');
        assert(json.containsKey(r'businessMobileNumber'), 'Required key "StatusProfile[businessMobileNumber]" is missing from JSON.');
        assert(json.containsKey(r'avatarImageUrl'), 'Required key "StatusProfile[avatarImageUrl]" is missing from JSON.');
        assert(json.containsKey(r'updatedAt'), 'Required key "StatusProfile[updatedAt]" is missing from JSON.');
        return true;
      }());

      return StatusProfile(
        activeProfileType: StatusProfileActiveProfileTypeEnum.fromJson(json[r'activeProfileType'])!,
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

  static List<StatusProfile> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusProfile>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusProfile.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, StatusProfile> mapFromJson(dynamic json) {
    final map = <String, StatusProfile>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = StatusProfile.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of StatusProfile-objects as value to a dart map
  static Map<String, List<StatusProfile>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<StatusProfile>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = StatusProfile.listFromJson(entry.value, growable: growable,);
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


class StatusProfileActiveProfileTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const StatusProfileActiveProfileTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const personal = StatusProfileActiveProfileTypeEnum._(r'personal');
  static const business = StatusProfileActiveProfileTypeEnum._(r'business');

  /// List of all possible values in this [enum][StatusProfileActiveProfileTypeEnum].
  static const values = <StatusProfileActiveProfileTypeEnum>[
    personal,
    business,
  ];

  static StatusProfileActiveProfileTypeEnum? fromJson(dynamic value) => StatusProfileActiveProfileTypeEnumTypeTransformer().decode(value);

  static List<StatusProfileActiveProfileTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusProfileActiveProfileTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusProfileActiveProfileTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [StatusProfileActiveProfileTypeEnum] to String,
/// and [decode] dynamic data back to [StatusProfileActiveProfileTypeEnum].
class StatusProfileActiveProfileTypeEnumTypeTransformer {
  factory StatusProfileActiveProfileTypeEnumTypeTransformer() => _instance ??= const StatusProfileActiveProfileTypeEnumTypeTransformer._();

  const StatusProfileActiveProfileTypeEnumTypeTransformer._();

  String encode(StatusProfileActiveProfileTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a StatusProfileActiveProfileTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  StatusProfileActiveProfileTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'personal': return StatusProfileActiveProfileTypeEnum.personal;
        case r'business': return StatusProfileActiveProfileTypeEnum.business;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [StatusProfileActiveProfileTypeEnumTypeTransformer] instance.
  static StatusProfileActiveProfileTypeEnumTypeTransformer? _instance;
}


