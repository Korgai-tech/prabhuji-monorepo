import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/api_client.dart';

void main() {
  test('parseUsers unwraps the envelope into PublicUser models', () {
    final json = {
      'success': true,
      'message': 'OK',
      'data': [
        {'id': '1', 'email': 'a@e.com'},
        {'id': '2', 'email': 'b@e.com'},
      ],
    };
    final users = ApiClient.parseUsers(json);
    expect(users.length, 2);
    expect(users.first.email, 'a@e.com');
  });

  test('parseUsers throws on an error envelope', () {
    final json = {'success': false, 'message': 'nope', 'data': null};
    expect(() => ApiClient.parseUsers(json), throwsA(isA<ApiException>()));
  });
}
