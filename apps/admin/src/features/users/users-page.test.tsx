import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import type React from 'react';

const GET = vi.fn(() =>
  Promise.resolve({
    data: {
      success: true,
      message: 'OK',
      data: {
        items: [
          {
            id: '1',
            email: 'a@e.com',
            name: 'Ada',
            phoneCountryCode: null,
            phoneNumber: null,
            loginType: 'email',
            createdAt: '2026-01-02T03:04:05.000Z',
            phoneVerifiedAt: null,
          },
          {
            id: '2',
            email: null,
            name: null,
            phoneCountryCode: '+91',
            phoneNumber: '9876543210',
            loginType: 'otp',
            createdAt: '2026-01-01T03:04:05.000Z',
            phoneVerifiedAt: '2026-01-01T03:05:00.000Z',
          },
          // TAM-154 — a LEAD: asked for an OTP, never entered it. The row only
          // exists at all because it is written at send time.
          {
            id: '3',
            email: null,
            name: null,
            phoneCountryCode: '+91',
            phoneNumber: '9812345678',
            loginType: 'otp',
            createdAt: '2026-01-01T02:00:00.000Z',
            phoneVerifiedAt: null,
          },
        ],
        total: 3,
        page: 1,
        pageSize: 25,
      },
    },
    error: undefined,
  }),
);

vi.mock('../../lib/api', () => ({ api: { GET, POST: vi.fn() } }));

let UsersPage: () => React.JSX.Element;
beforeEach(async () => {
  vi.clearAllMocks();
  ({ UsersPage } = await import('./users-page'));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      {/* The toolbar's "New user" <Link> needs a router context. */}
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test('Users page renders rows from the (mocked) api-client', async () => {
  renderPage();
  expect(await screen.findByText('a@e.com')).toBeTruthy();
  // The phone account: no email, so the column shows the em dash and the phone
  // renders with its country code.
  expect(await screen.findByText('+91 9876543210')).toBeTruthy();
});

/**
 * The distinction the column exists for: since TAM-154 the row is created when
 * the OTP is REQUESTED, so an unverified phone account is a lead to call, not a
 * signup. The email (CMS) account has no phone to verify and shows the em dash.
 */
test('an unverified phone account is labelled, not shown as a signup', async () => {
  renderPage();
  expect(await screen.findByText('+91 9812345678')).toBeTruthy();
  expect(screen.getAllByText('Not verified')).toHaveLength(1);
});

/**
 * Creating a user is its own route now. The list must offer the way there and
 * must NOT mount the form itself — it used to sit above the table on every
 * visit, in front of the list the editor came for.
 */
test('the list links to the create page instead of embedding the form', async () => {
  renderPage();
  await screen.findByText('a@e.com');

  // `toHaveProperty` rather than `.getAttribute(…)`: the lint project cannot
  // resolve DOM types in test files, so any member call on the element is an
  // `no-unsafe-call` error. An anchor's `pathname` is the parsed href.
  expect(screen.getByRole('link', { name: /new user/i })).toHaveProperty(
    'pathname',
    '/users/new',
  );
  expect(screen.queryByLabelText(/password/i)).toBeNull();
});

/**
 * The regression this file exists for: the page must ask the SERVER to
 * paginate/sort. It used to fetch every user and slice client-side, so a broken
 * querystring was invisible in the UI.
 */
test('the list request carries the page/sort querystring', async () => {
  renderPage();
  await screen.findByText('a@e.com');

  expect(GET).toHaveBeenCalledWith('/admin/users', {
    params: { query: { page: 1, pageSize: 25, sort: 'createdAt', order: 'desc' } },
  });
});
