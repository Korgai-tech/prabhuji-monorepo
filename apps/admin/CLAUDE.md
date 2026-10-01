# apps/admin

React 19 + Vite + TypeScript admin SPA (the Prabhuji CMS). Tailwind CSS v4 (`@tailwindcss/vite`, theme in `src/styles.css`), shadcn-style UI primitives, TanStack Query v5, react-router-dom v6.

Authority: `docs/ADMIN-CMS-ARCHITECTURE.md` (§C2, §C3, §D). Foundation ticket: `specs/TAM-86-admin-ui-foundation.md`.

> **No Figma applies to this app.** There is no Figma file for admin and none is coming. The bar is: consistent with the primitives in `src/components/ui/`, accessible, and using the `src/styles.css` tokens (no ad-hoc hex literals). `pnpm check:no-hex-literals` / `check:figma-tokens-committed` are **mobile-scoped** (`verify:mobile`) — do not point them at this app.

## Structure

- `src/app/router.tsx` — the route tree. `/login` is public; **everything else** hangs off one `<AdminRoute>`-guarded `<AdminLayout>` branch.
- `src/app/admin-layout.tsx` — the shell: sidebar + header (user email, logout) + `<Outlet/>` + `<Toaster/>`.
- `src/components/nav/nav-config.ts` — the grouped sidebar tree.
- `src/auth/` — `auth-context.tsx` (JWT in localStorage `admin_token`), `protected-route.tsx` (logged in?), `admin-route.tsx` (**admin?**), `admin-session.ts` + `use-admin-session.ts`.
- `src/lib/api.ts` — the **ONLY** HTTP entry point: typed openapi-fetch from `@repo/api-client`; injects the Bearer token, redirects to `/login` on 401. Never hand-roll `fetch`; if a path/type is missing, **regenerate the client** (root `CLAUDE.md` → codegen), never cast.
- `src/lib/api-result.ts` (`unwrap`) · `src/lib/api-error.ts` (`ApiError`) · `src/lib/query-keys.ts` (`adminKeys`) · `src/lib/toast.ts` (`notify`) · `src/lib/query.ts` (QueryClient).
- `src/components/data-table/` — `<DataTable>` + `useDataTableState`.
- `src/components/entity-form/` — `<EntityForm>`.
- `src/components/ui/` — cva-based primitives; compose classes with `cn()` from `src/lib/utils.ts`.
- `src/features/<feature>/` — page + hooks (+ colocated `*.test.tsx` where tests exist).

API responses use the `{success,message,data}` envelope from `apps/api`; errors are `{success:false,message,data:null,errorCode?}`.

## Adding a module UI page (TAM-89 … TAM-105)

1. **Hook** → `src/features/<feature>/use-<entity>.ts`. Copy `src/features/users/use-users.ts` — it is the reference.
2. **Route** → add `{ path: 'aarti/items', element: <AartiItemsPage /> }` to the `children` array in `router.tsx`. Paths are **relative** (no leading `/`). **Do not add another `<ProtectedRoute>`/`<AdminRoute>`** — you are already inside one.
3. **Nav** → flip your entry in `nav-config.ts` from `status: 'planned'` to `'ready'`. Don't restructure the groups.
4. **List** → configure `<DataTable>`. **Form** → configure `<EntityForm>`.

## The rules (these are what keep 9 parallel tickets consistent)

### Server state

