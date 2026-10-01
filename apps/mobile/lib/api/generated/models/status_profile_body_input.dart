//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class StatusProfileBodyInput {
  /// Returns a new [StatusProfileBodyInput] instance.
  StatusProfileBodyInput({
    required this.activeProfileType,
    this.personalDisplayName,
    this.businessName,
    this.businessDetails,
    this.businessMobileNumber,
    this.avatarImageUrl,
  });

  StatusProfileBodyInputActiveProfileTypeEnum activeProfileType;

  String? personalDisplayName;

  String? businessName;

  String? businessDetails;

  String? businessMobileNumber;

  String? avatarImageUrl;

  @override
  bool operator ==(Object other) => identical(this, other) || other is StatusProfileBodyInput &&
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
  String toString() => 'StatusProfileBodyInput[activeProfileType=$activeProfileType, personalDisplayName=$personalDisplayName, businessName=$businessName, businessDetails=$businessDetails, businessMobileNumber=$businessMobileNumber, avatarImageUrl=$avatarImageUrl]';

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

  /// Returns a new [StatusProfileBodyInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static StatusProfileBodyInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'activeProfileType'), 'Required key "StatusProfileBodyInput[activeProfileType]" is missing from JSON.');
        assert(json[r'activeProfileType'] != null, 'Required key "StatusProfileBodyInput[activeProfileType]" has a null value in JSON.');
        return true;
      }());

      return StatusProfileBodyInput(
        activeProfileType: StatusProfileBodyInputActiveProfileTypeEnum.fromJson(json[r'activeProfileType'])!,
        personalDisplayName: mapValueOfType<String>(json, r'personalDisplayName'),
        businessName: mapValueOfType<String>(json, r'businessName'),
        businessDetails: mapValueOfType<String>(json, r'businessDetails'),
        businessMobileNumber: mapValueOfType<String>(json, r'businessMobileNumber'),
        avatarImageUrl: mapValueOfType<String>(json, r'avatarImageUrl'),
      );
    }
    return null;
  }

  static List<StatusProfileBodyInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusProfileBodyInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusProfileBodyInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, StatusProfileBodyInput> mapFromJson(dynamic json) {
    final map = <String, StatusProfileBodyInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = StatusProfileBodyInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of StatusProfileBodyInput-objects as value to a dart map
  static Map<String, List<StatusProfileBodyInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<StatusProfileBodyInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = StatusProfileBodyInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'activeProfileType',
  };
}


class StatusProfileBodyInputActiveProfileTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const StatusProfileBodyInputActiveProfileTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const personal = StatusProfileBodyInputActiveProfileTypeEnum._(r'personal');
  static const business = StatusProfileBodyInputActiveProfileTypeEnum._(r'business');

  /// List of all possible values in this [enum][StatusProfileBodyInputActiveProfileTypeEnum].
  static const values = <StatusProfileBodyInputActiveProfileTypeEnum>[
    personal,
    business,
  ];

  static StatusProfileBodyInputActiveProfileTypeEnum? fromJson(dynamic value) => StatusProfileBodyInputActiveProfileTypeEnumTypeTransformer().decode(value);

  static List<StatusProfileBodyInputActiveProfileTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusProfileBodyInputActiveProfileTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusProfileBodyInputActiveProfileTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [StatusProfileBodyInputActiveProfileTypeEnum] to String,
/// and [decode] dynamic data back to [StatusProfileBodyInputActiveProfileTypeEnum].
class StatusProfileBodyInputActiveProfileTypeEnumTypeTransformer {
  factory StatusProfileBodyInputActiveProfileTypeEnumTypeTransformer() => _instance ??= const StatusProfileBodyInputActiveProfileTypeEnumTypeTransformer._();

  const StatusProfileBodyInputActiveProfileTypeEnumTypeTransformer._();

  String encode(StatusProfileBodyInputActiveProfileTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a StatusProfileBodyInputActiveProfileTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  StatusProfileBodyInputActiveProfileTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'personal': return StatusProfileBodyInputActiveProfileTypeEnum.personal;
        case r'business': return StatusProfileBodyInputActiveProfileTypeEnum.business;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [StatusProfileBodyInputActiveProfileTypeEnumTypeTransformer] instance.
  static StatusProfileBodyInputActiveProfileTypeEnumTypeTransformer? _instance;
}


