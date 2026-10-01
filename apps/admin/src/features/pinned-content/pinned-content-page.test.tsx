import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import type React from 'react';

/**
 * Pinned-content list page. Feature hooks import the client as `@/lib/api`,
 * so mock that specifier and branch on the requested path — the list, the
 * per-id detail the edit form loads through, and the two picker sources
 * (`/admin/home/feed-items` + `/admin/status/items`), list AND by-id.
 *
 * The assertions that matter are:
 *  - filter URL persistence (the whole point of hand-rolling the table);
 *  - row-action visibility rules (Restore only on deleted rows; Edit and
 *    Delete hidden on deleted rows);
 *  - the delete confirmation dialog gates the DELETE call;
 *  - the audit drawer renders diff rows;
 *  - the Content column resolves title/thumbnail BY ID (TAM-175) and falls
 *    back to the raw id when that lookup 404s.
 *
 * Form-level tests (surface ⇔ deity conditional field, IST-datetime submit,
 * duration ↔ end binding) live in `pinned-content-schema.test.ts` — the
 * schema is where the correctness sits.
 */

const PIN_ID_ACTIVE = '11111111-1111-1111-1111-111111111111';
const PIN_ID_DELETED = '22222222-2222-2222-2222-222222222222';
const HOME_CONTENT_ID = '33333333-3333-3333-3333-333333333333';

const activePin = {
  id: PIN_ID_ACTIVE,
  surface: 'home' as const,
  deitySlug: null,
  contentId: HOME_CONTENT_ID,
  pinPosition: 1,
  startAt: '2026-09-01T00:00:00.000Z',
  endAt: '2026-12-31T00:00:00.000Z',
  createdAt: '2026-08-30T00:00:00.000Z',
  updatedAt: '2026-08-30T00:00:00.000Z',
  createdBy: 'admin-alice',
  updatedBy: 'admin-alice',
  deletedAt: null,
};

const deletedPin = {
  id: PIN_ID_DELETED,
  surface: 'status_all_gods' as const,
  deitySlug: null,
  contentId: '99999999-9999-9999-9999-999999999999',
  pinPosition: 2,
  startAt: '2026-08-01T00:00:00.000Z',
  endAt: '2026-08-30T00:00:00.000Z',
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-08-30T00:00:00.000Z',
  createdBy: 'admin-bob',
  updatedBy: 'admin-bob',
  deletedAt: '2026-08-30T00:00:00.000Z',
};

const homeFeedItem = {
  id: HOME_CONTENT_ID,
  slug: 'diwali-hero',
  contentType: 'wallpaper',
  module: 'wallpaper',
  title: 'Diwali Hero',
  subtitle: null,
  label: null,
  badge: null,
  badgeLabel: null,
  heroImageUrl: 'https://cdn.example.com/diwali-hero.png',
  audioPreviewUrl: null,
  ctaLabel: 'Open',
  ctaDestinationType: 'linked_module',
  ctaDestinationValue: 'wallpaper',
  headerDestinationModule: 'wallpaper',
  shareTitle: 'Share',
  shareText: 'Share this',
  shareDeepLink: 'x://y',
  shareThumbnailUrl: null,
  trendingScore: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const auditRow = {
  id: 'audit-1',
  pinnedContentId: PIN_ID_ACTIVE,
  action: 'update' as const,
  actorUserId: 'admin-alice',
  snapshot: {},
  diff: {
    before: { pinPosition: 3 },
    after: { pinPosition: 1 },
  },
  createdAt: '2026-08-30T05:00:00.000Z',
};

const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: { GET: get, POST: post, PATCH: patch, DELETE: del },
}));

function ok<T>(data: T) {
  return Promise.resolve({
    data: { success: true as const, message: 'OK', data },
    error: undefined,
    response: new Response(),
  });
}

/** A 404 the way `openapi-fetch` reports one — `unwrap` turns it into ApiError(404). */
function notFound() {
  return Promise.resolve({
    data: undefined,
    error: { message: 'Not found', errorCode: 'NOT_FOUND' },
    response: new Response(null, { status: 404 }),
  });
}

