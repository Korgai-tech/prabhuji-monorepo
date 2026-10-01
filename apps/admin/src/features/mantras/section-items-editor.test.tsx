import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, test, vi } from 'vitest';
import type React from 'react';

import type { MantraSectionDetail } from './use-mantra-sections';
import type { MantraSectionFormState } from './section-form';

/**
 * TAM-160 — the curated-items editor for a Mantras homepage section: the mirror
 * of the Aarti suite, differing only in the wire field (`itemIds`).
 *
 * NOTE: `tsconfig.spec.json` has no `dom` lib, so these assertions go through
 * Testing Library queries rather than element properties.
 */

// Radix's `<Switch>` (the section form's `isActive` field) measures itself with
// a ResizeObserver, which jsdom does not implement.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe(): void {
      /* no layout in jsdom */
    }
    unobserve(): void {
      /* no layout in jsdom */
    }
    disconnect(): void {
      /* no layout in jsdom */
    }
  },
);

const mocked = vi.hoisted(() => ({
  put: vi.fn(),
  sectionType: 'curated',
}));

/** 26 items — two pages at the editor's page size of 24. */
const ITEMS = [
  { id: 'a', slug: 'alpha', title: 'Alpha Mantra', type: 'mantra', artworkUrl: 'https://cdn.test/a.png' },
  { id: 'b', slug: 'beta', title: 'Beta Mantra', type: 'mantra', artworkUrl: 'https://cdn.test/b.png' },
  { id: 'c', slug: 'gamma', title: 'Gamma Mantra', type: 'stuti', artworkUrl: 'https://cdn.test/c.png' },
  { id: 'd', slug: 'delta', title: 'Delta Mantra', type: 'stuti', artworkUrl: 'https://cdn.test/d.png' },
  ...Array.from({ length: 22 }, (_unused, index) => {
    const n = String(index + 5).padStart(2, '0');
    return {
      id: `f${n}`,
      slug: `filler-${n}`,
      title: `Filler Mantra ${n}`,
      type: 'mantra',
      artworkUrl: `https://cdn.test/${n}.png`,
    };
  }),
];

vi.mock('@/lib/api', () => {
  const ok = (data: unknown) =>
    Promise.resolve({
      data: { success: true, message: 'OK', data },
      error: undefined,
      response: new Response(),
    });

  return {
    api: {
      GET: vi.fn(
        (
          path: string,
          init?: { params?: { query?: Record<string, string | number | undefined> } },
        ) => {
          if (path === '/admin/mantras/items') {
            const query = init?.params?.query ?? {};
            const term = String(query.q ?? '').toLowerCase();
            const matched = ITEMS.filter((i) => i.title.toLowerCase().includes(term));
            const page = Number(query.page ?? 1);
            const pageSize = Number(query.pageSize ?? 24);
            return ok({
              items: matched.slice((page - 1) * pageSize, page * pageSize),
              total: matched.length,
              page,
              pageSize,
            });
          }
          if (path === '/admin/mantras/sections/{id}')
            return ok({
              id: 'sec-1',
              sectionType: mocked.sectionType,
              title: 'Monsoon Mantras',
              layoutType: 'horizontal_cards',
              showAllEnabled: true,
              sortOrder: 0,
              isActive: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
              translations: [],
              items: [
                { itemId: 'a', position: 0, title: 'Alpha Mantra', artworkUrl: 'https://cdn.test/a.png' },
                { itemId: 'b', position: 1, title: 'Beta Mantra', artworkUrl: 'https://cdn.test/b.png' },
                { itemId: 'c', position: 2, title: 'Gamma Mantra', artworkUrl: 'https://cdn.test/c.png' },
              ],
            });
          return ok({ items: [], total: 0, page: 1, pageSize: 25 });
        },
      ),
      POST: vi.fn(),
      PATCH: vi.fn(),
      PUT: mocked.put,
      DELETE: vi.fn(),
    },
  };
});

