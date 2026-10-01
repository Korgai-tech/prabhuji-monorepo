//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HomeShortcut {
  /// Returns a new [HomeShortcut] instance.
  HomeShortcut({
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
  HomeShortcutDestinationTypeEnum destinationType;

  /// A STABLE KEY the client resolves through its route allowlist (module key e.g. `wallpaper`/`aarti`/`mantras`/`ringtone`, content id, or paywall id) — NEVER a URL, path or raw deep link; an unknown key is a client no-op. Always null for informational (non-navigable by contract).
  String? destinationValue;

  /// Stable key → a bundled client icon asset (BC fallback for TAM-132's `iconUrl`). Not an image URL — distinct concern from `iconUrl` and deliberately NOT collapsed with it.
  String? iconKey;

  /// Wire-published CMS icon URL (TAM-132). Client priority is `iconUrl` → `iconKey`-keyed bundled asset → no art. Nullable so pre-TAM-132 rows still serve; validated as `mediaUrl` (https-only in prod).
  String? iconUrl;

  /// Per-tile gradient + label colour (TAM-174), or null. Null means the caller is in the experiment's control arm, the experiment is off, or this row has no palette — the client renders its shipped gradient for all three. Colours are `#RRGGBB`; PRESENTATIONAL ONLY (never a route or URL).
  HomeShortcutTheme? theme;

  /// CMS-owned grid order (ascending).
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int sortOrder;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HomeShortcut &&
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
  String toString() => 'HomeShortcut[id=$id, key=$key, label=$label, destinationType=$destinationType, destinationValue=$destinationValue, iconKey=$iconKey, iconUrl=$iconUrl, theme=$theme, sortOrder=$sortOrder]';

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

  /// Returns a new [HomeShortcut] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HomeShortcut? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "HomeShortcut[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "HomeShortcut[id]" has a null value in JSON.');
        assert(json.containsKey(r'key'), 'Required key "HomeShortcut[key]" is missing from JSON.');
        assert(json[r'key'] != null, 'Required key "HomeShortcut[key]" has a null value in JSON.');
        assert(json.containsKey(r'label'), 'Required key "HomeShortcut[label]" is missing from JSON.');
        assert(json[r'label'] != null, 'Required key "HomeShortcut[label]" has a null value in JSON.');
        assert(json.containsKey(r'destinationType'), 'Required key "HomeShortcut[destinationType]" is missing from JSON.');
        assert(json[r'destinationType'] != null, 'Required key "HomeShortcut[destinationType]" has a null value in JSON.');
        assert(json.containsKey(r'destinationValue'), 'Required key "HomeShortcut[destinationValue]" is missing from JSON.');
        assert(json.containsKey(r'iconKey'), 'Required key "HomeShortcut[iconKey]" is missing from JSON.');
        assert(json.containsKey(r'iconUrl'), 'Required key "HomeShortcut[iconUrl]" is missing from JSON.');
        assert(json.containsKey(r'theme'), 'Required key "HomeShortcut[theme]" is missing from JSON.');
        assert(json.containsKey(r'sortOrder'), 'Required key "HomeShortcut[sortOrder]" is missing from JSON.');
        assert(json[r'sortOrder'] != null, 'Required key "HomeShortcut[sortOrder]" has a null value in JSON.');
        return true;
      }());

      return HomeShortcut(
        id: mapValueOfType<String>(json, r'id')!,
        key: mapValueOfType<String>(json, r'key')!,
        label: mapValueOfType<String>(json, r'label')!,
        destinationType: HomeShortcutDestinationTypeEnum.fromJson(json[r'destinationType'])!,
        destinationValue: mapValueOfType<String>(json, r'destinationValue'),
        iconKey: mapValueOfType<String>(json, r'iconKey'),
        iconUrl: mapValueOfType<String>(json, r'iconUrl'),
        theme: HomeShortcutTheme.fromJson(json[r'theme']),
        sortOrder: mapValueOfType<int>(json, r'sortOrder')!,
      );
    }
    return null;
  }

  static List<HomeShortcut> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeShortcut>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeShortcut.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HomeShortcut> mapFromJson(dynamic json) {
    final map = <String, HomeShortcut>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HomeShortcut.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HomeShortcut-objects as value to a dart map
  static Map<String, List<HomeShortcut>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HomeShortcut>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HomeShortcut.listFromJson(entry.value, growable: growable,);
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
class HomeShortcutDestinationTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const HomeShortcutDestinationTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const linkedModule = HomeShortcutDestinationTypeEnum._(r'linked_module');
  static const contentDetail = HomeShortcutDestinationTypeEnum._(r'content_detail');
  static const proPaywall = HomeShortcutDestinationTypeEnum._(r'pro_paywall');
  static const informational = HomeShortcutDestinationTypeEnum._(r'informational');

  /// List of all possible values in this [enum][HomeShortcutDestinationTypeEnum].
  static const values = <HomeShortcutDestinationTypeEnum>[
    linkedModule,
    contentDetail,
    proPaywall,
    informational,
  ];

  static HomeShortcutDestinationTypeEnum? fromJson(dynamic value) => HomeShortcutDestinationTypeEnumTypeTransformer().decode(value);

  static List<HomeShortcutDestinationTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeShortcutDestinationTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeShortcutDestinationTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [HomeShortcutDestinationTypeEnum] to String,
/// and [decode] dynamic data back to [HomeShortcutDestinationTypeEnum].
class HomeShortcutDestinationTypeEnumTypeTransformer {
  factory HomeShortcutDestinationTypeEnumTypeTransformer() => _instance ??= const HomeShortcutDestinationTypeEnumTypeTransformer._();

  const HomeShortcutDestinationTypeEnumTypeTransformer._();

  String encode(HomeShortcutDestinationTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a HomeShortcutDestinationTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  HomeShortcutDestinationTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'linked_module': return HomeShortcutDestinationTypeEnum.linkedModule;
        case r'content_detail': return HomeShortcutDestinationTypeEnum.contentDetail;
        case r'pro_paywall': return HomeShortcutDestinationTypeEnum.proPaywall;
        case r'informational': return HomeShortcutDestinationTypeEnum.informational;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [HomeShortcutDestinationTypeEnumTypeTransformer] instance.
  static HomeShortcutDestinationTypeEnumTypeTransformer? _instance;
}


