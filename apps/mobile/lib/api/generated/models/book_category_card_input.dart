//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BookCategoryCardInput {
  /// Returns a new [BookCategoryCardInput] instance.
  BookCategoryCardInput({
    required this.category,
    required this.title,
    required this.itemCount,
  });

  BookCategoryCardInputCategoryEnum category;

  String title;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int itemCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BookCategoryCardInput &&
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
  String toString() => 'BookCategoryCardInput[category=$category, title=$title, itemCount=$itemCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'category'] = this.category;
      json[r'title'] = this.title;
      json[r'itemCount'] = this.itemCount;
    return json;
  }

  /// Returns a new [BookCategoryCardInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BookCategoryCardInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'category'), 'Required key "BookCategoryCardInput[category]" is missing from JSON.');
        assert(json[r'category'] != null, 'Required key "BookCategoryCardInput[category]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "BookCategoryCardInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BookCategoryCardInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'itemCount'), 'Required key "BookCategoryCardInput[itemCount]" is missing from JSON.');
        assert(json[r'itemCount'] != null, 'Required key "BookCategoryCardInput[itemCount]" has a null value in JSON.');
        return true;
      }());

      return BookCategoryCardInput(
        category: BookCategoryCardInputCategoryEnum.fromJson(json[r'category'])!,
        title: mapValueOfType<String>(json, r'title')!,
        itemCount: mapValueOfType<int>(json, r'itemCount')!,
      );
    }
    return null;
  }

  static List<BookCategoryCardInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookCategoryCardInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookCategoryCardInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BookCategoryCardInput> mapFromJson(dynamic json) {
    final map = <String, BookCategoryCardInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BookCategoryCardInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BookCategoryCardInput-objects as value to a dart map
  static Map<String, List<BookCategoryCardInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BookCategoryCardInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BookCategoryCardInput.listFromJson(entry.value, growable: growable,);
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


class BookCategoryCardInputCategoryEnum {
  /// Instantiate a new enum with the provided [value].
  const BookCategoryCardInputCategoryEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const chalisa = BookCategoryCardInputCategoryEnum._(r'Chalisa');
  static const aarti = BookCategoryCardInputCategoryEnum._(r'Aarti');
  static const kavach = BookCategoryCardInputCategoryEnum._(r'Kavach');
  static const stotram = BookCategoryCardInputCategoryEnum._(r'Stotram');

  /// List of all possible values in this [enum][BookCategoryCardInputCategoryEnum].
  static const values = <BookCategoryCardInputCategoryEnum>[
    chalisa,
    aarti,
    kavach,
    stotram,
  ];

  static BookCategoryCardInputCategoryEnum? fromJson(dynamic value) => BookCategoryCardInputCategoryEnumTypeTransformer().decode(value);

  static List<BookCategoryCardInputCategoryEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookCategoryCardInputCategoryEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookCategoryCardInputCategoryEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookCategoryCardInputCategoryEnum] to String,
/// and [decode] dynamic data back to [BookCategoryCardInputCategoryEnum].
class BookCategoryCardInputCategoryEnumTypeTransformer {
  factory BookCategoryCardInputCategoryEnumTypeTransformer() => _instance ??= const BookCategoryCardInputCategoryEnumTypeTransformer._();

  const BookCategoryCardInputCategoryEnumTypeTransformer._();

  String encode(BookCategoryCardInputCategoryEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookCategoryCardInputCategoryEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookCategoryCardInputCategoryEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'Chalisa': return BookCategoryCardInputCategoryEnum.chalisa;
        case r'Aarti': return BookCategoryCardInputCategoryEnum.aarti;
        case r'Kavach': return BookCategoryCardInputCategoryEnum.kavach;
        case r'Stotram': return BookCategoryCardInputCategoryEnum.stotram;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookCategoryCardInputCategoryEnumTypeTransformer] instance.
  static BookCategoryCardInputCategoryEnumTypeTransformer? _instance;
}


