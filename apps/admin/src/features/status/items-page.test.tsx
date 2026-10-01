import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import type React from 'react';

// Both `useStatusItems` and `useDeityOptions` read through `@/lib/api`; one mocked
// GET serves the `{items,total,page,pageSize}` envelope (ADR C2) for either path.
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
                slug: 'diwali-ganesh',
                title: 'Diwali Ganesh',
                mediaType: 'image',
                imageUrl: 'https://cdn.example.com/a.png',
                videoUrl: null,
                thumbnailUrl: 'https://cdn.example.com/a-thumb.png',
                overlaySafeArea: { top: 0.1, bottom: 0.14, left: 0.05, right: 0.05 },
                languages: [],
                shareCaption: null,
                isActive: true,
                active: true,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-02T00:00:00.000Z',
              },
              {
                id: '2',
                slug: 'holi-krishna',
                title: 'Holi Krishna',
                mediaType: 'video',
                imageUrl: null,
                videoUrl: 'https://cdn.example.com/b.mp4',
                thumbnailUrl: 'https://cdn.example.com/b-thumb.png',
                overlaySafeArea: { top: 0.1, bottom: 0.14, left: 0.05, right: 0.05 },
                languages: ['hi'],
                shareCaption: null,
                isActive: false,
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

let StatusItemsPage: () => React.JSX.Element;
beforeEach(async () => {
  ({ StatusItemsPage } = await import('./items-page'));
});

test('Status items page renders server-paginated rows with mediaType badges', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <StatusItemsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Diwali Ganesh')).toBeTruthy();
  expect(screen.getByText('Holi Krishna')).toBeTruthy();
  // mediaType is a badge (IMAGE/VIDEO); "Image"/"Video" also appear as filter options.
  expect(screen.getByText('IMAGE')).toBeTruthy();
  expect(screen.getByText('VIDEO')).toBeTruthy();
  // Soft-delete state + reversible action.
  expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /reactivate/i })).toBeTruthy();
  // Never "Delete".
  expect(screen.getByRole('button', { name: /deactivate/i })).toBeTruthy();
});

test('Grid view plays video rows in the card; image rows stay a thumbnail', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <StatusItemsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await screen.findByText('Diwali Ganesh');
  fireEvent.click(screen.getByRole('button', { name: 'Grid' }));

  // The media is the card's first title-carrying node (the title span follows).
  // `toHaveProperty` rather than `.getAttribute(…)`, and no `tagName`: the test
  // tsconfig/lint project has no DOM lib — see users-page.
  const [media] = screen.getAllByTitle('Holi Krishna');
  expect(media).toHaveProperty('src', 'https://cdn.example.com/b.mp4');
  // Poster = the thumbnail, so the card looks identical until played.
  expect(media).toHaveProperty('poster', 'https://cdn.example.com/b-thumb.png');
  expect(media).toHaveProperty('controls', true);
  // …and it is NOT the <img> the row used to render.
  expect(screen.queryByRole('img', { name: 'Holi Krishna' })).toBeNull();

  // The image row is untouched — still an <img> of its thumbnail.
  expect(screen.getByRole('img', { name: 'Diwali Ganesh' })).toHaveProperty(
    'src',
    'https://cdn.example.com/a-thumb.png',
  );
});
