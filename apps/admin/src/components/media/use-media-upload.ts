import * as React from 'react';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { ApiError, errorMessage } from '@/lib/api-error';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  useMediaUpload — presign (via our API) → BARE XHR PUT to S3 (no token) → url
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The one hook in `apps/admin` that talks to a non-API origin. Two very
 * different requests, deliberately kept apart:
 *
 *  1. **presign** — `POST /admin/media/presign` THROUGH `lib/api.ts`. It needs
 *     our Bearer token and is admin-guarded server-side (TAM-82/84).
 *  2. **PUT** — a **bare `XMLHttpRequest`** to the presigned `uploadUrl`. It
 *     carries NO Authorization header (§#EXPORT_CRITICAL): sending our admin JWT
 *     to an S3/CloudFront origin would leak an admin credential to a third party,
 *     and an S3 403 would trip `api.ts`'s 401 handler into a spurious logout.
 *     XHR (not `fetch`) because `fetch` cannot report UPLOAD progress (ADR D4).
 *
 * The `Content-Type` sent to presign and the `Content-Type` on the PUT are the
 * SAME value (`file.type`) — it is a SIGNED header, so a mismatch is an S3 403.
 *
 * Retry shape (AC c): a network failure retries the SAME presign until its
 * `expiresAt`; past that it re-presigns and restarts (a 200 MB video on a slow
 * link can genuinely outlive the 5-minute TTL). An S3 HTTP error (e.g. a
 * signed-header 403) is surfaced, not retried blindly.
 *
 * Optimising (TAM-267): when presign answers `processing: true`, the PUT went to
 * a staging key and the media optimizer writes the FINAL object a little later.
 * The hook then sits in `'processing'` and polls `GET /admin/media/status`
 * (THROUGH `lib/api.ts`, Bearer and all — it is our API, not S3) every
 * `STATUS_POLL_INTERVAL_MS` until `ready`, and only THEN resolves `publicUrl`.
 * The server rejects a save of a not-yet-written URL anyway (`validateOwnedUrl`
 * HEADs it); holding the value back means the form never offers that save.
 * Polling stops on unmount, on `reset()`, and after `STATUS_POLL_TIMEOUT_MS`.
 */

export type MediaUploadStatus = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

export interface MediaUploadState {
  status: MediaUploadStatus;
  /** 0–100, integer. Only meaningful while `status === 'uploading'`. */
  progress: number;
  /** Field-level, user-facing copy. Only set while `status === 'error'`. */
  error?: string;
}

/** How often the optimiser's status is polled after a `processing` upload. */
export const STATUS_POLL_INTERVAL_MS = 2_000;

/**
 * When the hook stops waiting for the optimiser. The Lambda's own ceiling is 15
 * minutes, but a clip that has not finished in 10 is an outlier worth telling
 * the editor about rather than a spinner they sit in front of.
 */
export const STATUS_POLL_TIMEOUT_MS = 10 * 60 * 1_000;

/** User-facing copy when the optimiser has not produced the file in time. */
export const OPTIMISE_TIMEOUT_MESSAGE =
  'Optimising is taking longer than expected. Please try the upload again in a minute.';

/** The optimiser did not write the final object within `STATUS_POLL_TIMEOUT_MS`. */
class OptimiseTimeoutError extends Error {
  constructor() {
    super(OPTIMISE_TIMEOUT_MESSAGE);
    this.name = 'OptimiseTimeoutError';
  }
}

/** Polling was stopped by unmount / `reset()` — not a failure to show anyone. */
class UploadCancelledError extends Error {
  constructor() {
    super('Upload cancelled.');
    this.name = 'UploadCancelledError';
  }
}

/** Resolves after `ms`, or rejects with `UploadCancelledError` as soon as `signal` aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new UploadCancelledError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new UploadCancelledError());
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Poll `GET /admin/media/status` until the FINAL object exists. A transient
 * failure (network, 5xx) is tolerated — the next tick asks again — but a 4xx is
 * a real answer (bad key, lost admin rights) and is surfaced. 401 never gets
 * here in practice: `api.ts` redirects to /login.
 */
async function waitUntilReady(key: string, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + STATUS_POLL_TIMEOUT_MS;
  for (;;) {
    await sleep(STATUS_POLL_INTERVAL_MS, signal);
    try {
      const { ready } = await unwrap(
        api.GET('/admin/media/status', { params: { query: { key } }, signal }),
        'Could not check the optimised file.',
      );
      if (ready) return;
    } catch (error) {
      if (signal.aborted) throw new UploadCancelledError();
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error;
      // transient — keep polling until the deadline
    }
    if (Date.now() >= deadline) throw new OptimiseTimeoutError();
  }
}

/** Cap on re-presign cycles so a persistently-failing upload cannot loop forever. */
const MAX_PRESIGN_ATTEMPTS = 3;

/** A raw S3 HTTP error status carried out of the PUT so callers can special-case 403. */
class S3PutError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`S3 rejected the upload (HTTP ${status}).`);
    this.name = 'S3PutError';
    this.status = status;
  }
}

