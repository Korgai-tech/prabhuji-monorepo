import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import type React from 'react';

/**
 * PinnedContentFormDialog — create flow.
 *
 * The assertions that matter:
 *  - Deity field is hidden by default (surface=home) and appears when
 *    surface flips to `status_deity`. Content picker becomes surface-scoped.
 *  - Duration-in-days two-way binds with End: setting duration recomputes
 *    End; editing End recomputes duration.
 *  - Submit converts IST-local Start/End → UTC ISO on the wire, and never
 *    sends `deitySlug` on non-status_deity surfaces.
 */

const HOME_CONTENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const homeFeedItem = {
  id: HOME_CONTENT_ID,
  slug: 'diwali-hero',
  contentType: 'wallpaper',
  module: 'wallpaper',
  title: 'Diwali Hero',
  subtitle: null,
  label: null,
  badge: null,
  badgeLabel: null,
  heroImageUrl: 'https://cdn.example.com/diwali-hero.png',
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

const statusItem = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  slug: 'ganesh-hero',
  title: 'Ganesh Hero',
  mediaType: 'image' as const,
  imageUrl: 'https://cdn.example.com/ganesh.png',
  videoUrl: null,
  thumbnailUrl: 'https://cdn.example.com/ganesh-thumb.png',
  overlaySafeArea: { top: 0.1, bottom: 0.14, left: 0.05, right: 0.05 },
  languages: [],
  shareCaption: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: { GET: get, POST: post, PATCH: patch, DELETE: del },
}));

function ok<T>(data: T) {
  return Promise.resolve({
    data: { success: true as const, message: 'OK', data },
    error: undefined,
    response: new Response(),
  });
}

type StatusItemsArgs = { params?: { query?: { deitySlug?: string } } };

function routeGet(path: string, args?: StatusItemsArgs) {
  if (path === '/admin/home/feed-items') {
    return ok({ items: [homeFeedItem], total: 1, page: 1, pageSize: 100 });
  }
  if (path === '/admin/status/items') {
    // Return a matching item only when scoped to ganesh — mirrors the API's
    // deitySlug filter behaviour.
    const items = args?.params?.query?.deitySlug === 'ganesh' ? [statusItem] : [];
    return ok({ items, total: items.length, page: 1, pageSize: 100 });
  }
  if (path === '/admin/taxonomy/deities') {
    return ok({
      items: [{ slug: 'ganesh', active: true }],
      total: 1,
      page: 1,
      pageSize: 100,
    });
  }
  return ok(null);
}

let PinnedContentFormDialog: (props: {
  state: { kind: 'create' } | { kind: 'edit'; id: string } | null;
  onClose: () => void;
}) => React.JSX.Element;

beforeEach(async () => {
  get.mockReset();
  get.mockImplementation(routeGet);
  post.mockReset();
  patch.mockReset();
  del.mockReset();
  ({ PinnedContentFormDialog } = await import('./pinned-content-form'));
});

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PinnedContentFormDialog state={{ kind: 'create' }} onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, onClose };
}

test('the Deity field is hidden by default (surface = home) and shown for status_deity', async () => {
  renderForm();

  await screen.findByLabelText('Surface');
  expect(screen.queryByLabelText('Deity')).toBeNull();

  fireEvent.change(screen.getByLabelText('Surface'), {
    target: { value: 'status_deity' },
  });

  await screen.findByLabelText('Deity');
});

test('Duration + Start auto-fills End; editing End recomputes Duration', async () => {
  renderForm();
  await screen.findByLabelText('Surface');

  const start = screen.getByLabelText('Start at (IST)');
  const end = screen.getByLabelText('End at (IST)');
  const duration = screen.getByLabelText('Duration (days)');

  fireEvent.change(start, { target: { value: '2026-09-08T10:00' } });
  fireEvent.change(duration, { target: { value: '7' } });

  // Read `.value` off the DOM node via `getByDisplayValue` (this repo's admin
  // lint rejects casting a `getByLabelText` result to `HTMLInputElement`).
  await waitFor(() => expect(screen.getByDisplayValue('2026-09-15T10:00')).toBeTruthy());

  fireEvent.change(end, { target: { value: '2026-09-22T10:00' } });
  await waitFor(() => expect(screen.getByDisplayValue('14')).toBeTruthy());
});

test('submitting a home pin sends UTC-ISO dates and no deitySlug', async () => {
  post.mockImplementation(() =>
    ok({
      id: 'created',
      surface: 'home',
      deitySlug: null,
      contentId: HOME_CONTENT_ID,
      pinPosition: 1,
      startAt: '2026-09-08T04:30:00.000Z',
      endAt: '2026-09-15T04:30:00.000Z',
      createdAt: '2026-09-08T04:30:00.000Z',
      updatedAt: '2026-09-08T04:30:00.000Z',
      createdBy: 'alice',
      updatedBy: 'alice',
      deletedAt: null,
    }),
  );

  renderForm();
  await screen.findByLabelText('Surface');

  // Wait for the content picker to hydrate and pick the home feed item.
  const contentRadio = await screen.findByRole('radio', { name: /Diwali Hero/ });
  fireEvent.click(contentRadio);

  fireEvent.change(screen.getByLabelText('Position'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Start at (IST)'), {
    target: { value: '2026-09-08T10:00' },
  });
  fireEvent.change(screen.getByLabelText('End at (IST)'), {
    target: { value: '2026-09-15T10:00' },
  });

  fireEvent.click(screen.getByRole('button', { name: 'Create pin' }));

  await waitFor(() => expect(post).toHaveBeenCalled());
  expect(post).toHaveBeenCalledWith('/admin/pinned-content', {
    body: {
      surface: 'home',
      contentId: HOME_CONTENT_ID,
      pinPosition: 1,
      startAt: '2026-09-08T04:30:00.000Z',
      endAt: '2026-09-15T04:30:00.000Z',
    },
  });
});

test('a validation error blocks submission — missing content id keeps POST unfired', async () => {
  renderForm();
  await screen.findByLabelText('Surface');

  fireEvent.change(screen.getByLabelText('Position'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Start at (IST)'), {
    target: { value: '2026-09-08T10:00' },
  });
  fireEvent.change(screen.getByLabelText('End at (IST)'), {
    target: { value: '2026-09-15T10:00' },
  });

  fireEvent.click(screen.getByRole('button', { name: 'Create pin' }));

  await waitFor(() => expect(screen.getByText(/Pick a content item/)).toBeTruthy());
  expect(post).not.toHaveBeenCalled();
});
