import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import type React from 'react';

// The list endpoint returns the `{items,total,page,pageSize}` envelope (ADR C2).
// Feature hooks import the client as `@/lib/api`, so mock that specifier.
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
                mediaType: 'image',
                mediaUrl: 'https://cdn.example.com/a.png',
                thumbnailUrl: null,
                title: 'Featured wallpaper',
                destinationType: 'linked_module',
                destinationValue: 'wallpaper',
                isProFeatureDiscovery: false,
                sortOrder: 0,
                isActive: true,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-02T00:00:00.000Z',
              },
              {
                id: '2',
                mediaType: 'video',
                mediaUrl: 'https://cdn.example.com/b.mp4',
                thumbnailUrl: 'https://cdn.example.com/b.png',
                title: 'Go Pro',
                destinationType: 'pro_paywall',
                destinationValue: 'pro-annual',
                isProFeatureDiscovery: true,
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
    DELETE: vi.fn(),
  },
}));

let BannersPage: () => React.JSX.Element;
beforeEach(async () => {
  ({ BannersPage } = await import('./banners-page'));
});

test('Banners page renders server-paginated rows from the (mocked) api-client', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BannersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Featured wallpaper')).toBeTruthy();
  expect(screen.getByText('Go Pro')).toBeTruthy();
  // Soft-delete state is a badge; a reactivate action is offered on the inactive row.
  expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /reactivate/i })).toBeTruthy();
  // "Deactivate", never "Delete" (§(g)).
  expect(screen.getByRole('button', { name: /deactivate/i })).toBeTruthy();
});
