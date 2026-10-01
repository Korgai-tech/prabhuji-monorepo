//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BookCategoryCard {
  /// Returns a new [BookCategoryCard] instance.
  BookCategoryCard({
    required this.category,
    required this.title,
    required this.itemCount,
  });

  BookCategoryCardCategoryEnum category;

  String title;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int itemCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BookCategoryCard &&
    other.category == category &&
    other.title == title &&
    other.itemCount == itemCount;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (category.hashCode) +
    (title.hashCode) +
    (itemCount.hashCode);

  @override
  String toString() => 'BookCategoryCard[category=$category, title=$title, itemCount=$itemCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'category'] = this.category;
      json[r'title'] = this.title;
      json[r'itemCount'] = this.itemCount;
    return json;
  }

  /// Returns a new [BookCategoryCard] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BookCategoryCard? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'category'), 'Required key "BookCategoryCard[category]" is missing from JSON.');
        assert(json[r'category'] != null, 'Required key "BookCategoryCard[category]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "BookCategoryCard[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BookCategoryCard[title]" has a null value in JSON.');
        assert(json.containsKey(r'itemCount'), 'Required key "BookCategoryCard[itemCount]" is missing from JSON.');
        assert(json[r'itemCount'] != null, 'Required key "BookCategoryCard[itemCount]" has a null value in JSON.');
        return true;
      }());

      return BookCategoryCard(
        category: BookCategoryCardCategoryEnum.fromJson(json[r'category'])!,
        title: mapValueOfType<String>(json, r'title')!,
        itemCount: mapValueOfType<int>(json, r'itemCount')!,
      );
    }
    return null;
  }

  static List<BookCategoryCard> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookCategoryCard>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookCategoryCard.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BookCategoryCard> mapFromJson(dynamic json) {
    final map = <String, BookCategoryCard>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BookCategoryCard.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BookCategoryCard-objects as value to a dart map
  static Map<String, List<BookCategoryCard>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BookCategoryCard>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BookCategoryCard.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'category',
    'title',
    'itemCount',
  };
}


class BookCategoryCardCategoryEnum {
  /// Instantiate a new enum with the provided [value].
  const BookCategoryCardCategoryEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const chalisa = BookCategoryCardCategoryEnum._(r'Chalisa');
  static const aarti = BookCategoryCardCategoryEnum._(r'Aarti');
  static const kavach = BookCategoryCardCategoryEnum._(r'Kavach');
  static const stotram = BookCategoryCardCategoryEnum._(r'Stotram');

  /// List of all possible values in this [enum][BookCategoryCardCategoryEnum].
  static const values = <BookCategoryCardCategoryEnum>[
    chalisa,
    aarti,
    kavach,
    stotram,
  ];

  static BookCategoryCardCategoryEnum? fromJson(dynamic value) => BookCategoryCardCategoryEnumTypeTransformer().decode(value);

  static List<BookCategoryCardCategoryEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookCategoryCardCategoryEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookCategoryCardCategoryEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookCategoryCardCategoryEnum] to String,
/// and [decode] dynamic data back to [BookCategoryCardCategoryEnum].
class BookCategoryCardCategoryEnumTypeTransformer {
  factory BookCategoryCardCategoryEnumTypeTransformer() => _instance ??= const BookCategoryCardCategoryEnumTypeTransformer._();

  const BookCategoryCardCategoryEnumTypeTransformer._();

  String encode(BookCategoryCardCategoryEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookCategoryCardCategoryEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookCategoryCardCategoryEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'Chalisa': return BookCategoryCardCategoryEnum.chalisa;
        case r'Aarti': return BookCategoryCardCategoryEnum.aarti;
        case r'Kavach': return BookCategoryCardCategoryEnum.kavach;
        case r'Stotram': return BookCategoryCardCategoryEnum.stotram;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookCategoryCardCategoryEnumTypeTransformer] instance.
  static BookCategoryCardCategoryEnumTypeTransformer? _instance;
}


