# PRD: Prabhuji Status Sharing

## 1. Module Summary

- App: Prabhuji
- Module: Status Sharing
- Screen: Status Home, Personal Details, Business Details
- Feature type: Devotional status discovery, customization, and Pro sharing
- Version: v1.0
- Status: Approved
- Figma source: Prabhuji file `ipSvV1FnmzvV8TK2Ig8Aiq`, nodes `371:2182`, `302:4384`, `371:2185`, `371:3567`

Status Sharing lets users browse devotional image and video statuses in a vertical, reels-like feed. Users can filter by deity, preview the current status, add personal or business details as an overlay, like content, and share the final generated status through Android native sharing.

The feature is designed to show value before payment. Free users can explore and customize. Pro is required only when the user wants to output the final status media through share, download, save to gallery, or set as status. In Phase 1, only the visible `Share` CTA is exposed.

All app features require login. If a user is not logged in and tries to use Status, the app should take the user to login first and return them to Status after successful login.

## 2. Product Intent

Status Sharing helps devotional users quickly find and share respectful Hindu devotional images and videos on WhatsApp and other social apps.

The module should feel simple, familiar, and useful for mass-market Android users. It should support devotional sharing without making the screen feel like a noisy entertainment feed.

The overlay feature gives users personal and business identity on top of devotional content. This creates a clear Pro value moment when the user decides to share the final rendered file.

## 3. User Goals

- Open the Status tab and browse devotional statuses.
- Scroll vertically through image and video statuses.
- Filter statuses by deity or All Gods.
- Preview how their personal or business details look on a status.
- Save personal or business details for reuse.
- Like status content.
- Share a final image or video status to WhatsApp or other apps.

## 4. Business Goals

- Convert free users to Pro at the moment of share intent.
- Increase devotional sharing, especially through WhatsApp.
- Create repeat usage through fresh CMS-driven status content.
- Let users understand Pro value without feeling blocked from devotional discovery.

## 5. Free vs Pro Behavior

### Authentication rule

Confirmed: Login is required for all app features.

- If an unauthenticated user taps the Status tab, open login/auth.
- After successful login, return the user to Status.
- If the session expires while using Status, ask the user to log in again before saving, liking, or sharing.

### Free User

Confirmed free users can:

- Open Status after login.
- Browse the vertical status feed.
- Filter by deity.
- See image and video status previews.
- See the personal/business overlay preview.
- Open Edit Details.
- Add and save personal details.
- Add and save business details.
- Upload an avatar/profile image through image picker.
- Like status content.
- Tap Next to move to the next status.

Confirmed free users cannot:

- Share final status media.
- Download final status media.
- Save final status media to gallery.
- Set final status media as status.
- Bypass the unified paywall after tapping Share.

Paywall trigger rules:

- Do not show paywall on Status tab entry.
- Do not show paywall while browsing.
- Do not show paywall while filtering.
- Do not show paywall while editing or saving details.
- Show unified paywall when a logged-in free user taps `Share`.
- If future download, save-to-gallery, or set-status actions are added, they must also trigger the unified paywall for free users.

Free users should not see lock badges on discovery cards. The Share CTA remains visible because it is the clear Pro conversion point.

### Pro User

Confirmed Pro users can:

- Do everything free users can do.
- Tap Share.
- Generate the final status image or video with the overlay burned into the file.
- Open the native Android share sheet.
- Share to WhatsApp, WhatsApp Status if exposed by Android, or other installed apps through the share sheet.

## 6. Section and Feature Requirements

### 6.1 Status Home header

Visible in Figma:

- Page title: Status
- Edit Details CTA with pencil icon

Requirements:

- Tapping Edit Details opens Add your details.
- The default tab should be the last active profile type if known. Otherwise default to Personal.
- The header should stay simple and readable.

### 6.2 Deity filter row

Visible in Figma:

- All Gods
- Hanuman ji
- Ram ji
- Durga Ma
- Ganesh Ji
- More deity filters are present in the Figma node structure.

Requirements:

