import { useQuery } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '../../lib/api';
import { unwrap } from '../../lib/api-result';
import { adminKeys } from '../../lib/query-keys';

// ── Types, DERIVED from the generated client (never hand-written) ────────────

type TranscriptPath = paths['/admin/chat/transcript'];

/** `{ user, items, total, page, pageSize }` — `items` is NEWEST SESSION FIRST. */
export type ChatTranscript =
  TranscriptPath['get']['responses'][200]['content']['application/json']['data'];

/** One conversation: the session header plus its turns, oldest turn first. */
export type ChatTranscriptSession = ChatTranscript['items'][number];

/** One turn. `role` is `'user'` or `'bot'`. */
export type ChatTranscriptMessage = ChatTranscriptSession['messages'][number];

/** Who the transcript belongs to. */
export type ChatTranscriptUser = ChatTranscript['user'];

export interface ChatTranscriptParams {
  page: number;
  pageSize: number;
}

/**
 * One user's chat sessions with the agent.
 *
 * `userId` is the whole query — no id, no request. The hook is `enabled` only
 * for a non-empty id so the page can mount with an empty input and show its own
 * prompt, rather than firing a request the API would 400 and rendering that
 * 400 as if it were a failure.
 *
 * Pagination is over SESSIONS and server-side (ADR C2), the same offset
 * convention as every admin list. It is NOT over messages: a session is the
 * unit an editor navigates by, and each one arrives with its turns already
 * attached (bounded server-side — a session can report `truncated`).
 *
 * `placeholderData: keepPreviousData` is deliberately NOT used: pages here are
 * whole conversations, and silently showing the previous page's transcript
 * under a new page number would be a transcript attributed to the wrong session.
 */
export function useChatTranscript(userId: string, params: ChatTranscriptParams) {
  const id = userId.trim();
  return useQuery<ChatTranscript>({
    queryKey: adminKeys.list('chat-transcript', { userId: id, ...params }),
    enabled: id.length > 0,
    queryFn: () =>
      unwrap(
        api.GET('/admin/chat/transcript', {
          params: { query: { userId: id, page: params.page, pageSize: params.pageSize } },
        }),
        'Failed to load this chat history',
      ),
  });
}
