import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';

/**
 * Paywall configs (TAM-159) — LIST + per-id GET/PATCH.
 *
 * This replaced TAM-130's singleton (`/admin/paywall/config`), which could only
 * ever reach `DEFAULT_PAYWALL_ID` and wrote the flat `paywall_translations.video_*`
 * columns that the wire stopped reading.
 *
 * There is deliberately NO create/clone: a new paywall id does nothing until the
 * bucket map in `paywall.buckets.ts` routes traffic to it, and that is code. So
 * creation ships with the seed, and this UI lists and edits.
 *
 * Scope: `layout`, `minAppVersion`, the per-locale shell copy and the
 * ordered hero list. Plans, pricing and legal links stay ops-managed and are not
 * on this contract at all.
 *
 * BENEFIT ICONS are not here either, and are not coming back: they are bundled
 * app assets keyed by name — design system, not content — so the API dropped
 * them from both the view and the patch body.
 */

type ListPath = paths['/admin/paywall/configs'];
type ConfigPath = paths['/admin/paywall/configs/{paywallId}'];

export type PaywallListItem =
  ListPath['get']['responses'][200]['content']['application/json']['data'][number];

export type PaywallConfig =
  ConfigPath['get']['responses'][200]['content']['application/json']['data'];

export type PaywallTranslation = PaywallConfig['translations'][number];
export type PaywallHeroMedia = PaywallTranslation['heroMedia'][number];

export type PaywallConfigPatchBody =
  ConfigPath['patch']['requestBody']['content']['application/json'];

/**
 * The WRITE enum. Reads are `z.string()` server-side on purpose (a layout added
 * later must still serialize), so a stored value need not be one of these —
 * `isPaywallLayout` is the narrowing point before anything is sent.
 */
export type PaywallLayout = NonNullable<PaywallConfigPatchBody['layout']>;

export type PaywallLocalePatchRow = NonNullable<PaywallConfigPatchBody['translations']>[number];
export type PaywallHeroMediaPatchRow = NonNullable<PaywallLocalePatchRow['heroMedia']>[number];

/**
 * The pickable layouts, with their editor labels.
 *
 * A `Record<PaywallLayout, string>` on purpose: a layout added to the server's
 * `paywallLayout` enum breaks `pnpm nx typecheck admin` until it gets a label
 * here, rather than silently being unpickable in the CMS. Same trick as
 * `lib/languages.ts`'s `LANGUAGE_LABELS`.
 */
export const PAYWALL_LAYOUT_LABELS: Record<PaywallLayout, string> = {
  card_hero: 'Card hero — image hero, benefits in the plan card (P-1)',
  video_bleed: 'Video bleed — full-bleed video, no benefits list (P-2)',
  icon_grid: 'Icon grid — image hero, illustrated benefit tiles (P-3)',
  carousel: 'Carousel — several hero images (P-4)',
};

export const PAYWALL_LAYOUTS = Object.keys(PAYWALL_LAYOUT_LABELS) as PaywallLayout[];

export function isPaywallLayout(value: string): value is PaywallLayout {
  return Object.prototype.hasOwnProperty.call(PAYWALL_LAYOUT_LABELS, value);
}

const ENTITY = 'paywall-configs';

/** Every paywall, for the picker. Unpaginated — there are four, seeded. */
export function usePaywallConfigs() {
  return useQuery({
    queryKey: adminKeys.list(ENTITY),
    queryFn: () => unwrap(api.GET('/admin/paywall/configs'), 'Failed to load paywalls'),
  });
}

/** The full editable picture for one paywall. */
export function usePaywallConfig(paywallId: string) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, paywallId),
    queryFn: () =>
      unwrap(
        api.GET('/admin/paywall/configs/{paywallId}', {
          params: { path: { paywallId } },
        }),
        'Failed to load paywall config',
      ),
  });
}

/**
 * Save the changed fields of one paywall. The body carries only what the editor
 * touched — the server diffs again on its side, so an accidental full-state
 * payload is a no-op rather than an error, but sending less keeps an untouched
 * seed URL (which our media ownership gate would reject) out of the request.
 *
 * Carries `expectedUpdatedAt` (the parent config row's `updatedAt` — none of the
 * three child tables has its own); a 409 → conflict toast, handled by the caller.
 */
export function useUpdatePaywallConfig(paywallId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PaywallConfigPatchBody) =>
      unwrap(
        api.PATCH('/admin/paywall/configs/{paywallId}', {
          params: { path: { paywallId } },
          body,
        }),
        'Failed to save the paywall',
      ),
    // The entity prefix — refreshes both the picker list and this detail row.
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * The paywall's OWN benefit tiles for one locale — the choice list the ad group
 * override editor offers (`utm-overrides-page.tsx`).
 *
 * Read from the app-facing `GET /paywall/config`, not from the admin contract,
 * because the admin view above deliberately carries no benefits (they are not
 * editable there — icons are bundled app assets). This endpoint is the only one
 * that emits a benefit's id, its bundled icon KEY and its name in that locale,
 * which is exactly the three columns an override row needs.
 *
 * ⚠️ It resolves the paywall by the CALLER's own bucket, so an admin whose
 * number falls in a variant sees that variant's benefits. Harmless today — every
 * seeded variant carries the same eight — and it is the only reachable source;
 * if that stops being true this needs a real admin endpoint, not a hardcoded
 * list here.
 *
 * Failure is not fatal: the editor falls back to typing the id and icon key by
 * hand, which is why this is a plain query with no error UI of its own.
 */
export type PaywallBenefitChoice =
  paths['/paywall/config']['get']['responses'][200]['content']['application/json']['data']['benefits'][number];

export function usePaywallBenefitChoices(locale: string) {
  return useQuery({
    queryKey: adminKeys.detail('paywall-benefits', locale),
    queryFn: () =>
      unwrap(
        api.GET('/paywall/config', { params: { query: { locale } } }),
        'Failed to load the paywall’s benefits',
      ),
    select: (config): PaywallBenefitChoice[] =>
      [...config.benefits].sort((a, b) => a.sortOrder - b.sortOrder),
    staleTime: 5 * 60 * 1000,
  });
}
