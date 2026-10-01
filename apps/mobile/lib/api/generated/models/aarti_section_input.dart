//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AartiSectionInput {
  /// Returns a new [AartiSectionInput] instance.
  AartiSectionInput({
    required this.sectionId,
    required this.sectionType,
    required this.title,
    required this.sortOrder,
    this.items = const [],
  });

  String sectionId;

  AartiSectionInputSectionTypeEnum sectionType;

  String title;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int sortOrder;

  List<AartiSectionInputItemsInner> items;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AartiSectionInput &&
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
  String toString() => 'AartiSectionInput[sectionId=$sectionId, sectionType=$sectionType, title=$title, sortOrder=$sortOrder, items=$items]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'sectionId'] = this.sectionId;
      json[r'sectionType'] = this.sectionType;
      json[r'title'] = this.title;
      json[r'sortOrder'] = this.sortOrder;
      json[r'items'] = this.items;
    return json;
  }

  /// Returns a new [AartiSectionInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AartiSectionInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'sectionId'), 'Required key "AartiSectionInput[sectionId]" is missing from JSON.');
        assert(json[r'sectionId'] != null, 'Required key "AartiSectionInput[sectionId]" has a null value in JSON.');
        assert(json.containsKey(r'sectionType'), 'Required key "AartiSectionInput[sectionType]" is missing from JSON.');
        assert(json[r'sectionType'] != null, 'Required key "AartiSectionInput[sectionType]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "AartiSectionInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "AartiSectionInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'sortOrder'), 'Required key "AartiSectionInput[sortOrder]" is missing from JSON.');
        assert(json[r'sortOrder'] != null, 'Required key "AartiSectionInput[sortOrder]" has a null value in JSON.');
        assert(json.containsKey(r'items'), 'Required key "AartiSectionInput[items]" is missing from JSON.');
        assert(json[r'items'] != null, 'Required key "AartiSectionInput[items]" has a null value in JSON.');
        return true;
      }());

      return AartiSectionInput(
        sectionId: mapValueOfType<String>(json, r'sectionId')!,
        sectionType: AartiSectionInputSectionTypeEnum.fromJson(json[r'sectionType'])!,
        title: mapValueOfType<String>(json, r'title')!,
        sortOrder: mapValueOfType<int>(json, r'sortOrder')!,
        items: AartiSectionInputItemsInner.listFromJson(json[r'items']),
      );
    }
    return null;
  }

  static List<AartiSectionInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiSectionInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiSectionInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AartiSectionInput> mapFromJson(dynamic json) {
    final map = <String, AartiSectionInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AartiSectionInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AartiSectionInput-objects as value to a dart map
  static Map<String, List<AartiSectionInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AartiSectionInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AartiSectionInput.listFromJson(entry.value, growable: growable,);
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


class AartiSectionInputSectionTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const AartiSectionInputSectionTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const recentlyPlayed = AartiSectionInputSectionTypeEnum._(r'recently_played');
  static const deities = AartiSectionInputSectionTypeEnum._(r'deities');
  static const browseCategories = AartiSectionInputSectionTypeEnum._(r'browse_categories');
  static const newlyAdded = AartiSectionInputSectionTypeEnum._(r'newly_added');
  static const mostPlayed = AartiSectionInputSectionTypeEnum._(r'most_played');
  static const curated = AartiSectionInputSectionTypeEnum._(r'curated');

  /// List of all possible values in this [enum][AartiSectionInputSectionTypeEnum].
  static const values = <AartiSectionInputSectionTypeEnum>[
    recentlyPlayed,
    deities,
    browseCategories,
    newlyAdded,
    mostPlayed,
    curated,
  ];

  static AartiSectionInputSectionTypeEnum? fromJson(dynamic value) => AartiSectionInputSectionTypeEnumTypeTransformer().decode(value);

  static List<AartiSectionInputSectionTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiSectionInputSectionTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiSectionInputSectionTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AartiSectionInputSectionTypeEnum] to String,
/// and [decode] dynamic data back to [AartiSectionInputSectionTypeEnum].
class AartiSectionInputSectionTypeEnumTypeTransformer {
  factory AartiSectionInputSectionTypeEnumTypeTransformer() => _instance ??= const AartiSectionInputSectionTypeEnumTypeTransformer._();

  const AartiSectionInputSectionTypeEnumTypeTransformer._();

  String encode(AartiSectionInputSectionTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AartiSectionInputSectionTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AartiSectionInputSectionTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'recently_played': return AartiSectionInputSectionTypeEnum.recentlyPlayed;
        case r'deities': return AartiSectionInputSectionTypeEnum.deities;
        case r'browse_categories': return AartiSectionInputSectionTypeEnum.browseCategories;
        case r'newly_added': return AartiSectionInputSectionTypeEnum.newlyAdded;
        case r'most_played': return AartiSectionInputSectionTypeEnum.mostPlayed;
        case r'curated': return AartiSectionInputSectionTypeEnum.curated;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AartiSectionInputSectionTypeEnumTypeTransformer] instance.
  static AartiSectionInputSectionTypeEnumTypeTransformer? _instance;
}


