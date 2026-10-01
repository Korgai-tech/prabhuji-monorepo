# Analytics contract rollout — progress tracker

**Source of truth for the events:** Google Sheet "Prabhuji_ Analytics events_
Main Sheet" with 3 tabs:
- **Sheet 1 (User Flow Events)** — 150 events across 11 modules.
- **Sheet 2 (Common Properties)** — 14 properties on every event.
- **Sheet 3 (User Properties)** — 22 identify-stream properties.

Locally checked-in copies at the root of the repo (three `Prabhuji_
Analytics events_Main Sheet - *.csv` files).

## Scope decisions (locked)

1. **Wholesale replacement**, not merge — old events retire, new events land.
2. **Every event fully wired** (not just defined). If the wiring requires
   refactoring (extending an audio port, hooking a lifecycle observer,
   plumbing a share outcome), that's part of the commit.
3. **Books analytics deleted entirely** — Sheet 1 has zero Books events.
   Books UI remains, just stops emitting.
4. **Orphan call sites deleted** — call sites for events not on the sheet
   are removed, not renamed or preserved.
5. **`user_id` stays on every event** as a common property (Amplitude also
   binds it via `setUser`, so it's redundant but keeps warehouse queries
   simple). Every other Sheet-3 user field flows via the identify stream,
   NOT in event properties.
6. **`entry_source`** is per-call (flow-entry events only), NOT a common
   property.
7. **Server-tracked user properties** (`total_sessions`,
   `last_active_module`, etc.) need backend endpoints described in
   `docs/ANALYTICS-USER-PROPERTIES-BACKEND.md`; client emits null for these
   until those land.

## Commit shape (repeated per feature)

1. Rewrite `<feature>_analytics.dart` from Sheet 1 rows for that module.
2. Batch-rename old constants → new via `perl -pi -e`.
3. Delete orphan call sites (events removed from the contract).
4. Wire NEW events at the trigger point from Sheet 1's "When Event Fires"
   column — including whatever refactor that requires.
5. Update tests (rename or drop obsolete assertions).
6. `flutter analyze` clean, `flutter test test/<feature>/` green.

## Progress

Legend: ✅ done · ⏳ in progress · ⏸️ paused · 🔲 not started

### Setup phase (infrastructure — no per-feature work)

| # | Task | Status |
|---|---|---|
| 1 | Sheet 2 — extend `AnalyticsEnricher` (`event_id`/`event_timestamp`/`device_model`/`os_version`; rename `entry_point → entry_source`; drop `config_version`/`experiment_variant`; add `device_info_plus`) | ✅ |
| 2 | Sheet 3 — new `UserPropertiesTracker` (`lib/core/user_properties.dart`), lifecycle hooks at 3 sites, backend spec doc | ✅ |
| 3 | Delete Books analytics — remove `books_analytics.dart` + 7 lib files + 5 test files, 101/101 Books tests pass | ✅ |
| — | Enricher trim (drop `selected_language`/`subscription_status`/`entry_source` from event props; keep `user_id`) | ✅ |

### Per-feature Sheet-1 rewrite (fully wired)

