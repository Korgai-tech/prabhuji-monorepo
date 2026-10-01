//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class WallpaperHomeRowInput {
  /// Returns a new [WallpaperHomeRowInput] instance.
  WallpaperHomeRowInput({
    required this.rowId,
    required this.title,
    required this.rowType,
    required this.iconKey,
    this.items = const [],
  });

  String rowId;

  String title;

  WallpaperHomeRowInputRowTypeEnum rowType;

  String? iconKey;

  List<WallpaperCardInput> items;

  @override
  bool operator ==(Object other) => identical(this, other) || other is WallpaperHomeRowInput &&
    other.rowId == rowId &&
    other.title == title &&
    other.rowType == rowType &&
    other.iconKey == iconKey &&
    _deepEquality.equals(other.items, items);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (rowId.hashCode) +
    (title.hashCode) +
    (rowType.hashCode) +
    (iconKey == null ? 0 : iconKey!.hashCode) +
    (items.hashCode);

  @override
  String toString() => 'WallpaperHomeRowInput[rowId=$rowId, title=$title, rowType=$rowType, iconKey=$iconKey, items=$items]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'rowId'] = this.rowId;
      json[r'title'] = this.title;
      json[r'rowType'] = this.rowType;
    if (this.iconKey != null) {
      json[r'iconKey'] = this.iconKey;
    } else {
      json[r'iconKey'] = null;
    }
      json[r'items'] = this.items;
    return json;
  }

  /// Returns a new [WallpaperHomeRowInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static WallpaperHomeRowInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'rowId'), 'Required key "WallpaperHomeRowInput[rowId]" is missing from JSON.');
        assert(json[r'rowId'] != null, 'Required key "WallpaperHomeRowInput[rowId]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "WallpaperHomeRowInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "WallpaperHomeRowInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'rowType'), 'Required key "WallpaperHomeRowInput[rowType]" is missing from JSON.');
        assert(json[r'rowType'] != null, 'Required key "WallpaperHomeRowInput[rowType]" has a null value in JSON.');
        assert(json.containsKey(r'iconKey'), 'Required key "WallpaperHomeRowInput[iconKey]" is missing from JSON.');
        assert(json.containsKey(r'items'), 'Required key "WallpaperHomeRowInput[items]" is missing from JSON.');
        assert(json[r'items'] != null, 'Required key "WallpaperHomeRowInput[items]" has a null value in JSON.');
        return true;
      }());

      return WallpaperHomeRowInput(
        rowId: mapValueOfType<String>(json, r'rowId')!,
        title: mapValueOfType<String>(json, r'title')!,
        rowType: WallpaperHomeRowInputRowTypeEnum.fromJson(json[r'rowType'])!,
        iconKey: mapValueOfType<String>(json, r'iconKey'),
        items: WallpaperCardInput.listFromJson(json[r'items']),
      );
    }
    return null;
  }

  static List<WallpaperHomeRowInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperHomeRowInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperHomeRowInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, WallpaperHomeRowInput> mapFromJson(dynamic json) {
    final map = <String, WallpaperHomeRowInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = WallpaperHomeRowInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of WallpaperHomeRowInput-objects as value to a dart map
  static Map<String, List<WallpaperHomeRowInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<WallpaperHomeRowInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = WallpaperHomeRowInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'rowId',
    'title',
    'rowType',
    'iconKey',
    'items',
  };
}


class WallpaperHomeRowInputRowTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const WallpaperHomeRowInputRowTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const topLive = WallpaperHomeRowInputRowTypeEnum._(r'top_live');
  static const new_ = WallpaperHomeRowInputRowTypeEnum._(r'new');
  static const trending = WallpaperHomeRowInputRowTypeEnum._(r'trending');
  static const liked = WallpaperHomeRowInputRowTypeEnum._(r'liked');
  static const custom = WallpaperHomeRowInputRowTypeEnum._(r'custom');

  /// List of all possible values in this [enum][WallpaperHomeRowInputRowTypeEnum].
  static const values = <WallpaperHomeRowInputRowTypeEnum>[
    topLive,
    new_,
    trending,
    liked,
    custom,
  ];

  static WallpaperHomeRowInputRowTypeEnum? fromJson(dynamic value) => WallpaperHomeRowInputRowTypeEnumTypeTransformer().decode(value);

  static List<WallpaperHomeRowInputRowTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperHomeRowInputRowTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperHomeRowInputRowTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [WallpaperHomeRowInputRowTypeEnum] to String,
/// and [decode] dynamic data back to [WallpaperHomeRowInputRowTypeEnum].
class WallpaperHomeRowInputRowTypeEnumTypeTransformer {
  factory WallpaperHomeRowInputRowTypeEnumTypeTransformer() => _instance ??= const WallpaperHomeRowInputRowTypeEnumTypeTransformer._();

  const WallpaperHomeRowInputRowTypeEnumTypeTransformer._();

  String encode(WallpaperHomeRowInputRowTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a WallpaperHomeRowInputRowTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  WallpaperHomeRowInputRowTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'top_live': return WallpaperHomeRowInputRowTypeEnum.topLive;
        case r'new': return WallpaperHomeRowInputRowTypeEnum.new_;
        case r'trending': return WallpaperHomeRowInputRowTypeEnum.trending;
        case r'liked': return WallpaperHomeRowInputRowTypeEnum.liked;
        case r'custom': return WallpaperHomeRowInputRowTypeEnum.custom;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [WallpaperHomeRowInputRowTypeEnumTypeTransformer] instance.
  static WallpaperHomeRowInputRowTypeEnumTypeTransformer? _instance;
}


