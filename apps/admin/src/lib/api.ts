import { createApiClient } from '@repo/api-client';

// When the admin is served behind the shared ALB (at `/cms`), it and the API
// are same-origin/same-scheme, so `window.location.origin` reaches this env's
// API with no hardcoded host and no mixed content — one image is portable
// across stage and prod. Local dev keeps setting VITE_API_URL=http://localhost:3000
// (the Vite dev server is a different origin from the API).
const baseUrl =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  window.location.origin;

export const api = createApiClient(baseUrl);

// NOTE: localStorage token is simple for a template. Production should prefer an httpOnly refresh cookie (XSS tradeoff).
api.use({
  onRequest({ request }) {
    const token = localStorage.getItem('admin_token');
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  },
  onResponse({ response }) {
    if (response.status === 401) {
      localStorage.removeItem('admin_token');
      // Base-path aware (TAM-120): under the `/cms` deploy the app is served with
      // a Vite base, so a bare `/login` would 404 off-base. Derive from BASE_URL
      // (which is `/` in dev, `/cms/` when hosted) so the mid-session token-expiry
      // redirect stays inside the app.
      const loginPath = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/login`;
      if (window.location.pathname !== loginPath)
        window.location.assign(loginPath);
    }
    return response;
  },
});
