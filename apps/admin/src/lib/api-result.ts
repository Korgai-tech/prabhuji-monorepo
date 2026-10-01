import { toApiError } from './api-error';

/** The `{success, message, data}` envelope every `apps/api` route returns. */
interface SuccessEnvelope<TData> {
  success: boolean;
  message: string;
  data: TData;
}

/** The structural shape of an `openapi-fetch` result. */
interface FetchResult<TData> {
  data?: SuccessEnvelope<TData> | undefined;
  error?: unknown;
  response: Response;
}

/**
 * Unwraps a typed `api.GET`/`api.POST`/… call into its payload, or throws an
 * `ApiError` carrying the status + `errorCode`.
 *
 * This is `use-users.ts`'s original shape —
 * `const { data, error } = await api.GET(...); if (error || !data?.success) throw …; return data.data;`
 * — with the status and `errorCode` preserved instead of discarded, which is
 * what lets `<EntityForm>` recognise a 409 `STALE_WRITE` (ADR C3) and what lets
 * every mutation surface the server's real message.
 *
 * Usage in a feature hook:
 * ```ts
 * queryFn: () => unwrap(api.GET('/admin/deities'), 'Failed to load deities')
 * ```
 */
export async function unwrap<TData>(
  call: Promise<FetchResult<TData>>,
  fallbackMessage: string,
): Promise<TData> {
  const { data, error, response } = await call;
  if (error || !data?.success) {
    throw toApiError(error ?? data, response, fallbackMessage);
  }
  return data.data;
}
