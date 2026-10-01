//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BookSectionCategoryItem {
  /// Returns a new [BookSectionCategoryItem] instance.
  BookSectionCategoryItem({
    required this.kind,
    required this.category,
    required this.title,
    required this.itemCount,
  });

  BookSectionCategoryItemKindEnum kind;

  BookSectionCategoryItemCategoryEnum category;

  String title;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int itemCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BookSectionCategoryItem &&
    other.kind == kind &&
    other.category == category &&
    other.title == title &&
    other.itemCount == itemCount;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (kind.hashCode) +
    (category.hashCode) +
    (title.hashCode) +
    (itemCount.hashCode);

  @override
  String toString() => 'BookSectionCategoryItem[kind=$kind, category=$category, title=$title, itemCount=$itemCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'kind'] = this.kind;
      json[r'category'] = this.category;
      json[r'title'] = this.title;
      json[r'itemCount'] = this.itemCount;
    return json;
  }

  /// Returns a new [BookSectionCategoryItem] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BookSectionCategoryItem? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "BookSectionCategoryItem[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "BookSectionCategoryItem[kind]" has a null value in JSON.');
        assert(json.containsKey(r'category'), 'Required key "BookSectionCategoryItem[category]" is missing from JSON.');
        assert(json[r'category'] != null, 'Required key "BookSectionCategoryItem[category]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "BookSectionCategoryItem[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BookSectionCategoryItem[title]" has a null value in JSON.');
        assert(json.containsKey(r'itemCount'), 'Required key "BookSectionCategoryItem[itemCount]" is missing from JSON.');
        assert(json[r'itemCount'] != null, 'Required key "BookSectionCategoryItem[itemCount]" has a null value in JSON.');
        return true;
      }());

      return BookSectionCategoryItem(
        kind: BookSectionCategoryItemKindEnum.fromJson(json[r'kind'])!,
        category: BookSectionCategoryItemCategoryEnum.fromJson(json[r'category'])!,
        title: mapValueOfType<String>(json, r'title')!,
        itemCount: mapValueOfType<int>(json, r'itemCount')!,
      );
    }
    return null;
  }

  static List<BookSectionCategoryItem> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookSectionCategoryItem>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookSectionCategoryItem.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BookSectionCategoryItem> mapFromJson(dynamic json) {
    final map = <String, BookSectionCategoryItem>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BookSectionCategoryItem.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BookSectionCategoryItem-objects as value to a dart map
  static Map<String, List<BookSectionCategoryItem>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BookSectionCategoryItem>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BookSectionCategoryItem.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'kind',
    'category',
    'title',
    'itemCount',
  };
}


class BookSectionCategoryItemKindEnum {
  /// Instantiate a new enum with the provided [value].
  const BookSectionCategoryItemKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const category = BookSectionCategoryItemKindEnum._(r'category');

  /// List of all possible values in this [enum][BookSectionCategoryItemKindEnum].
  static const values = <BookSectionCategoryItemKindEnum>[
    category,
  ];

  static BookSectionCategoryItemKindEnum? fromJson(dynamic value) => BookSectionCategoryItemKindEnumTypeTransformer().decode(value);

  static List<BookSectionCategoryItemKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookSectionCategoryItemKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookSectionCategoryItemKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookSectionCategoryItemKindEnum] to String,
/// and [decode] dynamic data back to [BookSectionCategoryItemKindEnum].
class BookSectionCategoryItemKindEnumTypeTransformer {
  factory BookSectionCategoryItemKindEnumTypeTransformer() => _instance ??= const BookSectionCategoryItemKindEnumTypeTransformer._();

  const BookSectionCategoryItemKindEnumTypeTransformer._();

  String encode(BookSectionCategoryItemKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookSectionCategoryItemKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookSectionCategoryItemKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'category': return BookSectionCategoryItemKindEnum.category;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookSectionCategoryItemKindEnumTypeTransformer] instance.
  static BookSectionCategoryItemKindEnumTypeTransformer? _instance;
}



class BookSectionCategoryItemCategoryEnum {
  /// Instantiate a new enum with the provided [value].
  const BookSectionCategoryItemCategoryEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const chalisa = BookSectionCategoryItemCategoryEnum._(r'Chalisa');
  static const aarti = BookSectionCategoryItemCategoryEnum._(r'Aarti');
  static const kavach = BookSectionCategoryItemCategoryEnum._(r'Kavach');
  static const stotram = BookSectionCategoryItemCategoryEnum._(r'Stotram');

  /// List of all possible values in this [enum][BookSectionCategoryItemCategoryEnum].
  static const values = <BookSectionCategoryItemCategoryEnum>[
    chalisa,
    aarti,
    kavach,
    stotram,
  ];

  static BookSectionCategoryItemCategoryEnum? fromJson(dynamic value) => BookSectionCategoryItemCategoryEnumTypeTransformer().decode(value);

  static List<BookSectionCategoryItemCategoryEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookSectionCategoryItemCategoryEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookSectionCategoryItemCategoryEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookSectionCategoryItemCategoryEnum] to String,
/// and [decode] dynamic data back to [BookSectionCategoryItemCategoryEnum].
class BookSectionCategoryItemCategoryEnumTypeTransformer {
  factory BookSectionCategoryItemCategoryEnumTypeTransformer() => _instance ??= const BookSectionCategoryItemCategoryEnumTypeTransformer._();

  const BookSectionCategoryItemCategoryEnumTypeTransformer._();

  String encode(BookSectionCategoryItemCategoryEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookSectionCategoryItemCategoryEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookSectionCategoryItemCategoryEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'Chalisa': return BookSectionCategoryItemCategoryEnum.chalisa;
        case r'Aarti': return BookSectionCategoryItemCategoryEnum.aarti;
        case r'Kavach': return BookSectionCategoryItemCategoryEnum.kavach;
        case r'Stotram': return BookSectionCategoryItemCategoryEnum.stotram;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookSectionCategoryItemCategoryEnumTypeTransformer] instance.
  static BookSectionCategoryItemCategoryEnumTypeTransformer? _instance;
}


