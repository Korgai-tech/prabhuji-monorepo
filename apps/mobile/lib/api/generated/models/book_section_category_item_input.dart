//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BookSectionCategoryItemInput {
  /// Returns a new [BookSectionCategoryItemInput] instance.
  BookSectionCategoryItemInput({
    required this.kind,
    required this.category,
    required this.title,
    required this.itemCount,
  });

  BookSectionCategoryItemInputKindEnum kind;

  BookSectionCategoryItemInputCategoryEnum category;

  String title;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int itemCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BookSectionCategoryItemInput &&
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
  String toString() => 'BookSectionCategoryItemInput[kind=$kind, category=$category, title=$title, itemCount=$itemCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'kind'] = this.kind;
      json[r'category'] = this.category;
      json[r'title'] = this.title;
      json[r'itemCount'] = this.itemCount;
    return json;
  }

  /// Returns a new [BookSectionCategoryItemInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BookSectionCategoryItemInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "BookSectionCategoryItemInput[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "BookSectionCategoryItemInput[kind]" has a null value in JSON.');
        assert(json.containsKey(r'category'), 'Required key "BookSectionCategoryItemInput[category]" is missing from JSON.');
        assert(json[r'category'] != null, 'Required key "BookSectionCategoryItemInput[category]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "BookSectionCategoryItemInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BookSectionCategoryItemInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'itemCount'), 'Required key "BookSectionCategoryItemInput[itemCount]" is missing from JSON.');
        assert(json[r'itemCount'] != null, 'Required key "BookSectionCategoryItemInput[itemCount]" has a null value in JSON.');
        return true;
      }());

      return BookSectionCategoryItemInput(
        kind: BookSectionCategoryItemInputKindEnum.fromJson(json[r'kind'])!,
        category: BookSectionCategoryItemInputCategoryEnum.fromJson(json[r'category'])!,
        title: mapValueOfType<String>(json, r'title')!,
        itemCount: mapValueOfType<int>(json, r'itemCount')!,
      );
    }
    return null;
  }

  static List<BookSectionCategoryItemInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookSectionCategoryItemInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookSectionCategoryItemInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BookSectionCategoryItemInput> mapFromJson(dynamic json) {
    final map = <String, BookSectionCategoryItemInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BookSectionCategoryItemInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BookSectionCategoryItemInput-objects as value to a dart map
  static Map<String, List<BookSectionCategoryItemInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BookSectionCategoryItemInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BookSectionCategoryItemInput.listFromJson(entry.value, growable: growable,);
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


class BookSectionCategoryItemInputKindEnum {
  /// Instantiate a new enum with the provided [value].
  const BookSectionCategoryItemInputKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const category = BookSectionCategoryItemInputKindEnum._(r'category');

  /// List of all possible values in this [enum][BookSectionCategoryItemInputKindEnum].
  static const values = <BookSectionCategoryItemInputKindEnum>[
    category,
  ];

  static BookSectionCategoryItemInputKindEnum? fromJson(dynamic value) => BookSectionCategoryItemInputKindEnumTypeTransformer().decode(value);

  static List<BookSectionCategoryItemInputKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookSectionCategoryItemInputKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookSectionCategoryItemInputKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookSectionCategoryItemInputKindEnum] to String,
/// and [decode] dynamic data back to [BookSectionCategoryItemInputKindEnum].
class BookSectionCategoryItemInputKindEnumTypeTransformer {
  factory BookSectionCategoryItemInputKindEnumTypeTransformer() => _instance ??= const BookSectionCategoryItemInputKindEnumTypeTransformer._();

  const BookSectionCategoryItemInputKindEnumTypeTransformer._();

  String encode(BookSectionCategoryItemInputKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookSectionCategoryItemInputKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookSectionCategoryItemInputKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'category': return BookSectionCategoryItemInputKindEnum.category;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookSectionCategoryItemInputKindEnumTypeTransformer] instance.
  static BookSectionCategoryItemInputKindEnumTypeTransformer? _instance;
}



class BookSectionCategoryItemInputCategoryEnum {
  /// Instantiate a new enum with the provided [value].
  const BookSectionCategoryItemInputCategoryEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const chalisa = BookSectionCategoryItemInputCategoryEnum._(r'Chalisa');
  static const aarti = BookSectionCategoryItemInputCategoryEnum._(r'Aarti');
  static const kavach = BookSectionCategoryItemInputCategoryEnum._(r'Kavach');
  static const stotram = BookSectionCategoryItemInputCategoryEnum._(r'Stotram');

  /// List of all possible values in this [enum][BookSectionCategoryItemInputCategoryEnum].
  static const values = <BookSectionCategoryItemInputCategoryEnum>[
    chalisa,
    aarti,
    kavach,
    stotram,
  ];

  static BookSectionCategoryItemInputCategoryEnum? fromJson(dynamic value) => BookSectionCategoryItemInputCategoryEnumTypeTransformer().decode(value);

  static List<BookSectionCategoryItemInputCategoryEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookSectionCategoryItemInputCategoryEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookSectionCategoryItemInputCategoryEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookSectionCategoryItemInputCategoryEnum] to String,
/// and [decode] dynamic data back to [BookSectionCategoryItemInputCategoryEnum].
class BookSectionCategoryItemInputCategoryEnumTypeTransformer {
  factory BookSectionCategoryItemInputCategoryEnumTypeTransformer() => _instance ??= const BookSectionCategoryItemInputCategoryEnumTypeTransformer._();

  const BookSectionCategoryItemInputCategoryEnumTypeTransformer._();

  String encode(BookSectionCategoryItemInputCategoryEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookSectionCategoryItemInputCategoryEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookSectionCategoryItemInputCategoryEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'Chalisa': return BookSectionCategoryItemInputCategoryEnum.chalisa;
        case r'Aarti': return BookSectionCategoryItemInputCategoryEnum.aarti;
        case r'Kavach': return BookSectionCategoryItemInputCategoryEnum.kavach;
        case r'Stotram': return BookSectionCategoryItemInputCategoryEnum.stotram;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookSectionCategoryItemInputCategoryEnumTypeTransformer] instance.
  static BookSectionCategoryItemInputCategoryEnumTypeTransformer? _instance;
}


