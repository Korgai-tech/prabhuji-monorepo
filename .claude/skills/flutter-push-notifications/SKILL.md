---
name: flutter-push-notifications
description: FCM lifecycle for apps/mobile — the top-level @pragma('vm:entry-point') firebaseBackgroundHandler in main.dart (AOT tree-shaking silently drops it otherwise), split-by-concern architecture (FirebaseTokenSync = send-side, FirebaseNotifications = receive-side), the three tap paths (foreground onMessage → local notification → tap; backgrounded onMessageOpenedApp; terminated getInitialMessage), Android manifest's default_notification_channel_id MUST match the runtime channel id, POST_NOTIFICATIONS permission ask AFTER login (not before), token dedupe via SharedPreferences to avoid re-sending unchanged tokens, and the logout order (DELETE server BEFORE AuthStore.clear because DELETE needs Bearer). Use when adding a push notification handler, changing the FCM channel, wiring token registration, debugging "tap doesn't route" / "channel-not-found" / "token stopped syncing after login".
user-invocable: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Flutter Push Notifications Skill

## Purpose

Give `apps/mobile` one predictable pipeline from an FCM push to a screen route, and one predictable pipeline from an authenticated session to a registered FCM device token. Split by concern so a broken notification-render path can't stall token sync (and vice versa). Every non-obvious rule here maps to a specific "silent failure" mode of FCM on Android.

## When This Skill Applies

- Adding a new push-notification `type` → route mapping
- Changing the notification channel (id, name, importance, sound)
- Wiring token registration to a new auth path
- Debugging "notification arrives but tapping does nothing"
- Debugging "notification arrives but no heads-up (foreground)"
- Debugging "backgrounded push doesn't wake the app in the tray"
- Debugging "token stopped syncing after login" / "same token re-registered every launch"
- Debugging "notification prompt fires on splash before login"
- Rolling out an iOS build (currently deferred — Android-only in this repo)

## Composes With

- [flutter-auth](../flutter-auth/SKILL.md) — `AuthStore.changes` triggers `FirebaseTokenSync.syncIfAuthenticated()`; `FirebaseTokenSync.logout()` runs BEFORE `AuthStore.clear()` because DELETE needs the Bearer
- [flutter-dependencies](../flutter-dependencies/SKILL.md) — both `FirebaseTokenSync` and `FirebaseNotifications` are registered optionally via `configureLocator` params; consumers gate on `isRegistered<T>()`
- [flutter-routing](../flutter-routing/SKILL.md) — the `NotificationTap` stream is subscribed by `_MobileAppState.initState`; tap → `resolveNotificationRoute(data)` → `router.go(path)`
- [flutter-async-safety](../flutter-async-safety/SKILL.md) — `_tapsController` is closed in `dispose`; subscriptions cancelled
- [flutter-deep-linking](../flutter-deep-linking/SKILL.md) — pushes CAN encode a deep link via the `path` payload override; alternative to the type/id mapper

## Package Baseline

```yaml
# apps/mobile/pubspec.yaml
dependencies:
  firebase_core: ^3.x
  firebase_messaging: ^15.x
  flutter_local_notifications: ^18.x   # foreground heads-up display
```

`flutter_local_notifications` is REQUIRED — FCM does NOT display anything for foreground pushes; we render a local notification so the user sees a heads-up. Backgrounded / terminated pushes use FCM's own tray display, which is why the channel-id contract below matters.

## The Architecture — Split by Concern

Two classes, two responsibilities. **Never merge them.** A broken notification-render path (channel misconfig, permission denial) must not stall token sync, and vice versa.

| Class | File | Responsibility |
|---|---|---|
| `FirebaseTokenSync` | `lib/core/firebase_token_sync.dart` | Send-side: token upload / dedupe / refresh / DELETE-on-logout |
| `FirebaseNotifications` | `lib/core/firebase_notifications.dart` | Receive-side: foreground display, tap dispatch, permission ask |
| `resolveNotificationRoute` | `lib/core/firebase_notifications_router.dart` | Pure mapper: FCM `data` payload → in-app route path |

## Background Handler — Top-Level + `@pragma('vm:entry-point')`

