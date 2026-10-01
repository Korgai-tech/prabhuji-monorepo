import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import type React from 'react';

import type {
  ChatTranscript,
  ChatTranscriptSession,
} from './use-chat-transcript';

/**
 * The three facts this page exists to present, and the three a refactor could
 * silently break: the turns are attributed to the right SIDE, the conversations
 * read forward in time (newest at the BOTTOM, against an API that pages them
 * newest-first), and each session header names the arm it came from.
 */

/**
 * The fixtures are typed off the generated client rather than inferred from
 * their first literal: `variant`, `personaSlug` and the user's name/phone are
 * NULLABLE on the wire, and a test that cannot set them to null cannot cover
 * the retired-arm and unnamed-user cases this page has branches for.
 */
type Transcript = ChatTranscript;
type Session = ChatTranscriptSession;

const OLDER_SESSION: Session = {
  id: '11111111-1111-1111-1111-111111111111',
  agentId: 'e1791026a07b11f18455bf94535108a7',
  variant: 'bhagwat_gita_chat',
  personaSlug: null,
  createdAt: '2026-01-05T09:00:00.000Z',
  messageCount: 1,
  truncated: false,
  messages: [
    {
      id: 'm-old',
      role: 'user' as const,
      message: 'Gita kya sikhati he?',
      confidence: null,
      recommendations: [],
      createdAt: '2026-01-05T09:00:01.000Z',
    },
  ],
};

const NEWER_SESSION: Session = {
  id: '22222222-2222-2222-2222-222222222222',
  agentId: 'e25f6744a6a511f18e582d93545b9663',
  variant: 'kuldevta_chat',
  personaSlug: 'nagnechi',
  createdAt: '2026-02-01T09:00:00.000Z',
  messageCount: 2,
  truncated: false,
  messages: [
    {
      id: 'm-user',
      role: 'user' as const,
      message: 'Namaste',
      confidence: null,
      recommendations: [],
      createdAt: '2026-02-01T09:00:01.000Z',
    },
    {
      id: 'm-bot',
      role: 'bot' as const,
      message: 'Namaste beta.',
      confidence: 'high',
      recommendations: [],
      createdAt: '2026-02-01T09:00:02.000Z',
    },
  ],
};

const USER: Transcript['user'] = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'Asha',
  phoneCountryCode: '+91',
  phoneNumber: '9876543210',
};

/** The `{success,message,data}` envelope `unwrap()` expects. */
function envelope(items: Session[], user: Transcript['user'] = USER) {
  return {
    data: {
      success: true,
      message: 'OK',
      data: { user, items, total: items.length, page: 1, pageSize: 10 },
    },
    error: undefined,
  };
}

// NEWEST FIRST, as the API serves it.
const GET = vi.fn(() => Promise.resolve(envelope([NEWER_SESSION, OLDER_SESSION])));

vi.mock('../../lib/api', () => ({ api: { GET, POST: vi.fn() } }));

let ChatTranscriptPage: () => React.JSX.Element;
beforeEach(async () => {
  vi.clearAllMocks();
  ({ ChatTranscriptPage } = await import('./chat-transcript-page'));
});

