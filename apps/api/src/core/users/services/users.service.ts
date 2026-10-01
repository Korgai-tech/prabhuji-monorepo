import { AppError } from "@api/shared/errors";
import { performServiceCall } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import type { LanguageCode } from "@api/shared/language.schema";
import type { UserRole } from "@api/shared/schemas";
import type { UsersRepository, UserRow } from "@api/core/users/repositories";
import type { LandingConfig, UpdateMeInput, UserPublic } from "@api/core/users/types";
import type { ChatConfig } from "@api/core/chat/types";
import { resolveLanding } from "./landing.service.js";

const log = createModuleLogger("users:service");

/**
 * Users module service — orchestrates the "get me" + "patch me" flows.
 *
 * Onboarding-complete semantics:
 *   - `onboardingCompletedAt` is server-owned. The client can never set it
 *     directly (Zod schema `.strict()` rejects it, and the repository call
 *     inside `updateMe` only writes it when the derived condition fires).
 *   - It flips from null → now() the FIRST time the resulting user has BOTH
 *     `name` and `selectedLanguage` non-null AND the current value is null.
 *   - Once set, it is stable — subsequent patches never move it (idempotent).
 *
 * PII hygiene: `name` is never logged (log lines use only `userId` and
 * boolean/enum flags). See `docs/PHASE-NOTES.md` for the onboarding funnel.
 */
export class UsersService {
  constructor(private readonly repo: UsersRepository) {}

  /**
   * The caller's chat availability, for `GET /users/me`.
   *
   * Fails SOFT to disabled. The chat module resolves this from an A/B variant
   * over the network, and a profile read must not 500 because an experiment
   * service blinked — the profile is what the app boots on. Disabled is also
   * the correct guess: it matches what the chat endpoints themselves do when
   * the same lookup fails, so the button the app shows and the answer it gets
   * on tap can never disagree.
   */
  async getChatConfig(userId: string): Promise<ChatConfig> {
    try {
      return await performServiceCall(
        "chat",
        (api) => api.getChatConfig(userId),
        "users:chat-config",
        "failed to resolve chat config"
      );
    } catch (err) {
      log.warn({ err, user_id: userId }, "could not resolve chat config");
      return {
        enabled: false,
        agentId: null,
        chatType: null,
        kuldevtaAssigned: false,
        showKuldevtaChat: false,
        kuldevtaName: null,
        // Literal `false`, not the chat module's `CHAT_REQUIRES_PRO`: reading
        // that constant from here would be a core→core import the arch gate
        // forbids, and this branch is reached precisely when the chat module
        // could not be asked anything. Duplicating the default is harmless
        // because `enabled` is already false on this path — there is no chat
        // for the flag to gate, so the two cannot be observed disagreeing.
        requiresPro: false,
      };
    }
  }

  /**
   * Where the app should land this caller (TAM-258), for `GET /users/me`.
   *
   * Fails SOFT to Home, on the same reasoning as `getChatConfig` above and then
   * some: this resolves two A/B evaluations and a row read on the call the app
   * boots on, and Home is not a degraded answer — it is what every user saw
   * before this feature existed.
   *
   * The consume write is AWAITED rather than fired and forgotten. It is a single
   * guarded `updateMany`, and not waiting for it would let a double launch serve
   * the one-time ad landing twice, which is the exact thing the column exists to
   * prevent. A failed write is swallowed by the catch: the user gets their
   * landing and the marker is retried on the next open, which is the right way
   * round — losing the redirect to a database blip would be the worse trade.
   */
  async getLanding(userId: string, appVersion: string | undefined): Promise<LandingConfig> {
    try {
      const row = await this.repo.findLandingRow(userId);
      const decision = await resolveLanding({ userId, appVersion, row });
      if (decision.consume) {
        await this.repo.markAdLandingConsumed(userId, new Date());
      }
      return decision.landing;
    } catch (err) {
      log.warn({ err, user_id: userId }, "could not resolve landing; falling back to home");
      return { deeplink: "", module: "home", source: "not_in_experiment", utmCode: "" };
    }
  }

