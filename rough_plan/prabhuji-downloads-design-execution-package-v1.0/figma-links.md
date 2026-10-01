# Figma Links — Downloads

**File:** Prabhuji — `ipSvV1FnmzvV8TK2Ig8Aiq`
**Main section:** `Downloads` — node `2632:21210`
https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=2632-21210

## Detected Nodes

| Area | Node ID | Notes |
|---|---|---|
| Downloads section (root) | `2632:21210` | Whole Downloads canvas |
| Downloads library | `2632:21373` | Title, offline banner, filter chips, list, bottom nav |
| Offline banner | `2649:22822` | Text `2649:22824`: "You're offline, showing your downloads" |
| Filter chips | `2632:21376` | All / Aarti / Bhajan / Mantra with counts |
| Download list | `2632:21385` | Rows use `Download list item` |
| Download list item (component) | `2632:21395` | 360×89 row |
| Empty state | `2639:22432` | `Downloads-empty` |
| Empty — title | `2639:22448` | "Nothing downloaded yet" |
| Empty — body | `2639:22449` | "Tap the download icon on any Aarti, Bhajan or Mantra play page…" |
| Empty — disclosure card | `2649:22886` / text `2649:22902` | "Plays only inside Prabhuji. Downloads are encrypted…" |
| Home (Downloads in nav + miniplayer) | `2632:21396` | Bottom nav Home/Chat/Status/Downloads/RashiFal |
| Home miniplayer (Player Bar) | `2641:22798` | Live Player Bar with Offline chip |
| Aarti & Bhajans play page | `2632:21211` | Download Button `2649:22834` |
| Aarti & Bhajans play page (alt) | `2632:21255` | Download button variant |
| Mantra play page | `2632:21299` | Download Button `2649:22850`, "Download" label |
| Action sheet — queued | `2632:21710` | Cancel Download |
| Action sheet — failed | `2632:21734` | Retry Download / Cancel Download |
| Action sheet — downloaded (list) | `2632:21764` | Play Now / Delete Download |
| Action sheet — downloaded (play page) | `2632:21797` | Play Now / Delete Download / View All Downloads |
| Download Button (component) | `2632:21949` | Property 1 = Download / Downloaded / Downloading |
| Download states (component) | `2632:21835` | Downloaded / Downloading / Queued / Failed |
| Download ring states (component) | `2632:21883` | 0 / 25 / 50 / 75 / 100 |

## PRD ↔ Figma Reconciliation

Resolved after the latest Figma update and designer answers:

- **Offline mode** — now in Figma: banner (`2649:22822`) on the library and the Offline chip on the Home miniplayer (`2641:22798`).
- **Empty state** — now in Figma (`2639:22432`).
- **In-app-only disclosure** — now in Figma (`2649:22902`), on the empty state. *Open: confirm it also persists on the populated list (q5).*
- **Cancel affordance** — resolved to follow Figma: ⋮ action sheet on the Downloads list; ring-tap cancels on the play page. (PRD's inline × is superseded.)
- **Bottom nav** — Figma shows Home / Chat / Status / Downloads / RashiFal, replacing the previously documented Home / Status / Mandir / Horoscope / Books. Confirmed as of now but provisional (q1).
- **Premium lapse** — not in the origin PRD; confirmed by designer: downloaded items stay visible, play tap re-fires the unified paywall.
- **Storage / network** — no storage-management UI and no Wi-Fi-only toggle in Phase 1; storage-full is a failed state.

Still outstanding vs PRD:

- **Profile "My Downloads" row** (PRD §5) — not in this Figma frame (q4).
- **"Available offline" chip** under the play-page title (PRD §7) — Figma shows the Download Button "Downloaded" state instead; confirm if the chip is also wanted (q6).

## Implementation Notes

- The offline banner reuses a component named **"Chat Bubble"** in Figma — implement it as an offline banner regardless of the component name.
- Filter chip and row counts/sizes (All 12, "5:52 · 6.2 MB", etc.) are placeholders — real values come from the download store.
- Download Button label stays **"Download"** across states.
- Ring progress uses discrete component states (0/25/50/75/100) for design; implementation should animate actual percent.
