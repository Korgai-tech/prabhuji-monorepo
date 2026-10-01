//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BookCardInput {
  /// Returns a new [BookCardInput] instance.
  BookCardInput({
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

  BookCardInputContentTypeEnum contentType;

  BookCardInputCategoryEnum? category;

  String title;

  String coverImageUrl;

  String? author;

  List<String> languages;

  bool offlineCacheEligible;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BookCardInput &&
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
  String toString() => 'BookCardInput[contentId=$contentId, contentType=$contentType, category=$category, title=$title, coverImageUrl=$coverImageUrl, author=$author, languages=$languages, offlineCacheEligible=$offlineCacheEligible]';

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

  /// Returns a new [BookCardInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BookCardInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'contentId'), 'Required key "BookCardInput[contentId]" is missing from JSON.');
        assert(json[r'contentId'] != null, 'Required key "BookCardInput[contentId]" has a null value in JSON.');
        assert(json.containsKey(r'contentType'), 'Required key "BookCardInput[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null, 'Required key "BookCardInput[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'category'), 'Required key "BookCardInput[category]" is missing from JSON.');
        assert(json.containsKey(r'title'), 'Required key "BookCardInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BookCardInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'coverImageUrl'), 'Required key "BookCardInput[coverImageUrl]" is missing from JSON.');
        assert(json[r'coverImageUrl'] != null, 'Required key "BookCardInput[coverImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'author'), 'Required key "BookCardInput[author]" is missing from JSON.');
        assert(json.containsKey(r'languages'), 'Required key "BookCardInput[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "BookCardInput[languages]" has a null value in JSON.');
        assert(json.containsKey(r'offlineCacheEligible'), 'Required key "BookCardInput[offlineCacheEligible]" is missing from JSON.');
        assert(json[r'offlineCacheEligible'] != null, 'Required key "BookCardInput[offlineCacheEligible]" has a null value in JSON.');
        return true;
      }());

      return BookCardInput(
        contentId: mapValueOfType<String>(json, r'contentId')!,
        contentType: BookCardInputContentTypeEnum.fromJson(json[r'contentType'])!,
        category: BookCardInputCategoryEnum.fromJson(json[r'category']),
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

  static List<BookCardInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookCardInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookCardInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BookCardInput> mapFromJson(dynamic json) {
    final map = <String, BookCardInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BookCardInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BookCardInput-objects as value to a dart map
  static Map<String, List<BookCardInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BookCardInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BookCardInput.listFromJson(entry.value, growable: growable,);
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


class BookCardInputContentTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const BookCardInputContentTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const majorBook = BookCardInputContentTypeEnum._(r'major_book');
  static const directScripture = BookCardInputContentTypeEnum._(r'direct_scripture');

  /// List of all possible values in this [enum][BookCardInputContentTypeEnum].
  static const values = <BookCardInputContentTypeEnum>[
    majorBook,
    directScripture,
  ];

  static BookCardInputContentTypeEnum? fromJson(dynamic value) => BookCardInputContentTypeEnumTypeTransformer().decode(value);

  static List<BookCardInputContentTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookCardInputContentTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookCardInputContentTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookCardInputContentTypeEnum] to String,
/// and [decode] dynamic data back to [BookCardInputContentTypeEnum].
class BookCardInputContentTypeEnumTypeTransformer {
  factory BookCardInputContentTypeEnumTypeTransformer() => _instance ??= const BookCardInputContentTypeEnumTypeTransformer._();

  const BookCardInputContentTypeEnumTypeTransformer._();

  String encode(BookCardInputContentTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookCardInputContentTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookCardInputContentTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'major_book': return BookCardInputContentTypeEnum.majorBook;
        case r'direct_scripture': return BookCardInputContentTypeEnum.directScripture;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookCardInputContentTypeEnumTypeTransformer] instance.
  static BookCardInputContentTypeEnumTypeTransformer? _instance;
}



class BookCardInputCategoryEnum {
  /// Instantiate a new enum with the provided [value].
  const BookCardInputCategoryEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const chalisa = BookCardInputCategoryEnum._(r'Chalisa');
  static const aarti = BookCardInputCategoryEnum._(r'Aarti');
  static const kavach = BookCardInputCategoryEnum._(r'Kavach');
  static const stotram = BookCardInputCategoryEnum._(r'Stotram');

  /// List of all possible values in this [enum][BookCardInputCategoryEnum].
  static const values = <BookCardInputCategoryEnum>[
    chalisa,
    aarti,
    kavach,
    stotram,
  ];

  static BookCardInputCategoryEnum? fromJson(dynamic value) => BookCardInputCategoryEnumTypeTransformer().decode(value);

  static List<BookCardInputCategoryEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookCardInputCategoryEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookCardInputCategoryEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookCardInputCategoryEnum] to String,
/// and [decode] dynamic data back to [BookCardInputCategoryEnum].
class BookCardInputCategoryEnumTypeTransformer {
  factory BookCardInputCategoryEnumTypeTransformer() => _instance ??= const BookCardInputCategoryEnumTypeTransformer._();

  const BookCardInputCategoryEnumTypeTransformer._();

  String encode(BookCardInputCategoryEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookCardInputCategoryEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookCardInputCategoryEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'Chalisa': return BookCardInputCategoryEnum.chalisa;
        case r'Aarti': return BookCardInputCategoryEnum.aarti;
        case r'Kavach': return BookCardInputCategoryEnum.kavach;
        case r'Stotram': return BookCardInputCategoryEnum.stotram;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookCardInputCategoryEnumTypeTransformer] instance.
  static BookCardInputCategoryEnumTypeTransformer? _instance;
}


