# Design Execution Package v1.0: Books & Scriptures

## 1. Metadata

| Field | Value |
|---|---|
| App | Prabhuji |
| Module | Books & Scriptures |
| Package Version | 1.0 |
| Status | Approved for MVP specification, pending engineering feasibility checks |
| Access Model | Pro-only reading feature |
| Primary Figma Node | `650:4182` |
| Primary Figma Link | https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=650-4182&t=8GTJCrqUNd9uTCCg-1 |
| View All / Category Listing Figma Node | `562:5565` |
| View All / Category Listing Figma Link | https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=562-5565&t=8GTJCrqUNd9uTCCg-1 |

---

## 2. Module Summary

Books & Scriptures is a premium devotional reading feature inside Prabhuji. It allows devotees to browse spiritual books, scriptures, and short devotional texts such as Chalisa, Aarti, Kavach, and Stotram.

The feature is planned as **Pro-only for reading**, but discovery is free. Free users can enter the Books tab, browse the library, view categories, and see available books/content. When a free user taps any actual book/content item to open/read it, the app opens the existing unified Prabhuji paywall.

MVP principle:

> Discovery is free. Reading is Pro.

---

## 3. Product Intent

The module should make Prabhuji feel like a complete devotional sanctuary by giving users access to spiritual reading content in one place. Users should be able to browse available devotional books, explore categories, and read content in a calm, mobile-friendly reader experience if they are Pro users.

This module should increase the perceived value of Pro by making spiritual books and scriptures feel like a meaningful premium benefit.

---

## 4. User Problem

Devotional users often need to search across PDFs, websites, YouTube descriptions, WhatsApp forwards, or multiple apps to read spiritual texts. This creates friction, poor readability, and inconsistent content quality.

Prabhuji should provide one simple, organized, readable library for devotional texts.

---

## 5. Target Users

Primary users are devotional content consumers in India who want to read Hindu spiritual books and texts on mobile. The audience may include older users, so readability, simplicity, low cognitive load, and offline tolerance are important.

---

## 6. Business Goals

1. Increase Pro subscription value.
2. Encourage upgrade after users discover meaningful devotional content.
3. Improve time spent with high-intent devotional content.
4. Support daily/weekly devotional reading habits over time.
5. Build a content library foundation that can later support bookmarks, progress, search, sharing, and continue reading.

---

## 7. MVP Access Rules

### Free users can view

- Books tab from bottom navigation.
- Books Home.
- Books carousel/library previews.
- Browse Categories section.
- Major category pages: Chalisa, Aarti, Kavach, Stotram.
- View All Books listing.
- Book/content cover thumbnails and titles.

### Free users cannot access

- Book Contents page.
- Reader mode.
- Chapter content.
- Listen Audio.
- Chapters drawer.
- Font size controls.
- Previous/Next reader navigation.

### Free-user paywall trigger

For MVP, free users should see the **unified paywall directly** when they tap any actual book/content item card.

Examples:

- Free user taps Valmiki Ramayan card -> unified paywall.
- Free user taps Shri Hanuman Chalisa card -> unified paywall.
- Free user taps an item inside Aarti/Kavach/Stotram listing -> unified paywall.
- Free user taps a content thumbnail from View All Books -> unified paywall.

No contextual pre-paywall explanation is required in MVP. Contextual explanation can be Phase 2.

### Pro users can access

- Book Contents.
- Reader.
- Chapter navigation.
- Listen Audio for eligible major books.
- Font size adjustment.
- Cached/offline reading where technically feasible.

---

## 8. Content Model

The Books module has two content types.

### 8.1 Major Books

Examples:

- Ramayan.
- Bhagavad Gita.
- Other large spiritual books with sub-books/kandas/chapters.

Structure:

```text
Major Book -> Sub-book/Kanda -> Chapter -> Reader
```

Major books have:

- Book cover.
- Book title.
- Sub-book/kanda list.
- Chapter list.
- Chapter content.
- Listen Audio support.

Pro user flow:

```text
Tap major book -> Book Contents -> Start Reading / Chapter -> Reader
```

Free user flow:

```text
Tap major book -> Unified Paywall
```

### 8.2 Direct Scripture Content

Major categories:

- Chalisa.
- Aarti.
- Kavach.
- Stotram.

These categories contain smaller devotional items shown as thumbnails in a two-column grid.

Structure:

```text
Category -> Content Item -> Reader
```

Pro user flow:

```text
Tap category -> Category Listing -> Tap content item -> Direct Reader
```

Free user flow:

```text
Tap category -> Category Listing -> Tap content item -> Unified Paywall
```

---

## 9. Key Screens

### 9.1 Books Home

Purpose: Allow users to discover the Books module and browse available content.

Visible sections:

- Top app bar/title: Books.
- Horizontal books carousel.
- Show All / View All link.
- Browse Categories section.
- Category cards: Chalisa, Aarti, Kavach, Stotram.
- Newly Added Books section.
- Bottom navigation with Books active.

Functional behavior:

- Tapping Show All / View All opens All Books listing using the same two-column grid pattern as category listing.
- Tapping a major category opens that category listing.
- Tapping any book/content card:
  - Free user: unified paywall.
  - Pro user: open Book Contents if it is a major book; open Reader if it is direct scripture content.

---

### 9.2 View All Books Listing

Purpose: Show all available books in a 2-column grid.

Figma reference: `562:5565` category listing layout.

Behavior:

- Opened from Show All / View All on Books Home.
- Uses two items per row.
- Shows book cover and title.
- Free user tapping any item opens unified paywall.
- Pro user tapping a major book opens Book Contents.

---

### 9.3 Category Listing

Purpose: Show all smaller devotional content items inside a selected category.