- Filters scroll horizontally.
- Tapping a deity filters the status feed.
- All Gods shows the combined feed.
- If a filtered deity has no content, show a calm empty state and let the user return to All Gods.
- Filter list and deity images should be CMS-controlled.

### 6.3 Vertical status feed

Confirmed behavior:

- The feed scrolls vertically like reels.
- Content alternates between image and video statuses as best effort.
- If one media type is unavailable, continue showing available content instead of showing empty slots.
- Ordering is CMS-curated in Phase 1.
- No personalization in Phase 1.

Requirements:

- Feed items use a tall status preview area.
- Only one status should be active at a time.
- The current card should be easy to view on 360px Android width.
- Sacred imagery should not be covered by aggressive overlays.
- The user/business overlay should stay in the designed lower area.

### 6.4 Status card actions

Visible in Figma:

- Share CTA with WhatsApp icon
- Like icon and count, example 24K
- View icon and count, example 1.4L
- Next button

Requirements:

- Share is the main Pro conversion action.
- Like is free for logged-in users and not Pro-gated.
- Next moves to the next status card.
- View count display should be calm and not over-emphasized.
- AI assumption: view analytics can be counted when a status is visible for at least 2 seconds. The final display source is listed as a non-blocking open question.

### 6.5 Personal Details

Visible in Figma:

- Back button
- Title: Add your details
- Personal and Business tabs
- Large avatar image area with camera icon
- Field: Your name
- Save button

Confirmed behavior:

- Details are stored in backend.
- Image upload uses image picker in Phase 1.
- Camera capture is Phase 2.
- Login is required before using the flow.

Requirements:

- Tapping the avatar/camera area opens Android image picker.
- Selected image is used in the overlay avatar/profile slot.
- Save validates required fields and stores data in backend.
- After save, the active profile type is Personal.
- Status previews should update with saved details.

### 6.6 Business Details

Visible in Figma:

- Business Information label
- Business name
- Business details
- Business mobile number
- Save button

Confirmed behavior:

- Basic mobile validation only.
- No OTP verification in Phase 1.
- Details are stored in backend.

Requirements:

- Business name should be required for saving a business profile.
- Business mobile number should allow Indian 10-digit validation in Phase 1.
- Business details should be short enough to fit the overlay.
- After save, the active profile type is Business.
- Status previews should update with saved business details.

### 6.7 Active Personal or Business overlay

Confirmed behavior:

- The Personal/Business selector lives in Edit Details only.
- The active saved profile is used for all status previews in Phase 1.
- If the user last saved or selected Business, feed previews show Business details.
- If the user last saved or selected Personal, feed previews show Personal details.
- The overlay is burned into exported image/video output.

Requirements:

- Free users can fully preview the overlay before paying.
- If no details exist, show default placeholder overlay or ask user to add details before share.
- The overlay should not cover deity faces or key sacred details when avoidable.

### 6.8 Sharing and export

Confirmed behavior:

- Phase 1 uses native Android share sheet.
- The app pre-generates the final image or video file.
- WhatsApp must be supported as the primary expected destination in the share sheet.
- Overlay is burned into the final output.
- Direct WhatsApp Status deep-link is Phase 2 only if technically reliable.

Requirements:

- Pro user tapping Share starts rendering.
- After render success, open Android native share sheet.
- The share intent should use the correct MIME type for image or video.
- If WhatsApp is installed, it should be available in the share sheet where Android exposes it.
- If rendering fails, show a clear retry message.
- If no share target is available, show a calm error message.

### 6.9 Video behavior

Confirmed behavior:

- Phase 1 videos autoplay muted by default when in view.
- Only one video plays at a time.
- Video pauses when it leaves the viewport.
- Tap-to-unmute or visible sound controls are Phase 2.

Requirements:

- Do not autoplay multiple videos.
- Do not start video audio automatically in Phase 1.
- If video load fails, show thumbnail/fallback and allow the feed to continue.

### 6.10 Bottom navigation

Visible in Figma:

- Home
- Status active
- Mandir
- Horoscope
- Books

Requirements:

