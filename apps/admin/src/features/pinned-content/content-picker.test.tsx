import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, test, vi } from 'vitest';
import type React from 'react';

/**
 * ContentPicker — TAM-175: the search box queries the DATABASE.
 *
 * The regression this file exists to pin: the picker used to fetch one page of
 * the catalogue on mount and filter that array in the browser, so any row
 * outside the page was un-findable and un-pinnable no matter what was typed.
 * Every assertion below is about the request that leaves the browser, not
 * about how a cached array was sliced.
 */

const HOME_ID_ON_PAGE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOME_ID_OFF_PAGE = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STATUS_ID_OTHER_DEITY = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function feedRow(id: string, title: string, slug: string) {
  return {
    id,
    slug,
    contentType: 'wallpaper',
    module: 'wallpaper',
    title,
    subtitle: null,
    label: null,
    badge: null,
    badgeLabel: null,
    heroImageUrl: null,
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
}

const onPage = feedRow(HOME_ID_ON_PAGE, 'Diwali Hero', 'diwali-hero');
const offPage = feedRow(HOME_ID_OFF_PAGE, 'Janmashtami Hero', 'janmashtami-hero');

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { GET: get, POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}));

function ok<T>(data: T) {
  return Promise.resolve({
    data: { success: true as const, message: 'OK', data },
    error: undefined,
    response: new Response(),
  });
}

function notFound() {
  return Promise.resolve({
    data: undefined,
    error: { message: 'Not found', errorCode: 'NOT_FOUND' },
    response: new Response(null, { status: 404 }),
  });
}

type GetArgs = {
  params?: {
    query?: { q?: string; deitySlug?: string; pageSize?: number; sort?: string; order?: string };
    path?: { id?: string };
  };
};

/**
 * The fake catalogue: `offPage` is deliberately NOT in the no-term page, so a
 * client-side filter could never surface it — only a real `q` round-trip can.
 */
function routeGet(path: string, args?: GetArgs) {
  if (path === '/admin/home/feed-items') {
    const q = args?.params?.query?.q;
    if (q === undefined) return ok({ items: [onPage], total: 1, page: 1, pageSize: 50 });
    const term = q.toLowerCase();
    const items = [onPage, offPage].filter(
      (row) => row.title.toLowerCase().includes(term) || row.slug.includes(term),
    );
    return ok({ items, total: items.length, page: 1, pageSize: 50 });
  }
  if (path === '/admin/home/feed-items/{id}') {
    const id = args?.params?.path?.id;
    if (id === HOME_ID_ON_PAGE) return ok(onPage);
    if (id === HOME_ID_OFF_PAGE) return ok(offPage);
    return notFound();
  }
  if (path === '/admin/status/items') {
    return ok({ items: [], total: 0, page: 1, pageSize: 50 });
  }
  if (path === '/admin/status/items/{id}') {
    if (args?.params?.path?.id === STATUS_ID_OTHER_DEITY) {
      return ok({
        id: STATUS_ID_OTHER_DEITY,
        slug: 'shiva-hero',
        title: 'Shiva Hero',
        mediaType: 'image' as const,
        imageUrl: 'https://cdn.example.com/shiva.png',
        videoUrl: null,
        thumbnailUrl: 'https://cdn.example.com/shiva-thumb.png',
        overlaySafeArea: { top: 0.1, bottom: 0.14, left: 0.05, right: 0.05 },
        languages: [],
        shareCaption: null,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        deitySlug: 'shiva',
      });
    }
    return notFound();
  }
  return ok(null);
}

let ContentPickerField: (props: {
  id: string;
  surface: 'home' | 'status_all_gods' | 'status_deity' | '';
  deitySlug: string;
  value: string;
  onChange: (next: string) => void;
}) => React.JSX.Element;

beforeEach(async () => {
  get.mockReset();
  get.mockImplementation(routeGet);
  ({ ContentPickerField } = await import('./content-picker'));
});

function renderPicker(
  props: Partial<{
    surface: 'home' | 'status_all_gods' | 'status_deity' | '';
    deitySlug: string;
    value: string;
  }> = {},
) {
  const onChange = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <ContentPickerField
        id="pin-content"
        surface={props.surface ?? 'home'}
        deitySlug={props.deitySlug ?? ''}
        value={props.value ?? ''}
        onChange={onChange}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onChange };
}

/** Every `api.GET` call made against one path so far. */
function callsTo(path: string): GetArgs[] {
  return get.mock.calls
    .filter((call) => call[0] === path)
    .map((call) => (call[1] ?? {}) as GetArgs);
}

test('the no-term list is a bounded, explicitly-sorted page (not a uuid-ordered slice)', async () => {
  renderPicker();
  await screen.findByRole('radio', { name: /Diwali Hero/ });

  const [first] = callsTo('/admin/home/feed-items');
  expect(first?.params?.query).toMatchObject({
    page: 1,
    pageSize: 50,
    sort: 'updatedAt',
    order: 'desc',
  });
  // An empty `q` would 400 server-side (`min(1)`) — the param must be omitted.
  expect(first?.params?.query?.q).toBeUndefined();
});

