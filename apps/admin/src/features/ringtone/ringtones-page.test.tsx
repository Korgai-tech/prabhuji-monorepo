import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import type React from 'react';

// Both the ringtone list and the deity-picker options come through `@/lib/api`,
// so mock that specifier. The list endpoint returns the `{items,total,page,
// pageSize}` envelope (ADR C2).
vi.mock('@/lib/api', () => {
  const ringtoneRow = {
    id: 'r1',
    slug: 'ganesh-aarti',
    title: 'Ganesh Aarti Ringtone',
    deitySlug: 'ganesh',
    thumbnailImageUrl: 'https://cdn.example.com/thumb.png',
    audioUrl: 'https://cdn.example.com/audio.mp3',
    playCount: 1234,
    setCount: 56,
    tags: ['aarti'],
    searchKeywords: ['ganesh'],
    languages: ['hi'],
    artistOrSource: null,
    deepLinkUrl: null,
    altText: null,
    shareTitle: null,
    shareDescription: null,
    sortOrder: 0,
    isActive: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
  return {
    api: {
      GET: vi.fn((path: string) =>
        Promise.resolve({
          data: {
            success: true,
            message: 'OK',
            data: path.includes('deities')
              ? { items: [], total: 0, page: 1, pageSize: 100 }
              : { items: [ringtoneRow], total: 1, page: 1, pageSize: 25 },
          },
          error: undefined,
          response: new Response(),
        }),
      ),
      POST: vi.fn(),
      PATCH: vi.fn(),
      DELETE: vi.fn(),
    },
  };
});

let RingtonesPage: () => React.JSX.Element;
beforeEach(async () => {
  ({ RingtonesPage } = await import('./ringtones-page'));
});

test('Ringtones page renders server-paginated rows from the (mocked) api-client', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RingtonesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  // Title + slug + read-only counters render.
  expect(await screen.findByText('Ganesh Aarti Ringtone')).toBeTruthy();
  expect(screen.getByText('ganesh-aarti')).toBeTruthy();
  expect(screen.getByText('1234')).toBeTruthy(); // playCount read-only
  expect(screen.getByText('56')).toBeTruthy(); // setCount read-only
  // Soft-delete state is a badge and a reactivate action is offered on the
  // inactive row. Deactivate is never labelled "Delete" (§(f)).
  expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /reactivate/i })).toBeTruthy();
});
