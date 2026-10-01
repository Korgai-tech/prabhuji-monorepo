import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import type React from 'react';

import { PAYWALL_LAYOUT_LABELS } from './use-paywall-config';

/**
 * Paywalls page (TAM-159). Feature hooks import the client as `@/lib/api`, so
 * that specifier is mocked.
 *
 * The assertions that matter are on the PATCH body: only touched locales/fields
 * may be sent (echoing an untouched seeded URL would be rejected server-side as
 * "not one our presign flow minted"), a hero change must ship the whole
 * renumbered list (the server's replace-set), and `expectedUpdatedAt` must
 * always ride along (optimistic concurrency, ADR §C3).
 *
 * The fixture paywall is the CAROUSEL, because that is the only layout that
 * takes a multi-item hero — the other three are single-hero and the server 400s
 * on a longer list.
 */

const PAYWALL_ID = 'vip-membership-v1';
const UPDATED_AT = '2026-07-28T10:00:00.000Z';
const MIN_APP_VERSION = '1.1.0';
const SEEDED_IMAGE = 'https://picsum.photos/seed/x/720/1280';
const SEEDED_VIDEO = 'https://cdn.jsdelivr.net/gh/x/big_buck_bunny.mp4';

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { GET: get, POST: vi.fn(), PATCH: patch, DELETE: vi.fn() },
}));

const listData = [
  {
    paywallId: PAYWALL_ID,
    layout: 'carousel',
    minAppVersion: MIN_APP_VERSION,
    enabled: true,
    configVersion: 3,
    updatedAt: UPDATED_AT,
  },
  {
    paywallId: 'vip-card-v1',
    layout: 'card_hero',
    minAppVersion: '0.0.0',
    enabled: false,
    configVersion: 1,
    updatedAt: UPDATED_AT,
  },
];

function configData() {
  return {
    paywallId: PAYWALL_ID,
    layout: 'carousel',
    minAppVersion: MIN_APP_VERSION,
    configVersion: 3,
    enabled: true,
    defaultPlanId: 'month',
    shimmerEnabled: true,
    updatedAt: UPDATED_AT,
    translations: [
      {
        locale: 'en',
        title: 'Unlock VIP Membership',
        cancelAnytimeText: 'Cancel anytime',
        refundPolicyText: 'No refunds',
        payNowCta: 'Pay now',
        heroMedia: [
          {
            sortOrder: 0,
            mediaType: 'image',
            url: SEEDED_IMAGE,
            thumbnailUrl: null,
            mediaId: 'vip_hero_v1',
          },
          {
            sortOrder: 1,
            mediaType: 'video',
            url: SEEDED_VIDEO,
            thumbnailUrl: null,
            mediaId: 'vip_intro_v1',
          },
        ],
      },
      {
        locale: 'hi',
        title: 'VIP सदस्यता खोलें',
        cancelAnytimeText: 'कभी भी रद्द करें',
        refundPolicyText: 'कोई रिफंड नहीं',
        payNowCta: 'अभी भुगतान करें',
        heroMedia: [
          {
            sortOrder: 0,
            mediaType: 'image',
            url: SEEDED_IMAGE,
            thumbnailUrl: null,
            mediaId: 'vip_hero_v1',
          },
        ],
      },
    ],
  };
}

function ok(data: unknown) {
  return Promise.resolve({
    data: { success: true, message: 'OK', data },
    error: undefined,
    response: new Response(),
  });
}

let PaywallPage: () => React.JSX.Element;

