//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraCategoryCard {
  /// Returns a new [MantraCategoryCard] instance.
  MantraCategoryCard({
    required this.kind,
    required this.id,
    required this.slug,
    required this.name,
    required this.imageUrl,
    required this.backgroundColorToken,
  });

  MantraCategoryCardKindEnum kind;

  String id;

  String slug;

  String name;

  String? imageUrl;

  String? backgroundColorToken;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraCategoryCard &&
    other.kind == kind &&
    other.id == id &&
    other.slug == slug &&
    other.name == name &&
    other.imageUrl == imageUrl &&
    other.backgroundColorToken == backgroundColorToken;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (kind.hashCode) +
    (id.hashCode) +
    (slug.hashCode) +
    (name.hashCode) +
    (imageUrl == null ? 0 : imageUrl!.hashCode) +
    (backgroundColorToken == null ? 0 : backgroundColorToken!.hashCode);

  @override
  String toString() => 'MantraCategoryCard[kind=$kind, id=$id, slug=$slug, name=$name, imageUrl=$imageUrl, backgroundColorToken=$backgroundColorToken]';

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
    if (this.backgroundColorToken != null) {
      json[r'backgroundColorToken'] = this.backgroundColorToken;
    } else {
      json[r'backgroundColorToken'] = null;
    }
    return json;
  }

  /// Returns a new [MantraCategoryCard] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraCategoryCard? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "MantraCategoryCard[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "MantraCategoryCard[kind]" has a null value in JSON.');
        assert(json.containsKey(r'id'), 'Required key "MantraCategoryCard[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "MantraCategoryCard[id]" has a null value in JSON.');
        assert(json.containsKey(r'slug'), 'Required key "MantraCategoryCard[slug]" is missing from JSON.');
        assert(json[r'slug'] != null, 'Required key "MantraCategoryCard[slug]" has a null value in JSON.');
        assert(json.containsKey(r'name'), 'Required key "MantraCategoryCard[name]" is missing from JSON.');
        assert(json[r'name'] != null, 'Required key "MantraCategoryCard[name]" has a null value in JSON.');
        assert(json.containsKey(r'imageUrl'), 'Required key "MantraCategoryCard[imageUrl]" is missing from JSON.');
        assert(json.containsKey(r'backgroundColorToken'), 'Required key "MantraCategoryCard[backgroundColorToken]" is missing from JSON.');
        return true;
      }());

      return MantraCategoryCard(
        kind: MantraCategoryCardKindEnum.fromJson(json[r'kind'])!,
        id: mapValueOfType<String>(json, r'id')!,
        slug: mapValueOfType<String>(json, r'slug')!,
        name: mapValueOfType<String>(json, r'name')!,
        imageUrl: mapValueOfType<String>(json, r'imageUrl'),
        backgroundColorToken: mapValueOfType<String>(json, r'backgroundColorToken'),
      );
    }
    return null;
  }

  static List<MantraCategoryCard> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraCategoryCard>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraCategoryCard.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraCategoryCard> mapFromJson(dynamic json) {
    final map = <String, MantraCategoryCard>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraCategoryCard.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraCategoryCard-objects as value to a dart map
  static Map<String, List<MantraCategoryCard>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraCategoryCard>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraCategoryCard.listFromJson(entry.value, growable: growable,);
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
    'backgroundColorToken',
  };
}


class MantraCategoryCardKindEnum {
  /// Instantiate a new enum with the provided [value].
  const MantraCategoryCardKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const category = MantraCategoryCardKindEnum._(r'category');

  /// List of all possible values in this [enum][MantraCategoryCardKindEnum].
  static const values = <MantraCategoryCardKindEnum>[
    category,
  ];

  static MantraCategoryCardKindEnum? fromJson(dynamic value) => MantraCategoryCardKindEnumTypeTransformer().decode(value);

  static List<MantraCategoryCardKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraCategoryCardKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraCategoryCardKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MantraCategoryCardKindEnum] to String,
/// and [decode] dynamic data back to [MantraCategoryCardKindEnum].
class MantraCategoryCardKindEnumTypeTransformer {
  factory MantraCategoryCardKindEnumTypeTransformer() => _instance ??= const MantraCategoryCardKindEnumTypeTransformer._();

  const MantraCategoryCardKindEnumTypeTransformer._();

  String encode(MantraCategoryCardKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a MantraCategoryCardKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MantraCategoryCardKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'category': return MantraCategoryCardKindEnum.category;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [MantraCategoryCardKindEnumTypeTransformer] instance.
  static MantraCategoryCardKindEnumTypeTransformer? _instance;
}


