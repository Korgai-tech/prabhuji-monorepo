# PRD: Prabhuji Downloads

## 1. Module Summary

**App:** Prabhuji
**Module:** Downloads
**Screen / Flow:** Downloads library, play-page download button, download action sheets, offline mode, empty state
**Feature type:** Premium offline audio / retention + conversion feature
**Version:** v1.0
**Status:** draft for review
**Figma source:** `ipSvV1FnmzvV8TK2Ig8Aiq`, section `2632:21210` (`Downloads`)
**Origin PRD:** `Prabhuji-Downloads-PRD.md` (PM: Ronak). This package is the reconciled behavior truth; Figma is visual truth.

Downloads lets premium users save Aarti, Bhajan, and Mantra audio and play it without a connection. One tap on a play page downloads the item in place; everything downloaded lives in a single Downloads screen reachable from the bottom navigation (and a "My Downloads" row in Profile). Downloads play only inside Prabhuji — the audio is stored in the app's own private, encrypted storage and is never exposed as a shareable or externally-openable file.

The feature exists to make daily listening work offline, remove repeat data cost for the content users return to, and give premium a concrete reason to be bought.

## 2. Product Intent

Downloads should feel effortless and safe: one tap to keep a Chalisa forever, one place to find everything saved, and it just works with no connection. It should not feel like a file manager or a heavy media app. The protection model (in-app-only, encrypted) is a product guarantee, communicated in one calm line, not a technical lecture.

Design principles applied: DP03 (calm rituals, clear controls), DP05 (Pro as added value), DP08 (small-screen first, 360px).

## 3. User Goals

- Keep the audio I listen to every day, saved once and always there.
- Listen without a connection — travel, weak network, no data.
- Find everything I saved in one place, sorted by the types the app already uses.

## 4. Business Goals

- Make daily listening work offline to lift repeat listening on Aarti, Bhajan, and Mantra.
- Remove repeat data cost for returning content.
- Give premium a clear reason to convert.

## 5. Scope

Audio only — Aarti, Bhajan, and Mantra. No video, no other content types in Phase 1.

## 6. Free vs Premium Behavior

### 6.1 Free User

- Free users see the download button on Aarti / Bhajan / Mantra play pages.
- Tapping download opens the **existing unified paywall**. Do not build a downloads-specific paywall.
- Free users do not accumulate downloads.

### 6.2 Premium User

- Premium users download with one tap, browse the Downloads screen, play offline, and manage downloads.

### 6.3 Premium Lapse (confirmed)

- When premium **expires**, downloaded items remain **visible** in the Downloads screen.
- Tapping a downloaded item **to play re-fires the unified paywall** (the entitlement is re-checked at play time).
- On successful re-subscribe, downloaded items play again without needing re-download (as long as the encrypted files are still present).
- Reinstalling the app clears app-private storage, so downloads must be re-fetched after reinstall. *(assumption — see open question q2)*

## 7. Entry Points

- **Play page** — a download button on every Aarti, Bhajan, and Mantra play page (component `Download Button`, states Download / Downloading / Downloaded). This is where downloading starts.
- **Bottom navigation** — a **Downloads** tab. In the current Figma the five-item nav is **Home / Chat / Status / Downloads / RashiFal** (confirmed as of now; see q1 — this is a provisional app-wide IA that may change).
- **Profile** — a "My Downloads" row that opens the same Downloads screen. *(In PRD; not present in this Figma frame — see q4.)*

## 8. Core Flows

### Flow 1 — Download

Play page → tap download → the icon becomes an **in-place progress ring** → done. The user stays on the play page throughout. No quality picker, no confirmation, no sheet. When it finishes, the button shows the **Downloaded** state.

- Tapping the ring cancels and returns to the idle download icon.
- Downloads continue while the user browses elsewhere. More than one can run; the rest **queue**.

### Flow 2 — Listen offline

Open app with no connection → Downloads → tap any item → play page opens and plays. Streaming content is hidden while offline; downloads behave exactly as they do online.

## 9. Section / Feature Requirements

### 9.1 Downloads Screen (library)

Visible in Figma (`2632:21373`):

