//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RingtoneSetCountBody {
  /// Returns a new [RingtoneSetCountBody] instance.
  RingtoneSetCountBody({
    required this.setTarget,
  });

  RingtoneSetCountBodySetTargetEnum setTarget;

  @override
  bool operator ==(Object other) => identical(this, other) || other is RingtoneSetCountBody &&
    other.setTarget == setTarget;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (setTarget.hashCode);

  @override
  String toString() => 'RingtoneSetCountBody[setTarget=$setTarget]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'setTarget'] = this.setTarget;
    return json;
  }

  /// Returns a new [RingtoneSetCountBody] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RingtoneSetCountBody? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'setTarget'), 'Required key "RingtoneSetCountBody[setTarget]" is missing from JSON.');
        assert(json[r'setTarget'] != null, 'Required key "RingtoneSetCountBody[setTarget]" has a null value in JSON.');
        return true;
      }());

      return RingtoneSetCountBody(
        setTarget: RingtoneSetCountBodySetTargetEnum.fromJson(json[r'setTarget'])!,
      );
    }
    return null;
  }

  static List<RingtoneSetCountBody> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RingtoneSetCountBody>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RingtoneSetCountBody.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RingtoneSetCountBody> mapFromJson(dynamic json) {
    final map = <String, RingtoneSetCountBody>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RingtoneSetCountBody.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RingtoneSetCountBody-objects as value to a dart map
  static Map<String, List<RingtoneSetCountBody>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<RingtoneSetCountBody>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RingtoneSetCountBody.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'setTarget',
  };
}


class RingtoneSetCountBodySetTargetEnum {
  /// Instantiate a new enum with the provided [value].
  const RingtoneSetCountBodySetTargetEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const phoneRingtone = RingtoneSetCountBodySetTargetEnum._(r'phone_ringtone');

  /// List of all possible values in this [enum][RingtoneSetCountBodySetTargetEnum].
  static const values = <RingtoneSetCountBodySetTargetEnum>[
    phoneRingtone,
  ];

  static RingtoneSetCountBodySetTargetEnum? fromJson(dynamic value) => RingtoneSetCountBodySetTargetEnumTypeTransformer().decode(value);

  static List<RingtoneSetCountBodySetTargetEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RingtoneSetCountBodySetTargetEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RingtoneSetCountBodySetTargetEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [RingtoneSetCountBodySetTargetEnum] to String,
/// and [decode] dynamic data back to [RingtoneSetCountBodySetTargetEnum].
class RingtoneSetCountBodySetTargetEnumTypeTransformer {
  factory RingtoneSetCountBodySetTargetEnumTypeTransformer() => _instance ??= const RingtoneSetCountBodySetTargetEnumTypeTransformer._();

  const RingtoneSetCountBodySetTargetEnumTypeTransformer._();

  String encode(RingtoneSetCountBodySetTargetEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a RingtoneSetCountBodySetTargetEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  RingtoneSetCountBodySetTargetEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'phone_ringtone': return RingtoneSetCountBodySetTargetEnum.phoneRingtone;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [RingtoneSetCountBodySetTargetEnumTypeTransformer] instance.
  static RingtoneSetCountBodySetTargetEnumTypeTransformer? _instance;
}


