---
name: flutter-secrets
description: App secrets for apps/mobile — the Secrets cold-start singleton that reads a GITIGNORED env/prabhujiSecrets.json (SDK API keys / tokens / anything not safe in git history), with a REPLACE_ME_* placeholder convention and an isRealSecret() gate so consumers degrade cleanly when the file is missing or unfilled. Use when adding a new SDK key, rotating a secret, onboarding a new dev clone, or wiring the CI release build.
user-invocable: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Flutter Secrets Skill

## Purpose

Give `apps/mobile` one predictable place for values that must exist on the device but must NOT exist in git history: SDK API keys (Meta App ID / Client Token), support-channel tokens, third-party SDK secrets. The `Secrets` class mirrors `AppConfig`'s cold-start-singleton shape but points at a **gitignored** file, with a placeholder convention so a fresh clone still boots.

The rules:

1. **One file, not per-env.** `env/prabhujiSecrets.json`. If prod ever genuinely needs different keys from staging, split then — not preemptively.
2. **Gitignored.** Never in git history. See the gitignore section below.
3. **Graceful degrade.** Missing file → every field is null → every consumer gates on `isRealSecret()` and skips its init. The app boots.
4. **`REPLACE_ME_*` placeholder convention.** A slot that *looks* filled but isn't real reads as "not a real secret" — same code path as a null.

## When This Skill Applies

- Adding a new SDK API key or token
- Rotating an existing secret
- A new dev clones the repo and the app crashes / a sink is silently off
- Wiring the CI release build to inject the file
- Writing a widget test that needs to exercise the "secret present" branch

## Composes With

- [flutter-env-config](../flutter-env-config/SKILL.md) — same cold-start-singleton shape, initialised right after `AppConfig`
- [flutter-analytics](../flutter-analytics/SKILL.md) — Meta / Facebook App Events sink gates on `Secrets.instance.metaEnabled`
- [flutter-dependencies](../flutter-dependencies/SKILL.md) — consumers of secrets that depend on other DI-owned services

## Package Baseline

No new dependencies — just `flutter/services` (`rootBundle`) and `meta` (`@visibleForTesting`).

## The Pattern

### File layout

```text
apps/mobile/
├── env/
│   └── prabhujiSecrets.json       # GITIGNORED — real values on your machine
├── lib/core/secrets.dart          # the singleton
└── .gitignore                     # includes `env/prabhujiSecrets.json`
```

### `env/prabhujiSecrets.json` shape

```json
{
  "metaAppId": "1234567890123456",
  "metaClientToken": "abcdef0123456789abcdef0123456789",
  "supportWhatsAppNumber": "+911234567890",
  "supportWhatsAppMessage": "Hi Prabhu Ji support team, I need help with…"
}
```

A fresh clone SHOULD ship this file with `REPLACE_ME_*` placeholder values (so consumers gate off and the app still boots), or omit the file entirely (so every field is null). Both paths produce a working debug build with the affected sinks disabled.

### `lib/core/secrets.dart` — the singleton

```dart
class Secrets {
  Secrets._({
    required this.metaAppId,
    required this.metaClientToken,
    required this.supportWhatsAppNumber,
    required this.supportWhatsAppMessage,
  });

  final String? metaAppId;
  final String? metaClientToken;
  final String? supportWhatsAppNumber;
  final String? supportWhatsAppMessage;

  /// True when BOTH slots hold real (non-null, non-placeholder) values.
  bool get metaEnabled =>
      isRealSecret(metaAppId) && isRealSecret(metaClientToken);
  bool get supportWhatsAppEnabled =>
      isRealSecret(supportWhatsAppNumber) &&
      isRealSecret(supportWhatsAppMessage);

  /// The gate. Empty, null, or `REPLACE_ME_*` → not real.
  static bool isRealSecret(String? value) {
    if (value == null || value.isEmpty) return false;
    return !value.startsWith('REPLACE_ME_');
  }

  static Secrets? _instance;

  static Secrets get instance {
    final loaded = _instance;
    if (loaded == null) {
      throw StateError(
        'Secrets.instance read before Secrets.initialize() completed. '
        'Ensure `await Secrets.initialize()` runs at the top of main() '
        'before any consumer (Analytics.init, etc.).',
      );
    }
    return loaded;
  }

  static Future<void> initialize() async {
    const path = 'env/prabhujiSecrets.json';
    try {
      final raw = await rootBundle.loadString(path);
      final json = jsonDecode(raw) as Map<String, dynamic>;
      _instance = Secrets._(
        metaAppId: _nullable(json, 'metaAppId'),
        metaClientToken: _nullable(json, 'metaClientToken'),
        supportWhatsAppNumber: _nullable(json, 'supportWhatsAppNumber'),
        supportWhatsAppMessage: _nullable(json, 'supportWhatsAppMessage'),
      );
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[secrets] $path not loaded ($e) — all secrets are null.');
      }
      _instance = Secrets._(
        metaAppId: null,
        metaClientToken: null,
        supportWhatsAppNumber: null,
        supportWhatsAppMessage: null,
      );
    }
  }

  @visibleForTesting
  static Secrets forTest({
    String? metaAppId,
    String? metaClientToken,
    String? supportWhatsAppNumber,
    String? supportWhatsAppMessage,
  }) => Secrets._(
        metaAppId: metaAppId,
        metaClientToken: metaClientToken,
        supportWhatsAppNumber: supportWhatsAppNumber,
        supportWhatsAppMessage: supportWhatsAppMessage,
      );

  static void debugSetInstance(Secrets? secrets) => _instance = secrets;

  static String? _nullable(Map<String, dynamic> json, String key) {
    final v = json[key];
    return v is String ? v : null;
  }
}
```

