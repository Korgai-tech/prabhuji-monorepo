import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/features/chat/application/chat_bloc.dart';
import 'package:mobile/features/chat/application/chat_event.dart';
import 'package:mobile/features/chat/chat_constants.dart';
import 'package:mobile/features/chat/chat_providers.dart';
import 'package:mobile/features/chat/data/chat_counters.dart';
import 'package:mobile/features/chat/presentation/chat_screen.dart';
import 'package:mobile/features/kuldevta/domain/kuldevta_result.dart';
import 'package:mobile/features/kuldevta/kuldevta_providers.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';
import 'package:mobile/state/providers.dart';

import '../../support/chat_harness.dart';

MeUser _fakeMeWithKuldevtaAssigned() => MeUser(
  id: 'test-user',
  name: 'Tester',
  selectedLanguage: 'hi',
  onboardingCompletedAt: DateTime(2026),
  phoneCountryCode: '+91',
  phoneNumber: '9999999999',
  chatConfig: const MeChatConfig(
    enabled: true,
    agentId: kKuldevtaPersonaAgentId,
    showKuldevtaChat: true,
    kuldevtaAssigned: true,
  ),
);

/// Multi-size smoke for the chat persona-header variant (TAM-166,
/// spec §Testing Strategy → Multi-Size Smoke Tests).
///
/// Renders the full ChatScreen with the kuldevta persona agent id AND a
/// non-null handoff identity, at textScale 2.0 across three widths, with
/// two nameRoman variants — one short ("Karni Mata") and one long
/// ("Krishna Bhagawan (Dwarkadhish)") — asserting no RenderFlex overflow.
void main() {
  const widths = <double>[320, 360, 428];
  const names = <String>['Karni Mata', 'Krishna Bhagawan (Dwarkadhish)'];

  KuldevtaResult personaFor({required String name, required KuldevtaGender g}) {
    return KuldevtaResult(
      slug: 'test-slug',
      nameRoman: name,
      nameDevanagari: 'देवता',
      gender: g,
      imageUrl: null, // exercises avatar fallback
      location: null,
      reasons: const <String>['reason 1'],
      tier: 'confirmed',
      matchedOn: const <String>[],
    );
  }

  for (final w in widths) {
    for (final name in names) {
      testWidgets(
        'persona header — no overflow @ ${w.toInt()}dp × 2.0 (name: $name)',
        (tester) async {
          GoogleFonts.config.allowRuntimeFetching = false;
          tester.view.physicalSize = Size(w, 800);
          tester.view.devicePixelRatio = 1.0;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);

          final history = buildHistoryWith(
            transcript: const [],
            agentId: kKuldevtaPersonaAgentId,
          );
          final repo = FakeChatRepository(seedHistory: history);
          final bloc = ChatBloc(
            repository: repo,
            counters: ChatCounters.inMemory(),
            isPro: () => true,
          )..add(const ChatStarted());
          addTearDown(bloc.close);

          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                kuldevtaChatHandoffProvider.overrideWith(
                  (ref) => personaFor(name: name, g: KuldevtaGender.devi),
                ),
                // TAM-166 — the persona-header gate now reads
                // `chatConfig.showKuldevtaChat` off `/users/me` rather than
                // proxying via `agentId == kKuldevtaPersonaAgentId`. Test
                // fixture flips both server flags so the header renders.
                meProvider.overrideWith(
                  (ref) => Future<MeUser?>.value(_fakeMeWithKuldevtaAssigned()),
                ),
                // The header reads `ChatCounters.saveKuldevtaName` /
                // `savedKuldevtaName` on every build (auto-persist + cold-
                // launch fallback). Real `chatCountersProvider` pulls
                // `SharedPreferences` out of the service locator, which
                // isn't registered in widget tests — swap for the
                // in-memory factory.
                chatCountersProvider.overrideWith(
                  (ref) => ChatCounters.inMemory(),
                ),
              ],
              child: MediaQuery(
                data: MediaQueryData(
                  size: Size(w, 800),
                  textScaler: const TextScaler.linear(2.0),
                ),
                child: MaterialApp(
                  theme: ThemeData(
                    useMaterial3: true,
                    textTheme: GoogleFonts.interTextTheme(),
                  ),
                  home: BlocProvider<ChatBloc>.value(
                    value: bloc,
                    child: const ChatScreen(),
                  ),
                ),
              ),
            ),
          );
          // Pump a few frames so the bloc's async history-fetch settles.
          for (var i = 0; i < 6; i++) {
            await tester.pump(const Duration(milliseconds: 20));
          }

          expect(
            tester.takeException(),
            isNull,
            reason:
                'persona header must not overflow at ${w.toInt()}dp × 2.0 '
                '(name = "$name")',
          );
          // Persona-header specifics — the name is rendered.
          expect(find.text(name), findsWidgets);
        },
      );
    }
  }
}