| # | Feature | Events | Status | Notes |
|---|---|---|---|---|
| 4 | Aarti & Bhajans | 23 (rows 41–63) | ✅ | All 23 fire. Added `currentPosition`/`isPlaying` to `AartiPlayerAudioPort` for `playerClosed`/`audioAppStateChanged`; `WidgetsBindingObserver` on player screen for lifecycle events; ShareOutcome capture for `audioShareResult`. 37/37 aarti tests pass. |
| 5 | Home | 14 (rows 27–40) | ✅ | All 14 fire. Tail (4 events) landed: `home_content_share_result` captures `ShareOutcome` from `ShareService.share` in `home_feed_card._share` (Aarti pattern reused); `listen_to_more_clicked` fires from `homeHandleCtaTap` for audio content with content_id/destination_module/position_index (index threaded through the card → hero → mini-player call chain); `bottom_navigation_clicked` wired in shell's `_BottomNav` tap closure (3-tab shell, `destination_screen` resolved locally); depth-tracker 10/25/50/100 checkpoints verified via extended test seeding 105 items. 111/111 home tests pass. |
| 6 | Horoscope | 11 (rows 102–112) | ✅ | All 11 fire. Added result-load `Stopwatch` for `load_time_ms`; session `Stopwatch` + `_ttsUsed` + one-shot completion latch for `horoscope_completed`; `_retryCount` state for `horoscope_result_failed`; new `HoroscopeBackTapped` event dispatched from the result-screen back arrow; collapsed old mute/unmute orphans into single `horoscope_audio_clicked` (`action=mute_or_unmute`); video-init failure maps to `horoscope_result_failed(failure_stage=render)`. Tap handler slimmed to just `horoscope_sign_selected` (paywall funnel belongs to Paywall module rows 17–26). 69/69 horoscope tests pass. |
| 7 | Mantras & Stutis | 22 (rows 64–85) | ✅ | All 22 fire. Extended `MantrasPlayerAudioPort` with `currentPosition`/`isPlaying` getters; scoped `WidgetsBindingObserver` on `MantrasPlayerScreen` dispatches `MantrasPlayerAppStateChanged` for row 84. ShareOutcome capture for row 75. Counter journey (rows 76/77/80) wired in the sheet host; row 83 fires from the next-card play button. Row 79's `total_listen_seconds` rolls up from the repeat loop. `previous_screen` + `entry_source` now optional on `MantrasMainLoadRequested`. Orphans (`paywallTriggered`, `categoryTapped`, `nextItemAutoplayed`, `backgroundPlaybackStarted`, `miniPlayerTapped`, generic `sectionShowAllTapped`) deleted. 42/42 mantras tests pass. |
| 8 | Ringtone | 14 (rows 113–126) | ✅ | All 14 fire. Set-result tri-state fires from `SetRingtoneBloc` terminal states (`_performSet` → success / `_emitFailed` → failure / deny branch → permission_denied), each stamped with `device_model` + `android_version` via `device_info_plus` (process-cached). Permission-result fires from `_onResumed` re-check as tri-state (granted vs not_granted). `ringtone_selected` fires on every tap with `selection_source` (`listing` vs `search`) propagated through `RingtoneTapHandler`. `ringtone_share_result` uses Aarti ShareOutcome shape. Like collapsed to single `ringtone_like_changed(action: like|unlike)`. Home-feed direct-Set path inherits the tri-state via shared `SetRingtoneBloc`. 29 orphan constants deleted; search bloc no longer emits analytics (no Sheet-1 rows). 46/46 ringtone tests pass. |
| 9 | Status Sharing | 16 (rows 86–101) | ✅ | All 16 fire. Wired 4 new profile-bloc events (`personal_details_page_viewed` / `business_details_page_viewed`, once-per-lifetime `personal_name_added` on empty→non-empty with `name_length_bucket`, once-per-lifetime `business_details_completed`) plus save-result events with `*_present` booleans, no raw PII (new `statusNameLengthBucket` helper). Consolidated `export_render_succeeded`+`export_render_failed` → single `status_export_result`; `native_share_sheet_opened`+`share_completed` → single `status_share_result` (Aarti ShareOutcome-shape: success on no-throw; failure with `share_threw`/`story_launch_failed` codes; `destination_app` = Android package or null). Feed events enriched (`entry_source` on `StatusFeedStarted`; `deity_name`+`position_index` on `StatusFeedDeitySelected`). Orphans dropped: `login_required_shown` (router call site removed, redirect preserved), `next_tapped`, `paywall_shown` (Paywall module row 17 owns). 113/122 status tests pass; the 9 fails are PRE-EXISTING widget-layout issues (`_ShareCta` RenderFlex overflow, overlay band-geometry, cross-check) — verified via git-diff to be untouched by this commit. |
| 10 | Wallpaper | 14 (rows 127–140) | ✅ | All 14 fire. Swipe emits `from_wallpaper_id`/`to_wallpaper_id`/`direction` from index delta in `WallpaperPreviewBloc`; back-tap reads `playback_time_seconds` via new `WallpaperVideoPort.currentPosition` getter + a screen-registered position callback (static pages report 0); `share_result` captures ShareOutcome (Aarti pattern); `set_wallpaper_result` fires on all four `SetWallpaperBloc` terminal states (success/failure/unsupported/cancelled); `set_wallpaper_clicked`/`set_lockscreen_clicked` split at the footer tap site; `wallpaper_selected` carries `selection_source` (home-row vs listing-grid). Row-view event enriched with `row_name`/`position_index`/`item_count` on `WallpaperHomeRowViewed`. Paywall + listing-open events dropped as orphans (Paywall module owns; no Sheet-1 listing row). 46/46 wallpaper tests pass. |
| 11 | Onboarding + App Launch | 16 (rows 1–3, 4–16) | ✅ | All 16 fire. Created `onboarding_analytics.dart`; hoisted 16 inline literals across 6 onboarding files + `main.dart`. `attempt_number` state on `OtpBloc` via `attemptCount + PhoneOtpBloc.nextRequestAttempt()`, `response_time_ms` via stopwatches on send + verify, `launch_type` via cold-vs-warm latch (`AppLaunchTracker`) in `main.dart`, `is_first_open` + `days_since_last_open` persisted via SharedPreferences. `seconds_since_last_request` via a persistent bloc stopwatch reset on send/resend. `otp_entered` is a one-shot latch per session. Row 16 `onboarding_profile_save_result` fires from both branches of `NameLanguageBloc._onContinueTapped` with `completion_time_seconds`. TAM-123 SMS retriever + phone hint wiring preserved. ~15 orphans deleted (autofill/hint telemetry, language-step orphans). 36/37 onboarding tests pass (1 pre-existing Rule 4 failure kept out of scope per Setup #4). |
| 12 | Paywall | 10 (rows 17–26) | ✅ | All 10 fire. Trial vs subscription branches on `PaymentSucceeded.trialEndsAt` in `_succeed` (non-null → `trial_activated` with ISO `trial_start`/`trial_end_date`; null → `subscription_activated(activation_source=direct_payment)`; already-entitled restore path → `subscription_activated(activation_source=restore)`). `payment_result` fires on `_succeed`/`_fail`/`_onDismissed`/poll-exhausted with `payment_provider='decentro'` + `PaymentErrorCode.name` as `error_code` on failure. `paywall_video_watch_time` accumulated via `didChangeAppLifecycleState` + `isPlaying → false` transitions + fired once on `_PaywallScreenState.dispose` (skips zero). `paywall_viewed` on `PaywallReady`; `paywall_video_started(auto_play|user_play)` split; `paywall_video_failed(invalid_url|init_failed)` from `_ensureVideoController` catch blocks; `paywall_closed` guards empty-plans redirects (only fires when actually visible). Deleted 14 orphan literals. Recent mounted guards + full-width Pay Now CTA + `appSignatureHash` param preserved. 50/50 paywall + payment tests pass. **Superseded in part by the Frontend Payment Events pass — see the next section.** |
| 13 | Profile & Settings | 10 (rows 141–150) | ⏳ | Created `lib/features/profile/profile_analytics.dart` with all 10 constants. Wired 7/10: `profile_page_viewed` (menu `initState`), `terms_clicked`+`terms_viewed`, `privacy_policy_clicked`+`privacy_policy_viewed` (via `_openLegal` + new optional `onLoaded` callback on `InAppWebViewScreen` for real `load_time_ms`), `logout_clicked` (menu tap), `logout_result` (try/catch around auth-clear cascade emits `result: success | failure` with `AUTH_STORE_CLEAR_FAILED` code). 3 defined-but-silent (`profile_name_edit_result`, `profile_phone_edit_started`, `profile_phone_edit_result`) — no name/phone-edit UI in profile menu today; wiring notes in the file's docstring for when those surfaces land. Legacy `user_logged_out` literal preserved (cross-cutting cleanup item). 110/110 home tests pass. |

### Frontend Payment Events (separate sheet, laid over the Paywall row above)

Source: "Frontend Payment Events" tab (`Prabhuji_ Analytics events_Main Sheet -
Frontend Payment Events.csv` at repo root). 16 event rows collapse to 5 distinct
event names (rows repeat by property, not by fire). This pass **replaces** the
Sheet-1 rows that had direct equivalents; the rest of the Paywall row above
(`paywall_viewed`, `pay_now_clicked`, `payment_started`, `paywall_closed`, the
three `paywall_video_*` events, plus `payment_result` for `cancelled` / `pending`
only) still stands.

| Group | Events | Status | Notes |
|---|---|---|---|
| A | `trial_payment_initiated`, `trial_success`, `trial_failed`, `subscription_started`, `payment` | ✅ | Retired: `trial_activated`, `subscription_activated`, `payment_result(success\|failure)` (the last still fires for `cancelled` + `pending`). Added on `PaywallEvents`; property keys added on `PaywallEventProps` (`type`, `index`, `paymentMethod`, `paymentId`, `mandateId`, `upiType`, `nextBillingDate`, `billingCycle`, `paymentStatus`, `paymentDate`, `isFirstPayment`, `failureCode`). `PaymentBloc._onPayNowTapped` fires `pay_now_clicked` + `payment_started` (both with `trigger_module`) + `trial_payment_initiated` when the resolved snapshot carries `trialEndsAt`. `_succeed` fires `trial_success` **or** `subscription_started` + the consolidated `payment(payment_status=success)`. `_fail` fires `trial_failed` (if the last snapshot was a trial) **or** the retired `payment_result(failure)` (for direct-paid, no new-schema equivalent) + `payment(payment_status=failed)` with `failure_code`. `attempt_number` bumped via `_onRetried`. `upi_type` mapped from `PayNowTapped.upiPackageName` via `_upiTypeFromPackage` (`PhonePe` \| `GPay` \| `Paytm` \| `Other`). `trigger_module` threaded through `PaywallArgs` route extra → `PayNowTapped.triggerModule` → every event. Call sites updated in the 7 module-nav closures + Books reader + Books contents + 3 Home surfaces. `books` added to `UserPropertyModule`. Deep-link / notification pushes leave `trigger_module` null (no origin). Backend-gap fields (`payment_id`, `index`, `is_first_payment`, `billing_cycle`) emit null; captured in `docs/ANALYTICS-USER-PROPERTIES-BACKEND.md`. 20/20 `payment_bloc_test.dart` tests pass. |

### Cross-cutting cleanup

| Task | Status |
|---|---|
| Extract `share_initiated` / `user_logged_out` / `deep_link_*` literals into `lib/core/shared_analytics.dart` | ✅ Created `shared_analytics.dart` with 5 events + 7 property keys. Replaced 8 literal usages across 5 lib files (`home_feed_card`, `aarti_player_bloc`, `status_share_bloc`, `ringtone_preview_bloc`, `profile_menu_screen`, `deep_link_service` — 3 deep-link call sites). 4 test files updated. No duplicate constants. |
| Fix stale cross-cutting tests broken by the rollout (`no_pii_leak_test.dart` event-name assertions; `shell_test.dart` + `nav_shell_golden_test.dart` after the 3-tab shell change) | ✅ Bucket A (`no_pii_leak_test.dart`): 4 stale assertions updated to renamed constants (`ringtone_share_result`, `status_business_details_save_result`); books-paywall test deleted per Setup #3; module-sweep floors lowered to match post-orphan-cleanup counts. Bucket B (`shell_test.dart`): 3-branch shape, Mandir test dropped, Figma cross-check labels updated to `['Home','Status','Horoscope']` with a pointer to `doc/bottom-nav-routing.md`. Bucket C + D: `nav_shell_golden.png` + 32 non-status goldens regenerated (all diffs were sub-pixel / AA noise; verified re-run without `--update-goldens`). |

### `deity_slug` on the five content-outcome events

Data asked for a `deity_slug` property — the slug of the god the content
belongs to (`hanuman`, `krishna`, `ganesha` …), matching `deities.slug` — on
five outcome events so every content module's terminal funnel step can be
grouped by deity:

| Event | Slug source | Notes |
|---|---|---|
| `status_share_result` | `StatusFeedItem.deitySlug` (all three fire sites: success, `story_launch_failed`, `share_threw`) | **Needed an API change** — see below. |
| `set_ringtone_result` | `RingtoneDetailData.deityId` (the ringtone wire's `deityId` IS the slug, TAM-57) threaded onto `SetRingtoneStartRequested`; fires on all three terminal states (success / failure / permission_denied) | |
| `set_wallpaper_result` | `WallpaperDetailData.deitySlug` (new — mapped from the already-served `WallpaperDetail.deity.slug`) threaded onto `SetWallpaperRequested`; fires on all four terminal states (success / failure / unsupported / cancelled) | |
| `aarti_audio_completed` | `AartiPlayerReady.detail.deity?.slug` | Already on the wire. |
| `mantras_repetition_completed` | `MantraDetailData.deitySlug` (new — mapped from the already-served `MantraDetail.deity.slug`) | |

`deity_slug` is deliberately distinct from the existing `deity_id` property:
on discovery/filter events `deity_id` carries the **selected filter** (`all`
when none is chosen), whereas `deity_slug` always describes the **content
itself**. `null` means the item is uncategorised — never a synthesized value.

**API change (contract-codegen chain ran).** `StatusCard` was the only one of
the five whose public schema didn't serve a deity slug — it served
`deityName` only, while the service already computed the slug and the Zod
response schema stripped it. `StatusCardSchema` now carries
`deitySlug: string | null` (internal `StatusCard.deityId` renamed to
`deitySlug` to match, since that field was always the slug and never a uuid).
Regenerated + committed in order: `api:openapi` (both `openapi.json` and
`openapi.public.json`) → `api-client:generate` → `mobile:generate`.

**Known gap — the Home feed entry points report `deity_slug: null`.**
`HomeFeedItem` is module-agnostic and carries no deity at all, so a status
shared, or a wallpaper/ringtone set, straight off the Home feed has no slug to
report. Those three call sites in `home_feed_card.dart` pass `null` explicitly
with a comment. Closing this needs `deitySlug` added to the Home feed
contract, which is a cross-module resolve (status/wallpaper/ringtone/aarti/
mantra) rather than a one-line schema addition — out of scope here.

### `is_pro_at_event` on the status share chain

All four events in the status share chain — `status_share_clicked`,
`status_export_started`, `status_export_result`, `status_share_result` — now
carry a boolean `is_pro_at_event`, read **live from the bloc's `isPro` seam at
each fire site** (8 sites: 1 + 1 + 3 branches + 3 branches), never snapshotted
when the flow began and never hard-coded from the branch it sits in.

**Why not `is_premium_user`.** That name is already the **user property**, with
current-state semantics: whatever the user's entitlement is when the warehouse
reads the profile. `is_pro_at_event` is a per-event fact. The two diverge
exactly where the chain is most interesting — a free user who hits the paywall
and buys mid-flow fires:

| Event | `is_pro_at_event` | `is_premium_user` (user property) |
|---|---|---|
| `status_share_clicked` (pre-gate) | `false` | `true` |
| `status_export_started` | `true` | `true` |
| `status_export_result` | `true` | `true` |
| `status_share_result` | `true` | `true` |

Reusing the existing name would collapse that row-1 `false` into `true` and
erase the free→paid conversion step the chain exists to measure. Covered by
three tests in `status_share_bloc_test.dart`: the mid-flow purchase split, the
already-Pro all-`true` case, and the paywall-dismissed case (tap event `false`,
no export/share events at all).

### TAM-165 client wiring — the agent's analytics envelope + `chat_distress_shown`

`POST /chat/messages` now publishes the content agent's own reply envelope
instead of discarding it (PR #207, stage). Six new optional fields on
`ChatMessage`, two on `ChatScreenConfig`. Client wiring:

| Event | Change |
|---|---|
| `chat_reply_received` | `matched_tags`, `recommended_deity`, `jaap_count` filled from the envelope (were hard-coded placeholders); `intent_type` + `distress_detected` added. `model_id` **stays empty** — the envelope carries no model identifier. |
| `chat_distress_shown` | **New fire.** Keyed off `botMessage.distressDetected`. |
| `chat_no_match` / `chat_out_of_scope` | **New fires.** Both were "blocked on Phase 2 backend"; unblocked by `intent_type` (`no_match` / `out_of_scope`). `chat_out_of_scope` carries `reason` = the agent's `decline_category`. |
| `chat_page_viewed` | `suggestion_set_id` filled from `chatConfig.suggestionSetId` (was a CMS-blocked TODO). |
| `chat_suggested_question_clicked` | `category` filled from the tapped chip (was a CMS-blocked TODO). |

**Arm behaviour — read before building a chart.** The five envelope fields are
null on `bhagwat_gita_chat` and `kuldevta_chat`: those agents reply in prose
and have no envelope. Null means "this agent does not report it", not
"nothing happened". Two of three live arms will report nothing here forever.
On the wire the client normalises them to the empty string, matching the rest
of that properties map.

**`distress_detected` is the exception and does NOT follow that table.** It is
computed server-side in `toWire` from the stored reply text
(`row.content === CRISIS_RESPONSE.text`), not parsed from the agent envelope,
and the crisis card is served by the API's own safety layer
(`crisis-detection.service.ts`) for *every* agent. So it is a real boolean —
`false`, never null — on all three arms, and `chat_distress_shown` fires
correctly on the kuldevta arm too. Reading the arm table at face value would
suggest the safety event is dark on the most emotionally loaded arm; it isn't.

**Two decisions locked (product, 2026-09-09):**

1. **`chat_distress_shown` fires ALONGSIDE `chat_reply_received`, not instead
   of it.** `TAM-CHAT-mobile-ui.md:353-354` proposed suppressing the reply
   event; we are not doing that — a distress turn is still a reply, and
   suppressing it would leave a hole in the sent→received funnel exactly where
   the conversation mattered most. Both are filterable (`distress_detected`
   rides on the reply event too). That spec line is now stale, as is its event
   name `chat_distress_detected` — the shipped name is `chat_distress_shown`,
   per TAM-167 row 3.6.
2. **No `trigger_reason` yet — and `decline_category` must NOT be substituted
   for it.** The server classifies every crisis turn as `sentinel` /
   `content_policy_self_harm` / `content_policy_unknown` (`CrisisReason` in
   `crisis-detection.service.ts:29-39`) and does not put it on the wire.
   `decline_category` is the only exposed candidate and is null on **100% of
   distress turns by construction**: `crisisExchange` discards the agent's
   reply and stores the canned crisis prose, which `parseAnswer` cannot parse
   as JSON, so it falls to `proseOnly()` with every envelope field null.
   Shipping it as `trigger_reason` would put a permanently-empty column on a
   safety event. The property is additive whenever the server exposes
   `CrisisReason`. (`decline_category` *is* the right field for
   `chat_out_of_scope`, where it's wired.)

## Remaining work — resume-here for the next session

**Rollout is complete.** Every per-feature row is ✅ (Row 13 is ⏳ only
because 3 events wait on name-edit / phone-edit profile screens that
don't exist yet — separate ticket). Both cross-cutting cleanup rows are
✅. Whole-app `flutter analyze` clean. Full test suite: **1097/1110
pass; 13 deferred** — all deferred failures are in scoped-out buckets
below.

**Deferred (not blockers for the analytics rollout):**

- **Status widget-layout / model** — 12 pre-existing failures in
  `status_home_screen_test` (6), `status_crosscheck_test` (1),
  `status_models_test` (2 overlay-copy), `status_golden_test` (3 —
  `status_home_masterImage` shows a real `_ShareCta` layout regression).
  Root cause not analytics-related; the Status Sharing agent flagged
  these via git-blame against `c4b8226` (last touched independently of
  the rollout). The overlay-copy failures indicate `overlaySubtitle` /
  `overlayDetail` getters return `businessDetails` /
  `businessMobileNumber` where the tests + Figma 322:1758 expect
  `name • mobile` / `details`. Owner: separate ticket to fix `_ShareCta`
  RenderFlex + the two overlay-copy getters.
- **Row 13 tail — Profile name-edit / phone-edit events (3)** — wait on
  UI. Wiring notes are in `profile_analytics.dart`'s docstring.
- **Onboarding orchestrator Rule 4** — 1 test kept deliberately stale
  per Setup #4; the orchestrator's Rule 4 was intentionally removed.

**Rough time remaining:** none for the analytics rollout itself. Bucket E
(status widget-layout) deserves its own spec + ticket.

## Backend contract (blocker for some user properties)

See `docs/ANALYTICS-USER-PROPERTIES-BACKEND.md`. Sheet-3 fields that stay
null client-side until backend lands:
- `account_created_at`, `first_app_open_at`, `last_app_open_at`,
  `total_sessions`, `last_active_module`, `preferred_content_type`,
  `preferred_deity_id`, `first_paid_at`, `subscription_started_at`,
  `subscription_plan_id`, `acquisition_source`, `acquisition_campaign`.

Client wiring for these already exists in `UserPropertiesTracker.
applyServerSnapshot(...)`; only the transport is missing.

## Resume-here checklist for the next session

If starting a new session mid-rollout:

1. Read this doc for state.
2. Read the 3 CSVs at repo root for the source of truth.
3. Read `apps/mobile/lib/features/aarti/aarti_analytics.dart` for the
   pattern (constants file shape, wiring notes).
4. Read `apps/mobile/lib/features/aarti/player/bloc/aarti_player_bloc.dart`
   for how audio-port extensions + close override + app-state event were
   done (Mantras follows this exact shape).
5. Read `apps/mobile/lib/features/home/home_analytics.dart` +
   `home_feed_bloc.dart` for a non-audio pattern (feed depth tracker,
   load-failure tracking, orphan-comment style).
6. Pick the next `🔲` row in the progress table above and follow the
   commit shape at the top of this doc.
