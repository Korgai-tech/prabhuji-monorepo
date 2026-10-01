import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/jwt.dart';

String _fakeJwt(Map<String, dynamic> claims) {
  String enc(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${enc({'alg': 'HS256', 'typ': 'JWT'})}.${enc(claims)}.fake-signature';
}

void main() {
  group('decodeJwtClaims', () {
    test('extracts the api token payload (sub + email)', () {
      final claims = decodeJwtClaims(_fakeJwt({'sub': 'user-123', 'email': 'a@b.co'}));
      expect(claims?['sub'], 'user-123');
      expect(claims?['email'], 'a@b.co');
    });

    test('handles unpadded base64url payloads', () {
      // one-char-short payload exercises base64Url.normalize
      final claims = decodeJwtClaims(_fakeJwt({'sub': 'x1234'}));
      expect(claims?['sub'], 'x1234');
    });

    test('returns null for garbage, never throws', () {
      expect(decodeJwtClaims(''), isNull);
      expect(decodeJwtClaims('not-a-jwt'), isNull);
      expect(decodeJwtClaims('a.b'), isNull);
      expect(decodeJwtClaims('a.%%%%.c'), isNull);
      expect(decodeJwtClaims('a.${base64Url.encode(utf8.encode('[1,2]'))}.c'), isNull);
    });
  });
}
