//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AartiSection {
  /// Returns a new [AartiSection] instance.
  AartiSection({
    required this.sectionId,
    required this.sectionType,
    required this.title,
    required this.sortOrder,
    this.items = const [],
  });

  String sectionId;

  AartiSectionSectionTypeEnum sectionType;

  String title;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int sortOrder;

  List<AartiSectionItemsInner> items;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AartiSection &&
    other.sectionId == sectionId &&
    other.sectionType == sectionType &&
    other.title == title &&
    other.sortOrder == sortOrder &&
    _deepEquality.equals(other.items, items);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (sectionId.hashCode) +
    (sectionType.hashCode) +
    (title.hashCode) +
    (sortOrder.hashCode) +
    (items.hashCode);

  @override
  String toString() => 'AartiSection[sectionId=$sectionId, sectionType=$sectionType, title=$title, sortOrder=$sortOrder, items=$items]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'sectionId'] = this.sectionId;
      json[r'sectionType'] = this.sectionType;
      json[r'title'] = this.title;
      json[r'sortOrder'] = this.sortOrder;
      json[r'items'] = this.items;
    return json;
  }

  /// Returns a new [AartiSection] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AartiSection? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'sectionId'), 'Required key "AartiSection[sectionId]" is missing from JSON.');
        assert(json[r'sectionId'] != null, 'Required key "AartiSection[sectionId]" has a null value in JSON.');
        assert(json.containsKey(r'sectionType'), 'Required key "AartiSection[sectionType]" is missing from JSON.');
        assert(json[r'sectionType'] != null, 'Required key "AartiSection[sectionType]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "AartiSection[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "AartiSection[title]" has a null value in JSON.');
        assert(json.containsKey(r'sortOrder'), 'Required key "AartiSection[sortOrder]" is missing from JSON.');
        assert(json[r'sortOrder'] != null, 'Required key "AartiSection[sortOrder]" has a null value in JSON.');
        assert(json.containsKey(r'items'), 'Required key "AartiSection[items]" is missing from JSON.');
        assert(json[r'items'] != null, 'Required key "AartiSection[items]" has a null value in JSON.');
        return true;
      }());

      return AartiSection(
        sectionId: mapValueOfType<String>(json, r'sectionId')!,
        sectionType: AartiSectionSectionTypeEnum.fromJson(json[r'sectionType'])!,
        title: mapValueOfType<String>(json, r'title')!,
        sortOrder: mapValueOfType<int>(json, r'sortOrder')!,
        items: AartiSectionItemsInner.listFromJson(json[r'items']),
      );
    }
    return null;
  }

  static List<AartiSection> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiSection>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiSection.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AartiSection> mapFromJson(dynamic json) {
    final map = <String, AartiSection>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AartiSection.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AartiSection-objects as value to a dart map
  static Map<String, List<AartiSection>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AartiSection>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AartiSection.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'sectionId',
    'sectionType',
    'title',
    'sortOrder',
    'items',
  };
}


class AartiSectionSectionTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const AartiSectionSectionTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const recentlyPlayed = AartiSectionSectionTypeEnum._(r'recently_played');
  static const deities = AartiSectionSectionTypeEnum._(r'deities');
  static const browseCategories = AartiSectionSectionTypeEnum._(r'browse_categories');
  static const newlyAdded = AartiSectionSectionTypeEnum._(r'newly_added');
  static const mostPlayed = AartiSectionSectionTypeEnum._(r'most_played');
  static const curated = AartiSectionSectionTypeEnum._(r'curated');

  /// List of all possible values in this [enum][AartiSectionSectionTypeEnum].
  static const values = <AartiSectionSectionTypeEnum>[
    recentlyPlayed,
    deities,
    browseCategories,
    newlyAdded,
    mostPlayed,
    curated,
  ];

  static AartiSectionSectionTypeEnum? fromJson(dynamic value) => AartiSectionSectionTypeEnumTypeTransformer().decode(value);

  static List<AartiSectionSectionTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiSectionSectionTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiSectionSectionTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AartiSectionSectionTypeEnum] to String,
/// and [decode] dynamic data back to [AartiSectionSectionTypeEnum].
class AartiSectionSectionTypeEnumTypeTransformer {
  factory AartiSectionSectionTypeEnumTypeTransformer() => _instance ??= const AartiSectionSectionTypeEnumTypeTransformer._();

  const AartiSectionSectionTypeEnumTypeTransformer._();

  String encode(AartiSectionSectionTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AartiSectionSectionTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AartiSectionSectionTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'recently_played': return AartiSectionSectionTypeEnum.recentlyPlayed;
        case r'deities': return AartiSectionSectionTypeEnum.deities;
        case r'browse_categories': return AartiSectionSectionTypeEnum.browseCategories;
        case r'newly_added': return AartiSectionSectionTypeEnum.newlyAdded;
        case r'most_played': return AartiSectionSectionTypeEnum.mostPlayed;
        case r'curated': return AartiSectionSectionTypeEnum.curated;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AartiSectionSectionTypeEnumTypeTransformer] instance.
  static AartiSectionSectionTypeEnumTypeTransformer? _instance;
}


