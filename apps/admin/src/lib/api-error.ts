/**
 * `ApiError` — the error every feature hook throws.
 *
 * WHY THIS EXISTS: the original `use-users.ts` shape threw
 * `new Error('Failed to load users')`, which discards the HTTP status and the
 * server's `errorCode`. `<EntityForm>` cannot surface a 409 `STALE_WRITE`
 * conflict (ADR C3) from an error that has thrown the status away, and no
 * mutation can show the server's real message. `ApiError` keeps all three.
 *
 * The API's error envelope is `{ success: false, message, data: null, errorCode? }`
 * (`apps/api/src/shared/response/response.ts`).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly errorCode?: string;

  constructor(message: string, status: number, errorCode?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorCode = errorCode;
  }

  /**
   * A stale-write conflict: the row changed under the editor since they loaded
   * it. `<EntityForm>` turns this into the "modified by someone else" toast.
   */
  get isConflict(): boolean {
    return this.status === 409;
  }

  get isStaleWrite(): boolean {
    return this.isConflict && this.errorCode === 'STALE_WRITE';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }
}

interface ErrorEnvelope {
  message?: unknown;
  errorCode?: unknown;
}

/** Reads `{ message, errorCode }` off an unknown error body without trusting it. */
function readErrorEnvelope(body: unknown): ErrorEnvelope {
  return typeof body === 'object' && body !== null ? body : {};
}

/**
 * Turns an `openapi-fetch` result into an `ApiError`.
 *
 * `error` is the parsed error body, `response` the raw `Response`. Prefer the
 * server's `message` — it is user-facing copy the API deliberately chose —
 * and fall back to `fallbackMessage` when the body carries nothing useful.
 */
export function toApiError(
  error: unknown,
  response: Response | undefined,
  fallbackMessage: string,
): ApiError {
  const envelope = readErrorEnvelope(error);
  const message =
    typeof envelope.message === 'string' && envelope.message.length > 0
      ? envelope.message
      : fallbackMessage;
  const errorCode =
    typeof envelope.errorCode === 'string' ? envelope.errorCode : undefined;
  return new ApiError(message, response?.status ?? 0, errorCode);
}

/** Normalizes anything thrown into a displayable message. */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  return fallback;
}
