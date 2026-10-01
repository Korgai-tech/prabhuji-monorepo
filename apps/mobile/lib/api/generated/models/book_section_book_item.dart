//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BookSectionBookItem {
  /// Returns a new [BookSectionBookItem] instance.
  BookSectionBookItem({
    required this.kind,
    required this.contentId,
    required this.contentType,
    required this.category,
    required this.title,
    required this.coverImageUrl,
    required this.author,
    this.languages = const [],
    required this.offlineCacheEligible,
  });

  BookSectionBookItemKindEnum kind;

  String contentId;

  BookSectionBookItemContentTypeEnum contentType;

  BookSectionBookItemCategoryEnum? category;

  String title;

  String coverImageUrl;

  String? author;

  List<String> languages;

  bool offlineCacheEligible;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BookSectionBookItem &&
    other.kind == kind &&
    other.contentId == contentId &&
    other.contentType == contentType &&
    other.category == category &&
    other.title == title &&
    other.coverImageUrl == coverImageUrl &&
    other.author == author &&
    _deepEquality.equals(other.languages, languages) &&
    other.offlineCacheEligible == offlineCacheEligible;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (kind.hashCode) +
    (contentId.hashCode) +
    (contentType.hashCode) +
    (category == null ? 0 : category!.hashCode) +
    (title.hashCode) +
    (coverImageUrl.hashCode) +
    (author == null ? 0 : author!.hashCode) +
    (languages.hashCode) +
    (offlineCacheEligible.hashCode);

  @override
  String toString() => 'BookSectionBookItem[kind=$kind, contentId=$contentId, contentType=$contentType, category=$category, title=$title, coverImageUrl=$coverImageUrl, author=$author, languages=$languages, offlineCacheEligible=$offlineCacheEligible]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'kind'] = this.kind;
      json[r'contentId'] = this.contentId;
      json[r'contentType'] = this.contentType;
    if (this.category != null) {
      json[r'category'] = this.category;
    } else {
      json[r'category'] = null;
    }
      json[r'title'] = this.title;
      json[r'coverImageUrl'] = this.coverImageUrl;
    if (this.author != null) {
      json[r'author'] = this.author;
    } else {
      json[r'author'] = null;
    }
      json[r'languages'] = this.languages;
      json[r'offlineCacheEligible'] = this.offlineCacheEligible;
    return json;
  }

  /// Returns a new [BookSectionBookItem] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BookSectionBookItem? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "BookSectionBookItem[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "BookSectionBookItem[kind]" has a null value in JSON.');
        assert(json.containsKey(r'contentId'), 'Required key "BookSectionBookItem[contentId]" is missing from JSON.');
        assert(json[r'contentId'] != null, 'Required key "BookSectionBookItem[contentId]" has a null value in JSON.');
        assert(json.containsKey(r'contentType'), 'Required key "BookSectionBookItem[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null, 'Required key "BookSectionBookItem[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'category'), 'Required key "BookSectionBookItem[category]" is missing from JSON.');
        assert(json.containsKey(r'title'), 'Required key "BookSectionBookItem[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BookSectionBookItem[title]" has a null value in JSON.');
        assert(json.containsKey(r'coverImageUrl'), 'Required key "BookSectionBookItem[coverImageUrl]" is missing from JSON.');
        assert(json[r'coverImageUrl'] != null, 'Required key "BookSectionBookItem[coverImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'author'), 'Required key "BookSectionBookItem[author]" is missing from JSON.');
        assert(json.containsKey(r'languages'), 'Required key "BookSectionBookItem[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "BookSectionBookItem[languages]" has a null value in JSON.');
        assert(json.containsKey(r'offlineCacheEligible'), 'Required key "BookSectionBookItem[offlineCacheEligible]" is missing from JSON.');
        assert(json[r'offlineCacheEligible'] != null, 'Required key "BookSectionBookItem[offlineCacheEligible]" has a null value in JSON.');
        return true;
      }());

      return BookSectionBookItem(
        kind: BookSectionBookItemKindEnum.fromJson(json[r'kind'])!,
        contentId: mapValueOfType<String>(json, r'contentId')!,
        contentType: BookSectionBookItemContentTypeEnum.fromJson(json[r'contentType'])!,
        category: BookSectionBookItemCategoryEnum.fromJson(json[r'category']),
        title: mapValueOfType<String>(json, r'title')!,
        coverImageUrl: mapValueOfType<String>(json, r'coverImageUrl')!,
        author: mapValueOfType<String>(json, r'author'),
        languages: json[r'languages'] is Iterable
            ? (json[r'languages'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        offlineCacheEligible: mapValueOfType<bool>(json, r'offlineCacheEligible')!,
      );
    }
    return null;
  }

  static List<BookSectionBookItem> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookSectionBookItem>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookSectionBookItem.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BookSectionBookItem> mapFromJson(dynamic json) {
    final map = <String, BookSectionBookItem>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BookSectionBookItem.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BookSectionBookItem-objects as value to a dart map
  static Map<String, List<BookSectionBookItem>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BookSectionBookItem>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BookSectionBookItem.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'kind',
    'contentId',
    'contentType',
    'category',
    'title',
    'coverImageUrl',
    'author',
    'languages',
    'offlineCacheEligible',
  };
}