**Non-negotiable rule.** The background handler MUST be a top-level function (or `static`) AND annotated with `@pragma('vm:entry-point')`. If either is missing, AOT tree-shaking silently drops the function and the background isolate crashes at runtime — with no error visible in dev because debug builds don't tree-shake.

```dart
// apps/mobile/lib/main.dart — top-level, above `main()`
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();     // background isolate has its own heap
  if (kDebugMode) {
    debugPrint('[FCM background] message: ${message.messageId}');
  }
  // Do NOT touch shared state here — this runs in a SEPARATE isolate
  // that shares no memory with the main isolate. Persist-then-hand-off
  // via SharedPreferences / secure storage if you need to.
}
```

Wired in `main()`:

```dart
await Firebase.initializeApp();
FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
```

**Rules for the background handler:**
- Top-level function OR `static` method — NEVER an instance method (has no access to `this`)
- `@pragma('vm:entry-point')` annotation is MANDATORY
- MUST call `Firebase.initializeApp()` first — the background isolate has its own Dart heap; nothing is initialized
- Do NOT touch shared state — this is a SEPARATE isolate. Pass data via persistent storage if the main isolate needs to see it
- Keep it minimal — the OS may kill the isolate at any moment

## The Three Tap Paths

FCM delivers taps through three different mechanisms depending on app state. `FirebaseNotifications` normalises all three into ONE `Stream<NotificationTap>`.

| App state | Trigger | Dart hook | `TapSource` |
|---|---|---|---|
| Foreground | Push arrives | `FirebaseMessaging.onMessage` → we render local notification → user taps → `onDidReceiveNotificationResponse` | `foregroundLocal` |
| Backgrounded | Push arrives → OS tray display → user taps | `FirebaseMessaging.onMessageOpenedApp` | `messageOpened` |
| Terminated | Push arrives → OS tray display → user taps → app cold-starts | `FirebaseMessaging.instance.getInitialMessage()` | `initialMessage` |

All three fan into `_tapsController.add(NotificationTap(data, source))`. The UI layer subscribes ONCE:

```dart
// _MobileAppState.initState in main.dart
if (serviceLocator.isRegistered<FirebaseNotifications>()) {
  _tapSub = serviceLocator<FirebaseNotifications>().taps.listen(_onTap);
}

void _onTap(NotificationTap tap) {
  final path = resolveNotificationRoute(tap.data);
  if (path == null) return;
  router.go(path);
}
```

### Foreground display path — WHY we render our own notification

FCM does NOT auto-display the tray entry while the app is in front. Without `flutter_local_notifications.show(...)`, the push arrives silently and the user never knows. The foreground handler renders a local heads-up with the FCM `data` payload attached, so tapping fires the same tap stream as the other two paths.

### Initial message — `scheduleMicrotask` to survive first-frame subscribers

`getInitialMessage()` returns the message that LAUNCHED the app. Firing it synchronously would beat any subscriber that attaches in the first `initState`. Solution:

```dart
final initial = await _messaging.getInitialMessage();
if (initial != null) {
  scheduleMicrotask(() {
    _tapsController.add(NotificationTap(data: _dataOf(initial), source: TapSource.initialMessage));
  });
}
```

Fire on the next microtask so subscribers that attach in the same tick see the event.

## Android Channel — Contract with the Manifest

**Iron rule:** the channel id you create at runtime in `flutter_local_notifications` MUST match the value in `AndroidManifest.xml`:

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<meta-data
    android:name="com.google.firebase.messaging.default_notification_channel_id"
    android:value="prabhuji_default"/>
```

```dart
// lib/core/firebase_notifications.dart
static const _channelId = 'prabhuji_default';   // MUST match ^
```

If they don't match, backgrounded pushes fall back to the OS default channel — which on Android 8+ may have `importance=DEFAULT` (no heads-up, no sound), silently degrading UX. **Verify with a physical backgrounded test after any channel rename.**

Channel creation is idempotent — Android upserts:

```dart
await androidPlugin?.createNotificationChannel(const AndroidNotificationChannel(
  'prabhuji_default',
  'Prabhu Ji notifications',
  description: 'General notifications from Prabhu Ji.',
  importance: Importance.high,        // heads-up on Android 8+
));
```

## `POST_NOTIFICATIONS` — Ask AFTER Login, Not Before

Android 13+ requires runtime permission. The manifest declares:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
```

