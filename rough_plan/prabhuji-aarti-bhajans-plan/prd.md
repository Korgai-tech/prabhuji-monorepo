# PRD: Prabhuji Aarti & Bhajans

## 1. Module Summary

**App:** Prabhuji  
**Module:** Aarti & Bhajans  
**Screen/Flow:** Module Spec  
**Feature type:** Pro devotional audio streaming with free discovery  
**Version:** v1.0  
**Status:** approved  
**Figma source:** Main module section `683:5219`; main page `412:2656`; listing page `420:2909`; player `423:4387`; player controls `423:4384`.

Aarti & Bhajans is the devotional audio streaming area inside Prabhuji. Users enter from the Home feature card, browse devotional audio by section, category, or deity, and then open an audio player when they choose an item.

The module is designed for daily listening and retention. It gives devotees one calm place for Aarti, Bhajan, Chalisa, Stotram, Mantra Jaap, Katha, and other devotional audio categories without the distraction of YouTube or generic music apps.

The key business rule is that discovery is free, but playback is Pro. Free users should be able to see the value of the library before paying. The paywall must appear only after the user taps an audio item to listen.

## 2. Product Intent

Aarti & Bhajans should help devotees quickly find and listen to devotional audio they may use every day.

The experience should feel:

- devotional
- simple
- calm
- familiar
- readable on a 360px Android screen
- easy for older users

The experience should not feel:

- like a noisy entertainment feed
- like a pay-to-worship wall
- overly modern or cold
- overloaded with controls
- aggressive around sacred imagery

Confirmed design principles used:

- **DP01: Devotional First, Feed Second** — the module can use listing patterns, but it should stay devotional.
- **DP02: Preserve Sacred Visual Dignity** — do not cover deity art with aggressive CTAs.
- **DP03: Calm Rituals, Clear Controls** — player controls must be simple and large enough.
- **DP05: Pro as Added Devotional Value** — Pro unlocks deeper daily listening, not basic discovery.
- **DP08: Lightweight, Readable, Small-Screen First** — build for 360px width and simple Android usage.

## 3. User Goals

Users should be able to:

1. Open Aarti & Bhajans from Home.
2. Browse devotional audio without payment pressure.
3. Explore audio by category.
4. Explore audio by deity.
5. See recently played audio when available.
6. See newly added audio.
7. See most played audio on Prabhuji.
8. Tap an item to listen.
9. Use simple player controls.
10. Like/favorite an audio item.
11. Share a devotional audio link with friends, especially through WhatsApp.
12. Continue listening while moving away from the full player through an in-app mini-player.

## 4. Business Goals

The module supports:

1. **Daily retention** — devotees can return daily to listen to Aarti, Bhajan, Chalisa, Katha, and similar content.
2. **Pro conversion** — audio playback is a paid feature. Users who want to listen should subscribe to Pro.
3. **Content depth** — CMS-controlled categories allow the team to expand the devotional library over time.
4. **Share-led discovery** — Pro users can share item links. Shared links can bring new users into Prabhuji.
5. **Reduced distraction** — Prabhuji offers a devotional audio space without generic platform noise.

## 5. Free vs Pro Behavior

### 5.1 Free User

Free users can:

- Open the Aarti & Bhajans module.
- View the main page.
- View Deities.
- View Browse Categories.
- View Newly Added.
- View Most Played on Prabhuji.
- View Recently Played only if they have history.
- Tap a category card and open the 2-column filtered listing page.
- Tap a deity card and open the 2-column filtered listing page.
- Tap Show all and open the reusable listing page.
- See audio artwork and titles in listings.

Free users cannot:

- Open the unlocked player.
- Start audio playback.
- Use player controls.
- Like/favorite from the player.
- Share from the player.

Paywall trigger rules:

- **Confirmed:** Trigger the unified paywall when a free user taps an audio item to play.
- Do not trigger paywall on module entry.
- Do not trigger paywall on category tap.
- Do not trigger paywall on deity tap.
- Do not trigger paywall on Show all tap.
- Do not show lock badges or Pro labels on discovery cards in Phase 1.
- If the user purchases successfully from this flow, open the original tapped audio item and auto-start playback.
- If the user cancels the paywall, return them to the listing or section they came from without playback.

### 5.2 Pro User

Pro users can:

