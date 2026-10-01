//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BooksHomeSection {
  /// Returns a new [BooksHomeSection] instance.
  BooksHomeSection({
    required this.key,
    required this.title,
    required this.sortOrder,
    this.items = const [],
  });

  /// Stable section identity (carousel | categories | newly_added) — the client keys layout off THIS, never off the title.
  BooksHomeSectionKeyEnum key;

  /// CMS-owned section heading — render verbatim, never hardcode.
  String title;

  /// CMS-owned render order (ascending).
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int sortOrder;

  List<BooksHomeSectionItemsInner> items;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BooksHomeSection &&
    other.key == key &&
    other.title == title &&
    other.sortOrder == sortOrder &&
    _deepEquality.equals(other.items, items);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (key.hashCode) +
    (title.hashCode) +
    (sortOrder.hashCode) +
    (items.hashCode);

  @override
  String toString() => 'BooksHomeSection[key=$key, title=$title, sortOrder=$sortOrder, items=$items]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'key'] = this.key;
      json[r'title'] = this.title;
      json[r'sortOrder'] = this.sortOrder;
      json[r'items'] = this.items;
    return json;
  }

  /// Returns a new [BooksHomeSection] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BooksHomeSection? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'key'), 'Required key "BooksHomeSection[key]" is missing from JSON.');
        assert(json[r'key'] != null, 'Required key "BooksHomeSection[key]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "BooksHomeSection[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BooksHomeSection[title]" has a null value in JSON.');
        assert(json.containsKey(r'sortOrder'), 'Required key "BooksHomeSection[sortOrder]" is missing from JSON.');
        assert(json[r'sortOrder'] != null, 'Required key "BooksHomeSection[sortOrder]" has a null value in JSON.');
        assert(json.containsKey(r'items'), 'Required key "BooksHomeSection[items]" is missing from JSON.');
        assert(json[r'items'] != null, 'Required key "BooksHomeSection[items]" has a null value in JSON.');
        return true;
      }());

      return BooksHomeSection(
        key: BooksHomeSectionKeyEnum.fromJson(json[r'key'])!,
        title: mapValueOfType<String>(json, r'title')!,
        sortOrder: mapValueOfType<int>(json, r'sortOrder')!,
        items: BooksHomeSectionItemsInner.listFromJson(json[r'items']),
      );
    }
    return null;
  }

  static List<BooksHomeSection> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BooksHomeSection>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BooksHomeSection.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BooksHomeSection> mapFromJson(dynamic json) {
    final map = <String, BooksHomeSection>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BooksHomeSection.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BooksHomeSection-objects as value to a dart map
  static Map<String, List<BooksHomeSection>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BooksHomeSection>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BooksHomeSection.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'key',
    'title',
    'sortOrder',
    'items',
  };
}

/// Stable section identity (carousel | categories | newly_added) — the client keys layout off THIS, never off the title.
class BooksHomeSectionKeyEnum {
  /// Instantiate a new enum with the provided [value].
  const BooksHomeSectionKeyEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const carousel = BooksHomeSectionKeyEnum._(r'carousel');
  static const categories = BooksHomeSectionKeyEnum._(r'categories');
  static const newlyAdded = BooksHomeSectionKeyEnum._(r'newly_added');

  /// List of all possible values in this [enum][BooksHomeSectionKeyEnum].
  static const values = <BooksHomeSectionKeyEnum>[
    carousel,
    categories,
    newlyAdded,
  ];

  static BooksHomeSectionKeyEnum? fromJson(dynamic value) => BooksHomeSectionKeyEnumTypeTransformer().decode(value);

  static List<BooksHomeSectionKeyEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BooksHomeSectionKeyEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BooksHomeSectionKeyEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BooksHomeSectionKeyEnum] to String,
/// and [decode] dynamic data back to [BooksHomeSectionKeyEnum].
class BooksHomeSectionKeyEnumTypeTransformer {
  factory BooksHomeSectionKeyEnumTypeTransformer() => _instance ??= const BooksHomeSectionKeyEnumTypeTransformer._();

  const BooksHomeSectionKeyEnumTypeTransformer._();

  String encode(BooksHomeSectionKeyEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BooksHomeSectionKeyEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BooksHomeSectionKeyEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'carousel': return BooksHomeSectionKeyEnum.carousel;
        case r'categories': return BooksHomeSectionKeyEnum.categories;
        case r'newly_added': return BooksHomeSectionKeyEnum.newlyAdded;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BooksHomeSectionKeyEnumTypeTransformer] instance.
  static BooksHomeSectionKeyEnumTypeTransformer? _instance;
}


