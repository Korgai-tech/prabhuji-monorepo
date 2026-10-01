//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AartiCategoryCard {
  /// Returns a new [AartiCategoryCard] instance.
  AartiCategoryCard({
    required this.kind,
    required this.id,
    required this.slug,
    required this.name,
    required this.imageUrl,
  });

  AartiCategoryCardKindEnum kind;

  String id;

  String slug;

  String name;

  String? imageUrl;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AartiCategoryCard &&
    other.kind == kind &&
    other.id == id &&
    other.slug == slug &&
    other.name == name &&
    other.imageUrl == imageUrl;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (kind.hashCode) +
    (id.hashCode) +
    (slug.hashCode) +
    (name.hashCode) +
    (imageUrl == null ? 0 : imageUrl!.hashCode);

  @override
  String toString() => 'AartiCategoryCard[kind=$kind, id=$id, slug=$slug, name=$name, imageUrl=$imageUrl]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'kind'] = this.kind;
      json[r'id'] = this.id;
      json[r'slug'] = this.slug;
      json[r'name'] = this.name;
    if (this.imageUrl != null) {
      json[r'imageUrl'] = this.imageUrl;
    } else {
      json[r'imageUrl'] = null;
    }
    return json;
  }

  /// Returns a new [AartiCategoryCard] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AartiCategoryCard? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "AartiCategoryCard[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "AartiCategoryCard[kind]" has a null value in JSON.');
        assert(json.containsKey(r'id'), 'Required key "AartiCategoryCard[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "AartiCategoryCard[id]" has a null value in JSON.');
        assert(json.containsKey(r'slug'), 'Required key "AartiCategoryCard[slug]" is missing from JSON.');
        assert(json[r'slug'] != null, 'Required key "AartiCategoryCard[slug]" has a null value in JSON.');
        assert(json.containsKey(r'name'), 'Required key "AartiCategoryCard[name]" is missing from JSON.');
        assert(json[r'name'] != null, 'Required key "AartiCategoryCard[name]" has a null value in JSON.');
        assert(json.containsKey(r'imageUrl'), 'Required key "AartiCategoryCard[imageUrl]" is missing from JSON.');
        return true;
      }());

      return AartiCategoryCard(
        kind: AartiCategoryCardKindEnum.fromJson(json[r'kind'])!,
        id: mapValueOfType<String>(json, r'id')!,
        slug: mapValueOfType<String>(json, r'slug')!,
        name: mapValueOfType<String>(json, r'name')!,
        imageUrl: mapValueOfType<String>(json, r'imageUrl'),
      );
    }
    return null;
  }

  static List<AartiCategoryCard> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiCategoryCard>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiCategoryCard.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AartiCategoryCard> mapFromJson(dynamic json) {
    final map = <String, AartiCategoryCard>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AartiCategoryCard.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AartiCategoryCard-objects as value to a dart map
  static Map<String, List<AartiCategoryCard>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AartiCategoryCard>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AartiCategoryCard.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'kind',
    'id',
    'slug',
    'name',
    'imageUrl',
  };
}


class AartiCategoryCardKindEnum {
  /// Instantiate a new enum with the provided [value].
  const AartiCategoryCardKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const category = AartiCategoryCardKindEnum._(r'category');

  /// List of all possible values in this [enum][AartiCategoryCardKindEnum].
  static const values = <AartiCategoryCardKindEnum>[
    category,
  ];

  static AartiCategoryCardKindEnum? fromJson(dynamic value) => AartiCategoryCardKindEnumTypeTransformer().decode(value);

  static List<AartiCategoryCardKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiCategoryCardKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiCategoryCardKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AartiCategoryCardKindEnum] to String,
/// and [decode] dynamic data back to [AartiCategoryCardKindEnum].
class AartiCategoryCardKindEnumTypeTransformer {
  factory AartiCategoryCardKindEnumTypeTransformer() => _instance ??= const AartiCategoryCardKindEnumTypeTransformer._();

  const AartiCategoryCardKindEnumTypeTransformer._();

  String encode(AartiCategoryCardKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AartiCategoryCardKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AartiCategoryCardKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'category': return AartiCategoryCardKindEnum.category;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AartiCategoryCardKindEnumTypeTransformer] instance.
  static AartiCategoryCardKindEnumTypeTransformer? _instance;
}


