//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HomeShortcutInput {
  /// Returns a new [HomeShortcutInput] instance.
  HomeShortcutInput({
    required this.id,
    required this.key,
    required this.label,
    required this.destinationType,
    required this.destinationValue,
    required this.iconKey,
    required this.iconUrl,
    required this.theme,
    required this.sortOrder,
  });

  String id;

  /// Stable slug identifying the shortcut (e.g. `aarti_bhajans`). Also the client's icon-asset lookup key.
  String key;

  /// CMS-owned display copy — never hardcoded in the app.
  String label;

  /// linked_module | content_detail | pro_paywall | informational — the SAME vocabulary as a banner's destination, so the client uses one allowlist resolver for both.
  HomeShortcutInputDestinationTypeEnum destinationType;

  /// A STABLE KEY the client resolves through its route allowlist (module key e.g. `wallpaper`/`aarti`/`mantras`/`ringtone`, content id, or paywall id) — NEVER a URL, path or raw deep link; an unknown key is a client no-op. Always null for informational (non-navigable by contract).
  String? destinationValue;

  /// Stable key → a bundled client icon asset (BC fallback for TAM-132's `iconUrl`). Not an image URL — distinct concern from `iconUrl` and deliberately NOT collapsed with it.
  String? iconKey;

  /// Wire-published CMS icon URL (TAM-132). Client priority is `iconUrl` → `iconKey`-keyed bundled asset → no art. Nullable so pre-TAM-132 rows still serve; validated as `mediaUrl` (https-only in prod).
  String? iconUrl;

  /// Per-tile gradient + label colour (TAM-174), or null. Null means the caller is in the experiment's control arm, the experiment is off, or this row has no palette — the client renders its shipped gradient for all three. Colours are `#RRGGBB`; PRESENTATIONAL ONLY (never a route or URL).
  HomeShortcutThemeInput? theme;

  /// CMS-owned grid order (ascending).
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int sortOrder;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HomeShortcutInput &&
    other.id == id &&
    other.key == key &&
    other.label == label &&
    other.destinationType == destinationType &&
    other.destinationValue == destinationValue &&
    other.iconKey == iconKey &&
    other.iconUrl == iconUrl &&
    other.theme == theme &&
    other.sortOrder == sortOrder;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (key.hashCode) +
    (label.hashCode) +
    (destinationType.hashCode) +
    (destinationValue == null ? 0 : destinationValue!.hashCode) +
    (iconKey == null ? 0 : iconKey!.hashCode) +
    (iconUrl == null ? 0 : iconUrl!.hashCode) +
    (theme == null ? 0 : theme!.hashCode) +
    (sortOrder.hashCode);

  @override
  String toString() => 'HomeShortcutInput[id=$id, key=$key, label=$label, destinationType=$destinationType, destinationValue=$destinationValue, iconKey=$iconKey, iconUrl=$iconUrl, theme=$theme, sortOrder=$sortOrder]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'key'] = this.key;
      json[r'label'] = this.label;
      json[r'destinationType'] = this.destinationType;
    if (this.destinationValue != null) {
      json[r'destinationValue'] = this.destinationValue;
    } else {
      json[r'destinationValue'] = null;
    }
    if (this.iconKey != null) {
      json[r'iconKey'] = this.iconKey;
    } else {
      json[r'iconKey'] = null;
    }
    if (this.iconUrl != null) {
      json[r'iconUrl'] = this.iconUrl;
    } else {
      json[r'iconUrl'] = null;
    }
    if (this.theme != null) {
      json[r'theme'] = this.theme;
    } else {
      json[r'theme'] = null;
    }
      json[r'sortOrder'] = this.sortOrder;
    return json;
  }

  /// Returns a new [HomeShortcutInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HomeShortcutInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "HomeShortcutInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "HomeShortcutInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'key'), 'Required key "HomeShortcutInput[key]" is missing from JSON.');
        assert(json[r'key'] != null, 'Required key "HomeShortcutInput[key]" has a null value in JSON.');
        assert(json.containsKey(r'label'), 'Required key "HomeShortcutInput[label]" is missing from JSON.');
        assert(json[r'label'] != null, 'Required key "HomeShortcutInput[label]" has a null value in JSON.');
        assert(json.containsKey(r'destinationType'), 'Required key "HomeShortcutInput[destinationType]" is missing from JSON.');
        assert(json[r'destinationType'] != null, 'Required key "HomeShortcutInput[destinationType]" has a null value in JSON.');
        assert(json.containsKey(r'destinationValue'), 'Required key "HomeShortcutInput[destinationValue]" is missing from JSON.');
        assert(json.containsKey(r'iconKey'), 'Required key "HomeShortcutInput[iconKey]" is missing from JSON.');
        assert(json.containsKey(r'iconUrl'), 'Required key "HomeShortcutInput[iconUrl]" is missing from JSON.');
        assert(json.containsKey(r'theme'), 'Required key "HomeShortcutInput[theme]" is missing from JSON.');
        assert(json.containsKey(r'sortOrder'), 'Required key "HomeShortcutInput[sortOrder]" is missing from JSON.');
        assert(json[r'sortOrder'] != null, 'Required key "HomeShortcutInput[sortOrder]" has a null value in JSON.');
        return true;
      }());

      return HomeShortcutInput(
        id: mapValueOfType<String>(json, r'id')!,
        key: mapValueOfType<String>(json, r'key')!,
        label: mapValueOfType<String>(json, r'label')!,
        destinationType: HomeShortcutInputDestinationTypeEnum.fromJson(json[r'destinationType'])!,
        destinationValue: mapValueOfType<String>(json, r'destinationValue'),
        iconKey: mapValueOfType<String>(json, r'iconKey'),
        iconUrl: mapValueOfType<String>(json, r'iconUrl'),
        theme: HomeShortcutThemeInput.fromJson(json[r'theme']),
        sortOrder: mapValueOfType<int>(json, r'sortOrder')!,
      );
    }
    return null;
  }

  static List<HomeShortcutInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeShortcutInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeShortcutInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HomeShortcutInput> mapFromJson(dynamic json) {
    final map = <String, HomeShortcutInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HomeShortcutInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HomeShortcutInput-objects as value to a dart map
  static Map<String, List<HomeShortcutInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HomeShortcutInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HomeShortcutInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'key',
    'label',
    'destinationType',
    'destinationValue',
    'iconKey',
    'iconUrl',
    'theme',
    'sortOrder',
  };
}

