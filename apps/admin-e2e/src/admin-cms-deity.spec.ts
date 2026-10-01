import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  MEDIA_PUBLIC_BASE_URL,
} from './e2e-env';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Admin CMS — Deity happy path with a REAL S3 upload (TAM-106)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Drives the admin SPA in a real browser against the real API + Postgres + floci
 * S3 (all booted by playwright.config.ts / scripts/e2e-web.sh). The DEITY module
 * is used because it is the only fully-complete admin module (API TAM-88 + UI
 * TAM-89) and is untouched by the in-flight content-model migration, so the flow
 * is stable.
 *
 * The upload is NOT mocked: the SPA presigns through our API, the browser PUTs
 * the fixture bytes to floci, and the test then fetches the minted publicUrl and
 * asserts a 200 with the exact bytes back — proving the object physically landed,
 * not merely that a form submitted.
 *
 * Re-runnability: every deity uses a unique, timestamped slug, so re-runs never
 * collide on the unique-slug constraint and tests are order-independent. The
 * deity contract offers NO hard delete (soft-delete by design — ADR §C4), so
 * cleanup is a deactivation; created rows survive as inactive, uniquely-named
 * rows (consistent with the platform's "S3 objects are never deleted" model).
 */

const API = `http://localhost:${process.env.E2E_API_PORT ?? '3210'}`;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICON_PNG = path.join(HERE, 'fixtures', 'deity-icon.png');
const ICON_PNG_BYTES = readFileSync(ICON_PNG);
const NOT_AN_IMAGE = path.join(HERE, 'fixtures', 'not-an-image.txt');

/** The deity icon key shape the API mints: `deity/deity/<uuid>.<ext>` (TAM-84). */
const MINTED_ICON_RE = new RegExp(
  `^${escapeRegExp(MEDIA_PUBLIC_BASE_URL)}/deity/deity/` +
    `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(?:png|webp|svg)$`,
);

let counter = 0;
function uniqueSlug(prefix = 'e2e-deity'): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Log in via the real API and return the JWT (for direct API assertions). */
async function apiLogin(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.ok(), `login failed for ${email}: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return body.data.token as string;
}

/** Register a fresh NON-admin user (role defaults to a non-admin user). */
async function registerNonAdmin(
  request: APIRequestContext,
): Promise<{ email: string; password: string }> {
  const email = `e2e-nonadmin-${Date.now()}-${counter++}@example.com`;
  const password = 'e2e-nonadmin-pw-1';
  const res = await request.post(`${API}/auth/register`, {
    data: { email, name: 'E2E Non-Admin', password },
  });
  expect(res.ok(), `register failed: ${res.status()}`).toBeTruthy();
  return { email, password };
}

/** Submit the login form. Does NOT wait for an outcome — the caller asserts it
 *  (a non-admin lands on "Not authorized"; wrong creds stay on /login). */
async function uiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/cms/login');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Sign in as the admin and WAIT for the CMS shell — so a later `page.goto`
 *  can't race the async login (token stored) and bounce back to /login. */
async function uiLoginAsAdmin(page: Page): Promise<void> {
  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page.getByText('Prabhuji CMS')).toBeVisible();
}

/** Read one deity row (admin API) by exact slug. */
async function getDeityBySlug(
  request: APIRequestContext,
  token: string,
  slug: string,
): Promise<{ id: string; slug: string; iconUrl: string; sortOrder: number; active: boolean; updatedAt: string } | undefined> {
  const res = await request.get(`${API}/admin/taxonomy/deities`, {
    headers: bearer(token),
    params: { q: slug, pageSize: '100' },
  });
  expect(res.ok(), `list deities failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return body.data.items.find((d: { slug: string }) => d.slug === slug);
}

// ─────────────────────────────────────────────────────────────────────────────
// (1) Admin login → CMS shell
// ─────────────────────────────────────────────────────────────────────────────

test('an admin logs in and lands on the CMS shell', async ({ page }) => {
  await uiLoginAsAdmin(page);

  // The shell renders (header brand + the account menu shows the admin email),
  // proving a real JWT that /admin/session accepted as admin.
  await expect(page.getByRole('button', { name: ADMIN_EMAIL })).toBeVisible();

  // And the deity module is reachable inside the shell.
  await page.goto('/cms/taxonomy/deities');
  await expect(page.getByRole('heading', { name: 'Deities' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New deity' })).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// (2) A non-admin is refused the CMS — in the browser AND at the API
// ─────────────────────────────────────────────────────────────────────────────

test('a non-admin is refused the CMS shell and admin data', async ({ page, request }) => {
  const { email, password } = await registerNonAdmin(request);

  // Browser: logging in lands on the "Not authorized" screen — NOT the shell,
  // NOT a redirect loop back to /login.
  await uiLogin(page, email, password);
  await expect(page.getByText('Not authorized')).toBeVisible();
  await expect(page.getByText('Prabhuji CMS')).toHaveCount(0);

  // A DIRECT nav to an admin route renders no content — this is what catches a
  // "guard only on some routes" bug (the guard is structural, applied once).
  await page.goto('/cms/taxonomy/deities');
  await expect(page.getByText('Not authorized')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Deities' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New deity' })).toHaveCount(0);

  // API: the server guard is the real boundary — the non-admin token is refused
  // by /admin/session and by an admin data route (not just hidden in the UI).
  const token = await apiLogin(request, email, password);
  const session = await request.get(`${API}/admin/session`, { headers: bearer(token) });
  expect(session.status()).toBe(403);
  const list = await request.get(`${API}/admin/taxonomy/deities`, { headers: bearer(token) });
  expect(list.status()).toBe(403);
});

// ─────────────────────────────────────────────────────────────────────────────
// (3)+(4)+(5)+(6) Full deity lifecycle with a REAL upload
// ─────────────────────────────────────────────────────────────────────────────

test('deity lifecycle: create with real S3 upload → list → edit+replace icon → deactivate', async ({
  page,
  request,
}) => {
  const token = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const slug = uniqueSlug();

  await uiLoginAsAdmin(page);
  await page.goto('/cms/taxonomy/deities');
  await expect(page.getByRole('heading', { name: 'Deities' })).toBeVisible();

  // ── (3) Create with a real icon upload ────────────────────────────────────
  await page.getByRole('button', { name: 'New deity' }).click();
  const createDialog = page.getByRole('dialog');
  await createDialog.getByLabel('Slug').fill(slug);

  // Pick the fixture → the widget presigns (through our API) → the browser PUTs
  // the bytes to floci S3. onChange fires ONLY after the PUT succeeds, at which
  // point the button flips to "Replace file".
  await createDialog.locator('input[type="file"]').setInputFiles(ICON_PNG);
  await expect(createDialog.getByRole('button', { name: 'Replace file' })).toBeVisible({
    timeout: 15_000,
  });

  await createDialog.getByRole('button', { name: 'Create' }).click();
  await expect(createDialog).toBeHidden();

  // The saved deity carries a MINTED publicUrl (not a client-chosen string).
  const created = await getDeityBySlug(request, token, slug);
  expect(created, 'created deity should be listed').toBeTruthy();
  const firstIconUrl = created!.iconUrl;
  expect(firstIconUrl).toMatch(MINTED_ICON_RE);

  // ── THE REAL-UPLOAD ASSERTION: the bytes physically landed and are fetchable
  const iconGet = await request.get(firstIconUrl);
  expect(iconGet.status(), 'minted icon must be fetchable at its public URL').toBe(200);
  expect(iconGet.headers()['content-type']).toContain('image/png');
  expect(Buffer.from(await iconGet.body()).equals(ICON_PNG_BYTES)).toBeTruthy();

  // ── (4) It appears in the DataTable list with its icon rendering from the URL
  await page.getByLabel('Search').fill(slug);
  const row = page.getByRole('row').filter({ hasText: slug });
  await expect(row).toBeVisible();
  const rowImg = row.locator('img');
  await expect(rowImg).toHaveAttribute('src', firstIconUrl);
  // The image actually decoded from the stored URL (not the broken placeholder).
  await expect
    .poll(
      () => rowImg.evaluate((el) => (el as unknown as { naturalWidth: number }).naturalWidth),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);

  // ── (5) Edit: replace the icon (new immutable key) + change a field ────────
  await row.getByRole('button', { name: 'Edit' }).click();
  const editDialog = page.getByRole('dialog');
  await expect(editDialog.getByRole('button', { name: 'Replace file' })).toBeVisible();
  await editDialog.locator('input[type="file"]').setInputFiles(ICON_PNG);
  // WAIT for the upload to land before saving. `<MediaUploadField>` calls
  // `onChange(publicUrl)` only after the presigned S3 PUT succeeds, so until
  // then the form still holds the OLD url — saving here would persist it
  // unchanged and the "a new key was minted" assertion below would fail for a
  // reason that has nothing to do with key minting. The preview's `src` is the
  // signal: it rebinds precisely when `onChange` fires.
  await expect(editDialog.locator('[data-slot="media-preview"]')).not.toHaveAttribute(
    'src',
    firstIconUrl,
  );
  await editDialog.getByLabel('Sort order').fill('42');
  await editDialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(editDialog).toBeHidden();

  const edited = await getDeityBySlug(request, token, slug);
  expect(edited!.sortOrder).toBe(42);
  const secondIconUrl = edited!.iconUrl;
  expect(secondIconUrl).toMatch(MINTED_ICON_RE);
  // A NEW immutable key was minted; the old object was NOT overwritten.
  expect(secondIconUrl).not.toBe(firstIconUrl);
  expect((await request.get(secondIconUrl)).status()).toBe(200);
  expect(
    (await request.get(firstIconUrl)).status(),
    'the old immutable object must still exist (never overwritten)',
  ).toBe(200);

  // The deity is publicly readable while active (bounded by the read contract).
  expect(await publicDeitySlugs(request, token)).toContain(slug);

  // ── (6) Deactivate (soft delete) ──────────────────────────────────────────
  await page.getByLabel('Search').fill(slug);
  const editedRow = page.getByRole('row').filter({ hasText: slug });
  await editedRow.getByRole('button', { name: 'Deactivate' }).click();
  const confirm = page.getByRole('dialog');
  await confirm.getByRole('button', { name: 'Deactivate' }).click();
  await expect(confirm).toBeHidden();

  // Soft, not hard: the row still exists in admin with active=false…
  const deactivated = await getDeityBySlug(request, token, slug);
  expect(deactivated, 'row must still exist after deactivation').toBeTruthy();
  expect(deactivated!.active).toBe(false);
  // …and it has left the public read contract.
  expect(await publicDeitySlugs(request, token)).not.toContain(slug);
});

/** Page through the public `/deities` read contract, collecting every slug. */
async function publicDeitySlugs(request: APIRequestContext, token: string): Promise<string[]> {
  const slugs: string[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 50; guard += 1) {
    // `locale` must be a client language (not the `en` fallback), `limit` ≤ 50.
    // A deity with no translation still lists — its displayName falls back to the
    // slug (TAM-57) — so the slug is present either way.
    const res = await request.get(`${API}/deities`, {
      headers: bearer(token),
      params: { locale: 'hi', limit: '50', ...(cursor ? { cursor } : {}) },
    });
    expect(res.ok(), `public deities failed: ${res.status()}`).toBeTruthy();
    const body = await res.json();
    for (const d of body.data.items) slugs.push(d.slug);
    cursor = body.data.nextCursor ?? undefined;
    if (!cursor) break;
  }
  return slugs;
}

// ─────────────────────────────────────────────────────────────────────────────
// (7a) The media guard fails closed for an unknown presign target (WIRED)
// ─────────────────────────────────────────────────────────────────────────────

test('the media presign guard fails closed for an unknown (module,entity,field) target', async ({
  request,
}) => {
  const token = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const res = await request.post(`${API}/admin/media/presign`, {
    headers: bearer(token),
    data: {
      module: 'deity',
      entity: 'deity',
      field: 'notARealField',
      filename: 'x.png',
      contentType: 'image/png',
      sizeBytes: 1024,
    },
  });
  expect(res.status()).toBe(400);
});

// ─────────────────────────────────────────────────────────────────────────────
// (7b) A deity write with a NON-MINTED external iconUrl.
//
// Contract (ADR §A4): the write is refused with a 400 because the URL was not
// minted by our presign flow, enforced by `validateOwnedUrl` (`core/media`).
//
// This carried a `test.fail()` while the deity service's `validateIconUrl` was
// still a no-op placeholder, with the note that the guard being wired would make
// it pass unexpectedly and the marker should then be removed. TAM-108 (8f22ab8)
// wired it; the marker outlived the gap only because this suite could not run
// (its API server never booted — see the AUTH_OTP_PEPPER note in
// playwright.config.ts). Removed here, as that comment instructed.
// ─────────────────────────────────────────────────────────────────────────────

test('a deity write with a non-minted external iconUrl is refused', async ({
  request,
}) => {
  const token = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const res = await request.post(`${API}/admin/taxonomy/deities`, {
    headers: bearer(token),
    data: {
      slug: uniqueSlug('e2e-evil'),
      iconUrl: 'https://evil.example/x.png',
      sortOrder: 0,
      active: true,
      translations: [],
    },
  });
  // The media-ownership boundary should reject a URL this platform did not mint.
  expect(res.status()).toBe(400);
});

// ─────────────────────────────────────────────────────────────────────────────
// (8a) Oversize upload is refused at presign (server-side cap)
// ─────────────────────────────────────────────────────────────────────────────

test('an oversize icon is refused at presign (server-side size cap)', async ({ request }) => {
  const token = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const res = await request.post(`${API}/admin/media/presign`, {
    headers: bearer(token),
    data: {
      module: 'deity',
      entity: 'deity',
      field: 'iconUrl',
      filename: 'huge.png',
      contentType: 'image/png',
      sizeBytes: 11 * 1024 * 1024, // > the 10 MB image cap
    },
  });
  expect(res.status()).toBe(400);
});

// ─────────────────────────────────────────────────────────────────────────────
// (8b) A wrong content-type file is rejected in the UI before any upload
// ─────────────────────────────────────────────────────────────────────────────

test('a wrong content-type file is rejected in the UI with a visible error (no silent failure)', async ({
  page,
}) => {
  await uiLoginAsAdmin(page);
  await page.goto('/cms/taxonomy/deities');
  await page.getByRole('button', { name: 'New deity' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Slug').fill(uniqueSlug('e2e-badtype'));

  // A text file with an image-slot picker: the client pre-check refuses it BEFORE
  // any presign/PUT, and the field value stays empty (submit stays blocked).
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'not-an-image.txt',
    mimeType: 'text/plain',
    buffer: readFileSync(NOT_AN_IMAGE),
  });

  await expect(dialog.getByRole('alert')).toBeVisible();
  // No upload happened → the "Replace file" affordance never appears.
  await expect(dialog.getByRole('button', { name: 'Replace file' })).toHaveCount(0);
});
