//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AartiDeityCardInput {
  /// Returns a new [AartiDeityCardInput] instance.
  AartiDeityCardInput({
    required this.kind,
    required this.slug,
    required this.displayName,
    required this.iconUrl,
  });

  AartiDeityCardInputKindEnum kind;

  String slug;

  String displayName;

  String iconUrl;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AartiDeityCardInput &&
    other.kind == kind &&
    other.slug == slug &&
    other.displayName == displayName &&
    other.iconUrl == iconUrl;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (kind.hashCode) +
    (slug.hashCode) +
    (displayName.hashCode) +
    (iconUrl.hashCode);

  @override
  String toString() => 'AartiDeityCardInput[kind=$kind, slug=$slug, displayName=$displayName, iconUrl=$iconUrl]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'kind'] = this.kind;
      json[r'slug'] = this.slug;
      json[r'displayName'] = this.displayName;
      json[r'iconUrl'] = this.iconUrl;
    return json;
  }

  /// Returns a new [AartiDeityCardInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AartiDeityCardInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "AartiDeityCardInput[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "AartiDeityCardInput[kind]" has a null value in JSON.');
        assert(json.containsKey(r'slug'), 'Required key "AartiDeityCardInput[slug]" is missing from JSON.');
        assert(json[r'slug'] != null, 'Required key "AartiDeityCardInput[slug]" has a null value in JSON.');
        assert(json.containsKey(r'displayName'), 'Required key "AartiDeityCardInput[displayName]" is missing from JSON.');
        assert(json[r'displayName'] != null, 'Required key "AartiDeityCardInput[displayName]" has a null value in JSON.');
        assert(json.containsKey(r'iconUrl'), 'Required key "AartiDeityCardInput[iconUrl]" is missing from JSON.');
        assert(json[r'iconUrl'] != null, 'Required key "AartiDeityCardInput[iconUrl]" has a null value in JSON.');
        return true;
      }());

      return AartiDeityCardInput(
        kind: AartiDeityCardInputKindEnum.fromJson(json[r'kind'])!,
        slug: mapValueOfType<String>(json, r'slug')!,
        displayName: mapValueOfType<String>(json, r'displayName')!,
        iconUrl: mapValueOfType<String>(json, r'iconUrl')!,
      );
    }
    return null;
  }

  static List<AartiDeityCardInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiDeityCardInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiDeityCardInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AartiDeityCardInput> mapFromJson(dynamic json) {
    final map = <String, AartiDeityCardInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AartiDeityCardInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AartiDeityCardInput-objects as value to a dart map
  static Map<String, List<AartiDeityCardInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AartiDeityCardInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AartiDeityCardInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'kind',
    'slug',
    'displayName',
    'iconUrl',
  };
}


class AartiDeityCardInputKindEnum {
  /// Instantiate a new enum with the provided [value].
  const AartiDeityCardInputKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const deity = AartiDeityCardInputKindEnum._(r'deity');

  /// List of all possible values in this [enum][AartiDeityCardInputKindEnum].
  static const values = <AartiDeityCardInputKindEnum>[
    deity,
  ];

  static AartiDeityCardInputKindEnum? fromJson(dynamic value) => AartiDeityCardInputKindEnumTypeTransformer().decode(value);

  static List<AartiDeityCardInputKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiDeityCardInputKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiDeityCardInputKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AartiDeityCardInputKindEnum] to String,
/// and [decode] dynamic data back to [AartiDeityCardInputKindEnum].
class AartiDeityCardInputKindEnumTypeTransformer {
  factory AartiDeityCardInputKindEnumTypeTransformer() => _instance ??= const AartiDeityCardInputKindEnumTypeTransformer._();

  const AartiDeityCardInputKindEnumTypeTransformer._();

  String encode(AartiDeityCardInputKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AartiDeityCardInputKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AartiDeityCardInputKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'deity': return AartiDeityCardInputKindEnum.deity;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AartiDeityCardInputKindEnumTypeTransformer] instance.
  static AartiDeityCardInputKindEnumTypeTransformer? _instance;
}


