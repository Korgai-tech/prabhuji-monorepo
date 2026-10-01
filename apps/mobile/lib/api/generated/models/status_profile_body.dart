//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class StatusProfileBody {
  /// Returns a new [StatusProfileBody] instance.
  StatusProfileBody({
    required this.activeProfileType,
    this.personalDisplayName,
    this.businessName,
    this.businessDetails,
    this.businessMobileNumber,
    this.avatarImageUrl,
  });

  StatusProfileBodyActiveProfileTypeEnum activeProfileType;

  String? personalDisplayName;

  String? businessName;

  String? businessDetails;

  String? businessMobileNumber;

  String? avatarImageUrl;

  @override
  bool operator ==(Object other) => identical(this, other) || other is StatusProfileBody &&
    other.activeProfileType == activeProfileType &&
    other.personalDisplayName == personalDisplayName &&
    other.businessName == businessName &&
    other.businessDetails == businessDetails &&
    other.businessMobileNumber == businessMobileNumber &&
    other.avatarImageUrl == avatarImageUrl;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (activeProfileType.hashCode) +
    (personalDisplayName == null ? 0 : personalDisplayName!.hashCode) +
    (businessName == null ? 0 : businessName!.hashCode) +
    (businessDetails == null ? 0 : businessDetails!.hashCode) +
    (businessMobileNumber == null ? 0 : businessMobileNumber!.hashCode) +
    (avatarImageUrl == null ? 0 : avatarImageUrl!.hashCode);

  @override
  String toString() => 'StatusProfileBody[activeProfileType=$activeProfileType, personalDisplayName=$personalDisplayName, businessName=$businessName, businessDetails=$businessDetails, businessMobileNumber=$businessMobileNumber, avatarImageUrl=$avatarImageUrl]';

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
    return json;
  }

  /// Returns a new [StatusProfileBody] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static StatusProfileBody? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'activeProfileType'), 'Required key "StatusProfileBody[activeProfileType]" is missing from JSON.');
        assert(json[r'activeProfileType'] != null, 'Required key "StatusProfileBody[activeProfileType]" has a null value in JSON.');
        return true;
      }());

      return StatusProfileBody(
        activeProfileType: StatusProfileBodyActiveProfileTypeEnum.fromJson(json[r'activeProfileType'])!,
        personalDisplayName: mapValueOfType<String>(json, r'personalDisplayName'),
        businessName: mapValueOfType<String>(json, r'businessName'),
        businessDetails: mapValueOfType<String>(json, r'businessDetails'),
        businessMobileNumber: mapValueOfType<String>(json, r'businessMobileNumber'),
        avatarImageUrl: mapValueOfType<String>(json, r'avatarImageUrl'),
      );
    }
    return null;
  }

  static List<StatusProfileBody> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusProfileBody>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusProfileBody.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, StatusProfileBody> mapFromJson(dynamic json) {
    final map = <String, StatusProfileBody>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = StatusProfileBody.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of StatusProfileBody-objects as value to a dart map
  static Map<String, List<StatusProfileBody>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<StatusProfileBody>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = StatusProfileBody.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'activeProfileType',
  };
}


class StatusProfileBodyActiveProfileTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const StatusProfileBodyActiveProfileTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const personal = StatusProfileBodyActiveProfileTypeEnum._(r'personal');
  static const business = StatusProfileBodyActiveProfileTypeEnum._(r'business');

  /// List of all possible values in this [enum][StatusProfileBodyActiveProfileTypeEnum].
  static const values = <StatusProfileBodyActiveProfileTypeEnum>[
    personal,
    business,
  ];

  static StatusProfileBodyActiveProfileTypeEnum? fromJson(dynamic value) => StatusProfileBodyActiveProfileTypeEnumTypeTransformer().decode(value);

  static List<StatusProfileBodyActiveProfileTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusProfileBodyActiveProfileTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusProfileBodyActiveProfileTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [StatusProfileBodyActiveProfileTypeEnum] to String,
/// and [decode] dynamic data back to [StatusProfileBodyActiveProfileTypeEnum].
class StatusProfileBodyActiveProfileTypeEnumTypeTransformer {
  factory StatusProfileBodyActiveProfileTypeEnumTypeTransformer() => _instance ??= const StatusProfileBodyActiveProfileTypeEnumTypeTransformer._();

  const StatusProfileBodyActiveProfileTypeEnumTypeTransformer._();

  String encode(StatusProfileBodyActiveProfileTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a StatusProfileBodyActiveProfileTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  StatusProfileBodyActiveProfileTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'personal': return StatusProfileBodyActiveProfileTypeEnum.personal;
        case r'business': return StatusProfileBodyActiveProfileTypeEnum.business;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [StatusProfileBodyActiveProfileTypeEnumTypeTransformer] instance.
  static StatusProfileBodyActiveProfileTypeEnumTypeTransformer? _instance;
}