**But the runtime prompt fires AFTER login**, not at cold start. Reason: an unauthenticated visitor asked to allow notifications will deny at high rates; a user who has signed up has already committed. This gates prompt fatigue.

Wiring: subscribe to `AuthStore.changes` in `main()`; on transition to non-null, call `FirebaseNotifications.requestPermission()`. The prompt is idempotent — if already granted/denied, no dialog is shown.

Currently the actual splash-screen call site is the practical trigger (per the code comment) — the ask is made once the splash decides the user is authenticated and heading to `/home`. Same effect.

## Token Sync — Dedupe on Every Boot

`FirebaseTokenSync.syncIfAuthenticated()` runs on:

1. Cold start when a token is already hydrated (restored session)
2. Every `AuthStore.changes` → non-null transition (fresh login)
3. `FirebaseMessaging.onTokenRefresh` (FCM rotates the token asynchronously)

**Dedupe rule:** the class remembers the last-successfully-synced token in secure storage (`firebase_last_synced_token`). If the current FCM token matches, `_pushToken` is a no-op — no network call. Cheap to invoke on every app open.

**Failure semantics:** every network call is guarded and NEVER rethrows. A broken sync path must not prevent login, refresh, or logout from completing.

## Device ID — Install-Scoped, Not User-Scoped

`FirebaseTokenSync._ensureDeviceId()` generates a UUIDv4 the first time it's needed and persists to `flutter_secure_storage`. That ID:

- Stays stable across the app's lifetime on this install (secure storage survives reboots)
- Is wiped on uninstall (matches FCM token lifetime — also install-scoped)
- Is NOT tied to the user — logging out and back in as a different account keeps the same device ID

The server uses `(userId, deviceId)` as the composite key for `firebase_tokens` — so one user on multiple devices gets multiple rows, and switching users on one device replaces the row.

## The Logout Order — DELETE BEFORE Clear

**This is why `FirebaseTokenSync.logout()` must run BEFORE `AuthStore.clear()`.** The `DELETE /firebase-tokens` needs a valid Bearer to reach the server; if `AuthStore` is cleared first, the DELETE 401s and the row leaks on the server forever.

```dart
// The correct order — every step needs the token from the previous step
await firebaseTokenSync.logout();      // DELETE /firebase-tokens (needs Bearer)
await messaging.deleteToken();         // FCM-side token invalidation
// … analytics.reset(), entitlement.clear(), deep-link.clearPendingIntent()
await authStore.clear();               // THEN wipe the JWT
```

Full ordering (with the other logout side effects) lives in [flutter-auth](../flutter-auth/SKILL.md).

## Payload Contract — What the Server Sends

FCM `data` payload:

```json
{
  "type": "aarti_audio",          // required — canonical string
  "id":   "abc123",               // optional — resource id if the type takes one
  "path": "/some/override/path"   // optional — explicit route override
}
```

Precedence: `path` (if `/`-prefixed) wins over `type` mapping. Use `path` for one-off links / A/B experiments where you don't want to bake a new `type` into the mapper.

## `resolveNotificationRoute` — Pure Mapper

`lib/core/firebase_notifications_router.dart`. Pure top-level function: `Map<String, dynamic>` → `String?` (route path). Returns `null` when the payload doesn't map to a known route — the caller falls back to just opening the app (no navigation).

```dart
String? resolveNotificationRoute(Map<String, dynamic> data) {
  final override = _string(data['path']);
  if (override != null && override.startsWith('/')) return override;

  final type = _string(data['type']);
  if (type == null || type.isEmpty) return null;
  final id = _string(data['id']);

  switch (type) {
    case 'aarti_audio':     return id == null ? '/aarti-bhajans' : '/aarti-bhajans/audio/$id';
    case 'ringtone':        return id == null ? '/ringtones' : '/ringtones/preview/$id';
    case 'book_read':       return id == null ? '/books' : '/books/$id/read';
    // …
    case 'paywall':         return '/paywall';
  }
  return null;
}
```

