# Analytics user-properties — backend contract this needs

**Companion to** `apps/mobile/lib/core/user_properties.dart`
(`UserPropertiesTracker`).

The mobile client owns identify-level user properties per the analytics
contract (Sheet 3, 22 properties). Some are client-observable (login
JWT, entitlement flips, first-time success flags); others are cross-
session or cross-device and MUST live on the server so the client can
mirror them without local drift.

The client currently emits every client-observable property immediately;
server-owned properties emit as `null` until the endpoints below land, at
which point the tracker's `applyServerSnapshot(...)` starts propagating
them onto the identify stream.

## Split

### Client-owned (already wired, no backend work)

| Property                  | Trigger                                    |
| ------------------------- | ------------------------------------------ |
| `user_id`                 | `Analytics.setUser` on JWT decode          |
| `selected_language`       | Orchestrator on `/users/me`, plus save     |
| `onboarding_completed`    | Orchestrator (derived from `/users/me`)    |
| `onboarding_completed_at` | Orchestrator (derived from `/users/me`)    |
| `subscription_status`     | `EntitlementNotifier.seed`                 |
| `subscription_plan_id`    | `EntitlementNotifier.seed`                 |
| `subscription_expires_at` | `EntitlementNotifier.seed`                 |
| `has_completed_audio`     | Feature commit — first successful complete |
| `has_shared_content`      | Feature commit — first successful share    |
| `has_set_ringtone`        | Feature commit — first successful set      |
| `has_set_wallpaper`       | Feature commit — first successful set      |

### Server-owned (needs API work)

The client will call `applyServerSnapshot(...)` with these on every
`/users/me` fetch and after each activity POST. Missing keys degrade
cleanly — the identify simply omits them.

| Property                   | Origin                                        |
| -------------------------- | --------------------------------------------- |
| `account_created_at`       | User record `createdAt`                       |
| `first_app_open_at`        | Server-observed on the FIRST call to endpoint |
| `last_app_open_at`         | Server-updated on every `session_start`       |
| `total_sessions`           | Server-incremented on every `session_start`   |
| `last_active_module`       | Server-updated on every `module_opened`       |
| `first_paid_at`            | User record `firstPaidAt`                     |
| `subscription_started_at`  | Subscription record `startedAt`               |
| `acquisition_source`       | Install-referrer at first user-record touch   |
| `acquisition_campaign`     | Install-referrer at first user-record touch   |
| `preferred_content_type`   | Warehouse-derived, written back periodically  |
| `preferred_deity_id`       | Warehouse-derived, written back periodically  |

## Endpoints

### 1. Extend `GET /users/me` (existing)

Add the following optional fields to the response's `user` object.
Client code (`UsersRepository._parseMeUser`) tolerates absent fields.

```json
{
  "user": {
    "id": "...",
    "name": "...",
    "selectedLanguage": "hi",
    "onboardingCompletedAt": "2026-01-01T00:00:00Z",
    "phoneCountryCode": "+91",
    "phoneNumber": "...",

    // NEW — analytics user-property mirrors
    "accountCreatedAt":       "2025-11-01T00:00:00Z",
    "firstAppOpenAt":         "2025-11-01T00:05:12Z",
    "lastAppOpenAt":          "2026-07-29T13:22:04Z",
    "totalSessions":          47,
    "lastActiveModule":       "aarti_bhajans",
    "firstPaidAt":            "2025-12-08T09:15:00Z",
    "subscriptionPlanId":     "plan_pro_monthly",
    "subscriptionStartedAt":  "2026-07-01T00:00:00Z",
    "subscriptionExpiresAt":  "2026-08-01T00:00:00Z",
    "acquisitionSource":      "organic_play_store",
    "acquisitionCampaign":    null,
    "preferredContentType":   "audio",
    "preferredDeityId":       "hanuman"
  }
}
```

Enum for `lastActiveModule` (matches `UserPropertyModule` on the client):
`aarti_bhajans` | `mantras_stutis` | `status_sharing` | `horoscope` |
`ringtone` | `wallpaper` | `home` | `profile` | `books`.

## Payment event fields — server-owned per-payment identifiers

The Frontend Payment Events (`trial_success`, `subscription_started`, `payment`,
etc.) emit these keys as `null` today. They are not user properties — they
belong on the individual payment event — but the transport is the same
`/users/me`-adjacent one, so this doc tracks them.

| Field              | Origin                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `payment_id`       | The provider-side payment identifier (Cashfree order / Decentro transaction). Server-owned; must flow back on the success-poll response so the client can stamp it on `payment(success)`. |
| `index`            | 1-indexed count of successful payments for this user (1 on the first, N on the Nth). Server-computed at write time; return on the same success-poll response.                              |
| `is_first_payment` | Trivially derivable from `index == 1`; either the server sends it or the client derives it if `index` is present.                                                                          |
| `billing_cycle`    | The plan's canonical cycle string (`monthly` \| `quarterly` \| `yearly`). Today the client maps from `planId` heuristically in `_billingCycleFromPlanId`; a plan-metadata endpoint (or a `billingCycle` field on the mandate/plan responses) would let the client drop the heuristic. |

Until the poll response carries these, the events fire with null and the
warehouse joins to the payments table on `mandate_id` for the missing
detail.

### 2. NEW `POST /users/me/activity`

Fired by the client on every session start and every module open. Server
does the increment/timestamp writes and returns the fresh values so the
client can mirror them into the next identify payload without a
round-trip.

```
POST /users/me/activity
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "event":  "session_start" | "module_opened",
  "module": "aarti_bhajans" | ...   // required when event=module_opened
}
```

Response mirrors the same field set the `/users/me` extension writes,
so the client can `applyServerSnapshot(...)` uniformly:

```json
{
  "success": true,
  "data": {
    "lastAppOpenAt":       "2026-07-30T09:30:00Z",
    "totalSessions":       48,
    "lastActiveModule":    "aarti_bhajans"
  }
}
```

## Client hooks that will start firing when this lands

| Client site                                       | Endpoint                                            |
| ------------------------------------------------- | --------------------------------------------------- |
| `main.dart` cold-start / app-resume               | `POST /users/me/activity { event: session_start }`  |
| Each `<module>_page_viewed` bloc (feature commit) | `POST /users/me/activity { event: module_opened }`  |
| Orchestrator's `/users/me` fetch                  | Read the new fields → `applyServerSnapshot`         |

The tracker itself is already wired; the only remaining work is the
transport layer (a repository method + call site) once these endpoints
exist.
