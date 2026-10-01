# Analytics — Phase-1 feature modules (canonical event catalog)

**This file is the source of truth for the 8 Phase-1 module event names.** It is
machine-read by `apps/mobile/tool/analytics_audit.dart` (run by
`pnpm verify:mobile`), which fails CI on drift in **both** directions:

| Drift | Audit verdict |
| ----- | ------------- |
| A catalog event has no constant in the code | FAIL — "no constant defined" |
| A catalog event has a constant but no real `trackEvent` call site | FAIL — "dead constant" |
| A module event fires (or is defined) but isn't in this catalog | FAIL — "not in the catalog" |

The second row is the bug class TAM-77 was written to kill: a named event that
*exists* but that no user action ever emits. Grep alone cannot see it — a name
defined in `*_analytics.dart` matches a grep while emitting nothing.

Adding an event = adding a row here **and** a call site. There is **no
allowlist**; scope is structural (see below). Owning ticket: TAM-77 (child of
TAM-56); module wiring lands in TAM-62/64/66/68/70/72/74/76.

## How to read the tables

Only rows inside the `<!-- analytics-catalog:begin … -->` / `…:end` fences are
catalog entries. Prose, the horoscope mapping table and the "dropped" tables sit
outside the fences and are ignored by the audit — so this document can name an
event without silently promoting it.

- **Trigger** — the exact user/system moment the event fires at.
- **Emitting site** — the file the dispatch lives in (`apps/mobile/lib/…`).
- **Props** — see "Properties" below: the PRDs specify properties for **Ringtone
  and Horoscope only**.

## Scope boundary — what this catalog does NOT cover

The catalog governs the 8 Phase-1 module prefixes: `home_`, `aarti_bhajans_`,
`mantras_`, `ringtone_`, `wallpaper_`, `status_`, `horoscope_`, `books_`/`book_`.

Onboarding and paywall events (`onboarding_*`, `paywall_*`, `legal_link_tapped`)
are **TAM-55's** catalog and live in `docs/ANALYTICS-ONBOARDING-PAYWALL.md`. They
are not skipped by exception — they simply belong to a different catalog, and the
audit's scope is defined by the prefix list above, not by an allowlist. This
matters for one Phase-1 gate: the shared paywall's CTA is
**`paywall_pay_now_tapped`**, not a per-module CTA event (see Ringtone below).

## Properties — an honest statement of the contract

**Only two PRDs specify event properties.** Recording invented property names as
though product had specified them would be a fabricated contract, so this catalog
does not do that:

- **Ringtone** (`rough_plan/prabhuji-ringtone-plan/prd.md` §9, "Suggested common
  event properties") and **Horoscope** (`prabhuji-horoscope-plan/prd.md` §9,
  "Analytics should include") name their properties. Those are recorded per-row.
- **Home, Aarti & Bhajans, Mantras, Wallpaper, Status, Books** — the PRD
  "Analytics" sections list **event NAMES ONLY**. For those modules **the event
  name is the whole PRD contract; properties are unspecified**. The
  implementation does attach contextual facts (`item_id`, `position_index`,
  `deity_id`, …), and those are stable in code, but they are *implementation
  choices, not a product contract* — product can specify them later without this
  catalog having lied. `*EventProps`/`*Props` classes in each module hold the
  canonical key spellings.

### Common attributes — do not re-implement per event

`AnalyticsEnricher` (TAM-55, `lib/core/analytics_enricher.dart`, wired in
`lib/main.dart`) merges these into **every** event; module dispatches must not
duplicate them.

| Property | Source |
| -------- | ------ |
| `user_id` | `SessionContext`, read live per event |
| `anonymous_id` | persisted per install (`SharedPreferences`) |
| `session_id` | minted per enricher |
| `app_version`, `build_number` | `PackageInfo`, resolved once at init |
| `platform`, `os_version`, `device_model` | `DeviceInfoPlugin`, resolved once |
| `device_locale` | `Platform.localeName` |
| `chat_type` | `ChatCounters`, read live; `'control'` fallback |
| `has_name`, `has_photo` | `StatusProfileFlagsStore`, read live; `false` fallback |

**`has_name` / `has_photo`** — whether the user has a display name and an avatar
saved on their `/status/profile` record. `DioStatusRepository` mirrors both into
the store on every profile fetch and save, so the enricher can read them
synchronously on surfaces that never fetch the profile at all. Persisted, so a
cold start reports the previous session's value rather than a false `false`;
cleared on logout alongside `Analytics.reset()`.

These two are the **only** name/photo-presence properties in the Status +
Profile surface. Do not add a per-event one. The four that previously did this
job — `name_present`, `avatar_present`, `existing_details_present` and
`has_existing_details` — were removed: they duplicated each other, and
`existing_details_present` was computed from the name alone, so a photo-only
user was reported as having no details. Onboarding's `name_present` survives
because it reports a **different record** (the account name on `PATCH
/users/me`, not the `/status/profile` display name).

> **Stale entries corrected (this revision).** The list here previously named
> `selected_language`, `subscription_status`, `entry_point`, `config_version`,
> `experiment_variant` and `network_status`. The first two moved to the identify
> stream ("we don't send user properties on each event"); the rest were never
> implemented. The table above is the actual return of `enrich()`.

### ⚠️ Deliberate deviation — `user_type` / free-Pro state (NEEDS PRODUCT SIGN-OFF)

