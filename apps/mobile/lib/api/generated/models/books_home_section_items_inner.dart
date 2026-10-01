//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BooksHomeSectionItemsInner {
  /// Returns a new [BooksHomeSectionItemsInner] instance.
  BooksHomeSectionItemsInner({
    required this.kind,
    required this.contentId,
    required this.contentType,
    required this.category,
    required this.title,
    required this.coverImageUrl,
    required this.author,
    this.languages = const [],
    required this.offlineCacheEligible,
    required this.itemCount,
  });

  BooksHomeSectionItemsInnerKindEnum kind;

  String contentId;

  BooksHomeSectionItemsInnerContentTypeEnum contentType;

  BooksHomeSectionItemsInnerCategoryEnum category;

  String title;

  String coverImageUrl;

  String? author;

  List<String> languages;

  bool offlineCacheEligible;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int itemCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BooksHomeSectionItemsInner &&
    other.kind == kind &&
    other.contentId == contentId &&
    other.contentType == contentType &&
    other.category == category &&
    other.title == title &&
    other.coverImageUrl == coverImageUrl &&
    other.author == author &&
    _deepEquality.equals(other.languages, languages) &&
    other.offlineCacheEligible == offlineCacheEligible &&
    other.itemCount == itemCount;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (kind.hashCode) +
    (contentId.hashCode) +
    (contentType.hashCode) +
    (category.hashCode) +
    (title.hashCode) +
    (coverImageUrl.hashCode) +
    (author == null ? 0 : author!.hashCode) +
    (languages.hashCode) +
    (offlineCacheEligible.hashCode) +
    (itemCount.hashCode);

  @override
  String toString() => 'BooksHomeSectionItemsInner[kind=$kind, contentId=$contentId, contentType=$contentType, category=$category, title=$title, coverImageUrl=$coverImageUrl, author=$author, languages=$languages, offlineCacheEligible=$offlineCacheEligible, itemCount=$itemCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'kind'] = this.kind;
      json[r'contentId'] = this.contentId;
      json[r'contentType'] = this.contentType;
      json[r'category'] = this.category;
      json[r'title'] = this.title;
      json[r'coverImageUrl'] = this.coverImageUrl;
    if (this.author != null) {
      json[r'author'] = this.author;
    } else {
      json[r'author'] = null;
    }
      json[r'languages'] = this.languages;
      json[r'offlineCacheEligible'] = this.offlineCacheEligible;
      json[r'itemCount'] = this.itemCount;
    return json;
  }

  /// Returns a new [BooksHomeSectionItemsInner] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BooksHomeSectionItemsInner? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "BooksHomeSectionItemsInner[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "BooksHomeSectionItemsInner[kind]" has a null value in JSON.');
        assert(json.containsKey(r'contentId'), 'Required key "BooksHomeSectionItemsInner[contentId]" is missing from JSON.');
        assert(json[r'contentId'] != null, 'Required key "BooksHomeSectionItemsInner[contentId]" has a null value in JSON.');
        assert(json.containsKey(r'contentType'), 'Required key "BooksHomeSectionItemsInner[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null, 'Required key "BooksHomeSectionItemsInner[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'category'), 'Required key "BooksHomeSectionItemsInner[category]" is missing from JSON.');
        assert(json[r'category'] != null, 'Required key "BooksHomeSectionItemsInner[category]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "BooksHomeSectionItemsInner[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BooksHomeSectionItemsInner[title]" has a null value in JSON.');
        assert(json.containsKey(r'coverImageUrl'), 'Required key "BooksHomeSectionItemsInner[coverImageUrl]" is missing from JSON.');
        assert(json[r'coverImageUrl'] != null, 'Required key "BooksHomeSectionItemsInner[coverImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'author'), 'Required key "BooksHomeSectionItemsInner[author]" is missing from JSON.');
        assert(json.containsKey(r'languages'), 'Required key "BooksHomeSectionItemsInner[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "BooksHomeSectionItemsInner[languages]" has a null value in JSON.');
        assert(json.containsKey(r'offlineCacheEligible'), 'Required key "BooksHomeSectionItemsInner[offlineCacheEligible]" is missing from JSON.');
        assert(json[r'offlineCacheEligible'] != null, 'Required key "BooksHomeSectionItemsInner[offlineCacheEligible]" has a null value in JSON.');
        assert(json.containsKey(r'itemCount'), 'Required key "BooksHomeSectionItemsInner[itemCount]" is missing from JSON.');
        assert(json[r'itemCount'] != null, 'Required key "BooksHomeSectionItemsInner[itemCount]" has a null value in JSON.');
        return true;
      }());

      return BooksHomeSectionItemsInner(
        kind: BooksHomeSectionItemsInnerKindEnum.fromJson(json[r'kind'])!,
        contentId: mapValueOfType<String>(json, r'contentId')!,
        contentType: BooksHomeSectionItemsInnerContentTypeEnum.fromJson(json[r'contentType'])!,
        category: BooksHomeSectionItemsInnerCategoryEnum.fromJson(json[r'category'])!,
        title: mapValueOfType<String>(json, r'title')!,
        coverImageUrl: mapValueOfType<String>(json, r'coverImageUrl')!,
        author: mapValueOfType<String>(json, r'author'),
        languages: json[r'languages'] is Iterable
            ? (json[r'languages'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        offlineCacheEligible: mapValueOfType<bool>(json, r'offlineCacheEligible')!,
        itemCount: mapValueOfType<int>(json, r'itemCount')!,
      );
    }
    return null;
  }

  static List<BooksHomeSectionItemsInner> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BooksHomeSectionItemsInner>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BooksHomeSectionItemsInner.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BooksHomeSectionItemsInner> mapFromJson(dynamic json) {
    final map = <String, BooksHomeSectionItemsInner>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BooksHomeSectionItemsInner.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BooksHomeSectionItemsInner-objects as value to a dart map
  static Map<String, List<BooksHomeSectionItemsInner>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BooksHomeSectionItemsInner>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BooksHomeSectionItemsInner.listFromJson(entry.value, growable: growable,);
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
    'itemCount',
  };
}


