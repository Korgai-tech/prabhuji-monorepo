//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BooksHomeSectionInput {
  /// Returns a new [BooksHomeSectionInput] instance.
  BooksHomeSectionInput({
    required this.key,
    required this.title,
    required this.sortOrder,
    this.items = const [],
  });

  /// Stable section identity (carousel | categories | newly_added) — the client keys layout off THIS, never off the title.
  BooksHomeSectionInputKeyEnum key;

  /// CMS-owned section heading — render verbatim, never hardcode.
  String title;

  /// CMS-owned render order (ascending).
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int sortOrder;

  List<BooksHomeSectionInputItemsInner> items;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BooksHomeSectionInput &&
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
  String toString() => 'BooksHomeSectionInput[key=$key, title=$title, sortOrder=$sortOrder, items=$items]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'key'] = this.key;
      json[r'title'] = this.title;
      json[r'sortOrder'] = this.sortOrder;
      json[r'items'] = this.items;
    return json;
  }

  /// Returns a new [BooksHomeSectionInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BooksHomeSectionInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'key'), 'Required key "BooksHomeSectionInput[key]" is missing from JSON.');
        assert(json[r'key'] != null, 'Required key "BooksHomeSectionInput[key]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "BooksHomeSectionInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BooksHomeSectionInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'sortOrder'), 'Required key "BooksHomeSectionInput[sortOrder]" is missing from JSON.');
        assert(json[r'sortOrder'] != null, 'Required key "BooksHomeSectionInput[sortOrder]" has a null value in JSON.');
        assert(json.containsKey(r'items'), 'Required key "BooksHomeSectionInput[items]" is missing from JSON.');
        assert(json[r'items'] != null, 'Required key "BooksHomeSectionInput[items]" has a null value in JSON.');
        return true;
      }());

      return BooksHomeSectionInput(
        key: BooksHomeSectionInputKeyEnum.fromJson(json[r'key'])!,
        title: mapValueOfType<String>(json, r'title')!,
        sortOrder: mapValueOfType<int>(json, r'sortOrder')!,
        items: BooksHomeSectionInputItemsInner.listFromJson(json[r'items']),
      );
    }
    return null;
  }

  static List<BooksHomeSectionInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BooksHomeSectionInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BooksHomeSectionInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BooksHomeSectionInput> mapFromJson(dynamic json) {
    final map = <String, BooksHomeSectionInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BooksHomeSectionInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BooksHomeSectionInput-objects as value to a dart map
  static Map<String, List<BooksHomeSectionInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BooksHomeSectionInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BooksHomeSectionInput.listFromJson(entry.value, growable: growable,);
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
class BooksHomeSectionInputKeyEnum {
  /// Instantiate a new enum with the provided [value].
  const BooksHomeSectionInputKeyEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const carousel = BooksHomeSectionInputKeyEnum._(r'carousel');
  static const categories = BooksHomeSectionInputKeyEnum._(r'categories');
  static const newlyAdded = BooksHomeSectionInputKeyEnum._(r'newly_added');

  /// List of all possible values in this [enum][BooksHomeSectionInputKeyEnum].
  static const values = <BooksHomeSectionInputKeyEnum>[
    carousel,
    categories,
    newlyAdded,
  ];

  static BooksHomeSectionInputKeyEnum? fromJson(dynamic value) => BooksHomeSectionInputKeyEnumTypeTransformer().decode(value);

  static List<BooksHomeSectionInputKeyEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BooksHomeSectionInputKeyEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BooksHomeSectionInputKeyEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BooksHomeSectionInputKeyEnum] to String,
/// and [decode] dynamic data back to [BooksHomeSectionInputKeyEnum].
class BooksHomeSectionInputKeyEnumTypeTransformer {
  factory BooksHomeSectionInputKeyEnumTypeTransformer() => _instance ??= const BooksHomeSectionInputKeyEnumTypeTransformer._();

  const BooksHomeSectionInputKeyEnumTypeTransformer._();

  String encode(BooksHomeSectionInputKeyEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BooksHomeSectionInputKeyEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BooksHomeSectionInputKeyEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'carousel': return BooksHomeSectionInputKeyEnum.carousel;
        case r'categories': return BooksHomeSectionInputKeyEnum.categories;
        case r'newly_added': return BooksHomeSectionInputKeyEnum.newlyAdded;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BooksHomeSectionInputKeyEnumTypeTransformer] instance.
  static BooksHomeSectionInputKeyEnumTypeTransformer? _instance;
}


