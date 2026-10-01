import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { POST: post, GET: get } }));

import {
  OPTIMISE_TIMEOUT_MESSAGE,
  STATUS_POLL_INTERVAL_MS,
  STATUS_POLL_TIMEOUT_MS,
  useMediaUpload,
} from './use-media-upload';
import { MediaUploadField } from './media-upload-field';

/**
 * TAM-267 — the optimise leg of `useMediaUpload`: after a `processing: true`
 * presign the hook polls `GET /admin/media/status` (through `lib/api`) until
 * the final object exists, and only then hands back `publicUrl`.
 */

const KEY = 'status/status-item/11111111-1111-4111-8111-111111111111.mp4';
const PUBLIC_URL = `https://cdn.example.test/${KEY}`;

/** A PUT that always succeeds on the next microtask — fake timers don't touch it. */
class FakeXhr {
  static sent: { url: string; headers: Record<string, string> }[] = [];
  status = 0;
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private url = '';
  private headers: Record<string, string> = {};
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send() {
    FakeXhr.sent.push({ url: this.url, headers: this.headers });
    void Promise.resolve().then(() => {
      this.status = 200;
      this.onload?.();
    });
  }
  abort() {
    this.onabort?.();
  }
}

function ok<T>(data: T) {
  return Promise.resolve({ data: { success: true, message: 'ok', data }, response: new Response() });
}

function presignReturns(processing: boolean) {
  post.mockImplementation(() =>
    ok({
      uploadUrl: `https://s3.example.test/${processing ? 'incoming/' : ''}${KEY}?sig=x`,
      publicUrl: PUBLIC_URL,
      key: KEY,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'public, max-age=31536000, immutable' },
      processing,
    }),
  );
}

/** `ready` answers, one per poll; the last one repeats. */
function statusSequence(...answers: boolean[]) {
  let i = 0;
  get.mockImplementation(() => {
    const ready = answers[Math.min(i, answers.length - 1)];
    i += 1;
    return ok({ ready });
  });
}

const file = new File(['x'.repeat(10)], 'clip.mp4', { type: 'video/mp4' });
const args = { module: 'status', entity: 'statusItem', field: 'videoUrl', file, contentType: 'video/mp4' };

