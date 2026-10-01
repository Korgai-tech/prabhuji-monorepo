//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AartiCategoryCardInput {
  /// Returns a new [AartiCategoryCardInput] instance.
  AartiCategoryCardInput({
    required this.kind,
    required this.id,
    required this.slug,
    required this.name,
    required this.imageUrl,
  });

  AartiCategoryCardInputKindEnum kind;

  String id;

  String slug;

  String name;

  String? imageUrl;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AartiCategoryCardInput &&
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
  String toString() => 'AartiCategoryCardInput[kind=$kind, id=$id, slug=$slug, name=$name, imageUrl=$imageUrl]';

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

  /// Returns a new [AartiCategoryCardInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AartiCategoryCardInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "AartiCategoryCardInput[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "AartiCategoryCardInput[kind]" has a null value in JSON.');
        assert(json.containsKey(r'id'), 'Required key "AartiCategoryCardInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "AartiCategoryCardInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'slug'), 'Required key "AartiCategoryCardInput[slug]" is missing from JSON.');
        assert(json[r'slug'] != null, 'Required key "AartiCategoryCardInput[slug]" has a null value in JSON.');
        assert(json.containsKey(r'name'), 'Required key "AartiCategoryCardInput[name]" is missing from JSON.');
        assert(json[r'name'] != null, 'Required key "AartiCategoryCardInput[name]" has a null value in JSON.');
        assert(json.containsKey(r'imageUrl'), 'Required key "AartiCategoryCardInput[imageUrl]" is missing from JSON.');
        return true;
      }());

      return AartiCategoryCardInput(
        kind: AartiCategoryCardInputKindEnum.fromJson(json[r'kind'])!,
        id: mapValueOfType<String>(json, r'id')!,
        slug: mapValueOfType<String>(json, r'slug')!,
        name: mapValueOfType<String>(json, r'name')!,
        imageUrl: mapValueOfType<String>(json, r'imageUrl'),
      );
    }
    return null;
  }

  static List<AartiCategoryCardInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiCategoryCardInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiCategoryCardInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AartiCategoryCardInput> mapFromJson(dynamic json) {
    final map = <String, AartiCategoryCardInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AartiCategoryCardInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AartiCategoryCardInput-objects as value to a dart map
  static Map<String, List<AartiCategoryCardInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AartiCategoryCardInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AartiCategoryCardInput.listFromJson(entry.value, growable: growable,);
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


class AartiCategoryCardInputKindEnum {
  /// Instantiate a new enum with the provided [value].
  const AartiCategoryCardInputKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const category = AartiCategoryCardInputKindEnum._(r'category');

  /// List of all possible values in this [enum][AartiCategoryCardInputKindEnum].
  static const values = <AartiCategoryCardInputKindEnum>[
    category,
  ];

  static AartiCategoryCardInputKindEnum? fromJson(dynamic value) => AartiCategoryCardInputKindEnumTypeTransformer().decode(value);

  static List<AartiCategoryCardInputKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiCategoryCardInputKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiCategoryCardInputKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AartiCategoryCardInputKindEnum] to String,
/// and [decode] dynamic data back to [AartiCategoryCardInputKindEnum].
class AartiCategoryCardInputKindEnumTypeTransformer {
  factory AartiCategoryCardInputKindEnumTypeTransformer() => _instance ??= const AartiCategoryCardInputKindEnumTypeTransformer._();

  const AartiCategoryCardInputKindEnumTypeTransformer._();

  String encode(AartiCategoryCardInputKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AartiCategoryCardInputKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AartiCategoryCardInputKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'category': return AartiCategoryCardInputKindEnum.category;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AartiCategoryCardInputKindEnumTypeTransformer] instance.
  static AartiCategoryCardInputKindEnumTypeTransformer? _instance;
}


