import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import type React from 'react';

// A lean smoke test (spec: "no broad tests; smoke ok"). The list endpoint
// returns the `{items,total,page,pageSize}` envelope (ADR C2); the feature hooks
// import the client as `@/lib/api`, so mock that specifier.
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
                slug: 'ganesh-sunrise',
                title: 'Ganesh Sunrise',
                mediaType: 'static',
                thumbnailUrl: 'https://cdn.example.com/a.png',
                previewImageUrl: 'https://cdn.example.com/a-preview.png',
                previewVideoUrl: null,
                setCount: 12,
                isActive: true,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-02T00:00:00.000Z',
                deitySlug: 'ganesh',
                languages: [],
              },
              {
                id: '2',
                slug: 'shiva-live',
                title: 'Shiva Live',
                mediaType: 'live',
                thumbnailUrl: 'https://cdn.example.com/b.png',
                previewImageUrl: 'https://cdn.example.com/b-preview.png',
                previewVideoUrl: 'https://cdn.example.com/b-loop.mp4',
                setCount: 3,
                isActive: false,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-03T00:00:00.000Z',
                deitySlug: null,
                languages: ['hi'],
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

let WallpapersPage: () => React.JSX.Element;
beforeEach(async () => {
  ({ WallpapersPage } = await import('./wallpapers-page'));
});

test('Wallpapers page renders server-paginated rows with mediaType + setCount', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WallpapersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Ganesh Sunrise')).toBeTruthy();
  expect(screen.getByText('Shiva Live')).toBeTruthy();
  // mediaType badges (STATIC/LIVE) — LIVE also appears as a filter option.
  expect(screen.getByText('STATIC')).toBeTruthy();
  expect(screen.getAllByText('LIVE').length).toBeGreaterThan(0);
  // Read-only setCount is displayed.
  expect(screen.getByText('12')).toBeTruthy();
  // Soft-delete: an inactive row offers Reactivate; the label is never "Delete".
  expect(screen.getByRole('button', { name: /reactivate/i })).toBeTruthy();
  expect(screen.getByRole('button', { name: /deactivate/i })).toBeTruthy();
});

test('Grid view swaps the table for thumbnail cards, keeping the filter bar', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WallpapersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Ganesh Sunrise')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /^grid$/i }));

  // Table is gone; one big thumbnail per wallpaper is not.
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.getByRole('img', { name: 'Ganesh Sunrise' })).toBeTruthy();
  // A card carries title + type and the two controls — but not "Add to feed".
  expect(screen.getByRole('button', { name: /deactivate/i })).toBeTruthy();
  expect(screen.getByRole('button', { name: /reactivate/i })).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /^edit$/i }).length).toBe(2);
  expect(screen.queryByRole('button', { name: /add to feed/i })).toBeNull();
  expect(screen.getByText('STATIC')).toBeTruthy();
  // Filters keep working exactly as in the table view.
  expect(screen.getByLabelText('Search')).toBeTruthy();
  expect(screen.getByLabelText('Deity')).toBeTruthy();
});

test('Grid view plays a live wallpaper loop in the card; static stays a thumbnail', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WallpapersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await screen.findByText('Ganesh Sunrise');
  fireEvent.click(screen.getByRole('button', { name: /^grid$/i }));

  // The media is the card's first title-carrying node (the title span follows).
  // `toHaveProperty` rather than `.getAttribute(…)`, and no `tagName`: the test
  // tsconfig/lint project has no DOM lib — see users-page.
  const [media] = screen.getAllByTitle('Shiva Live');
  expect(media).toHaveProperty('src', 'https://cdn.example.com/b-loop.mp4');
  // Poster = the thumbnail, so the card looks identical until played.
  expect(media).toHaveProperty('poster', 'https://cdn.example.com/b.png');
  expect(media).toHaveProperty('controls', true);
  // …and it is NOT the <img> the row used to render.
  expect(screen.queryByRole('img', { name: 'Shiva Live' })).toBeNull();

  // A static row has no loop to play — still an <img> of its thumbnail.
  expect(screen.getByRole('img', { name: 'Ganesh Sunrise' })).toHaveProperty(
    'src',
    'https://cdn.example.com/a.png',
  );
});