/** Start an upload without letting its rejection go unhandled. */
function start(upload: ReturnType<typeof useMediaUpload>['upload']) {
  return upload(args).then(
    (url) => ({ ok: true as const, url }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  FakeXhr.sent = [];
  post.mockReset();
  get.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useMediaUpload — optimise polling (TAM-267)', () => {
  test('direct path (processing:false) is unchanged: success right after the PUT, never polls', async () => {
    presignReturns(false);
    const { result } = renderHook(() => useMediaUpload());

    let settled!: Awaited<ReturnType<typeof start>>;
    await act(async () => {
      settled = await start(result.current.upload);
    });

    expect(settled).toEqual({ ok: true, url: PUBLIC_URL });
    expect(result.current.state.status).toBe('success');
    expect(FakeXhr.sent).toHaveLength(1);
    await tick(STATUS_POLL_INTERVAL_MS * 5);
    expect(get).not.toHaveBeenCalled();
  });

  test('processing:true → "processing", polls every 2 s through the api, succeeds when ready', async () => {
    presignReturns(true);
    statusSequence(false, false, true);
    const { result } = renderHook(() => useMediaUpload());

    let pending!: ReturnType<typeof start>;
    await act(async () => {
      pending = start(result.current.upload);
      await Promise.resolve();
    });
    await tick(0);

    // PUT went to the staging URL; the hook now waits for the optimiser.
    expect(FakeXhr.sent[0]?.url).toContain('/incoming/');
    expect(result.current.state.status).toBe('processing');
    expect(get).not.toHaveBeenCalled();

    await tick(STATUS_POLL_INTERVAL_MS);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(
      '/admin/media/status',
      expect.objectContaining({ params: { query: { key: KEY } } }),
    );
    expect(result.current.state.status).toBe('processing');

    await tick(STATUS_POLL_INTERVAL_MS);
    expect(get).toHaveBeenCalledTimes(2);
    expect(result.current.state.status).toBe('processing');

    await tick(STATUS_POLL_INTERVAL_MS);
    expect(get).toHaveBeenCalledTimes(3);
    expect(result.current.state.status).toBe('success');
    await expect(pending).resolves.toEqual({ ok: true, url: PUBLIC_URL });
  });

  test('a transient status failure (5xx) is retried on the next tick, not surfaced', async () => {
    presignReturns(true);
    let calls = 0;
    get.mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve({
          error: { success: false, message: 'boom', data: null },
          response: new Response(null, { status: 503 }),
        });
      }
      return ok({ ready: true });
    });
    const { result } = renderHook(() => useMediaUpload());

    let pending!: ReturnType<typeof start>;
    await act(async () => {
      pending = start(result.current.upload);
      await Promise.resolve();
    });
    await tick(STATUS_POLL_INTERVAL_MS);
    expect(result.current.state.status).toBe('processing');
    await tick(STATUS_POLL_INTERVAL_MS);
    expect(result.current.state.status).toBe('success');
    await expect(pending).resolves.toEqual({ ok: true, url: PUBLIC_URL });
  });

  test('gives up after 10 minutes with a clear error and stops polling', async () => {
    presignReturns(true);
    statusSequence(false);
    const { result } = renderHook(() => useMediaUpload());

    let pending!: ReturnType<typeof start>;
    await act(async () => {
      pending = start(result.current.upload);
      await Promise.resolve();
    });
    await tick(STATUS_POLL_TIMEOUT_MS);

    const settled = await pending;
    expect(settled.ok).toBe(false);
    expect(result.current.state).toEqual({
      status: 'error',
      progress: 0,
      error: OPTIMISE_TIMEOUT_MESSAGE,
    });
    const polls = get.mock.calls.length;
    expect(polls).toBe(STATUS_POLL_TIMEOUT_MS / STATUS_POLL_INTERVAL_MS);
    await tick(STATUS_POLL_INTERVAL_MS * 10);
    expect(get.mock.calls.length).toBe(polls);
  });

  test('stops polling on unmount (and never reports a URL)', async () => {
    presignReturns(true);
    statusSequence(false);
    const { result, unmount } = renderHook(() => useMediaUpload());

    let pending!: ReturnType<typeof start>;
    await act(async () => {
      pending = start(result.current.upload);
      await Promise.resolve();
    });
    await tick(STATUS_POLL_INTERVAL_MS * 2);
    expect(get).toHaveBeenCalledTimes(2);

    unmount();
    await tick(STATUS_POLL_INTERVAL_MS * 10);
    expect(get).toHaveBeenCalledTimes(2);
    const settled = await pending;
    expect(settled.ok).toBe(false);
  });

  test('reset() while processing stops polling and returns to idle without an error', async () => {
    presignReturns(true);
    statusSequence(false);
    const { result } = renderHook(() => useMediaUpload());

    let pending!: ReturnType<typeof start>;
    await act(async () => {
      pending = start(result.current.upload);
      await Promise.resolve();
    });
    await tick(STATUS_POLL_INTERVAL_MS);
    act(() => result.current.reset());
    await tick(STATUS_POLL_INTERVAL_MS * 5);

    expect(get).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ status: 'idle', progress: 0 });
    expect((await pending).ok).toBe(false);
  });
});

describe('<MediaUploadField> while optimising', () => {
  test('shows "Optimising…", blocks re-picks, then reports the final URL', async () => {
    presignReturns(true);
    statusSequence(false, true);
    const onChange = vi.fn();
    render(
      <>
        <label htmlFor="f">Video</label>
        <MediaUploadField
          id="f"
          name="videoUrl"
          value=""
          onChange={onChange}
          disabled={false}
          invalid={false}
          describedBy={undefined}
          values={{}}
          module="status"
          entity="statusItem"
          field="videoUrl"
        />
      </>,
    );

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Video'), { target: { files: [file] } });
      await Promise.resolve();
    });
    await tick(0);

    expect(screen.getByRole('status').textContent).toContain('Optimising…');
    expect(screen.getByRole('button', { name: 'Choose file' })).toHaveProperty('disabled', true);
    expect(onChange).not.toHaveBeenCalled();

    await tick(STATUS_POLL_INTERVAL_MS);
    expect(onChange).not.toHaveBeenCalled();
    await tick(STATUS_POLL_INTERVAL_MS);

    expect(onChange).toHaveBeenCalledWith(PUBLIC_URL);
    expect(screen.queryByText(/Optimising/)).toBeNull();
  });
});
