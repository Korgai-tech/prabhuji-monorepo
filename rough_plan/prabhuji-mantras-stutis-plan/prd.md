# Prabhuji Mantras & Stutis PRD

## 1. Module Summary

**App:** Prabhuji  
**Module:** Mantras & Stutis  
**Screen/Flow:** Module Main Page, Show All Listing, Mantra Player, Counter, Playlist, Background Mini-player  
**Feature type:** Pro devotional audio streaming and daily retention  
**Version:** v1.0  
**Status:** Approved  
**Figma source:** `ipSvV1FnmzvV8TK2Ig8Aiq`, nodes `683:5220`, `425:4944`, `438:3074`, `1066:3358`

Mantras & Stutis lets users discover and listen to short devotional audio items such as mantras and stutis. Users enter from the Home screen Mantras & Stutis card, browse curated rows, deity groups, and devotional categories, then open a focused audio player.

This module is a daily retention feature. Devotees can repeat short audio items a selected number of times, such as 7, 11, 21, 108, or 1008. The experience should feel calm, devotional, and simple. It should offer a focused alternative to noisy music or video platforms.

This is a paid playback feature. Free users can browse discovery surfaces, but tapping any playable item, deity, category, or item card triggers the unified paywall. Pro users can stream, repeat, like, share, use playlists, and continue playback in the background with a shared mini-player.

## 2. Product Intent

Mantras & Stutis should help users build a daily devotional listening habit.

The feature should feel like a clean devotional audio library. It should not feel like a generic music app. It should avoid noisy recommendations, aggressive badges, and distracting entertainment patterns.

The core value is simple: devotees can find the right mantra or stuti quickly, play it repeatedly, and continue their devotional practice every day.

Design principles applied:

- **DP01: Devotional First, Feed Second** — discovery is organized and calm, not a noisy feed.
- **DP02: Preserve Sacred Visual Dignity** — sacred art and mantra text should not be covered by aggressive CTAs.
- **DP03: Calm Rituals, Clear Controls** — playback and repeat controls should be simple and large enough.
- **DP04: Simple Language, Readable Devanagari** — mantra text must preserve line breaks and readability.
- **DP05: Pro as Added Devotional Value** — Pro unlocks deeper audio use and repetition, not basic worship.
- **DP08: Lightweight, Readable, Small-Screen First** — the 360px layout is the implementation baseline.

## 3. User Goals

- Open Mantras & Stutis from Home.
- Browse recently played mantras, deity groups, categories, and newly added mantras.
- Tap a mantra, deity, category, or listing item and start listening.
- Repeat the current audio a selected number of times.
- Move through a related playlist.
- Like a mantra or stuti.
- Share a mantra or stuti through the native share sheet, especially WhatsApp.
- Continue listening in the background or when the phone is locked.

## 4. Business Goals

- Convert high-intent devotional audio users to Pro.
- Increase daily retention through repeatable mantra listening.
- Create a focused devotional alternative to YouTube or general music apps.
- Encourage sharing through deep links, without sharing raw audio files in Phase 1.
- Build shared audio patterns that can also support Aarti & Bhajans.

## 5. Free vs Pro Behavior

### Free User

Free users can:

- Enter the Mantras & Stutis main page from Home.
- View the main page discovery sections.
- View deity/category/audio cards without lock badges.
- Tap “Show all” and browse the two-column listing page as a discovery surface.

Free users cannot:

- Open the mantra player.
- Play audio.
- Use the repeat counter.
- Use playlist playback.
- Like mantra/stuti items.
- Share mantra/stuti items.
- Continue audio in mini-player/background playback.

Paywall trigger rules:

- Tapping any playable audio item on the main page opens the unified paywall.
- Tapping any deity card opens the unified paywall.
- Tapping any category card opens the unified paywall.
- Tapping any item inside a Show All listing opens the unified paywall.
- Tapping player-only actions is not applicable for free users because they cannot enter the player.
- The module should not show a paywall on module entry.
- The module should not show lock badges on discovery surfaces in Phase 1.
- Use the unified MVP paywall. Do not create contextual paywalls in Phase 1.

### Pro User

Pro users can:

- Browse the main page.
- Open Show All listing pages.
- Tap any audio item, deity, or category and open the player.
- Stream audio.
- Use previous/play-pause/next controls.
- Use repeat counter options: 7, 11, 21, 108, 1008.
- Use the playlist bottom sheet.
- Like mantra/stuti items.
- Share mantra/stuti deep links through the native Android share sheet.
- Continue listening in background or locked-device mode through the shared mini-player.

