# Figma Links: Prabhuji Mantras & Stutis

## Main Frame(s)

### Main module section

- **Name:** Mantras & Stutis
- **Node ID:** `683:5220`
- **URL:** https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=683-5220&t=TzCwzI6RZASLubyK-1
- **Notes:** Section containing the main page, player, counter sheet, and playlist references.

### Main page

- **Name:** Mantras & Stutis
- **Node ID:** `425:4944`
- **URL:** https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=425-4944&t=TzCwzI6RZASLubyK-1
- **Notes:** Primary module landing page with Recently Played, Mantras of Deities, Browse Categories, and Newly Added Mantras.

### Mantra Player

- **Name:** Mantra Player
- **Node ID:** `438:3074`
- **URL:** https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=438-3074&t=TzCwzI6RZASLubyK-1
- **Notes:** Pro-only player with artwork, metadata, Devanagari text, like/share, controls, next card, and counter pill.

### Show All listing

- **Name:** Mantras & Stutis - Recently Played
- **Node ID:** `1066:3358`
- **URL:** https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=1066-3358&t=TzCwzI6RZASLubyK-1
- **Notes:** Two-column Show All listing pattern reused from the Aarti module. Title should be dynamic by source section.

## Important Detected Nodes

| Area | Node ID | Notes |
|---|---:|---|
| Main module section | `683:5220` | Contains overall Mantras & Stutis section and related frames. |
| Deity component set | `683:5220` | Component set named “Dieties”; has default and active states. Use user-facing spelling “Deities”. |
| Main page frame | `425:4944` | Module landing page. |
| Main page top nav | `425:4944` | Back arrow and title “Mantras & Stutis”. |
| Recently Played section | `425:4944` | Horizontal row with title, Show all, artwork cards. Uses real user history for Pro users. |
| Recently Played card examples | `425:4944` | Example titles: Hanuman Aarthi, Hanuman Chalisa, Jay Gopala, Ram Chalisa. |
| Mantras of Deities section | `425:4944` | Horizontal deity list with circular thumbnails. |
| Deity examples | `425:4944` | Hanuman ji, Ram ji, Durga Ma, Ganesh Ji, Shri Krishna, Vishnu Ji, Lakshmi Ma, Radha Ma, Khatu Shyam, Saraswati Ma, Kali Ma. |
| Browse Categories section | `425:4944` | Two-column category cards. |
| Category examples | `425:4944` | Peace, Wealth, Health, Success, Love & Relationship, Protection. |
| Newly Added Mantras section | `425:4944` | Horizontal row with title, Show all, audio cards. |
| Mantra Player frame | `438:3074` | Player screen for Pro users. |
| Player counter pill | `438:3074` | Figma shows `0/21 times`; approved behavior default is `0/7 times`. |
| Player artwork block | `438:3074` | Large devotional artwork and warm metadata card. |
| Player title metadata | `438:3074` | Example title “Shri Raam Dootam”; singer “Ajay Gosh”. |
| Devanagari mantra text | `438:3074` | Text block must preserve line breaks and readability. |
| Like/share row | `438:3074` | Shows like and share counts; Pro-only actions. |
| Player controls | `438:3074` | Visual controls are used as previous/play-pause/next. Do not implement 10-second seek. |
| Next track card | `438:3074` | Shows “Gurur Brahma Mantra” and “Next”; card tap opens playlist, play icon starts next item. |
| Counter bottom sheet | `683:5220` | Options: 7, 11, 21, 108, 1008. Behavior saves immediately on radio tap. |
| Playlist bottom sheet | `683:5220` | List of playlist items with thumbnail, title, singer name. |
| Show All listing frame | `1066:3358` | Two-column grid for Recently Played and reusable section listings. |
| Show All listing nav | `1066:3358` | Back arrow and dynamic title. Figma title example: “Recently Played”. |
| Show All listing item cards | `1066:3358` | Square artwork and title below. Example titles include Hanuman Aarthi, Shri Durga Aarti, Shiv Aarti, Ganesh Aarti, Om Jay Jagdish Hare, Ambe Tu hai Jagadambe Kali, Lakshmi Aarti, Shri Ganga Aarti, Saraswati Aarti, Shani Aarti. |

## Figma Implementation Notes

- The Figma counter pill shows `0/21 times`, but the approved Phase 1 default is `0/7 times`.
- The Figma counter sheet includes a Continue button. Approved behavior does not require Continue; tapping a radio option immediately selects and saves the repeat target.
- The Figma counter sheet includes unrelated helper copy: “Reporting is private. The user won’t be notified.” Do not implement that copy for this module.
- Player control node names mention backward/forward 10 seconds. Approved Phase 1 behavior is previous track and next track, not 10-second seek.
- The player nav title in Figma appears as “Aarti”. In implementation, the player should use module/item-appropriate context and should not hardcode “Aarti” for Mantras & Stutis.
- The deity component set is named “Dieties” in Figma. Use the correct user-facing spelling “Deities” in copy and code naming where possible.
- The Show All listing frame is titled “Recently Played”, but the same pattern should be reused for other sections with dynamic titles.
- Free users can view discovery surfaces, including Show All listing pages, but tapping any playable item opens the unified paywall.
- No lock badges are shown on main page or listing cards in Phase 1.
- Background playback and the mini-player are confirmed for Phase 1, but the exact shared mini-player component should be aligned with Aarti & Bhajans implementation.