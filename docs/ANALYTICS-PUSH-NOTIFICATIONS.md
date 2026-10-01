# Push notification analytics

The push funnel in `apps/mobile`: permission → received → clicked →
destination. Constants live in `lib/core/notification_analytics.dart`; the
event names and property keys below are the wire contract.

## Payload contract (sending tool → FCM `data`)

| Key | Used for |
| --- | --- |
| `notification_id` | `notification_id` on every funnel event + `app_opened` |
| `campaign_id` | `campaign_id` on the same |
| `type` / `id` / `path` | routing — see `firebase_notifications_router.dart` |

Only messages with a `notification` block are tracked. Data-only messages are
silent and produce no events.

## Events

| Event | Fires | Properties | Owner |
| --- | --- | --- | --- |
| `notification_permission_result` | The user answered the splash POST_NOTIFICATIONS dialog (Android 13+). Not fired when no dialog was shown. | `permission_status` — `granted` / `denied` / `dismissed` | `notification_permission.dart`, `splash_screen.dart` |
| `notification_permission_dismissed` | The user closed that dialog without allowing or denying (back / tap outside). Fires together with `notification_permission_result` (`dismissed`). | — | same |
| `notification_received` | A payload reached the device | `notification_id`, `campaign_id`, `app_state` — `foreground` / `background` / `killed`, `is_foreground` — boolean (`true` only for `foreground`), `suppressed_reason` — `permission_off` / `channel_off` / `dnd` / `in_foreground`, null when shown | `firebase_notifications.dart` (foreground), `notification_background_receipt.dart` (background / killed) |
| `notification_clicked` | The user tapped it (foreground heads-up, backgrounded tray, or the tap that launched the app) | `notification_id`, `campaign_id`, `deeplink_target`, `time_to_click_sec` (from FCM `sentTime`; null when unknown) | `notification_tap_handler.dart` |
| `notification_destination_opened` | Routing after the tap settled | `notification_id`, `campaign_id`, `actual_destination`, `routing_status` — `success` / `fallback_to_home`, `failure_reason` | `notification_tap_handler.dart` |

`failure_reason` values:
- `unknown_route`: the payload's target maps to no route. Sent with `fallback_to_home`.
- `missing_target`: the payload has no target. Sent with `fallback_to_home`.
- `not_pro`: the target is Pro content and the user left the paywall
  without Pro. Sent with `fallback_to_home`; the user stays on Home.
- `redirected`: the route was valid, but a guard landed the user elsewhere. Sent with `success`; `actual_destination` shows where the user ended up.

`app_opened` (cold launch only, unchanged otherwise) adds
`entry_source = notification`, `notification_id` and `campaign_id` when the
launch came from a tap. A tap on an already-running, backgrounded app does
not re-fire `app_opened`. It fires `notification_clicked` only.

## How background / killed receipts are sent

FCM runs `firebaseBackgroundHandler` in a separate isolate. From there:

1. **Background.** The app's main isolate is alive, so the event is handed to
   it over an `IsolateNameServer` port. The main isolate tracks it through
   `Analytics` (all sinks) and acks.
2. **Killed.** No ack within 800 ms. `Analytics.sendDirect` posts the event
   straight to the events collector. This goes to the warehouse sink only,
   not Firebase, Meta or Amplitude cloud.
3. **Send failed.** The event is parked in SharedPreferences. On the next
   cold start or resume, the main isolate replays it with its original
   `event_id` and `event_timestamp`.

`suppressed_reason` comes from the in-repo `notification_state` plugin
(`apps/mobile/notification_state`). It is a real Flutter plugin, not a
MainActivity channel, because only pub plugins are registered in the
background engine.

## Known approximations

- **`dismissed`.** Android reports "denied" for both "Don't allow" and backing
  out. A first real denial flips `shouldShowRequestPermissionRationale`; a
  second comes back permanently denied. Any other not-granted result counts
  as `dismissed`. An answer faster than 400 ms means no dialog was shown, and
  no event fires.
- **`in_foreground`.** Foreground notifications are always shown as a heads-up
  today, so this value is not emitted yet.
- **`dnd`.** Any interruption filter stricter than "all" counts, even though a
  priority-only filter may still let some notifications through.
- **Force-stopped app.** Android does not deliver FCM messages to it, so no
  receipt can be recorded.

## Routing

Taps route only after the app has landed on Home with a logged-in user.
Earlier taps (the launching tap, logged-out taps) are parked and replayed from
the same Home milestone share links use (`deep_link_replay.dart`).

Navigation matches share links: Home is the base and the target is pushed on
top (`navigationStackFor`). Home is the only free target. For anything else:

- **Pro user:** Home, then the target.
- **Non-Pro user:** Home, then the paywall (`trigger_action` / `entry_source`
  / `trigger_module` = `notification`). Once the paywall closes (pop or
  `go('/home')`):
  - **Now Pro:** the target opens over Home.
  - **Still not Pro:** the user stays on Home, and the event reports `not_pro`.

This is stricter than the share-link replay, which opens the target
whatever the paywall outcome.
