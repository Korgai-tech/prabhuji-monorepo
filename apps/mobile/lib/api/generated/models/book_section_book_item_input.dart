//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BookSectionBookItemInput {
  /// Returns a new [BookSectionBookItemInput] instance.
  BookSectionBookItemInput({
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

  BookSectionBookItemInputKindEnum kind;

  String contentId;

  BookSectionBookItemInputContentTypeEnum contentType;

  BookSectionBookItemInputCategoryEnum? category;

  String title;

  String coverImageUrl;

  String? author;

  List<String> languages;

  bool offlineCacheEligible;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BookSectionBookItemInput &&
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
  String toString() => 'BookSectionBookItemInput[kind=$kind, contentId=$contentId, contentType=$contentType, category=$category, title=$title, coverImageUrl=$coverImageUrl, author=$author, languages=$languages, offlineCacheEligible=$offlineCacheEligible]';

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

  /// Returns a new [BookSectionBookItemInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BookSectionBookItemInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "BookSectionBookItemInput[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "BookSectionBookItemInput[kind]" has a null value in JSON.');
        assert(json.containsKey(r'contentId'), 'Required key "BookSectionBookItemInput[contentId]" is missing from JSON.');
        assert(json[r'contentId'] != null, 'Required key "BookSectionBookItemInput[contentId]" has a null value in JSON.');
        assert(json.containsKey(r'contentType'), 'Required key "BookSectionBookItemInput[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null, 'Required key "BookSectionBookItemInput[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'category'), 'Required key "BookSectionBookItemInput[category]" is missing from JSON.');
        assert(json.containsKey(r'title'), 'Required key "BookSectionBookItemInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BookSectionBookItemInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'coverImageUrl'), 'Required key "BookSectionBookItemInput[coverImageUrl]" is missing from JSON.');
        assert(json[r'coverImageUrl'] != null, 'Required key "BookSectionBookItemInput[coverImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'author'), 'Required key "BookSectionBookItemInput[author]" is missing from JSON.');
        assert(json.containsKey(r'languages'), 'Required key "BookSectionBookItemInput[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "BookSectionBookItemInput[languages]" has a null value in JSON.');
        assert(json.containsKey(r'offlineCacheEligible'), 'Required key "BookSectionBookItemInput[offlineCacheEligible]" is missing from JSON.');
        assert(json[r'offlineCacheEligible'] != null, 'Required key "BookSectionBookItemInput[offlineCacheEligible]" has a null value in JSON.');
        return true;
      }());

      return BookSectionBookItemInput(
        kind: BookSectionBookItemInputKindEnum.fromJson(json[r'kind'])!,
        contentId: mapValueOfType<String>(json, r'contentId')!,
        contentType: BookSectionBookItemInputContentTypeEnum.fromJson(json[r'contentType'])!,
        category: BookSectionBookItemInputCategoryEnum.fromJson(json[r'category']),
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

  static List<BookSectionBookItemInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookSectionBookItemInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookSectionBookItemInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BookSectionBookItemInput> mapFromJson(dynamic json) {
    final map = <String, BookSectionBookItemInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BookSectionBookItemInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BookSectionBookItemInput-objects as value to a dart map
  static Map<String, List<BookSectionBookItemInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BookSectionBookItemInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BookSectionBookItemInput.listFromJson(entry.value, growable: growable,);
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


class BookSectionBookItemInputKindEnum {
  /// Instantiate a new enum with the provided [value].
  const BookSectionBookItemInputKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const book = BookSectionBookItemInputKindEnum._(r'book');

  /// List of all possible values in this [enum][BookSectionBookItemInputKindEnum].
  static const values = <BookSectionBookItemInputKindEnum>[
    book,
  ];

  static BookSectionBookItemInputKindEnum? fromJson(dynamic value) => BookSectionBookItemInputKindEnumTypeTransformer().decode(value);

  static List<BookSectionBookItemInputKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookSectionBookItemInputKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookSectionBookItemInputKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookSectionBookItemInputKindEnum] to String,
/// and [decode] dynamic data back to [BookSectionBookItemInputKindEnum].
class BookSectionBookItemInputKindEnumTypeTransformer {
  factory BookSectionBookItemInputKindEnumTypeTransformer() => _instance ??= const BookSectionBookItemInputKindEnumTypeTransformer._();

  const BookSectionBookItemInputKindEnumTypeTransformer._();

  String encode(BookSectionBookItemInputKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookSectionBookItemInputKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookSectionBookItemInputKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'book': return BookSectionBookItemInputKindEnum.book;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookSectionBookItemInputKindEnumTypeTransformer] instance.
  static BookSectionBookItemInputKindEnumTypeTransformer? _instance;
}



class BookSectionBookItemInputContentTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const BookSectionBookItemInputContentTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const majorBook = BookSectionBookItemInputContentTypeEnum._(r'major_book');
  static const directScripture = BookSectionBookItemInputContentTypeEnum._(r'direct_scripture');

  /// List of all possible values in this [enum][BookSectionBookItemInputContentTypeEnum].
  static const values = <BookSectionBookItemInputContentTypeEnum>[
    majorBook,
    directScripture,
  ];

  static BookSectionBookItemInputContentTypeEnum? fromJson(dynamic value) => BookSectionBookItemInputContentTypeEnumTypeTransformer().decode(value);

  static List<BookSectionBookItemInputContentTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookSectionBookItemInputContentTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookSectionBookItemInputContentTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookSectionBookItemInputContentTypeEnum] to String,
/// and [decode] dynamic data back to [BookSectionBookItemInputContentTypeEnum].
class BookSectionBookItemInputContentTypeEnumTypeTransformer {
  factory BookSectionBookItemInputContentTypeEnumTypeTransformer() => _instance ??= const BookSectionBookItemInputContentTypeEnumTypeTransformer._();

  const BookSectionBookItemInputContentTypeEnumTypeTransformer._();

  String encode(BookSectionBookItemInputContentTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookSectionBookItemInputContentTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookSectionBookItemInputContentTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'major_book': return BookSectionBookItemInputContentTypeEnum.majorBook;
        case r'direct_scripture': return BookSectionBookItemInputContentTypeEnum.directScripture;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookSectionBookItemInputContentTypeEnumTypeTransformer] instance.
  static BookSectionBookItemInputContentTypeEnumTypeTransformer? _instance;
}



class BookSectionBookItemInputCategoryEnum {
  /// Instantiate a new enum with the provided [value].
  const BookSectionBookItemInputCategoryEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const chalisa = BookSectionBookItemInputCategoryEnum._(r'Chalisa');
  static const aarti = BookSectionBookItemInputCategoryEnum._(r'Aarti');
  static const kavach = BookSectionBookItemInputCategoryEnum._(r'Kavach');
  static const stotram = BookSectionBookItemInputCategoryEnum._(r'Stotram');

  /// List of all possible values in this [enum][BookSectionBookItemInputCategoryEnum].
  static const values = <BookSectionBookItemInputCategoryEnum>[
    chalisa,
    aarti,
    kavach,
    stotram,
  ];

  static BookSectionBookItemInputCategoryEnum? fromJson(dynamic value) => BookSectionBookItemInputCategoryEnumTypeTransformer().decode(value);

  static List<BookSectionBookItemInputCategoryEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookSectionBookItemInputCategoryEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookSectionBookItemInputCategoryEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookSectionBookItemInputCategoryEnum] to String,
/// and [decode] dynamic data back to [BookSectionBookItemInputCategoryEnum].
class BookSectionBookItemInputCategoryEnumTypeTransformer {
  factory BookSectionBookItemInputCategoryEnumTypeTransformer() => _instance ??= const BookSectionBookItemInputCategoryEnumTypeTransformer._();

  const BookSectionBookItemInputCategoryEnumTypeTransformer._();

  String encode(BookSectionBookItemInputCategoryEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookSectionBookItemInputCategoryEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookSectionBookItemInputCategoryEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'Chalisa': return BookSectionBookItemInputCategoryEnum.chalisa;
        case r'Aarti': return BookSectionBookItemInputCategoryEnum.aarti;
        case r'Kavach': return BookSectionBookItemInputCategoryEnum.kavach;
        case r'Stotram': return BookSectionBookItemInputCategoryEnum.stotram;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookSectionBookItemInputCategoryEnumTypeTransformer] instance.
  static BookSectionBookItemInputCategoryEnumTypeTransformer? _instance;
}


