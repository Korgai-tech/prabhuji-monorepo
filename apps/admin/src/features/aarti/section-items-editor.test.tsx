import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, test, vi } from 'vitest';
import type React from 'react';

import type { SectionDetail } from './use-aarti';
import type { SectionFormState } from './section-form';

/**
 * TAM-160 — the curated-items editor for an Aarti homepage section.
 *
 * What is load-bearing here (and what these tests pin):
 *  - **The checkbox grid IS the membership.** A member renders checked; ticking
 *    appends to the END; unticking removes and closes the gap. There are no
 *    ✕/↑/↓ controls on the ordered list any more.
 *  - **Checked state derives from the saved ids**, so it survives paging and
 *    searching — and a member that has scrolled onto another page is still
 *    removable by paging back to it.
 *  - **Reshuffle and every tick only set state.** Save is the one persistence
 *    point and posts the ids in DISPLAYED order.
 *
 * NOTE: `tsconfig.spec.json` has no `dom` lib, so these assertions go through
 * Testing Library queries rather than element properties (as every other admin
 * spec does).
 */

// Radix's `<Switch>` (the section form's `isActive` field) measures itself with
// a ResizeObserver, which jsdom does not implement. There is no global test
// setup file in this app, so the stub lives here.
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
const AUDIOS = [
  { id: 'a', slug: 'alpha', title: 'Alpha Aarti', coverImageUrl: 'https://cdn.test/a.png' },
  { id: 'b', slug: 'beta', title: 'Beta Aarti', coverImageUrl: 'https://cdn.test/b.png' },
  { id: 'c', slug: 'gamma', title: 'Gamma Aarti', coverImageUrl: 'https://cdn.test/c.png' },
  { id: 'd', slug: 'delta', title: 'Delta Aarti', coverImageUrl: 'https://cdn.test/d.png' },
  ...Array.from({ length: 22 }, (_unused, index) => {
    const n = String(index + 5).padStart(2, '0');
    return {
      id: `f${n}`,
      slug: `filler-${n}`,
      title: `Filler Aarti ${n}`,
      coverImageUrl: `https://cdn.test/${n}.png`,
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
          if (path === '/admin/aarti/items') {
            const query = init?.params?.query ?? {};
            const term = String(query.q ?? '').toLowerCase();
            const matched = AUDIOS.filter((a) => a.title.toLowerCase().includes(term));
            const page = Number(query.page ?? 1);
            const pageSize = Number(query.pageSize ?? 24);
            return ok({
              items: matched.slice((page - 1) * pageSize, page * pageSize),
              total: matched.length,
              page,
              pageSize,
            });
          }
          if (path === '/admin/aarti/sections/{id}')
            return ok({
              id: 'sec-1',
              sectionType: mocked.sectionType,
              title: 'Top Aartis',
              sortOrder: 0,
              isActive: true,
              itemQuery: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
              translations: [],
              items: [
                { audioId: 'a', position: 0, title: 'Alpha Aarti', coverImageUrl: 'https://cdn.test/a.png' },
                { audioId: 'b', position: 1, title: 'Beta Aarti', coverImageUrl: 'https://cdn.test/b.png' },
                { audioId: 'c', position: 2, title: 'Gamma Aarti', coverImageUrl: 'https://cdn.test/c.png' },
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
  sectionType: 'curated',
  title: 'Top Aartis',
  sortOrder: 0,
  isActive: true,
  itemQuery: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  translations: [],
  // Deliberately OUT of position order — the editor sorts by `position`.
  items: [
    { audioId: 'c', position: 2, title: 'Gamma Aarti', coverImageUrl: 'https://cdn.test/c.png' },
    { audioId: 'a', position: 0, title: 'Alpha Aarti', coverImageUrl: 'https://cdn.test/a.png' },
    { audioId: 'b', position: 1, title: 'Beta Aarti', coverImageUrl: 'https://cdn.test/b.png' },
  ],
};

let SectionItemsEditor: React.ComponentType<{ section: SectionDetail }>;
let SectionFormDialog: React.ComponentType<{ state: SectionFormState; onClose: () => void }>;

beforeEach(async () => {
  mocked.put.mockReset();
  mocked.put.mockResolvedValue({
    data: { success: true, message: 'OK', data: [] },
    error: undefined,
    response: new Response(),
  });
  mocked.sectionType = 'curated';
  ({ SectionItemsEditor } = await import('./section-items-editor'));
  ({ SectionFormDialog } = await import('./section-form'));
});

function renderEditor(items = SECTION.items) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SectionItemsEditor section={{ ...SECTION, items }} />
    </QueryClientProvider>,
  );
}

/** Wait for the (mocked) catalogue PAGE to land — the ordered list can already
 *  be named from the module-level title cache, so wait on a grid cell. */
function catalogueLoaded() {
  return screen.findByRole('checkbox', { name: 'Alpha Aarti' });
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
  expectOrder(['Alpha Aarti', 'Beta Aarti', 'Gamma Aarti']);
  expect(screen.getByRole('button', { name: 'Save order' })).toHaveProperty('disabled', true);

  fireEvent.click(screen.getByRole('button', { name: /reshuffle/i }));

  expectOrder(['Beta Aarti', 'Gamma Aarti', 'Alpha Aarti']);
  expect(screen.getByRole('button', { name: 'Save order' })).toHaveProperty('disabled', false);
  screen.getByText('Unsaved changes');
  // The whole point: randomizing is LOCAL — nothing is persisted until Save.
  expect(mocked.put).not.toHaveBeenCalled();

  random.mockRestore();
});

test('Reshuffle is disabled below two items', () => {
  renderEditor([
    { audioId: 'a', position: 0, title: 'Alpha Aarti', coverImageUrl: 'https://cdn.test/a.png' },
  ]);

  expect(screen.getByRole('button', { name: /reshuffle/i })).toHaveProperty('disabled', true);
});

test('ticking appends, unticking closes the gap, and Save posts the displayed order', async () => {
  renderEditor();
  await catalogueLoaded();
  expectOrder(['Alpha Aarti', 'Beta Aarti', 'Gamma Aarti']);

  // Membership drives the grid: members are checked, non-members are not.
  screen.getByRole('checkbox', { name: 'Alpha Aarti', checked: true });
  screen.getByRole('checkbox', { name: 'Delta Aarti', checked: false });

  // The ordered list is READ-ONLY now — no remove/up/down controls.
  expect(screen.queryAllByRole('button', { name: /^(Remove|Move) / })).toHaveLength(0);

  // Untick → removed, and the remaining positions close up.
  fireEvent.click(screen.getByRole('checkbox', { name: 'Beta Aarti' }));
  expectOrder(['Alpha Aarti', 'Gamma Aarti']);
  screen.getByRole('checkbox', { name: 'Beta Aarti', checked: false });

  // Tick → appended at the END.
  fireEvent.click(screen.getByRole('checkbox', { name: 'Delta Aarti' }));
  expectOrder(['Alpha Aarti', 'Gamma Aarti', 'Delta Aarti']);

  // Still nothing persisted — Save is the single persistence point.
  expect(mocked.put).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Save order' }));

  await waitFor(() => expect(mocked.put).toHaveBeenCalledTimes(1));
  expect(mocked.put).toHaveBeenCalledWith('/admin/aarti/sections/{id}/items', {
    params: { path: { id: 'sec-1' } },
    body: { audioIds: ['a', 'c', 'd'] },
  });
});

test('checked state survives paging, and an off-page member is still removable', async () => {
  renderEditor();
  await catalogueLoaded();
  screen.getByText(/Page 1 of 2/);

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('checkbox', { name: 'Filler Aarti 25' });
  // The ordered list still names its members, though none are on this page.
  expectOrder(['Alpha Aarti', 'Beta Aarti', 'Gamma Aarti']);

  fireEvent.click(screen.getByRole('checkbox', { name: 'Filler Aarti 25' }));
  expectOrder(['Alpha Aarti', 'Beta Aarti', 'Gamma Aarti', 'Filler Aarti 25']);

  // Page back: membership is derived from the ids, not from page-local state.
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await catalogueLoaded();
  screen.getByRole('checkbox', { name: 'Alpha Aarti', checked: true });
  expectOrder(['Alpha Aarti', 'Beta Aarti', 'Gamma Aarti', 'Filler Aarti 25']);

  // …and the member that now sits on page 2 can be unticked by paging to it.
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('checkbox', { name: 'Filler Aarti 25', checked: true });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Filler Aarti 25' }));
  expectOrder(['Alpha Aarti', 'Beta Aarti', 'Gamma Aarti']);
});

test('a member that is not on the current grid page still renders its title', async () => {
  renderEditor([
    { audioId: 'a', position: 0, title: 'Alpha Aarti', coverImageUrl: 'https://cdn.test/a.png' },
    { audioId: 'f25', position: 1, title: 'Filler Aarti 25', coverImageUrl: 'https://cdn.test/25.png' },
  ]);
  await catalogueLoaded();

  // `f25` sits on grid page 2 and has never been loaded — the section detail
  // carries its title, so the ordered list names it and no raw id leaks out.
  expect(screen.queryByRole('checkbox', { name: 'Filler Aarti 25' })).toBeNull();
  expectOrder(['Alpha Aarti', 'Filler Aarti 25']);
  expect(screen.queryByText('f25')).toBeNull();
});

test('checked state survives a search', async () => {
  renderEditor();
  await catalogueLoaded();

  fireEvent.change(screen.getByLabelText('All aartis — tick to include'), {
    target: { value: 'alpha' },
  });

  await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(1));
  screen.getByRole('checkbox', { name: 'Alpha Aarti', checked: true });
});

test('a new section starts INACTIVE', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SectionFormDialog state={{ kind: 'create' }} onClose={() => undefined} />
    </QueryClientProvider>,
  );

  await screen.findByText('New homepage section');
  // `isActive` is the form's only switch, and it starts off.
  expect(screen.queryAllByRole('switch', { checked: true })).toHaveLength(0);
  expect(screen.getAllByRole('switch', { checked: false })).toHaveLength(1);
});

test('the items editor is present for a curated section and absent for a built-in one', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { unmount } = render(
    <QueryClientProvider client={qc}>
      <SectionFormDialog state={{ kind: 'edit', id: 'sec-1' }} onClose={() => undefined} />
    </QueryClientProvider>,
  );

  await screen.findByRole('button', { name: 'Save order' });
  screen.getByText('Curated aartis');
  unmount();

  mocked.sectionType = 'newly_added';
  const qc2 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc2}>
      <SectionFormDialog state={{ kind: 'edit', id: 'sec-1' }} onClose={() => undefined} />
    </QueryClientProvider>,
  );

  await screen.findByText('Automatically resolved');
  screen.getByText(/takes no hand-picked items/i);
  expect(screen.queryByRole('button', { name: 'Save order' })).toBeNull();
});
