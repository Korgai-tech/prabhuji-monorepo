import { AppError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import type { DevtoolsRepository } from "@api/core/devtools/repositories";
import type { MarkProInput, MarkProResult } from "@api/core/devtools/types";

const log = createModuleLogger("devtools:service");

/** ~100 years — the "effectively never" expiry used when the caller omits one. */
const DEFAULT_EXPIRY_MS = 100 * 365 * 24 * 60 * 60 * 1000;

export class DevtoolsService {
  constructor(private readonly repo: DevtoolsRepository) {}

  async markPro(input: MarkProInput): Promise<MarkProResult> {
    // A plain lookup by the number the OTP module stores at verify time. This
    // used to re-implement `SHA-256(pepper + countryCode + number)` inline —
    // duplicated so the throwaway module would delete cleanly, but it had to
    // match the other implementation byte for byte or the lookup silently
    // missed. Storing the real number removed both the coupling and the hazard.
    const userId = await this.repo.findUserIdByPhone(
      input.phoneCountryCode,
      input.phoneNumber
    );
    if (userId === null) {
      throw new AppError(
        "No user found for that phone number — they must have verified an OTP at least once",
        404,
        "USER_NOT_FOUND"
      );
    }

    const expiresAt = input.expiresAt
      ? new Date(input.expiresAt)
      : new Date(Date.now() + DEFAULT_EXPIRY_MS);

    const row = await this.repo.markPro(userId, expiresAt);

    log.warn(
      { event: "devtools_mark_pro", user_id: userId, expires_at: row.expiresAt?.toISOString() },
      "DEV TOOL: user marked Pro"
    );

    return {
      userId: row.userId,
      status: row.status,
      expiresAt: row.expiresAt !== null ? row.expiresAt.toISOString() : null,
    };
  }
}
