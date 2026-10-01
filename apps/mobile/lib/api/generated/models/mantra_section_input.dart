//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraSectionInput {
  /// Returns a new [MantraSectionInput] instance.
  MantraSectionInput({
    required this.sectionId,
    required this.sectionType,
    required this.title,
    required this.layoutType,
    required this.showAllEnabled,
    required this.sortOrder,
    this.items = const [],
  });

  String sectionId;

  MantraSectionInputSectionTypeEnum sectionType;

  String title;

  MantraSectionInputLayoutTypeEnum layoutType;

  bool showAllEnabled;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int sortOrder;

  List<MantraSectionInputItemsInner> items;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraSectionInput &&
    other.sectionId == sectionId &&
    other.sectionType == sectionType &&
    other.title == title &&
    other.layoutType == layoutType &&
    other.showAllEnabled == showAllEnabled &&
    other.sortOrder == sortOrder &&
    _deepEquality.equals(other.items, items);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (sectionId.hashCode) +
    (sectionType.hashCode) +
    (title.hashCode) +
    (layoutType.hashCode) +
    (showAllEnabled.hashCode) +
    (sortOrder.hashCode) +
    (items.hashCode);

  @override
  String toString() => 'MantraSectionInput[sectionId=$sectionId, sectionType=$sectionType, title=$title, layoutType=$layoutType, showAllEnabled=$showAllEnabled, sortOrder=$sortOrder, items=$items]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'sectionId'] = this.sectionId;
      json[r'sectionType'] = this.sectionType;
      json[r'title'] = this.title;
      json[r'layoutType'] = this.layoutType;
      json[r'showAllEnabled'] = this.showAllEnabled;
      json[r'sortOrder'] = this.sortOrder;
      json[r'items'] = this.items;
    return json;
  }

  /// Returns a new [MantraSectionInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraSectionInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'sectionId'), 'Required key "MantraSectionInput[sectionId]" is missing from JSON.');
        assert(json[r'sectionId'] != null, 'Required key "MantraSectionInput[sectionId]" has a null value in JSON.');
        assert(json.containsKey(r'sectionType'), 'Required key "MantraSectionInput[sectionType]" is missing from JSON.');
        assert(json[r'sectionType'] != null, 'Required key "MantraSectionInput[sectionType]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "MantraSectionInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "MantraSectionInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'layoutType'), 'Required key "MantraSectionInput[layoutType]" is missing from JSON.');
        assert(json[r'layoutType'] != null, 'Required key "MantraSectionInput[layoutType]" has a null value in JSON.');
        assert(json.containsKey(r'showAllEnabled'), 'Required key "MantraSectionInput[showAllEnabled]" is missing from JSON.');
        assert(json[r'showAllEnabled'] != null, 'Required key "MantraSectionInput[showAllEnabled]" has a null value in JSON.');
        assert(json.containsKey(r'sortOrder'), 'Required key "MantraSectionInput[sortOrder]" is missing from JSON.');
        assert(json[r'sortOrder'] != null, 'Required key "MantraSectionInput[sortOrder]" has a null value in JSON.');
        assert(json.containsKey(r'items'), 'Required key "MantraSectionInput[items]" is missing from JSON.');
        assert(json[r'items'] != null, 'Required key "MantraSectionInput[items]" has a null value in JSON.');
        return true;
      }());

      return MantraSectionInput(
        sectionId: mapValueOfType<String>(json, r'sectionId')!,
        sectionType: MantraSectionInputSectionTypeEnum.fromJson(json[r'sectionType'])!,
        title: mapValueOfType<String>(json, r'title')!,
        layoutType: MantraSectionInputLayoutTypeEnum.fromJson(json[r'layoutType'])!,
        showAllEnabled: mapValueOfType<bool>(json, r'showAllEnabled')!,
        sortOrder: mapValueOfType<int>(json, r'sortOrder')!,
        items: MantraSectionInputItemsInner.listFromJson(json[r'items']),
      );
    }
    return null;
  }

  static List<MantraSectionInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraSectionInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraSectionInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraSectionInput> mapFromJson(dynamic json) {
    final map = <String, MantraSectionInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraSectionInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraSectionInput-objects as value to a dart map
  static Map<String, List<MantraSectionInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraSectionInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraSectionInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'sectionId',
    'sectionType',
    'title',
    'layoutType',
    'showAllEnabled',
    'sortOrder',
    'items',
  };
}


class MantraSectionInputSectionTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const MantraSectionInputSectionTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const recentlyPlayed = MantraSectionInputSectionTypeEnum._(r'recently_played');
  static const deities = MantraSectionInputSectionTypeEnum._(r'deities');
  static const categories = MantraSectionInputSectionTypeEnum._(r'categories');
  static const newlyAdded = MantraSectionInputSectionTypeEnum._(r'newly_added');
  static const curated = MantraSectionInputSectionTypeEnum._(r'curated');

  /// List of all possible values in this [enum][MantraSectionInputSectionTypeEnum].
  static const values = <MantraSectionInputSectionTypeEnum>[
    recentlyPlayed,
    deities,
    categories,
    newlyAdded,
    curated,
  ];

  static MantraSectionInputSectionTypeEnum? fromJson(dynamic value) => MantraSectionInputSectionTypeEnumTypeTransformer().decode(value);

  static List<MantraSectionInputSectionTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraSectionInputSectionTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraSectionInputSectionTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MantraSectionInputSectionTypeEnum] to String,
/// and [decode] dynamic data back to [MantraSectionInputSectionTypeEnum].
class MantraSectionInputSectionTypeEnumTypeTransformer {
  factory MantraSectionInputSectionTypeEnumTypeTransformer() => _instance ??= const MantraSectionInputSectionTypeEnumTypeTransformer._();

  const MantraSectionInputSectionTypeEnumTypeTransformer._();

  String encode(MantraSectionInputSectionTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a MantraSectionInputSectionTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MantraSectionInputSectionTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'recently_played': return MantraSectionInputSectionTypeEnum.recentlyPlayed;
        case r'deities': return MantraSectionInputSectionTypeEnum.deities;
        case r'categories': return MantraSectionInputSectionTypeEnum.categories;
        case r'newly_added': return MantraSectionInputSectionTypeEnum.newlyAdded;
        case r'curated': return MantraSectionInputSectionTypeEnum.curated;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [MantraSectionInputSectionTypeEnumTypeTransformer] instance.
  static MantraSectionInputSectionTypeEnumTypeTransformer? _instance;
}



class MantraSectionInputLayoutTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const MantraSectionInputLayoutTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const horizontalCards = MantraSectionInputLayoutTypeEnum._(r'horizontal_cards');
  static const deityRow = MantraSectionInputLayoutTypeEnum._(r'deity_row');
  static const categoryGrid = MantraSectionInputLayoutTypeEnum._(r'category_grid');

  /// List of all possible values in this [enum][MantraSectionInputLayoutTypeEnum].
  static const values = <MantraSectionInputLayoutTypeEnum>[
    horizontalCards,
    deityRow,
    categoryGrid,
  ];

  static MantraSectionInputLayoutTypeEnum? fromJson(dynamic value) => MantraSectionInputLayoutTypeEnumTypeTransformer().decode(value);

  static List<MantraSectionInputLayoutTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraSectionInputLayoutTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraSectionInputLayoutTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MantraSectionInputLayoutTypeEnum] to String,
/// and [decode] dynamic data back to [MantraSectionInputLayoutTypeEnum].
class MantraSectionInputLayoutTypeEnumTypeTransformer {
  factory MantraSectionInputLayoutTypeEnumTypeTransformer() => _instance ??= const MantraSectionInputLayoutTypeEnumTypeTransformer._();

  const MantraSectionInputLayoutTypeEnumTypeTransformer._();

  String encode(MantraSectionInputLayoutTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a MantraSectionInputLayoutTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MantraSectionInputLayoutTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'horizontal_cards': return MantraSectionInputLayoutTypeEnum.horizontalCards;
        case r'deity_row': return MantraSectionInputLayoutTypeEnum.deityRow;
        case r'category_grid': return MantraSectionInputLayoutTypeEnum.categoryGrid;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [MantraSectionInputLayoutTypeEnumTypeTransformer] instance.
  static MantraSectionInputLayoutTypeEnumTypeTransformer? _instance;
}


