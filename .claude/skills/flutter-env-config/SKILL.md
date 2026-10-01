---
name: flutter-env-config
description: Environment configuration for apps/mobile — the AppConfig cold-start singleton (env/<staging|preprod|prod>.json bundled as Flutter assets, one .initialize() at top of main(), .instance throws before init), --dart-define=ENV= selection, and the "edit env/staging.json locally, do NOT commit" local-dev workflow. Use when adding a new env, a new config field, wiring the API base URL, or debugging "app can't reach my laptop."
user-invocable: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Flutter Env-Config Skill

## Purpose

Give `apps/mobile` one predictable way to load per-environment runtime values (API base URL, events collector URL/key, legal-page URLs, share host, Play Store URL): a single `AppConfig` class that reads `env/<ENV>.json` **once** at cold start, exposed as `AppConfig.instance.<field>` synchronously everywhere else.

The JSON is the single source of truth. There is deliberately no `--dart-define=API_URL=…` escape hatch — call sites read `AppConfig.instance.apiUrl`, never a compile-time constant, so all URL/key values live in one file per env.

## When This Skill Applies

- Adding a new environment (e.g., `dev`, `qa`)
- Adding a new config field (a URL, an API key, a feature-flag origin)
- Pointing the debug app at your laptop's API (Android emulator, physical device)
- Debugging `StateError: AppConfig.instance read before AppConfig.initialize() completed`
- CI needs to build for a specific env
- Writing a widget test that reads config

## Composes With

- [flutter-secrets](../flutter-secrets/SKILL.md) — same load-once-at-cold-start pattern; secrets live in a **gitignored** sibling file, never in these per-env JSONs.
- [flutter-dependencies](../flutter-dependencies/SKILL.md) — `configureLocator` runs AFTER `AppConfig.initialize()`; `Dio` reads `AppConfig.instance.apiUrl`.
- [flutter-analytics](../flutter-analytics/SKILL.md) — `Analytics.init` reads `eventsUrl` + `eventsApiKey` from `AppConfig`.

## Package Baseline

No new dependencies — just `flutter/services` (in the SDK) for `rootBundle`. Everything is bundled as a Flutter asset.

## The Pattern

### File layout

```text
apps/mobile/
├── env/
│   ├── staging.json               # default when ENV is unset
│   ├── preprod.json
│   └── prod.json
├── lib/core/app_config.dart       # the singleton
└── pubspec.yaml                   # `- env/` under `flutter.assets`
```

### `env/<env>.json` shape

Every JSON file has the **same keys**. A missing key throws at `AppConfig.initialize()` — this is a launch-time failure by design so a broken env can never ship silently.

```json
{
  "environment": "staging",
  "apiUrl": "https://api-stage.example.com",
  "eventsUrl": "https://events-stage.example.com",
  "eventsApiKey": "<per-env collector key>",
  "privacyPolicyUrl": "https://example.com/privacy.html",
  "termsOfServiceUrl": "https://example.com/terms.html",
  "refundPolicyUrl": "https://example.com/refund.html",
  "pricingPolicyUrl": "https://example.com/pricing.html",
  "dataDeletionUrl": "https://example.com/data-deletion.html",
  "shareHost": "https://example.com",
  "playStoreUrl": "https://play.google.com/store/apps/details?id=com.example.app"
}
```

### `pubspec.yaml` — asset registration

```yaml
flutter:
  uses-material-design: true
  assets:
    - env/            # loads staging.json / preprod.json / prod.json as bundled strings
```

Registering the directory (not each file) means new envs land without editing pubspec.

### `lib/core/app_config.dart` — the singleton