type IdArgs = { params?: { path?: { id?: string } } };

/** Every path `api.GET` was called with, in order. */
function pathsRequested(): string[] {
  return get.mock.calls.map((call) => String(call[0]));
}

/** The `{id}` path params sent to one by-id endpoint. */
function requestedIds(path: string): (string | undefined)[] {
  return get.mock.calls
    .filter((call) => call[0] === path)
    .map((call) => ((call[1] ?? {}) as IdArgs).params?.path?.id);
}

function routeGet(path: string, args?: IdArgs) {
  // TAM-175: the Content column resolves each pin's content by id.
  if (path === '/admin/home/feed-items/{id}') {
    return args?.params?.path?.id === HOME_CONTENT_ID ? ok(homeFeedItem) : notFound();
  }
  if (path === '/admin/status/items/{id}') {
    // The deleted pin points at a status row that no longer exists.
    return notFound();
  }
  if (path === '/admin/pinned-content') {
    return ok({
      items: [activePin, deletedPin],
      total: 2,
      page: 1,
      pageSize: 25,
    });
  }
  if (path === '/admin/pinned-content/{id}') {
    return ok(activePin);
  }
  if (path === '/admin/pinned-content/{id}/audit') {
    return ok([auditRow]);
  }
  if (path === '/admin/home/feed-items') {
    return ok({ items: [homeFeedItem], total: 1, page: 1, pageSize: 100 });
  }
  if (path === '/admin/status/items') {
    return ok({ items: [], total: 0, page: 1, pageSize: 100 });
  }
  if (path === '/admin/taxonomy/deities') {
    return ok({
      items: [{ slug: 'ganesh', active: true }],
      total: 1,
      page: 1,
      pageSize: 100,
    });
  }
  return ok(null);
}

let PinnedContentPage: () => React.JSX.Element;

beforeEach(async () => {
  get.mockReset();
  get.mockImplementation(routeGet);
  post.mockReset();
  post.mockImplementation(() => ok(activePin));
  patch.mockReset();
  patch.mockImplementation(() => ok(activePin));
  del.mockReset();
  del.mockImplementation(() => ok(activePin));
  ({ PinnedContentPage } = await import('./pinned-content-page'));
});

function renderPage(initialEntries: string[] = ['/pinned-content']) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <PinnedContentPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test('lists every pin with its surface, position, IST window and status badge', async () => {
  renderPage();

  expect(await screen.findByText('Diwali Hero')).toBeTruthy();
  // Both rows render.
  expect(screen.getAllByText(/Home feed|Status — all gods/).length).toBeGreaterThan(0);
  // Active + Deleted badges are both present. "Active" appears in the filter
  // dropdown too — assert at least one occurrence.
  expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  expect(screen.getByText('Deleted')).toBeTruthy();
  // IST label appears on the datetime cells.
  expect(screen.getAllByText(/IST/).length).toBeGreaterThan(0);
});

test('the Content column resolves by id, and falls back to the raw id when that 404s', async () => {
  renderPage();

  // Resolved through `/admin/home/feed-items/{id}` — NOT by indexing into a
  // bounded catalogue fetch, which is what used to render a bare UUID for any
  // pin whose content sat outside the first 100 arbitrary rows (TAM-175).
  expect(await screen.findByText('Diwali Hero')).toBeTruthy();
  expect(requestedIds('/admin/home/feed-items/{id}')).toContain(HOME_CONTENT_ID);

  // The deleted pin's status row is gone; the id is all we can show.
  await waitFor(() =>
    expect(screen.getByText(deletedPin.contentId)).toBeTruthy(),
  );

  // And the old bounded catalogue fetches are gone entirely.
  expect(pathsRequested()).not.toContain('/admin/home/feed-items');
  expect(pathsRequested()).not.toContain('/admin/status/items');
});

