import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/horoscope/data/horoscope_models.dart';
import 'package:mobile/features/horoscope/data/horoscope_repository.dart';
import 'package:mobile/features/horoscope/data/horoscope_video_port.dart';
import 'package:mobile/features/horoscope/data/tts_port.dart';

/// Deterministic in-memory [HoroscopeRepository] so every bloc/widget/golden
/// test runs offline.
class FakeHoroscopeRepository implements HoroscopeRepository {
  FakeHoroscopeRepository({
    List<HoroscopeZodiacSign>? signs,
    HoroscopeDailyResultData? daily,
    this.signsError,
    this.dailyError,
  })  : signs = signs ?? horoscopeSignsFixture(),
        daily = daily ?? horoscopeDailyFixture();

  final List<HoroscopeZodiacSign> signs;
  final HoroscopeDailyResultData daily;

  /// When set, the matching call throws instead of returning.
  HoroscopeException? signsError;
  HoroscopeException? dailyError;

  int fetchSignsCalls = 0;
  int fetchDailyCalls = 0;
  String? lastDailyZodiac;
  String? lastLocale;

  @override
  Future<List<HoroscopeZodiacSign>> fetchZodiacSigns({String? locale}) async {
    fetchSignsCalls++;
    lastLocale = locale;
    final error = signsError;
    if (error != null) throw error;
    return signs;
  }

  @override
  Future<HoroscopeDailyResultData> fetchDaily({
    required String zodiacId,
    String? locale,
  }) async {
    fetchDailyCalls++;
    lastDailyZodiac = zodiacId;
    lastLocale = locale;
    final error = dailyError;
    if (error != null) throw error;
    return daily;
  }
}

/// The 12 contract signs, server-ordered and typo-free.
List<HoroscopeZodiacSign> horoscopeSignsFixture() {
  const names = <String, String>{
    'aries': 'Aries',
    'taurus': 'Taurus',
    'gemini': 'Gemini',
    'cancer': 'Cancer',
    'leo': 'Leo',
    'virgo': 'Virgo',
    'libra': 'Libra',
    'scorpio': 'Scorpio',
    // The API corrects the Figma layer-name typos — assert these two.
    'sagittarius': 'Sagittarius',
    'capricorn': 'Capricorn',
    'aquarius': 'Aquarius',
    'pisces': 'Pisces',
  };
  var order = 0;
  return names.entries
      .map((e) => HoroscopeZodiacSign(
            zodiacId: e.key,
            displayName: e.value,
            sortOrder: order++,
          ))
      .toList(growable: false);
}

HoroscopeStep horoscopeStepFixture({
  required String stepId,
  required int order,
  String? title,
  String? displayText,
  String? ttsText,
  HoroscopeContentType contentType = HoroscopeContentType.text,
  bool ttsEnabled = true,
}) {
  return HoroscopeStep(
    stepId: stepId,
    title: title ?? stepId,
    displayText: displayText ?? 'Body for $stepId',
    ttsText: ttsText ?? 'Narration for $stepId',
    order: order,
    contentType: contentType,
    ttsEnabled: ttsEnabled,
  );
}

/// A daily result mirroring the TAM-73 seed's 8 example steps (incl. the
/// `number` + `color` content types the design scales differently).
HoroscopeDailyResultData horoscopeDailyFixture({
  String zodiacId = 'taurus',
  List<HoroscopeStep>? steps,
  String localeRequested = 'hi',
  String localeServed = 'hi',
  bool fallbackUsed = false,
  String videoUrl = 'https://cdn.example.com/horoscope/bg.mp4',
  String fallbackImageUrl = 'https://cdn.example.com/horoscope/bg.jpg',
}) {
  return HoroscopeDailyResultData(
    zodiacId: zodiacId,
    dateIst: '2026-06-15',
    localeServed: localeServed,
    fallbackUsed: fallbackUsed,
    steps: steps ??
        [
          horoscopeStepFixture(
              stepId: 'namaste', order: 0, title: 'Namaste',
              displayText: 'Taurus Horoscope for Today'),
          horoscopeStepFixture(
              stepId: 'good_time', order: 1, title: 'A good time today',
              displayText:
                  'This is a day of progress and success at work. Your ideas and plans will receive praise.'),
          horoscopeStepFixture(
              stepId: 'lucky_number', order: 2, title: 'Lucky number',
              displayText: '7', contentType: HoroscopeContentType.number),
          horoscopeStepFixture(
              stepId: 'lucky_colour', order: 3, title: 'Lucky colour',
              displayText: 'Sky Blue', contentType: HoroscopeContentType.color),
        ],
    media: HoroscopeMediaData(
      backgroundVideoUrl: videoUrl,
      backgroundStaticFallbackUrl: fallbackImageUrl,
    ),
  );
}

/// Scriptable [TtsPort] fake — the whole narration state machine is testable
/// through this with no device, no channel and no audio.
class FakeTtsPort implements TtsPort {
  FakeTtsPort({this.languageAvailable = true});

  /// Flip to false to exercise the unsupported-language path (text-only + log).
  bool languageAvailable;

  final List<String> spoken = <String>[];
  final List<String> spokenLocales = <String>[];
  final List<String> languageChecks = <String>[];
  int stopCalls = 0;
  int disposeCalls = 0;
  bool get isSpeaking => _speaking;

  bool _speaking = false;
  final StreamController<void> _completions = StreamController<void>.broadcast();

  @override
  Stream<void> get completions => _completions.stream;

  @override
  Future<bool> isLanguageAvailable(String locale) async {
    languageChecks.add(locale);
    return languageAvailable;
  }

  @override
  Future<void> speak(String text, {required String locale}) async {
    spoken.add(text);
    spokenLocales.add(locale);
    _speaking = true;
  }

  @override
  Future<void> stop() async {
    stopCalls++;
    _speaking = false;
  }

  @override
  Future<void> dispose() async {
    disposeCalls++;
    await _completions.close();
  }

  /// Simulate the engine finishing the current utterance on its own.
  /// Mirrors the real port: a stopped utterance never completes.
  void completeSpeech() {
    if (!_speaking) return;
    _speaking = false;
    _completions.add(null);
  }
}

/// [HoroscopeVideoPort] fake — scriptable success/failure, no codec/network.
class FakeHoroscopeVideoPort implements HoroscopeVideoPort {
  FakeHoroscopeVideoPort({this.failOnInitialize = false});

  /// Static so a factory tear-off (`FakeHoroscopeVideoPort.new`) can still be
  /// pushed into failure mode by a test.
  static bool failNext = false;
  static void resetCounters() {
    failNext = false;
    initializeCalls = 0;
    disposeCalls = 0;
  }

  static int initializeCalls = 0;
  static int disposeCalls = 0;

  final bool failOnInitialize;
  bool _initialized = false;
  bool _error = false;

  @override
  Future<void> initialize(String url) async {
    initializeCalls++;
    if (failOnInitialize || failNext || url.trim().isEmpty) {
      _error = true;
      return;
    }
    _initialized = true;
  }

  @override
  Future<void> play() async {}

  @override
  Future<void> pause() async {}

  @override
  bool get isInitialized => _initialized;

  @override
  bool get hasError => _error;

  @override
  double get aspectRatio => 9 / 16;

  @override
  Size get intrinsicSize => const Size(1080, 1920);

  @override
  Widget buildView() => const SizedBox.shrink(key: ValueKey('fake-video-view'));

  @override
  Future<void> dispose() async {
    disposeCalls++;
    _initialized = false;
  }
}
