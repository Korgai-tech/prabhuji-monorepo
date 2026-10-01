import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile/core/locale_interceptor.dart';
import 'package:mobile/features/aarti/data/aarti_repository.dart';
import 'package:mobile/features/mantras/data/mantras_repository.dart';
import 'package:mobile/features/onboarding/data/languages_repository.dart';

/// LIVE-API on-device check for the `locale` standardization.
///
/// Unlike the other integration tests (which use fakes and run headlessly),
/// this one talks to a REAL API over the emulator loopback, so it proves the
/// whole chain on a device: `localeInterceptor` puts `locale` on the wire →
/// the server's shared `localeQuery` fragment accepts it → the localized
/// labels come back.
///
/// Needs `pnpm nx serve api` on the host + the seeds applied. Run with:
///   flutter test integration_test/locale_live_test.dart -d `device`
const _baseUrl = 'http://10.0.2.2:3000';

/// Every content endpoint is JWT-guarded (`GET /languages` deliberately is not),
/// so the harness injects a token the same way `buildDio` does. Passed in at
/// run time — see the header comment.
const _token = String.fromEnvironment('E2E_TOKEN', defaultValue: '');

Dio _dio({String? language}) => Dio(BaseOptions(
      baseUrl: _baseUrl,
      headers: _token.isEmpty ? null : {'Authorization': 'Bearer $_token'},
    ))..interceptors.add(localeInterceptor(() => language));

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('GET /languages serves the catalogue, unauthenticated',
      (tester) async {
    final catalog = await DioLanguagesRepository(_dio()).fetchLanguages();

    expect(catalog.languages, hasLength(8));
    expect(catalog.languages.first.code, 'hi');
    expect(catalog.languages.first.nativeLabel, 'हिंदी');
    expect(catalog.defaultCode, 'hi');
    // Every entry is renderable — the onboarding grid has no fallback list.
    for (final l in catalog.languages) {
      expect(l.nativeLabel, isNotEmpty);
      expect(l.englishLabel, isNotEmpty);
    }
  });

  testWidgets('the interceptor localizes /mantras/sections end-to-end',
      (tester) async {
    // THE ORIGINAL BUG: this endpoint took `language`, so a `locale` was
    // dropped and Hindi callers got English. The repository sends nothing
    // itself — the interceptor supplies it.
    final hindi = await DioMantrasRepository(_dio(language: 'hi')).fetchSections();
    final byType = {for (final s in hindi) s.type.name: s};

    expect(byType['categories']!.title, 'श्रेणियाँ देखें');
    expect(byType['deities']!.title, 'देवताओं के मंत्र');
    // Category CARD names localize off their own override rows...
    expect(byType['categories']!.categories.map((c) => c.name), contains('शांति'));
    // ...and deity names too (they used to be pinned to `en` server-side).
    expect(byType['deities']!.deities.map((d) => d.displayName), contains('गणेश'));
  });

  testWidgets('no selected language ⇒ param omitted ⇒ base labels',
      (tester) async {
    final base = await DioMantrasRepository(_dio()).fetchSections();
    final byType = {for (final s in base) s.type.name: s};

    expect(byType['categories']!.title, 'Browse Categories');
  });

  testWidgets('an unsupported locale falls back instead of 400ing',
      (tester) async {
    final odd = await DioMantrasRepository(_dio(language: 'zz')).fetchSections();
    final byType = {for (final s in odd) s.type.name: s};

    expect(byType['categories']!.title, 'Browse Categories');
  });

  testWidgets('aarti localizes through the same one interceptor',
      (tester) async {
    // `/aarti/main` is one of the six endpoints the app never sent a locale to
    // before injection moved into the interceptor.
    final sections = await DioAartiRepository(_dio(language: 'hi')).fetchMain();

    expect(sections, isNotEmpty);
    final titles = sections.map((s) => s.title).join(' | ');
    expect(
      RegExp(r'[ऀ-ॿ]').hasMatch(titles),
      isTrue,
      reason: 'Hindi caller must get Devanagari section titles, got: $titles',
    );
  });
}
