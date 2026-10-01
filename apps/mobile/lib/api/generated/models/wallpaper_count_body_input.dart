//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class WallpaperCountBodyInput {
  /// Returns a new [WallpaperCountBodyInput] instance.
  WallpaperCountBodyInput({
    required this.type,
  });

  WallpaperCountBodyInputTypeEnum type;

  @override
  bool operator ==(Object other) => identical(this, other) || other is WallpaperCountBodyInput &&
    other.type == type;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (type.hashCode);

  @override
  String toString() => 'WallpaperCountBodyInput[type=$type]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'type'] = this.type;
    return json;
  }

  /// Returns a new [WallpaperCountBodyInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static WallpaperCountBodyInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'type'), 'Required key "WallpaperCountBodyInput[type]" is missing from JSON.');
        assert(json[r'type'] != null, 'Required key "WallpaperCountBodyInput[type]" has a null value in JSON.');
        return true;
      }());

      return WallpaperCountBodyInput(
        type: WallpaperCountBodyInputTypeEnum.fromJson(json[r'type'])!,
      );
    }
    return null;
  }

  static List<WallpaperCountBodyInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperCountBodyInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperCountBodyInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, WallpaperCountBodyInput> mapFromJson(dynamic json) {
    final map = <String, WallpaperCountBodyInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = WallpaperCountBodyInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of WallpaperCountBodyInput-objects as value to a dart map
  static Map<String, List<WallpaperCountBodyInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<WallpaperCountBodyInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = WallpaperCountBodyInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'type',
  };
}


class WallpaperCountBodyInputTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const WallpaperCountBodyInputTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const share = WallpaperCountBodyInputTypeEnum._(r'share');
  static const set_ = WallpaperCountBodyInputTypeEnum._(r'set');

  /// List of all possible values in this [enum][WallpaperCountBodyInputTypeEnum].
  static const values = <WallpaperCountBodyInputTypeEnum>[
    share,
    set_,
  ];

  static WallpaperCountBodyInputTypeEnum? fromJson(dynamic value) => WallpaperCountBodyInputTypeEnumTypeTransformer().decode(value);

  static List<WallpaperCountBodyInputTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperCountBodyInputTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperCountBodyInputTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [WallpaperCountBodyInputTypeEnum] to String,
/// and [decode] dynamic data back to [WallpaperCountBodyInputTypeEnum].
class WallpaperCountBodyInputTypeEnumTypeTransformer {
  factory WallpaperCountBodyInputTypeEnumTypeTransformer() => _instance ??= const WallpaperCountBodyInputTypeEnumTypeTransformer._();

  const WallpaperCountBodyInputTypeEnumTypeTransformer._();

  String encode(WallpaperCountBodyInputTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a WallpaperCountBodyInputTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  WallpaperCountBodyInputTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'share': return WallpaperCountBodyInputTypeEnum.share;
        case r'set': return WallpaperCountBodyInputTypeEnum.set_;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [WallpaperCountBodyInputTypeEnumTypeTransformer] instance.
  static WallpaperCountBodyInputTypeEnumTypeTransformer? _instance;
}