- Top nav (Basic Nav) with title "Downloads".
- **Offline banner** (`2649:22822`) — "You're offline, showing your downloads" — shown only when offline.
- **Filter chips** (`2632:21376`): All, Aarti, Bhajan, Mantra, each with a live count (e.g. All 12, Aarti 4, Bhajan 3).
- **Download list** of rows (`Download list item`), each showing artwork, title, and `type · duration · size` (e.g. "Aarti · 5:52 · 6.2 MB").
- Bottom nav with Downloads active.

Behavior:

- Tapping a downloaded row opens the play page directly — no menu step in between.
- Each row's trailing area reflects its state (see 9.2). Completed/queued/failed rows expose a **⋮** that opens the row action sheet (see 9.3).
- Filters filter the list in place; counts reflect the filtered set.
- The disclosure line "downloads play only inside Prabhuji" is shown (on the empty state today; confirm persistence on the populated list — q5).

### 9.2 Row / Button States

From the `Download states` and `Download Button` components:

- **Downloaded** — filled check; row tap plays; ⋮ → Play Now / Delete Download.
- **Downloading** — progress ring showing percent (ring states 0 / 25 / 50 / 75 / 100). Cancel via ⋮ → Cancel Download (on a play page, tapping the ring cancels).
- **Queued** — "Queued" label; waiting for an active slot; ⋮ → Cancel Download.
- **Failed** — failed indicator; ⋮ → Retry Download / Cancel Download.

### 9.3 Row Action Sheets (bottom sheets)

Visible in Figma — the ⋮ opens a bottom sheet titled with the item name:

- **Queued** (`2632:21710`): Cancel Download.
- **Failed** (`2632:21734`): Retry Download, Cancel Download.
- **Downloaded — from the Downloads list** (`2632:21764`): Play Now, Delete Download.
- **Downloaded — from a play page** (`2632:21797`): Play Now, Delete Download, View All Downloads.

Cancel affordance follows Figma: the **⋮ sheet** is the canonical control on the Downloads list; the **ring tap** cancels on the play page.

### 9.4 Play-Page Download Button

Visible in Figma (Aarti & Bhajans `2632:21211`, Mantra Player `2632:21299`; component `2632:21949`):

- States: **Download** (idle) → **Downloading** (in-place ring) → **Downloaded**.
- Label stays "Download".
- Free user tap → unified paywall. Premium tap → download starts in place.

### 9.5 Offline Mode

Visible in Figma:

- **Downloads library** shows the offline banner (`2649:22822`).
- **Miniplayer** carries an **Offline** chip when the playing item came from downloads (Home shows the live Player Bar `2641:22798`).
- Streaming content is hidden while offline rather than shown broken. Downloads behave exactly as online.

### 9.6 Empty State

Visible in Figma (`2639:22432`, `Downloads-empty`):

- Downloads icon in a soft avatar.
- Title: "Nothing downloaded yet".
- Body: "Tap the download icon on any Aarti, Bhajan or Mantra play page, you'll be able to listen without internet."
- Two actions: **Browse Aarti & Bhajans**, **Browse Mantras** (route to those modules).
- Disclosure card (`2649:22902`): "Plays only inside Prabhuji. Downloads are encrypted on your device, they can't be shared, copied out, or opened in another app."

## 10. Protection (behavior truth)

- A download must be usable inside Prabhuji and nowhere else.
- The audio is never written to the phone as a playable file. It is stored in the app's private storage in an app-only readable (encrypted) form, decrypted only while playing. Nothing appears in the file manager, gallery, or share sheets.
- The exact method is for engineering to decide.
- Sharing the audio **file** is not possible and the UI never offers it. Sharing a **link** to the content is unaffected and continues to work as today.
- **Ringtones** need a real file in shared storage, which this rule disallows; ringtones keep their existing separate flow. Downloads and ringtones do not share a file.
- Users see one line about this on the Downloads screen: downloads play only inside Prabhuji.

## 11. States & Fallback Behavior