test('typing sends the term to the server as `q`, and finds a row outside the first page', async () => {
  const { onChange } = renderPicker();
  await screen.findByRole('radio', { name: /Diwali Hero/ });
  // Proves the row is genuinely absent from the loaded page: a client-side
  // filter over it could not possibly produce a match.
  expect(screen.queryByRole('radio', { name: /Janmashtami/ })).toBeNull();

  fireEvent.change(screen.getByLabelText('Search content'), {
    target: { value: 'janmashtami' },
  });

  await waitFor(() =>
    expect(
      callsTo('/admin/home/feed-items').some(
        (call) => call.params?.query?.q === 'janmashtami',
      ),
    ).toBe(true),
  );

  const hit = await screen.findByRole('radio', { name: /Janmashtami Hero/ });
  fireEvent.click(hit);
  expect(onChange).toHaveBeenCalledWith(HOME_ID_OFF_PAGE);
});

test('the search input keeps its value while the next result set loads', async () => {
  renderPicker();
  await screen.findByRole('radio', { name: /Diwali Hero/ });

  fireEvent.change(screen.getByLabelText('Search content'), {
    target: { value: 'diw' },
  });

  // The input must never be unmounted by a loading branch — that would drop
  // focus mid-word now that typing is what triggers the fetch.
  await waitFor(() => expect(screen.getByDisplayValue('diw')).toBeTruthy());
  expect(screen.getByLabelText('Search content')).toBeTruthy();
});

test('typing is debounced — a burst of keystrokes costs one request', async () => {
  renderPicker();
  await screen.findByRole('radio', { name: /Diwali Hero/ });
  const before = callsTo('/admin/home/feed-items').length;

  const input = screen.getByLabelText('Search content');
  for (const value of ['j', 'ja', 'jan', 'janm', 'janma']) {
    fireEvent.change(input, { target: { value } });
  }

  await screen.findByRole('radio', { name: /Janmashtami Hero/ });
  const searched = callsTo('/admin/home/feed-items')
    .slice(before)
    .map((call) => call.params?.query?.q);
  expect(searched).toEqual(['janma']);
});

test('a UUID term resolves through the by-id endpoint, not `q`', async () => {
  renderPicker();
  await screen.findByRole('radio', { name: /Diwali Hero/ });

  fireEvent.change(screen.getByLabelText('Search content'), {
    target: { value: HOME_ID_OFF_PAGE },
  });

  await screen.findByRole('radio', { name: /Janmashtami Hero/ });
  expect(
    callsTo('/admin/home/feed-items/{id}').some(
      (call) => call.params?.path?.id === HOME_ID_OFF_PAGE,
    ),
  ).toBe(true);
  // `q` matches title/slug only — sending a uuid down that path finds nothing.
  expect(
    callsTo('/admin/home/feed-items').some(
      (call) => call.params?.query?.q === HOME_ID_OFF_PAGE,
    ),
  ).toBe(false);
});

test('an unknown UUID renders the empty state rather than an error alert', async () => {
  renderPicker();
  await screen.findByRole('radio', { name: /Diwali Hero/ });

  fireEvent.change(screen.getByLabelText('Search content'), {
    target: { value: '99999999-9999-9999-9999-999999999999' },
  });

  expect(await screen.findByText(/No content matches/)).toBeTruthy();
  expect(screen.queryByText('Could not load content options')).toBeNull();
});

test('status_deity never offers a UUID belonging to another deity', async () => {
  renderPicker({ surface: 'status_deity', deitySlug: 'ganesh' });
  await screen.findByLabelText('Search content');

  fireEvent.change(screen.getByLabelText('Search content'), {
    target: { value: STATUS_ID_OTHER_DEITY },
  });

  expect(await screen.findByText(/No content matches/)).toBeTruthy();
  expect(screen.queryByRole('radio', { name: /Shiva Hero/ })).toBeNull();
});

test('a truncated page says so; a complete one does not', async () => {
  get.mockImplementation((path: string, args?: GetArgs) =>
    path === '/admin/home/feed-items'
      ? ok({ items: [onPage, offPage], total: 1284, page: 1, pageSize: 50 })
      : routeGet(path, args),
  );
  const { unmount } = renderPicker();
  expect(await screen.findByText(/Showing 2 of 1284/)).toBeTruthy();
  unmount();

  get.mockImplementation(routeGet);
  renderPicker();
  await screen.findByRole('radio', { name: /Diwali Hero/ });
  expect(screen.queryByText(/Showing/)).toBeNull();
});

test('the selected pick stays visible even when the search hides it', async () => {
  renderPicker({ value: HOME_ID_OFF_PAGE });
  // Not in the no-term page, and no term typed — it can only be here via the
  // by-id resolution.
  const selected = await screen.findByRole('radio', { name: /Janmashtami Hero/ });
  expect(selected.getAttribute('checked') === '' || screen.getByText('Selected')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Search content'), {
    target: { value: 'diwali' },
  });
  await screen.findByRole('radio', { name: /Diwali Hero/ });
  expect(screen.getByRole('radio', { name: /Janmashtami Hero/ })).toBeTruthy();
});

test('no request fires until the surface (and, for status_deity, the deity) is known', () => {
  const { unmount } = renderPicker({ surface: '' });
  expect(screen.getByText(/Pick a surface first/)).toBeTruthy();
  expect(get).not.toHaveBeenCalled();
  unmount();

  renderPicker({ surface: 'status_deity', deitySlug: '' });
  expect(screen.getByText(/Pick a deity first/)).toBeTruthy();
  expect(get).not.toHaveBeenCalled();
});
