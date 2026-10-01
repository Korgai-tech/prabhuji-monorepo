//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BooksHomeSectionInputItemsInner {
  /// Returns a new [BooksHomeSectionInputItemsInner] instance.
  BooksHomeSectionInputItemsInner({
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

  BooksHomeSectionInputItemsInnerKindEnum kind;

  String contentId;

  BooksHomeSectionInputItemsInnerContentTypeEnum contentType;

  BooksHomeSectionInputItemsInnerCategoryEnum category;

  String title;

  String coverImageUrl;

  String? author;

  List<String> languages;

  bool offlineCacheEligible;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int itemCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BooksHomeSectionInputItemsInner &&
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
  String toString() => 'BooksHomeSectionInputItemsInner[kind=$kind, contentId=$contentId, contentType=$contentType, category=$category, title=$title, coverImageUrl=$coverImageUrl, author=$author, languages=$languages, offlineCacheEligible=$offlineCacheEligible, itemCount=$itemCount]';

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

  /// Returns a new [BooksHomeSectionInputItemsInner] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BooksHomeSectionInputItemsInner? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "BooksHomeSectionInputItemsInner[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "BooksHomeSectionInputItemsInner[kind]" has a null value in JSON.');
        assert(json.containsKey(r'contentId'), 'Required key "BooksHomeSectionInputItemsInner[contentId]" is missing from JSON.');
        assert(json[r'contentId'] != null, 'Required key "BooksHomeSectionInputItemsInner[contentId]" has a null value in JSON.');
        assert(json.containsKey(r'contentType'), 'Required key "BooksHomeSectionInputItemsInner[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null, 'Required key "BooksHomeSectionInputItemsInner[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'category'), 'Required key "BooksHomeSectionInputItemsInner[category]" is missing from JSON.');
        assert(json[r'category'] != null, 'Required key "BooksHomeSectionInputItemsInner[category]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "BooksHomeSectionInputItemsInner[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BooksHomeSectionInputItemsInner[title]" has a null value in JSON.');
        assert(json.containsKey(r'coverImageUrl'), 'Required key "BooksHomeSectionInputItemsInner[coverImageUrl]" is missing from JSON.');
        assert(json[r'coverImageUrl'] != null, 'Required key "BooksHomeSectionInputItemsInner[coverImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'author'), 'Required key "BooksHomeSectionInputItemsInner[author]" is missing from JSON.');
        assert(json.containsKey(r'languages'), 'Required key "BooksHomeSectionInputItemsInner[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "BooksHomeSectionInputItemsInner[languages]" has a null value in JSON.');
        assert(json.containsKey(r'offlineCacheEligible'), 'Required key "BooksHomeSectionInputItemsInner[offlineCacheEligible]" is missing from JSON.');
        assert(json[r'offlineCacheEligible'] != null, 'Required key "BooksHomeSectionInputItemsInner[offlineCacheEligible]" has a null value in JSON.');
        assert(json.containsKey(r'itemCount'), 'Required key "BooksHomeSectionInputItemsInner[itemCount]" is missing from JSON.');
        assert(json[r'itemCount'] != null, 'Required key "BooksHomeSectionInputItemsInner[itemCount]" has a null value in JSON.');
        return true;
      }());

      return BooksHomeSectionInputItemsInner(
        kind: BooksHomeSectionInputItemsInnerKindEnum.fromJson(json[r'kind'])!,
        contentId: mapValueOfType<String>(json, r'contentId')!,
        contentType: BooksHomeSectionInputItemsInnerContentTypeEnum.fromJson(json[r'contentType'])!,
        category: BooksHomeSectionInputItemsInnerCategoryEnum.fromJson(json[r'category'])!,
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

  static List<BooksHomeSectionInputItemsInner> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BooksHomeSectionInputItemsInner>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BooksHomeSectionInputItemsInner.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BooksHomeSectionInputItemsInner> mapFromJson(dynamic json) {
    final map = <String, BooksHomeSectionInputItemsInner>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BooksHomeSectionInputItemsInner.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BooksHomeSectionInputItemsInner-objects as value to a dart map
  static Map<String, List<BooksHomeSectionInputItemsInner>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BooksHomeSectionInputItemsInner>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BooksHomeSectionInputItemsInner.listFromJson(entry.value, growable: growable,);
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


class BooksHomeSectionInputItemsInnerKindEnum {
  /// Instantiate a new enum with the provided [value].
  const BooksHomeSectionInputItemsInnerKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const category = BooksHomeSectionInputItemsInnerKindEnum._(r'category');

  /// List of all possible values in this [enum][BooksHomeSectionInputItemsInnerKindEnum].
  static const values = <BooksHomeSectionInputItemsInnerKindEnum>[
    category,
  ];

  static BooksHomeSectionInputItemsInnerKindEnum? fromJson(dynamic value) => BooksHomeSectionInputItemsInnerKindEnumTypeTransformer().decode(value);

  static List<BooksHomeSectionInputItemsInnerKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BooksHomeSectionInputItemsInnerKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BooksHomeSectionInputItemsInnerKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BooksHomeSectionInputItemsInnerKindEnum] to String,
/// and [decode] dynamic data back to [BooksHomeSectionInputItemsInnerKindEnum].
class BooksHomeSectionInputItemsInnerKindEnumTypeTransformer {
  factory BooksHomeSectionInputItemsInnerKindEnumTypeTransformer() => _instance ??= const BooksHomeSectionInputItemsInnerKindEnumTypeTransformer._();

  const BooksHomeSectionInputItemsInnerKindEnumTypeTransformer._();

  String encode(BooksHomeSectionInputItemsInnerKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BooksHomeSectionInputItemsInnerKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BooksHomeSectionInputItemsInnerKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'category': return BooksHomeSectionInputItemsInnerKindEnum.category;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BooksHomeSectionInputItemsInnerKindEnumTypeTransformer] instance.
  static BooksHomeSectionInputItemsInnerKindEnumTypeTransformer? _instance;
}



class BooksHomeSectionInputItemsInnerContentTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const BooksHomeSectionInputItemsInnerContentTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const majorBook = BooksHomeSectionInputItemsInnerContentTypeEnum._(r'major_book');
  static const directScripture = BooksHomeSectionInputItemsInnerContentTypeEnum._(r'direct_scripture');

  /// List of all possible values in this [enum][BooksHomeSectionInputItemsInnerContentTypeEnum].
  static const values = <BooksHomeSectionInputItemsInnerContentTypeEnum>[
    majorBook,
    directScripture,
  ];

  static BooksHomeSectionInputItemsInnerContentTypeEnum? fromJson(dynamic value) => BooksHomeSectionInputItemsInnerContentTypeEnumTypeTransformer().decode(value);

  static List<BooksHomeSectionInputItemsInnerContentTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BooksHomeSectionInputItemsInnerContentTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BooksHomeSectionInputItemsInnerContentTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BooksHomeSectionInputItemsInnerContentTypeEnum] to String,
/// and [decode] dynamic data back to [BooksHomeSectionInputItemsInnerContentTypeEnum].
class BooksHomeSectionInputItemsInnerContentTypeEnumTypeTransformer {
  factory BooksHomeSectionInputItemsInnerContentTypeEnumTypeTransformer() => _instance ??= const BooksHomeSectionInputItemsInnerContentTypeEnumTypeTransformer._();

  const BooksHomeSectionInputItemsInnerContentTypeEnumTypeTransformer._();

  String encode(BooksHomeSectionInputItemsInnerContentTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BooksHomeSectionInputItemsInnerContentTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BooksHomeSectionInputItemsInnerContentTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'major_book': return BooksHomeSectionInputItemsInnerContentTypeEnum.majorBook;
        case r'direct_scripture': return BooksHomeSectionInputItemsInnerContentTypeEnum.directScripture;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BooksHomeSectionInputItemsInnerContentTypeEnumTypeTransformer] instance.
  static BooksHomeSectionInputItemsInnerContentTypeEnumTypeTransformer? _instance;
}



class BooksHomeSectionInputItemsInnerCategoryEnum {
  /// Instantiate a new enum with the provided [value].
  const BooksHomeSectionInputItemsInnerCategoryEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const chalisa = BooksHomeSectionInputItemsInnerCategoryEnum._(r'Chalisa');
  static const aarti = BooksHomeSectionInputItemsInnerCategoryEnum._(r'Aarti');
  static const kavach = BooksHomeSectionInputItemsInnerCategoryEnum._(r'Kavach');
  static const stotram = BooksHomeSectionInputItemsInnerCategoryEnum._(r'Stotram');

  /// List of all possible values in this [enum][BooksHomeSectionInputItemsInnerCategoryEnum].
  static const values = <BooksHomeSectionInputItemsInnerCategoryEnum>[
    chalisa,
    aarti,
    kavach,
    stotram,
  ];

  static BooksHomeSectionInputItemsInnerCategoryEnum? fromJson(dynamic value) => BooksHomeSectionInputItemsInnerCategoryEnumTypeTransformer().decode(value);

  static List<BooksHomeSectionInputItemsInnerCategoryEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BooksHomeSectionInputItemsInnerCategoryEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BooksHomeSectionInputItemsInnerCategoryEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BooksHomeSectionInputItemsInnerCategoryEnum] to String,
/// and [decode] dynamic data back to [BooksHomeSectionInputItemsInnerCategoryEnum].
class BooksHomeSectionInputItemsInnerCategoryEnumTypeTransformer {
  factory BooksHomeSectionInputItemsInnerCategoryEnumTypeTransformer() => _instance ??= const BooksHomeSectionInputItemsInnerCategoryEnumTypeTransformer._();

  const BooksHomeSectionInputItemsInnerCategoryEnumTypeTransformer._();

  String encode(BooksHomeSectionInputItemsInnerCategoryEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BooksHomeSectionInputItemsInnerCategoryEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BooksHomeSectionInputItemsInnerCategoryEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'Chalisa': return BooksHomeSectionInputItemsInnerCategoryEnum.chalisa;
        case r'Aarti': return BooksHomeSectionInputItemsInnerCategoryEnum.aarti;
        case r'Kavach': return BooksHomeSectionInputItemsInnerCategoryEnum.kavach;
        case r'Stotram': return BooksHomeSectionInputItemsInnerCategoryEnum.stotram;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BooksHomeSectionInputItemsInnerCategoryEnumTypeTransformer] instance.
  static BooksHomeSectionInputItemsInnerCategoryEnumTypeTransformer? _instance;
}