Pro users should not see:

- Paywalls inside this module.
- Lock badges on discovery cards.
- Payment prompts during active devotional playback.

## 6. Section/feature requirements

### 6.1 Entry from Home

- User enters through the Home screen Mantras & Stutis feature card.
- Entry opens the Mantras & Stutis main page.
- Free and Pro users can both enter the main page.
- Entry itself must not trigger the paywall.

### 6.2 Main Page Header

Visible UI:

- Android status bar.
- Basic navigation bar.
- Back arrow.
- Title: “Mantras & Stutis”.

Behavior:

- Back arrow returns the user to the previous screen, usually Home.
- Title is static for the main page.
- 

### 6.3 Recently Played Mantras

Visible UI:

- Section title: “Recently Played Mantras”.
- “Show all” action.
- Horizontal row of audio cards.
- Each card shows artwork and a truncated title.

Confirmed behavior:

- Recently Played uses real user listening history for Pro users.
- Tapping an audio card opens player for Pro users.
- For a free user, tapping an audio card opens the unified paywall.
- Tapping “Show all” opens the Recently Played listing page.
- If the user is free, they can view the listing as discovery, but tapping any item opens the unified paywall.

Fallback:

- If there is no real listening history, hide this section.
- Do not show fake history as real Recently Played.

### 6.4 Mantras of Deities

Visible UI:

- Section title: “Mantras of Deities”.
- “Show all” action.
- Horizontal deity chips/cards with circular deity images.
- Figma examples: Hanuman ji, Ram ji, Durga Ma, Ganesh Ji, Shri Krishna, Vishnu Ji, Lakshmi Ma, Radha Ma, Khatu Shyam, Saraswati Ma, Kali Ma.

Confirmed behavior:

- Tapping a deity does not open a dedicated deity page in Phase 1.
- For Pro users, tapping a deity opens the player with the first mantra/stuti from that deity group.
- The rest of that deity group becomes the playlist.
- For free users, tapping a deity opens the unified paywall.
- “Show all” opens a two-column listing/grid page for that deity collection or deity group list, depending on CMS structure.

Implementation note:

- Use the correct spelling “Deities” in code/content fields. The Figma component name has “Dieties”, but user-facing title is “Mantras of Deities”.

### 6.5 Browse Categories

Visible UI:

- Section title: “Browse Categories”.
- Two-column category grid.
- Figma categories: Peace, Wealth, Health, Success, Love & Relationship, Protection. This categories are reference for now, need cms controm similar to arti and Bhajans

Confirmed behavior:

- Category cards do not open dedicated category pages in Phase 1.
- For Pro users, tapping a category opens the player with the first mantra/stuti in that category.
- The rest of that category becomes the playlist.
- For free users, tapping a category opens the unified paywall.
- “Show all”, if shown for categories, opens a listing page using the same Show All grid pattern.

### 6.6 Newly Added Mantras

Visible UI:

- Section title: “Newly Added Mantras”.
- “Show all” action.
- Horizontal row of audio cards.

Behavior:

- This row is CMS-controlled.
- Tapping an audio card opens player for Pro users.
- Tapping an audio card opens unified paywall for free users.
- “Show all” opens a full listing page for Newly Added Mantras.

### 6.7 Show All Listing Page

Figma source: `1066:3358`, shown as “Mantras & Stutis - Recently Played”.

Visible UI:

- Android status bar.
- Top nav with back arrow.
- Dynamic title, e.g. “Recently Played”.
- Two-column grid.
- Each card shows square artwork and title.

Confirmed behavior:

- This listing pattern is reused from the Aarti module.
- It is reused for Mantras & Stutis sections such as Recently Played and Newly Added.
- Free users can open the listing as discovery.
- Free users tapping any item in the listing see the unified paywall.
- Pro users tapping any item open the player.
- The listing order becomes the player playlist.

Rules:

- Listing title must be dynamic based on the source section.
- Do not show lock badges on listing items in Phase 1.
- Truncate long titles after the available line limit.
- Keep tap targets at least 44px.

### 6.8 Mantra Player

Figma source: `438:3074`.

Visible UI:

- Back arrow.
- Counter pill, e.g. `0/21 times` in Figma. Behavior default is `0/7 times`.
- Artwork card.
- Title, e.g. “Shri Raam Dootam”.
- Singer metadata, e.g. “Singer Ajay Gosh”.
- Devanagari mantra text.
- Like action and like count.
- Share action and share count.
- Player controls.
- Next track card.

Confirmed behavior:

- Player is Pro-only in Phase 1.
- Audio starts automatically after an explicit item tap from the main page or listing.
- Player does not autoplay on module entry because module entry does not open player.
- Player controls are previous track, play/pause, and next track.
- No 10-second seek controls in Phase 1.
- Back returns to the previous surface and keeps audio running through the mini-player if playback is active.
- Sacred artwork and text must remain unobstructed.

Mantra text rules:

- Preserve line breaks from CMS.
- Do not compress Devanagari too tightly.
- Use readable color and line height.
- If text is longer than the visible area, make the player content scroll rather than truncating sacred text.

### 6.9 Repeat Counter

Visible UI:

- Counter pill on player.
- Counter bottom sheet.
- Options: 7, 11, 21, 108, 1008.

Confirmed behavior:

- Default repeat target is 7.
- Selected count means the current audio plays that many times.
- Counter starts at 0 for each new track.
- Counter increments after each full playback completion.
- When the target is complete, automatically play the next item in the playlist.
- Tapping the counter pill opens the bottom sheet.
- Tapping a radio option immediately selects and saves that option.
- No Continue button is required in behavior.
- Changing the count while audio is playing resets completed count to 0.
- The counter pill updates immediately after selection, e.g. `0/108 times`.

Implementation note:

- The Figma bottom sheet includes a Continue button and unrelated helper copy. Do not implement that behavior for Phase 1.

### 6.10 Playlist

Visible UI:

- Playlist bottom sheet/list.
- Playlist items show thumbnail, title, and singer name.
- Figma example title: “Gurur Brahma Mantra”.

Confirmed behavior:

- Playlist is built from the group the user selected.
- If the user taps an item in Recently Played, the playlist is the Recently Played list/order.
- If the user taps a deity, the playlist is that deity group.
- If the user taps a category, the playlist is that category group.
- If the user taps Show All listing item, the listing order becomes the playlist.
- Tapping the Next card area opens the playlist bottom sheet.
- Tapping the play icon on the Next card directly starts the next item.
- Tapping a playlist item starts that item and resets counter to `0/default_target`.
- When a repeat target completes, auto-play the next playlist item.

### 6.11 Like

Confirmed behavior:

- Pro users can like/unlike mantra and stuti items from the player.
- Like toggles immediately in the UI.
- Like count should update optimistically, then reconcile with backend.
- If backend save fails, revert the like state and show a soft error.

Assumption:

- Because this is a Pro-only player, liking can be saved to the user profile without an additional login prompt.

### 6.12 Share

Confirmed behavior:

- Pro users can share from the player.
- Share opens the native Android share sheet.
- WhatsApp is an important share destination.
- Phase 1 share payload includes text and a deep link.
- Phase 1 does not share the raw audio file.

Recommended Phase 1 share payload:

- Mantra/stuti title.
- Short devotional message.
- App/deep link to the item.

Example payload:

“Prabhuji पर Shri Raam Dootam सुनें: <deep link>”

### 6.13 Background Playback and Mini-player

Confirmed behavior:

- Background playback is Phase 1.
- Use the shared mini-player pattern planned for Aarti & Bhajans.
- Audio should continue when the app is backgrounded or the device is locked, subject to platform rules.
- The mini-player should show the active item and basic controls.
- The mini-player should not trigger paywall because only Pro users can start playback.

Implementation note:

- Exact mini-player visual source is shared with Aarti & Bhajans and remains a cross-module dependency.

## 7. States & fallback behavior

### Loading

- Show lightweight skeletons/placeholders for rows and listing grids.
- Do not block the entire module if one row is still loading.
- Player should show loading state before audio starts if audio URL takes time.

### Empty

- If Recently Played is empty, hide the section.
- If Newly Added is empty, hide the section.
- If deity or category data is empty, hide that section.
- If all CMS sections are empty, show an empty state with retry and return/back affordance.

Recommended empty copy:

“Mantras abhi uplabdh nahi hain. Kripya thodi der baad phir dekhein.”

### Error