```dart
class AppConfig {
  AppConfig._({
    required this.environment,
    required this.apiUrl,
    required this.eventsUrl,
    required this.eventsApiKey,
    // …other fields…
  });

  final String environment;
  final String apiUrl;
  final String eventsUrl;
  final String eventsApiKey;
  // …

  static AppConfig? _instance;

  static AppConfig get instance {
    final loaded = _instance;
    if (loaded == null) {
      throw StateError(
        'AppConfig.instance read before AppConfig.initialize() completed. '
        'Ensure `await AppConfig.initialize()` runs at the top of main() '
        'before any consumer (buildDio, Analytics.init, …). '
        'In tests, seed via AppConfig.debugSetInstance(...).',
      );
    }
    return loaded;
  }

  static Future<void> initialize() async {
    const envName = String.fromEnvironment('ENV', defaultValue: 'staging');
    final path = 'env/$envName.json';
    final raw = await rootBundle.loadString(path);
    final json = jsonDecode(raw) as Map<String, dynamic>;
    _instance = AppConfig._(
      environment: _string(json, 'environment', path),
      apiUrl: _string(json, 'apiUrl', path),
      // …
    );
  }

  static String _string(Map<String, dynamic> json, String key, String path) {
    final v = json[key];
    if (v is! String || v.isEmpty) {
      throw StateError('AppConfig: missing or non-string field "$key" in $path.');
    }
    return v;
  }

  @visibleForTesting
  static void debugSetInstance(AppConfig config) => _instance = config;

  @visibleForTesting
  factory AppConfig.forTest({
    String environment = 'test',
    String apiUrl = 'https://api.test.invalid',
    // …recognisably-fake defaults for every field…
  }) => AppConfig._(environment: environment, apiUrl: apiUrl, /* … */);
}
```

Real file: `apps/mobile/lib/core/app_config.dart`.

### `main()` — init order

`AppConfig.initialize()` is the FIRST awaited call after `WidgetsFlutterBinding.ensureInitialized()`. Everything downstream depends on it.

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // …platform-only work that doesn't need config (orientation lock, MediaKit.ensureInitialized, …)

  await AppConfig.initialize();     // 1. per-env values (this skill)
  await Secrets.initialize();       // 2. gitignored SDK keys (flutter-secrets)

  // 3. Build infra that reads AppConfig:
  final dio = buildDio(store);      // reads AppConfig.instance.apiUrl
  final analytics = await Analytics.init(/* reads eventsUrl + eventsApiKey */);

  // 4. Wire DI (flutter-dependencies)
  await configureLocator(authStore: store, dio: dio, analytics: analytics, /* … */);

  runApp(const MobileApp());
}
```

## Env Selection at Build/Run Time

`--dart-define=ENV=<name>` picks which JSON to load. Default is `staging`.

```bash
# Debug run (default = staging)
flutter run

# Preprod
flutter run --dart-define=ENV=preprod

# Prod release build
flutter build appbundle --release --dart-define=ENV=prod
```

Same for `flutter test` and CI. If `ENV` is unset, `staging.json` loads.

## Local Dev — Pointing the App at Your Laptop

**The rule: edit `env/staging.json` locally. Do NOT commit that edit.** There is no `--dart-define=API_URL=…` in this codebase.

| Target | `apiUrl` value | Also update `eventsUrl` to |
|---|---|---|
| Android emulator | `http://10.0.2.2:3000` | same host, port matches `apps/events` |
| Physical Android device on same Wi-Fi | `http://<your-LAN-IP>:3000` (e.g. `192.168.1.42`) | same |
| iOS simulator | `http://localhost:3000` | same |

Then `flutter run` (loads `staging.json`, which now points at your machine). Before pushing: `git checkout apps/mobile/env/staging.json` to drop the local edit.

### Why no `--dart-define=API_URL=…`?

Because URL/key values would then live in *two* places (JSON for CI/release builds, dart-define for dev), and one would silently win. Keeping the JSON as sole source means the app in your emulator uses the same code path as the app in prod. The tradeoff — you edit a tracked file locally — is acceptable because `git status` makes the drift visible; a dart-define hides in your shell history.

## Adding a New Field

1. Add the key to **every** `env/*.json` (staging, preprod, prod). Missing key → launch throws.
2. Add a `final String <field>;` on `AppConfig` and a required named param on `AppConfig._`.
3. Parse it in `AppConfig.initialize()` with `_string(json, '<field>', path)`.
4. Add a default in `AppConfig.forTest()` (recognisably fake — `https://…test.invalid`).
5. Consumers read `AppConfig.instance.<field>`.

If the field is optional per env, use a nullable getter that returns `null` when absent instead of throwing — but prefer required + per-env values, so a missing entry is loud.

