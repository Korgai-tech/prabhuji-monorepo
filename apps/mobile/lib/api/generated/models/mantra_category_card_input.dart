//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraCategoryCardInput {
  /// Returns a new [MantraCategoryCardInput] instance.
  MantraCategoryCardInput({
    required this.kind,
    required this.id,
    required this.slug,
    required this.name,
    required this.imageUrl,
    required this.backgroundColorToken,
  });

  MantraCategoryCardInputKindEnum kind;

  String id;

  String slug;

  String name;

  String? imageUrl;

  String? backgroundColorToken;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraCategoryCardInput &&
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
  String toString() => 'MantraCategoryCardInput[kind=$kind, id=$id, slug=$slug, name=$name, imageUrl=$imageUrl, backgroundColorToken=$backgroundColorToken]';

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

  /// Returns a new [MantraCategoryCardInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraCategoryCardInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "MantraCategoryCardInput[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "MantraCategoryCardInput[kind]" has a null value in JSON.');
        assert(json.containsKey(r'id'), 'Required key "MantraCategoryCardInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "MantraCategoryCardInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'slug'), 'Required key "MantraCategoryCardInput[slug]" is missing from JSON.');
        assert(json[r'slug'] != null, 'Required key "MantraCategoryCardInput[slug]" has a null value in JSON.');
        assert(json.containsKey(r'name'), 'Required key "MantraCategoryCardInput[name]" is missing from JSON.');
        assert(json[r'name'] != null, 'Required key "MantraCategoryCardInput[name]" has a null value in JSON.');
        assert(json.containsKey(r'imageUrl'), 'Required key "MantraCategoryCardInput[imageUrl]" is missing from JSON.');
        assert(json.containsKey(r'backgroundColorToken'), 'Required key "MantraCategoryCardInput[backgroundColorToken]" is missing from JSON.');
        return true;
      }());

      return MantraCategoryCardInput(
        kind: MantraCategoryCardInputKindEnum.fromJson(json[r'kind'])!,
        id: mapValueOfType<String>(json, r'id')!,
        slug: mapValueOfType<String>(json, r'slug')!,
        name: mapValueOfType<String>(json, r'name')!,
        imageUrl: mapValueOfType<String>(json, r'imageUrl'),
        backgroundColorToken: mapValueOfType<String>(json, r'backgroundColorToken'),
      );
    }
    return null;
  }

  static List<MantraCategoryCardInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraCategoryCardInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraCategoryCardInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraCategoryCardInput> mapFromJson(dynamic json) {
    final map = <String, MantraCategoryCardInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraCategoryCardInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraCategoryCardInput-objects as value to a dart map
  static Map<String, List<MantraCategoryCardInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraCategoryCardInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraCategoryCardInput.listFromJson(entry.value, growable: growable,);
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


class MantraCategoryCardInputKindEnum {
  /// Instantiate a new enum with the provided [value].
  const MantraCategoryCardInputKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const category = MantraCategoryCardInputKindEnum._(r'category');

  /// List of all possible values in this [enum][MantraCategoryCardInputKindEnum].
  static const values = <MantraCategoryCardInputKindEnum>[
    category,
  ];

  static MantraCategoryCardInputKindEnum? fromJson(dynamic value) => MantraCategoryCardInputKindEnumTypeTransformer().decode(value);

  static List<MantraCategoryCardInputKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraCategoryCardInputKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraCategoryCardInputKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MantraCategoryCardInputKindEnum] to String,
/// and [decode] dynamic data back to [MantraCategoryCardInputKindEnum].
class MantraCategoryCardInputKindEnumTypeTransformer {
  factory MantraCategoryCardInputKindEnumTypeTransformer() => _instance ??= const MantraCategoryCardInputKindEnumTypeTransformer._();

  const MantraCategoryCardInputKindEnumTypeTransformer._();

  String encode(MantraCategoryCardInputKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a MantraCategoryCardInputKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MantraCategoryCardInputKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'category': return MantraCategoryCardInputKindEnum.category;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [MantraCategoryCardInputKindEnumTypeTransformer] instance.
  static MantraCategoryCardInputKindEnumTypeTransformer? _instance;
}