beforeEach(async () => {
  get.mockReset();
  get.mockImplementation((path: string) =>
    path === '/admin/paywall/configs' ? ok(listData) : ok(configData()),
  );
  patch.mockReset();
  patch.mockImplementation(() => ok(configData()));
  ({ PaywallPage } = await import('./paywall-page'));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PaywallPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Renders the page and opens the default paywall's editor. */
async function openEditor() {
  renderPage();
  const rows = await screen.findAllByRole('button', { name: 'Edit' });
  const first = rows[0];
  if (!first) throw new Error('no paywall rows rendered');
  fireEvent.click(first);
  await screen.findByText('Hindi (hi)');
}

/** The copy inputs repeat per locale, so they are addressed by label + id. */
const FIELD_LABELS = { title: 'Title', payNowCta: 'Pay-now button' } as const;

function textField(field: keyof typeof FIELD_LABELS, locale: string) {
  return screen.getByLabelText(FIELD_LABELS[field], {
    selector: `#paywall-${field}-${locale}`,
  });
}

test('lists every paywall with its layout, status, min app version and config version', async () => {
  renderPage();

  expect(await screen.findByText(PAYWALL_ID)).toBeTruthy();
  expect(screen.getByText('vip-card-v1')).toBeTruthy();
  expect(screen.getByText(/Card hero/)).toBeTruthy();
  expect(screen.getByText(/Carousel/)).toBeTruthy();
  expect(screen.getByText('Enabled')).toBeTruthy();
  expect(screen.getByText('Disabled')).toBeTruthy();
  expect(screen.getByText(MIN_APP_VERSION)).toBeTruthy();
  // 0.0.0 is not "version zero", it is NO GATE — say so where it is read.
  expect(screen.getByText(/0\.0\.0 · no gate/)).toBeTruthy();
  // No editor until a paywall is picked.
  expect(screen.queryByText('Hindi (hi)')).toBeNull();
});

test('opening a paywall shows one card per locale that has copy, plus its hero rows', async () => {
  await openEditor();

  expect(screen.getByText('English (en)')).toBeTruthy();
  expect(screen.getByText('Hindi (hi)')).toBeTruthy();
  // English seeds two hero items, Hindi one — three rows, and only English has
  // a second one to move.
  expect(screen.getAllByText(/^Item \d+$/)).toHaveLength(3);
  expect(screen.getAllByRole('button', { name: 'Move item 1 down' })).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Move item 2 up' })).toBeTruthy();
});

test('save is inert until something is edited', async () => {
  await openEditor();

  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
  await waitFor(() => expect(patch).not.toHaveBeenCalled());
  expect(screen.getByText('No unsaved changes.')).toBeTruthy();
});

test('sends ONLY the changed copy field — never the untouched locale or seeded urls', async () => {
  await openEditor();

  fireEvent.change(textField('title', 'hi'), { target: { value: 'नया शीर्षक' } });
  expect(screen.getByText(/Unsaved: Hindi \(hi\)/)).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

  await waitFor(() => expect(patch).toHaveBeenCalled());
  expect(patch).toHaveBeenCalledWith('/admin/paywall/configs/{paywallId}', {
    params: { path: { paywallId: PAYWALL_ID } },
    body: {
      expectedUpdatedAt: UPDATED_AT,
      translations: [{ locale: 'hi', title: 'नया शीर्षक' }],
    },
  });
});

test('reordering the hero ships the whole renumbered list for that locale only', async () => {
  await openEditor();

  fireEvent.click(screen.getByRole('button', { name: 'Move item 2 up' }));
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

  await waitFor(() => expect(patch).toHaveBeenCalled());
  expect(patch).toHaveBeenCalledWith('/admin/paywall/configs/{paywallId}', {
    params: { path: { paywallId: PAYWALL_ID } },
    body: {
      expectedUpdatedAt: UPDATED_AT,
      translations: [
        {
          locale: 'en',
          heroMedia: [
            {
              sortOrder: 0,
              mediaType: 'video',
              url: SEEDED_VIDEO,
              thumbnailUrl: null,
              mediaId: 'vip_intro_v1',
            },
            {
              sortOrder: 1,
              mediaType: 'image',
              url: SEEDED_IMAGE,
              thumbnailUrl: null,
              mediaId: 'vip_hero_v1',
            },
          ],
        },
      ],
    },
  });
});

test('an added hero row with no upload blocks the request and explains why', async () => {
  await openEditor();

  const addButtons = screen.getAllByRole('button', { name: 'Add hero item' });
  const hindiAdd = addButtons[1];
  if (!hindiAdd) throw new Error('expected an add button per locale');
  fireEvent.click(hindiAdd);

  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

  expect(await screen.findByText(/an empty hero row cannot be saved/i)).toBeTruthy();
  await waitFor(() => expect(patch).not.toHaveBeenCalled());
});

test('a malformed media id blocks the request', async () => {
  await openEditor();

  fireEvent.change(
    screen.getByLabelText('Media ID', { selector: '#paywall-hero-hi-0-media-id' }),
    { target: { value: 'Not A Slug!' } },
  );

  expect(await screen.findByRole('alert')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
  await waitFor(() => expect(patch).not.toHaveBeenCalled());
});

test('a layout change and a hero trim ride the same patch', async () => {
  await openEditor();

  // Leaving the carousel means English's second hero must go in the SAME save —
  // which is why the server validates against the layout the patch results in.
  fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'icon_grid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remove item 2' }));
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

  await waitFor(() => expect(patch).toHaveBeenCalled());
  expect(patch).toHaveBeenCalledWith('/admin/paywall/configs/{paywallId}', {
    params: { path: { paywallId: PAYWALL_ID } },
    body: {
      expectedUpdatedAt: UPDATED_AT,
      layout: 'icon_grid',
      translations: [
        {
          locale: 'en',
          heroMedia: [
            {
              sortOrder: 0,
              mediaType: 'image',
              url: SEEDED_IMAGE,
              thumbnailUrl: null,
              mediaId: 'vip_hero_v1',
            },
          ],
        },
      ],
    },
  });
});