- Browse everything free users can browse.
- Tap an audio item and open the player.
- Auto-start the selected audio item.
- Pause and resume playback.
- Seek with the progress bar.
- Rewind 10 seconds.
- Forward 10 seconds.
- Move to previous and next item in the current queue.
- Like/favorite an item.
- See total like count.
- Share an item link through the native share sheet.
- See total share count.
- Continue playback through an in-app mini-player after leaving the full player.

Pro users should not see:

- Playback paywalls.
- Lock badges on audio cards.
- Extra payment prompts inside active playback.

## 6. Section / Feature Requirements

### 6.1 Entry from Home

Confirmed behavior:

- User enters this module by tapping the Aarti & Bhajans feature card on Home.
- The Aarti & Bhajans main page opens.
- No paywall appears on entry.

Navigation behavior:

- Back button returns to the previous screen, usually Home.
- The visible Figma frame shows a simple top nav with back arrow and title.
- Do not add top-right actions unless separately confirmed.

### 6.2 Main Page

Visible sections in Figma:

1. Recently Played
2. Deities
3. Browse Categories
4. Newly Added
5. Most Played on Prabhuji

Main page rules:

- Content should be vertically scrollable.
- Horizontal audio rows show item artwork and title.
- Long titles may truncate with ellipsis as shown in Figma.
- All content is CMS-driven, except Recently Played which is based on user playback history.
- The module should not show fake content when a section is empty.

### 6.3 Recently Played

Confirmed behavior:

- Show Recently Played only if the user has playback history.
- Hide Recently Played if empty.
- Do not show placeholder or fake recent items.

Interaction rules:

- Tapping an audio item follows the normal audio item rule:
  - Free user → unified paywall.
  - Pro user → player opens and auto-starts.
- Show all opens the reusable 2-column listing page filtered to Recently Played.

### 6.4 Deities

Visible sample deities in Figma:

- Hanuman ji
- Ram ji
- Durga Ma
- Ganesh Ji
- Shri Krishna
- Vishnu Ji
- Lakshmi Ma
- Radha Ma
- Kathu Shyam
- Saraswati Ma
- Kali Ma

Confirmed behavior:

- These are examples. CMS should control deity list, images, order, and active state.
- Tapping a deity opens the same reusable 2-column audio listing UI filtered by that deity/god.
- Free users can open deity listings.
- Paywall appears only when a free user taps an audio item.

### 6.5 Browse Categories

Visible sample categories in Figma:

- Prabhuji Originals
- Stotram
- Aarti
- Chalisa
- Mantra Jaap
- Katha

Confirmed behavior:

- These are sample categories, not a fixed hardcoded list.
- CMS must allow the team to create and manage categories.
- Each category needs a name, image, order, and active state.
- Each audio item needs category tags.
- Tapping a category opens the same reusable 2-column audio listing UI filtered by category.

Important rule:

- Stotram, Chalisa, Mantra Jaap, and Katha behave as audio categories inside this module for Phase 1.
- They should not route to Books or Mantras in this module flow.

### 6.6 Newly Added

Behavior:

- Shows recently published audio items from CMS.
- Show all opens the reusable 2-column listing page filtered/sorted by newest first.
- Tapping an item follows the normal audio item access rule.

### 6.7 Most Played on Prabhuji

Behavior:

- Shows popular audio items from CMS or analytics-backed ranking.
- For Phase 1, CMS/API may provide a curated or computed list.
- Show all opens the reusable 2-column listing page sorted by most played.
- Tapping an item follows the normal audio item access rule.

### 6.8 Reusable Listing Page

Visible in Figma:

- Top nav with back button.
- Dynamic page title, example: Aarti.
- 2-column audio grid.
- Each card has image and title.

Confirmed behavior:

- One reusable listing page pattern is used for all Show all, category, and deity flows.
- The listing query changes by source:
  - category
  - deity
  - recently played
  - newly added
  - most played
- Tapping a grid item follows the normal audio item access rule.

Recommended details:

- Preserve scroll position when returning from paywall cancellation or player back.
- Use lazy loading/pagination if the list is long.
- Keep images rounded and visually calm, as shown in Figma.

### 6.9 Audio Item Tap

Confirmed behavior:

- Audio item tap is the primary intent moment.
- Free user tapping an item opens the unified paywall.
- Pro user tapping an item opens the player and starts playback.

