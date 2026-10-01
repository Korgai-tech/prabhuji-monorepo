import { describe, expect, test, vi } from "vitest";
import { DevtoolsService } from "../services/devtools.service.js";
import type { DevtoolsRepository } from "../repositories/index.js";

/**
 * `DevtoolsService.markPro` — the module that had no tests at all.
 *
 * That absence mattered more than it looks. `POST /devtools/mark-pro` grants
 * LIFETIME Pro to any phone number, and it is the only route in this codebase
 * with no `authMiddleware`; the sole thing keeping it off the internet is the
 * `ENABLE_DEV_TOOLS` flag (now backed by a boot-time assertion against
 * `PAYMENT_ENV=production`, plus a required `DEVTOOLS_TOKEN`).
 *
 * A throwaway dev tool still writes to the same `subscriptions` table five
 * content modules read on every request, so what it writes is worth pinning —
 * particularly the `provider: "devtools"` marker, which is how a grant made by
 * this tool can be told apart from one somebody paid for.
 */

function makeService(userId: string | null = "usr-1") {
  const repo = {
    findUserIdByPhone: vi.fn().mockResolvedValue(userId),
    markPro: vi.fn().mockImplementation((id: string, expiresAt: Date) =>
      Promise.resolve({ userId: id, status: "active", expiresAt })
    ),
  } as unknown as DevtoolsRepository & {
    findUserIdByPhone: ReturnType<typeof vi.fn>;
    markPro: ReturnType<typeof vi.fn>;
  };
  return { service: new DevtoolsService(repo), repo };
}

const INPUT = {
  phoneCountryCode: "+91" as const,
  phoneNumber: "9876543210",
};

describe("markPro", () => {
  test("an unknown phone is a 404, not a silently created user", async () => {
    // The tool grants Pro to an EXISTING account. Creating one here would mean
    // a dev tool could mint users, which is a different and much worse power.
    const { service, repo } = makeService(null);

    await expect(service.markPro(INPUT)).rejects.toMatchObject({
      statusCode: 404,
      errorCode: "USER_NOT_FOUND",
    });
    expect(repo.markPro).not.toHaveBeenCalled();
  });

  test("looks the user up by the stored phone number, not a hash", async () => {
    // This used to re-implement the OTP module's peppered SHA-256 inline, which
    // had to match byte for byte or the lookup silently missed.
    const { service, repo } = makeService();

    await service.markPro(INPUT);

    expect(repo.findUserIdByPhone).toHaveBeenCalledWith("+91", "9876543210");
  });

  test("omitting an expiry grants ~100 years, not a null 'forever'", async () => {
    // A null `expiresAt` on an `active` row IS a lifetime grant to
    // `computeIsEntitled`, so the far-future date is deliberate: it keeps the
    // devtools grant distinguishable from a genuine lifetime subscription.
    const { service, repo } = makeService();

    await service.markPro(INPUT);

    const expiresAt = repo.markPro.mock.calls[0][1] as Date;
    const yearsOut =
      (expiresAt.getTime() - Date.now()) / (365 * 24 * 60 * 60 * 1000);
    expect(yearsOut).toBeGreaterThan(90);
  });

  test("an explicit expiry is honoured", async () => {
    const { service, repo } = makeService();

    await service.markPro({ ...INPUT, expiresAt: "2026-12-31T00:00:00.000Z" });

    const expiresAt = repo.markPro.mock.calls[0][1] as Date;
    expect(expiresAt.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });
});