**All** server state goes through TanStack Query — **no ad-hoc `useEffect` fetching**, no `fetch` outside `lib/api.ts`. (The single deliberate exception is TAM-87's presigned S3 PUT, which must **not** carry our Bearer token to a third-party origin.)

### Query keys — `['admin', '<entity>', ...]`

Always via `adminKeys` (`src/lib/query-keys.ts`), never hand-written arrays:

| Helper | Key | Use |
| ------ | --- | --- |
| `adminKeys.session()` | `['admin','session']` | the `<AdminRoute>` whoami |
| `adminKeys.entity(e)` | `['admin',e]` | **the invalidation prefix** |
| `adminKeys.list(e, params)` | `['admin',e,'list',params]` | a list view |
| `adminKeys.detail(e, id)` | `['admin',e,'detail',id]` | one row |

TanStack matches by prefix, so **one** `invalidateQueries({ queryKey: adminKeys.entity('deities') })` invalidates every page/sort/filter of the list plus every detail. That is the whole point of the convention — mutations invalidate the **entity prefix**, not a specific list key.

### `unwrap()` — envelope + real errors

```ts
export function useDeities(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list('deities', state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/taxonomy/deities', { params: { query: toListQuery(state) } }),
        'Failed to load deities',
      ),
  });
}
```

`unwrap` checks `error || !data?.success`, returns `data.data`, and on failure throws an **`ApiError` carrying `status` + `errorCode`**. Do **not** throw bare `new Error('Failed…')` — that discards the status, and `<EntityForm>` then cannot detect a **409 `STALE_WRITE`**, and the editor never sees the server's real message.

### Mutation feedback — every mutation surfaces failure

Success → success toast + `invalidateQueries`. Failure → error toast. **Never reset a form before the mutation resolves successfully.** `<EntityForm>` does all of this; use `notify` (`src/lib/toast.ts`) directly only for non-form mutations (row actions, deactivate).

### Optimistic concurrency — 409 `STALE_WRITE` (ADR C3)

Every `PATCH`/`DELETE` carries the row's last-known **`updatedAt`**; a 0-count write → the API returns **409 `STALE_WRITE`**.

- `<EntityForm mode="edit">` **requires `updatedAt` at compile time** (the props are a discriminated union on `mode`) and merges it into the submitted payload. Omitting it is a type error, not a silent last-write-wins bug.
- The 409 is handled **once, inside `<EntityForm>`**: a conflict toast with a **Reload** action + an inline banner, wired to your `onConflict` (refetch the row). Do **not** handle 409 per module — it will be handled inconsistently or not at all.
- Your row-action mutations (e.g. deactivate) must pass `updatedAt` too, and can use `isConflictError(error)` + `notify.conflict(...)`.

### `<DataTable>` (`src/components/data-table/`)

Presentational and transport-agnostic — it owns no query. `useDataTableState` owns the page/pageSize/sort/filters; `toListQuery(state)` turns that into the querystring.

- **Offset** pagination, `{items,total,page,pageSize}` (ADR C2) — editors need "Page 7 of 23" and a total. A **considered divergence** from the mobile keyset convention; do not "fix" it.
- A column is sortable **only** if you give it a `sortField`, and that field **must** be on the entity's TAM-82 `sortQuery` allowlist — the UI must never offer a sort the API 400s on.
- Sort/filter/pageSize changes reset to page 1.
- **No table library.** `patterns_library/ui/data-table.md` forbids adding one; this is a semantic Tailwind `<table>`. Outgrowing it is a System Architect decision + a pattern update, not a `pnpm add`.

### `<EntityForm>` (`src/components/entity-form/`)

Field config + a Zod schema that **mirrors** the server's. Client Zod is **fast feedback, never the enforcement point** — the API's Zod at the route boundary is authoritative. `onSubmit` must return a promise that **rejects** on failure (use `mutateAsync` + `unwrap`), or the error/409 paths cannot fire.

`type: 'custom'` + `render` is the escape hatch for bespoke controls (this is how **TAM-87's `<MediaUploadField>`** plugs in) — it receives `{ id, name, value, onChange, disabled, invalid, describedBy, values }` and needs no change to `<EntityForm>`.

`values` is **every** field's current value, live, for a custom field that must READ ACROSS the form — a preview that composes several inputs into what the end user will actually see (TAM-174's shortcut tile: gradient + label + icon). It is read-only by convention: `onChange` still writes only that field. A custom control that wants to write elsewhere is a sign those fields should be one field holding an object. A render synthesized OUTSIDE an `<EntityForm>` (the hand-rolled repeater rows in `paywall-page`, `utm-overrides-page`) passes `values: {}` — there are no siblings to read.

⚠️ `defaultValues` is **snapshot on mount** and not re-synced when the prop changes (so a background refetch can't wipe an edit mid-typing). To rebind to freshly-loaded data, **remount**: `<EntityForm key={row.updatedAt} … />`. After a 409 the default is what you want — the editor's values are kept while `updatedAt` refreshes, so Save re-applies their edit against the new precondition.

There is **no react-hook-form** and no shadcn `<Form>` context here — `src/components/ui/form.tsx` is the a11y wiring only (`id` ↔ `<label htmlFor>`, `aria-describedby`, `aria-invalid`, `role="alert"`). Adding RHF is a System Architect call + a pattern update.

### `<MediaUploadField>` (`src/components/media/`) — TAM-87

The **only** place in the SPA that turns a file into a stored URL. It is a
`type: 'custom'` field of `<EntityForm>` — it holds a **URL, not a file**. Wire it
with the `mediaField(...)` adapter:

```tsx
import { mediaField, AUDIO_TYPES } from '@/components/media';

fields={[
  { name: 'audioUrl', label: 'Audio', type: 'custom', required: true,
    render: mediaField({ module: 'aarti', entity: 'audioItem', field: 'audioStreamUrl' }) },
]}
// schema mirror: audioUrl: z.string().url() (required → empty blocks submit)
```

Flow: pick → **client pre-check** (type/size, fast feedback only) → `POST /admin/media/presign` **through `api`** → **direct S3 PUT** → preview. It calls the
field's `onChange(publicUrl)` **only after the PUT succeeds**; until then the value
stays empty, so a `z.string().url()` mirror **blocks submit** — the "submitted before
upload finished" guard, with **no change to `<EntityForm>`**. Preview is per media
class (`<img>` / `<audio controls>` / `<video controls>`). **Optimise leg (TAM-267):**
when presign answers `processing: true` (API flag `MEDIA_OPTIMIZE_UPLOADS`, heavy
video/audio fields only) the PUT went to a staging key; the field shows
"Optimising…" and polls `GET /admin/media/status?key=` **through `api`** every 2 s,
calling `onChange` only once `ready` (gives up after 10 min; stops on unmount/reset).
`accept` is resolved from
the `(module, entity, field)` mirror in `media-constraints.ts` (a hand-maintained
mirror of TAM-84's server allowlist — **DRIFT RISK**, server wins); pass `accept` to
override. **Replace** mints a new key server-side and orphans the old object by
design (A-R3) — the widget **never deletes**.

### The one deliberate `fetch`/XHR exception to `lib/api.ts`

`lib/api.ts` is the only HTTP entry point for **OUR** API. The **single** exception
is `use-media-upload.ts`'s presigned **PUT to S3**: a **bare `XMLHttpRequest`** (XHR,
because `fetch` can't report upload progress) that carries **NO Authorization
header** — sending our admin JWT to an S3/CloudFront origin would leak an admin
credential to a third party, and an S3 403 would trip the 401→`/login` redirect. The
`Content-Type` on the PUT must equal what was sent to presign (it is a **signed
header** — a mismatch is an S3 403). This exception is **scoped to that component and
never generalized**; `uploadUrl` (a 5-minute write capability) is never logged or
displayed.

### Language codes — `src/lib/languages.ts`, never hardcoded

Every language dropdown, multi-select, chip label and `z.enum` sources from **`@/lib/languages`**. It used to be hand-copied across nine files (`status`, `aarti`, `wallpaper`, `ringtone`, `mantras`, `books` ×2, `taxonomy`, `horoscope`, `components/translations`), each free to drift from the API.

- `LANGUAGE_CODES` / `LANGUAGE_OPTIONS` / `languageLabel` — the eight client languages (content availability sets, list filters).
- `ADMIN_LOCALE_CODES` / `ADMIN_LOCALE_OPTIONS` / `adminLocaleLabel` — `en` + the eight, for the translation editors (mirrors the server's `adminLocale`). Derived from the above, not a second list.

**Only the English LABELS live here.** `LanguageCode` is derived from the emitted contract (`paths['/languages']`), and `LANGUAGE_LABELS` is an exhaustive `Record<LanguageCode, string>` — so a language added in `apps/api/src/shared/language.schema.ts` breaks `pnpm nx typecheck admin` until its label is added. That build failure is the point; do not widen the type to silence it.

### Primitives

`src/components/ui/` — cva + `cn()`, matching `button.tsx`'s shape. Radix is used **only** where it buys real behaviour (`dialog`, `dropdown-menu`, `tabs`, `checkbox`, `switch`); `label`, `select`, `table`, `badge`, `card`, `alert`, `skeleton`, `input`, `textarea` are native elements + tokens. **`select` is a styled native `<select>`, not Radix Select** — deliberate: it is accessible by default and testable under jsdom.

### Security

`<AdminRoute>` is a **UX affordance, not a security control** — `adminMiddleware` (TAM-82) is the real boundary and guards every `/admin/*` request server-side. The guard fails closed (only a 200 from `/admin/session` renders children), 403 → an explicit "not authorized" screen (**never** a redirect — that is a loop for someone already logged in), 401 → `/login` via the `api.ts` interceptor.

The admin JWT lives in `localStorage` and now carries admin privilege (risk D-R2, accepted, mitigated by admin being localhost-only this epic). **Do not make it worse: no token in a URL, no token in a log, no token to any origin but our API.**

## Commands

`pnpm nx serve admin` (Vite dev server; `VITE_API_URL` sets the API base, default `http://localhost:3000`) · `pnpm nx typecheck admin` · `pnpm nx lint admin` · `pnpm nx test admin` (vitest + Testing Library, jsdom) · `pnpm nx build admin`.