/// linked_module | content_detail | pro_paywall | informational — the SAME vocabulary as a banner's destination, so the client uses one allowlist resolver for both.
class HomeShortcutInputDestinationTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const HomeShortcutInputDestinationTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const linkedModule = HomeShortcutInputDestinationTypeEnum._(r'linked_module');
  static const contentDetail = HomeShortcutInputDestinationTypeEnum._(r'content_detail');
  static const proPaywall = HomeShortcutInputDestinationTypeEnum._(r'pro_paywall');
  static const informational = HomeShortcutInputDestinationTypeEnum._(r'informational');

  /// List of all possible values in this [enum][HomeShortcutInputDestinationTypeEnum].
  static const values = <HomeShortcutInputDestinationTypeEnum>[
    linkedModule,
    contentDetail,
    proPaywall,
    informational,
  ];

  static HomeShortcutInputDestinationTypeEnum? fromJson(dynamic value) => HomeShortcutInputDestinationTypeEnumTypeTransformer().decode(value);

  static List<HomeShortcutInputDestinationTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeShortcutInputDestinationTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeShortcutInputDestinationTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [HomeShortcutInputDestinationTypeEnum] to String,
/// and [decode] dynamic data back to [HomeShortcutInputDestinationTypeEnum].
class HomeShortcutInputDestinationTypeEnumTypeTransformer {
  factory HomeShortcutInputDestinationTypeEnumTypeTransformer() => _instance ??= const HomeShortcutInputDestinationTypeEnumTypeTransformer._();

  const HomeShortcutInputDestinationTypeEnumTypeTransformer._();

  String encode(HomeShortcutInputDestinationTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a HomeShortcutInputDestinationTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  HomeShortcutInputDestinationTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'linked_module': return HomeShortcutInputDestinationTypeEnum.linkedModule;
        case r'content_detail': return HomeShortcutInputDestinationTypeEnum.contentDetail;
        case r'pro_paywall': return HomeShortcutInputDestinationTypeEnum.proPaywall;
        case r'informational': return HomeShortcutInputDestinationTypeEnum.informational;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [HomeShortcutInputDestinationTypeEnumTypeTransformer] instance.
  static HomeShortcutInputDestinationTypeEnumTypeTransformer? _instance;
}