function renderPage(initialEntry = '/chat/history?userId=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      {/* The user id is read from the query string, so the page needs a router. */}
      <MemoryRouter initialEntries={[initialEntry]}>
        <ChatTranscriptPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test('with no user id it prompts instead of requesting', () => {
  renderPage('/chat/history');
  expect(screen.getByText('No user selected')).toBeTruthy();
  // 35 of the 36 characters of a uuid are a 400 — the page must not fire until
  // it has a whole one.
  expect(GET).not.toHaveBeenCalled();
});

test('the user id from the query string is what gets requested', async () => {
  renderPage();
  await screen.findByText('Asha');

  expect(GET).toHaveBeenCalledWith('/admin/chat/transcript', {
    params: {
      query: {
        userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        page: 1,
        pageSize: 10,
      },
    },
  });
});

test('sessions render oldest first — newest conversation at the bottom', async () => {
  renderPage();
  await screen.findByText('Asha');

  // The API paged them newest-first so page 1 is the RECENT conversations;
  // the page reverses that, so reading DOWN the page is reading forward in
  // time and the newest conversation sits at the bottom.
  const [older, newer] = screen.getAllByRole('region');
  expect(within(older).getByText('Gita kya sikhati he?')).toBeTruthy();
  expect(within(newer).getByText('Namaste beta.')).toBeTruthy();
});

test('each session header names the arm and the agent it came from', async () => {
  renderPage();
  await screen.findByText('Asha');

  expect(screen.getByText('kuldevta_chat')).toBeTruthy();
  expect(screen.getByText('bhagwat_gita_chat')).toBeTruthy();
  expect(screen.getByText('e25f6744a6a511f18e582d93545b9663')).toBeTruthy();
  // The persona agent answers as a different deity per user, so the session
  // header says which one this conversation was opened as.
  expect(screen.getByText('as nagnechi')).toBeTruthy();
});

test('a retired agent reads as an unknown arm, not as control', async () => {
  GET.mockResolvedValueOnce(
    envelope([{ ...NEWER_SESSION, variant: null, personaSlug: null }], {
      ...USER,
      name: null,
      phoneCountryCode: null,
      phoneNumber: null,
    }),
  );

  renderPage();
  expect(await screen.findByText('unknown arm')).toBeTruthy();
});

test('user and agent turns are labelled distinctly', async () => {
  renderPage();
  await screen.findByText('Asha');

  // Two user turns across the two sessions, one agent reply.
  expect(screen.getAllByText('User')).toHaveLength(2);
  expect(screen.getAllByText('Agent')).toHaveLength(1);
});

test('a user with no conversations says so', async () => {
  GET.mockResolvedValueOnce(envelope([]));

  renderPage();
  expect(await screen.findByText('No conversations')).toBeTruthy();
});

test('a truncated session says how much of it is showing', async () => {
  GET.mockResolvedValueOnce(
    envelope([{ ...NEWER_SESSION, messageCount: 812, truncated: true }]),
  );

  renderPage();
  // The alternative — presenting the tail as the whole conversation — is what
  // this line exists to prevent.
  expect(await screen.findByText(/Showing the last 2 of 812 messages/)).toBeTruthy();
});

/**
 * The content agent recommends catalogue items alongside its reply, and the app
 * draws them as cards. A transcript that showed only the prose read as an
 * unfinished sentence — "Yeh rahi Hanuman Chalisa" and then nothing.
 */
test('a recommending turn shows what was recommended', async () => {
  GET.mockResolvedValueOnce(
    envelope([
      {
        ...NEWER_SESSION,
        messages: [
          {
            id: 'm-rec',
            role: 'bot' as const,
            message: 'Yeh rahi Hanuman Chalisa.',
            confidence: 'high',
            recommendations: [
              { tag: 'art_0011', type: 'aarti' as const, title: 'Hanuman Chalisa' },
            ],
            createdAt: '2026-02-01T09:00:02.000Z',
          },
        ],
      },
    ]),
  );

  renderPage();
  expect(await screen.findByText('Hanuman Chalisa')).toBeTruthy();
  expect(screen.getByText('aarti')).toBeTruthy();
});

/**
 * The case the chip exists to expose: the app drew an EMPTY card here, because
 * the tag is unmapped or the row behind it was deactivated. Hiding it would
 * make that indistinguishable from a turn that recommended nothing.
 */
test('an unresolved tag is shown as not found, not hidden', async () => {
  GET.mockResolvedValueOnce(
    envelope([
      {
        ...NEWER_SESSION,
        messages: [
          {
            id: 'm-dead',
            role: 'bot' as const,
            message: 'Yeh rahi aarti.',
            confidence: null,
            recommendations: [
              { tag: 'art_9999', type: 'aarti' as const, title: null },
            ],
            createdAt: '2026-02-01T09:00:02.000Z',
          },
        ],
      },
    ]),
  );

  renderPage();
  expect(await screen.findByText('art_9999')).toBeTruthy();
  expect(screen.getByText('· not found')).toBeTruthy();
});

/** The transcript is a fixed-height scroll window, not a growing document. */
test('the transcript renders inside a scrollable log region', async () => {
  renderPage();
  await screen.findByText('Asha');
  expect(screen.getByRole('log', { name: 'Chat transcript' })).toBeTruthy();
});
