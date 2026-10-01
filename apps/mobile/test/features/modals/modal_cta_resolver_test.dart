import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/modals/presentation/modal_cta_resolver.dart';

/// [resolveModalCta] allowlist tests (TAM-174). `ModalHost`'s own wiring
/// (unresolvable target still fires `cta_clicked` and never navigates) is
/// covered in `modal_host_test.dart`.
void main() {
  test('the known target resolves to a handler', () {
    expect(resolveModalCta('prabhuji://status/personal-details'), isNotNull);
  });

  test('an unknown target resolves to null', () {
    expect(resolveModalCta('prabhuji://not/allowlisted'), isNull);
  });

  test('a string that does not even parse as a URI resolves to null', () {
    expect(resolveModalCta('not a uri at all'), isNull);
  });

  test(
    'a formatting variant (trailing slash / different case) still resolves '
    'to the SAME handler as the canonical form',
    () {
      final canonical =
          resolveModalCta('prabhuji://status/personal-details');
      final variant =
          resolveModalCta('Prabhuji://Status/Personal-Details/');

      expect(variant, isNotNull);
      expect(variant, same(canonical));
    },
  );
}
