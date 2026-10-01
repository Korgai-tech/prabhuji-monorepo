# Figma Links: Prabhuji Aarti & Bhajans

## Main Frames

### Main module section

- **Name:** Aarti & Bhajans
- **Node ID:** `683:5219`
- **URL:** https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=683-5219&t=TzCwzI6RZASLubyK-1
- **Notes:** Contains the main page, listing page, player frame, and player controls area in the fetched section snapshot.

### Aarti & Bhajans main page

- **Name:** Aarti & Bhajans - main page
- **Node ID:** `412:2656`
- **URL:** https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=412-2656&t=TzCwzI6RZASLubyK-1
- **Notes:** Main browse surface with Recently Played, Deities, Browse Categories, Newly Added, and Most Played on Prabhuji.

### Aarti & Bhajans listing page

- **Name:** Aarti & Bhajans - list view - opens when clicking on cards in Browse Category
- **Node ID:** `420:2909`
- **URL:** https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=420-2909&t=TzCwzI6RZASLubyK-1
- **Notes:** Reusable 2-column audio listing UI. Use for category, deity, and Show all flows.

### Aarti & Bhajans player

- **Name:** Aarti & Bhajans Player
- **Node ID:** `423:4387`
- **URL:** https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=423-4387&t=TzCwzI6RZASLubyK-1
- **Notes:** Full player with cover art, title, singer, composer, like/share counts, progress bar, and audio controls.

### Player controls component variant

- **Name:** Player Controls
- **Node ID:** `423:4384`
- **URL:** https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=423-4384&t=TzCwzI6RZASLubyK-1
- **Notes:** Shows play and pause variants for player controls.

### Unified paywall reference

- **Name:** Prabhuji VIP Membership paywall
- **Node ID:** `493:3349`
- **URL:** https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=493-3349
- **Notes:** Known app-level unified paywall. This module uses it when a free user taps an audio item.

## Important Detected Nodes

| Area | Node ID | Notes |
|---|---:|---|
| Aarti & Bhajans module section | `683:5219` | Full module area containing related frames. |
| Main page | `412:2656` | Main browse screen. |
| Main page top nav | `412:2656` | Back arrow and title visible in rendered frame. Child node IDs were not exposed by harness. |
| Recently Played section | `412:2656` | Horizontal cards with Show all. Hide if empty. |
| Deities section | `412:2656` | Horizontal deity avatars. Tapping opens filtered listing. |
| Browse Categories section | `412:2656` | Category cards. Current visible categories are samples and CMS-controlled. |
| Browse Categories card area from brief | `412:2948` | Designer referenced this as the area users explore through categories. |
| Newly Added section | `412:2656` | Horizontal audio cards with Show all. |
| Most Played on Prabhuji section | `412:2656` | Horizontal audio cards with Show all. |
| Reusable listing page | `420:2909` | 2-column grid for category/deity/Show all results. |
| Listing page top nav | `420:2909` | Dynamic title example: Aarti. Child node IDs were not exposed by harness. |
| Listing audio grid cards | `420:2909` | 2-column artwork + title cards. Tapping applies playback access rule. |
| Full player | `423:4387` | Player UI with cover, title, metadata, engagement, progress, and controls. |
| Player controls | `423:4384` | Play and pause control variants. |
| Unified paywall | `493:3349` | App-wide VIP paywall used after free audio item tap. |

## Figma Implementation Notes

1. **Mini-player is not shown in the supplied Figma frames.**  
   The designer confirmed that audio should continue with an in-app mini-player when the user leaves the full player. This is Phase 1 behavior, but Design must provide a visual component before final UI build or Engineering must use the documented working assumption.

2. **Browse Categories are samples, not hardcoded.**  
   The visible cards are Prabhuji Originals, Stotram, Aarti, Chalisa, Mantra Jaap, and Katha. CMS must allow creating, editing, sorting, and hiding categories. Audio items need category tags.

3. **Deity cards open the same listing pattern.**  
   The visible deities are examples. CMS must control deity list, image, order, and active state. Audio items need deity/god tags.

4. **Use one reusable 2-column listing UI.**  
   The listing frame `420:2909` should be reused for category taps, deity taps, and Show all flows.

5. **No lock badges or Pro labels on browse surfaces.**  
   Even though playback is Pro-only, browse/discovery should stay free and calm. The paywall appears only after a free user taps an audio item.

6. **Player is Pro-only.**  
   The full player frame `423:4387` is unlocked for Pro users. Free users should not reach this screen unless they purchase successfully from the item-tap paywall flow.

7. **Current player does not include lyrics, repetition counter, or next-track card.**  
   Older product context mentioned these possibilities, but the current Phase 1 Figma does not show them. They are documented as Phase 2.

8. **Top-nav trailing icons appear in the Figma JSON component structure but not in the rendered screen.**  
   The snapshot shows only the back arrow and title. Do not implement gear/phone/pencil trailing actions unless Design confirms them.

9. **Some sample content uses placeholder metadata.**  
   Examples include singer/composer names and sample card labels. CMS should provide final title, cover art, singer, composer, duration, and counts.

10. **Spelling in sample titles may vary.**  
   Figma shows examples like “Hanuman Aarthi”. The module label should remain “Aarti & Bhajans”. Individual content titles should follow CMS-provided approved content spelling.

11. **Sacred image handling.**  
   Do not place aggressive overlays, lock badges, or paywall CTAs over deity artwork. Preserve sacred visual dignity.

12. **Player controls tap targets.**  
   Important playback controls should follow the app default 44px tap target guidance where possible.