class BookSectionBookItemKindEnum {
  /// Instantiate a new enum with the provided [value].
  const BookSectionBookItemKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const book = BookSectionBookItemKindEnum._(r'book');

  /// List of all possible values in this [enum][BookSectionBookItemKindEnum].
  static const values = <BookSectionBookItemKindEnum>[
    book,
  ];

  static BookSectionBookItemKindEnum? fromJson(dynamic value) => BookSectionBookItemKindEnumTypeTransformer().decode(value);

  static List<BookSectionBookItemKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookSectionBookItemKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookSectionBookItemKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookSectionBookItemKindEnum] to String,
/// and [decode] dynamic data back to [BookSectionBookItemKindEnum].
class BookSectionBookItemKindEnumTypeTransformer {
  factory BookSectionBookItemKindEnumTypeTransformer() => _instance ??= const BookSectionBookItemKindEnumTypeTransformer._();

  const BookSectionBookItemKindEnumTypeTransformer._();

  String encode(BookSectionBookItemKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookSectionBookItemKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookSectionBookItemKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'book': return BookSectionBookItemKindEnum.book;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookSectionBookItemKindEnumTypeTransformer] instance.
  static BookSectionBookItemKindEnumTypeTransformer? _instance;
}



class BookSectionBookItemContentTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const BookSectionBookItemContentTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const majorBook = BookSectionBookItemContentTypeEnum._(r'major_book');
  static const directScripture = BookSectionBookItemContentTypeEnum._(r'direct_scripture');

  /// List of all possible values in this [enum][BookSectionBookItemContentTypeEnum].
  static const values = <BookSectionBookItemContentTypeEnum>[
    majorBook,
    directScripture,
  ];

  static BookSectionBookItemContentTypeEnum? fromJson(dynamic value) => BookSectionBookItemContentTypeEnumTypeTransformer().decode(value);

  static List<BookSectionBookItemContentTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookSectionBookItemContentTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookSectionBookItemContentTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookSectionBookItemContentTypeEnum] to String,
/// and [decode] dynamic data back to [BookSectionBookItemContentTypeEnum].
class BookSectionBookItemContentTypeEnumTypeTransformer {
  factory BookSectionBookItemContentTypeEnumTypeTransformer() => _instance ??= const BookSectionBookItemContentTypeEnumTypeTransformer._();

  const BookSectionBookItemContentTypeEnumTypeTransformer._();

  String encode(BookSectionBookItemContentTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookSectionBookItemContentTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookSectionBookItemContentTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'major_book': return BookSectionBookItemContentTypeEnum.majorBook;
        case r'direct_scripture': return BookSectionBookItemContentTypeEnum.directScripture;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookSectionBookItemContentTypeEnumTypeTransformer] instance.
  static BookSectionBookItemContentTypeEnumTypeTransformer? _instance;
}



class BookSectionBookItemCategoryEnum {
  /// Instantiate a new enum with the provided [value].
  const BookSectionBookItemCategoryEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const chalisa = BookSectionBookItemCategoryEnum._(r'Chalisa');
  static const aarti = BookSectionBookItemCategoryEnum._(r'Aarti');
  static const kavach = BookSectionBookItemCategoryEnum._(r'Kavach');
  static const stotram = BookSectionBookItemCategoryEnum._(r'Stotram');

  /// List of all possible values in this [enum][BookSectionBookItemCategoryEnum].
  static const values = <BookSectionBookItemCategoryEnum>[
    chalisa,
    aarti,
    kavach,
    stotram,
  ];

  static BookSectionBookItemCategoryEnum? fromJson(dynamic value) => BookSectionBookItemCategoryEnumTypeTransformer().decode(value);

  static List<BookSectionBookItemCategoryEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookSectionBookItemCategoryEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookSectionBookItemCategoryEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookSectionBookItemCategoryEnum] to String,
/// and [decode] dynamic data back to [BookSectionBookItemCategoryEnum].
class BookSectionBookItemCategoryEnumTypeTransformer {
  factory BookSectionBookItemCategoryEnumTypeTransformer() => _instance ??= const BookSectionBookItemCategoryEnumTypeTransformer._();

  const BookSectionBookItemCategoryEnumTypeTransformer._();

  String encode(BookSectionBookItemCategoryEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookSectionBookItemCategoryEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookSectionBookItemCategoryEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'Chalisa': return BookSectionBookItemCategoryEnum.chalisa;
        case r'Aarti': return BookSectionBookItemCategoryEnum.aarti;
        case r'Kavach': return BookSectionBookItemCategoryEnum.kavach;
        case r'Stotram': return BookSectionBookItemCategoryEnum.stotram;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookSectionBookItemCategoryEnumTypeTransformer] instance.
  static BookSectionBookItemCategoryEnumTypeTransformer? _instance;
}


