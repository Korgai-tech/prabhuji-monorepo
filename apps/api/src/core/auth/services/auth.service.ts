import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { loadEnv } from "@api/shared/config";
import { AppError, ValidationError } from "@api/shared/errors";
import type { EventBus } from "@api/shared/events";
import { createModuleLogger } from "@api/shared/logs";
import { ADMIN_ROLE, EMAIL_LOGIN } from "@api/shared/schemas";
import type { AuthRepository } from "@api/core/auth/repositories";
import type {
  AdminUserPage,
  AuthUser,
  BootstrapAdminOutcome,
  ListUsersParams,
  LoginInput,
  LoginResult,
  RegisterInput,
} from "@api/core/auth/types";

const log = createModuleLogger("auth:service");

/**
 * bcrypt cost factor. ONE constant for every password this app hashes, so the
 * bootstrap admin's password can never be hashed more weakly than a registered
 * user's (TAM-82 Security Considerations).
 */
const BCRYPT_COST = 10;

/**
 * The JWT payload. Deliberately `{sub, email?}` and NOTHING ELSE — no `role`.
 * The mobile app decodes this payload (`lib/core/jwt.dart`), so it is a
 * contract; and a role claim on a 1h token with no denylist would leave a
 * demoted admin privileged for an hour (ADR §B1). Roles are resolved from the
 * DB per request by `adminMiddleware`. Do not add a role claim here.
 *
 * `email` is optional: tokens minted by `core/otp` for phone accounts omit it
 * entirely, because those accounts have no email.
 */
interface TokenPayload {
  sub: string;
  email?: string;
}

export class AuthService {
  // The event bus is optional so unit tests can omit it; wired in the module's
  // composition root (`core/auth/index.ts`). Auth is a producer here — it owns
  // publishing its own domain events; consumers live in their own modules.
  constructor(
    private readonly repo: AuthRepository,
    private readonly events?: EventBus
  ) {}

  async register(input: RegisterInput): Promise<AuthUser> {
    const existing = await this.repo.findByEmail(input.email);
    if (existing) throw new ValidationError("Email already registered");
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const user = await this.repo.createUser({
      email: input.email,
      name: input.name,
      passwordHash,
      // TAM-82: HARD-CODED, never `input.role` — `/auth/register` is public and
      // unguarded, so a role that could come from the body would be a
      // self-service admin factory. `RegisterInput` has no `role` field and
      // Zod strips unknown keys, but this line is the layer that does not
      // depend on a library default remaining true.
      role: "user",
      // This endpoint is the email+password path by definition; the phone path
      // lives in `core/otp` and stamps `otp`.
      loginType: EMAIL_LOGIN,
    });
    // Emit a domain event; other modules react asynchronously (decoupled).
    // The user id is the partition key → this user's events stay ordered.
    //
    // `input.email` rather than `user.email`: the column is nullable now, but
    // this path always has one, and reading it from the request keeps
    // `AppEventMap`'s non-null `email: string` honest without an assertion.
    await this.events?.publish(
      "user.registered",
      { userId: user.id, email: input.email },
      user.id
    );
    return { id: user.id, email: user.email };
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const user = await this.repo.findByEmail(input.email);
    if (!user) throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");

    // A password may only authenticate an `email` account. Phone accounts have
    // no password path at all, and this is the line that says so.
    //
    // It USED to be true by accident: OTP signups stored 32 random bytes of hex
    // in `passwordHash`, and `bcryptjs` happens to resolve `false` for any value
    // that isn't exactly 60 characters — so the account was unreachable because
    // of a length check inside a dependency, not because anyone decided it.
    // Now `loginType` decides it, and `user_login_type_shape` guarantees the
    // column agrees. Same error and same shape as a wrong password: which
    // accounts exist, and how they log in, are not facts this endpoint reveals.
    if (user.loginType !== EMAIL_LOGIN || user.passwordHash === null) {
      throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    const env = loadEnv();
    // `?? undefined` so a null drops the key entirely rather than signing
    // `email: null`. Unreachable in practice — the guard above proved this is an
    // EMAIL_LOGIN account, and the CHECK constraint means those always have one.
    const payload: TokenPayload = { sub: user.id, email: user.email ?? undefined };
    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    });
    return { token, user: { id: user.id, email: user.email } };
  }

  /**
   * One page of the admin user list. Pass-through — the paging/filtering is a
   * query concern with no business rule attached, and inventing one here would
   * just be a layer that reformats its own arguments.
   */
  async listUsers(params: ListUsersParams): Promise<AdminUserPage> {
    return this.repo.listUsers(params);
  }

  /**
   * Ensure the bootstrap admin exists (TAM-82 AC (f); ADR §B4). Called at boot
   * from `src/index.ts` ONLY when both `ADMIN_BOOTSTRAP_EMAIL` and
   * `ADMIN_BOOTSTRAP_PASSWORD` are set — absent credentials mean NO admin is
   * created, which is the fail-closed answer: a missing secret must produce no
   * admin, never a weak one. There is no default password anywhere.
   *
   * IDEMPOTENT — safe on every task start (stage runs min=1/max=2, so this runs
   * on every boot of every task):
   *   - user absent → create with `role: admin` + the bcrypt-hashed password;
   *   - user present, already admin → no-op;
   *   - user present, not admin → promote to admin, **password untouched**.
   *
   * NEVER touching an existing user's password is deliberate. It means this
   * path cannot be used to overwrite a real person's credentials by pointing
   * the env var at their email — but it also means rotating the bootstrap
   * admin's password is a manual DB write today (no change-password endpoint;
   * known gap, deferred — ADR §B4 / epic non-goals).
   *
   * `password` is never logged, never returned, and never put in an error
   * message — only the outcome and the email are.
   *
   * Emits NO `user.registered` domain event: that event means "a person signed
   * up" and drives the notifications consumer (a welcome message). An
   * infrastructure bootstrap re-running on every task start is not a signup,
   * and would fire it on the create-branch only — an inconsistency in a
   * function whose entire contract is idempotency.
   */
  async ensureBootstrapAdmin(email: string, password: string): Promise<BootstrapAdminOutcome> {
    const existing = await this.repo.findByEmail(email);

    if (existing) {
      if (existing.role === ADMIN_ROLE) return "unchanged";
      await this.repo.updateRole(existing.id, ADMIN_ROLE);
      log.info({ email }, "bootstrap admin promoted to admin");
      return "promoted";
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    try {
      await this.repo.createUser({
        email,
        name: "Bootstrap Admin",
        passwordHash,
        role: ADMIN_ROLE,
        loginType: EMAIL_LOGIN,
      });
      log.info({ email }, "bootstrap admin created");
      return "created";
    } catch (err) {
      // Two tasks booting together can both miss the row above and race to
      // INSERT; the loser hits the unique index on `email`. Re-read: if the
      // winner's row is there and is an admin, the postcondition holds and
      // this is a success, not a boot failure. Anything else rethrows.
      const raced = await this.repo.findByEmail(email);
      if (raced?.role === ADMIN_ROLE) {
        log.info({ email }, "bootstrap admin already created by a concurrent instance");
        return "unchanged";
      }
      throw err;
    }
  }

  verifyToken(token: string): Promise<AuthUser> {
    const env = loadEnv();
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
      // Absent for phone accounts — normalised to null so `req.user.email` has
      // one shape rather than sometimes-undefined, sometimes-null.
      return Promise.resolve({ id: decoded.sub, email: decoded.email ?? null });
    } catch {
      throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
    }
  }
}
