# apps/mobile

Flutter app (Dart ^3.12, Flutter 3.44), Android-first. Riverpod 3 for state, go_router 17 for routing, dio 5 for HTTP, flutter_secure_storage for the JWT. Not a pnpm package — needs the Flutter SDK.

## Structure

- `env/<staging|preprod|prod>.json` + `lib/core/app_config.dart` — per-env runtime config (API base URL, events collector URL + API key, legal-page URLs). Selected by `--dart-define=ENV=staging|preprod|prod` (default: `staging`); the JSON is bundled as a Flutter asset and read once in `main()` via `await AppConfig.initialize()`. To point the app at your laptop (Android emulator: `http://10.0.2.2:3000`), edit `env/staging.json` locally — do NOT commit that edit.
- `lib/core/analytics.dart` — the analytics seam; see the **Analytics** section below.
- `lib/core/dio_client.dart` — dio instance with auth-header injection; `lib/core/auth_store.dart` — token in secure storage.
- `lib/core/router.dart` — ONE long-lived `GoRouter` with a `refreshListenable` bridge for auth changes. Do not rebuild the router per token change.
- `lib/api/api_client.dart` — thin hand-written client over dio. `lib/api/generated/**` — Dart models generated from `apps/api/openapi.json`; NEVER hand-edit, regenerate with `pnpm nx run mobile:generate` (needs JDK 17) after API schema changes.
- `lib/features/<feature>/` — screens; `lib/state/providers.dart` — Riverpod providers.
- API envelope is `{success,message,data}`; error handling reads `body['message']`.

## Language & locale

**The app holds NO language list.** `GET /languages` (unauthenticated) serves the codes + native/English labels + the `defaultCode` to pre-select; onboarding renders that response, with a loading state and a Retry on failure. There is deliberately no bundled fallback — the screen is only reachable post-OTP and cannot be completed without `PATCH /users/me`, so a baked-in list would only let someone pick a language and then fail to save. Adding a ninth language, or hiding an existing one, needs no app release — the backend flips `enabled` in `shared/language.schema.ts` and the picker follows.

A hidden language can still arrive on a stored profile: the backend **grandfathers** users who chose it before it was disabled. So never assume `selectedLanguage` is in the fetched list — that is exactly why `MeUser.selectedLanguage` and `updateMe` carry the raw wire `String` and not the generated `LanguageCode` enum. Narrowing through the enum drops an unknown code to `null`, which produces an empty PATCH body and makes Save a silent no-op.

**Never hand-write `'locale': …` into `queryParameters`.** `lib/core/locale_interceptor.dart` puts the user's selected content language on **every GET** from one place, reading `selectedContentLanguage()` fresh per request. Fourteen call sites used to do it by hand and six forgot, which is why Home banners/shortcuts/feed, Books home, Aarti main and Mantras sections rendered English regardless of the user's choice. Rules: GET only; never overwrites a locale the caller already set; absence is preserved (no language chosen ⇒ param omitted ⇒ server returns all languages — it is NOT defaulted to `hi`). Opt out with `options: Options(extra: {kSkipLocale: true})` when the caller owns the locale — horoscope does, since `horoscopeLocaleProvider` defaults to `hi`.

## Analytics

**Read [`docs/ANALYTICS-FLUTTER-GUIDE.md`](../../docs/ANALYTICS-FLUTTER-GUIDE.md) before adding any tracking** — it has the API reference, the event-vs-user-vs-workspace scoping rules, naming conventions, local verification, and troubleshooting.

