//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class WallpaperCountResultInput {
  /// Returns a new [WallpaperCountResultInput] instance.
  WallpaperCountResultInput({
    required this.wallpaperId,
    required this.type,
    required this.count,
  });

  String wallpaperId;

  WallpaperCountResultInputTypeEnum type;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int count;

  @override
  bool operator ==(Object other) => identical(this, other) || other is WallpaperCountResultInput &&
    other.wallpaperId == wallpaperId &&
    other.type == type &&
    other.count == count;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (wallpaperId.hashCode) +
    (type.hashCode) +
    (count.hashCode);

  @override
  String toString() => 'WallpaperCountResultInput[wallpaperId=$wallpaperId, type=$type, count=$count]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'wallpaperId'] = this.wallpaperId;
      json[r'type'] = this.type;
      json[r'count'] = this.count;
    return json;
  }

  /// Returns a new [WallpaperCountResultInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static WallpaperCountResultInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'wallpaperId'), 'Required key "WallpaperCountResultInput[wallpaperId]" is missing from JSON.');
        assert(json[r'wallpaperId'] != null, 'Required key "WallpaperCountResultInput[wallpaperId]" has a null value in JSON.');
        assert(json.containsKey(r'type'), 'Required key "WallpaperCountResultInput[type]" is missing from JSON.');
        assert(json[r'type'] != null, 'Required key "WallpaperCountResultInput[type]" has a null value in JSON.');
        assert(json.containsKey(r'count'), 'Required key "WallpaperCountResultInput[count]" is missing from JSON.');
        assert(json[r'count'] != null, 'Required key "WallpaperCountResultInput[count]" has a null value in JSON.');
        return true;
      }());

      return WallpaperCountResultInput(
        wallpaperId: mapValueOfType<String>(json, r'wallpaperId')!,
        type: WallpaperCountResultInputTypeEnum.fromJson(json[r'type'])!,
        count: mapValueOfType<int>(json, r'count')!,
      );
    }
    return null;
  }

  static List<WallpaperCountResultInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperCountResultInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperCountResultInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, WallpaperCountResultInput> mapFromJson(dynamic json) {
    final map = <String, WallpaperCountResultInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = WallpaperCountResultInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of WallpaperCountResultInput-objects as value to a dart map
  static Map<String, List<WallpaperCountResultInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<WallpaperCountResultInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = WallpaperCountResultInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'wallpaperId',
    'type',
    'count',
  };
}


class WallpaperCountResultInputTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const WallpaperCountResultInputTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const share = WallpaperCountResultInputTypeEnum._(r'share');
  static const set_ = WallpaperCountResultInputTypeEnum._(r'set');

  /// List of all possible values in this [enum][WallpaperCountResultInputTypeEnum].
  static const values = <WallpaperCountResultInputTypeEnum>[
    share,
    set_,
  ];

  static WallpaperCountResultInputTypeEnum? fromJson(dynamic value) => WallpaperCountResultInputTypeEnumTypeTransformer().decode(value);

  static List<WallpaperCountResultInputTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperCountResultInputTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperCountResultInputTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [WallpaperCountResultInputTypeEnum] to String,
/// and [decode] dynamic data back to [WallpaperCountResultInputTypeEnum].
class WallpaperCountResultInputTypeEnumTypeTransformer {
  factory WallpaperCountResultInputTypeEnumTypeTransformer() => _instance ??= const WallpaperCountResultInputTypeEnumTypeTransformer._();

  const WallpaperCountResultInputTypeEnumTypeTransformer._();

  String encode(WallpaperCountResultInputTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a WallpaperCountResultInputTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  WallpaperCountResultInputTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'share': return WallpaperCountResultInputTypeEnum.share;
        case r'set': return WallpaperCountResultInputTypeEnum.set_;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [WallpaperCountResultInputTypeEnumTypeTransformer] instance.
  static WallpaperCountResultInputTypeEnumTypeTransformer? _instance;
}