- **Downloading:** in-place ring; multiple run, rest queue; continues while browsing.
- **Queued:** "Queued" until a slot frees.
- **Failed:** failed indicator; Retry / Cancel via ⋮. Covers network and server errors.
- **Storage full:** surfaces as a **failed** download (`failure_reason: storage_full`). No storage-management UI in Phase 1.
- **Offline:** offline banner on Downloads; streaming hidden; miniplayer Offline chip; downloads play normally.
- **Empty:** "Nothing downloaded yet" with Browse actions + disclosure.
- **Premium lapse:** downloaded rows remain; play tap → unified paywall.
- **Free tap on download:** unified paywall.

## 12. Phase 1 / Phase 2 Scope

### Phase 1

- Play-page download button (Aarti / Bhajan / Mantra), one-tap in-place download with progress ring and cancel.
- Multiple concurrent downloads + queue; downloads continue while browsing.
- Downloads screen with All / Aarti / Bhajan / Mantra filters and counts.
- Row states: Downloaded / Downloading / Queued / Failed; row action sheets (Play Now, Delete, Retry, Cancel, View All Downloads).
- Offline mode: banner, hidden streaming, miniplayer Offline chip.
- Empty state + in-app-only disclosure line.
- Encrypted app-private storage; no external file; ringtones stay separate.
- Premium-only; free tap → unified paywall; premium lapse → play tap → unified paywall.
- Storage-full surfaces as a failed download.
- Analytics per §13.

### Phase 2 (deferred)

- Storage-management UI (usage, bulk clear).
- Wi-Fi-only download setting / network policy controls.
- Download quality options.
- Downloads for other content types (Books audio, etc.).
- Sort / search within Downloads; richer filter taxonomy.
- Smart auto-download of daily/favourite content.

## 13. Analytics

Uses the existing Prabhuji event sheet (module-prefixed snake_case; `_clicked` taps, `_viewed` screen reach, `_failed` errors). Events carry the PRD's properties.

- `download_clicked` — download tapped on a play page. Props: content_id, content_type, source_screen, user_subscription_status.
- `download_started` — download begins. Props: content_id, content_type, file_size_bytes, network_type, queue_position.
- `download_completed` — finishes and is playable offline. Props: content_id, content_type, file_size_bytes, duration_ms, network_type.
- `download_failed` — does not complete. Props: content_id, failure_reason (network / storage_full / server_error), retry_count, bytes_downloaded.
- `download_cancelled` — user cancels. Props: content_id, percent_complete.
- `download_removed` — user removes a download. Props: content_id, content_type, days_since_download, play_count.
- `downloads_page_viewed` — Downloads screen visible. Props: entry_point (bottom_nav / profile), download_count, is_offline.
- `downloads_filter_clicked` — filter pill tapped. Props: filter_type, result_count.
- `downloaded_content_played` — playback starts from a downloaded file. Props: content_id, content_type, is_offline, days_since_download, play_count.
- `app_offline_mode_entered` — app switches to downloads-only. Props: download_count, source_screen.

User properties: download_count, download_lifetime_count, download_offline_play_share.

Recommended addition (for the confirmed lapse behavior): `downloads_paywall_triggered` with `trigger` = free_download_tap or lapsed_play_tap.

## 14. Handoff Notes

- Figma is visual truth; this package is behavior truth. Where the origin PRD and Figma diverge, Figma wins and the divergence is flagged in `figma-links.md`.
- Bottom nav in Figma is Home / Chat / Status / Downloads / RashiFal — confirmed as of now, but it's an app-wide IA change (Mandir and Books drop out); treat as provisional (q1).
- Premium lapse: downloaded items stay visible; play tap re-fires the unified paywall (confirmed).
- Cancel on the list is via the ⋮ sheet (follow Figma), not an inline ×; the play-page ring cancels on tap.
- Protection is a hard rule: no external/playable file, no ringtone reuse, link-sharing only.
- Storage-full is a failed state; no storage UI and no Wi-Fi-only toggle in Phase 1.
- The offline banner reuses a "Chat Bubble" component in Figma — implement it as an offline banner regardless of the component name.
- Profile "My Downloads" row is in the PRD but not in this Figma frame (q4).
