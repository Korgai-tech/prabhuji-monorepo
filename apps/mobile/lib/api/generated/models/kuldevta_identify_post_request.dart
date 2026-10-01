//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class KuldevtaIdentifyPostRequest {
  /// Returns a new [KuldevtaIdentifyPostRequest] instance.
  KuldevtaIdentifyPostRequest({
    this.surname = '',
    this.ancestralPlace = '',
    this.community = '',
    this.gotra = '',
    this.templeMentioned = '',
    this.mandirPhoto = '',
  });

  String surname;

  String ancestralPlace;

  String community;

  String gotra;

  String templeMentioned;

  String mandirPhoto;

  @override
  bool operator ==(Object other) => identical(this, other) || other is KuldevtaIdentifyPostRequest &&
    other.surname == surname &&
    other.ancestralPlace == ancestralPlace &&
    other.community == community &&
    other.gotra == gotra &&
    other.templeMentioned == templeMentioned &&
    other.mandirPhoto == mandirPhoto;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (surname.hashCode) +
    (ancestralPlace.hashCode) +
    (community.hashCode) +
    (gotra.hashCode) +
    (templeMentioned.hashCode) +
    (mandirPhoto.hashCode);

  @override
  String toString() => 'KuldevtaIdentifyPostRequest[surname=$surname, ancestralPlace=$ancestralPlace, community=$community, gotra=$gotra, templeMentioned=$templeMentioned, mandirPhoto=$mandirPhoto]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'surname'] = this.surname;
      json[r'ancestralPlace'] = this.ancestralPlace;
      json[r'community'] = this.community;
      json[r'gotra'] = this.gotra;
      json[r'templeMentioned'] = this.templeMentioned;
      json[r'mandirPhoto'] = this.mandirPhoto;
    return json;
  }

  /// Returns a new [KuldevtaIdentifyPostRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static KuldevtaIdentifyPostRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        return true;
      }());

      return KuldevtaIdentifyPostRequest(
        surname: mapValueOfType<String>(json, r'surname') ?? '',
        ancestralPlace: mapValueOfType<String>(json, r'ancestralPlace') ?? '',
        community: mapValueOfType<String>(json, r'community') ?? '',
        gotra: mapValueOfType<String>(json, r'gotra') ?? '',
        templeMentioned: mapValueOfType<String>(json, r'templeMentioned') ?? '',
        mandirPhoto: mapValueOfType<String>(json, r'mandirPhoto') ?? '',
      );
    }
    return null;
  }

  static List<KuldevtaIdentifyPostRequest> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <KuldevtaIdentifyPostRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = KuldevtaIdentifyPostRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, KuldevtaIdentifyPostRequest> mapFromJson(dynamic json) {
    final map = <String, KuldevtaIdentifyPostRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = KuldevtaIdentifyPostRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of KuldevtaIdentifyPostRequest-objects as value to a dart map
  static Map<String, List<KuldevtaIdentifyPostRequest>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<KuldevtaIdentifyPostRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = KuldevtaIdentifyPostRequest.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

