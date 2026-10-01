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
                slug: 'morning-aartis',
                name: 'Morning Aartis',
                imageUrl: 'https://cdn.example.com/morning.png',
                description: null,
                displayColor: null,
                sortOrder: 0,
                isActive: true,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-02T00:00:00.000Z',
              },
              {
                id: '2',
                slug: 'evening-aartis',
                name: 'Evening Aartis',
                imageUrl: 'https://cdn.example.com/evening.png',
                description: null,
                displayColor: null,
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
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

let CategoriesPage: () => React.JSX.Element;
beforeEach(async () => {
  ({ CategoriesPage } = await import('./categories-page'));
});

test('Aarti categories page renders server-paginated rows from the (mocked) api-client', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CategoriesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect((await screen.findAllByText('Morning Aartis')).length).toBeGreaterThan(0);
  expect(screen.getAllByText('Evening Aartis').length).toBeGreaterThan(0);
  // Soft-delete state is a badge; Reactivate is offered on the inactive row.
  expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /reactivate/i })).toBeTruthy();
  // Destructive action is "Deactivate", never "Delete" (§(f)).
  expect(screen.getByRole('button', { name: /deactivate/i })).toBeTruthy();
});
