//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class WallpaperCountResult {
  /// Returns a new [WallpaperCountResult] instance.
  WallpaperCountResult({
    required this.wallpaperId,
    required this.type,
    required this.count,
  });

  String wallpaperId;

  WallpaperCountResultTypeEnum type;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int count;

  @override
  bool operator ==(Object other) => identical(this, other) || other is WallpaperCountResult &&
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
  String toString() => 'WallpaperCountResult[wallpaperId=$wallpaperId, type=$type, count=$count]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'wallpaperId'] = this.wallpaperId;
      json[r'type'] = this.type;
      json[r'count'] = this.count;
    return json;
  }

  /// Returns a new [WallpaperCountResult] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static WallpaperCountResult? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'wallpaperId'), 'Required key "WallpaperCountResult[wallpaperId]" is missing from JSON.');
        assert(json[r'wallpaperId'] != null, 'Required key "WallpaperCountResult[wallpaperId]" has a null value in JSON.');
        assert(json.containsKey(r'type'), 'Required key "WallpaperCountResult[type]" is missing from JSON.');
        assert(json[r'type'] != null, 'Required key "WallpaperCountResult[type]" has a null value in JSON.');
        assert(json.containsKey(r'count'), 'Required key "WallpaperCountResult[count]" is missing from JSON.');
        assert(json[r'count'] != null, 'Required key "WallpaperCountResult[count]" has a null value in JSON.');
        return true;
      }());

      return WallpaperCountResult(
        wallpaperId: mapValueOfType<String>(json, r'wallpaperId')!,
        type: WallpaperCountResultTypeEnum.fromJson(json[r'type'])!,
        count: mapValueOfType<int>(json, r'count')!,
      );
    }
    return null;
  }

  static List<WallpaperCountResult> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperCountResult>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperCountResult.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, WallpaperCountResult> mapFromJson(dynamic json) {
    final map = <String, WallpaperCountResult>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = WallpaperCountResult.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of WallpaperCountResult-objects as value to a dart map
  static Map<String, List<WallpaperCountResult>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<WallpaperCountResult>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = WallpaperCountResult.listFromJson(entry.value, growable: growable,);
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


class WallpaperCountResultTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const WallpaperCountResultTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const share = WallpaperCountResultTypeEnum._(r'share');
  static const set_ = WallpaperCountResultTypeEnum._(r'set');

  /// List of all possible values in this [enum][WallpaperCountResultTypeEnum].
  static const values = <WallpaperCountResultTypeEnum>[
    share,
    set_,
  ];

  static WallpaperCountResultTypeEnum? fromJson(dynamic value) => WallpaperCountResultTypeEnumTypeTransformer().decode(value);

  static List<WallpaperCountResultTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperCountResultTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperCountResultTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [WallpaperCountResultTypeEnum] to String,
/// and [decode] dynamic data back to [WallpaperCountResultTypeEnum].
class WallpaperCountResultTypeEnumTypeTransformer {
  factory WallpaperCountResultTypeEnumTypeTransformer() => _instance ??= const WallpaperCountResultTypeEnumTypeTransformer._();

  const WallpaperCountResultTypeEnumTypeTransformer._();

  String encode(WallpaperCountResultTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a WallpaperCountResultTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  WallpaperCountResultTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'share': return WallpaperCountResultTypeEnum.share;
        case r'set': return WallpaperCountResultTypeEnum.set_;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [WallpaperCountResultTypeEnumTypeTransformer] instance.
  static WallpaperCountResultTypeEnumTypeTransformer? _instance;
}