class BooksHomeSectionItemsInnerKindEnum {
  /// Instantiate a new enum with the provided [value].
  const BooksHomeSectionItemsInnerKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const category = BooksHomeSectionItemsInnerKindEnum._(r'category');

  /// List of all possible values in this [enum][BooksHomeSectionItemsInnerKindEnum].
  static const values = <BooksHomeSectionItemsInnerKindEnum>[
    category,
  ];

  static BooksHomeSectionItemsInnerKindEnum? fromJson(dynamic value) => BooksHomeSectionItemsInnerKindEnumTypeTransformer().decode(value);

  static List<BooksHomeSectionItemsInnerKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BooksHomeSectionItemsInnerKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BooksHomeSectionItemsInnerKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BooksHomeSectionItemsInnerKindEnum] to String,
/// and [decode] dynamic data back to [BooksHomeSectionItemsInnerKindEnum].
class BooksHomeSectionItemsInnerKindEnumTypeTransformer {
  factory BooksHomeSectionItemsInnerKindEnumTypeTransformer() => _instance ??= const BooksHomeSectionItemsInnerKindEnumTypeTransformer._();

  const BooksHomeSectionItemsInnerKindEnumTypeTransformer._();

  String encode(BooksHomeSectionItemsInnerKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BooksHomeSectionItemsInnerKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BooksHomeSectionItemsInnerKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'category': return BooksHomeSectionItemsInnerKindEnum.category;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BooksHomeSectionItemsInnerKindEnumTypeTransformer] instance.
  static BooksHomeSectionItemsInnerKindEnumTypeTransformer? _instance;
}



class BooksHomeSectionItemsInnerContentTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const BooksHomeSectionItemsInnerContentTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const majorBook = BooksHomeSectionItemsInnerContentTypeEnum._(r'major_book');
  static const directScripture = BooksHomeSectionItemsInnerContentTypeEnum._(r'direct_scripture');

  /// List of all possible values in this [enum][BooksHomeSectionItemsInnerContentTypeEnum].
  static const values = <BooksHomeSectionItemsInnerContentTypeEnum>[
    majorBook,
    directScripture,
  ];

  static BooksHomeSectionItemsInnerContentTypeEnum? fromJson(dynamic value) => BooksHomeSectionItemsInnerContentTypeEnumTypeTransformer().decode(value);

  static List<BooksHomeSectionItemsInnerContentTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BooksHomeSectionItemsInnerContentTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BooksHomeSectionItemsInnerContentTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BooksHomeSectionItemsInnerContentTypeEnum] to String,
/// and [decode] dynamic data back to [BooksHomeSectionItemsInnerContentTypeEnum].
class BooksHomeSectionItemsInnerContentTypeEnumTypeTransformer {
  factory BooksHomeSectionItemsInnerContentTypeEnumTypeTransformer() => _instance ??= const BooksHomeSectionItemsInnerContentTypeEnumTypeTransformer._();

  const BooksHomeSectionItemsInnerContentTypeEnumTypeTransformer._();

  String encode(BooksHomeSectionItemsInnerContentTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BooksHomeSectionItemsInnerContentTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BooksHomeSectionItemsInnerContentTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'major_book': return BooksHomeSectionItemsInnerContentTypeEnum.majorBook;
        case r'direct_scripture': return BooksHomeSectionItemsInnerContentTypeEnum.directScripture;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BooksHomeSectionItemsInnerContentTypeEnumTypeTransformer] instance.
  static BooksHomeSectionItemsInnerContentTypeEnumTypeTransformer? _instance;
}



class BooksHomeSectionItemsInnerCategoryEnum {
  /// Instantiate a new enum with the provided [value].
  const BooksHomeSectionItemsInnerCategoryEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const chalisa = BooksHomeSectionItemsInnerCategoryEnum._(r'Chalisa');
  static const aarti = BooksHomeSectionItemsInnerCategoryEnum._(r'Aarti');
  static const kavach = BooksHomeSectionItemsInnerCategoryEnum._(r'Kavach');
  static const stotram = BooksHomeSectionItemsInnerCategoryEnum._(r'Stotram');

  /// List of all possible values in this [enum][BooksHomeSectionItemsInnerCategoryEnum].
  static const values = <BooksHomeSectionItemsInnerCategoryEnum>[
    chalisa,
    aarti,
    kavach,
    stotram,
  ];

  static BooksHomeSectionItemsInnerCategoryEnum? fromJson(dynamic value) => BooksHomeSectionItemsInnerCategoryEnumTypeTransformer().decode(value);

  static List<BooksHomeSectionItemsInnerCategoryEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BooksHomeSectionItemsInnerCategoryEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BooksHomeSectionItemsInnerCategoryEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BooksHomeSectionItemsInnerCategoryEnum] to String,
/// and [decode] dynamic data back to [BooksHomeSectionItemsInnerCategoryEnum].
class BooksHomeSectionItemsInnerCategoryEnumTypeTransformer {
  factory BooksHomeSectionItemsInnerCategoryEnumTypeTransformer() => _instance ??= const BooksHomeSectionItemsInnerCategoryEnumTypeTransformer._();

  const BooksHomeSectionItemsInnerCategoryEnumTypeTransformer._();

  String encode(BooksHomeSectionItemsInnerCategoryEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BooksHomeSectionItemsInnerCategoryEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BooksHomeSectionItemsInnerCategoryEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'Chalisa': return BooksHomeSectionItemsInnerCategoryEnum.chalisa;
        case r'Aarti': return BooksHomeSectionItemsInnerCategoryEnum.aarti;
        case r'Kavach': return BooksHomeSectionItemsInnerCategoryEnum.kavach;
        case r'Stotram': return BooksHomeSectionItemsInnerCategoryEnum.stotram;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BooksHomeSectionItemsInnerCategoryEnumTypeTransformer] instance.
  static BooksHomeSectionItemsInnerCategoryEnumTypeTransformer? _instance;
}


