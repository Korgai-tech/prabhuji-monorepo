import { test, expect } from '@playwright/test';

const API = `http://localhost:${process.env.E2E_API_PORT ?? '3210'}`;

// register -> login -> the admin guard refuses a non-admin.
//
// NOTE (TAM-106): this used to assert a freshly-registered user lands on the
// users list. The admin CMS epic (TAM-82/86) put EVERY route except /login
// behind `<AdminRoute>`, so a non-admin now sees the "Not authorized" screen
// instead — the correct, current behaviour. (The full admin-vs-non-admin matrix
// lives in admin-cms-deity.spec.ts.)
test('register via API, login via UI, a non-admin is refused the CMS', async ({
  page,
  request,
}) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'e2e-password-123';

  const res = await request.post(`${API}/auth/register`, {
    data: { email, name: 'E2E User', password },
  });
  expect(res.ok(), `register failed: ${res.status()}`).toBeTruthy();

  await page.goto('/cms/login');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Authenticated, but not an admin → the guard's explicit screen, never a
  // redirect loop back to /login and never the CMS shell.
  await expect(page.getByText('Not authorized')).toBeVisible();
  await expect(page).not.toHaveURL(/\/login$/);
  await expect(page.getByText('Prabhuji CMS')).toHaveCount(0);
});

test('wrong credentials stay on login with an error', async ({ page }) => {
  await page.goto('/cms/login');
  await page.getByPlaceholder('Email').fill('nobody@example.com');
  await page.getByPlaceholder('Password').fill('wrong-password-1');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('Invalid credentials')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