Purchase continuation:

- The app must preserve:
  - audio item id
  - source list type
  - source list query/filter
  - queue order
  - previous scroll context if possible
- After successful purchase, open the player for the original audio item and auto-start playback.

### 6.10 Player

Visible in Figma:

- Back button
- Cover art
- Audio title, example: Ganesh Aarti
- Singer metadata
- Composer metadata
- Like icon and like count
- Share icon and share count
- Elapsed time
- Total duration
- Progress bar
- Rewind 10 seconds
- Previous track
- Play/pause
- Next track
- Forward 10 seconds

Confirmed behavior:

- Player is available only to Pro users.
- Playback auto-starts when opened from an item tap.
- Play/pause toggles current playback.
- Progress bar shows elapsed and total duration.
- User can seek through the progress bar.
- Rewind moves playback back 10 seconds.
- Forward moves playback forward 10 seconds.
- Previous/next move through the current queue.
- Audio auto-plays the next item in the queue when one item finishes.
- At the end of the queue, playback stops. Do not loop endlessly in Phase 1.

### 6.11 Queue Behavior

Confirmed behavior:

- Queue is based on the list or section the user came from.

Examples:

- User opens Ganesh Aarti from the Aarti category list → queue is the Aarti category list.
- User opens an item from Newly Added → queue is the Newly Added list.
- User opens an item from Hanuman ji deity list → queue is the Hanuman ji filtered list.

Queue rules:

- Previous moves to the previous item in the current queue.
- Next moves to the next item in the current queue.
- If the current item is the first item, previous should be disabled or no-op.
- If the current item is the last item, next should be disabled or stop/no-op.
- Auto-play next should stop at the end of the queue.

### 6.12 Mini-player

Confirmed behavior:

- Audio continues with an in-app mini-player when the user leaves the full player.

Figma status:

- Mini-player is not present in the supplied Figma frames.
- This is a confirmed Phase 1 behavior but needs a visual component before final UI build.

Working assumption:

- Mini-player appears only after Pro playback has started.
- Mini-player remains visible while the user navigates inside the app.
- Mini-player should not appear before purchase for free users.
- Tapping the mini-player reopens the full player.
- Mini-player should include minimum controls:
  - thumbnail or small artwork
  - title
  - play/pause
  - close/dismiss
- Closing the mini-player stops playback and dismisses the mini-player.

### 6.13 Like / Favorite

Confirmed behavior:

- Treat the heart action as like/favorite.
- Pro users can like and unlike an item from the player.
- Total like count should be shown.
- Do not add an extra login prompt unless account/session state is missing.

Phase 2:

- Add a liked/favorite library.

### 6.14 Share

Confirmed behavior:

- Share is available from the unlocked player.
- Since free users cannot open the player, share is effectively Pro-only in Phase 1.
- Share opens the native share sheet.
- WhatsApp is an important destination.
- Shared payload should include an item deep link.

Shared link behavior:

- If a Pro user opens the link, open the audio item/player if allowed by app routing.
- If a free user opens the link, they can view/browse but must subscribe before playback.

## 7. States & Fallback Behavior

### 7.1 Loading

- Show skeletons or lightweight placeholders for main page sections.
- Use image placeholders for artwork while loading.
- Do not block the whole page if one section is still loading.

### 7.2 Empty Main Page

- If all CMS sections are empty, show a calm empty state: “No audio available right now. Please try again later.”
- Keep the top nav visible.
- Do not show fake devotional content.

### 7.3 Empty Recently Played

Confirmed behavior:

- Hide Recently Played when empty.

### 7.4 Empty Category or Deity Listing

- Show a simple empty state: “No audio found here yet.”
- Provide a back action through the top nav.
- Do not show paywall for empty lists.

### 7.5 CMS Partial Failure

- If one section fails, hide or show retry for that section without breaking the whole page.
- If Browse Categories fail but Newly Added is available, still show Newly Added.
- If Deities fail but categories are available, still show Browse Categories.

### 7.6 Full CMS Failure

- Show a retry state.
- Keep the nav visible.
- Do not show paywall.

### 7.7 Paywall Cancellation

- If a free user cancels the paywall, return them to the same listing/main page context.
- Do not start playback.
- Preserve scroll position where possible.

### 7.8 Purchase Success