- Bottom nav has exactly five items.
- Status is active on Status Home.
- Bottom nav should not trigger a Pro paywall directly.
- If user is logged out, bottom nav destination should open login first.

## 7. States and Fallback Behavior

### Loading

- Show lightweight skeleton or loader for deity filters and first status item.
- Do not block bottom nav.

### Empty feed

- If CMS returns no Status content, show a calm empty message and retry CTA.
- If a selected deity has no content, show empty state and offer All Gods.

### CMS error

- Show retry CTA.
- Keep header, filters if cached, and bottom nav visible.

### Media load failure

- For image failure, show placeholder and skip option.
- For video failure, show thumbnail if available, otherwise placeholder.

### Offline

- If cached content exists, show cached previews with disabled share if render cannot complete.
- If no cached content exists, show offline message and retry.

### Login required

- If user is unauthenticated, open login before Status features.
- Return to the intended Status destination after login.

### Free user share attempt

- Open unified paywall.
- Do not render output before the user becomes Pro.

### Render in progress

- Show a simple progress state on Share.
- Prevent duplicate render/share taps.

### Render failure

- Show retry.
- Keep user on the same status card.

### Details save failure

- Show inline or toast error.
- Keep entered text and selected image.

### Invalid mobile number

- Show inline validation error.
- Do not save until valid or removed if optional.

## 8. Phase 1 and Phase 2 Scope

### Phase 1 scope

Confirmed Phase 1 includes everything in the provided design plus the approved behavior rules:

- Login-gated Status access.
- Status Home.
- Vertical reels-like feed.
- Image statuses.
- Video statuses.
- Best-effort alternation between image and video.
- CMS-curated ordering.
- Horizontal deity filters.
- Share CTA.
- Like action.
- View count display.
- Next button.
- Personal Details form.
- Business Details form.
- Active Personal/Business profile selection through Edit Details.
- Backend storage for details.
- Gallery/image picker for avatar image.
- Basic mobile number validation.
- Overlay preview for free and Pro users.
- Pro-only final output actions.
- Unified paywall on free user Share tap.
- Pre-generated final image/video output.
- Overlay burned into exported file.
- Native Android share sheet.
- WhatsApp as primary expected share destination.
- Video autoplay muted by default.

### Phase 2 scope

Approved Phase 2 items:

- Tap-to-unmute or visible sound controls.
- Different overlay templates.
- Advanced overlay editor with draggable placement.
- More frames and overlay templates.
- Saved or favorite statuses collection.
- Search.
- Personalized deity or language feed.
- Direct WhatsApp Status deep-link if technically reliable.
- Video rendering queue or progress for heavy videos.
- Watermark or branding controls.
- Camera capture.

## 9. Analytics

Suggested events:

- status_opened when logged-in user opens Status.
- 
- status_filter_selected when user selects a deity filter.
- status_card_viewed when card is visible long enough to count as viewed.
- status_next_tapped when user taps Next.
- status_like_toggled when user likes or unlikes a status.
- status_edit_details_tapped when user opens Edit Details.
- status_details_saved when personal or business details save succeeds.
- status_avatar_upload_started when user starts image picker.
- status_avatar_upload_completed when image is selected successfully.
- status_share_tapped when Share is tapped.
- status_paywall_shown when free user taps Share.
- status_export_render_started when Pro share rendering begins.
- status_export_render_succeeded when output file is created.
- status_export_render_failed when output generation fails.
- status_native_share_sheet_opened when Android share sheet opens.

## 10. Handoff Notes

- Figma is visual truth. This package is behavior truth.
- The share sheet is native Android in Phase 1, not a custom WhatsApp-only integration.
- WhatsApp should be visually and technically prioritized, but the user can choose any available share target.
- Final image/video must include the selected overlay in the exported file.
- Do not place aggressive monetization over sacred imagery.
- Do not auto-play video with sound in Phase 1.
- Login is required before Status features, but Pro paywall is only for final output actions.
- Use 360px width as the baseline.
- Keep important tap targets at least 44px where possible.
- Any future output action such as download, save to gallery, or set as status must be Pro-only.