const SECTION = {
  id: 'sec-1',
  sectionType: 'curated' as const,
  title: 'Monsoon Mantras',
  layoutType: 'horizontal_cards' as const,
  showAllEnabled: true,
  sortOrder: 0,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  translations: [],
  // Deliberately OUT of position order — the editor sorts by `position`.
  items: [
    { itemId: 'c', position: 2, title: 'Gamma Mantra', artworkUrl: 'https://cdn.test/c.png' },
    { itemId: 'a', position: 0, title: 'Alpha Mantra', artworkUrl: 'https://cdn.test/a.png' },
    { itemId: 'b', position: 1, title: 'Beta Mantra', artworkUrl: 'https://cdn.test/b.png' },
  ],
};

let MantraSectionItemsEditor: React.ComponentType<{ section: MantraSectionDetail }>;
let MantraSectionFormDialog: React.ComponentType<{
  state: MantraSectionFormState;
  onClose: () => void;
}>;

beforeEach(async () => {
  mocked.put.mockReset();
  mocked.put.mockResolvedValue({
    data: { success: true, message: 'OK', data: [] },
    error: undefined,
    response: new Response(),
  });
  mocked.sectionType = 'curated';
  ({ MantraSectionItemsEditor } = await import('./section-items-editor'));
  ({ MantraSectionFormDialog } = await import('./section-form'));
});

function renderEditor(items = SECTION.items) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantraSectionItemsEditor section={{ ...SECTION, items }} />
    </QueryClientProvider>,
  );
}

/** Wait for the (mocked) catalogue PAGE to land — the ordered list can already
 *  be named from the module-level title cache, so wait on a grid cell. */
function catalogueLoaded() {
  return screen.findByRole('checkbox', { name: 'Alpha Mantra' });
}

/** Assert the ordered list renders exactly `titles`, each with its 1-based badge. */
function expectOrder(titles: string[]) {
  const rows = screen.getAllByRole('listitem');
  expect(rows).toHaveLength(titles.length);
  titles.forEach((title, index) => {
    within(rows[index]).getByText(title);
    within(rows[index]).getByText(String(index + 1));
  });
}

test('Reshuffle randomizes the rendered order and enables Save WITHOUT saving', async () => {
  // Fisher–Yates with a fixed `Math.random` → a deterministic, different order.
  const random = vi.spyOn(Math, 'random').mockReturnValue(0);
  renderEditor();

  await catalogueLoaded();
  expectOrder(['Alpha Mantra', 'Beta Mantra', 'Gamma Mantra']);
  expect(screen.getByRole('button', { name: 'Save order' })).toHaveProperty('disabled', true);

  fireEvent.click(screen.getByRole('button', { name: /reshuffle/i }));

  expectOrder(['Beta Mantra', 'Gamma Mantra', 'Alpha Mantra']);
  expect(screen.getByRole('button', { name: 'Save order' })).toHaveProperty('disabled', false);
  screen.getByText('Unsaved changes');
  expect(mocked.put).not.toHaveBeenCalled();

  random.mockRestore();
});

test('Reshuffle is disabled below two items', () => {
  renderEditor([
    { itemId: 'a', position: 0, title: 'Alpha Mantra', artworkUrl: 'https://cdn.test/a.png' },
  ]);

  expect(screen.getByRole('button', { name: /reshuffle/i })).toHaveProperty('disabled', true);
});

test('ticking appends, unticking closes the gap, and Save posts the displayed order', async () => {
  renderEditor();
  await catalogueLoaded();
  expectOrder(['Alpha Mantra', 'Beta Mantra', 'Gamma Mantra']);

  // Membership drives the grid: members are checked, non-members are not.
  screen.getByRole('checkbox', { name: 'Alpha Mantra', checked: true });
  screen.getByRole('checkbox', { name: 'Delta Mantra', checked: false });

  // The ordered list is READ-ONLY now — no remove/up/down controls.
  expect(screen.queryAllByRole('button', { name: /^(Remove|Move) / })).toHaveLength(0);

  // Untick → removed, and the remaining positions close up.
  fireEvent.click(screen.getByRole('checkbox', { name: 'Beta Mantra' }));
  expectOrder(['Alpha Mantra', 'Gamma Mantra']);
  screen.getByRole('checkbox', { name: 'Beta Mantra', checked: false });

  // Tick → appended at the END.
  fireEvent.click(screen.getByRole('checkbox', { name: 'Delta Mantra' }));
  expectOrder(['Alpha Mantra', 'Gamma Mantra', 'Delta Mantra']);

  // Still nothing persisted — Save is the single persistence point.
  expect(mocked.put).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Save order' }));

  await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
  expect(mocked.put).toHaveBeenCalledWith('/admin/mantras/sections/{id}/items', {
    params: { path: { id: 'sec-1' } },
    body: { itemIds: ['a', 'c', 'd'] },
  });
});