Real file: `apps/mobile/lib/core/secrets.dart`.

**Key differences from `AppConfig`:**

- Every field is nullable (missing file / placeholder is expected).
- Missing / malformed JSON → empty `Secrets` (all null), NOT a throw. Consumers already gate on `isRealSecret()`.
- No `_string()` throw-on-missing — the missing case is a first-class supported state.

### `main()` — init order

`Secrets.initialize()` runs **right after** `AppConfig.initialize()` and **before** any consumer that reads a secret:

```dart
await AppConfig.initialize();       // 1. per-env config
await Secrets.initialize();         // 2. gitignored SDK keys (this skill)

// 3. Consumers that check secrets:
FacebookAppEvents? facebookAppEvents;
if (Secrets.instance.metaEnabled) {
  try {
    facebookAppEvents = FacebookAppEvents();
  } catch (_) {}
}
final analytics = await Analytics.init(facebook: facebookAppEvents, /* … */);
```

## The Consumer Pattern — Always Gate

Never assume a secret is real. Every consumer branches on the gate:

```dart
// ✅ Correct: gate first, degrade cleanly
if (Secrets.instance.supportWhatsAppEnabled) {
  final number = Secrets.instance.supportWhatsAppNumber!;
  final message = Secrets.instance.supportWhatsAppMessage!;
  launchUrl(Uri.parse('https://wa.me/${number.substring(1)}'
      '?text=${Uri.encodeComponent(message)}'));
} else {
  showSnack('Support is currently unavailable');   // dev-clone-friendly fallback
}

// ❌ Wrong: crashes on a dev clone
launchUrl(Uri.parse('https://wa.me/${Secrets.instance.supportWhatsAppNumber!.substring(1)}'));
```

For paired secrets (App ID + Client Token, key + secret), the gate is a `<featureName>Enabled` getter that AND-s both — one being real without the other is meaningless.

## Gitignore Rules

`apps/mobile/.gitignore` must include:

```gitignore
# App secrets — API keys / SDK tokens / anything we don't want in git
# for locality but NEVER committed. Sibling `env/prabhujiSecrets.example.json`
# (if present) can ship placeholder values as an onboarding template.
env/prabhujiSecrets.json
```

**Verify before every commit:**

```bash
git check-ignore apps/mobile/env/prabhujiSecrets.json
# Expected: prints the path (= ignored). If it prints nothing, the rule is missing or wrong.
```

If you accidentally staged it: `git rm --cached apps/mobile/env/prabhujiSecrets.json` and commit the removal — but if the file was ever pushed, **rotate every secret in it immediately**; git history is forever.

Other secret-adjacent files that should ALSO be ignored (not in scope of this skill, but same rule applies):
- Any `.env`, `.env.local` at the mobile root
- Firebase `google-services.json` if it holds a signing key you don't want to distribute (usually shipped, but check)
- `key.properties` / signing configs under `android/`

## CI — Release Builds

Release builds (`flutter build appbundle --release`) need `env/prabhujiSecrets.json` **present on disk** before the build runs — otherwise `rootBundle.loadString` returns nothing at runtime, every consumer degrades to null, and (for example) the Meta sink silently doesn't fire.

**Simplest pattern:** store the whole JSON as ONE CI secret (`PRABHUJI_SECRETS_JSON`), write it out in a pre-build step.

```yaml
# .github/workflows/mobile-release.yml (illustrative)
- name: Write mobile secrets
  run: |
    printf '%s' "$PRABHUJI_SECRETS_JSON" > apps/mobile/env/prabhujiSecrets.json
  env:
    PRABHUJI_SECRETS_JSON: ${{ secrets.PRABHUJI_SECRETS_JSON }}

- name: Build release bundle
  run: flutter build appbundle --release --dart-define=ENV=prod
```