**Rules:**
- Pure lookup — no state, no async, no widget binding
- Add a new `case` per new type; don't branch on regex / prefix
- Unknown types silently fall back to null (no navigation)
- Types that need an `id` degrade to the section root when `id` is missing (never `null`)

## Platform Notes

- **Android** — fully wired. Manifest declares POST_NOTIFICATIONS permission + `default_notification_channel_id` meta-data
- **iOS** — deferred until `GoogleService-Info.plist` is added. `FirebaseMessaging.requestPermission()` is safe on iOS (no-ops without the plist); `deleteToken()` etc. also safe. Adding iOS = drop in the plist + APNs config in Firebase console + `Runner.entitlements` update; the Dart code above works as-is

## Boot-Time Failure Degrades Cleanly

`main()` wraps each subsystem in try/catch so a failure downgrades cleanly:

```dart
FirebaseTokenSync? firebaseTokenSync;
FirebaseNotifications? firebaseNotifications;
if (firebaseReady) {
  try {
    firebaseTokenSync = FirebaseTokenSync(authStore: store, dio: dio);
    firebaseTokenSync.start();
    firebaseNotifications = FirebaseNotifications();
    await firebaseNotifications.initialize();
  } catch (e) {
    if (kDebugMode) debugPrint('[main] FCM init skipped: $e');
    firebaseTokenSync = null;
    firebaseNotifications = null;
  }
}
```

Nulls pass through `configureLocator`, and every consumer gates on `isRegistered<T>()`. Same pattern as [flutter-analytics](../flutter-analytics/SKILL.md) — analytics is null-safe by design.

## Testing

Both classes are constructor-injectable — inject fakes for `FirebaseMessaging`, `FlutterLocalNotificationsPlugin`, `FlutterSecureStorage`, and `Dio`. The tap dispatch uses a public `Stream<NotificationTap>` broadcast — subscribe and assert.

For unit tests of `resolveNotificationRoute`, the function is pure — feed a `Map` and assert the returned path.

**Widget tests skip FCM entirely** — `configureLocator` accepts nullable `firebaseNotifications` / `firebaseTokenSync` params; skipping them registers nothing, and every consumer is guarded with `isRegistered<T>()`.

## Anti-Patterns

- **Background handler as a class method / lambda.** AOT tree-shakes it. Silent crash at background push time. Top-level + `@pragma('vm:entry-point')`.
- **Missing `Firebase.initializeApp()` at the top of the background handler.** Background isolate has its own heap; nothing is initialized. Push arrives, handler crashes silently.
- **Touching main-isolate state from the background handler.** Different isolate, different heap. Persist and pick up on the next main-isolate boot.
- **Runtime channel id ≠ manifest `default_notification_channel_id`.** Backgrounded pushes silently drop to the OS default channel — no heads-up, no sound.
- **`POST_NOTIFICATIONS` ask on splash before login.** Deny rates spike; you can't ask again for a long time.
- **Not deduping token sync.** Every app open sends the same token → wasted requests + noise in server logs.
- **Calling `AuthStore.clear()` BEFORE `FirebaseTokenSync.logout()`.** DELETE 401s. Row leaks on the server. Full detail in [flutter-auth](../flutter-auth/SKILL.md).
- **Merging `FirebaseTokenSync` and `FirebaseNotifications` into one class.** A broken notification-render path stalls token sync. Keep the split.
- **Routing based on the FCM `notification` payload title/body.** That's user-facing copy. Route from `data`, always. `notification` is only for rendering.
- **Firing `_tapsController.add` synchronously inside `getInitialMessage()`.** Subscribers attached in `initState` in the same tick miss the event. `scheduleMicrotask` is the fix.

## Common Mistakes

