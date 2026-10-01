# CMS Framing-Label Localization — Architecture Decision Record

**Status**: Accepted (decision record; specs + code follow)
**Parent**: TAM-81 — Admin CMS epic (`docs/ADMIN-CMS-ARCHITECTURE.md`)
**Branch**: `TAM-81-admin-cms`
**Date**: 2026-07-16
**Author**: System Architect
**Trigger**: Product owner confirmed (2026-07-16) that CMS **framing labels must be translated per language**, not stored as a single string.

---

## 0. Context

The Prabhuji platform is **partially multilingual**. Three i18n mechanisms already exist in `apps/api/prisma/schema.prisma`, and the confirmed convention (`apps/api/CLAUDE.md` / TAM-57 / TAM-46) is **"per-`(entity, locale)` translation tables — never JSONB"**:

| # | Mechanism | Where it lives today | Verdict for this decision |
| - | --------- | -------------------- | ------------------------- |
| 1 | **Per-`(entity, locale)` translation table** | `Deity → DeityTranslation` (`@@unique([deityId, locale])`, `displayName`); `PaywallPlan → PaywallPlanTranslation` (4 localized fields per row); `PaywallBenefit/Paywall/PaywallLegalLinks` translations | **CHOSEN — standardize on this.** |
| 2 | **JSON `{locale: text}` map** | `core/horoscope` (`ZodiacSign.localizedDisplayName`, `HoroscopeStepConfig.localizedTitle`) | Deliberate, documented deviation (the served step array is itself JSON). **Not extended.** Horoscope stays as-is. |
| 3 | **Per-row `language` column** | `AudioItem`, `MantraAudioItem`, `Ringtone`, `StatusItem`, `BookContent` (each **content item** is single-language; the catalogue is filtered by the user's language) | **Correct for sung/recorded content. NOT in scope to change.** |

**8 client languages** (`apps/api/src/shared/language.schema.ts`): `hi, mr, gu, bn, or, ta, te, kn`. `en` is a **server-side fallback only** (it is the `DeityTranslation` fallback locale and is admissible in `adminLocale`, but no client ever requests it).

**Established fallback rule** (verified in code): the deity read resolves *requested locale → `en` → slug* (`deity.service.ts` `toLocalized`); the horoscope read resolves *requested → `hi` → `en`* (`horoscope.service.ts`). The two chains are inconsistent today — this decision standardizes the label chain (see [§3](#3-public-api-serving) and product question **P7**).

**Timing constraint that shapes everything**: the admin module CRUD (TAM-88…105) is being built **right now** against the existing single-string columns (`name`, `title`, `displayName`, `label`, …). The design below **must not force a rework of that in-flight CRUD.**

---

## 1. Decision — the uniform mechanism

> **Adopt per-entity translation tables (mechanism #1, consistent with `DeityTranslation` / `PaywallPlanTranslation`), applied ADDITIVELY: the existing single-string column is RETAINED as the fallback-locale value, and a new `<Entity>Translation` table carries per-client-language OVERRIDES only.**

Public read resolution is exactly:

```
label(requested_locale) = translation[requested_locale] ?? existing_column   (?? key, for keyed entities)
```

The existing column plays the role `DeityTranslation`'s `en` row plays for a deity — the always-present base string that guarantees a label always renders. Editors edit that base string through the **existing** CRUD field (unchanged); a **Translations sub-panel** adds per-language overrides.

### Why this shape

| Axis | Per-entity translation tables (CHOSEN) | Single generic `label_translations(entityType, entityId, field, locale)` (rejected) | Extend column + drop it into a table / migrate away the column (rejected) |
| ---- | -------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Consistency with the stated convention** | Identical to `DeityTranslation` + `PaywallPlanTranslation` already in the schema. Copy-paste of a proven, reviewed shape. | A **new** cross-cutting shape the codebase has never used — the spirit of "per-`(entity, locale)` tables" is violated even though it isn't JSONB. | Same table shape, but forces column removal. |
| **Table ownership / arch-boundaries** | Each translation table lives in the **owning module's** `repositories/`. Prisma stays in one layer per module. No `arch-boundaries.json` change (ADR §C5). | A **shared** write table owned by no module → a cross-module merge funnel, and a polymorphic `(entityType, entityId)` reference with **no FK** (the reluctant pattern used only for cross-module deity tags). Who runs its migrations? Who owns its repo? Breaks table ownership (admin ADR §B5). | Preserves ownership, but see the fatal cost below. |
| **Migration cost (~6 modules)** | ~9 small additive tables + migrations. Mechanical, disjoint per module → parallelizable. | 1 table, 1 migration — but every module's read path grows a polymorphic join + a service-side pivot (4 rows → 1 `HomeFeedItem`). | ~9 tables **plus** a data migration **plus** a rewrite of every in-flight create/update/read that touches the column. |
| **Hot-path read cost (home feed, section lists)** | One typed relation `include` filtered to the **requested** locale; at most **one** row per entity (the base column is the fallback, so no second fallback fetch is needed — cheaper than the deity read, which fetches requested+`en`). `@@unique([entityId, locale])` is the lookup index. A multi-field entity (`HomeFeedItem`) carries all its labels in **one** row per locale (like `PaywallPlanTranslation`). | Polymorphic join, `N` rows per entity where `N` = number of localized fields, then a GROUP/pivot in the service on the hottest paths. | Same as chosen, once migrated. |
| **Admin editing UX** | The `DeityTranslation` translations sub-resource (TAM-88 API / TAM-89 UI) is copied verbatim per entity. One reusable `<TranslationsField>`. | A bespoke editor keyed by `(field, locale)` — new UX, no exemplar. | Same as chosen. |
| **Backward-compat with in-flight CRUD** | **Zero rework** — the column and its CRUD stay; translations are purely additive. | Zero rework of columns, but the read paths change everywhere at once. | **Forces rework** of every in-flight create/update/read — the exact thing we must not do. |

The generic table is rejected primarily because it **breaks per-module table ownership** and introduces a polymorphic no-FK reference where none is needed (a label always belongs to exactly one module's entity). Migrating the column away is rejected because it **reworks the in-flight admin CRUD**.

### Note on the one difference from `DeityTranslation`

`Deity` has **no** `displayName` column — its `en` translation row *is* the base value. Our in-flight entities **do** have a base column, so we retain it as the fallback rather than forcing an `en`-row migration. This is still mechanism #1, in its additive form. For any *future* entity with no prior column, build it `DeityTranslation`-style (base value in a translation row). For these existing ones, the column is the base. **We never write a translation row whose locale duplicates the base column's role** — editors edit per-client-language rows (`hi`, `mr`, …); the base string is edited through the existing field.

---

## 2. Scope — the exact field list

CMS-authored, single-string today, **framing** copy (section/category/row/shortcut/banner/feed chrome), **not** a per-language content item and **not** already localized. Corrected against the schema (`schema.prisma`).

### IN SCOPE

| Module | Model → column(s) | New translation table (`@@unique([<fk>, locale])`, `onDelete: Cascade`) |
| ------ | ----------------- | ----------------------------------------------------------------------- |
| aarti | `AudioCategory.name`, `AudioCategory.description` (nullable) | `AudioCategoryTranslation { name, description? }` |
| aarti | `HomepageSection.title` | `HomepageSectionTranslation { title }` |
| mantras | `MantraCategory.displayName` | `MantraCategoryTranslation { displayName }` |
| mantras | `MantraHomepageSection.title` | `MantraHomepageSectionTranslation { title }` |
| wallpaper | `WallpaperHomepageRow.title` | `WallpaperHomepageRowTranslation { title }` |
| books | `BookSection.title` | `BookSectionTranslation { title }` |
| home | `HomeBanner.title` (nullable) | `HomeBannerTranslation { title }` |
| home | `HomeFeedItem.title`, `subtitle` (nullable), `label` (nullable), `ctaLabel`, `badgeLabel` (nullable) | `HomeFeedItemTranslation { title, subtitle?, label?, ctaLabel, badgeLabel? }` |
| home | `HomeShortcut.label` | `HomeShortcutTranslation { label }` |

**`HomeFeedItem.badgeLabel` invariant carries into translations**: the service contract is "`badgeLabel` non-null **exactly when** `badge` non-null; a badged row with no label is served with both nulled." Per-locale `badgeLabel` must obey the same rule at resolution time — a localized badge without a label is drawn with both nulled. (Enforced in the home service, not the schema.)

### EXPLICITLY OUT OF SCOPE (with the reason)

- **Content-item titles** — `AudioItem.title`, `MantraAudioItem.title`, `Ringtone.title`, `StatusItem.title`, `BookContent.title`, `BookSubBook.title`, `BookChapter.title`. These are **catalogue items**, single-language via the per-row `language` column (mechanism #3). The clean line is: **framing chrome is localized; individual item names are not.**
  - Caveat flagged as **P5**: `Wallpaper.title` has **no** `language` column and no translation table — a wallpaper title is currently un-localizable under *any* pattern. Out of scope for framing labels; noted for product.
- **Deity** (`DeityTranslation` — already localized), **Horoscope** (`ZodiacSign.localizedDisplayName`, `HoroscopeStepConfig.localizedTitle` — JSON map, mechanism #2), **Paywall** (`Paywall*Translation` — already localized).
- **Book CATEGORY titles** — the `BookCategory` enum (`Chalisa/Aarti/Kavach/Stotram`) rendered via the `BooksService.CATEGORY_TITLE` **server constant**, and `DEFAULT_SECTION_TITLE`. These are **not CMS columns** — they are code constants (admin ADR §E3 already defers making them CMS-editable). Localizing them requires first giving categories a table; see **P3**.
- **`StatusOverlayTemplate.title`** — exists, but is likely an **internal admin label**, not client-rendered chrome (`layout` is opaque JSON the client draws). Held pending **P2**; if product confirms it is user-facing, it folds into a status API ticket.
- **`HomeFeedItem.shareTitle` / `shareText`** — share-sheet copy. User-facing, but a different class from visible feed chrome; included/excluded per **P4**. The `HomeFeedItemTranslation` table is shaped to absorb them later without a second migration.

---

## 3. Public API serving

**Serving rule**: the read endpoints that emit framing labels gain an **optional `locale` query param** (the same convention `GET /deities?locale=` already uses). The service resolves each label server-side:

```
translation[requested_locale] ?? base_column   (?? stable key, for keyed entities where the column is nullable)
```

and emits **one already-resolved string per label**. **The wire never carries a `{locale: text}` map to the client.**

> **Status update — the convention is now enforced, not just documented.**
>
> This rule was written but not held: `core/mantras` and `core/status` shipped the param as **`language`**, so `GET /mantras/sections?locale=hi` was silently dropped and Hindi callers got base English labels with no error. The param declaration had also been copy-pasted across ~15 route schemas, and modules disagreed on validation (most 400'd an unknown code; aarti and horoscope fell back gracefully).
>
> Three things changed:
>
> 1. **One definition** — `shared/schemas/locale.ts` exports `localeQuery` / `requiredLocaleQuery`; every public read schema composes it via `.extend(…​.shape)`. All 21 public params now emit the identical `{type: string, minLength: 2, maxLength: 10}`, which also removed the `$ref` vs `allOf: [$ref]` split between required and optional params.
> 2. **Validation is TOLERANT** — an unsupported code is a no-match resolving to the base column, never a `400` (aarti's and horoscope's posture, generalized). Write paths keep the strict `LanguageCodeSchema`. Two integration tests that asserted the old `400` (`deity.routes` / `paywall.routes`) were inverted.
> 3. **The supported set is served** — `GET /languages` (unauthenticated, `core/languages`) emits `SUPPORTED_LANGUAGES`, the same constant `LanguageCodeSchema` derives from, so a client can never be offered a language the write path would reject. Mobile holds no list at all; admin holds English labels only, in an exhaustive `Record<LanguageCode, …>` keyed off the emitted contract so drift is a typecheck failure.
>
> Admin **list filters** deliberately keep `language`: on that surface `locale` already means the translation-row key (`/admin/…/:id/translations/:locale`).

### The mobile read contract stays backward-compatible

- **No response schema changes.** `HomeFeedItem.title` is still a single `string` on the wire; `AudioCategory.name` is still a single `string`; etc. The app keeps reading one `title`.
- The only contract delta is a **new optional request query param** (`locale`) on the affected read operations. A querystring param is **not** a schema component — so:
  - **`openapi.public.json` gains no new component schema**, and
  - **the Dart generator emits no new model** (`--global-property models` emits a model *per schema*, not per query param). **No Dart-client bloat, no APK growth.**
- **Absent `locale` → the base column** (today's exact behaviour). The change is strictly additive; an un-updated client is unaffected.

### Fallback chain to standardize (product input P7)

The label chain is `requested → base_column`. Because the base column holds the canonical string, this is equivalent to `requested → <fallback-locale> → (key)`. The platform currently disagrees on the fallback locale (`deity` = `en`, `horoscope` = `hi`). **Recommendation: adopt `en` as the label fallback locale**, matching `DeityTranslation` (the pattern being standardized on) — but this depends on **what language the existing seed strings are actually in** (**P1**).

---

## 4. Admin editing UX

Mirror the **deity translations sub-resource** — TAM-88 (`deity.admin.*`) API and TAM-89 (`apps/admin`) UI — verbatim. That is the exemplar; do not invent a second shape.

**API (per entity, under `/admin/<mod>/<entity>/:id`):**

| Verb | Path | Behaviour |
| ---- | ---- | --------- |
| `GET` | `/translations` | all locale rows (not localized) |
| `POST` | `/translations` | **upsert** on `(entityId, locale)` — idempotent, saving twice never duplicates |
| `PATCH` | `/translations/:locale` | update one locale's fields |
| `DELETE` | `/translations/:locale` | hard-delete one row (legitimate — the FK is `onDelete: Cascade`, exactly as `DeityTranslation`) |

- Reuse `adminLocale` (`en` + the 8 client languages from `LanguageCodeSchema`) so an editor can never write a locale no client can request.
- Reuse `.strict()` write bodies, the `updatedAt` precondition posture, and `adminEnvelope` from `deity.admin.schemas.ts`.
- Multi-field translation bodies (`AudioCategory` = name+description; `HomeFeedItem` = several) carry all label fields for the locale, like `PaywallPlanTranslation`.
- Admin reads remain **not** Pro-gated; the translation services **never call the subscription facade** (admin ADR §C1).

**UI:** one reusable **`<TranslationsField>`** (generalized from the deity translations editor TAM-89 builds) — a set of repeated locale rows inside the existing `<EntityForm>`. The **base field stays exactly as the in-flight CRUD renders it today** (it edits the base column); the `<TranslationsField>` is an additive "Translations" section. Mutations follow the D3 pattern (TanStack Query, `invalidateQueries`, `sonner` toasts, 409 conflict handling).

---

## 5. Mobile impact

**Structurally nothing.** The app already persists the user's `selectedLanguage` (TAM-44).

- **No response-contract change** → the Dart models and every existing screen keep working untouched.
- To *receive* localized labels, the app threads its `selectedLanguage` into the framing-label read calls as `?locale=` (the same value it already holds). Until it does, users see the base-column string — i.e. **today's behaviour**. This is a small, optional, non-breaking mobile change that can land anytime after the API tickets.
- No new models, no APK growth ([§3](#3-public-api-serving)).

---

## 6. Migration & rollout

- **Additive, expand-only migration**: create the `<Entity>Translation` tables. **No existing column is touched.** Old tasks ignore the new tables → safe under TAM-79's rolling deploy; no downtime.
- **No backfill is required for correctness** — the base column is the fallback, so a zero-translation entity still renders. This is what makes the design safe to ship incrementally.
- **Optional convenience seed/backfill** (its own ticket): copy each existing column value into a translation row for the assumed **source locale** so editors start from real text rather than a blank grid. This is a UX nicety, **not** a correctness step, and it depends on **P1** (what language the seed strings are in). It must be **empty-fill / idempotent** — mirroring TAM-80's boot-seeder posture (never overwrite an edited row).
- **Composes with the in-flight admin epic**: the module API tickets (TAM-88/90/92/94/98/102/104…) that build base CRUD are **not** modified — the label tickets *extend* each module with a translations sub-resource and the read-path localization. Disjoint trees → parallel with the rest of the epic.

---

## 7. Ticket breakdown

Numbered from **TAM-108** — the real epic tops out at **TAM-106** (`admin-cms-final-integration`); TAM-107 was renumbered/superseded (see that spec's provenance note), so 108 is the first clean number.

**Foundation (build once — gates the module tickets)**

| Ticket | Title | Surface |
| ------ | ----- | ------- |
| **TAM-108** | Label-localization foundation: shared `resolveLocalizedLabel(translations, locale, fallback)` helper; the reusable `locale` read-query convention; lift the deity translations sub-resource into a reusable admin schema/route shape; **this doc**. | api / shared |

**Per-module API (parallel after TAM-108 — disjoint module trees)**

| Ticket | Module — new table(s) | Surface |
| ------ | --------------------- | ------- |
| **TAM-109** | Aarti — `AudioCategoryTranslation`, `HomepageSectionTranslation` + admin sub-resource + read localization | api |
| **TAM-110** | Mantras — `MantraCategoryTranslation`, `MantraHomepageSectionTranslation` | api |
| **TAM-111** | Wallpaper — `WallpaperHomepageRowTranslation` | api |
| **TAM-112** | Books — `BookSectionTranslation` | api |
| **TAM-113** | Home — `HomeBannerTranslation`, `HomeFeedItemTranslation`, `HomeShortcutTranslation` (incl. the `badge/badgeLabel` invariant per locale) | api |

**Admin UI**

| Ticket | Title | Surface |
| ------ | ----- | ------- |
| **TAM-114** | Reusable `<TranslationsField>` (generalize the deity translations editor from TAM-89). Depends on **TAM-86** (admin UI foundation) + **TAM-108**. | admin |
| **TAM-115** | Wire `<TranslationsField>` into the aarti / mantras / wallpaper / books / home `<EntityForm>`s. Depends on **TAM-114** + each module's API ticket. (May split per module for parallelism.) | admin |

**Backfill · Mobile · Closeout**

| Ticket | Title | Surface |
| ------ | ----- | ------- |
| **TAM-116** | Idempotent, empty-fill seed/backfill of fallback-locale rows from existing columns (gated on **P1**). Depends on TAM-109…113. | api / seed |
| **TAM-117** | Mobile: thread `selectedLanguage` → `?locale=` on framing-label reads; regenerate Dart; **assert zero new models / no response-contract change**. Depends on TAM-109…113 + codegen. | mobile |
| **TAM-118** | Closeout: `pnpm verify` (drift on **both** OpenAPI docs), **fallback regression sweep** (every label still renders with `locale` absent), `PHASE-NOTES.md` update, one PR. | all |

**Dependencies & parallelism**

```
TAM-108 ─┬─► TAM-109 ┐
         ├─► TAM-110 ├─ (API track, parallel; only openapi.json regen conflicts — mechanical)
         ├─► TAM-111 ┤
         ├─► TAM-112 ┤
         └─► TAM-113 ┘        each → TAM-116 (backfill) & TAM-117 (mobile)
TAM-86 + TAM-108 ─► TAM-114 ─► TAM-115  (UI track; each UI wiring waits on its module's API ticket)
all ─► TAM-118
```

- The **API track** (TAM-109…113) parallelizes: disjoint `core/<mod>/` trees; the only shared file is `openapi.json` (regenerated — conflicts are mechanical, resolved by re-running the codegen chain).
- Each **contract change regenerates the codegen chain in order** and commits the diffs (`api:openapi` → `api-client:generate` → `mobile:generate`) — `pnpm check:openapi` gates both docs.
- **No `arch-boundaries.json` change** — translation tables live in each module's existing `repositories/`; admin translation routes obey the same Route→Controller→Service→Repository layering (admin ADR §C5).

---

## 8. Product decisions required (flag before the tickets they gate start)

| # | Question | Blocks | Why it is not an engineering call |
| - | -------- | ------ | --------------------------------- |
| **P1** | **What language are the existing seed label strings actually in** (English placeholders vs Hindi)? This sets the label **fallback locale** and the backfill's source locale. | TAM-108 (fallback choice), TAM-116 (backfill) | We can't infer intent from placeholder copy; wrong guess mislabels every existing string. |
| **P2** | Is `StatusOverlayTemplate.title` **client-rendered** or an internal admin label? | scope (a possible status ticket) | Determines whether it is framing chrome at all. |
| **P3** | Localize the **Book category titles** (`BookCategory` enum via `CATEGORY_TITLE` server constant) and `DEFAULT_SECTION_TITLE` now, or defer? Needs a categories table first (already deferred, admin ADR §E3). | a possible TAM-119 | It is code-constant → CMS-table conversion, a separate scope decision. |
| **P4** | Localize `HomeFeedItem.shareTitle` / `shareText` (share-sheet copy) and `label`, or only the visible title/subtitle/ctaLabel/badgeLabel? | TAM-113 | Share copy is user-facing but higher scope; the table absorbs it later without a second migration either way. |
| **P5** | Do **language-less content items** (`Wallpaper.title`) need localized titles? They have neither a `language` column nor a translation table today. | out of scope now | Per-item title localization is a different mechanism from framing labels; needs a product call on whether it's wanted. |
| **P6** | Localize `AudioCategory.description` (longer body copy) as well as `name`? | TAM-109 | Cheap to include; product should confirm the description is worth translating. |
| **P7** | Standardize the platform **fallback locale** on `en` (matching `DeityTranslation`), reconciling it with horoscope's `hi→en`? | TAM-108 | A cross-module consistency call; today `deity` and `horoscope` disagree. |

---

## References

- `apps/api/prisma/schema.prisma` — `DeityTranslation` (exemplar), `PaywallPlanTranslation` (multi-field row), all in-scope columns
- `apps/api/src/core/deity/**` — the translation-table reference (service fallback, repository upsert, `deity.admin.*` sub-resource) — **copy this shape**
- `apps/api/src/core/horoscope/**` — the JSON-map reference (mechanism #2, not extended)
- `apps/api/src/shared/language.schema.ts` — the 8 client languages (single source of truth)
- `docs/ADMIN-CMS-ARCHITECTURE.md` — the parent admin epic (§C1 admin services not Pro-gated, §C3 `updatedAt` precondition, §C5 no arch-boundary change, §E3 deferred category-title CMS)
- `apps/api/CLAUDE.md` — layering, "per-`(entity, locale)` translation tables — never JSONB"
