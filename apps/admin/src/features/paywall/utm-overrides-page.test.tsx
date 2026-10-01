import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import type React from 'react';

/**
 * Ad group paywall overrides. Feature hooks import the client as `@/lib/api`, so
 * that specifier is mocked and `GET` is branched on the requested path (the list,
 * the per-id detail the editor loads through, and the app-facing paywall config
 * the benefit dropdowns are built from).
 *
 * The assertions that matter are on the BODIES: the document is per locale and
 * `locales` is always present (`{}` when nothing is overridden), `media` is one
 * object that is never sent half-filled, `benefits` is an ordered replace-set
 * that is omitted rather than sent empty, and the PATCH carries only what was
 * touched. Every one of those is a 400 on the server if we get it wrong.
 */

const ROW_ID = '11111111-1111-1111-1111-111111111111';
const UTM_GROUP = 'Diwali Prospecting — Broad';
const HERO_URL = 'https://cdn.example.com/media/paywall/hero.mp4';

const HERO_MEDIA = {
  mediaType: 'video',
  url: HERO_URL,
  thumbnailUrl: null,
  mediaId: 'diwali_hero_v1',
};

const MANDIR = { benefitId: 'mandir', icon: 'benefit-mandir.png', name: 'Mandir' };

/**
 * The benefit choices the editor offers, exactly as `GET /paywall/config`
 * returns them — id, BUNDLED icon key and the name in the requested locale.
 * Nothing about the list is hardcoded in the page.
 */
function paywallConfig(locale: string) {
  const hindi = locale === 'hi';
  return {
    paywallId: 'vip-membership-v1',
    benefits: [
      {
        benefitId: 'mandir',
        localizedName: hindi ? 'मंदिर' : 'Mandir',
        icon: 'benefit-mandir.png',
        sortOrder: 0,
      },
      {
        benefitId: 'wallpaper',
        localizedName: hindi ? 'वॉलपेपर' : 'Wallpaper',
        icon: 'benefit-wallpaper.png',
        sortOrder: 1,
      },
    ],
  };
}

const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: { GET: get, POST: post, PATCH: patch, DELETE: del },
}));

function overrideRow() {
  return {
    id: ROW_ID,
    utmGroup: UTM_GROUP,
    enabled: true,
    overrides: {
      locales: {
        en: { media: HERO_MEDIA, benefits: [MANDIR] },
      },
    },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  };
}

const disabledRow = {
  id: '22222222-2222-2222-2222-222222222222',
  utmGroup: 'Navratri Retargeting',
  enabled: false,
  overrides: { locales: {} },
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
};

function ok(data: unknown) {
  return Promise.resolve({
    data: { success: true, message: 'OK', data },
    error: undefined,
    response: new Response(),
  });
}

function failed() {
  return Promise.resolve({
    data: undefined,
    error: { success: false, message: 'Boom', data: null },
    response: new Response(null, { status: 500 }),
  });
}

type GetArgs = { params?: { query?: { locale?: string } } };

function routeGet(path: string, args?: GetArgs) {
  if (path === '/paywall/config') return ok(paywallConfig(args?.params?.query?.locale ?? 'hi'));
  if (path === '/admin/paywall/utm-overrides') return ok([overrideRow(), disabledRow]);
  return ok(overrideRow());
}

let UtmOverridesPage: () => React.JSX.Element;

