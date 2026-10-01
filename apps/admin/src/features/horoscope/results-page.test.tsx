import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import type React from 'react';

/**
 * Smoke test for the daily-results primary surface. The feature hooks import the
 * client as `@/lib/api`; branch the mocked `GET` on the requested path so the
 * results list, the modes select and the coverage query each get a valid
 * `{items,total,page,pageSize}` envelope (ADR C2).
 */
const resultRow = {
  id: 'r1',
  zodiacId: 'aries',
  modeId: 'daily',
  dateIst: '2026-07-17',
  languageCode: 'en',
  steps: [
    {
      stepId: 'summary',
      title: 'Summary',
      displayText: 'A calm day',
      ttsText: 'A calm day',
      order: 0,
      contentType: 'text',
    },
  ],
  providerName: 'cms',
  generatedAt: '2026-07-16T00:00:00.000Z',
  contentSafetyStatus: 'passed',
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
};

const modeRow = {
  id: 'm1',
  modeId: 'daily',
  modeName: 'Daily',
  enabled: true,
  phase: 1,
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
};

function envelope(items: unknown[]) {
  return {
    data: { success: true, message: 'OK', data: { items, total: items.length, page: 1, pageSize: 25 } },
    error: undefined,
    response: new Response(),
  };
}

vi.mock('@/lib/api', () => ({
  api: {
    GET: vi.fn((path: string) =>
      Promise.resolve(path === '/admin/horoscope/modes' ? envelope([modeRow]) : envelope([resultRow])),
    ),
    POST: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
  },
}));

let ResultsPage: () => React.JSX.Element;
beforeEach(async () => {
  ({ ResultsPage } = await import('./results-page'));
});

test('Daily results page renders authored rows, coverage and a genuine Delete action', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ResultsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  // The authored result row shows its localized sign label.
  expect((await screen.findAllByText('Aries')).length).toBeGreaterThan(0);
  // The coverage indicator (highest-value element) renders its heading once its
  // own query resolves.
  expect(await screen.findByRole('heading', { name: /Coverage/ })).toBeTruthy();
  // Results genuinely hard-delete: the row action is "Delete", never "Deactivate".
  expect(screen.getByRole('button', { name: /delete/i })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /deactivate/i })).toBeNull();
  // The create entry point is present.
  expect(screen.getByRole('button', { name: /new result/i })).toBeTruthy();
});
