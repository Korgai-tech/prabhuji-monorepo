import { useQuery } from '@tanstack/react-query';
import { adminKeys } from '../lib/query-keys';
import { fetchAdminSession, type AdminSession } from './admin-session';

/**
 * The `['admin','session']` whoami query behind `<AdminRoute>`.
 *
 * Cached, so the guard costs ONE request per session rather than one per
 * navigation (TAM-86 perf AC). `retry: false` because the meaningful failures
 * here — 401 and 403 — are not transient and must not be retried into a delay
 * before the "not authorized" screen appears.
 *
 * Invalidated implicitly on logout: `auth-context`'s `logout()` clears the whole
 * query cache, so a stale session cannot survive a re-login as another user.
 */
export function useAdminSession() {
  return useQuery<AdminSession>({
    queryKey: adminKeys.session(),
    queryFn: fetchAdminSession,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