beforeEach(async () => {
  get.mockReset();
  get.mockImplementation(routeGet);
  post.mockReset();
  post.mockImplementation(() => ok(overrideRow()));
  patch.mockReset();
  patch.mockImplementation(() => ok(overrideRow()));
  del.mockReset();
  del.mockImplementation(() => ok(null));
  ({ UtmOverridesPage } = await import('./utm-overrides-page'));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <UtmOverridesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openEditor() {
  renderPage();
  const edit = await screen.findAllByRole('button', { name: 'Edit' });
  const first = edit[0];
  if (!first) throw new Error('no override rows rendered');
  fireEvent.click(first);
  await screen.findByLabelText('Ad group name');
}

/**
 * The "Add benefit" button only appears once the paywall's own benefits have
 * been fetched, so awaiting it is also how a test waits for the choices — a row
 * added earlier would prefill blank.
 */
async function addBenefit(locale: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Add a benefit to ${locale}` }));
}

test('lists every ad group override with its status and per-language content counts', async () => {
  renderPage();

  expect(await screen.findByText(UTM_GROUP)).toBeTruthy();
  expect(screen.getByText('Navratri Retargeting')).toBeTruthy();
  expect(screen.getByText('Enabled')).toBeTruthy();
  expect(screen.getByText('Disabled')).toBeTruthy();
  expect(screen.getByText('1 language(s)')).toBeTruthy();
  expect(screen.getByText('1 replaced')).toBeTruthy();
  expect(screen.getByText('1 custom list(s)')).toBeTruthy();
  // The rules an editor has to know before touching anything.
  expect(screen.getByText(/matched/)).toBeTruthy();
  expect(screen.getByText(/default paywall only/)).toBeTruthy();
  expect(screen.getByText(/skips the A\/B variant entirely/)).toBeTruthy();
  // No paywall id is selectable anywhere on this page.
  expect(screen.queryByLabelText(/paywall ID/i)).toBeNull();
  // No editor until a row is picked.
  expect(screen.queryByLabelText('Ad group name')).toBeNull();
});

/**
 * Cancel CLOSES the editor. It used to only revert the draft, which made it a
 * dead button in the state a freshly opened row is always in — nothing edited
 * yet, so reverting changed nothing on screen.
 */
test('cancel closes the editor, edited or not', async () => {
  await openEditor();
  expect(screen.getByLabelText('Ad group name')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  await waitFor(() => expect(screen.queryByLabelText('Ad group name')).toBeNull());
});

test('cancel discards edits rather than keeping them for the next open', async () => {
  await openEditor();
  fireEvent.change(screen.getByLabelText('Ad group name'), {
    target: { value: 'Typed but abandoned' },
  });

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByLabelText('Ad group name')).toBeNull());

  const edit = await screen.findAllByRole('button', { name: 'Edit' });
  const first = edit[0];
  if (!first) throw new Error('no override rows rendered');
  fireEvent.click(first);

  // `getByDisplayValue` rather than reading `.value` off the node: this repo's
  // admin lint cannot resolve DOM members inside test files.
  await screen.findByLabelText('Ad group name');
  expect(screen.getByDisplayValue(UTM_GROUP)).toBeTruthy();
  expect(screen.queryByDisplayValue('Typed but abandoned')).toBeNull();
});

test('the editor offers Hindi and English only', async () => {
  await openEditor();

  expect(screen.getAllByText(/Hindi/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/English/).length).toBeGreaterThan(0);

  for (const absent of [/Marathi/, /Tamil/, /Telugu/, /Kannada/, /Gujarati/, /Bengali/, /Odia/]) {
    expect(screen.queryAllByText(absent)).toHaveLength(0);
  }
});

/**
 * The four paywall copy lines (`title`, `payNowCta`, `cancelAnytimeText`,
 * `refundPolicyText`) left this contract — they are the product's own voice, and
 * sending one now is a `.strict()` 400. Nothing on this page may offer them.
 */
test('no paywall copy field is editable — only media and benefits', async () => {
  await openEditor();

  for (const gone of [/Pay-now button/, /Cancel-anytime/, /Refund-policy/]) {
    expect(screen.queryAllByText(gone)).toHaveLength(0);
  }
  expect(screen.queryByLabelText('Title')).toBeNull();
});

/**
 * The benefit id and its icon are picked from the LIVE paywall, never typed and
 * never hardcoded here: the id is what the app reports impressions under and the
 * icon is a key of artwork bundled in the APK.
 */
test('the benefit and icon choices come from the paywall itself, in that language', async () => {
  renderPage();

  fireEvent.click(await screen.findByRole('button', { name: 'New ad group override' }));
  await addBenefit('Hindi (hi)');

  expect(get).toHaveBeenCalledWith('/paywall/config', { params: { query: { locale: 'hi' } } });
  expect(get).toHaveBeenCalledWith('/paywall/config', { params: { query: { locale: 'en' } } });

  // Prefilled from the chosen benefit — its own icon and its name in Hindi.
  expect(screen.getByDisplayValue('मंदिर')).toBeTruthy();
  expect(screen.getByText('मंदिर (mandir)')).toBeTruthy();
  expect(screen.getByText('वॉलपेपर (wallpaper)')).toBeTruthy();
  // Bundled asset keys, offered as a choice — there is nothing to upload.
  expect(screen.getAllByText('benefit-mandir.png').length).toBeGreaterThan(0);
});

test('creating sends the ad group, the enabled flag and only the filled locale keys', async () => {
  renderPage();

  fireEvent.click(await screen.findByRole('button', { name: 'New ad group override' }));
  fireEvent.change(screen.getByLabelText('Ad group name'), {
    target: { value: '  Holi Broad — Meta  ' },
  });
  await addBenefit('Hindi (hi)');
  fireEvent.change(screen.getByLabelText('Name', { selector: '#utm-benefit-hi-0-name' }), {
    target: { value: '  होली ऑफ़र  ' },
  });

  fireEvent.click(screen.getByRole('button', { name: 'Create override' }));

  await waitFor(() => expect(post).toHaveBeenCalled());
  expect(post).toHaveBeenCalledWith('/admin/paywall/utm-overrides', {
    body: {
      utmGroup: 'Holi Broad — Meta',
      enabled: true,
      // No `media` (nothing uploaded), no empty benefit list, no `en` at all.
      overrides: {
        locales: {
          hi: {
            benefits: [
              { benefitId: 'mandir', icon: 'benefit-mandir.png', name: 'होली ऑफ़र' },
            ],
          },
        },
      },
    },
  });
});

test('a second benefit takes the next unused one, and the list order is the render order', async () => {
  renderPage();

  fireEvent.click(await screen.findByRole('button', { name: 'New ad group override' }));
  fireEvent.change(screen.getByLabelText('Ad group name'), {
    target: { value: 'Holi Broad — Meta' },
  });
  await addBenefit('Hindi (hi)');
  await addBenefit('Hindi (hi)');
  // Wallpaper (added second) moves to the top.
  fireEvent.click(screen.getByRole('button', { name: 'Move Hindi (hi) benefit 2 up' }));

  fireEvent.click(screen.getByRole('button', { name: 'Create override' }));

  await waitFor(() => expect(post).toHaveBeenCalled());
  expect(post).toHaveBeenCalledWith('/admin/paywall/utm-overrides', {
    body: {
      utmGroup: 'Holi Broad — Meta',
      enabled: true,
      overrides: {
        locales: {
          hi: {
            benefits: [
              { benefitId: 'wallpaper', icon: 'benefit-wallpaper.png', name: 'वॉलपेपर' },
              { benefitId: 'mandir', icon: 'benefit-mandir.png', name: 'मंदिर' },
            ],
          },
        },
      },
    },
  });
});

test('creating with nothing overridden still sends `locales: {}` — never an empty document', async () => {
  renderPage();

  fireEvent.click(await screen.findByRole('button', { name: 'New ad group override' }));
  fireEvent.change(screen.getByLabelText('Ad group name'), {
    target: { value: 'Holi Broad — Meta' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create override' }));

  await waitFor(() => expect(post).toHaveBeenCalled());
  expect(post).toHaveBeenCalledWith('/admin/paywall/utm-overrides', {
    body: { utmGroup: 'Holi Broad — Meta', enabled: true, overrides: { locales: {} } },
  });
});

test('creating is blocked until the ad group name is given', async () => {
  renderPage();

  fireEvent.click(await screen.findByRole('button', { name: 'New ad group override' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create override' }));

  await waitFor(() => expect(post).not.toHaveBeenCalled());
  expect(screen.getByText(/Ad group name is required/)).toBeTruthy();
});

test('a benefit the editor blanks out blocks the save rather than shipping a hole', async () => {
  await openEditor();

  fireEvent.change(screen.getByLabelText('Name', { selector: '#utm-benefit-en-0-name' }), {
    target: { value: '   ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(patch).not.toHaveBeenCalled());
  expect(screen.getByText('Name is required')).toBeTruthy();
});

test('editing sends ONLY the changed keys — utmGroup untouched, the locale carried whole', async () => {
  await openEditor();

  fireEvent.change(screen.getByLabelText('Name', { selector: '#utm-benefit-en-0-name' }), {
    target: { value: 'Your temple' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(patch).toHaveBeenCalled());
  expect(patch).toHaveBeenCalledWith('/admin/paywall/utm-overrides/{id}', {
    params: { path: { id: ROW_ID } },
    body: {
      // `utmGroup` and `enabled` are absent — untouched means omitted.
      overrides: {
        locales: {
          en: {
            media: HERO_MEDIA,
            benefits: [{ ...MANDIR, name: 'Your temple' }],
          },
        },
      },
    },
  });
});

test('removing the last benefit omits the key rather than sending `[]`', async () => {
  await openEditor();

  fireEvent.click(screen.getByRole('button', { name: 'Remove English (en) benefit 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(patch).toHaveBeenCalled());
  expect(patch).toHaveBeenCalledWith('/admin/paywall/utm-overrides/{id}', {
    params: { path: { id: ROW_ID } },
    body: { overrides: { locales: { en: { media: HERO_MEDIA } } } },
  });
});

test('toggling enabled patches that flag alone — the document is left out', async () => {
  await openEditor();

  fireEvent.click(screen.getByRole('switch'));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(patch).toHaveBeenCalled());
  expect(patch).toHaveBeenCalledWith('/admin/paywall/utm-overrides/{id}', {
    params: { path: { id: ROW_ID } },
    body: { enabled: false },
  });
});

test('save is inert until something is edited', async () => {
  await openEditor();

  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(patch).not.toHaveBeenCalled());
  expect(screen.getByText('No unsaved changes.')).toBeTruthy();
});

test('clearing a locale’s media omits the key rather than sending an empty object', async () => {
  await openEditor();

  fireEvent.click(screen.getByRole('button', { name: 'Clear English (en) media' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(patch).toHaveBeenCalled());
  expect(patch).toHaveBeenCalledWith('/admin/paywall/utm-overrides/{id}', {
    params: { path: { id: ROW_ID } },
    body: { overrides: { locales: { en: { benefits: [MANDIR] } } } },
  });
});

/**
 * The choice list is a convenience, not the enforcement point — if the paywall
 * cannot be read the editor types the id and the icon key instead, and the same
 * shape rules still apply before the request.
 */
test('the dropdowns fall back to text inputs when the paywall cannot be read', async () => {
  get.mockImplementation((path: string, args?: GetArgs) =>
    path === '/paywall/config' ? failed() : routeGet(path, args),
  );

  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'New ad group override' }));
  await addBenefit('Hindi (hi)');

  expect(screen.getByPlaceholderText('aarti_bhajans')).toBeTruthy();
  expect(screen.getByPlaceholderText('benefit-mandir.png')).toBeTruthy();
});

test('deleting asks first, then removes the row permanently', async () => {
  renderPage();

  fireEvent.click(await screen.findByRole('button', { name: `Delete ${UTM_GROUP}` }));
  expect(await screen.findByText('Delete this ad group override?')).toBeTruthy();
  await waitFor(() => expect(del).not.toHaveBeenCalled());

  fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

  await waitFor(() => expect(del).toHaveBeenCalled());
  expect(del).toHaveBeenCalledWith('/admin/paywall/utm-overrides/{id}', {
    params: { path: { id: ROW_ID } },
  });
});

/**
 * Per-language sections start CLOSED and the editor opens the one it needs.
 *
 * Both languages of media and benefits expanded at once buries the ad group name
 * and the enable switch below the fold, which is where every edit starts. Native
 * `<details>` with no `open` prop gives the toggle for free — and this asserts
 * it, because the surrounding tests read inputs INSIDE the sections and jsdom
 * renders collapsed children happily, so a regression to `open` would otherwise
 * pass silently.
 *
 * Only the initial state is asserted here: expanding is the browser's own
 * summary-click behaviour, which jsdom does not implement and which is not ours
 * to test. It was verified end-to-end in Chromium instead.
 */
test('per-language sections are collapsed until the editor opens one', async () => {
  const { container } = renderPage();
  const edit = await screen.findAllByRole('button', { name: 'Edit' });
  const first = edit[0];
  if (!first) throw new Error('no override rows rendered');
  fireEvent.click(first);
  await screen.findByLabelText('Ad group name');

  const sections = Array.from(container.querySelectorAll('details'));
  expect(sections).toHaveLength(2);
  expect(sections.map((section) => section.open)).toEqual([false, false]);
});