/** A network-level PUT failure (no HTTP status): offline, CORS, aborted, timeout. */
class S3NetworkError extends Error {
  constructor(message = 'Network error during upload.') {
    super(message);
    this.name = 'S3NetworkError';
  }
}

/**
 * The bare, progress-reporting PUT. Resolves on 2xx; rejects with `S3PutError`
 * for an HTTP error status or `S3NetworkError` for a transport failure.
 *
 * Headers come from the presign response and are sent VERBATIM — never rebuilt
 * here. They are all signed, so any divergence from what the api signed is an
 * S3 403 `SignatureDoesNotMatch`. This code used to set Content-Type alone while
 * presign also signed Cache-Control, which 403'd every upload against real S3
 * (floci does not enforce signatures, so local dev never noticed).
 *
 * Still no Authorization, ever.
 */
function putToS3(
  uploadUrl: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
): { promise: Promise<void>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<void>((resolve, reject) => {
    xhr.open('PUT', uploadUrl, true);
    // Exactly what the api signed — no more, no less, no Authorization.
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new S3PutError(xhr.status));
    };
    xhr.onerror = () => reject(new S3NetworkError());
    xhr.ontimeout = () => reject(new S3NetworkError('Upload timed out.'));
    xhr.onabort = () => reject(new S3NetworkError('Upload cancelled.'));

    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}

function isExpired(expiresAt: string): boolean {
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) && Date.now() >= at;
}

/** Maps any thrown error to user-facing field copy (AC c). */
function messageForError(error: unknown): string {
  // presign 4xx — the server's per-(module,field) allowlist message (e.g.
  // "MP3 only, max 50 MB"). Prefer it verbatim.
  if (error instanceof ApiError) return error.message;
  if (error instanceof OptimiseTimeoutError) return error.message;
  if (error instanceof S3PutError) {
    return error.status === 403
      ? 'Upload was rejected (403). The file type may not match what was approved — try re-picking the file.'
      : 'The upload was rejected by storage. Please try again.';
  }
  return errorMessage(error, 'The upload failed. Please try again.');
}


export interface MediaUploadArgs {
  module: string;
  entity: string;
  field: string;
  file: File;
  contentType: string;
}

type PresignData =
  paths['/admin/media/presign']['post']['responses'][201]['content']['application/json']['data'];

/**
 * presign → PUT, with the retry shape described at the top of the file.
 * Resolves with the presign whose PUT succeeded. `setAbort` publishes the
 * in-flight XHR's abort so unmount / `reset()` can cancel it.
 */