test('Restore only appears on deleted rows; Edit + Delete only on non-deleted rows', async () => {
  renderPage();
  await screen.findByText('Diwali Hero');

  const restoreButtons = screen.getAllByRole('button', { name: /restore/i });
  // Exactly one deleted row → exactly one Restore button.
  expect(restoreButtons).toHaveLength(1);

  // Exactly one active row → exactly one Edit and one Delete button.
  expect(screen.getAllByRole('button', { name: /^edit$/i })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: /^delete$/i })).toHaveLength(1);
});

test('a surface filter is persisted into the URL search params', async () => {
  renderPage();
  await screen.findByText('Diwali Hero');

  const surfaceSelect = screen.getByLabelText('Surface');
  fireEvent.change(surfaceSelect, { target: { value: 'home' } });

  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/admin/pinned-content', {
      params: {
        query: {
          page: 1,
          pageSize: 25,
          active: 'any',
          surface: 'home',
        },
      },
    }),
  );
});

test('a URL with `?surface=home&active=scheduled` hydrates the filters on load', async () => {
  renderPage(['/pinned-content?surface=home&active=scheduled']);

  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/admin/pinned-content', {
      params: {
        query: {
          page: 1,
          pageSize: 25,
          active: 'scheduled',
          surface: 'home',
        },
      },
    }),
  );

  // The two dropdowns picked up the URL params — assert on the displayed
  // option (`getByDisplayValue` is the ESLint-clean way to read `.value` here).
  expect(screen.getByDisplayValue('Home feed')).toBeTruthy();
  expect(screen.getByDisplayValue('Scheduled')).toBeTruthy();
});

test('Deity filter appears only when Surface is status_deity', async () => {
  renderPage();
  await screen.findByText('Diwali Hero');

  expect(screen.queryByLabelText('Deity')).toBeNull();

  fireEvent.change(screen.getByLabelText('Surface'), {
    target: { value: 'status_deity' },
  });

  await screen.findByLabelText('Deity');
});

test('the delete row action opens a confirm dialog that gates the DELETE call', async () => {
  renderPage();
  await screen.findByText('Diwali Hero');

  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
  await screen.findByText('Delete this pin?');
  // Not called until the user confirms.
  expect(del).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: /Delete pin/i }));

  await waitFor(() => expect(del).toHaveBeenCalled());
  expect(del).toHaveBeenCalledWith('/admin/pinned-content/{id}', {
    params: { path: { id: PIN_ID_ACTIVE } },
    body: { expectedUpdatedAt: activePin.updatedAt },
  });
});

test('the restore row action POSTs to /restore with the row’s updatedAt', async () => {
  renderPage();
  await screen.findByText('Diwali Hero');

  fireEvent.click(screen.getByRole('button', { name: /restore/i }));

  await waitFor(() => expect(post).toHaveBeenCalled());
  expect(post).toHaveBeenCalledWith('/admin/pinned-content/{id}/restore', {
    params: { path: { id: PIN_ID_DELETED } },
    body: { expectedUpdatedAt: deletedPin.updatedAt },
  });
});

test('the Audit row action opens a drawer that renders the diff table', async () => {
  renderPage();
  await screen.findByText('Diwali Hero');

  const auditButtons = screen.getAllByRole('button', { name: /audit/i });
  const first = auditButtons[0];
  if (!first) throw new Error('no audit button rendered');
  fireEvent.click(first);

  await screen.findByText('Audit log');
  // The diff table renders once the audit query resolves — findByText awaits.
  expect(await screen.findByText('pinPosition')).toBeTruthy();
  expect(screen.getByText('Field')).toBeTruthy();
  expect(screen.getByText('Before')).toBeTruthy();
  expect(screen.getByText('After')).toBeTruthy();
  // "3" (before) and "1" (after) are the diff values.
  expect(screen.getByText('3')).toBeTruthy();
  expect(screen.getAllByText('1').length).toBeGreaterThan(0);
});