## Adding a New Env

1. Create `apps/mobile/env/<newenv>.json` with every key from the others.
2. `- env/` in pubspec is already directory-wide → no pubspec change needed.
3. Build with `--dart-define=ENV=<newenv>`.
4. No code change to `AppConfig` (env name is a raw string, not an enum — see rationale in the anti-patterns below).

## Testing

`AppConfig.instance` throws until `.initialize()` completes, so tests must seed a stub:

```dart
setUp(() {
  AppConfig.debugSetInstance(AppConfig.forTest());   // recognisably-fake URLs
});

tearDown(() {
  // Optional: leave the stub in place — the next test's setUp overwrites.
});
```

For a specific field:

```dart
AppConfig.debugSetInstance(AppConfig.forTest(
  apiUrl: 'https://api.contract.invalid',
));
```

Integration tests that boot `main()` directly get real config from bundled assets — no seeding needed.

## Anti-Patterns

- **`--dart-define=API_URL=…`** — this codebase does not use it. It creates a second source of truth that silently shadows the JSON.
- **Hardcoded URLs inside feature code** (`const url = 'https://api.example.com';`). All URLs live in `env/*.json` and are read via `AppConfig.instance`.
- **`if (env == 'prod') { … }` inside feature code.** Encode the difference as a JSON value, not a branch. If a feature genuinely differs per env, add a field (`feature_x_enabled: true`) and read it.
- **Reading `AppConfig.instance` inside `AppConfig.initialize()` or a top-level `final`.** These execute before `main()` awaits `.initialize()` and throw.
- **Making env an enum.** Kept as a raw string on purpose — adding a new env is JSON + `--dart-define=`, zero code. Enums would need a codegen chain every time.
- **Reading `String.fromEnvironment('SOMETHING')` outside `AppConfig.initialize()`.** The one place we read a `--dart-define` is the ENV name; anything else belongs in the JSON.
- **Different key shapes across envs.** Every JSON has the same key set. Enforce via PR review + the launch-time throw.
- **Committing your local `env/staging.json` edit.** `git status` before every commit; drop the edit if it's just your dev machine's IP.

## Common Mistakes

- **App builds but crashes on launch with `MissingPluginException` on `rootBundle`.** You forgot `WidgetsFlutterBinding.ensureInitialized()` before `await AppConfig.initialize()`.
- **`Unable to load asset: env/staging.json`.** The `assets:` block in `pubspec.yaml` doesn't include `env/`. Add `- env/` under `flutter.assets` and re-run.
- **Widget test throws `AppConfig.instance read before …`.** The test forgot `AppConfig.debugSetInstance(AppConfig.forTest())` in `setUp`.
- **Prod build hits staging API.** You forgot `--dart-define=ENV=prod` on the release build command. CI should always pass it; local `flutter build appbundle --release` won't add it for you.

## Checklist for a New Field / Env

- [ ] Field added to `env/staging.json`, `env/preprod.json`, and `env/prod.json` (or new env file created with every existing key)
- [ ] `AppConfig` class gains a `final String <field>;` (or matching type)
- [ ] `AppConfig._string(...)` (or matching parser) called in `initialize()`
- [ ] `AppConfig.forTest()` gains a defaulted named param (fake value)
- [ ] Consumer reads `AppConfig.instance.<field>` — never a top-level `const`
- [ ] `flutter analyze` clean
- [ ] Debug run (`flutter run`) launches without a `StateError`

## Authoritative References

- Real implementation: `apps/mobile/lib/core/app_config.dart`
- Real env files: `apps/mobile/env/{staging,preprod,prod}.json`
- Real init call site: `apps/mobile/lib/main.dart` (top of `main()`)
- Mobile conventions: `apps/mobile/CLAUDE.md`
- Related skills: [flutter-secrets](../flutter-secrets/SKILL.md), [flutter-dependencies](../flutter-dependencies/SKILL.md), [flutter-analytics](../flutter-analytics/SKILL.md), [flutter-networking](../flutter-networking/SKILL.md) (consumes `apiUrl`), [frontend-patterns](../frontend-patterns/SKILL.md)
