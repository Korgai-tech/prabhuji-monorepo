/**
 * Shared E2E constants — imported by BOTH `playwright.config.ts` (to boot the
 * API with a bootstrap admin + a floci-backed media stack) and the specs (to log
 * in as that admin and to assert against the same media origin).
 *
 * Keeping them in one module is what guarantees the password the API bootstraps
 * with is byte-identical to the one the browser types, and that the public media
 * base URL the specs fetch matches what the API mints.
 */

/** The bootstrap admin (TAM-82 `runAdminBootstrap`) — created at API boot from
 *  `ADMIN_BOOTSTRAP_EMAIL`/`ADMIN_BOOTSTRAP_PASSWORD`. There is no default
 *  password anywhere; this pair exists only for the E2E stack. */
export const ADMIN_EMAIL = 'admin-e2e@prabhuji.test';
/** Must be ≥ 16 chars — `env.ts` enforces `ADMIN_BOOTSTRAP_PASSWORD.min(16)`. */
export const ADMIN_PASSWORD = 'e2e-admin-pw-0123456789';

/** The local media bucket floci-init creates (`MEDIA_BUCKET`, TAM-83). */
export const MEDIA_BUCKET = 'app-local-media';
/** floci S3 endpoint (host-reachable — same host the browser PUTs to). */
export const MEDIA_S3_ENDPOINT = 'http://localhost:4566';
/** Every minted media URL is built from (and validated against) this base. */
export const MEDIA_PUBLIC_BASE_URL = `${MEDIA_S3_ENDPOINT}/${MEDIA_BUCKET}`;

/**
 * The media + AWS env the API needs to presign against floci and to accept the
 * http-on-localhost URLs floci mints (`MEDIA_ALLOW_INSECURE_URLS`, dev-only
 * carve-out — `env.ts` hard-fails this under `NODE_ENV=production`). Merged into
 * the API webServer env in `playwright.config.ts`.
 */
export const mediaApiEnv: Record<string, string> = {
  MEDIA_BUCKET,
  MEDIA_PUBLIC_BASE_URL,
  MEDIA_ALLOW_INSECURE_URLS: 'true',
  AWS_ENDPOINT_URL: MEDIA_S3_ENDPOINT,
  AWS_REGION: 'ap-south-1',
  AWS_ACCESS_KEY_ID: 'test',
  AWS_SECRET_ACCESS_KEY: 'test',
  ADMIN_BOOTSTRAP_EMAIL: ADMIN_EMAIL,
  ADMIN_BOOTSTRAP_PASSWORD: ADMIN_PASSWORD,
};
