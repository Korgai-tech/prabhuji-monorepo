//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class SendOtpData {
  /// Returns a new [SendOtpData] instance.
  SendOtpData({
    required this.otpSessionId,
    required this.userId,
    required this.resendAvailableAfterSeconds,
    required this.otpLength,
  });

  String otpSessionId;

  String userId;

  /// Minimum value: 0
  /// Maximum value: 9007199254740991
  int resendAvailableAfterSeconds;

  /// Minimum value: 0
  /// Maximum value: 9007199254740991
  int otpLength;

  @override
  bool operator ==(Object other) => identical(this, other) || other is SendOtpData &&
    other.otpSessionId == otpSessionId &&
    other.userId == userId &&
    other.resendAvailableAfterSeconds == resendAvailableAfterSeconds &&
    other.otpLength == otpLength;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (otpSessionId.hashCode) +
    (userId.hashCode) +
    (resendAvailableAfterSeconds.hashCode) +
    (otpLength.hashCode);

  @override
  String toString() => 'SendOtpData[otpSessionId=$otpSessionId, userId=$userId, resendAvailableAfterSeconds=$resendAvailableAfterSeconds, otpLength=$otpLength]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'otpSessionId'] = this.otpSessionId;
      json[r'userId'] = this.userId;
      json[r'resendAvailableAfterSeconds'] = this.resendAvailableAfterSeconds;
      json[r'otpLength'] = this.otpLength;
    return json;
  }

  /// Returns a new [SendOtpData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static SendOtpData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'otpSessionId'), 'Required key "SendOtpData[otpSessionId]" is missing from JSON.');
        assert(json[r'otpSessionId'] != null, 'Required key "SendOtpData[otpSessionId]" has a null value in JSON.');
        assert(json.containsKey(r'userId'), 'Required key "SendOtpData[userId]" is missing from JSON.');
        assert(json[r'userId'] != null, 'Required key "SendOtpData[userId]" has a null value in JSON.');
        assert(json.containsKey(r'resendAvailableAfterSeconds'), 'Required key "SendOtpData[resendAvailableAfterSeconds]" is missing from JSON.');
        assert(json[r'resendAvailableAfterSeconds'] != null, 'Required key "SendOtpData[resendAvailableAfterSeconds]" has a null value in JSON.');
        assert(json.containsKey(r'otpLength'), 'Required key "SendOtpData[otpLength]" is missing from JSON.');
        assert(json[r'otpLength'] != null, 'Required key "SendOtpData[otpLength]" has a null value in JSON.');
        return true;
      }());

      return SendOtpData(
        otpSessionId: mapValueOfType<String>(json, r'otpSessionId')!,
        userId: mapValueOfType<String>(json, r'userId')!,
        resendAvailableAfterSeconds: mapValueOfType<int>(json, r'resendAvailableAfterSeconds')!,
        otpLength: mapValueOfType<int>(json, r'otpLength')!,
      );
    }
    return null;
  }

  static List<SendOtpData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <SendOtpData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = SendOtpData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, SendOtpData> mapFromJson(dynamic json) {
    final map = <String, SendOtpData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = SendOtpData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of SendOtpData-objects as value to a dart map
  static Map<String, List<SendOtpData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<SendOtpData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = SendOtpData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'otpSessionId',
    'userId',
    'resendAvailableAfterSeconds',
    'otpLength',
  };
}