test('switching away from the carousel with an extra hero staged is blocked before the request', async () => {
  await openEditor();

  // Nothing about the hero list changed — only the layout — so the server's own
  // diff-based check would let this through and the app would silently draw one
  // of the two images.
  fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'card_hero' } });

  expect(await screen.findByText(/Too many hero items for this layout/)).toBeTruthy();
  expect(screen.getByText(/only the carousel layout shows more than one hero item/i)).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
  await waitFor(() => expect(patch).not.toHaveBeenCalled());

  // Trimming to one item is the fix, and it clears the message.
  fireEvent.click(screen.getByRole('button', { name: 'Remove item 2' }));
  await waitFor(() =>
    expect(screen.queryByText(/Too many hero items for this layout/)).toBeNull(),
  );
});

test('a single-hero layout offers no way to add a second item', async () => {
  await openEditor();

  // The carousel: both locales can take more.
  expect(screen.getAllByRole('button', { name: 'Add hero item' })).toHaveLength(2);

  fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'video_bleed' } });

  expect(screen.queryByRole('button', { name: 'Add hero item' })).toBeNull();
  expect(
    screen.getAllByText(/Switch the layout to the carousel to add more/).length,
  ).toBeGreaterThan(0);
});

test('reset restores every section, not just the copy', async () => {
  await openEditor();

  fireEvent.change(textField('title', 'hi'), { target: { value: 'नया शीर्षक' } });
  fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'card_hero' } });
  fireEvent.change(screen.getByLabelText('Minimum app version'), {
    target: { value: '2.0.0' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

  expect(screen.getByText('No unsaved changes.')).toBeTruthy();
  expect(screen.getByDisplayValue('VIP सदस्यता खोलें')).toBeTruthy();
  expect(screen.getByDisplayValue(PAYWALL_LAYOUT_LABELS.carousel)).toBeTruthy();
  expect(screen.getByDisplayValue(MIN_APP_VERSION)).toBeTruthy();
});

test('a raised min app version rides the patch', async () => {
  await openEditor();

  fireEvent.change(screen.getByLabelText('Minimum app version'), {
    target: { value: ' 1.2.0 ' },
  });
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

  await waitFor(() => expect(patch).toHaveBeenCalled());
  expect(patch).toHaveBeenCalledWith('/admin/paywall/configs/{paywallId}', {
    params: { path: { paywallId: PAYWALL_ID } },
    body: { expectedUpdatedAt: UPDATED_AT, minAppVersion: '1.2.0' },
  });
});

test('a malformed min app version never reaches the API', async () => {
  await openEditor();

  // `meetsMinVersion` denies anything unparseable, so saving this would send
  // every user of this paywall to the default with nothing saying why.
  fireEvent.change(screen.getByLabelText('Minimum app version'), { target: { value: '1.2' } });

  expect(await screen.findByText(/major\.minor\.patch/)).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
  await waitFor(() => expect(patch).not.toHaveBeenCalled());
});

test('lowering the min app version says what that does before it is saved', async () => {
  await openEditor();

  fireEvent.change(screen.getByLabelText('Minimum app version'), {
    target: { value: '1.0.99' },
  });

  // Numeric compare: 1.0.99 is BELOW 1.1.0, however it sorts as a string.
  expect(await screen.findByText(/You are lowering the gate/)).toBeTruthy();
  expect(screen.getByText(/a screen their app cannot draw/)).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Minimum app version'), {
    target: { value: '1.2.0' },
  });
  await waitFor(() => expect(screen.queryByText(/You are lowering the gate/)).toBeNull());
});

test('0.0.0 is spelled out as "no gate", not left looking like a version', async () => {
  await openEditor();

  fireEvent.change(screen.getByLabelText('Minimum app version'), {
    target: { value: '0.0.0' },
  });

  expect(await screen.findByText(/there is NO gate/)).toBeTruthy();
});

test('a refetch after saving does NOT remount the editor and discard an unsaved edit', async () => {
  await openEditor();

  // Save one locale…
  fireEvent.change(textField('payNowCta', 'en'), { target: { value: 'Pay now v2' } });
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
  await waitFor(() => expect(patch).toHaveBeenCalled());

  // …while another locale has an edit in flight. The success invalidates the
  // detail query, so this asserts the refetch does not blow the editor away —
  // which is what would orphan a just-uploaded S3 object.
  fireEvent.change(textField('title', 'hi'), { target: { value: 'बदला हुआ' } });
  await waitFor(() => expect(get).toHaveBeenCalledTimes(4));
  expect(screen.getByDisplayValue('बदला हुआ')).toBeTruthy();
});

test('the page states the propagation delay', async () => {
  renderPage();
  expect(await screen.findByText(/within about 5 minutes/i)).toBeTruthy();
});

test('status is read-only — there is no enable/disable control', async () => {
  await openEditor();

  // `enabled` is still shown, so an editor can see a paywall parked outside the
  // CMS, but it is not writable here: raising the minimum app version above every
  // shipped build is the one way to park a variant.
  expect(screen.getAllByText('Enabled').length).toBeGreaterThan(0);
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByLabelText('Enabled')).toBeNull();
});