- `lib/core/analytics.dart` is the ONLY place the primary analytics SDK is touched. The SDK is now an **in-repo** Amplitude-shape tracker at `apps/mobile/custom_event_tracker/` (`custom_analytics_flutter`) — same façade (`Amplitude.track`/`.identify`/`.setUserId`/`.setGroup`/`.reset`), but transport is our own HTTP client that POSTs Amplitude V2 batches straight at the collector's `/2/httpapi` (SQLite-backed offline queue, 30-min inactivity sessions, lifecycle-driven flush). `amplitude_flutter` is gone; no Amplitude cloud dependency.
- API: `trackEvent(name, properties)` (primary — named funnel events), `signIn(token)` (identity; wired into login + restored-session start, JWT decoded by `lib/core/jwt.dart`), `identifyUser({set, setOnce})` (user state → emits `$identify`; no-op payloads are deduped client-side with a 24 h full-snapshot re-assert — policy in `lib/core/identify_dedupe.dart`, persisted via `lib/core/identify_snapshot_store.dart`; note the emitted `$identify` is now **dropped at the collector**, so it has no server-side effect — the client dedupe (TAM-20) is still intact, and the attribute rides on subsequent events via the SDK's local snapshot), `setWorkspace(id)` (groups), `reset()` (wired to the 401/logout path; also wipes the dedupe snapshot), `trackClick(screen, element)` (legacy wrapper over `trackEvent('click', …)`).
- Call sites are always null-safe and fire-and-forget: `unawaited(ref.read(analyticsProvider)?.trackEvent(…))` — the provider is null in tests/when init fails; analytics must never block or break the app.
- Scoping rule of thumb: facts about **this action** → `trackEvent` properties; facts about **the user** → `identifyUser`; **workspace** → `setWorkspace`; **who** → `signIn`. Never put `player_id`/`plan`/`workspace_id` in event properties.
- `lib/core/analytics_enricher.dart` stamps a **global** bag on every event — device/session/app facts, `user_id`, `chat_type` (the A/B arm off `/users/me → chatConfig.chatType`, mirrored into `ChatCounters` by `UsersRepository.getMe` — the one place the app learns it — and cleared on logout; it must be mirrored from the FETCH, never from a widget `build`, or an install that never opens the Chat tab never stamps an arm at all and a build that runs ahead of `/users/me` wipes a correct one. the key rides on **every** event but carries **`''` until the server has told us the arm** — it used to fall back to `'control'`, but that is a real cohort, so every pre-`/users/me` event was filed under an arm the user might not be in, indistinguishably. `''` is the honest "not yet known" and excludes cleanly with `chat_type != ''`), and `has_name`/`has_photo` (whether the user has a `/status/profile` display name and avatar saved, mirrored by the status repository into `StatusProfileFlagsStore` on every profile fetch/save). **Never pass a global key from a call site** — that duplicates it and lets the two drift, which is exactly why `name_present`, `avatar_present`, `existing_details_present` and `has_existing_details` were removed. Onboarding's `name_present` is NOT one of these: it reports the account name on `PATCH /users/me`, a different record.

## Crash reporting

Firebase Crashlytics lives behind `lib/core/services/crashlytics_service.dart` — the ONLY importer of `package:firebase_crashlytics`. `main()` starts it only when Firebase initialised; it chains (never replaces) `FlutterError.onError` / `PlatformDispatcher.onError`. Dart errors are reported **non-fatal** except null-check / `late` init failures (escalated to fatal); native crashes are fatal via the native SDK. Collection is on in every build, debug included. Non-fatal Dart errors are still **sent** (flagged non-fatal, so they don't count against crash-free users) — never switch the handlers to `recordFlutterFatalError` for everything. The user id is the JWT `sub`, following `AuthStore.changes` (cleared on logout). For caught failures worth seeing, call `unawaited(CrashlyticsService.instance.recordError(e, st, reason: '<area>'))` — don't report expected network errors. Android also applies the `com.google.firebase.crashlytics` Gradle plugin (R8 mapping upload).

## Commands

From `apps/mobile`: `flutter analyze` (keep it clean) and `flutter test` (unit + widget tests in `test/`).
From the repo root: `pnpm verify:mobile`, or `pnpm nx <lint|test|build> mobile` (`build` = debug APK).
Integration test (needs a running API + Android emulator): edit `env/staging.json`'s `apiUrl` to `http://10.0.2.2:3000` first, then:
`flutter test integration_test/app_test.dart -d <device>`
