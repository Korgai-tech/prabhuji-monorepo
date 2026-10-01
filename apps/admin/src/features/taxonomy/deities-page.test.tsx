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
                slug: 'ganesh',
                iconUrl: 'https://cdn.example.com/ganesh.png',
                sortOrder: 0,
                active: true,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-02T00:00:00.000Z',
              },
              {
                id: '2',
                slug: 'shiva',
                iconUrl: 'https://cdn.example.com/shiva.png',
                sortOrder: 1,
                active: false,
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
    DELETE: vi.fn(),
  },
}));

let DeitiesPage: () => React.JSX.Element;
beforeEach(async () => {
  ({ DeitiesPage } = await import('./deities-page'));
});

test('Deities page renders server-paginated rows from the (mocked) api-client', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DeitiesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  // `ganesh` appears in both the Slug column and the (slug-fallback) Name column.
  expect((await screen.findAllByText('ganesh')).length).toBeGreaterThan(0);
  expect(screen.getAllByText('shiva').length).toBeGreaterThan(0);
  // Soft-delete state is a badge, and a reactivate action is offered on the
  // inactive row ("Inactive" also appears as a filter option, hence getAllByText).
  expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /reactivate/i })).toBeTruthy();
  // Deactivate is labelled Deactivate, never "Delete" (§(e)).
  expect(screen.getByRole('button', { name: /deactivate/i })).toBeTruthy();
});