If prod / staging need different secret values (e.g., a prod-only tracking key you don't want in staging APKs), store two CI secrets (`PRABHUJI_SECRETS_JSON_PROD`, `PRABHUJI_SECRETS_JSON_STAGING`) and pick by branch — do not add per-env code branching inside the `Secrets` class.

**Verify the file landed:** the release build's log should NOT contain `[secrets] env/prabhujiSecrets.json not loaded`.

## Rotating a Secret

1. Rotate the key in the upstream provider console.
2. Update the CI secret (`PRABHUJI_SECRETS_JSON`).
3. Update every dev's local `apps/mobile/env/prabhujiSecrets.json` (send via a secure channel, never Slack DM).
4. Trigger a fresh CI build. Verify the sink still fires (analytics dashboard, WhatsApp click, etc.).
5. Revoke the old key upstream.

No code change needed — the key is a runtime value.

## Adding a New Secret

1. Add the key to `env/prabhujiSecrets.json` on your machine.
2. Add a `final String? <name>;` on `Secrets` + required named param on `Secrets._`.
3. Parse in `.initialize()` via `_nullable(json, '<name>')`.
4. Add a `<featureName>Enabled` getter that AND-s all paired slots via `isRealSecret()`.
5. Add a defaulted param to `Secrets.forTest()`.
6. Consumer gates on the `Enabled` getter before touching the value.
7. Update the CI secret payload (`PRABHUJI_SECRETS_JSON`).
8. Send the new key to other devs.

## Testing

Two shapes:

**Truth-table coverage** — every combination of real/null/placeholder without touching `rootBundle`:

```dart
setUp(() {
  Secrets.debugSetInstance(Secrets.forTest(
    metaAppId: '1234567890',
    metaClientToken: 'abcdef',
  ));
});

test('sends Meta event when both slots are real', () { /* … */ });

test('skips Meta when App ID is a placeholder', () {
  Secrets.debugSetInstance(Secrets.forTest(
    metaAppId: 'REPLACE_ME_META_APP_ID',
    metaClientToken: 'abcdef',
  ));
  // …assert the Meta sink was NOT called
});
```

**Reset between tests:**

```dart
tearDown(() {
  Secrets.debugSetInstance(null);   // next test's setUp must re-seed
});
```

For widget tests that don't touch secret-gated code, just seed once with `Secrets.forTest()` (all nulls) in `setUpAll`.

## Anti-Patterns

- **Real secrets in per-env JSONs (`env/staging.json` etc.).** Those are committed. Secrets live in the gitignored file.
- **Per-env secrets file (`env/secrets.staging.json`) as the default.** One file for the whole app until a real requirement forces the split.
- **Reading a secret directly from `String.fromEnvironment(...)`.** Dart `--dart-define` values leak into `strings.xml` on Android release builds and can be extracted from the APK. `rootBundle` + a gitignored file is not encrypted either, but it doesn't ship a decompile-friendly copy.
- **Committing the real `prabhujiSecrets.json` "just once, to seed CI".** The next `git log` reveals it forever. Use a CI secret.
- **Skipping the `isRealSecret()` gate ("I know the file's on the machine").** Widget tests, dev clones, CI cold builds, and future you next month all disagree.
- **Putting secrets in analytics event properties, log lines, or share-URL strings.** They leak downstream immediately.
- **A single "combined" gate that returns true if ANY slot is real** — silently disables half a feature when one slot rotates and the other doesn't. AND paired slots.
- **`.forTest()` without every field defaulted.** New field lands, existing tests break with a compile error — good; that's the review moment to decide what the test should do.

## Common Mistakes

- **"Meta events stopped firing after deploy"** — CI didn't write `prabhujiSecrets.json` before the build; check the pre-build step and the release log for `[secrets] … not loaded`.
- **Widget test throws `Secrets.instance read before Secrets.initialize()`** — missing `Secrets.debugSetInstance(Secrets.forTest())` in `setUp`.
- **Dev clone shows "Support unavailable" even after adding the file** — the file uses `REPLACE_ME_*` placeholders; replace them with real values.
- **`git status` shows `apps/mobile/env/prabhujiSecrets.json` as modified** — the file is tracked. Run `git rm --cached` on it, verify `.gitignore` has the rule, commit the removal, rotate all keys inside it (history now leaks them).

## Checklist

For a new secret:

- [ ] Slot added to `env/prabhujiSecrets.json` on your machine
- [ ] Nullable field on `Secrets`, parsed in `.initialize()`
- [ ] `<featureName>Enabled` getter AND-s every paired slot via `isRealSecret()`
- [ ] `Secrets.forTest()` gains a defaulted named param
- [ ] Every consumer gates on `<featureName>Enabled` before reading
- [ ] `git check-ignore apps/mobile/env/prabhujiSecrets.json` still prints the path
- [ ] CI secret payload updated (or a note filed to rotate before the next release)
- [ ] Other devs notified out-of-band with the new key

For a new dev clone:

- [ ] `apps/mobile/env/prabhujiSecrets.json` exists (from a teammate, secure channel)
- [ ] `flutter run` boots; if a placeholder file was used, expect the affected features to degrade — not crash

## Authoritative References

- Real implementation: `apps/mobile/lib/core/secrets.dart`
- Real gitignore rule: `apps/mobile/.gitignore` (search for `prabhujiSecrets`)
- Real init call site: `apps/mobile/lib/main.dart` (right after `AppConfig.initialize()`)
- Real consumer example: search for `Secrets.instance.metaEnabled` in `apps/mobile/lib/main.dart`
- Mobile conventions: `apps/mobile/CLAUDE.md`
- Related skills: [flutter-env-config](../flutter-env-config/SKILL.md), [flutter-analytics](../flutter-analytics/SKILL.md), [flutter-dependencies](../flutter-dependencies/SKILL.md), [frontend-patterns](../frontend-patterns/SKILL.md)