Confirmed behavior:

- After successful purchase, open the player for the original tapped item.
- Auto-start playback.
- Restore the queue from the original source list.

### 7.9 Audio Load Error

- Show a calm player-level error: “This audio could not play. Please try again.”
- Provide Retry.
- Keep back navigation available.
- Do not skip to another track unless user taps next.

### 7.10 Offline

- Phase 1 does not include offline downloads.
- If browsing data is unavailable offline, show retry/offline message.
- If audio stream fails because of network, show the audio load error.

## 8. Phase 1 / Phase 2 Scope

### 8.1 Phase 1 Scope

Phase 1 includes everything visible in the current design plus the confirmed mini-player behavior:

- Aarti & Bhajans main page.
- Recently Played section with hide-if-empty logic.
- Deities section.
- CMS-controlled Browse Categories section.
- Newly Added section.
- Most Played on Prabhuji section.
- Reusable 2-column listing page.
- Category filtered listings.
- Deity filtered listings.
- Show all listings.
- Unified paywall on free audio item tap.
- Purchase continuation to original audio item.
- Pro player.
- Auto-start playback on item open.
- Progress bar and duration.
- Rewind 10 seconds.
- Forward 10 seconds.
- Previous/next within queue.
- Auto-play next item within queue and stop at queue end.
- Like/favorite action and total like count.
- Native share sheet and total share count.
- In-app mini-player when leaving full player.
- CMS support for categories, category image, category tags, deity tags, and audio metadata.

### 8.2 Phase 2 Scope

Documented Phase 2 suggestions:

- Lyrics or devotional text in player.
- Repetition counter.
- Next-track card.
- Liked/favorite library.
- Offline downloads or cached listening.
- Repeat one / repeat all / loop mode.
- Android lock-screen/background media controls if not supported in Phase 1.
- Personalized recommendations by deity, recent use, or language.
- Contextual paywall explanations for audio.
- Search within Aarti & Bhajans.
- Download/share audio file if legally allowed.

## 9. Analytics

Suggested events:

- `aarti_bhajans_opened` — user opens the module.
- `aarti_bhajans_section_show_all_tapped` — user taps Show all.
- `aarti_bhajans_category_tapped` — user taps a category.
- `aarti_bhajans_deity_tapped` — user taps a deity.
- `aarti_bhajans_audio_item_tapped` — user taps an audio item.
- `aarti_bhajans_paywall_shown` — free user sees paywall after item tap.
- `aarti_bhajans_purchase_success_from_audio` — user purchases from this flow.
- `aarti_bhajans_player_opened` — Pro user opens player.
- `aarti_bhajans_play_started` — audio starts.
- `aarti_bhajans_play_paused` — user pauses audio.
- `aarti_bhajans_play_completed` — item finishes.
- `aarti_bhajans_next_tapped` — user taps next.
- `aarti_bhajans_previous_tapped` — user taps previous.
- `aarti_bhajans_seek_used` — user seeks on the progress bar.
- `aarti_bhajans_like_toggled` — user likes or unlikes.
- `aarti_bhajans_share_tapped` — user opens share sheet.
- `aarti_bhajans_mini_player_shown` — mini-player appears.
- `aarti_bhajans_mini_player_tapped` — user returns to full player from mini-player.
- `aarti_bhajans_audio_error` — audio fails to load or play.

## 10. Handoff Notes

- Figma is visual truth for layout and component placement.
- This package is behavior truth for access, paywall, CMS, states, and audio logic.
- Do not hardcode sample categories or deities. CMS must control them.
- Do not show paywall before item tap.
- Do not add lock badges to browse surfaces in Phase 1.
- Do not route Stotram, Chalisa, Mantra Jaap, or Katha to other modules from this screen in Phase 1.
- Preserve the original tapped audio item through the paywall and purchase flow.
- The mini-player is confirmed for Phase 1 but needs visual design. Use the open question as a blocker for final UI build.
- Current Figma player does not include lyrics, repetition counter, or next-track card. Keep them out of Phase 1.
- Some Figma sample text has spelling differences such as “Aarthi”. Use CMS-provided content titles, but keep the module label as “Aarti & Bhajans”.
- The Figma JSON includes hidden top-nav trailing icon instances, but the rendered frame shows only back and title. Do not build trailing actions unless confirmed.