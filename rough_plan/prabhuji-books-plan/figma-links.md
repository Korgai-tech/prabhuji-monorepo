# Figma Links: Books & Scriptures

## Primary Module

- **Module:** Books & Scriptures
- **Figma section:** Books
- **Node ID:** `650:4182`
- **URL:** https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=650-4182&t=8GTJCrqUNd9uTCCg-1

## Screens / Frames Detected

| Screen / Frame | Node ID | Purpose |
|---|---:|---|
| Books Home | `534:5061` | Primary Books tab screen with library, categories, newly added books, and bottom nav. |
| Categories / Listing | `562:5565` | Two-column content grid used for Chalisa and reusable for Aarti, Kavach, Stotram, and View All Books. |
| Book Contents | `639:3947` | Major book contents screen with book cover, Start Reading button, and kanda/chapter list. |
| Book Read View | `620:3904` | Major book reader with title, Listen Audio, body text, Previous/Next controls. |
| Non-Book Read View | `647:4133` | Direct reader for smaller content such as Chalisa, Aarti, Kavach, and Stotram. |
| Chapters Drawer | `637:4191` | Reader drawer for chapter navigation. |
| Font Size Adjust | `637:4463` | Reader text-size control overlay. |
| Book Component Set | `562:5675` | Book card component variants: Book, Book-lg, sm. |
| Book Listen Component Set | `663:4297` | Listen/Pause/Play audio button component variants. |

## Important Figma Reference

### Category / View All listing reference

- **Node ID:** `562:5565`
- **URL:** https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=562-5565&t=8GTJCrqUNd9uTCCg-1
- **Usage:** Reuse this layout for:
  - Chalisa listing
  - Aarti listing
  - Kavach listing
  - Stotram listing
  - View All Books listing

## Design Notes from Figma

The Figma section contains an important note:

> Books like Ramayan and Bhagavat Gita are divided into sub-books in the app. These open a sub-book/contents view. Contents in categories like Chalisa, Aarti, Kavach and Stotram do not have this view and open directly as ebook reader.

This is reflected in the final spec as two content types:

1. `major_book`
2. `direct_scripture`
