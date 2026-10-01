import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";
import { AuthRepository } from "@api/core/auth/repositories";
import { AuthService } from "@api/core/auth/services";

const log = createModuleLogger("auth:bootstrap-admin");

/**
 * Provision the first admin at boot (TAM-82 AC (f); ADR §B4).
 *
 * HOW THE FIRST ADMIN IS PROVISIONED — there is no default password, anywhere:
 *   1. an operator generates one (`openssl rand -base64 24`);
 *   2. it goes into Secrets Manager (stage/prod) or `.env` (local) as
 *      `ADMIN_BOOTSTRAP_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD`;
 *   3. the next boot creates that user with `role: admin` and the bcrypt hash
 *      of that password.
 * Set neither and the platform simply has no admin — no admin route is
 * reachable by anyone. That is the intended fail-closed default, and it is why
 * this function's first branch is "skip".
 *
 * WHY AT BOOT AND NOT A CLI: the runtime image installs `--prod` and has NO
 * `tsx` (TAM-80 Technical Notes), so a `.ts` CLI cannot execute in a deployed
 * task. Importing this from `src/index.ts` gets it bundled by esbuild — the
 * identical, proven pattern TAM-80 used for the boot seeder. A TAM-79-style
 * one-off `run-task` was considered and rejected as heavier for a strictly
 * idempotent no-op.
 *
 * Constructs its own repo/service rather than reaching into the module's
 * composition root: both are stateless (`getPrisma()` is a shared client), so
 * this costs nothing and keeps the boot path independent of route wiring.
 *
 * NEVER logs, returns, or embeds the password in an error — the only things
 * emitted are the outcome and the email.
 */
export async function runAdminBootstrap(): Promise<void> {
  const env = loadEnv();
  const email = env.ADMIN_BOOTSTRAP_EMAIL;
  const password = env.ADMIN_BOOTSTRAP_PASSWORD;

  // Both-or-neither is enforced by env.ts's superRefine; this narrows the types
  // and states the fail-closed default at the point it takes effect.
  if (!email || !password) {
    log.info("bootstrap admin skipped — ADMIN_BOOTSTRAP_EMAIL/PASSWORD not set (no admin exists)");
    return;
  }

  const service = new AuthService(new AuthRepository());
  const outcome = await service.ensureBootstrapAdmin(email, password);
  log.info({ email, outcome }, `bootstrap admin ensured: ${email} (${outcome})`);
}
