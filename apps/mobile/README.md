# mobile

Flutter client for `apps/api` (login → users list). Android-first; Riverpod + go_router + dio.

## Prerequisites

- Flutter 3.44+ (Dart ^3.12)
- A running API: from the repo root, `docker compose up -d && pnpm nx serve api`
- JDK 17 only if regenerating API models (`pnpm nx run mobile:generate`)

## Run

```bash
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:3000   # Android emulator
# physical device: point API_URL at your machine's LAN IP
```

## Test

```bash
flutter analyze
flutter test                                             # unit + widget
flutter test integration_test/app_test.dart -d <device> \
  --dart-define=API_URL=http://10.0.2.2:3000             # needs emulator + live API
```

`lib/api/generated/` is generated from `apps/api/openapi.json` — never edit it by hand. Conventions for agents/contributors: `CLAUDE.md` in this directory.


Staging: flutter build apk --dart-define=ENV=staging
Preprod: flutter build apk --dart-define=ENV=preprod
Prod: flutter build apk --dart-define=ENV=prod


Debug APK (installs as com.prabhuji.ai.debug):


# staging (the default — env=staging is implicit if omitted)
flutter build apk --debug --dart-define=ENV=staging

# preprod
flutter build apk --debug --dart-define=ENV=preprod

# prod
flutter build apk --debug --dart-define=ENV=prod
Release APK (installs as com.prabhuji.ai, signed with prabhuji-upload-keystore.jks):


# staging
flutter build apk --release --dart-define=ENV=staging

# preprod
flutter build apk --release --dart-define=ENV=preprod

# prod  (Play Store build)
flutter build apk --release --dart-define=ENV=prod
Output: both land at build/app/outputs/flutter-apk/app-debug.apk or app-release.apk.

For Play Store — prefer an AAB over an APK:


flutter build appbundle --release --dart-define=ENV=prod
# → build/app/outputs/bundle/release/app-release.aab
Smaller APKs (split by ABI, ~30% smaller each):


flutter build apk --release --split-per-abi --dart-define=ENV=prod
# → app-armeabi-v7a-release.apk, app-arm64-v8a-release.apk, app-x86_64-release.apk
Run + install on a device (same shape, run instead of build apk):


flutter run --debug --dart-define=ENV=staging
flutter run --release --dart-define=ENV=prod