- **"Push arrives, tap does nothing"** — the `NotificationTap` subscriber isn't attached (widget test / harness missing `_tapSub` wiring), OR `resolveNotificationRoute` returned `null` for the payload (add a case for the `type`).
- **"Backgrounded push doesn't show a heads-up"** — the channel importance is `DEFAULT` instead of `HIGH`. Recreate the channel with `Importance.high` (needs uninstall/reinstall on some Android versions — channels are immutable once created).
- **"Foreground push is silent"** — the `_handleForegroundMessage` isn't wiring `flutter_local_notifications.show(...)`, or the `notification` field is null on the RemoteMessage (data-only pushes are silent by design in this app).
- **"Same token re-registered every launch"** — the `_lastSyncedTokenKey` dedupe isn't reading (secure storage returned null? key changed?). Log the value in dev mode.
- **"iOS crashes at cold start"** — `GoogleService-Info.plist` missing. Currently iOS is deferred; the try/catch in `main()` should degrade cleanly, but if it doesn't, add the plist or gate `Firebase.initializeApp()` behind a platform check.
- **"POST_NOTIFICATIONS dialog fires twice"** — you're calling `requestPermission()` on both splash AND the auth-stream listener. Pick one call site. The idempotent SDK method returns the existing state; the DIALOG only shows once but the extra call is noise.
- **`DELETE /firebase-tokens returns 401`** — logout order is wrong. `FirebaseTokenSync.logout()` must run BEFORE `AuthStore.clear()`.

## Checklist — Adding a New Push Notification Type

- [ ] Server payload spec: `{type: '<new_type>', id?: '<id>', path?: '<override>'}` documented
- [ ] Case added to `resolveNotificationRoute`'s `switch(type)` — handle missing-id fallback to section root
- [ ] Router path exists for the returned path
- [ ] Test: `resolveNotificationRoute({'type': '<new_type>', 'id': 'x'})` returns the expected path
- [ ] Test: `resolveNotificationRoute({'type': '<new_type>'})` returns the section root or null (documented behaviour)
- [ ] Manual test on backgrounded app: send a test push via Firebase console with the new payload; tap and confirm route
- [ ] Manual test on foreground: same, confirm local notification renders + tap routes
- [ ] Manual test on terminated app: kill app, send push, tap, confirm route on cold start

## Checklist — Bootstrapping FCM in `main.dart`

- [ ] `firebaseBackgroundHandler` defined at TOP LEVEL of `main.dart` with `@pragma('vm:entry-point')`
- [ ] `await Firebase.initializeApp()` runs before any FCM API
- [ ] `FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler)` called
- [ ] `FirebaseTokenSync` + `FirebaseNotifications` construction wrapped in try/catch — nulls flow to `configureLocator`
- [ ] `firebaseTokenSync.start()` called (wires `onTokenRefresh`)
- [ ] `firebaseNotifications.initialize()` awaited (creates channel, wires listeners, drains getInitialMessage)
- [ ] `AuthStore.changes` subscriber calls `firebaseTokenSync.syncIfAuthenticated()` on non-null
- [ ] `_MobileAppState.initState` subscribes to `notifications.taps` and dispatches via `resolveNotificationRoute`
- [ ] Logout path calls `firebaseTokenSync.logout()` BEFORE `AuthStore.clear()`

## Authoritative References

- Real implementations:
  - `apps/mobile/lib/core/firebase_token_sync.dart` (176 lines) — send-side
  - `apps/mobile/lib/core/firebase_notifications.dart` (209 lines) — receive-side
  - `apps/mobile/lib/core/firebase_notifications_router.dart` (62 lines) — pure route mapper
  - `apps/mobile/lib/main.dart` — background handler + wiring
- Manifest: `apps/mobile/android/app/src/main/AndroidManifest.xml` — POST_NOTIFICATIONS + channel meta-data
- FCM docs: https://firebase.google.com/docs/cloud-messaging/flutter/client
- flutter_local_notifications: https://pub.dev/packages/flutter_local_notifications
- Related skills: [flutter-auth](../flutter-auth/SKILL.md) (logout order, changes stream), [flutter-dependencies](../flutter-dependencies/SKILL.md) (optional registration), [flutter-routing](../flutter-routing/SKILL.md) (tap → router.go), [flutter-deep-linking](../flutter-deep-linking/SKILL.md) (path override), [flutter-async-safety](../flutter-async-safety/SKILL.md), [frontend-patterns](../frontend-patterns/SKILL.md)
