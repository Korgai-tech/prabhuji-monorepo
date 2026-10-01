import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { toApiError } from '@/lib/api-error';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';

/**
 * Per-ad-group paywall overrides — the CMS surface that replaced the hardcoded
 * campaign map. Full CRUD, unlike its sibling `use-paywall-config.ts` (where a
 * new paywall id is meaningless until code routes traffic to it): an ad group
 * name is minted in the ad platform, so rows here are genuinely created and
 * deleted by marketing.
 *
 * `overrides` is a DOCUMENT, not a set of columns: the PATCH body either omits
 * it (untouched) or carries the whole thing, so it is assembled in exactly one
 * place — `buildDocument()` in `utm-override-schema.ts`. It targets the DEFAULT
 * paywall only, and only the fields that paywall owns per locale: one hero media
 * row and four copy lines. `locales` is required, even when it is empty.
 *
 * There is NO `expectedUpdatedAt` on this contract (unlike ADR C3's optimistic
 * concurrency elsewhere) — the API does not take one. Last write wins; the rows
 * are few, hand-authored and rarely edited concurrently.
 */

type ListPath = paths['/admin/paywall/utm-overrides'];
type ItemPath = paths['/admin/paywall/utm-overrides/{id}'];

export type UtmOverride =
  ListPath['get']['responses'][200]['content']['application/json']['data'][number];

export type UtmOverrideCreateBody =
  ListPath['post']['requestBody']['content']['application/json'];

export type UtmOverridePatchBody =
  ItemPath['patch']['requestBody']['content']['application/json'];

/** The write-side override document (`thumbnailUrl` optional; reads always emit it). */
export type UtmOverrideDocument = UtmOverrideCreateBody['overrides'];

/** One locale's patch over the default paywall — a single `media` plus copy. */
export type UtmOverrideLocaleRow = UtmOverrideDocument['locales'][string];

const ENTITY = 'paywall-utm-overrides';

/** Every ad-group override. Unpaginated — the API returns the lot, ordered by name. */
export function useUtmOverrides() {
  return useQuery({
    queryKey: adminKeys.list(ENTITY),
    queryFn: () =>
      unwrap(api.GET('/admin/paywall/utm-overrides'), 'Failed to load ad group overrides'),
  });
}

/**
 * One override. The list already carries the full document, but the editor
 * reads through this so an edit always starts from a fresh row rather than a
 * cached list page — the same shape as `usePaywallConfig`.
 */
export function useUtmOverride(id: string) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id),
    queryFn: () =>
      unwrap(
        api.GET('/admin/paywall/utm-overrides/{id}', { params: { path: { id } } }),
        'Failed to load this ad group override',
      ),
  });
}

/** 409 `ALREADY_EXISTS` when that ad group already has a row — surfaced by the caller. */
export function useCreateUtmOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UtmOverrideCreateBody) =>
      unwrap(
        api.POST('/admin/paywall/utm-overrides', { body }),
        'Failed to create the ad group override',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/** Only the changed keys ride along; an omitted key is left untouched server-side. */
export function useUpdateUtmOverride(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UtmOverridePatchBody) =>
      unwrap(
        api.PATCH('/admin/paywall/utm-overrides/{id}', { params: { path: { id } }, body }),
        'Failed to save the ad group override',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * A real, permanent delete — the ad group falls back to the phone-number A/B
 * buckets.
 *
 * Not `unwrap()`: this response's `data` is `null`, which the generated envelope
 * types as the literal `null` and `unwrap`'s `SuccessEnvelope<T>` will not
 * accept. Same inline shape the other null-data deletes in this SPA use
 * (`use-horoscope-results.ts`), and it still throws an `ApiError`.
 */
export function useDeleteUtmOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error, response } = await api.DELETE(
        '/admin/paywall/utm-overrides/{id}',
        { params: { path: { id } } },
      );
      if (error || !data?.success) {
        throw toApiError(error ?? data, response, 'Failed to delete the ad group override');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
