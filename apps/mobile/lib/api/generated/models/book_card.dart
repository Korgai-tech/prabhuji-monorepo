//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BookCard {
  /// Returns a new [BookCard] instance.
  BookCard({
    required this.contentId,
    required this.contentType,
    required this.category,
    required this.title,
    required this.coverImageUrl,
    required this.author,
    this.languages = const [],
    required this.offlineCacheEligible,
  });

  String contentId;

  BookCardContentTypeEnum contentType;

  BookCardCategoryEnum? category;

  String title;

  String coverImageUrl;

  String? author;

  List<String> languages;

  bool offlineCacheEligible;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BookCard &&
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
    (contentId.hashCode) +
    (contentType.hashCode) +
    (category == null ? 0 : category!.hashCode) +
    (title.hashCode) +
    (coverImageUrl.hashCode) +
    (author == null ? 0 : author!.hashCode) +
    (languages.hashCode) +
    (offlineCacheEligible.hashCode);

  @override
  String toString() => 'BookCard[contentId=$contentId, contentType=$contentType, category=$category, title=$title, coverImageUrl=$coverImageUrl, author=$author, languages=$languages, offlineCacheEligible=$offlineCacheEligible]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
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

  /// Returns a new [BookCard] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BookCard? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'contentId'), 'Required key "BookCard[contentId]" is missing from JSON.');
        assert(json[r'contentId'] != null, 'Required key "BookCard[contentId]" has a null value in JSON.');
        assert(json.containsKey(r'contentType'), 'Required key "BookCard[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null, 'Required key "BookCard[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'category'), 'Required key "BookCard[category]" is missing from JSON.');
        assert(json.containsKey(r'title'), 'Required key "BookCard[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BookCard[title]" has a null value in JSON.');
        assert(json.containsKey(r'coverImageUrl'), 'Required key "BookCard[coverImageUrl]" is missing from JSON.');
        assert(json[r'coverImageUrl'] != null, 'Required key "BookCard[coverImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'author'), 'Required key "BookCard[author]" is missing from JSON.');
        assert(json.containsKey(r'languages'), 'Required key "BookCard[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "BookCard[languages]" has a null value in JSON.');
        assert(json.containsKey(r'offlineCacheEligible'), 'Required key "BookCard[offlineCacheEligible]" is missing from JSON.');
        assert(json[r'offlineCacheEligible'] != null, 'Required key "BookCard[offlineCacheEligible]" has a null value in JSON.');
        return true;
      }());

      return BookCard(
        contentId: mapValueOfType<String>(json, r'contentId')!,
        contentType: BookCardContentTypeEnum.fromJson(json[r'contentType'])!,
        category: BookCardCategoryEnum.fromJson(json[r'category']),
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

  static List<BookCard> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookCard>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookCard.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BookCard> mapFromJson(dynamic json) {
    final map = <String, BookCard>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BookCard.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BookCard-objects as value to a dart map
  static Map<String, List<BookCard>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BookCard>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BookCard.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
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


class BookCardContentTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const BookCardContentTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const majorBook = BookCardContentTypeEnum._(r'major_book');
  static const directScripture = BookCardContentTypeEnum._(r'direct_scripture');

  /// List of all possible values in this [enum][BookCardContentTypeEnum].
  static const values = <BookCardContentTypeEnum>[
    majorBook,
    directScripture,
  ];

  static BookCardContentTypeEnum? fromJson(dynamic value) => BookCardContentTypeEnumTypeTransformer().decode(value);

  static List<BookCardContentTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookCardContentTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookCardContentTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookCardContentTypeEnum] to String,
/// and [decode] dynamic data back to [BookCardContentTypeEnum].
class BookCardContentTypeEnumTypeTransformer {
  factory BookCardContentTypeEnumTypeTransformer() => _instance ??= const BookCardContentTypeEnumTypeTransformer._();

  const BookCardContentTypeEnumTypeTransformer._();

  String encode(BookCardContentTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookCardContentTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookCardContentTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'major_book': return BookCardContentTypeEnum.majorBook;
        case r'direct_scripture': return BookCardContentTypeEnum.directScripture;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookCardContentTypeEnumTypeTransformer] instance.
  static BookCardContentTypeEnumTypeTransformer? _instance;
}



class BookCardCategoryEnum {
  /// Instantiate a new enum with the provided [value].
  const BookCardCategoryEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const chalisa = BookCardCategoryEnum._(r'Chalisa');
  static const aarti = BookCardCategoryEnum._(r'Aarti');
  static const kavach = BookCardCategoryEnum._(r'Kavach');
  static const stotram = BookCardCategoryEnum._(r'Stotram');

  /// List of all possible values in this [enum][BookCardCategoryEnum].
  static const values = <BookCardCategoryEnum>[
    chalisa,
    aarti,
    kavach,
    stotram,
  ];

  static BookCardCategoryEnum? fromJson(dynamic value) => BookCardCategoryEnumTypeTransformer().decode(value);

  static List<BookCardCategoryEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookCardCategoryEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookCardCategoryEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookCardCategoryEnum] to String,
/// and [decode] dynamic data back to [BookCardCategoryEnum].
class BookCardCategoryEnumTypeTransformer {
  factory BookCardCategoryEnumTypeTransformer() => _instance ??= const BookCardCategoryEnumTypeTransformer._();

  const BookCardCategoryEnumTypeTransformer._();

  String encode(BookCardCategoryEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookCardCategoryEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookCardCategoryEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'Chalisa': return BookCardCategoryEnum.chalisa;
        case r'Aarti': return BookCardCategoryEnum.aarti;
        case r'Kavach': return BookCardCategoryEnum.kavach;
        case r'Stotram': return BookCardCategoryEnum.stotram;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookCardCategoryEnumTypeTransformer] instance.
  static BookCardCategoryEnumTypeTransformer? _instance;
}