- If CMS fails on the main page, show retry.
- If one section fails but others load, show the remaining sections and hide the failed section.
- If audio fails to load, show a soft error and keep the user on player.
- If playlist next item fails, skip to the next available item if possible; otherwise stop playback and show retry.

Recommended audio error copy:

“Audio play nahi ho paya. Kripya phir try karein.”

### Partial failure

- Main page should support partial success.
- If artwork fails, show a devotional placeholder image.
- If singer metadata is missing, hide singer line rather than showing blank labels.
- If mantra text is missing, hide text area and keep playback usable.

### Offline

- If offline on main/listing page and no cached data exists, show offline message with retry.
- If audio is already playing and network drops, continue buffered playback if possible.
- Offline downloads are not Phase 1.

### Background playback interruption

- If Android audio focus is lost because of a call or another app, pause playback.
- Resume only when the user explicitly taps play again, unless platform audio behavior safely supports auto-resume.

## 8. Phase 1 / Phase 2 scope

### Phase 1 Scope

- Main Mantras & Stutis page.
- Recently Played Mantras row using real user history for Pro users.
- Mantras of Deities row.
- Browse Categories grid.
- Newly Added Mantras row.
- Show All listing page using the added grid UI.
- Unified paywall trigger for free users after content intent.
- Pro-only player.
- Audio autoplay after explicit item/listing/category/deity tap.
- Previous/play-pause/next controls.
- Repeat counter with 7, 11, 21, 108, 1008.
- Default repeat target 7.
- Auto-play next playlist item when target completes.
- Playlist bottom sheet.
- Like action for Pro users.
- Native share sheet with deep link only.
- Background playback and shared mini-player.
- CMS-driven content.
- Loading, empty, error, offline, and partial failure states.

### Phase 2 Scope

- Search within Mantras & Stutis.
- Custom repeat count beyond presets.
- Sleep timer.
- Offline downloads for Pro users.
- Continue last played mantra section.
- Personalization by preferred deity.
- Daily mantra reminders.
- Language/script options: Hindi, Sanskrit, transliteration.
- Font size adjustment for mantra text.
- Saved/favorite mantra collections.
- Daily chanting milestones or soft devotional progress.
- Smart recommendations based on recently played deity/category.
- Contextual Pro explanation before paywall.
- More advanced audio queue management.

## 9. Analytics

Suggested events:

- `mantras_module_opened` — user opens Mantras & Stutis module.
- `mantras_section_show_all_tapped` — user taps Show All in a section.
- `mantras_listing_opened` — user opens a Show All listing.
- `mantras_item_tapped` — user taps an audio item.
- `mantras_deity_tapped` — user taps a deity card.
- `mantras_category_tapped` — user taps a category card.
- `mantras_paywall_triggered` — free user taps playable content.
- `mantras_player_opened` — Pro user opens player.
- `mantras_audio_started` — audio begins playback.
- `mantras_audio_paused` — user pauses audio.
- `mantras_audio_completed_once` — one full playthrough completes.
- `mantras_repeat_target_selected` — user selects 7/11/21/108/1008.
- `mantras_repeat_target_completed` — selected repeat target completes.
- `mantras_playlist_opened` — user opens playlist sheet.
- `mantras_playlist_item_selected` — user selects an item from playlist.
- `mantras_next_item_autoplayed` — target completes and next item starts.
- `mantras_like_toggled` — user likes or unlikes an item.
- `mantras_share_tapped` — user taps share.
- `mantras_background_playback_started` — audio continues after app background or lock.
- `mantras_mini_player_tapped` — user returns to player through mini-player.
- `mantras_audio_error` — audio fails to load or play.

## 10. Handoff Notes

- Figma is visual truth. This package is behavior truth.
- The feature is Pro-only for playback, but discovery is free.
- Do not place lock badges on main/listing discovery surfaces in Phase 1.
- Use unified MVP paywall only.
- Do not trigger paywall on module entry.
- Do not implement 10-second seek controls even though Figma node names mention backward/forward 10 seconds.
- Player controls should be previous track, play/pause, and next track.
- The counter default is 7, even though Figma examples show 21.
- The counter bottom sheet should save immediately on radio tap. Do not require Continue.
- Do not implement unrelated Figma copy such as “Reporting is private. The user won’t be notified.”
- Devanagari text must preserve line breaks and remain readable on 360px screens.
- Background playback and mini-player depend on shared audio architecture with Aarti & Bhajans.
- All content and ordering should come from CMS unless locally required for Recently Played history.