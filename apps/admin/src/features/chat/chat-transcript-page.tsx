import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquareIcon, SearchIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api-error';

import {
  useChatTranscript,
  type ChatTranscriptSession,
  type ChatTranscriptUser,
} from './use-chat-transcript';

/** Sessions per page. Matches the API's default; its max is 25. */
const PAGE_SIZE = 10;

/**
 * Chat history viewer — paste a user id, read what they and the agent said.
 *
 * A READ-ONLY page, and deliberately not a `<DataTable>`: the unit here is a
 * conversation, not a row, and the whole point is to see it laid out the way
 * the user saw it. So it renders a transcript — user right, agent left, each
 * turn stamped — with one header per session carrying the agent id and the A/B
 * arm it came from.
 *
 * ORDER. Sessions run OLDEST AT THE TOP, newest at the bottom, like a chat
 * app: reading down the page is reading forward in time. The API pages them
 * newest-first (so page 1 is the recent conversations, not whatever this user
 * said a year ago) and this page reverses that for display — page 1 is
 * therefore the BOTTOM of the history, and "Older" walks backwards.
 *
 * The user id lives in the QUERY STRING (`?userId=…`), not in component state:
 * that makes a transcript a linkable thing — pasteable into a ticket, and
 * reachable straight from the ID column of the Users list.
 */