test('checked state survives paging, and an off-page member is still removable', async () => {
  renderEditor();
  await catalogueLoaded();
  screen.getByText(/Page 1 of 2/);

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('checkbox', { name: 'Filler Mantra 25' });
  // The ordered list still names its members, though none are on this page.
  expectOrder(['Alpha Mantra', 'Beta Mantra', 'Gamma Mantra']);

  fireEvent.click(screen.getByRole('checkbox', { name: 'Filler Mantra 25' }));
  expectOrder(['Alpha Mantra', 'Beta Mantra', 'Gamma Mantra', 'Filler Mantra 25']);

  // Page back: membership is derived from the ids, not from page-local state.
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await catalogueLoaded();
  screen.getByRole('checkbox', { name: 'Alpha Mantra', checked: true });
  expectOrder(['Alpha Mantra', 'Beta Mantra', 'Gamma Mantra', 'Filler Mantra 25']);

  // …and the member that now sits on page 2 can be unticked by paging to it.
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('checkbox', { name: 'Filler Mantra 25', checked: true });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Filler Mantra 25' }));
  expectOrder(['Alpha Mantra', 'Beta Mantra', 'Gamma Mantra']);
});

test('a member that is not on the current grid page still renders its title', async () => {
  renderEditor([
    { itemId: 'a', position: 0, title: 'Alpha Mantra', artworkUrl: 'https://cdn.test/a.png' },
    { itemId: 'f25', position: 1, title: 'Filler Mantra 25', artworkUrl: 'https://cdn.test/25.png' },
  ]);
  await catalogueLoaded();

  // `f25` sits on grid page 2 and has never been loaded — the section detail
  // carries its title, so the ordered list names it and no raw id leaks out.
  expect(screen.queryByRole('checkbox', { name: 'Filler Mantra 25' })).toBeNull();
  expectOrder(['Alpha Mantra', 'Filler Mantra 25']);
  expect(screen.queryByText('f25')).toBeNull();
});

test('checked state survives a search', async () => {
  renderEditor();
  await catalogueLoaded();

  fireEvent.change(screen.getByLabelText('All mantras — tick to include'), {
    target: { value: 'alpha' },
  });

  await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(1));
  screen.getByRole('checkbox', { name: 'Alpha Mantra', checked: true });
});

test('a new section starts INACTIVE', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MantraSectionFormDialog state={{ kind: 'create' }} onClose={() => undefined} />
    </QueryClientProvider>,
  );

  await screen.findByText('New homepage section');
  // Two switches: `showAllEnabled` (on) and `isActive` (off).
  expect(screen.getAllByRole('switch', { checked: true })).toHaveLength(1);
  expect(screen.getAllByRole('switch', { checked: false })).toHaveLength(1);
});

test('the items editor is present for a curated section and absent for a built-in one', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { unmount } = render(
    <QueryClientProvider client={qc}>
      <MantraSectionFormDialog state={{ kind: 'edit', id: 'sec-1' }} onClose={() => undefined} />
    </QueryClientProvider>,
  );

  await screen.findByRole('button', { name: 'Save order' });
  screen.getByText('Curated mantras');
  unmount();

  mocked.sectionType = 'newly_added';
  const qc2 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc2}>
      <MantraSectionFormDialog state={{ kind: 'edit', id: 'sec-1' }} onClose={() => undefined} />
    </QueryClientProvider>,
  );

  await screen.findByText('Automatically resolved');
  screen.getByText(/takes no hand-picked items/i);
  expect(screen.queryByRole('button', { name: 'Save order' })).toBeNull();
});