async function presignAndPut(
  args: MediaUploadArgs,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
  setAbort: (abort: (() => void) | null) => void,
): Promise<PresignData> {
  for (let attempt = 1; attempt <= MAX_PRESIGN_ATTEMPTS; attempt += 1) {
    if (signal.aborted) throw new UploadCancelledError();
    // (2) presign — THROUGH `api`, with our Bearer token.
    const presign = await unwrap(
      api.POST('/admin/media/presign', {
        body: {
          module: args.module,
          entity: args.entity,
          field: args.field,
          filename: args.file.name,
          contentType: args.contentType,
          sizeBytes: args.file.size,
        },
      }),
      'Could not prepare the upload.',
    );

    // (3+4) bare XHR PUT with progress. NB: uploadUrl is a 5-minute write
    // capability — never logged or surfaced (§#EXPORT_CRITICAL).
    const { promise, abort } = putToS3(presign.uploadUrl, args.file, presign.headers, onProgress);
    setAbort(abort);

    try {
      await promise;
      setAbort(null);
      return presign;
    } catch (putError) {
      setAbort(null);
      if (signal.aborted) throw new UploadCancelledError();

      // A signed-header 403 (or any S3 HTTP error): retrying the same bytes
      // will not help — surface a message that names the likely cause.
      if (putError instanceof S3PutError) {
        throw putError;
      }

      // A network failure. Retry the SAME presign while it is still valid;
      // otherwise fall through to re-presign (unless we are out of attempts).
      if (putError instanceof S3NetworkError) {
        if (!isExpired(presign.expiresAt) && attempt < MAX_PRESIGN_ATTEMPTS) {
          const retry = putToS3(presign.uploadUrl, args.file, presign.headers, onProgress);
          setAbort(retry.abort);
          try {
            await retry.promise;
            setAbort(null);
            return presign;
          } catch {
            setAbort(null);
            if (signal.aborted) throw new UploadCancelledError();
            // fall through to re-presign on the next loop iteration
          }
        }
        if (attempt < MAX_PRESIGN_ATTEMPTS) continue; // re-presign & restart
      }

      throw putError;
    }
  }

  throw new S3NetworkError('Upload failed after several attempts.');
}

export interface UseMediaUpload {
  state: MediaUploadState;
  /**
   * Runs the full presign → PUT (→ optimise poll) flow for a pre-validated file.
   * Resolves with the `publicUrl` once the object is really there (the caller
   * then reports it to `<EntityForm>`), or rejects — in the reject case a
   * user-facing message is also set on `state.error` (except when the upload was
   * cancelled by unmount / `reset()`, which is silent). The picked file is never
   * lost, so the caller can retry.
   */
  upload: (args: MediaUploadArgs) => Promise<string>;
  /** Return to `idle` (e.g. after the editor picks a different file). */
  reset: () => void;
}

export function useMediaUpload(): UseMediaUpload {
  const [state, setState] = React.useState<MediaUploadState>({
    status: 'idle',
    progress: 0,
  });
  const abortRef = React.useRef<(() => void) | null>(null);
  // One controller per upload run: aborting it stops the optimise poll (and any
  // re-presign after an aborted PUT). Replaced on every `upload()`.
  const runRef = React.useRef<AbortController | null>(null);

  const cancelRun = React.useCallback(() => {
    runRef.current?.abort();
    runRef.current = null;
    abortRef.current?.();
    abortRef.current = null;
  }, []);

  React.useEffect(() => {
    // Abort an in-flight PUT, and stop polling, if the field unmounts mid-upload.
    return cancelRun;
  }, [cancelRun]);

  const reset = React.useCallback(() => {
    cancelRun();
    setState({ status: 'idle', progress: 0 });
  }, [cancelRun]);

  const upload = React.useCallback<UseMediaUpload['upload']>(
    async (args) => {
      cancelRun();
      const run = new AbortController();
      runRef.current = run;
      setState({ status: 'uploading', progress: 0 });

      try {
        const presign = await presignAndPut(
          args,
          run.signal,
          (percent) => setState({ status: 'uploading', progress: percent }),
          (abort) => {
            abortRef.current = abort;
          },
        );

        // TAM-267: the bytes went to a staging key — wait for the optimiser to
        // write the FINAL object before handing its URL to the form.
        if (presign.processing) {
          setState({ status: 'processing', progress: 100 });
          await waitUntilReady(presign.key, run.signal);
        }

        setState({ status: 'success', progress: 100 });
        return presign.publicUrl;
      } catch (error) {
        // Cancelled by unmount / reset(): nothing to tell the editor (reset has
        // already put the field back to idle). Still reject so no URL is reported.
        if (!(error instanceof UploadCancelledError) && !run.signal.aborted) {
          setState({ status: 'error', progress: 0, error: messageForError(error) });
        }
        throw error;
      } finally {
        if (runRef.current === run) runRef.current = null;
      }
    },
    [cancelRun],
  );

  return { state, upload, reset };
}