The Ringtone PRD §9 asks for **`user_type: free or pro`** as a per-event property,
and the Horoscope PRD §9 asks for **"User access state: free or Pro"**. **Neither
is emitted as a per-event property.** Entitlement is carried as the
**`subscription_status`** user property instead (`UserPropertiesTracker`).

Rationale (`apps/mobile/CLAUDE.md`, Analytics scoping rule): *facts about the
**user** ride on the user, never in event properties* — "Never put
`player_id`/`plan`/`workspace_id` in event properties". Entitlement is user state,
not an action fact. Emitting it per event would fork the same fact across 161
events and let them disagree.

**The analytical question the PRDs asked ("was this user free or Pro when they did
this?") is answerable by joining events to the user snapshot** on `user_id`,
which every event carries. Flagged here because it is a deliberate deviation
from a written PRD line and product should sign it off (TAM-77 AC / "Business
Dependencies").

> **Correction (this revision).** This section previously said the enricher
> stamps `subscription_status` on every event, so `WHERE subscription_status =
> 'free'` would work directly. It does not: `subscription_status` was dropped
> from `enrich()` when per-event user properties were removed, and the tracker
> attaches `user_properties` only to identify payloads, never to tracked events
> (`custom_event_tracker/lib/amplitude.dart`). The question needs the join.
>
> One per-event exception exists and is deliberate: the share funnel's
> `is_pro_at_event` (see the Status section), which answers a question the join
> **cannot** — what the entitlement was at that instant, for a user who buys
> mid-flow.

### PII policy (identical to TAM-55 — non-negotiable)

Never emit `raw_phone_number`, `otp_value`, `raw_user_name`,
`sensitive_payment_details` in any module event. Premium/payment events carry only
`payment_provider`, `order_id`, sanitized `error_code`. `search_query` rides only
where the PRD allows it (Ringtone search) and never carries PII. Enforced by
`apps/mobile/test/analytics/no_pii_leak_test.dart`, which covers representative
module events (ringtone share, status details-saved, books paywall, horoscope
purchase) as well as the TAM-55 onboarding/paywall set.

Two module events deserve an explicit note:

- **`status_details_saved`** — the Status overlay *is* the user's own name /
  business name. It is deliberately **not** in the event: the event carries the
  profile *type* and *whether* fields were filled, never their values.
- **`ringtone_share_destination_selected`** — `share_destination` is the Android
  chooser's component name (`com.whatsapp/com.whatsapp.ContactPicker`). That's an
  app id, not a contact: no recipient identity ever leaves the sheet.

---

## Home (TAM-62) — 16 events

PRD: `rough_plan/prabhuji-home-plan/prd.md` §18. **Names only — properties
unspecified by the PRD.** Feed view = **2s dwell at ≥50% visible**, timed in the
bloc so a card scrolled away and back never re-counts.

<!-- analytics-catalog:begin module=home -->

| Event | Trigger | Emitting site (`apps/mobile/lib/`) |
| ----- | ------- | ---------------------------------- |
| `home_screen_viewed` | Home rendered | `features/home/feed/bloc/home_feed_bloc.dart` |
| `home_banner_viewed` | Banner slide settles in the carousel. Carries `banner_id`, **`media_type`** (`image` \| `video`), `destination_type`, `position_index` | `features/home/presentation/home_banner_carousel.dart` |
| `home_banner_clicked` | Banner tap. Carries the same four plus `destination_id`. ⚠️ The PRD called this `home_banner_tapped`; the contract renamed it and the code has emitted `_clicked` since | `features/home/presentation/home_banner_carousel.dart` |
| `home_profile_tapped` | Header avatar tap | `features/home/presentation/home_header.dart` |
| `home_help_tapped` | Header help tap | `features/home/presentation/home_header.dart` |
| `home_feature_card_tapped` | Shortcut-grid card tap → module | `features/home/presentation/home_shortcut_grid.dart` |
| `home_feed_item_impression` | First visible pixel of a feed card | `features/home/feed/bloc/home_feed_bloc.dart` |
| `home_feed_item_viewed` | 2s dwell at ≥50% visible (once per session per item) | `features/home/feed/bloc/home_feed_bloc.dart` |
| `home_feed_item_header_tapped` | Card header row tap → owning module | `features/home/presentation/home_feed_card.dart` |
| `home_feed_cta_tapped` | Card CTA tap | `features/home/presentation/home_feed_card.dart` |
| `home_feed_audio_autoplay_started` | Inline audio preview autoplays on view | `features/home/presentation/home_feed_card.dart` |
| `home_feed_audio_paused_on_scroll` | Audio preview pauses as the card scrolls out | `features/home/presentation/home_feed_card.dart` |
| `home_feed_like_tapped` | Like toggle on a feed card | `features/home/feed/bloc/home_feed_bloc.dart` |
| `home_feed_share_tapped` | Share tap on a feed card (before the OS sheet) | `features/home/presentation/home_feed_card.dart` |
| `home_feed_retry_tapped` | Retry after a feed load failure | `features/home/feed/bloc/home_feed_bloc.dart` |

<!-- analytics-catalog:end -->

**`media_type` on the banner pair.** A hero banner is CMS-authored as an image
or a short video (`HomeBanner.mediaType`), so both banner events carry the
media kind verbatim from the contract — `image` or `video`, never a derived or
client-invented value. It exists so the funnel can compare view→click rates
between the two banner kinds; an unknown wire value degrades to `image` on the
client, matching what the user actually saw (a still).

⚠️ **The rest of this table still carries the PRD's pre-contract names.**
`home_screen_viewed`/`home_profile_tapped`/`home_feature_card_tapped`/… were
renamed on the way into Sheet 1 (`home_page_viewed`, `profile_clicked`,
`home_widget_clicked`, …), and `home_paywall_triggered` plus the two
`home_feed_audio_*` rows were **dropped** from the contract entirely — the
Paywall module owns `paywall_viewed` now. `features/home/home_analytics.dart`
is the source of truth for what actually fires; only the two banner rows above
have been reconciled against it.

## Aarti & Bhajans (TAM-64) — 21 events

PRD: `rough_plan/prabhuji-aarti-bhajans-plan/prd.md` §9 (19 names). **Names only
— properties unspecified by the PRD.** Two rows marked ⊕ are deliberate
additions: the player ships 10s rewind/forward controls, and a skip is a real
engagement signal the PRD's name list predates.

<!-- analytics-catalog:begin module=aarti -->

| Event | Trigger | Emitting site (`apps/mobile/lib/`) |
| ----- | ------- | ---------------------------------- |
| `aarti_bhajans_opened` | Module entry | `features/aarti/main/bloc/aarti_main_bloc.dart` |
| `aarti_bhajans_section_show_all_tapped` | "Show all" on a home section | `features/aarti/main/presentation/aarti_main_screen.dart` |
| `aarti_bhajans_category_tapped` | Category chip tap | `features/aarti/main/presentation/aarti_main_screen.dart` |
| `aarti_bhajans_deity_tapped` | Deity chip tap | `features/aarti/main/presentation/aarti_main_screen.dart` |
| `aarti_bhajans_audio_item_tapped` | Audio row tap (the gate's intent moment) | `features/aarti/application/aarti_tap_handler.dart` |
| `aarti_bhajans_paywall_shown` | Free user's tap opens the unified paywall | `features/aarti/application/aarti_tap_handler.dart` |
| `aarti_bhajans_purchase_success_from_audio` | Entitlement flips after the paywall → original track opens | `features/aarti/application/aarti_tap_handler.dart` |
| `aarti_bhajans_player_opened` | Player screen opened | `features/aarti/player/bloc/aarti_player_bloc.dart` |
| `aarti_bhajans_play_started` | Playback starts | `features/aarti/player/bloc/aarti_player_bloc.dart` |
| `aarti_bhajans_play_paused` | Pause control | `features/aarti/player/presentation/aarti_player_screen.dart` |
| `aarti_bhajans_play_completed` | Track reaches the end | `features/aarti/player/bloc/aarti_player_bloc.dart` |
| `aarti_bhajans_next_tapped` | Next control | `features/aarti/player/bloc/aarti_player_bloc.dart` |
| `aarti_bhajans_previous_tapped` | Previous control | `features/aarti/player/bloc/aarti_player_bloc.dart` |
| `aarti_bhajans_seek_used` | Scrubber seek | `features/aarti/player/presentation/aarti_player_screen.dart` |
| `aarti_bhajans_rewind_10_tapped` | ⊕ 10s rewind control | `features/aarti/player/presentation/aarti_player_screen.dart` |
| `aarti_bhajans_forward_10_tapped` | ⊕ 10s forward control | `features/aarti/player/presentation/aarti_player_screen.dart` |
| `aarti_bhajans_like_toggled` | Like toggle | `features/aarti/player/bloc/aarti_player_bloc.dart` |
| `aarti_bhajans_share_tapped` | Share tap (deep link + thumbnail, never the media file) | `features/aarti/player/bloc/aarti_player_bloc.dart` |
| `aarti_bhajans_mini_player_shown` | Mini player appears | `features/aarti/presentation/aarti_mini_player_host.dart` |
| `aarti_bhajans_mini_player_tapped` | Mini player tap → full player | `features/aarti/application/aarti_navigation.dart` |
| `aarti_bhajans_audio_error` | Playback error | `features/aarti/player/bloc/aarti_player_bloc.dart` |

<!-- analytics-catalog:end -->

## Mantras & Stutis (TAM-66) — 21 events

PRD: `rough_plan/prabhuji-mantras-stutis-plan/prd.md` §9. **Names only —
properties unspecified by the PRD.**

<!-- analytics-catalog:begin module=mantras -->

| Event | Trigger | Emitting site (`apps/mobile/lib/`) |
| ----- | ------- | ---------------------------------- |
| `mantras_module_opened` | Module entry | `features/mantras/main/bloc/mantras_main_bloc.dart` |
| `mantras_section_show_all_tapped` | "Show all" on a home section | `features/mantras/main/presentation/mantras_main_screen.dart` |
| `mantras_listing_opened` | Listing screen opened | `features/mantras/listing/presentation/mantras_listing_screen.dart` |
| `mantras_item_tapped` | Mantra row tap (the gate's intent moment) | `features/mantras/application/mantras_tap_handler.dart` |
| `mantras_deity_tapped` | Deity chip tap | `features/mantras/application/mantras_tap_handler.dart` |
| `mantras_category_tapped` | Category chip tap | `features/mantras/application/mantras_tap_handler.dart` |
| `mantras_paywall_triggered` | Free user's tap opens the unified paywall | `features/mantras/application/mantras_tap_handler.dart` |
| `mantras_player_opened` | Player screen opened | `features/mantras/player/bloc/mantras_player_bloc.dart` |
| `mantras_audio_started` | Playback starts | `features/mantras/player/bloc/mantras_player_bloc.dart` |
| `mantras_audio_paused` | Pause control | `features/mantras/player/presentation/mantras_player_screen.dart` |
| `mantras_audio_completed_once` | One full repetition completes | `features/mantras/player/bloc/mantras_player_bloc.dart` |
| `mantras_repeat_target_selected` | User picks a repeat count (11/21/108…) | `features/mantras/player/bloc/mantras_player_bloc.dart` |
| `mantras_repeat_target_completed` | The selected repeat target is reached | `features/mantras/player/bloc/mantras_player_bloc.dart` |
| `mantras_playlist_opened` | Playlist sheet opened | `features/mantras/player/presentation/mantras_player_screen.dart` |
| `mantras_playlist_item_selected` | Track picked from the playlist | `features/mantras/player/bloc/mantras_player_bloc.dart` |
| `mantras_next_item_autoplayed` | Next track autoplays | `features/mantras/player/bloc/mantras_player_bloc.dart` |
| `mantras_like_toggled` | Like toggle | `features/mantras/player/bloc/mantras_player_bloc.dart` |
| `mantras_share_tapped` | Share tap | `features/mantras/player/bloc/mantras_player_bloc.dart` |
| `mantras_background_playback_started` | Playback continues with the app backgrounded | `features/mantras/player/presentation/mantras_player_screen.dart` |
| `mantras_mini_player_tapped` | Mini player tap → full player | `features/mantras/application/mantras_navigation.dart` |
| `mantras_audio_error` | Playback error | `features/mantras/player/bloc/mantras_player_bloc.dart` |

<!-- analytics-catalog:end -->

## Ringtone (TAM-68) — 32 events

PRD: `rough_plan/prabhuji-ringtone-plan/prd.md` §9 (34 names — **2 dropped, see
below**). This is one of two modules whose PRD specifies properties (§9 lines
391–405): `entry_source`, `source_screen`, `ringtone_id`, `ringtone_title`,
`deity_id`, `deity_name`, `position_index`, `search_query` (*"where privacy policy
allows"*), `result_count`, `subscription_plan_id`, `paywall_type`,
`audio_duration_seconds`, `playback_position_seconds`, `auto_play`, `set_target`,
`permission_status_before_tap`, `share_destination`. (`user_type` → see the
deviation note above.)

Play-count rule: `ringtone_play_counted` fires once per preview session at
**min(25% of duration, 3s)**.

<!-- analytics-catalog:begin module=ringtone -->

| Event | Trigger | Emitting site (`apps/mobile/lib/`) | PRD props |
| ----- | ------- | ---------------------------------- | --------- |
| `ringtone_module_opened` | Module entry | `features/ringtone/home/presentation/ringtone_home_screen.dart` | `entry_source` |
| `ringtone_deity_filter_selected` | Deity chip tap | `features/ringtone/home/bloc/ringtone_home_bloc.dart` | `deity_id`, `deity_name` |
| `ringtone_search_submitted` | Search submitted | `features/ringtone/home/presentation/ringtone_home_screen.dart` | `search_query` |
| `ringtone_search_results_viewed` | Results render (≥1 hit) | `features/ringtone/search/bloc/ringtone_search_bloc.dart` | `search_query`, `result_count` |
| `ringtone_no_search_results_viewed` | Search returns 0 hits | `features/ringtone/search/bloc/ringtone_search_bloc.dart` | `search_query` |
| `ringtone_card_tapped` | Card tap — the intent moment, fires for free AND Pro | `features/ringtone/application/ringtone_tap_handler.dart` | `ringtone_id`, `ringtone_title`, `deity_id`, `position_index`, `source_screen` |
| `ringtone_paywall_opened` | Free user's card tap opens the unified paywall | `features/ringtone/application/ringtone_tap_handler.dart` | `ringtone_id`, `source_screen`, `paywall_type` |
| `ringtone_subscription_success` | Entitlement flips after the paywall → original preview auto-opens. **Cannot fire in Phase 1** (see below) | `features/ringtone/application/ringtone_tap_handler.dart` | `ringtone_id`, `source_screen`, `entry_source` |
| `ringtone_subscription_cancelled` | Paywall closed and entitlement is still free = the user backed out | `features/ringtone/application/ringtone_tap_handler.dart` | `ringtone_id`, `source_screen`, `paywall_type` |
| `ringtone_preview_opened` | Preview screen opened | `features/ringtone/preview/bloc/ringtone_preview_bloc.dart` | `ringtone_id`, `entry_source`, `auto_play` |
| `ringtone_play_started` | Playback starts | `features/ringtone/preview/bloc/ringtone_preview_bloc.dart` | `ringtone_id`, `auto_play` |
| `ringtone_play_counted` | min(25%, 3s) reached — once per session | `features/ringtone/preview/bloc/ringtone_preview_bloc.dart` | `ringtone_id`, `playback_position_seconds` |
| `ringtone_play_paused` | Pause control | `features/ringtone/preview/presentation/ringtone_preview_screen.dart` | `ringtone_id`, `playback_position_seconds` |
| `ringtone_play_completed` | Track reaches the end | `features/ringtone/preview/bloc/ringtone_preview_bloc.dart` | `ringtone_id`, `audio_duration_seconds` |
| `ringtone_audio_error` | Playback error | `features/ringtone/preview/bloc/ringtone_preview_bloc.dart` | `ringtone_id`, `error_code` |
| `ringtone_like_tapped` | Like added | `features/ringtone/preview/bloc/ringtone_preview_bloc.dart` | `ringtone_id` |
| `ringtone_like_removed` | Like removed | `features/ringtone/preview/bloc/ringtone_preview_bloc.dart` | `ringtone_id` |
| `ringtone_share_tapped` | Share tap (audio pauses first) | `features/ringtone/preview/bloc/ringtone_preview_bloc.dart` | `ringtone_id`, `share_payload_type` |
| `ringtone_share_sheet_opened` | OS sheet invoked | `features/ringtone/preview/bloc/ringtone_preview_bloc.dart` | `ringtone_id` |
| `ringtone_share_destination_selected` | Chooser returns the picked target. **Best-effort (OS callback)** — Android only; silent when the platform doesn't name the target | `features/ringtone/preview/bloc/ringtone_preview_bloc.dart` | `ringtone_id`, `share_destination` |
| `ringtone_share_completed` | Share returns without error. **Best-effort (OS callback)** | `features/ringtone/preview/bloc/ringtone_preview_bloc.dart` | `ringtone_id` |
| `ringtone_share_failed` | Share sheet threw | `features/ringtone/preview/bloc/ringtone_preview_bloc.dart` | `ringtone_id`, `error_code` |
| `ringtone_set_tapped` | Set Ringtone tap | `features/ringtone/preview/bloc/set_ringtone_bloc.dart` | `ringtone_id`, `set_target`, `permission_status_before_tap` |
| `ringtone_permission_required` | WRITE_SETTINGS missing at set time | `features/ringtone/preview/bloc/set_ringtone_bloc.dart` | `ringtone_id` |
| `ringtone_permission_settings_opened` | User sent to system settings | `features/ringtone/preview/bloc/set_ringtone_bloc.dart` | `ringtone_id` |
| `ringtone_permission_enabled` | Returned from settings WITH permission | `features/ringtone/preview/bloc/set_ringtone_bloc.dart` | `ringtone_id` |
| `ringtone_permission_denied` | Returned from settings WITHOUT permission | `features/ringtone/preview/bloc/set_ringtone_bloc.dart` | `ringtone_id` |
| `ringtone_set_success` | Native set succeeded. **Best-effort (OS callback)** | `features/ringtone/preview/bloc/set_ringtone_bloc.dart` | `ringtone_id`, `set_target` |
| `ringtone_set_failed` | Native set failed | `features/ringtone/preview/bloc/set_ringtone_bloc.dart` | `ringtone_id`, `error_code` |
| `ringtone_cms_load_failed` | List/CMS load failed | `features/ringtone/home/bloc/ringtone_home_bloc.dart` | `error_code` |
| `ringtone_retry_tapped` | Retry after a CMS error | `features/ringtone/home/bloc/ringtone_home_bloc.dart` | — |
| `ringtone_empty_state_viewed` | CMS returned no ringtones | `features/ringtone/home/bloc/ringtone_home_bloc.dart` | `deity_id` |

<!-- analytics-catalog:end -->

### Ringtone — dropped from the catalog (2 of the PRD's 34)

Outside the fences on purpose: these are **not** catalog events, so the audit
does not require them and no dead constant is left behind.

| PRD event | Decision | Why |
| --------- | -------- | --- |
| `ringtone_subscription_failed` | **Dropped — deferred until real payment lands** | Unsatisfiable in Phase 1. Payment is the TAM-53 placeholder: `features/paywall/bloc/payment_placeholder_bloc.dart` emits `paywall_payment_deferred` with `payment_provider: 'none'` — there is no payment attempt, therefore no failure signal to listen to. A constant with no reachable call site is exactly the dead-constant defect this ticket exists to remove. **Restore this row when a real provider ships.** |
| `ringtone_paywall_cta_tapped` | **Dropped — covered by an existing event** | The CTA is not ringtone-owned: it lives in the SHARED paywall, which emits the generic **`paywall_pay_now_tapped`** (TAM-55 scope). The enricher already stamps `entry_point`, so `paywall_pay_now_tapped` + `entry_point` answers "who tapped Pay Now from Ringtone?" exactly. A ringtone-specific twin would double-count one tap. |

**Also note — `ringtone_subscription_success` is wired but cannot fire in Phase 1.**
Same root cause: the placeholder paywall never grants entitlement, so the
post-purchase continuation branch is unreachable in practice. The wiring is
*correct for the day payment ships* and is kept deliberately (it has a real call
site, so the audit is satisfied and it is not a dead constant). The same applies
to the sibling continuation events in other modules
(`aarti_bhajans_purchase_success_from_audio`, `wallpaper_paywall_purchase_success`,
`horoscope_purchase_success`, `books_paywall_*`).

## Wallpaper (TAM-70) — 17 events

PRD: `rough_plan/prabhuji-wallpaper-plan/prd.md` §9 (16 names). **Names only —
properties unspecified by the PRD.** Row marked ⊕ is a deliberate addition. Row
impressions dedup in the bloc per load (a filter change re-counts against the new
result set).

<!-- analytics-catalog:begin module=wallpaper -->

| Event | Trigger | Emitting site (`apps/mobile/lib/`) |
| ----- | ------- | ---------------------------------- |
| `wallpaper_home_opened` | Module entry | `features/wallpaper/home/bloc/wallpaper_home_bloc.dart` |
| `wallpaper_deity_filter_tapped` | Deity chip tap (filters in place) | `features/wallpaper/home/bloc/wallpaper_home_bloc.dart` |
| `wallpaper_home_row_viewed` | CMS row ≥50% visible — once per load | `features/wallpaper/home/bloc/wallpaper_home_bloc.dart` |
| `wallpaper_home_row_item_tapped` | Card tap in a home row | `features/wallpaper/home/presentation/wallpaper_home_screen.dart` |
| `wallpaper_listing_opened` | Listing screen opened | `features/wallpaper/listing/bloc/wallpaper_list_bloc.dart` |
| `wallpaper_grid_item_tapped` | Card tap in the listing grid | `features/wallpaper/listing/presentation/wallpaper_listing_screen.dart` |
| `wallpaper_preview_opened` | Preview opened (FREE — no gate) | `features/wallpaper/preview/bloc/wallpaper_preview_bloc.dart` |
| `wallpaper_preview_swiped` | Swipe between previews | `features/wallpaper/preview/bloc/wallpaper_preview_bloc.dart` |
| `wallpaper_live_preview_played` | ⊕ Live/animated wallpaper preview plays | `features/wallpaper/preview/presentation/wallpaper_preview_screen.dart` |
| `wallpaper_like_toggled` | Like toggle | `features/wallpaper/preview/bloc/wallpaper_preview_bloc.dart` |
| `wallpaper_share_tapped` | Share tap | `features/wallpaper/preview/bloc/wallpaper_preview_bloc.dart` |
| `wallpaper_set_tapped` | Set Wallpaper tap — the ONLY Pro gate | `features/wallpaper/preview/bloc/set_wallpaper_bloc.dart` |
| `wallpaper_paywall_shown` | Free user's Set tap opens the unified paywall | `features/wallpaper/preview/bloc/set_wallpaper_bloc.dart` |
| `wallpaper_paywall_purchase_success` | Entitlement flips → the set continues | `features/wallpaper/preview/bloc/set_wallpaper_bloc.dart` |
| `wallpaper_set_success` | Native set succeeded. **Best-effort (OS callback)** | `features/wallpaper/preview/bloc/set_wallpaper_bloc.dart` |
| `wallpaper_set_failed` | Native set failed | `features/wallpaper/preview/bloc/set_wallpaper_bloc.dart` |
| `wallpaper_unsupported_device_action_shown` | Device can't honour the requested target | `features/wallpaper/preview/bloc/set_wallpaper_bloc.dart` |

<!-- analytics-catalog:end -->

## Status (TAM-72) — 17 events

PRD: `rough_plan/prabhuji-status-sharing-plan/prd.md` §9 (15 names). **Names only
— properties unspecified by the PRD.** Rows marked ⊕ are deliberate additions.
Card view = **2s dwell**, timed in the feed bloc. Share is the module's only Pro
gate — the paywall opens BEFORE any render.

<!-- analytics-catalog:begin module=status -->

> **Refreshed with the share-funnel work.** This table had drifted to the
> pre-consolidation names (`status_share_tapped`, `status_export_render_*`,
> `status_native_share_sheet_opened`, `status_share_completed`, …) which no
> call site has emitted since the contract rollout folded them into
> `status_export_result` / `status_share_result`. The rows below are the
> events the code actually fires today.

| Event | Trigger | Emitting site (`apps/mobile/lib/`) |
| ----- | ------- | ---------------------------------- |
| `status_page_viewed` | Module entry | `features/status/feed/bloc/status_feed_bloc.dart` |
| `status_edit_details_clicked` | Edit Details pill | `features/status/feed/presentation/status_home_screen.dart` |
| `status_add_details_strip_clicked` | Empty-state overlay strip tap (TAM-168) | `features/status/feed/presentation/status_home_screen.dart`, `features/home/presentation/home_feed_card.dart` |
| `status_deity_selected` | Deity chip tap | `features/status/feed/bloc/status_feed_bloc.dart` |
| `status_viewed` | 2s dwell on the active card | `features/status/feed/bloc/status_feed_bloc.dart` |
| `status_like_changed` | Like toggle | `features/status/feed/bloc/status_feed_bloc.dart` |
| `status_share_cta_clicked` | ⊕ **Share CTA tap** — fires immediately, before the profile read, the installed-apps probe and the Pro gate | `features/status/feed/presentation/status_home_screen.dart`, `features/home/presentation/home_feed_card.dart` |
| `status_share_sheet_viewed` | ⊕ Story-share sheet up **and** its installed-apps probe resolved (not first paint) | `features/status/share/presentation/status_story_share_sheet.dart` |
| `status_share_clicked` | Destination tile picked in the sheet — the **third** funnel step despite the name | `features/status/share/bloc/status_share_bloc.dart` |
| `status_export_started` | Overlay composite render begins (past the Pro gate) | `features/status/share/bloc/status_share_bloc.dart` |
| `status_export_result` | Render terminated — `result` = success/failure, `error_code` = `render_failed` \| `render_unsupported` | `features/status/share/bloc/status_share_bloc.dart` |
| `status_share_result` | Share sheet / story intent returned. Success on no-throw; `error_code` = `share_threw` \| `story_launch_failed` | `features/status/share/bloc/status_share_bloc.dart` |
| `status_personal_details_page_viewed` | Details editor rendered | `features/status/details/bloc/status_profile_bloc.dart` |
| `status_personal_name_added` | First empty→non-empty name transition (bucketed length, never the raw name) | `features/status/details/bloc/status_profile_bloc.dart` |
| `status_profile_image_result` | Avatar picker returned (picked/cancelled/unavailable) | `features/status/details/bloc/status_profile_bloc.dart` |
| `status_personal_details_save_result` | Details saved. **No name/business VALUES** — presence rides on the global `has_name`/`has_photo` | `features/status/details/bloc/status_profile_bloc.dart` |

⊕ = added by the share-funnel work. The share chain is a six-step funnel
joined by `share_session_id`, minted at the CTA tap:

    status_share_cta_clicked → status_share_sheet_viewed → status_share_clicked
      → status_export_started → status_export_result → status_share_result

Read the first and third rows together: `status_share_cta_clicked` is the
Share **button**, `status_share_clicked` is the destination **tile** inside our
own sheet. The older event kept its name so existing dashboards survive.

All six carry `is_pro_at_event` (read live — a user who buys at the paywall
shows `false` on the first three and `true` after).

`has_name` / `has_photo` — the two halves of the overlay gate, and the only
record of whether the user had details once TAM-168 stopped bouncing empty
profiles to the editor — are **global properties**, not share-funnel ones.
`AnalyticsEnricher` stamps both on EVERY event in the app, sourced from
`StatusProfileFlagsStore` (which `DioStatusRepository` mirrors on every
`/status/profile` fetch and save). See "Global properties" below.

`status_export_started` additionally carries `overlay_used`. It equals
`has_name || has_photo` today, but it reports what the RENDERER did rather than
what the profile held, so it is kept deliberately rather than derived.

<!-- analytics-catalog:end -->

## Horoscope (TAM-74) — 16 events

PRD: `rough_plan/prabhuji-horoscope-plan/prd.md` §9 (15 phrases). The PRD lists
**descriptive English phrases**, not names; TAM-77 froze the `horoscope_*`
snake_case names — the mapping is below and is **normative**. Row marked ⊕ is a
deliberate addition.

The PRD specifies properties: zodiac sign (`zodiac_sign`), date (`date_ist`), app
language (`app_language`), step id + order (`step_id`, `order`) on result-section
events, TTS-muted flag (`tts_muted`), video-fallback flag
(`video_fallback_used`). (Access state free/Pro → see the deviation note above.)

### PRD phrase → canonical name (normative)

| PRD phrase | Canonical name |
| ---------- | -------------- |
| Horoscope tab opened | `horoscope_tab_opened` |
| Zodiac sign tapped | `horoscope_zodiac_tapped` |
| Paywall shown from zodiac tap | `horoscope_paywall_shown` |
| Purchase success returned to horoscope result | `horoscope_purchase_success` |
| Result loaded | `horoscope_result_loaded` |
| Result section viewed | `horoscope_result_section_viewed` |
| TTS started | `horoscope_tts_started` |
| TTS muted | `horoscope_tts_muted` |
| TTS unmuted | `horoscope_tts_unmuted` |
| Next tapped | `horoscope_next_tapped` |
| Auto-advance occurred after TTS finish | `horoscope_auto_advance` |
| Finish tapped | `horoscope_finish_tapped` |
| Retry tapped | `horoscope_retry_tapped` |
| Error shown | `horoscope_error_shown` |
| Video fallback used | `horoscope_video_fallback_used` |

<!-- analytics-catalog:begin module=horoscope -->

| Event | Trigger | Emitting site (`apps/mobile/lib/`) | PRD props |
| ----- | ------- | ---------------------------------- | --------- |
| `horoscope_tab_opened` | Module entry | `features/horoscope/main/bloc/horoscope_main_bloc.dart` | `date_ist`, `app_language` |
| `horoscope_zodiac_tapped` | Zodiac tile tap (the gate's intent moment) | `features/horoscope/application/horoscope_tap_handler.dart` | `zodiac_sign`, `date_ist` |
| `horoscope_paywall_shown` | Free user's zodiac tap opens the unified paywall | `features/horoscope/application/horoscope_tap_handler.dart` | `zodiac_sign` |
| `horoscope_purchase_success` | Entitlement flips → the ORIGINAL sign's result opens | `features/horoscope/application/horoscope_tap_handler.dart` | `zodiac_sign` |
| `horoscope_result_loaded` | Result payload rendered | `features/horoscope/result/bloc/horoscope_result_bloc.dart` | `zodiac_sign`, `date_ist`, `step_count`, `locale_served` |
| `horoscope_result_section_viewed` | A result step becomes the active section | `features/horoscope/result/bloc/horoscope_result_bloc.dart` | `step_id`, `order`, `tts_muted`, `video_fallback_used` |
| `horoscope_tts_started` | Narration starts for a step | `features/horoscope/result/bloc/horoscope_result_bloc.dart` | `step_id`, `locale_served` |
| `horoscope_tts_muted` | Mute toggled on | `features/horoscope/result/bloc/horoscope_result_bloc.dart` | `step_id` |
| `horoscope_tts_unmuted` | Mute toggled off | `features/horoscope/result/bloc/horoscope_result_bloc.dart` | `step_id` |
| `horoscope_tts_unavailable` | ⊕ Served locale has no system voice — text still renders, narration skipped (PRD §7 engineering-visibility log) | `features/horoscope/result/bloc/horoscope_result_bloc.dart` | `locale_served` |
| `horoscope_next_tapped` | Next control | `features/horoscope/result/bloc/horoscope_result_bloc.dart` | `step_id`, `order` |
| `horoscope_auto_advance` | Step advances by itself after TTS finishes | `features/horoscope/result/bloc/horoscope_result_bloc.dart` | `step_id`, `order` |
| `horoscope_finish_tapped` | Finish on the last step | `features/horoscope/result/bloc/horoscope_result_bloc.dart` | `step_count` |
| `horoscope_video_fallback_used` | Step video unavailable → fallback visual | `features/horoscope/result/bloc/horoscope_result_bloc.dart` | `step_id`, `video_fallback_used` |
| `horoscope_retry_tapped` | Retry after an error | `features/horoscope/main/bloc/horoscope_main_bloc.dart` | — |
| `horoscope_error_shown` | Error state rendered | `features/horoscope/main/bloc/horoscope_main_bloc.dart` | `error_kind` |

<!-- analytics-catalog:end -->

## Books & Scriptures (TAM-76) — 21 events

PRD: `rough_plan/prabhuji-books-plan/prd.md` §13. **Names only — properties
unspecified by the PRD.** Note the PRD's deliberate prefix split: discovery/gate
events are `books_*` (the module), per-book events are `book_*` (one book).

<!-- analytics-catalog:begin module=books -->

| Event | Trigger | Emitting site (`apps/mobile/lib/`) |
| ----- | ------- | ---------------------------------- |
| `books_tab_opened` | Module entry | `features/books/home/bloc/books_home_bloc.dart` |
| `books_home_viewed` | Books home rendered | `features/books/home/bloc/books_home_bloc.dart` |
| `books_show_all_tapped` | "Show all" on a home section | `features/books/application/books_navigation.dart` |
| `books_all_listing_viewed` | All-books listing rendered | `features/books/listing/bloc/books_listing_bloc.dart` |
| `books_category_tapped` | Category tap | `features/books/application/books_navigation.dart` |
| `books_category_viewed` | Category listing rendered | `features/books/listing/bloc/books_listing_bloc.dart` |
| `book_card_tapped` | Book card tap (the gate's intent moment) | `features/books/application/books_tap_handler.dart` |
| `books_paywall_triggered` | Free user's book tap opens the unified paywall | `features/books/application/books_tap_handler.dart` |
| `books_paywall_viewed` | Paywall rendered from a books entry point | `features/books/application/books_tap_handler.dart` |
| `book_contents_viewed` | Table of contents rendered (Pro) | `features/books/contents/bloc/book_contents_bloc.dart` |
| `book_start_reading_tapped` | Start Reading CTA | `features/books/contents/presentation/book_contents_screen.dart` |
| `book_reader_opened` | Reader opened | `features/books/reader/bloc/book_reader_bloc.dart` |
| `book_audio_listen_tapped` | Listen (audio) control in the reader | `features/books/reader/bloc/book_reader_bloc.dart` |
| `book_chapter_drawer_opened` | Chapter drawer opened | `features/books/reader/bloc/book_reader_bloc.dart` |
| `book_chapter_selected` | Chapter picked from the drawer | `features/books/reader/bloc/book_reader_bloc.dart` |
| `book_font_settings_opened` | Font settings opened | `features/books/reader/bloc/book_reader_bloc.dart` |
| `book_font_size_changed` | Font size changed | `features/books/reader/bloc/book_reader_bloc.dart` |
| `book_previous_tapped` | Previous page/chapter | `features/books/reader/bloc/book_reader_bloc.dart` |
| `book_next_tapped` | Next page/chapter | `features/books/reader/bloc/book_reader_bloc.dart` |
| `books_offline_cache_hit` | Chapter served from the offline cache | `features/books/reader/bloc/book_reader_bloc.dart` |
| `books_offline_cache_miss` | Chapter not cached → network fetch | `features/books/reader/bloc/book_reader_bloc.dart` |

<!-- analytics-catalog:end -->

---

## Totals

| Module | PRD names | Catalog | Delta |
| ------ | --------- | ------- | ----- |
| Home | 16 | 16 | — |
| Aarti & Bhajans | 19 | 21 | +2 ⊕ rewind/forward |
| Mantras & Stutis | 21 | 21 | — |
| Ringtone | 34 | 32 | −2 dropped (see above) |
| Wallpaper | 16 | 17 | +1 ⊕ live preview |
| Status | 15 | 17 | +2 ⊕ login wall, share completed |
| Horoscope | 15 | 16 | +1 ⊕ TTS unavailable |
| Books & Scriptures | 21 | 21 | — |
| **Total** | **157** | **161** | **157 − 2 + 6** |

The 6 ⊕ rows are events the modules implemented beyond their PRD name list
because the UI they shipped has the control (10s skip, live-wallpaper preview,
login wall) or because the funnel is unreadable without them (share completed,
TTS unavailable). They are absorbed into the catalog rather than deleted: each has
a real call site and product value.

## Running the audit

```bash
scripts/analytics-audit.sh        # repo root — also runs inside pnpm verify:mobile
cd apps/mobile && dart run tool/analytics_audit.dart --verbose   # per-event detail
```
