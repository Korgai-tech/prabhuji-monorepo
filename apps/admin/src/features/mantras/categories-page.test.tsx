import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import type React from 'react';

// The list endpoint returns the `{items,total,page,pageSize}` envelope (ADR C2).
// The feature hooks import the client as `@/lib/api`, so mock that specifier.
vi.mock('@/lib/api', () => ({
  api: {
    GET: vi.fn(() =>
      Promise.resolve({
        data: {
          success: true,
          message: 'OK',
          data: {
            items: [
              {
                id: '1',
                slug: 'morning-mantras',
                displayName: 'Morning Mantras',
                imageUrl: 'https://cdn.example.com/morning.png',
                backgroundColorToken: null,
                sortOrder: 0,
                isActive: true,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-02T00:00:00.000Z',
              },
              {
                id: '2',
                slug: 'evening-stutis',
                displayName: 'Evening Stutis',
                imageUrl: null,
                backgroundColorToken: null,
                sortOrder: 1,
                isActive: false,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-03T00:00:00.000Z',
              },
            ],
            total: 2,
            page: 1,
            pageSize: 25,
          },
        },
        error: undefined,
        response: new Response(),
      }),
    ),
    POST: vi.fn(),
    PUT: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
  },
}));

let MantraCategoriesPage: () => React.JSX.Element;
beforeEach(async () => {
  ({ MantraCategoriesPage } = await import('./categories-page'));
});

test('Mantra categories page renders server-paginated rows from the (mocked) api-client', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MantraCategoriesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Morning Mantras')).toBeTruthy();
  expect(screen.getByText('evening-stutis')).toBeTruthy();
  // Soft-delete state shows as a badge + a reactivate action on the inactive row;
  // "Inactive" is also a filter option, hence getAllByText.
  expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /reactivate/i })).toBeTruthy();
  // Deactivate is labelled Deactivate, never "Delete" (§(f)).
  expect(screen.getByRole('button', { name: /deactivate/i })).toBeTruthy();
});