Applies to:

- Chalisa.
- Aarti.
- Kavach.
- Stotram.

Visible UI:

- Internal page top nav with back button.
- Category title, e.g. Chalisa.
- Two-column grid.
- Thumbnail/book cover.
- Title under each item.

Behavior:

- Free user taps item -> unified paywall.
- Pro user taps item -> direct reader.
- Back returns to Books Home.

---

### 9.4 Book Contents

Purpose: Show structured contents for major books after Pro access is confirmed.

Visible UI:

- Book cover.
- Book title.
- Start Reading CTA.
- Sub-book/kanda list.
- Chapter counts.

Behavior:

- Pro user only in MVP.
- Start Reading opens reader at first/default chapter.
- Tapping a kanda/sub-book opens the relevant chapter/content structure.
- Back returns to Books Home, All Books listing, or previous source screen.

---

### 9.5 Reader

Purpose: Provide calm, readable devotional text experience.

Visible UI:

- Internal page top nav.
- Chapter title.
- Listen Audio button for eligible major books.
- Hindi/Devanagari body text.
- Previous and Next buttons.
- Warm reading background.
- Aa / text setting control.
- Chapter drawer control.

Behavior:

- Pro users only.
- Scroll vertically through chapter content.
- Listen Audio starts audio where available.
- Previous/Next navigates inside reader only.
- Font size settings overlay changes text size.
- Chapter drawer opens inside reader only.
- Reader should avoid noisy engagement and commercial UI.

---

### 9.6 Chapters Drawer

Purpose: Let Pro users jump between chapters while reading major books.

Behavior:

- Available inside reader only.
- Shows book cover, title, sub-book/kanda metadata, total chapters, and chapter list.
- Active chapter is highlighted.
- Tapping chapter switches reader content.

---

### 9.7 Font Size Adjustment

Purpose: Improve reading comfort.

Behavior:

- Available inside reader only.
- User can adjust font size using slider.
- App should store font size preference if technically feasible.
- Recommended MVP persistence: local device storage.
- Recommended scope: global across reader, not per book.

---

### 9.8 Offline Cached Reading

Purpose: Support older users or users with poor connectivity while traveling.

MVP preference:

- Support offline cached reading if technically feasible.
- Recommended MVP implementation: cache text content that has already been opened or loaded.
- Manual download and audio caching can be Phase 2.

Behavior:

- If opened content is cached, allow user to read offline.
- If content is not cached and user is offline, show offline unavailable state with retry.

---

## 10. Audio Rules

Audio is available only for major big books under the Books category, including their sub-books/kandas/chapters.

Audio is not required for direct scripture categories in MVP:

- Chalisa.
- Aarti.
- Kavach.
- Stotram.

Behavior:

- Pro users can use Listen Audio where audio exists.
- If audio does not exist, hide Listen Audio or show unavailable state.
- Free users should not access audio; tapping content opens paywall before reaching reader/audio state.

---

## 11. CMS Requirements

All book and scripture content comes from CMS.

CMS must provide:

- Content ID.
- Content type: major_book or direct_scripture.
- Category.
- Title.
- Cover image.
- Author/source metadata where available.
- Language.
- Sub-book/kanda list for major books.
- Chapter list.
- Chapter content.
- Audio URL for eligible major books.
- Sort/order metadata.
- Pro access flag.
- Offline cache eligibility flag if needed.

---

## 12. Not in MVP / Phase 2

The following are not required for MVP:

- Contextual pre-paywall explanation.
- Reading progress / Continue Reading.
- Search inside Books.
- Bookmark/save chapter.
- Share quote.
- Share chapter.
- Manual book download.
- Audio offline caching.

---

## 13. Analytics

Required MVP events:

- `books_tab_opened`
- `books_home_viewed`
- `books_show_all_tapped`
- `books_all_listing_viewed`
- `books_category_tapped`
- `books_category_viewed`
- `book_card_tapped`
- `books_paywall_triggered`
- `books_paywall_viewed`
- `book_contents_viewed`
- `book_start_reading_tapped`
- `book_reader_opened`
- `book_audio_listen_tapped`
- `book_chapter_drawer_opened`
- `book_chapter_selected`
- `book_font_settings_opened`
- `book_font_size_changed`
- `book_previous_tapped`
- `book_next_tapped`
- `books_offline_cache_hit`
- `books_offline_cache_miss`

---

## 14. Success Metrics

Primary metrics:

- Books tab open rate.
- Book/category listing view rate.
- Book/content card tap rate.
- Paywall trigger rate from Books.
- Paywall conversion rate from Books.
- Pro reader open rate.

Secondary metrics:

- Reading session duration.
- Chapter navigation usage.
- Listen Audio usage.
- Font size adjustment usage.
- Offline cache usage.

Guardrail metrics:

- Paywall bounce rate from Books.
- Reader exit within first 10 seconds.
- Content load failure rate.
- Offline cache miss rate.
- Complaints around Hindi readability or content access confusion.

---

## 15. Design Principles

- Discovery should feel free and inviting.
- Reading should feel premium, calm, and devotional.
- Paywall should appear on clear content intent, not on Books tab entry.
- Avoid guilt-based devotional monetization.
- Do not make the user feel they are paying to worship.
- Keep reader simple and readable for older users.
- Preserve Devanagari readability.
- Avoid noisy engagement inside reader.

---

## 16. Handoff Status

This module is ready as a machine-readable MVP specification with the following engineering/content confirmations still needed:

1. CMS schema finalization.
2. Offline cache feasibility and scope.
3. Local storage implementation for font size preference.
4. Exact handling of audio unavailable state.
5. First/last chapter Previous/Next disabled or replacement behavior.

