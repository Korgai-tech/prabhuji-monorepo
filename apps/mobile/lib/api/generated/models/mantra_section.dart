//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraSection {
  /// Returns a new [MantraSection] instance.
  MantraSection({
    required this.sectionId,
    required this.sectionType,
    required this.title,
    required this.layoutType,
    required this.showAllEnabled,
    required this.sortOrder,
    this.items = const [],
  });

  String sectionId;

  MantraSectionSectionTypeEnum sectionType;

  String title;

  MantraSectionLayoutTypeEnum layoutType;

  bool showAllEnabled;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int sortOrder;

  List<MantraSectionItemsInner> items;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraSection &&
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
  String toString() => 'MantraSection[sectionId=$sectionId, sectionType=$sectionType, title=$title, layoutType=$layoutType, showAllEnabled=$showAllEnabled, sortOrder=$sortOrder, items=$items]';

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

  /// Returns a new [MantraSection] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraSection? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'sectionId'), 'Required key "MantraSection[sectionId]" is missing from JSON.');
        assert(json[r'sectionId'] != null, 'Required key "MantraSection[sectionId]" has a null value in JSON.');
        assert(json.containsKey(r'sectionType'), 'Required key "MantraSection[sectionType]" is missing from JSON.');
        assert(json[r'sectionType'] != null, 'Required key "MantraSection[sectionType]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "MantraSection[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "MantraSection[title]" has a null value in JSON.');
        assert(json.containsKey(r'layoutType'), 'Required key "MantraSection[layoutType]" is missing from JSON.');
        assert(json[r'layoutType'] != null, 'Required key "MantraSection[layoutType]" has a null value in JSON.');
        assert(json.containsKey(r'showAllEnabled'), 'Required key "MantraSection[showAllEnabled]" is missing from JSON.');
        assert(json[r'showAllEnabled'] != null, 'Required key "MantraSection[showAllEnabled]" has a null value in JSON.');
        assert(json.containsKey(r'sortOrder'), 'Required key "MantraSection[sortOrder]" is missing from JSON.');
        assert(json[r'sortOrder'] != null, 'Required key "MantraSection[sortOrder]" has a null value in JSON.');
        assert(json.containsKey(r'items'), 'Required key "MantraSection[items]" is missing from JSON.');
        assert(json[r'items'] != null, 'Required key "MantraSection[items]" has a null value in JSON.');
        return true;
      }());

      return MantraSection(
        sectionId: mapValueOfType<String>(json, r'sectionId')!,
        sectionType: MantraSectionSectionTypeEnum.fromJson(json[r'sectionType'])!,
        title: mapValueOfType<String>(json, r'title')!,
        layoutType: MantraSectionLayoutTypeEnum.fromJson(json[r'layoutType'])!,
        showAllEnabled: mapValueOfType<bool>(json, r'showAllEnabled')!,
        sortOrder: mapValueOfType<int>(json, r'sortOrder')!,
        items: MantraSectionItemsInner.listFromJson(json[r'items']),
      );
    }
    return null;
  }

  static List<MantraSection> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraSection>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraSection.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraSection> mapFromJson(dynamic json) {
    final map = <String, MantraSection>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraSection.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraSection-objects as value to a dart map
  static Map<String, List<MantraSection>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraSection>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraSection.listFromJson(entry.value, growable: growable,);
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


class MantraSectionSectionTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const MantraSectionSectionTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const recentlyPlayed = MantraSectionSectionTypeEnum._(r'recently_played');
  static const deities = MantraSectionSectionTypeEnum._(r'deities');
  static const categories = MantraSectionSectionTypeEnum._(r'categories');
  static const newlyAdded = MantraSectionSectionTypeEnum._(r'newly_added');
  static const curated = MantraSectionSectionTypeEnum._(r'curated');

  /// List of all possible values in this [enum][MantraSectionSectionTypeEnum].
  static const values = <MantraSectionSectionTypeEnum>[
    recentlyPlayed,
    deities,
    categories,
    newlyAdded,
    curated,
  ];

  static MantraSectionSectionTypeEnum? fromJson(dynamic value) => MantraSectionSectionTypeEnumTypeTransformer().decode(value);

  static List<MantraSectionSectionTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraSectionSectionTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraSectionSectionTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MantraSectionSectionTypeEnum] to String,
/// and [decode] dynamic data back to [MantraSectionSectionTypeEnum].
class MantraSectionSectionTypeEnumTypeTransformer {
  factory MantraSectionSectionTypeEnumTypeTransformer() => _instance ??= const MantraSectionSectionTypeEnumTypeTransformer._();

  const MantraSectionSectionTypeEnumTypeTransformer._();

  String encode(MantraSectionSectionTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a MantraSectionSectionTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MantraSectionSectionTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'recently_played': return MantraSectionSectionTypeEnum.recentlyPlayed;
        case r'deities': return MantraSectionSectionTypeEnum.deities;
        case r'categories': return MantraSectionSectionTypeEnum.categories;
        case r'newly_added': return MantraSectionSectionTypeEnum.newlyAdded;
        case r'curated': return MantraSectionSectionTypeEnum.curated;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [MantraSectionSectionTypeEnumTypeTransformer] instance.
  static MantraSectionSectionTypeEnumTypeTransformer? _instance;
}



class MantraSectionLayoutTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const MantraSectionLayoutTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const horizontalCards = MantraSectionLayoutTypeEnum._(r'horizontal_cards');
  static const deityRow = MantraSectionLayoutTypeEnum._(r'deity_row');
  static const categoryGrid = MantraSectionLayoutTypeEnum._(r'category_grid');

  /// List of all possible values in this [enum][MantraSectionLayoutTypeEnum].
  static const values = <MantraSectionLayoutTypeEnum>[
    horizontalCards,
    deityRow,
    categoryGrid,
  ];

  static MantraSectionLayoutTypeEnum? fromJson(dynamic value) => MantraSectionLayoutTypeEnumTypeTransformer().decode(value);

  static List<MantraSectionLayoutTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraSectionLayoutTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraSectionLayoutTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MantraSectionLayoutTypeEnum] to String,
/// and [decode] dynamic data back to [MantraSectionLayoutTypeEnum].
class MantraSectionLayoutTypeEnumTypeTransformer {
  factory MantraSectionLayoutTypeEnumTypeTransformer() => _instance ??= const MantraSectionLayoutTypeEnumTypeTransformer._();

  const MantraSectionLayoutTypeEnumTypeTransformer._();

  String encode(MantraSectionLayoutTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a MantraSectionLayoutTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MantraSectionLayoutTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'horizontal_cards': return MantraSectionLayoutTypeEnum.horizontalCards;
        case r'deity_row': return MantraSectionLayoutTypeEnum.deityRow;
        case r'category_grid': return MantraSectionLayoutTypeEnum.categoryGrid;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [MantraSectionLayoutTypeEnumTypeTransformer] instance.
  static MantraSectionLayoutTypeEnumTypeTransformer? _instance;
}