  async getMe(userId: string): Promise<UserPublic> {
    const row = await this.repo.findById(userId);
    if (!row) {
      // Should be unreachable: `authMiddleware` verified the JWT and set
      // `req.user.sub` from a token that was minted for a persisted user.
      // If we get here, either the user was deleted mid-session or the JWT
      // secret matches across environments with different DBs — 401 is the
      // right code either way (the token no longer maps to a user).
      throw new AppError("User not found", 401, "UNAUTHORIZED");
    }
    return toPublic(row);
  }

  /**
   * Resolve a user's authorization role (TAM-82). Read-only.
   *
   * Throws `AppError(401)` when the user no longer exists — a valid JWT whose
   * subject is gone. `adminMiddleware` catches ANY throw from this call and
   * denies with 403, so "user vanished" lands on the deny side of the
   * fail-closed guard, which is the only correct answer.
   */
  async getRole(userId: string): Promise<UserRole> {
    const role = await this.repo.findRoleById(userId);
    if (role === null) {
      throw new AppError("User not found", 401, "UNAUTHORIZED");
    }
    return role;
  }

  /**
   * The payer's Razorpay customer handle, or null.
   *
   * Returns `null` for an unknown user rather than throwing: the only caller is
   * the payment module deciding whether it can skip a create-customer call, and
   * "we have no handle" is the correct answer either way — it creates one, and
   * the registration fails on its own merits if the user really is gone.
   */
  getRazorpayCustomerId(userId: string): Promise<string | null> {
    return this.repo.findRazorpayCustomerId(userId);
  }

  /** Fill the handle if this user has none. Never replaces one. */
  rememberRazorpayCustomerId(userId: string, customerId: string): Promise<void> {
    return this.repo.setRazorpayCustomerIdIfAbsent(userId, customerId);
  }

  async updateMe(userId: string, patch: UpdateMeInput): Promise<UserPublic> {
    const current = await this.repo.findById(userId);
    if (!current) {
      throw new AppError("User not found", 401, "UNAUTHORIZED");
    }

    // Zod schema already trimmed `name` and enum-checked `selectedLanguage`,
    // so no re-normalization needed here.
    const nextName = patch.name ?? current.name;
    const nextLanguage = patch.selectedLanguage ?? current.selectedLanguage;

    // Server-owned side effect: flip onboardingCompletedAt if this write
    // takes the user to the "profile complete" state for the first time.
    const shouldFlip =
      current.onboardingCompletedAt === null &&
      nextName !== null &&
      nextLanguage !== null;

    const updated = await this.repo.updateById(userId, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.selectedLanguage !== undefined
        ? { selectedLanguage: patch.selectedLanguage }
        : {}),
      ...(shouldFlip ? { onboardingCompletedAt: new Date() } : {}),
    });

    log.info(
      {
        user_id: userId,
        patched_name: patch.name !== undefined,
        patched_language: patch.selectedLanguage !== undefined,
        onboarding_completed_flipped: shouldFlip,
      },
      "updateMe ok"
    );

    return toPublic(updated);
  }
}

/**
 * Map the internal `UserRow` (Prisma-shaped, has `Date`) to the public wire
 * shape (`onboardingCompletedAt` as ISO string). Also narrows the
 * `selectedLanguage` string column to the `LanguageCode` enum — the DB
 * column is typed `String?` in Prisma (any string), but every write path
 * for this column goes through `LanguageCodeSchema`, so at read time we
 * can safely narrow to the enum. Unknown values become `null` — defensive
 * against manual DB edits.
 */
function toPublic(row: UserRow): UserPublic {
  return {
    id: row.id,
    name: row.name,
    selectedLanguage: narrowLanguage(row.selectedLanguage),
    onboardingCompletedAt:
      row.onboardingCompletedAt !== null
        ? row.onboardingCompletedAt.toISOString()
        : null,
    phoneCountryCode: row.phoneCountryCode,
    phoneNumber: row.phoneNumber,
  };
}

const KNOWN_LANGUAGES: readonly LanguageCode[] = [
  "hi",
  "mr",
  "gu",
  "bn",
  "or",
  "ta",
  "te",
  "kn",
];

function narrowLanguage(value: string | null): LanguageCode | null {
  if (value === null) return null;
  return (KNOWN_LANGUAGES as readonly string[]).includes(value)
    ? (value as LanguageCode)
    : null;
}