export function ChatTranscriptPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = searchParams.get('userId') ?? '';
  const page = readPage(searchParams.get('page'));

  // The input is local state; only SUBMIT writes the URL. Typing straight into
  // the query string would fire a request per keystroke, and 35 of the 36
  // characters of a uuid are a 400.
  const [draft, setDraft] = useState(userId);

  const { data, isLoading, isFetching, isError, error } = useChatTranscript(userId, {
    page,
    pageSize: PAGE_SIZE,
  });

  // Land on the NEWEST turn, the way a chat app opens. The transcript runs
  // oldest-first, so the bottom is what an editor came to read; without this
  // they start at a conversation from months ago and scroll.
  //
  // Keyed on the rendered payload rather than on mount: changing user or page
  // swaps the whole transcript, and leaving the old scroll offset would land
  // them mid-conversation at an arbitrary point.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = draft.trim();
    // `replace` on the first search, `push` after: the empty page is not a
    // place anyone wants Back to return them to.
    setSearchParams(next ? { userId: next } : {}, { replace: userId === '' });
  }

  function goToPage(next: number) {
    setSearchParams({ userId, page: String(next) });
  }

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Chat history</h1>
        <p className="text-sm text-muted-foreground">
          Every conversation a user has had with the assistant, oldest first.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-72 flex-1 gap-1.5">
          <Label htmlFor="chat-transcript-user-id">User ID</Label>
          <Input
            id="chat-transcript-user-id"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Paste a user UUID"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        </div>
        <Button type="submit" disabled={draft.trim().length === 0}>
          <SearchIcon aria-hidden="true" />
          Load history
        </Button>
      </form>

      {userId === '' ? (
        <EmptyState
          title="No user selected"
          body="Paste a user ID above. You can copy one from the ID column on the Users page."
        />
      ) : isLoading ? (
        <TranscriptSkeleton />
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load this chat history</AlertTitle>
          <AlertDescription>
            {errorMessage(error, 'Please check the user ID and try again.')}
          </AlertDescription>
        </Alert>
      ) : !data ? null : (
        <div className="grid gap-4">
          <UserHeader user={data.user} total={data.total} isFetching={isFetching} />

          {data.items.length === 0 ? (
            <EmptyState
              title="No conversations"
              body="This user has never opened a chat with the assistant."
            />
          ) : (
            <>
              {/* Page 1 is the NEWEST sessions, so "Older" sits above the
                  transcript — the direction you scroll to reach them. */}
              <Pager
                page={page}
                pageCount={pageCount}
                total={data.total}
                onChange={goToPage}
              />
              {/* A FIXED-HEIGHT scroll window, not a page that grows with the
                  transcript: 87 sessions is thousands of bubbles, and letting
                  the document scroll would push the user-id box and the pager
                  off-screen — the two controls you need most while reading.
                  The height is viewport-relative but does NOT depend on the
                  content, so the box does not resize as pages load. */}
              <div
                ref={scrollRef}
                tabIndex={0}
                role="log"
                aria-label="Chat transcript"
                className="h-[68vh] min-h-80 overflow-y-auto overscroll-contain rounded-md border bg-background p-4 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <div className="grid gap-8">
                  {/* API order is newest-first; reversed here so the page reads
                      forward in time, newest conversation at the bottom. */}
                  {[...data.items].reverse().map((session) => (
                    <SessionBlock key={session.id} session={session} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Who we are looking at — so a wall of bubbles is attributable to a person. */
function UserHeader({
  user,
  total,
  isFetching,
}: {
  user: ChatTranscriptUser;
  total: number;
  isFetching: boolean;
}) {
  const phone = user.phoneNumber
    ? `${user.phoneCountryCode ?? ''} ${user.phoneNumber}`.trim()
    : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-card px-4 py-3">
      <span className="font-medium">{user.name ?? 'Unnamed user'}</span>
      {phone ? <span className="text-sm text-muted-foreground">{phone}</span> : null}
      <code className="text-xs text-muted-foreground">{user.id}</code>
      <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
        {total} {total === 1 ? 'session' : 'sessions'}
        {isFetching ? ' · refreshing…' : ''}
      </span>
    </div>
  );
}

/** One conversation: a dated header, then its turns. */
function SessionBlock({ session }: { session: ChatTranscriptSession }) {
  return (
    <section aria-label={`Session started ${formatDate(session.createdAt)}`}>
      <SessionSeparator session={session} />

      <div className="grid gap-3 pt-4">
        {session.truncated ? (
          <p className="text-center text-xs text-muted-foreground">
            Showing the last {session.messages.length} of {session.messageCount} messages.
          </p>
        ) : null}

        {session.messages.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground">
            This session has no messages — the user opened it without sending anything.
          </p>
        ) : (
          session.messages.map((message) => (
            <Bubble key={message.id} message={message} />
          ))
        )}
      </div>
    </section>
  );
}

/**
 * The date separator between sessions, carrying the session's identity: when it
 * started, which agent answered, and which A/B arm that agent serves.
 *
 * The arm is the reason this page exists at all next to a raw DB query — an
 * agent id is a provider hex string nobody recognises, and "which arm did this
 * conversation come from" is unanswerable without it.
 */
function SessionSeparator({ session }: { session: ChatTranscriptSession }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b pb-3">
      <span className="text-sm font-medium">{formatDate(session.createdAt)}</span>
      <span className="text-xs text-muted-foreground">
        {formatTime(session.createdAt)}
      </span>

      {/* `variant: null` means the stored agent maps to no LIVE arm — a retired
          one. Shown as unknown rather than as control: they are different
          facts, and collapsing them would misreport the experiment. */}
      {session.variant ? (
        <Badge variant="secondary">{session.variant}</Badge>
      ) : (
        <Badge variant="outline">unknown arm</Badge>
      )}

      {session.personaSlug ? (
        <Badge variant="muted">as {session.personaSlug}</Badge>
      ) : null}

      <code className="text-xs text-muted-foreground" title="Agent ID">
        {session.agentId}
      </code>

      <span className="ml-auto text-xs text-muted-foreground">
        {session.messageCount} {session.messageCount === 1 ? 'message' : 'messages'}
      </span>
    </div>
  );
}

/**
 * One turn. The user is on the right, the agent on the left — the arrangement
 * of the app's own chat screen, so an editor comparing the two is not also
 * translating between two layouts.
 *
 * `whitespace-pre-wrap` because agent replies carry real newlines, and
 * `break-words` because a reply can contain an unbroken URL that would
 * otherwise stretch the bubble past the viewport.
 */
function Bubble({
  message,
}: {
  message: ChatTranscriptSession['messages'][number];
}) {
  const isUser = message.role === 'user';

  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div className="max-w-[min(42rem,80%)]">
        <div
          className={
            isUser
              ? 'rounded-lg rounded-br-sm bg-primary px-3 py-2 text-sm whitespace-pre-wrap break-words text-primary-foreground'
              : 'rounded-lg rounded-bl-sm border bg-card px-3 py-2 text-sm whitespace-pre-wrap break-words'
          }
        >
          {message.message}
          {/* What the app drew as content cards under this reply. Without it a
              recommending turn reads as an unfinished sentence: "Yeh rahi
              Hanuman Chalisa" followed by nothing. */}
          {message.recommendations.length > 0 ? (
            <ul
              className={`mt-2 flex flex-wrap gap-1.5 border-t pt-2 ${
                isUser ? 'border-primary-foreground/25' : ''
              }`}
            >
              {message.recommendations.map((item) => (
                <li key={item.tag}>
                  <Recommendation item={item} onDark={isUser} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div
          className={`mt-1 flex gap-2 text-[11px] text-muted-foreground ${
            isUser ? 'justify-end' : 'justify-start'
          }`}
        >
          <span>{isUser ? 'User' : 'Agent'}</span>
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          {/* Only the content agent reports one; the two prose agents never do. */}
          {message.confidence ? <span>· {message.confidence}</span> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * One recommended item as a chip: `Aarti · Om Jai Jagdish Hare`.
 *
 * An UNRESOLVED tag renders as the bare tag marked "not found", rather than
 * being hidden. That is the case worth seeing — it means the app drew an empty
 * card here, because the tag is missing from the id map or the row behind it
 * was deactivated in the CMS.
 */
function Recommendation({
  item,
  onDark,
}: {
  item: ChatTranscriptSession['messages'][number]['recommendations'][number];
  onDark: boolean;
}) {
  const base = 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]';

  if (item.title === null) {
    return (
      <span
        className={`${base} border border-dashed ${
          onDark ? 'border-primary-foreground/40' : 'border-muted-foreground/40'
        }`}
        title={
          item.type === null
            ? 'This tag is not in the content id map'
            : 'Mapped, but no active row — deactivated or deleted in the CMS'
        }
      >
        <code>{item.tag}</code>
        <span className="opacity-70">· not found</span>
      </span>
    );
  }

  return (
    <span
      className={`${base} ${onDark ? 'bg-primary-foreground/15' : 'bg-muted'}`}
      title={item.tag}
    >
      <span className="font-medium capitalize opacity-70">{item.type}</span>
      <span aria-hidden="true" className="opacity-40">
        ·
      </span>
      <span>{item.title}</span>
    </span>
  );
}

/**
 * Session pagination. "Older" is page+1 because the API orders newest-first —
 * the labels describe TIME, which is what the reader is navigating, rather than
 * the page number, which is an implementation detail of the request.
 */
function Pager({
  page,
  pageCount,
  total,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
      >
        Older sessions
      </Button>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        Page {page} of {pageCount} · {total} sessions
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Newer sessions
      </Button>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-md border border-dashed px-6 py-12 text-center">
      <MessageSquareIcon
        aria-hidden="true"
        className="size-6 text-muted-foreground"
      />
      <p className="font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function TranscriptSkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="ml-auto h-12 w-1/2" />
      <Skeleton className="h-16 w-2/3" />
      <Skeleton className="ml-auto h-12 w-1/3" />
    </div>
  );
}

/** `?page=` is user-editable text; anything that is not a positive int is 1. */
function readPage(raw: string | null): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

/** ISO-8601 → the viewer's locale. `Intl` is native; no date library here. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'full' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { timeStyle: 'short' });
}
