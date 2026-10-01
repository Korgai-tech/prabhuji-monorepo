import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/core/secrets.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/support/presentation/support_screen.dart';
import 'package:mobile/features/support/presentation/whatsapp_launcher.dart';
import 'package:mobile/features/support/support_analytics.dart';
import 'package:mobile/state/providers.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../support/fake_analytics.dart';

/// Fake WhatsAppLauncher — records every call and returns a scripted result
/// per call. Widget tests spec both the enabled-happy-path and the
/// enabled-launch-failed path off the same seam.
class FakeWhatsAppLauncher extends WhatsAppLauncher {
  FakeWhatsAppLauncher({this.launchResult = true})
      : super(launcher: _neverCalled);

  bool launchResult;
  final List<LaunchCall> calls = [];

  bool get called => calls.isNotEmpty;
  LaunchCall? get lastCall => calls.isEmpty ? null : calls.last;

  @override
  Future<bool> launch({
    required String number,
    required String message,
  }) async {
    calls.add(LaunchCall(number: number, message: message));
    return launchResult;
  }

  static Future<bool> _neverCalled(Uri uri, {LaunchMode? mode}) {
    throw StateError(
      'FakeWhatsAppLauncher.launch was bypassed and the underlying '
      'launchUrl stub was hit — a test overrode `launch` incorrectly.',
    );
  }
}

class LaunchCall {
  const LaunchCall({required this.number, required this.message});
  final String number;
  final String message;
}

/// Pumps the [SupportScreen] inside a minimal MaterialApp.router with the
/// given fakes, a fixed 360×800 viewport, and `AppTheme.light()`. Returns
/// the recording analytics so tests can assert on the fired events.
Future<RecordingAnalytics> pumpSupportScreen(
  WidgetTester tester, {
  SupportEntrySource? source,
  required Secrets secrets,
  FakeWhatsAppLauncher? launcher,
  RecordingAnalytics? analytics,
  Size viewport = const Size(360, 800),
}) async {
  GoogleFonts.config.allowRuntimeFetching = false;

  tester.view.physicalSize = viewport;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final rec = analytics ?? RecordingAnalytics();

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        analyticsProvider.overrideWithValue(rec),
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        home: SupportScreen(
          source: source,
          launcher: launcher,
          secretsOverride: secrets,
        ),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 16));
  return rec;
}
