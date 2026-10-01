import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/features/kuldevta/application/kuldevta_bloc.dart';
import 'package:mobile/features/kuldevta/data/kuldevta_counters.dart';
import 'package:mobile/features/kuldevta/data/kuldevta_repository.dart';
import 'package:mobile/features/kuldevta/domain/kuldevta_answers.dart';
import 'package:mobile/features/kuldevta/domain/kuldevta_result.dart';

/// Deterministic fake repo for widget/screen tests.
class FakeKuldevtaRepository implements KuldevtaRepository {
  KuldevtaResult? nextResult;

  @override
  Future<KuldevtaResult> identify(
    KuldevtaAnswers answers, {
    CancelToken? cancelToken,
  }) async {
    final r = nextResult;
    if (r != null) return r;
    throw StateError('FakeKuldevtaRepository.identify not primed');
  }
}

/// Canonical `KuldevtaResult` for widget tests — the deity is a devi
/// with an image and location. Use the `.copyWith`-adjacent factories
/// below for other permutations.
KuldevtaResult sampleKuldevtaDevi({
  String? imageUrl = 'https://cdn.test/karni.jpg',
  String? location = 'Deshnoke, Bikaner, Rajasthan',
  List<String>? reasons,
}) {
  return KuldevtaResult(
    slug: 'karni-mata',
    nameRoman: 'Karni Mata',
    nameDevanagari: 'करणी माता',
    gender: KuldevtaGender.devi,
    imageUrl: imageUrl,
    location: location,
    reasons: reasons ??
        const <String>[
          'Aap Charan samaj se he — Karni Mata Charan samaj ki isht devi he.',
          'Apka parivar Nagana se he — Deshnoke Bikaner ki adhishthatri devi he.',
          'Aap Barmer ke he — Rajasthan ke Charanon ki kuldevi Karni Mata he.',
        ],
    tier: 'confirmed',
    matchedOn: const <String>['community', 'place'],
  );
}

KuldevtaResult sampleKuldevtaDevta() {
  return KuldevtaResult(
    slug: 'khatushyam',
    nameRoman: 'Khatushyam Baba',
    nameDevanagari: 'खाटूश्याम बाबा',
    gender: KuldevtaGender.devta,
    imageUrl: null, // exercises fallback variant
    location: 'Khatu, Sikar, Rajasthan',
    reasons: const <String>[
      'Aap Agrawal samaj se he — Khatushyam Baba Agrawalon ke isht dev he.',
    ],
    tier: 'likely',
    matchedOn: const <String>['community_inferred'],
  );
}

/// Wraps a widget under test in the standard providers a kuldevta
/// screen needs at pump-time.
Widget wrapForKuldevtaScreen({
  required Widget child,
  KuldevtaBloc? bloc,
}) {
  GoogleFonts.config.allowRuntimeFetching = false;
  final resolvedBloc = bloc ??
      KuldevtaBloc(
        repository: FakeKuldevtaRepository()..nextResult = sampleKuldevtaDevi(),
        counters: KuldevtaCounters.inMemory(),
        isPro: () => false,
      typingDelay: Duration.zero,
      );
  return ProviderScope(
    child: MaterialApp(
      theme: ThemeData(
        useMaterial3: true,
        textTheme: GoogleFonts.interTextTheme(),
      ),
      home: BlocProvider.value(
        value: resolvedBloc,
        child: child,
      ),
    ),
  );
}

/// Pin the tester view to a phone-shape at [width]×[height] dp, resetting on
/// teardown. Prevents desktop-viewport layout drift in widget tests.
void pinPhoneSize(WidgetTester tester,
    {double width = 360, required double height}) {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}
